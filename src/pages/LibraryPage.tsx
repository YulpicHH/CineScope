import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bookmark,
  Check,
  Download,
  Film,
  FolderOpen,
  HardDrive,
  Heart,
  LayoutGrid,
  List,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { MediaGrid } from '../components/cards/MediaGrid';
import { OfflineMediaModal } from '../components/offline/OfflineMediaModal';
import { PosterArtwork } from '../components/ui/PosterArtwork';
import { EmptyState } from '../components/ui/StateViews';
import { useLibrary } from '../hooks/useLibrary';
import { useOfflineDownloads } from '../hooks/useOfflineDownloads';
import type { Genre, LibraryItem, MediaItem } from '../types';
import {
  extractFileFormatLabel,
  formatFileSize,
  type OfflineDownloadItem,
} from '../utils/offlineDownloadsRules';
import { isTauriRuntime } from '../utils/platform';

type LibraryTab = 'watching' | 'watchlist' | 'watched' | 'favorites' | 'downloads';

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
    watchingItems,
    watchlistItems,
    watchedItems,
    favoriteItems,
    removeFromWatching,
    toggleWatchlist,
    markWatched,
    toggleFavorite,
    rateTitle,
  } = useLibrary();

  const {
    items: offlineItems,
    activeDownloads,
    totalSizeBytes,
    missingFileMap,
    playOfflineItem,
    revealOfflineItem,
    deleteOfflineItem,
    cancelDownload,
    verifyFilesOnDisk,
  } = useOfflineDownloads();

  const isDesktop = isTauriRuntime();

  const [activeTab, setActiveTab] = useState<LibraryTab>(() =>
    watchingItems.length > 0 ? 'watching' : 'watchlist',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenreId, setSelectedGenreId] = useState<number | ''>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [addOfflineOpen, setAddOfflineOpen] = useState(false);
  const [relinkTarget, setRelinkTarget] = useState<OfflineDownloadItem | null>(
    null,
  );
  const [offlineActionError, setOfflineActionError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (activeTab === 'downloads') {
      void verifyFilesOnDisk();
    }
  }, [activeTab, verifyFilesOnDisk]);

  const currentItems = useMemo(() => {
    if (activeTab === 'watching') return watchingItems;
    if (activeTab === 'watchlist') return watchlistItems;
    if (activeTab === 'watched') return watchedItems;
    if (activeTab === 'favorites') return favoriteItems;
    return [];
  }, [activeTab, watchingItems, watchlistItems, watchedItems, favoriteItems]);

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

  const filteredOfflineItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return offlineItems.filter((item) => {
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.originalTitle.toLowerCase().includes(q) ||
        item.fileName.toLowerCase().includes(q)
      );
    });
  }, [offlineItems, searchQuery]);

  const tabs: Array<{ id: LibraryTab; label: string; count: number }> = [
    { id: 'watching', label: 'В процессе', count: watchingItems.length },
    { id: 'watchlist', label: 'Посмотреть позже', count: watchlistItems.length },
    { id: 'watched', label: 'Просмотрено', count: watchedItems.length },
    { id: 'favorites', label: 'Избранное', count: favoriteItems.length },
    {
      id: 'downloads',
      label: 'Загрузки',
      count: offlineItems.length + activeDownloads.length,
    },
  ];

  const handlePlayOffline = async (item: OfflineDownloadItem) => {
    setOfflineActionError(null);
    try {
      await playOfflineItem(item);
    } catch (err: unknown) {
      setOfflineActionError(
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Не удалось воспроизвести офлайн-файл.',
      );
    }
  };

  const handleRevealOffline = async (item: OfflineDownloadItem) => {
    setOfflineActionError(null);
    try {
      await revealOfflineItem(item);
    } catch (err: unknown) {
      setOfflineActionError(
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Не удалось открыть файл в Finder.',
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
          Моя коллекция
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Управляйте списками просмотра и офлайн-загрузками. Сохранённые и привязанные видеофайлы доступны во вкладке «Загрузки» без интернета.
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
                data-testid={`library-tab-${tab.id}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedGenreId('');
                  setOfflineActionError(null);
                }}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/[0.05] dark:text-slate-300 dark:hover:bg-white/[0.1]'
                }`}
              >
                {tab.id === 'downloads' ? (
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                ) : null}
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
              placeholder={
                activeTab === 'downloads'
                  ? 'Поиск по названию или имени файла...'
                  : 'Поиск внутри списка...'
              }
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
            />
          </div>

          {activeTab === 'downloads' ? (
            <div className="flex flex-wrap items-center gap-3">
              {offlineItems.length > 0 ? (
                <div
                  data-testid="downloads-storage-summary"
                  className="inline-flex items-center gap-1.5 text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400"
                >
                  <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {offlineItems.length} видео · {formatFileSize(totalSizeBytes)}
                  </span>
                </div>
              ) : null}
              <button
                type="button"
                data-testid="downloads-add-video-button"
                onClick={() => {
                  setOfflineActionError(null);
                  setRelinkTarget(null);
                  setAddOfflineOpen(true);
                }}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Добавить видео
              </button>
            </div>
          ) : (
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
          )}
        </div>
      </div>

      {/* Вкладка «Загрузки» */}
      {activeTab === 'downloads' ? (
        <div className="space-y-4">
          {offlineActionError ? (
            <div
              role="alert"
              data-testid="downloads-action-error"
              className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-rose-300"
            >
              <span>{offlineActionError}</span>
              <button
                type="button"
                onClick={() => setOfflineActionError(null)}
                aria-label="Скрыть ошибку"
                className="rounded-lg p-1 hover:bg-rose-500/15"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {/* Активные загрузки */}
          {activeDownloads.length > 0 ? (
            <div className="space-y-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Активные загрузки
              </h2>
              <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-blue-500/30 bg-white dark:divide-white/[0.06] dark:bg-[#11151E]">
                {activeDownloads.map((dl) => (
                  <div
                    key={dl.downloadId}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Loader2
                            className="h-4 w-4 shrink-0 animate-spin text-blue-500"
                            aria-hidden="true"
                          />
                          <span className="font-display truncate text-sm font-semibold text-slate-950 dark:text-white">
                            {dl.title || 'Загрузка видео'}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            · {dl.qualityLabel}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
                          {formatFileSize(dl.downloadedBytes)}
                          {dl.totalBytes
                            ? ` / ${formatFileSize(dl.totalBytes)}`
                            : ''}
                          {dl.progressPercent !== null
                            ? ` (${dl.progressPercent}%)`
                            : ''}
                        </span>
                      </div>

                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all duration-200"
                          style={{ width: `${dl.progressPercent ?? 18}%` }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void cancelDownload(dl.downloadId)}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-500/20 dark:text-rose-300"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Отменить
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Список сохранённых и привязанных видео */}
          {filteredOfflineItems.length === 0 && activeDownloads.length === 0 ? (
            <EmptyState
              title={
                offlineItems.length === 0
                  ? 'Нет видео для офлайн-просмотра'
                  : 'Ничего не найдено'
              }
              description={
                offlineItems.length === 0
                  ? isDesktop
                    ? 'Скачайте видео по прямой ссылке (NAS, медиасервер, облако) или привяжите готовый файл с Mac. Воспроизведение откроется в системном плеере в исходном 4K HDR качестве.'
                    : 'Скачайте видео по прямой ссылке или выберите файл с устройства — он сохранится локально в браузере и откроется без интернета.'
                  : 'По вашему поисковому запросу среди загрузок ничего не найдено.'
              }
              action={
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setRelinkTarget(null);
                      setAddOfflineOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Добавить видео
                  </button>
                  <Link
                    to="/catalog"
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    Перейти в каталог
                  </Link>
                </>
              }
            />
          ) : filteredOfflineItems.length > 0 ? (
            <div
              data-testid="downloads-list"
              className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-white/[0.06] dark:border-white/[0.08] dark:bg-[#11151E]"
            >
              {filteredOfflineItems.map((entry) => {
                const isMissing = Boolean(missingFileMap[entry.downloadId]);
                const formatLabel = extractFileFormatLabel(entry.fileName);
                const sourceLabel =
                  entry.source === 'download'
                    ? 'Скачано'
                    : isDesktop
                      ? 'Файл с Mac'
                      : 'Локальный файл';
                const deleteTooltip =
                  entry.source === 'download'
                    ? 'Удалить скачанный файл с диска'
                    : 'Убрать из CineScope (личный файл на диске сохранится)';

                return (
                  <div
                    key={entry.downloadId}
                    data-testid="offline-download-row"
                    className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      {entry.tmdbId ? (
                        <Link
                          to={`/title/${entry.mediaType}/${entry.tmdbId}`}
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
                      ) : (
                        <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400 dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-500">
                          <Film className="h-6 w-6" aria-hidden="true" />
                        </div>
                      )}

                      <div className="min-w-0 space-y-1">
                        {entry.tmdbId ? (
                          <Link
                            to={`/title/${entry.mediaType}/${entry.tmdbId}`}
                            className="font-display block truncate text-base font-semibold text-slate-950 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                          >
                            {entry.title}
                          </Link>
                        ) : (
                          <p className="font-display truncate text-base font-semibold text-slate-950 dark:text-white">
                            {entry.title}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            {entry.mediaType === 'movie' ? 'Фильм' : 'Сериал'}
                          </span>
                          {entry.year ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">{entry.year}</span>
                            </>
                          ) : null}
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {entry.qualityLabel}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium">{formatLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {formatFileSize(entry.fileSizeBytes)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{sourceLabel}</span>
                        </div>

                        <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                          {entry.fileName}
                        </p>

                        {isMissing ? (
                          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-amber-600 dark:text-amber-400">
                            <span className="inline-flex items-center gap-1 font-medium">
                              <AlertTriangle
                                className="h-3.5 w-3.5 shrink-0"
                                aria-hidden="true"
                              />
                              Файл не найден на диске
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setRelinkTarget(entry);
                                setAddOfflineOpen(true);
                              }}
                              className="inline-flex items-center gap-1 font-semibold underline hover:no-underline"
                            >
                              <RefreshCw className="h-3 w-3" aria-hidden="true" />
                              Привязать заново
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        data-testid="downloads-play-button"
                        onClick={() => void handlePlayOffline(entry)}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                        Смотреть офлайн
                      </button>

                      {isDesktop && entry.filePath ? (
                        <button
                          type="button"
                          data-testid="downloads-finder-button"
                          title="Показать в Finder"
                          aria-label={`Показать «${entry.title}» в Finder`}
                          onClick={() => void handleRevealOffline(entry)}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                        >
                          <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="hidden sm:inline">Finder</span>
                        </button>
                      ) : null}

                      <button
                        type="button"
                        data-testid="downloads-delete-button"
                        title={deleteTooltip}
                        aria-label={`${deleteTooltip}: ${entry.title}`}
                        onClick={() => {
                          setOfflineActionError(null);
                          void deleteOfflineItem(entry);
                        }}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 p-2 text-slate-500 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:text-slate-400 dark:hover:border-rose-500/40 dark:hover:bg-rose-500/15 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title="В этом списке пока пусто"
          description={
            currentItems.length === 0
              ? activeTab === 'watching'
                ? 'Нажмите «Смотреть» на странице фильма или сериала, чтобы он автоматически появился во вкладке «В процессе».'
                : 'Добавляйте фильмы и сериалы из каталога или подбора по настроению.'
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
                to="/catalog?panel=mood"
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Подобрать по настроению
              </Link>
            </>
          }
        />
      ) : viewMode === 'grid' ? (
        <MediaGrid
          items={filteredItems.map(libraryItemToMediaItem)}
          onRemove={activeTab === 'watching' ? removeFromWatching : undefined}
          removeLabel="Удалить из «В процессе»"
        />
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

                  {activeTab === 'watching' ? (
                    <button
                      type="button"
                      onClick={() => removeFromWatching(mediaItem)}
                      aria-label={`Удалить «${entry.title}» из «В процессе»`}
                      title="Удалить из «В процессе»"
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:text-slate-400 dark:hover:border-rose-500/40 dark:hover:bg-rose-500/15 dark:hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <OfflineMediaModal
        isOpen={addOfflineOpen}
        onClose={() => {
          setAddOfflineOpen(false);
          setRelinkTarget(null);
        }}
        media={
          relinkTarget
            ? {
                tmdbId: relinkTarget.tmdbId,
                mediaType: relinkTarget.mediaType,
                title: relinkTarget.title,
                originalTitle: relinkTarget.originalTitle,
                year: relinkTarget.year,
                posterPath: relinkTarget.posterPath,
                genres: relinkTarget.genres,
                voteAverage: relinkTarget.voteAverage,
              }
            : null
        }
        initialTab={relinkTarget ? 'file' : 'url'}
        onSuccess={() => {
          if (relinkTarget && relinkTarget.tmdbId === null) {
            void deleteOfflineItem(relinkTarget);
          }
          setRelinkTarget(null);
        }}
      />
    </div>
  );
}
