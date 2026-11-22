use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

struct RunningBridge {
    port: u16,
    stop: Arc<AtomicBool>,
}

/// Локальный loopback HTTP-мост для встроенного плеера трейлеров YouTube на macOS и Windows.
///
/// Причина: в релизной сборке Tauri v2 веб-интерфейс работает на схеме `tauri://localhost`
/// (macOS) или `http://tauri.localhost` (Windows). При прямой вставке `youtube.com/embed`
/// WebKit/WebView2 не передаёт стандартный HTTP-заголовок `Referer`, из-за чего YouTube
/// возвращает ошибку 153 («Ошибка настройки видеопроигрывателя»).
/// Отдавая обёртку через `http://127.0.0.1:<port>/trailer/<key>`, браузерный движок
/// гарантированно отправляет корректный HTTP `Referer` без внешних серверов и без
/// изменения протокола основного окна Tauri (IPC остаётся полностью защищённым).
#[derive(Default)]
pub struct TrailerBridgeState {
    inner: Mutex<Option<RunningBridge>>,
}

impl TrailerBridgeState {
    pub fn ensure_embed_url(&self, video_key: &str) -> Result<String, String> {
        let trimmed = video_key.trim();
        if !is_valid_youtube_key(trimmed) {
            return Err("Некорректный идентификатор трейлера YouTube.".to_string());
        }

        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "Не удалось получить доступ к локальному серверу трейлеров.".to_string())?;

        if let Some(running) = guard.as_ref() {
            if !running.stop.load(Ordering::SeqCst) {
                return Ok(format!(
                    "http://127.0.0.1:{}/trailer/{}",
                    running.port, trimmed
                ));
            }
        }

        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|err| format!("Не удалось запустить локальный мост трейлеров: {}", err))?;
        let port = listener
            .local_addr()
            .map_err(|err| format!("Не удалось определить порт моста трейлеров: {}", err))?
            .port();

        let stop = Arc::new(AtomicBool::new(false));
        let stop_for_thread = Arc::clone(&stop);

        thread::spawn(move || {
            for incoming in listener.incoming() {
                if stop_for_thread.load(Ordering::SeqCst) {
                    break;
                }
                if let Ok(stream) = incoming {
                    thread::spawn(move || {
                        handle_connection(stream);
                    });
                }
            }
        });

        *guard = Some(RunningBridge { port, stop });

        Ok(format!("http://127.0.0.1:{}/trailer/{}", port, trimmed))
    }

    pub fn stop(&self) {
        let running = match self.inner.lock() {
            Ok(mut guard) => guard.take(),
            Err(_) => None,
        };

        if let Some(bridge) = running {
            bridge.stop.store(true, Ordering::SeqCst);
            // Будим блокирующий listener.incoming(), чтобы поток завершился немедленно
            let _ = TcpStream::connect_timeout(
                &std::net::SocketAddr::from(([127, 0, 0, 1], bridge.port)),
                Duration::from_millis(150),
            );
        }
    }
}

pub fn is_valid_youtube_key(key: &str) -> bool {
    let len = key.len();
    (6..=20).contains(&len)
        && key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

pub fn build_trailer_html(video_key: &str) -> String {
    format!(
        r#"<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <title>CineScope Trailer</title>
  <style>
    html, body {{
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #000;
      overflow: hidden;
    }}
    iframe {{
      border: 0;
      width: 100%;
      height: 100%;
      display: block;
    }}
  </style>
</head>
<body>
  <iframe
    src="https://www.youtube-nocookie.com/embed/{key}?rel=0&amp;modestbranding=1&amp;playsinline=1"
    title="YouTube Trailer"
    referrerpolicy="strict-origin-when-cross-origin"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
    allowfullscreen
  ></iframe>
</body>
</html>"#,
        key = video_key
    )
}

fn extract_video_key_from_request(request_line: &str) -> Option<&str> {
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?;
    if method != "GET" && method != "HEAD" {
        return None;
    }
    let raw_path = parts.next()?;
    let path_without_query = raw_path.split('?').next()?;
    let key = path_without_query.strip_prefix("/trailer/")?;
    if is_valid_youtube_key(key) {
        Some(key)
    } else {
        None
    }
}

fn handle_connection(mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));

    let mut buffer = [0u8; 4096];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let request_text = String::from_utf8_lossy(&buffer[..bytes_read]);
    let first_line = request_text.lines().next().unwrap_or("");
    let is_head = first_line.starts_with("HEAD ");

    if let Some(video_key) = extract_video_key_from_request(first_line) {
        let html = build_trailer_html(video_key);
        let headers = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: text/html; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Referrer-Policy: strict-origin-when-cross-origin\r\n\
             Cache-Control: no-store\r\n\
             X-Content-Type-Options: nosniff\r\n\
             Connection: close\r\n\r\n",
            html.len()
        );
        let _ = stream.write_all(headers.as_bytes());
        if !is_head {
            let _ = stream.write_all(html.as_bytes());
        }
        let _ = stream.flush();
    } else {
        let body = "Not Found";
        let response = format!(
            "HTTP/1.1 404 Not Found\r\n\
             Content-Type: text/plain; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\r\n{}",
            body.len(),
            if is_head { "" } else { body }
        );
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_youtube_keys_strictly() {
        assert!(is_valid_youtube_key("dQw4w9WgXcQ"));
        assert!(is_valid_youtube_key("abc_123-XYZ"));
        assert!(!is_valid_youtube_key(""));
        assert!(!is_valid_youtube_key("short"));
        assert!(!is_valid_youtube_key("bad/key?x=1"));
        assert!(!is_valid_youtube_key("<script>alert(1)</script>"));
    }

    #[test]
    fn extracts_key_from_get_request() {
        assert_eq!(
            extract_video_key_from_request("GET /trailer/dQw4w9WgXcQ HTTP/1.1"),
            Some("dQw4w9WgXcQ")
        );
        assert_eq!(
            extract_video_key_from_request("GET /trailer/dQw4w9WgXcQ?t=1 HTTP/1.1"),
            Some("dQw4w9WgXcQ")
        );
        assert_eq!(
            extract_video_key_from_request("POST /trailer/dQw4w9WgXcQ HTTP/1.1"),
            None
        );
        assert_eq!(
            extract_video_key_from_request("GET /trailer/../etc/passwd HTTP/1.1"),
            None
        );
    }

    #[test]
    fn builds_html_with_strict_referrer_policy() {
        let html = build_trailer_html("dQw4w9WgXcQ");
        assert!(html.contains("strict-origin-when-cross-origin"));
        assert!(html.contains("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"));
    }
}
