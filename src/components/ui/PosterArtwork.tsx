import { useEffect, useState } from 'react';
import { Film, Tv } from 'lucide-react';
import type { MediaType } from '../../types';
import {
  buildBackdropImageProps,
  buildPosterImageProps,
  type PosterVariant,
} from '../../utils/imageUrl';

interface PosterArtworkProps {
  posterPath: string | null;
  title: string;
  year?: string;
  mediaType?: MediaType;
  variant?: PosterVariant;
  priority?: boolean;
  className?: string;
}

const ACCENT_GRADIENTS = [
  'from-[#11192B] via-[#162038] to-[#0E1320]',
  'from-[#161329] via-[#1D1838] to-[#0E101B]',
  'from-[#101C26] via-[#152836] to-[#0C1219]',
  'from-[#191624] via-[#211C33] to-[#0F1018]',
];

function pickGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0;
  }
  return ACCENT_GRADIENTS[Math.abs(hash) % ACCENT_GRADIENTS.length];
}

export function PosterArtwork({
  posterPath,
  title,
  year,
  mediaType = 'movie',
  variant = 'card',
  priority = false,
  className = '',
}: PosterArtworkProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [posterPath]);

  const imgProps = buildPosterImageProps(posterPath, variant);

  if (imgProps && !failed) {
    return (
      <img
        src={imgProps.src}
        srcSet={imgProps.srcSet}
        sizes={imgProps.sizes}
        alt={`Постер: ${title}`}
        referrerPolicy="no-referrer"
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  const gradient = pickGradient(title);

  return (
    <div
      className={`relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br ${gradient} p-4 text-slate-100 ${className}`}
      aria-label={`Постер: ${title}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 80% 15%, rgba(96, 165, 250, 0.25), transparent 55%)',
        }}
      />
      <div className="relative z-10 flex items-center justify-between text-xs text-slate-400">
        <span className="font-mono-tabular">{year || 'Кино'}</span>
        {mediaType === 'tv' ? (
          <Tv className="h-4 w-4 text-blue-400/80" aria-hidden="true" />
        ) : (
          <Film className="h-4 w-4 text-blue-400/80" aria-hidden="true" />
        )}
      </div>
      <div className="relative z-10 mt-auto">
        <p className="font-display line-clamp-3 text-base font-bold leading-snug tracking-tight text-white">
          {title}
        </p>
      </div>
    </div>
  );
}

interface BackdropArtworkProps {
  backdropPath: string | null;
  title: string;
  priority?: boolean;
  className?: string;
}

export function BackdropArtwork({
  backdropPath,
  title,
  priority = false,
  className = '',
}: BackdropArtworkProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [backdropPath]);

  const imgProps = buildBackdropImageProps(backdropPath);

  if (imgProps && !failed) {
    return (
      <img
        src={imgProps.src}
        srcSet={imgProps.srcSet}
        sizes={imgProps.sizes}
        alt={`Кадр из «${title}»`}
        referrerPolicy="no-referrer"
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-gradient-to-br from-[#0F172A] via-[#13192B] to-[#090B10] ${className}`}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(circle at 75% 25%, rgba(59, 130, 246, 0.22), transparent 50%), radial-gradient(circle at 25% 75%, rgba(124, 58, 237, 0.16), transparent 55%)',
        }}
      />
    </div>
  );
}
