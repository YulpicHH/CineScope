import { X } from 'lucide-react';
import { useToast } from '../../hooks/useLibrary';

export function Toast() {
  const { toast, dismissToast } = useToast();

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="safe-toast-offset fixed z-50 flex max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-lg dark:border-white/15 dark:bg-[#141923] dark:text-slate-100 md:w-auto"
    >
      <span className="flex-1">{toast.text}</span>
      <button
        type="button"
        onClick={dismissToast}
        aria-label="Скрыть уведомление"
        className="rounded-md p-1 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
