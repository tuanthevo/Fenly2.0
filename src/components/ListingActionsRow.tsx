/**
 * One listing in Home > Landlord > Active Room Listing.
 *
 * Phones (touch, no hover): swipe right-to-left to reveal Edit and Delete.
 * Computers (mouse): an Edit button sits at the top of the card; Delete is in
 * the edit screen. Tapping or clicking the card still opens the tour.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import type { RoomListing } from '../types';

const ACTIONS_WIDTH = 152;
const OPEN_THRESHOLD = 56;

/** True on devices with a mouse or trackpad (hover + fine pointer). */
export function useCanHover(): boolean {
  const query = '(hover: hover) and (pointer: fine)';
  const [canHover, setCanHover] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : true
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setCanHover(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return canHover;
}

interface ListingActionsRowProps {
  room: RoomListing;
  canHover: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const ListingActionsRow: React.FC<ListingActionsRowProps> = ({ room, canHover, onView, onEdit, onDelete }) => {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; start: number; horizontal: boolean | null; moved: boolean } | null>(null);
  const open = offset <= -ACTIONS_WIDTH + 1;

  const onTouchStart = (e: React.TouchEvent) => {
    if (canHover) return;
    const t = e.touches[0];
    drag.current = { x: t.clientX, y: t.clientY, start: offset, horizontal: null, moved: false };
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d) return;
    const t = e.touches[0];
    const dx = t.clientX - d.x;
    const dy = t.clientY - d.y;
    // Decide once whether this is a sideways swipe or a page scroll
    if (d.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) d.horizontal = Math.abs(dx) > Math.abs(dy);
    if (!d.horizontal) return;
    d.moved = true;
    setOffset(Math.max(-ACTIONS_WIDTH - 24, Math.min(0, d.start + dx)));
  };
  const onTouchEnd = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d?.moved) return;
    setOffset((o) => (o < -OPEN_THRESHOLD ? -ACTIONS_WIDTH : 0));
  };

  const handleCardClick = () => {
    if (drag.current?.moved) return;
    if (offset !== 0) {
      setOffset(0);
      return;
    }
    onView();
  };

  return (
    <div
      data-testid={`active-listing-${room.id}`}
      className="relative rounded-2xl overflow-hidden"
    >
      {/* Swipe actions (phones) */}
      {!canHover && (
        <div
          className="absolute inset-y-0 right-0 flex items-stretch"
          style={{ width: ACTIONS_WIDTH }}
          aria-hidden={!open}
        >
          <button
            type="button"
            data-testid={`listing-swipe-edit-${room.id}`}
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setOffset(0);
              onEdit();
            }}
            className="flex-1 bg-[#2C2724] text-[#F9F7F3] flex flex-col items-center justify-center gap-1 text-[11px] font-extrabold active:opacity-80"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </button>
          <button
            type="button"
            data-testid={`listing-swipe-delete-${room.id}`}
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setOffset(0);
              onDelete();
            }}
            className="flex-1 bg-[#D06C4E] text-white flex flex-col items-center justify-center gap-1 text-[11px] font-extrabold active:opacity-80"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}

      {/* Card */}
      <div
        onClick={handleCardClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
          touchAction: 'pan-y',
        }}
        className="relative p-3 rounded-2xl bg-white border border-[#2C2724]/10 hover:bg-[#FCFBF9] cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-3">
          <img
            src={room.fallbackThumbnail}
            alt={room.title}
            draggable={false}
            className="w-11 h-11 rounded-lg object-cover shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-[#2C2724] truncate">{room.title}</div>
            <div className="text-[11px] text-[#6E655F] truncate">
              ${room.price}/mo · {room.location}
            </div>
          </div>
          {/* Edit (computers); phones swipe instead */}
          {canHover && (
            <button
              type="button"
              data-testid={`listing-edit-btn-${room.id}`}
              aria-label={`Edit ${room.title}`}
              title="Edit"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="w-10 h-10 rounded-lg hover:bg-[#F2EFE9] text-[#2C2724] flex items-center justify-center shrink-0"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
};

/** "Delete this listing?" confirmation, shared by the swipe action and the edit screen. */
export const ConfirmDeleteListing: React.FC<{
  room: RoomListing;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ room, onCancel, onConfirm }) => (
  <div
    data-testid="confirm-delete-listing"
    className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fadeIn"
    onClick={onCancel}
  >
    <div
      role="alertdialog"
      aria-labelledby="confirm-delete-title"
      className="w-full max-w-[400px] rounded-3xl bg-[#F9F7F3] border-2 border-[#2C2724]/20 p-4 space-y-3 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <h3 id="confirm-delete-title" className="text-sm font-extrabold text-[#2C2724]">
        Delete this listing?
      </h3>
      <p className="text-xs text-[#6E655F] leading-snug">
        <span className="font-bold text-[#2C2724]">{room.title}</span> will be removed from the feed, along with its
        video and clips on this device. This can’t be undone.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="confirm-delete-cancel"
          onClick={onCancel}
          className="py-2.5 rounded-xl bg-white border border-[#2C2724]/30 text-[#2C2724] text-xs font-extrabold active:scale-95"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="confirm-delete-confirm"
          onClick={onConfirm}
          className="py-2.5 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-xs font-extrabold active:scale-95"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
);
