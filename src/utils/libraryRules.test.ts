import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTitleStatus,
  buildRecommendationProfile,
  computeHistoryStats,
  LIBRARY_SCHEMA_VERSION,
  parseLibraryStorage,
  removeWatchedHistoryEntry,
  setTitleRating,
  toggleFavoriteItem,
} from './libraryRules';
import type { MediaItem } from '../types';

const sampleMovie: MediaItem = {
  id: 157336,
  mediaType: 'movie',
  title: 'Интерстеллар',
  originalTitle: 'Interstellar',
  overview: 'Путешествие сквозь червоточину.',
  posterPath: null,
  backdropPath: null,
  releaseDate: '2014-11-05',
  year: '2014',
  genreIds: [12, 18, 878],
  genres: [
    { id: 12, name: 'Приключения' },
    { id: 18, name: 'Драма' },
    { id: 878, name: 'Фантастика' },
  ],
  voteAverage: 8.4,
  voteCount: 35000,
  popularity: 135,
  originCountry: ['US'],
  runtime: 169,
};

const sampleSeries: MediaItem = {
  id: 1396,
  mediaType: 'tv',
  title: 'Во все тяжкие',
  originalTitle: 'Breaking Bad',
  overview: 'История Уолтера Уайта.',
  posterPath: null,
  backdropPath: null,
  releaseDate: '2008-01-20',
  year: '2008',
  genreIds: [18, 80],
  genres: [
    { id: 18, name: 'Драма' },
    { id: 80, name: 'Криминал' },
  ],
  voteAverage: 8.9,
  voteCount: 14500,
  popularity: 138,
  originCountry: ['US'],
  numberOfSeasons: 5,
  numberOfEpisodes: 62,
  episodeRuntime: 47,
};

test('watchlist and watched are mutually exclusive while favorite stays independent', () => {
  let items = applyTitleStatus([], sampleMovie, 'watchlist', '2026-10-01T10:00:00.000Z');
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'watchlist');
  assert.equal(items[0].watchedAt, null);

  items = toggleFavoriteItem(items, sampleMovie, '2026-10-01T10:05:00.000Z');
  assert.equal(items[0].isFavorite, true);

  // Переход в «Просмотрено» снимает «Посмотреть позже», фиксирует дату и сохраняет «Избранное»
  items = applyTitleStatus(items, sampleMovie, 'watched', '2026-10-02T18:30:00.000Z');
  assert.equal(items[0].status, 'watched');
  assert.equal(items[0].watchedAt, '2026-10-02T18:30:00.000Z');
  assert.equal(items[0].isFavorite, true);

  // Оценка доступна и сохраняется для просмотренного
  items = setTitleRating(items, sampleMovie, 9, '2026-10-02T18:31:00.000Z');
  assert.equal(items[0].userRating, 9);

  // Возврат в «Посмотреть позже» убирает дату просмотра и оценку
  items = applyTitleStatus(items, sampleMovie, 'watchlist', '2026-10-03T09:00:00.000Z');
  assert.equal(items[0].status, 'watchlist');
  assert.equal(items[0].watchedAt, null);
  assert.equal(items[0].userRating, null);
  assert.equal(items[0].isFavorite, true);
});

test('removing history entry keeps favorite if present and deletes otherwise', () => {
  let items = applyTitleStatus([], sampleMovie, 'watched', '2026-10-02T18:30:00.000Z');
  items = toggleFavoriteItem(items, sampleMovie);
  items = applyTitleStatus(items, sampleSeries, 'watched', '2026-10-04T20:00:00.000Z');

  items = removeWatchedHistoryEntry(items, sampleMovie.id, 'movie');
  assert.equal(items.length, 2);
  const movieEntry = items.find((i) => i.id === sampleMovie.id);
  assert.equal(movieEntry?.status, null);
  assert.equal(movieEntry?.isFavorite, true);

  items = removeWatchedHistoryEntry(items, sampleSeries.id, 'tv');
  assert.equal(items.length, 1);
});

test('computeHistoryStats and buildRecommendationProfile calculate accurate stats', () => {
  let items = setTitleRating([], sampleMovie, 9, '2026-10-01T12:00:00.000Z');
  items = setTitleRating(items, sampleSeries, 8, '2026-10-02T12:00:00.000Z');

  const stats = computeHistoryStats(items);
  assert.equal(stats.totalMovies, 1);
  assert.equal(stats.totalSeries, 1);
  assert.equal(stats.averageRating, 8.5);
  assert.equal(stats.favoriteGenres[0].id, 18); // Драма встречается в обоих

  const profile = buildRecommendationProfile(items);
  assert.equal(profile.hasPersonalProfile, true);
  assert.ok(profile.topMovieGenres.includes(12));
  assert.ok(profile.topTvGenres.includes(18));
});

test('parseLibraryStorage handles corrupted JSON and wrong schema versions safely', () => {
  assert.deepEqual(parseLibraryStorage(null), { version: LIBRARY_SCHEMA_VERSION, items: [] });
  assert.deepEqual(parseLibraryStorage('{broken json'), {
    version: LIBRARY_SCHEMA_VERSION,
    items: [],
  });
  assert.deepEqual(parseLibraryStorage(JSON.stringify({ version: 99, items: [] })), {
    version: LIBRARY_SCHEMA_VERSION,
    items: [],
  });
});
