import type { MediaItem } from '../types';
import type { DesktopPlatform } from './platform';
import type { PlayerModeId } from './playerProfile';

export interface QuickSearchPerson {
  id: number;
  name: string;
  department: string;
  profilePath: string | null;
  knownForTitle?: string;
}

export interface QuickSearchResults {
  titles: MediaItem[];
  people: QuickSearchPerson[];
}

export type QuickSearchEntry =
  | { kind: 'title'; key: string; item: MediaItem }
  | { kind: 'person'; key: string; person: QuickSearchPerson };

export interface QuickSearchKeyEventLike {
  key: string;
  code?: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented?: boolean;
}

export interface BrowserAvailabilityLike {
  firefox: boolean;
  chrome: boolean;
  edge: boolean;
}

export interface BrowserStatusInfo {
  text: string;
  tone: 'ready' | 'warning' | 'neutral';
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Вычисляет текстовую релевантность тайтла по быстрому запросу (без дополнительных фильтров):
 * точное совпадение > совпадение с начала строки > вхождение подстроки + популярность.
 */
export function scoreQuickSearchTitle(item: MediaItem, rawQuery: string): number {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return item.popularity;

  const title = item.title.toLowerCase();
  const original = item.originalTitle.toLowerCase();

  let matchBonus = 0;
  if (title === q || original === q) {
    matchBonus = 10000;
  } else if (title.startsWith(q) || original.startsWith(q)) {
    matchBonus = 4000;
  } else if (title.includes(q) || original.includes(q)) {
    matchBonus = 1500;
  }

  return matchBonus + Math.min(item.popularity, 1000) + item.voteAverage * 10;
}

/**
 * Объединяет и упорядочивает результаты быстрого поиска (тайтлы + актёры) в единый список
 * для клавиатурной навигации стрелками ↑ / ↓ и Enter.
 */
export function buildQuickSearchEntries(
  results: QuickSearchResults,
  query: string,
  maxTitles = 8,
  maxPeople = 3,
): QuickSearchEntry[] {
  const seenTitles = new Set<string>();
  const uniqueTitles: MediaItem[] = [];
  for (const item of results.titles) {
    const key = `${item.mediaType}:${item.id}`;
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    uniqueTitles.push(item);
  }

  uniqueTitles.sort(
    (a, b) => scoreQuickSearchTitle(b, query) - scoreQuickSearchTitle(a, query),
  );

  const seenPeople = new Set<number>();
  const uniquePeople: QuickSearchPerson[] = [];
  for (const person of results.people) {
    if (seenPeople.has(person.id)) continue;
    seenPeople.add(person.id);
    uniquePeople.push(person);
  }

  const entries: QuickSearchEntry[] = [];
  for (const item of uniqueTitles.slice(0, maxTitles)) {
    entries.push({
      kind: 'title',
      key: `${item.mediaType}:${item.id}`,
      item,
    });
  }
  for (const person of uniquePeople.slice(0, maxPeople)) {
    entries.push({
      kind: 'person',
      key: `person:${person.id}`,
      person,
    });
  }

  return entries;
}

/**
 * Проверяет, должен ли открыться быстрый поиск по горячей клавише:
 * - macOS: Cmd + K (включая русскую раскладку, code === 'KeyK')
 * - Windows / Linux / Web: Ctrl + K
 */
export function shouldOpenQuickSearchShortcut(
  event: QuickSearchKeyEventLike,
  platform: DesktopPlatform,
  activeTagName: string | null | undefined,
  isContentEditable = false,
): boolean {
  if (event.defaultPrevented) return false;
  if (isContentEditable) return false;
  if (activeTagName && EDITABLE_TAGS.has(activeTagName.toUpperCase())) {
    return false;
  }

  const isK =
    event.code === 'KeyK' ||
    event.key.toLowerCase() === 'k' ||
    event.key.toLowerCase() === 'л';
  if (!isK) return false;

  if (platform === 'macos') {
    return event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
  }
  return event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}

/**
 * Определяет статус доступности выбранного браузера для панели настроек просмотра.
 */
export function getPlayerBrowserStatusInfo(
  mode: PlayerModeId,
  platform: DesktopPlatform,
  availability: BrowserAvailabilityLike | null,
): BrowserStatusInfo | null {
  if (mode === 'embedded_webkit') {
    return platform === 'windows'
      ? { text: 'WebView2 4K готов', tone: 'ready' }
      : { text: 'Внутри приложения', tone: 'neutral' };
  }

  if (!availability) return null;

  if (mode === 'firefox_window') {
    return availability.firefox
      ? { text: 'Firefox готов', tone: 'ready' }
      : { text: 'Firefox не найден — откроется встроенное окно', tone: 'warning' };
  }

  if (mode === 'chrome_window') {
    return availability.chrome
      ? { text: 'Chrome готов', tone: 'ready' }
      : { text: 'Chrome не найден — откроется встроенное окно', tone: 'warning' };
  }

  if (mode === 'edge_window') {
    return availability.edge
      ? { text: 'Edge готов', tone: 'ready' }
      : { text: 'Edge не найден — откроется встроенное окно', tone: 'warning' };
  }

  return null;
}
