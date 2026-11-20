import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Check, Sparkles, Star } from 'lucide-react';
import { PosterArtwork } from '../components/ui/PosterArtwork';
import { RowSkeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StateViews';
import { MOVIE_GENRES, TV_GENRES } from '../data/demoTitles';
import { useAppMode } from '../hooks/useAppMode';
import { useLibrary } from '../hooks/useLibrary';
import { getMoodDiscoverCandidates } from '../services/tmdb';
import type { MediaType, MoodId, MoodMatchResult } from '../types';
import { buildMoodReasonFallback, MOOD_DEFINITIONS } from '../utils/moodMapping';

const COUNTRY_OPTIONS = [
  { code: '', label: 'Любая страна' },
  { code: 'US', label: 'США' },
  { code: 'GB', label: 'Великобритания' },
  { code: 'FR', label: 'Франция' },
  { code: 'DE', label: 'Германия' },
  { code: 'KR', label: 'Южная Корея' },
  { code: 'JP', label: 'Япония' },
];

export function MoodPage() {
  const { isDemoMode } = useAppMode();
  const { watchedItems, getEntry, toggleWatchlist } = useLibrary();

  const [selectedMoods, setSelectedMoods] = useState<MoodId[]>(['mysterious']);
  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [genreId, setGenreId] = useState<number | null>(null);
  const [minRating, setMinRating] = useState<number>(7);
  const [year, setYear] = useState('');
  const [country, setCountry] = useState('');

  const [results, setResults] = useState<MoodMatchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{
    message: string;
    retryable: boolean;
  } | null>(null);

  const genres = mediaType === 'movie' ? MOVIE_GENRES : TV_GENRES;

  const toggleMood = (id: MoodId) => {
    setSelectedMoods((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const runSearch = async () => {
    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const candidates = await getMoodDiscoverCandidates({
        mediaType,
        moods: selectedMoods,
        genreId,
        minRating,
        year: year.trim(),
        country,
        useDemo: isDemoMode,
      });

      const watchedSet = new Set(
        watchedItems
          .filter((i) => i.mediaType === mediaType)
          .map((i) => i.id),
      );
      const filtered = candidates.filter((item) => !watchedSet.has(item.id));
      const pool = filtered.length > 0 ? filtered : candidates;

      const mapped: MoodMatchResult[] = pool.slice(0, 16).map((item) => ({
        item,
        reason: buildMoodReasonFallback(
          selectedMoods,
          item.genres.map((g) => g.name),
        ),
        source: isDemoMode ? 'demo' : 'tmdb',
      }));

      setResults(mapped);
    } catch (err: unknown) {
      setError({
        message:
          err instanceof Error
            ? err.message
            : 'Не удалось выполнить подбор по фильтрам.',
        retryable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
          Подбор по настроению
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Выберите одно или несколько настроений и параметры фильтрации для быстрого поиска подходящих фильмов или сериалов.
        </p>
      </div>

      {/* Карточки настроений */}
      <section
        aria-label="Выбор настроения"
        className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/[0.08] dark:bg-[#11151E]"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
            1. Какое настроение сейчас ближе?
          </h2>
          {selectedMoods.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelectedMoods([])}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Сбросить ({selectedMoods.length})
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {MOOD_DEFINITIONS.map((mood) => {
            const active = selectedMoods.includes(mood.id);
            return (
              <button
                key={mood.id}
                type="button"
                onClick={() => toggleMood(mood.id)}
                className={`group flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                  active
                    ? 'border-blue-500/80 bg-blue-50/70 shadow-sm ring-1 ring-blue-500/50 dark:border-blue-400/60 dark:bg-blue-950/30'
                    : 'border-slate-200/80 bg-white/60 hover:border-slate-300 dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:border-white/20'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                      {mood.label}
                    </span>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] transition-colors ${
                        active
                          ? 'bg-blue-600 text-white dark:bg-blue-500'
                          : 'border border-slate-300 text-transparent dark:border-white/20'
                      }`}
                    >
                      ✓
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                    {mood.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Дополнительные параметры */}
        <div className="grid grid-cols-1 gap-3 border-t border-slate-200/70 pt-4 dark:border-white/[0.06] sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Формат
            </span>
            <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-0.5 dark:bg-[#0B0E15]">
              <button
                type="button"
                onClick={() => {
                  setMediaType('movie');
                  setGenreId(null);
                }}
                className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                  mediaType === 'movie'
                    ? 'bg-white text-slate-950 shadow-sm dark:bg-[#1B2230] dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Фильмы
              </button>
              <button
                type="button"
                onClick={() => {
                  setMediaType('tv');
                  setGenreId(null);
                }}
                className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                  mediaType === 'tv'
                    ? 'bg-white text-slate-950 shadow-sm dark:bg-[#1B2230] dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Сериалы
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="mood-genre" className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Уточнить жанр
            </label>
            <select
              id="mood-genre"
              value={genreId ?? ''}
              onChange={(e) =>
                setGenreId(e.target.value ? Number(e.target.value) : null)
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
            >
              <option value="">По настроению</option>
              {genres.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="mood-rating" className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Мин. рейтинг
            </label>
            <select
              id="mood-rating"
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
            >
              <option value={0}>Любой</option>
              <option value={6}>От 6.0</option>
              <option value={7}>От 7.0</option>
              <option value={7.5}>От 7.5</option>
              <option value={8}>От 8.0</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="mood-year" className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Год от
            </label>
            <input
              id="mood-year"
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
              placeholder="Любой год"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="mood-country" className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Страна
            </label>
            <select
              id="mood-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-100"
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Кнопка запуска */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void runSearch()}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {isLoading ? 'Подбираем...' : mediaType === 'movie' ? 'Подобрать фильмы' : 'Подобрать сериалы'}
          </button>
        </div>
      </section>

      {/* Результаты подбора */}
      {isLoading ? (
        <RowSkeleton count={4} />
      ) : error ? (
        <ErrorState
          title="Ошибка подбора"
          message={error.message}
          onRetry={error.retryable ? () => void runSearch() : undefined}
        />
      ) : hasSearched && results.length === 0 ? (
        <EmptyState
          title="Подходящих тайтлов не найдено"
          description="Попробуйте снизить минимальный рейтинг, убрать фильтр по году или выбрать другие настроения."
        />
      ) : results.length > 0 ? (
        <section aria-label="Результаты подбора" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-slate-950 dark:text-white">
              Подобранные тайтлы ({results.length})
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {results.map(({ item, reason, source }) => {
              const entry = getEntry(item.id, item.mediaType);
              const isWatchlist = entry?.status === 'watchlist';
              const isWatched = entry?.status === 'watched';

              return (
                <article
                  key={`${item.mediaType}-${item.id}`}
                  className="group relative flex gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-4 transition-all hover:border-slate-300 hover:shadow-md dark:border-white/[0.08] dark:bg-[#11151E]/80 dark:hover:border-white/20"
                >
                  <Link
                    to={`/title/${item.mediaType}/${item.id}`}
                    className="relative h-44 w-28 flex-shrink-0 overflow-hidden rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={`Перейти к ${item.title}`}
                  >
                    <PosterArtwork
                      posterPath={item.posterPath}
                      title={item.title}
                      year={item.year}
                      mediaType={item.mediaType}
                      variant="thumb"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </Link>

                  <div className="flex flex-1 flex-col justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/title/${item.mediaType}/${item.id}`}
                          className="font-display text-base font-bold text-slate-950 transition-colors hover:text-blue-600 focus:outline-none focus:underline dark:text-white dark:hover:text-blue-400"
                        >
                          {item.title}
                        </Link>
                        {item.voteAverage > 0 ? (
                          <div
                            className="flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400"
                            aria-label={`Рейтинг ${item.voteAverage.toFixed(1)}`}
                          >
                            <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                            <span>{item.voteAverage.toFixed(1)}</span>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                        {item.year ? <span className="tabular-nums">{item.year}</span> : null}
                        {item.genres.length > 0 ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{item.genres.slice(0, 2).map((g) => g.name).join(', ')}</span>
                          </>
                        ) : null}
                        <span aria-hidden="true">·</span>
                        <span>
                          {source === 'demo' ? 'Демо-каталог' : 'Каталог'}
                        </span>
                      </div>

                      <p className="line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {item.overview || 'Описание отсутствует.'}
                      </p>

                      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:bg-white/[0.04] dark:text-slate-200">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          Почему подходит:{' '}
                        </span>
                        {reason}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => toggleWatchlist(item)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                          isWatchlist
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-[#18202F] dark:text-slate-200 dark:hover:bg-[#202A3D]'
                        }`}
                        aria-pressed={isWatchlist}
                      >
                        <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{isWatchlist ? 'В закладках' : 'Буду смотреть'}</span>
                      </button>

                      {isWatched ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Просмотрено
                        </span>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
