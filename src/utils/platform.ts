import { isTauri } from '@tauri-apps/api/core';

export type DesktopPlatform = 'windows' | 'macos' | 'linux' | 'web';

export function isTauriRuntime(): boolean {
  try {
    return typeof window !== 'undefined' && isTauri();
  } catch {
    return false;
  }
}

export function detectPlatformFromStrings(
  platformStr: string,
  userAgentStr: string,
): Exclude<DesktopPlatform, 'web'> {
  const combined = `${platformStr} ${userAgentStr}`.toLowerCase();
  if (combined.includes('win')) {
    return 'windows';
  }
  if (combined.includes('mac') || combined.includes('darwin')) {
    return 'macos';
  }
  return 'linux';
}

export function normalizeDesktopPlatform(
  value: unknown,
  fallback: DesktopPlatform = 'web',
): DesktopPlatform {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (
      trimmed === 'windows' ||
      trimmed === 'macos' ||
      trimmed === 'linux' ||
      trimmed === 'web'
    ) {
      return trimmed;
    }
  }
  return fallback;
}

export function detectClientPlatform(): DesktopPlatform {
  if (typeof navigator === 'undefined') {
    return 'web';
  }
  if (!isTauriRuntime()) {
    return 'web';
  }

  const navWithUaData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platformStr =
    navWithUaData.userAgentData?.platform ?? navigator.platform ?? '';
  const userAgentStr = navigator.userAgent ?? '';

  return detectPlatformFromStrings(platformStr, userAgentStr);
}

export function isIOSSafariUserAgent(
  userAgent: string,
  maxTouchPoints = 0,
): boolean {
  const ua = userAgent.toLowerCase();
  const isIOSDevice =
    /iphone|ipad|ipod/.test(ua) ||
    (ua.includes('macintosh') && maxTouchPoints > 1);
  if (!isIOSDevice) return false;

  const isWebKit = ua.includes('webkit') && ua.includes('safari');
  const isOtherIOSBrowser = /crios|fxios|edgios|opios|yabrowser|duckduckgo/.test(
    ua,
  );
  return isWebKit && !isOtherIOSBrowser;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

export function isAndroidUserAgent(userAgent: string): boolean {
  return /\bandroid\b/i.test(userAgent);
}

export function isAndroidTvUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  if (!ua) return false;
  return (
    ua.includes('sberbox') ||
    ua.includes('salutetv') ||
    ua.includes('salute tv') ||
    ua.includes('staros') ||
    ua.includes('android tv') ||
    ua.includes('googletv') ||
    ua.includes('smarttv') ||
    ua.includes('smart-tv') ||
    ua.includes('aftb') ||
    ua.includes('aftm') ||
    ua.includes('aftt') ||
    ua.includes('afts') ||
    ua.includes('mibox') ||
    ua.includes('bravia') ||
    ua.includes('shield android tv') ||
    (ua.includes('android') && /\btv\b/.test(ua))
  );
}

export function isAndroidTauri(): boolean {
  if (!isTauriRuntime()) return false;
  if (typeof navigator === 'undefined') return false;
  return isAndroidUserAgent(navigator.userAgent ?? '');
}

export function isTvMode(): boolean {
  const env = (
    import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }
  ).env;
  if (env?.VITE_TV_MODE === 'true') {
    return true;
  }
  if (typeof navigator !== 'undefined') {
    return isAndroidTvUserAgent(navigator.userAgent ?? '');
  }
  return false;
}

export function isDesktopTauriRuntime(): boolean {
  return isTauriRuntime() && !isAndroidTauri() && !isTvMode();
}

export function getRouterMode(isTauriEnv: boolean): 'hash' | 'browser' {
  return isTauriEnv ? 'hash' : 'browser';
}

function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function openExternalUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed || !isSafeHttpUrl(trimmed)) return;

  if (isTauriRuntime()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(trimmed);
    return;
  }

  // В iOS standalone PWA открытие внешней ссылки с target="_blank" и rel="noopener noreferrer"
  // открывает встроенный системный просмотр Safari (SFSafariViewController) без потери состояния PWA.
  const popup = window.open(trimmed, '_blank', 'noopener,noreferrer');
  if (!popup && typeof document !== 'undefined') {
    const anchor = document.createElement('a');
    anchor.href = trimmed;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }
}
