import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isTvMode } from '../utils/platform';
import {
  findNextFocusableIndex,
  mapKeyToTvAction,
  type FocusRect,
  type TvDirection,
} from '../utils/tvSpatialNav';

const TV_FOCUSABLE_SELECTOR = [
  'button:not([disabled]):not([tabindex="-1"])',
  'a[href]:not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[data-tv-focusable="true"]:not([aria-disabled="true"]):not([tabindex="-1"])',
].join(', ');

const TV_FOCUSED_CLASS = 'tv-focused';

function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.closest('[aria-hidden="true"]')) return false;

  const style = window.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.pointerEvents === 'none' ||
    Number(style.opacity) === 0
  ) {
    return false;
  }

  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && el.getClientRects().length > 0;
}

function getTopmostModal(): HTMLElement | null {
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
  ).filter(isElementVisible);

  if (dialogs.length === 0) return null;
  return dialogs[dialogs.length - 1];
}

function getFocusableElements(scope: ParentNode): HTMLElement[] {
  const raw = Array.from(
    scope.querySelectorAll<HTMLElement>(TV_FOCUSABLE_SELECTOR),
  );
  return raw.filter(isElementVisible);
}

function isTextInputElement(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    return (
      type === 'text' ||
      type === 'search' ||
      type === 'password' ||
      type === 'email' ||
      type === 'url' ||
      type === 'tel' ||
      type === 'number'
    );
  }
  return false;
}

function toFocusRect(el: HTMLElement): FocusRect {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function pickInitialFocusTarget(scope: HTMLElement, preferMain: boolean): HTMLElement | null {
  const explicit = scope.querySelector<HTMLElement>('[data-tv-autofocus="true"]');
  if (explicit && isElementVisible(explicit)) {
    return explicit;
  }

  if (preferMain) {
    const mainEl = scope.querySelector<HTMLElement>('main');
    if (mainEl) {
      const mainFocusable = getFocusableElements(mainEl);
      if (mainFocusable.length > 0) {
        return mainFocusable[0];
      }
    }
  }

  const allFocusable = getFocusableElements(scope);
  return allFocusable[0] ?? null;
}

/**
 * Пространственная навигация с пульта (D-Pad) для Android TV / SberBox.
 * Активируется исключительно при isTvMode() === true и не влияет на десктоп/веб/PWA.
 */
export function useTvNavigation(): void {
  const tvEnabled = isTvMode();
  const location = useLocation();
  const navigate = useNavigate();

  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const preModalFocusRef = useRef<HTMLElement | null>(null);
  const activeModalRef = useRef<HTMLElement | null>(null);
  const pendingRouteAutofocusRef = useRef(false);
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    if (!tvEnabled || typeof document === 'undefined') return;

    document.body.classList.add('tv-mode');

    const applyFocus = (target: HTMLElement | null, scrollIntoView = true) => {
      if (!target || !isElementVisible(target)) return;

      if (lastFocusedRef.current && lastFocusedRef.current !== target) {
        lastFocusedRef.current.classList.remove(TV_FOCUSED_CLASS);
      }

      target.focus({ preventScroll: true });
      target.classList.add(TV_FOCUSED_CLASS);
      lastFocusedRef.current = target;

      if (scrollIntoView) {
        try {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest',
          });
        } catch {
          target.scrollIntoView();
        }
      }
    };

    const ensureFocusInActiveScope = (preferMain = true) => {
      const modal = getTopmostModal();
      const scope = modal ?? document.body;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (active && active !== document.body && scope.contains(active) && isElementVisible(active)) {
        if (lastFocusedRef.current && lastFocusedRef.current !== active) {
          lastFocusedRef.current.classList.remove(TV_FOCUSED_CLASS);
        }
        active.classList.add(TV_FOCUSED_CLASS);
        lastFocusedRef.current = active;
        return;
      }

      const target = pickInitialFocusTarget(scope, !modal && preferMain);
      if (target) {
        applyFocus(target, false);
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target || target === document.body) return;

      const modal = getTopmostModal();
      if (modal && !modal.contains(target)) {
        // Focus trap: не позволяем фокусу покинуть открытое модальное окно
        const modalTarget = pickInitialFocusTarget(modal, false);
        if (modalTarget) {
          applyFocus(modalTarget, false);
        }
        return;
      }

      if (lastFocusedRef.current && lastFocusedRef.current !== target) {
        lastFocusedRef.current.classList.remove(TV_FOCUSED_CLASS);
      }
      target.classList.add(TV_FOCUSED_CLASS);
      lastFocusedRef.current = target;
    };

    const handleFocusOut = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target) {
        target.classList.remove(TV_FOCUSED_CLASS);
      }
    };

    const moveFocusInDirection = (direction: TvDirection): boolean => {
      const modal = getTopmostModal();
      const scope = modal ?? document.body;
      const focusables = getFocusableElements(scope);
      if (focusables.length === 0) return false;

      const current =
        document.activeElement instanceof HTMLElement &&
        scope.contains(document.activeElement) &&
        isElementVisible(document.activeElement)
          ? document.activeElement
          : lastFocusedRef.current &&
              scope.contains(lastFocusedRef.current) &&
              isElementVisible(lastFocusedRef.current)
            ? lastFocusedRef.current
            : null;

      if (!current) {
        const first = pickInitialFocusTarget(scope, !modal);
        if (first) {
          applyFocus(first, true);
          return true;
        }
        return false;
      }

      const currentIndex = focusables.indexOf(current);
      const originRect = toFocusRect(current);
      const rects = focusables.map(toFocusRect);
      const nextIndex = findNextFocusableIndex(
        originRect,
        rects,
        direction,
        currentIndex,
      );

      if (nextIndex >= 0 && focusables[nextIndex]) {
        applyFocus(focusables[nextIndex], true);
        return true;
      }

      return false;
    };

    const handleBackAction = (event: KeyboardEvent) => {
      const modal = getTopmostModal();
      if (modal) {
        event.preventDefault();
        event.stopPropagation();
        const closeButton =
          modal.querySelector<HTMLElement>('[data-tv-modal-close="true"]') ??
          modal.querySelector<HTMLElement>('[data-testid="close-api-settings-button"]') ??
          modal.querySelector<HTMLElement>('button[aria-label*="Закрыть"]');
        if (closeButton && !closeButton.hasAttribute('disabled')) {
          closeButton.click();
        }
        return;
      }

      const currentPath = locationRef.current.pathname;
      if (currentPath !== '/') {
        event.preventDefault();
        event.stopPropagation();
        if (window.history.length > 1) {
          navigate(-1);
        } else {
          navigate('/');
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const action = mapKeyToTvAction(event.key, event.keyCode);
      if (!action) return;

      // Пользователь начал ручную навигацию пультом — отменяем отложенный автофокус маршрута
      pendingRouteAutofocusRef.current = false;

      const active =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const inTextInput = isTextInputElement(active);

      if (action === 'back') {
        // Внутри поля ввода Backspace удаляет символ, а Escape/BrowserBack выходит из поля или закрывает модалку
        if (inTextInput && (event.key === 'Backspace' || event.keyCode === 8)) {
          return;
        }
        handleBackAction(event);
        return;
      }

      if (action === 'select') {
        if (!active || active === document.body) {
          event.preventDefault();
          ensureFocusInActiveScope(true);
          return;
        }

        // Для input / textarea / select оставляем нативное поведение (ввод, отправка формы, раскрытие списка)
        if (
          inTextInput ||
          active instanceof HTMLSelectElement
        ) {
          return;
        }

        event.preventDefault();
        active.click();
        return;
      }

      // Стрелки D-Pad
      if (inTextInput) {
        // Внутри поля ввода стрелки влево/вправо двигают курсор; на самом правом краю ArrowRight переходит к кнопке рядом (например, показать ключ)
        if (action === 'left' || action === 'right') {
          const valLen = active.value.length;
          const selStart = active.selectionStart;
          const selEnd = active.selectionEnd;
          const atRightEdge =
            action === 'right' &&
            selStart !== null &&
            selEnd !== null &&
            selStart === valLen &&
            selEnd === valLen;
          const atLeftEdge =
            action === 'left' &&
            selStart === 0 &&
            selEnd === 0;

          if (!atRightEdge && !atLeftEdge) {
            return;
          }
          // Пробуем перейти к соседнему элементу в той же строке; если нет — остаёмся в поле
          const moved = moveFocusInDirection(action);
          if (moved) {
            event.preventDefault();
          }
          return;
        }

        // ArrowUp / ArrowDown всегда позволяют свободно выйти из поля ввода вверх или вниз
        event.preventDefault();
        moveFocusInDirection(action);
        return;
      }

      event.preventDefault();
      moveFocusInDirection(action);
    };

    // Отслеживаем открытие/закрытие модалок и удаление сфокусированных элементов
    let rafId: number | null = null;
    const syncScopeAfterMutation = () => {
      const currentModal = getTopmostModal();
      const prevModal = activeModalRef.current;

      if (currentModal && currentModal !== prevModal) {
        // Открылось модальное окно: запоминаем фокус и переводим его внутрь модалки
        if (!prevModal && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
          preModalFocusRef.current = document.activeElement;
        }
        activeModalRef.current = currentModal;
        const modalTarget = pickInitialFocusTarget(currentModal, false);
        if (modalTarget) {
          applyFocus(modalTarget, false);
        }
        return;
      }

      if (!currentModal && prevModal) {
        // Модальное окно закрылось: возвращаем фокус на предыдущий элемент или первый доступный
        activeModalRef.current = null;
        const restore = preModalFocusRef.current;
        preModalFocusRef.current = null;
        if (restore && isElementVisible(restore)) {
          applyFocus(restore, false);
        } else {
          ensureFocusInActiveScope(true);
        }
        return;
      }

      // Если маршрут недавно сменился и в <main> наконец загрузился контент (после скелетона) — переводим фокус туда
      if (!currentModal && pendingRouteAutofocusRef.current) {
        const mainEl = document.querySelector<HTMLElement>('main');
        if (mainEl) {
          const explicit = mainEl.querySelector<HTMLElement>('[data-tv-autofocus="true"]');
          const candidate =
            explicit && isElementVisible(explicit)
              ? explicit
              : getFocusableElements(mainEl)[0] ?? null;
          if (candidate) {
            pendingRouteAutofocusRef.current = false;
            applyFocus(candidate, false);
            return;
          }
        }
      }

      // Если сфокусированный элемент исчез из DOM (например, завершилась загрузка скелетона), восстанавливаем фокус
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const scope = currentModal ?? document.body;
      if (!active || active === document.body || !scope.contains(active) || !isElementVisible(active)) {
        ensureFocusInActiveScope(true);
      }
    };

    const observer = new MutationObserver(() => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        syncScopeAfterMutation();
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);

    // Начальный фокус при запуске приложения
    const initTimer = window.setTimeout(() => {
      syncScopeAfterMutation();
      ensureFocusInActiveScope(true);
    }, 60);

    return () => {
      window.clearTimeout(initTimer);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      if (lastFocusedRef.current) {
        lastFocusedRef.current.classList.remove(TV_FOCUSED_CLASS);
      }
      document.body.classList.remove('tv-mode');
    };
  }, [tvEnabled, navigate]);

  // Автоматический перевод фокуса на первый доступный элемент при смене маршрута
  useEffect(() => {
    if (!tvEnabled || typeof document === 'undefined') return;

    pendingRouteAutofocusRef.current = true;

    const focusRouteStart = () => {
      const modal = getTopmostModal();
      if (modal) {
        pendingRouteAutofocusRef.current = false;
        const modalTarget = pickInitialFocusTarget(modal, false);
        if (modalTarget) {
          if (lastFocusedRef.current && lastFocusedRef.current !== modalTarget) {
            lastFocusedRef.current.classList.remove(TV_FOCUSED_CLASS);
          }
          modalTarget.focus({ preventScroll: true });
          modalTarget.classList.add(TV_FOCUSED_CLASS);
          lastFocusedRef.current = modalTarget;
        }
        return;
      }

      const mainEl = document.querySelector<HTMLElement>('main');
      const mainExplicit = mainEl?.querySelector<HTMLElement>('[data-tv-autofocus="true"]') ?? null;
      const mainTarget =
        mainExplicit && isElementVisible(mainExplicit)
          ? mainExplicit
          : mainEl
            ? getFocusableElements(mainEl)[0] ?? null
            : null;

      if (mainTarget) {
        pendingRouteAutofocusRef.current = false;
        if (lastFocusedRef.current && lastFocusedRef.current !== mainTarget) {
          lastFocusedRef.current.classList.remove(TV_FOCUSED_CLASS);
        }
        mainTarget.focus({ preventScroll: true });
        mainTarget.classList.add(TV_FOCUSED_CLASS);
        lastFocusedRef.current = mainTarget;
        return;
      }

      const fallback = pickInitialFocusTarget(document.body, false);
      if (fallback) {
        if (lastFocusedRef.current && lastFocusedRef.current !== fallback) {
          lastFocusedRef.current.classList.remove(TV_FOCUSED_CLASS);
        }
        fallback.focus({ preventScroll: true });
        fallback.classList.add(TV_FOCUSED_CLASS);
        lastFocusedRef.current = fallback;
      }
    };

    const frameId = window.requestAnimationFrame(focusRouteStart);
    const fallbackTimer = window.setTimeout(focusRouteStart, 180);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(fallbackTimer);
    };
  }, [tvEnabled, location.pathname, location.search]);
}
