use serde::{Deserialize, Serialize};
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

pub const TV_PAIRING_EVENT: &str = "tv-pairing-keys";
const SESSION_TTL_SECS: u64 = 300; // 5 минут
const MAX_REQUEST_BYTES: usize = 16 * 1024; // 16 КБ
const MAX_KEY_LENGTH: usize = 512;

static NEXT_SESSION_ID: AtomicU32 = AtomicU32::new(1);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TvPairingPayload {
    #[serde(default)]
    pub tmdb_api_key: String,
    #[serde(default)]
    pub kinopoisk_api_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TvPairingSessionInfo {
    pub session_id: u32,
    pub url: String,
    pub short_url: String,
    pub ip: String,
    pub port: u16,
    pub expires_in_secs: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TvPairingPollResult {
    pub active: bool,
    pub expired: bool,
    pub remaining_secs: u64,
    pub payload: Option<TvPairingPayload>,
}

struct ActivePairingSession {
    session_id: u32,
    expires_at: Instant,
    stop_flag: Arc<AtomicBool>,
    received_payload: Arc<Mutex<Option<TvPairingPayload>>>,
}

pub struct TvPairingState {
    session: Mutex<Option<ActivePairingSession>>,
}

impl Default for TvPairingState {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
        }
    }
}

impl TvPairingState {
    pub fn stop_active(&self) {
        if let Ok(mut guard) = self.session.lock() {
            if let Some(active) = guard.take() {
                active.stop_flag.store(true, Ordering::SeqCst);
            }
        }
    }
}

fn detect_lan_ipv4() -> Option<Ipv4Addr> {
    // UDP connect не отправляет сетевые пакеты, а лишь запрашивает у таблицы маршрутизации ОС
    // локальный интерфейс для выхода в сеть (работает на Android, macOS и Windows без доп. прав).
    let probes = [
        "8.8.8.8:80",
        "1.1.1.1:80",
        "192.168.1.1:80",
        "192.168.0.1:80",
        "10.0.0.1:80",
        "172.16.0.1:80",
    ];

    let mut fallback_ip: Option<Ipv4Addr> = None;

    for target in probes {
        if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
            if socket.connect(target).is_ok() {
                if let Ok(local_addr) = socket.local_addr() {
                    if let IpAddr::V4(ipv4) = local_addr.ip() {
                        if !ipv4.is_loopback() && !ipv4.is_unspecified() && !ipv4.is_link_local() {
                            if ipv4.is_private() {
                                return Some(ipv4);
                            }
                            if fallback_ip.is_none() {
                                fallback_ip = Some(ipv4);
                            }
                        }
                    }
                }
            }
        }
    }

    fallback_ip
}

fn generate_session_token() -> String {
    let mut bytes = [0u8; 16];

    #[cfg(unix)]
    {
        if let Ok(mut urandom) = std::fs::File::open("/dev/urandom") {
            if urandom.read_exact(&mut bytes).is_ok() {
                return bytes_to_hex(&bytes);
            }
        }
    }

    // Кросс-платформенный запасной генератор на базе энтропии RandomState ОС + времени
    let now_nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);

    for chunk_idx in 0..2 {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_u128(now_nanos);
        hasher.write_usize(chunk_idx);
        hasher.write_u32(std::process::id());
        let val = hasher.finish().to_le_bytes();
        bytes[chunk_idx * 8..(chunk_idx + 1) * 8].copy_from_slice(&val);
    }

    bytes_to_hex(&bytes)
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    let ab = a.as_bytes();
    let bb = b.as_bytes();
    if ab.len() != bb.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in ab.iter().zip(bb.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hi = hex_val(bytes[i + 1]);
                let lo = hex_val(bytes[i + 2]);
                if let (Some(h), Some(l)) = (hi, lo) {
                    out.push((h << 4) | l);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            other => {
                out.push(other);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn html_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#x27;"),
            _ => out.push(ch),
        }
    }
    out
}

fn extract_query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if percent_decode(k) == key {
                return Some(percent_decode(v));
            }
        }
    }
    None
}

fn parse_form_payload(body: &str) -> TvPairingPayload {
    let tmdb = extract_query_param(body, "tmdbApiKey").unwrap_or_default();
    let kp = extract_query_param(body, "kinopoiskApiKey").unwrap_or_default();
    TvPairingPayload {
        tmdb_api_key: tmdb,
        kinopoisk_api_key: kp,
    }
}

fn validate_and_normalize_payload(raw: TvPairingPayload) -> Result<TvPairingPayload, String> {
    let tmdb = raw.tmdb_api_key.trim().to_string();
    let kp = raw.kinopoisk_api_key.trim().to_string();

    if tmdb.is_empty() && kp.is_empty() {
        return Err("Введите хотя бы один ключ (TMDB или Kinopoisk).".to_string());
    }

    if tmdb.len() > MAX_KEY_LENGTH || kp.len() > MAX_KEY_LENGTH {
        return Err("Ключ слишком длинный. Проверьте, что скопировали только значение API-ключа.".to_string());
    }

    if tmdb.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("Ключ TMDB содержит пробелы или переносы строк.".to_string());
    }

    if kp.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("Ключ Kinopoisk содержит пробелы или переносы строк.".to_string());
    }

    Ok(TvPairingPayload {
        tmdb_api_key: tmdb,
        kinopoisk_api_key: kp,
    })
}

fn write_http_response(
    stream: &mut TcpStream,
    status_line: &str,
    content_type: &str,
    body: &str,
) {
    let response = format!(
        "HTTP/1.1 {status_line}\r\n\
Content-Type: {content_type}\r\n\
Content-Length: {}\r\n\
Cache-Control: no-store, no-cache, must-revalidate\r\n\
Pragma: no-cache\r\n\
X-Content-Type-Options: nosniff\r\n\
Referrer-Policy: no-referrer\r\n\
Connection: close\r\n\
\r\n\
{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn render_phone_form_html(token: &str) -> String {
    let safe_token = html_escape(token);
    format!(
        r##"<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#090B10" />
  <title>CineScope TV — Ввод API-ключей</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #090B10;
      --card: #11151E;
      --input: #0B0E15;
      --border: rgba(255, 255, 255, 0.12);
      --text: #F3F5F9;
      --muted: #94A3B8;
      --accent: #2563EB;
      --accent-hover: #3B82F6;
      --ok-bg: rgba(16, 185, 129, 0.14);
      --ok-border: rgba(16, 185, 129, 0.35);
      --ok-text: #A7F3D0;
      --err-bg: rgba(244, 63, 94, 0.14);
      --err-border: rgba(244, 63, 94, 0.35);
      --err-text: #FECDD3;
    }}
    * {{ box-sizing: border-box; }}
    html, body {{
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
    }}
    body {{
      min-height: 100dvh;
      display: flex;
      justify-content: center;
      padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
    }}
    .wrap {{
      width: 100%;
      max-width: 440px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }}
    .card {{
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 20px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
    }}
    .brand {{
      font-size: 13px;
      font-weight: 700;
      color: #60A5FA;
      letter-spacing: 0.01em;
      margin-bottom: 6px;
    }}
    h1 {{
      margin: 0 0 6px;
      font-size: 22px;
      line-height: 1.25;
      font-weight: 700;
      letter-spacing: -0.02em;
    }}
    .subtitle {{
      margin: 0;
      font-size: 14px;
      line-height: 1.45;
      color: var(--muted);
    }}
    form {{
      margin-top: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }}
    .field {{
      display: flex;
      flex-direction: column;
      gap: 7px;
    }}
    .label-row {{
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
    }}
    label {{
      font-size: 14px;
      font-weight: 600;
      color: #FFFFFF;
    }}
    .opt {{
      font-weight: 400;
      color: var(--muted);
    }}
    a.help {{
      font-size: 12px;
      color: #60A5FA;
      text-decoration: none;
      white-space: nowrap;
    }}
    input[type="text"] {{
      width: 100%;
      min-height: 48px;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--input);
      color: #FFFFFF;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 16px;
      outline: none;
      transition: border-color 150ms ease;
    }}
    input[type="text"]::placeholder {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #64748B;
      font-size: 14px;
    }}
    input[type="text"]:focus {{
      border-color: #60A5FA;
    }}
    .hint {{
      margin: 0;
      font-size: 12px;
      line-height: 1.4;
      color: var(--muted);
    }}
    .msg {{
      display: none;
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 14px;
      line-height: 1.45;
    }}
    .msg.error {{
      display: block;
      background: var(--err-bg);
      border: 1px solid var(--err-border);
      color: var(--err-text);
    }}
    .msg.ok {{
      display: block;
      background: var(--ok-bg);
      border: 1px solid var(--ok-border);
      color: var(--ok-text);
    }}
    button[type="submit"] {{
      width: 100%;
      min-height: 50px;
      border: none;
      border-radius: 14px;
      background: var(--accent);
      color: #FFFFFF;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 150ms ease, opacity 150ms ease;
    }}
    button[type="submit"]:active {{
      background: var(--accent-hover);
    }}
    button[type="submit"]:disabled {{
      opacity: 0.65;
      cursor: wait;
    }}
    .footer-note {{
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 12px;
      line-height: 1.45;
      color: #64748B;
    }}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card">
      <div class="brand">CineScope для ТВ</div>
      <h1>Передача API-ключей</h1>
      <p class="subtitle">Вставьте ключи с телефона — они сразу применятся на телевизоре по домашней сети Wi-Fi.</p>

      <form id="pair-form" method="POST" action="/pair?token={safe_token}">
        <div class="field">
          <div class="label-row">
            <label for="tmdb">TMDB API Key (v3)</label>
            <a class="help" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">Где взять ключ</a>
          </div>
          <input
            id="tmdb"
            name="tmdbApiKey"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            placeholder="Вставьте 32-символьный ключ TMDB"
          />
          <p class="hint">Нужен для каталога, поиска, постеров и трейлеров.</p>
        </div>

        <div class="field">
          <div class="label-row">
            <label for="kp">Kinopoisk API Key <span class="opt">(опционально)</span></label>
            <a class="help" href="https://kinopoiskapiunofficial.tech" target="_blank" rel="noopener noreferrer">Где взять ключ</a>
          </div>
          <input
            id="kp"
            name="kinopoiskApiKey"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            placeholder="UUID-ключ для кнопки «Смотреть»"
          />
          <p class="hint">Можно оставить пустым, если хотите обновить только TMDB.</p>
        </div>

        <div id="status-box" class="msg" role="status" aria-live="polite"></div>

        <button id="submit-btn" type="submit">Отправить на телевизор</button>
      </form>

      <p class="footer-note">
        Ключи передаются напрямую на приставку внутри вашего Wi-Fi и не сохраняются на внешних серверах.
      </p>
    </section>
  </main>

  <script>
    (function () {{
      var form = document.getElementById('pair-form');
      var tmdbEl = document.getElementById('tmdb');
      var kpEl = document.getElementById('kp');
      var statusBox = document.getElementById('status-box');
      var submitBtn = document.getElementById('submit-btn');

      function showStatus(kind, text) {{
        statusBox.className = 'msg ' + kind;
        statusBox.textContent = text;
      }}

      form.addEventListener('submit', function (event) {{
        event.preventDefault();
        var tmdbApiKey = (tmdbEl.value || '').trim();
        var kinopoiskApiKey = (kpEl.value || '').trim();

        if (!tmdbApiKey && !kinopoiskApiKey) {{
          showStatus('error', 'Введите хотя бы один API-ключ перед отправкой.');
          return;
        }}
        if (/\s/.test(tmdbApiKey) || /\s/.test(kinopoiskApiKey)) {{
          showStatus('error', 'Ключ не должен содержать пробелы или переносы строк.');
          return;
        }}

        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправка на телевизор...';
        statusBox.className = 'msg';
        statusBox.textContent = '';

        fetch(form.action, {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{
            tmdbApiKey: tmdbApiKey,
            kinopoiskApiKey: kinopoiskApiKey
          }})
        }})
        .then(function (resp) {{
          return resp.json().catch(function () {{ return {{ ok: resp.ok }}; }}).then(function (data) {{
            return {{ ok: resp.ok, data: data }};
          }});
        }})
        .then(function (result) {{
          if (!result.ok) {{
            var errMsg = (result.data && result.data.error) || 'Не удалось передать ключи. Обновите QR-код на телевизоре.';
            showStatus('error', errMsg);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Отправить на телевизор';
            return;
          }}
          showStatus('ok', 'Ключи успешно отправлены на телевизор! Можно закрыть эту вкладку.');
          submitBtn.textContent = 'Отправлено ✓';
          tmdbEl.disabled = true;
          kpEl.disabled = true;
        }})
        .catch(function () {{
          showStatus('error', 'Соединение с телевизором прервано или сессия QR-кода истекла. Обновите QR-код на ТВ.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Отправить на телевизор';
        }});
      }});
    }})();
  </script>
</body>
</html>"##
    )
}

fn render_status_html(title: &str, message: &str, is_error: bool) -> String {
    let accent = if is_error { "#FB7185" } else { "#34D399" };
    let safe_title = html_escape(title);
    let safe_message = html_escape(message);
    format!(
        r##"<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{safe_title}</title>
  <style>
    body {{
      margin: 0;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: #090B10;
      color: #F3F5F9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }}
    .card {{
      width: 100%;
      max-width: 420px;
      background: #11151E;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 20px;
      padding: 24px;
      text-align: center;
    }}
    h1 {{
      margin: 0 0 10px;
      font-size: 20px;
      color: {accent};
    }}
    p {{
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
      color: #CBD5E1;
    }}
  </style>
</head>
<body>
  <main class="card">
    <h1>{safe_title}</h1>
    <p>{safe_message}</p>
  </main>
</body>
</html>"##
    )
}

fn read_http_request(stream: &mut TcpStream) -> Result<(String, String, String, String), (&'static str, &'static str)> {
    let mut buffer = Vec::with_capacity(2048);
    let mut chunk = [0u8; 1024];
    let mut header_end: Option<usize> = None;

    while header_end.is_none() {
        let n = stream
            .read(&mut chunk)
            .map_err(|_| ("400 Bad Request", "Не удалось прочитать запрос."))?;
        if n == 0 {
            return Err(("400 Bad Request", "Пустой запрос."));
        }
        buffer.extend_from_slice(&chunk[..n]);
        if buffer.len() > MAX_REQUEST_BYTES {
            return Err(("413 Payload Too Large", "Запрос слишком большой."));
        }
        if let Some(pos) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
            header_end = Some(pos + 4);
        }
    }

    let header_end = header_end.unwrap();
    let header_text = String::from_utf8_lossy(&buffer[..header_end]).into_owned();
    let mut lines = header_text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or(("400 Bad Request", "Некорректная строка HTTP-запроса."))?;

    let mut parts = request_line.split_whitespace();
    let method = parts
        .next()
        .ok_or(("400 Bad Request", "Не указан HTTP-метод."))?
        .to_string();
    let target = parts
        .next()
        .ok_or(("400 Bad Request", "Не указан путь запроса."))?
        .to_string();

    let mut content_length: usize = 0;
    let mut content_type = String::new();

    for line in lines {
        if line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            let lower = name.trim().to_ascii_lowercase();
            let val = value.trim();
            if lower == "content-length" {
                content_length = val
                    .parse::<usize>()
                    .map_err(|_| ("400 Bad Request", "Некорректный Content-Length."))?;
            } else if lower == "content-type" {
                content_type = val.to_ascii_lowercase();
            }
        }
    }

    if content_length > MAX_REQUEST_BYTES {
        return Err(("413 Payload Too Large", "Размер передаваемых данных превышает лимит."));
    }

    let mut body_bytes = buffer[header_end..].to_vec();
    while body_bytes.len() < content_length {
        let remaining = content_length - body_bytes.len();
        let to_read = remaining.min(chunk.len());
        let n = stream
            .read(&mut chunk[..to_read])
            .map_err(|_| ("400 Bad Request", "Соединение прервано при чтении данных."))?;
        if n == 0 {
            break;
        }
        body_bytes.extend_from_slice(&chunk[..n]);
    }
    if body_bytes.len() > content_length {
        body_bytes.truncate(content_length);
    }

    let body = String::from_utf8_lossy(&body_bytes).into_owned();
    Ok((method, target, content_type, body))
}

fn handle_client(
    mut stream: TcpStream,
    expected_token: &str,
    stop_flag: &Arc<AtomicBool>,
    received_payload: &Arc<Mutex<Option<TvPairingPayload>>>,
    app_handle: &AppHandle,
) {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

    let (method, target, content_type, body) = match read_http_request(&mut stream) {
        Ok(req) => req,
        Err((status, msg)) => {
            let html = render_status_html("Ошибка запроса", msg, true);
            write_http_response(&mut stream, status, "text/html; charset=utf-8", &html);
            return;
        }
    };

    let (path, query) = match target.split_once('?') {
        Some((p, q)) => (p, q),
        None => (target.as_str(), ""),
    };

    if path != "/pair" {
        let html = render_status_html(
            "Страница не найдена",
            "Отсканируйте актуальный QR-код на экране настроек CineScope на телевизоре.",
            true,
        );
        write_http_response(&mut stream, "404 Not Found", "text/html; charset=utf-8", &html);
        return;
    }

    let provided_token = extract_query_param(query, "token").unwrap_or_default();
    if !constant_time_eq(&provided_token, expected_token) {
        let html = render_status_html(
            "Сессия недействительна",
            "Токен QR-кода не совпадает или устарел. Нажмите «Обновить QR-код» на телевизоре и отсканируйте снова.",
            true,
        );
        write_http_response(&mut stream, "403 Forbidden", "text/html; charset=utf-8", &html);
        return;
    }

    match method.as_str() {
        "GET" => {
            let html = render_phone_form_html(expected_token);
            write_http_response(&mut stream, "200 OK", "text/html; charset=utf-8", &html);
        }
        "POST" => {
            let wants_json = content_type.contains("application/json");
            let parsed_raw: Result<TvPairingPayload, String> = if wants_json {
                serde_json::from_str::<TvPairingPayload>(&body)
                    .map_err(|_| "Некорректный формат данных.".to_string())
            } else {
                Ok(parse_form_payload(&body))
            };

            let validated = parsed_raw.and_then(validate_and_normalize_payload);
            match validated {
                Ok(payload) => {
                    if let Ok(mut guard) = received_payload.lock() {
                        *guard = Some(payload.clone());
                    }
                    let _ = app_handle.emit(TV_PAIRING_EVENT, &payload);

                    if wants_json {
                        let json = serde_json::json!({ "ok": true }).to_string();
                        write_http_response(
                            &mut stream,
                            "200 OK",
                            "application/json; charset=utf-8",
                            &json,
                        );
                    } else {
                        let html = render_status_html(
                            "Ключи отправлены ✓",
                            "CineScope на телевизоре получил ваши ключи. Эту страницу можно закрыть.",
                            false,
                        );
                        write_http_response(
                            &mut stream,
                            "200 OK",
                            "text/html; charset=utf-8",
                            &html,
                        );
                    }

                    // Сразу останавливаем временный сервер после успешной доставки ключей
                    stop_flag.store(true, Ordering::SeqCst);
                }
                Err(err_msg) => {
                    if wants_json {
                        let json = serde_json::json!({ "ok": false, "error": err_msg }).to_string();
                        write_http_response(
                            &mut stream,
                            "400 Bad Request",
                            "application/json; charset=utf-8",
                            &json,
                        );
                    } else {
                        let html = render_status_html("Проверьте ключи", &err_msg, true);
                        write_http_response(
                            &mut stream,
                            "400 Bad Request",
                            "text/html; charset=utf-8",
                            &html,
                        );
                    }
                }
            }
        }
        _ => {
            let html = render_status_html("Метод не поддерживается", "Используйте форму на странице QR-кода.", true);
            write_http_response(
                &mut stream,
                "405 Method Not Allowed",
                "text/html; charset=utf-8",
                &html,
            );
        }
    }
}

pub fn start_pairing_session(
    app_handle: AppHandle,
    state: &TvPairingState,
) -> Result<TvPairingSessionInfo, String> {
    // Останавливаем предыдущую сессию, если она ещё активна
    state.stop_active();

    let lan_ip = detect_lan_ipv4().ok_or_else(|| {
        "Не удалось определить локальный Wi-Fi адрес. Проверьте, что телевизор подключён к домашней сети Wi-Fi."
            .to_string()
    })?;

    let listener = TcpListener::bind("0.0.0.0:0").map_err(|err| {
        format!(
            "Не удалось запустить локальный сервер сопряжения: {}",
            err
        )
    })?;

    let port = listener
        .local_addr()
        .map_err(|err| format!("Не удалось определить порт сервера сопряжения: {}", err))?
        .port();

    listener
        .set_nonblocking(true)
        .map_err(|err| format!("Не удалось настроить локальный сервер: {}", err))?;

    let token = generate_session_token();
    let session_id = NEXT_SESSION_ID.fetch_add(1, Ordering::Relaxed);
    let expires_at = Instant::now() + Duration::from_secs(SESSION_TTL_SECS);
    let stop_flag = Arc::new(AtomicBool::new(false));
    let received_payload = Arc::new(Mutex::new(None));

    let ip_str = lan_ip.to_string();
    let short_url = format!("http://{}:{}", ip_str, port);
    let url = format!("{}/pair?token={}", short_url, token);

    let worker_stop = Arc::clone(&stop_flag);
    let worker_payload = Arc::clone(&received_payload);
    let worker_token = token;

    thread::spawn(move || {
        while !worker_stop.load(Ordering::SeqCst) && Instant::now() < expires_at {
            match listener.accept() {
                Ok((stream, _addr)) => {
                    handle_client(
                        stream,
                        &worker_token,
                        &worker_stop,
                        &worker_payload,
                        &app_handle,
                    );
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(80));
                }
                Err(_) => {
                    thread::sleep(Duration::from_millis(120));
                }
            }
        }
        worker_stop.store(true, Ordering::SeqCst);
    });

    if let Ok(mut guard) = state.session.lock() {
        *guard = Some(ActivePairingSession {
            session_id,
            expires_at,
            stop_flag,
            received_payload,
        });
    }

    Ok(TvPairingSessionInfo {
        session_id,
        url,
        short_url,
        ip: ip_str,
        port,
        expires_in_secs: SESSION_TTL_SECS,
    })
}

pub fn poll_pairing_session(state: &TvPairingState, session_id: Option<u32>) -> TvPairingPollResult {
    let guard = match state.session.lock() {
        Ok(g) => g,
        Err(_) => {
            return TvPairingPollResult {
                active: false,
                expired: false,
                remaining_secs: 0,
                payload: None,
            };
        }
    };

    let Some(active) = guard.as_ref() else {
        return TvPairingPollResult {
            active: false,
            expired: false,
            remaining_secs: 0,
            payload: None,
        };
    };

    if let Some(expected_id) = session_id {
        if active.session_id != expected_id {
            return TvPairingPollResult {
                active: false,
                expired: false,
                remaining_secs: 0,
                payload: None,
            };
        }
    }

    let payload = active
        .received_payload
        .lock()
        .ok()
        .and_then(|mut p| p.take());

    let now = Instant::now();
    let expired = now >= active.expires_at;
    let remaining_secs = if expired {
        0
    } else {
        active.expires_at.saturating_duration_since(now).as_secs()
    };
    let stopped = active.stop_flag.load(Ordering::SeqCst);

    TvPairingPollResult {
        active: !stopped && !expired,
        expired: expired && payload.is_none(),
        remaining_secs,
        payload,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constant_time_eq_checks_exact_match() {
        assert!(constant_time_eq("abc123", "abc123"));
        assert!(!constant_time_eq("abc123", "abc124"));
        assert!(!constant_time_eq("abc123", "abc12"));
    }

    #[test]
    fn validate_and_normalize_payload_trims_and_rejects_invalid() {
        let valid = validate_and_normalize_payload(TvPairingPayload {
            tmdb_api_key: "  abcdef123456  ".to_string(),
            kinopoisk_api_key: " 1111-2222 ".to_string(),
        })
        .expect("valid keys");
        assert_eq!(valid.tmdb_api_key, "abcdef123456");
        assert_eq!(valid.kinopoisk_api_key, "1111-2222");

        assert!(validate_and_normalize_payload(TvPairingPayload {
            tmdb_api_key: "   ".to_string(),
            kinopoisk_api_key: "".to_string(),
        })
        .is_err());

        assert!(validate_and_normalize_payload(TvPairingPayload {
            tmdb_api_key: "abc def".to_string(),
            kinopoisk_api_key: "".to_string(),
        })
        .is_err());
    }

    #[test]
    fn parse_form_payload_decodes_url_encoded_values() {
        let parsed = parse_form_payload("tmdbApiKey=key_123&kinopoiskApiKey=uuid-456%2D789");
        assert_eq!(parsed.tmdb_api_key, "key_123");
        assert_eq!(parsed.kinopoisk_api_key, "uuid-456-789");
    }
}
