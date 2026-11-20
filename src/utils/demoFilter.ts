import { DEMO_TITLES, type DemoTitleExtended } from '../data/demoTitles';
import type { CatalogFilters, MediaItem, MediaType, MoodId } from '../types';
import { getMoodGenresForMediaType } from './moodMapping';

export function filterDemoCatalog(
  filters: CatalogFilters,
  allTitles: DemoTitleExtended[] = DEMO_TITLES,
): MediaItem[] {
  const normalizedQuery = filters.query.trim().toLowerCase();

  const matching = allTitles
    .filter((entry) => entry.item.mediaType === filters.mediaType)
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
    .filter((entry) => {
      if (filters.genreIds.length === 0) return true;
      return filters.genreIds.every((gid) => entry.item.genreIds.includes(gid));
    })
    .filter((entry) => {
      if (!filters.year) return true;
      return entry.item.year === filters.year;
    })
    .filter((entry) => {
      if (filters.minRating <= 0) return true;
      return entry.item.voteAverage >= filters.minRating;
    })
    .map((entry) => entry.item);

  return [...matching].sort((a, b) => {
    if (filters.sortBy === 'vote_average.desc') {
      return b.voteAverage - a.voteAverage;
    }
    if (filters.sortBy === 'release_date.desc') {
      return b.releaseDate.localeCompare(a.releaseDate);
    }
    return b.popularity - a.popularity;
  });
}

export function filterDemoByMood(params: {
  mediaType: MediaType;
  moods: MoodId[];
  genreId: number | null;
  minRating: number;
  year: string;
  country: string;
}): MediaItem[] {
  const { genreIds } = getMoodGenresForMediaType(params.moods, params.mediaType);

  return DEMO_TITLES.filter((entry) => entry.item.mediaType === params.mediaType)
    .filter((entry) => {
      if (params.genreId && !entry.item.genreIds.includes(params.genreId)) {
        return false;
      }
      if (genreIds.length > 0) {
        return entry.item.genreIds.some((gid) => genreIds.includes(gid));
      }
      return true;
    })
    .filter((entry) => (params.minRating > 0 ? entry.item.voteAverage >= params.minRating : true))
    .filter((entry) => (params.year ? entry.item.year === params.year : true))
    .filter((entry) =>
      params.country
        ? entry.item.originCountry.includes(params.country)
        : true,
    )
    .map((entry) => entry.item)
    .sort((a, b) => b.voteAverage - a.voteAverage);
}
