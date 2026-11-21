import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Check,
  ExternalLink,
  Heart,
  KeyRound,
  Loader2,
  Play,
  PlayCircle,
  RotateCw,
  Star,
  User as UserIcon,
} from 'lucide-react';
import { MediaCarousel } from '../components/cards/MediaCarousel';
import { DescriptionModal } from '../components/ui/DescriptionModal';
import { BackdropArtwork, PosterArtwork } from '../components/ui/PosterArtwork';
import { DetailsSkeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/StateViews';
import { useAppMode } from '../hooks/useAppMode';
import { useLibrary } from '../hooks/useLibrary';
import {
  openWatchWindow,
  resolveWatchLink,
  type KinopoiskWatchResolution,
} from '../services/kinopoisk';
import { getTitleDetails } from '../services/tmdb';
import type { MediaType, TitleDetailsData } from '../types';
import {
  formatRuntime,
  formatSeasonsCount,
  formatVoteCount,
} from '../utils/formatters';
import { buildProfileImageProps } from '../utils/imageUrl';
import { getLastCatalogSearch } from '../utils/catalogSessionCache';
import {
  isAndroidTauri,
  isDesktopTauriRuntime,
  isTvMode,
  openExternalUrl,
} from '../utils/platform';

type WatchResolutionState =
  | { status: 'idle' | 'loading' }
  | KinopoiskWatchResolution;

export function TitleDetailsPage() {
  const { mediaType: rawType, id: rawId } = useParams<{
    mediaType: string;
    id: string;
  }>();
  const mediaType: MediaType = rawType === 'tv' ? 'tv' : 'movie';
  const id = Number(rawId);

  const { isDemoMode, keysVersion, openSettingsModal } = useAppMode();
  const {
    getEntry,
    markWatching,
    toggleWatchlist,
    markWatched,
    toggleFavorite,
    rateTitle,
  } = useLibrary();

  const [details, setDetails] = useState<TitleDetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchState, setWatchState] = useState<WatchResolutionState>({
    status: 'idle',
  });
  const [watchRetryCount, setWatchRetryCount] = useState(0);
  const [missingKeyNotice, setMissingKeyNotice] = useState(false);
  const [watchWindowError, setWatchWindowError] = useState<string | null>(null);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);

  const loadDetails = useCallback(async () => {
    if (!Number.isFinite(id) || id <= 0) {
      setError('Некорректный идентификатор тайтла.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setIsDescriptionOpen(false);
    setWatchState({ status: 'idle' });
    try {
      const data = await getTitleDetails(mediaType, id, isDemoMode);
      setDetails(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Не удалось загрузить информацию о тайтле.',
      );
    } finally {
      setLoading(false);
    }
  }, [mediaType, id, isDemoMode, keysVersion]);

  useEffect(() => {
    void loadDetails();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [loadDetails]);

  useEffect(() => {
    if (!details) return;
    let active = true;
    const { item } = details;
    setWatchState({ status: 'loading' });
    setMissingKeyNotice(false);
    setWatchWindowError(null);

    void resolveWatchLink(
      {
        tmdbId: item.id,
        mediaType: item.mediaType,
        title: item.title,
        originalTitle: item.originalTitle,
        year: item.year,
      },
      { skipClientCache: watchRetryCount > 0 },
    ).then((resolution) => {
      if (active) {
        setWatchState(resolution);
      }
    });

    return () => {
      active = false;
    };
  }, [details, watchRetryCount, keysVersion]);

  const catalogBackHref = `/catalog${getLastCatalogSearch()}`;

  if (loading) {
    return <DetailsSkeleton />;
  }

  if (error || !details) {
    return (
      <div className="space-y-4">
        <Link
          to={catalogBackHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Назад в каталог
        </Link>
        <ErrorState
          message={error ?? 'Тайтл не найден.'}
          onRetry={() => void loadDetails()}
        />
      </div>
    );
  }

  const { item, cast, directors, writers, videos, similar, countries } = details;
  const entry = getEntry(item.id, item.mediaType);
  const isWatchlist = entry?.status === 'watchlist';
  const isWatched = entry?.status === 'watched';
  const isFavorite = Boolean(entry?.isFavorite);
  const userRating = entry?.userRating ?? null;

  const trailer = videos[0] ?? null;

  const durationLabel =
    item.mediaType === 'movie'
      ? formatRuntime(item.runtime)
      : formatSeasonsCount(item.numberOfSeasons);

  return (
    <div className="space-y-10">
      <div>
        <Link
          to={catalogBackHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          К каталогу
        </Link>
      </div>

      {/* Верхний блок с backdrop и основным описанием */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-[#090B10] dark:border-white/[0.08]">
        <div className="absolute inset-0">
          <BackdropArtwork
            backdropPath={item.backdropPath}
            title={item.title}
            priority
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-[#090B10] via-[#090B10]/85 to-[#090B10]/45"
            aria-hidden="true"
          />
        </div>

        <div className="relative z-10 grid gap-6 p-5 sm:p-8 md:grid-cols-[220px_1fr] lg:grid-cols-[250px_1fr] lg:gap-8 lg:p-10">
          <div className="mx-auto w-44 shrink-0 self-start overflow-hidden rounded-xl border border-white/15 shadow-2xl md:mx-0 md:w-full">
            <div className="aspect-[2/3]">
              <PosterArtwork
                posterPath={item.posterPath}
                title={item.title}
                year={item.year}
                mediaType={item.mediaType}
                variant="detail"
                priority
              />
            </div>
          </div>

          <div className="flex flex-col justify-between space-y-5 text-white">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-300">
                <span>{item.mediaType === 'movie' ? 'Фильм' : 'Сериал'}</span>
                {item.year ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{item.year}</span>
                  </>
                ) : null}
                {durationLabel !== '—' ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{durationLabel}</span>
                  </>
                ) : null}
                {countries.length > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{countries.slice(0, 3).join(', ')}</span>
                  </>
                ) : null}
              </div>

              <div>
                <h1 className="font-display text-balance text-2xl font-bold tracking-tight text-white sm:text-4xl">
                  {item.title}
                </h1>
                {item.originalTitle && item.originalTitle !== item.title ? (
                  <p className="mt-1 text-sm text-slate-400">
                    {item.originalTitle}
                  </p>
                ) : null}
              </div>

              {/* Рейтинг и жанры */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {item.voteAverage > 0 ? (
                  <div className="inline-flex items-center gap-1.5 tabular-nums font-semibold text-amber-300">
                    <Star
                      className="h-4 w-4 fill-amber-400 text-amber-400"
                      aria-hidden="true"
                    />
                    <span>
                      {item.isDemoData
                        ? `Демо-рейтинг ${item.voteAverage.toFixed(1)}`
                        : `${item.voteAverage.toFixed(1)} TMDB`}
                    </span>
                    {item.voteCount > 0 ? (
                      <span className="text-xs font-normal text-slate-400">
                        ({formatVoteCount(item.voteCount)} голосов)
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {item.genres.length > 0 ? (
                  <span className="text-slate-300">
                    {item.genres.map((g) => g.name).join(' · ')}
                  </span>
                ) : null}
              </div>

              {item.overview ? (
                <div className="max-w-3xl space-y-2.5">
                  <p className="line-clamp-4 text-sm leading-relaxed text-slate-200 sm:text-base">
                    {item.overview}
                  </p>
                  <div>
                    <button
                      type="button"
                      data-testid="open-description-modal-button"
                      onClick={() => setIsDescriptionOpen(true)}
                      className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2 text-xs font-semibold text-blue-200 transition-colors hover:bg-white/[0.15] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090B10]"
                    >
                      <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Открыть описание</span>
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Создатели */}
              {(directors.length > 0 || writers.length > 0) ? (
                <div className="grid gap-2 pt-1 text-sm sm:grid-cols-2">
                  {directors.length > 0 ? (
                    <div>
                      <span className="text-slate-400">Режиссёр: </span>
                      <span className="text-slate-100">
                        {directors.map((d) => d.name).join(', ')}
                      </span>
                    </div>
                  ) : null}
                  {writers.length > 0 ? (
                    <div>
                      <span className="text-slate-400">Сценарий: </span>
                      <span className="text-slate-100">
                        {writers.map((w) => w.name).join(', ')}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Действия и ссылка на просмотр */}
            <div className="space-y-4 border-t border-white/10 pt-4">
              <div className="flex flex-wrap items-center gap-3">
                {watchState.status === 'matched' ? (
                  isDesktopTauriRuntime() ? (
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        data-testid="watch-kinokino-link"
                        data-tv-autofocus="true"
                        onClick={() => {
                          setWatchWindowError(null);
                          markWatching(item);
                          void openWatchWindow(watchState.url, item.title).catch(
                            (err: unknown) => {
                              setWatchWindowError(
                                typeof err === 'string'
                                  ? err
                                  : err instanceof Error
                                    ? err.message
                                    : 'Не удалось открыть встроенное окно плеера.',
                              );
                            },
                          );
                        }}
                        className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-500 hover:to-violet-500 hover:shadow-blue-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090B10]"
                      >
                        <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                        Смотреть
                      </button>

                      <button
                        type="button"
                        data-testid="watch-open-browser-button"
                        title="Открыть в браузере"
                        aria-label="Открыть в браузере"
                        onClick={() => {
                          setWatchWindowError(null);
                          markWatching(item);
                          void openExternalUrl(watchState.url);
                        }}
                        className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-xl border border-white/20 bg-white/10 text-slate-200 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090B10]"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : isAndroidTauri() || isTvMode() ? (
                    <button
                      type="button"
                      data-testid="watch-kinokino-link"
                      data-tv-autofocus="true"
                      onClick={() => {
                        setWatchWindowError(null);
                        markWatching(item);
                        void openExternalUrl(watchState.url).catch(
                          (err: unknown) => {
                            setWatchWindowError(
                              typeof err === 'string'
                                ? err
                                : err instanceof Error
                                  ? err.message
                                  : 'Не удалось открыть ссылку в браузере приставки.',
                            );
                          },
                        );
                      }}
                      className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-500 hover:to-violet-500 hover:shadow-blue-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090B10]"
                    >
                      <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                      Смотреть
                      <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
                    </button>
                  ) : (
                    <a
                      href={watchState.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="watch-kinokino-link"
                      data-tv-autofocus="true"
                      onClick={() => {
                        markWatching(item);
                      }}
                      onAuxClick={(event) => {
                        if (event.button === 1) {
                          markWatching(item);
                        }
                      }}
                      className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-500 hover:to-violet-500 hover:shadow-blue-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090B10]"
                    >
                      <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                      Смотреть
                      <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
                    </a>
                  )
                ) : watchState.status === 'missing_key' ? (
                  <button
                    type="button"
                    data-testid="watch-missing-key-button"
                    data-tv-autofocus="true"
                    onClick={() => setMissingKeyNotice(true)}
                    className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-500 hover:to-violet-500 hover:shadow-blue-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090B10]"
                  >
                    <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                    Смотреть
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => toggleWatchlist(item)}
                  aria-pressed={isWatchlist}
                  data-tv-autofocus={
                    watchState.status !== 'matched' &&
                    watchState.status !== 'missing_key'
                      ? 'true'
                      : undefined
                  }
                  className={`inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    isWatchlist
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'border border-white/20 bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <Bookmark
                    className="h-4 w-4"
                    fill={isWatchlist ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                  {isWatchlist ? 'В «Посмотреть позже»' : 'Посмотреть позже'}
                </button>

                <button
                  type="button"
                  onClick={() => markWatched(item)}
                  aria-pressed={isWatched}
                  className={`inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    isWatched
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'border border-white/20 bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {isWatched ? 'Просмотрено' : 'Отметить просмотренным'}
                </button>

                <button
                  type="button"
                  onClick={() => toggleFavorite(item)}
                  aria-pressed={isFavorite}
                  className={`inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    isFavorite
                      ? 'bg-violet-600 text-white hover:bg-violet-700'
                      : 'border border-white/20 bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <Heart
                    className="h-4 w-4"
                    fill={isFavorite ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                  {isFavorite ? 'В избранном' : 'В избранное'}
                </button>
              </div>

              {watchWindowError ? (
                <p
                  role="alert"
                  data-testid="watch-window-error"
                  className="text-xs text-rose-300"
                >
                  {watchWindowError}
                </p>
              ) : null}

              {missingKeyNotice && watchState.status === 'missing_key' ? (
                <div
                  role="status"
                  data-testid="watch-missing-key-notice"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-xs text-slate-200"
                >
                  <div className="flex items-center gap-2.5">
                    <KeyRound
                      className="h-4 w-4 shrink-0 text-blue-400"
                      aria-hidden="true"
                    />
                    <span>
                      Для кнопки «Смотреть» нужен ключ <strong>Kinopoisk Unofficial API</strong>. Укажите его в настройках приложения.
                    </span>
                  </div>
                  <button
                    type="button"
                    data-testid="watch-open-settings-button"
                    onClick={openSettingsModal}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
                  >
                    Открыть настройки
                  </button>
                </div>
              ) : watchState.status === 'loading' ? (
                <p className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" aria-hidden="true" />
                  Поиск ссылки для просмотра…
                </p>
              ) : watchState.status === 'not_found' || watchState.status === 'ambiguous' ? (
                <p className="text-xs text-slate-400" data-testid="watch-status-message">
                  {watchState.message}
                </p>
              ) : watchState.status === 'error' ? (
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400" data-testid="watch-status-message">
                  <span>{watchState.message}</span>
                  {watchState.code === 'INVALID_KEY' ? (
                    <button
                      type="button"
                      onClick={openSettingsModal}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-400/30 bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-200 transition-colors hover:bg-blue-500/25"
                    >
                      <KeyRound className="h-3 w-3" aria-hidden="true" />
                      Проверить ключ в настройках
                    </button>
                  ) : null}
                  {watchState.retryable ? (
                    <button
                      type="button"
                      onClick={() => setWatchRetryCount((c) => c + 1)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20"
                    >
                      <RotateCw className="h-3 w-3" aria-hidden="true" />
                      Повторить
                    </button>
                  ) : null}
                </div>
              ) : null}

              {isWatched ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-300">
                    Ваша оценка:
                  </span>
                  <div
                    role="group"
                    aria-label="Личная оценка от 1 до 10"
                    className="flex flex-wrap gap-1.5"
                  >
                    {Array.from({ length: 10 }, (_, idx) => idx + 1).map(
                      (score) => {
                        const selected = userRating === score;
                        return (
                          <button
                            key={score}
                            type="button"
                            onClick={() =>
                              rateTitle(item, selected ? null : score)
                            }
                            aria-label={`Оценка ${score}`}
                            aria-pressed={selected}
                            className={`h-8 w-8 rounded-lg text-xs font-semibold tabular-nums transition-colors ${
                              selected
                                ? 'bg-amber-500 text-slate-950'
                                : 'border border-white/15 bg-white/10 text-slate-200 hover:bg-white/20'
                            }`}
                          >
                            {score}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Актёрский состав */}
      {cast.length > 0 ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-950 dark:text-white">
              В главных ролях
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Выберите актёра, чтобы найти фильмы с ним
            </span>
          </div>
          <div className="cinema-scroll -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {cast.map((person) => {
              const photoProps = buildProfileImageProps(person.profilePath);
              return (
                <Link
                  key={`${person.id}-${person.name}`}
                  to={`/catalog?q=${encodeURIComponent(person.name)}`}
                  data-testid="cast-member-card"
                  aria-label={`Найти фильмы с участием ${person.name}`}
                  className="group block w-32 shrink-0 space-y-2 rounded-xl p-1 text-left transition-colors focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                  <div className="aspect-[3/4] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition-colors group-hover:border-blue-500/60 dark:border-white/[0.08] dark:bg-[#11151E] dark:group-hover:border-blue-400/50">
                    {photoProps ? (
                      <img
                        src={photoProps.src}
                        srcSet={photoProps.srcSet}
                        sizes={photoProps.sizes}
                        alt={person.name}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400 dark:text-slate-600">
                        <UserIcon className="h-8 w-8" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="line-clamp-1 text-sm font-semibold text-slate-900 transition-colors group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400">
                      {person.name}
                    </p>
                    {person.character ? (
                      <p className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                        {person.character}
                      </p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Трейлер */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-5 w-5 text-blue-500" aria-hidden="true" />
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-950 dark:text-white">
            Трейлер
          </h2>
        </div>

        {trailer ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black dark:border-white/[0.08]">
            <div className="aspect-video w-full">
              <iframe
                src={`https://www.youtube.com/embed/${trailer.key}`}
                title={trailer.name}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600 dark:border-white/[0.08] dark:bg-[#11151E] dark:text-slate-400">
            {item.isDemoData
              ? 'Встроенные трейлеры YouTube загружаются при подключённом ключе TMDB API.'
              : 'Для этого тайтла пока нет доступного официального трейлера на YouTube.'}
          </div>
        )}
      </section>

      {/* Похожие тайтлы */}
      {similar.length > 0 ? (
        <MediaCarousel title="Похожие тайтлы" items={similar} />
      ) : null}

      <DescriptionModal
        open={isDescriptionOpen}
        onClose={() => setIsDescriptionOpen(false)}
        title={item.title}
        originalTitle={item.originalTitle}
        mediaType={item.mediaType}
        year={item.year}
        durationLabel={durationLabel}
        genres={item.genres.map((g) => g.name)}
        countries={countries}
        voteAverage={item.voteAverage}
        isDemoData={item.isDemoData}
        overview={item.overview}
        directors={directors.map((d) => d.name)}
        writers={writers.map((w) => w.name)}
      />
    </div>
  );
}
