import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, MonitorPlay, Moon, Sun, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useAppMode } from '../hooks/useAppMode';
import { useLibrary } from '../hooks/useLibrary';
import { useTheme } from '../hooks/useTheme';
import { clearKinopoiskClientCache } from '../services/kinopoisk';
import {
  checkPlayerBrowsers,
  getPlayerMode,
  hasStoredPlayerMode,
  setPlayerMode,
  type AvailablePlayerBrowsers,
} from '../services/playerSettings';
import {
  detectClientPlatform,
  isDesktopTauriRuntime,
  type DesktopPlatform,
} from '../utils/platform';
import {
  getDefaultPlayerMode,
  getPlayerModeOption,
  getPlayerModeOptions,
  type PlayerModeId,
} from '../utils/playerProfile';
import { getPlayerBrowserStatusInfo } from '../utils/quickSearch';

export function ProfilePage() {
  const { theme, setTheme } = useTheme();
  const {
    hasApiKey,
    hasKinopoiskKey,
    tmdbKeySource,
    isDemoMode,
    openSettingsModal,
  } = useAppMode();
  const {
    watchlistItems,
    watchedItems,
    favoriteItems,
    items,
    clearAllData,
  } = useLibrary();

  const isDesktopTauri = isDesktopTauriRuntime();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const [desktopPlatform, setDesktopPlatform] = useState<DesktopPlatform>(() =>
    detectClientPlatform(),
  );
  const [playerMode, setPlayerModeState] = useState<PlayerModeId>(() =>
    getPlayerMode(),
  );
  const [availableBrowsers, setAvailableBrowsers] =
    useState<AvailablePlayerBrowsers | null>(null);
  const [browserSavedMessage, setBrowserSavedMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!isDesktopTauri) return;
    let active = true;
    void checkPlayerBrowsers().then((browsers) => {
      if (!active) return;
      setAvailableBrowsers(browsers);
      setDesktopPlatform(browsers.platform);
      if (!hasStoredPlayerMode()) {
        setPlayerModeState(getDefaultPlayerMode(browsers.platform));
      } else {
        setPlayerModeState(getPlayerMode(browsers.platform));
      }
    });
    return () => {
      active = false;
    };
  }, [isDesktopTauri]);

  const handleSelectPlayerMode = (nextMode: PlayerModeId) => {
    const saved = setPlayerMode(nextMode, desktopPlatform);
    setPlayerModeState(saved);
    const option = getPlayerModeOption(saved, desktopPlatform);
    setBrowserSavedMessage(
      `Выбран режим «${option.label} (${option.badge === '4K' ? 'до 4K' : option.badge})» — применится при следующем нажатии «Смотреть».`,
    );
  };

  const playerModeOptions = getPlayerModeOptions(desktopPlatform);
  const activePlayerOption = getPlayerModeOption(playerMode, desktopPlatform);
  const browserStatus = getPlayerBrowserStatusInfo(
    playerMode,
    desktopPlatform,
    availableBrowsers,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
          Профиль и настройки
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {isDesktopTauri
            ? 'Локальные настройки оформления, API-ключей, браузера для просмотра и управление сохранённой коллекцией.'
            : 'Локальные настройки оформления, API-ключей и управление сохранённой коллекцией.'}
        </p>
      </div>

      {/* Тема оформления */}
      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/[0.08] dark:bg-[#11151E]">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
            Оформление интерфейса
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Тёмная тема включена по умолчанию. Выбор сохраняется в браузере.
          </p>
        </div>

        <div
          role="group"
          aria-label="Выбор темы"
          className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-[#0B0E15]"
        >
          <button
            type="button"
            onClick={() => setTheme('dark')}
            aria-pressed={theme === 'dark'}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              theme === 'dark'
                ? 'bg-white text-slate-950 shadow-sm dark:bg-[#1B2230] dark:text-white'
                : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Moon className="h-4 w-4" aria-hidden="true" />
            Тёмная
          </button>

          <button
            type="button"
            onClick={() => setTheme('light')}
            aria-pressed={theme === 'light'}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              theme === 'light'
                ? 'bg-white text-slate-950 shadow-sm dark:bg-[#1B2230] dark:text-white'
                : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Sun className="h-4 w-4" aria-hidden="true" />
            Светлая
          </button>
        </div>
      </section>

      {/* Ключи API (BYOK) */}
      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/[0.08] dark:bg-[#11151E]">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
              API-ключи (TMDB и Kinopoisk)
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {tmdbKeySource === 'user'
                ? 'TMDB: используется ваш личный ключ, сохранённый на этом устройстве.'
                : tmdbKeySource === 'env'
                  ? 'TMDB: используется локальный ключ из окружения разработки.'
                  : isDemoMode
                    ? 'TMDB: активен демо-режим. Укажите свой ключ TMDB API (v3) для доступа ко всему каталогу.'
                    : hasApiKey
                      ? 'TMDB: подключён.'
                      : 'TMDB: ключ не задан.'}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {hasKinopoiskKey
                ? 'Kinopoisk Unofficial API: пользовательский ключ сохранён (кнопка «Смотреть» активна).'
                : 'Kinopoisk Unofficial API: ключ не указан (можно добавить для работы кнопки «Смотреть»).'}
            </p>
          </div>
          <KeyRound className="h-5 w-5 shrink-0 text-blue-500" aria-hidden="true" />
        </div>

        <button
          type="button"
          onClick={openSettingsModal}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10"
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Настроить API-ключи
        </button>
      </section>

      {/* Браузер для просмотра (отдельная панель для Windows и macOS) */}
      {isDesktopTauri ? (
        <section
          data-testid="player-mode-section"
          className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/[0.08] dark:bg-[#11151E]"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                  Браузер для просмотра
                </h2>
                {browserStatus ? (
                  <span
                    data-testid="browser-status-badge"
                    className={`text-xs font-medium ${
                      browserStatus.tone === 'ready'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : browserStatus.tone === 'warning'
                          ? 'text-amber-600 dark:text-amber-300'
                          : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {browserStatus.text}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Выберите браузер, через который будет открываться окно просмотра по кнопке «Смотреть».
              </p>
            </div>
            <MonitorPlay
              className="h-5 w-5 shrink-0 text-blue-500"
              aria-hidden="true"
            />
          </div>

          <div
            role="radiogroup"
            aria-label="Выбор браузера для окна просмотра"
            className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-[#0B0E15]"
          >
            {playerModeOptions.map((option) => {
              const selected = playerMode === option.id;
              const isHighRes = option.badge === '4K';
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-testid={`player-mode-${option.id}`}
                  onClick={() => handleSelectPlayerMode(option.id)}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${
                    selected
                      ? 'bg-white text-slate-950 shadow-sm dark:bg-[#1B2230] dark:text-white'
                      : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <span className="whitespace-nowrap">{option.label}</span>
                  <span
                    className={`whitespace-nowrap text-xs font-medium ${
                      isHighRes
                        ? selected
                          ? 'text-blue-600 dark:text-blue-300'
                          : 'text-blue-600/80 dark:text-blue-400/85'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {isHighRes ? 'до 4K' : option.badge}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            {activePlayerOption.description}
          </p>

          {browserSavedMessage ? (
            <p
              role="status"
              data-testid="player-mode-saved-status"
              className="inline-flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{browserSavedMessage}</span>
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Локальные данные */}
      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/[0.08] dark:bg-[#11151E]">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
            Локальное хранилище
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Все списки, оценки и история хранятся только в localStorage вашего браузера без аккаунта и сервера.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4 text-center dark:bg-[#0B0E15]">
          <div>
            <p className="font-display text-xl font-bold tabular-nums text-slate-950 dark:text-white">
              {watchlistItems.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Посмотреть позже</p>
          </div>
          <div>
            <p className="font-display text-xl font-bold tabular-nums text-slate-950 dark:text-white">
              {watchedItems.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Просмотрено</p>
          </div>
          <div>
            <p className="font-display text-xl font-bold tabular-nums text-slate-950 dark:text-white">
              {favoriteItems.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Избранное</p>
          </div>
        </div>

        <button
          type="button"
          disabled={items.length === 0}
          onClick={() => setConfirmClearOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Очистить локальные данные
        </button>
      </section>

      <ConfirmDialog
        open={confirmClearOpen}
        title="Очистить всю коллекцию и историю?"
        description="Это действие полностью удалит списки «Посмотреть позже», «Просмотрено», «Избранное», личные оценки и историю просмотров из браузера."
        confirmLabel="Очистить всё"
        destructive
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          clearAllData();
          clearKinopoiskClientCache();
          setConfirmClearOpen(false);
        }}
      />
    </div>
  );
}
