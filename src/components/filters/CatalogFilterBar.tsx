import { RotateCcw, Search, X } from 'lucide-react';
import type { CatalogFilters, Genre, MediaType, SortOption } from '../../types';

interface CatalogFilterBarProps {
  filters: CatalogFilters;
  genres: Genre[];
  onChange: (next: CatalogFilters) => void;
  onReset: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 45 }, (_, idx) => String(CURRENT_YEAR - idx));

const RATING_OPTIONS = [
  { value: 0, label: 'Любой рейтинг' },
  { value: 6, label: 'От 6.0' },
  { value: 7, label: 'От 7.0' },
  { value: 7.5, label: 'От 7.5' },
  { value: 8, label: 'От 8.0' },
];

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'popularity.desc', label: 'По популярности' },
  { value: 'vote_average.desc', label: 'По рейтингу' },
  { value: 'release_date.desc', label: 'По дате выхода' },
];

export function CatalogFilterBar({
  filters,
  genres,
  onChange,
  onReset,
}: CatalogFilterBarProps) {
  const handleMediaTypeChange = (mediaType: MediaType) => {
    if (mediaType === filters.mediaType) return;
    onChange({
      ...filters,
      mediaType,
      genreIds: [],
    });
  };

  const toggleGenre = (genreId: number) => {
    const exists = filters.genreIds.includes(genreId);
    const nextGenres = exists
      ? filters.genreIds.filter((id) => id !== genreId)
      : [...filters.genreIds, genreId];
    onChange({
      ...filters,
      genreIds: nextGenres,
    });
  };

  const hasActiveFilters =
    filters.query.trim().length > 0 ||
    filters.genreIds.length > 0 ||
    filters.year !== '' ||
    filters.minRating > 0 ||
    filters.sortBy !== 'popularity.desc';

  return (
    <section
      aria-label="Фильтры и поиск каталога"
      className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/[0.08] dark:bg-[#11151E] sm:p-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Переключатель Фильмы / Сериалы */}
        <div
          role="group"
          aria-label="Тип контента"
          className="inline-flex w-full rounded-xl bg-slate-100 p-1 dark:bg-[#0B0E15] sm:w-auto"
        >
          <button
            type="button"
            onClick={() => handleMediaTypeChange('movie')}
            aria-pressed={filters.mediaType === 'movie'}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
              filters.mediaType === 'movie'
                ? 'bg-white text-slate-950 shadow-sm dark:bg-[#1B2230] dark:text-white'
                : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Фильмы
          </button>
          <button
            type="button"
            onClick={() => handleMediaTypeChange('tv')}
            aria-pressed={filters.mediaType === 'tv'}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
              filters.mediaType === 'tv'
                ? 'bg-white text-slate-950 shadow-sm dark:bg-[#1B2230] dark:text-white'
                : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Сериалы
          </button>
        </div>

        {/* Поисковая строка */}
        <div className="relative flex-1 lg:max-w-md">
          <label htmlFor="catalog-search-input" className="sr-only">
            Поиск по названию, актёру или режиссёру
          </label>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="catalog-search-input"
            type="search"
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
            placeholder="Название, актёр или режиссёр..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          {filters.query ? (
            <button
              type="button"
              onClick={() => onChange({ ...filters, query: '' })}
              aria-label="Очистить поиск"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Вторая строка: Год, Рейтинг, Сортировка, Сброс */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center">
        <div className="flex flex-col gap-1 sm:min-w-[140px]">
          <label htmlFor="filter-year" className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Год выхода
          </label>
          <select
            id="filter-year"
            value={filters.year}
            onChange={(e) => onChange({ ...filters, year: e.target.value })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
          >
            <option value="">Любой год</option>
            {YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 sm:min-w-[160px]">
          <label htmlFor="filter-rating" className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Минимальный рейтинг
          </label>
          <select
            id="filter-rating"
            value={filters.minRating}
            onChange={(e) => onChange({ ...filters, minRating: Number(e.target.value) })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
          >
            {RATING_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 sm:min-w-[180px]">
          <label htmlFor="filter-sort" className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Сортировка
          </label>
          <select
            id="filter-sort"
            value={filters.sortBy}
            onChange={(e) =>
              onChange({ ...filters, sortBy: e.target.value as SortOption })
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilters ? (
          <div className="flex items-end lg:ml-auto">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Сбросить
            </button>
          </div>
        ) : null}
      </div>

      {/* Выбор жанров (можно комбинировать несколько одновременно) */}
      <div className="space-y-2 border-t border-slate-200/70 pt-3 dark:border-white/[0.06]">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Жанры (можно выбрать несколько)
        </p>
        <div className="flex flex-wrap gap-2">
          {genres.map((genre) => {
            const active = filters.genreIds.includes(genre.id);
            return (
              <button
                key={genre.id}
                type="button"
                onClick={() => toggleGenre(genre.id)}
                aria-pressed={active}
                className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.08]'
                }`}
              >
                {genre.name}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
