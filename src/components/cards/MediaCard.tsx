import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Check, Heart, Star, Trash2 } from 'lucide-react';
import { useLibrary } from '../../hooks/useLibrary';
import type { MediaItem } from '../../types';
import { isTvMode } from '../../utils/platform';
import { PosterArtwork } from '../ui/PosterArtwork';

interface MediaCardProps {
  item: MediaItem;
  compact?: boolean;
  showMediaType?: boolean;
  onRemove?: (item: MediaItem) => void;
  removeLabel?: string;
  tvAutoFocus?: boolean;
  onSelect?: (item: MediaItem) => void;
}

export const MediaCard = memo(function MediaCard({
  item,
  compact = false,
  showMediaType = false,
  onRemove,
  removeLabel,
  tvAutoFocus = false,
  onSelect,
}: MediaCardProps) {
  const { getEntry, toggleWatchlist, toggleFavorite } = useLibrary();
  const entry = getEntry(item.id, item.mediaType);
  const tvMode = isTvMode();
  const mediaKey = `${item.mediaType}:${item.id}`;

  const isWatchlist = entry?.status === 'watchlist';
  const isWatched = entry?.status === 'watched';
  const isFavorite = Boolean(entry?.isFavorite);

  const primaryGenre = item.genres[0]?.name;
  const ratingText =
    item.voteAverage > 0
      ? item.isDemoData
        ? `Демо ${item.voteAverage.toFixed(1)}`
        : item.voteAverage.toFixed(1)
      : null;

  return (
    <article
      className={`media-card-contain group relative flex flex-col ${
        compact ? 'w-[162px] shrink-0 sm:w-[186px]' : 'w-full'
      }`}
    >
      <div className="relative aspect-[2/3] w-full rounded-xl">
        <Link
          to={`/title/${item.mediaType}/${item.id}`}
          data-tv-focusable="true"
          data-media-key={mediaKey}
          data-tv-autofocus={tvAutoFocus ? 'true' : undefined}
          onClick={() => onSelect?.(item)}
          className="block h-full w-full overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/[0.08] dark:bg-[#11151E]"
        >
          <PosterArtwork
            posterPath={item.posterPath}
            title={item.title}
            year={item.year}
            mediaType={item.mediaType}
            variant="card"
            className="transition-transform duration-200 ease-out group-hover:scale-[1.03]"
          />
        </Link>

        {/* Быстрые действия на карточке (без backdrop-blur для плавного скролла в WKWebView) */}
        {!tvMode || onRemove ? (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 opacity-100 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            {!tvMode ? (
              <>
                <button
                  type="button"
                  onClick={() => toggleWatchlist(item)}
                  aria-label={
                    isWatchlist
                      ? `Убрать «${item.title}» из списка «Посмотреть позже»`
                      : `Добавить «${item.title}» в список «Посмотреть позже»`
                  }
                  title={isWatchlist ? 'В списке «Посмотреть позже»' : 'Посмотреть позже'}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${
                    isWatchlist
                      ? 'border-blue-400/50 bg-blue-600 text-white'
                      : isWatched
                        ? 'border-emerald-400/50 bg-emerald-600 text-white'
                        : 'border-white/20 bg-black/75 text-white hover:bg-black/90'
                  }`}
                >
                  {isWatched ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Bookmark
                      className="h-4 w-4"
                      fill={isWatchlist ? 'currentColor' : 'none'}
                      aria-hidden="true"
                    />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => toggleFavorite(item)}
                  aria-label={
                    isFavorite
                      ? `Убрать «${item.title}» из избранного`
                      : `Добавить «${item.title}» в избранное`
                  }
                  title={isFavorite ? 'В избранном' : 'В избранное'}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${
                    isFavorite
                      ? 'border-violet-400/50 bg-violet-600 text-white'
                      : 'border-white/20 bg-black/75 text-white hover:bg-black/90'
                  }`}
                >
                  <Heart
                    className="h-4 w-4"
                    fill={isFavorite ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                </button>
              </>
            ) : null}

            {onRemove ? (
              <button
                type="button"
                data-testid="card-remove-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(item);
                }}
                aria-label={
                  removeLabel
                    ? `${removeLabel}: ${item.title}`
                    : `Удалить «${item.title}»`
                }
                title={removeLabel ?? 'Удалить'}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/75 text-white transition-colors hover:border-rose-400/60 hover:bg-rose-600 focus-visible:outline-2 focus-visible:outline-rose-500"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-col gap-1">
        <Link
          to={`/title/${item.mediaType}/${item.id}`}
          tabIndex={tvMode ? -1 : undefined}
          onClick={() => onSelect?.(item)}
          className="font-display line-clamp-1 text-sm font-semibold text-slate-900 transition-colors hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-100 dark:hover:text-blue-400"
        >
          {item.title}
        </Link>

        {/* Метаданные без капсул/плашек: чистый текст с разделителями */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          {showMediaType ? (
            <span>{item.mediaType === 'tv' ? 'Сериал' : 'Фильм'}</span>
          ) : null}
          {showMediaType && item.year ? <span aria-hidden="true">·</span> : null}
          {item.year ? <span className="tabular-nums">{item.year}</span> : null}
          {(showMediaType || item.year) && primaryGenre ? <span aria-hidden="true">·</span> : null}
          {primaryGenre ? <span className="truncate max-w-[110px]">{primaryGenre}</span> : null}
          {(showMediaType || item.year || primaryGenre) && ratingText ? (
            <span aria-hidden="true">·</span>
          ) : null}
          {ratingText ? (
            <span className="inline-flex items-center gap-1 tabular-nums text-slate-700 dark:text-slate-300">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
              {ratingText}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
});
