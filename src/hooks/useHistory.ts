import { useMemo } from 'react';
import { computeHistoryStats } from '../utils/libraryRules';
import { useLibrary } from './useLibrary';

export function useHistory() {
  const { watchedItems, removeHistoryEntry, rateTitle } = useLibrary();

  const timeline = useMemo(() => {
    return [...watchedItems].sort((a, b) => {
      const dateA = a.watchedAt ?? a.updatedAt;
      const dateB = b.watchedAt ?? b.updatedAt;
      return dateB.localeCompare(dateA);
    });
  }, [watchedItems]);

  const stats = useMemo(() => computeHistoryStats(watchedItems), [watchedItems]);

  return {
    timeline,
    stats,
    removeHistoryEntry,
    rateTitle,
  };
}
