import type { MediaItem } from '../../types';
import { MediaCard } from './MediaCard';

interface MediaGridProps {
  items: MediaItem[];
  showMediaType?: boolean;
  onRemove?: (item: MediaItem) => void;
  removeLabel?: string;
  autoFocusKey?: string | null;
  onItemSelect?: (item: MediaItem) => void;
}

export function MediaGrid({
  items,
  showMediaType = false,
  onRemove,
  removeLabel,
  autoFocusKey = null,
  onItemSelect,
}: MediaGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-5">
      {items.map((item) => {
        const key = `${item.mediaType}:${item.id}`;
        return (
          <MediaCard
            key={key}
            item={item}
            showMediaType={showMediaType}
            onRemove={onRemove}
            removeLabel={removeLabel}
            tvAutoFocus={autoFocusKey === key}
            onSelect={onItemSelect}
          />
        );
      })}
    </div>
  );
}
