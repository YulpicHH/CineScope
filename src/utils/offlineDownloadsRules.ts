import type { Genre, MediaType } from '../types';

export const OFFLINE_DOWNLOADS_STORAGE_KEY = 'cinescope_offline_downloads_v1';

export type OfflineVideoSource = 'download' | 'local_file';

export type OfflineQualityPreset = '4K' | '1080p' | '720p' | 'Оригинал';

export const OFFLINE_QUALITY_PRESETS: readonly OfflineQualityPreset[] = [
  '4K',
  '1080p',
  '720p',
  'Оригинал',
] as const;

export interface OfflineDownloadItem {
  downloadId: string;
  tmdbId: number | null;
  mediaType: MediaType;
  title: string;
  originalTitle: string;
  year: string;
  posterPath: string | null;
  genres: Genre[];
  voteAverage: number;
  source: OfflineVideoSource;
  filePath: string | null;
  webBlobKey: string | null;
  fileName: string;
  fileSizeBytes: number;
  qualityLabel: string;
  sourceUrl: string | null;
  addedAt: string;
}

export interface OfflineDownloadsStateV1 {
  version: 1;
  items: OfflineDownloadItem[];
}

export function createEmptyOfflineDownloadsState(): OfflineDownloadsStateV1 {
  return { version: 1, items: [] };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const formatted =
    unitIndex === 0
      ? Math.round(value).toString()
      : value >= 100
        ? value.toFixed(0)
        : value.toFixed(1).replace(/\.0$/, '');
  return `${formatted} ${units[unitIndex]}`;
}

export function extractFileFormatLabel(fileNameOrUrl: string): string {
  const cleaned = fileNameOrUrl.trim().split(/[?#]/)[0] ?? '';
  const match = cleaned.match(/\.([a-zA-Z0-9]{2,5})$/);
  if (!match) return 'VIDEO';
  const ext = match[1].toUpperCase();
  if (['MP4', 'MKV', 'MOV', 'WEBM', 'M4V', 'AVI', 'TS'].includes(ext)) {
    return ext;
  }
  return 'VIDEO';
}

export function validateDirectVideoUrl(
  rawUrl: string,
): { ok: true; url: string } | { ok: false; message: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, message: 'Вставьте прямую ссылку на видеофайл.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      message: 'Некорректная ссылка. Укажите полный адрес вида https://.../video.mp4',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      message: 'Поддерживаются только прямые ссылки с протоколом http или https.',
    };
  }

  return { ok: true, url: parsed.toString() };
}

export function calculateDownloadProgress(
  downloadedBytes: number,
  totalBytes: number | null,
): number | null {
  if (!totalBytes || !Number.isFinite(totalBytes) || totalBytes <= 0) {
    return null;
  }
  if (!Number.isFinite(downloadedBytes) || downloadedBytes <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((downloadedBytes / totalBytes) * 100)));
}

export function buildDownloadIdForMedia(
  mediaType: MediaType,
  tmdbId: number | null,
): string {
  if (tmdbId !== null && Number.isInteger(tmdbId) && tmdbId > 0) {
    return `${mediaType}:${tmdbId}`;
  }
  return `local:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function inferFileNameFromUrl(url: string, fallbackTitle: string): string {
  try {
    const parsed = new URL(url);
    const segment = decodeURIComponent(
      parsed.pathname.split('/').filter(Boolean).pop() ?? '',
    ).trim();
    if (segment && /\.[a-zA-Z0-9]{2,5}$/.test(segment)) {
      return segment;
    }
  } catch {
    // fallback below
  }
  const safeStem = fallbackTitle
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return `${safeStem || 'video'}.mp4`;
}

function isValidGenre(value: unknown): value is Genre {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Genre).id === 'number' &&
    typeof (value as Genre).name === 'string'
  );
}

function sanitizeOfflineItem(raw: unknown): OfflineDownloadItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  if (
    typeof candidate.downloadId !== 'string' ||
    !candidate.downloadId.trim() ||
    typeof candidate.title !== 'string' ||
    !candidate.title.trim() ||
    typeof candidate.fileName !== 'string' ||
    !candidate.fileName.trim()
  ) {
    return null;
  }

  const mediaType: MediaType = candidate.mediaType === 'tv' ? 'tv' : 'movie';
  const source: OfflineVideoSource =
    candidate.source === 'download' ? 'download' : 'local_file';

  const filePath =
    typeof candidate.filePath === 'string' && candidate.filePath.trim()
      ? candidate.filePath.trim()
      : null;
  const webBlobKey =
    typeof candidate.webBlobKey === 'string' && candidate.webBlobKey.trim()
      ? candidate.webBlobKey.trim()
      : null;

  if (!filePath && !webBlobKey) {
    return null;
  }

  return {
    downloadId: candidate.downloadId.trim(),
    tmdbId:
      typeof candidate.tmdbId === 'number' &&
      Number.isInteger(candidate.tmdbId) &&
      candidate.tmdbId > 0
        ? candidate.tmdbId
        : null,
    mediaType,
    title: candidate.title.trim(),
    originalTitle:
      typeof candidate.originalTitle === 'string'
        ? candidate.originalTitle.trim()
        : '',
    year: typeof candidate.year === 'string' ? candidate.year.trim() : '',
    posterPath:
      typeof candidate.posterPath === 'string' && candidate.posterPath.trim()
        ? candidate.posterPath.trim()
        : null,
    genres: Array.isArray(candidate.genres)
      ? candidate.genres.filter(isValidGenre)
      : [],
    voteAverage:
      typeof candidate.voteAverage === 'number' &&
      Number.isFinite(candidate.voteAverage)
        ? candidate.voteAverage
        : 0,
    source,
    filePath,
    webBlobKey,
    fileName: candidate.fileName.trim(),
    fileSizeBytes:
      typeof candidate.fileSizeBytes === 'number' &&
      Number.isFinite(candidate.fileSizeBytes) &&
      candidate.fileSizeBytes >= 0
        ? candidate.fileSizeBytes
        : 0,
    qualityLabel:
      typeof candidate.qualityLabel === 'string' && candidate.qualityLabel.trim()
        ? candidate.qualityLabel.trim()
        : 'Оригинал',
    sourceUrl:
      typeof candidate.sourceUrl === 'string' && candidate.sourceUrl.trim()
        ? candidate.sourceUrl.trim()
        : null,
    addedAt:
      typeof candidate.addedAt === 'string' && candidate.addedAt.trim()
        ? candidate.addedAt.trim()
        : new Date().toISOString(),
  };
}

export function parseOfflineDownloadsStorage(
  raw: string | null,
): OfflineDownloadsStateV1 {
  if (!raw) return createEmptyOfflineDownloadsState();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== 1 ||
      !Array.isArray((parsed as { items?: unknown }).items)
    ) {
      return createEmptyOfflineDownloadsState();
    }

    const dedup = new Map<string, OfflineDownloadItem>();
    for (const rawItem of (parsed as { items: unknown[] }).items) {
      const sanitized = sanitizeOfflineItem(rawItem);
      if (sanitized) {
        dedup.set(sanitized.downloadId, sanitized);
      }
    }

    return {
      version: 1,
      items: Array.from(dedup.values()),
    };
  } catch {
    return createEmptyOfflineDownloadsState();
  }
}

export function serializeOfflineDownloadsStorage(
  state: OfflineDownloadsStateV1,
): string {
  return JSON.stringify(state);
}

export function upsertOfflineDownload(
  items: OfflineDownloadItem[],
  nextItem: OfflineDownloadItem,
): OfflineDownloadItem[] {
  const filtered = items.filter(
    (entry) => entry.downloadId !== nextItem.downloadId,
  );
  return [nextItem, ...filtered];
}

export function removeOfflineDownload(
  items: OfflineDownloadItem[],
  downloadId: string,
): OfflineDownloadItem[] {
  return items.filter((entry) => entry.downloadId !== downloadId);
}

export function computeTotalOfflineBytes(items: OfflineDownloadItem[]): number {
  return items.reduce((sum, item) => sum + Math.max(0, item.fileSizeBytes), 0);
}
