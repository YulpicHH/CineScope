import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Check, Info, RefreshCw, Star, X } from 'lucide-react';
import { useLibrary } from '../../hooks/useLibrary';
import type { MediaItem } from '../../types';
import { PosterArtwork } from '../ui/PosterArtwork';

interface RandomPickModalProps {
  open: boolean;
  item: MediaItem | null;
  reason: string;
  loading: boolean;
  canIncludeWatched: boolean;
  onNext: () => void;
  onIncludeWatched: () => void;
  onClose: () => void;
}

export function RandomPickModal({
  open,
  item,
  reason,
  loading,
  canIncludeWatched,
  onNext,
  onIncludeWatched,
  onClose,
}: RandomPickModalProps) {
  const { getEntry, toggleWatchlist } = useLibrary();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const entry = item ? getEntry(item.id, item.mediaType) : undefined;
  const isWatchlist = entry?.status === 'watchlist';
  const isWatched = entry?.status === 'watched';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="random-pick-title"
      className="safe-modal-inset tv-modal-overscan fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="animate-hero-enter safe-modal-panel relative w-full max-w-[720px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/12 dark:bg-[#11151E]">
        {/* Верхняя строка */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4 dark:border-white/[0.08]">
          <div>
            <h2
              id="random-pick-title"
              className="font-display text-lg font-bold tracking-tight text-slate-950 dark:text-white"
            >
              Случайный выбор на вечер
            </h2>
            {reason ? (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {reason}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно случайного выбора"
            data-tv-modal-close="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Тело модалки */}
        {loading && !item ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <RefreshCw
              className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Подбираем подходящий вариант...
            </p>
          </div>
        ) : !item ? (
          <div className="space-y-4 px-6 py-12 text-center">
            <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
              По текущим фильтрам вариантов не нашлось
            </p>
            <p className="mx-auto max-w-md text-sm text-slate-500 dark:text-slate-400">
              {canIncludeWatched
                ? 'Все найденные фильмы и сериалы уже отмечены вами как просмотренные.'
                : 'Попробуйте смягчить выбранные фильтры, год или минимальный рейтинг.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {canIncludeWatched ? (
                <button
                  type="button"
                  onClick={onIncludeWatched}
                  className="whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Включить просмотренное
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="whitespace-nowrap rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Изменить фильтры
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row">
              <Link
                to={`/title/${item.mediaType}/${item.id}`}
                onClick={onClose}
                className="mx-auto aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 sm:mx-0 sm:w-44 dark:border-white/10 dark:bg-[#0B0E15]"
              >
                <PosterArtwork
                  posterPath={item.posterPath}
                  title={item.title}
                  year={item.year}
                  mediaType={item.mediaType}
                  variant="detail"
                  priority
                />
              </Link>

              <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <span>{item.mediaType === 'tv' ? 'Сериал' : 'Фильм'}</span>
                    {item.year ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{item.year}</span>
                      </>
                    ) : null}
                    {item.genres.length > 0 ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {item.genres
                            .slice(0, 3)
                            .map((g) => g.name)
                            .join(', ')}
                        </span>
                      </>
                    ) : null}
                    {item.voteAverage > 0 ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 tabular-nums font-semibold text-slate-800 dark:text-amber-300">
                          <Star
                            className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                            aria-hidden="true"
                          />
                          {item.isDemoData
                            ? `Демо ${item.voteAverage.toFixed(1)}`
                            : item.voteAverage.toFixed(1)}
                        </span>
                      </>
                    ) : null}
                  </div>

                  <Link
                    to={`/title/${item.mediaType}/${item.id}`}
                    onClick={onClose}
                    className="font-display block text-balance text-2xl font-bold tracking-tight text-slate-950 transition-colors hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                  >
                    {item.title}
                  </Link>

                  {item.originalTitle && item.originalTitle !== item.title ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {item.originalTitle}
                    </p>
                  ) : null}

                  <p className="line-clamp-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {item.overview || 'Описание для этого тайтла отсутствует.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-4 dark:border-white/[0.08]">
                  <Link
                    to={`/title/${item.mediaType}/${item.id}`}
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-blue-400"
                  >
                    <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Подробнее
                  </Link>

                  <button
                    type="button"
                    onClick={() => toggleWatchlist(item)}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${
                      isWatchlist
                        ? 'border-blue-500/40 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-400/40 dark:bg-blue-500/15 dark:text-blue-300'
                        : isWatched
                          ? 'border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-300'
                          : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100 dark:hover:bg-white/10'
                    }`}
                    aria-pressed={isWatchlist}
                  >
                    {isWatched ? (
                      <>
                        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Просмотрено
                      </>
                    ) : (
                      <>
                        <Bookmark
                          className="h-4 w-4 shrink-0"
                          fill={isWatchlist ? 'currentColor' : 'none'}
                          aria-hidden="true"
                        />
                        {isWatchlist ? 'В закладках' : 'Буду смотреть'}
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={onNext}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-50 sm:ml-auto dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-white/10"
                  >
                    <RefreshCw
                      className={`h-4 w-4 shrink-0 ${loading ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    Другой вариант
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
