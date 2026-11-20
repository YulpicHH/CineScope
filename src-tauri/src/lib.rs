use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::State;
use tauri_plugin_http::reqwest;

const KINOPOISK_API_URL: &str = "https://kinopoiskapiunofficial.tech/api/v2.2/films";

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

fn resolve_kinopoisk_api_key() -> Option<String> {
    let runtime_key = std::env::var("KINOPOISK_API_KEY").ok();
    let compile_time_key = option_env!("KINOPOISK_API_KEY").map(str::to_string);

    runtime_key
        .or(compile_time_key)
        .map(|key| key.trim().to_string())
        .filter(|key| !key.is_empty() && key != "MY_KINOPOISK_API_KEY")
}

#[tauri::command]
async fn fetch_kinopoisk_candidates(
    keyword: String,
    type_param: String,
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

    let api_key = match resolve_kinopoisk_api_key() {
        Some(key) => key,
        None => {
            return Ok(KinopoiskCandidatesResult {
                status: "error".to_string(),
                items: Vec::new(),
                code: Some("NOT_CONFIGURED".to_string()),
                message: Some(
                    "Ключ Kinopoisk Unofficial API не задан при сборке приложения.".to_string(),
                ),
                retryable: false,
            });
        }
    };

    let normalized_type = if type_param == "FILM" { "FILM" } else { "ALL" };

    let response = match http_state
        .client
        .get(KINOPOISK_API_URL)
        .query(&[
            ("keyword", trimmed_keyword),
            ("type", normalized_type),
            ("page", "1"),
        ])
        .header("X-API-KEY", api_key)
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
        .invoke_handler(tauri::generate_handler![fetch_kinopoisk_candidates])
        .run(tauri::generate_context!())
        .expect("error while running CineScope application");
}
