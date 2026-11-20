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

test('normalizePlayerMode accepts firefox, chrome, and embedded modes and migrates legacy profiles', () => {
  assert.equal(normalizePlayerMode('firefox_window'), 'firefox_window');
  assert.equal(normalizePlayerMode('chrome_window'), 'chrome_window');
  assert.equal(normalizePlayerMode('embedded_webkit'), 'embedded_webkit');
  assert.equal(normalizePlayerMode('  chrome_window  '), 'chrome_window');
  assert.equal(normalizePlayerMode('firefox_4k'), 'firefox_window');
  assert.equal(normalizePlayerMode('chrome_4k'), 'chrome_window');
  assert.equal(normalizePlayerMode('safari_native'), 'embedded_webkit');
  assert.equal(normalizePlayerMode('unknown'), DEFAULT_PLAYER_MODE);
  assert.equal(normalizePlayerMode(null), DEFAULT_PLAYER_MODE);
  assert.equal(normalizePlayerMode(42), DEFAULT_PLAYER_MODE);
});

test('parseStoredPlayerMode and serializePlayerMode round-trip safely and migrate legacy payloads', () => {
  for (const option of PLAYER_MODE_OPTIONS) {
    const serialized = serializePlayerMode(option.id);
    assert.equal(parseStoredPlayerMode(serialized), option.id);
  }

  assert.equal(parseStoredPlayerMode('chrome_window'), 'chrome_window');
  assert.equal(
    parseStoredPlayerMode(JSON.stringify({ profile: 'chrome_4k' })),
    'chrome_window',
  );
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

test('getPlayerModeOption returns matching metadata for firefox, chrome, and embedded modes', () => {
  const firefox = getPlayerModeOption('firefox_window');
  assert.equal(firefox.id, 'firefox_window');
  assert.equal(firefox.badge, '4K');

  const chrome = getPlayerModeOption('chrome_window');
  assert.equal(chrome.id, 'chrome_window');
  assert.equal(chrome.badge, '4K');

  const embedded = getPlayerModeOption('embedded_webkit');
  assert.equal(embedded.id, 'embedded_webkit');

  const fallback = getPlayerModeOption('bad' as never);
  assert.equal(fallback.id, DEFAULT_PLAYER_MODE);
});
