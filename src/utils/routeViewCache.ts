import type { MediaItem, TitleDetailsData } from '../types';
import type { DesktopPlatform } from './platform';

export interface RouteScrollSnapshot {
  scrollY: number;
  carouselScrollLeft: Record<string, number>;
  savedAt: number;
}

export interface LibraryViewSnapshot {
  activeTab: 'watching' | 'watchlist' | 'watched' | 'favorites';
  searchQuery: string;
  selectedGenreId: number | '';
  viewMode: 'grid' | 'list';
  scrollY: number;
  savedAt: number;
}

export interface HomeDataCacheEntry<T> {
  cacheKey: string;
  data: T;
  savedAt: number;
}

export interface DesktopBackKeyEventLike {
  key: string;
  code?: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented?: boolean;
}

const DEFAULT_SCROLL_TTL_MS = 30 * 60 * 1000;
const DEFAULT_DATA_TTL_MS = 10 * 60 * 1000;
const MAX_SCROLL_ENTRIES = 40;
const MAX_TITLE_DETAILS_ENTRIES = 24;

const routeScrollMap = new Map<string, RouteScrollSnapshot>();
const titleDetailsMap = new Map<
  string,
  { data: TitleDetailsData; savedAt: number }
>();

let homeSectionsCache: HomeDataCacheEntry<unknown> | null = null;
let homeRecommendedCache: HomeDataCacheEntry<MediaItem[]> | null = null;
let libraryViewCache: LibraryViewSnapshot | null = null;

function pruneMapOldest<K, V>(map: Map<K, V>, maxEntries: number): void {
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

export function saveRouteScroll(
  routeKey: string,
  scrollY: number,
  carouselScrollLeft?: Record<string, number>,
  now = Date.now(),
): void {
  if (!routeKey) return;
  const existing = routeScrollMap.get(routeKey);
  const nextCarousels: Record<string, number> = {
    ...(existing?.carouselScrollLeft ?? {}),
  };
  if (carouselScrollLeft) {
    for (const [id, value] of Object.entries(carouselScrollLeft)) {
      if (Number.isFinite(value)) {
        nextCarousels[id] = Math.max(0, Math.round(value));
      }
    }
  }
  routeScrollMap.delete(routeKey);
  routeScrollMap.set(routeKey, {
    scrollY: Math.max(0, Math.round(Number.isFinite(scrollY) ? scrollY : 0)),
    carouselScrollLeft: nextCarousels,
    savedAt: now,
  });
  pruneMapOldest(routeScrollMap, MAX_SCROLL_ENTRIES);
}

export function saveCarouselScroll(
  routeKey: string,
  carouselId: string,
  scrollLeft: number,
  now = Date.now(),
): void {
  if (!routeKey || !carouselId) return;
  const existing = routeScrollMap.get(routeKey);
  const scrollY = existing?.scrollY ?? 0;
  saveRouteScroll(
    routeKey,
    scrollY,
    { [carouselId]: Math.max(0, Math.round(scrollLeft)) },
    now,
  );
}

export function getRouteScroll(
  routeKey: string,
  now = Date.now(),
  ttlMs = DEFAULT_SCROLL_TTL_MS,
): RouteScrollSnapshot | null {
  const entry = routeScrollMap.get(routeKey);
  if (!entry) return null;
  if (now - entry.savedAt > ttlMs) {
    routeScrollMap.delete(routeKey);
    return null;
  }
  return entry;
}

export function clearRouteScroll(routeKey?: string): void {
  if (routeKey) {
    routeScrollMap.delete(routeKey);
  } else {
    routeScrollMap.clear();
  }
}

export function saveHomeSectionsCache<T>(
  cacheKey: string,
  data: T,
  now = Date.now(),
): void {
  homeSectionsCache = { cacheKey, data, savedAt: now };
}

export function getHomeSectionsCache<T>(
  cacheKey: string,
  now = Date.now(),
  ttlMs = DEFAULT_DATA_TTL_MS,
): T | null {
  if (!homeSectionsCache || homeSectionsCache.cacheKey !== cacheKey) {
    return null;
  }
  if (now - homeSectionsCache.savedAt > ttlMs) {
    homeSectionsCache = null;
    return null;
  }
  return homeSectionsCache.data as T;
}

export function saveHomeRecommendedCache(
  cacheKey: string,
  items: MediaItem[],
  now = Date.now(),
): void {
  homeRecommendedCache = {
    cacheKey,
    data: [...items],
    savedAt: now,
  };
}

export function getHomeRecommendedCache(
  cacheKey: string,
  now = Date.now(),
  ttlMs = DEFAULT_DATA_TTL_MS,
): MediaItem[] | null {
  if (!homeRecommendedCache || homeRecommendedCache.cacheKey !== cacheKey) {
    return null;
  }
  if (now - homeRecommendedCache.savedAt > ttlMs) {
    homeRecommendedCache = null;
    return null;
  }
  return homeRecommendedCache.data;
}

export function saveTitleDetailsCache(
  cacheKey: string,
  data: TitleDetailsData,
  now = Date.now(),
): void {
  titleDetailsMap.delete(cacheKey);
  titleDetailsMap.set(cacheKey, { data, savedAt: now });
  pruneMapOldest(titleDetailsMap, MAX_TITLE_DETAILS_ENTRIES);
}

export function getTitleDetailsCache(
  cacheKey: string,
  now = Date.now(),
  ttlMs = DEFAULT_DATA_TTL_MS,
): TitleDetailsData | null {
  const entry = titleDetailsMap.get(cacheKey);
  if (!entry) return null;
  if (now - entry.savedAt > ttlMs) {
    titleDetailsMap.delete(cacheKey);
    return null;
  }
  return entry.data;
}

export function saveLibraryViewState(
  state: Omit<LibraryViewSnapshot, 'savedAt'> & { savedAt?: number },
): void {
  libraryViewCache = {
    ...state,
    scrollY: Math.max(0, Math.round(state.scrollY)),
    savedAt: state.savedAt ?? Date.now(),
  };
}

export function getLibraryViewState(
  now = Date.now(),
  ttlMs = DEFAULT_SCROLL_TTL_MS,
): LibraryViewSnapshot | null {
  if (!libraryViewCache) return null;
  if (now - libraryViewCache.savedAt > ttlMs) {
    libraryViewCache = null;
    return null;
  }
  return libraryViewCache;
}

export function clearAllRouteViewCaches(): void {
  routeScrollMap.clear();
  titleDetailsMap.clear();
  homeSectionsCache = null;
  homeRecommendedCache = null;
  libraryViewCache = null;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Определяет, должно ли десктопное приложение (Windows / macOS) обработать
 * стандартную комбинацию клавиш «Назад»:
 * - Windows / Linux / Web: Alt + ArrowLeft
 * - macOS: Cmd + [ (или Cmd + ArrowLeft)
 */
export function shouldHandleDesktopBackShortcut(
  event: DesktopBackKeyEventLike,
  platform: DesktopPlatform,
  activeTagName: string | null | undefined,
  isContentEditable = false,
): boolean {
  if (event.defaultPrevented) return false;
  if (isContentEditable) return false;
  if (activeTagName && EDITABLE_TAGS.has(activeTagName.toUpperCase())) {
    return false;
  }

  if (platform === 'macos') {
    const isCmdOnly =
      event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
    if (!isCmdOnly) return false;
    return (
      event.key === 'ArrowLeft' ||
      event.key === '[' ||
      event.code === 'BracketLeft'
    );
  }

  const isAltOnly =
    event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
  return isAltOnly && event.key === 'ArrowLeft';
}

/**
 * Боковая кнопка «Назад» на компьютерных мышах Windows/macOS.
 */
export function isMouseBackButton(button: number): boolean {
  return button === 3;
}
