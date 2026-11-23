/**
 * "See all photos" for a photo listing: every photo the host took, whole and
 * uncropped, over the feed card. The tour pans across each photo; this shows it all.
 */
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type GridPhoto = { url: string; caption: string | null };

export const PhotoGrid: React.FC<{ photos: GridPhoto[]; onClose: () => void }> = ({ photos, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // The card underneath swipes between listings: keep every gesture inside the grid
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="All photos of this room"
      data-testid="photo-grid"
      className="absolute inset-0 z-50 bg-[#F9F7F3] text-[#2C2724] flex flex-col cursor-default"
      onClick={stop}
      onWheel={stop}
      onMouseDown={stop}
      onMouseUp={stop}
      onTouchStart={stop}
      onTouchMove={stop}
      onTouchEnd={stop}
    >
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-[#2C2724]/10 shrink-0">
        <h2 className="text-base font-extrabold">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'} from the host
        </h2>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close photos" className="w-10 h-10 rounded-xl hover:bg-[#F2EFE9] flex items-center justify-center">
          <X className="w-5 h-5" />
        </button>
      </div>
      <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 space-y-3">
        {photos.map((p, i) => (
          <li key={p.url}>
            <figure>
              <img src={p.url} alt={p.caption || `Photo ${i + 1} of the room`} loading="lazy" className="w-full h-auto rounded-xl bg-[#2C2724]/5" />
              {p.caption && <figcaption className="text-xs font-bold text-[#6E655F] mt-1.5">{p.caption}</figcaption>}
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
};
