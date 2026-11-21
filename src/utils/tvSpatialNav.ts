export type TvDirection = 'up' | 'down' | 'left' | 'right';

export type TvRemoteAction = TvDirection | 'select' | 'back' | null;

export interface FocusRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const DIRECTION_EPSILON = 2;
const DEFAULT_DUPLICATE_GUARD_MS = 45;

/**
 * Предотвращает двойное срабатывание одного физического нажатия на Bluetooth-пульте Android TV
 * (когда WebView за 5–25 мс отправляет сразу два не-repeat события стрелки).
 * Удержание клавиши (isRepeat === true) пропускается без ограничений.
 */
export function shouldAcceptTvKeyEvent(
  action: TvRemoteAction,
  isRepeat: boolean,
  lastAction: TvRemoteAction,
  lastTimestamp: number,
  now: number,
  debounceMs = DEFAULT_DUPLICATE_GUARD_MS,
): boolean {
  if (!action) return false;
  if (isRepeat) return true;
  if (
    action === lastAction &&
    (action === 'up' || action === 'down' || action === 'left' || action === 'right') &&
    now - lastTimestamp >= 0 &&
    now - lastTimestamp < debounceMs
  ) {
    return false;
  }
  return true;
}

/**
 * Преобразует событие клавиатуры или пульта Android TV / SberBox
 * в семантическое действие навигации.
 */
export function mapKeyToTvAction(key: string, keyCode?: number): TvRemoteAction {
  switch (key) {
    case 'ArrowUp':
    case 'Up':
      return 'up';
    case 'ArrowDown':
    case 'Down':
      return 'down';
    case 'ArrowLeft':
    case 'Left':
      return 'left';
    case 'ArrowRight':
    case 'Right':
      return 'right';
    case 'Enter':
    case 'NumpadEnter':
    case 'OK':
    case 'Select':
      return 'select';
    case 'Escape':
    case 'Backspace':
    case 'BrowserBack':
    case 'GoBack':
    case 'XF86Back':
    case 'Back':
      return 'back';
    default:
      break;
  }

  // Коды клавиш Android WebView / TV D-Pad (DPAD_UP/DOWN/LEFT/RIGHT/CENTER/BACK)
  switch (keyCode) {
    case 38:
    case 19:
      return 'up';
    case 40:
    case 20:
      return 'down';
    case 37:
    case 21:
      return 'left';
    case 39:
    case 22:
      return 'right';
    case 13:
    case 23:
    case 66:
      return 'select';
    case 4:
    case 8:
    case 27:
    case 166:
      return 'back';
    default:
      return null;
  }
}

/**
 * Геометрический поиск ближайшего фокусируемого элемента в заданном направлении D-Pad.
 * Приоритезирует непосредственного соседа на той же строке (для влево/вправо)
 * или колонке (для вверх/вниз), в том числе для плотных сегментированных кнопок с нулевым зазором.
 */
export function findNextFocusableIndex(
  origin: FocusRect,
  candidates: readonly FocusRect[],
  direction: TvDirection,
  currentIndex = -1,
): number {
  if (candidates.length === 0) return -1;

  const ox = origin.left + origin.width / 2;
  const oy = origin.top + origin.height / 2;

  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i < candidates.length; i += 1) {
    if (i === currentIndex) continue;

    const c = candidates[i];
    if (c.width <= 0 || c.height <= 0) continue;

    const cx = c.left + c.width / 2;
    const cy = c.top + c.height / 2;

    if (direction === 'right') {
      if (cx <= ox + DIRECTION_EPSILON || c.right <= origin.right - DIRECTION_EPSILON) {
        continue;
      }
    } else if (direction === 'left') {
      if (cx >= ox - DIRECTION_EPSILON || c.left >= origin.left + DIRECTION_EPSILON) {
        continue;
      }
    } else if (direction === 'down') {
      if (cy <= oy + DIRECTION_EPSILON || c.bottom <= origin.bottom - DIRECTION_EPSILON) {
        continue;
      }
    } else if (direction === 'up') {
      if (cy >= oy - DIRECTION_EPSILON || c.top >= origin.top + DIRECTION_EPSILON) {
        continue;
      }
    }

    let score: number;

    if (direction === 'left' || direction === 'right') {
      const overlapY = Math.max(
        0,
        Math.min(origin.bottom, c.bottom) - Math.max(origin.top, c.top),
      );
      const minRequiredOverlap = Math.min(6, Math.min(origin.height, c.height) * 0.2);
      // Строго остаёмся в пределах текущей строки: на краю строки фокус никуда не перепрыгивает
      if (overlapY <= minRequiredOverlap) {
        continue;
      }

      const edgeGap =
        direction === 'right'
          ? Math.max(0, c.left - origin.right)
          : Math.max(0, origin.left - c.right);
      const centerDist = Math.abs(cx - ox);
      // Монотонная метрика без скачка при edgeGap === 0: соприкасающийся сосед всегда ближе, чем элемент через один
      const primary = edgeGap + centerDist * 0.08;
      const crossDist = Math.abs(cy - oy);

      score = primary + crossDist * 0.9;
    } else {
      const edgeGap =
        direction === 'down'
          ? Math.max(0, c.top - origin.bottom)
          : Math.max(0, origin.top - c.bottom);
      const centerDist = Math.abs(cy - oy);
      const primary = edgeGap + centerDist * 0.08;

      const overlapX = Math.max(
        0,
        Math.min(origin.right, c.right) - Math.max(origin.left, c.left),
      );
      // Для широких элементов (например, строка поиска во всю ширину под вкладками «Все»/«Фильмы»)
      // измеряем горизонтальное расстояние до ближайшего края [left, right], а не только до центра cx
      const spanDistX =
        ox < c.left ? c.left - ox : ox > c.right ? ox - c.right : 0;
      const centerDistX = Math.abs(cx - ox);
      const secondary =
        overlapX > 0
          ? spanDistX * 0.6 + centerDistX * 0.04
          : spanDistX * 1.4 + centerDistX * 0.12;
      const alignmentPenalty = overlapX > 0 ? 0 : 80;

      score = primary + secondary * 2.2 + alignmentPenalty;
    }

    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}
