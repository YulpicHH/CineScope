import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { LibraryItem, LibraryStateV1, LibraryStatus, MediaItem, MediaType } from '../types';
import {
  applyTitleStatus,
  buildRecommendationProfile,
  createEmptyLibraryState,
  LIBRARY_STORAGE_KEY,
  parseLibraryStorage,
  removeWatchedHistoryEntry,
  serializeLibraryState,
  setTitleRating,
  toggleFavoriteItem,
} from '../utils/libraryRules';

interface ToastMessage {
  id: number;
  text: string;
}

interface LibraryContextValue {
  items: LibraryItem[];
  watchlistItems: LibraryItem[];
  watchedItems: LibraryItem[];
  favoriteItems: LibraryItem[];
  recommendationProfile: ReturnType<typeof buildRecommendationProfile>;
  getEntry: (id: number, mediaType: MediaType) => LibraryItem | undefined;
  setStatus: (media: MediaItem, nextStatus: LibraryStatus | null) => void;
  toggleWatchlist: (media: MediaItem) => void;
  markWatched: (media: MediaItem) => void;
  toggleFavorite: (media: MediaItem) => void;
  rateTitle: (media: MediaItem, rating: number | null) => void;
  removeHistoryEntry: (id: number, mediaType: MediaType) => void;
  clearAllData: () => void;
  toast: ToastMessage | null;
  dismissToast: () => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

function loadInitialLibrary(): LibraryStateV1 {
  try {
    return parseLibraryStorage(localStorage.getItem(LIBRARY_STORAGE_KEY));
  } catch {
    return createEmptyLibraryState();
  }
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LibraryStateV1>(loadInitialLibrary);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LIBRARY_STORAGE_KEY, serializeLibraryState(state));
    } catch {
      // игнорируем квоту/ошибки записи localStorage
    }
  }, [state]);

  const showToast = useCallback((text: string) => {
    setToast({ id: Date.now(), text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const dismissToast = useCallback(() => setToast(null), []);

  const getEntry = useCallback(
    (id: number, mediaType: MediaType) =>
      state.items.find((item) => item.id === id && item.mediaType === mediaType),
    [state.items],
  );

  const setStatus = useCallback(
    (media: MediaItem, nextStatus: LibraryStatus | null) => {
      setState((prev) => ({
        ...prev,
        items: applyTitleStatus(prev.items, media, nextStatus),
      }));
      if (nextStatus === 'watchlist') showToast(`«${media.title}» добавлен в «Посмотреть позже»`);
      else if (nextStatus === 'watched') showToast(`«${media.title}» отмечен как просмотренный`);
      else showToast(`Статус для «${media.title}» снят`);
    },
    [showToast],
  );

  const toggleWatchlist = useCallback(
    (media: MediaItem) => {
      const existing = state.items.find(
        (item) => item.id === media.id && item.mediaType === media.mediaType,
      );
      const next = existing?.status === 'watchlist' ? null : 'watchlist';
      setStatus(media, next);
    },
    [state.items, setStatus],
  );

  const markWatched = useCallback(
    (media: MediaItem) => {
      const existing = state.items.find(
        (item) => item.id === media.id && item.mediaType === media.mediaType,
      );
      const next = existing?.status === 'watched' ? null : 'watched';
      setStatus(media, next);
    },
    [state.items, setStatus],
  );

  const toggleFavorite = useCallback(
    (media: MediaItem) => {
      const existing = state.items.find(
        (item) => item.id === media.id && item.mediaType === media.mediaType,
      );
      const willBeFav = !existing?.isFavorite;
      setState((prev) => ({
        ...prev,
        items: toggleFavoriteItem(prev.items, media),
      }));
      showToast(
        willBeFav
          ? `«${media.title}» добавлен в избранное`
          : `«${media.title}» убран из избранного`,
      );
    },
    [state.items, showToast],
  );

  const rateTitle = useCallback(
    (media: MediaItem, rating: number | null) => {
      setState((prev) => ({
        ...prev,
        items: setTitleRating(prev.items, media, rating),
      }));
      if (rating !== null) {
        showToast(`Оценка ${rating}/10 сохранена для «${media.title}»`);
      }
    },
    [showToast],
  );

  const removeHistoryEntry = useCallback(
    (id: number, mediaType: MediaType) => {
      setState((prev) => ({
        ...prev,
        items: removeWatchedHistoryEntry(prev.items, id, mediaType),
      }));
      showToast('Запись удалена из истории просмотров');
    },
    [showToast],
  );

  const clearAllData = useCallback(() => {
    setState(createEmptyLibraryState());
    try {
      localStorage.removeItem(LIBRARY_STORAGE_KEY);
    } catch {
      // игнорируем
    }
    showToast('Локальная библиотека и история очищены');
  }, [showToast]);

  const watchlistItems = useMemo(
    () => state.items.filter((i) => i.status === 'watchlist'),
    [state.items],
  );
  const watchedItems = useMemo(
    () => state.items.filter((i) => i.status === 'watched'),
    [state.items],
  );
  const favoriteItems = useMemo(
    () => state.items.filter((i) => i.isFavorite),
    [state.items],
  );

  const recommendationProfile = useMemo(
    () => buildRecommendationProfile(state.items),
    [state.items],
  );

  return (
    <LibraryContext.Provider
      value={{
        items: state.items,
        watchlistItems,
        watchedItems,
        favoriteItems,
        recommendationProfile,
        getEntry,
        setStatus,
        toggleWatchlist,
        markWatched,
        toggleFavorite,
        rateTitle,
        removeHistoryEntry,
        clearAllData,
        toast,
        dismissToast,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error('useLibrary должен использоваться внутри LibraryProvider');
  }
  return ctx;
}
