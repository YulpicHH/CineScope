import type { DesktopPlatform } from './platform';

export type PlayerModeId =
  | 'firefox_window'
  | 'chrome_window'
  | 'edge_window'
  | 'embedded_webkit';

export const DEFAULT_PLAYER_MODE: PlayerModeId = 'firefox_window';
export const WINDOWS_DEFAULT_PLAYER_MODE: PlayerModeId = 'embedded_webkit';

export interface PlayerModeOption {
  id: PlayerModeId;
  label: string;
  badge: string;
  description: string;
}

export const MACOS_PLAYER_MODE_OPTIONS: readonly PlayerModeOption[] = [
  {
    id: 'firefox_window',
    label: 'Firefox',
    badge: '4K',
    description:
      'Отдельное чистое окно Firefox без вкладок и адресной строки в изолированном профиле CineScope — поддерживает 4K (2160p) и не затрагивает ваш обычный Firefox.',
  },
  {
    id: 'chrome_window',
    label: 'Chrome',
    badge: '4K',
    description:
      'Отдельное окно Google Chrome в режиме приложения (без вкладок и адресной строки) с изолированным профилем CineScope — поддерживает 4K (2160p) и не смешивается с вашим обычным Chrome.',
  },
  {
    id: 'embedded_webkit',
    label: 'Встроенный',
    badge: 'до 1080p',
    description:
      'Открывается прямо внутри CineScope на системном движке macOS WebKit без запуска стороннего браузера (качество зависит от поддержки WebKit на сайте).',
  },
] as const;

export const WINDOWS_PLAYER_MODE_OPTIONS: readonly PlayerModeOption[] = [
  {
    id: 'embedded_webkit',
    label: 'Встроенный',
    badge: '4K',
    description:
      'Открывается прямо внутри CineScope на системном движке Windows WebView2 (Chromium) — поддерживает 4K (2160p) и аппаратное ускорение без запуска стороннего браузера.',
  },
  {
    id: 'chrome_window',
    label: 'Chrome',
    badge: '4K',
    description:
      'Отдельное окно Google Chrome в режиме приложения (без вкладок и адресной строки) с изолированным профилем CineScope — поддерживает 4K (2160p) и не смешивается с вашим обычным Chrome.',
  },
  {
    id: 'edge_window',
    label: 'Edge',
    badge: '4K',
    description:
      'Отдельное окно Microsoft Edge в режиме приложения с изолированным профилем CineScope — предустановлен в Windows 10/11 и поддерживает 4K (2160p) с аппаратным декодированием.',
  },
  {
    id: 'firefox_window',
    label: 'Firefox',
    badge: '4K',
    description:
      'Отдельное чистое окно Firefox без вкладок и адресной строки в изолированном профиле CineScope — поддерживает 4K (2160p) и не затрагивает ваш обычный Firefox.',
  },
] as const;

// Обратная совместимость со старыми импортами
export const PLAYER_MODE_OPTIONS: readonly PlayerModeOption[] =
  MACOS_PLAYER_MODE_OPTIONS;

export function getDefaultPlayerMode(
  platform?: DesktopPlatform,
): PlayerModeId {
  return platform === 'windows'
    ? WINDOWS_DEFAULT_PLAYER_MODE
    : DEFAULT_PLAYER_MODE;
}

export function getPlayerModeOptions(
  platform?: DesktopPlatform,
): readonly PlayerModeOption[] {
  return platform === 'windows'
    ? WINDOWS_PLAYER_MODE_OPTIONS
    : MACOS_PLAYER_MODE_OPTIONS;
}

export function normalizePlayerMode(
  value: unknown,
  platform?: DesktopPlatform,
): PlayerModeId {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      trimmed === 'firefox_window' ||
      trimmed === 'chrome_window' ||
      trimmed === 'edge_window' ||
      trimmed === 'embedded_webkit'
    ) {
      return trimmed;
    }
    // Миграция со старых и алиасных идентификаторов профилей
    if (trimmed === 'chrome_4k') {
      return 'chrome_window';
    }
    if (trimmed === 'edge_4k') {
      return 'edge_window';
    }
    if (trimmed === 'safari_native' || trimmed === 'embedded_webview') {
      return 'embedded_webkit';
    }
    if (trimmed === 'firefox_4k') {
      return 'firefox_window';
    }
  }
  return getDefaultPlayerMode(platform);
}

export function parseStoredPlayerMode(
  raw: string | null,
  platform?: DesktopPlatform,
): PlayerModeId {
  const fallback = getDefaultPlayerMode(platform);
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  if (
    trimmed === 'firefox_window' ||
    trimmed === 'chrome_window' ||
    trimmed === 'edge_window' ||
    trimmed === 'embedded_webkit' ||
    trimmed === 'embedded_webview' ||
    trimmed === 'safari_native' ||
    trimmed === 'firefox_4k' ||
    trimmed === 'chrome_4k' ||
    trimmed === 'edge_4k'
  ) {
    return normalizePlayerMode(trimmed, platform);
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'string') {
      return normalizePlayerMode(parsed, platform);
    }
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as { mode?: unknown; profile?: unknown };
      if ('mode' in record) {
        return normalizePlayerMode(record.mode, platform);
      }
      if ('profile' in record) {
        return normalizePlayerMode(record.profile, platform);
      }
    }
  } catch {
    // Повреждённое значение в хранилище — возвращаем режим по умолчанию
  }

  return fallback;
}

export function serializePlayerMode(mode: PlayerModeId): string {
  return JSON.stringify({ mode: normalizePlayerMode(mode) });
}

export function getPlayerModeOption(
  mode: PlayerModeId,
  platform?: DesktopPlatform,
): PlayerModeOption {
  const options = getPlayerModeOptions(platform);
  const normalized = normalizePlayerMode(mode, platform);
  return (
    options.find((option) => option.id === normalized) ??
    WINDOWS_PLAYER_MODE_OPTIONS.find((option) => option.id === normalized) ??
    options[0]
  );
}
