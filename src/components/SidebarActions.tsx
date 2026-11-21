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
  return (
    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-3 pointer-events-auto">
      {/* 1. Pin Icon Button ("Save to My Den") */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all transform active:scale-90 shadow-warm-sm ${
          isPinned
            ? 'bg-[#B85B3F] text-white border border-[#D06C4E]'
            : 'bg-[#F9F7F3]/95 hover:bg-white text-[#2C2724] border border-[#2C2724]'
        }`}
        title="Save to My Den"
        aria-label="Save to My Den"
      >
        <Pin className={`w-4 h-4 ${isPinned ? 'fill-white stroke-white' : ''}`} />
      </button>

      {/* 2. Explore (Map Icon) Button ("Scout Neighborhood"), only with the scout flag */}
      {onOpenExplore && (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpenExplore();
        }}
        className="w-10 h-10 rounded-xl bg-[#F9F7F3]/95 hover:bg-white text-[#2C2724] border border-[#2C2724] flex items-center justify-center transition-all transform active:scale-90 shadow-warm-sm"
        title="Fenn Scout Neighborhood Guide"
        aria-label="Fenn Scout Neighborhood Guide"
      >
        <Map className="w-4 h-4 text-[#7A907C]" />
      </button>
      )}

      {/* 3. Share Icon Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpenShare();
        }}
        className="w-10 h-10 rounded-xl bg-[#F9F7F3]/95 hover:bg-white text-[#2C2724] border border-[#2C2724] flex items-center justify-center transition-all transform active:scale-90 shadow-warm-sm"
        title="Share Listing"
        aria-label="Share Listing"
      >
        <Share2 className="w-4 h-4" />
      </button>

      {onReport && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReport();
          }}
          className="w-10 h-10 rounded-xl bg-[#F9F7F3]/95 hover:bg-white text-[#2C2724] border border-[#2C2724] flex items-center justify-center transition-all transform active:scale-90 shadow-warm-sm"
          title="Report listing"
          aria-label="Report listing"
        >
          <Flag className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
