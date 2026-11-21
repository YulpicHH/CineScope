import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, Search, Star, User as UserIcon, X } from 'lucide-react';
import { useAppMode } from '../../hooks/useAppMode';
import { useDebounce } from '../../hooks/useDebounce';
import { quickSearchCatalog } from '../../services/tmdb';
import { buildProfileImageProps } from '../../utils/imageUrl';
import {
  buildQuickSearchEntries,
  type QuickSearchEntry,
  type QuickSearchResults,
} from '../../utils/quickSearch';
import { saveRouteScroll } from '../../utils/routeViewCache';
import { PosterArtwork } from '../ui/PosterArtwork';

interface QuickSearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function QuickSearchModal({ open, onClose }: QuickSearchModalProps) {
  const navigate = useNavigate();
  const { isDemoMode } = useAppMode();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 260);
  const [results, setResults] = useState<QuickSearchResults>({
    titles: [],
    people: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const entries = useMemo(
    () => buildQuickSearchEntries(results, debouncedQuery, 8, 3),
    [results, debouncedQuery],
  );

  // Фокусируем строку ввода при открытии и сбрасываем состояние при закрытии
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults({ titles: [], people: [] });
      setError(null);
      setLoading(false);
      setActiveIndex(0);
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.cancelAnimationFrame(rafId);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Закрытие по Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Живой быстрый поиск по вводу
  useEffect(() => {
    if (!open) return;
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      setResults({ titles: [], people: [] });
      setLoading(false);
      setError(null);
      setActiveIndex(0);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void quickSearchCatalog(trimmed, isDemoMode, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setResults(res);
        setActiveIndex(0);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Не удалось выполнить быстрый поиск.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [open, debouncedQuery, isDemoMode]);

  if (!open) return null;

  const navigateWithHomeScrollSaved = (to: string) => {
    saveRouteScroll('/', window.scrollY);
    onClose();
    navigate(to);
  };

  const openEntry = (entry: QuickSearchEntry) => {
    if (entry.kind === 'title') {
      navigateWithHomeScrollSaved(
        `/title/${entry.item.mediaType}/${entry.item.id}`,
      );
      return;
    }
    const { person } = entry;
    const href =
      person.id > 0
        ? `/catalog?person=${person.id}&personName=${encodeURIComponent(person.name)}`
        : `/catalog?personName=${encodeURIComponent(person.name)}`;
    navigateWithHomeScrollSaved(href);
  };

  const openCatalogQuery = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    navigateWithHomeScrollSaved(`/catalog?q=${encodeURIComponent(trimmed)}`);
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      if (entries.length === 0) return;
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % entries.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      if (entries.length === 0) return;
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + entries.length) % entries.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const current = entries[activeIndex];
      if (current) {
        openEntry(current);
      } else if (query.trim()) {
        openCatalogQuery();
      }
    }
  };

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const titleEntries = entries.filter(
    (e): e is Extract<QuickSearchEntry, { kind: 'title' }> => e.kind === 'title',
  );
  const personEntries = entries.filter(
    (e): e is Extract<QuickSearchEntry, { kind: 'person' }> =>
      e.kind === 'person',
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 px-4 pt-[10vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Быстрый поиск"
      data-testid="quick-search-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/[0.12] dark:bg-[#11151E]">
        {/* Строка быстрого поиска без лишних параметров */}
        <div className="flex items-center gap-3 border-b border-slate-200/80 px-4 py-3.5 dark:border-white/[0.08]">
          {loading ? (
            <Loader2
              className="h-5 w-5 shrink-0 animate-spin text-blue-500"
              aria-hidden="true"
            />
          ) : (
            <Search
              className="h-5 w-5 shrink-0 text-slate-400"
              aria-hidden="true"
            />
          )}

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            data-testid="quick-search-input"
            placeholder="Название фильма, сериала или имя актёра..."
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base text-slate-950 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-slate-500"
          />

          {hasQuery ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Очистить запрос"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть быстрый поиск"
            data-testid="close-quick-search-button"
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            Esc
          </button>
        </div>

        {/* Результаты */}
        <div className="cinema-scroll max-h-[60vh] overflow-y-auto">
          {!hasQuery ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Быстрый поиск по фильмам, сериалам и актёрам
              </p>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Начните вводить название — без фильтров и лишних шагов
              </p>
            </div>
          ) : error ? (
            <div className="px-5 py-6 text-center text-sm text-rose-500 dark:text-rose-300">
              {error}
            </div>
          ) : entries.length === 0 && !loading ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                По запросу «{trimmedQuery}» ничего не найдено
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200/70 dark:divide-white/[0.06]">
              {titleEntries.length > 0 ? (
                <div className="p-2">
                  <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Фильмы и сериалы
                  </p>
                  <div className="space-y-0.5">
                    {titleEntries.map((entry) => {
                      const flatIndex = entries.indexOf(entry);
                      const isActive = flatIndex === activeIndex;
                      const { item } = entry;
                      return (
                        <button
                          key={entry.key}
                          type="button"
                          data-testid="quick-search-result"
                          onMouseEnter={() => setActiveIndex(flatIndex)}
                          onClick={() => openEntry(entry)}
                          className={`flex w-full items-center gap-3.5 rounded-xl px-3 py-2 text-left transition-colors ${
                            isActive
                              ? 'bg-blue-50 text-slate-950 dark:bg-blue-500/15 dark:text-white'
                              : 'text-slate-800 hover:bg-slate-100/80 dark:text-slate-200 dark:hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="h-14 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200/80 bg-slate-100 dark:border-white/10 dark:bg-[#0B0E15]">
                            <PosterArtwork
                              posterPath={item.posterPath}
                              title={item.title}
                              year={item.year}
                              mediaType={item.mediaType}
                              variant="thumb"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="font-display truncate text-sm font-semibold">
                              {item.title}
                            </p>
                            {item.originalTitle &&
                            item.originalTitle !== item.title ? (
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {item.originalTitle}
                              </p>
                            ) : null}
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <span>
                                {item.mediaType === 'tv' ? 'Сериал' : 'Фильм'}
                              </span>
                              {item.year ? (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="tabular-nums">{item.year}</span>
                                </>
                              ) : null}
                              {item.voteAverage > 0 ? (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-1 tabular-nums text-amber-600 dark:text-amber-300">
                                    <Star
                                      className="h-3 w-3 fill-amber-400 text-amber-400"
                                      aria-hidden="true"
                                    />
                                    {item.voteAverage.toFixed(1)}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <ArrowRight
                            className={`h-4 w-4 shrink-0 transition-opacity ${
                              isActive
                                ? 'text-blue-600 opacity-100 dark:text-blue-400'
                                : 'opacity-0'
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {personEntries.length > 0 ? (
                <div className="p-2">
                  <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Актёры и персоны
                  </p>
                  <div className="space-y-0.5">
                    {personEntries.map((entry) => {
                      const flatIndex = entries.indexOf(entry);
                      const isActive = flatIndex === activeIndex;
                      const { person } = entry;
                      const photoProps = buildProfileImageProps(person.profilePath);
                      return (
                        <button
                          key={entry.key}
                          type="button"
                          data-testid="quick-search-person-result"
                          onMouseEnter={() => setActiveIndex(flatIndex)}
                          onClick={() => openEntry(entry)}
                          className={`flex w-full items-center gap-3.5 rounded-xl px-3 py-2 text-left transition-colors ${
                            isActive
                              ? 'bg-blue-50 text-slate-950 dark:bg-blue-500/15 dark:text-white'
                              : 'text-slate-800 hover:bg-slate-100/80 dark:text-slate-200 dark:hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200/80 bg-slate-100 dark:border-white/10 dark:bg-[#0B0E15]">
                            {photoProps ? (
                              <img
                                src={photoProps.src}
                                srcSet={photoProps.srcSet}
                                sizes="44px"
                                alt={person.name}
                                referrerPolicy="no-referrer"
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <UserIcon
                                className="h-5 w-5 text-slate-400"
                                aria-hidden="true"
                              />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {person.name}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {person.knownForTitle
                                ? `${person.department} · ${person.knownForTitle}`
                                : `${person.department} · Вся фильмография`}
                            </p>
                          </div>

                          <ArrowRight
                            className={`h-4 w-4 shrink-0 transition-opacity ${
                              isActive
                                ? 'text-blue-600 opacity-100 dark:text-blue-400'
                                : 'opacity-0'
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Нижняя строка: быстрый переход ко всем результатам и подсказка клавиш */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200/80 bg-slate-50/80 px-4 py-2.5 text-xs text-slate-500 dark:border-white/[0.08] dark:bg-[#0B0E15]/80 dark:text-slate-400">
          <span>↑↓ навигация · Enter открыть · Esc закрыть</span>
          {hasQuery ? (
            <button
              type="button"
              data-testid="quick-search-open-all-button"
              onClick={openCatalogQuery}
              className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              <span>Все результаты</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
