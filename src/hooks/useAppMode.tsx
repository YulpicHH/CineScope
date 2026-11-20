import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { hasTmdbKey } from '../services/tmdb';

const DEMO_STORAGE_KEY = 'cinescope_demo_mode';

interface AppModeContextValue {
  hasApiKey: boolean;
  isDemoMode: boolean;
  needsSetup: boolean;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
}

const AppModeContext = createContext<AppModeContextValue | null>(null);

function readInitialDemoFlag(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      return true;
    }
    return localStorage.getItem(DEMO_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function AppModeProvider({ children }: { children: ReactNode }) {
  const hasApiKey = hasTmdbKey();
  const [demoChoice, setDemoChoice] = useState<boolean>(readInitialDemoFlag);

  const isDemoMode = !hasApiKey && demoChoice;
  const needsSetup = !hasApiKey && !demoChoice;

  const enterDemoMode = useCallback(() => {
    setDemoChoice(true);
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, 'true');
    } catch {
      // игнорируем ошибку localStorage
    }
  }, []);

  const exitDemoMode = useCallback(() => {
    setDemoChoice(false);
    try {
      localStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      // игнорируем ошибку localStorage
    }
  }, []);

  const value = useMemo<AppModeContextValue>(
    () => ({
      hasApiKey,
      isDemoMode,
      needsSetup,
      enterDemoMode,
      exitDemoMode,
    }),
    [hasApiKey, isDemoMode, needsSetup, enterDemoMode, exitDemoMode],
  );

  return (
    <AppModeContext.Provider value={value}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode(): AppModeContextValue {
  const ctx = useContext(AppModeContext);
  if (!ctx) {
    throw new Error('useAppMode должен использоваться внутри AppModeProvider');
  }
  return ctx;
}
