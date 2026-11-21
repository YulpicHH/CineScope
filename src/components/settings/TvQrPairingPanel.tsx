import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  QrCode,
  RefreshCw,
  Smartphone,
  Wifi,
} from 'lucide-react';
import {
  buildQrSvgModel,
  listenTvPairingKeys,
  pollTvPairingResult,
  startTvPairingServer,
  stopTvPairingServer,
  type TvPairingPayload,
  type TvPairingSessionInfo,
} from '../../services/tvPairing';
import { isTauriRuntime } from '../../utils/platform';

interface TvQrPairingPanelProps {
  active: boolean;
  busy?: boolean;
  onKeysReceived: (payload: TvPairingPayload) => void;
}

type PairingPanelState =
  | 'starting'
  | 'ready'
  | 'received'
  | 'expired'
  | 'unavailable'
  | 'error';

function formatRemaining(totalSecs: number): string {
  const clamped = Math.max(0, Math.floor(totalSecs));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TvQrPairingPanel({
  active,
  busy = false,
  onKeysReceived,
}: TvQrPairingPanelProps) {
  const [state, setState] = useState<PairingPanelState>('starting');
  const [session, setSession] = useState<TvPairingSessionInfo | null>(null);
  const [remainingSecs, setRemainingSecs] = useState(300);
  const [errorText, setErrorText] = useState<string | null>(null);

  const onKeysReceivedRef = useRef(onKeysReceived);
  onKeysReceivedRef.current = onKeysReceived;

  const sessionIdRef = useRef<number | null>(null);
  const deliveredRef = useRef(false);

  const deliverPayload = useCallback((payload: TvPairingPayload) => {
    if (deliveredRef.current) return;
    deliveredRef.current = true;
    setState('received');
    onKeysReceivedRef.current(payload);
  }, []);

  const startSession = useCallback(async () => {
    if (!isTauriRuntime()) {
      setSession(null);
      setErrorText(null);
      setState('unavailable');
      return;
    }

    deliveredRef.current = false;
    setState('starting');
    setErrorText(null);

    try {
      const info = await startTvPairingServer();
      sessionIdRef.current = info.sessionId;
      setSession(info);
      setRemainingSecs(info.expiresInSecs);
      setState('ready');
    } catch (err) {
      sessionIdRef.current = null;
      setSession(null);
      const rawMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Не удалось запустить локальный сервер сопряжения.';
      setErrorText(rawMessage);
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (!active) {
      sessionIdRef.current = null;
      void stopTvPairingServer();
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;

    void listenTvPairingKeys((payload) => {
      if (!disposed) {
        deliverPayload(payload);
      }
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    void startSession();

    return () => {
      disposed = true;
      sessionIdRef.current = null;
      if (unlisten) {
        unlisten();
      }
      void stopTvPairingServer();
    };
  }, [active, startSession, deliverPayload]);

  // Резервный опрос статуса и таймер обратного отсчёта пока активна сессия QR
  useEffect(() => {
    if (!active || state !== 'ready' || !session) return;

    const currentSessionId = session.sessionId;
    const pollTimer = window.setInterval(() => {
      void pollTvPairingResult(currentSessionId).then((res) => {
        if (!res || sessionIdRef.current !== currentSessionId) return;
        if (res.payload) {
          deliverPayload(res.payload);
          return;
        }
        setRemainingSecs(res.remainingSecs);
        if (res.expired || (!res.active && !deliveredRef.current)) {
          setState('expired');
        }
      });
    }, 1200);

    const tickTimer = window.setInterval(() => {
      setRemainingSecs((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      window.clearInterval(pollTimer);
      window.clearInterval(tickTimer);
    };
  }, [active, state, session, deliverPayload]);

  const qrModel = useMemo(() => {
    if (!session?.url) return null;
    try {
      return buildQrSvgModel(session.url, 2);
    } catch {
      return null;
    }
  }, [session?.url]);

  return (
    <aside
      data-testid="tv-qr-pairing-panel"
      aria-label="Ввод API-ключей с телефона по QR-коду"
      className="flex flex-col justify-between gap-4 border-t border-white/[0.08] bg-[#0B0E15]/80 px-6 py-5 lg:border-l lg:border-t-0"
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-blue-400">
          <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold tracking-tight text-blue-300">
            Быстрый ввод с телефона
          </span>
        </div>

        <div className="space-y-1">
          <h3 className="font-display text-base font-bold text-white">
            Отсканируйте QR-код
          </h3>
          <p className="text-xs leading-relaxed text-slate-400">
            Откройте камеру на телефоне в той же сети Wi-Fi и вставьте ключи TMDB и Kinopoisk — они применятся автоматически.
          </p>
        </div>

        {/* Основная зона QR / статуса */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-[#11151E] p-4 text-center">
          {state === 'starting' ? (
            <div className="flex h-[188px] flex-col items-center justify-center gap-2.5 text-slate-300">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" aria-hidden="true" />
              <span className="text-xs">Запуск Wi-Fi сопряжения...</span>
            </div>
          ) : state === 'ready' && qrModel && session ? (
            <div className="flex flex-col items-center gap-3">
              <div
                data-testid="tv-qr-code-box"
                className="rounded-xl bg-white p-2.5 shadow-lg"
              >
                <svg
                  viewBox={`0 0 ${qrModel.viewBoxSize} ${qrModel.viewBoxSize}`}
                  width="176"
                  height="176"
                  role="img"
                  aria-label="QR-код для передачи API-ключей с телефона"
                  shapeRendering="crispEdges"
                  className="block h-[176px] w-[176px]"
                >
                  <rect
                    width={qrModel.viewBoxSize}
                    height={qrModel.viewBoxSize}
                    fill="#FFFFFF"
                  />
                  <path d={qrModel.pathData} fill="#090B10" />
                </svg>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-300">
                  <Wifi className="h-3.5 w-3.5 shrink-0 text-blue-400" aria-hidden="true" />
                  <span className="font-mono tabular-nums text-[12px] text-white">
                    {session.ip}:{session.port}
                  </span>
                </div>
                <p className="text-[11px] tabular-nums text-slate-400">
                  Одноразовая сессия · {formatRemaining(remainingSecs)}
                </p>
              </div>
            </div>
          ) : state === 'received' ? (
            <div className="flex h-[188px] flex-col items-center justify-center gap-2.5 px-2">
              <CheckCircle2
                className="h-9 w-9 text-emerald-400"
                aria-hidden="true"
              />
              <p className="text-sm font-semibold text-emerald-200">
                Ключи получены с телефона
              </p>
              <p className="text-xs text-slate-400">
                {busy
                  ? 'Проверяем ключ TMDB и сохраняем настройки...'
                  : 'Данные подставлены в форму слева.'}
              </p>
            </div>
          ) : state === 'expired' ? (
            <div className="flex h-[188px] flex-col items-center justify-center gap-2.5 px-2">
              <QrCode className="h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="text-sm font-semibold text-white">
                Сессия QR-кода завершена
              </p>
              <p className="text-xs text-slate-400">
                Нажмите кнопку ниже, чтобы создать новый код с одноразовым токеном.
              </p>
            </div>
          ) : state === 'unavailable' ? (
            <div className="flex h-[188px] flex-col items-center justify-center gap-2.5 px-2">
              <QrCode className="h-8 w-8 text-blue-400" aria-hidden="true" />
              <p className="text-sm font-semibold text-white">
                Доступно в ТВ-приложении
              </p>
              <p className="text-xs leading-relaxed text-slate-400">
                Локальный Wi-Fi сервер для сканирования QR-кода работает в установленном приложении CineScope на SberBox / Android TV.
              </p>
            </div>
          ) : (
            <div className="flex h-[188px] flex-col items-center justify-center gap-2.5 px-2">
              <AlertCircle className="h-8 w-8 text-rose-400" aria-hidden="true" />
              <p className="text-sm font-semibold text-rose-200">
                Wi-Fi сопряжение недоступно
              </p>
              <p className="text-xs leading-relaxed text-slate-400">
                {errorText ?? 'Проверьте подключение приставки к домашней сети Wi-Fi.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Кнопка обновления QR-кода (в Tauri-режиме) */}
      {state !== 'unavailable' ? (
        <button
          type="button"
          disabled={busy || state === 'starting'}
          onClick={() => void startSession()}
          data-testid="refresh-tv-qr-button"
          className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/[0.12] disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {state === 'received' || state === 'expired'
              ? 'Создать новый QR-код'
              : 'Обновить QR-код'}
          </span>
        </button>
      ) : null}
    </aside>
  );
}
