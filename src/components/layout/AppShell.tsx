import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppMode } from '../../hooks/useAppMode';
import { Toast } from '../ui/Toast';
import { Header } from './Header';
import { MobileNav } from './MobileNav';

export function AppShell({ children }: { children: ReactNode }) {
  const { isDemoMode, hasApiKey, exitDemoMode } = useAppMode();

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-[#F6F7FA] text-slate-900 dark:bg-[#090B10] dark:text-[#F3F5F9]">
      <Header />

      {isDemoMode && !hasApiKey ? (
        <div className="border-b border-blue-200/80 bg-blue-50/80 px-4 py-2 text-xs text-blue-900 dark:border-blue-500/20 dark:bg-blue-950/30 dark:text-blue-200">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 sm:px-2 lg:px-4">
            <span>
              Демо-режим: показаны демонстрационные данные без живого подключения к TMDB API.
            </span>
            <button
              type="button"
              onClick={exitDemoMode}
              className="font-semibold underline underline-offset-2 hover:opacity-80"
            >
              Инструкция по подключению ключа
            </button>
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-12 lg:px-8">
        {children}
      </main>

      <footer className="hidden border-t border-slate-200/80 py-6 text-xs text-slate-500 dark:border-white/[0.06] dark:text-slate-400 md:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <p>CineScope — персональный каталог фильмов и сериалов</p>
          <div className="flex items-center gap-6">
            <Link to="/catalog" className="hover:text-slate-900 dark:hover:text-white">
              Каталог и подбор
            </Link>
            <Link to="/library" className="hover:text-slate-900 dark:hover:text-white">
              Моя коллекция
            </Link>
            <Link to="/profile" className="hover:text-slate-900 dark:hover:text-white">
              Настройки
            </Link>
          </div>
        </div>
      </footer>

      <MobileNav />
      <Toast />
    </div>
  );
}
