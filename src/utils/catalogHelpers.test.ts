import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_TITLES } from '../data/demoTitles';
import type { CatalogFilters } from '../types';
import {
  buildDiscoverGenreQuery,
  excludeWatchedItems,
  getMediaItemKey,
  interleaveMediaStreams,
  isAnimeItem,
  itemMatchesCountry,
  pickRandomEveningItem,
} from './catalogHelpers';
import { filterDemoCatalog } from './demoFilter';

const BASE_FILTERS: CatalogFilters = {
  mediaType: 'all',
  query: '',
  moods: [],
  genreIds: [],
  country: '',
  year: '',
  minRating: 0,
  sortBy: 'popularity.desc',
  hideWatched: false,
};

test('filterDemoCatalog returns both movies and series in unified all mode', () => {
  const results = filterDemoCatalog(BASE_FILTERS);
  const hasMovies = results.some((item) => item.mediaType === 'movie');
  const hasSeries = results.some((item) => item.mediaType === 'tv');
  assert.equal(hasMovies, true);
  assert.equal(hasSeries, true);
  assert.equal(results.length, DEMO_TITLES.length);
});

test('unified search finds movies and series simultaneously by actor or title', () => {
  const byActor = filterDemoCatalog({
    ...BASE_FILTERS,
    query: 'Макконахи',
  });
  // Интерстеллар (movie) и Настоящий детектив (tv)
  assert.equal(byActor.some((i) => i.mediaType === 'movie'), true);
  assert.equal(byActor.some((i) => i.mediaType === 'tv'), true);
});

test('unified genre group maps Sci-Fi & Fantasy to both movies (878/14) and tv (10765)', () => {
  const sciFiResults = filterDemoCatalog({
    ...BASE_FILTERS,
    mediaType: 'all',
    genreIds: [878],
  });
  assert.equal(sciFiResults.some((i) => i.mediaType === 'movie'), true);
  assert.equal(sciFiResults.some((i) => i.mediaType === 'tv'), true);
});

test('country filter and mood presets combine cleanly across movies and series', () => {
  const korean = filterDemoCatalog({
    ...BASE_FILTERS,
    country: 'KR',
  });
  assert.equal(korean.length, 1);
  assert.equal(korean[0].title, 'Паразиты');

  const germanMysterious = filterDemoCatalog({
    ...BASE_FILTERS,
    country: 'DE',
    moods: ['mysterious'],
  });
  assert.equal(germanMysterious.some((i) => i.title === 'Тьма' && i.mediaType === 'tv'), true);
});

test('itemMatchesCountry falls back to originalLanguage when originCountry is absent', () => {
  const syntheticMovie = {
    ...DEMO_TITLES[0].item,
    originCountry: [],
  };
  assert.equal(itemMatchesCountry(syntheticMovie, 'KR', 'ko'), true);
  assert.equal(itemMatchesCountry(syntheticMovie, 'FR', 'ko'), false);
});

test('excludeWatchedItems hides watched media keys and reports hiddenCount', () => {
  const pool = DEMO_TITLES.slice(0, 4).map((d) => d.item);
  const watchedKeys = new Set([getMediaItemKey(pool[0]), getMediaItemKey(pool[2])]);

  const active = excludeWatchedItems(pool, watchedKeys, true);
  assert.equal(active.hiddenCount, 2);
  assert.equal(active.visible.length, 2);
  assert.equal(active.visible.some((i) => watchedKeys.has(getMediaItemKey(i))), false);

  const disabled = excludeWatchedItems(pool, watchedKeys, false);
  assert.equal(disabled.hiddenCount, 0);
  assert.equal(disabled.visible.length, 4);
});

test('pickRandomEveningItem avoids repeats until pool is exhausted and avoids immediate duplicate on reset', () => {
  const pool = DEMO_TITLES.slice(0, 3).map((d) => d.item);
  const seen = new Set<string>();
  let lastKey: string | null = null;

  for (let i = 0; i < 3; i += 1) {
    const { item, resetSeen } = pickRandomEveningItem(pool, seen, lastKey, () => 0);
    assert.ok(item);
    assert.equal(resetSeen, false);
    const key = getMediaItemKey(item);
    assert.equal(seen.has(key), false);
    seen.add(key);
    lastKey = key;
  }

  const nextCycle = pickRandomEveningItem(pool, seen, lastKey, () => 0);
  assert.ok(nextCycle.item);
  assert.equal(nextCycle.resetSeen, true);
  assert.notEqual(getMediaItemKey(nextCycle.item), lastKey);
});

test('buildDiscoverGenreQuery builds OR query for moods and unified single genre, AND for multiple genres', () => {
  assert.equal(buildDiscoverGenreQuery([878], [], 'all', 'movie'), '878|14');
  assert.equal(buildDiscoverGenreQuery([878], [], 'all', 'tv'), '10765');
  assert.equal(buildDiscoverGenreQuery([18, 53], [], 'movie', 'movie'), '18,53');
  assert.equal(buildDiscoverGenreQuery([], ['plot_twist'], 'all', 'movie'), '53|9648');
});

test('interleaveMediaStreams alternates movies and series without duplicates', () => {
  const movies = DEMO_TITLES.filter((d) => d.item.mediaType === 'movie')
    .slice(0, 2)
    .map((d) => d.item);
  const series = DEMO_TITLES.filter((d) => d.item.mediaType === 'tv')
    .slice(0, 2)
    .map((d) => d.item);
  const mixed = interleaveMediaStreams(movies, series);
  assert.deepEqual(
    mixed.map((m) => m.mediaType),
    ['movie', 'tv', 'movie', 'tv'],
  );
});

test('isAnimeItem detects Japanese animation and rejects non-anime titles', () => {
  const aot = DEMO_TITLES.find((d) => d.item.title === 'Атака титанов')!.item;
  const spirited = DEMO_TITLES.find((d) => d.item.title === 'Унесённые призраками')!.item;
  const inception = DEMO_TITLES.find((d) => d.item.title === 'Начало')!.item;
  const westernCartoon = { ...spirited, originCountry: ['US'] };

  assert.equal(isAnimeItem(aot), true);
  assert.equal(isAnimeItem(spirited), true);
  assert.equal(isAnimeItem(inception), false);
  assert.equal(isAnimeItem(westernCartoon), false);
  assert.equal(isAnimeItem({ ...spirited, originCountry: [] }, 'ja'), true);
});

test('filterDemoCatalog in anime scope returns both anime series and anime feature films', () => {
  const allAnime = filterDemoCatalog({
    ...BASE_FILTERS,
    mediaType: 'anime',
  });
  assert.equal(allAnime.length, 6);
  assert.equal(allAnime.some((i) => i.mediaType === 'tv'), true);
  assert.equal(allAnime.some((i) => i.mediaType === 'movie'), true);

  const miyazaki = filterDemoCatalog({
    ...BASE_FILTERS,
    mediaType: 'anime',
    query: 'Миядзаки',
  });
  assert.equal(miyazaki.length, 2);
  assert.equal(miyazaki.every((i) => i.mediaType === 'movie'), true);

  const detectiveAnime = filterDemoCatalog({
    ...BASE_FILTERS,
    mediaType: 'anime',
    moods: ['plot_twist'],
  });
  assert.equal(detectiveAnime.some((i) => i.title === 'Тетрадь смерти'), true);
});

test('buildDiscoverGenreQuery enforces strict animation genre 16 AND in anime scope', () => {
  assert.equal(buildDiscoverGenreQuery([], [], 'anime', 'tv'), '16');
  assert.equal(buildDiscoverGenreQuery([28], [], 'anime', 'tv'), '16,10759');
  assert.equal(buildDiscoverGenreQuery([28], [], 'anime', 'movie'), '16,28');
  assert.equal(buildDiscoverGenreQuery([], ['mysterious'], 'anime', 'tv'), '16,9648');
  assert.equal(
    buildDiscoverGenreQuery([], ['mysterious', 'light_fun'], 'anime', 'tv'),
    '16',
  );
});
