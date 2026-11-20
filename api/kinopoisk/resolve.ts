import {
  buildKinokinoUrl,
  selectBestKinopoiskMatch,
  type KinopoiskApiCandidate,
} from '../../src/utils/kinopoiskMatcher';

const KINOPOISK_API_URL = 'https://kinopoiskapiunofficial.tech/api/v2.2/films';
const PLACEHOLDER_KINOPOISK_KEY = 'MY_KINOPOISK_API_KEY';
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_TITLE_LENGTH = 200;
const MAX_YEAR_LENGTH = 10;
const MAX_API_KEY_LENGTH = 128;

interface VercelRequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelResponseLike {
  status: (code: number) => VercelResponseLike;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string) => void;
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
    res.status(405).json({
      status: 'error',
      code: 'METHOD_NOT_ALLOWED',
      message: 'Разрешены только POST-запросы.',
      retryable: false,
    });
    return;
  }

  const body = parseRequestBody(req.body);
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
    res.status(400).json({
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
    res.status(503).json({
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
        res.status(502).json({
          status: 'error',
          code: 'API_UNAVAILABLE',
          message: 'Не удалось сформировать корректную ссылку на просмотр.',
          retryable: true,
        });
        return;
      }

      res.status(200).json({
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
      res.status(200).json({
        status: 'ambiguous',
        message: matchResult.reason,
      });
      return;
    }

    res.status(200).json({
      status: 'not_found',
      message: matchResult.reason,
    });
  } catch (error: unknown) {
    if (error instanceof KinopoiskUpstreamError) {
      res.status(error.status).json({
        status: 'error',
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
      return;
    }

    res.status(502).json({
      status: 'error',
      code: 'API_UNAVAILABLE',
      message: 'Не удалось проверить доступность просмотра.',
      retryable: true,
    });
  }
}
