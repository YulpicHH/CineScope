import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  removeWatchingEntry,
  serializeLibraryState,
  setTitleRating,
  toggleFavoriteItem,
} from '../utils/libraryRules';

interface ToastMessage {
  id: number;
  text: string;
}

interface ToastContextValue {
  toast: ToastMessage | null;
  dismissToast: () => void;
}

interface LibraryContextValue {
  items: LibraryItem[];
  watchingItems: LibraryItem[];
  watchlistItems: LibraryItem[];
  watchedItems: LibraryItem[];
  favoriteItems: LibraryItem[];
  recommendationProfile: ReturnType<typeof buildRecommendationProfile>;
  getEntry: (id: number, mediaType: MediaType) => LibraryItem | undefined;
  setStatus: (media: MediaItem, nextStatus: LibraryStatus | null) => void;
  markWatching: (media: MediaItem) => void;
  removeFromWatching: (media: MediaItem) => void;
  toggleWatchlist: (media: MediaItem) => void;
  markWatched: (media: MediaItem) => void;
  toggleFavorite: (media: MediaItem) => void;
  rateTitle: (media: MediaItem, rating: number | null) => void;
  removeHistoryEntry: (id: number, mediaType: MediaType) => void;
  clearAllData: () => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);
const ToastContext = createContext<ToastContextValue | null>(null);

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
  const itemsRef = useRef<LibraryItem[]>(state.items);
  itemsRef.current = state.items;

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

  const entryMap = useMemo(() => {
    const map = new Map<string, LibraryItem>();
    for (const item of state.items) {
      map.set(`${item.mediaType}:${item.id}`, item);
    }
    return map;
  }, [state.items]);

  const getEntry = useCallback(
    (id: number, mediaType: MediaType) => entryMap.get(`${mediaType}:${id}`),
    [entryMap],
  );

  const setStatus = useCallback(
    (media: MediaItem, nextStatus: LibraryStatus | null) => {
      setState((prev) => ({
        ...prev,
        items: applyTitleStatus(prev.items, media, nextStatus),
      }));
      if (nextStatus === 'watching') showToast(`«${media.title}» добавлен в «В процессе»`);
      else if (nextStatus === 'watchlist') showToast(`«${media.title}» добавлен в «Посмотреть позже»`);
      else if (nextStatus === 'watched') showToast(`«${media.title}» отмечен как просмотренный`);
      else showToast(`Статус для «${media.title}» снят`);
    },
    [showToast],
  );

  const markWatching = useCallback(
    (media: MediaItem) => {
      const existing = itemsRef.current.find(
        (item) => item.id === media.id && item.mediaType === media.mediaType,
      );
      setState((prev) => ({
        ...prev,
        items: applyTitleStatus(prev.items, media, 'watching'),
      }));
      if (existing?.status !== 'watching') {
        showToast(`«${media.title}» добавлен в «В процессе»`);
      }
    },
    [showToast],
  );

  const removeFromWatching = useCallback(
    (media: MediaItem) => {
      setState((prev) => ({
        ...prev,
        items: removeWatchingEntry(prev.items, media.id, media.mediaType),
      }));
      showToast(`«${media.title}» убран из «В процессе»`);
    },
    [showToast],
  );

  const toggleWatchlist = useCallback(
    (media: MediaItem) => {
      const existing = itemsRef.current.find(
        (item) => item.id === media.id && item.mediaType === media.mediaType,
      );
      const next = existing?.status === 'watchlist' ? null : 'watchlist';
      setStatus(media, next);
    },
    [setStatus],
  );

  const markWatched = useCallback(
    (media: MediaItem) => {
      const existing = itemsRef.current.find(
        (item) => item.id === media.id && item.mediaType === media.mediaType,
      );
      const next = existing?.status === 'watched' ? null : 'watched';
      setStatus(media, next);
    },
    [setStatus],
  );

  const toggleFavorite = useCallback(
    (media: MediaItem) => {
      const existing = itemsRef.current.find(
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
    [showToast],
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

  const watchingItems = useMemo(
    () => state.items.filter((i) => i.status === 'watching'),
    [state.items],
  );
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

  const libraryValue = useMemo<LibraryContextValue>(
    () => ({
      items: state.items,
      watchingItems,
      watchlistItems,
      watchedItems,
      favoriteItems,
      recommendationProfile,
      getEntry,
      setStatus,
      markWatching,
      removeFromWatching,
      toggleWatchlist,
      markWatched,
      toggleFavorite,
      rateTitle,
      removeHistoryEntry,
      clearAllData,
    }),
    [
      state.items,
      watchingItems,
      watchlistItems,
      watchedItems,
      favoriteItems,
      recommendationProfile,
      getEntry,
      setStatus,
      markWatching,
      removeFromWatching,
      toggleWatchlist,
      markWatched,
      toggleFavorite,
      rateTitle,
      removeHistoryEntry,
      clearAllData,
    ],
  );

  const toastValue = useMemo<ToastContextValue>(
    () => ({ toast, dismissToast }),
    [toast, dismissToast],
  );

  return (
    <LibraryContext.Provider value={libraryValue}>
      <ToastContext.Provider value={toastValue}>{children}</ToastContext.Provider>
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

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast должен использоваться внутри LibraryProvider');
  }
  return ctx;
}
