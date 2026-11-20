import type {
  CatalogFilters,
  CatalogMediaScope,
  Genre,
  MediaItem,
  MediaType,
  MoodId,
  SortOption,
} from '../types';
import { getMoodGenresForMediaType, MOOD_DEFINITIONS } from './moodMapping';

export const ANIME_GENRE_ID = 16;
export const ANIME_ORIGIN_COUNTRY = 'JP';

export interface CountryOption {
  code: string;
  label: string;
}

export const CATALOG_COUNTRIES: readonly CountryOption[] = [
  { code: '', label: 'Любая страна' },
  { code: 'US', label: 'США' },
  { code: 'GB', label: 'Великобритания' },
  { code: 'FR', label: 'Франция' },
  { code: 'DE', label: 'Германия' },
  { code: 'KR', label: 'Южная Корея' },
  { code: 'JP', label: 'Япония' },
  { code: 'RU', label: 'Россия' },
  { code: 'ES', label: 'Испания' },
  { code: 'IT', label: 'Италия' },
  { code: 'CA', label: 'Канада' },
];

/**
 * Языковые коды для фолбэка фильтра по стране при поиске фильмов в TMDB
 * (эндпоинт /search/movie не всегда возвращает origin_country, но возвращает original_language).
 */
const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  US: 'en',
  GB: 'en',
  CA: 'en',
  FR: 'fr',
  DE: 'de',
  KR: 'ko',
  JP: 'ja',
  RU: 'ru',
  ES: 'es',
  IT: 'it',
};

export interface UnifiedGenreGroup {
  id: number;
  name: string;
  movieIds: number[];
  tvIds: number[];
}

export const UNIFIED_GENRE_GROUPS: readonly UnifiedGenreGroup[] = [
  { id: 18, name: 'Драма', movieIds: [18], tvIds: [18] },
  { id: 35, name: 'Комедия', movieIds: [35], tvIds: [35] },
  { id: 80, name: 'Криминал', movieIds: [80], tvIds: [80] },
  { id: 9648, name: 'Детектив', movieIds: [9648], tvIds: [9648] },
  { id: 878, name: 'Фантастика и фэнтези', movieIds: [878, 14], tvIds: [10765] },
  { id: 28, name: 'Боевик и приключения', movieIds: [28, 12], tvIds: [10759] },
  { id: 53, name: 'Триллер', movieIds: [53], tvIds: [9648, 80] },
  { id: 16, name: 'Мультфильм', movieIds: [16], tvIds: [16] },
  { id: 10751, name: 'Семейный', movieIds: [10751], tvIds: [10751] },
  { id: 99, name: 'Документальный', movieIds: [99], tvIds: [99] },
  { id: 27, name: 'Ужасы', movieIds: [27], tvIds: [9648, 10765] },
  { id: 10749, name: 'Мелодрама', movieIds: [10749], tvIds: [18, 35] },
];

/**
 * Адаптированный набор жанров для вкладки «Аниме» (без дублирующего «Мультфильм»,
 * так как жанр анимации 16 применяется автоматически).
 */
export const ANIME_GENRE_GROUPS: readonly UnifiedGenreGroup[] = [
  { id: 28, name: 'Экшен и приключения', movieIds: [28, 12], tvIds: [10759] },
  { id: 878, name: 'Фэнтези и фантастика', movieIds: [14, 878], tvIds: [10765] },
  { id: 18, name: 'Драма', movieIds: [18], tvIds: [18] },
  { id: 35, name: 'Комедия', movieIds: [35], tvIds: [35] },
  { id: 9648, name: 'Детектив и мистика', movieIds: [9648], tvIds: [9648] },
  { id: 53, name: 'Триллер и криминал', movieIds: [53, 80], tvIds: [80, 9648] },
  { id: 10749, name: 'Романтика', movieIds: [10749], tvIds: [18, 35] },
  { id: 10751, name: 'Повседневность и семейное', movieIds: [10751], tvIds: [10751, 35] },
];

/**
 * Точечная карта настроений для аниме (без жанра 16 — он добавляется строго через AND в discover).
 */
const ANIME_MOOD_GENRES: Record<
  MoodId,
  { movieIds: number[]; tvIds: number[]; sortBy?: 'vote_average.desc' | 'popularity.desc' }
> = {
  mysterious: { movieIds: [9648, 14], tvIds: [9648, 10765] },
  light_fun: { movieIds: [35, 10751], tvIds: [35, 10751] },
  tense: { movieIds: [53, 28], tvIds: [10759, 80] },
  warm_soulful: { movieIds: [18, 10749, 10751], tvIds: [18, 10751] },
  dark_deep: { movieIds: [18, 53, 27], tvIds: [18, 80, 9648] },
  intellectual: { movieIds: [878, 9648, 18], tvIds: [9648, 10765, 18] },
  inspiring: { movieIds: [12, 18], tvIds: [10759, 18] },
  plot_twist: { movieIds: [9648, 53], tvIds: [9648, 80], sortBy: 'vote_average.desc' },
  friends_night: { movieIds: [28, 35, 12], tvIds: [10759, 35] },
  visual_beauty: { movieIds: [14, 12, 878], tvIds: [10765, 10759] },
};

export function getUnifiedGenreList(): Genre[] {
  return UNIFIED_GENRE_GROUPS.map((g) => ({ id: g.id, name: g.name }));
}

export function getAnimeGenreList(): Genre[] {
  return ANIME_GENRE_GROUPS.map((g) => ({ id: g.id, name: g.name }));
}

export function getMediaItemKey(item: Pick<MediaItem, 'mediaType' | 'id'>): string {
  return `${item.mediaType}:${item.id}`;
}

export function getCountryLabel(code: string): string {
  return CATALOG_COUNTRIES.find((c) => c.code === code)?.label ?? code;
}

/**
 * Определяет, является ли тайтл японским аниме (сериалом или полнометражным фильмом).
 */
export function isAnimeItem(
  item: MediaItem,
  originalLanguage?: string,
): boolean {
  if (!item.genreIds.includes(ANIME_GENRE_ID)) {
    return false;
  }
  if (item.originCountry.length > 0) {
    return item.originCountry.includes(ANIME_ORIGIN_COUNTRY);
  }
  if (originalLanguage) {
    return originalLanguage.toLowerCase() === 'ja';
  }
  return false;
}

export function expandSingleGenreForMediaType(
  genreId: number,
  scope: CatalogMediaScope,
  targetMediaType: MediaType,
): number[] {
  if (scope === targetMediaType) {
    return [genreId];
  }
  const sourceList = scope === 'anime' ? ANIME_GENRE_GROUPS : UNIFIED_GENRE_GROUPS;
  const group = sourceList.find((g) => g.id === genreId);
  if (!group) return [genreId];
  return targetMediaType === 'movie' ? group.movieIds : group.tvIds;
}

export function itemMatchesGenres(
  item: MediaItem,
  selectedGenreIds: number[],
  scope: CatalogMediaScope,
): boolean {
  if (selectedGenreIds.length === 0) return true;
  if (scope === 'movie' || scope === 'tv') {
    return selectedGenreIds.every((gid) => item.genreIds.includes(gid));
  }
  return selectedGenreIds.every((gid) => {
    const mapped = expandSingleGenreForMediaType(gid, scope, item.mediaType);
    return mapped.some((targetId) => item.genreIds.includes(targetId));
  });
}

export function getAnimeMoodGenresForMediaType(
  moods: MoodId[],
  targetMediaType: MediaType,
): { genreIds: number[]; sortBy: 'vote_average.desc' | 'popularity.desc' } {
  const genreSet = new Set<number>();
  let sortBy: 'vote_average.desc' | 'popularity.desc' = 'popularity.desc';

  for (const moodId of moods) {
    const entry = ANIME_MOOD_GENRES[moodId];
    if (!entry) continue;
    const ids = targetMediaType === 'movie' ? entry.movieIds : entry.tvIds;
    for (const id of ids) {
      genreSet.add(id);
    }
    if (entry.sortBy === 'vote_average.desc') {
      sortBy = 'vote_average.desc';
    }
  }

  return { genreIds: Array.from(genreSet), sortBy };
}

export function itemMatchesMoods(
  item: MediaItem,
  moods: MoodId[],
  scope: CatalogMediaScope = 'all',
): boolean {
  if (moods.length === 0) return true;
  if (scope === 'anime') {
    const animeMood = getAnimeMoodGenresForMediaType(moods, item.mediaType);
    if (animeMood.genreIds.length === 0) return true;
    return item.genreIds.some((gid) => animeMood.genreIds.includes(gid));
  }
  const moodConfig = getMoodGenresForMediaType(moods, item.mediaType);
  if (moodConfig.genreIds.length === 0) return true;
  return item.genreIds.some((gid) => moodConfig.genreIds.includes(gid));
}

export function itemMatchesCountry(
  item: MediaItem,
  countryCode: string,
  originalLanguage?: string,
): boolean {
  if (!countryCode) return true;
  if (item.originCountry.length > 0) {
    return item.originCountry.includes(countryCode);
  }
  if (originalLanguage) {
    const expectedLang = COUNTRY_TO_LANGUAGE[countryCode];
    if (expectedLang) {
      return originalLanguage.toLowerCase() === expectedLang;
    }
  }
  return false;
}

/**
 * Формирует параметр with_genres для TMDB /discover/{targetMediaType}.
 * Для вкладки «Аниме» всегда гарантирует наличие жанра 16 (Animation) через AND (,),
 * чтобы никогда не подмешивать игровые фильмы и дорамы.
 */
export function buildDiscoverGenreQuery(
  selectedGenreIds: number[],
  moods: MoodId[],
  scope: CatalogMediaScope,
  targetMediaType: MediaType,
): string | undefined {
  if (scope === 'anime') {
    const required = new Set<number>([ANIME_GENRE_ID]);

    if (selectedGenreIds.length > 0) {
      for (const gid of selectedGenreIds) {
        const mapped = expandSingleGenreForMediaType(gid, 'anime', targetMediaType);
        if (mapped[0]) required.add(mapped[0]);
      }
      return Array.from(required).join(',');
    }

    if (moods.length === 1) {
      const animeMood = getAnimeMoodGenresForMediaType(moods, targetMediaType);
      if (animeMood.genreIds[0]) {
        required.add(animeMood.genreIds[0]);
      }
      return Array.from(required).join(',');
    }

    // При нескольких настроениях запрашиваем чистое аниме (16) и уточняем настроения на клиенте
    return String(ANIME_GENRE_ID);
  }

  if (selectedGenreIds.length > 0) {
    if (scope !== 'all') {
      return selectedGenreIds.join(',');
    }
    if (selectedGenreIds.length === 1) {
      const mapped = expandSingleGenreForMediaType(
        selectedGenreIds[0],
        'all',
        targetMediaType,
      );
      return mapped.join('|');
    }
    const primaryIds = Array.from(
      new Set(
        selectedGenreIds.map((gid) => {
          const mapped = expandSingleGenreForMediaType(gid, 'all', targetMediaType);
          return mapped[0];
        }),
      ),
    );
    return primaryIds.join(',');
  }

  if (moods.length > 0) {
    const moodConfig = getMoodGenresForMediaType(moods, targetMediaType);
    if (moodConfig.genreIds.length > 0) {
      return moodConfig.genreIds.join('|');
    }
  }

  return undefined;
}

export function buildCatalogSortComparator(
  sortBy: SortOption,
): (a: MediaItem, b: MediaItem) => number {
  return (a, b) => {
    if (sortBy === 'vote_average.desc') {
      if (b.voteAverage !== a.voteAverage) return b.voteAverage - a.voteAverage;
      return b.voteCount - a.voteCount;
    }
    if (sortBy === 'release_date.desc') {
      const cmp = b.releaseDate.localeCompare(a.releaseDate);
      if (cmp !== 0) return cmp;
      return b.popularity - a.popularity;
    }
    return b.popularity - a.popularity;
  };
}

/**
 * Чередует два потока (например, фильмы и сериалы) при сортировке по популярности,
 * поскольку шкала popularity в TMDB у сериалов систематически выше, чем у фильмов.
 */
export function interleaveMediaStreams(
  primary: MediaItem[],
  secondary: MediaItem[],
): MediaItem[] {
  const result: MediaItem[] = [];
  const seen = new Set<string>();
  const maxLen = Math.max(primary.length, secondary.length);

  for (let i = 0; i < maxLen; i += 1) {
    const first = primary[i];
    if (first) {
      const key = getMediaItemKey(first);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(first);
      }
    }
    const second = secondary[i];
    if (second) {
      const key = getMediaItemKey(second);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(second);
      }
    }
  }

  return result;
}

export function excludeWatchedItems(
  items: MediaItem[],
  watchedKeys: ReadonlySet<string>,
  hideWatched: boolean,
): { visible: MediaItem[]; hiddenCount: number } {
  if (!hideWatched || watchedKeys.size === 0) {
    return { visible: items, hiddenCount: 0 };
  }
  const visible: MediaItem[] = [];
  let hiddenCount = 0;
  for (const item of items) {
    if (watchedKeys.has(getMediaItemKey(item))) {
      hiddenCount += 1;
    } else {
      visible.push(item);
    }
  }
  return { visible, hiddenCount };
}

export function pickRandomEveningItem(
  pool: MediaItem[],
  seenKeys: ReadonlySet<string>,
  lastPickedKey: string | null = null,
  rng: () => number = Math.random,
): { item: MediaItem | null; resetSeen: boolean } {
  if (pool.length === 0) {
    return { item: null, resetSeen: false };
  }

  const unseen = pool.filter((item) => !seenKeys.has(getMediaItemKey(item)));
  if (unseen.length > 0) {
    const idx = Math.min(unseen.length - 1, Math.floor(rng() * unseen.length));
    return { item: unseen[idx], resetSeen: false };
  }

  const withoutLast =
    pool.length > 1 && lastPickedKey
      ? pool.filter((item) => getMediaItemKey(item) !== lastPickedKey)
      : pool;
  const idx = Math.min(
    withoutLast.length - 1,
    Math.floor(rng() * withoutLast.length),
  );
  return { item: withoutLast[idx], resetSeen: true };
}

export function buildEveningPickReason(
  item: MediaItem,
  filters: CatalogFilters,
): string {
  const parts: string[] = [];

  if (filters.mediaType === 'anime') {
    parts.push('раздел «Аниме»');
  }

  if (filters.moods.length > 0) {
    const labels = filters.moods
      .map((id) => MOOD_DEFINITIONS.find((m) => m.id === id)?.label)
      .filter((label): label is string => Boolean(label));
    if (labels.length > 0) {
      parts.push(`настроение «${labels.slice(0, 2).join('», «')}»`);
    }
  }

  if (filters.mediaType !== 'anime' && filters.country) {
    parts.push(`страна: ${getCountryLabel(filters.country)}`);
  }

  if (filters.year) {
    parts.push(`${filters.year} год`);
  }

  if (filters.minRating > 0) {
    parts.push(`рейтинг от ${filters.minRating.toFixed(1)}`);
  }

  if (parts.length > 0) {
    return `Подобрано под ${parts.join(' · ')}`;
  }

  if (item.genres.length > 0) {
    return `Подобрано по жанрам: ${item.genres
      .slice(0, 2)
      .map((g) => g.name.toLowerCase())
      .join(', ')}`;
  }

  return 'Случайный выбор из текущей подборки каталога';
}

export function isValidMoodId(value: string): value is MoodId {
  return MOOD_DEFINITIONS.some((m) => m.id === value);
}
