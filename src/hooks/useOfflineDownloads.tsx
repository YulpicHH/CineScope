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
import type { MediaItem, MediaType } from '../types';
import {
  buildDownloadIdForMedia,
  calculateDownloadProgress,
  computeTotalOfflineBytes,
  createEmptyOfflineDownloadsState,
  inferFileNameFromUrl,
  OFFLINE_DOWNLOADS_STORAGE_KEY,
  parseOfflineDownloadsStorage,
  removeOfflineDownload,
  serializeOfflineDownloadsStorage,
  upsertOfflineDownload,
  validateDirectVideoUrl,
  type OfflineDownloadItem,
  type OfflineDownloadsStateV1,
} from '../utils/offlineDownloadsRules';
import { isTauriRuntime } from '../utils/platform';
import {
  cancelTauriOfflineDownload,
  deleteTauriOfflineFile,
  deleteWebVideoBlob,
  openTauriOfflineVideo,
  pickTauriLocalVideoFile,
  readWebVideoBlob,
  revealTauriOfflineFile,
  saveWebVideoBlob,
  startTauriOfflineDownload,
  verifyTauriOfflineFiles,
  type TauriDownloadProgressPayload,
} from '../services/offlineVideoStorage';

export interface ActiveOfflineDownload {
  downloadId: string;
  title: string;
  mediaType: MediaType;
  posterPath: string | null;
  qualityLabel: string;
  downloadedBytes: number;
  totalBytes: number | null;
  progressPercent: number | null;
}

export interface WebPlayerPlaybackState {
  item: OfflineDownloadItem;
  objectUrl: string;
}

export interface OfflineMediaMetadataInput {
  tmdbId: number | null;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  year?: string;
  posterPath?: string | null;
  genres?: MediaItem['genres'];
  voteAverage?: number;
}

interface OfflineDownloadsContextValue {
  items: OfflineDownloadItem[];
  activeDownloads: ActiveOfflineDownload[];
  totalSizeBytes: number;
  missingFileMap: Record<string, boolean>;
  webPlayback: WebPlayerPlaybackState | null;
  closeWebPlayback: () => void;
  getOfflineItemForTitle: (
    id: number,
    mediaType: MediaType,
  ) => OfflineDownloadItem | undefined;
  getActiveDownloadForTitle: (
    id: number,
    mediaType: MediaType,
  ) => ActiveOfflineDownload | undefined;
  downloadFromUrl: (
    meta: OfflineMediaMetadataInput,
    url: string,
    qualityLabel: string,
  ) => Promise<OfflineDownloadItem>;
  cancelDownload: (downloadId: string) => Promise<void>;
  attachLocalMacFile: (
    meta: OfflineMediaMetadataInput,
    qualityLabel: string,
  ) => Promise<OfflineDownloadItem | null>;
  attachWebLocalFile: (
    meta: OfflineMediaMetadataInput,
    file: File,
    qualityLabel: string,
  ) => Promise<OfflineDownloadItem>;
  playOfflineItem: (item: OfflineDownloadItem) => Promise<void>;
  revealOfflineItem: (item: OfflineDownloadItem) => Promise<void>;
  deleteOfflineItem: (item: OfflineDownloadItem) => Promise<void>;
  verifyFilesOnDisk: () => Promise<void>;
}

const OfflineDownloadsContext =
  createContext<OfflineDownloadsContextValue | null>(null);

function loadInitialDownloads(): OfflineDownloadsStateV1 {
  try {
    return parseOfflineDownloadsStorage(
      localStorage.getItem(OFFLINE_DOWNLOADS_STORAGE_KEY),
    );
  } catch {
    return createEmptyOfflineDownloadsState();
  }
}

export function OfflineDownloadsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OfflineDownloadsStateV1>(loadInitialDownloads);
  const [activeMap, setActiveMap] = useState<Record<string, ActiveOfflineDownload>>(
    {},
  );
  const [missingFileMap, setMissingFileMap] = useState<Record<string, boolean>>({});
  const [webPlayback, setWebPlayback] = useState<WebPlayerPlaybackState | null>(
    null,
  );
  const webAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const itemsRef = useRef<OfflineDownloadItem[]>(state.items);
  itemsRef.current = state.items;

  useEffect(() => {
    try {
      localStorage.setItem(
        OFFLINE_DOWNLOADS_STORAGE_KEY,
        serializeOfflineDownloadsStorage(state),
      );
    } catch {
      // Игнорируем квоту localStorage
    }
  }, [state]);

  // Освобождаем objectURL при закрытии встроенного веб-плеера
  const closeWebPlayback = useCallback(() => {
    setWebPlayback((prev) => {
      if (prev?.objectUrl) {
        URL.revokeObjectURL(prev.objectUrl);
      }
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      setWebPlayback((prev) => {
        if (prev?.objectUrl) {
          URL.revokeObjectURL(prev.objectUrl);
        }
        return null;
      });
    };
  }, []);

  // Подписка на события прогресса загрузки из Tauri Rust
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | null = null;
    let disposed = false;

    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<TauriDownloadProgressPayload>('offline-download-progress', (event) => {
          const payload = event.payload;
          if (!payload || typeof payload.downloadId !== 'string') return;
          setActiveMap((prev) => {
            const existing = prev[payload.downloadId];
            if (!existing) return prev;
            return {
              ...prev,
              [payload.downloadId]: {
                ...existing,
                downloadedBytes: payload.downloadedBytes,
                totalBytes: payload.totalBytes,
                progressPercent: calculateDownloadProgress(
                  payload.downloadedBytes,
                  payload.totalBytes,
                ),
              },
            };
          });
        }),
      )
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {
        // Игнорируем ошибку подписки в тестовой/нестандартной среде
      });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  const verifyFilesOnDisk = useCallback(async () => {
    if (!isTauriRuntime()) return;
    const paths = itemsRef.current
      .map((item) => item.filePath)
      .filter((p): p is string => Boolean(p));
    if (paths.length === 0) {
      setMissingFileMap({});
      return;
    }
    const existenceMap = await verifyTauriOfflineFiles(paths);
    const nextMissing: Record<string, boolean> = {};
    for (const item of itemsRef.current) {
      if (item.filePath && existenceMap[item.filePath] === false) {
        nextMissing[item.downloadId] = true;
      }
    }
    setMissingFileMap(nextMissing);
  }, []);

  const getOfflineItemForTitle = useCallback(
    (id: number, mediaType: MediaType) =>
      state.items.find(
        (item) => item.tmdbId === id && item.mediaType === mediaType,
      ),
    [state.items],
  );

  const getActiveDownloadForTitle = useCallback(
    (id: number, mediaType: MediaType) => activeMap[`${mediaType}:${id}`],
    [activeMap],
  );

  const downloadFromUrl = useCallback(
    async (
      meta: OfflineMediaMetadataInput,
      rawUrl: string,
      qualityLabel: string,
    ): Promise<OfflineDownloadItem> => {
      const validation = validateDirectVideoUrl(rawUrl);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      const downloadId = buildDownloadIdForMedia(meta.mediaType, meta.tmdbId);
      const suggestedName = inferFileNameFromUrl(validation.url, meta.title);
      const cleanQuality = qualityLabel.trim() || 'Оригинал';

      setActiveMap((prev) => ({
        ...prev,
        [downloadId]: {
          downloadId,
          title: meta.title,
          mediaType: meta.mediaType,
          posterPath: meta.posterPath ?? null,
          qualityLabel: cleanQuality,
          downloadedBytes: 0,
          totalBytes: null,
          progressPercent: null,
        },
      }));

      try {
        if (isTauriRuntime()) {
          const downloaded = await startTauriOfflineDownload({
            downloadId,
            url: validation.url,
            suggestedName,
          });

          const newItem: OfflineDownloadItem = {
            downloadId,
            tmdbId: meta.tmdbId,
            mediaType: meta.mediaType,
            title: meta.title.trim() || downloaded.fileName,
            originalTitle: meta.originalTitle?.trim() ?? '',
            year: meta.year?.trim() ?? '',
            posterPath: meta.posterPath ?? null,
            genres: meta.genres ?? [],
            voteAverage: meta.voteAverage ?? 0,
            source: 'download',
            filePath: downloaded.filePath,
            webBlobKey: null,
            fileName: downloaded.fileName,
            fileSizeBytes: downloaded.fileSizeBytes,
            qualityLabel: cleanQuality,
            sourceUrl: validation.url,
            addedAt: new Date().toISOString(),
          };

          setState((prev) => ({
            ...prev,
            items: upsertOfflineDownload(prev.items, newItem),
          }));
          setMissingFileMap((prev) => {
            if (!prev[downloadId]) return prev;
            const copy = { ...prev };
            delete copy[downloadId];
            return copy;
          });
          return newItem;
        }

        // Веб-версия: потоковая загрузка с сохранением в IndexedDB
        const controller = new AbortController();
        webAbortControllersRef.current.set(downloadId, controller);

        let response: Response;
        try {
          response = await fetch(validation.url, { signal: controller.signal });
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            throw new Error('Загрузка отменена.');
          }
          throw new Error(
            'Не удалось скачать файл в браузере (сервер запрещает CORS или ссылка недоступна). В десктопном приложении macOS загрузка работает без ограничений CORS.',
          );
        }

        if (!response.ok) {
          throw new Error(`Сервер вернул ошибку загрузки (${response.status}).`);
        }

        const contentLengthHeader = response.headers.get('content-length');
        const totalBytes =
          contentLengthHeader && Number.isFinite(Number(contentLengthHeader))
            ? Number(contentLengthHeader)
            : null;

        const chunks: BlobPart[] = [];
        let downloadedBytes = 0;

        if (response.body) {
          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              downloadedBytes += value.byteLength;
              setActiveMap((prev) => {
                const existing = prev[downloadId];
                if (!existing) return prev;
                return {
                  ...prev,
                  [downloadId]: {
                    ...existing,
                    downloadedBytes,
                    totalBytes,
                    progressPercent: calculateDownloadProgress(
                      downloadedBytes,
                      totalBytes,
                    ),
                  },
                };
              });
            }
          }
        } else {
          const arrayBuffer = await response.arrayBuffer();
          chunks.push(arrayBuffer);
          downloadedBytes = arrayBuffer.byteLength;
        }

        const contentType =
          response.headers.get('content-type') || 'video/mp4';
        const blob = new Blob(chunks, { type: contentType });
        const blobKey = `blob_${downloadId}`;
        await saveWebVideoBlob(blobKey, blob);

        const newItem: OfflineDownloadItem = {
          downloadId,
          tmdbId: meta.tmdbId,
          mediaType: meta.mediaType,
          title: meta.title.trim() || suggestedName,
          originalTitle: meta.originalTitle?.trim() ?? '',
          year: meta.year?.trim() ?? '',
          posterPath: meta.posterPath ?? null,
          genres: meta.genres ?? [],
          voteAverage: meta.voteAverage ?? 0,
          source: 'download',
          filePath: null,
          webBlobKey: blobKey,
          fileName: suggestedName,
          fileSizeBytes: blob.size || downloadedBytes,
          qualityLabel: cleanQuality,
          sourceUrl: validation.url,
          addedAt: new Date().toISOString(),
        };

        setState((prev) => ({
          ...prev,
          items: upsertOfflineDownload(prev.items, newItem),
        }));
        return newItem;
      } finally {
        webAbortControllersRef.current.delete(downloadId);
        setActiveMap((prev) => {
          if (!prev[downloadId]) return prev;
          const next = { ...prev };
          delete next[downloadId];
          return next;
        });
      }
    },
    [],
  );

  const cancelDownload = useCallback(async (downloadId: string) => {
    const controller = webAbortControllersRef.current.get(downloadId);
    if (controller) {
      controller.abort();
      webAbortControllersRef.current.delete(downloadId);
    }
    if (isTauriRuntime()) {
      await cancelTauriOfflineDownload(downloadId);
    }
    setActiveMap((prev) => {
      if (!prev[downloadId]) return prev;
      const next = { ...prev };
      delete next[downloadId];
      return next;
    });
  }, []);

  const attachLocalMacFile = useCallback(
    async (
      meta: OfflineMediaMetadataInput,
      qualityLabel: string,
    ): Promise<OfflineDownloadItem | null> => {
      const picked = await pickTauriLocalVideoFile();
      if (!picked) return null;

      const downloadId = buildDownloadIdForMedia(meta.mediaType, meta.tmdbId);
      const fallbackTitle = picked.fileName.replace(/\.[^.]+$/, '');
      const newItem: OfflineDownloadItem = {
        downloadId,
        tmdbId: meta.tmdbId,
        mediaType: meta.mediaType,
        title: meta.title.trim() || fallbackTitle || 'Видеофайл',
        originalTitle: meta.originalTitle?.trim() ?? '',
        year: meta.year?.trim() ?? '',
        posterPath: meta.posterPath ?? null,
        genres: meta.genres ?? [],
        voteAverage: meta.voteAverage ?? 0,
        source: 'local_file',
        filePath: picked.filePath,
        webBlobKey: null,
        fileName: picked.fileName,
        fileSizeBytes: picked.fileSizeBytes,
        qualityLabel: qualityLabel.trim() || 'Оригинал',
        sourceUrl: null,
        addedAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        items: upsertOfflineDownload(prev.items, newItem),
      }));
      setMissingFileMap((prev) => {
        if (!prev[downloadId]) return prev;
        const copy = { ...prev };
        delete copy[downloadId];
        return copy;
      });
      return newItem;
    },
    [],
  );

  const attachWebLocalFile = useCallback(
    async (
      meta: OfflineMediaMetadataInput,
      file: File,
      qualityLabel: string,
    ): Promise<OfflineDownloadItem> => {
      const downloadId = buildDownloadIdForMedia(meta.mediaType, meta.tmdbId);
      const blobKey = `blob_${downloadId}`;
      await saveWebVideoBlob(blobKey, file);

      const fallbackTitle = file.name.replace(/\.[^.]+$/, '');
      const newItem: OfflineDownloadItem = {
        downloadId,
        tmdbId: meta.tmdbId,
        mediaType: meta.mediaType,
        title: meta.title.trim() || fallbackTitle || 'Видеофайл',
        originalTitle: meta.originalTitle?.trim() ?? '',
        year: meta.year?.trim() ?? '',
        posterPath: meta.posterPath ?? null,
        genres: meta.genres ?? [],
        voteAverage: meta.voteAverage ?? 0,
        source: 'local_file',
        filePath: null,
        webBlobKey: blobKey,
        fileName: file.name,
        fileSizeBytes: file.size,
        qualityLabel: qualityLabel.trim() || 'Оригинал',
        sourceUrl: null,
        addedAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        items: upsertOfflineDownload(prev.items, newItem),
      }));
      return newItem;
    },
    [],
  );

  const playOfflineItem = useCallback(async (item: OfflineDownloadItem) => {
    if (isTauriRuntime() && item.filePath) {
      try {
        await openTauriOfflineVideo(item.filePath);
        return;
      } catch (err: unknown) {
        setMissingFileMap((prev) => ({ ...prev, [item.downloadId]: true }));
        throw new Error(
          typeof err === 'string'
            ? err
            : err instanceof Error
              ? err.message
              : 'Не удалось открыть локальный видеофайл.',
        );
      }
    }

    if (item.webBlobKey) {
      const blob = await readWebVideoBlob(item.webBlobKey);
      if (!blob) {
        setMissingFileMap((prev) => ({ ...prev, [item.downloadId]: true }));
        throw new Error(
          'Видеофайл не найден в локальном хранилище браузера. Привяжите его заново.',
        );
      }
      const objectUrl = URL.createObjectURL(blob);
      setWebPlayback((prev) => {
        if (prev?.objectUrl) {
          URL.revokeObjectURL(prev.objectUrl);
        }
        return { item, objectUrl };
      });
      return;
    }

    throw new Error('Для этой записи не найден локальный видеофайл.');
  }, []);

  const revealOfflineItem = useCallback(async (item: OfflineDownloadItem) => {
    if (!isTauriRuntime() || !item.filePath) return;
    await revealTauriOfflineFile(item.filePath);
  }, []);

  const deleteOfflineItem = useCallback(async (item: OfflineDownloadItem) => {
    if (isTauriRuntime() && item.source === 'download' && item.filePath) {
      await deleteTauriOfflineFile(item.filePath);
    }
    if (item.webBlobKey) {
      await deleteWebVideoBlob(item.webBlobKey);
    }
    setWebPlayback((prev) => {
      if (prev?.item.downloadId === item.downloadId) {
        URL.revokeObjectURL(prev.objectUrl);
        return null;
      }
      return prev;
    });
    setState((prev) => ({
      ...prev,
      items: removeOfflineDownload(prev.items, item.downloadId),
    }));
    setMissingFileMap((prev) => {
      if (!prev[item.downloadId]) return prev;
      const copy = { ...prev };
      delete copy[item.downloadId];
      return copy;
    });
  }, []);

  const activeDownloads = useMemo(() => Object.values(activeMap), [activeMap]);
  const totalSizeBytes = useMemo(
    () => computeTotalOfflineBytes(state.items),
    [state.items],
  );

  const value = useMemo<OfflineDownloadsContextValue>(
    () => ({
      items: state.items,
      activeDownloads,
      totalSizeBytes,
      missingFileMap,
      webPlayback,
      closeWebPlayback,
      getOfflineItemForTitle,
      getActiveDownloadForTitle,
      downloadFromUrl,
      cancelDownload,
      attachLocalMacFile,
      attachWebLocalFile,
      playOfflineItem,
      revealOfflineItem,
      deleteOfflineItem,
      verifyFilesOnDisk,
    }),
    [
      state.items,
      activeDownloads,
      totalSizeBytes,
      missingFileMap,
      webPlayback,
      closeWebPlayback,
      getOfflineItemForTitle,
      getActiveDownloadForTitle,
      downloadFromUrl,
      cancelDownload,
      attachLocalMacFile,
      attachWebLocalFile,
      playOfflineItem,
      revealOfflineItem,
      deleteOfflineItem,
      verifyFilesOnDisk,
    ],
  );

  return (
    <OfflineDownloadsContext.Provider value={value}>
      {children}
    </OfflineDownloadsContext.Provider>
  );
}

export function useOfflineDownloads(): OfflineDownloadsContextValue {
  const ctx = useContext(OfflineDownloadsContext);
  if (!ctx) {
    throw new Error(
      'useOfflineDownloads должен использоваться внутри OfflineDownloadsProvider',
    );
  }
  return ctx;
}
