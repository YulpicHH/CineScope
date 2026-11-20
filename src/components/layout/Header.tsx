import { Link, NavLink } from 'react-router-dom';
import { User } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Главная', end: true },
  { to: '/catalog', label: 'Каталог', end: false },
  { to: '/mood', label: 'По настроению', end: false },
  { to: '/library', label: 'Коллекция', end: false },
  { to: '/history', label: 'История', end: false },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/92 backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#090B10]/92">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="font-display whitespace-nowrap shrink-0 text-xl font-bold tracking-tight text-slate-950 transition-opacity hover:opacity-85 dark:text-white"
        >
          CineScope
        </Link>

        <nav
          aria-label="Основная навигация"
          className="hidden md:flex items-center gap-6"
        >
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative whitespace-nowrap shrink-0 py-1 text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span>{item.label}</span>
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-[19px] h-0.5 bg-blue-600 dark:bg-blue-400"
                    />
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center shrink-0">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-blue-500/40 bg-blue-50 text-blue-700 dark:border-blue-400/40 dark:bg-blue-500/15 dark:text-blue-300'
                  : 'border-slate-200 bg-slate-100/70 text-slate-700 hover:bg-slate-200/70 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.1]'
              }`
            }
          >
            <User className="h-4 w-4" aria-hidden="true" />
            <span>Профиль</span>
          </NavLink>
        </div>
      </div>
    </header>
  );
}
