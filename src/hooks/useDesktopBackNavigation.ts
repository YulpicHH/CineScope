import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  detectClientPlatform,
  detectPlatformFromStrings,
  isTvMode,
  type DesktopPlatform,
} from '../utils/platform';
import {
  isMouseBackButton,
  shouldHandleDesktopBackShortcut,
} from '../utils/routeViewCache';

function resolveCurrentPlatform(): DesktopPlatform {
  const detected = detectClientPlatform();
  if (detected !== 'web') return detected;
  if (typeof navigator === 'undefined') return 'web';
  return detectPlatformFromStrings(
    navigator.platform ?? '',
    navigator.userAgent ?? '',
  );
}

function hasInAppBackHistory(): boolean {
  if (typeof window === 'undefined') return false;
  const state = window.history.state as { idx?: number } | null;
  if (typeof state?.idx === 'number') {
    return state.idx > 0;
  }
  return window.history.length > 1;
}

/**
 * Десктопная навигация «Назад» для Windows и macOS (Tauri WebView2 / WKWebView и браузер):
 * - Отключает авто-сброс скролла браузером (`history.scrollRestoration = 'manual'`), чтобы
 *   страницы восстанавливали точную сохранённую позицию без скачка вверх.
 * - Поддерживает Windows `Alt + ArrowLeft`, macOS `Cmd + [` / `Cmd + ArrowLeft`
 *   и боковую кнопку мыши «Назад».
 */
export function useDesktopBackNavigation(): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual';
      }
    } catch {
      // Игнорируем ограничения встроенного WebView
    }
  }, []);

  useEffect(() => {
    if (isTvMode() || typeof window === 'undefined') return;

    const platform = resolveCurrentPlatform();

    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (
        !shouldHandleDesktopBackShortcut(
          event,
          platform,
          active?.tagName,
          Boolean(active?.isContentEditable),
        )
      ) {
        return;
      }

      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      if (!hasInAppBackHistory()) {
        return;
      }

      event.preventDefault();
      navigate(-1);
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (!isMouseBackButton(event.button)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      if (!hasInAppBackHistory()) return;

      event.preventDefault();
      navigate(-1);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [navigate]);
}
