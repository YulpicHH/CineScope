import express from 'express';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  buildKinokinoUrl,
  isValidKinopoiskCacheRecord,
  selectBestKinopoiskMatch,
  type KinopoiskApiCandidate,
  type KinopoiskCacheRecord,
} from './src/utils/kinopoiskMatcher.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KINOPOISK_API_URL = 'https://kinopoiskapiunofficial.tech/api/v2.2/films';
const KINOPOISK_CACHE_DIR = path.resolve(__dirname, '.cache');
const KINOPOISK_CACHE_FILE = path.join(KINOPOISK_CACHE_DIR, 'kinopoisk-map.json');

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

const kinopoiskMemoryCache = new Map<string, KinopoiskCacheRecord>();
let cacheLoaded = false;
let cacheWriteQueue: Promise<void> = Promise.resolve();

function buildCacheKey(mediaType: 'movie' | 'tv', tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

function isKeyConsistentWithRecord(
  key: string,
  record: KinopoiskCacheRecord,
): boolean {
  if (key.startsWith('movie:')) return record.media_type === 'movie';
  if (key.startsWith('tv:')) return record.media_type === 'series';
  return false;
}

async function ensureKinopoiskCacheLoaded(): Promise<void> {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const raw = await fs.readFile(KINOPOISK_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return;
    for (const [key, value] of Object.entries(parsed)) {
      if (isValidKinopoiskCacheRecord(value) && isKeyConsistentWithRecord(key, value)) {
        kinopoiskMemoryCache.set(key, value);
      }
    }
  } catch {
    // Файл кэша отсутствует или повреждён — начинаем с пустого кэша
  }
}

function persistKinopoiskCache(): Promise<void> {
  cacheWriteQueue = cacheWriteQueue.then(async () => {
    try {
      await fs.mkdir(KINOPOISK_CACHE_DIR, { recursive: true });
      const snapshot: Record<string, KinopoiskCacheRecord> = {};
      for (const [key, record] of kinopoiskMemoryCache.entries()) {
        snapshot[key] = record;
      }
      await fs.writeFile(
        KINOPOISK_CACHE_FILE,
        JSON.stringify(snapshot, null, 2),
        'utf8',
      );
    } catch {
      // Ошибка записи на диск не должна ломать ответ пользователю
    }
  });
  return cacheWriteQueue;
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
  const timeoutId = setTimeout(() => controller.abort(), 8000);

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

async function startServer() {
  await ensureKinopoiskCacheLoaded();

  const app = express();
  const httpServer = http.createServer(app);
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  // Маршрут поиска Kinopoisk ID по данным TMDB для формирования внешней ссылки на просмотр
  app.post('/api/kinopoisk/resolve', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const body = (req.body ?? {}) as KinopoiskResolvePayload;
    const tmdbId = typeof body.tmdbId === 'number' ? body.tmdbId : Number(body.tmdbId);
    const mediaType: 'movie' | 'tv' | null =
      body.mediaType === 'movie'
        ? 'movie'
        : body.mediaType === 'tv'
          ? 'tv'
          : null;
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    const originalTitle = typeof body.originalTitle === 'string' ? body.originalTitle.trim().slice(0, 200) : '';
    const year = typeof body.year === 'string' ? body.year.trim().slice(0, 10) : '';

    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !mediaType || (!title && !originalTitle)) {
      res.status(400).json({
        status: 'error',
        code: 'INVALID_REQUEST',
        message: 'Некорректные параметры для поиска произведения.',
        retryable: false,
      });
      return;
    }

    const rawHeaderKey = req.header('x-kinopoisk-api-key')?.trim() ?? '';
    const headerApiKey =
      rawHeaderKey &&
      rawHeaderKey !== 'MY_KINOPOISK_API_KEY' &&
      rawHeaderKey.length <= 128 &&
      !/[\s\r\n]/.test(rawHeaderKey)
        ? rawHeaderKey
        : '';
    const rawEnvKey = process.env.KINOPOISK_API_KEY?.trim() ?? '';
    const envApiKey =
      rawEnvKey &&
      rawEnvKey !== 'MY_KINOPOISK_API_KEY' &&
      rawEnvKey.length <= 128 &&
      !/[\s\r\n]/.test(rawEnvKey)
        ? rawEnvKey
        : '';
    const apiKey = headerApiKey || envApiKey;

    if (!apiKey) {
      res.status(503).json({
        status: 'error',
        code: 'NOT_CONFIGURED',
        message: 'Для кнопки «Смотреть» нужен ключ Kinopoisk Unofficial API. Добавьте его в настройках.',
        retryable: false,
      });
      return;
    }

    const cacheKey = buildCacheKey(mediaType, tmdbId);
    const cachedRecord = kinopoiskMemoryCache.get(cacheKey);
    if (cachedRecord) {
      if (
        isValidKinopoiskCacheRecord(cachedRecord) &&
        isKeyConsistentWithRecord(cacheKey, cachedRecord)
      ) {
        const cachedUrl = buildKinokinoUrl(
          cachedRecord.kinopoisk_id,
          cachedRecord.media_type,
        );
        if (cachedUrl) {
          res.json({
            status: 'matched',
            cached: true,
            kinopoiskId: cachedRecord.kinopoisk_id,
            kinopoiskMediaType: cachedRecord.media_type,
            url: cachedUrl,
            lastUpdated: cachedRecord.last_updated,
          });
          return;
        }
      }
      kinopoiskMemoryCache.delete(cacheKey);
    }

    const typeParam: 'FILM' | 'ALL' = mediaType === 'movie' ? 'FILM' : 'ALL';
    const matchQuery: {
      tmdbId: number;
      mediaType: 'movie' | 'tv';
      title: string;
      originalTitle: string;
      year: string;
    } = {
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

        const record: KinopoiskCacheRecord = {
          tmdb_id: tmdbId,
          kinopoisk_id: matchResult.kinopoiskId,
          media_type: matchResult.kinopoiskMediaType,
          last_updated: new Date().toISOString().slice(0, 10),
        };
        kinopoiskMemoryCache.set(cacheKey, record);
        void persistKinopoiskCache();

        res.json({
          status: 'matched',
          cached: false,
          kinopoiskId: record.kinopoisk_id,
          kinopoiskMediaType: record.media_type,
          url,
          lastUpdated: record.last_updated,
        });
        return;
      }

      if (matchResult.status === 'ambiguous') {
        res.json({
          status: 'ambiguous',
          message: matchResult.reason,
        });
        return;
      }

      res.json({
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
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`CineScope server listening on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CineScope server:', err);
  process.exit(1);
});
