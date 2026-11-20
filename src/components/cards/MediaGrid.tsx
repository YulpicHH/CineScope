import type { MediaItem } from '../../types';
import { MediaCard } from './MediaCard';

interface MediaGridProps {
  items: MediaItem[];
}

export function MediaGrid({ items }: MediaGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-5">
      {items.map((item) => (
        <MediaCard key={`${item.mediaType}:${item.id}`} item={item} />
      ))}
    </div>
  );
}
