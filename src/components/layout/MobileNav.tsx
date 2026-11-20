import { NavLink } from 'react-router-dom';
import { Bookmark, Clock, Compass, Home, Settings } from 'lucide-react';
import { useAppMode } from '../../hooks/useAppMode';

const MOBILE_TABS = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/catalog', label: 'Каталог', icon: Compass, end: false },
  { to: '/library', label: 'Коллекция', icon: Bookmark, end: false },
  { to: '/history', label: 'История', icon: Clock, end: false },
];

export function MobileNav() {
  const { openSettingsModal, settingsModalOpen } = useAppMode();

  return (
    <nav
      aria-label="Мобильная навигация"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#090B10]/95 md:hidden"
    >
      <div className="grid h-16 grid-cols-5">
        {MOBILE_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex min-h-[44px] flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`
              }
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-full">{tab.label}</span>
            </NavLink>
          );
        })}

        <button
          type="button"
          onClick={openSettingsModal}
          aria-label="Настройки API-ключей"
          data-testid="mobile-settings-button"
          className={`flex min-h-[44px] flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${
            settingsModalOpen
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          <Settings className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="truncate max-w-full">Настройки</span>
        </button>
      </div>
    </nav>
  );
}
