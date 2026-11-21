import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Bookmark, Check, Info, Sparkles, Star } from 'lucide-react';
import { MediaCarousel } from '../components/cards/MediaCarousel';
import { DescriptionModal } from '../components/ui/DescriptionModal';
import { BackdropArtwork, PosterArtwork } from '../components/ui/PosterArtwork';
import { HeroSkeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/StateViews';
import { useAppMode } from '../hooks/useAppMode';
import { useLibrary } from '../hooks/useLibrary';
import {
  getHomeSections,
  getRecommendedForUser,
  type HomeSectionsData,
} from '../services/tmdb';
import type { MediaItem } from '../types';
import {
  getHomeRecommendedCache,
  getHomeSectionsCache,
  getRouteScroll,
  saveCarouselScroll,
  saveHomeRecommendedCache,
  saveHomeSectionsCache,
  saveRouteScroll,
} from '../utils/routeViewCache';

const HOME_ROUTE_KEY = '/';

export function HomePage() {
  const { isDemoMode, keysVersion } = useAppMode();
  const { getEntry, toggleWatchlist, recommendationProfile } = useLibrary();

  const homeCacheKey = `${isDemoMode ? 'demo' : 'live'}:${keysVersion}`;
  const recCacheKey = useMemo(() => {
    const excludeKey = Array.from(recommendationProfile.excludeKeys)
      .sort()
      .join(',');
    return `${homeCacheKey}:${recommendationProfile.topMovieGenres.join(',')}:${recommendationProfile.topTvGenres.join(',')}:${excludeKey}`;
  }, [homeCacheKey, recommendationProfile]);

  const initialHomeData = getHomeSectionsCache<HomeSectionsData>(homeCacheKey);
  const initialRecommended = getHomeRecommendedCache(recCacheKey);
  const initialScrollSnapshot = getRouteScroll(HOME_ROUTE_KEY);

  const [homeData, setHomeData] = useState<HomeSectionsData | null>(
    () => initialHomeData,
  );
  const [loading, setLoading] = useState(() => !initialHomeData);
  const [error, setError] = useState<string | null>(null);

  const [recommended, setRecommended] = useState<MediaItem[]>(
    () => initialRecommended ?? [],
  );
  const [recLoading, setRecLoading] = useState(() => !initialRecommended);
  const [heroDescriptionOpen, setHeroDescriptionOpen] = useState(false);

  const latestScrollYRef = useRef<number>(initialScrollSnapshot?.scrollY ?? 0);
  const isLeavingRef = useRef(false);
  const pendingRestoreScrollYRef = useRef<number | null>(
    initialScrollSnapshot && initialScrollSnapshot.scrollY > 0
      ? initialScrollSnapshot.scrollY
      : null,
  );

  const loadHome = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = getHomeSectionsCache<HomeSectionsData>(homeCacheKey);
        if (cached) {
          setHomeData(cached);
          setLoading(false);
          setError(null);
          return;
        }
      }
      setLoading(true);
      setError(null);
      try {
        const data = await getHomeSections(isDemoMode);
        saveHomeSectionsCache(homeCacheKey, data);
        setHomeData(data);
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : 'Не удалось загрузить главную страницу.',
        );
      } finally {
        setLoading(false);
      }
    },
    [isDemoMode, homeCacheKey],
  );

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  useEffect(() => {
    const cachedRec = getHomeRecommendedCache(recCacheKey);
    if (cachedRec) {
      setRecommended(cachedRec);
      setRecLoading(false);
      return;
    }

    let active = true;
    setRecLoading(true);
    getRecommendedForUser({
      topMovieGenres: recommendationProfile.topMovieGenres,
      topTvGenres: recommendationProfile.topTvGenres,
      excludeKeys: recommendationProfile.excludeKeys,
      useDemo: isDemoMode,
    })
      .then((items) => {
        if (active) {
          saveHomeRecommendedCache(recCacheKey, items);
          setRecommended(items);
        }
      })
      .catch(() => {
        if (active) setRecommended([]);
      })
      .finally(() => {
        if (active) setRecLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isDemoMode, recCacheKey, recommendationProfile]);

  // Отслеживаем и сохраняем вертикальную позицию на главной странице
  useEffect(() => {
    const handleScroll = () => {
      if (isLeavingRef.current) return;
      latestScrollYRef.current = window.scrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      saveRouteScroll(HOME_ROUTE_KEY, latestScrollYRef.current);
    };
  }, []);

  // Мгновенно восстанавливаем позицию прокрутки при возврате со страницы фильма
  useLayoutEffect(() => {
    const targetY = pendingRestoreScrollYRef.current;
    if (targetY === null || loading) return;
    pendingRestoreScrollYRef.current = null;

    let userInteracted = false;
    const cancelSettle = () => {
      userInteracted = true;
    };
    window.addEventListener('wheel', cancelSettle, { passive: true, once: true });
    window.addEventListener('touchstart', cancelSettle, { passive: true, once: true });
    window.addEventListener('pointerdown', cancelSettle, { passive: true, once: true });

    const restore = () => {
      if (userInteracted) return;
      window.scrollTo(0, targetY);
      latestScrollYRef.current = targetY;
    };

    restore();
    const rafId = window.requestAnimationFrame(restore);
    const settleTimer = window.setTimeout(restore, 90);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(settleTimer);
      window.removeEventListener('wheel', cancelSettle);
      window.removeEventListener('touchstart', cancelSettle);
      window.removeEventListener('pointerdown', cancelSettle);
    };
  }, [loading]);

  const handleBeforeLeave = useCallback(() => {
    isLeavingRef.current = true;
    latestScrollYRef.current = window.scrollY;
    saveRouteScroll(HOME_ROUTE_KEY, window.scrollY);
  }, []);

  const handleCarouselScroll = useCallback(
    (carouselId: string, scrollLeft: number) => {
      saveCarouselScroll(HOME_ROUTE_KEY, carouselId, scrollLeft);
    },
    [],
  );

  const hero = homeData?.hero ?? null;
  const heroEntry = hero ? getEntry(hero.id, hero.mediaType) : undefined;
  const heroInCollection = Boolean(
    heroEntry?.status || heroEntry?.isFavorite,
  );
  const savedCarousels = initialScrollSnapshot?.carouselScrollLeft ?? {};

  return (
    <div className="space-y-10">
      {/* Hero-блок */}
      {loading ? (
        <HeroSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void loadHome(true)} />
      ) : hero ? (
        <section
          aria-label="Рекомендуемый фильм"
          className={`animate-hero-enter relative overflow-hidden rounded-2xl border border-slate-200/80 bg-[#090B10] dark:border-white/[0.08] ${
            hero.backdropPath ? 'min-h-[440px] sm:min-h-[500px]' : 'min-h-[340px]'
          }`}
        >
          <div className="absolute inset-0">
            <BackdropArtwork
              backdropPath={hero.backdropPath}
              title={hero.title}
              priority
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-[#090B10] via-[#090B10]/75 to-[#090B10]/20"
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 bg-gradient-to-r from-[#090B10]/95 via-[#090B10]/60 to-transparent"
              aria-hidden="true"
            />
          </div>

          <div
            className={`relative z-10 flex flex-col justify-end p-6 sm:p-10 ${
              hero.backdropPath
                ? 'min-h-[440px] sm:min-h-[500px]'
                : 'min-h-[340px] md:flex-row md:items-center md:justify-between md:gap-8'
            }`}
          >
            <div className="max-w-2xl space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-300">
                <span>Рекомендация дня</span>
                {hero.year ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{hero.year}</span>
                  </>
                ) : null}
                {hero.genres.length > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      {hero.genres
                        .slice(0, 3)
                        .map((g) => g.name)
                        .join(', ')}
                    </span>
                  </>
                ) : null}
                {hero.voteAverage > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 tabular-nums text-amber-300">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                      {hero.isDemoData
                        ? `Демо ${hero.voteAverage.toFixed(1)}`
                        : hero.voteAverage.toFixed(1)}
                    </span>
                  </>
                ) : null}
              </div>

              <h1 className="font-display text-balance text-3xl font-bold tracking-tight text-white sm:text-5xl">
                {hero.title}
              </h1>

              {hero.overview ? (
                <p className="line-clamp-3 max-w-xl text-sm leading-relaxed text-slate-200 sm:text-base">
                  {hero.overview}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  to={`/title/${hero.mediaType}/${hero.id}`}
                  onClick={handleBeforeLeave}
                  className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-blue-400"
                >
                  <Info className="h-4 w-4" aria-hidden="true" />
                  Подробнее
                </Link>

                {hero.overview ? (
                  <button
                    type="button"
                    data-testid="hero-open-description-button"
                    onClick={() => setHeroDescriptionOpen(true)}
                    className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-blue-400"
                  >
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                    Описание
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => toggleWatchlist(hero)}
                  className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl border border-white/20 bg-white/15 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-blue-400"
                >
                  {heroInCollection ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                      {heroEntry?.status === 'watched'
                        ? 'Просмотрено'
                        : 'В коллекции'}
                    </>
                  ) : (
                    <>
                      <Bookmark className="h-4 w-4" aria-hidden="true" />
                      В коллекцию
                    </>
                  )}
                </button>

                <Link
                  to="/catalog?panel=mood"
                  onClick={handleBeforeLeave}
                  className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl border border-violet-400/30 bg-violet-500/20 px-4 py-2.5 text-sm font-medium text-violet-200 transition-colors hover:bg-violet-500/30"
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Подобрать на вечер
                </Link>
              </div>
            </div>

            {!hero.backdropPath ? (
              <Link
                to={`/title/${hero.mediaType}/${hero.id}`}
                onClick={handleBeforeLeave}
                aria-label={`Открыть постер: ${hero.title}`}
                className="hidden w-48 shrink-0 overflow-hidden rounded-xl border border-white/15 shadow-2xl transition-transform duration-200 hover:scale-[1.02] md:block lg:w-52"
              >
                <div className="aspect-[2/3]">
                  <PosterArtwork
                    posterPath={hero.posterPath}
                    title={hero.title}
                    year={hero.year}
                    mediaType={hero.mediaType}
                    variant="detail"
                    priority
                  />
                </div>
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Персональные рекомендации */}
      <MediaCarousel
        title="Вам может понравиться"
        subtitle={
          recommendationProfile.hasPersonalProfile
            ? 'Подобрано на основе ваших оценок 7 и выше в личной библиотеке'
            : 'Отметьте несколько фильмов как просмотренные, чтобы получить персональные рекомендации'
        }
        items={recommended}
        loading={recLoading}
        catalogHref="/catalog"
        catalogLabel="Открыть каталог"
        carouselId="recommended"
        initialScrollLeft={savedCarousels.recommended}
        onScrollLeftChange={handleCarouselScroll}
        onItemSelect={handleBeforeLeave}
      />

      {homeData ? (
        <>
          <MediaCarousel
            title="Популярное сейчас"
            items={homeData.trending}
            catalogHref="/catalog?type=movie&sort=popularity.desc"
            loading={loading}
            carouselId="trending"
            initialScrollLeft={savedCarousels.trending}
            onScrollLeftChange={handleCarouselScroll}
            onItemSelect={handleBeforeLeave}
          />

          <MediaCarousel
            title="Высокий рейтинг"
            items={homeData.topRated}
            catalogHref="/catalog?type=movie&sort=vote_average.desc"
            loading={loading}
            carouselId="topRated"
            initialScrollLeft={savedCarousels.topRated}
            onScrollLeftChange={handleCarouselScroll}
            onItemSelect={handleBeforeLeave}
          />

          <MediaCarousel
            title="Новинки"
            items={homeData.nowPlaying}
            catalogHref="/catalog?type=movie&sort=release_date.desc"
            loading={loading}
            carouselId="nowPlaying"
            initialScrollLeft={savedCarousels.nowPlaying}
            onScrollLeftChange={handleCarouselScroll}
            onItemSelect={handleBeforeLeave}
          />

          <MediaCarousel
            title="Популярные сериалы"
            items={homeData.popularSeries}
            catalogHref="/catalog?type=tv&sort=popularity.desc"
            loading={loading}
            carouselId="popularSeries"
            initialScrollLeft={savedCarousels.popularSeries}
            onScrollLeftChange={handleCarouselScroll}
            onItemSelect={handleBeforeLeave}
          />
        </>
      ) : null}

      {hero ? (
        <DescriptionModal
          open={heroDescriptionOpen}
          onClose={() => setHeroDescriptionOpen(false)}
          title={hero.title}
          originalTitle={hero.originalTitle}
          mediaType={hero.mediaType}
          year={hero.year}
          genres={hero.genres.map((g) => g.name)}
          voteAverage={hero.voteAverage}
          isDemoData={hero.isDemoData}
          overview={hero.overview}
          detailsHref={`/title/${hero.mediaType}/${hero.id}`}
        />
      ) : null}
    </div>
  );
}
