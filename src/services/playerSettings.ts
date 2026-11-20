import { invoke } from '@tauri-apps/api/core';
import {
  detectClientPlatform,
  isTauriRuntime,
  normalizeDesktopPlatform,
  type DesktopPlatform,
} from '../utils/platform';
import {
  getDefaultPlayerMode,
  normalizePlayerMode,
  parseStoredPlayerMode,
  serializePlayerMode,
  type PlayerModeId,
} from '../utils/playerProfile';

const PLAYER_MODE_STORAGE_KEY = 'cinescope_player_profile_v1';

export interface AvailablePlayerBrowsers {
  platform: DesktopPlatform;
  firefox: boolean;
  chrome: boolean;
  edge: boolean;
}

export function hasStoredPlayerMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(PLAYER_MODE_STORAGE_KEY);
    return Boolean(raw && raw.trim());
  } catch {
    return false;
  }
}

export function getPlayerMode(platform?: DesktopPlatform): PlayerModeId {
  const resolvedPlatform = platform ?? detectClientPlatform();
  if (typeof window === 'undefined') {
    return getDefaultPlayerMode(resolvedPlatform);
  }
  try {
    const raw = window.localStorage.getItem(PLAYER_MODE_STORAGE_KEY);
    return parseStoredPlayerMode(raw, resolvedPlatform);
  } catch {
    return getDefaultPlayerMode(resolvedPlatform);
  }
}

export function setPlayerMode(
  mode: PlayerModeId,
  platform?: DesktopPlatform,
): PlayerModeId {
  const normalized = normalizePlayerMode(
    mode,
    platform ?? detectClientPlatform(),
  );
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        PLAYER_MODE_STORAGE_KEY,
        serializePlayerMode(normalized),
      );
    } catch {
      // Игнорируем ошибку квоты или недоступности localStorage
    }
  }
  return normalized;
}

export async function checkPlayerBrowsers(): Promise<AvailablePlayerBrowsers> {
  const clientPlatform = detectClientPlatform();
  if (!isTauriRuntime()) {
    return {
      platform: 'web',
      firefox: false,
      chrome: false,
      edge: false,
    };
  }
  try {
    const result = await invoke<Partial<AvailablePlayerBrowsers>>(
      'check_player_browsers',
    );
    return {
      platform: normalizeDesktopPlatform(result?.platform, clientPlatform),
      firefox: Boolean(result?.firefox),
      chrome: Boolean(result?.chrome),
      edge: Boolean(result?.edge),
    };
  } catch {
    return {
      platform: clientPlatform,
      firefox: false,
      chrome: false,
      edge: false,
    };
  }
}
