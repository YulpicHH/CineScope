import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MediaGrid } from '../components/cards/MediaGrid';
import { CatalogFilterBar } from '../components/filters/CatalogFilterBar';
import { RowSkeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StateViews';
import { useAppMode } from '../hooks/useAppMode';
import { useDebounce } from '../hooks/useDebounce';
import { fetchCatalogPage, getGenresList } from '../services/tmdb';
import type { CatalogFilters, Genre, MediaItem, MediaType, SortOption } from '../types';

function readInitialFilters(searchParams: URLSearchParams): CatalogFilters {
  const typeParam = searchParams.get('type');
  const sortParam = searchParams.get('sort');
  const mediaType: MediaType = typeParam === 'tv' ? 'tv' : 'movie';
  const sortBy: SortOption =
    sortParam === 'vote_average.desc' || sortParam === 'release_date.desc'
      ? sortParam
      : 'popularity.desc';

  return {
    mediaType,
    query: searchParams.get('q') ?? '',
    genreIds: [],
    year: '',
    minRating: 0,
    sortBy,
  };
}

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDemoMode } = useAppMode();

  const [filters, setFilters] = useState<CatalogFilters>(() =>
    readInitialFilters(searchParams),
  );
  const debouncedQuery = useDebounce(filters.query, 350);

  const [genres, setGenres] = useState<Genre[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Синхронизация типа и сортировки с адресной строкой при переходе из каруселей
  useEffect(() => {
    const typeParam = searchParams.get('type');
    const sortParam = searchParams.get('sort');
    if (typeParam === 'movie' || typeParam === 'tv') {
      setFilters((prev) => {
        const nextSort: SortOption =
          sortParam === 'vote_average.desc' ||
          sortParam === 'release_date.desc' ||
          sortParam === 'popularity.desc'
            ? sortParam
            : prev.sortBy;
        if (prev.mediaType === typeParam && prev.sortBy === nextSort) return prev;
        return {
          ...prev,
          mediaType: typeParam,
          genreIds: prev.mediaType === typeParam ? prev.genreIds : [],
          sortBy: nextSort,
        };
      });
    }
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    getGenresList(filters.mediaType, isDemoMode).then((list) => {
      if (active) setGenres(list);
    });
    return () => {
      active = false;
    };
  }, [filters.mediaType, isDemoMode]);

  const loadPage = useCallback(
    async (targetPage: number, append: boolean, signal?: AbortSignal) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const result = await fetchCatalogPage(
          {
            ...filters,
            query: debouncedQuery,
          },
          targetPage,
          isDemoMode,
          signal,
        );

        if (signal?.aborted) return;

        setItems((prev) => (append ? [...prev, ...result.items] : result.items));
        setPage(result.page);
        setTotalPages(result.totalPages);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (signal?.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Ошибка при загрузке каталога.',
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [
      filters.mediaType,
      filters.genreIds,
      filters.year,
      filters.minRating,
      filters.sortBy,
      debouncedQuery,
      isDemoMode,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadPage(1, false, controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadPage]);

  const handleFiltersChange = (next: CatalogFilters) => {
    setFilters(next);
    const params = new URLSearchParams();
    params.set('type', next.mediaType);
    params.set('sort', next.sortBy);
    if (next.query.trim()) params.set('q', next.query.trim());
    setSearchParams(params, { replace: true });
  };

  const handleReset = () => {
    const resetFilters: CatalogFilters = {
      mediaType: filters.mediaType,
      query: '',
      genreIds: [],
      year: '',
      minRating: 0,
      sortBy: 'popularity.desc',
    };
    handleFiltersChange(resetFilters);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
          Каталог и поиск
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Ищите фильмы и сериалы по названию, актёрам или режиссёрам и комбинируйте любые фильтры.
        </p>
      </div>

      <CatalogFilterBar
        filters={filters}
        genres={genres}
        onChange={handleFiltersChange}
        onReset={handleReset}
      />

      {loading ? (
        <div className="space-y-6">
          <RowSkeleton count={5} />
          <RowSkeleton count={5} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void loadPage(1, false)} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Ничего не найдено"
          description="Попробуйте изменить поисковый запрос или смягчить выбранные фильтры."
          action={
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Сбросить фильтры
            </button>
          }
        />
      ) : (
        <div className="space-y-8">
          <MediaGrid items={items} />

          {page < totalPages ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadPage(page + 1, true)}
                className="rounded-xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:bg-[#11151E] dark:text-slate-100 dark:hover:bg-white/10"
              >
                {loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
