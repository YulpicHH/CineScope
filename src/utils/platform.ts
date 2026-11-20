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

export function getRouterMode(isTauriEnv: boolean): 'hash' | 'browser' {
  return isTauriEnv ? 'hash' : 'browser';
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;

  if (isTauriRuntime()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
