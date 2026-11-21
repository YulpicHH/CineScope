mod tv_pairing;

use serde::{Deserialize, Serialize};
#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::fs;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::path::{Path, PathBuf};
#[cfg(desktop)]
use std::process::Child;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::process::{Command, Stdio};
#[cfg(desktop)]
use std::sync::Mutex;
use std::time::Duration;
#[cfg(desktop)]
use tauri::{
    webview::NewWindowResponse, Theme, Url, WebviewUrl, WebviewWindowBuilder,
};
use tauri::{Manager, RunEvent, State};
use tauri_plugin_http::reqwest;
use tv_pairing::{
    poll_pairing_session, start_pairing_session, TvPairingPollResult, TvPairingSessionInfo,
    TvPairingState,
};

const KINOPOISK_API_URL: &str = "https://kinopoiskapiunofficial.tech/api/v2.2/films";
#[cfg(desktop)]
const PLAYER_WINDOW_LABEL: &str = "player";

#[cfg(desktop)]
const PLAYER_MODE_FIREFOX: &str = "firefox_window";
#[cfg(desktop)]
const PLAYER_MODE_CHROME: &str = "chrome_window";
#[cfg(desktop)]
const PLAYER_MODE_EDGE: &str = "edge_window";
#[cfg(desktop)]
const PLAYER_MODE_EMBEDDED: &str = "embedded_webkit";

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(target_os = "macos")]
const UA_DESKTOP_SAFARI_MACOS: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15";

#[cfg(desktop)]
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

#[cfg(any(target_os = "macos", target_os = "windows"))]
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

#[cfg(any(target_os = "macos", target_os = "windows"))]
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
}

#[cfg(desktop)]
struct PlayerWindowState {
    browser_child: Mutex<Option<Child>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailablePlayerBrowsers {
    pub platform: String,
    pub firefox: bool,
    pub chrome: bool,
    pub edge: bool,
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

fn current_platform_id() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(target_os = "android")]
    {
        "android"
    }
    #[cfg(target_os = "ios")]
    {
        "ios"
    }
    #[cfg(not(any(
        target_os = "windows",
        target_os = "macos",
        target_os = "android",
        target_os = "ios"
    )))]
    {
        "linux"
    }
}

#[cfg(desktop)]
fn default_player_mode() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        // На Windows встроенное окно работает на WebView2 (Chromium) с нативной поддержкой 4K
        PLAYER_MODE_EMBEDDED
    }
    #[cfg(not(target_os = "windows"))]
    {
        PLAYER_MODE_FIREFOX
    }
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
fn find_edge_executable() -> Option<PathBuf> {
    let mut candidates = vec![PathBuf::from(
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    )];

    if let Ok(home) = std::env::var("HOME") {
        let home_apps = PathBuf::from(home).join("Applications");
        candidates.push(
            home_apps.join("Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
        );
    }

    candidates.into_iter().find(|path| path.is_file())
}

#[cfg(target_os = "windows")]
fn windows_program_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    for env_key in ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"] {
        if let Ok(raw) = std::env::var(env_key) {
            let trimmed = raw.trim();
            if !trimmed.is_empty() {
                let path = PathBuf::from(trimmed);
                if !roots.contains(&path) {
                    roots.push(path);
                }
            }
        }
    }

    for fallback in [r"C:\Program Files", r"C:\Program Files (x86)"] {
        let path = PathBuf::from(fallback);
        if !roots.contains(&path) {
            roots.push(path);
        }
    }

    roots
}

#[cfg(target_os = "windows")]
fn find_windows_browser(relative_paths: &[&str]) -> Option<PathBuf> {
    let roots = windows_program_roots();
    for rel in relative_paths {
        for root in &roots {
            let candidate = root.join(rel);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn find_firefox_executable() -> Option<PathBuf> {
    find_windows_browser(&[
        r"Mozilla Firefox\firefox.exe",
        r"Firefox Developer Edition\firefox.exe",
        r"Firefox Nightly\firefox.exe",
    ])
}

#[cfg(target_os = "windows")]
fn find_chrome_executable() -> Option<PathBuf> {
    find_windows_browser(&[
        r"Google\Chrome\Application\chrome.exe",
        r"Google\Chrome Beta\Application\chrome.exe",
        r"Google\Chrome SxS\Application\chrome.exe",
    ])
}

#[cfg(target_os = "windows")]
fn find_edge_executable() -> Option<PathBuf> {
    find_windows_browser(&[
        r"Microsoft\Edge\Application\msedge.exe",
        r"Microsoft\Edge Beta\Application\msedge.exe",
        r"Microsoft\Edge Dev\Application\msedge.exe",
    ])
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn configure_browser_command(command: &mut Command) {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
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

#[cfg(any(target_os = "macos", target_os = "windows"))]
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

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn prepare_chromium_player_profile(
    app: &tauri::AppHandle,
    profile_folder_name: &str,
    browser_label: &str,
) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Не удалось получить каталог данных CineScope: {}", err))?;
    let profile_dir = base_dir.join(profile_folder_name);

    fs::create_dir_all(&profile_dir).map_err(|err| {
        format!(
            "Не удалось подготовить профиль плеера {}: {}",
            browser_label, err
        )
    })?;

    let first_run_marker = profile_dir.join("First Run");
    if !first_run_marker.exists() {
        let _ = fs::write(&first_run_marker, "");
    }

    cleanup_chromium_lock_artifacts(&profile_dir);

    Ok(profile_dir)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn cleanup_chromium_lock_artifacts(profile_dir: &Path) {
    let lock_files = [
        "SingletonLock",
        "SingletonCookie",
        "SingletonSocket",
        "Lockfile",
    ];
    for file_name in lock_files {
        let _ = fs::remove_file(profile_dir.join(file_name));
    }
}

#[cfg(desktop)]
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

#[cfg(desktop)]
fn normalize_player_mode(raw: Option<&str>) -> &'static str {
    match raw.map(str::trim) {
        Some(PLAYER_MODE_FIREFOX) | Some("firefox_4k") => PLAYER_MODE_FIREFOX,
        Some(PLAYER_MODE_CHROME) | Some("chrome_4k") => PLAYER_MODE_CHROME,
        Some(PLAYER_MODE_EDGE) | Some("edge_4k") => PLAYER_MODE_EDGE,
        Some(PLAYER_MODE_EMBEDDED) | Some("embedded_webview") | Some("safari_native") => {
            PLAYER_MODE_EMBEDDED
        }
        _ => default_player_mode(),
    }
}

#[tauri::command]
fn check_player_browsers() -> AvailablePlayerBrowsers {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        AvailablePlayerBrowsers {
            platform: current_platform_id().to_string(),
            firefox: find_firefox_executable().is_some(),
            chrome: find_chrome_executable().is_some(),
            edge: find_edge_executable().is_some(),
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        AvailablePlayerBrowsers {
            platform: current_platform_id().to_string(),
            firefox: false,
            chrome: false,
            edge: false,
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

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn launch_chromium_app_window(
    app: &tauri::AppHandle,
    executable: &Path,
    profile_folder_name: &str,
    browser_label: &str,
    extra_disabled_features: &str,
    parsed_url: &Url,
    player_state: &PlayerWindowState,
) -> Result<(), String> {
    if let Some(existing_window) = app.get_webview_window(PLAYER_WINDOW_LABEL) {
        let _ = existing_window.destroy();
    }

    terminate_browser_player(player_state);

    let profile_dir = prepare_chromium_player_profile(app, profile_folder_name, browser_label)?;
    let user_data_arg = format!("--user-data-dir={}", profile_dir.to_string_lossy());
    let app_arg = format!("--app={}", parsed_url.as_str());
    let disabled_features_arg = format!("--disable-features={}", extra_disabled_features);

    let mut command = Command::new(executable);
    command
        .arg(user_data_arg)
        .arg(app_arg)
        .arg("--window-size=1366,820")
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg(disabled_features_arg)
        .arg("--force-dark-mode");
    configure_browser_command(&mut command);

    let child = command
        .spawn()
        .map_err(|err| format!("Не удалось запустить чистое окно {}: {}", browser_label, err))?;

    if let Ok(mut guard) = player_state.browser_child.lock() {
        *guard = Some(child);
    }

    Ok(())
}

#[cfg(desktop)]
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

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    if resolved_mode == PLAYER_MODE_FIREFOX {
        if let Some(firefox_path) = find_firefox_executable() {
            if let Some(existing_window) = app.get_webview_window(PLAYER_WINDOW_LABEL) {
                let _ = existing_window.destroy();
            }

            terminate_browser_player(&player_state);

            let profile_dir = prepare_firefox_player_profile(&app)?;
            let mut command = Command::new(&firefox_path);
            command
                .arg("-profile")
                .arg(&profile_dir)
                .arg("--no-remote")
                .arg("--new-instance")
                .arg("-width")
                .arg("1366")
                .arg("-height")
                .arg("820")
                .arg(parsed_url.as_str());
            configure_browser_command(&mut command);

            let child = command
                .spawn()
                .map_err(|err| format!("Не удалось запустить чистое окно Firefox: {}", err))?;

            if let Ok(mut guard) = player_state.browser_child.lock() {
                *guard = Some(child);
            }

            return Ok(());
        }
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    if resolved_mode == PLAYER_MODE_CHROME {
        if let Some(chrome_path) = find_chrome_executable() {
            return launch_chromium_app_window(
                &app,
                &chrome_path,
                "chrome-player-profile",
                "Chrome",
                "Translate,MediaRouter",
                &parsed_url,
                &player_state,
            );
        }
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    if resolved_mode == PLAYER_MODE_EDGE {
        if let Some(edge_path) = find_edge_executable() {
            return launch_chromium_app_window(
                &app,
                &edge_path,
                "edge-player-profile",
                "Microsoft Edge",
                "Translate,MediaRouter,msEdgeSidebarV2",
                &parsed_url,
                &player_state,
            );
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let _ = resolved_mode;

    // Встроенное окно CineScope (WebView2 4K на Windows / WebKit на macOS) — выбранный режим или автоматический фоллбэк
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
    .initialization_script_for_all_frames(PLAYER_POPUP_BLOCK_SCRIPT);

    // На macOS используем десктопный Safari UA; на Windows оставляем нативный Chromium/Edge WebView2 UA для 4K VP9/AV1
    #[cfg(target_os = "macos")]
    let builder = builder.user_agent(UA_DESKTOP_SAFARI_MACOS);

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

#[cfg(not(desktop))]
#[tauri::command]
async fn open_watch_window(
    _url: String,
    _title: String,
    _player_mode: Option<String>,
) -> Result<(), String> {
    Err(
        "Встроенное десктопное окно плеера недоступно на Android TV. Используйте системный браузер приставки."
            .to_string(),
    )
}

#[tauri::command]
fn start_tv_pairing_server(
    app: tauri::AppHandle,
    pairing_state: State<'_, TvPairingState>,
) -> Result<TvPairingSessionInfo, String> {
    start_pairing_session(app, &pairing_state)
}

#[tauri::command]
fn stop_tv_pairing_server(pairing_state: State<'_, TvPairingState>) {
    pairing_state.stop_active();
}

#[tauri::command]
fn poll_tv_pairing_result(
    session_id: Option<u32>,
    pairing_state: State<'_, TvPairingState>,
) -> TvPairingPollResult {
    poll_pairing_session(&pairing_state, session_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let builder = tauri::Builder::default()
        .manage(HttpClientState { client })
        .manage(TvPairingState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init());

    #[cfg(desktop)]
    let builder = builder
        .manage(PlayerWindowState {
            browser_child: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            fetch_kinopoisk_candidates,
            open_watch_window,
            check_player_browsers,
            check_firefox_available,
            start_tv_pairing_server,
            stop_tv_pairing_server,
            poll_tv_pairing_result
        ]);

    #[cfg(not(desktop))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        fetch_kinopoisk_candidates,
        open_watch_window,
        check_player_browsers,
        check_firefox_available,
        start_tv_pairing_server,
        stop_tv_pairing_server,
        poll_tv_pairing_result
    ]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building CineScope application");

    #[cfg(desktop)]
    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(player_state) = app_handle.try_state::<PlayerWindowState>() {
                terminate_browser_player(&player_state);
            }
            if let Some(pairing_state) = app_handle.try_state::<TvPairingState>() {
                pairing_state.stop_active();
            }
        }
    });

    #[cfg(not(desktop))]
    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(pairing_state) = app_handle.try_state::<TvPairingState>() {
                pairing_state.stop_active();
            }
        }
    });
}
