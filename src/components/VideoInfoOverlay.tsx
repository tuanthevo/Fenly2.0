import React from 'react';
import {
  MapPin,
  Check,
  ShieldCheck,
  Bookmark,
  BedDouble,
  Lock,
  Video,
} from 'lucide-react';
import { RoomListing, Host } from '../types';
import { getRoomBedBathTag } from '../utils/trustSafety';

interface VideoInfoOverlayProps {
  room: RoomListing;
  onViewHostProfile: (host: Host) => void;
  onOpenDetails: () => void;
  onRequestToBook?: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export const VideoInfoOverlay: React.FC<VideoInfoOverlayProps> = ({
  room,
  onViewHostProfile,
  onOpenDetails,
  onRequestToBook,
  isPinned = false,
  onTogglePin,
}) => {
  const bedBathTag = getRoomBedBathTag(room);

  return (
    <div className="absolute left-0 right-0 bottom-0 p-4 z-20 pointer-events-auto bg-gradient-to-t from-[#2C2724]/95 via-[#2C2724]/75 to-transparent flex flex-col justify-end">
      {/* Top Row: @HostName, Verified Host & Escrow Icons, and Rent Pricing Placed Next to Icons */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <button
          type="button"
          onClick={() => onViewHostProfile(room.host)}
          className="min-h-10 font-extrabold text-sm text-[#F9F7F3] hover:text-[#D06C4E] transition-colors flex items-center gap-1.5 text-shadow-subtle"
        >
          <span>@{room.host.name}</span>
        </button>

        {room.host.verified && (
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 shadow-xs"
            title="Verified Host"
            aria-label="Verified Host"
          >
            <Check className="w-3 h-3 stroke-[2.5] text-[#7A907C]" />
          </span>
        )}

        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 shadow-xs"
          title="Move-In Escrow Active"
          aria-label="Move-In Escrow Active"
        >
          <ShieldCheck className="w-3 h-3 text-[#7A907C]" />
        </span>

        {/* Rent Pricing Placed Next to Verification Icons */}
        <span
          data-testid="feed-tag-price"
          className="ml-0.5 text-xs sm:text-sm font-black text-[#2C2724] bg-[#F9F7F3] px-2.5 py-0.5 rounded-xl border border-[#2C2724]/25 shadow-warm-sm"
        >
          ${room.price.toLocaleString()}
          <span className="text-[10px] font-bold text-[#2C2724]/70">/mo</span>
        </span>
      </div>

      {/* Bed/Bath & Neighborhood Tags */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span
          data-testid="feed-tag-bedbath"
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#2C2724]/75 backdrop-blur-md border border-[#F9F7F3]/25 text-[#F9F7F3] text-[10px] font-extrabold"
        >
          <BedDouble className="w-3 h-3 text-[#D06C4E]" />
          <span>{bedBathTag}</span>
        </span>

        <span
          data-testid="feed-tag-neighborhood"
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#2C2724]/75 backdrop-blur-md border border-[#F9F7F3]/25 text-[#F9F7F3] text-[10px] font-extrabold"
        >
          <MapPin className="w-3 h-3 text-[#D06C4E]" />
          <span>{room.neighborhood}</span>
        </span>
      </div>

      {/* Room Title Only (Description is shown in Listing Details) */}
      <h2
        onClick={onOpenDetails}
        className="font-extrabold text-sm sm:text-base text-[#F9F7F3] hover:underline transition-colors text-shadow-subtle cursor-pointer mb-3 line-clamp-2"
      >
        {room.title}
      </h2>

      {/* Bottom Action Row: Listing Details & Solid Terracotta Request to Book */}
      <div className="flex items-center gap-2 w-full">
        <button
          type="button"
          onClick={onOpenDetails}
          className="min-h-11 py-2.5 px-3.5 rounded-xl bg-[#F9F7F3]/95 hover:bg-white text-[#2C2724] border border-[#2C2724] font-extrabold text-xs transition-all active:scale-95 shrink-0"
        >
          Listing Details
        </button>

        <button
          type="button"
          onClick={onRequestToBook || onOpenDetails}
          className="flex-1 min-h-11 py-2.5 px-3.5 rounded-xl bg-[#B85B3F] hover:bg-[#A9513A] text-white font-extrabold text-xs shadow-warm-sm transition-all active:scale-95 text-center"
        >
          Request to Book
        </button>
      </div>
    </div>
  );
};
