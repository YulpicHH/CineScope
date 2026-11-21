import {
  DEMO_TITLES,
  getGenreNameById,
  MOVIE_GENRES,
  TV_GENRES,
} from '../data/demoTitles';
import type {
  CastMember,
  CatalogFilters,
  CatalogMediaScope,
  CrewMember,
  Genre,
  MediaItem,
  MediaType,
  Movie,
  Series,
  TitleDetailsData,
  VideoItem,
} from '../types';
import {
  ANIME_ORIGIN_COUNTRY,
  buildCatalogSortComparator,
  buildDiscoverGenreQuery,
  getAnimeGenreList,
  getAnimeMoodGenresForMediaType,
  getMediaItemKey,
  getUnifiedGenreList,
  interleaveMediaStreams,
  isAnimeItem,
  itemMatchesCountry,
  itemMatchesGenres,
  itemMatchesMoods,
} from '../utils/catalogHelpers';
import { filterDemoCatalog } from '../utils/demoFilter';
import { buildTmdbImageUrl, type TmdbImageSize } from '../utils/imageUrl';
import { getMoodGenresForMediaType } from '../utils/moodMapping';
import {
  filterAndPaginatePersonCredits,
  type PersonCreditEntry,
} from '../utils/personFilmography';
import { getTmdbApiKeyValue, tmdbNativeGet } from './apiKeys';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export class TmdbApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TmdbApiError';
    this.status = status;
  }
}

export function getTmdbApiKey(): string {
  return getTmdbApiKeyValue();
}

export function hasTmdbKey(): boolean {
  return getTmdbApiKey().length > 0;
}

export function getTmdbImageUrl(
  path: string | null,
  size: TmdbImageSize = 'w500',
): string | null {
  return buildTmdbImageUrl(path, size);
}

interface RawTmdbMedia {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  genres?: Array<{ id: number; name: string }>;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  origin_country?: string[];
  original_language?: string;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  runtime?: number | null;
  number_of_seasons?: number | null;
  number_of_episodes?: number | null;
  episode_run_time?: number[];
  media_type?: string;
}

interface TmdbListResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: RawTmdbMedia[];
}

interface TmdbPersonSearchResponse {
  results: Array<{
    id: number;
    name: string;
    known_for_department?: string;
    known_for?: RawTmdbMedia[];
  }>;
}

interface RawPersonCreditMedia extends RawTmdbMedia {
  character?: string;
}

interface TmdbPersonCombinedCreditsResponse {
  id?: number;
  cast?: RawPersonCreditMedia[];
  crew?: RawPersonCreditMedia[];
}

const PERSON_CREDITS_CACHE_TTL_MS = 15 * 60 * 1000;
const personCreditsCache = new Map<
  string,
  { entries: PersonCreditEntry[]; fetchedAt: number }
>();

interface TmdbDetailsRaw extends RawTmdbMedia {
  credits?: {
    cast?: Array<{
      id: number;
      name: string;
      character?: string;
      profile_path?: string | null;
    }>;
    crew?: Array<{
      id: number;
      name: string;
      job?: string;
      department?: string;
    }>;
  };
  videos?: {
    results?: Array<{
      id: string;
      key: string;
      name: string;
      site: string;
      type: string;
      official?: boolean;
    }>;
  };
  similar?: {
    results?: RawTmdbMedia[];
  };
}

function normalizeMediaItem(raw: RawTmdbMedia, forcedType?: MediaType): MediaItem {
  const mediaType: MediaType =
    forcedType ?? (raw.media_type === 'tv' || raw.name ? 'tv' : 'movie');
  const releaseDate =
    mediaType === 'movie' ? (raw.release_date ?? '') : (raw.first_air_date ?? '');
  const year = releaseDate ? releaseDate.slice(0, 4) : '';
  const genreIds = Array.isArray(raw.genre_ids)
    ? raw.genre_ids
    : Array.isArray(raw.genres)
      ? raw.genres.map((g) => g.id)
      : [];
  const genres: Genre[] = Array.isArray(raw.genres)
    ? raw.genres
    : genreIds.map((id) => ({ id, name: getGenreNameById(id, mediaType) }));

  const common = {
    id: raw.id,
    title: raw.title ?? raw.name ?? 'Без названия',
    originalTitle: raw.original_title ?? raw.original_name ?? '',
    overview: raw.overview ?? '',
    posterPath: raw.poster_path ?? null,
    backdropPath: raw.backdrop_path ?? null,
    releaseDate,
    year,
    genreIds,
    genres,
    voteAverage: typeof raw.vote_average === 'number' ? Number(raw.vote_average.toFixed(1)) : 0,
    voteCount: typeof raw.vote_count === 'number' ? raw.vote_count : 0,
    popularity: typeof raw.popularity === 'number' ? raw.popularity : 0,
    originCountry: Array.isArray(raw.origin_country)
      ? raw.origin_country
      : Array.isArray(raw.production_countries)
        ? raw.production_countries.map((c) => c.iso_3166_1)
        : [],
    isDemoData: false,
  };

  if (mediaType === 'movie') {
    const movie: Movie = {
      ...common,
      mediaType: 'movie',
      runtime: typeof raw.runtime === 'number' ? raw.runtime : null,
    };
    return movie;
  }

  const series: Series = {
    ...common,
    mediaType: 'tv',
    numberOfSeasons: typeof raw.number_of_seasons === 'number' ? raw.number_of_seasons : null,
    numberOfEpisodes: typeof raw.number_of_episodes === 'number' ? raw.number_of_episodes : null,
    episodeRuntime:
      Array.isArray(raw.episode_run_time) && raw.episode_run_time.length > 0
        ? raw.episode_run_time[0]
        : null,
  };
  return series;
}

async function tmdbFetch<T>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
  signal?: AbortSignal,
): Promise<T> {
  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    throw new TmdbApiError('Ключ TMDB API не задан.', 401);
  }

  const queryPairs: Array<[string, string]> = [];
  if (!params.language) {
    queryPairs.push(['language', 'ru-RU']);
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      queryPairs.push([key, String(value)]);
    }
  }

  // В Tauri (Android TV / SberBox, macOS, Windows) используем Rust HTTP-клиент (rustls-tls)
  const nativeResponse = await tmdbNativeGet(endpoint, queryPairs, apiKey);
  if (nativeResponse) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (nativeResponse.networkError || nativeResponse.status === 0) {
      throw new TmdbApiError(
        'Сетевая ошибка при обращении к TMDB. Проверьте подключение к интернету или VPN.',
        0,
      );
    }
    if (!nativeResponse.ok) {
      if (nativeResponse.status === 401) {
        throw new TmdbApiError(
          'Неверный ключ TMDB API (401). Проверьте ключ в настройках приложения.',
          401,
        );
      }
      if (nativeResponse.status === 404) {
        throw new TmdbApiError('Запрошенный тайтл не найден в каталоге TMDB.', 404);
      }
      if (nativeResponse.status === 429) {
        throw new TmdbApiError(
          'Превышен лимит запросов к TMDB API. Повторите чуть позже.',
          429,
        );
      }
      throw new TmdbApiError(
        `Ошибка TMDB API (${nativeResponse.status}).`,
        nativeResponse.status,
      );
    }
    try {
      return JSON.parse(nativeResponse.body ?? '{}') as T;
    } catch {
      throw new TmdbApiError('Получен некорректный ответ от TMDB API.', 502);
    }
  }

  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of queryPairs) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new TmdbApiError(
      'Сетевая ошибка при обращении к TMDB. Проверьте подключение к интернету.',
      0,
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new TmdbApiError(
        'Неверный ключ TMDB API (401). Проверьте ключ в настройках приложения.',
        401,
      );
    }
    if (response.status === 404) {
      throw new TmdbApiError('Запрошенный тайтл не найден в каталоге TMDB.', 404);
    }
    if (response.status === 429) {
      throw new TmdbApiError('Превышен лимит запросов к TMDB API. Повторите чуть позже.', 429);
    }
    throw new TmdbApiError(`Ошибка TMDB API (${response.status}).`, response.status);
  }

  return (await response.json()) as T;
}

export async function getGenresList(
  mediaType: CatalogMediaScope,
  useDemo: boolean,
): Promise<Genre[]> {
  if (mediaType === 'all') {
    return getUnifiedGenreList();
  }
  if (mediaType === 'anime') {
    return getAnimeGenreList();
  }
  if (useDemo || !hasTmdbKey()) {
    return mediaType === 'movie' ? MOVIE_GENRES : TV_GENRES;
  }
  try {
    const data = await tmdbFetch<{ genres: Genre[] }>(`/genre/${mediaType}/list`);
    return data.genres;
  } catch {
    return mediaType === 'movie' ? MOVIE_GENRES : TV_GENRES;
  }
}

export interface HomeSectionsData {
  hero: MediaItem;
  trending: MediaItem[];
  topRated: MediaItem[];
  nowPlaying: MediaItem[];
  popularSeries: MediaItem[];
}

export async function getHomeSections(useDemo: boolean): Promise<HomeSectionsData> {
  if (useDemo || !hasTmdbKey()) {
    const movies = DEMO_TITLES.filter((d) => d.item.mediaType === 'movie').map((d) => d.item);
    const series = DEMO_TITLES.filter((d) => d.item.mediaType === 'tv').map((d) => d.item);
    return {
      hero: movies[1] ?? movies[0],
      trending: [...movies].sort((a, b) => b.popularity - a.popularity),
      topRated: [...movies].sort((a, b) => b.voteAverage - a.voteAverage),
      nowPlaying: [...movies].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)),
      popularSeries: [...series].sort((a, b) => b.popularity - a.popularity),
    };
  }

  const [trendingRes, topRatedRes, nowPlayingRes, popularTvRes] = await Promise.all([
    tmdbFetch<TmdbListResponse>('/trending/movie/week'),
    tmdbFetch<TmdbListResponse>('/movie/top_rated'),
    tmdbFetch<TmdbListResponse>('/movie/now_playing'),
    tmdbFetch<TmdbListResponse>('/tv/popular'),
  ]);

  const trending = trendingRes.results.map((r) => normalizeMediaItem(r, 'movie'));
  const topRated = topRatedRes.results.map((r) => normalizeMediaItem(r, 'movie'));
  const nowPlaying = nowPlayingRes.results.map((r) => normalizeMediaItem(r, 'movie'));
  const popularSeries = popularTvRes.results.map((r) => normalizeMediaItem(r, 'tv'));

  const hero =
    trending.find((item) => item.backdropPath && item.overview.trim().length > 20) ??
    trending[0] ??
    topRated[0];

  return {
    hero,
    trending,
    topRated,
    nowPlaying,
    popularSeries,
  };
}

export interface PaginatedCatalogResult {
  items: MediaItem[];
  page: number;
  totalPages: number;
  totalResults: number;
}

async function fetchDiscoverForSingleType(
  targetType: MediaType,
  filters: CatalogFilters,
  page: number,
  signal?: AbortSignal,
): Promise<{ items: MediaItem[]; totalPages: number; totalResults: number }> {
  const isAnime = filters.mediaType === 'anime';
  const moodConfig =
    filters.moods.length > 0
      ? isAnime
        ? {
            ...getAnimeMoodGenresForMediaType(filters.moods, targetType),
            minVoteCount: filters.moods.includes('plot_twist') ? 300 : 80,
          }
        : getMoodGenresForMediaType(filters.moods, targetType)
      : null;

  const effectiveSort =
    filters.sortBy === 'popularity.desc' &&
    moodConfig?.sortBy === 'vote_average.desc'
      ? 'vote_average.desc'
      : filters.sortBy;

  const sortBy =
    targetType === 'tv' && effectiveSort === 'release_date.desc'
      ? 'first_air_date.desc'
      : effectiveSort;

  const minVoteCount =
    effectiveSort === 'vote_average.desc'
      ? Math.max(isAnime ? 100 : 150, moodConfig?.minVoteCount ?? 150)
      : Math.max(20, moodConfig ? 80 : 20);

  const withGenres = buildDiscoverGenreQuery(
    filters.genreIds,
    filters.moods,
    filters.mediaType,
    targetType,
  );

  const originCountry = isAnime
    ? ANIME_ORIGIN_COUNTRY
    : filters.country || undefined;

  const params: Record<string, string | number | undefined> = {
    page,
    sort_by: sortBy,
    include_adult: 'false',
    with_genres: withGenres,
    with_origin_country: originCountry,
    'vote_average.gte': filters.minRating > 0 ? filters.minRating : undefined,
    'vote_count.gte': minVoteCount,
  };

  if (filters.year) {
    if (targetType === 'movie') {
      params.primary_release_year = filters.year;
    } else {
      params.first_air_date_year = filters.year;
    }
  }

  const data = await tmdbFetch<TmdbListResponse>(
    `/discover/${targetType}`,
    params,
    signal,
  );

  let normalized = data.results.map((r) => normalizeMediaItem(r, targetType));

  // Уточняем выдачу по настроению, если выбрано несколько настроений в аниме или связка жанр + настроение
  const needsClientMoodFilter =
    filters.moods.length > 0 &&
    (filters.genreIds.length > 0 || (isAnime && filters.moods.length > 1));

  if (needsClientMoodFilter) {
    const moodMatched = normalized.filter((item) =>
      itemMatchesMoods(item, filters.moods, filters.mediaType),
    );
    if (moodMatched.length > 0) {
      normalized = moodMatched;
    }
  }

  return {
    items: normalized,
    totalPages: Math.min(data.total_pages, 500),
    totalResults: data.total_results,
  };
}

async function fetchPersonCombinedCredits(
  personId: number,
  signal?: AbortSignal,
): Promise<PersonCreditEntry[]> {
  const keyTag = getTmdbApiKey().slice(-8);
  const cacheKey = `${personId}:${keyTag}`;
  const cached = personCreditsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PERSON_CREDITS_CACHE_TTL_MS) {
    return cached.entries;
  }

  const data = await tmdbFetch<TmdbPersonCombinedCreditsResponse>(
    `/person/${personId}/combined_credits`,
    {},
    signal,
  );

  const rawCast = Array.isArray(data.cast) ? data.cast : [];
  const entries: PersonCreditEntry[] = [];

  for (const raw of rawCast) {
    if (!raw || typeof raw.id !== 'number') continue;
    const mediaType: MediaType | null =
      raw.media_type === 'movie'
        ? 'movie'
        : raw.media_type === 'tv'
          ? 'tv'
          : raw.title
            ? 'movie'
            : raw.name
              ? 'tv'
              : null;
    if (!mediaType) continue;

    entries.push({
      item: normalizeMediaItem(raw, mediaType),
      originalLanguage: raw.original_language,
      character: raw.character,
    });
  }

  personCreditsCache.set(cacheKey, {
    entries,
    fetchedAt: Date.now(),
  });
  if (personCreditsCache.size > 24) {
    const oldest = personCreditsCache.keys().next().value;
    if (oldest !== undefined) personCreditsCache.delete(oldest);
  }

  return entries;
}

export async function fetchCatalogPage(
  filters: CatalogFilters,
  page: number,
  useDemo: boolean,
  signal?: AbortSignal,
): Promise<PaginatedCatalogResult> {
  if (useDemo || !hasTmdbKey()) {
    const all = filterDemoCatalog(filters);
    return {
      items: all,
      page: 1,
      totalPages: 1,
      totalResults: all.length,
    };
  }

  // Полная фильмография выбранного актёра (все фильмы и сериалы с его участием)
  if (filters.personId && filters.personId > 0) {
    const entries = await fetchPersonCombinedCredits(filters.personId, signal);
    return filterAndPaginatePersonCredits(entries, filters, page);
  }

  const trimmedQuery = filters.query.trim();
  const isDualStream =
    filters.mediaType === 'all' || filters.mediaType === 'anime';

  if (trimmedQuery.length > 0) {
    const searchMovie = isDualStream || filters.mediaType === 'movie';
    const searchTv = isDualStream || filters.mediaType === 'tv';

    const emptyList: TmdbListResponse = {
      page,
      total_pages: 1,
      total_results: 0,
      results: [],
    };

    const [movieRes, tvRes, personRes] = await Promise.all([
      searchMovie
        ? tmdbFetch<TmdbListResponse>(
            '/search/movie',
            { query: trimmedQuery, page, include_adult: 'false' },
            signal,
          )
        : Promise.resolve(emptyList),
      searchTv
        ? tmdbFetch<TmdbListResponse>(
            '/search/tv',
            { query: trimmedQuery, page, include_adult: 'false' },
            signal,
          )
        : Promise.resolve(emptyList),
      page === 1
        ? tmdbFetch<TmdbPersonSearchResponse>(
            '/search/person',
            { query: trimmedQuery, page: 1, include_adult: 'false' },
            signal,
          ).catch(() => ({ results: [] }))
        : Promise.resolve({ results: [] }),
    ]);

    const seenKeys = new Set<string>();
    const combined: Array<{ item: MediaItem; originalLanguage?: string }> = [];

    const pushRaw = (raw: RawTmdbMedia, forcedType: MediaType) => {
      const key = `${forcedType}:${raw.id}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      combined.push({
        item: normalizeMediaItem(raw, forcedType),
        originalLanguage: raw.original_language,
      });
    };

    for (const raw of movieRes.results) {
      pushRaw(raw, 'movie');
    }
    for (const raw of tvRes.results) {
      pushRaw(raw, 'tv');
    }

    for (const person of personRes.results.slice(0, 5)) {
      for (const work of person.known_for ?? []) {
        const workType: MediaType = work.media_type === 'tv' ? 'tv' : 'movie';
        if (isDualStream || workType === filters.mediaType) {
          pushRaw(work, workType);
        }
      }
    }

    const filtered = combined
      .filter(({ item, originalLanguage }) =>
        filters.mediaType === 'anime'
          ? isAnimeItem(item, originalLanguage)
          : true,
      )
      .filter(({ item }) =>
        itemMatchesGenres(item, filters.genreIds, filters.mediaType),
      )
      .filter(({ item }) =>
        itemMatchesMoods(item, filters.moods, filters.mediaType),
      )
      .filter(({ item, originalLanguage }) =>
        filters.mediaType === 'anime'
          ? true
          : itemMatchesCountry(item, filters.country, originalLanguage),
      )
      .filter(({ item }) => (filters.year ? item.year === filters.year : true))
      .filter(({ item }) =>
        filters.minRating > 0 ? item.voteAverage >= filters.minRating : true,
      )
      .map(({ item }) => item)
      .sort(buildCatalogSortComparator(filters.sortBy));

    const maxPages = Math.max(
      searchMovie ? movieRes.total_pages : 1,
      searchTv ? tvRes.total_pages : 1,
    );

    return {
      items: filtered,
      page,
      totalPages: Math.min(maxPages, 500),
      totalResults: filtered.length,
    };
  }

  // Режим discover: объединённый поток («Все» или «Аниме»)
  if (filters.mediaType === 'all' || filters.mediaType === 'anime') {
    const [movieSettled, tvSettled] = await Promise.allSettled([
      fetchDiscoverForSingleType('movie', filters, page, signal),
      fetchDiscoverForSingleType('tv', filters, page, signal),
    ]);

    if (
      movieSettled.status === 'rejected' &&
      tvSettled.status === 'rejected'
    ) {
      throw movieSettled.reason;
    }

    const movieRes =
      movieSettled.status === 'fulfilled'
        ? movieSettled.value
        : { items: [] as MediaItem[], totalPages: 1, totalResults: 0 };
    const tvRes =
      tvSettled.status === 'fulfilled'
        ? tvSettled.value
        : { items: [] as MediaItem[], totalPages: 1, totalResults: 0 };

    let merged: MediaItem[];
    if (filters.sortBy === 'popularity.desc') {
      // В «Аниме» начинаем чередование с сериалов, в «Все» — с фильмов
      merged =
        filters.mediaType === 'anime'
          ? interleaveMediaStreams(tvRes.items, movieRes.items)
          : interleaveMediaStreams(movieRes.items, tvRes.items);
    } else {
      const seenKeys = new Set<string>();
      merged = [];
      for (const item of [...movieRes.items, ...tvRes.items]) {
        const key = getMediaItemKey(item);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          merged.push(item);
        }
      }
      merged.sort(buildCatalogSortComparator(filters.sortBy));
    }

    return {
      items: merged,
      page,
      totalPages: Math.max(movieRes.totalPages, tvRes.totalPages, 1),
      totalResults: movieRes.totalResults + tvRes.totalResults,
    };
  }

  const single = await fetchDiscoverForSingleType(
    filters.mediaType,
    filters,
    page,
    signal,
  );

  return {
    items: single.items,
    page,
    totalPages: single.totalPages,
    totalResults: single.totalResults,
  };
}

function sortVideosByPriority(videos: VideoItem[]): VideoItem[] {
  const score = (v: VideoItem): number => {
    let s = 0;
    if (v.site === 'YouTube') s += 100;
    if (v.type === 'Trailer') s += 50;
    else if (v.type === 'Teaser') s += 20;
    if (v.official) s += 30;
    return s;
  };
  return [...videos]
    .filter((v) => v.site === 'YouTube')
    .sort((a, b) => score(b) - score(a));
}

export async function getTitleDetails(
  mediaType: MediaType,
  id: number,
  useDemo: boolean,
): Promise<TitleDetailsData> {
  if (useDemo || !hasTmdbKey()) {
    const found =
      DEMO_TITLES.find((d) => d.item.id === id && d.item.mediaType === mediaType) ??
      DEMO_TITLES.find((d) => d.item.id === id);
    if (!found) {
      throw new TmdbApiError('Тайтл не найден в демо-каталоге.', 404);
    }

    const similar = DEMO_TITLES.filter(
      (d) =>
        d.item.id !== found.item.id &&
        d.item.genreIds.some((gid) => found.item.genreIds.includes(gid)),
    )
      .slice(0, 6)
      .map((d) => d.item);

    return {
      item: found.item,
      cast: found.cast.map((c, idx) => ({
        id: 1000 + idx,
        name: c.name,
        character: c.character,
        profilePath: null,
      })),
      directors: found.directors.map((name, idx) => ({
        id: 2000 + idx,
        name,
        job: 'Режиссёр',
        department: 'Directing',
      })),
      writers: found.writers.map((name, idx) => ({
        id: 3000 + idx,
        name,
        job: 'Сценарист',
        department: 'Writing',
      })),
      videos: [],
      similar,
      countries: found.countries,
    };
  }

  const raw = await tmdbFetch<TmdbDetailsRaw>(`/${mediaType}/${id}`, {
    append_to_response: 'credits,videos,similar',
  });

  const item = normalizeMediaItem(raw, mediaType);
  const cast: CastMember[] = (raw.credits?.cast ?? []).slice(0, 14).map((c) => ({
    id: c.id,
    name: c.name,
    character: c.character ?? '',
    profilePath: c.profile_path ?? null,
  }));

  const crewRaw = raw.credits?.crew ?? [];
  const directors: CrewMember[] = crewRaw
    .filter((c) => c.job === 'Director' || c.job === 'Series Director')
    .slice(0, 4)
    .map((c) => ({
      id: c.id,
      name: c.name,
      job: 'Режиссёр',
      department: c.department ?? 'Directing',
    }));

  const writers: CrewMember[] = crewRaw
    .filter((c) => c.department === 'Writing' || c.job === 'Writer' || c.job === 'Screenplay')
    .slice(0, 4)
    .map((c) => ({
      id: c.id,
      name: c.name,
      job: c.job ?? 'Сценарист',
      department: c.department ?? 'Writing',
    }));

  let videos: VideoItem[] = (raw.videos?.results ?? []).map((v) => ({
    id: v.id,
    key: v.key,
    name: v.name,
    site: v.site,
    type: v.type,
    official: Boolean(v.official),
  }));

  if (sortVideosByPriority(videos).length === 0) {
    try {
      const enVideos = await tmdbFetch<{
        results?: Array<{
          id: string;
          key: string;
          name: string;
          site: string;
          type: string;
          official?: boolean;
        }>;
      }>(`/${mediaType}/${id}/videos`, { language: 'en-US' });
      videos = (enVideos.results ?? []).map((v) => ({
        id: v.id,
        key: v.key,
        name: v.name,
        site: v.site,
        type: v.type,
        official: Boolean(v.official),
      }));
    } catch {
      // Игнорируем ошибку добора англоязычных трейлеров
    }
  }

  const similar = (raw.similar?.results ?? [])
    .slice(0, 12)
    .map((s) => normalizeMediaItem(s, mediaType));

  const countries = (raw.production_countries ?? []).map((c) => c.name);

  return {
    item,
    cast,
    directors,
    writers,
    videos: sortVideosByPriority(videos),
    similar,
    countries: countries.length > 0 ? countries : item.originCountry,
  };
}

export async function fetchRandomCatalogCandidates(
  filters: CatalogFilters,
  totalPages: number,
  useDemo: boolean,
  signal?: AbortSignal,
): Promise<MediaItem[]> {
  if (useDemo || !hasTmdbKey()) {
    return filterDemoCatalog(filters);
  }
  const maxPage = Math.max(1, Math.min(totalPages, 15));
  const randomPage =
    maxPage > 1 ? Math.floor(Math.random() * (maxPage - 1)) + 2 : 1;
  const result = await fetchCatalogPage(filters, randomPage, false, signal);
  return result.items;
}

export async function getRecommendedForUser(params: {
  topMovieGenres: number[];
  topTvGenres: number[];
  excludeKeys: Set<string>;
  useDemo: boolean;
}): Promise<MediaItem[]> {
  if (params.useDemo || !hasTmdbKey()) {
    const preferred = new Set([...params.topMovieGenres, ...params.topTvGenres]);
    const pool = DEMO_TITLES.map((d) => d.item).filter(
      (item) => !params.excludeKeys.has(`${item.mediaType}:${item.id}`),
    );
    if (preferred.size === 0) {
      return pool.sort((a, b) => b.voteAverage - a.voteAverage).slice(0, 8);
    }
    return pool
      .sort((a, b) => {
        const aScore = a.genreIds.filter((g) => preferred.has(g)).length;
        const bScore = b.genreIds.filter((g) => preferred.has(g)).length;
        if (bScore !== aScore) return bScore - aScore;
        return b.voteAverage - a.voteAverage;
      })
      .slice(0, 8);
  }

  const requests: Promise<MediaItem[]>[] = [];

  if (params.topMovieGenres.length > 0) {
    requests.push(
      tmdbFetch<TmdbListResponse>('/discover/movie', {
        with_genres: params.topMovieGenres.join('|'),
        sort_by: 'vote_average.desc',
        'vote_count.gte': 500,
        page: 1,
      }).then((r) => r.results.map((item) => normalizeMediaItem(item, 'movie'))),
    );
  }

  if (params.topTvGenres.length > 0) {
    requests.push(
      tmdbFetch<TmdbListResponse>('/discover/tv', {
        with_genres: params.topTvGenres.join('|'),
        sort_by: 'vote_average.desc',
        'vote_count.gte': 300,
        page: 1,
      }).then((r) => r.results.map((item) => normalizeMediaItem(item, 'tv'))),
    );
  }

  if (requests.length === 0) {
    const popular = await tmdbFetch<TmdbListResponse>('/movie/popular');
    return popular.results
      .map((r) => normalizeMediaItem(r, 'movie'))
      .filter((item) => !params.excludeKeys.has(`${item.mediaType}:${item.id}`))
      .slice(0, 10);
  }

  const results = (await Promise.all(requests)).flat();
  const seen = new Set<string>();
  const filtered: MediaItem[] = [];
  for (const item of results) {
    const key = `${item.mediaType}:${item.id}`;
    if (!params.excludeKeys.has(key) && !seen.has(key)) {
      seen.add(key);
      filtered.push(item);
    }
  }
  return filtered.slice(0, 12);
}
