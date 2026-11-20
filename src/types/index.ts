export type MediaType = 'movie' | 'tv';

export interface Genre {
  id: number;
  name: string;
}

export interface MediaBase {
  id: number;
  mediaType: MediaType;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string; // YYYY-MM-DD
  year: string;
  genreIds: number[];
  genres: Genre[];
  voteAverage: number;
  voteCount: number;
  popularity: number;
  originCountry: string[];
  isDemoData?: boolean;
}

export interface Movie extends MediaBase {
  mediaType: 'movie';
  runtime: number | null;
}

export interface Series extends MediaBase {
  mediaType: 'tv';
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  episodeRuntime: number | null;
}

export type MediaItem = Movie | Series;

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profilePath: string | null;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
}

export interface VideoItem {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface TitleDetailsData {
  item: MediaItem;
  cast: CastMember[];
  directors: CrewMember[];
  writers: CrewMember[];
  videos: VideoItem[];
  similar: MediaItem[];
  countries: string[];
}

export interface Person {
  id: number;
  name: string;
  knownForDepartment: string;
  profilePath: string | null;
  knownFor: MediaItem[];
}

export type LibraryStatus = 'watchlist' | 'watched';

export interface LibraryItem {
  id: number;
  mediaType: MediaType;
  title: string;
  originalTitle: string;
  posterPath: string | null;
  year: string;
  genreIds: number[];
  genres: Genre[];
  voteAverage: number;
  isDemoData?: boolean;
  status: LibraryStatus | null;
  isFavorite: boolean;
  watchedAt: string | null; // ISO-дата перехода в «Просмотрено»
  userRating: number | null; // Личная оценка от 1 до 10 для просмотренных
  updatedAt: string;
}

export interface LibraryStateV1 {
  version: 1;
  items: LibraryItem[];
}

export type MoodId =
  | 'mysterious'
  | 'light_fun'
  | 'tense'
  | 'warm_soulful'
  | 'dark_deep'
  | 'intellectual'
  | 'inspiring'
  | 'plot_twist'
  | 'friends_night'
  | 'visual_beauty';

export interface MoodDefinition {
  id: MoodId;
  label: string;
  description: string;
  movieGenreIds: number[];
  tvGenreIds: number[];
  sortBy?: 'vote_average.desc' | 'popularity.desc';
  minVoteCount?: number;
}

export interface MoodMatchResult {
  item: MediaItem;
  reason: string;
  source: 'tmdb' | 'demo';
}

export type SortOption = 'popularity.desc' | 'vote_average.desc' | 'release_date.desc';

export type CatalogMediaScope = 'all' | MediaType | 'anime';

export interface CatalogFilters {
  mediaType: CatalogMediaScope;
  query: string;
  moods: MoodId[];
  genreIds: number[];
  country: string;
  year: string;
  minRating: number;
  sortBy: SortOption;
  hideWatched: boolean;
}

export interface HistoryStats {
  totalMovies: number;
  totalSeries: number;
  favoriteGenres: Array<{ id: number; name: string; count: number }>;
  averageRating: number | null;
  ratedCount: number;
}

export type ThemeMode = 'dark' | 'light';
