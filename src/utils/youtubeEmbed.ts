import { invoke } from '@tauri-apps/api/core';
import { isDesktopTauriRuntime } from './platform';

const YOUTUBE_VIDEO_KEY_RE = /^[A-Za-z0-9_-]{6,20}$/;

export function isValidYouTubeVideoKey(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== 'string') return false;
  return YOUTUBE_VIDEO_KEY_RE.test(raw.trim());
}

export function buildDirectYouTubeEmbedUrl(videoKey: string): string | null {
  const trimmed = videoKey.trim();
  if (!isValidYouTubeVideoKey(trimmed)) return null;
  return `https://www.youtube-nocookie.com/embed/${trimmed}?rel=0&modestbranding=1&playsinline=1`;
}

export function buildYouTubeWatchUrl(videoKey: string): string | null {
  const trimmed = videoKey.trim();
  if (!isValidYouTubeVideoKey(trimmed)) return null;
  return `https://www.youtube.com/watch?v=${trimmed}`;
}

/**
 * Возвращает URL для встроенного плеера трейлера YouTube.
 * На десктопах (macOS / Windows Tauri) использует локальный loopback HTTP-мост
 * (`http://127.0.0.1:<port>/trailer/<key>`), чтобы WebKit и WebView2 отправляли
 * корректный HTTP-заголовок Referer и YouTube не выдавал ошибку 153.
 */
export async function resolveTrailerEmbedUrl(
  videoKey: string,
  options?: {
    desktopTauri?: boolean;
    invokeFn?: typeof invoke;
  },
): Promise<string | null> {
  const trimmed = videoKey.trim();
  if (!isValidYouTubeVideoKey(trimmed)) return null;

  const isDesktop = options?.desktopTauri ?? isDesktopTauriRuntime();
  const fallback = buildDirectYouTubeEmbedUrl(trimmed);

  if (!isDesktop) {
    return fallback;
  }

  try {
    const caller = options?.invokeFn ?? invoke;
    const bridgeUrl = await caller<string>('get_trailer_embed_url', {
      videoKey: trimmed,
    });
    if (typeof bridgeUrl === 'string' && bridgeUrl.startsWith('http://127.0.0.1:')) {
      return bridgeUrl;
    }
  } catch {
    // Если локальный мост недоступен, используем прямой youtube-nocookie embed
  }

  return fallback;
}
