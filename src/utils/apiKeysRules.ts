export const API_KEYS_STORAGE_KEY = 'cinescope_api_keys_v1';
export const DEMO_MODE_STORAGE_KEY = 'cinescope_demo_mode';

export const PLACEHOLDER_TMDB_KEY = 'MY_TMDB_API_KEY';
export const PLACEHOLDER_KINOPOISK_KEY = 'MY_KINOPOISK_API_KEY';

export interface StoredApiKeys {
  tmdbApiKey: string;
  kinopoiskApiKey: string;
}

export type ApiKeySource = 'user' | 'env' | 'none';

export interface ResolvedApiKey {
  value: string;
  source: ApiKeySource;
}

export interface AppModeState {
  hasApiKey: boolean;
  isDemoMode: boolean;
  needsSetup: boolean;
}

export function createEmptyApiKeys(): StoredApiKeys {
  return {
    tmdbApiKey: '',
    kinopoiskApiKey: '',
  };
}

export function sanitizeApiKey(raw: unknown, placeholder?: string): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (placeholder && trimmed === placeholder) return '';
  return trimmed;
}

export function hasInternalWhitespace(value: string): boolean {
  return /\s/.test(value.trim());
}

export function parseStoredApiKeys(raw: string | null): StoredApiKeys {
  if (!raw) return createEmptyApiKeys();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return createEmptyApiKeys();
    }
    const record = parsed as Record<string, unknown>;
    return {
      tmdbApiKey: sanitizeApiKey(record.tmdbApiKey, PLACEHOLDER_TMDB_KEY),
      kinopoiskApiKey: sanitizeApiKey(
        record.kinopoiskApiKey,
        PLACEHOLDER_KINOPOISK_KEY,
      ),
    };
  } catch {
    return createEmptyApiKeys();
  }
}

export function serializeStoredApiKeys(keys: StoredApiKeys): string {
  return JSON.stringify({
    tmdbApiKey: sanitizeApiKey(keys.tmdbApiKey, PLACEHOLDER_TMDB_KEY),
    kinopoiskApiKey: sanitizeApiKey(
      keys.kinopoiskApiKey,
      PLACEHOLDER_KINOPOISK_KEY,
    ),
  });
}

/**
 * Приоритет ключей:
 * 1. Пользовательский ключ из локального хранилища устройства (BYOK)
 * 2. Фоллбэк на переменную окружения (только для локальной разработки; в релизной сборке пуста)
 * 3. Ключ не задан
 */
export function resolveEffectiveKey(
  userKey: unknown,
  envFallback: unknown,
  placeholder: string,
): ResolvedApiKey {
  const cleanUser = sanitizeApiKey(userKey, placeholder);
  if (cleanUser) {
    return { value: cleanUser, source: 'user' };
  }

  const cleanEnv = sanitizeApiKey(envFallback, placeholder);
  if (cleanEnv) {
    return { value: cleanEnv, source: 'env' };
  }

  return { value: '', source: 'none' };
}

export function resolveAppModeState(params: {
  effectiveTmdbKey: string;
  demoChosen: boolean;
}): AppModeState {
  const hasApiKey = params.effectiveTmdbKey.trim().length > 0;
  return {
    hasApiKey,
    isDemoMode: !hasApiKey && params.demoChosen,
    needsSetup: !hasApiKey && !params.demoChosen,
  };
}
