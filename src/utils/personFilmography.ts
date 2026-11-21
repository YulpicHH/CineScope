import type { CatalogFilters, MediaItem } from '../types';
import {
  buildCatalogSortComparator,
  getMediaItemKey,
  isAnimeItem,
  itemMatchesCountry,
  itemMatchesGenres,
  itemMatchesMoods,
} from './catalogHelpers';

export interface PersonCreditEntry {
  item: MediaItem;
  originalLanguage?: string;
  character?: string;
}

export interface PaginatedPersonFilmography {
  items: MediaItem[];
  page: number;
  totalPages: number;
  totalResults: number;
}

export const PERSON_FILMOGRAPHY_PAGE_SIZE = 20;

/**
 * Дедуплицирует фильмографию актёра по `${mediaType}:${id}`.
 * Если актёр указан в нескольких ролях в одном фильме/сериале, оставляем самую информативную запись.
 */
export function deduplicatePersonCreditEntries(
  entries: PersonCreditEntry[],
): PersonCreditEntry[] {
  const byKey = new Map<string, PersonCreditEntry>();

  for (const entry of entries) {
    const key = getMediaItemKey(entry.item);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      continue;
    }

    const existingScore =
      (existing.item.posterPath ? 2 : 0) +
      (existing.item.overview ? 1 : 0) +
      (existing.item.voteCount > 0 ? 1 : 0);
    const candidateScore =
      (entry.item.posterPath ? 2 : 0) +
      (entry.item.overview ? 1 : 0) +
      (entry.item.voteCount > 0 ? 1 : 0);

    if (
      candidateScore > existingScore ||
      (candidateScore === existingScore &&
        entry.item.popularity > existing.item.popularity)
    ) {
      byKey.set(key, entry);
    }
  }

  return Array.from(byKey.values());
}

/**
 * Фильтрует, сортирует и разбивает на страницы полную фильмографию актёра
 * (все фильмы и сериалы с его участием из TMDB `/person/{id}/combined_credits`).
 */
export function filterAndPaginatePersonCredits(
  entries: PersonCreditEntry[],
  filters: CatalogFilters,
  page: number,
  pageSize = PERSON_FILMOGRAPHY_PAGE_SIZE,
): PaginatedPersonFilmography {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const normalizedQuery = filters.query.trim().toLowerCase();

  const deduplicated = deduplicatePersonCreditEntries(entries);

  const filtered = deduplicated
    .filter(({ item, originalLanguage }) => {
      if (filters.mediaType === 'all') return true;
      if (filters.mediaType === 'anime') {
        return isAnimeItem(item, originalLanguage);
      }
      return item.mediaType === filters.mediaType;
    })
    .filter(({ item, character }) => {
      if (!normalizedQuery) return true;
      return (
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.originalTitle.toLowerCase().includes(normalizedQuery) ||
        (character ? character.toLowerCase().includes(normalizedQuery) : false)
      );
    })
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

  const totalResults = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / safePageSize));
  const safePage = Math.max(1, Math.min(Math.floor(page), totalPages));
  const start = (safePage - 1) * safePageSize;

  return {
    items: filtered.slice(start, start + safePageSize),
    page: safePage,
    totalPages,
    totalResults,
  };
}
