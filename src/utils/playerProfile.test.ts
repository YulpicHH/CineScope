import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLAYER_MODE,
  MACOS_PLAYER_MODE_OPTIONS,
  PLAYER_MODE_OPTIONS,
  WINDOWS_DEFAULT_PLAYER_MODE,
  WINDOWS_PLAYER_MODE_OPTIONS,
  getDefaultPlayerMode,
  getPlayerModeOption,
  getPlayerModeOptions,
  normalizePlayerMode,
  parseStoredPlayerMode,
  serializePlayerMode,
} from './playerProfile';
import {
  detectPlatformFromStrings,
  isIOSSafariUserAgent,
  normalizeDesktopPlatform,
} from './platform';

test('normalizePlayerMode accepts firefox, chrome, edge, and embedded modes and migrates legacy profiles', () => {
  assert.equal(normalizePlayerMode('firefox_window'), 'firefox_window');
  assert.equal(normalizePlayerMode('chrome_window'), 'chrome_window');
  assert.equal(normalizePlayerMode('edge_window'), 'edge_window');
  assert.equal(normalizePlayerMode('embedded_webkit'), 'embedded_webkit');
  assert.equal(normalizePlayerMode('embedded_webview'), 'embedded_webkit');
  assert.equal(normalizePlayerMode('  chrome_window  '), 'chrome_window');
  assert.equal(normalizePlayerMode('firefox_4k'), 'firefox_window');
  assert.equal(normalizePlayerMode('chrome_4k'), 'chrome_window');
  assert.equal(normalizePlayerMode('edge_4k'), 'edge_window');
  assert.equal(normalizePlayerMode('safari_native'), 'embedded_webkit');
  assert.equal(normalizePlayerMode('unknown'), DEFAULT_PLAYER_MODE);
  assert.equal(normalizePlayerMode('unknown', 'windows'), WINDOWS_DEFAULT_PLAYER_MODE);
  assert.equal(normalizePlayerMode(null), DEFAULT_PLAYER_MODE);
  assert.equal(normalizePlayerMode(null, 'windows'), WINDOWS_DEFAULT_PLAYER_MODE);
  assert.equal(normalizePlayerMode(42), DEFAULT_PLAYER_MODE);
});

test('parseStoredPlayerMode and serializePlayerMode round-trip safely and respect platform defaults', () => {
  for (const option of [...PLAYER_MODE_OPTIONS, ...WINDOWS_PLAYER_MODE_OPTIONS]) {
    const serialized = serializePlayerMode(option.id);
    assert.equal(parseStoredPlayerMode(serialized), option.id);
    assert.equal(parseStoredPlayerMode(serialized, 'windows'), option.id);
  }

  assert.equal(parseStoredPlayerMode('chrome_window'), 'chrome_window');
  assert.equal(parseStoredPlayerMode('edge_window', 'windows'), 'edge_window');
  assert.equal(
    parseStoredPlayerMode(JSON.stringify({ profile: 'chrome_4k' })),
    'chrome_window',
  );
  assert.equal(
    parseStoredPlayerMode(JSON.stringify({ profile: 'edge_4k' }), 'windows'),
    'edge_window',
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
  assert.equal(parseStoredPlayerMode(null, 'windows'), 'embedded_webkit');
  assert.equal(parseStoredPlayerMode('', 'windows'), 'embedded_webkit');
  assert.equal(parseStoredPlayerMode('{broken-json'), DEFAULT_PLAYER_MODE);
  assert.equal(parseStoredPlayerMode('{broken-json', 'windows'), 'embedded_webkit');
  assert.equal(
    parseStoredPlayerMode(JSON.stringify({ mode: 'invalid' })),
    DEFAULT_PLAYER_MODE,
  );
});

test('getPlayerModeOptions and getPlayerModeOption return platform-specific metadata for Windows and macOS', () => {
  assert.equal(getDefaultPlayerMode('windows'), 'embedded_webkit');
  assert.equal(getDefaultPlayerMode('macos'), 'firefox_window');

  const winOptions = getPlayerModeOptions('windows');
  assert.equal(winOptions.length, 4);
  assert.equal(winOptions[0].id, 'embedded_webkit');
  assert.equal(winOptions[0].badge, '4K');
  assert.ok(winOptions.some((o) => o.id === 'edge_window' && o.badge === '4K'));
  assert.ok(winOptions.every((o) => o.badge === '4K'));

  const macOptions = getPlayerModeOptions('macos');
  assert.equal(macOptions.length, MACOS_PLAYER_MODE_OPTIONS.length);
  assert.equal(macOptions[0].id, 'firefox_window');
  assert.equal(getPlayerModeOption('embedded_webkit', 'macos').badge, 'до 1080p');
  assert.equal(getPlayerModeOption('embedded_webkit', 'windows').badge, '4K');

  const edge = getPlayerModeOption('edge_window', 'windows');
  assert.equal(edge.id, 'edge_window');
  assert.equal(edge.label, 'Edge');

  const fallbackMac = getPlayerModeOption('bad' as never, 'macos');
  assert.equal(fallbackMac.id, DEFAULT_PLAYER_MODE);

  const fallbackWin = getPlayerModeOption('bad' as never, 'windows');
  assert.equal(fallbackWin.id, WINDOWS_DEFAULT_PLAYER_MODE);
});

test('detectPlatformFromStrings and normalizeDesktopPlatform identify Windows, macOS, and Linux accurately', () => {
  assert.equal(
    detectPlatformFromStrings('Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'),
    'windows',
  );
  assert.equal(
    detectPlatformFromStrings('Windows', 'Mozilla/5.0 AppleWebKit/537.36'),
    'windows',
  );
  assert.equal(
    detectPlatformFromStrings('MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'),
    'macos',
  );
  assert.equal(
    detectPlatformFromStrings('Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)'),
    'linux',
  );

  assert.equal(normalizeDesktopPlatform('windows'), 'windows');
  assert.equal(normalizeDesktopPlatform('MACOS'), 'macos');
  assert.equal(normalizeDesktopPlatform('unknown', 'windows'), 'windows');
  assert.equal(normalizeDesktopPlatform(null), 'web');
});

test('isIOSSafariUserAgent distinguishes iPhone/iPad Safari from iOS Chrome and desktop Safari', () => {
  const iphoneSafari =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const iphoneChrome =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1';
  const ipadDesktopMode =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const macDesktopSafari =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

  assert.equal(isIOSSafariUserAgent(iphoneSafari, 5), true);
  assert.equal(isIOSSafariUserAgent(iphoneChrome, 5), false);
  assert.equal(isIOSSafariUserAgent(ipadDesktopMode, 5), true);
  assert.equal(isIOSSafariUserAgent(macDesktopSafari, 0), false);
});
