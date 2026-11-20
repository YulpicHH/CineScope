import { useEffect, useState } from 'react';
import { AlertCircle, Film, X } from 'lucide-react';
import { useOfflineDownloads } from '../../hooks/useOfflineDownloads';
import {
  extractFileFormatLabel,
  formatFileSize,
} from '../../utils/offlineDownloadsRules';

export function OfflineVideoPlayerModal() {
  const { webPlayback, closeWebPlayback } = useOfflineDownloads();
  const [codecError, setCodecError] = useState(false);

  useEffect(() => {
    setCodecError(false);
  }, [webPlayback?.objectUrl]);

  useEffect(() => {
    if (!webPlayback) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeWebPlayback();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [webPlayback, closeWebPlayback]);

  if (!webPlayback) return null;

  const { item, objectUrl } = webPlayback;
  const formatLabel = extractFileFormatLabel(item.fileName);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-player-title"
      data-testid="offline-video-player-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closeWebPlayback();
        }
      }}
    >
      <div className="flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#090B10] shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3.5 text-white">
          <div className="min-w-0 flex items-center gap-3">
            <Film className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            <div className="min-w-0">
              <h2
                id="offline-player-title"
                className="font-display truncate text-base font-bold tracking-tight"
              >
                {item.title}
              </h2>
              <p className="truncate text-xs text-slate-400 tabular-nums">
                Офлайн · {item.qualityLabel} · {formatLabel} ·{' '}
                {formatFileSize(item.fileSizeBytes)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeWebPlayback}
            aria-label="Закрыть плеер"
            data-testid="offline-player-close"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="relative bg-black">
          {codecError ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center text-slate-300">
              <AlertCircle className="h-8 w-8 text-amber-400" aria-hidden="true" />
              <p className="max-w-md text-sm font-medium text-white">
                Браузер не смог воспроизвести формат {formatLabel} ({item.fileName}).
              </p>
              <p className="max-w-md text-xs leading-relaxed text-slate-400">
                Для MKV, HEVC и 4K HDR используйте MP4 (H.264/AAC) в веб-версии или откройте файл в macOS-приложении CineScope — там видео запускается напрямую в IINA, VLC или QuickTime без ограничений браузера.
              </p>
            </div>
          ) : (
            <video
              key={objectUrl}
              src={objectUrl}
              controls
              autoPlay
              playsInline
              data-testid="offline-video-element"
              onError={() => setCodecError(true)}
              className="max-h-[80vh] w-full bg-black object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
