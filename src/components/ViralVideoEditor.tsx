import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Film,
  Loader2,
  RotateCcw,
  Share2,
  Sparkles,
  Star,
  Wand2,
} from 'lucide-react';
import { FenlyViralTour } from '../remotion/viral/FenlyViralTour';
import { PACE_PRESETS, buildViralEditPlan } from '../remotion/viral/plan';
import { STYLE_INFO, violatesFairHousing, MAX_HOOK_CHARS, MAX_TAG_CHARS } from '../remotion/viral/copy';
import { analyzeClipInBrowser } from '../remotion/viral/analyzeClipInBrowser';
import { fetchViralAiHints } from '../remotion/viral/aiCopy';
import {
  checkBrowserCanExport,
  exportViralVideo,
  shareOrDownloadVideo,
  videoFileName,
} from '../remotion/viral/exportVideo';
import type {
  ClipAnalysis,
  ViralAiHints,
  ViralClipInput,
  ViralEditPlan,
  ViralListingInfo,
  ViralPace,
  ViralStyleId,
} from '../remotion/viral/types';
import { GUIDED_SHOTS } from '../utils/guidedShots';
import type { RecordedViralSlotMedia } from './GuidedViralTourStudio';

export type ViralVideoResult = {
  blob: Blob;
  url: string;
  plan: ViralEditPlan;
  caption: string;
};

interface ViralVideoEditorProps {
  listing: ViralListingInfo;
  recordedMedia: Record<number, RecordedViralSlotMedia>;
  /** Optional Gemini hints (hook, callouts, windows); the editor works without them */
  aiHints?: ViralAiHints | null;
  /** Opens the guided camera for a shot (Quick Retake) */
  onRetakeShot?: (slotNumber: number) => void;
  /** Called with the exported MP4 when the host attaches it to the listing */
  onVideoReady?: (result: ViralVideoResult) => void;
}

type ExportState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'rendering'; progress: number }
  | { phase: 'done'; blob: Blob; url: string; planKey: string }
  | { phase: 'error'; message: string };

function supportsWebGL2(): boolean {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

const POSTING_TIPS = [
  'Upload this file to each app directly. Instagram doesn’t recommend reposted TikToks with a watermark.',
  'In TikTok or Reels, add a trending sound at low volume (business accounts: pick from Commercial sounds).',
  'Paste the caption: it’s copied for you when you tap Share.',
  'Answer the first comments about the price. Real back-and-forth helps the video travel.',
];

export const ViralVideoEditor: React.FC<ViralVideoEditorProps> = ({
  listing,
  recordedMedia,
  aiHints = null,
  onRetakeShot,
  onVideoReady,
}) => {
  const clips = useMemo<ViralClipInput[]>(
    () =>
      GUIDED_SHOTS.filter((shot) => recordedMedia[shot.slotNumber]?.videoUrl).map((shot) => {
        const media = recordedMedia[shot.slotNumber];
        return {
          slotNumber: shot.slotNumber,
          room: shot.name,
          src: media.videoUrl,
          durationSec: media.durationSec,
          isLandscape: media.isLandscape,
        };
      }),
    [recordedMedia]
  );
  const clipKey = clips.map((c) => c.src).join('|');

  // Local clip analysis (runs on the device, one clip at a time)
  const analysisCache = useRef(new Map<string, ClipAnalysis | null>());
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const [analyzing, setAnalyzing] = useState<{ index: number; total: number; fraction: number } | null>(null);

  useEffect(() => {
    const pending = clips.filter((c) => !analysisCache.current.has(c.src));
    if (pending.length === 0) {
      setAnalyzing(null);
      return;
    }
    const controller = new AbortController();
    (async () => {
      for (let i = 0; i < pending.length; i++) {
        if (controller.signal.aborted) return;
        setAnalyzing({ index: i, total: pending.length, fraction: 0 });
        const result = await analyzeClipInBrowser(pending[i].src, {
          signal: controller.signal,
          onProgress: (fraction) => setAnalyzing({ index: i, total: pending.length, fraction }),
        });
        if (controller.signal.aborted) return;
        analysisCache.current.set(pending[i].src, result);
        setAnalysisVersion((v) => v + 1);
      }
      setAnalyzing(null);
    })();
    return () => controller.abort();
    // clipKey changes whenever a shot is added, replaced or retaken
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipKey]);

  // Optional Gemini copy pass, once the local analysis is done. Runs again only
  // when the shots or the listing facts change.
  const [fetchedHints, setFetchedHints] = useState<ViralAiHints | null>(null);
  const listingKey = JSON.stringify(listing);
  const analysisDone = clips.length > 0 && !analyzing && clips.every((c) => analysisCache.current.has(c.src));
  useEffect(() => {
    if (aiHints || !analysisDone) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const shots = clips.map((c) => ({
        slotNumber: c.slotNumber,
        room: c.room,
        src: c.src,
        atSec: (analysisCache.current.get(c.src)?.best.startSec ?? 0.5) + 0.5,
      }));
      const hints = await fetchViralAiHints(listing, shots, controller.signal);
      if (!controller.signal.aborted) setFetchedHints(hints);
    }, 600);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipKey, listingKey, analysisDone, aiHints]);
  const activeHints = aiHints ?? fetchedHints;

  // Host choices
  const [style, setStyle] = useState<ViralStyleId>('price-hook');
  const [pace, setPace] = useState<ViralPace>('balanced');
  const [hookSlot, setHookSlot] = useState<number | null>(null);
  const [hookDraft, setHookDraft] = useState<string | null>(null);
  const [tagEdits, setTagEdits] = useState<Record<number, string>>({});
  const [sfxOn, setSfxOn] = useState(true);
  const [roomSound, setRoomSound] = useState(false);
  const [effectsOn] = useState(supportsWebGL2);
  const [showTips, setShowTips] = useState(false);
  const [copied, setCopied] = useState(false);

  const plan = useMemo<ViralEditPlan | null>(() => {
    if (clips.length === 0) return null;
    try {
      return buildViralEditPlan(
        {
          listing,
          clips: clips.map((c) => ({ ...c, analysis: analysisCache.current.get(c.src) ?? null })),
        },
        {
          style,
          pace,
          hookSlotNumber: hookSlot,
          hookTextOverride: hookDraft,
          tagOverrides: tagEdits,
          ai: activeHints,
          sfx: sfxOn,
          keepRoomSound: roomSound,
          enableEffects: effectsOn,
        }
      );
    } catch {
      return null;
    }
    // analysisVersion tells us the cache changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, listing, style, pace, hookSlot, hookDraft, tagEdits, activeHints, sfxOn, roomSound, effectsOn, analysisVersion]);

  const planKey = useMemo(() => (plan ? JSON.stringify(plan) : ''), [plan]);

  // Export
  const [exportState, setExportState] = useState<ExportState>({ phase: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  // URLs handed to the listing must stay valid after this editor unmounts
  const handedOffUrls = useRef(new Set<string>());
  const exportedUrl = exportState.phase === 'done' ? exportState.url : null;
  useEffect(
    () => () => {
      if (exportedUrl && !handedOffUrls.current.has(exportedUrl)) URL.revokeObjectURL(exportedUrl);
    },
    [exportedUrl]
  );
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleExport = async () => {
    if (!plan) return;
    setExportState({ phase: 'checking' });
    const check = await checkBrowserCanExport(plan);
    if (!check.ok) {
      setExportState({ phase: 'error', message: check.message });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setExportState({ phase: 'rendering', progress: 0 });
    try {
      const blob = await exportViralVideo(plan, {
        signal: controller.signal,
        onProgress: (progress) => setExportState({ phase: 'rendering', progress }),
      });
      setExportState({ phase: 'done', blob, url: URL.createObjectURL(blob), planKey });
    } catch (error) {
      if (controller.signal.aborted) {
        setExportState({ phase: 'idle' });
        return;
      }
      setExportState({
        phase: 'error',
        message:
          error instanceof Error
            ? `${error.message} If a clip came from an iPhone, try Safari or Chrome on the phone that filmed it.`
            : 'Export failed.',
      });
    }
  };

  const copyCaption = async () => {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(plan.caption);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  if (!plan) {
    return (
      <div
        data-testid="viral-video-editor-empty"
        className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm text-[11px] text-[#6E655F]"
      >
        Record or choose at least one shot above and we’ll cut it into a vertical video.
      </div>
    );
  }

  const exportStale = exportState.phase === 'done' && exportState.planKey !== planKey;
  const seconds = (plan.totalFrames / plan.fps).toFixed(1);
  const hookValue = hookDraft ?? plan.hook.text;
  const hookNeedsCare = hookDraft !== null && violatesFairHousing(hookDraft);
  const retakeWarnings = plan.warnings.filter((w) => w.severity === 'retake');
  const fixedWarnings = plan.warnings.filter((w) => w.severity === 'fixed');

  return (
    <div
      data-testid="viral-video-editor"
      className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#D06C4E]/15 text-[#D06C4E] flex items-center justify-center font-extrabold text-xs shrink-0">
            3
          </div>
          <div>
            <h4 className="font-extrabold text-xs text-[#2C2724]">Auto-Edit: Viral Room Tour</h4>
            <p className="text-[10px] text-[#6E655F]">
              We cut your shots into a {seconds}s vertical video for TikTok, Reels and Shorts.
            </p>
          </div>
        </div>
        <span
          data-testid="viral-editor-status"
          className={`px-2 py-1 rounded-full text-[10px] font-extrabold shrink-0 ${
            analyzing ? 'bg-[#F2EFE9] text-[#6E655F]' : 'bg-[#E8EFE9] text-[#485B4A]'
          }`}
        >
          {analyzing ? `Checking shot ${analyzing.index + 1}/${analyzing.total}` : 'Ready'}
        </span>
      </div>

      {analyzing && (
        <div className="space-y-1" data-testid="viral-editor-analyzing">
          <p className="text-[10px] font-bold text-[#6E655F] flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D06C4E]" />
            Finding the brightest, steadiest second of each shot…
          </p>
          <div className="h-1.5 rounded-full bg-[#2C2724]/10 overflow-hidden">
            <div
              className="h-full bg-[#D06C4E] transition-all"
              style={{ width: `${Math.round(((analyzing.index + analyzing.fraction) / analyzing.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Live preview */}
      <div className="flex justify-center">
        <div className="relative w-full max-w-[260px] rounded-[28px] overflow-hidden border-2 border-[#2C2724] bg-[#2C2724] shadow-warm">
          <Player
            component={FenlyViralTour}
            inputProps={{ plan }}
            durationInFrames={plan.totalFrames}
            compositionWidth={plan.width}
            compositionHeight={plan.height}
            fps={plan.fps}
            controls
            loop
            autoPlay
            initiallyMuted
            clickToPlay
            acknowledgeRemotionLicense
            style={{ width: '100%', aspectRatio: '9 / 16' }}
          />
        </div>
      </div>

      {/* Quality warnings */}
      {retakeWarnings.length > 0 && (
        <div className="space-y-1.5" data-testid="viral-editor-warnings">
          {retakeWarnings.map((w, i) => {
            const shotName = GUIDED_SHOTS.find((s) => s.slotNumber === w.slotNumber)?.name ?? `Shot ${w.slotNumber}`;
            return (
              <div
                key={`${w.slotNumber}-${w.kind}-${i}`}
                className="p-2.5 rounded-xl bg-[#D06C4E]/10 border border-[#D06C4E]/40 flex items-start gap-2"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#9A4A33]" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-extrabold text-[#9A4A33]">
                    Shot {w.slotNumber} · {shotName}
                  </p>
                  <p className="text-[10px] font-semibold text-[#9A4A33] leading-snug">{w.tip}</p>
                </div>
                {onRetakeShot && (
                  <button
                    type="button"
                    data-testid={`viral-quick-retake-${w.slotNumber}`}
                    onClick={() => onRetakeShot(w.slotNumber)}
                    className="shrink-0 px-2 py-1 rounded-lg bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-[10px] font-extrabold flex items-center gap-1 active:scale-95"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Quick Retake
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {fixedWarnings.length > 0 && (
        <p className="text-[10px] font-semibold text-[#485B4A] bg-[#E8EFE9] border border-[#7A907C]/50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          Brightened {fixedWarnings.map((w) => `shot ${w.slotNumber}`).join(', ')} automatically.
        </p>
      )}

      {/* Hook style */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F]">Opening hook</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(STYLE_INFO) as ViralStyleId[]).map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`viral-style-${id}`}
              onClick={() => {
                setStyle(id);
                setHookDraft(null);
              }}
              className={`py-1.5 px-1 rounded-xl text-[10px] font-extrabold border transition-all active:scale-95 ${
                style === id
                  ? 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724]'
                  : 'bg-[#F9F7F3] text-[#2C2724] border-[#2C2724]/20 hover:bg-[#F2EFE9]'
              }`}
            >
              {STYLE_INFO[id].label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[#6E655F] leading-snug">{STYLE_INFO[style].blurb}</p>
        <div className="flex items-center gap-1.5">
          <input
            data-testid="viral-hook-input"
            value={hookValue}
            maxLength={MAX_HOOK_CHARS}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHookDraft(e.target.value)}
            className="flex-1 min-w-0 px-2.5 py-2 rounded-xl border border-[#2C2724]/20 bg-[#F9F7F3] text-[11px] font-bold text-[#2C2724] focus:outline-none focus:border-[#D06C4E]"
          />
          {hookDraft !== null && (
            <button
              type="button"
              onClick={() => setHookDraft(null)}
              className="px-2 py-2 rounded-xl border border-[#2C2724]/20 text-[10px] font-bold text-[#6E655F] hover:bg-[#F2EFE9]"
            >
              Auto
            </button>
          )}
        </div>
        {hookNeedsCare && (
          <p className="text-[10px] font-semibold text-[#9A4A33]">
            Tip: describe the place, not who should live there (fair-housing rules for rental ads).
          </p>
        )}
      </div>

      {/* Pace */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F]">Pace</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(PACE_PRESETS) as ViralPace[]).map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`viral-pace-${id}`}
              onClick={() => setPace(id)}
              className={`py-1.5 px-1 rounded-xl text-[10px] font-extrabold border transition-all active:scale-95 ${
                pace === id
                  ? 'bg-[#D06C4E] text-white border-[#D06C4E]'
                  : 'bg-[#F9F7F3] text-[#2C2724] border-[#2C2724]/20 hover:bg-[#F2EFE9]'
              }`}
            >
              {PACE_PRESETS[id].label}
            </button>
          ))}
        </div>
      </div>

      {/* Shots in edit order */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F]">
          Shots in order (tap a callout to edit it)
        </span>
        {plan.shots.map((shot, i) => (
          <div
            key={shot.id}
            data-testid={`viral-shot-row-${shot.slotNumber}`}
            className="p-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/10 flex items-center gap-2"
          >
            <span className="w-5 h-5 rounded-md bg-[#2C2724] text-[#F9F7F3] text-[10px] font-extrabold flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-extrabold text-[#2C2724] truncate">
                {shot.room}
                {shot.role === 'hook' ? ' · opener' : shot.role === 'closer' ? ' · closer' : ''}
              </p>
              {shot.role === 'hook' ? (
                <p className="text-[10px] text-[#6E655F]">Shows the hook headline</p>
              ) : (
                <input
                  data-testid={`viral-tag-input-${shot.slotNumber}`}
                  value={tagEdits[shot.slotNumber] ?? shot.tag}
                  maxLength={MAX_TAG_CHARS}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setTagEdits((prev) => ({ ...prev, [shot.slotNumber]: e.target.value }))
                  }
                  className="w-full mt-0.5 px-2 py-1 rounded-lg border border-[#2C2724]/15 bg-white text-[10px] font-bold text-[#2C2724] uppercase focus:outline-none focus:border-[#D06C4E]"
                />
              )}
            </div>
            {shot.role !== 'hook' && (
              <button
                type="button"
                data-testid={`viral-make-opener-${shot.slotNumber}`}
                onClick={() => setHookSlot(shot.slotNumber)}
                title="Open the video with this shot"
                className="shrink-0 p-1.5 rounded-lg border border-[#2C2724]/15 bg-white text-[#D06C4E] hover:bg-[#F2EFE9]"
              >
                <Star className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Sound */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => setSfxOn((v) => !v)}
          className={`py-1.5 rounded-xl text-[10px] font-extrabold border ${
            sfxOn ? 'bg-[#E8EFE9] text-[#485B4A] border-[#7A907C]/60' : 'bg-white text-[#6E655F] border-[#2C2724]/15'
          }`}
        >
          {sfxOn ? 'Whoosh effects: on' : 'Whoosh effects: off'}
        </button>
        <button
          type="button"
          onClick={() => setRoomSound((v) => !v)}
          className={`py-1.5 rounded-xl text-[10px] font-extrabold border ${
            roomSound ? 'bg-[#E8EFE9] text-[#485B4A] border-[#7A907C]/60' : 'bg-white text-[#6E655F] border-[#2C2724]/15'
          }`}
        >
          {roomSound ? 'Room sound: on' : 'Room sound: off'}
        </button>
      </div>

      {/* Caption */}
      <div className="p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/10 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F]">Caption</span>
          <button
            type="button"
            data-testid="viral-copy-caption"
            onClick={copyCaption}
            className="text-[10px] font-extrabold text-[#D06C4E] flex items-center gap-1"
          >
            {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p data-testid="viral-caption" className="text-[11px] text-[#2C2724] whitespace-pre-line leading-snug">
          {plan.caption}
        </p>
      </div>

      {/* Export */}
      <div className="space-y-2">
        {(exportState.phase === 'idle' || exportState.phase === 'error' || exportStale) && (
          <button
            type="button"
            data-testid="viral-export-btn"
            disabled={Boolean(analyzing)}
            onClick={handleExport}
            className="w-full py-3 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-warm-sm active:scale-95 disabled:bg-[#2C2724]/15 disabled:text-[#6E655F] disabled:shadow-none"
          >
            <Wand2 className="w-4 h-4" />
            {exportStale ? 'Update my video' : 'Make my video'}
          </button>
        )}
        {(exportState.phase === 'checking' || exportState.phase === 'rendering') && (
          <div className="space-y-1" data-testid="viral-export-progress">
            <p className="text-[10px] font-bold text-[#6E655F] flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D06C4E]" />
              {exportState.phase === 'checking'
                ? 'Getting ready…'
                : `Making your video… ${Math.round(exportState.progress * 100)}%`}
            </p>
            <div className="h-1.5 rounded-full bg-[#2C2724]/10 overflow-hidden">
              <div
                className="h-full bg-[#D06C4E]"
                style={{ width: `${exportState.phase === 'rendering' ? Math.round(exportState.progress * 100) : 3}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="text-[10px] font-bold text-[#6E655F] underline"
            >
              Cancel
            </button>
          </div>
        )}
        {exportState.phase === 'error' && (
          <p data-testid="viral-export-error" className="text-[10px] font-semibold text-[#9A4A33]">
            {exportState.message}
          </p>
        )}
        {exportState.phase === 'done' && (
          <div className="space-y-1.5" data-testid="viral-export-done">
            <p className="text-[10px] font-extrabold text-[#485B4A] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Your video is ready{exportStale ? ' (made before your last change)' : ''}.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                data-testid="viral-share-btn"
                onClick={() => shareOrDownloadVideo(exportState.blob, videoFileName(plan), plan.caption)}
                className="py-2 rounded-xl bg-[#2C2724] text-[#F9F7F3] text-[11px] font-extrabold flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
              <a
                href={exportState.url}
                download={videoFileName(plan)}
                className="py-2 rounded-xl bg-white border border-[#2C2724]/30 text-[#2C2724] text-[11px] font-extrabold flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
            </div>
            {onVideoReady && (
              <button
                type="button"
                data-testid="viral-use-video-btn"
                onClick={() => {
                  handedOffUrls.current.add(exportState.url);
                  onVideoReady({ blob: exportState.blob, url: exportState.url, plan, caption: plan.caption });
                }}
                className="w-full py-2 rounded-xl bg-[#7A907C] hover:bg-[#6a7f6c] text-white text-[11px] font-extrabold flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Film className="w-3.5 h-3.5" />
                Use this video on my listing
              </button>
            )}
          </div>
        )}
      </div>

      {/* Posting tips */}
      <div>
        <button
          type="button"
          onClick={() => setShowTips((v) => !v)}
          className="text-[10px] font-extrabold text-[#6E655F] underline"
        >
          {showTips ? 'Hide posting tips' : 'Posting tips for more views'}
        </button>
        {showTips && (
          <ul className="mt-1.5 space-y-1 list-disc pl-4">
            {POSTING_TIPS.map((tip) => (
              <li key={tip} className="text-[10px] text-[#6E655F] leading-snug">
                {tip}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
