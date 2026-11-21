import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findNextFocusableIndex,
  mapKeyToTvAction,
  shouldAcceptTvKeyEvent,
  type FocusRect,
} from './tvSpatialNav';
import { isAndroidTvUserAgent, isAndroidUserAgent } from './platform';
import {
  buildQrSvgModel,
  mergeReceivedPairingKeys,
  normalizePairingPayload,
} from '../services/tvPairing';
import {
  buildCatalogCacheKey,
  clearCatalogSnapshot,
  getLastCatalogSearch,
  getMatchingCatalogSnapshot,
  saveCatalogSnapshot,
  updateCatalogSnapshotPosition,
} from './catalogSessionCache';
import type { CatalogFilters, MediaItem } from '../types';

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

test('findNextFocusableIndex steps through tightly packed segmented tabs (Все / Фильмы / Сериалы / Аниме) without skipping', () => {
  // Zero-gap segmented buttons + search input to the right
  const tabs: FocusRect[] = [
    rect(40, 140, 56, 40), // 0: Все
    rect(96, 140, 88, 40), // 1: Фильмы
    rect(184, 140, 94, 40), // 2: Сериалы
    rect(278, 140, 76, 40), // 3: Аниме
    rect(370, 140, 420, 40), // 4: Поиск
  ];

  // Step left-to-right one by one
  assert.equal(findNextFocusableIndex(tabs[0], tabs, 'right', 0), 1);
  assert.equal(findNextFocusableIndex(tabs[1], tabs, 'right', 1), 2);
  assert.equal(findNextFocusableIndex(tabs[2], tabs, 'right', 2), 3);
  assert.equal(findNextFocusableIndex(tabs[3], tabs, 'right', 3), 4);

  // Step right-to-left one by one
  assert.equal(findNextFocusableIndex(tabs[4], tabs, 'left', 4), 3);
  assert.equal(findNextFocusableIndex(tabs[3], tabs, 'left', 3), 2);
  assert.equal(findNextFocusableIndex(tabs[2], tabs, 'left', 2), 1);
  assert.equal(findNextFocusableIndex(tabs[1], tabs, 'left', 1), 0);

  // Even if the focused tab overlaps neighbors by 3px (e.g. from scale), it must STILL pick immediate neighbor
  const scaledSerials: FocusRect = rect(181, 139, 100, 42);
  assert.equal(findNextFocusableIndex(scaledSerials, tabs, 'left', 2), 1);
  assert.equal(findNextFocusableIndex(scaledSerials, tabs, 'right', 2), 3);
});

test('shouldAcceptTvKeyEvent paces rapid tapping and key-hold repeats smoothly without queuing bursts', () => {
  assert.equal(shouldAcceptTvKeyEvent('right', false, null, 0, 100), true);
  // Быстрый дребезг/серия нажатий в ту же сторону (< 90ms) отсекается
  assert.equal(shouldAcceptTvKeyEvent('right', false, 'right', 100, 145), false);
  // Смена направления реагирует быстрее (>= 40ms)
  assert.equal(shouldAcceptTvKeyEvent('down', false, 'right', 100, 145), true);
  // Слишком быстрый повтор при удержании (< 130ms) отсекается, чтобы не дёргался экран
  assert.equal(shouldAcceptTvKeyEvent('right', true, 'right', 100, 160), false);
  // Повтор при удержании после интервала (>= 130ms) плавно принимается
  assert.equal(shouldAcceptTvKeyEvent('right', true, 'right', 100, 235), true);
  // Повторное обычное нажатие после окна дебаунса (>= 90ms) принимается
  assert.equal(shouldAcceptTvKeyEvent('right', false, 'right', 100, 195), true);
  // Удержание ОК/Назад блокируется, чтобы избежать случайных двойных срабатываний
  assert.equal(shouldAcceptTvKeyEvent('select', true, 'select', 100, 300), false);
  assert.equal(shouldAcceptTvKeyEvent('back', true, 'back', 100, 300), false);
});

test('findNextFocusableIndex walks every tab in Header, Library, Rating 1-10, and Search+Clear without skipping a single element', () => {
  // 1. Шапка: CineScope, Главная, Каталог, Коллекция, История, Настройки, Профиль
  const header: FocusRect[] = [
    rect(48, 22, 118, 36), // 0: CineScope
    rect(320, 22, 88, 36), // 1: Главная
    rect(420, 22, 86, 36), // 2: Каталог
    rect(518, 22, 104, 36), // 3: Коллекция
    rect(634, 22, 92, 36), // 4: История
    rect(1040, 20, 40, 40), // 5: Настройки
    rect(1090, 20, 112, 40), // 6: Профиль
  ];
  for (let i = 0; i < header.length - 1; i += 1) {
    assert.equal(findNextFocusableIndex(header[i], header, 'right', i), i + 1);
  }
  assert.equal(findNextFocusableIndex(header[header.length - 1], header, 'right', header.length - 1), -1);
  for (let i = header.length - 1; i > 0; i -= 1) {
    assert.equal(findNextFocusableIndex(header[i], header, 'left', i), i - 1);
  }
  assert.equal(findNextFocusableIndex(header[0], header, 'left', 0), -1);

  // 2. Вкладки коллекции: В процессе, Посмотреть позже, Просмотрено, Избранное
  const libraryTabs: FocusRect[] = [
    rect(48, 160, 132, 38),
    rect(188, 160, 186, 38),
    rect(382, 160, 148, 38),
    rect(538, 160, 134, 38),
  ];
  for (let i = 0; i < libraryTabs.length - 1; i += 1) {
    assert.equal(findNextFocusableIndex(libraryTabs[i], libraryTabs, 'right', i), i + 1);
  }
  for (let i = libraryTabs.length - 1; i > 0; i -= 1) {
    assert.equal(findNextFocusableIndex(libraryTabs[i], libraryTabs, 'left', i), i - 1);
  }

  // 3. Строка поиска с встроенной кнопкой «Очистить» внутри правого края и кнопкой «Случайный выбор» справа
  const searchRow: FocusRect[] = [
    rect(40, 140, 56, 40), // 0: Все
    rect(100, 140, 88, 40), // 1: Фильмы
    rect(192, 140, 94, 40), // 2: Сериалы
    rect(290, 140, 76, 40), // 3: Аниме
    rect(378, 138, 420, 44), // 4: Поиск (378..798)
    rect(766, 148, 24, 24), // 5: Кнопка X внутри правого края поля поиска (766..790)
    rect(810, 138, 170, 44), // 6: Случайный выбор
  ];
  for (let i = 0; i < searchRow.length - 1; i += 1) {
    assert.equal(findNextFocusableIndex(searchRow[i], searchRow, 'right', i), i + 1);
  }
  for (let i = searchRow.length - 1; i > 0; i -= 1) {
    assert.equal(findNextFocusableIndex(searchRow[i], searchRow, 'left', i), i - 1);
  }

  // 4. Кнопки оценки 1..10 на странице фильма
  const ratingButtons: FocusRect[] = Array.from({ length: 10 }, (_, idx) =>
    rect(48 + idx * 42, 620, 36, 36),
  );
  for (let i = 0; i < 9; i += 1) {
    assert.equal(findNextFocusableIndex(ratingButtons[i], ratingButtons, 'right', i), i + 1);
  }
  for (let i = 9; i > 0; i -= 1) {
    assert.equal(findNextFocusableIndex(ratingButtons[i], ratingButtons, 'left', i), i - 1);
  }
});

test('findNextFocusableIndex prefers same-row elements when moving horizontally even if another row is closer diagonally', () => {
  const candidates: FocusRect[] = [
    rect(40, 200, 140, 44), // 0: origin button
    rect(230, 200, 140, 44), // 1: same row, slightly further
    rect(190, 260, 140, 44), // 2: next row below, closer on X axis
  ];

  assert.equal(findNextFocusableIndex(candidates[0], candidates, 'right', 0), 1);
});

test('findNextFocusableIndex moves down from ALL stacked Catalog tabs (Все / Фильмы / Сериалы / Аниме) to full-width Search bar instead of skipping to Country select', () => {
  const layout: FocusRect[] = [
    rect(40, 140, 60, 40), // 0: Все
    rect(100, 140, 88, 40), // 1: Фильмы
    rect(188, 140, 94, 40), // 2: Сериалы
    rect(282, 140, 76, 40), // 3: Аниме
    rect(40, 192, 880, 44), // 4: Полная строка поиска во всю ширину
    rect(40, 264, 180, 42), // 5: Выбор страны
    rect(236, 264, 180, 42), // 6: Сортировка
  ];

  // Из каждой вкладки движение Вниз должно попадать именно в строку поиска (индекс 4)
  assert.equal(findNextFocusableIndex(layout[0], layout, 'down', 0), 4);
  assert.equal(findNextFocusableIndex(layout[1], layout, 'down', 1), 4);
  assert.equal(findNextFocusableIndex(layout[2], layout, 'down', 2), 4);
  assert.equal(findNextFocusableIndex(layout[3], layout, 'down', 3), 4);

  // От «Выбор страны» вверх возвращаемся в строку поиска
  assert.equal(findNextFocusableIndex(layout[5], layout, 'up', 5), 4);

  // На правом краю ряда вкладок («Аниме») нажатие Вправо НЕ должно прыгать вниз на строку поиска
  assert.equal(findNextFocusableIndex(layout[3], layout, 'right', 3), -1);
  // На левом краю («Все») нажатие Влево остаётся на месте
  assert.equal(findNextFocusableIndex(layout[0], layout, 'left', 0), -1);
});

test('findNextFocusableIndex stops at row edges when moving horizontally and never jumps to another row', () => {
  const rows: FocusRect[] = [
    rect(40, 100, 160, 240), // 0: row 0, col 0
    rect(220, 100, 160, 240), // 1: row 0, col 1 (end of row 0)
    rect(40, 360, 160, 240), // 2: row 1, col 0 (start of row 1)
    rect(220, 360, 160, 240), // 3: row 1, col 1
    rect(400, 360, 160, 240), // 4: row 1, col 2 (extends further right than row 0!)
  ];

  // На правом краю первой строки НЕ перепрыгиваем вниз на (1, 2), хотя он правее по X
  assert.equal(findNextFocusableIndex(rows[1], rows, 'right', 1), -1);
  // На левом краю второй строки НЕ перепрыгиваем вверх на первую строку
  assert.equal(findNextFocusableIndex(rows[2], rows, 'left', 2), -1);
  // Даже если карточка увеличена через scale(1.04) и задевает нижний ряд на 3px, вправо остаёмся на краю
  const slightlyScaledEdge = rect(216, 97, 168, 266);
  assert.equal(findNextFocusableIndex(slightlyScaledEdge, rows, 'right', 1), -1);
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
  // На правом краю шапки вправо ничего нет — остаёмся на кнопке настроек
  assert.equal(findNextFocusableIndex(headerSettingsBtn, candidates, 'right', 2), -1);
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

test('TV QR pairing helpers build crisp SVG path and normalize/merge received API keys', () => {
  const qr = buildQrSvgModel('http://192.168.1.42:54321/pair?token=0123456789abcdef', 2);
  assert.ok(qr.size >= 21);
  assert.equal(qr.viewBoxSize, qr.size + 4);
  assert.ok(qr.pathData.startsWith('M'));

  const valid = normalizePairingPayload({
    tmdbApiKey: '  tmdb_key_123  ',
    kinopoiskApiKey: ' kp-uuid-456 ',
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.deepEqual(valid.payload, {
      tmdbApiKey: 'tmdb_key_123',
      kinopoiskApiKey: 'kp-uuid-456',
    });
  }

  const empty = normalizePairingPayload({ tmdbApiKey: '  ', kinopoiskApiKey: '' });
  assert.equal(empty.ok, false);

  const badWhitespace = normalizePairingPayload({
    tmdbApiKey: 'abc def',
    kinopoiskApiKey: '',
  });
  assert.equal(badWhitespace.ok, false);

  const merged = mergeReceivedPairingKeys(
    { tmdbApiKey: '', kinopoiskApiKey: 'new-kp-uuid' },
    { tmdbApiKey: 'existing-tmdb', kinopoiskApiKey: 'old-kp' },
  );
  assert.deepEqual(merged, {
    tmdbApiKey: 'existing-tmdb',
    kinopoiskApiKey: 'new-kp-uuid',
  });
});

test('catalogSessionCache preserves loaded pages, scrollY, and focused movie card and invalidates on filter or key changes', () => {
  clearCatalogSnapshot();

  const baseFilters: CatalogFilters = {
    mediaType: 'movie',
    query: 'Матрица',
    moods: ['tense', 'mysterious'],
    genreIds: [878, 28],
    country: 'US',
    year: '1999',
    minRating: 7,
    sortBy: 'popularity.desc',
    hideWatched: false,
  };

  // Порядок moods/genreIds и регистр query не меняют ключ кэша
  const keyA = buildCatalogCacheKey(baseFilters, false, 1);
  const keyB = buildCatalogCacheKey(
    {
      ...baseFilters,
      query: '  матрица ',
      moods: ['mysterious', 'tense'],
      genreIds: [28, 878],
      country: 'us',
    },
    false,
    1,
  );
  assert.equal(keyA, keyB);

  // Смена режима или версии ключей меняет ключ кэша
  assert.notEqual(keyA, buildCatalogCacheKey(baseFilters, true, 1));
  assert.notEqual(keyA, buildCatalogCacheKey(baseFilters, false, 2));

  const sampleItems: MediaItem[] = [
    {
      id: 603,
      mediaType: 'movie',
      title: 'Матрица',
      originalTitle: 'The Matrix',
      overview: 'Описание',
      posterPath: null,
      backdropPath: null,
      releaseDate: '1999-03-30',
      year: '1999',
      runtime: 136,
      genreIds: [878, 28],
      genres: [],
      voteAverage: 8.7,
      voteCount: 25000,
      popularity: 95,
      originCountry: ['US'],
      isDemoData: false,
    },
  ];

  saveCatalogSnapshot({
    cacheKey: keyA,
    search: '?type=movie&q=%D0%9C%D0%B0%D1%82%D1%80%D0%B8%D1%86%D0%B0',
    filters: baseFilters,
    items: sampleItems,
    page: 3,
    totalPages: 12,
    scrollY: 1420,
    focusedItemKey: 'movie:603',
    savedAt: 1000,
  });

  updateCatalogSnapshotPosition(keyA, 1680, 'movie:603');
  const restored = getMatchingCatalogSnapshot(keyA);
  assert.ok(restored);
  assert.equal(restored.page, 3);
  assert.equal(restored.items.length, 1);
  assert.equal(restored.scrollY, 1680);
  assert.equal(restored.focusedItemKey, 'movie:603');
  assert.equal(
    getLastCatalogSearch(),
    '?type=movie&q=%D0%9C%D0%B0%D1%82%D1%80%D0%B8%D1%86%D0%B0',
  );

  // Другой ключ фильтров не получает чужой снимок
  const otherKey = buildCatalogCacheKey(
    { ...baseFilters, mediaType: 'tv' },
    false,
    1,
  );
  assert.equal(getMatchingCatalogSnapshot(otherKey), null);

  // Просроченный снимок автоматически очищается
  assert.equal(
    getMatchingCatalogSnapshot(keyA, Date.now() + 31 * 60 * 1000),
    null,
  );
  assert.equal(getLastCatalogSearch(), '');
});
