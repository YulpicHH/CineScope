import { useState } from 'react';
import {
  ChevronDown,
  Dices,
  EyeOff,
  RotateCcw,
  Search,
  SlidersHorizontal,
  User as UserIcon,
  X,
} from 'lucide-react';
import type {
  CatalogFilters,
  CatalogMediaScope,
  Genre,
  MoodId,
  SortOption,
} from '../../types';
import { CATALOG_COUNTRIES } from '../../utils/catalogHelpers';
import { MOOD_DEFINITIONS } from '../../utils/moodMapping';
import { isTvMode } from '../../utils/platform';

interface CatalogFilterBarProps {
  filters: CatalogFilters;
  genres: Genre[];
  hiddenWatchedCount: number;
  watchedTotalCount: number;
  totalResults?: number;
  highlightMoods?: boolean;
  isPickingRandom?: boolean;
  onChange: (next: CatalogFilters) => void;
  onReset: () => void;
  onOpenRandomPick: () => void;
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

const SCOPE_OPTIONS: Array<{ value: CatalogMediaScope; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'movie', label: 'Фильмы' },
  { value: 'tv', label: 'Сериалы' },
  { value: 'anime', label: 'Аниме' },
];

export function CatalogFilterBar({
  filters,
  genres,
  hiddenWatchedCount,
  watchedTotalCount,
  totalResults,
  highlightMoods = false,
  isPickingRandom = false,
  onChange,
  onReset,
  onOpenRandomPick,
}: CatalogFilterBarProps) {
  const [genresOpen, setGenresOpen] = useState(
    () => filters.genreIds.length > 0,
  );
  const tvMode = isTvMode();

  const handleMediaTypeChange = (mediaType: CatalogMediaScope) => {
    if (mediaType === filters.mediaType) return;
    onChange({
      ...filters,
      mediaType,
      genreIds: [],
    });
  };

  const toggleMood = (moodId: MoodId) => {
    const exists = filters.moods.includes(moodId);
    const nextMoods = exists
      ? filters.moods.filter((id) => id !== moodId)
      : [...filters.moods, moodId];
    onChange({
      ...filters,
      moods: nextMoods,
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

  const isAnimeScope = filters.mediaType === 'anime';
  const hasActiveActor = Boolean(
    (filters.personId && filters.personId > 0) ||
      (filters.personName && filters.personName.trim().length > 0),
  );

  const hasActiveFilters =
    hasActiveActor ||
    filters.query.trim().length > 0 ||
    filters.moods.length > 0 ||
    filters.genreIds.length > 0 ||
    (!isAnimeScope && filters.country !== '') ||
    filters.year !== '' ||
    filters.minRating > 0 ||
    filters.sortBy !== 'popularity.desc' ||
    filters.hideWatched;

  const isGenresExpanded = genresOpen || filters.genreIds.length > 0;

  return (
    <section
      aria-label="Фильтры, настроение и поиск каталога"
      className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/[0.08] dark:bg-[#11151E] sm:p-5"
    >
      {hasActiveActor ? (
        <div
          data-testid="active-actor-banner"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/25 bg-blue-50/80 px-3.5 py-2.5 dark:border-blue-400/25 dark:bg-blue-500/10"
        >
          <div className="flex min-w-0 items-center gap-2.5 text-sm">
            <UserIcon
              className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400"
              aria-hidden="true"
            />
            <span className="truncate font-semibold text-slate-900 dark:text-white">
              Фильмография: {filters.personName?.trim() || 'Актёр'}
            </span>
            {typeof totalResults === 'number' && totalResults > 0 ? (
              <span className="whitespace-nowrap text-xs tabular-nums text-slate-600 dark:text-slate-300">
                · {totalResults}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            data-testid="clear-actor-filter-button"
            onClick={() =>
              onChange({
                ...filters,
                personId: null,
                personName: '',
              })
            }
            className="inline-flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-500/30 bg-white px-3 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-400/30 dark:bg-[#0B0E15] dark:text-blue-300 dark:hover:bg-blue-500/20"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Показать весь каталог</span>
          </button>
        </div>
      ) : null}

      {/* Первая строка: Формат (Все / Фильмы / Сериалы), Поиск, Случайный выбор */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div
          role="group"
          aria-label="Тип контента"
          className="inline-flex w-full shrink-0 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-[#0B0E15] sm:w-auto"
        >
          {SCOPE_OPTIONS.map((opt) => {
            const active = filters.mediaType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                data-testid={`catalog-scope-${opt.value}`}
                onClick={() => handleMediaTypeChange(opt.value)}
                aria-pressed={active}
                className={`flex-1 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors sm:flex-none ${
                  active
                    ? 'bg-white text-slate-950 shadow-sm dark:bg-[#1B2230] dark:text-white'
                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Объединённая поисковая строка */}
        <div className="relative min-w-0 flex-1">
          <label htmlFor="catalog-search-input" className="sr-only">
            Поиск фильмов и сериалов по названию, актёру или режиссёру
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
            placeholder={
              hasActiveActor
                ? `Поиск среди работ (${filters.personName?.trim() || 'актёр'})...`
                : isAnimeScope
                  ? 'Название аниме, режиссёр или сэйю...'
                  : 'Название фильма или сериала, актёр, режиссёр...'
            }
            className={`w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none sm:text-sm dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100 dark:placeholder:text-slate-500 ${
              tvMode && !filters.query ? 'pr-24' : 'pr-9'
            }`}
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
          ) : tvMode ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-medium text-slate-500"
            >
              ОК — ввод
            </span>
          ) : null}
        </div>

        {/* Случайный выбор на вечер */}
        <button
          type="button"
          disabled={isPickingRandom}
          onClick={onOpenRandomPick}
          className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-60"
        >
          <Dices className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Случайный выбор</span>
        </button>
      </div>

      {/* Вторая строка: Страна, Год, Мин. рейтинг, Сортировка, Скрыть просмотренное, Сброс */}
      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end">
        <div className="flex flex-col gap-1 lg:min-w-[155px]">
          {isAnimeScope ? (
            <>
              <span
                id="filter-country-label"
                className="text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Страна
              </span>
              <div
                id="filter-country"
                aria-labelledby="filter-country-label"
                title="В разделе «Аниме» автоматически выбрана Япония"
                className="flex h-[38px] select-none items-center whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
              >
                Япония
              </div>
            </>
          ) : (
            <>
              <label
                htmlFor="filter-country"
                className="text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Страна
              </label>
              <select
                id="filter-country"
                value={filters.country}
                onChange={(e) => onChange({ ...filters, country: e.target.value })}
                className="h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-900 focus:border-blue-500 focus:outline-none sm:text-sm dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
              >
                {CATALOG_COUNTRIES.map((country) => (
                  <option key={country.code || 'any'} value={country.code}>
                    {country.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        <div className="flex flex-col gap-1 lg:min-w-[130px]">
          <label
            htmlFor="filter-year"
            className="text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            Год выхода
          </label>
          <select
            id="filter-year"
            value={filters.year}
            onChange={(e) => onChange({ ...filters, year: e.target.value })}
            className="h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-900 focus:border-blue-500 focus:outline-none sm:text-sm dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
          >
            <option value="">Любой год</option>
            {YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 lg:min-w-[148px]">
          <label
            htmlFor="filter-rating"
            className="text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            Мин. рейтинг
          </label>
          <select
            id="filter-rating"
            value={filters.minRating}
            onChange={(e) =>
              onChange({ ...filters, minRating: Number(e.target.value) })
            }
            className="h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-900 focus:border-blue-500 focus:outline-none sm:text-sm dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
          >
            {RATING_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 lg:min-w-[168px]">
          <label
            htmlFor="filter-sort"
            className="text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            Сортировка
          </label>
          <select
            id="filter-sort"
            value={filters.sortBy}
            onChange={(e) =>
              onChange({ ...filters, sortBy: e.target.value as SortOption })
            }
            className="h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-900 focus:border-blue-500 focus:outline-none sm:text-sm dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Переключатель «Скрыть просмотренное» */}
        <div className="col-span-2 flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-1 lg:ml-auto">
          <button
            type="button"
            onClick={() =>
              onChange({ ...filters, hideWatched: !filters.hideWatched })
            }
            aria-pressed={filters.hideWatched}
            title={
              watchedTotalCount === 0
                ? 'У вас пока нет просмотренных тайтлов в библиотеке'
                : 'Скрыть фильмы и сериалы, отмеченные как просмотренные'
            }
            className={`inline-flex h-[38px] items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 text-sm font-medium transition-colors ${
              filters.hideWatched
                ? 'border-blue-500/60 bg-blue-50 text-blue-700 dark:border-blue-400/50 dark:bg-blue-500/15 dark:text-blue-300'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-300 dark:hover:bg-white/[0.07]'
            }`}
          >
            <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Скрыть просмотренное</span>
            {filters.hideWatched && hiddenWatchedCount > 0 ? (
              <span className="tabular-nums text-xs opacity-80">
                (−{hiddenWatchedCount})
              </span>
            ) : null}
          </button>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Сбросить</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Третья зона: Быстрые пресеты настроения */}
      <div
        className={`space-y-2.5 border-t border-slate-200/70 pt-3.5 dark:border-white/[0.06] ${
          highlightMoods ? 'rounded-xl ring-1 ring-blue-500/35 p-2.5 -mx-2.5' : ''
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Настроение вечера
            </span>
            {filters.moods.length > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums text-blue-600 dark:text-blue-400">
                  Выбрано: {filters.moods.length}
                </span>
              </>
            ) : (
              <>
                <span aria-hidden="true">·</span>
                <span>можно выбрать несколько</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {filters.moods.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange({ ...filters, moods: [] })}
                className="whitespace-nowrap text-xs font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                Очистить настроение
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setGenresOpen((prev) => !prev)}
              aria-expanded={isGenresExpanded}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:bg-white/[0.08]"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Жанры
                {filters.genreIds.length > 0 ? ` (${filters.genreIds.length})` : ''}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-150 ${
                  isGenresExpanded ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {MOOD_DEFINITIONS.map((mood) => {
            const active = filters.moods.includes(mood.id);
            return (
              <button
                key={mood.id}
                type="button"
                title={mood.description}
                onClick={() => toggleMood(mood.id)}
                aria-pressed={active}
                className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.08]'
                }`}
              >
                {mood.label}
              </button>
            );
          })}
        </div>

        {/* Раскрываемый блок жанров */}
        {isGenresExpanded ? (
          <div className="space-y-2 border-t border-slate-200/70 pt-3 dark:border-white/[0.06]">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Точный выбор жанров</span>
              {filters.genreIds.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, genreIds: [] })}
                  className="whitespace-nowrap font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  Сбросить жанры
                </button>
              ) : null}
            </div>
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
        ) : null}
      </div>
    </section>
  );
}
