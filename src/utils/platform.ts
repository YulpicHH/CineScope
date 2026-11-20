import { isTauri } from '@tauri-apps/api/core';

export function isTauriRuntime(): boolean {
  try {
    return typeof window !== 'undefined' && isTauri();
  } catch {
    return false;
  }
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
