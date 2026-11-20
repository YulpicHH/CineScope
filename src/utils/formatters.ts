export function formatRuntime(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

export function formatSeasonsCount(seasons: number | null): string {
  if (!seasons || seasons <= 0) return '—';
  const mod10 = seasons % 10;
  const mod100 = seasons % 100;
  if (mod10 === 1 && mod100 !== 11) return `${seasons} сезон`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${seasons} сезона`;
  return `${seasons} сезонов`;
}

export function formatRussianDate(isoString: string | null): string {
  if (!isoString) return 'Дата не указана';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Дата не указана';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatVoteCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace('.0', '')} тыс.`;
  }
  return String(count);
}
