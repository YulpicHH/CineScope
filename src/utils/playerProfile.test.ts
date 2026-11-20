import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLAYER_MODE,
  PLAYER_MODE_OPTIONS,
  getPlayerModeOption,
  normalizePlayerMode,
  parseStoredPlayerMode,
  serializePlayerMode,
} from './playerProfile';

test('normalizePlayerMode accepts valid modes, migrates legacy profiles, and defaults to firefox_window', () => {
  assert.equal(normalizePlayerMode('firefox_window'), 'firefox_window');
  assert.equal(normalizePlayerMode('embedded_webkit'), 'embedded_webkit');
  assert.equal(normalizePlayerMode('  embedded_webkit  '), 'embedded_webkit');
  assert.equal(normalizePlayerMode('firefox_4k'), 'firefox_window');
  assert.equal(normalizePlayerMode('chrome_4k'), 'firefox_window');
  assert.equal(normalizePlayerMode('safari_native'), 'embedded_webkit');
  assert.equal(normalizePlayerMode('unknown'), DEFAULT_PLAYER_MODE);
  assert.equal(normalizePlayerMode(null), DEFAULT_PLAYER_MODE);
  assert.equal(normalizePlayerMode(42), DEFAULT_PLAYER_MODE);
});

test('parseStoredPlayerMode and serializePlayerMode round-trip safely and migrate legacy storage payloads', () => {
  for (const option of PLAYER_MODE_OPTIONS) {
    const serialized = serializePlayerMode(option.id);
    assert.equal(parseStoredPlayerMode(serialized), option.id);
  }

  assert.equal(parseStoredPlayerMode('embedded_webkit'), 'embedded_webkit');
  assert.equal(
    parseStoredPlayerMode(JSON.stringify({ profile: 'safari_native' })),
    'embedded_webkit',
  );
  assert.equal(
    parseStoredPlayerMode(JSON.stringify({ profile: 'firefox_4k' })),
    'firefox_window',
  );
  assert.equal(parseStoredPlayerMode(null), DEFAULT_PLAYER_MODE);
  assert.equal(parseStoredPlayerMode(''), DEFAULT_PLAYER_MODE);
  assert.equal(parseStoredPlayerMode('{broken-json'), DEFAULT_PLAYER_MODE);
  assert.equal(
    parseStoredPlayerMode(JSON.stringify({ mode: 'invalid' })),
    DEFAULT_PLAYER_MODE,
  );
});

test('getPlayerModeOption returns matching metadata for every player mode', () => {
  const firefox = getPlayerModeOption('firefox_window');
  assert.equal(firefox.id, 'firefox_window');
  assert.equal(firefox.badge, '4K');

  const embedded = getPlayerModeOption('embedded_webkit');
  assert.equal(embedded.id, 'embedded_webkit');

  const fallback = getPlayerModeOption('bad' as never);
  assert.equal(fallback.id, DEFAULT_PLAYER_MODE);
});
