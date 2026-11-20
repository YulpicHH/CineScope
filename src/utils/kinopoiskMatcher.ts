export type KinokinoMediaType = 'movie' | 'series';

export interface KinopoiskApiCandidate {
  kinopoiskId: number;
  nameRu?: string | null;
  nameEn?: string | null;
  nameOriginal?: string | null;
  type?: string | null;
  year?: number | string | null;
}

export interface TmdbMatchQuery {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle: string;
  year: string;
}

export type MatchResult =
  | {
      status: 'matched';
      kinopoiskId: number;
      kinopoiskMediaType: KinokinoMediaType;
      matchedTitle: string;
      matchedYear: number | null;
      score: number;
    }
  | {
      status: 'ambiguous';
      reason: string;
    }
  | {
      status: 'not_found';
      reason: string;
    };

export interface KinopoiskCacheRecord {
  tmdb_id: number;
  kinopoisk_id: number;
  media_type: KinokinoMediaType;
  last_updated: string;
}

/**
 * Преобразует тип произведения из Kinopoisk Unofficial API
 * в тип маршрута на kinokino.vip (film / series).
 */
export function mapKinopoiskTypeToKinokino(
  kpType: string | null | undefined,
): KinokinoMediaType | null {
  if (!kpType) return null;
  const upper = kpType.toUpperCase();
  if (upper === 'FILM' || upper === 'VIDEO') {
    return 'movie';
  }
  if (upper === 'TV_SERIES' || upper === 'MINI_SERIES' || upper === 'TV_SHOW') {
    return 'series';
  }
  return null;
}

/**
 * Формирует внешнюю ссылку на kinokino.vip без лишних параметров.
 */
export function buildKinokinoUrl(
  kinopoiskId: number,
  mediaType: KinokinoMediaType,
): string | null {
  if (!Number.isInteger(kinopoiskId) || kinopoiskId <= 0) {
    return null;
  }
  if (mediaType !== 'movie' && mediaType !== 'series') {
    return null;
  }
  const pathSegment = mediaType === 'movie' ? 'film' : 'series';
  return `https://kinokino.vip/${pathSegment}/${kinopoiskId}/`;
}

export function isValidKinopoiskCacheRecord(
  value: unknown,
): value is KinopoiskCacheRecord {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.tmdb_id !== 'number' || !Number.isInteger(obj.tmdb_id) || obj.tmdb_id <= 0) {
    return false;
  }
  if (
    typeof obj.kinopoisk_id !== 'number' ||
    !Number.isInteger(obj.kinopoisk_id) ||
    obj.kinopoisk_id <= 0
  ) {
    return false;
  }
  if (obj.media_type !== 'movie' && obj.media_type !== 'series') {
    return false;
  }
  if (typeof obj.last_updated !== 'string' || obj.last_updated.trim().length === 0) {
    return false;
  }
  return true;
}

export function normalizeComparisonTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`.,:;!?()[\]{}—–\-/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumericYear(raw: number | string | null | undefined): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  if (typeof raw === 'string') {
    const match = raw.match(/\d{4}/);
    if (match) return Number(match[0]);
  }
  return null;
}

interface ScoredCandidate {
  candidate: KinopoiskApiCandidate;
  kinokinoType: KinokinoMediaType;
  score: number;
  parsedYear: number | null;
}

function scoreCandidate(
  query: TmdbMatchQuery,
  candidate: KinopoiskApiCandidate,
): ScoredCandidate | null {
  if (!Number.isInteger(candidate.kinopoiskId) || candidate.kinopoiskId <= 0) {
    return null;
  }

  const kinokinoType = mapKinopoiskTypeToKinokino(candidate.type);
  if (!kinokinoType) return null;

  // Строгая проверка совместимости типа: фильм TMDB -> film, сериал TMDB -> series
  const expectedKinokinoType: KinokinoMediaType =
    query.mediaType === 'movie' ? 'movie' : 'series';
  if (kinokinoType !== expectedKinokinoType) {
    return null;
  }

  const qTitle = normalizeComparisonTitle(query.title);
  const qOrig = normalizeComparisonTitle(query.originalTitle);

  const cRu = normalizeComparisonTitle(candidate.nameRu);
  const cEn = normalizeComparisonTitle(candidate.nameEn);
  const cOrig = normalizeComparisonTitle(candidate.nameOriginal);

  const candidateNames = [cRu, cEn, cOrig].filter((n) => n.length > 0);
  if (candidateNames.length === 0) return null;

  let titleScore = 0;

  const exactRuMatch = Boolean(qTitle && cRu && qTitle === cRu);
  const exactOrigMatch = Boolean(
    qOrig && ((cOrig && qOrig === cOrig) || (cEn && qOrig === cEn) || (cRu && qOrig === cRu)),
  );
  const crossExactMatch = Boolean(
    qTitle && ((cOrig && qTitle === cOrig) || (cEn && qTitle === cEn)),
  );

  if (exactRuMatch && exactOrigMatch) {
    titleScore = 90;
  } else if (exactRuMatch || exactOrigMatch || crossExactMatch) {
    titleScore = 60;
  } else {
    // Проверяем частичное вхождение только для длинных названий (>= 4 символов)
    const queryVariants = [qTitle, qOrig].filter((q) => q.length >= 4);
    const hasPartial = queryVariants.some((qv) =>
      candidateNames.some((cn) => cn.includes(qv) || qv.includes(cn)),
    );
    if (!hasPartial) {
      return null;
    }
    titleScore = 30;
  }

  const targetYear = parseNumericYear(query.year);
  const parsedYear = parseNumericYear(candidate.year);
  let yearScore = 0;

  if (targetYear !== null && parsedYear !== null) {
    const diff = Math.abs(targetYear - parsedYear);
    if (diff === 0) yearScore = 40;
    else if (diff === 1) yearScore = 20;
    else if (diff === 2) yearScore = 5;
    else yearScore = -50; // Отсекаем ремейки и одноимённые тайтлы других лет
  } else if (targetYear !== null && parsedYear === null) {
    yearScore = 0;
  }

  return {
    candidate,
    kinokinoType,
    score: titleScore + yearScore,
    parsedYear,
  };
}

/**
 * Выбирает наиболее надёжное совпадение из результатов Kinopoisk API.
 * Отклоняет неоднозначные или слабые совпадения, чтобы не формировать неверную ссылку.
 */
export function selectBestKinopoiskMatch(
  query: TmdbMatchQuery,
  candidates: KinopoiskApiCandidate[],
): MatchResult {
  const uniqueById = new Map<number, KinopoiskApiCandidate>();
  for (const c of candidates) {
    if (c && typeof c.kinopoiskId === 'number' && !uniqueById.has(c.kinopoiskId)) {
      uniqueById.set(c.kinopoiskId, c);
    }
  }

  const scored: ScoredCandidate[] = [];
  for (const candidate of uniqueById.values()) {
    const res = scoreCandidate(query, candidate);
    if (res && res.score >= 70) {
      scored.push(res);
    }
  }

  if (scored.length === 0) {
    return {
      status: 'not_found',
      reason: 'Подходящее совпадение на Кинопоиске не найдено.',
    };
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];

  // Если найдено несколько близких по уверенности кандидатов — не угадываем автоматически
  if (second && best.score - second.score <= 5) {
    return {
      status: 'ambiguous',
      reason:
        'Найдено несколько похожих произведений — невозможно однозначно определить источник.',
    };
  }

  const matchedTitle =
    best.candidate.nameRu ||
    best.candidate.nameOriginal ||
    best.candidate.nameEn ||
    query.title;

  return {
    status: 'matched',
    kinopoiskId: best.candidate.kinopoiskId,
    kinopoiskMediaType: best.kinokinoType,
    matchedTitle,
    matchedYear: best.parsedYear,
    score: best.score,
  };
}
