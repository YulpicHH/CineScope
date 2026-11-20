export type TmdbImageSize =
  | 'w185'
  | 'w300'
  | 'w342'
  | 'w500'
  | 'w780'
  | 'w1280'
  | 'h632'
  | 'original';

export type PosterVariant = 'thumb' | 'card' | 'detail';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export function buildTmdbImageUrl(
  path: string | null,
  size: TmdbImageSize = 'w500',
): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export interface ResponsiveImageProps {
  src: string;
  srcSet?: string;
  sizes?: string;
}

/**
 * Формирует адаптивные Retina-ready атрибуты src/srcSet/sizes для постеров TMDB.
 * На 2x Retina-дисплеях (macOS Apple Silicon) крупные карточки и страница деталей
 * получают w780, а компактные превью в списках — w342 без лишнего расхода ОЗУ.
 */
export function buildPosterImageProps(
  posterPath: string | null,
  variant: PosterVariant = 'card',
): ResponsiveImageProps | null {
  if (!posterPath) return null;

  if (posterPath.startsWith('http://') || posterPath.startsWith('https://')) {
    return { src: posterPath };
  }

  if (variant === 'thumb') {
    return {
      src: `${TMDB_IMAGE_BASE}/w342${posterPath}`,
      srcSet: [
        `${TMDB_IMAGE_BASE}/w185${posterPath} 185w`,
        `${TMDB_IMAGE_BASE}/w342${posterPath} 342w`,
        `${TMDB_IMAGE_BASE}/w500${posterPath} 500w`,
      ].join(', '),
      sizes: '(max-width: 640px) 112px, 160px',
    };
  }

  if (variant === 'detail') {
    return {
      src: `${TMDB_IMAGE_BASE}/w780${posterPath}`,
      srcSet: [
        `${TMDB_IMAGE_BASE}/w500${posterPath} 500w`,
        `${TMDB_IMAGE_BASE}/w780${posterPath} 780w`,
      ].join(', '),
      sizes: '(max-width: 768px) 220px, 280px',
    };
  }

  return {
    src: `${TMDB_IMAGE_BASE}/w500${posterPath}`,
    srcSet: [
      `${TMDB_IMAGE_BASE}/w342${posterPath} 342w`,
      `${TMDB_IMAGE_BASE}/w500${posterPath} 500w`,
      `${TMDB_IMAGE_BASE}/w780${posterPath} 780w`,
    ].join(', '),
    sizes: '(max-width: 640px) 46vw, (max-width: 1024px) 24vw, 260px',
  };
}

/**
 * Формирует Retina-ready атрибуты для фоновых кадров (Hero и карточка тайтла).
 */
export function buildBackdropImageProps(
  backdropPath: string | null,
): ResponsiveImageProps | null {
  if (!backdropPath) return null;

  if (backdropPath.startsWith('http://') || backdropPath.startsWith('https://')) {
    return { src: backdropPath };
  }

  return {
    src: `${TMDB_IMAGE_BASE}/w1280${backdropPath}`,
    srcSet: [
      `${TMDB_IMAGE_BASE}/w780${backdropPath} 780w`,
      `${TMDB_IMAGE_BASE}/w1280${backdropPath} 1280w`,
      `${TMDB_IMAGE_BASE}/original${backdropPath} 1920w`,
    ].join(', '),
    sizes: '(max-width: 768px) 100vw, 1280px',
  };
}

/**
 * Формирует Retina-ready атрибуты для портретов актёров (128px CSS -> 256px+ physical).
 */
export function buildProfileImageProps(
  profilePath: string | null,
): ResponsiveImageProps | null {
  if (!profilePath) return null;

  if (profilePath.startsWith('http://') || profilePath.startsWith('https://')) {
    return { src: profilePath };
  }

  return {
    src: `${TMDB_IMAGE_BASE}/w300${profilePath}`,
    srcSet: [
      `${TMDB_IMAGE_BASE}/w185${profilePath} 185w`,
      `${TMDB_IMAGE_BASE}/w300${profilePath} 300w`,
      `${TMDB_IMAGE_BASE}/h632${profilePath} 421w`,
    ].join(', '),
    sizes: '128px',
  };
}
