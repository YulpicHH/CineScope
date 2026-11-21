#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::fs;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::path::{Path, PathBuf};
use tauri::Url;

/// Проверенный список доменов рекламных сетей, VAST/pre-roll видеорекламы,
/// кликандеров, попандеров и тизерных сетей (включая RuNet-сети).
/// Не содержит видео-балансёров и CDN видеопотоков.
pub const AD_BLOCK_DOMAINS: &[&str] = &[
    // Google / DoubleClick / IMA VAST
    "doubleclick.net",
    "googlesyndication.com",
    "googleadservices.com",
    "adservice.google.com",
    "imasdk.googleapis.com",
    // Yandex / Mail.ru / Rambler ads & trackers
    "an.yandex.ru",
    "ads.adfox.ru",
    "banners.adfox.ru",
    "adfox.ru",
    "mc.yandex.ru",
    "ad.mail.ru",
    "r.mradx.net",
    "rs.mail.ru",
    "target.my.com",
    "top-fwz1.mail.ru",
    "ssp.rambler.ru",
    // RuNet video VAST / pre-roll / banner / teaser networks
    "videoroll.net",
    "videonow.ru",
    "nativeroll.tv",
    "viqeo.tv",
    "buzzoola.com",
    "pladform.ru",
    "betweendigital.com",
    "betweenx.com",
    "adriver.ru",
    "rtb.sape.ru",
    "mediatoday.ru",
    "luxup.ru",
    "luxupcdna.com",
    "mgid.com",
    "mgid.ru",
    "marketgid.com",
    "lentainform.com",
    "directadvert.ru",
    "bodyclick.net",
    "visitweb.com",
    "kadam.net",
    "teaser.net",
    "teasernet.com",
    "recreativ.ru",
    "octoclick.net",
    "trafmag.com",
    "redclick.ru",
    "adskeeper.com",
    "adskeeper.co.uk",
    "admixer.net",
    "videoclick.ru",
    "rtbsystem.com",
    "hybrid.ai",
    "otm-r.com",
    "relap.io",
    "liveinternet.ru",
    "counter.yadro.ru",
    // Popunder / Clickunder / Push-spam networks
    "popads.net",
    "popcash.net",
    "propellerads.com",
    "monetag.com",
    "clickadu.com",
    "hilltopads.net",
    "adsterra.com",
    "highperformanceformat.com",
    "effectivegatecpm.com",
    "profitablegatecpm.com",
    "onclickmax.com",
    "onclickalgo.com",
    "onclickperformance.com",
    "onmarshtompor.com",
    "alwingulla.com",
    "acscdn.com",
    "thubanoa.com",
    "glizauvo.net",
    "dolohen.com",
    "ouphouch.com",
    "pushame.com",
    "push-notifications.cc",
    "zeroredirect1.com",
    "go.onclasrv.com",
    "go.oclasrv.com",
    // Global streaming / VAST / programmatic ad networks
    "exoclick.com",
    "exosrv.com",
    "realsrv.com",
    "pemsrv.com",
    "magsrv.com",
    "tsyndicate.com",
    "juicyads.com",
    "trafficstars.com",
    "trafficjunky.net",
    "traffichunt.com",
    "adspyglass.com",
    "adtng.com",
    "vidoomy.com",
    "vdo.ai",
    "adx1.com",
    "adspynet.com",
    "adwise.agency",
    "advertonic.com",
    "adnxs.com",
    "criteo.com",
    "criteo.net",
    "taboola.com",
    "outbrain.com",
    "openx.net",
    "pubmatic.com",
    "rubiconproject.com",
    "smartadserver.com",
    "casalemedia.com",
    "amazon-adsystem.com",
    "adform.net",
    "adroll.com",
    "adsrvr.org",
    "bidswitch.net",
    "moatads.com",
    "spotxchange.com",
    "spotx.tv",
    "springserve.com",
    "lkqd.net",
    "teads.tv",
    "innovid.com",
    "connatix.com",
    "primis.tech",
    "showheroes.com",
    "revcontent.com",
    "a-ads.com",
    "histats.com",
    "scorecardresearch.com",
    "quantserve.com",
    "yandexadexchange.net",
    "rtbhouse.com",
    "serving-sys.com",
    "2mdn.net",
    "bidvertiser.com",
    "adhigh.net",
    "clickaine.com",
    "galaksion.com",
    "evadav.com",
    "rollerads.com",
    "richads.com",
];

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub const FIREFOX_USER_CONTENT_CSS: &str = r###"
/* CineScope ad & overlay cosmetic shield for Firefox player profile */
ins.adsbygoogle,
iframe[src*="doubleclick.net"],
iframe[src*="googlesyndication.com"],
iframe[src*="adfox.ru"],
iframe[src*="an.yandex.ru"],
iframe[src*="mgid.com"],
iframe[src*="marketgid.com"],
iframe[src*="adskeeper.com"],
iframe[src*="exoclick.com"],
iframe[src*="popads.net"],
iframe[src*="clickadu.com"],
iframe[src*="propellerads.com"],
iframe[src*="adsterra.com"],
iframe[src*="vidoomy.com"],
iframe[src*="videoroll.net"],
iframe[src*="betweendigital.com"],
iframe[src*="adriver.ru"],
iframe[src*="kadam.net"],
iframe[src*="teasernet.com"],
[id^="yandex_rtb"],
[id*="adfox_"],
[id^="adfox_"],
[class*="mgid"],
[id*="mgid"],
[class*="teaser-block"],
[class*="teasers-block"],
[class*="branding-link"],
a[class*="branding"],
[id*="branding-overlay"],
[data-ad-slot],
[data-ad-client],
a[href*="t.me/"],
a[href*="telegram.me/"],
a[href*="telegram.dog/"],
a[href^="tg://"],
[class*="tg-widget"],
[id*="tg-widget"],
[class*="telegram-widget"],
[id*="telegram-widget"],
[class*="tg_button"],
[id*="tg_button"],
[class*="tg-banner"],
[id*="tg-banner"] {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
  width: 0 !important;
  height: 0 !important;
  opacity: 0 !important;
}
"###;

const MEDIA_STREAM_EXTENSIONS: &[&str] = &[
    ".m3u8", ".mp4", ".m4s", ".m4v", ".ts", ".mpd", ".webm", ".vtt", ".srt", ".aac",
];

pub fn is_media_stream_url(raw: &str) -> bool {
    let lower = raw.to_ascii_lowercase();
    let without_query = lower.split('?').next().unwrap_or(&lower);
    let without_hash = without_query.split('#').next().unwrap_or(without_query);
    MEDIA_STREAM_EXTENSIONS
        .iter()
        .any(|ext| without_hash.ends_with(ext))
}

pub fn is_blocked_ad_host(host: &str) -> bool {
    let normalized = host.trim().trim_end_matches('.').to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }
    AD_BLOCK_DOMAINS.iter().any(|&domain| {
        normalized == domain
            || (normalized.len() > domain.len()
                && normalized.ends_with(domain)
                && normalized.as_bytes()[normalized.len() - domain.len() - 1] == b'.')
    })
}

/// Проверяет, нужно ли заблокировать навигацию встроенного окна WebView2/WKWebView
/// (например, редирект кликандера на рекламный домен).
pub fn is_blocked_navigation_url(url: &Url) -> bool {
    match url.scheme() {
        "about" | "data" | "blob" => return false,
        "http" | "https" => {}
        _ => return true,
    }

    if is_media_stream_url(url.as_str()) {
        return false;
    }

    if let Some(host) = url.host_str() {
        if is_blocked_ad_host(host) {
            return true;
        }
    }

    let lower = url.as_str().to_ascii_lowercase();
    lower.contains("/popunder")
        || lower.contains("/clickunder")
        || lower.contains("popunder.js")
        || lower.contains("clickunder.js")
}

/// Генерирует скрипт защиты от всплывающих окон, кликандеров, VAST/pre-roll видеорекламы,
/// баннеров и сторонних плавающих Telegram-виджетов для встроенного окна WebView2/WKWebView.
pub fn build_player_guard_script() -> String {
    let domains_json =
        serde_json::to_string(AD_BLOCK_DOMAINS).unwrap_or_else(|_| "[]".to_string());

    let template = r###"
(() => {
  if (window.__cinescopeAdGuardInstalled) return;
  window.__cinescopeAdGuardInstalled = true;

  const BLOCKED_DOMAINS = __DOMAINS_JSON__;
  const MEDIA_EXT_RE = /\.(m3u8|mp4|m4s|m4v|ts|mpd|webm|vtt|srt|aac)(\?|$|#)/i;
  const VAST_URL_RE = /(\/vast(\.xml|\b|[/?_-])|\/vpaid\b|\/preroll\b|\/midroll\b|\/postroll\b|\/ads\/vast|vast_url=|adtagurl=|imasdk\.googleapis|pubads\.g\.doubleclick|\/adfox\/|\/an\.yandex\.ru\/meta)/i;
  const AD_PATH_RE = /(\/popunder|\/clickunder|popunder\.js|clickunder\.js|\/adsbygoogle|\/pagead\/|\/adserver\/|\/vast\.xml|\/rtb\/|\/teasers?\/)/i;
  const EMPTY_VAST_XML = '<?xml version="1.0" encoding="UTF-8"?><VAST version="3.0"></VAST>';

  function isBlockedHost(hostname) {
    if (!hostname) return false;
    const h = String(hostname).trim().replace(/\.+$/, '').toLowerCase();
    if (!h) return false;
    for (let i = 0; i < BLOCKED_DOMAINS.length; i++) {
      const d = BLOCKED_DOMAINS[i];
      if (h === d || (h.length > d.length && h.endsWith('.' + d))) {
        return true;
      }
    }
    return false;
  }

  function parseSafeUrl(raw) {
    if (!raw || typeof raw !== 'string') return null;
    try {
      return new URL(raw, window.location.href);
    } catch {
      return null;
    }
  }

  function isBlockedAdUrl(raw) {
    if (!raw || typeof raw !== 'string') return false;
    if (MEDIA_EXT_RE.test(raw)) return false;
    const parsed = parseSafeUrl(raw);
    if (!parsed) return false;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (isBlockedHost(parsed.hostname)) return true;
    const full = parsed.href;
    return VAST_URL_RE.test(full) || AD_PATH_RE.test(full);
  }

  function isVastLikeUrl(raw) {
    if (!raw || typeof raw !== 'string') return false;
    return VAST_URL_RE.test(raw);
  }

  function isExternalOrigin(raw) {
    const parsed = parseSafeUrl(raw);
    if (!parsed) return true;
    return parsed.origin !== window.location.origin;
  }

  function isNewWindowTarget(target) {
    const t = String(target || '').trim().toLowerCase();
    return t !== '' && t !== '_self' && t !== '_parent' && t !== '_top';
  }

  // 1. Полная блокировка window.open (попапы и попандеры)
  const blockedWindowOpen = function () {
    return null;
  };
  try {
    Object.defineProperty(window, 'open', {
      configurable: true,
      writable: true,
      value: blockedWindowOpen,
    });
  } catch {
    try {
      window.open = blockedWindowOpen;
    } catch {
      // Игнорируем, если страница запретила переопределение
    }
  }

  // Блокируем спам-уведомления
  try {
    if (typeof window.Notification !== 'undefined') {
      Object.defineProperty(window.Notification, 'requestPermission', {
        configurable: true,
        writable: true,
        value: () => Promise.resolve('denied'),
      });
    }
  } catch {
    // Игнорируем
  }

  // 2. Блокируем программные клики по скрытым/внешним <a target="_blank"> и рекламным ссылкам
  try {
    const origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (...args) {
      const href = this.getAttribute('href') || this.href || '';
      const target = this.getAttribute('target') || this.target || '';
      if (isBlockedAdUrl(href) || (isNewWindowTarget(target) && isExternalOrigin(href))) {
        return;
      }
      return origAnchorClick.apply(this, args);
    };
  } catch {
    // Игнорируем
  }

  // 3. Блокируем скрытые формы-попандеры <form target="_blank">
  try {
    const origFormSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function (...args) {
      const action = this.getAttribute('action') || this.action || '';
      const target = this.getAttribute('target') || this.target || '';
      if (isBlockedAdUrl(action) || (isNewWindowTarget(target) && isExternalOrigin(action))) {
        return;
      }
      return origFormSubmit.apply(this, args);
    };
  } catch {
    // Игнорируем
  }

  // 4. Перехват fetch() и XMLHttpRequest для VAST/pre-roll видеорекламы и рекламных сетей
  try {
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function (input, init) {
        const reqUrl =
          typeof input === 'string'
            ? input
            : input && typeof input === 'object' && 'url' in input
              ? input.url
              : '';
        if (isBlockedAdUrl(reqUrl)) {
          if (isVastLikeUrl(reqUrl)) {
            return Promise.resolve(
              new Response(EMPTY_VAST_XML, {
                status: 200,
                headers: { 'Content-Type': 'application/xml; charset=utf-8' },
              }),
            );
          }
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return origFetch.call(this, input, init);
      };
    }
  } catch {
    // Игнорируем
  }

  try {
    const origXhrOpen = XMLHttpRequest.prototype.open;
    const origXhrSend = XMLHttpRequest.prototype.send;
    const origXhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    const origXhrOverrideMime = XMLHttpRequest.prototype.overrideMimeType;
    const origXhrAbort = XMLHttpRequest.prototype.abort;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      const urlStr = typeof url === 'string' ? url : String(url || '');
      this.__cinescopeBlockedUrl = isBlockedAdUrl(urlStr) ? urlStr : null;
      if (this.__cinescopeBlockedUrl) {
        return;
      }
      return origXhrOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      if (this.__cinescopeBlockedUrl) {
        return;
      }
      return origXhrSetHeader.call(this, name, value);
    };
    if (typeof origXhrOverrideMime === 'function') {
      XMLHttpRequest.prototype.overrideMimeType = function (mime) {
        if (this.__cinescopeBlockedUrl) {
          return;
        }
        return origXhrOverrideMime.call(this, mime);
      };
    }
    if (typeof origXhrAbort === 'function') {
      XMLHttpRequest.prototype.abort = function () {
        if (this.__cinescopeBlockedUrl) {
          return;
        }
        return origXhrAbort.call(this);
      };
    }
    XMLHttpRequest.prototype.send = function (...args) {
      if (this.__cinescopeBlockedUrl) {
        const blockedUrl = this.__cinescopeBlockedUrl;
        const isVast = isVastLikeUrl(blockedUrl);
        const body = isVast ? EMPTY_VAST_XML : '';
        try {
          Object.defineProperty(this, 'readyState', { configurable: true, value: 4 });
          Object.defineProperty(this, 'status', { configurable: true, value: 200 });
          Object.defineProperty(this, 'statusText', { configurable: true, value: 'OK' });
          Object.defineProperty(this, 'responseURL', { configurable: true, value: blockedUrl });
          Object.defineProperty(this, 'responseText', { configurable: true, value: body });
          Object.defineProperty(this, 'response', { configurable: true, value: body });
          if (isVast && typeof DOMParser !== 'undefined') {
            const xmlDoc = new DOMParser().parseFromString(body, 'application/xml');
            Object.defineProperty(this, 'responseXML', { configurable: true, value: xmlDoc });
          }
        } catch {
          // Игнорируем
        }
        setTimeout(() => {
          try {
            if (typeof this.dispatchEvent === 'function') {
              const readyEvt = typeof Event === 'function' ? new Event('readystatechange') : { type: 'readystatechange' };
              const loadEvt =
                typeof ProgressEvent === 'function'
                  ? new ProgressEvent('load')
                  : typeof Event === 'function'
                    ? new Event('load')
                    : { type: 'load' };
              const loadEndEvt =
                typeof ProgressEvent === 'function'
                  ? new ProgressEvent('loadend')
                  : typeof Event === 'function'
                    ? new Event('loadend')
                    : { type: 'loadend' };
              this.dispatchEvent(readyEvt);
              this.dispatchEvent(loadEvt);
              this.dispatchEvent(loadEndEvt);
            } else {
              if (typeof this.onreadystatechange === 'function') {
                this.onreadystatechange({ type: 'readystatechange' });
              }
              if (typeof this.onload === 'function') {
                this.onload({ type: 'load' });
              }
            }
          } catch {
            // Игнорируем
          }
        }, 0);
        return;
      }
      return origXhrSend.apply(this, args);
    };
  } catch {
    // Игнорируем
  }

  // 5. Нейтрализация рекламных <script> и <iframe> при вставке в DOM
  function shouldNeutralizeNode(node) {
    if (!(node instanceof Element)) return false;
    const tag = node.tagName;
    if (tag === 'SCRIPT' || tag === 'IFRAME') {
      const src = node.getAttribute('src') || '';
      if (isBlockedAdUrl(src)) {
        return true;
      }
    }
    return false;
  }

  function notifyBlockedScriptError(node) {
    if (!(node instanceof Element) || node.tagName !== 'SCRIPT') return;
    setTimeout(() => {
      try {
        if (typeof node.dispatchEvent === 'function') {
          const errEvt = typeof Event === 'function' ? new Event('error') : { type: 'error' };
          node.dispatchEvent(errEvt);
        } else if (typeof node.onerror === 'function') {
          node.onerror({ type: 'error' });
        }
      } catch {
        // Игнорируем
      }
    }, 0);
  }

  function hardenSameOriginIframe(node) {
    if (!(node instanceof Element) || node.tagName !== 'IFRAME') return;
    try {
      const win = node.contentWindow;
      if (win && win !== window) {
        Object.defineProperty(win, 'open', {
          configurable: true,
          writable: true,
          value: blockedWindowOpen,
        });
      }
    } catch {
      // Cross-origin iframe — защищён собственным скриптом в all_frames
    }
  }

  try {
    const origAppendChild = Node.prototype.appendChild;
    Node.prototype.appendChild = function (child) {
      if (shouldNeutralizeNode(child)) {
        notifyBlockedScriptError(child);
        return child;
      }
      const result = origAppendChild.call(this, child);
      hardenSameOriginIframe(child);
      return result;
    };
    const origInsertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function (child, ref) {
      if (shouldNeutralizeNode(child)) {
        notifyBlockedScriptError(child);
        return child;
      }
      const result = origInsertBefore.call(this, child, ref);
      hardenSameOriginIframe(child);
      return result;
    };
  } catch {
    // Игнорируем
  }

  // 6. Перехват кликов по рекламным ссылкам, внешним _blank и прозрачным click-hijack оверлеям
  function isClickHijackOverlay(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (
      el.tagName === 'VIDEO' ||
      el.tagName === 'AUDIO' ||
      el.tagName === 'CANVAS' ||
      el.tagName === 'BUTTON'
    ) {
      return false;
    }
    if (el.querySelector('video, audio, iframe, button, input, select, textarea, svg, canvas')) {
      return false;
    }

    const style = window.getComputedStyle(el);
    const pos = style.position;
    if (pos !== 'fixed' && pos !== 'absolute') return false;

    const zIndex = Number.parseInt(style.zIndex || '0', 10);
    if (!Number.isFinite(zIndex) || zIndex < 9999) return false;

    const rect = el.getBoundingClientRect();
    const coversLargeArea =
      rect.width >= window.innerWidth * 0.55 &&
      rect.height >= window.innerHeight * 0.45;
    if (!coversLargeArea) return false;

    const text = (el.textContent || '').trim();
    const isTransparent =
      style.opacity === '0' ||
      style.backgroundColor === 'rgba(0, 0, 0, 0)' ||
      style.backgroundColor === 'transparent';

    return isTransparent && text.length === 0;
  }

  function handlePointerOrClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest('a[href]');
    if (anchor) {
      const href = anchor.getAttribute('href') || '';
      const linkTarget = anchor.getAttribute('target') || '';
      if (isBlockedAdUrl(href) || (isNewWindowTarget(linkTarget) && isExternalOrigin(href))) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }

    if (isClickHijackOverlay(target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        target.remove();
      } catch {
        target.style.display = 'none';
      }
    }
  }

  document.addEventListener('click', handlePointerOrClick, true);
  document.addEventListener('auxclick', handlePointerOrClick, true);
  document.addEventListener('mousedown', handlePointerOrClick, true);

  // 7. Косметическая очистка баннеров, тизеров, брендинга и рекламных iframe
  const COSMETIC_CSS = `
    ins.adsbygoogle,
    [id^="yandex_rtb"],
    [id*="adfox_"],
    [id^="adfox_"],
    [class*="mgid"],
    [id*="mgid"],
    [class*="teaser-block"],
    [class*="teasers-block"],
    [class*="branding-link"],
    a[class*="branding"],
    [id*="branding-overlay"],
    [data-ad-slot],
    [data-ad-client],
    iframe[src*="doubleclick.net"],
    iframe[src*="googlesyndication.com"],
    iframe[src*="adfox.ru"],
    iframe[src*="an.yandex.ru"],
    iframe[src*="mgid.com"],
    iframe[src*="adskeeper.com"],
    iframe[src*="exoclick.com"],
    iframe[src*="popads.net"],
    iframe[src*="clickadu.com"],
    iframe[src*="propellerads.com"],
    iframe[src*="adsterra.com"],
    iframe[src*="vidoomy.com"],
    iframe[src*="videoroll.net"],
    iframe[src*="betweendigital.com"],
    iframe[src*="adriver.ru"],
    iframe[src*="kadam.net"],
    iframe[src*="teasernet.com"],
    a[href*="t.me/"],
    a[href*="telegram.me/"],
    a[href*="telegram.dog/"],
    a[href^="tg://"],
    [class*="tg-widget"],
    [id*="tg-widget"],
    [class*="telegram-widget"],
    [id*="telegram-widget"],
    [class*="tg_button"],
    [id*="tg_button"],
    [class*="tg-banner"],
    [id*="tg-banner"] {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
      width: 0 !important;
      height: 0 !important;
      opacity: 0 !important;
    }
  `;

  const TELEGRAM_HREF_RE = /(^tg:\/\/|\/\/(www\.)?(t\.me|telegram\.me|telegram\.dog)\/)/i;
  const SERVER_SWITCHER_RE = /^\s*[1-9]\s*:/;

  function isServerSwitcherElement(el) {
    if (!(el instanceof Element)) return false;
    const text = (el.textContent || '').trim();
    if (SERVER_SWITCHER_RE.test(text) && text.length <= 24) return true;
    if (typeof el.querySelectorAll !== 'function') return false;
    const items = el.querySelectorAll('a, button, li, div, span');
    let numberedCount = 0;
    for (let i = 0; i < items.length; i++) {
      const t = (items[i].textContent || '').trim();
      if (SERVER_SWITCHER_RE.test(t) && t.length <= 24) {
        numberedCount += 1;
        if (numberedCount >= 2) return true;
      }
    }
    return false;
  }

  function isSmallFloatingWidget(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el === document.body || el === document.documentElement) return false;
    if (typeof el.querySelector === 'function' && el.querySelector('video, audio, iframe')) {
      return false;
    }
    if (isServerSwitcherElement(el)) return false;
    const style = window.getComputedStyle(el);
    if (style.position !== 'fixed' && style.position !== 'absolute') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.width <= 320 && rect.height > 0 && rect.height <= 260;
  }

  function hideElementSafely(el) {
    if (!(el instanceof HTMLElement)) return;
    if (el.style && typeof el.style.setProperty === 'function') {
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      el.style.setProperty('opacity', '0', 'important');
    } else if (el.style) {
      el.style.display = 'none';
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
      el.style.opacity = '0';
    }
  }

  function hideFloatingTelegramWidgets() {
    const tgLinks = document.querySelectorAll(
      'a[href*="t.me/"], a[href*="telegram.me/"], a[href*="telegram.dog/"], a[href^="tg://"]'
    );
    for (let i = 0; i < tgLinks.length; i++) {
      const link = tgLinks[i];
      const href = link.getAttribute('href') || '';
      if (!TELEGRAM_HREF_RE.test(href)) continue;
      if (isServerSwitcherElement(link)) continue;

      let targetToHide = link;
      let parent = link.parentElement;
      for (let depth = 0; depth < 2 && parent; depth++) {
        if (isSmallFloatingWidget(parent)) {
          targetToHide = parent;
        }
        parent = parent.parentElement;
      }
      hideElementSafely(targetToHide);
    }
  }

  function injectCosmeticCss() {
    if (document.getElementById('__cinescope_adblock_css')) return;
    const root = document.head || document.documentElement;
    if (!root) return;
    const style = document.createElement('style');
    style.id = '__cinescope_adblock_css';
    style.textContent = COSMETIC_CSS;
    root.appendChild(style);
  }

  let sweepScheduled = false;
  function sweepAdElements() {
    sweepScheduled = false;
    injectCosmeticCss();

    const iframes = document.querySelectorAll('iframe[src]');
    for (let i = 0; i < iframes.length; i++) {
      const iframe = iframes[i];
      const src = iframe.getAttribute('src') || '';
      if (isBlockedAdUrl(src)) {
        iframe.remove();
      }
    }

    const links = document.querySelectorAll('a[href][target="_blank"]');
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const href = link.getAttribute('href') || '';
      if (isBlockedAdUrl(href)) {
        link.remove();
      }
    }

    hideFloatingTelegramWidgets();
  }

  function scheduleSweep() {
    if (sweepScheduled) return;
    sweepScheduled = true;
    window.requestAnimationFrame(sweepAdElements);
  }

  injectCosmeticCss();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleSweep, { once: true });
  } else {
    scheduleSweep();
  }

  try {
    const observer = new MutationObserver(scheduleSweep);
    const startObserver = () => {
      if (!document.documentElement) return;
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    };
    if (document.documentElement) {
      startObserver();
    } else {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    }
  } catch {
    // Игнорируем
  }
})();
"###;

    template.replace("__DOMAINS_JSON__", &domains_json)
}

/// Известные официальные ID расширений-блокировщиков рекламы в Chrome Web Store и Edge Add-ons.
#[cfg(any(target_os = "macos", target_os = "windows"))]
const KNOWN_CHROMIUM_ADBLOCK_EXT_IDS: &[&str] = &[
    // uBlock Origin (Chrome / Edge)
    "cjpalhdlnbpafiamejdnhcphjbkeiagm",
    "odfafepnkmbhccpbejgmiehpchacaeak",
    // uBlock Origin Lite (Chrome / Edge)
    "ddkjiahejlhfcafbddmgiahcphecmpfh",
    "cimighlppcgcoapaliogpjjdehbnofhn",
    // AdGuard AdBlocker & MV3 (Chrome / Edge)
    "bgnkhhnnamicmpeenaelnjfhikgbkllg",
    "pdffkfellgipmhklpdmokmckkkfcopbh",
    "apjcbfpjihpedihablmalmbbhjpklbdf",
    // AdBlock Plus (Chrome / Edge)
    "cfhdojbkjhnklbpkdaibdccddilifddb",
    "gmgoamodcdcjnbaobigkjelfplakmdhh",
    // AdBlock (Chrome / Edge)
    "gighmmpiobklfepjocnamgkkbiglidom",
    "ndcileolkflehcjpmjnfbnaibdcgglog",
    // Ghostery
    "mlomiejdfkolichcflejclcbmpeaniij",
];

#[cfg(target_os = "macos")]
fn default_chromium_user_data_dir(browser_kind: &str) -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let base = PathBuf::from(home).join("Library/Application Support");
    match browser_kind {
        "chrome" => Some(base.join("Google/Chrome")),
        "edge" => Some(base.join("Microsoft Edge")),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn default_chromium_user_data_dir(browser_kind: &str) -> Option<PathBuf> {
    let local_app_data = std::env::var("LOCALAPPDATA").ok()?;
    let base = PathBuf::from(local_app_data);
    match browser_kind {
        "chrome" => Some(base.join(r"Google\Chrome\User Data")),
        "edge" => Some(base.join(r"Microsoft\Edge\User Data")),
        _ => None,
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn profile_has_installed_adblocker(user_data_dir: &Path, profile_name: &str) -> bool {
    let extensions_dir = user_data_dir.join(profile_name).join("Extensions");
    if !extensions_dir.is_dir() {
        return false;
    }

    KNOWN_CHROMIUM_ADBLOCK_EXT_IDS.iter().any(|ext_id| {
        let ext_path = extensions_dir.join(ext_id);
        if !ext_path.is_dir() {
            return false;
        }
        fs::read_dir(&ext_path)
            .ok()
            .map(|mut entries| entries.any(|entry| entry.ok().map(|e| e.path().is_dir()).unwrap_or(false)))
            .unwrap_or(false)
    })
}

/// Проверяет (только чтение), установлен ли в стандартном профиле Chrome/Edge пользователя
/// популярный блокировщик рекламы (uBlock Origin, AdGuard, AdBlock и т.д.).
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn detect_chromium_profile_with_adblocker(browser_kind: &str) -> Option<String> {
    let user_data_dir = default_chromium_user_data_dir(browser_kind)?;
    if !user_data_dir.is_dir() {
        return None;
    }

    let mut candidate_profiles: Vec<String> = Vec::new();

    // Сначала проверяем последний активный профиль из Local State
    if let Ok(raw_local_state) = fs::read_to_string(user_data_dir.join("Local State")) {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw_local_state) {
            if let Some(last_used) = parsed
                .get("profile")
                .and_then(|p| p.get("last_used"))
                .and_then(|v| v.as_str())
            {
                let trimmed = last_used.trim();
                if !trimmed.is_empty() {
                    candidate_profiles.push(trimmed.to_string());
                }
            }
        }
    }

    for fallback in [
        "Default",
        "Profile 1",
        "Profile 2",
        "Profile 3",
        "Profile 4",
        "Profile 5",
    ] {
        if !candidate_profiles.iter().any(|p| p == fallback) {
            candidate_profiles.push(fallback.to_string());
        }
    }

    candidate_profiles
        .into_iter()
        .find(|profile_name| profile_has_installed_adblocker(&user_data_dir, profile_name))
}

/// Подготавливает чистые настройки изолированного профиля Chrome/Edge без предупреждающих флагов:
/// 1. Записывает `Default/Preferences` (запрет всплывающих окон, уведомлений, навязчивой рекламы, автозагрузок).
/// 2. Удаляет устаревший каталог `cinescope-adblock-ext`, если он остался от предыдущих версий.
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn prepare_chromium_clean_preferences(profile_dir: &Path) -> Result<(), String> {
    let default_dir = profile_dir.join("Default");
    fs::create_dir_all(&default_dir)
        .map_err(|err| format!("Не удалось подготовить каталог Preferences: {}", err))?;

    let prefs_path = default_dir.join("Preferences");
    let mut prefs_value: serde_json::Value = fs::read_to_string(&prefs_path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .filter(|val: &serde_json::Value| val.is_object())
        .unwrap_or_else(|| serde_json::json!({}));

    if let Some(root) = prefs_value.as_object_mut() {
        let profile_entry = root
            .entry("profile")
            .or_insert_with(|| serde_json::json!({}));
        if !profile_entry.is_object() {
            *profile_entry = serde_json::json!({});
        }
        if let Some(profile_obj) = profile_entry.as_object_mut() {
            let defaults_entry = profile_obj
                .entry("default_content_setting_values")
                .or_insert_with(|| serde_json::json!({}));
            if !defaults_entry.is_object() {
                *defaults_entry = serde_json::json!({});
            }
            if let Some(defaults_obj) = defaults_entry.as_object_mut() {
                // 2 = BLOCK в Chromium ContentSetting, 1 = ALLOW
                defaults_obj.insert("popups".to_string(), serde_json::json!(2));
                defaults_obj.insert("notifications".to_string(), serde_json::json!(2));
                defaults_obj.insert("ads".to_string(), serde_json::json!(2));
                defaults_obj.insert("automatic_downloads".to_string(), serde_json::json!(2));
                defaults_obj.insert("sound".to_string(), serde_json::json!(1));
            }
        }
    }

    if let Ok(serialized) = serde_json::to_string_pretty(&prefs_value) {
        let _ = fs::write(&prefs_path, serialized);
    }

    // Очищаем устаревший каталог локального MV3-расширения от предыдущей версии
    let _ = fs::remove_dir_all(profile_dir.join("cinescope-adblock-ext"));

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_known_ad_hosts_and_allows_player_hosts() {
        assert!(is_blocked_ad_host("doubleclick.net"));
        assert!(is_blocked_ad_host("pubads.g.doubleclick.net"));
        assert!(is_blocked_ad_host("an.yandex.ru"));
        assert!(is_blocked_ad_host("cdn.popads.net"));
        assert!(is_blocked_ad_host("vast.videoroll.net"));

        assert!(!is_blocked_ad_host("kinokino.vip"));
        assert!(!is_blocked_ad_host("api.themoviedb.org"));
        assert!(!is_blocked_ad_host("cdn.example-video.net"));
    }

    #[test]
    fn never_blocks_media_streams() {
        assert!(is_media_stream_url("https://cdn.stream.net/video/master.m3u8?token=123"));
        assert!(is_media_stream_url("https://cdn.stream.net/seg-001.ts"));
        assert!(!is_media_stream_url("https://pubads.g.doubleclick.net/gampad/ads"));
    }

    #[test]
    fn navigation_filter_blocks_ad_redirects_and_allows_movie_pages() {
        let movie = Url::parse("https://kinokino.vip/film/435/").unwrap();
        let ad = Url::parse("https://go.popads.net/click?id=1").unwrap();
        let popunder = Url::parse("https://example.org/popunder.js").unwrap();

        assert!(!is_blocked_navigation_url(&movie));
        assert!(is_blocked_navigation_url(&ad));
        assert!(is_blocked_navigation_url(&popunder));
    }
}
