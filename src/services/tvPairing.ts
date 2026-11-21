import QRCode from 'qrcode';
import { hasInternalWhitespace } from '../utils/apiKeysRules';
import { isTauriRuntime } from '../utils/platform';

export const TV_PAIRING_EVENT = 'tv-pairing-keys';

export interface TvPairingPayload {
  tmdbApiKey: string;
  kinopoiskApiKey: string;
}

export interface TvPairingSessionInfo {
  sessionId: number;
  url: string;
  shortUrl: string;
  ip: string;
  port: number;
  expiresInSecs: number;
}

export interface TvPairingPollResult {
  active: boolean;
  expired: boolean;
  remainingSecs: number;
  payload: TvPairingPayload | null;
}

export interface QrSvgModel {
  size: number;
  viewBoxSize: number;
  quietZone: number;
  pathData: string;
}

/**
 * Генерирует компактный SVG-путь QR-кода локально (без сетевых запросов и без dangerouslySetInnerHTML).
 */
export function buildQrSvgModel(value: string, quietZone = 2): QrSvgModel {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const commands: string[] = [];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (qr.modules.get(row, col)) {
        const x = col + quietZone;
        const y = row + quietZone;
        commands.push(`M${x} ${y}h1v1h-1z`);
      }
    }
  }

  return {
    size,
    quietZone,
    viewBoxSize: size + quietZone * 2,
    pathData: commands.join(''),
  };
}

/**
 * Очищает и проверяет ключи, полученные с телефона по локальной сети.
 */
export function normalizePairingPayload(
  raw: Partial<TvPairingPayload> | null | undefined,
): { ok: true; payload: TvPairingPayload } | { ok: false; message: string } {
  const tmdbApiKey = (raw?.tmdbApiKey ?? '').trim();
  const kinopoiskApiKey = (raw?.kinopoiskApiKey ?? '').trim();

  if (!tmdbApiKey && !kinopoiskApiKey) {
    return {
      ok: false,
      message: 'С телефона пришли пустые поля. Введите хотя бы один API-ключ.',
    };
  }

  if (tmdbApiKey && hasInternalWhitespace(tmdbApiKey)) {
    return {
      ok: false,
      message: 'Полученный ключ TMDB содержит пробелы или переносы строк.',
    };
  }

  if (kinopoiskApiKey && hasInternalWhitespace(kinopoiskApiKey)) {
    return {
      ok: false,
      message: 'Полученный ключ Kinopoisk содержит пробелы или переносы строк.',
    };
  }

  return {
    ok: true,
    payload: { tmdbApiKey, kinopoiskApiKey },
  };
}

export function mergeReceivedPairingKeys(
  received: TvPairingPayload,
  current: { tmdbApiKey: string; kinopoiskApiKey: string },
): TvPairingPayload {
  return {
    tmdbApiKey: received.tmdbApiKey || current.tmdbApiKey.trim(),
    kinopoiskApiKey: received.kinopoiskApiKey || current.kinopoiskApiKey.trim(),
  };
}

export async function startTvPairingServer(): Promise<TvPairingSessionInfo> {
  if (!isTauriRuntime()) {
    throw new Error('UNAVAILABLE_IN_WEB');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<TvPairingSessionInfo>('start_tv_pairing_server');
}

export async function stopTvPairingServer(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('stop_tv_pairing_server');
  } catch {
    // Игнорируем ошибки остановки, если сервер уже остановлен
  }
}

export async function pollTvPairingResult(
  sessionId?: number,
): Promise<TvPairingPollResult | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<TvPairingPollResult>('poll_tv_pairing_result', {
      sessionId: sessionId ?? null,
    });
  } catch {
    return null;
  }
}

export async function listenTvPairingKeys(
  onPayload: (payload: TvPairingPayload) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<TvPairingPayload>(TV_PAIRING_EVENT, (event) => {
      if (event.payload) {
        onPayload(event.payload);
      }
    });
    return unlisten;
  } catch {
    return () => {};
  }
}
