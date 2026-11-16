/**
 * Edit a published listing: its details, and its video when the listing was
 * made with the viral editor (the clips, analysis and choices were saved with
 * it, so the editor re-opens instantly without re-analyzing anything).
 */
import React, { Suspense, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, RefreshCw, Trash2, X } from 'lucide-react';
import type { RoomListing } from '../types';
import type { ViralListingInfo } from '../remotion/viral/types';
import type { ViralVideoResult } from './ViralVideoEditor';
import type { RecordedViralSlotMedia } from './GuidedViralTourStudio';
import { GUIDED_SHOTS } from '../utils/guidedShots';
import { ConfirmDeleteListing } from './ListingActionsRow';

const ViralVideoEditor = React.lazy(() =>
  import('./ViralVideoEditor').then((m) => ({ default: m.ViralVideoEditor }))
);

interface EditListingModalProps {
  room: RoomListing;
  onClose: () => void;
  onSave: (updated: RoomListing) => void;
  onDelete: (roomId: string) => void;
}

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-[#2C2724]/20 bg-white text-xs font-semibold text-[#2C2724] focus:outline-none focus:border-[#D06C4E]';

export const EditListingModal: React.FC<EditListingModalProps> = ({ room, onClose, onSave, onDelete }) => {
  const [title, setTitle] = useState(room.title);
  const [price, setPrice] = useState(String(room.price));
  const [deposit, setDeposit] = useState(String(room.deposit));
  const [description, setDescription] = useState(room.description);
  const [newVideo, setNewVideo] = useState<ViralVideoResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saved = room.viralEdit;
  const canEditVideo = Boolean(saved && saved.clips.length > 0 && saved.clips.every((c) => c.videoUrl));

  const recordedMedia = useMemo<Record<number, RecordedViralSlotMedia>>(
    () =>
      Object.fromEntries(
        (saved?.clips ?? []).map((c) => [
          c.slotNumber,
          {
            slotNumber: c.slotNumber,
            videoUrl: c.videoUrl,
            thumbnailUrl: c.thumbnailUrl,
            durationSec: c.durationSec,
            isLandscape: c.isLandscape,
            source: c.source,
          },
        ])
      ),
    [saved]
  );

  const rent = Number(price);
  const priceValid = Number.isFinite(rent) && rent > 0;
  // The facts the video was made from, with the rent as edited here
  const viralListing = useMemo<ViralListingInfo>(
    () => ({
      ...(saved?.listing ?? {
        monthlyRent: room.price,
        beds: 1,
        baths: 1,
        neighborhood: room.neighborhood,
        city: room.city,
        roomType: room.roomType,
        squareFeet: room.squareFeet,
        amenities: room.amenities,
        leaseTerm: room.leaseTerm,
      }),
      monthlyRent: priceValid ? rent : room.price,
    }),
    [rent, priceValid, room, saved]
  );

  const priceChangedWithoutVideo = room.tourFormat === 'viral_edit' && priceValid && rent !== room.price && !newVideo;
  const dirty =
    title.trim() !== room.title ||
    (priceValid && rent !== room.price) ||
    Number(deposit) !== room.deposit ||
    description !== room.description ||
    Boolean(newVideo);

  const handleSave = () => {
    if (!priceValid || !title.trim()) return;
    const updated: RoomListing = {
      ...room,
      title: title.trim(),
      price: rent,
      deposit: Number(deposit) >= 0 ? Number(deposit) : room.deposit,
      description,
    };
    if (newVideo && saved) {
      const shots = newVideo.plan.shots;
      updated.videoUrl = newVideo.url;
      updated.tourFormat = 'viral_edit';
      updated.viralEdit = { ...newVideo.edit, clips: saved.clips };
      updated.customScenes = shots.map((shot, idx) => ({
        label: `Clip ${idx + 1}/${shots.length} • ${shot.room}`,
        caption: shot.tag || newVideo.plan.hook.text,
        imageUrl:
          saved.clips.find((c) => c.slotNumber === shot.slotNumber)?.thumbnailUrl ||
          GUIDED_SHOTS.find((g) => g.slotNumber === shot.slotNumber)?.sampleThumbnailUrl ||
          room.fallbackThumbnail,
        isCtaClip: idx === shots.length - 1,
      }));
    }
    onSave(updated);
    onClose();
  };

  return (
    <div
      data-testid="edit-listing-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
    >
      <div
        className="w-full h-full sm:max-w-[440px] sm:max-h-[920px] sm:h-[96vh] sm:rounded-[32px] bg-[#F9F7F3] text-[#2C2724] border-0 sm:border-2 sm:border-[#2C2724]/25 flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-[#2C2724]/15 bg-[#F9F7F3] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to Active Room Listing"
              className="w-9 h-9 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 transition-all active:scale-90"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm text-[#2C2724] truncate">Edit Listing</h3>
              <p className="text-[11px] text-[#6E655F] truncate">{room.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Edit Listing"
            className="w-8 h-8 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/20 text-[#2C2724] flex items-center justify-center shrink-0 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
          {/* Details */}
          <div className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-3">
            <h4 className="font-extrabold text-xs text-[#2C2724]">Listing details</h4>
            <label className="block space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F]">Title</span>
              <input
                data-testid="edit-listing-title"
                value={title}
                maxLength={90}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F]">Monthly rent ($)</span>
                <input
                  data-testid="edit-listing-price"
                  type="number"
                  min={1}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F]">Deposit ($)</span>
                <input
                  data-testid="edit-listing-deposit"
                  type="number"
                  min={0}
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F]">Description</span>
              <textarea
                data-testid="edit-listing-description"
                value={description}
                rows={4}
                onChange={(e) => setDescription(e.target.value)}
                className={`${inputClass} resize-none leading-snug`}
              />
            </label>
          </div>

          {/* Video */}
          {canEditVideo && saved ? (
            <Suspense
              fallback={
                <div className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm flex items-center gap-2 text-[11px] font-bold text-[#6E655F]">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#D06C4E]" />
                  Loading editor…
                </div>
              }
            >
              <ViralVideoEditor
                mode="edit"
                listing={viralListing}
                recordedMedia={recordedMedia}
                aiHints={saved.aiHints}
                initialSettings={saved.settings}
                initialAnalyses={saved.analyses}
                onVideoReady={setNewVideo}
              />
            </Suspense>
          ) : (
            <div
              data-testid="edit-listing-no-video"
              className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm text-[11px] text-[#6E655F] leading-snug"
            >
              {room.tourFormat === 'viral_edit'
                ? 'This video was published before editing was saved with listings, so it can’t be re-edited. Post it again to make a new edit.'
                : 'This tour is made from photos. Create a new listing with the guided 5-shot video to get an editable video.'}
            </div>
          )}

          {newVideo && (
            <p
              data-testid="edit-listing-new-video"
              className="text-[11px] font-bold text-[#485B4A] bg-[#E8EFE9] border border-[#7A907C]/50 rounded-xl px-3 py-2 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5 shrink-0" />
              New video ready. Save changes to put it on your listing.
            </p>
          )}
          {priceChangedWithoutVideo && (
            <p
              data-testid="edit-listing-price-warning"
              className="text-[11px] font-semibold text-[#9A4A33] bg-[#D06C4E]/10 border border-[#D06C4E]/40 rounded-xl px-3 py-2 flex items-start gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Your video still shows ${room.price.toLocaleString('en-US')}/mo. Make a new video above so it shows the new rent.
            </p>
          )}

          {/* Actions */}
          <div className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-2">
            <button
              type="button"
              data-testid="edit-listing-save"
              disabled={!dirty || !priceValid || !title.trim()}
              onClick={handleSave}
              className="w-full py-3 bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-extrabold text-xs rounded-xl shadow-warm-sm transition-all flex items-center justify-center gap-2 active:scale-95 disabled:bg-[#2C2724]/15 disabled:text-[#6E655F] disabled:shadow-none disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              Save changes
            </button>
            <button
              type="button"
              data-testid="edit-listing-delete"
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2.5 bg-white hover:bg-[#D06C4E]/10 text-[#9A4A33] border border-[#D06C4E]/50 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 active:scale-95"
            >
              <Trash2 className="w-4 h-4" />
              Delete listing
            </button>
          </div>
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDeleteListing
          room={room}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            onDelete(room.id);
            onClose();
          }}
        />
      )}
    </div>
  );
};
