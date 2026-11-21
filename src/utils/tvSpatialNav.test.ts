import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findNextFocusableIndex,
  mapKeyToTvAction,
  type FocusRect,
} from './tvSpatialNav';
import { isAndroidTvUserAgent, isAndroidUserAgent } from './platform';

function rect(left: number, top: number, width = 160, height = 240): FocusRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

test('mapKeyToTvAction maps standard keyboard arrows, Enter, Escape, and Android TV D-Pad keyCodes', () => {
  assert.equal(mapKeyToTvAction('ArrowUp'), 'up');
  assert.equal(mapKeyToTvAction('ArrowDown'), 'down');
  assert.equal(mapKeyToTvAction('ArrowLeft'), 'left');
  assert.equal(mapKeyToTvAction('ArrowRight'), 'right');
  assert.equal(mapKeyToTvAction('Enter'), 'select');
  assert.equal(mapKeyToTvAction('NumpadEnter'), 'select');
  assert.equal(mapKeyToTvAction('Escape'), 'back');
  assert.equal(mapKeyToTvAction('Backspace'), 'back');
  assert.equal(mapKeyToTvAction('BrowserBack'), 'back');
  assert.equal(mapKeyToTvAction('GoBack'), 'back');

  // Android WebView hardware D-Pad keyCodes
  assert.equal(mapKeyToTvAction('Unidentified', 19), 'up');
  assert.equal(mapKeyToTvAction('Unidentified', 20), 'down');
  assert.equal(mapKeyToTvAction('Unidentified', 21), 'left');
  assert.equal(mapKeyToTvAction('Unidentified', 22), 'right');
  assert.equal(mapKeyToTvAction('Unidentified', 23), 'select');
  assert.equal(mapKeyToTvAction('Unidentified', 4), 'back');

  assert.equal(mapKeyToTvAction('a', 65), null);
});

test('findNextFocusableIndex navigates a 3x2 grid accurately across all 4 directions', () => {
  const grid: FocusRect[] = [
    rect(40, 100), // 0: row 0, col 0
    rect(220, 100), // 1: row 0, col 1
    rect(400, 100), // 2: row 0, col 2
    rect(40, 380), // 3: row 1, col 0
    rect(220, 380), // 4: row 1, col 1
    rect(400, 380), // 5: row 1, col 2
  ];

  // From (0, 0)
  assert.equal(findNextFocusableIndex(grid[0], grid, 'right', 0), 1);
  assert.equal(findNextFocusableIndex(grid[0], grid, 'down', 0), 3);
  assert.equal(findNextFocusableIndex(grid[0], grid, 'left', 0), -1);
  assert.equal(findNextFocusableIndex(grid[0], grid, 'up', 0), -1);

  // From center (row 1, col 1 -> index 4)
  assert.equal(findNextFocusableIndex(grid[4], grid, 'up', 4), 1);
  assert.equal(findNextFocusableIndex(grid[4], grid, 'left', 4), 3);
  assert.equal(findNextFocusableIndex(grid[4], grid, 'right', 4), 5);
  assert.equal(findNextFocusableIndex(grid[4], grid, 'down', 4), -1);
});

test('findNextFocusableIndex prefers same-row elements when moving horizontally even if another row is closer diagonally', () => {
  const candidates: FocusRect[] = [
    rect(40, 200, 140, 44), // 0: origin button
    rect(230, 200, 140, 44), // 1: same row, slightly further
    rect(190, 260, 140, 44), // 2: next row below, closer on X axis
  ];

  assert.equal(findNextFocusableIndex(candidates[0], candidates, 'right', 0), 1);
});

test('findNextFocusableIndex moves from header button down to misaligned hero button cleanly', () => {
  const headerSettingsBtn = rect(1100, 20, 44, 44);
  const candidates: FocusRect[] = [
    rect(60, 20, 100, 40), // 0: logo
    rect(300, 20, 100, 40), // 1: nav item
    headerSettingsBtn, // 2: settings
    rect(80, 240, 200, 48), // 3: hero CTA below
  ];

  assert.equal(findNextFocusableIndex(headerSettingsBtn, candidates, 'down', 2), 3);
  assert.equal(findNextFocusableIndex(headerSettingsBtn, candidates, 'left', 2), 1);
});

test('isAndroidTvUserAgent and isAndroidUserAgent detect SberBox / SaluteTV / Android TV accurately', () => {
  const sberboxUa =
    'Mozilla/5.0 (Linux; Android 9; SberBox Build/PI; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.5481.153 Safari/537.36';
  const saluteTvUa =
    'Mozilla/5.0 (Linux; Android 11; SaluteTV StarOS) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36';
  const genericAndroidTv =
    'Mozilla/5.0 (Linux; Android 12; Chromecast HD Android TV) AppleWebKit/537.36 Chrome/118.0.0.0 Safari/537.36';
  const androidPhone =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const iphoneSafari =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
  const desktopMac =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';

  assert.equal(isAndroidTvUserAgent(sberboxUa), true);
  assert.equal(isAndroidUserAgent(sberboxUa), true);

  assert.equal(isAndroidTvUserAgent(saluteTvUa), true);
  assert.equal(isAndroidUserAgent(saluteTvUa), true);

  assert.equal(isAndroidTvUserAgent(genericAndroidTv), true);
  assert.equal(isAndroidUserAgent(genericAndroidTv), true);

  assert.equal(isAndroidTvUserAgent(androidPhone), false);
  assert.equal(isAndroidUserAgent(androidPhone), true);

  assert.equal(isAndroidTvUserAgent(iphoneSafari), false);
  assert.equal(isAndroidUserAgent(iphoneSafari), false);

  assert.equal(isAndroidTvUserAgent(desktopMac), false);
  assert.equal(isAndroidUserAgent(desktopMac), false);
});
