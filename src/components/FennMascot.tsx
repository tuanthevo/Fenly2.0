import React, { useState } from 'react';
import { X, Copy, Check, Sparkles, Radio, EyeOff, DoorOpen, KeyRound } from 'lucide-react';
import { ASK_FENN_SYSTEM_INSTRUCTION } from '../utils/trustSafety';

export type FennVariant =
  | 'app_icon'
  | 'avatar'
  | 'pose_alert'
  | 'pose_empty'
  | 'pose_scouting'
  | 'pose_saved';

interface FennMascotProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: FennVariant;
  earsPerked?: boolean;
  className?: string;
}

const SIZE_MAP: Record<NonNullable<FennMascotProps['size']>, number> = {
  xs: 22,
  sm: 32,
  md: 44,
  lg: 68,
  xl: 112,
};

/**
 * Custom Flat-Vector Illustration of "Fenn" — the savvy fennec fox mascot for Fenn Rentals.
 * Palette:
 * - Warm Desert Gold: #E5A93C
 * - Soft Cream: #FAF6F0
 * - Terracotta: #D96B43
 * - Deep Charcoal: #18181B
 */
export const FennMascot: React.FC<FennMascotProps> = ({
  size = 'md',
  variant = 'avatar',
  earsPerked = false,
  className = '',
}) => {
  const px = SIZE_MAP[size];

  // Pose 2: Empty State / No Results — Fenn lying down with oversized ears flopped completely flat covering its eyes
  if (variant === 'pose_empty') {
    return (
      <div
        className={`relative inline-flex items-center justify-center select-none ${className}`}
        style={{ width: px, height: px }}
        aria-label="Fenn Pose 2: Empty State with ears flopped over eyes"
      >
        <svg viewBox="0 0 120 120" className="w-full h-full overflow-visible">
          {/* Soft floor shadow */}
          <ellipse cx="60" cy="96" rx="44" ry="8" fill="#18181B" fillOpacity="0.1" />
          {/* Lying body in Desert Gold */}
          <ellipse cx="64" cy="80" rx="30" ry="16" fill="#E5A93C" />
          {/* Fluffy tail curled on right */}
          <path
            d="M 88 78 Q 108 68 104 86 Q 98 96 80 90 Z"
            fill="#E5A93C"
          />
          <path d="M 96 76 Q 105 74 102 84 Z" fill="#FAF6F0" />
          {/* Head resting low */}
          <ellipse cx="48" cy="76" rx="22" ry="17" fill="#E5A93C" />
          {/* Cream cheeks */}
          <path
            d="M 28 78 Q 48 94 68 78 Q 58 92 48 92 Q 38 92 28 78 Z"
            fill="#FAF6F0"
          />
          {/* Oversized Left Ear Flopped Flat Covering Left Eye */}
          <path
            d="M 38 64 Q 10 66 8 86 Q 24 94 44 78 Z"
            fill="#E5A93C"
            stroke="#18181B"
            strokeWidth="2.5"
          />
          <path d="M 34 68 Q 16 70 14 83 Q 26 88 40 77 Z" fill="#D96B43" />
          {/* Oversized Right Ear Flopped Flat Covering Right Eye */}
          <path
            d="M 56 64 Q 84 66 86 86 Q 70 94 50 78 Z"
            fill="#E5A93C"
            stroke="#18181B"
            strokeWidth="2.5"
          />
          <path d="M 60 68 Q 78 70 80 83 Q 68 88 54 77 Z" fill="#D96B43" />
          {/* Tiny nose peeking out under flopped ears */}
          <ellipse cx="48" cy="84" rx="4" ry="3" fill="#18181B" />
          {/* Paws tucked in front */}
          <ellipse cx="36" cy="91" rx="7" ry="4" fill="#FAF6F0" />
          <ellipse cx="60" cy="91" rx="7" ry="4" fill="#FAF6F0" />
        </svg>
      </div>
    );
  }

  // Pose 3: Touring / Scouting — Fenn peeking curiously around the vertical edge of a doorway frame
  if (variant === 'pose_scouting') {
    return (
      <div
        className={`relative inline-flex items-center justify-center select-none ${className}`}
        style={{ width: px, height: px }}
        aria-label="Fenn Pose 3: Peeking curiously around doorway frame"
      >
        <svg viewBox="0 0 120 120" className="w-full h-full overflow-visible">
          {/* Stylized Doorway Frame on the Left */}
          <rect x="14" y="10" width="22" height="100" rx="4" fill="#18181B" />
          <rect x="28" y="10" width="8" height="100" fill="#D96B43" />
          {/* Fenn's Giant Radar Ears Peeking Out from Behind Doorway */}
          <path
            d="M 44 48 L 36 12 Q 56 14 60 42 Z"
            fill="#E5A93C"
            stroke="#18181B"
            strokeWidth="2.5"
          />
          <path d="M 45 44 L 40 20 Q 52 22 55 40 Z" fill="#D96B43" />
          <path
            d="M 64 52 L 94 18 Q 104 38 78 62 Z"
            fill="#E5A93C"
            stroke="#18181B"
            strokeWidth="2.5"
          />
          <path d="M 67 52 L 88 26 Q 94 40 76 58 Z" fill="#FAF6F0" />
          {/* Head Tilted Curiously Around Doorway Edge */}
          <circle cx="56" cy="64" r="22" fill="#E5A93C" stroke="#18181B" strokeWidth="2.5" />
          <path d="M 38 68 Q 56 88 76 68 Q 66 86 56 86 Q 44 86 38 68 Z" fill="#FAF6F0" />
          {/* Expressive Scout Eyes */}
          <circle cx="49" cy="62" r="3.5" fill="#18181B" />
          <circle cx="50" cy="60.8" r="1.2" fill="#FAF6F0" />
          <circle cx="65" cy="62" r="3.5" fill="#18181B" />
          <circle cx="66" cy="60.8" r="1.2" fill="#FAF6F0" />
          {/* Nose */}
          <polygon points="54,69 60,69 57,73" fill="#18181B" />
          {/* Little Paws Gripping Doorway Frame */}
          <rect x="29" y="58" width="12" height="7" rx="3.5" fill="#FAF6F0" stroke="#18181B" strokeWidth="2" />
          <rect x="29" y="76" width="12" height="7" rx="3.5" fill="#FAF6F0" stroke="#18181B" strokeWidth="2" />
        </svg>
      </div>
    );
  }

  // Pose 4: Saved / Success — Fenn curled happily inside a stylized keyhole or house silhouette
  if (variant === 'pose_saved') {
    return (
      <div
        className={`relative inline-flex items-center justify-center select-none ${className}`}
        style={{ width: px, height: px }}
        aria-label="Fenn Pose 4: Curled happily inside a house keyhole silhouette"
      >
        <svg viewBox="0 0 120 120" className="w-full h-full overflow-visible">
          {/* Stylized House + Keyhole Outer Silhouette */}
          <path
            d="M 60 10 L 104 46 L 94 46 L 94 106 L 26 106 L 26 46 L 16 46 Z"
            fill="#18181B"
          />
          {/* Inner Warm Keyhole Sanctuary */}
          <circle cx="60" cy="58" r="26" fill="#FAF6F0" />
          <path d="M 44 74 L 76 74 L 82 102 L 38 102 Z" fill="#FAF6F0" />
          {/* Fenn Curled Happily Inside Keyhole */}
          <ellipse cx="60" cy="78" rx="22" ry="15" fill="#E5A93C" />
          {/* Big Happy Ears Framing Keyhole Top */}
          <path d="M 46 66 L 28 36 Q 48 38 54 60 Z" fill="#E5A93C" />
          <path d="M 46 62 L 34 42 Q 46 44 51 58 Z" fill="#D96B43" />
          <path d="M 74 66 L 92 36 Q 72 38 66 60 Z" fill="#E5A93C" />
          <path d="M 74 62 L 86 42 Q 74 44 69 58 Z" fill="#D96B43" />
          {/* Head & Happy Closed Eyes */}
          <circle cx="60" cy="68" r="16" fill="#E5A93C" />
          <path d="M 46 70 Q 60 84 74 70 Q 67 82 60 82 Q 53 82 46 70 Z" fill="#FAF6F0" />
          <path d="M 51 66 Q 54 62 57 66" fill="none" stroke="#18181B" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 63 66 Q 66 62 69 66" fill="none" stroke="#18181B" strokeWidth="2.5" strokeLinecap="round" />
          <polygon points="58,71 62,71 60,74" fill="#18181B" />
          {/* Fluffy Tail Wrapped Around Front */}
          <path
            d="M 40 84 Q 60 98 82 82 Q 76 96 58 95 Q 42 94 40 84 Z"
            fill="#D96B43"
          />
          <circle cx="77" cy="84" r="5" fill="#FAF6F0" />
        </svg>
      </div>
    );
  }

  // Pose 1 (Alert / New Listing) or App Icon / Avatar with Oversized Radar Ears
  const isAppIcon = variant === 'app_icon';
  const showRadar = variant === 'pose_alert' || earsPerked;

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${
        showRadar ? 'transition-transform duration-300 -translate-y-0.5' : ''
      } ${className}`}
      style={{ width: px, height: px }}
      aria-label="Fenn the Fennec Fox Mascot"
    >
      <svg viewBox="0 0 120 120" className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id="fennGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F0B849" />
            <stop offset="100%" stopColor="#E5A93C" />
          </linearGradient>
          <linearGradient id="fennCharcoalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#27272A" />
            <stop offset="100%" stopColor="#18181B" />
          </linearGradient>
        </defs>

        {/* Rounded-Square App Icon Frame on Deep Charcoal-Slate Background */}
        {isAppIcon && (
          <rect
            x="4"
            y="4"
            width="112"
            height="112"
            rx="28"
            fill="url(#fennCharcoalGrad)"
            stroke="#E5A93C"
            strokeWidth="3"
          />
        )}

        {/* Radar Waves Above Ears (Pose 1: Alert / Results Found) */}
        {showRadar && (
          <g className="animate-pulse">
            <path
              d="M 16 20 Q 24 8 38 12"
              fill="none"
              stroke="#D96B43"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M 10 14 Q 22 0 42 5"
              fill="none"
              stroke="#E5A93C"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M 82 12 Q 96 8 104 20"
              fill="none"
              stroke="#D96B43"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M 78 5 Q 98 0 110 14"
              fill="none"
              stroke="#E5A93C"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>
        )}

        {/* Left Giant Radar Ear (Perked Straight Up when Alert) */}
        <g
          transform={
            showRadar
              ? 'rotate(4 44 62)'
              : 'rotate(-6 44 62)'
          }
        >
          <path
            d="M 44 66 L 14 14 Q 44 12 54 54 Z"
            fill="url(#fennGoldGrad)"
            stroke="#18181B"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path d="M 42 60 L 22 23 Q 42 22 49 52 Z" fill="#FAF6F0" />
          <path d="M 42 60 L 27 30 Q 40 30 46 53 Z" fill="#D96B43" fillOpacity="0.85" />
        </g>

        {/* Right Giant Radar Ear (Slightly Cocked in App Icon to Listen for New Listings, or Perked Straight Up) */}
        <g
          transform={
            showRadar
              ? 'rotate(-4 76 62)'
              : isAppIcon
              ? 'rotate(14 76 62)'
              : 'rotate(8 76 62)'
          }
        >
          <path
            d="M 76 66 L 106 14 Q 76 12 66 54 Z"
            fill="url(#fennGoldGrad)"
            stroke="#18181B"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path d="M 78 60 L 98 23 Q 78 22 71 52 Z" fill="#FAF6F0" />
          <path d="M 78 60 L 93 30 Q 80 30 74 53 Z" fill="#D96B43" fillOpacity="0.85" />
        </g>

        {/* Shoulders / Chest Peeking Up From Bottom */}
        <path
          d="M 34 112 Q 60 86 86 112 Z"
          fill="url(#fennGoldGrad)"
          stroke="#18181B"
          strokeWidth="2.5"
        />
        <path d="M 46 112 Q 60 94 74 112 Z" fill="#FAF6F0" />

        {/* Geometric Fennec Fox Head */}
        <path
          d="M 28 72 Q 28 46 60 46 Q 92 46 92 72 Q 92 96 60 100 Q 28 96 28 72 Z"
          fill="url(#fennGoldGrad)"
          stroke="#18181B"
          strokeWidth="2.5"
        />

        {/* Soft Cream Cheek & Chin Fur Mask */}
        <path
          d="M 30 74 Q 45 68 60 82 Q 75 68 90 74 Q 86 96 60 100 Q 34 96 30 74 Z"
          fill="#FAF6F0"
        />

        {/* Warm Terracotta Brow Accents */}
        <ellipse cx="47" cy="64" rx="4" ry="2" fill="#D96B43" />
        <ellipse cx="73" cy="64" rx="4" ry="2" fill="#D96B43" />

        {/* Savvy Expressive Eyes */}
        <circle cx="46" cy="72" r="4.5" fill="#18181B" />
        <circle cx="44.5" cy="70.5" r="1.6" fill="#FAF6F0" />
        <circle cx="74" cy="72" r="4.5" fill="#18181B" />
        <circle cx="72.5" cy="70.5" r="1.6" fill="#FAF6F0" />

        {/* Clean Geometric Nose & Subtle Confident Smile */}
        <polygon points="55,81 65,81 60,87" fill="#18181B" />
        <path
          d="M 54 90 Q 60 94 66 90"
          fill="none"
          stroke="#18181B"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

/**
 * Tiny Fennec-Fox Ear Silhouette SVG Crown for Map Price Pins on the Scout Screen
 */
export const FennPinEarsCrown: React.FC<{ isSelected?: boolean }> = ({ isSelected = false }) => (
  <svg
    viewBox="0 0 44 16"
    className="w-8 h-3 -mb-1 pointer-events-none overflow-visible"
    aria-hidden="true"
  >
    {/* Left Fennec Ear */}
    <path
      d="M 12 15 L 3 1 Q 15 2 18 15 Z"
      fill={isSelected ? '#D96B43' : '#E5A93C'}
      stroke="#18181B"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M 12 14 L 6 4 Q 13 5 15 14 Z" fill="#FAF6F0" />
    {/* Right Fennec Ear */}
    <path
      d="M 32 15 L 41 1 Q 29 2 26 15 Z"
      fill={isSelected ? '#D96B43' : '#E5A93C'}
      stroke="#18181B"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M 32 14 L 38 4 Q 31 5 29 14 Z" fill="#FAF6F0" />
  </svg>
);

interface FennStickerSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IMAGEN_APP_ICON_PROMPT = `Design a modern, minimalist mobile app icon and mascot character for a rental housing app called "Fenn". The mascot is a cute, clever fennec fox with oversized, expressive radar ears and warm desert-gold and cream fur. Flat vector illustration style, clean geometric shapes, subtle gradients, inspired by Duolingo and Headspace character design. The fennec fox is peeking up from the bottom of a rounded-square app icon frame against a deep charcoal-slate background, with one big ear slightly cocked as if listening for a new apartment listing. Warm, savvy, urban vibe—not overly childish. No text in the image.`;

export const IMAGEN_STICKER_SHEET_PROMPT = `A 2D vector character sheet of "Fenn", a minimalist fennec fox mascot for a mobile tech app, shown in 4 distinct UI states on a solid white background. Style: flat modern vector art, clean lines, warm sandy gold, cream, and terracotta color palette.
Pose 1 (Alert/New Listing): Fenn sitting upright with giant ears perked straight up and tiny radar waves above the ears.
Pose 2 (Empty State/No Results): Fenn lying down with oversized ears flopped completely flat covering its eyes.
Pose 3 (Touring/Scouting): Fenn peeking curiously around the vertical edge of a doorway frame.
Pose 4 (Saved/Success): Fenn curled happily inside a stylized keyhole or house silhouette.`;

export const FennStickerSheetModal: React.FC<FennStickerSheetModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#18181B]/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="w-full max-w-[420px] max-h-[90vh] bg-[#FAF6F0] text-[#18181B] rounded-3xl border-2 border-[#18181B] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 bg-[#18181B] text-[#FAF6F0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FennMascot size="sm" variant="app_icon" />
            <div>
              <h2 className="text-sm font-extrabold tracking-tight text-[#FAF6F0]">
                Fenn Mascot & Brand Kit
              </h2>
              <p className="text-[10px] text-[#E5A93C] font-semibold">
                App Icon • 4-Pose Sticker Sheet • Ask Fenn Spec
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Fenn Brand Kit"
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-[#FAF6F0] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 1. App Icon & Mascot */}
          <section className="bg-white rounded-2xl border border-[#18181B]/15 p-3.5 shadow-sm">
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#E5A93C]/20 text-[#18181B]">
                  1. App Icon & Mascot
                </span>
                <h3 className="text-xs font-extrabold text-[#18181B] mt-1">
                  Fenn Rounded-Square App Icon
                </h3>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('icon', IMAGEN_APP_ICON_PROMPT)}
                className="px-2.5 py-1 rounded-lg bg-[#FAF6F0] hover:bg-[#E5A93C]/20 border border-[#18181B]/20 text-[10px] font-bold flex items-center gap-1"
              >
                {copiedKey === 'icon' ? <Check className="w-3 h-3 text-[#D96B43]" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'icon' ? 'Copied Prompt' : 'Copy Imagen Prompt'}</span>
              </button>
            </div>

            <div className="flex items-center gap-4 bg-[#18181B] rounded-2xl p-4 text-[#FAF6F0]">
              <FennMascot size="xl" variant="app_icon" />
              <div className="space-y-1.5 text-[11px] leading-relaxed">
                <p className="font-bold text-[#E5A93C]">
                  Peeking Fennec Fox • Ear Cocked for New Listings
                </p>
                <p className="text-[#FAF6F0]/80 text-[10px]">
                  Flat geometric vector style in warm desert gold (#E5A93C), soft cream (#FAF6F0), terracotta (#D96B43), and deep charcoal-slate (#18181B).
                </p>
              </div>
            </div>
          </section>

          {/* 2. 4-Pose UI Sticker Sheet on Solid White Background */}
          <section className="bg-white rounded-2xl border border-[#18181B]/15 p-3.5 shadow-sm">
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#D96B43]/15 text-[#D96B43]">
                  2. UI Poses / Sticker Sheet
                </span>
                <h3 className="text-xs font-extrabold text-[#18181B] mt-1">
                  4 Distinct UI States on Solid White Canvas
                </h3>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('sheet', IMAGEN_STICKER_SHEET_PROMPT)}
                className="px-2.5 py-1 rounded-lg bg-[#FAF6F0] hover:bg-[#E5A93C]/20 border border-[#18181B]/20 text-[10px] font-bold flex items-center gap-1"
              >
                {copiedKey === 'sheet' ? <Check className="w-3 h-3 text-[#D96B43]" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'sheet' ? 'Copied Prompt' : 'Copy Sheet Prompt'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 bg-white p-2 rounded-xl border border-[#18181B]/10">
              {/* Pose 1 */}
              <div className="p-2.5 rounded-xl bg-white border border-[#18181B]/15 flex flex-col items-center text-center">
                <FennMascot size="lg" variant="pose_alert" earsPerked={true} />
                <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-extrabold text-[#18181B]">
                  <Radio className="w-3 h-3 text-[#D96B43]" />
                  Pose 1: Alert / New Listing
                </span>
                <p className="text-[9px] text-[#18181B]/65 mt-0.5">
                  Ears perked straight up with radar waves
                </p>
              </div>

              {/* Pose 2 */}
              <div className="p-2.5 rounded-xl bg-white border border-[#18181B]/15 flex flex-col items-center text-center">
                <FennMascot size="lg" variant="pose_empty" />
                <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-extrabold text-[#18181B]">
                  <EyeOff className="w-3 h-3 text-[#D96B43]" />
                  Pose 2: Empty / No Results
                </span>
                <p className="text-[9px] text-[#18181B]/65 mt-0.5">
                  Ears flopped flat covering eyes
                </p>
              </div>

              {/* Pose 3 */}
              <div className="p-2.5 rounded-xl bg-white border border-[#18181B]/15 flex flex-col items-center text-center">
                <FennMascot size="lg" variant="pose_scouting" />
                <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-extrabold text-[#18181B]">
                  <DoorOpen className="w-3 h-3 text-[#D96B43]" />
                  Pose 3: Touring / Scouting
                </span>
                <p className="text-[9px] text-[#18181B]/65 mt-0.5">
                  Peeking curiously around doorway frame
                </p>
              </div>

              {/* Pose 4 */}
              <div className="p-2.5 rounded-xl bg-white border border-[#18181B]/15 flex flex-col items-center text-center">
                <FennMascot size="lg" variant="pose_saved" />
                <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-extrabold text-[#18181B]">
                  <KeyRound className="w-3 h-3 text-[#D96B43]" />
                  Pose 4: Saved / My Den
                </span>
                <p className="text-[9px] text-[#18181B]/65 mt-0.5">
                  Curled happily inside keyhole house
                </p>
              </div>
            </div>
          </section>

          {/* 3. Ask Fenn System Instructions */}
          <section className="bg-white rounded-2xl border border-[#18181B]/15 p-3.5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#D96B43]" />
                <h3 className="text-xs font-extrabold text-[#18181B]">
                  3. "Ask Fenn" AI Concierge System Instructions
                </h3>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('sys', ASK_FENN_SYSTEM_INSTRUCTION)}
                className="px-2.5 py-1 rounded-lg bg-[#FAF6F0] hover:bg-[#E5A93C]/20 border border-[#18181B]/20 text-[10px] font-bold flex items-center gap-1"
              >
                {copiedKey === 'sys' ? <Check className="w-3 h-3 text-[#D96B43]" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'sys' ? 'Copied' : 'Copy System Prompt'}</span>
              </button>
            </div>
            <pre className="text-[10px] leading-relaxed bg-[#FAF6F0] p-2.5 rounded-xl border border-[#18181B]/10 whitespace-pre-wrap font-mono text-[#18181B]/85 max-h-36 overflow-y-auto">
              {ASK_FENN_SYSTEM_INSTRUCTION}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
};
