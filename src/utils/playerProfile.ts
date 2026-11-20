export type PlayerProfileId = 'firefox_4k' | 'chrome_4k' | 'safari_native';

export const DEFAULT_PLAYER_PROFILE: PlayerProfileId = 'firefox_4k';

export interface PlayerProfileOption {
  id: PlayerProfileId;
  label: string;
  shortLabel: string;
  description: string;
}

export const PLAYER_PROFILE_OPTIONS: readonly PlayerProfileOption[] = [
  {
    id: 'firefox_4k',
    label: 'Firefox · 4K / MSE',
    shortLabel: 'Firefox (4K)',
    description:
      'Десктопный профиль Firefox с приоритетом MediaSource (hls.js) — открывает выбор 4K (2160p) в большинстве балансеров.',
  },
  {
    id: 'chrome_4k',
    label: 'Chrome · 4K / MSE',
    shortLabel: 'Chrome (4K)',
    description:
      'Десктопный профиль Chromium с приоритетом MediaSource — запасной режим для плееров, настроенных под Chrome.',
  },
  {
    id: 'safari_native',
    label: 'Safari · Нативный HEVC',
    shortLabel: 'Safari (HEVC)',
    description:
      'Полноценный десктопный Safari 18 без изменения HLS — для источников с нативным Apple HEVC-потоком.',
  },
] as const;

const VALID_PROFILE_IDS = new Set<string>(
  PLAYER_PROFILE_OPTIONS.map((option) => option.id),
);

export function normalizePlayerProfile(value: unknown): PlayerProfileId {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (VALID_PROFILE_IDS.has(trimmed)) {
      return trimmed as PlayerProfileId;
    }
  }
  return DEFAULT_PLAYER_PROFILE;
}

export function parseStoredPlayerProfile(raw: string | null): PlayerProfileId {
  if (!raw) return DEFAULT_PLAYER_PROFILE;
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_PLAYER_PROFILE;

  if (VALID_PROFILE_IDS.has(trimmed)) {
    return trimmed as PlayerProfileId;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'string') {
      return normalizePlayerProfile(parsed);
    }
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'profile' in parsed
    ) {
      return normalizePlayerProfile((parsed as { profile?: unknown }).profile);
    }
  } catch {
    // Повреждённое значение в хранилище — возвращаем профиль по умолчанию
  }

  return DEFAULT_PLAYER_PROFILE;
}

export function serializePlayerProfile(profile: PlayerProfileId): string {
  return JSON.stringify({ profile: normalizePlayerProfile(profile) });
}

export function getPlayerProfileOption(
  profile: PlayerProfileId,
): PlayerProfileOption {
  const normalized = normalizePlayerProfile(profile);
  return (
    PLAYER_PROFILE_OPTIONS.find((option) => option.id === normalized) ??
    PLAYER_PROFILE_OPTIONS[0]
  );
}
