use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Child;
#[cfg(target_os = "macos")]
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
#[cfg(desktop)]
use tauri::{webview::NewWindowResponse, Theme};
use tauri::{Emitter, Manager, State, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_http::reqwest;

const KINOPOISK_API_URL: &str = "https://kinopoiskapiunofficial.tech/api/v2.2/films";
const PLAYER_WINDOW_LABEL: &str = "player";

const PLAYER_MODE_FIREFOX: &str = "firefox_window";
const PLAYER_MODE_CHROME: &str = "chrome_window";
const PLAYER_MODE_EMBEDDED: &str = "embedded_webkit";

const UA_DESKTOP_SAFARI_MACOS: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15";

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

#[cfg(target_os = "macos")]
const FIREFOX_USER_JS: &str = r#"
// CineScope isolated cinema player profile
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("browser.tabs.inTitlebar", 0);
user_pref("ui.systemUsesDarkTheme", 1);
user_pref("layout.css.prefers-color-scheme.content-override", 0);
user_pref("extensions.activeThemeID", "firefox-compact-dark@mozilla.org");
user_pref("browser.tabs.warnOnClose", false);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("trailhead.firstrun.didSeeAboutWelcome", true);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("browser.startup.page", 0);
user_pref("browser.startup.homepage", "about:blank");
user_pref("datareporting.policy.firstRunURL", "");
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
user_pref("browser.rights.3.shown", true);
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.sessionstore.max_tabs_undo", 0);
user_pref("browser.sessionstore.max_windows_undo", 0);
user_pref("dom.disable_open_during_load", true);
user_pref("dom.popup_maximum", 0);
user_pref("dom.popup_allowed_events", "");
user_pref("browser.link.open_newwindow", 1);
user_pref("browser.link.open_newwindow.restriction", 0);
user_pref("full-screen-api.warning.timeout", 0);
user_pref("full-screen-api.warning.delay", 0);
user_pref("media.hardware-video-decoding.enabled", true);
user_pref("media.av1.enabled", true);
user_pref("media.mediasource.enabled", true);
user_pref("media.mediasource.vp9.enabled", true);
user_pref("media.mediasource.webm.enabled", true);
"#;

#[cfg(target_os = "macos")]
const FIREFOX_USER_CHROME_CSS: &str = r#"
/* CineScope clean cinema window: hide tabs, address bar, bookmarks, sidebars */
#TabsToolbar,
#nav-bar,
#PersonalToolbar,
#sidebar-box,
#sidebar-splitter,
#statuspanel {
  visibility: collapse !important;
  display: none !important;
}

#navigator-toolbox {
  min-height: 0 !important;
  height: 0 !important;
  border: none !important;
  background-color: #090B10 !important;
}

#main-window,
#tabbrowser-tabbox,
#tabbrowser-tabpanels,
browser {
  background-color: #090B10 !important;
}
"#;

struct HttpClientState {
    client: reqwest::Client,
    download_client: reqwest::Client,
}

struct PlayerWindowState {
    browser_child: Mutex<Option<Child>>,
}

struct OfflineDownloadState {
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OfflineDownloadProgressEvent {
    pub download_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedFileResult {
    pub file_path: String,
    pub file_name: String,
    pub file_size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedLocalVideo {
    pub file_path: String,
    pub file_name: String,
    pub file_size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailablePlayerBrowsers {
    pub firefox: bool,
    pub chrome: bool,
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

#[cfg(target_os = "macos")]
fn find_firefox_executable() -> Option<PathBuf> {
    let mut candidates = vec![
        PathBuf::from("/Applications/Firefox.app/Contents/MacOS/firefox"),
        PathBuf::from("/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox"),
        PathBuf::from("/Applications/Firefox Nightly.app/Contents/MacOS/firefox"),
    ];

    if let Ok(home) = std::env::var("HOME") {
        let home_apps = PathBuf::from(home).join("Applications");
        candidates.insert(1, home_apps.join("Firefox.app/Contents/MacOS/firefox"));
        candidates.push(
            home_apps.join("Firefox Developer Edition.app/Contents/MacOS/firefox"),
        );
        candidates.push(home_apps.join("Firefox Nightly.app/Contents/MacOS/firefox"));
    }

    candidates.into_iter().find(|path| path.is_file())
}

#[cfg(target_os = "macos")]
fn find_chrome_executable() -> Option<PathBuf> {
    let mut candidates = vec![
        PathBuf::from("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        PathBuf::from(
            "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
        ),
    ];

    if let Ok(home) = std::env::var("HOME") {
        let home_apps = PathBuf::from(home).join("Applications");
        candidates.insert(
            1,
            home_apps.join("Google Chrome.app/Contents/MacOS/Google Chrome"),
        );
        candidates.push(
            home_apps.join("Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"),
        );
    }

    candidates.into_iter().find(|path| path.is_file())
}

#[cfg(target_os = "macos")]
fn prepare_firefox_player_profile(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Не удалось получить каталог данных CineScope: {}", err))?;
    let profile_dir = base_dir.join("firefox-player-profile");
    let chrome_dir = profile_dir.join("chrome");

    fs::create_dir_all(&chrome_dir)
        .map_err(|err| format!("Не удалось подготовить профиль плеера Firefox: {}", err))?;

    fs::write(profile_dir.join("user.js"), FIREFOX_USER_JS)
        .map_err(|err| format!("Не удалось записать настройки профиля Firefox: {}", err))?;
    fs::write(chrome_dir.join("userChrome.css"), FIREFOX_USER_CHROME_CSS)
        .map_err(|err| format!("Не удалось записать стили окна Firefox: {}", err))?;

    cleanup_firefox_session_artifacts(&profile_dir);

    Ok(profile_dir)
}

#[cfg(target_os = "macos")]
fn cleanup_firefox_session_artifacts(profile_dir: &Path) {
    let files_to_remove = [
        "sessionstore.jsonlz4",
        "sessionCheckpoints.json",
        ".parentlock",
        "parent.lock",
    ];
    for file_name in files_to_remove {
        let _ = fs::remove_file(profile_dir.join(file_name));
    }
    let _ = fs::remove_dir_all(profile_dir.join("sessionstore-backups"));
}

#[cfg(target_os = "macos")]
fn prepare_chrome_player_profile(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Не удалось получить каталог данных CineScope: {}", err))?;
    let profile_dir = base_dir.join("chrome-player-profile");

    fs::create_dir_all(&profile_dir)
        .map_err(|err| format!("Не удалось подготовить профиль плеера Chrome: {}", err))?;

    let first_run_marker = profile_dir.join("First Run");
    if !first_run_marker.exists() {
        let _ = fs::write(&first_run_marker, "");
    }

    cleanup_chrome_lock_artifacts(&profile_dir);

    Ok(profile_dir)
}

#[cfg(target_os = "macos")]
fn cleanup_chrome_lock_artifacts(profile_dir: &Path) {
    let lock_files = ["SingletonLock", "SingletonCookie", "SingletonSocket"];
    for file_name in lock_files {
        let _ = fs::remove_file(profile_dir.join(file_name));
    }
}

fn terminate_browser_player(player_state: &PlayerWindowState) {
    let existing_child = match player_state.browser_child.lock() {
        Ok(mut guard) => guard.take(),
        Err(_) => None,
    };

    if let Some(mut child) = existing_child {
        match child.try_wait() {
            Ok(Some(_)) => {}
            _ => {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn normalize_player_mode(raw: Option<&str>) -> &'static str {
    match raw.map(str::trim) {
        Some(PLAYER_MODE_CHROME) | Some("chrome_4k") => PLAYER_MODE_CHROME,
        Some(PLAYER_MODE_EMBEDDED) | Some("safari_native") => PLAYER_MODE_EMBEDDED,
        _ => PLAYER_MODE_FIREFOX,
    }
}

#[tauri::command]
fn check_player_browsers() -> AvailablePlayerBrowsers {
    #[cfg(target_os = "macos")]
    {
        AvailablePlayerBrowsers {
            firefox: find_firefox_executable().is_some(),
            chrome: find_chrome_executable().is_some(),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        AvailablePlayerBrowsers {
            firefox: false,
            chrome: false,
        }
    }
}

#[tauri::command]
fn check_firefox_available() -> bool {
    check_player_browsers().firefox
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
    player_mode: Option<String>,
    player_state: State<'_, PlayerWindowState>,
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

    let resolved_mode = normalize_player_mode(player_mode.as_deref());

    #[cfg(target_os = "macos")]
    if resolved_mode == PLAYER_MODE_FIREFOX {
        if let Some(firefox_path) = find_firefox_executable() {
            if let Some(existing_window) = app.get_webview_window(PLAYER_WINDOW_LABEL) {
                let _ = existing_window.destroy();
            }

            terminate_browser_player(&player_state);

            let profile_dir = prepare_firefox_player_profile(&app)?;
            let child = Command::new(&firefox_path)
                .arg("-profile")
                .arg(&profile_dir)
                .arg("--no-remote")
                .arg("--new-instance")
                .arg("-width")
                .arg("1366")
                .arg("-height")
                .arg("820")
                .arg(parsed_url.as_str())
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|err| format!("Не удалось запустить чистое окно Firefox: {}", err))?;

            if let Ok(mut guard) = player_state.browser_child.lock() {
                *guard = Some(child);
            }

            return Ok(());
        }
    }

    #[cfg(target_os = "macos")]
    if resolved_mode == PLAYER_MODE_CHROME {
        if let Some(chrome_path) = find_chrome_executable() {
            if let Some(existing_window) = app.get_webview_window(PLAYER_WINDOW_LABEL) {
                let _ = existing_window.destroy();
            }

            terminate_browser_player(&player_state);

            let profile_dir = prepare_chrome_player_profile(&app)?;
            let user_data_arg = format!("--user-data-dir={}", profile_dir.to_string_lossy());
            let app_arg = format!("--app={}", parsed_url.as_str());

            let child = Command::new(&chrome_path)
                .arg(user_data_arg)
                .arg(app_arg)
                .arg("--window-size=1366,820")
                .arg("--no-first-run")
                .arg("--no-default-browser-check")
                .arg("--disable-features=Translate,MediaRouter")
                .arg("--force-dark-mode")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|err| format!("Не удалось запустить чистое окно Chrome: {}", err))?;

            if let Ok(mut guard) = player_state.browser_child.lock() {
                *guard = Some(child);
            }

            return Ok(());
        }
    }

    #[cfg(not(target_os = "macos"))]
    let _ = resolved_mode;

    // Встроенное окно CineScope (WebKit) — выбранный режим или автоматический фоллбэк
    terminate_browser_player(&player_state);

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
    .user_agent(UA_DESKTOP_SAFARI_MACOS)
    .initialization_script_for_all_frames(PLAYER_POPUP_BLOCK_SCRIPT);

    #[cfg(desktop)]
    let builder = builder
        .incognito(false)
        .title(window_title)
        .inner_size(1366.0, 820.0)
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

fn get_downloads_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Не удалось получить каталог данных CineScope: {}", err))?;
    let downloads_dir = base_dir.join("downloads");
    fs::create_dir_all(&downloads_dir)
        .map_err(|err| format!("Не удалось создать папку загрузок: {}", err))?;
    Ok(downloads_dir)
}

fn sanitize_download_filename(raw: &str) -> String {
    let base = Path::new(raw.trim())
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("video.mp4");

    let mut cleaned = String::with_capacity(base.len());
    for ch in base.chars() {
        if ch.is_alphanumeric() || matches!(ch, '.' | '-' | '_') {
            cleaned.push(ch);
        } else if ch.is_whitespace() {
            cleaned.push('_');
        }
    }

    let trimmed = cleaned.trim_matches(|c| c == '.' || c == '_');
    if trimmed.is_empty() {
        return "video.mp4".to_string();
    }

    let truncated: String = trimmed.chars().take(120).collect();
    if truncated.contains('.') {
        truncated
    } else {
        format!("{}.mp4", truncated)
    }
}

fn allocate_unique_target_path(dir: &Path, file_name: &str) -> (PathBuf, String) {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return (candidate, file_name.to_string());
    }

    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("video");
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .filter(|e| !e.is_empty());

    for index in 1..=999u32 {
        let next_name = match ext {
            Some(extension) => format!("{}_{}.{}", stem, index, extension),
            None => format!("{}_{}", stem, index),
        };
        let next_path = dir.join(&next_name);
        if !next_path.exists() {
            return (next_path, next_name);
        }
    }

    let fallback = format!("video_{}.mp4", std::process::id());
    (dir.join(&fallback), fallback)
}

#[tauri::command]
async fn start_offline_download(
    app: tauri::AppHandle,
    download_id: String,
    url: String,
    suggested_name: String,
    http_state: State<'_, HttpClientState>,
    download_state: State<'_, OfflineDownloadState>,
) -> Result<DownloadedFileResult, String> {
    let trimmed_url = url.trim();
    let parsed_url = Url::parse(trimmed_url)
        .map_err(|_| "Некорректная прямая ссылка на видеофайл.".to_string())?;
    match parsed_url.scheme() {
        "http" | "https" => {}
        _ => {
            return Err("Поддерживаются только прямые ссылки http и https.".to_string());
        }
    }

    let downloads_dir = get_downloads_dir(&app)?;
    let safe_name = sanitize_download_filename(&suggested_name);
    let (final_path, final_name) = allocate_unique_target_path(&downloads_dir, &safe_name);
    let part_path = downloads_dir.join(format!("{}.part", final_name));

    let cancel_flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut guard) = download_state.active.lock() {
        if let Some(prev_flag) = guard.insert(download_id.clone(), Arc::clone(&cancel_flag)) {
            prev_flag.store(true, Ordering::Relaxed);
        }
    }

    let result: Result<DownloadedFileResult, String> = async {
        let mut response = http_state
            .download_client
            .get(parsed_url)
            .send()
            .await
            .map_err(|err| format!("Не удалось подключиться к серверу загрузки: {}", err))?;

        if !response.status().is_success() {
            return Err(format!(
                "Сервер отклонил загрузку (код {}).",
                response.status().as_u16()
            ));
        }

        let total_bytes = response.content_length();
        let mut file = File::create(&part_path)
            .map_err(|err| format!("Не удалось создать файл для записи: {}", err))?;

        let mut downloaded_bytes: u64 = 0;
        let mut last_emit = Instant::now();

        let _ = app.emit(
            "offline-download-progress",
            OfflineDownloadProgressEvent {
                download_id: download_id.clone(),
                downloaded_bytes: 0,
                total_bytes,
            },
        );

        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|err| format!("Обрыв соединения во время загрузки: {}", err))?
        {
            if cancel_flag.load(Ordering::Relaxed) {
                return Err("Загрузка отменена.".to_string());
            }

            file.write_all(&chunk)
                .map_err(|err| format!("Ошибка записи видео на диск: {}", err))?;
            downloaded_bytes = downloaded_bytes.saturating_add(chunk.len() as u64);

            if last_emit.elapsed() >= Duration::from_millis(200) {
                let _ = app.emit(
                    "offline-download-progress",
                    OfflineDownloadProgressEvent {
                        download_id: download_id.clone(),
                        downloaded_bytes,
                        total_bytes,
                    },
                );
                last_emit = Instant::now();
            }
        }

        if cancel_flag.load(Ordering::Relaxed) {
            return Err("Загрузка отменена.".to_string());
        }

        file.flush()
            .map_err(|err| format!("Не удалось завершить запись видео на диск: {}", err))?;
        drop(file);

        fs::rename(&part_path, &final_path)
            .map_err(|err| format!("Не удалось сохранить скачанный файл: {}", err))?;

        let _ = app.emit(
            "offline-download-progress",
            OfflineDownloadProgressEvent {
                download_id: download_id.clone(),
                downloaded_bytes,
                total_bytes: total_bytes.or(Some(downloaded_bytes)),
            },
        );

        Ok(DownloadedFileResult {
            file_path: final_path.to_string_lossy().to_string(),
            file_name: final_name,
            file_size_bytes: downloaded_bytes,
        })
    }
    .await;

    if let Ok(mut guard) = download_state.active.lock() {
        guard.remove(&download_id);
    }

    if result.is_err() {
        let _ = fs::remove_file(&part_path);
    }

    result
}

#[tauri::command]
fn cancel_offline_download(
    download_id: String,
    download_state: State<'_, OfflineDownloadState>,
) -> bool {
    if let Ok(guard) = download_state.active.lock() {
        if let Some(flag) = guard.get(&download_id) {
            flag.store(true, Ordering::Relaxed);
            return true;
        }
    }
    false
}

#[tauri::command]
async fn pick_local_video_file() -> Result<Option<PickedLocalVideo>, String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(|| {
            let script = r#"POSIX path of (choose file of type {"public.movie", "mp4", "mkv", "mov", "webm", "m4v", "avi"} with prompt "Выберите видеофайл для CineScope")"#;
            let output = Command::new("osascript")
                .arg("-e")
                .arg(script)
                .output()
                .map_err(|err| format!("Не удалось открыть окно выбора файла macOS: {}", err))?;

            if !output.status.success() {
                return Ok(None);
            }

            let raw_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if raw_path.is_empty() {
                return Ok(None);
            }

            let path = PathBuf::from(&raw_path);
            if !path.is_file() {
                return Err("Выбранный объект не является видеофайлом.".to_string());
            }

            let metadata = fs::metadata(&path)
                .map_err(|err| format!("Не удалось прочитать свойства видеофайла: {}", err))?;
            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("video.mp4")
                .to_string();

            Ok(Some(PickedLocalVideo {
                file_path: raw_path,
                file_name,
                file_size_bytes: metadata.len(),
            }))
        })
        .await
        .map_err(|err| format!("Ошибка выбора видеофайла: {}", err))?
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Выбор локального файла через Finder доступен только на macOS.".to_string())
    }
}

#[tauri::command]
fn open_offline_video(file_path: String) -> Result<(), String> {
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err("Путь к видеофайлу пуст.".to_string());
    }
    let path = Path::new(trimmed);
    if !path.is_file() {
        return Err("Видеофайл не найден на диске. Возможно, он был перемещён или удалён.".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|err| format!("Не удалось запустить системный видеоплеер: {}", err))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Открытие видео в системном плеере поддерживается на macOS.".to_string())
    }
}

#[tauri::command]
fn reveal_offline_file(file_path: String) -> Result<(), String> {
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err("Путь к видеофайлу пуст.".to_string());
    }
    let path = Path::new(trimmed);
    if !path.exists() {
        return Err("Файл не найден на диске.".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|err| format!("Не удалось открыть файл в Finder: {}", err))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Показ файла в Finder поддерживается только на macOS.".to_string())
    }
}

#[tauri::command]
fn delete_offline_file(app: tauri::AppHandle, file_path: String) -> Result<bool, String> {
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Ok(false);
    }

    let downloads_dir = get_downloads_dir(&app)?;
    let canonical_downloads = fs::canonicalize(&downloads_dir)
        .map_err(|err| format!("Не удалось проверить каталог загрузок: {}", err))?;

    let target = PathBuf::from(trimmed);
    if !target.exists() {
        return Ok(false);
    }

    let canonical_target = match fs::canonicalize(&target) {
        Ok(path) => path,
        Err(_) => return Ok(false),
    };

    // Безопасность: удаляем файл с диска ТОЛЬКО если он лежит внутри собственной папки downloads CineScope
    if canonical_target.starts_with(&canonical_downloads) && canonical_target.is_file() {
        fs::remove_file(&canonical_target)
            .map_err(|err| format!("Не удалось удалить скачанный файл с диска: {}", err))?;
        return Ok(true);
    }

    Ok(false)
}

#[tauri::command]
fn verify_offline_files(paths: Vec<String>) -> HashMap<String, bool> {
    let mut map = HashMap::with_capacity(paths.len());
    for p in paths {
        let exists = Path::new(p.trim()).is_file();
        map.insert(p, exists);
    }
    map
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let download_client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    tauri::Builder::default()
        .manage(HttpClientState {
            client,
            download_client,
        })
        .manage(PlayerWindowState {
            browser_child: Mutex::new(None),
        })
        .manage(OfflineDownloadState {
            active: Mutex::new(HashMap::new()),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            fetch_kinopoisk_candidates,
            open_watch_window,
            check_player_browsers,
            check_firefox_available,
            start_offline_download,
            cancel_offline_download,
            pick_local_video_file,
            open_offline_video,
            reveal_offline_file,
            delete_offline_file,
            verify_offline_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running CineScope application");
}
