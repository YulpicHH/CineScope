import {
  DEMO_TITLES,
  getGenreNameById,
  MOVIE_GENRES,
  TV_GENRES,
} from '../data/demoTitles';
import type {
  CastMember,
  CatalogFilters,
  CrewMember,
  Genre,
  MediaItem,
  MediaType,
  MoodId,
  Movie,
  Series,
  TitleDetailsData,
  VideoItem,
} from '../types';
import { filterDemoByMood, filterDemoCatalog } from '../utils/demoFilter';
import { getMoodGenresForMediaType } from '../utils/moodMapping';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export class TmdbApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TmdbApiError';
    this.status = status;
  }
}

export function getTmdbApiKey(): string {
  const raw = import.meta.env.VITE_TMDB_API_KEY;
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'MY_TMDB_API_KEY') return '';
  return trimmed;
}

export function hasTmdbKey(): boolean {
  return getTmdbApiKey().length > 0;
}

export function getTmdbImageUrl(
  path: string | null,
  size: 'w300' | 'w500' | 'w780' | 'w1280' = 'w500',
): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
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
): Promise<T> {
  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    throw new TmdbApiError('Ключ TMDB API не задан.', 401);
  }

  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', apiKey);
  if (!params.language) {
    url.searchParams.set('language', 'ru-RU');
  }

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch {
    throw new TmdbApiError(
      'Сетевая ошибка при обращении к TMDB. Проверьте подключение к интернету.',
      0,
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new TmdbApiError(
        'Неверный ключ TMDB API (401). Проверьте переменную VITE_TMDB_API_KEY.',
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

export async function getGenresList(mediaType: MediaType, useDemo: boolean): Promise<Genre[]> {
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

export async function fetchCatalogPage(
  filters: CatalogFilters,
  page: number,
  useDemo: boolean,
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

  const trimmedQuery = filters.query.trim();

  if (trimmedQuery.length > 0) {
    // Поиск по названию и параллельно по персонам (актёрам и режиссёрам)
    const [titleRes, personRes] = await Promise.all([
      tmdbFetch<TmdbListResponse>(`/search/${filters.mediaType}`, {
        query: trimmedQuery,
        page,
        include_adult: 'false',
      }),
      page === 1
        ? tmdbFetch<TmdbPersonSearchResponse>('/search/person', {
            query: trimmedQuery,
            page: 1,
            include_adult: 'false',
          }).catch(() => ({ results: [] }))
        : Promise.resolve({ results: [] }),
    ]);

    const seenIds = new Set<number>();
    const combined: MediaItem[] = [];

    for (const raw of titleRes.results) {
      if (!seenIds.has(raw.id)) {
        seenIds.add(raw.id);
        combined.push(normalizeMediaItem(raw, filters.mediaType));
      }
    }

    // Добавляем известные работы найденных актёров и режиссёров нужного типа
    for (const person of personRes.results.slice(0, 5)) {
      for (const work of person.known_for ?? []) {
        const workType: MediaType = work.media_type === 'tv' ? 'tv' : 'movie';
        if (workType === filters.mediaType && !seenIds.has(work.id)) {
          seenIds.add(work.id);
          combined.push(normalizeMediaItem(work, filters.mediaType));
        }
      }
    }

    // Применяем клиентские фильтры поверх результатов поиска, чтобы фильтры работали совместно с поиском
    const filtered = combined
      .filter((item) =>
        filters.genreIds.length === 0
          ? true
          : filters.genreIds.every((gid) => item.genreIds.includes(gid)),
      )
      .filter((item) => (filters.year ? item.year === filters.year : true))
      .filter((item) => (filters.minRating > 0 ? item.voteAverage >= filters.minRating : true))
      .sort((a, b) => {
        if (filters.sortBy === 'vote_average.desc') return b.voteAverage - a.voteAverage;
        if (filters.sortBy === 'release_date.desc') return b.releaseDate.localeCompare(a.releaseDate);
        return b.popularity - a.popularity;
      });

    return {
      items: filtered,
      page: titleRes.page,
      totalPages: titleRes.total_pages,
      totalResults: filtered.length,
    };
  }

  // Обычный discover с одновременными фильтрами
  const sortBy =
    filters.mediaType === 'tv' && filters.sortBy === 'release_date.desc'
      ? 'first_air_date.desc'
      : filters.sortBy;

  const params: Record<string, string | number | undefined> = {
    page,
    sort_by: sortBy,
    include_adult: 'false',
    with_genres: filters.genreIds.length > 0 ? filters.genreIds.join(',') : undefined,
    'vote_average.gte': filters.minRating > 0 ? filters.minRating : undefined,
    'vote_count.gte': filters.sortBy === 'vote_average.desc' ? 150 : 20,
  };

  if (filters.year) {
    if (filters.mediaType === 'movie') {
      params.primary_release_year = filters.year;
    } else {
      params.first_air_date_year = filters.year;
    }
  }

  const data = await tmdbFetch<TmdbListResponse>(`/discover/${filters.mediaType}`, params);

  return {
    items: data.results.map((r) => normalizeMediaItem(r, filters.mediaType)),
    page: data.page,
    totalPages: Math.min(data.total_pages, 500),
    totalResults: data.total_results,
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

export async function getMoodDiscoverCandidates(params: {
  mediaType: MediaType;
  moods: MoodId[];
  genreId: number | null;
  minRating: number;
  year: string;
  country: string;
  useDemo: boolean;
}): Promise<MediaItem[]> {
  if (params.useDemo || !hasTmdbKey()) {
    return filterDemoByMood(params);
  }

  const moodConfig = getMoodGenresForMediaType(params.moods, params.mediaType);
  const genreIds = new Set<number>(moodConfig.genreIds);
  if (params.genreId) {
    genreIds.add(params.genreId);
  }

  // Для TMDB discover используем OR (|), чтобы комбинация нескольких настроений давала богатый выбор кандидатов
  const withGenresParam =
    params.genreId && moodConfig.genreIds.length > 0
      ? `${params.genreId}`
      : genreIds.size > 0
        ? Array.from(genreIds).join('|')
        : undefined;

  const queryParams: Record<string, string | number | undefined> = {
    sort_by: moodConfig.sortBy,
    with_genres: withGenresParam,
    'vote_average.gte': params.minRating > 0 ? params.minRating : undefined,
    'vote_count.gte': moodConfig.minVoteCount,
    with_origin_country: params.country || undefined,
    include_adult: 'false',
    page: 1,
  };

  if (params.year) {
    if (params.mediaType === 'movie') {
      queryParams.primary_release_year = params.year;
    } else {
      queryParams.first_air_date_year = params.year;
    }
  }

  const [page1, page2] = await Promise.all([
    tmdbFetch<TmdbListResponse>(`/discover/${params.mediaType}`, queryParams),
    tmdbFetch<TmdbListResponse>(`/discover/${params.mediaType}`, {
      ...queryParams,
      page: 2,
    }).catch(() => ({ results: [] as RawTmdbMedia[] })),
  ]);

  const seen = new Set<number>();
  const combined: MediaItem[] = [];
  for (const raw of [...page1.results, ...page2.results]) {
    if (!seen.has(raw.id)) {
      seen.add(raw.id);
      combined.push(normalizeMediaItem(raw, params.mediaType));
    }
    if (combined.length >= 30) break;
  }

  return combined;
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
