import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  Check,
  Heart,
  LayoutGrid,
  List,
  Search,
  Star,
} from 'lucide-react';
import { MediaGrid } from '../components/cards/MediaGrid';
import { PosterArtwork } from '../components/ui/PosterArtwork';
import { EmptyState } from '../components/ui/StateViews';
import { useLibrary } from '../hooks/useLibrary';
import type { Genre, LibraryItem, MediaItem } from '../types';

type LibraryTab = 'watchlist' | 'watched' | 'favorites';

function libraryItemToMediaItem(item: LibraryItem): MediaItem {
  if (item.mediaType === 'movie') {
    return {
      id: item.id,
      mediaType: 'movie',
      title: item.title,
      originalTitle: item.originalTitle,
      overview: '',
      posterPath: item.posterPath,
      backdropPath: null,
      releaseDate: item.year ? `${item.year}-01-01` : '',
      year: item.year,
      genreIds: item.genreIds,
      genres: item.genres,
      voteAverage: item.voteAverage,
      voteCount: 0,
      popularity: 0,
      originCountry: [],
      runtime: null,
      isDemoData: item.isDemoData,
    };
  }
  return {
    id: item.id,
    mediaType: 'tv',
    title: item.title,
    originalTitle: item.originalTitle,
    overview: '',
    posterPath: item.posterPath,
    backdropPath: null,
    releaseDate: item.year ? `${item.year}-01-01` : '',
    year: item.year,
    genreIds: item.genreIds,
    genres: item.genres,
    voteAverage: item.voteAverage,
    voteCount: 0,
    popularity: 0,
    originCountry: [],
    numberOfSeasons: null,
    numberOfEpisodes: null,
    episodeRuntime: null,
    isDemoData: item.isDemoData,
  };
}

export function LibraryPage() {
  const {
    watchlistItems,
    watchedItems,
    favoriteItems,
    toggleWatchlist,
    markWatched,
    toggleFavorite,
    rateTitle,
  } = useLibrary();

  const [activeTab, setActiveTab] = useState<LibraryTab>('watchlist');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenreId, setSelectedGenreId] = useState<number | ''>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const currentItems = useMemo(() => {
    if (activeTab === 'watchlist') return watchlistItems;
    if (activeTab === 'watched') return watchedItems;
    return favoriteItems;
  }, [activeTab, watchlistItems, watchedItems, favoriteItems]);

  const availableGenres = useMemo(() => {
    const map = new Map<number, Genre>();
    for (const item of currentItems) {
      for (const g of item.genres) {
        if (!map.has(g.id)) map.set(g.id, g);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [currentItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return currentItems
      .filter((item) => {
        if (!q) return true;
        return (
          item.title.toLowerCase().includes(q) ||
          item.originalTitle.toLowerCase().includes(q)
        );
      })
      .filter((item) =>
        selectedGenreId === ''
          ? true
          : item.genreIds.includes(selectedGenreId),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [currentItems, searchQuery, selectedGenreId]);

  const tabs: Array<{ id: LibraryTab; label: string; count: number }> = [
    { id: 'watchlist', label: 'Посмотреть позже', count: watchlistItems.length },
    { id: 'watched', label: 'Просмотрено', count: watchedItems.length },
    { id: 'favorites', label: 'Избранное', count: favoriteItems.length },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
          Моя коллекция
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Управляйте списками просмотра. Тайтл может находиться либо в «Посмотреть позже», либо в «Просмотрено», и дополнительно в «Избранном».
        </p>
      </div>

      {/* Вкладки и панель управления */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/[0.08] dark:bg-[#11151E]">
        <div
          role="tablist"
          aria-label="Списки библиотеки"
          className="flex flex-wrap gap-2"
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedGenreId('');
                }}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/[0.05] dark:text-slate-300 dark:hover:bg-white/[0.1]'
                }`}
              >
                <span>{tab.label}</span>
                <span className="tabular-nums text-xs opacity-80">
                  ({tab.count})
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <label htmlFor="library-search" className="sr-only">
              Поиск по коллекции
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="library-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск внутри списка..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
            />
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="library-genre" className="sr-only">
              Фильтр по жанру
            </label>
            <select
              id="library-genre"
              value={selectedGenreId}
              onChange={(e) =>
                setSelectedGenreId(
                  e.target.value === '' ? '' : Number(e.target.value),
                )
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
            >
              <option value="">Все жанры</option>
              {availableGenres.map((genre) => (
                <option key={genre.id} value={genre.id}>
                  {genre.name}
                </option>
              ))}
            </select>

            <div
              role="group"
              aria-label="Вид отображения"
              className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-[#0B0E15]"
            >
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-label="Сетка"
                aria-pressed={viewMode === 'grid'}
                className={`rounded-lg p-2 transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-slate-950 shadow-sm dark:bg-[#1B2230] dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                aria-label="Список"
                aria-pressed={viewMode === 'list'}
                className={`rounded-lg p-2 transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-slate-950 shadow-sm dark:bg-[#1B2230] dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <List className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Контент коллекции */}
      {filteredItems.length === 0 ? (
        <EmptyState
          title="В этом списке пока пусто"
          description={
            currentItems.length === 0
              ? 'Добавляйте фильмы и сериалы из каталога или подбора по настроению.'
              : 'По вашему поисковому запросу или фильтру жанра ничего не найдено.'
          }
          action={
            <>
              <Link
                to="/catalog"
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Перейти в каталог
              </Link>
              <Link
                to="/mood"
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Подобрать по настроению
              </Link>
            </>
          }
        />
      ) : viewMode === 'grid' ? (
        <MediaGrid items={filteredItems.map(libraryItemToMediaItem)} />
      ) : (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-white/[0.06] dark:border-white/[0.08] dark:bg-[#11151E]">
          {filteredItems.map((entry) => {
            const mediaItem = libraryItemToMediaItem(entry);
            return (
              <div
                key={`${entry.mediaType}:${entry.id}`}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <Link
                    to={`/title/${entry.mediaType}/${entry.id}`}
                    className="h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 dark:border-white/10"
                  >
                    <PosterArtwork
                      posterPath={entry.posterPath}
                      title={entry.title}
                      year={entry.year}
                      mediaType={entry.mediaType}
                      variant="thumb"
                    />
                  </Link>
                  <div className="min-w-0 space-y-1">
                    <Link
                      to={`/title/${entry.mediaType}/${entry.id}`}
                      className="font-display block truncate text-base font-semibold text-slate-950 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                    >
                      {entry.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span>{entry.mediaType === 'movie' ? 'Фильм' : 'Сериал'}</span>
                      {entry.year ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{entry.year}</span>
                        </>
                      ) : null}
                      {entry.genres.length > 0 ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{entry.genres.slice(0, 2).map((g) => g.name).join(', ')}</span>
                        </>
                      ) : null}
                      {entry.userRating ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-medium tabular-nums text-amber-500">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                            Ваша оценка: {entry.userRating}/10
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {entry.status === 'watched' ? (
                    <select
                      aria-label={`Оценка для «${entry.title}»`}
                      value={entry.userRating ?? ''}
                      onChange={(e) =>
                        rateTitle(
                          mediaItem,
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-200"
                    >
                      <option value="">Без оценки</option>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n} / 10
                        </option>
                      ))}
                    </select>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => toggleWatchlist(mediaItem)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      entry.status === 'watchlist'
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10'
                    }`}
                  >
                    <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                    Позже
                  </button>

                  <button
                    type="button"
                    onClick={() => markWatched(mediaItem)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      entry.status === 'watched'
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Просмотрено
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleFavorite(mediaItem)}
                    aria-label={
                      entry.isFavorite
                        ? `Убрать «${entry.title}» из избранного`
                        : `Добавить «${entry.title}» в избранное`
                    }
                    className={`inline-flex items-center justify-center rounded-lg p-2 transition-colors ${
                      entry.isFavorite
                        ? 'bg-violet-600 text-white'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10'
                    }`}
                  >
                    <Heart
                      className="h-3.5 w-3.5"
                      fill={entry.isFavorite ? 'currentColor' : 'none'}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
