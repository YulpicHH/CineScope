import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  KeyRound,
  Loader2,
  MonitorPlay,
  Play,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useAppMode } from '../../hooks/useAppMode';
import { validateTmdbApiKey } from '../../services/apiKeys';
import {
  checkFirefoxAvailable,
  getPlayerMode,
  setPlayerMode,
} from '../../services/playerSettings';
import { hasInternalWhitespace } from '../../utils/apiKeysRules';
import { isTauriRuntime, openExternalUrl } from '../../utils/platform';
import {
  PLAYER_MODE_OPTIONS,
  getPlayerModeOption,
  type PlayerModeId,
} from '../../utils/playerProfile';

const TMDB_API_SETTINGS_URL = 'https://www.themoviedb.org/settings/api';
const KINOPOISK_API_URL = 'https://kinopoiskapiunofficial.tech';

export function ApiSettingsModal() {
  const {
    hasApiKey,
    hasUserKeys,
    tmdbKeySource,
    userTmdbApiKey,
    userKinopoiskApiKey,
    isDemoMode,
    needsSetup,
    settingsModalOpen,
    closeSettingsModal,
    saveApiKeys,
    clearApiKeys,
    enterDemoMode,
  } = useAppMode();

  const isOpen = needsSetup || settingsModalOpen;
  const isFirstRun = needsSetup && !settingsModalOpen;

  const [tmdbInput, setTmdbInput] = useState(userTmdbApiKey);
  const [kinopoiskInput, setKinopoiskInput] = useState(userKinopoiskApiKey);
  const [playerMode, setPlayerModeState] = useState<PlayerModeId>(() =>
    getPlayerMode(),
  );
  const [firefoxAvailable, setFirefoxAvailable] = useState<boolean | null>(null);
  const [showTmdbKey, setShowTmdbKey] = useState(false);
  const [showKpKey, setShowKpKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const prevOpenRef = useRef(false);
  const isDesktopTauri = isTauriRuntime();

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = isOpen;
    if (isOpen && !wasOpen) {
      setTmdbInput(userTmdbApiKey);
      setKinopoiskInput(userKinopoiskApiKey);
      setPlayerModeState(getPlayerMode());
      setShowTmdbKey(false);
      setShowKpKey(false);
      setErrorMessage(null);
      setInfoMessage(null);
    }
  }, [isOpen, userTmdbApiKey, userKinopoiskApiKey]);

  useEffect(() => {
    if (!isOpen || !isDesktopTauri || isFirstRun) return;
    let active = true;
    void checkFirefoxAvailable().then((available) => {
      if (active) {
        setFirefoxAvailable(available);
      }
    });
    return () => {
      active = false;
    };
  }, [isOpen, isDesktopTauri, isFirstRun]);

  useEffect(() => {
    if (!isOpen || isFirstRun) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !validating) {
        closeSettingsModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isFirstRun, validating, closeSettingsModal]);

  if (!isOpen) return null;

  const handleExternalLinkClick = (
    event: MouseEvent<HTMLAnchorElement>,
    url: string,
  ) => {
    if (isTauriRuntime()) {
      event.preventDefault();
      void openExternalUrl(url);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (validating) return;

    setErrorMessage(null);
    setInfoMessage(null);

    const trimmedTmdb = tmdbInput.trim();
    const trimmedKp = kinopoiskInput.trim();

    if (trimmedKp && hasInternalWhitespace(trimmedKp)) {
      setErrorMessage(
        'Ключ Kinopoisk содержит пробелы или переносы строк. Проверьте, что он скопирован полностью без лишних символов.',
      );
      return;
    }

    if (trimmedTmdb) {
      setValidating(true);
      try {
        const result = await validateTmdbApiKey(trimmedTmdb);
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        saveApiKeys({
          tmdbApiKey: trimmedTmdb,
          kinopoiskApiKey: trimmedKp,
        });
      } finally {
        setValidating(false);
      }
      return;
    }

    // Если поле TMDB пустое: разрешаем сохранить только ключ Kinopoisk, если уже есть env-ключ или активен демо-режим
    if (tmdbKeySource === 'env' || (!isFirstRun && isDemoMode)) {
      saveApiKeys({
        tmdbApiKey: '',
        kinopoiskApiKey: trimmedKp,
      });
      return;
    }

    setErrorMessage(
      'Введите ключ TMDB API (v3) или нажмите «Продолжить в демо-режиме».',
    );
  };

  const handleClearKeys = () => {
    if (validating) return;
    clearApiKeys();
    setTmdbInput('');
    setKinopoiskInput('');
    setErrorMessage(null);
    setInfoMessage('Сохранённые пользовательские ключи удалены с этого устройства.');
  };

  const handleSelectPlayerMode = (nextMode: PlayerModeId) => {
    if (validating) return;
    const saved = setPlayerMode(nextMode);
    setPlayerModeState(saved);
    setErrorMessage(null);
    const option = getPlayerModeOption(saved);
    setInfoMessage(
      `Режим плеера «${option.label} (${option.badge})» сохранён — применится при следующем нажатии «Смотреть».`,
    );
  };

  const activePlayerOption = getPlayerModeOption(playerMode);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-settings-modal-title"
      data-testid="api-settings-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isFirstRun && !validating) {
          closeSettingsModal();
        }
      }}
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.1] bg-[#11151E] text-[#F3F5F9] shadow-2xl">
        {/* Верхняя полоса заголовка */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-6 py-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-blue-400">
              {isFirstRun ? (
                <Film className="h-5 w-5" aria-hidden="true" />
              ) : (
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              )}
              <span className="font-display text-sm font-semibold tracking-tight text-slate-300">
                CineScope
              </span>
            </div>
            <h2
              id="api-settings-modal-title"
              className="font-display text-xl font-bold tracking-tight text-white"
            >
              {isFirstRun ? 'Подключение API-ключей' : 'Настройки API-ключей'}
            </h2>
            <p className="text-sm text-slate-400">
              {isFirstRun
                ? 'Укажите собственные ключи для доступа к живому каталогу или начните с демо-режима.'
                : 'Обновите или очистите ключи — изменения применятся сразу без перезапуска.'}
            </p>
          </div>

          {!isFirstRun ? (
            <button
              type="button"
              onClick={closeSettingsModal}
              disabled={validating}
              aria-label="Закрыть настройки"
              data-testid="close-api-settings-button"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 px-6 py-5">
          {/* Поле TMDB API Key (v3) */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label
                htmlFor="tmdb-api-key-input"
                className="text-sm font-semibold text-white"
              >
                TMDB API Key (v3)
              </label>
              <a
                href={TMDB_API_SETTINGS_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => handleExternalLinkClick(e, TMDB_API_SETTINGS_URL)}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-blue-400 transition-colors hover:text-blue-300"
              >
                <span>Получить ключ</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>

            <div className="relative">
              <input
                id="tmdb-api-key-input"
                data-testid="tmdb-api-key-input"
                type={showTmdbKey ? 'text' : 'password'}
                value={tmdbInput}
                onChange={(e) => {
                  setTmdbInput(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Например, 32-символьный API Key (v3 auth)"
                autoComplete="off"
                spellCheck={false}
                disabled={validating}
                className="w-full rounded-xl border border-white/12 bg-[#090B10] py-2.5 pl-3.5 pr-11 font-mono text-sm text-white placeholder:font-sans placeholder:text-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowTmdbKey((v) => !v)}
                aria-label={showTmdbKey ? 'Скрыть ключ TMDB' : 'Показать ключ TMDB'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                {showTmdbKey ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Нужен для каталога, поиска, постеров и трейлеров.
              {tmdbKeySource === 'env' && !userTmdbApiKey ? (
                <span className="ml-1 text-emerald-400">
                  Активен локальный ключ из окружения разработки.
                </span>
              ) : null}
            </p>
          </div>

          {/* Поле Kinopoisk Unofficial API Key */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label
                htmlFor="kinopoisk-api-key-input"
                className="text-sm font-semibold text-white"
              >
                Kinopoisk Unofficial API Key{' '}
                <span className="font-normal text-slate-400">(опционально)</span>
              </label>
              <a
                href={KINOPOISK_API_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => handleExternalLinkClick(e, KINOPOISK_API_URL)}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-blue-400 transition-colors hover:text-blue-300"
              >
                <span>Получить ключ</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>

            <div className="relative">
              <input
                id="kinopoisk-api-key-input"
                data-testid="kinopoisk-api-key-input"
                type={showKpKey ? 'text' : 'password'}
                value={kinopoiskInput}
                onChange={(e) => {
                  setKinopoiskInput(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="UUID-ключ для кнопки «Смотреть»"
                autoComplete="off"
                spellCheck={false}
                disabled={validating}
                className="w-full rounded-xl border border-white/12 bg-[#090B10] py-2.5 pl-3.5 pr-11 font-mono text-sm text-white placeholder:font-sans placeholder:text-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowKpKey((v) => !v)}
                aria-label={
                  showKpKey ? 'Скрыть ключ Kinopoisk' : 'Показать ключ Kinopoisk'
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                {showKpKey ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Используется для автоматического поиска ссылки на просмотр. Можно добавить позже.
            </p>
          </div>

          {/* Режим окна плеера (только в десктопном Tauri-приложении) */}
          {isDesktopTauri && !isFirstRun ? (
            <div
              className="space-y-2.5 border-t border-white/[0.08] pt-4"
              data-testid="player-mode-section"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <MonitorPlay className="h-4 w-4 text-blue-400" aria-hidden="true" />
                  <span>Режим плеера</span>
                </div>
                {firefoxAvailable === true ? (
                  <span
                    data-testid="firefox-status-badge"
                    className="text-[11px] font-medium text-emerald-400"
                  >
                    Firefox готов
                  </span>
                ) : firefoxAvailable === false ? (
                  <span
                    data-testid="firefox-status-badge"
                    className="text-[11px] font-medium text-amber-300"
                  >
                    Firefox не найден — откроется встроенное окно
                  </span>
                ) : null}
              </div>

              <div
                role="radiogroup"
                aria-label="Режим окна просмотра"
                className="grid grid-cols-2 gap-2.5"
              >
                {PLAYER_MODE_OPTIONS.map((option) => {
                  const selected = playerMode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      data-testid={`player-mode-${option.id}`}
                      disabled={validating}
                      onClick={() => handleSelectPlayerMode(option.id)}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50 ${
                        selected
                          ? 'border-blue-500/70 bg-blue-600/20 text-white'
                          : 'border-white/10 bg-[#090B10] text-slate-300 hover:border-white/25 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-semibold">{option.label}</span>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          option.id === 'firefox_window'
                            ? 'bg-blue-500/25 text-blue-200'
                            : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {option.badge}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs leading-relaxed text-slate-400">
                {activePlayerOption.description}
              </p>
            </div>
          ) : null}

          {errorMessage ? (
            <div
              role="alert"
              data-testid="api-key-error"
              className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-rose-200"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-rose-400"
                aria-hidden="true"
              />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          {infoMessage ? (
            <div
              role="status"
              data-testid="api-key-info"
              className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-emerald-200"
            >
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                aria-hidden="true"
              />
              <span>{infoMessage}</span>
            </div>
          ) : null}

          {/* Кнопки действий */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              {!isFirstRun && hasUserKeys ? (
                <button
                  type="button"
                  onClick={handleClearKeys}
                  disabled={validating}
                  data-testid="clear-api-keys-button"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Очистить ключи
                </button>
              ) : null}

              {isFirstRun || !hasApiKey ? (
                <button
                  type="button"
                  onClick={enterDemoMode}
                  disabled={validating}
                  data-testid="continue-demo-button"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.12] disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  Продолжить в демо-режиме
                </button>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={validating}
              data-testid="save-api-keys-button"
              className="ml-auto inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:cursor-wait disabled:opacity-70"
            >
              {validating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Проверка ключа...
                </>
              ) : (
                'Сохранить'
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 border-t border-white/[0.06] pt-3 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <span>
              Ключи сохраняются локально на вашем устройстве и используются только для прямых запросов к TMDB и Kinopoisk API.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
