import type {
  MediaType,
  MoodDefinition,
  MoodId,
} from '../types';

export const MOOD_DEFINITIONS: MoodDefinition[] = [
  {
    id: 'mysterious',
    label: 'Атмосферное и загадочное',
    description: 'Тайны, туманные недомолвки и ощущение неизведанного',
    movieGenreIds: [9648, 14, 18],
    tvGenreIds: [9648, 10765, 18],
  },
  {
    id: 'light_fun',
    label: 'Лёгкое и весёлое',
    description: 'Ирония, светлое настроение и отдых без лишнего напряжения',
    movieGenreIds: [35, 10751, 16],
    tvGenreIds: [35, 10751, 16],
  },
  {
    id: 'tense',
    label: 'Напряжённое',
    description: 'Высокие ставки, динамика и постоянный саспенс',
    movieGenreIds: [53, 80, 28],
    tvGenreIds: [80, 10759, 9648],
  },
  {
    id: 'warm_soulful',
    label: 'Тёплое и душевное',
    description: 'Человеческие истории о близости, поддержке и надежде',
    movieGenreIds: [18, 10749, 10751],
    tvGenreIds: [18, 10751, 35],
  },
  {
    id: 'dark_deep',
    label: 'Мрачное и глубокое',
    description: 'Сложные характеры, глубина и тяжёлый выбор',
    movieGenreIds: [18, 27, 80],
    tvGenreIds: [18, 80, 9648],
  },
  {
    id: 'intellectual',
    label: 'Интеллектуальное',
    description: 'Сложные концепции, идеи, научная фантастика и история',
    movieGenreIds: [18, 878, 36, 99],
    tvGenreIds: [18, 10765, 99],
  },
  {
    id: 'inspiring',
    label: 'Вдохновляющее',
    description: 'Преодоление, путь вперёд и сила человеческого духа',
    movieGenreIds: [18, 12, 36],
    tvGenreIds: [18, 10759, 99],
  },
  {
    id: 'plot_twist',
    label: 'С неожиданной концовкой',
    description: 'Запутанные головоломки, где всё меняется в финале',
    movieGenreIds: [53, 9648],
    tvGenreIds: [9648, 80, 18],
    sortBy: 'vote_average.desc',
    minVoteCount: 1000,
  },
  {
    id: 'friends_night',
    label: 'Для вечера с друзьями',
    description: 'Динамичное, зрелищное и весёлое кино для компании',
    movieGenreIds: [35, 28, 12],
    tvGenreIds: [35, 10759],
  },
  {
    id: 'visual_beauty',
    label: 'Красивая визуальная картинка',
    description: 'Выразительная операторская работа, масштаб и эстетика кадра',
    movieGenreIds: [14, 878, 12],
    tvGenreIds: [10765, 10759],
  },
];

export function getMoodGenresForMediaType(
  selectedMoods: MoodId[],
  mediaType: MediaType,
): {
  genreIds: number[];
  sortBy: 'vote_average.desc' | 'popularity.desc';
  minVoteCount: number;
} {
  const genreSet = new Set<number>();
  let sortBy: 'vote_average.desc' | 'popularity.desc' = 'popularity.desc';
  let minVoteCount = 200;

  for (const moodId of selectedMoods) {
    const def = MOOD_DEFINITIONS.find((m) => m.id === moodId);
    if (!def) continue;
    const ids = mediaType === 'movie' ? def.movieGenreIds : def.tvGenreIds;
    for (const id of ids) {
      genreSet.add(id);
    }
    if (def.sortBy === 'vote_average.desc') {
      sortBy = 'vote_average.desc';
    }
    if (typeof def.minVoteCount === 'number' && def.minVoteCount > minVoteCount) {
      minVoteCount = def.minVoteCount;
    }
  }

  return {
    genreIds: Array.from(genreSet),
    sortBy,
    minVoteCount,
  };
}

export function buildMoodReasonFallback(
  selectedMoods: MoodId[],
  genreNames: string[],
): string {
  const labels = selectedMoods
    .map((id) => MOOD_DEFINITIONS.find((m) => m.id === id)?.label)
    .filter((l): l is string => Boolean(l));

  if (labels.length > 0 && genreNames.length > 0) {
    return `Совпадает с настроением «${labels[0]}» за счёт сочетания жанров: ${genreNames.slice(0, 2).join(', ').toLowerCase()}.`;
  }
  if (labels.length > 0) {
    return `Подходит под выбранное настроение «${labels[0]}».`;
  }
  return genreNames.length > 0
    ? `Подобрано по жанрам: ${genreNames.slice(0, 3).join(', ').toLowerCase()}.`
    : 'Подобрано по вашим параметрам фильтрации.';
}
