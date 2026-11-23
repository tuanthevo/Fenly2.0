/**
 * Guided photo capture for photo listings: tips once, then one shot per screen
 * with a line drawing of where to stand, a one-line instruction, and Take photo /
 * Choose from library / Retake. Checks show as warnings and never block.
 */
import React, { useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, Images, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { MAX_PHOTOS, PHOTO_SHOTS, PHOTO_TIPS, canAddPhoto, photoProgressText, type PhotoShot, type PhotoSlot } from '../../fill/photoShots';
import type { DraftPhoto, PhotoDraft } from './usePhotoDraft';

const card = 'p-4 rounded-2xl bg-white border border-[#2C2724]/10';
const primaryBtn =
  'w-full min-h-11 py-3 rounded-xl bg-[#B85B3F] hover:bg-[#A9513A] disabled:opacity-50 text-white text-sm font-extrabold flex items-center justify-center gap-2 active:scale-95 transition-all';
const secondaryBtn =
  'w-full min-h-11 py-2.5 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/15 text-[#2C2724] text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50';

const EXTRA_SHOT: PhotoShot = { slot: 'other', name: 'Another photo', instruction: 'Anything else worth showing, like a desk nook or a backyard.', required: false };

/* ---------- Where to stand: a floor plan with the camera spot and what it sees ---------- */

type Stand = { x: number; y: number; aim: number; plan: 'room' | 'closet' | 'front' };
/** x, y in the 120 x 90 plan; aim in degrees (0 = right, 90 = down). The door is bottom left, the window is on the top wall. */
const STAND: Record<PhotoSlot, Stand> = {
  doorway: { x: 30, y: 74, aim: -50, plan: 'room' },
  center: { x: 60, y: 46, aim: -90, plan: 'room' },
  corner: { x: 98, y: 22, aim: 145, plan: 'room' },
  storage: { x: 62, y: 46, aim: 0, plan: 'closet' },
  kitchen: { x: 30, y: 74, aim: -50, plan: 'room' },
  bathroom: { x: 30, y: 74, aim: -50, plan: 'room' },
  living: { x: 98, y: 22, aim: 145, plan: 'room' },
  building: { x: 60, y: 76, aim: -90, plan: 'front' },
  other: { x: 60, y: 46, aim: -90, plan: 'room' },
};

const StandDiagram: React.FC<{ slot: PhotoSlot; name: string }> = ({ slot, name }) => {
  const s = STAND[slot];
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const edge = (deg: number, len: number) => `${(s.x + Math.cos(rad(deg)) * len).toFixed(1)},${(s.y + Math.sin(rad(deg)) * len).toFixed(1)}`;
  const ink = '#2C2724';
  return (
    <svg viewBox="0 0 120 90" role="img" aria-label={`Where to stand for the ${name.toLowerCase()} photo`} className="w-full h-auto max-h-40">
      {s.plan === 'front' ? (
        <g fill="none" stroke={ink} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
          <path d="M28 52V14h64v38" />
          <path d="M52 52V36h16v16" />
          <path d="M38 22h10v9H38zM72 22h10v9H72z" />
          <path d="M14 52h92" />
        </g>
      ) : (
        <g fill="none" stroke={ink} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
          {/* walls, with a gap for the door (bottom left) */}
          <path d="M40 82h70V10H10v72h8" />
          {/* door, swung open */}
          <path d="M18 82V64" />
          <path d="M18 64a18 18 0 0 1 18 18" strokeDasharray="2 3" strokeWidth="1" />
          {/* window on the far wall */}
          <path d="M44 10h32" stroke="#7A907C" strokeWidth="3.4" />
          {s.plan === 'closet' && <path d="M110 28H96v36h14M96 46h14" />}
        </g>
      )}
      {/* what the camera sees */}
      <polygon points={`${s.x},${s.y} ${edge(s.aim - 32, 40)} ${edge(s.aim + 32, 40)}`} fill="#D06C4E" opacity="0.2" />
      <g stroke="#A9513A" strokeWidth="1.2" strokeLinecap="round">
        <path d={`M${s.x},${s.y} L${edge(s.aim - 32, 40)}`} />
        <path d={`M${s.x},${s.y} L${edge(s.aim + 32, 40)}`} />
      </g>
      <circle cx={s.x} cy={s.y} r="5" fill="#B85B3F" stroke="#fff" strokeWidth="1.6" />
    </svg>
  );
};

/* ---------- Capture ---------- */

interface PhotoShotCaptureProps {
  draft: PhotoDraft;
  /** Shown under the header: a problem opening a photo */
  onError: (message: string | null) => void;
}

export const PhotoShotCapture: React.FC<PhotoShotCaptureProps> = ({ draft, onError }) => {
  const { photos, slots } = draft;
  const [tipsSeen, setTipsSeen] = useState(photos.length > 0);
  const [index, setIndex] = useState(() => {
    const firstOpen = PHOTO_SHOTS.findIndex((s) => !slots.includes(s.slot));
    return firstOpen < 0 ? PHOTO_SHOTS.length : firstOpen;
  });
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  const extras = photos.filter((p) => p.slot === 'other');
  const onExtras = index >= PHOTO_SHOTS.length;
  const shot = onExtras ? EXTRA_SHOT : PHOTO_SHOTS[index];
  const taken: DraftPhoto | undefined = onExtras ? undefined : photos.find((p) => p.slot === shot.slot);
  const busy = draft.adding !== null;
  const full = !canAddPhoto(photos.length);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // the same file can be picked again after a retake
    if (!file) return;
    onError(null);
    try {
      await draft.add(shot.slot, file);
    } catch (error) {
      onError(error instanceof Error ? error.message : "That photo couldn't be added. Try again.");
    }
  };

  if (!tipsSeen) {
    return (
      <div className={`${card} space-y-3`} data-testid="photo-tips">
        <div>
          <h3 className="text-base font-extrabold">Before your first photo</h3>
          <p className="text-xs text-[#6E655F] mt-1">Four photos of the room, then any shared spaces you want to show.</p>
        </div>
        <ul className="space-y-2">
          {PHOTO_TIPS.map((tip) => (
            <li key={tip} className="flex items-start gap-2 text-sm text-[#2C2724] leading-snug">
              <Check className="w-4 h-4 text-[#7A907C] shrink-0 mt-0.5" aria-hidden="true" />
              {tip}
            </li>
          ))}
        </ul>
        <button type="button" className={primaryBtn} onClick={() => setTipsSeen(true)} data-testid="photo-tips-start">
          Start with the doorway
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="photo-capture">
      <p className="text-xs font-bold text-[#6E655F] px-1" role="status" data-testid="photo-progress">
        {photoProgressText(slots)}
      </p>

      <div className={`${card} space-y-3`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold leading-tight">{shot.name}</h3>
            <p className="text-sm text-[#2C2724] mt-1 leading-snug">{shot.instruction}</p>
          </div>
          <span
            className={`px-2 py-1 rounded-full text-xs font-bold shrink-0 ${
              shot.required ? 'bg-[#D06C4E]/10 text-[#A9513A]' : 'bg-[#F2EFE9] text-[#6E655F]'
            }`}
          >
            {shot.required ? 'Required' : 'Optional'}
          </span>
        </div>

        {taken ? (
          <img src={taken.url} alt={`Your ${shot.name.toLowerCase()} photo`} className="w-full max-h-64 object-contain rounded-xl bg-[#2C2724]/5" />
        ) : (
          <div className="rounded-xl bg-[#F9F7F3] border border-[#2C2724]/10 p-3">
            <StandDiagram slot={shot.slot} name={shot.name} />
          </div>
        )}

        {taken?.warnings.map((w) => (
          <div key={w.id} className="p-2.5 rounded-xl bg-[#D06C4E]/10 border border-[#D06C4E]/40 text-xs font-bold text-[#9A4A33] flex items-start gap-2" role="status" data-testid={`photo-warning-${w.id}`}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
            <span className="flex-1">{w.text}</span>
          </div>
        ))}

        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void pick(e)} data-testid="photo-camera-input" />
        <input ref={libraryInput} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e)} data-testid="photo-library-input" />

        {onExtras && full ? (
          <p className="text-xs font-bold text-[#6E655F]">You have {MAX_PHOTOS} photos, the most a listing can hold. Remove one to add another.</p>
        ) : (
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
            <button type="button" className={taken ? secondaryBtn : primaryBtn} disabled={busy} onClick={() => cameraInput.current?.click()} data-testid="photo-take">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : taken ? <RotateCcw className="w-4 h-4" /> : onExtras ? <Plus className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
              {taken ? 'Retake' : 'Take photo'}
            </button>
            <button type="button" className={secondaryBtn} disabled={busy} onClick={() => libraryInput.current?.click()} data-testid="photo-library">
              <Images className="w-4 h-4" />
              Choose from library
            </button>
          </div>
        )}

        {onExtras && extras.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {extras.map((p) => (
              <li key={p.key} className="relative">
                <img src={p.url} alt="Extra photo" className="w-full aspect-[4/3] object-cover rounded-lg" />
                <button
                  type="button"
                  onClick={() => draft.remove(p.key)}
                  aria-label="Remove this photo"
                  className="absolute top-1 right-1 w-10 h-10 rounded-full bg-[#2C2724]/75 text-white flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button type="button" className={`${secondaryBtn} !w-auto px-3`} disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))} aria-label="Previous shot">
          <ArrowLeft className="w-4 h-4" />
        </button>
        {/* One dot per shot: sage when taken, terracotta while a required shot is missing */}
        <ol className="flex-1 flex items-center justify-center gap-1.5" aria-label={`Shot ${index + 1} of ${PHOTO_SHOTS.length + 1}: ${shot.name}`}>
          {[...PHOTO_SHOTS, EXTRA_SHOT].map((s, i) => {
            const done = s.slot === 'other' ? extras.length > 0 : slots.includes(s.slot);
            return (
              <li
                key={s.slot}
                aria-hidden="true"
                className={`rounded-full transition-all ${i === index ? 'w-3 h-3' : 'w-2 h-2'} ${done ? 'bg-[#7A907C]' : s.required ? 'bg-[#D06C4E]' : 'bg-[#2C2724]/20'}`}
              />
            );
          })}
        </ol>
        <button
          type="button"
          className={`${secondaryBtn} !w-auto px-3 whitespace-nowrap`}
          disabled={onExtras}
          onClick={() => setIndex((i) => Math.min(PHOTO_SHOTS.length, i + 1))}
          data-testid="photo-next-shot"
        >
          {taken || shot.required ? 'Next shot' : 'Skip'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
