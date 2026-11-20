import type {
  HistoryStats,
  LibraryItem,
  LibraryStateV1,
  LibraryStatus,
  MediaItem,
} from '../types';

export const LIBRARY_SCHEMA_VERSION = 1 as const;
export const LIBRARY_STORAGE_KEY = 'cinescope_library_v1';

export function createEmptyLibraryState(): LibraryStateV1 {
  return {
    version: LIBRARY_SCHEMA_VERSION,
    items: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidLibraryItem(value: unknown): value is LibraryItem {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'number') return false;
  if (value.mediaType !== 'movie' && value.mediaType !== 'tv') return false;
  if (typeof value.title !== 'string') return false;
  if (value.status !== null && value.status !== 'watchlist' && value.status !== 'watched') {
    return false;
  }
  if (typeof value.isFavorite !== 'boolean') return false;
  return true;
}

export function parseLibraryStorage(raw: string | null): LibraryStateV1 {
  if (!raw) return createEmptyLibraryState();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return createEmptyLibraryState();
    if (parsed.version !== LIBRARY_SCHEMA_VERSION || !Array.isArray(parsed.items)) {
      return createEmptyLibraryState();
    }
    const items = parsed.items.filter(isValidLibraryItem).map((item) => {
      // Гарантируем правило взаимоисключающих статусов и оценки только для просмотренного
      const normalizedStatus = item.status;
      const normalizedRating =
        normalizedStatus === 'watched' &&
        typeof item.userRating === 'number' &&
        item.userRating >= 1 &&
        item.userRating <= 10
          ? Math.round(item.userRating)
          : null;
      const normalizedWatchedAt =
        normalizedStatus === 'watched' && typeof item.watchedAt === 'string'
          ? item.watchedAt
          : normalizedStatus === 'watched'
            ? item.updatedAt
            : null;
      return {
        ...item,
        status: normalizedStatus,
        userRating: normalizedRating,
        watchedAt: normalizedWatchedAt,
      };
    });
    return {
      version: LIBRARY_SCHEMA_VERSION,
      items,
    };
  } catch {
    return createEmptyLibraryState();
  }
}

export function serializeLibraryState(state: LibraryStateV1): string {
  return JSON.stringify(state);
}

function mediaToLibraryBase(media: MediaItem, nowIso: string): LibraryItem {
  return {
    id: media.id,
    mediaType: media.mediaType,
    title: media.title,
    originalTitle: media.originalTitle,
    posterPath: media.posterPath,
    year: media.year,
    genreIds: media.genreIds,
    genres: media.genres,
    voteAverage: media.voteAverage,
    isDemoData: media.isDemoData,
    status: null,
    isFavorite: false,
    watchedAt: null,
    userRating: null,
    updatedAt: nowIso,
  };
}

/**
 * Устанавливает или снимает статус «Посмотреть позже» / «Просмотрено».
 * Правило: тайтл может быть только в одном из этих статусов,
 * но дополнительно может оставаться в «Избранном».
 */
export function applyTitleStatus(
  items: LibraryItem[],
  media: MediaItem,
  nextStatus: LibraryStatus | null,
  nowIso: string = new Date().toISOString(),
): LibraryItem[] {
  const idx = items.findIndex((i) => i.id === media.id && i.mediaType === media.mediaType);
  const existing = idx >= 0 ? items[idx] : null;

  if (nextStatus === null && (!existing || !existing.isFavorite)) {
    return idx >= 0 ? items.filter((_, i) => i !== idx) : items;
  }

  const base = existing ? { ...existing } : mediaToLibraryBase(media, nowIso);
  base.title = media.title;
  base.posterPath = media.posterPath ?? base.posterPath;
  base.genres = media.genres.length > 0 ? media.genres : base.genres;
  base.genreIds = media.genreIds.length > 0 ? media.genreIds : base.genreIds;
  base.voteAverage = media.voteAverage || base.voteAverage;
  base.isDemoData = media.isDemoData ?? base.isDemoData;
  base.updatedAt = nowIso;

  if (nextStatus === 'watched') {
    base.status = 'watched';
    base.watchedAt = existing?.status === 'watched' && existing.watchedAt ? existing.watchedAt : nowIso;
  } else if (nextStatus === 'watchlist') {
    base.status = 'watchlist';
    base.watchedAt = null;
    base.userRating = null;
  } else {
    base.status = null;
    base.watchedAt = null;
    base.userRating = null;
  }

  if (!base.status && !base.isFavorite) {
    return items.filter((_, i) => i !== idx);
  }

  if (idx >= 0) {
    const copy = [...items];
    copy[idx] = base;
    return copy;
  }
  return [base, ...items];
}

export function toggleFavoriteItem(
  items: LibraryItem[],
  media: MediaItem,
  nowIso: string = new Date().toISOString(),
): LibraryItem[] {
  const idx = items.findIndex((i) => i.id === media.id && i.mediaType === media.mediaType);
  const existing = idx >= 0 ? items[idx] : null;

  const base = existing ? { ...existing } : mediaToLibraryBase(media, nowIso);
  base.isFavorite = !base.isFavorite;
  base.updatedAt = nowIso;

  if (!base.status && !base.isFavorite) {
    return items.filter((_, i) => i !== idx);
  }

  if (idx >= 0) {
    const copy = [...items];
    copy[idx] = base;
    return copy;
  }
  return [base, ...items];
}

export function setTitleRating(
  items: LibraryItem[],
  media: MediaItem,
  rating: number | null,
  nowIso: string = new Date().toISOString(),
): LibraryItem[] {
  const clampedRating =
    rating === null ? null : Math.max(1, Math.min(10, Math.round(rating)));

  // Оценка доступна только для просмотренных — если ставим оценку, переводим в «Просмотрено»
  const withWatched = applyTitleStatus(items, media, 'watched', nowIso);
  return withWatched.map((item) =>
    item.id === media.id && item.mediaType === media.mediaType
      ? { ...item, userRating: clampedRating, updatedAt: nowIso }
      : item,
  );
}

export function removeWatchedHistoryEntry(
  items: LibraryItem[],
  id: number,
  mediaType: MediaItem['mediaType'],
  nowIso: string = new Date().toISOString(),
): LibraryItem[] {
  return items
    .map((item) => {
      if (item.id !== id || item.mediaType !== mediaType) return item;
      if (item.isFavorite) {
        return {
          ...item,
          status: null,
          watchedAt: null,
          userRating: null,
          updatedAt: nowIso,
        };
      }
      return null;
    })
    .filter((item): item is LibraryItem => item !== null);
}

export function computeHistoryStats(items: LibraryItem[]): HistoryStats {
  const watched = items.filter((item) => item.status === 'watched');
  let totalMovies = 0;
  let totalSeries = 0;
  const genreCounter = new Map<number, { id: number; name: string; count: number }>();
  let ratingSum = 0;
  let ratedCount = 0;

  for (const item of watched) {
    if (item.mediaType === 'movie') totalMovies += 1;
    else totalSeries += 1;

    if (typeof item.userRating === 'number') {
      ratingSum += item.userRating;
      ratedCount += 1;
    }

    for (const genre of item.genres) {
      const current = genreCounter.get(genre.id);
      if (current) {
        current.count += 1;
      } else {
        genreCounter.set(genre.id, { id: genre.id, name: genre.name, count: 1 });
      }
    }
  }

  const favoriteGenres = Array.from(genreCounter.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  return {
    totalMovies,
    totalSeries,
    favoriteGenres,
    averageRating: ratedCount > 0 ? Number((ratingSum / ratedCount).toFixed(1)) : null,
    ratedCount,
  };
}

export function buildRecommendationProfile(items: LibraryItem[]): {
  hasPersonalProfile: boolean;
  topMovieGenres: number[];
  topTvGenres: number[];
  excludeKeys: Set<string>;
} {
  const highRatedWatched = items.filter(
    (item) =>
      item.status === 'watched' &&
      typeof item.userRating === 'number' &&
      item.userRating >= 7,
  );
  const allWatchedOrFav = items.filter(
    (item) => item.status === 'watched' || item.isFavorite,
  );
  const excludeKeys = new Set(
    items.map((item) => `${item.mediaType}:${item.id}`),
  );

  if (highRatedWatched.length === 0) {
    return {
      hasPersonalProfile: false,
      topMovieGenres: [],
      topTvGenres: [],
      excludeKeys,
    };
  }

  const movieGenreScores = new Map<number, number>();
  const tvGenreScores = new Map<number, number>();

  for (const item of highRatedWatched) {
    const weight = (item.userRating ?? 7) - 5;
    const targetMap = item.mediaType === 'movie' ? movieGenreScores : tvGenreScores;
    for (const gid of item.genreIds) {
      targetMap.set(gid, (targetMap.get(gid) ?? 0) + weight);
    }
  }

  // Добавляем лёгкий вес от избранных, если мало оценок
  for (const item of allWatchedOrFav) {
    if (item.isFavorite) {
      const targetMap = item.mediaType === 'movie' ? movieGenreScores : tvGenreScores;
      for (const gid of item.genreIds) {
        targetMap.set(gid, (targetMap.get(gid) ?? 0) + 1);
      }
    }
  }

  const sortMap = (map: Map<number, number>): number[] =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

  return {
    hasPersonalProfile: true,
    topMovieGenres: sortMap(movieGenreScores),
    topTvGenres: sortMap(tvGenreScores),
    excludeKeys,
  };
}
