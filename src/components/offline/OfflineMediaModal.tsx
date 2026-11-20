import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Film,
  FolderOpen,
  HardDrive,
  Link2,
  Loader2,
  Play,
  Trash2,
  X,
} from 'lucide-react';
import {
  useOfflineDownloads,
  type OfflineMediaMetadataInput,
} from '../../hooks/useOfflineDownloads';
import type { MediaType } from '../../types';
import {
  extractFileFormatLabel,
  formatFileSize,
  OFFLINE_QUALITY_PRESETS,
  validateDirectVideoUrl,
  type OfflineDownloadItem,
  type OfflineQualityPreset,
} from '../../utils/offlineDownloadsRules';
import { isTauriRuntime } from '../../utils/platform';

interface OfflineMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  media?: OfflineMediaMetadataInput | null;
  existingItem?: OfflineDownloadItem | null;
  initialTab?: 'url' | 'file';
  onSuccess?: (item: OfflineDownloadItem) => void;
}

export function OfflineMediaModal({
  isOpen,
  onClose,
  media = null,
  existingItem = null,
  initialTab = 'url',
  onSuccess,
}: OfflineMediaModalProps) {
  const {
    activeDownloads,
    downloadFromUrl,
    cancelDownload,
    attachLocalMacFile,
    attachWebLocalFile,
    playOfflineItem,
    revealOfflineItem,
    deleteOfflineItem,
  } = useOfflineDownloads();

  const isDesktop = isTauriRuntime();
  const isStandalone = !media;

  const [activeTab, setActiveTab] = useState<'url' | 'file'>(initialTab);
  const [urlInput, setUrlInput] = useState('');
  const [standaloneTitle, setStandaloneTitle] = useState('');
  const [standaloneMediaType, setStandaloneMediaType] =
    useState<MediaType>('movie');
  const [quality, setQuality] = useState<OfflineQualityPreset>('4K');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const prevOpenRef = useRef(false);

  const currentTitleDownload = media?.tmdbId
    ? activeDownloads.find(
        (d) => d.downloadId === `${media.mediaType}:${media.tmdbId}`,
      )
    : activeDownloads.find((d) => d.downloadId.startsWith('local:'));

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = isOpen;
    if (isOpen && !wasOpen) {
      setActiveTab(initialTab);
      setUrlInput(existingItem?.sourceUrl ?? '');
      setStandaloneTitle('');
      setStandaloneMediaType('movie');
      const existingPreset = OFFLINE_QUALITY_PRESETS.find(
        (p) => p === existingItem?.qualityLabel,
      );
      setQuality(existingPreset ?? '4K');
      setErrorMessage(null);
      setBusy(false);
    }
  }, [isOpen, initialTab, existingItem]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, busy, onClose]);

  if (!isOpen) return null;

  const resolveMetadata = (): OfflineMediaMetadataInput => {
    if (media) return media;
    return {
      tmdbId: null,
      mediaType: standaloneMediaType,
      title: standaloneTitle.trim(),
      originalTitle: '',
      year: '',
      posterPath: null,
      genres: [],
      voteAverage: 0,
    };
  };

  const handleUrlDownload = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    const validation = validateDirectVideoUrl(urlInput);
    if (!validation.ok) {
      setErrorMessage(validation.message);
      return;
    }

    setBusy(true);
    try {
      const saved = await downloadFromUrl(
        resolveMetadata(),
        validation.url,
        quality,
      );
      onSuccess?.(saved);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Не удалось скачать видеофайл.';
      setErrorMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const handlePickMacFile = async () => {
    setErrorMessage(null);
    setBusy(true);
    try {
      const saved = await attachLocalMacFile(resolveMetadata(), quality);
      if (saved) {
        onSuccess?.(saved);
        onClose();
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Не удалось привязать видеофайл с Mac.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleWebFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setErrorMessage(null);
    setBusy(true);
    try {
      const saved = await attachWebLocalFile(resolveMetadata(), file, quality);
      onSuccess?.(saved);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Не удалось сохранить видеофайл в локальное хранилище.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handlePlayExisting = async () => {
    if (!existingItem) return;
    setErrorMessage(null);
    try {
      await playOfflineItem(existingItem);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Не удалось воспроизвести сохранённый файл.',
      );
    }
  };

  const handleDeleteExisting = async () => {
    if (!existingItem) return;
    setErrorMessage(null);
    setBusy(true);
    try {
      await deleteOfflineItem(existingItem);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Не удалось удалить офлайн-запись.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-modal-title"
      data-testid="offline-media-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#11151E]">
        {/* Шапка модалки */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-white/[0.08]">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              <h2
                id="offline-modal-title"
                className="font-display text-lg font-bold tracking-tight text-slate-950 dark:text-white"
              >
                {isStandalone
                  ? 'Добавить видео для офлайн-просмотра'
                  : existingItem
                    ? 'Управление офлайн-копией'
                    : 'Сохранить для просмотра без интернета'}
              </h2>
            </div>
            {media ? (
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {media.title}
                {media.year ? ` (${media.year})` : ''}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Текущая привязанная офлайн-копия */}
          {existingItem ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Доступно офлайн</span>
                    <span>·</span>
                    <span>{existingItem.qualityLabel}</span>
                    <span>·</span>
                    <span>{extractFileFormatLabel(existingItem.fileName)}</span>
                  </div>
                  <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                    {existingItem.fileName}
                  </p>
                  <p className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                    {formatFileSize(existingItem.fileSizeBytes)} ·{' '}
                    {existingItem.source === 'download'
                      ? 'Скачано в CineScope'
                      : isDesktop
                        ? 'Привязано с Mac'
                        : 'Локальный файл'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handlePlayExisting()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
                >
                  <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  Смотреть офлайн
                </button>
                {isDesktop && existingItem.filePath ? (
                  <button
                    type="button"
                    onClick={() => void revealOfflineItem(existingItem)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    Показать в Finder
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDeleteExisting()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-500/20 disabled:opacity-50 dark:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {existingItem.source === 'download'
                    ? 'Удалить файл'
                    : 'Отвязать файл'}
                </button>
              </div>
            </div>
          ) : null}

          {/* Поля названия для автономного добавления из раздела Загрузки */}
          {isStandalone ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div>
                <label
                  htmlFor="offline-standalone-title"
                  className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Название фильма или сериала (необязательно)
                </label>
                <input
                  id="offline-standalone-title"
                  type="text"
                  value={standaloneTitle}
                  onChange={(e) => setStandaloneTitle(e.target.value)}
                  placeholder="Если пусто — возьмём из имени файла"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-[#0B0E15] dark:text-white"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Тип
                </span>
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-[#0B0E15]">
                  <button
                    type="button"
                    onClick={() => setStandaloneMediaType('movie')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      standaloneMediaType === 'movie'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    Фильм
                  </button>
                  <button
                    type="button"
                    onClick={() => setStandaloneMediaType('tv')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      standaloneMediaType === 'tv'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    Сериал
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Переключатель режима: Скачать по ссылке / Файл с Mac */}
          <div
            role="tablist"
            aria-label="Способ добавления видео"
            className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-[#0B0E15]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'url'}
              data-testid="offline-tab-url"
              onClick={() => {
                setActiveTab('url');
                setErrorMessage(null);
              }}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                activeTab === 'url'
                  ? 'bg-white text-slate-950 shadow-sm dark:bg-[#1B2230] dark:text-white'
                  : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              Скачать по ссылке
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'file'}
              data-testid="offline-tab-file"
              onClick={() => {
                setActiveTab('file');
                setErrorMessage(null);
              }}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                activeTab === 'file'
                  ? 'bg-white text-slate-950 shadow-sm dark:bg-[#1B2230] dark:text-white'
                  : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
              {isDesktop ? 'Файл с Mac' : 'Файл с устройства'}
            </button>
          </div>

          {/* Метка качества */}
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Метка качества для библиотеки
            </span>
            <div
              role="group"
              aria-label="Метка качества"
              className="grid grid-cols-4 gap-2"
            >
              {OFFLINE_QUALITY_PRESETS.map((preset) => {
                const selected = quality === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setQuality(preset)}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                      selected
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#0B0E15] dark:text-slate-300 dark:hover:bg-white/10'
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Содержимое активной вкладки */}
          {activeTab === 'url' ? (
            <form onSubmit={(e) => void handleUrlDownload(e)} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="offline-video-url"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Прямая ссылка на видеофайл (.mp4, .mkv, .mov, .webm)
                </label>
                <input
                  id="offline-video-url"
                  data-testid="offline-url-input"
                  type="text"
                  inputMode="url"
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="https://nas.local/movies/interstellar-4k.mkv"
                  disabled={busy}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none disabled:opacity-60 dark:border-white/10 dark:bg-[#0B0E15] dark:text-white"
                />
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Поддерживаются прямые ссылки на видеофайлы с вашего NAS, домашнего медиасервера (Plex/Jellyfin), личного облака или открытого хранилища.
                </p>
              </div>

              {currentTitleDownload ? (
                <div className="space-y-2 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-300">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Загрузка файла…
                    </span>
                    <span className="tabular-nums font-medium text-slate-700 dark:text-slate-200">
                      {formatFileSize(currentTitleDownload.downloadedBytes)}
                      {currentTitleDownload.totalBytes
                        ? ` / ${formatFileSize(currentTitleDownload.totalBytes)}`
                        : ''}
                      {currentTitleDownload.progressPercent !== null
                        ? ` (${currentTitleDownload.progressPercent}%)`
                        : ''}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-200"
                      style={{
                        width: `${currentTitleDownload.progressPercent ?? 20}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        void cancelDownload(currentTitleDownload.downloadId)
                      }
                      className="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                    >
                      Отменить загрузку
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  data-testid="offline-download-submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden="true" />
                  )}
                  {busy ? 'Скачивание…' : 'Скачать в CineScope'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-center dark:border-white/15 dark:bg-[#0B0E15]">
                <Film
                  className="mx-auto mb-2.5 h-8 w-8 text-blue-500"
                  aria-hidden="true"
                />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {isDesktop
                    ? 'Выберите видеофайл через Finder'
                    : 'Выберите видеофайл с устройства'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {isDesktop
                    ? 'CineScope сохранит только привязку к файлу — без дублирования на диске. Воспроизведение откроется в системном плеере macOS (IINA / VLC / QuickTime) в исходном 4K HDR качестве.'
                    : 'Видеофайл будет сохранён локально в хранилище браузера (IndexedDB) и откроется во встроенном плеере без интернета.'}
                </p>

                <div className="mt-4">
                  {isDesktop ? (
                    <button
                      type="button"
                      disabled={busy}
                      data-testid="offline-pick-mac-file"
                      onClick={() => void handlePickMacFile()}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <FolderOpen className="h-4 w-4" aria-hidden="true" />
                      )}
                      {busy ? 'Выбор файла…' : 'Выбрать видеофайл на Mac'}
                    </button>
                  ) : (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*,.mp4,.mkv,.mov,.webm,.m4v,.avi"
                        data-testid="offline-web-file-input"
                        onChange={(e) => void handleWebFileChange(e)}
                        className="sr-only"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        data-testid="offline-pick-web-file"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <FolderOpen className="h-4 w-4" aria-hidden="true" />
                        )}
                        {busy ? 'Сохранение…' : 'Выбрать видеофайл'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isDesktop ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Безопасно: удаление привязки в CineScope никогда не удаляет ваш личный файл с диска Mac.
                </p>
              ) : null}
            </div>
          )}

          {errorMessage ? (
            <div
              role="alert"
              data-testid="offline-modal-error"
              className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
