import { Film, KeyRound, Play, Sparkles } from 'lucide-react';
import { useAppMode } from '../hooks/useAppMode';

export function SetupPage() {
  const { enterDemoMode } = useAppMode();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F6F7FA] px-4 py-12 text-slate-900 dark:bg-[#090B10] dark:text-[#F3F5F9]">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-white/[0.08] dark:bg-[#11151E] sm:p-10">
        <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400">
          <Film className="h-6 w-6" aria-hidden="true" />
          <span className="font-display text-xl font-bold tracking-tight text-slate-950 dark:text-white">
            CineScope
          </span>
        </div>

        <h1 className="font-display mt-6 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
          Подключите ключ TMDB API или откройте демо-режим
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
          Для загрузки актуального каталога фильмов, сериалов, постеров, актёрского состава и трейлеров
          CineScope использует базу TMDB. Сейчас переменная окружения{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 dark:bg-white/10 dark:text-blue-300">
            VITE_TMDB_API_KEY
          </code>{' '}
          не задана.
        </p>

        <div className="mt-6 space-y-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-5 dark:border-white/[0.08] dark:bg-[#0B0E15]">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <KeyRound className="h-4 w-4 text-blue-500" aria-hidden="true" />
            <span>Как подключить TMDB за 2 минуты</span>
          </div>
          <ol className="list-inside list-decimal space-y-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            <li>
              Создайте бесплатный аккаунт на{' '}
              <span className="font-medium text-slate-900 dark:text-white">themoviedb.org</span> и
              выпустите API Key (v3 auth) в разделе настроек API.
            </li>
            <li>
              Добавьте переменную{' '}
              <code className="rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">
                VITE_TMDB_API_KEY=&quot;ваш_ключ&quot;
              </code>{' '}
              в файл <code className="font-mono text-xs">.env</code> или в настройки окружения проекта.
            </li>
            <li>Перезапустите сервер разработки, чтобы клиент подхватил ключ.</li>
          </ol>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={enterDemoMode}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Перейти в демо-режим
          </button>

          <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Sparkles className="h-4 w-4 shrink-0 text-violet-500" aria-hidden="true" />
            <span>
              В демо-режиме доступны 15 культовых фильмов и сериалов, фильтры, библиотека, история и подбор по настроению.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
