import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isTvMode } from '../utils/platform';
import {
  findNextFocusableIndex,
  mapKeyToTvAction,
  shouldAcceptTvKeyEvent,
  type FocusRect,
  type TvDirection,
  type TvRemoteAction,
} from '../utils/tvSpatialNav';

const TV_FOCUSABLE_SELECTOR = [
  'button:not([disabled]):not([tabindex="-1"])',
  'a[href]:not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[data-tv-focusable="true"]:not([aria-disabled="true"]):not([tabindex="-1"])',
].join(', ');

const TEXT_INPUT_SELECTOR = [
  'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"])',
  'textarea:not([disabled])',
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

function isTextInputElement(
  el: Element | null,
): el is HTMLInputElement | HTMLTextAreaElement {
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

function lockInputForTvBrowse(el: HTMLInputElement | HTMLTextAreaElement): void {
  if (el.dataset.tvManagedInput !== 'true') {
    el.dataset.tvManagedInput = 'true';
    el.dataset.tvOrigInputMode = el.getAttribute('inputmode') ?? '';
    el.dataset.tvOrigReadOnly = el.readOnly ? 'true' : 'false';
  }
  el.readOnly = true;
  el.setAttribute('inputmode', 'none');
  el.dataset.tvEditing = 'false';
}

function unlockInputForTvEdit(el: HTMLInputElement | HTMLTextAreaElement): void {
  if (el.dataset.tvManagedInput !== 'true') {
    el.dataset.tvManagedInput = 'true';
    el.dataset.tvOrigInputMode = el.getAttribute('inputmode') ?? '';
    el.dataset.tvOrigReadOnly = el.readOnly ? 'true' : 'false';
  }
  el.readOnly = false;
  const origInputMode = el.dataset.tvOrigInputMode;
  if (origInputMode) {
    el.setAttribute('inputmode', origInputMode);
  } else if (el instanceof HTMLInputElement && el.type.toLowerCase() === 'search') {
    el.setAttribute('inputmode', 'search');
  } else {
    el.removeAttribute('inputmode');
  }
  el.dataset.tvEditing = 'true';
}

function restoreManagedInputs(): void {
  const managed = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    '[data-tv-managed-input="true"]',
  );
  for (const el of managed) {
    el.readOnly = el.dataset.tvOrigReadOnly === 'true';
    const origMode = el.dataset.tvOrigInputMode;
    if (origMode) {
      el.setAttribute('inputmode', origMode);
    } else {
      el.removeAttribute('inputmode');
    }
    delete el.dataset.tvManagedInput;
    delete el.dataset.tvOrigInputMode;
    delete el.dataset.tvOrigReadOnly;
    delete el.dataset.tvEditing;
  }
}

function pickInitialFocusTarget(
  scope: HTMLElement,
  preferMain: boolean,
): HTMLElement | null {
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
 * Поддерживает двухфазный режим текстовых полей:
 * — Browse Mode: при наведении стрелками клавиатура НЕ открывается;
 * — Edit Mode: открывается только по нажатию «ОК» (Enter / DPAD_CENTER),
 *   а «Назад» (Escape/Back) или подтверждение поиска возвращает поле в Browse Mode.
 * Активируется исключительно при isTvMode() === true и не влияет на десктоп/веб/PWA.
 */
export function useTvNavigation(): void {
  const tvEnabled = isTvMode();
  const location = useLocation();
  const navigate = useNavigate();

  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const preModalFocusRef = useRef<HTMLElement | null>(null);
  const activeModalRef = useRef<HTMLElement | null>(null);
  const editingInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const pendingRouteAutofocusRef = useRef(false);
  const lastKeyActionRef = useRef<TvRemoteAction>(null);
  const lastKeyTimeRef = useRef(0);
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    if (!tvEnabled || typeof document === 'undefined') return;

    document.body.classList.add('tv-mode');

    const syncAllInputsBrowseLock = () => {
      const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        TEXT_INPUT_SELECTOR,
      );
      for (const el of inputs) {
        if (!isTextInputElement(el)) continue;
        if (editingInputRef.current === el) continue;
        lockInputForTvBrowse(el);
      }
    };

    const enterTvInputEditMode = (el: HTMLInputElement | HTMLTextAreaElement) => {
      if (editingInputRef.current && editingInputRef.current !== el) {
        lockInputForTvBrowse(editingInputRef.current);
      }
      editingInputRef.current = el;
      unlockInputForTvEdit(el);

      if (lastFocusedRef.current && lastFocusedRef.current !== el) {
        lastFocusedRef.current.classList.remove(TV_FOCUSED_CLASS);
      }
      el.classList.add(TV_FOCUSED_CLASS);
      lastFocusedRef.current = el;

      // Повторный focus + click внутри пользовательского нажатия ОК гарантированно поднимает IME на Android TV
      el.focus({ preventScroll: true });
      try {
        el.click();
      } catch {
        // Игнорируем ограничения браузера
      }
      try {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } catch {
        // Некоторые типы input не поддерживают setSelectionRange
      }
    };

    const exitTvInputEditMode = (
      el: HTMLInputElement | HTMLTextAreaElement,
      keepFocus: boolean,
    ) => {
      if (editingInputRef.current === el) {
        editingInputRef.current = null;
      }
      lockInputForTvBrowse(el);
      el.blur();

      if (keepFocus && el.isConnected && isElementVisible(el)) {
        // Возвращаем фокус на это же поле в Browse Mode (readOnly + inputMode="none"),
        // чтобы рамка фокуса осталась на поле, а экранная клавиатура скрылась
        el.focus({ preventScroll: true });
        el.classList.add(TV_FOCUSED_CLASS);
        lastFocusedRef.current = el;
      }
    };

    const applyFocus = (target: HTMLElement | null, scrollIntoView = true) => {
      if (!target || !isElementVisible(target)) return;

      if (editingInputRef.current && editingInputRef.current !== target) {
        lockInputForTvBrowse(editingInputRef.current);
        editingInputRef.current = null;
      }

      // Перед переводом фокуса стрелками на текстовое поле обязательно переводим его в Browse Mode,
      // чтобы Android WebView НЕ открывал экранную клавиатуру автоматически
      if (isTextInputElement(target) && editingInputRef.current !== target) {
        lockInputForTvBrowse(target);
      }

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
      const active =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (
        active &&
        active !== document.body &&
        scope.contains(active) &&
        isElementVisible(active)
      ) {
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

      if (isTextInputElement(target) && editingInputRef.current !== target) {
        lockInputForTvBrowse(target);
      }

      if (lastFocusedRef.current && lastFocusedRef.current !== target) {
        lastFocusedRef.current.classList.remove(TV_FOCUSED_CLASS);
      }
      target.classList.add(TV_FOCUSED_CLASS);
      lastFocusedRef.current = target;
    };

    const handleFocusOut = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;

      target.classList.remove(TV_FOCUSED_CLASS);

      const editing = editingInputRef.current;
      if (editing && editing === target) {
        const nextFocus =
          event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
        if (nextFocus !== editing) {
          editingInputRef.current = null;
          lockInputForTvBrowse(editing);
        }
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && isTextInputElement(target)) {
        enterTvInputEditMode(target);
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
        event.stopImmediatePropagation();
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
        event.stopImmediatePropagation();
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

      const now = performance.now();
      if (
        !shouldAcceptTvKeyEvent(
          action,
          event.repeat,
          lastKeyActionRef.current,
          lastKeyTimeRef.current,
          now,
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      lastKeyActionRef.current = action;
      lastKeyTimeRef.current = now;

      // Пользователь начал ручную навигацию пультом — отменяем отложенный автофокус маршрута
      pendingRouteAutofocusRef.current = false;

      const active =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const activeTextInput = isTextInputElement(active) ? active : null;
      const isEditing =
        activeTextInput !== null &&
        editingInputRef.current === activeTextInput &&
        activeTextInput.dataset.tvEditing === 'true';

      // --- Обработка внутри текстового поля в режиме ВВОДА (Edit Mode) ---
      if (activeTextInput && isEditing) {
        if (action === 'back') {
          // Backspace удаляет символы внутри поля ввода
          if (event.key === 'Backspace' || event.keyCode === 8) {
            return;
          }
          // Escape / кнопка «Назад» на пульте скрывает клавиатуру и возвращает поле в Browse Mode
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          exitTvInputEditMode(activeTextInput, true);
          return;
        }

        if (action === 'select') {
          // Нажатие «Готово» / Enter завершает ввод и скрывает экранную клавиатуру, оставляя фокус на поле
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          exitTvInputEditMode(activeTextInput, true);
          return;
        }

        if (action === 'up' || action === 'down') {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          exitTvInputEditMode(activeTextInput, false);
          moveFocusInDirection(action);
          return;
        }

        // Влево/вправо в режиме редактирования двигают текстовый курсор внутри строки
        return;
      }

      // --- Обработка вне режима редактирования (включая Browse Mode текстовых полей) ---
      if (action === 'back') {
        handleBackAction(event);
        return;
      }

      if (action === 'select') {
        if (!active || active === document.body) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          ensureFocusInActiveScope(true);
          return;
        }

        if (activeTextInput) {
          // Только осознанное нажатие «ОК» переводит поле в режим редактирования и открывает клавиатуру
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          enterTvInputEditMode(activeTextInput);
          return;
        }

        if (active instanceof HTMLSelectElement) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        active.click();
        return;
      }

      // Стрелки D-Pad (включая свободный уход с текстового поля в Browse Mode)
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      moveFocusInDirection(action);
    };

    // Отслеживаем открытие/закрытие модалок, появление новых полей ввода и удаление сфокусированных элементов
    let rafId: number | null = null;
    const syncScopeAfterMutation = () => {
      syncAllInputsBrowseLock();

      const currentModal = getTopmostModal();
      const prevModal = activeModalRef.current;

      if (currentModal && currentModal !== prevModal) {
        if (editingInputRef.current) {
          lockInputForTvBrowse(editingInputRef.current);
          editingInputRef.current = null;
        }
        if (
          !prevModal &&
          document.activeElement instanceof HTMLElement &&
          document.activeElement !== document.body
        ) {
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
        if (editingInputRef.current) {
          lockInputForTvBrowse(editingInputRef.current);
          editingInputRef.current = null;
        }
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

      // Если пользователь прямо сейчас набирает текст в живом поле ввода — никогда не крадём у него фокус
      if (
        editingInputRef.current &&
        editingInputRef.current.isConnected &&
        isElementVisible(editingInputRef.current)
      ) {
        return;
      }

      // Если маршрут недавно сменился и в <main> наконец загрузился контент (после скелетона) — переводим фокус туда
      if (!currentModal && pendingRouteAutofocusRef.current) {
        const mainEl = document.querySelector<HTMLElement>('main');
        if (mainEl) {
          const explicit = mainEl.querySelector<HTMLElement>(
            '[data-tv-autofocus="true"]',
          );
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

      const active =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const scope = currentModal ?? document.body;
      if (
        !active ||
        active === document.body ||
        !scope.contains(active) ||
        !isElementVisible(active)
      ) {
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
    document.addEventListener('pointerdown', handlePointerDown, true);

    syncAllInputsBrowseLock();

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
      document.removeEventListener('pointerdown', handlePointerDown, true);
      editingInputRef.current = null;
      restoreManagedInputs();
      if (lastFocusedRef.current) {
        lastFocusedRef.current.classList.remove(TV_FOCUSED_CLASS);
      }
      document.body.classList.remove('tv-mode');
    };
  }, [tvEnabled, navigate]);

  // Автоматический перевод фокуса только при реальной смене маршрута (location.pathname),
  // но НИКОГДА при обновлении фильтров/поиска в location.search!
  useEffect(() => {
    if (!tvEnabled || typeof document === 'undefined') return;

    pendingRouteAutofocusRef.current = true;

    const focusRouteStart = () => {
      // Если пользователь уже вводит текст или взаимодействует с элементом внутри <main> — не сбрасываем фокус
      if (
        editingInputRef.current &&
        editingInputRef.current.isConnected &&
        isElementVisible(editingInputRef.current)
      ) {
        pendingRouteAutofocusRef.current = false;
        return;
      }

      const modal = getTopmostModal();
      if (modal) {
        pendingRouteAutofocusRef.current = false;
        const modalTarget = pickInitialFocusTarget(modal, false);
        if (modalTarget) {
          if (isTextInputElement(modalTarget)) {
            lockInputForTvBrowse(modalTarget);
          }
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
      const active =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (mainEl && active && mainEl.contains(active) && isElementVisible(active)) {
        pendingRouteAutofocusRef.current = false;
        return;
      }

      const mainExplicit =
        mainEl?.querySelector<HTMLElement>('[data-tv-autofocus="true"]') ?? null;
      const mainTarget =
        mainExplicit && isElementVisible(mainExplicit)
          ? mainExplicit
          : mainEl
            ? getFocusableElements(mainEl)[0] ?? null
            : null;

      if (mainTarget) {
        pendingRouteAutofocusRef.current = false;
        if (isTextInputElement(mainTarget)) {
          lockInputForTvBrowse(mainTarget);
        }
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
        if (isTextInputElement(fallback)) {
          lockInputForTvBrowse(fallback);
        }
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
  }, [tvEnabled, location.pathname]);
}
