import React from 'react';
import { 
  Pin, 
  Map, 
  Share2,
  Flag
} from 'lucide-react';
import { RoomListing } from '../types';

interface SidebarActionsProps {
  room: RoomListing;
  isPinned: boolean;
  onTogglePin: () => void;
  /** The map (Scout) button; hidden when not given (2.0 keeps Scout behind its flag) */
  onOpenExplore?: () => void;
  onOpenDetails?: () => void;
  onOpenShare: () => void;
  /** Fenly 2.0: report a listing (shown only when given) */
  onReport?: () => void;
}

export const SidebarActions: React.FC<SidebarActionsProps> = ({
  isPinned,
  onTogglePin,
  onOpenExplore,
  onOpenShare,
  onReport,
}) => {
  const label = "text-[11px] font-extrabold text-[#F9F7F3] text-shadow-subtle leading-none";
  const rail =
    'w-11 h-11 rounded-xl bg-[#F9F7F3]/95 hover:bg-white text-[#2C2724] border border-[#2C2724] flex items-center justify-center transition-all active:scale-90 shadow-warm-sm';
  const item = 'flex flex-col items-center gap-1';
  return (
    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-3 pointer-events-auto">
      {/* 1. Save (the Saved list in the header shows these rooms) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        aria-pressed={isPinned}
        aria-label={isPinned ? 'Saved. Tap to remove' : 'Save this room'}
        className={item}
      >
        <span className={isPinned ? 'w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-90 shadow-warm-sm bg-[#B85B3F] text-white border border-[#B85B3F]' : rail}>
          <Pin className={`w-5 h-5 ${isPinned ? 'fill-white stroke-white' : ''}`} aria-hidden="true" />
        </span>
        <span className={label} aria-hidden="true">{isPinned ? 'Saved' : 'Save'}</span>
      </button>

      {/* 2. Map (Scout), only with the scout flag */}
      {onOpenExplore && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenExplore();
          }}
          aria-label="Neighborhood guide"
          className={item}
        >
          <span className={rail}>
            <Map className="w-5 h-5 text-[#485B4A]" aria-hidden="true" />
          </span>
          <span className={label} aria-hidden="true">Area</span>
        </button>
      )}

      {/* 3. Share */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenShare();
        }}
        aria-label="Share this room"
        className={item}
      >
        <span className={rail}>
          <Share2 className="w-5 h-5" aria-hidden="true" />
        </span>
        <span className={label} aria-hidden="true">Share</span>
      </button>

      {onReport && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReport();
          }}
          aria-label="Report this listing"
          className={item}
        >
          <span className={rail}>
            <Flag className="w-5 h-5" aria-hidden="true" />
          </span>
          <span className={label} aria-hidden="true">Report</span>
        </button>
      )}
    </div>
  );
};
