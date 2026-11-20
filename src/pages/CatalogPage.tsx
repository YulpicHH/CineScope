import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MediaGrid } from '../components/cards/MediaGrid';
import { RandomPickModal } from '../components/catalog/RandomPickModal';
import { CatalogFilterBar } from '../components/filters/CatalogFilterBar';
import { RowSkeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StateViews';
import { useAppMode } from '../hooks/useAppMode';
import { useDebounce } from '../hooks/useDebounce';
import { useLibrary } from '../hooks/useLibrary';
import {
  fetchCatalogPage,
  fetchRandomCatalogCandidates,
  getGenresList,
} from '../services/tmdb';
import type {
  CatalogFilters,
  CatalogMediaScope,
  Genre,
  MediaItem,
  MoodId,
  SortOption,
} from '../types';
import {
  buildEveningPickReason,
  excludeWatchedItems,
  getMediaItemKey,
  isValidMoodId,
  pickRandomEveningItem,
} from '../utils/catalogHelpers';

function parseMediaScope(raw: string | null): CatalogMediaScope {
  if (raw === 'movie' || raw === 'tv' || raw === 'all' || raw === 'anime') {
    return raw;
  }
  return 'all';
}

function parseSortOption(raw: string | null): SortOption {
  if (
    raw === 'vote_average.desc' ||
    raw === 'release_date.desc' ||
    raw === 'popularity.desc'
  ) {
    return raw;
  }
  return 'popularity.desc';
}

function parseMoodList(raw: string | null): MoodId[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(isValidMoodId),
    ),
  );
}

function parseGenreList(raw: string | null): number[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  );
}

function readInitialFilters(searchParams: URLSearchParams): CatalogFilters {
  const ratingNum = Number(searchParams.get('rating') ?? '0');
  return {
    mediaType: parseMediaScope(searchParams.get('type')),
    query: searchParams.get('q') ?? '',
    moods: parseMoodList(searchParams.get('mood')),
    genreIds: parseGenreList(searchParams.get('genre')),
    country: (searchParams.get('country') ?? '').toUpperCase().slice(0, 2),
    year: (searchParams.get('year') ?? '').replace(/\D/g, '').slice(0, 4),
    minRating: Number.isFinite(ratingNum) && ratingNum >= 0 ? ratingNum : 0,
    sortBy: parseSortOption(searchParams.get('sort')),
    hideWatched: searchParams.get('unwatched') === '1',
  };
}

function serializeFiltersToParams(next: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (next.mediaType !== 'all') params.set('type', next.mediaType);
  if (next.sortBy !== 'popularity.desc') params.set('sort', next.sortBy);
  if (next.query.trim()) params.set('q', next.query.trim());
  if (next.moods.length > 0) params.set('mood', next.moods.join(','));
  if (next.genreIds.length > 0) params.set('genre', next.genreIds.join(','));
  if (next.country) params.set('country', next.country);
  if (next.year) params.set('year', next.year);
  if (next.minRating > 0) params.set('rating', String(next.minRating));
  if (next.hideWatched) params.set('unwatched', '1');
  return params;
}

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDemoMode } = useAppMode();
  const { watchedItems } = useLibrary();

  const [filters, setFilters] = useState<CatalogFilters>(() =>
    readInitialFilters(searchParams),
  );
  const debouncedQuery = useDebounce(filters.query, 350);
  const highlightMoods = searchParams.get('panel') === 'mood';

  const [genres, setGenres] = useState<Genre[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Состояние модального окна «Случайный выбор на вечер»
  const [randomOpen, setRandomOpen] = useState(false);
  const [randomItem, setRandomItem] = useState<MediaItem | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);
  const randomExtraPoolRef = useRef<MediaItem[]>([]);
  const seenPickKeysRef = useRef<Set<string>>(new Set());
  const randomAbortRef = useRef<AbortController | null>(null);

  const watchedKeys = useMemo(
    () => new Set(watchedItems.map((i) => `${i.mediaType}:${i.id}`)),
    [watchedItems],
  );

  // Синхронизация URL-параметров при переходе с главной страницы (карусели, кнопка «Подобрать на вечер»)
  useEffect(() => {
    const typeParam = searchParams.get('type');
    const sortParam = searchParams.get('sort');
    if (
      typeParam === 'movie' ||
      typeParam === 'tv' ||
      typeParam === 'all' ||
      typeParam === 'anime'
    ) {
      setFilters((prev) => {
        const nextSort = sortParam ? parseSortOption(sortParam) : prev.sortBy;
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

  // Сбрасываем кэш рулетки при изменении фильтров
  useEffect(() => {
    randomExtraPoolRef.current = [];
    seenPickKeysRef.current = new Set();
  }, [
    filters.mediaType,
    filters.moods,
    filters.genreIds,
    filters.country,
    filters.year,
    filters.minRating,
    filters.sortBy,
    filters.hideWatched,
    debouncedQuery,
    isDemoMode,
  ]);

  // Отменяем фоновый запрос рулетки при размонтировании
  useEffect(() => {
    return () => {
      randomAbortRef.current?.abort();
    };
  }, []);

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

        setItems((prev) => {
          if (!append) return result.items;
          const seen = new Set(prev.map(getMediaItemKey));
          const fresh = result.items.filter((item) => !seen.has(getMediaItemKey(item)));
          return [...prev, ...fresh];
        });
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
      filters.moods,
      filters.genreIds,
      filters.country,
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

  const { visible: visibleItems, hiddenCount: hiddenWatchedCount } = useMemo(
    () => excludeWatchedItems(items, watchedKeys, filters.hideWatched),
    [items, watchedKeys, filters.hideWatched],
  );

  const handleFiltersChange = (next: CatalogFilters) => {
    setFilters(next);
    setSearchParams(serializeFiltersToParams(next), { replace: true });
  };

  const handleReset = () => {
    const resetFilters: CatalogFilters = {
      mediaType: 'all',
      query: '',
      moods: [],
      genreIds: [],
      country: '',
      year: '',
      minRating: 0,
      sortBy: 'popularity.desc',
      hideWatched: false,
    };
    handleFiltersChange(resetFilters);
  };

  const runRandomPick = useCallback(
    async (overrideFilters?: CatalogFilters) => {
      const activeFilters = overrideFilters ?? {
        ...filters,
        query: debouncedQuery,
      };
      setRandomOpen(true);

      const combinePool = (extra: MediaItem[]): MediaItem[] => {
        const seen = new Set<string>();
        const merged: MediaItem[] = [];
        for (const item of [...items, ...extra]) {
          const key = getMediaItemKey(item);
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }
        return excludeWatchedItems(merged, watchedKeys, activeFilters.hideWatched)
          .visible;
      };

      const currentPool = combinePool(randomExtraPoolRef.current);
      const hasUnseenInCurrent = currentPool.some(
        (item) => !seenPickKeysRef.current.has(getMediaItemKey(item)),
      );

      let workingPool = currentPool;

      // Если локальный пул исчерпан или пуст, пробуем добрать случайную страницу из TMDB
      if (!hasUnseenInCurrent && !isDemoMode && totalPages > 1) {
        randomAbortRef.current?.abort();
        const controller = new AbortController();
        randomAbortRef.current = controller;
        setRandomLoading(true);
        try {
          const extra = await fetchRandomCatalogCandidates(
            activeFilters,
            totalPages,
            false,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          randomExtraPoolRef.current = [...randomExtraPoolRef.current, ...extra];
          workingPool = combinePool(randomExtraPoolRef.current);
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
        } finally {
          if (!controller.signal.aborted) {
            setRandomLoading(false);
          }
        }
      }

      const lastKey = randomItem ? getMediaItemKey(randomItem) : null;
      const { item: picked, resetSeen } = pickRandomEveningItem(
        workingPool,
        seenPickKeysRef.current,
        lastKey,
      );

      if (resetSeen) {
        seenPickKeysRef.current = new Set();
      }
      if (picked) {
        seenPickKeysRef.current.add(getMediaItemKey(picked));
      }
      setRandomItem(picked);
    },
    [
      filters,
      debouncedQuery,
      items,
      watchedKeys,
      isDemoMode,
      totalPages,
      randomItem,
    ],
  );

  const handleIncludeWatchedAndPick = () => {
    const nextFilters: CatalogFilters = {
      ...filters,
      hideWatched: false,
    };
    handleFiltersChange(nextFilters);
    void runRandomPick({ ...nextFilters, query: debouncedQuery });
  };

  const randomReason = useMemo(
    () => (randomItem ? buildEveningPickReason(randomItem, filters) : ''),
    [randomItem, filters],
  );

  const allHiddenByWatched =
    !loading &&
    !error &&
    items.length > 0 &&
    visibleItems.length === 0 &&
    filters.hideWatched;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-balance text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
          Каталог и подбор
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Единый поиск фильмов и сериалов по названию, актёрам, настроению вечера, стране и рейтингу.
        </p>
      </div>

      <CatalogFilterBar
        filters={filters}
        genres={genres}
        hiddenWatchedCount={hiddenWatchedCount}
        watchedTotalCount={watchedItems.length}
        highlightMoods={highlightMoods}
        isPickingRandom={randomLoading}
        onChange={handleFiltersChange}
        onReset={handleReset}
        onOpenRandomPick={() => void runRandomPick()}
      />

      {loading ? (
        <div className="space-y-6">
          <RowSkeleton count={5} />
          <RowSkeleton count={5} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void loadPage(1, false)} />
      ) : allHiddenByWatched ? (
        <EmptyState
          title="Все найденные тайтлы уже просмотрены"
          description={`Фильтр «Скрыть просмотренное» скрыл ${hiddenWatchedCount} из ${items.length} загруженных позиций.`}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {page < totalPages ? (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void loadPage(page + 1, true)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {loadingMore ? 'Загрузка...' : 'Загрузить следующую страницу'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  handleFiltersChange({ ...filters, hideWatched: false })
                }
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-white/15 dark:bg-[#11151E] dark:text-slate-100 dark:hover:bg-white/10"
              >
                Показать просмотренные
              </button>
            </div>
          }
        />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          title="Ничего не найдено"
          description="Попробуйте изменить поисковый запрос, выбрать другое настроение или смягчить фильтры."
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
          <MediaGrid
            items={visibleItems}
            showMediaType={
              filters.mediaType === 'all' || filters.mediaType === 'anime'
            }
          />

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

      <RandomPickModal
        open={randomOpen}
        item={randomItem}
        reason={randomReason}
        loading={randomLoading}
        canIncludeWatched={filters.hideWatched && items.length > 0}
        onNext={() => void runRandomPick()}
        onIncludeWatched={handleIncludeWatchedAndPick}
        onClose={() => setRandomOpen(false)}
      />
    </div>
  );
}
