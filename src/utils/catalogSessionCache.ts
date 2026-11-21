import type { CatalogFilters, MediaItem } from '../types';

export interface CatalogViewSnapshot {
  cacheKey: string;
  search: string;
  filters: CatalogFilters;
  items: MediaItem[];
  page: number;
  totalPages: number;
  totalResults?: number;
  scrollY: number;
  focusedItemKey: string | null;
  savedAt: number;
}

const DEFAULT_SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const MAX_CATALOG_SNAPSHOTS = 8;

const snapshotMap = new Map<string, CatalogViewSnapshot>();
let latestSnapshotKey: string | null = null;

/**
 * Формирует стабильный ключ выборки каталога (фильтры + актёр + режим данных + версия ключей),
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
    personId: filters.personId ?? null,
    personName: (filters.personName ?? '').trim().toLowerCase(),
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
  const stored: CatalogViewSnapshot = {
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

  snapshotMap.delete(stored.cacheKey);
  snapshotMap.set(stored.cacheKey, stored);
  latestSnapshotKey = stored.cacheKey;

  while (snapshotMap.size > MAX_CATALOG_SNAPSHOTS) {
    const oldestKey = snapshotMap.keys().next().value;
    if (oldestKey === undefined) break;
    snapshotMap.delete(oldestKey);
  }
}

export function updateCatalogSnapshotPosition(
  cacheKey: string,
  scrollY: number,
  focusedItemKey: string | null,
  search?: string,
): void {
  const existing = snapshotMap.get(cacheKey);
  if (!existing) return;
  const updated: CatalogViewSnapshot = {
    ...existing,
    scrollY: Math.max(0, Math.round(scrollY)),
    focusedItemKey: focusedItemKey ?? existing.focusedItemKey,
    search: search !== undefined ? search : existing.search,
    savedAt: Date.now(),
  };
  snapshotMap.delete(cacheKey);
  snapshotMap.set(cacheKey, updated);
  latestSnapshotKey = cacheKey;
}

export function getMatchingCatalogSnapshot(
  cacheKey: string,
  now = Date.now(),
  ttlMs = DEFAULT_SNAPSHOT_TTL_MS,
): CatalogViewSnapshot | null {
  const found = snapshotMap.get(cacheKey);
  if (!found) return null;
  if (now - found.savedAt > ttlMs) {
    snapshotMap.delete(cacheKey);
    if (latestSnapshotKey === cacheKey) {
      latestSnapshotKey = null;
    }
    return null;
  }
  return found;
}

export function getLastCatalogSearch(
  now = Date.now(),
  ttlMs = DEFAULT_SNAPSHOT_TTL_MS,
): string {
  if (!latestSnapshotKey) return '';
  const latest = getMatchingCatalogSnapshot(latestSnapshotKey, now, ttlMs);
  return latest?.search ?? '';
}

export function clearCatalogSnapshot(): void {
  snapshotMap.clear();
  latestSnapshotKey = null;
}
