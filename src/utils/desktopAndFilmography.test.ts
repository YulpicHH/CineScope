import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { CatalogFilters, Movie, Series } from '../types';
import {
  buildCatalogCacheKey,
  clearCatalogSnapshot,
  getLastCatalogSearch,
  getMatchingCatalogSnapshot,
  saveCatalogSnapshot,
  updateCatalogSnapshotPosition,
} from './catalogSessionCache';
import { filterDemoCatalog } from './demoFilter';
import {
  deduplicatePersonCreditEntries,
  filterAndPaginatePersonCredits,
  type PersonCreditEntry,
} from './personFilmography';
import {
  clearAllRouteViewCaches,
  getHomeRecommendedCache,
  getHomeSectionsCache,
  getLibraryViewState,
  getRouteScroll,
  isMouseBackButton,
  saveCarouselScroll,
  saveHomeRecommendedCache,
  saveHomeSectionsCache,
  saveLibraryViewState,
  saveRouteScroll,
  shouldHandleDesktopBackShortcut,
} from './routeViewCache';

function makeMovie(overrides: Partial<Movie> & { id: number; title: string }): Movie {
  return {
    mediaType: 'movie',
    originalTitle: overrides.title,
    overview: 'Описание фильма',
    posterPath: '/poster.jpg',
    backdropPath: null,
    releaseDate: '2020-05-01',
    year: '2020',
    genreIds: [18],
    genres: [{ id: 18, name: 'Драма' }],
    voteAverage: 7.5,
    voteCount: 500,
    popularity: 50,
    originCountry: ['US'],
    runtime: 120,
    ...overrides,
  };
}

function makeSeries(overrides: Partial<Series> & { id: number; title: string }): Series {
  return {
    mediaType: 'tv',
    originalTitle: overrides.title,
    overview: 'Описание сериала',
    posterPath: '/tv.jpg',
    backdropPath: null,
    releaseDate: '2021-09-10',
    year: '2021',
    genreIds: [18],
    genres: [{ id: 18, name: 'Драма' }],
    voteAverage: 8.2,
    voteCount: 800,
    popularity: 75,
    originCountry: ['GB'],
    numberOfSeasons: 2,
    numberOfEpisodes: 16,
    episodeRuntime: 50,
    ...overrides,
  };
}

function makeBaseFilters(overrides: Partial<CatalogFilters> = {}): CatalogFilters {
  return {
    mediaType: 'all',
    query: '',
    moods: [],
    genreIds: [],
    country: '',
    year: '',
    minRating: 0,
    sortBy: 'popularity.desc',
    hideWatched: false,
    personId: null,
    personName: '',
    ...overrides,
  };
}

describe('personFilmography (full actor filmography)', () => {
  it('deduplicates multiple roles in the same movie/series keeping the richest record', () => {
    const entries: PersonCreditEntry[] = [
      {
        item: makeMovie({
          id: 101,
          title: 'Фильм А',
          posterPath: null,
          overview: '',
          voteCount: 0,
          popularity: 10,
        }),
        character: 'Роль 1',
      },
      {
        item: makeMovie({
          id: 101,
          title: 'Фильм А',
          posterPath: '/rich.jpg',
          overview: 'Полное описание',
          voteCount: 1500,
          popularity: 80,
        }),
        character: 'Роль 2',
      },
      {
        item: makeSeries({ id: 101, title: 'Сериал с тем же ID' }),
        character: 'Камео',
      },
    ];

    const deduped = deduplicatePersonCreditEntries(entries);
    assert.equal(deduped.length, 2);
    const movieEntry = deduped.find((e) => e.item.mediaType === 'movie');
    assert.equal(movieEntry?.item.posterPath, '/rich.jpg');
  });

  it('returns ALL actor works beyond 3 items with filtering, sorting, and pagination', () => {
    const entries: PersonCreditEntry[] = [];
    for (let i = 1; i <= 25; i++) {
      entries.push({
        item: makeMovie({
          id: i,
          title: `Фильм актёра ${i}`,
          popularity: 100 - i,
          voteAverage: 6 + (i % 4),
          year: i <= 5 ? '2023' : '2018',
          releaseDate: i <= 5 ? '2023-03-10' : '2018-06-01',
        }),
        character: `Персонаж ${i}`,
      });
    }
    entries.push({
      item: makeSeries({
        id: 500,
        title: 'Острые козырьки',
        popularity: 150,
        voteAverage: 8.8,
        year: '2013',
        releaseDate: '2013-09-12',
      }),
      character: 'Томас Шелби',
    });

    const page1 = filterAndPaginatePersonCredits(
      entries,
      makeBaseFilters({ personId: 2037, personName: 'Киллиан Мёрфи' }),
      1,
      20,
    );
    assert.equal(page1.totalResults, 26);
    assert.equal(page1.totalPages, 2);
    assert.equal(page1.items.length, 20);
    assert.equal(page1.items[0].title, 'Острые козырьки');

    const page2 = filterAndPaginatePersonCredits(
      entries,
      makeBaseFilters({ personId: 2037, personName: 'Киллиан Мёрфи' }),
      2,
      20,
    );
    assert.equal(page2.items.length, 6);

    const onlyTv = filterAndPaginatePersonCredits(
      entries,
      makeBaseFilters({ mediaType: 'tv', personId: 2037 }),
      1,
      20,
    );
    assert.equal(onlyTv.totalResults, 1);
    assert.equal(onlyTv.items[0].mediaType, 'tv');

    const byCharacterQuery = filterAndPaginatePersonCredits(
      entries,
      makeBaseFilters({ query: 'шелби', personId: 2037 }),
      1,
      20,
    );
    assert.equal(byCharacterQuery.totalResults, 1);
    assert.equal(byCharacterQuery.items[0].id, 500);

    const byYear = filterAndPaginatePersonCredits(
      entries,
      makeBaseFilters({ year: '2023', personId: 2037 }),
      1,
      20,
    );
    assert.equal(byYear.totalResults, 5);
  });

  it('filters demo catalog by personName when TMDB key is absent', () => {
    const items = filterDemoCatalog(
      makeBaseFilters({ personName: 'Леонардо ДиКаприо' }),
    );
    assert.ok(items.length >= 1);
    assert.ok(items.some((item) => item.title === 'Начало'));
  });
});

describe('catalogSessionCache multi-level LRU preservation', () => {
  beforeEach(() => {
    clearCatalogSnapshot();
  });

  it('preserves distinct snapshots for main catalog and actor filmography across nested Back navigation', () => {
    const mainFilters = makeBaseFilters();
    const actorFilters = makeBaseFilters({
      personId: 6193,
      personName: 'Леонардо ДиКаприо',
    });

    const mainKey = buildCatalogCacheKey(mainFilters, false, 1);
    const actorKey = buildCatalogCacheKey(actorFilters, false, 1);
    assert.notEqual(mainKey, actorKey);

    saveCatalogSnapshot({
      cacheKey: mainKey,
      search: '',
      filters: mainFilters,
      items: [makeMovie({ id: 1, title: 'Главный каталог' })],
      page: 3,
      totalPages: 20,
      totalResults: 400,
      scrollY: 1850,
      focusedItemKey: 'movie:1',
    });

    saveCatalogSnapshot({
      cacheKey: actorKey,
      search: '?person=6193&personName=%D0%9B%D0%B5%D0%BE%D0%BD%D0%B0%D1%80%D0%B4%D0%BE',
      filters: actorFilters,
      items: [makeMovie({ id: 2, title: 'Начало' })],
      page: 2,
      totalPages: 4,
      totalResults: 72,
      scrollY: 940,
      focusedItemKey: 'movie:2',
    });

    updateCatalogSnapshotPosition(actorKey, 1120, 'movie:2');

    const restoredActor = getMatchingCatalogSnapshot(actorKey);
    assert.equal(restoredActor?.scrollY, 1120);
    assert.equal(restoredActor?.totalResults, 72);

    const restoredMain = getMatchingCatalogSnapshot(mainKey);
    assert.equal(restoredMain?.scrollY, 1850);
    assert.equal(restoredMain?.page, 3);
    assert.ok(getLastCatalogSearch().includes('person=6193'));
  });
});

describe('routeViewCache and Windows/macOS desktop back navigation', () => {
  beforeEach(() => {
    clearAllRouteViewCaches();
  });

  it('saves and restores vertical scroll and horizontal carousel scroll per route', () => {
    saveRouteScroll('/', 1420, { trending: 640 });
    saveCarouselScroll('/', 'topRated', 320);

    const restored = getRouteScroll('/');
    assert.equal(restored?.scrollY, 1420);
    assert.equal(restored?.carouselScrollLeft.trending, 640);
    assert.equal(restored?.carouselScrollLeft.topRated, 320);
  });

  it('caches Home sections, recommendations, and Library tab/scroll state', () => {
    saveHomeSectionsCache('live:1', { hero: null });
    assert.deepEqual(getHomeSectionsCache('live:1'), { hero: null });
    assert.equal(getHomeSectionsCache('live:2'), null);

    saveHomeRecommendedCache('rec:1', [makeMovie({ id: 10, title: 'Рек 1' })]);
    assert.equal(getHomeRecommendedCache('rec:1')?.length, 1);

    saveLibraryViewState({
      activeTab: 'favorites',
      searchQuery: 'дюна',
      selectedGenreId: 878,
      viewMode: 'list',
      scrollY: 780,
    });
    const lib = getLibraryViewState();
    assert.equal(lib?.activeTab, 'favorites');
    assert.equal(lib?.viewMode, 'list');
    assert.equal(lib?.scrollY, 780);
  });

  it('recognizes Windows Alt+Left, macOS Cmd+[ / Cmd+Left, mouse back, and ignores editable inputs', () => {
    // Windows Alt + ArrowLeft
    assert.equal(
      shouldHandleDesktopBackShortcut(
        { key: 'ArrowLeft', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
        'windows',
        'BODY',
      ),
      true,
    );
    // Windows rejects Cmd+[
    assert.equal(
      shouldHandleDesktopBackShortcut(
        { key: '[', code: 'BracketLeft', altKey: false, ctrlKey: false, metaKey: true, shiftKey: false },
        'windows',
        'BODY',
      ),
      false,
    );
    // macOS Cmd + [
    assert.equal(
      shouldHandleDesktopBackShortcut(
        { key: '[', code: 'BracketLeft', altKey: false, ctrlKey: false, metaKey: true, shiftKey: false },
        'macos',
        'BODY',
      ),
      true,
    );
    // macOS Cmd + ArrowLeft
    assert.equal(
      shouldHandleDesktopBackShortcut(
        { key: 'ArrowLeft', altKey: false, ctrlKey: false, metaKey: true, shiftKey: false },
        'macos',
        'A',
      ),
      true,
    );
    // macOS Cmd + [ with Russian keyboard layout (key='х', code='BracketLeft')
    assert.equal(
      shouldHandleDesktopBackShortcut(
        { key: 'х', code: 'BracketLeft', altKey: false, ctrlKey: false, metaKey: true, shiftKey: false },
        'macos',
        'BODY',
      ),
      true,
    );
    // Never fires inside text inputs or contentEditable
    assert.equal(
      shouldHandleDesktopBackShortcut(
        { key: 'ArrowLeft', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
        'windows',
        'INPUT',
      ),
      false,
    );
    assert.equal(
      shouldHandleDesktopBackShortcut(
        { key: '[', code: 'BracketLeft', altKey: false, ctrlKey: false, metaKey: true, shiftKey: false },
        'macos',
        'DIV',
        true,
      ),
      false,
    );

    assert.equal(isMouseBackButton(3), true);
    assert.equal(isMouseBackButton(0), false);
  });
});
