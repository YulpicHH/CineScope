import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from '../utils/platform';

const WEB_OFFLINE_DB_NAME = 'cinescope_offline_videos_v1';
const WEB_OFFLINE_STORE_NAME = 'videos';

export interface TauriDownloadedFileResult {
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
}

export interface TauriPickedLocalVideo {
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
}

export interface TauriDownloadProgressPayload {
  downloadId: string;
  downloadedBytes: number;
  totalBytes: number | null;
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('Локальное хранилище видео (IndexedDB) недоступно в этом браузере.'));
      return;
    }

    const request = window.indexedDB.open(WEB_OFFLINE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WEB_OFFLINE_STORE_NAME)) {
        db.createObjectStore(WEB_OFFLINE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error('Не удалось открыть локальное хранилище видео.'));
  });
}

export async function saveWebVideoBlob(key: string, blob: Blob): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(WEB_OFFLINE_STORE_NAME, 'readwrite');
    tx.objectStore(WEB_OFFLINE_STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        new Error(
          'Не удалось сохранить видео в локальное хранилище браузера (возможно, не хватает места).',
        ),
      );
  });
  db.close();
}

export async function readWebVideoBlob(key: string): Promise<Blob | null> {
  const db = await openOfflineDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(WEB_OFFLINE_STORE_NAME, 'readonly');
    const req = tx.objectStore(WEB_OFFLINE_STORE_NAME).get(key);
    req.onsuccess = () => {
      const result = req.result;
      resolve(result instanceof Blob ? result : null);
    };
    req.onerror = () => reject(new Error('Не удалось прочитать локальный видеофайл.'));
  });
  db.close();
  return blob;
}

export async function deleteWebVideoBlob(key: string): Promise<void> {
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(WEB_OFFLINE_STORE_NAME, 'readwrite');
      tx.objectStore(WEB_OFFLINE_STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Игнорируем ошибку очистки IndexedDB
  }
}

export async function startTauriOfflineDownload(params: {
  downloadId: string;
  url: string;
  suggestedName: string;
}): Promise<TauriDownloadedFileResult> {
  return invoke<TauriDownloadedFileResult>('start_offline_download', params);
}

export async function cancelTauriOfflineDownload(downloadId: string): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    return await invoke<boolean>('cancel_offline_download', { downloadId });
  } catch {
    return false;
  }
}

export async function pickTauriLocalVideoFile(): Promise<TauriPickedLocalVideo | null> {
  if (!isTauriRuntime()) return null;
  const picked = await invoke<TauriPickedLocalVideo | null>('pick_local_video_file');
  return picked ?? null;
}

export async function openTauriOfflineVideo(filePath: string): Promise<void> {
  await invoke('open_offline_video', { filePath });
}

export async function revealTauriOfflineFile(filePath: string): Promise<void> {
  await invoke('reveal_offline_file', { filePath });
}

export async function deleteTauriOfflineFile(filePath: string): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    return await invoke<boolean>('delete_offline_file', { filePath });
  } catch {
    return false;
  }
}

export async function verifyTauriOfflineFiles(
  paths: string[],
): Promise<Record<string, boolean>> {
  if (!isTauriRuntime() || paths.length === 0) return {};
  try {
    return await invoke<Record<string, boolean>>('verify_offline_files', { paths });
  } catch {
    return {};
  }
}
