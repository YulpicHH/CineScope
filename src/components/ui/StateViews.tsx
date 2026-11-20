import type { ReactNode } from 'react';
import { AlertCircle, Film, RefreshCw } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center dark:border-white/[0.08] dark:bg-[#11151E]">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/[0.05] dark:text-slate-400">
        {icon ?? <Film className="h-6 w-6" aria-hidden="true" />}
      </div>
      <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
        {title}
      </h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        {description}
      </p>
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  secondaryAction?: ReactNode;
}

export function ErrorState({
  title = 'Не удалось загрузить данные',
  message,
  onRetry,
  secondaryAction,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/70 px-6 py-10 text-center dark:border-rose-500/25 dark:bg-rose-950/20"
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
        {title}
      </h3>
      <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {message}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Повторить
          </button>
        ) : null}
        {secondaryAction}
      </div>
    </div>
  );
}
