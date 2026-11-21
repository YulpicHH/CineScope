import {
  API_KEYS_STORAGE_KEY,
  createEmptyApiKeys,
  hasInternalWhitespace,
  parseStoredApiKeys,
  PLACEHOLDER_KINOPOISK_KEY,
  PLACEHOLDER_TMDB_KEY,
  resolveEffectiveKey,
  sanitizeApiKey,
  serializeStoredApiKeys,
  type ResolvedApiKey,
  type StoredApiKeys,
} from '../utils/apiKeysRules';
import { isTauriRuntime } from '../utils/platform';

const TMDB_CONFIGURATION_URL = 'https://api.themoviedb.org/3/configuration';

type KeysListener = () => void;

const listeners = new Set<KeysListener>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeApiKeys(listener: KeysListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getEnvTmdbFallback(): string {
  const env = (import.meta as { env?: Record<string, unknown> }).env;
  return sanitizeApiKey(env?.VITE_TMDB_API_KEY, PLACEHOLDER_TMDB_KEY);
}

export function getStoredApiKeys(): StoredApiKeys {
  if (typeof window === 'undefined') return createEmptyApiKeys();
  try {
    return parseStoredApiKeys(window.localStorage.getItem(API_KEYS_STORAGE_KEY));
  } catch {
    return createEmptyApiKeys();
  }
}

export function saveStoredApiKeys(next: StoredApiKeys): StoredApiKeys {
  const sanitized: StoredApiKeys = {
    tmdbApiKey: sanitizeApiKey(next.tmdbApiKey, PLACEHOLDER_TMDB_KEY),
    kinopoiskApiKey: sanitizeApiKey(
      next.kinopoiskApiKey,
      PLACEHOLDER_KINOPOISK_KEY,
    ),
  };

  if (typeof window !== 'undefined') {
    try {
      if (!sanitized.tmdbApiKey && !sanitized.kinopoiskApiKey) {
        window.localStorage.removeItem(API_KEYS_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          API_KEYS_STORAGE_KEY,
          serializeStoredApiKeys(sanitized),
        );
      }
    } catch {
      // Игнорируем ошибку доступа или квоты localStorage
    }
  }

  notifyListeners();
  return sanitized;
}

export function clearStoredApiKeys(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(API_KEYS_STORAGE_KEY);
    } catch {
      // Игнорируем ошибку доступа к localStorage
    }
  }
  notifyListeners();
}

export function getEffectiveTmdbKey(): ResolvedApiKey {
  const stored = getStoredApiKeys();
  return resolveEffectiveKey(
    stored.tmdbApiKey,
    getEnvTmdbFallback(),
    PLACEHOLDER_TMDB_KEY,
  );
}

export function getEffectiveKinopoiskKey(): ResolvedApiKey {
  const stored = getStoredApiKeys();
  return resolveEffectiveKey(
    stored.kinopoiskApiKey,
    '',
    PLACEHOLDER_KINOPOISK_KEY,
  );
}

export function getTmdbApiKeyValue(): string {
  return getEffectiveTmdbKey().value;
}

export function getKinopoiskApiKeyValue(): string {
  return getEffectiveKinopoiskKey().value;
}

export interface TmdbNativeResponse {
  ok: boolean;
  status: number;
  body: string | null;
  networkError: boolean;
  timedOut: boolean;
}

/**
 * Выполняет GET-запрос к TMDB API через встроенный Rust HTTP-клиент (rustls-tls)
 * в Tauri-приложениях (Android TV / SberBox, macOS, Windows), минуя CORS и старые
 * системные сертификаты WebView Android 9. В веб/PWA возвращает null.
 */
export async function tmdbNativeGet(
  endpoint: string,
  query: Array<[string, string]>,
  apiKey: string,
): Promise<TmdbNativeResponse | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<TmdbNativeResponse>('tmdb_api_get', {
      endpoint,
      query,
      apiKey,
    });
  } catch {
    return null;
  }
}

export type TmdbValidationFailureReason =
  | 'invalid_format'
  | 'invalid_key'
  | 'rate_limit'
  | 'network'
  | 'server';

export type TmdbValidationResult =
  | { ok: true }
  | { ok: false; reason: TmdbValidationFailureReason; message: string };

function mapTmdbValidationHttpStatus(status: number): TmdbValidationResult {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      reason: 'invalid_key',
      message:
        'Неверный ключ TMDB API (v3). Убедитесь, что вставлен именно API Key (v3 auth), а не Read Access Token.',
    };
  }

  if (status === 429) {
    return {
      ok: false,
      reason: 'rate_limit',
      message:
        'TMDB временно ограничил запросы (429). Подождите несколько секунд и попробуйте снова.',
    };
  }

  return {
    ok: false,
    reason: 'server',
    message: `TMDB вернул ошибку (${status}). Попробуйте ещё раз чуть позже.`,
  };
}

export async function validateTmdbApiKey(
  rawKey: string,
): Promise<TmdbValidationResult> {
  const trimmed = rawKey.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: 'invalid_format',
      message: 'Введите ключ TMDB API (v3).',
    };
  }

  if (hasInternalWhitespace(trimmed)) {
    return {
      ok: false,
      reason: 'invalid_format',
      message:
        'Ключ содержит пробелы или переносы строк. Проверьте, что вы скопировали его без лишних символов.',
    };
  }

  // В Tauri (Android TV / macOS / Windows) проверяем ключ через Rust rustls-tls
  const nativeResponse = await tmdbNativeGet('/configuration', [], trimmed);
  if (nativeResponse) {
    if (nativeResponse.ok) {
      return { ok: true };
    }
    if (nativeResponse.timedOut) {
      return {
        ok: false,
        reason: 'network',
        message:
          'Превышено время ожидания ответа от TMDB. Проверьте интернет-соединение или VPN.',
      };
    }
    if (nativeResponse.networkError || nativeResponse.status === 0) {
      return {
        ok: false,
        reason: 'network',
        message:
          'Не удалось связаться с TMDB. Проверьте подключение к интернету или настройки VPN.',
      };
    }
    return mapTmdbValidationHttpStatus(nativeResponse.status);
  }

  const controller = new AbortController();
  const timeoutId =
    typeof window !== 'undefined'
      ? window.setTimeout(() => controller.abort(), 8000)
      : undefined;

  try {
    const url = new URL(TMDB_CONFIGURATION_URL);
    url.searchParams.set('api_key', trimmed);

    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
    });

    if (response.ok) {
      return { ok: true };
    }

    return mapTmdbValidationHttpStatus(response.status);
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        reason: 'network',
        message:
          'Превышено время ожидания ответа от TMDB. Проверьте интернет-соединение и повторите попытку.',
      };
    }
    return {
      ok: false,
      reason: 'network',
      message:
        'Не удалось связаться с TMDB. Проверьте подключение к интернету или настройки сети.',
    };
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}
