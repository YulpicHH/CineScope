const KINOPOISK_API_URL = 'https://kinopoiskapiunofficial.tech/api/v2.2/films';
const PLACEHOLDER_KINOPOISK_KEY = 'MY_KINOPOISK_API_KEY';
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_TITLE_LENGTH = 200;
const MAX_YEAR_LENGTH = 10;
const MAX_API_KEY_LENGTH = 128;
const MAX_BODY_BYTES = 64 * 1024;

type KinokinoMediaType = 'movie' | 'series';

interface KinopoiskApiCandidate {
  kinopoiskId: number;
  nameRu?: string | null;
  nameEn?: string | null;
  nameOriginal?: string | null;
  type?: string | null;
  year?: number | string | null;
}

interface TmdbMatchQuery {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle: string;
  year: string;
}

type MatchResult =
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

interface ScoredCandidate {
  candidate: KinopoiskApiCandidate;
  kinokinoType: KinokinoMediaType;
  score: number;
  parsedYear: number | null;
}

interface VercelRequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | string>;
}

interface VercelResponseLike {
  statusCode?: number;
  status?: (code: number) => VercelResponseLike;
  json?: (payload: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end?: (chunk?: string) => void;
}

function sendJson(
  res: VercelResponseLike,
  statusCode: number,
  payload: unknown,
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    const next = res.status(statusCode);
    if (typeof next.json === 'function') {
      next.json(payload);
      return;
    }
    res.json(payload);
    return;
  }
  res.statusCode = statusCode;
  res.end?.(JSON.stringify(payload));
}

function mapKinopoiskTypeToKinokino(
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

function buildKinokinoUrl(
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

function normalizeComparisonTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`.,:;!?()[\]{}—–\-/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumericYear(
  raw: number | string | null | undefined,
): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  if (typeof raw === 'string') {
    const match = raw.match(/\d{4}/);
    if (match) return Number(match[0]);
  }
  return null;
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
    qOrig &&
      ((cOrig && qOrig === cOrig) ||
        (cEn && qOrig === cEn) ||
        (cRu && qOrig === cRu)),
  );
  const crossExactMatch = Boolean(
    qTitle && ((cOrig && qTitle === cOrig) || (cEn && qTitle === cEn)),
  );

  if (exactRuMatch && exactOrigMatch) {
    titleScore = 90;
  } else if (exactRuMatch || exactOrigMatch || crossExactMatch) {
    titleScore = 60;
  } else {
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
    else yearScore = -50;
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

function selectBestKinopoiskMatch(
  query: TmdbMatchQuery,
  candidates: KinopoiskApiCandidate[],
): MatchResult {
  const uniqueById = new Map<number, KinopoiskApiCandidate>();
  for (const c of candidates) {
    if (
      c &&
      typeof c.kinopoiskId === 'number' &&
      !uniqueById.has(c.kinopoiskId)
    ) {
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

interface KinopoiskResolvePayload {
  tmdbId?: unknown;
  mediaType?: unknown;
  title?: unknown;
  originalTitle?: unknown;
  year?: unknown;
}

class KinopoiskUpstreamError extends Error {
  status: number;
  code: 'INVALID_KEY' | 'RATE_LIMIT' | 'API_UNAVAILABLE';
  retryable: boolean;

  constructor(
    status: number,
    code: 'INVALID_KEY' | 'RATE_LIMIT' | 'API_UNAVAILABLE',
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

function readSingleHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const lower = name.toLowerCase();
  const raw = headers[lower] ?? headers[name];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
}

function sanitizeKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === PLACEHOLDER_KINOPOISK_KEY) return '';
  if (trimmed.length > MAX_API_KEY_LENGTH || /[\s\r\n]/.test(trimmed)) return '';
  return trimmed;
}

function parseRequestBody(body: unknown): KinopoiskResolvePayload {
  if (body instanceof Uint8Array) {
    try {
      const decoded = new TextDecoder('utf-8').decode(body);
      const parsed = JSON.parse(decoded) as unknown;
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as KinopoiskResolvePayload)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as unknown;
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as KinopoiskResolvePayload)
        : {};
    } catch {
      return {};
    }
  }
  return typeof body === 'object' && body !== null
    ? (body as KinopoiskResolvePayload)
    : {};
}

async function readRequestBody(
  req: VercelRequestLike,
): Promise<{ payload: KinopoiskResolvePayload; tooLarge: boolean }> {
  if (req.body !== undefined) {
    if (req.body instanceof Uint8Array && req.body.byteLength > MAX_BODY_BYTES) {
      return { payload: {}, tooLarge: true };
    }
    if (
      typeof req.body === 'string' &&
      new TextEncoder().encode(req.body).byteLength > MAX_BODY_BYTES
    ) {
      return { payload: {}, tooLarge: true };
    }
    return { payload: parseRequestBody(req.body), tooLarge: false };
  }

  const asyncIter = req[Symbol.asyncIterator];
  if (typeof asyncIter !== 'function') {
    return { payload: {}, tooLarge: false };
  }

  const decoder = new TextDecoder('utf-8');
  const encoder = new TextEncoder();
  let raw = '';
  let totalBytes = 0;

  try {
    const iterator = asyncIter.call(req);
    while (true) {
      const { value, done } = await iterator.next();
      if (done) break;

      if (typeof value === 'string') {
        totalBytes += encoder.encode(value).byteLength;
        if (totalBytes > MAX_BODY_BYTES) {
          return { payload: {}, tooLarge: true };
        }
        raw += value;
      } else if (value instanceof Uint8Array) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BODY_BYTES) {
          return { payload: {}, tooLarge: true };
        }
        raw += decoder.decode(value, { stream: true });
      }
    }
    raw += decoder.decode();
  } catch {
    return { payload: {}, tooLarge: false };
  }

  return { payload: parseRequestBody(raw), tooLarge: false };
}

async function fetchKinopoiskCandidates(
  keyword: string,
  typeParam: 'FILM' | 'ALL',
  apiKey: string,
): Promise<KinopoiskApiCandidate[]> {
  const params = new URLSearchParams({
    keyword,
    type: typeParam,
    page: '1',
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(`${KINOPOISK_API_URL}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new KinopoiskUpstreamError(
        502,
        'INVALID_KEY',
        'Ключ Kinopoisk Unofficial API недействителен или отклонён.',
        false,
      );
    }

    if (response.status === 402 || response.status === 429) {
      throw new KinopoiskUpstreamError(
        429,
        'RATE_LIMIT',
        'Превышен лимит запросов к Kinopoisk Unofficial API. Попробуйте чуть позже.',
        true,
      );
    }

    if (!response.ok) {
      throw new KinopoiskUpstreamError(
        502,
        'API_UNAVAILABLE',
        'Сервис поиска Kinopoisk временно недоступен.',
        true,
      );
    }

    const data = (await response.json()) as { items?: unknown };
    if (!Array.isArray(data.items)) {
      return [];
    }

    return data.items.filter(
      (item): item is KinopoiskApiCandidate =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as KinopoiskApiCandidate).kinopoiskId === 'number',
    );
  } catch (error: unknown) {
    if (error instanceof KinopoiskUpstreamError) {
      throw error;
    }
    throw new KinopoiskUpstreamError(
      502,
      'API_UNAVAILABLE',
      'Не удалось связаться с Kinopoisk Unofficial API. Проверьте соединение или повторите позже.',
      true,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(
  req: VercelRequestLike,
  res: VercelResponseLike,
): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, {
      status: 'error',
      code: 'METHOD_NOT_ALLOWED',
      message: 'Разрешены только POST-запросы.',
      retryable: false,
    });
    return;
  }

  const { payload: body, tooLarge } = await readRequestBody(req);
  if (tooLarge) {
    sendJson(res, 413, {
      status: 'error',
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Слишком большой размер запроса.',
      retryable: false,
    });
    return;
  }

  const tmdbId =
    typeof body.tmdbId === 'number' ? body.tmdbId : Number(body.tmdbId);
  const mediaType: 'movie' | 'tv' | null =
    body.mediaType === 'movie'
      ? 'movie'
      : body.mediaType === 'tv'
        ? 'tv'
        : null;
  const title =
    typeof body.title === 'string'
      ? body.title.trim().slice(0, MAX_TITLE_LENGTH)
      : '';
  const originalTitle =
    typeof body.originalTitle === 'string'
      ? body.originalTitle.trim().slice(0, MAX_TITLE_LENGTH)
      : '';
  const year =
    typeof body.year === 'string'
      ? body.year.trim().slice(0, MAX_YEAR_LENGTH)
      : '';

  if (
    !Number.isInteger(tmdbId) ||
    tmdbId <= 0 ||
    !mediaType ||
    (!title && !originalTitle)
  ) {
    sendJson(res, 400, {
      status: 'error',
      code: 'INVALID_REQUEST',
      message: 'Некорректные параметры для поиска произведения.',
      retryable: false,
    });
    return;
  }

  const headerApiKey = sanitizeKey(
    readSingleHeader(req.headers, 'x-kinopoisk-api-key'),
  );
  const envApiKey = sanitizeKey(process.env.KINOPOISK_API_KEY ?? '');
  const apiKey = headerApiKey || envApiKey;

  if (!apiKey) {
    sendJson(res, 503, {
      status: 'error',
      code: 'NOT_CONFIGURED',
      message:
        'Для кнопки «Смотреть» нужен ключ Kinopoisk Unofficial API. Добавьте его в настройках.',
      retryable: false,
    });
    return;
  }

  const typeParam: 'FILM' | 'ALL' = mediaType === 'movie' ? 'FILM' : 'ALL';
  const matchQuery = {
    tmdbId,
    mediaType,
    title: title || originalTitle,
    originalTitle: originalTitle || title,
    year,
  };

  try {
    const primaryKeyword = title || originalTitle;
    const firstCandidates = await fetchKinopoiskCandidates(
      primaryKeyword,
      typeParam,
      apiKey,
    );
    let matchResult = selectBestKinopoiskMatch(matchQuery, firstCandidates);

    const shouldQueryOriginal =
      matchResult.status !== 'matched' &&
      Boolean(originalTitle) &&
      originalTitle.toLowerCase() !== primaryKeyword.toLowerCase();

    if (shouldQueryOriginal) {
      const secondaryCandidates = await fetchKinopoiskCandidates(
        originalTitle,
        typeParam,
        apiKey,
      );
      matchResult = selectBestKinopoiskMatch(matchQuery, [
        ...firstCandidates,
        ...secondaryCandidates,
      ]);
    }

    if (matchResult.status === 'matched') {
      const url = buildKinokinoUrl(
        matchResult.kinopoiskId,
        matchResult.kinopoiskMediaType,
      );
      if (!url) {
        sendJson(res, 502, {
          status: 'error',
          code: 'API_UNAVAILABLE',
          message: 'Не удалось сформировать корректную ссылку на просмотр.',
          retryable: true,
        });
        return;
      }

      sendJson(res, 200, {
        status: 'matched',
        cached: false,
        kinopoiskId: matchResult.kinopoiskId,
        kinopoiskMediaType: matchResult.kinopoiskMediaType,
        url,
        lastUpdated: new Date().toISOString().slice(0, 10),
      });
      return;
    }

    if (matchResult.status === 'ambiguous') {
      sendJson(res, 200, {
        status: 'ambiguous',
        message: matchResult.reason,
      });
      return;
    }

    sendJson(res, 200, {
      status: 'not_found',
      message: matchResult.reason,
    });
  } catch (error: unknown) {
    if (error instanceof KinopoiskUpstreamError) {
      sendJson(res, error.status, {
        status: 'error',
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
      return;
    }

    sendJson(res, 502, {
      status: 'error',
      code: 'API_UNAVAILABLE',
      message: 'Не удалось проверить доступность просмотра.',
      retryable: true,
    });
  }
}
