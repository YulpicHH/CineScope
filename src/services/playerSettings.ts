import {
  DEFAULT_PLAYER_PROFILE,
  normalizePlayerProfile,
  parseStoredPlayerProfile,
  serializePlayerProfile,
  type PlayerProfileId,
} from '../utils/playerProfile';

const PLAYER_PROFILE_STORAGE_KEY = 'cinescope_player_profile_v1';

export function getPlayerProfile(): PlayerProfileId {
  if (typeof window === 'undefined') return DEFAULT_PLAYER_PROFILE;
  try {
    const raw = window.localStorage.getItem(PLAYER_PROFILE_STORAGE_KEY);
    return parseStoredPlayerProfile(raw);
  } catch {
    return DEFAULT_PLAYER_PROFILE;
  }
}

export function setPlayerProfile(profile: PlayerProfileId): PlayerProfileId {
  const normalized = normalizePlayerProfile(profile);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        PLAYER_PROFILE_STORAGE_KEY,
        serializePlayerProfile(normalized),
      );
    } catch {
      // Игнорируем ошибку квоты или недоступности localStorage
    }
  }
  return normalized;
}
