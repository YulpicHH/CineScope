import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearStoredApiKeys,
  getEffectiveKinopoiskKey,
  getEffectiveTmdbKey,
  getStoredApiKeys,
  saveStoredApiKeys,
  subscribeApiKeys,
} from '../services/apiKeys';
import { clearKinopoiskClientCache } from '../services/kinopoisk';
import {
  DEMO_MODE_STORAGE_KEY,
  resolveAppModeState,
  type ApiKeySource,
  type StoredApiKeys,
} from '../utils/apiKeysRules';

interface AppModeContextValue {
  hasApiKey: boolean;
  hasUserKeys: boolean;
  hasKinopoiskKey: boolean;
  tmdbKeySource: ApiKeySource;
  userTmdbApiKey: string;
  userKinopoiskApiKey: string;
  keysVersion: number;
  isDemoMode: boolean;
  needsSetup: boolean;
  settingsModalOpen: boolean;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  saveApiKeys: (next: StoredApiKeys, options?: { keepOpen?: boolean }) => void;
  clearApiKeys: () => void;
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
    return localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [storedKeys, setStoredKeys] = useState<StoredApiKeys>(getStoredApiKeys);
  const [keysVersion, setKeysVersion] = useState(0);
  const [demoChoice, setDemoChoice] = useState<boolean>(readInitialDemoFlag);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  useEffect(() => {
    return subscribeApiKeys(() => {
      setStoredKeys(getStoredApiKeys());
      setKeysVersion((v) => v + 1);
    });
  }, []);

  const effectiveTmdb = useMemo(
    () => getEffectiveTmdbKey(),
    // Пересчитываем при каждом обновлении пользовательских ключей
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storedKeys, keysVersion],
  );
  const effectiveKinopoisk = useMemo(
    () => getEffectiveKinopoiskKey(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storedKeys, keysVersion],
  );

  const modeState = useMemo(
    () =>
      resolveAppModeState({
        effectiveTmdbKey: effectiveTmdb.value,
        demoChosen: demoChoice,
      }),
    [effectiveTmdb.value, demoChoice],
  );

  const hasUserKeys = Boolean(
    storedKeys.tmdbApiKey || storedKeys.kinopoiskApiKey,
  );
  const hasKinopoiskKey = effectiveKinopoisk.value.length > 0;

  const openSettingsModal = useCallback(() => {
    setSettingsModalOpen(true);
  }, []);

  const closeSettingsModal = useCallback(() => {
    setSettingsModalOpen(false);
  }, []);

  const enterDemoMode = useCallback(() => {
    setDemoChoice(true);
    setSettingsModalOpen(false);
    try {
      localStorage.setItem(DEMO_MODE_STORAGE_KEY, 'true');
    } catch {
      // игнорируем ошибку localStorage
    }
  }, []);

  const exitDemoMode = useCallback(() => {
    setSettingsModalOpen(true);
  }, []);

  const saveApiKeys = useCallback(
    (next: StoredApiKeys, options?: { keepOpen?: boolean }) => {
      const prevKp = getStoredApiKeys().kinopoiskApiKey;
      const saved = saveStoredApiKeys(next);
      if (prevKp !== saved.kinopoiskApiKey) {
        clearKinopoiskClientCache();
      }
      if (saved.tmdbApiKey) {
        setDemoChoice(false);
        try {
          localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
        } catch {
          // игнорируем ошибку localStorage
        }
      }
      if (options?.keepOpen) {
        setSettingsModalOpen(true);
      } else {
        setSettingsModalOpen(false);
      }
    },
    [],
  );

  const clearApiKeys = useCallback(() => {
    clearStoredApiKeys();
    clearKinopoiskClientCache();
  }, []);

  const value = useMemo<AppModeContextValue>(
    () => ({
      hasApiKey: modeState.hasApiKey,
      hasUserKeys,
      hasKinopoiskKey,
      tmdbKeySource: effectiveTmdb.source,
      userTmdbApiKey: storedKeys.tmdbApiKey,
      userKinopoiskApiKey: storedKeys.kinopoiskApiKey,
      keysVersion,
      isDemoMode: modeState.isDemoMode,
      needsSetup: modeState.needsSetup,
      settingsModalOpen,
      openSettingsModal,
      closeSettingsModal,
      saveApiKeys,
      clearApiKeys,
      enterDemoMode,
      exitDemoMode,
    }),
    [
      modeState.hasApiKey,
      modeState.isDemoMode,
      modeState.needsSetup,
      hasUserKeys,
      hasKinopoiskKey,
      effectiveTmdb.source,
      storedKeys.tmdbApiKey,
      storedKeys.kinopoiskApiKey,
      keysVersion,
      settingsModalOpen,
      openSettingsModal,
      closeSettingsModal,
      saveApiKeys,
      clearApiKeys,
      enterDemoMode,
      exitDemoMode,
    ],
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
