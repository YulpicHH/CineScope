import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyApiKeys,
  hasInternalWhitespace,
  parseStoredApiKeys,
  PLACEHOLDER_KINOPOISK_KEY,
  PLACEHOLDER_TMDB_KEY,
  resolveAppModeState,
  resolveEffectiveKey,
  sanitizeApiKey,
  serializeStoredApiKeys,
} from './apiKeysRules';

test('resolveEffectiveKey prefers user BYOK key over env fallback', () => {
  const result = resolveEffectiveKey(
    '  user_tmdb_key_123  ',
    'env_tmdb_key_456',
    PLACEHOLDER_TMDB_KEY,
  );
  assert.deepEqual(result, { value: 'user_tmdb_key_123', source: 'user' });
});

test('resolveEffectiveKey falls back to env key only when user key is absent', () => {
  const result = resolveEffectiveKey(
    '',
    '  env_tmdb_key_456  ',
    PLACEHOLDER_TMDB_KEY,
  );
  assert.deepEqual(result, { value: 'env_tmdb_key_456', source: 'env' });
});

test('resolveEffectiveKey ignores placeholder values and returns none when both missing', () => {
  assert.deepEqual(
    resolveEffectiveKey(
      PLACEHOLDER_TMDB_KEY,
      PLACEHOLDER_TMDB_KEY,
      PLACEHOLDER_TMDB_KEY,
    ),
    { value: '', source: 'none' },
  );

  assert.deepEqual(
    resolveEffectiveKey('   ', '', PLACEHOLDER_KINOPOISK_KEY),
    { value: '', source: 'none' },
  );
});

test('parseStoredApiKeys and serializeStoredApiKeys round-trip safely and reject corrupted JSON', () => {
  assert.deepEqual(parseStoredApiKeys(null), createEmptyApiKeys());
  assert.deepEqual(parseStoredApiKeys('{invalid-json'), createEmptyApiKeys());
  assert.deepEqual(parseStoredApiKeys('123'), createEmptyApiKeys());

  const serialized = serializeStoredApiKeys({
    tmdbApiKey: '  abc123456  ',
    kinopoiskApiKey: '  kp-uuid-999  ',
  });
  assert.deepEqual(parseStoredApiKeys(serialized), {
    tmdbApiKey: 'abc123456',
    kinopoiskApiKey: 'kp-uuid-999',
  });

  // Плейсхолдеры не сохраняются как валидные ключи
  const withPlaceholders = serializeStoredApiKeys({
    tmdbApiKey: PLACEHOLDER_TMDB_KEY,
    kinopoiskApiKey: PLACEHOLDER_KINOPOISK_KEY,
  });
  assert.deepEqual(parseStoredApiKeys(withPlaceholders), createEmptyApiKeys());
});

test('resolveAppModeState handles first-run setup, demo mode, and live key transitions', () => {
  // Первый запуск без ключа и без выбора демо -> показать настройку
  assert.deepEqual(
    resolveAppModeState({ effectiveTmdbKey: '', demoChosen: false }),
    { hasApiKey: false, isDemoMode: false, needsSetup: true },
  );

  // Пользователь выбрал демо-режим -> демо активно, окно настройки не блокирует
  assert.deepEqual(
    resolveAppModeState({ effectiveTmdbKey: '', demoChosen: true }),
    { hasApiKey: false, isDemoMode: true, needsSetup: false },
  );

  // Пользователь ввёл ключ TMDB -> мгновенный выход из демо-режима и переход в живой режим
  assert.deepEqual(
    resolveAppModeState({ effectiveTmdbKey: 'valid_key_32chars', demoChosen: true }),
    { hasApiKey: true, isDemoMode: false, needsSetup: false },
  );
});

test('sanitizeApiKey and hasInternalWhitespace catch stray spaces and non-strings', () => {
  assert.equal(sanitizeApiKey(null), '');
  assert.equal(sanitizeApiKey(42), '');
  assert.equal(sanitizeApiKey('  my_key  '), 'my_key');
  assert.equal(hasInternalWhitespace('abc 123'), true);
  assert.equal(hasInternalWhitespace('abc\n123'), true);
  assert.equal(hasInternalWhitespace('  abc123  '), false);
});
