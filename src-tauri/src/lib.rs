use serde::{Deserialize, Serialize};
use std::time::Duration;
#[cfg(desktop)]
use tauri::{webview::NewWindowResponse, Theme};
use tauri::{Manager, State, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_http::reqwest;

const KINOPOISK_API_URL: &str = "https://kinopoiskapiunofficial.tech/api/v2.2/films";
const PLAYER_WINDOW_LABEL: &str = "player";

const PLAYER_POPUP_BLOCK_SCRIPT: &str = r#"
(() => {
  if (window.__cinescopePopupGuardInstalled) return;
  window.__cinescopePopupGuardInstalled = true;

  try {
    Object.defineProperty(window, 'open', {
      configurable: true,
      writable: true,
      value: function () {
        return null;
      },
    });
  } catch {
    try {
      window.open = function () {
        return null;
      };
    } catch {
      // Игнорируем, если страница запретила переопределение window.open
    }
  }

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!anchor) return;
      const linkTarget = (anchor.getAttribute('target') || '').toLowerCase();
      if (linkTarget !== '_blank') return;

      const href = anchor.getAttribute('href') || '';
      try {
        const parsed = new URL(href, window.location.href);
        if (parsed.origin !== window.location.origin) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      } catch {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
})();
"#;

struct HttpClientState {
    client: reqwest::Client,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KinopoiskCandidate {
    pub kinopoisk_id: i64,
    #[serde(default)]
    pub name_ru: Option<String>,
    #[serde(default)]
    pub name_en: Option<String>,
    #[serde(default)]
    pub name_original: Option<String>,
    #[serde(rename = "type", default)]
    pub media_type: Option<String>,
    #[serde(default)]
    pub year: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct KinopoiskApiResponse {
    #[serde(default)]
    items: Vec<KinopoiskCandidate>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KinopoiskCandidatesResult {
    pub status: String,
    pub items: Vec<KinopoiskCandidate>,
    pub code: Option<String>,
    pub message: Option<String>,
    pub retryable: bool,
}

#[tauri::command]
async fn fetch_kinopoisk_candidates(
    keyword: String,
    type_param: String,
    api_key: String,
    http_state: State<'_, HttpClientState>,
) -> Result<KinopoiskCandidatesResult, String> {
    let trimmed_keyword = keyword.trim();
    if trimmed_keyword.is_empty() {
        return Ok(KinopoiskCandidatesResult {
            status: "error".to_string(),
            items: Vec::new(),
            code: Some("INVALID_REQUEST".to_string()),
            message: Some("Пустой поисковый запрос.".to_string()),
            retryable: false,
        });
    }

    let trimmed_api_key = api_key.trim();
    if trimmed_api_key.is_empty() || trimmed_api_key == "MY_KINOPOISK_API_KEY" {
        return Ok(KinopoiskCandidatesResult {
            status: "error".to_string(),
            items: Vec::new(),
            code: Some("NOT_CONFIGURED".to_string()),
            message: Some(
                "Ключ Kinopoisk Unofficial API не указан. Добавьте его в настройках приложения."
                    .to_string(),
            ),
            retryable: false,
        });
    }

    let normalized_type = if type_param == "FILM" { "FILM" } else { "ALL" };

    let response = match http_state
        .client
        .get(KINOPOISK_API_URL)
        .query(&[
            ("keyword", trimmed_keyword),
            ("type", normalized_type),
            ("page", "1"),
        ])
        .header("X-API-KEY", trimmed_api_key)
        .header("Content-Type", "application/json")
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(_) => {
            return Ok(KinopoiskCandidatesResult {
                status: "error".to_string(),
                items: Vec::new(),
                code: Some("API_UNAVAILABLE".to_string()),
                message: Some(
                    "Не удалось связаться с Kinopoisk Unofficial API. Проверьте соединение или повторите позже."
                        .to_string(),
                ),
                retryable: true,
            });
        }
    };

    let status_code = response.status().as_u16();
    if status_code == 401 || status_code == 403 {
        return Ok(KinopoiskCandidatesResult {
            status: "error".to_string(),
            items: Vec::new(),
            code: Some("INVALID_KEY".to_string()),
            message: Some("Ключ Kinopoisk Unofficial API недействителен или отклонён.".to_string()),
            retryable: false,
        });
    }

    if status_code == 402 || status_code == 429 {
        return Ok(KinopoiskCandidatesResult {
            status: "error".to_string(),
            items: Vec::new(),
            code: Some("RATE_LIMIT".to_string()),
            message: Some(
                "Превышен лимит запросов к Kinopoisk Unofficial API. Попробуйте чуть позже."
                    .to_string(),
            ),
            retryable: true,
        });
    }

    if !response.status().is_success() {
        return Ok(KinopoiskCandidatesResult {
            status: "error".to_string(),
            items: Vec::new(),
            code: Some("API_UNAVAILABLE".to_string()),
            message: Some("Сервис поиска Kinopoisk временно недоступен.".to_string()),
            retryable: true,
        });
    }

    let parsed = match response.json::<KinopoiskApiResponse>().await {
        Ok(data) => data,
        Err(_) => {
            return Ok(KinopoiskCandidatesResult {
                status: "error".to_string(),
                items: Vec::new(),
                code: Some("API_UNAVAILABLE".to_string()),
                message: Some("Получен некорректный ответ от Kinopoisk Unofficial API.".to_string()),
                retryable: true,
            });
        }
    };

    Ok(KinopoiskCandidatesResult {
        status: "ok".to_string(),
        items: parsed.items,
        code: None,
        message: None,
        retryable: false,
    })
}

#[tauri::command]
async fn open_watch_window(
    app: tauri::AppHandle,
    url: String,
    title: String,
) -> Result<(), String> {
    let trimmed_url = url.trim();
    let parsed_url = Url::parse(trimmed_url)
        .map_err(|_| "Некорректная ссылка для просмотра.".to_string())?;

    match parsed_url.scheme() {
        "http" | "https" => {}
        _ => {
            return Err("Разрешены только ссылки с протоколом http или https.".to_string());
        }
    }

    #[cfg(desktop)]
    let window_title = {
        let trimmed_title = title.trim();
        if trimmed_title.is_empty() {
            "CineScope Player".to_string()
        } else {
            format!("CineScope — {}", trimmed_title)
        }
    };
    #[cfg(not(desktop))]
    let _ = title;

    if let Some(existing_window) = app.get_webview_window(PLAYER_WINDOW_LABEL) {
        existing_window
            .navigate(parsed_url)
            .map_err(|err| format!("Не удалось открыть ссылку в окне плеера: {}", err))?;

        #[cfg(desktop)]
        {
            let _ = existing_window.set_title(window_title.as_str());
            let _ = existing_window.unminimize();
            let _ = existing_window.show();
            let _ = existing_window.set_focus();
        }

        return Ok(());
    }

    let builder = WebviewWindowBuilder::new(
        &app,
        PLAYER_WINDOW_LABEL,
        WebviewUrl::External(parsed_url),
    )
    .initialization_script(PLAYER_POPUP_BLOCK_SCRIPT);

    #[cfg(desktop)]
    let builder = builder
        .title(window_title)
        .inner_size(1280.0, 760.0)
        .min_inner_size(800.0, 500.0)
        .center()
        .resizable(true)
        .theme(Some(Theme::Dark))
        .on_new_window(|_url, _features| NewWindowResponse::Deny);

    builder
        .build()
        .map_err(|err| format!("Не удалось создать окно плеера: {}", err))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    tauri::Builder::default()
        .manage(HttpClientState { client })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            fetch_kinopoisk_candidates,
            open_watch_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running CineScope application");
}
