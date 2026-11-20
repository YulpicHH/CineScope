import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Star, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PosterArtwork } from '../components/ui/PosterArtwork';
import { EmptyState } from '../components/ui/StateViews';
import { useHistory } from '../hooks/useHistory';
import type { LibraryItem } from '../types';
import { formatRussianDate } from '../utils/formatters';

export function HistoryPage() {
  const { timeline, stats, removeHistoryEntry } = useHistory();
  const [pendingDelete, setPendingDelete] = useState<LibraryItem | null>(null);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
          История просмотров
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Хронология отмеченных фильмов и сериалов, ваши оценки и базовая статистика.
        </p>
      </div>

      {/* Статистика */}
      <section
        aria-label="Статистика просмотров"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
      >
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/[0.08] dark:bg-[#11151E]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Всего фильмов</p>
          <p className="font-display mt-1 text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
            {stats.totalMovies}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/[0.08] dark:bg-[#11151E]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Всего сериалов</p>
          <p className="font-display mt-1 text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
            {stats.totalSeries}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/[0.08] dark:bg-[#11151E]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Средняя оценка</p>
          <p className="font-display mt-1 text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
            {stats.averageRating !== null ? `${stats.averageRating} / 10` : '—'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/[0.08] dark:bg-[#11151E]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Любимые жанры</p>
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-950 dark:text-white">
            {stats.favoriteGenres.length > 0
              ? stats.favoriteGenres.map((g) => g.name).join(', ')
              : 'Пока нет данных'}
          </p>
        </div>
      </section>

      {/* Хронология */}
      {timeline.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-6 w-6" aria-hidden="true" />}
          title="История просмотров пуста"
          description="Отмечайте просмотренные фильмы и сериалы на их страницах — они появятся здесь с датой и вашей оценкой."
          action={
            <Link
              to="/catalog"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Перейти в каталог
            </Link>
          }
        />
      ) : (
        <section
          aria-label="Список просмотренного"
          className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:divide-white/[0.06] dark:border-white/[0.08] dark:bg-[#11151E]"
        >
          {timeline.map((item) => (
            <div
              key={`${item.mediaType}:${item.id}`}
              className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-4 min-w-0">
                <Link
                  to={`/title/${item.mediaType}/${item.id}`}
                  className="h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 dark:border-white/10"
                >
                  <PosterArtwork
                    posterPath={item.posterPath}
                    title={item.title}
                    year={item.year}
                    mediaType={item.mediaType}
                  />
                </Link>

                <div className="min-w-0 space-y-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatRussianDate(item.watchedAt ?? item.updatedAt)}
                  </p>
                  <Link
                    to={`/title/${item.mediaType}/${item.id}`}
                    className="font-display block truncate text-base font-semibold text-slate-950 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                  >
                    {item.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{item.mediaType === 'movie' ? 'Фильм' : 'Сериал'}</span>
                    {item.year ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{item.year}</span>
                      </>
                    ) : null}
                    {item.userRating !== null ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-amber-500">
                          <Star
                            className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                            aria-hidden="true"
                          />
                          {item.userRating}/10
                        </span>
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Без личной оценки</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPendingDelete(item)}
                aria-label={`Удалить «${item.title}» из истории`}
                className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:text-slate-400 dark:hover:border-rose-500/40 dark:hover:bg-rose-500/15 dark:hover:text-rose-400"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </section>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Удалить запись из истории?"
        description={
          pendingDelete
            ? `Тайтл «${pendingDelete.title}» будет убран из истории просмотров и списка «Просмотрено» (если он в избранном, отметка избранного сохранится).`
            : ''
        }
        confirmLabel="Удалить"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            removeHistoryEntry(pendingDelete.id, pendingDelete.mediaType);
          }
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
