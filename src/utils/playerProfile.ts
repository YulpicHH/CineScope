export type PlayerModeId = 'firefox_window' | 'embedded_webkit';

export const DEFAULT_PLAYER_MODE: PlayerModeId = 'firefox_window';

export interface PlayerModeOption {
  id: PlayerModeId;
  label: string;
  badge: string;
  description: string;
}

export const PLAYER_MODE_OPTIONS: readonly PlayerModeOption[] = [
  {
    id: 'firefox_window',
    label: 'Окно Firefox',
    badge: '4K',
    description:
      'Отдельное чистое окно Firefox без вкладок и адресной строки в изолированном профиле CineScope — поддерживает 4K (2160p) и не затрагивает ваш обычный Firefox.',
  },
  {
    id: 'embedded_webkit',
    label: 'Встроенное окно',
    badge: 'до 1080p',
    description:
      'Открывается прямо внутри CineScope на системном движке macOS WebKit без запуска Firefox (качество зависит от поддержки WebKit на сайте).',
  },
] as const;

export function normalizePlayerMode(value: unknown): PlayerModeId {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === 'firefox_window' || trimmed === 'embedded_webkit') {
      return trimmed;
    }
    // Миграция со старых идентификаторов профилей WebKit
    if (trimmed === 'safari_native') {
      return 'embedded_webkit';
    }
    if (trimmed === 'firefox_4k' || trimmed === 'chrome_4k') {
      return 'firefox_window';
    }
  }
  return DEFAULT_PLAYER_MODE;
}

export function parseStoredPlayerMode(raw: string | null): PlayerModeId {
  if (!raw) return DEFAULT_PLAYER_MODE;
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_PLAYER_MODE;

  if (
    trimmed === 'firefox_window' ||
    trimmed === 'embedded_webkit' ||
    trimmed === 'safari_native' ||
    trimmed === 'firefox_4k' ||
    trimmed === 'chrome_4k'
  ) {
    return normalizePlayerMode(trimmed);
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'string') {
      return normalizePlayerMode(parsed);
    }
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as { mode?: unknown; profile?: unknown };
      if ('mode' in record) {
        return normalizePlayerMode(record.mode);
      }
      if ('profile' in record) {
        return normalizePlayerMode(record.profile);
      }
    }
  } catch {
    // Повреждённое значение в хранилище — возвращаем режим по умолчанию
  }

  return DEFAULT_PLAYER_MODE;
}

export function serializePlayerMode(mode: PlayerModeId): string {
  return JSON.stringify({ mode: normalizePlayerMode(mode) });
}

export function getPlayerModeOption(mode: PlayerModeId): PlayerModeOption {
  const normalized = normalizePlayerMode(mode);
  return (
    PLAYER_MODE_OPTIONS.find((option) => option.id === normalized) ??
    PLAYER_MODE_OPTIONS[0]
  );
}
