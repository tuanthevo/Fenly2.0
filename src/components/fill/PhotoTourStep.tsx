/**
 * The tour step of a photo listing (where video listings have the video editor):
 * a live preview of the photo tour, photo order, captions the host checks, privacy
 * flags from the AI, the headline, and "Use this tour", which exports the same
 * tour to MP4 in the browser with the exporter video tours use.
 */
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { PHOTO_SHOTS } from '../../fill/photoShots';
import { PRIVACY_FLAG_TEXT, captionIssues } from '../../fill/photoAssist';
import { MAX_HOOK_CHARS, sanitizeHookText } from '../../remotion/viral/copy';
import { checkBrowserCanExport, exportViralVideo, preloadExporter } from '../../remotion/viral/exportVideo';
import type { ViralEditPlan, ViralListingInfo } from '../../remotion/viral/types';
import { longCalloutParts, photoTourPlanForListing } from '../../utils/photoTourListing';
import type { PhotoDraft } from './usePhotoDraft';

const PhotoTourPlayer = React.lazy(() => import('../PhotoTourPlayer'));

const card = 'p-4 rounded-2xl bg-white border border-[#2C2724]/10';
const input =
  'w-full bg-white border border-[#2C2724]/15 rounded-xl px-3 py-2.5 text-sm text-[#2C2724] focus:outline-none focus:border-[#A9513A]';
const primaryBtn =
  'w-full min-h-11 py-3 rounded-xl bg-[#B85B3F] hover:bg-[#A9513A] disabled:opacity-50 text-white text-sm font-extrabold flex items-center justify-center gap-2 active:scale-95 transition-all';
const iconBtn =
  'w-10 h-10 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/15 text-[#2C2724] flex items-center justify-center shrink-0 disabled:opacity-40';

export type PhotoTourResult = {
  plan: ViralEditPlan;
  /** The exported tour, or null when this browser can't export video (the listing then plays its photos live) */
  blob: Blob | null;
  hookText: string;
};

interface PhotoTourStepProps {
  listingId: string;
  listing: ViralListingInfo;
  availableFrom: string | null;
  today: string;
  draft: PhotoDraft;
  /** Headline saved with an earlier tour */
  initialHook?: string;
  busy: boolean;
  onRetake: () => void;
  onReady: (result: PhotoTourResult) => void;
}

export const PhotoTourStep: React.FC<PhotoTourStepProps> = ({ listingId, listing, availableFrom, today, draft, initialHook, busy, onRetake, onReady }) => {
  const { photos } = draft;
  const [hook, setHook] = useState(initialHook ?? '');
  const [exporting, setExporting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    preloadExporter();
    return () => abort.current?.abort();
  }, []);

  // The preview follows the captions a moment after typing stops, so the player isn't rebuilt per keystroke
  const [settled, setSettled] = useState({ photos, hook });
  useEffect(() => {
    const id = window.setTimeout(() => setSettled({ photos, hook }), 500);
    return () => window.clearTimeout(id);
  }, [photos, hook]);

  const planFor = (list: typeof photos, hookText: string) =>
    photoTourPlanForListing(
      listing,
      list.map((p) => ({ src: p.url, slot: p.slot, caption: p.caption, landscape: p.width > p.height })),
      { availableFrom, today, listingId, hookText: sanitizeHookText(hookText) ?? undefined }
    );
  const plan = useMemo(() => planFor(settled.photos, settled.hook), [settled, listing, availableFrom, today, listingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const issues = useMemo(() => captionIssues([...photos.map((p) => p.caption), hook]), [photos, hook]);
  const flagged = photos.filter((p) => p.privacy.length > 0);
  const working = busy || exporting !== null;

  const useTour = async () => {
    setError(null);
    const finalPlan = planFor(photos, hook);
    if (!finalPlan) return setError('Add at least two photos to make a tour.');
    if (issues.length > 0) return setError('Change the highlighted words first.');
    if (!draft.approved) return setError('Tick "I checked these captions" first.');
    setExporting(0);
    try {
      let blob: Blob | null = null;
      const check = await checkBrowserCanExport(finalPlan);
      if (check.ok) {
        abort.current = new AbortController();
        blob = await exportViralVideo(finalPlan, { onProgress: setExporting, signal: abort.current.signal });
      }
      onReady({ plan: finalPlan, blob, hookText: sanitizeHookText(hook) ?? '' });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The tour couldn't be made. Try again.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-3" data-testid="photo-tour-step">
      <div className={`${card} space-y-3`}>
        <div>
          <h3 className="text-sm font-extrabold">Your photo tour</h3>
          <p className="text-xs text-[#6E655F] mt-0.5">Made from your photos. Nothing is added or changed.</p>
        </div>
        <div className="relative mx-auto w-full max-w-[260px] aspect-[9/16] rounded-2xl overflow-hidden bg-[#2C2724]">
          {plan ? (
            <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-white/80"><Loader2 className="w-5 h-5 animate-spin" /></div>}>
              <PhotoTourPlayer plan={plan} playing={!working} muted />
            </Suspense>
          ) : null}
        </div>
        <div>
          <label htmlFor="photo-hook" className="text-xs font-bold text-[#6E655F] block mb-1">
            Headline (leave empty for "{plan?.hook.text ?? 'What $X gets you in your area'}")
          </label>
          <input id="photo-hook" className={input} maxLength={MAX_HOOK_CHARS} value={hook} onChange={(e) => setHook(e.target.value)} placeholder="What $1,450/mo gets you in Mission District" data-testid="photo-hook-input" />
        </div>
      </div>

      {flagged.length > 0 && (
        <div className={`${card} space-y-2 border-[#D06C4E]/40 bg-[#D06C4E]/10`} role="status" data-testid="photo-privacy-flags">
          <h3 className="text-sm font-extrabold text-[#9A4A33] flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Check these photos before you publish
          </h3>
          {flagged.map((p) => (
            <div key={p.key} className="flex items-center gap-2.5">
              <img src={p.url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
              <p className="text-xs font-bold text-[#9A4A33] leading-snug flex-1">{p.privacy.map((f) => PRIVACY_FLAG_TEXT[f]).join(' ')}</p>
            </div>
          ))}
          <button type="button" onClick={onRetake} className="min-h-10 px-3 rounded-xl bg-white border border-[#2C2724]/15 text-xs font-extrabold flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> Retake photos
          </button>
        </div>
      )}

      <div className={`${card} space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold">Order and captions</h3>
          {draft.assistBusy && (
            <span className="text-xs font-bold text-[#A9513A] flex items-center gap-1" role="status">
              <Sparkles className="w-3.5 h-3.5" /> Fenn is looking at your photos
            </span>
          )}
        </div>
        <p className="text-xs text-[#6E655F] -mt-1">Two short labels per photo, separated by a comma. The last photo plays as "the best part".</p>
        <ol className="space-y-2.5">
          {photos.map((p, i) => (
            <li key={p.key} className="flex items-start gap-2.5">
              <img src={p.url} alt={`Photo ${i + 1}`} className="w-16 h-16 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <label htmlFor={`caption-${p.key}`} className="text-xs font-bold text-[#6E655F] block mb-1">
                  {i + 1}. {PHOTO_SHOTS.find((s) => s.slot === p.slot)?.name ?? 'Extra photo'}
                </label>
                <input
                  id={`caption-${p.key}`}
                  className={input}
                  maxLength={48}
                  value={p.caption}
                  placeholder="South-facing window, Built-in closet"
                  onChange={(e) => draft.setCaption(p.key, e.target.value)}
                  data-testid={`photo-caption-${i}`}
                  aria-describedby={longCalloutParts(p.caption).length ? `caption-hint-${p.key}` : undefined}
                />
                {longCalloutParts(p.caption).length > 0 && (
                  <p id={`caption-hint-${p.key}`} className="text-xs font-bold text-[#A9513A] mt-1" role="status">
                    A label fits 3 words and 22 letters on screen. Shorten: {longCalloutParts(p.caption).map((part) => `"${part}"`).join(', ')}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1 pt-5">
                <button type="button" className={iconBtn} disabled={i === 0} onClick={() => draft.move(p.key, -1)} aria-label={`Move photo ${i + 1} earlier`}>
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button type="button" className={iconBtn} disabled={i === photos.length - 1} onClick={() => draft.move(p.key, 1)} aria-label={`Move photo ${i + 1} later`}>
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ol>
        {issues.length > 0 && (
          <div className="p-2.5 rounded-xl bg-[#D06C4E]/10 border border-[#D06C4E]/40 text-xs text-[#9A4A33] font-bold flex gap-1.5" role="alert">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>Describe the room, not who should live there. Please change: {issues.map((p) => `"${p}"`).join(', ')}</span>
          </div>
        )}
        <label className="flex items-start gap-2 text-xs font-bold cursor-pointer min-h-10 items-center">
          <input type="checkbox" className="w-5 h-5 shrink-0 accent-[#B85B3F]" checked={draft.approved} onChange={(e) => draft.setApproved(e.target.checked)} data-testid="photo-captions-approved" />
          <span>I checked these captions and they're accurate.</span>
        </label>
      </div>

      {exporting !== null && (
        <div className="space-y-1" role="status" data-testid="photo-export-progress">
          <p className="text-xs font-bold text-[#6E655F] flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D06C4E]" /> Making your tour… {Math.round(exporting * 100)}%
          </p>
          <div className="h-1.5 rounded-full bg-[#2C2724]/10 overflow-hidden">
            <div className="h-full bg-[#D06C4E] transition-all" style={{ width: `${Math.max(3, Math.round(exporting * 100))}%` }} />
          </div>
        </div>
      )}
      {error && (
        <p className="text-xs font-bold text-[#9A4A33] p-3 rounded-xl bg-[#D06C4E]/10 border border-[#D06C4E]/30" role="alert">
          {error}
        </p>
      )}
      <button type="button" className={primaryBtn} disabled={working || !plan} onClick={() => void useTour()} data-testid="photo-use-tour">
        {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Use this tour
      </button>
    </div>
  );
};
