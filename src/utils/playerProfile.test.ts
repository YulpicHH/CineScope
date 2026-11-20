import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLAYER_PROFILE,
  PLAYER_PROFILE_OPTIONS,
  getPlayerProfileOption,
  normalizePlayerProfile,
  parseStoredPlayerProfile,
  serializePlayerProfile,
} from './playerProfile';

test('normalizePlayerProfile accepts valid profile IDs and falls back to firefox_4k', () => {
  assert.equal(normalizePlayerProfile('firefox_4k'), 'firefox_4k');
  assert.equal(normalizePlayerProfile('chrome_4k'), 'chrome_4k');
  assert.equal(normalizePlayerProfile('safari_native'), 'safari_native');
  assert.equal(normalizePlayerProfile('  chrome_4k  '), 'chrome_4k');
  assert.equal(normalizePlayerProfile('unknown'), DEFAULT_PLAYER_PROFILE);
  assert.equal(normalizePlayerProfile(null), DEFAULT_PLAYER_PROFILE);
  assert.equal(normalizePlayerProfile(123), DEFAULT_PLAYER_PROFILE);
});

test('parseStoredPlayerProfile and serializePlayerProfile round-trip safely and handle corrupted data', () => {
  for (const option of PLAYER_PROFILE_OPTIONS) {
    const serialized = serializePlayerProfile(option.id);
    assert.equal(parseStoredPlayerProfile(serialized), option.id);
  }

  assert.equal(parseStoredPlayerProfile('safari_native'), 'safari_native');
  assert.equal(parseStoredPlayerProfile(JSON.stringify('chrome_4k')), 'chrome_4k');
  assert.equal(parseStoredPlayerProfile(null), DEFAULT_PLAYER_PROFILE);
  assert.equal(parseStoredPlayerProfile(''), DEFAULT_PLAYER_PROFILE);
  assert.equal(parseStoredPlayerProfile('{broken-json'), DEFAULT_PLAYER_PROFILE);
  assert.equal(
    parseStoredPlayerProfile(JSON.stringify({ profile: 'invalid_mode' })),
    DEFAULT_PLAYER_PROFILE,
  );
});

test('getPlayerProfileOption returns matching metadata for every profile', () => {
  const safari = getPlayerProfileOption('safari_native');
  assert.equal(safari.id, 'safari_native');
  assert.match(safari.label, /Safari/);

  const fallback = getPlayerProfileOption('bad' as never);
  assert.equal(fallback.id, DEFAULT_PLAYER_PROFILE);
});
