import { DEMO_TITLES, type DemoTitleExtended } from '../data/demoTitles';
import type { CatalogFilters, MediaItem } from '../types';
import {
  buildCatalogSortComparator,
  isAnimeItem,
  itemMatchesCountry,
  itemMatchesGenres,
  itemMatchesMoods,
} from './catalogHelpers';

export function filterDemoCatalog(
  filters: CatalogFilters,
  allTitles: DemoTitleExtended[] = DEMO_TITLES,
): MediaItem[] {
  const normalizedQuery = filters.query.trim().toLowerCase();

  const matching = allTitles
    .filter((entry) => {
      if (filters.mediaType === 'all') return true;
      if (filters.mediaType === 'anime') return isAnimeItem(entry.item);
      return entry.item.mediaType === filters.mediaType;
    })
    .filter((entry) => {
      if (!normalizedQuery) return true;
      const inTitle = entry.item.title.toLowerCase().includes(normalizedQuery);
      const inOriginal = entry.item.originalTitle.toLowerCase().includes(normalizedQuery);
      const inCast = entry.cast.some((c) => c.name.toLowerCase().includes(normalizedQuery));
      const inDirectors = entry.directors.some((d) =>
        d.toLowerCase().includes(normalizedQuery),
      );
      return inTitle || inOriginal || inCast || inDirectors;
    })
    .filter((entry) => itemMatchesGenres(entry.item, filters.genreIds, filters.mediaType))
    .filter((entry) => itemMatchesMoods(entry.item, filters.moods, filters.mediaType))
    .filter((entry) =>
      filters.mediaType === 'anime'
        ? true
        : itemMatchesCountry(entry.item, filters.country),
    )
    .filter((entry) => {
      if (!filters.year) return true;
      return entry.item.year === filters.year;
    })
    .filter((entry) => {
      if (filters.minRating <= 0) return true;
      return entry.item.voteAverage >= filters.minRating;
    })
    .map((entry) => entry.item);

  return [...matching].sort(buildCatalogSortComparator(filters.sortBy));
}
