import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import {
  AlertTriangle,
  CheckCircle2,
  Music,
  Pencil,
  Send,
  SunMedium,
  Undo2,
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
import { LENGTH_PRESETS, PACE_PRESETS, buildViralEditPlan, editableShots, roomDetail } from '../remotion/viral/plan';
import { STYLE_INFO, violatesFairHousing, MAX_HOOK_CHARS, MAX_TAG_CHARS } from '../remotion/viral/copy';
import { analyzeClipInBrowser } from '../remotion/viral/analyzeClipInBrowser';
import { fetchViralAiHints, scanTimes } from '../remotion/viral/aiCopy';
import { makeAiMusic } from '../remotion/viral/aiMusic';
import {
  DEFAULT_EDIT_SETTINGS,
  applyEditPatch,
  isEmptyPatch,
  localEditPatch,
  type SavedVideoEdit,
  type ViralEditPatch,
  type ViralEditSettings,
} from '../remotion/viral/editSettings';
import { LOOK_CONTROLS, LOOK_PRESETS, autoLook, presetOf, type LookPresetId } from '../remotion/viral/look';
import {
  checkBrowserCanExport,
  exportViralVideo,
  preloadExporter,
  shareOrDownloadVideo,
  videoFileName,
} from '../remotion/viral/exportVideo';
import { isStaleCodeError, STALE_CODE_MESSAGE } from '../utils/staleCode';
import { bestGradeFix, gradeFixCandidates, gradePlan, PASS_SCORE, type PlanGrade } from '../remotion/viral/grade';
import type {
  ClipAnalysis,
  ViralAiHints,
  ViralClipInput,
  ViralEditPlan,
  ViralLength,
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
  /** The choices, analysis and AI copy behind this video, so it can be edited again later */
  edit: Omit<SavedVideoEdit, 'clips'>;
  /** The ~13 s teaser cut from the same edit (only with `exportTeaserToo`) */
  teaser?: { blob: Blob; plan: ViralEditPlan };
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
  /** 'edit' re-opens a published listing's video (different labels, no step number) */
  mode?: 'create' | 'edit';
  /** Choices to start from (a saved edit) */
  initialSettings?: Partial<ViralEditSettings>;
  /** Clip analysis saved with the listing, per slot: skips analyzing the clips again */
  initialAnalyses?: Record<number, ClipAnalysis | null>;
  /** Fenly 2.0 Fill: also export the teaser (same edit, length 'teaser') right after the full tour */
  exportTeaserToo?: boolean;
}

type AiEditState =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'done'; summary: string[]; source: 'local' | 'ai' }
  | { phase: 'error'; message: string };

/**
 * Create Listing makes the choices for the host: price hook (editable text), full
 * tour, balanced pace, no sound effects, room sound or music. Lighting is set
 * automatically from the clips. The edit screen offers all of these as controls.
 */
const CREATE_LISTING_SETTINGS: Partial<ViralEditSettings> = {
  style: 'price-hook',
  length: 'full',
  pace: 'balanced',
  sfxOn: false,
  roomSound: false,
  music: null,
};

/**
 * Music is switched off until we decide how to handle it: no music controls in
 * Create Listing or the edit screen, and no music in previews or exports (even
 * for listings saved with a track). The AI music code (/api/viral/music,
 * musicMood.ts, aiMusic.ts) stays in place; set this to true to bring it back.
 */
const MUSIC_ENABLED = false;

const QUICK_EDITS = ['Brighter', 'Warmer', 'Punchier', 'Faster', 'Shorter', 'No whoosh'];

type ExportState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'rendering'; progress: number }
  | { phase: 'done'; blob: Blob; url: string; planKey: string; teaser?: { blob: Blob; plan: ViralEditPlan } }
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
  mode = 'create',
  initialSettings,
  initialAnalyses,
  exportTeaserToo = false,
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

  // Local clip analysis (runs on the device, two clips at a time)
  const analysisCache = useRef(new Map<string, ClipAnalysis | null>());
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const [analyzing, setAnalyzing] = useState<{ done: number; total: number; fraction: number } | null>(null);

  useEffect(() => {
    // A saved edit already has each clip's analysis: no need to decode the clips again
    for (const c of clips) {
      const saved = initialAnalyses?.[c.slotNumber];
      if (saved !== undefined && !analysisCache.current.has(c.src)) analysisCache.current.set(c.src, saved);
    }
    const pending = clips.filter((c) => !analysisCache.current.has(c.src));
    if (pending.length === 0) {
      setAnalyzing(null);
      return;
    }
    const controller = new AbortController();
    const fractions = pending.map(() => 0);
    let finished = 0;
    const report = () =>
      setAnalyzing({
        done: finished,
        total: pending.length,
        fraction: fractions.reduce((a, b) => a + b, 0) / pending.length,
      });
    report();
    let next = 0;
    const worker = async () => {
      while (!controller.signal.aborted && next < pending.length) {
        const i = next++;
        const result = await analyzeClipInBrowser(pending[i].src, {
          signal: controller.signal,
          onProgress: (fraction) => {
            fractions[i] = fraction;
            report();
          },
        });
        if (controller.signal.aborted) return;
        analysisCache.current.set(pending[i].src, result);
        fractions[i] = 1;
        finished += 1;
        report();
        setAnalysisVersion((v) => v + 1);
      }
    };
    Promise.all([worker(), worker()]).then(() => {
      if (!controller.signal.aborted) setAnalyzing(null);
    });
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
        scanSec: scanTimes(analysisCache.current.get(c.src), c.durationSec),
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

  // Host choices: one settings object, so it can be saved with the listing and patched by AI requests
  const [settings, setSettings] = useState<ViralEditSettings>(() => ({
    ...DEFAULT_EDIT_SETTINGS,
    ...(mode === 'create' ? CREATE_LISTING_SETTINGS : {}),
    ...initialSettings,
  }));
  const update = (patch: Partial<ViralEditSettings>) => setSettings((prev) => ({ ...prev, ...patch }));
  const { style, length, pace, hookSlot, hookDraft, tagEdits, detailEdits, sfxOn, roomSound, look, music } = settings;
  const [effectsOn] = useState(supportsWebGL2);

  // Music the host uploads (their own track): blob URLs this editor made are freed when replaced
  const ownMusicUrls = useRef(new Set<string>());
  useEffect(() => () => ownMusicUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const handleMusicFile = (file: File | undefined) => {
    if (!file) return;
    const src = URL.createObjectURL(file);
    ownMusicUrls.current.add(src);
    setSettings((prev) => {
      if (prev.music && ownMusicUrls.current.has(prev.music.src)) {
        URL.revokeObjectURL(prev.music.src);
        ownMusicUrls.current.delete(prev.music.src);
      }
      return { ...prev, music: { src, name: file.name, volume: prev.music?.volume ?? 0.55 } };
    });
  };

  // AI music: an original track with the feel of a song the host likes (one server call per tap)
  const [songInput, setSongInput] = useState(initialSettings?.music?.inspiredBy ?? '');
  const [musicJob, setMusicJob] = useState<{ phase: 'idle' | 'working' } | { phase: 'error'; message: string }>({ phase: 'idle' });
  const musicAbort = useRef<AbortController | null>(null);
  useEffect(() => () => musicAbort.current?.abort(), []);
  const makeMusic = async () => {
    const song = songInput.trim();
    if (!song || musicJob.phase === 'working') return;
    musicAbort.current?.abort();
    const controller = new AbortController();
    musicAbort.current = controller;
    setMusicJob({ phase: 'working' });
    try {
      const track = await makeAiMusic(song, controller.signal);
      if (controller.signal.aborted) return;
      ownMusicUrls.current.add(track.src);
      setSettings((prev) => {
        if (prev.music && ownMusicUrls.current.has(prev.music.src)) {
          URL.revokeObjectURL(prev.music.src);
          ownMusicUrls.current.delete(prev.music.src);
        }
        return { ...prev, music: prev.music ? { ...track, volume: prev.music.volume } : track };
      });
      setMusicJob({ phase: 'idle' });
    } catch (error) {
      if (controller.signal.aborted) return;
      setMusicJob({ phase: 'error', message: error instanceof Error ? error.message : 'We couldn’t make music right now.' });
    }
  };

  // Edit by typing: common requests are handled on the device; the rest goes to a small text-only AI call
  const [aiRequest, setAiRequest] = useState('');
  const [aiEdit, setAiEdit] = useState<AiEditState>({ phase: 'idle' });
  const [undoSettings, setUndoSettings] = useState<ViralEditSettings | null>(null);
  const applyPatch = (patch: ViralEditPatch, source: 'local' | 'ai') => {
    setUndoSettings(settings);
    setSettings((prev) => applyEditPatch(prev, patch));
    setAiEdit({ phase: 'done', summary: patch.summary.length ? patch.summary : ['Updated'], source });
  };
  const [showTips, setShowTips] = useState(false);
  const [copied, setCopied] = useState(false);

  // Create Listing: lighting is automatic, set from the footage (look.ts autoLook)
  useEffect(() => {
    if (mode !== 'create' || !analysisDone) return;
    const measured = clips
      .map((c) => analysisCache.current.get(c.src))
      .filter((a): a is ClipAnalysis => Boolean(a))
      .map((a) => ({ meanLuma: a.best.meanLuma, exposureBoost: a.exposureBoost }));
    setSettings((prev) => ({ ...prev, look: autoLook(measured) }));
    // clipKey / analysisVersion change whenever a shot or its analysis changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, analysisDone, clipKey, analysisVersion]);

  const buildPlanFor = (planLength: typeof length, over: Partial<ViralEditSettings> = {}): ViralEditPlan | null => {
    if (clips.length === 0) return null;
    const { style, pace, hookSlot, hookDraft, tagEdits, detailEdits } = { ...settings, ...over };
    try {
      return buildViralEditPlan(
        {
          listing,
          clips: clips.map((c) => ({ ...c, analysis: analysisCache.current.get(c.src) ?? null })),
        },
        {
          style,
          length: planLength,
          pace,
          hookSlotNumber: hookSlot,
          hookTextOverride: hookDraft,
          tagOverrides: tagEdits,
          detailOverrides: detailEdits,
          ai: activeHints,
          sfx: sfxOn,
          keepRoomSound: roomSound,
          enableEffects: effectsOn,
          look,
          music: MUSIC_ENABLED && music ? { src: music.src, volume: music.volume } : null,
        }
      );
    } catch {
      return null;
    }
  };
  const planDeps = [clips, listing, style, length, pace, hookSlot, hookDraft, tagEdits, detailEdits, activeHints, sfxOn, roomSound, effectsOn, look, music, analysisVersion];
  // analysisVersion tells us the cache changed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo<ViralEditPlan | null>(() => buildPlanFor(length), planDeps);
  // The teaser: the same edit cut to ~13 s (only when asked for, and when the main video isn't already the teaser)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const teaserPlan = useMemo<ViralEditPlan | null>(() => (exportTeaserToo && length !== 'teaser' ? buildPlanFor('teaser') : null), [exportTeaserToo, ...planDeps]);

  const planKey = useMemo(() => (plan ? JSON.stringify(plan) : ''), [plan]);

  // Every video is graded on the 20-point audit rubric (grade.ts) and must score PASS_SCORE to export
  const gradeClips = useMemo(
    () => clips.map((c) => ({ ...c, analysis: analysisCache.current.get(c.src) ?? null })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clips, analysisVersion]
  );
  const grade = useMemo<PlanGrade | null>(
    () => (plan ? gradePlan(plan, gradeClips, activeHints?.frames) : null),
    [plan, gradeClips, activeHints]
  );
  // Below the bar: the best change the editor can make on its own (another opener, the standard headline...)
  const gradeFix = useMemo(() => {
    if (!grade || grade.passed || !analysisDone) return null;
    return bestGradeFix(grade, gradeFixCandidates(clips.map((c) => c.slotNumber)), (patch) => {
      const p = buildPlanFor(length, patch);
      return p ? { plan: p, grade: gradePlan(p, gradeClips, activeHints?.frames) } : null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade, analysisDone]);

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

  const playerRef = useRef<PlayerRef>(null);
  // Fetch the renderer in the background while the host edits
  useEffect(() => {
    const id = window.setTimeout(preloadExporter, 1500);
    return () => window.clearTimeout(id);
  }, []);
  const handleExport = async () => {
    if (!plan || !grade?.passed) return;
    // The preview and the export would decode the same clips at once: pause the preview
    playerRef.current?.pause();
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
      // With a teaser, one progress bar covers both renders, weighted by length
      const fullShare = teaserPlan ? plan.totalFrames / (plan.totalFrames + teaserPlan.totalFrames) : 1;
      const blob = await exportViralVideo(plan, {
        signal: controller.signal,
        onProgress: (progress) => setExportState({ phase: 'rendering', progress: progress * fullShare }),
      });
      let teaser: { blob: Blob; plan: ViralEditPlan } | undefined;
      if (teaserPlan) {
        const teaserBlob = await exportViralVideo(teaserPlan, {
          signal: controller.signal,
          onProgress: (progress) => setExportState({ phase: 'rendering', progress: fullShare + progress * (1 - fullShare) }),
        });
        teaser = { blob: teaserBlob, plan: teaserPlan };
      }
      setExportState({ phase: 'done', blob, url: URL.createObjectURL(blob), planKey, teaser });
    } catch (error) {
      if (controller.signal.aborted) {
        setExportState({ phase: 'idle' });
        return;
      }
      setExportState({
        phase: 'error',
        message:
          isStaleCodeError(error)
            ? STALE_CODE_MESSAGE
            : error instanceof Error && /delayRender|timed? ?out/i.test(error.message)
            ? 'Making the video took too long reading one of your clips. Close other apps or tabs and try again; on a computer, iPhone clips export fastest in Safari or Chrome.'
            : error instanceof Error
            ? `${error.message.split('\n')[0].slice(0, 200)} If a clip came from an iPhone, try Safari or Chrome on the phone that filmed it.`
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

  /** What to save with the listing so this video can be edited again without recomputing anything. */
  const editSnapshot = (): ViralVideoResult['edit'] => ({
    listing,
    settings,
    analyses: Object.fromEntries(clips.map((c) => [c.slotNumber, analysisCache.current.get(c.src) ?? null])),
    aiHints: activeHints,
  });

  const runEdit = async (request: string) => {
    const text = request.trim();
    if (!text || !plan) return;
    const local = localEditPatch(text, settings);
    if (local?.fullyUnderstood) {
      applyPatch(local.patch, 'local');
      setAiRequest('');
      return;
    }
    setAiEdit({ phase: 'working' });
    try {
      const response = await fetch('/api/viral/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: text,
          settings: { ...settings, music: settings.music ? { ...settings.music, src: '' } : null },
          hookText: plan.hook.text,
          shots: editableShots(plan).map((shot) => ({
            slotNumber: shot.slotNumber,
            room: shot.room,
            tag: shot.tag,
            detail: roomDetail(plan, shot.slotNumber),
          })),
          listing,
        }),
      });
      const data = (await response.json()) as { patch?: ViralEditPatch | null; source?: 'local' | 'ai'; error?: string };
      if (!response.ok) throw new Error(data.error || 'Request failed');
      if (data.patch && !isEmptyPatch(data.patch)) {
        applyPatch(data.patch, data.source === 'ai' ? 'ai' : 'local');
        setAiRequest('');
      } else if (local) {
        applyPatch(local.patch, 'local');
      } else {
        setAiEdit({
          phase: 'error',
          message: data.patch?.summary?.[0] || 'We couldn’t tell what to change. Try “brighter”, “warmer”, or a new hook.',
        });
      }
    } catch {
      if (local) applyPatch(local.patch, 'local');
      else setAiEdit({ phase: 'error', message: 'AI edits aren’t available right now. The controls below still work.' });
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
  const aiCopyUsed = Boolean(
    activeHints && (activeHints.hookText || Object.keys(activeHints.tags ?? {}).length || Object.keys(activeHints.details ?? {}).length)
  );
  const fixedWarnings = plan.warnings.filter((w) => w.severity === 'fixed');

  const aiMusicField = (
    <div className="space-y-1.5" data-testid="viral-ai-music">
      <div className="flex items-center gap-1.5">
        <input
          data-testid="viral-song-input"
          value={songInput}
          maxLength={120}
          placeholder="Type a song you like, e.g. “Golden Hour”"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSongInput(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              makeMusic();
            }
          }}
          className="flex-1 min-w-0 px-2.5 py-2 rounded-xl border border-[#2C2724]/20 bg-white text-[11px] font-semibold text-[#2C2724] focus:outline-none focus:border-[#D06C4E]"
        />
        <button
          type="button"
          data-testid="viral-make-music"
          onClick={makeMusic}
          disabled={!songInput.trim() || musicJob.phase === 'working'}
          className="shrink-0 px-3 py-2 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-[10px] font-extrabold flex items-center gap-1 active:scale-95 disabled:bg-[#2C2724]/15 disabled:text-[#6E655F]"
        >
          {musicJob.phase === 'working' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Music className="w-3.5 h-3.5" />}
          {music?.inspiredBy ? 'New track' : 'Make music'}
        </button>
      </div>
      {musicJob.phase === 'working' && (
        <p className="text-[10px] font-semibold text-[#6E655F]">Composing an original track in that mood (about 10 seconds)…</p>
      )}
      {musicJob.phase === 'error' && (
        <p data-testid="viral-music-error" className="text-[10px] font-semibold text-[#9A4A33]">
          {musicJob.message}
        </p>
      )}
      {music && (
        <div className="p-2 rounded-xl bg-[#E8EFE9] border border-[#7A907C]/50 space-y-1.5" data-testid="viral-music-chosen">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-extrabold text-[#485B4A] truncate">
              {music.name}
              {music.inspiredBy ? <span className="font-semibold"> · feel of “{music.inspiredBy}”</span> : null}
            </p>
            <button
              type="button"
              data-testid="viral-music-remove"
              onClick={() => update({ music: null })}
              className="shrink-0 text-[10px] font-extrabold text-[#6E655F] hover:text-[#2C2724]"
            >
              Remove
            </button>
          </div>
          <audio src={music.src} controls preload="none" className="w-full h-8" />
        </div>
      )}
      <p className="text-[10px] text-[#6E655F] leading-snug">
        We make a new instrumental with a similar mood, not the song itself, so it’s safe to post. For a trending sound, you
        can still add one inside TikTok or Reels.
      </p>
    </div>
  );

  return (
    <div
      data-testid="viral-video-editor"
      className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-3"
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        // Enter in a text box here must not submit Create Listing's form (it would publish)
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault();
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#D06C4E]/15 text-[#D06C4E] flex items-center justify-center font-extrabold text-xs shrink-0">
            {mode === 'edit' ? <Pencil className="w-3.5 h-3.5" /> : 3}
          </div>
          <div>
            <h4 className="font-extrabold text-xs text-[#2C2724]">
              {mode === 'edit' ? 'Edit your video' : 'Auto-Edit: Viral Room Tour'}
            </h4>
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
          {analyzing ? `Checking shots ${analyzing.done}/${analyzing.total}` : 'Ready'}
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
              style={{ width: `${Math.round(analyzing.fraction * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Live preview */}
      <div className="flex justify-center">
        <div className="relative w-full max-w-[260px] rounded-[28px] overflow-hidden border-2 border-[#2C2724] bg-[#2C2724] shadow-warm">
          <Player
            ref={playerRef}
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

      {/* Edit screen only: typed requests to the AI */}
      {mode === 'edit' && (
        <>
        {/* Edit by typing (AI) */}
        <div className="p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/10 space-y-2" data-testid="viral-ai-edit">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F] flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#D06C4E]" />
              Tell AI what to change
            </span>
            {undoSettings && (
              <button
                type="button"
                data-testid="viral-ai-undo"
                onClick={() => {
                  setSettings(undoSettings);
                  setUndoSettings(null);
                  setAiEdit({ phase: 'idle' });
                }}
                className="text-[10px] font-extrabold text-[#6E655F] flex items-center gap-1 hover:text-[#2C2724]"
              >
                <Undo2 className="w-3 h-3" />
                Undo
              </button>
            )}
          </div>
          {/* Not a <form>: the editor sits inside Create Listing's form, and a nested submit would publish */}
          <div className="flex items-center gap-1.5">
            <input
              data-testid="viral-ai-edit-input"
              value={aiRequest}
              maxLength={300}
              placeholder="e.g. brighter, and call the closet “Walk-in closet”"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAiRequest(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runEdit(aiRequest);
                }
              }}
              className="flex-1 min-w-0 px-2.5 py-2 rounded-xl border border-[#2C2724]/20 bg-white text-[11px] font-semibold text-[#2C2724] focus:outline-none focus:border-[#D06C4E]"
            />
            <button
              type="button"
              onClick={() => runEdit(aiRequest)}
              data-testid="viral-ai-edit-send"
              disabled={!aiRequest.trim() || aiEdit.phase === 'working'}
              aria-label="Apply"
              className="shrink-0 w-9 h-9 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white flex items-center justify-center active:scale-95 disabled:bg-[#2C2724]/15 disabled:text-[#6E655F]"
            >
              {aiEdit.phase === 'working' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {QUICK_EDITS.map((q) => (
              <button
                key={q}
                type="button"
                data-testid={`viral-quick-edit-${q.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => runEdit(q)}
                className="px-2 py-1 rounded-full bg-white border border-[#2C2724]/15 text-[10px] font-bold text-[#2C2724] hover:bg-[#F2EFE9] active:scale-95"
              >
                {q}
              </button>
            ))}
          </div>
          {aiEdit.phase === 'done' && (
            <p data-testid="viral-ai-edit-result" className="text-[10px] font-semibold text-[#485B4A] flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              {aiEdit.summary.join(' · ')}
              <span className="text-[#6E655F] font-normal">{aiEdit.source === 'ai' ? '(AI)' : '(instant)'}</span>
            </p>
          )}
          {aiEdit.phase === 'error' && (
            <p data-testid="viral-ai-edit-error" className="text-[10px] font-semibold text-[#9A4A33]">
              {aiEdit.message}
            </p>
          )}
        </div>

      
        </>
      )}

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
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F]">
          {mode === 'edit' ? 'Opening hook' : 'Opening headline'}
        </span>
        {mode === 'edit' && (
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(STYLE_INFO) as ViralStyleId[]).map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`viral-style-${id}`}
              onClick={() => {
                update({ style: id, hookDraft: null });
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
        )}
        <p className="text-[10px] text-[#6E655F] leading-snug">
          {mode === 'edit' ? STYLE_INFO[style].blurb : 'Opens on the rent and the neighborhood. Tap the text to change it.'}
        </p>
        <div className="flex items-center gap-1.5">
          <input
            data-testid="viral-hook-input"
            value={hookValue}
            maxLength={MAX_HOOK_CHARS}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update({ hookDraft: e.target.value })}
            className="flex-1 min-w-0 px-2.5 py-2 rounded-xl border border-[#2C2724]/20 bg-[#F9F7F3] text-[11px] font-bold text-[#2C2724] focus:outline-none focus:border-[#D06C4E]"
          />
          {hookDraft !== null && (
            <button
              type="button"
              onClick={() => update({ hookDraft: null })}
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
        {aiCopyUsed && hookDraft === null && (
          <p data-testid="viral-ai-copy-note" className="text-[10px] font-semibold text-[#485B4A] flex items-center gap-1">
            <Sparkles className="w-3 h-3 shrink-0" />
            AI looked at your shots and wrote the callouts{style === 'price-hook' && activeHints?.hookText ? ' and hook' : ''}.
          </p>
        )}
      </div>

      {/* Edit screen only: length, pace and lighting (Create Listing uses the full tour, balanced pace and automatic lighting) */}
      {mode === 'edit' && (
        <>
        {/* Length */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F]">Length</span>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(LENGTH_PRESETS) as ViralLength[]).map((id) => (
              <button
                key={id}
                type="button"
                data-testid={`viral-length-${id}`}
                onClick={() => update({ length: id })}
                className={`py-1.5 px-1 rounded-xl text-[10px] font-extrabold border transition-all active:scale-95 ${
                  length === id
                    ? 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724]'
                    : 'bg-[#F9F7F3] text-[#2C2724] border-[#2C2724]/20 hover:bg-[#F2EFE9]'
                }`}
              >
                {LENGTH_PRESETS[id].label} · {LENGTH_PRESETS[id].approxLabel}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[#6E655F] leading-snug">
            {length === 'full'
              ? 'Every room gets about 5 seconds, with facts and a perk reveal. Best for TikTok and Reels.'
              : 'A quick loop of every room. Good for a second post or Stories.'}
          </p>
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
                onClick={() => update({ pace: id })}
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

        {/* Lighting */}
        <div className="space-y-1.5" data-testid="viral-look">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F] flex items-center gap-1">
            <SunMedium className="w-3 h-3" />
            Lighting
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(LOOK_PRESETS) as LookPresetId[]).map((id) => (
              <button
                key={id}
                type="button"
                data-testid={`viral-look-${id}`}
                onClick={() => update({ look: LOOK_PRESETS[id].look })}
                className={`py-1.5 px-1 rounded-xl text-[10px] font-extrabold border transition-all active:scale-95 ${
                  presetOf(look) === id
                    ? 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724]'
                    : 'bg-[#F9F7F3] text-[#2C2724] border-[#2C2724]/20 hover:bg-[#F2EFE9]'
                }`}
              >
                {LOOK_PRESETS[id].label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[#6E655F] leading-snug">
            {presetOf(look) ? LOOK_PRESETS[presetOf(look)!].blurb : 'Custom lighting.'}
          </p>
          {LOOK_CONTROLS.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-[10px] font-bold text-[#2C2724]">
              <span className="w-16 shrink-0">{c.label}</span>
              <span className="w-11 shrink-0 text-right text-[#6E655F] font-semibold">{c.low}</span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={look[c.key]}
                data-testid={`viral-look-slider-${c.key}`}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  update({ look: { ...look, [c.key]: Number(e.target.value) } })
                }
                className="flex-1 min-w-0 accent-[#D06C4E]"
              />
              <span className="w-12 shrink-0 text-[#6E655F] font-semibold">{c.high}</span>
            </label>
          ))}
          {!effectsOn && (
            <p className="text-[10px] text-[#9A4A33]">This browser can’t preview lighting changes (no WebGL2).</p>
          )}
        </div>

      
        </>
      )}

      {/* Shots in edit order */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F]">
          Shots in order (tap a callout to edit it)
        </span>
        {editableShots(plan).map((shot, i) => (
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
                <>
                  <input
                    data-testid={`viral-tag-input-${shot.slotNumber}`}
                    value={tagEdits[shot.slotNumber] ?? shot.tag}
                    maxLength={MAX_TAG_CHARS}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setSettings((prev) => ({ ...prev, tagEdits: { ...prev.tagEdits, [shot.slotNumber]: e.target.value } }))
                    }
                    className="w-full mt-0.5 px-2 py-1 rounded-lg border border-[#2C2724]/15 bg-white text-[10px] font-bold text-[#2C2724] uppercase focus:outline-none focus:border-[#D06C4E]"
                  />
                  {shot.role === 'tour' && length === 'full' && (
                    <input
                      data-testid={`viral-detail-input-${shot.slotNumber}`}
                      value={detailEdits[shot.slotNumber] ?? roomDetail(plan, shot.slotNumber)}
                      placeholder="Second callout (optional)"
                      maxLength={MAX_TAG_CHARS}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setSettings((prev) => ({ ...prev, detailEdits: { ...prev.detailEdits, [shot.slotNumber]: e.target.value } }))
                      }
                      className="w-full mt-1 px-2 py-1 rounded-lg border border-dashed border-[#2C2724]/20 bg-white text-[10px] font-bold text-[#6E655F] uppercase placeholder:normal-case placeholder:font-semibold focus:outline-none focus:border-[#D06C4E]"
                    />
                  )}
                </>
              )}
            </div>
            {shot.role !== 'hook' && (
              <button
                type="button"
                data-testid={`viral-make-opener-${shot.slotNumber}`}
                onClick={() => update({ hookSlot: shot.slotNumber })}
                title="Open the video with this shot"
                className="shrink-0 p-1.5 rounded-lg border border-[#2C2724]/15 bg-white text-[#D06C4E] hover:bg-[#F2EFE9]"
              >
                <Star className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Edit screen only: sound effects, room sound and music (Create Listing uses none) */}
      {mode === 'edit' && (
        <>
        {/* Sound */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => update({ sfxOn: !sfxOn })}
            className={`py-1.5 rounded-xl text-[10px] font-extrabold border ${
              sfxOn ? 'bg-[#E8EFE9] text-[#485B4A] border-[#7A907C]/60' : 'bg-white text-[#6E655F] border-[#2C2724]/15'
            }`}
          >
            {sfxOn ? 'Whoosh effects: on' : 'Whoosh effects: off'}
          </button>
          <button
            type="button"
            onClick={() => update({ roomSound: !roomSound })}
            className={`py-1.5 rounded-xl text-[10px] font-extrabold border ${
              roomSound ? 'bg-[#E8EFE9] text-[#485B4A] border-[#7A907C]/60' : 'bg-white text-[#6E655F] border-[#2C2724]/15'
            }`}
          >
            {roomSound ? 'Room sound: on' : 'Room sound: off'}
          </button>
        </div>

        {/* Music (hidden for now, see MUSIC_ENABLED) */}
        {MUSIC_ENABLED && (
        <div className="space-y-1.5" data-testid="viral-music">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F] flex items-center gap-1">
            <Music className="w-3 h-3" />
            Music
          </span>
          {aiMusicField}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="viral-music-none"
              onClick={() => update({ music: null })}
              className={`px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold border ${
                !music ? 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724]' : 'bg-[#F9F7F3] text-[#2C2724] border-[#2C2724]/20'
              }`}
            >
              None
            </button>
            <label
              className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold border cursor-pointer truncate ${
                music ? 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724]' : 'bg-[#F9F7F3] text-[#2C2724] border-[#2C2724]/20 hover:bg-[#F2EFE9]'
              }`}
            >
              {music ? `Track: ${music.name}` : 'Add my own track…'}
              <input
                type="file"
                accept="audio/*"
                data-testid="viral-music-input"
                className="hidden"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  handleMusicFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {music && (
            <label className="flex items-center gap-2 text-[10px] font-bold text-[#2C2724]">
              <span className="w-16 shrink-0">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={music.volume}
                data-testid="viral-music-volume"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  update({ music: { ...music, volume: Number(e.target.value) } })
                }
                className="flex-1 min-w-0 accent-[#D06C4E]"
              />
              <span className="w-8 shrink-0 text-right text-[#6E655F]">{Math.round(music.volume * 100)}%</span>
            </label>
          )}
          <p className="text-[10px] text-[#6E655F] leading-snug">
            Only use music you have the rights to. For a trending sound, post without music and add it inside TikTok or Reels.
          </p>
        </div>
        )}

      
        </>
      )}

      {/* Create Listing: AI music only (hidden for now, see MUSIC_ENABLED) */}
      {MUSIC_ENABLED && mode === 'create' && (
        <div className="space-y-1.5" data-testid="viral-music-create">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6E655F] flex items-center gap-1">
            <Music className="w-3 h-3" />
            Music (optional)
          </span>
          {aiMusicField}
        </div>
      )}

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

      {/* Video score (grade.ts): the 20-point audit, 18 to export */}
      {grade && (
        <VideoScoreCard
          grade={grade}
          checking={!analysisDone}
          fix={gradeFix}
          onApplyFix={() => gradeFix && update(gradeFix.patch)}
          onRetakeShot={onRetakeShot}
        />
      )}

      {/* Export */}
      <div className="space-y-2">
        {(exportState.phase === 'idle' || exportState.phase === 'error' || exportStale) && (
          <button
            type="button"
            data-testid="viral-export-btn"
            disabled={Boolean(analyzing) || !grade?.passed}
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
                : `${teaserPlan ? 'Making your tour and teaser' : 'Making your video'}… ${Math.round(exportState.progress * 100)}%`}
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
                  // The music now belongs to the listing too: don't free it when this editor closes
                  if (settings.music) ownMusicUrls.current.delete(settings.music.src);
                  onVideoReady({
                    blob: exportState.blob,
                    url: exportState.url,
                    plan,
                    caption: plan.caption,
                    edit: editSnapshot(),
                    teaser: exportState.teaser,
                  });
                }}
                className="w-full py-2 rounded-xl bg-[#7A907C] hover:bg-[#6a7f6c] text-white text-[11px] font-extrabold flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Film className="w-3.5 h-3.5" />
                {mode === 'edit' ? 'Save this video to my listing' : 'Use this video on my listing'}
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

/** The video's score on the audit rubric: what holds it back, a one-tap fix, and retakes. */
const VideoScoreCard: React.FC<{
  grade: PlanGrade;
  checking: boolean;
  fix: { patch: object; grade: PlanGrade } | null;
  onApplyFix: () => void;
  onRetakeShot?: (slotNumber: number) => void;
}> = ({ grade, checking, fix, onApplyFix, onRetakeShot }) => {
  const [open, setOpen] = useState(false);
  const weak = grade.rows.filter((r) => r.score < 2);
  const retakes = [...new Set(weak.flatMap((r) => r.retakeSlots))];
  return (
    <div
      data-testid="viral-score"
      className={`p-3 rounded-xl border space-y-2 ${grade.passed ? 'bg-[#E8EFE9] border-[#7A907C]/50' : 'bg-[#F9F7F3] border-[#2C2724]/15'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-xs font-extrabold ${grade.passed ? 'text-[#485B4A]' : 'text-[#2C2724]'}`}>
            {checking ? 'Checking your clips…' : `Video score ${grade.total}/${grade.max}`}
          </p>
          <p className="text-[10px] font-semibold text-[#6E655F]">
            {checking
              ? 'The score is ready once every clip is checked.'
              : grade.passed
              ? 'Ready to post.'
              : `It needs ${PASS_SCORE}/${grade.max} to go out.`}
          </p>
        </div>
        {weak.length > 0 && !checking && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="min-h-10 px-2 text-[10px] font-extrabold text-[#A9513A] shrink-0"
          >
            {open ? 'Hide' : `What to fix (${weak.length})`}
          </button>
        )}
      </div>
      {!checking && fix && (
        <button
          type="button"
          data-testid="viral-score-fix"
          onClick={onApplyFix}
          className="w-full min-h-10 rounded-lg bg-[#B85B3F] hover:bg-[#A9513A] text-white text-[11px] font-extrabold flex items-center justify-center gap-1.5 active:scale-95"
        >
          <Sparkles className="w-3.5 h-3.5" /> Fix it for me ({fix.grade.total}/{fix.grade.max})
        </button>
      )}
      {!checking && (open || (!grade.passed && !fix)) && weak.length > 0 && (
        <ul className="space-y-1.5">
          {weak.map((r) => (
            <li key={r.key} className="text-[10px] leading-snug">
              <span className="font-extrabold text-[#2C2724]">
                {r.label} {r.score}/2:
              </span>{' '}
              <span className="text-[#6E655F]">{r.note}</span>
              {r.fix && <span className="block font-semibold text-[#2C2724]">{r.fix}</span>}
            </li>
          ))}
        </ul>
      )}
      {!checking && !grade.passed && retakes.length > 0 && onRetakeShot && (
        <div className="flex flex-wrap gap-1.5">
          {retakes.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => onRetakeShot(slot)}
              className="min-h-10 px-2.5 rounded-lg bg-white border border-[#2C2724]/20 text-[10px] font-extrabold flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Retake {GUIDED_SHOTS.find((g) => g.slotNumber === slot)?.name ?? `shot ${slot}`}
            </button>
          ))}
        </div>
      )}
      {!checking && grade.lengthNote && <p className="text-[10px] font-semibold text-[#6E655F]">{grade.lengthNote}</p>}
    </div>
  );
};
