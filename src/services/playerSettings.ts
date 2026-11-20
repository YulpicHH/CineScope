import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from '../utils/platform';
import {
  DEFAULT_PLAYER_MODE,
  normalizePlayerMode,
  parseStoredPlayerMode,
  serializePlayerMode,
  type PlayerModeId,
} from '../utils/playerProfile';

const PLAYER_MODE_STORAGE_KEY = 'cinescope_player_profile_v1';

export interface AvailablePlayerBrowsers {
  firefox: boolean;
  chrome: boolean;
}

export function getPlayerMode(): PlayerModeId {
  if (typeof window === 'undefined') return DEFAULT_PLAYER_MODE;
  try {
    const raw = window.localStorage.getItem(PLAYER_MODE_STORAGE_KEY);
    return parseStoredPlayerMode(raw);
  } catch {
    return DEFAULT_PLAYER_MODE;
  }
}

export function setPlayerMode(mode: PlayerModeId): PlayerModeId {
  const normalized = normalizePlayerMode(mode);
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
  if (!isTauriRuntime()) {
    return { firefox: false, chrome: false };
  }
  try {
    const result = await invoke<Partial<AvailablePlayerBrowsers>>(
      'check_player_browsers',
    );
    return {
      firefox: Boolean(result?.firefox),
      chrome: Boolean(result?.chrome),
    };
  } catch {
    return { firefox: false, chrome: false };
  }
}
