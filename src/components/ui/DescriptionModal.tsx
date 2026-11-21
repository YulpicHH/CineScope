import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Info, Star, X } from 'lucide-react';
import type { MediaType } from '../../types';

interface DescriptionModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  originalTitle?: string;
  mediaType: MediaType;
  year?: string | number | null;
  durationLabel?: string;
  genres?: string[];
  countries?: string[];
  voteAverage?: number;
  isDemoData?: boolean;
  overview: string;
  directors?: string[];
  writers?: string[];
  detailsHref?: string;
}

export function DescriptionModal({
  open,
  onClose,
  title,
  originalTitle,
  mediaType,
  year,
  durationLabel,
  genres = [],
  countries = [],
  voteAverage = 0,
  isDemoData = false,
  overview,
  directors = [],
  writers = [],
  detailsHref,
}: DescriptionModalProps) {
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const trimmedOverview = overview.trim();
  const hasDuration = Boolean(durationLabel && durationLabel !== '—');
  const metaParts: string[] = [mediaType === 'tv' ? 'Сериал' : 'Фильм'];
  if (year) metaParts.push(String(year));
  if (hasDuration && durationLabel) metaParts.push(durationLabel);
  if (countries.length > 0) metaParts.push(countries.slice(0, 3).join(', '));

  return (
    <div
      className="safe-modal-inset tv-modal-overscan fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="description-modal-title"
      data-testid="description-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="safe-modal-panel cinema-scroll relative flex w-full max-w-xl flex-col overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#11151E] text-[#F3F5F9] shadow-2xl">
        {/* Заголовок мини-окна */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-6 py-5">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 text-blue-400">
              <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold tracking-tight text-blue-300">
                Описание
              </span>
            </div>

            <h2
              id="description-modal-title"
              className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl"
            >
              {title}
            </h2>

            {originalTitle && originalTitle !== title ? (
              <p className="text-xs text-slate-400">{originalTitle}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs text-slate-300">
              <span>{metaParts.join(' · ')}</span>
              {voteAverage > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-amber-300">
                    <Star
                      className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                      aria-hidden="true"
                    />
                    {isDemoData
                      ? `Демо ${voteAverage.toFixed(1)}`
                      : voteAverage.toFixed(1)}
                  </span>
                </>
              ) : null}
            </div>

            {genres.length > 0 ? (
              <p className="text-xs text-slate-400">{genres.join(' · ')}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть описание"
            data-testid="close-description-modal-icon"
            data-tv-modal-close="true"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Текст описания и создатели */}
        <div className="space-y-4 px-6 py-5">
          <p
            data-testid="description-modal-text"
            className="whitespace-pre-line text-sm leading-relaxed text-slate-200 sm:text-base sm:leading-7"
          >
            {trimmedOverview || 'Описание для этого тайтла пока не добавлено.'}
          </p>

          {(directors.length > 0 || writers.length > 0) ? (
            <div className="grid gap-2 border-t border-white/[0.08] pt-4 text-sm sm:grid-cols-2">
              {directors.length > 0 ? (
                <div>
                  <span className="text-slate-400">Режиссёр: </span>
                  <span className="text-slate-100">{directors.join(', ')}</span>
                </div>
              ) : null}
              {writers.length > 0 ? (
                <div>
                  <span className="text-slate-400">Сценарий: </span>
                  <span className="text-slate-100">{writers.join(', ')}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Нижняя панель действий */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-white/[0.08] px-6 py-4">
          {detailsHref ? (
            <Link
              to={detailsHref}
              onClick={onClose}
              className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl border border-white/15 bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.15] focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              <Info className="h-4 w-4" aria-hidden="true" />
              Открыть страницу
            </Link>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            data-testid="close-description-modal-button"
            data-tv-autofocus="true"
            data-tv-modal-close="true"
            className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
