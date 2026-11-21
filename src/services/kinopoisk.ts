import { invoke } from '@tauri-apps/api/core';
import {
  buildKinokinoUrl,
  isValidKinopoiskCacheRecord,
  selectBestKinopoiskMatch,
  type KinokinoMediaType,
  type KinopoiskApiCandidate,
  type KinopoiskCacheRecord,
} from '../utils/kinopoiskMatcher';
import { isTauriRuntime, openExternalUrl } from '../utils/platform';
import type { PlayerModeId } from '../utils/playerProfile';
import { getKinopoiskApiKeyValue } from './apiKeys';
import { getPlayerMode } from './playerSettings';

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
      status: 'missing_key';
      message: string;
    }
  | {
      status: 'not_found' | 'ambiguous';
      message: string;
    }
  | {
      status: 'error';
      code?: string;
      message: string;
      retryable: boolean;
    };

interface TauriKinopoiskCandidatesResult {
  status: string;
  items?: KinopoiskApiCandidate[];
  code?: string | null;
  message?: string | null;
  retryable?: boolean;
}

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

async function fetchResolutionViaTauri(
  params: ResolveWatchLinkParams,
  cacheKey: string,
): Promise<KinopoiskWatchResolution> {
  const title = params.title.trim();
  const originalTitle = params.originalTitle.trim();
  const primaryKeyword = title || originalTitle;

  if (!primaryKeyword) {
    return {
      status: 'error',
      message: 'Некорректные параметры для поиска произведения.',
      retryable: false,
    };
  }

  const apiKey = getKinopoiskApiKeyValue();
  if (!apiKey) {
    return {
      status: 'missing_key',
      message:
        'Для кнопки «Смотреть» нужен ключ Kinopoisk Unofficial API. Добавьте его в настройках.',
    };
  }

  const typeParam = params.mediaType === 'movie' ? 'FILM' : 'ALL';
  const matchQuery = {
    tmdbId: params.tmdbId,
    mediaType: params.mediaType,
    title: title || originalTitle,
    originalTitle: originalTitle || title,
    year: params.year.trim(),
  };

  try {
    const firstResponse = await invoke<TauriKinopoiskCandidatesResult>(
      'fetch_kinopoisk_candidates',
      { keyword: primaryKeyword, typeParam, apiKey },
    );

    if (firstResponse.status !== 'ok') {
      if (firstResponse.code === 'NOT_CONFIGURED') {
        return {
          status: 'missing_key',
          message:
            firstResponse.message?.trim() ||
            'Для кнопки «Смотреть» нужен ключ Kinopoisk Unofficial API. Добавьте его в настройках.',
        };
      }
      return {
        status: 'error',
        code: firstResponse.code ?? undefined,
        message:
          firstResponse.message?.trim() ||
          'Источник просмотра временно недоступен.',
        retryable: Boolean(firstResponse.retryable),
      };
    }

    const firstCandidates = Array.isArray(firstResponse.items)
      ? firstResponse.items
      : [];
    let matchResult = selectBestKinopoiskMatch(matchQuery, firstCandidates);

    const shouldQueryOriginal =
      matchResult.status !== 'matched' &&
      Boolean(originalTitle) &&
      originalTitle.toLowerCase() !== primaryKeyword.toLowerCase();

    if (shouldQueryOriginal) {
      const secondaryResponse = await invoke<TauriKinopoiskCandidatesResult>(
        'fetch_kinopoisk_candidates',
        { keyword: originalTitle, typeParam, apiKey },
      );

      if (secondaryResponse.status === 'ok' && Array.isArray(secondaryResponse.items)) {
        matchResult = selectBestKinopoiskMatch(matchQuery, [
          ...firstCandidates,
          ...secondaryResponse.items,
        ]);
      }
    }

    if (matchResult.status === 'matched') {
      const verifiedUrl = buildKinokinoUrl(
        matchResult.kinopoiskId,
        matchResult.kinopoiskMediaType,
      );
      if (!verifiedUrl) {
        return {
          status: 'error',
          message: 'Не удалось сформировать корректную ссылку на просмотр.',
          retryable: true,
        };
      }

      const record: KinopoiskCacheRecord = {
        tmdb_id: params.tmdbId,
        kinopoisk_id: matchResult.kinopoiskId,
        media_type: matchResult.kinopoiskMediaType,
        last_updated: new Date().toISOString().slice(0, 10),
      };
      if (isValidKinopoiskCacheRecord(record)) {
        writeClientCacheRecord(cacheKey, record);
      }

      return {
        status: 'matched',
        kinopoiskId: matchResult.kinopoiskId,
        kinopoiskMediaType: matchResult.kinopoiskMediaType,
        url: verifiedUrl,
        cached: false,
      };
    }

    return {
      status: matchResult.status,
      message: matchResult.reason,
    };
  } catch {
    return {
      status: 'error',
      message: 'Не удалось проверить доступность просмотра.',
      retryable: true,
    };
  }
}

async function fetchResolutionFromBackend(
  params: ResolveWatchLinkParams,
  cacheKey: string,
): Promise<KinopoiskWatchResolution> {
  if (isTauriRuntime()) {
    return fetchResolutionViaTauri(params, cacheKey);
  }

  const userApiKey = getKinopoiskApiKeyValue();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (userApiKey) {
    headers['X-Kinopoisk-Api-Key'] = userApiKey;
  }

  try {
    const response = await fetch('/api/kinopoisk/resolve', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    const contentType = response.headers.get('content-type') ?? '';
    const data = (await response.json().catch(() => null)) as
      | {
          status?: unknown;
          code?: unknown;
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
      let message =
        'Сервер вернул некорректный ответ при проверке источника просмотра.';
      if (response.status >= 500) {
        message = `Ошибка сервера (${response.status}) при проверке источника просмотра. Попробуйте повторить чуть позже.`;
      } else if (contentType.toLowerCase().includes('text/html')) {
        message =
          'API поиска источника недоступно на этом сервере. Обновите страницу или проверьте деплой.';
      }
      return {
        status: 'error',
        message,
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

    if (data.code === 'NOT_CONFIGURED') {
      return {
        status: 'missing_key',
        message:
          typeof data.message === 'string' && data.message.trim()
            ? data.message
            : 'Для кнопки «Смотреть» нужен ключ Kinopoisk Unofficial API. Добавьте его в настройках.',
      };
    }

    return {
      status: 'error',
      code: typeof data.code === 'string' ? data.code : undefined,
      message:
        typeof data.message === 'string' && data.message.trim()
          ? data.message
          : 'Источник просмотра временно недоступен.',
      retryable:
        typeof data.retryable === 'boolean'
          ? data.retryable
          : response.status >= 500 || response.status === 429,
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

  const shouldRequireUserKey = isTauriRuntime() || import.meta.env.PROD;
  if (shouldRequireUserKey && !getKinopoiskApiKeyValue()) {
    return {
      status: 'missing_key',
      message:
        'Для кнопки «Смотреть» нужен ключ Kinopoisk Unofficial API. Добавьте его в настройках.',
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

export async function openWatchWindow(
  url: string,
  title: string,
  playerMode?: PlayerModeId,
): Promise<void> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return;

  if (isTauriRuntime()) {
    const resolvedMode = playerMode ?? getPlayerMode();
    await invoke('open_watch_window', {
      url: trimmedUrl,
      title: title.trim(),
      playerMode: resolvedMode,
    });
    return;
  }

  await openExternalUrl(trimmedUrl);
}
