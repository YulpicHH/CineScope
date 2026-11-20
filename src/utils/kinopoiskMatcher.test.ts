import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKinokinoUrl,
  isValidKinopoiskCacheRecord,
  mapKinopoiskTypeToKinokino,
  selectBestKinopoiskMatch,
  type KinopoiskApiCandidate,
} from './kinopoiskMatcher';

test('buildKinokinoUrl builds exact film and series URLs without extra params', () => {
  assert.equal(
    buildKinokinoUrl(412344, 'movie'),
    'https://kinokino.vip/film/412344/',
  );
  assert.equal(
    buildKinokinoUrl(404900, 'series'),
    'https://kinokino.vip/series/404900/',
  );
  assert.equal(buildKinokinoUrl(0, 'movie'), null);
  assert.equal(buildKinokinoUrl(-5, 'series'), null);
  assert.equal(buildKinokinoUrl(12.5, 'movie'), null);
});

test('mapKinopoiskTypeToKinokino maps films, series, mini-series, and anime formats correctly', () => {
  assert.equal(mapKinopoiskTypeToKinokino('FILM'), 'movie');
  assert.equal(mapKinopoiskTypeToKinokino('VIDEO'), 'movie');
  assert.equal(mapKinopoiskTypeToKinokino('TV_SERIES'), 'series');
  assert.equal(mapKinopoiskTypeToKinokino('MINI_SERIES'), 'series');
  assert.equal(mapKinopoiskTypeToKinokino('TV_SHOW'), 'series');
  assert.equal(mapKinopoiskTypeToKinokino('UNKNOWN'), null);
});

test('selectBestKinopoiskMatch matches movie accurately by title, original title, year, and type', () => {
  const candidates: KinopoiskApiCandidate[] = [
    {
      kinopoiskId: 999111,
      nameRu: 'Интерстеллар',
      nameOriginal: 'Interstellar',
      type: 'TV_SERIES',
      year: 2014,
    },
    {
      kinopoiskId: 258687,
      nameRu: 'Интерстеллар',
      nameOriginal: 'Interstellar',
      type: 'FILM',
      year: 2014,
    },
    {
      kinopoiskId: 123456,
      nameRu: 'Интерстеллар: За горизонтом',
      nameOriginal: 'Beyond Interstellar',
      type: 'FILM',
      year: 2015,
    },
  ];

  const result = selectBestKinopoiskMatch(
    {
      tmdbId: 157336,
      mediaType: 'movie',
      title: 'Интерстеллар',
      originalTitle: 'Interstellar',
      year: '2014',
    },
    candidates,
  );

  assert.equal(result.status, 'matched');
  if (result.status === 'matched') {
    assert.equal(result.kinopoiskId, 258687);
    assert.equal(result.kinopoiskMediaType, 'movie');
  }
});

test('selectBestKinopoiskMatch supports anime series and rejects movie mismatch', () => {
  const candidates: KinopoiskApiCandidate[] = [
    {
      kinopoiskId: 777001,
      nameRu: 'Атака титанов: Фильм первый',
      nameOriginal: 'Shingeki no Kyojin Zenpen',
      type: 'FILM',
      year: 2014,
    },
    {
      kinopoiskId: 749374,
      nameRu: 'Атака титанов',
      nameOriginal: 'Shingeki no Kyojin',
      type: 'TV_SERIES',
      year: 2013,
    },
  ];

  const result = selectBestKinopoiskMatch(
    {
      tmdbId: 1429,
      mediaType: 'tv',
      title: 'Атака титанов',
      originalTitle: '進撃の巨人',
      year: '2013',
    },
    candidates,
  );

  assert.equal(result.status, 'matched');
  if (result.status === 'matched') {
    assert.equal(result.kinopoiskId, 749374);
    assert.equal(result.kinopoiskMediaType, 'series');
    assert.equal(
      buildKinokinoUrl(result.kinopoiskId, result.kinopoiskMediaType),
      'https://kinokino.vip/series/749374/',
    );
  }
});

test('selectBestKinopoiskMatch rejects remakes from different years and ambiguous duplicates', () => {
  const wrongYear = selectBestKinopoiskMatch(
    {
      tmdbId: 111,
      mediaType: 'movie',
      title: 'Дюна',
      originalTitle: 'Dune',
      year: '2021',
    },
    [
      {
        kinopoiskId: 3966,
        nameRu: 'Дюна',
        nameOriginal: 'Dune',
        type: 'FILM',
        year: 1984,
      },
    ],
  );
  assert.equal(wrongYear.status, 'not_found');

  const ambiguous = selectBestKinopoiskMatch(
    {
      tmdbId: 222,
      mediaType: 'movie',
      title: 'Двойник',
      originalTitle: 'The Double',
      year: '2013',
    },
    [
      {
        kinopoiskId: 5001,
        nameRu: 'Двойник',
        nameOriginal: 'The Double',
        type: 'FILM',
        year: 2013,
      },
      {
        kinopoiskId: 5002,
        nameRu: 'Двойник',
        nameOriginal: 'The Double',
        type: 'FILM',
        year: 2013,
      },
    ],
  );
  assert.equal(ambiguous.status, 'ambiguous');
});

test('isValidKinopoiskCacheRecord rejects corrupted or invalid cached records', () => {
  assert.equal(
    isValidKinopoiskCacheRecord({
      tmdb_id: 157336,
      kinopoisk_id: 258687,
      media_type: 'movie',
      last_updated: '2026-11-18',
    }),
    true,
  );
  assert.equal(
    isValidKinopoiskCacheRecord({
      tmdb_id: 157336,
      kinopoisk_id: -1,
      media_type: 'movie',
      last_updated: '2026-11-18',
    }),
    false,
  );
  assert.equal(
    isValidKinopoiskCacheRecord({
      tmdb_id: 157336,
      kinopoisk_id: 258687,
      media_type: 'anime',
      last_updated: '2026-11-18',
    }),
    false,
  );
});
