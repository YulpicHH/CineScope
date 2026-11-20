import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MediaItem } from '../../types';
import { RowSkeleton } from '../ui/Skeleton';
import { MediaCard } from './MediaCard';

interface MediaCarouselProps {
  title: string;
  subtitle?: string;
  items: MediaItem[];
  catalogHref?: string;
  catalogLabel?: string;
  loading?: boolean;
}

export function MediaCarousel({
  title,
  subtitle,
  items,
  catalogHref,
  catalogLabel = 'В каталог',
  loading = false,
}: MediaCarouselProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollByAmount = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.max(el.clientWidth * 0.75, 320);
    el.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth',
    });
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden items-center gap-1.5 sm:flex">
            <button
              type="button"
              onClick={() => scrollByAmount('left')}
              aria-label={`Прокрутить подборку «${title}» влево`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-[#11151E] dark:text-slate-200 dark:hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollByAmount('right')}
              aria-label={`Прокрутить подборку «${title}» вправо`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-[#11151E] dark:text-slate-200 dark:hover:bg-white/10"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {catalogHref ? (
            <Link
              to={catalogHref}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg py-1 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10 sm:px-3 sm:py-1.5"
            >
              <span>{catalogLabel}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>

      {loading ? (
        <RowSkeleton />
      ) : (
        <div
          ref={scrollRef}
          className="cinema-scroll -mx-4 flex gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0"
        >
          {items.map((item) => (
            <MediaCard key={`${item.mediaType}:${item.id}`} item={item} compact />
          ))}
        </div>
      )}
    </section>
  );
}
