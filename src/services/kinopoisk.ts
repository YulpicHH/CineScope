import {
  buildKinokinoUrl,
  isValidKinopoiskCacheRecord,
  type KinokinoMediaType,
  type KinopoiskCacheRecord,
} from '../utils/kinopoiskMatcher';

const KP_CLIENT_CACHE_KEY = 'cinescope_kp_cache_v1';

export interface ResolveWatchLinkParams {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle: string;
  year: string;
}

export type KinopoiskWatchResolution =
  | {
      status: 'matched';
      kinopoiskId: number;
      kinopoiskMediaType: KinokinoMediaType;
      url: string;
      cached: boolean;
    }
  | {
      status: 'not_found' | 'ambiguous';
      message: string;
    }
  | {
      status: 'error';
      message: string;
      retryable: boolean;
    };

const inFlightRequests = new Map<string, Promise<KinopoiskWatchResolution>>();

function buildClientCacheKey(mediaType: 'movie' | 'tv', tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

function isConsistentCacheEntry(
  key: string,
  record: KinopoiskCacheRecord,
): boolean {
  if (key.startsWith('movie:')) return record.media_type === 'movie';
  if (key.startsWith('tv:')) return record.media_type === 'series';
  return false;
}

function readClientCache(): Record<string, KinopoiskCacheRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KP_CLIENT_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      window.localStorage.removeItem(KP_CLIENT_CACHE_KEY);
      return {};
    }

    const sanitized: Record<string, KinopoiskCacheRecord> = {};
    let hadInvalid = false;

    for (const [key, value] of Object.entries(parsed)) {
      if (isValidKinopoiskCacheRecord(value) && isConsistentCacheEntry(key, value)) {
        sanitized[key] = value;
      } else {
        hadInvalid = true;
      }
    }

    if (hadInvalid) {
      window.localStorage.setItem(KP_CLIENT_CACHE_KEY, JSON.stringify(sanitized));
    }

    return sanitized;
  } catch {
    try {
      window.localStorage.removeItem(KP_CLIENT_CACHE_KEY);
    } catch {
      // Игнорируем ошибку доступа к localStorage
    }
    return {};
  }
}

function writeClientCacheRecord(
  cacheKey: string,
  record: KinopoiskCacheRecord,
): void {
  if (typeof window === 'undefined') return;
  try {
    const current = readClientCache();
    current[cacheKey] = record;
    window.localStorage.setItem(KP_CLIENT_CACHE_KEY, JSON.stringify(current));
  } catch {
    // Превышена квота или localStorage недоступен
  }
}

export function clearKinopoiskClientCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KP_CLIENT_CACHE_KEY);
  } catch {
    // Игнорируем ошибку доступа к localStorage
  }
}

async function fetchResolutionFromBackend(
  params: ResolveWatchLinkParams,
  cacheKey: string,
): Promise<KinopoiskWatchResolution> {
  try {
    const response = await fetch('/api/kinopoisk/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          status?: unknown;
          kinopoiskId?: unknown;
          kinopoiskMediaType?: unknown;
          url?: unknown;
          cached?: unknown;
          lastUpdated?: unknown;
          message?: unknown;
          retryable?: unknown;
        }
      | null;

    if (!data || typeof data !== 'object') {
      return {
        status: 'error',
        message: 'Сервер вернул некорректный ответ при проверке источника просмотра.',
        retryable: true,
      };
    }

    if (data.status === 'matched') {
      const kpId = typeof data.kinopoiskId === 'number' ? data.kinopoiskId : -1;
      const kpType =
        data.kinopoiskMediaType === 'movie' || data.kinopoiskMediaType === 'series'
          ? data.kinopoiskMediaType
          : null;
      const verifiedUrl = kpType ? buildKinokinoUrl(kpId, kpType) : null;

      if (!verifiedUrl || !kpType) {
        return {
          status: 'error',
          message: 'Получены некорректные данные ссылки просмотра.',
          retryable: true,
        };
      }

      const record: KinopoiskCacheRecord = {
        tmdb_id: params.tmdbId,
        kinopoisk_id: kpId,
        media_type: kpType,
        last_updated:
          typeof data.lastUpdated === 'string' && data.lastUpdated.trim()
            ? data.lastUpdated
            : new Date().toISOString().slice(0, 10),
      };
      if (isValidKinopoiskCacheRecord(record)) {
        writeClientCacheRecord(cacheKey, record);
      }

      return {
        status: 'matched',
        kinopoiskId: kpId,
        kinopoiskMediaType: kpType,
        url: verifiedUrl,
        cached: Boolean(data.cached),
      };
    }

    if (data.status === 'ambiguous' || data.status === 'not_found') {
      return {
        status: data.status,
        message:
          typeof data.message === 'string' && data.message.trim()
            ? data.message
            : 'Для этого произведения не удалось подобрать однозначный источник.',
      };
    }

    return {
      status: 'error',
      message:
        typeof data.message === 'string' && data.message.trim()
          ? data.message
          : 'Источник просмотра временно недоступен.',
      retryable: typeof data.retryable === 'boolean' ? data.retryable : response.status >= 500 || response.status === 429,
    };
  } catch {
    return {
      status: 'error',
      message: 'Нет соединения с сервером для поиска ссылки просмотра.',
      retryable: true,
    };
  }
}

export async function resolveWatchLink(
  params: ResolveWatchLinkParams,
  options?: { skipClientCache?: boolean },
): Promise<KinopoiskWatchResolution> {
  if (!Number.isInteger(params.tmdbId) || params.tmdbId <= 0) {
    return {
      status: 'error',
      message: 'Некорректный идентификатор TMDB.',
      retryable: false,
    };
  }

  const cacheKey = buildClientCacheKey(params.mediaType, params.tmdbId);

  if (!options?.skipClientCache) {
    const cache = readClientCache();
    const cachedRecord = cache[cacheKey];
    if (cachedRecord && isValidKinopoiskCacheRecord(cachedRecord)) {
      const cachedUrl = buildKinokinoUrl(
        cachedRecord.kinopoisk_id,
        cachedRecord.media_type,
      );
      if (cachedUrl) {
        return {
          status: 'matched',
          kinopoiskId: cachedRecord.kinopoisk_id,
          kinopoiskMediaType: cachedRecord.media_type,
          url: cachedUrl,
          cached: true,
        };
      }
    }
  }

  const existing = inFlightRequests.get(cacheKey);
  if (existing) {
    return existing;
  }

  const pending = fetchResolutionFromBackend(params, cacheKey).finally(() => {
    inFlightRequests.delete(cacheKey);
  });
  inFlightRequests.set(cacheKey, pending);

  return pending;
}
