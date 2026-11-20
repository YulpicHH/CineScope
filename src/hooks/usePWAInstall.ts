import { useCallback, useEffect, useState } from 'react';
import {
  isIOSSafariUserAgent,
  isStandalonePwa,
  isTauriRuntime,
} from '../utils/platform';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PWAInstallState {
  isStandalone: boolean;
  isIOSSafari: boolean;
  canPromptInstall: boolean;
  triggerInstall: () => Promise<boolean>;
}

export function usePWAInstall(): PWAInstallState {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() =>
    isStandalonePwa(),
  );
  const [isIOSSafari, setIsIOSSafari] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined' || isTauriRuntime()) {
      return;
    }

    const standalone = isStandalonePwa();
    setIsStandalone(standalone);

    const ua = window.navigator.userAgent ?? '';
    const maxTouchPoints = window.navigator.maxTouchPoints ?? 0;
    setIsIOSSafari(!standalone && isIOSSafariUserAgent(ua, maxTouchPoints));

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setIsIOSSafari(false);
      setDeferredPrompt(null);
    };

    const mediaQuery = window.matchMedia?.('(display-mode: standalone)');
    const handleDisplayModeChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsStandalone(true);
        setIsIOSSafari(false);
        setDeferredPrompt(null);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    mediaQuery?.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery?.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const triggerInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsStandalone(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  return {
    isStandalone,
    isIOSSafari,
    canPromptInstall: !isStandalone && !isTauriRuntime() && Boolean(deferredPrompt),
    triggerInstall,
  };
}
