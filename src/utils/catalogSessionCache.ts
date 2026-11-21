import type { CatalogFilters, MediaItem } from '../types';

export interface CatalogViewSnapshot {
  cacheKey: string;
  search: string;
  filters: CatalogFilters;
  items: MediaItem[];
  page: number;
  totalPages: number;
  scrollY: number;
  focusedItemKey: string | null;
  savedAt: number;
}

const DEFAULT_SNAPSHOT_TTL_MS = 30 * 60 * 1000;

let latestSnapshot: CatalogViewSnapshot | null = null;

/**
 * Формирует стабильный ключ выборки каталога (фильтры + режим данных + версия ключей),
 * чтобы при возврате со страницы фильма мгновенно восстановить точную позицию и загруженные страницы.
 */
export function buildCatalogCacheKey(
  filters: CatalogFilters,
  isDemoMode: boolean,
  keysVersion: number,
): string {
  const moods = [...filters.moods].sort().join(',');
  const genres = [...filters.genreIds].sort((a, b) => a - b).join(',');
  return JSON.stringify({
    mediaType: filters.mediaType,
    query: filters.query.trim().toLowerCase(),
    moods,
    genres,
    country: filters.country.toUpperCase(),
    year: filters.year.trim(),
    minRating: filters.minRating,
    sortBy: filters.sortBy,
    isDemoMode,
    keysVersion,
  });
}

export function saveCatalogSnapshot(
  snapshot: Omit<CatalogViewSnapshot, 'savedAt'> & { savedAt?: number },
): void {
  latestSnapshot = {
    ...snapshot,
    filters: {
      ...snapshot.filters,
      moods: [...snapshot.filters.moods],
      genreIds: [...snapshot.filters.genreIds],
    },
    items: [...snapshot.items],
    scrollY: Math.max(0, Math.round(snapshot.scrollY)),
    savedAt: snapshot.savedAt ?? Date.now(),
  };
}

export function updateCatalogSnapshotPosition(
  cacheKey: string,
  scrollY: number,
  focusedItemKey: string | null,
  search?: string,
): void {
  if (!latestSnapshot || latestSnapshot.cacheKey !== cacheKey) return;
  latestSnapshot = {
    ...latestSnapshot,
    scrollY: Math.max(0, Math.round(scrollY)),
    focusedItemKey: focusedItemKey ?? latestSnapshot.focusedItemKey,
    search: search !== undefined ? search : latestSnapshot.search,
    savedAt: Date.now(),
  };
}

export function getMatchingCatalogSnapshot(
  cacheKey: string,
  now = Date.now(),
  ttlMs = DEFAULT_SNAPSHOT_TTL_MS,
): CatalogViewSnapshot | null {
  if (!latestSnapshot) return null;
  if (latestSnapshot.cacheKey !== cacheKey) return null;
  if (now - latestSnapshot.savedAt > ttlMs) {
    latestSnapshot = null;
    return null;
  }
  return latestSnapshot;
}

export function getLastCatalogSearch(
  now = Date.now(),
  ttlMs = DEFAULT_SNAPSHOT_TTL_MS,
): string {
  if (!latestSnapshot) return '';
  if (now - latestSnapshot.savedAt > ttlMs) {
    latestSnapshot = null;
    return '';
  }
  return latestSnapshot.search;
}

export function clearCatalogSnapshot(): void {
  latestSnapshot = null;
}
