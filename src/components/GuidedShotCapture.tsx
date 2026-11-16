import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  Images,
  Play,
  RotateCcw,
  Smartphone,
  X,
  Check,
  CheckCircle2,
  AlertTriangle,
  Video,
} from 'lucide-react';
import {
  GUIDED_SHOTS,
  GUIDED_PRE_SHOT_REMINDER,
  GUIDED_COUNTDOWN_STEP_MS,
  GUIDED_RECORDING_MS,
  MIN_SHOTS_TO_PROCEED,
  GuidedShot,
  checkCameraRollClip,
  countCompletedShots,
  isLandscape,
  nextShotToCapture,
} from '../utils/guidedShots';
import type { RecordedViralSlotMedia } from './GuidedViralTourStudio';

/* ------------------------------------------------------------------ */
/* Media helpers                                                       */
/* ------------------------------------------------------------------ */

/** Draws the centre 9:16 slice of a video frame (what the feed shows). */
function grabCenterCroppedFrame(video: HTMLVideoElement): {
  dataUrl?: string;
  base64?: string;
} {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return {};
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return {};
    const targetRatio = 9 / 16;
    let sw = vw;
    let sh = vh;
    if (vw / vh > targetRatio) {
      sw = vh * targetRatio;
    } else {
      sh = vw / targetRatio;
    }
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    return { dataUrl, base64: dataUrl.split(',')[1] };
  } catch {
    return {};
  }
}

interface ClipMetadata {
  durationSec: number;
  width: number;
  height: number;
  thumbnailUrl?: string;
  thumbnailBase64?: string;
}

/** Loads a clip off-screen to read its duration, size and a thumbnail frame. */
function readClipMetadata(url: string): Promise<ClipMetadata> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    let settled = false;
    let durationSec = NaN;

    const finish = (meta: Partial<ClipMetadata>) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      // Read the size before unloading, which resets it to 0
      const width = video.videoWidth;
      const height = video.videoHeight;
      video.removeAttribute('src');
      video.load();
      resolve({ durationSec, width, height, ...meta });
    };

    const timeout = window.setTimeout(() => finish({}), 10000);

    const seekForThumbnail = () => {
      video.onseeked = () => {
        const frame = grabCenterCroppedFrame(video);
        finish({ thumbnailUrl: frame.dataUrl, thumbnailBase64: frame.base64 });
      };
      video.currentTime = Math.min(1.2, Math.max(0, durationSec / 2));
    };

    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        durationSec = video.duration;
        seekForThumbnail();
        return;
      }
      // Some recorders (e.g. browser WebM) omit the duration header. Seeking
      // far past the end makes the browser compute the real duration.
      video.ondurationchange = () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.ondurationchange = null;
          durationSec = video.duration;
          seekForThumbnail();
        }
      };
      video.currentTime = 1e7;
    };
    video.onerror = () => finish({});
    video.src = url;
  });
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return undefined;
  }
  return [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ].find((t) => MediaRecorder.isTypeSupported(t));
}

function describeCameraError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'The camera only works on a secure (https) page. Use Camera Roll for now.';
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was blocked. Allow camera access in your browser settings, or pick a clip from your Camera Roll.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return "We couldn't find a camera on this device. Pick a clip from your Camera Roll instead.";
  }
  if (name === 'NotReadableError') {
    return 'Another app is using the camera. Close it and try again, or use your Camera Roll.';
  }
  return "We couldn't start the camera. Pick a clip from your Camera Roll instead.";
}

/* ------------------------------------------------------------------ */
/* In-app guided camera                                                */
/* ------------------------------------------------------------------ */

type CameraPhase = 'starting' | 'ready' | 'countdown' | 'recording' | 'review' | 'error';

const RING_RADIUS = 44;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface GuidedCameraModalProps {
  shot: GuidedShot;
  onClose: () => void;
  onSave: (media: RecordedViralSlotMedia) => void;
  onUseCameraRoll: () => void;
}

const GuidedCameraModal: React.FC<GuidedCameraModalProps> = ({
  shot,
  onClose,
  onSave,
  onUseCameraRoll,
}) => {
  const [phase, setPhase] = useState<CameraPhase>('starting');
  const [countdown, setCountdown] = useState(3);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [viewportLandscape, setViewportLandscape] = useState(
    () => typeof window !== 'undefined' && window.innerWidth > window.innerHeight
  );
  const [streamLandscape, setStreamLandscape] = useState(false);

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timersRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const thumbRef = useRef<{ dataUrl?: string; base64?: string }>({});
  const reviewUrlRef = useRef<string | null>(null);
  const savedRef = useRef(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    clearTimers();
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [clearTimers]);

  // Start the rear camera
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMessage(describeCameraError(new Error('unsupported')));
        setPhase('error');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1080 },
            height: { ideal: 1920 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          liveVideoRef.current.play().catch(() => {});
        }
        setPhase('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(describeCameraError(err));
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
      // Discard an unsaved take
      if (reviewUrlRef.current && !savedRef.current) {
        URL.revokeObjectURL(reviewUrlRef.current);
      }
    };
  }, [stopStream]);

  // Track viewport orientation
  useEffect(() => {
    const update = () => setViewportLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  // Escape closes (but not mid-recording)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'recording') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, phase]);

  const updateStreamOrientation = () => {
    const v = liveVideoRef.current;
    if (v) setStreamLandscape(isLandscape(v.videoWidth, v.videoHeight));
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') {
      setErrorMessage(
        "This browser can't record video here. Pick a clip from your Camera Roll instead."
      );
      setPhase('error');
      return;
    }
    const mimeType = pickRecorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      setErrorMessage(
        "This browser can't record video here. Pick a clip from your Camera Roll instead."
      );
      setPhase('error');
      return;
    }
    chunksRef.current = [];
    thumbRef.current = {};
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      const url = URL.createObjectURL(blob);
      reviewUrlRef.current = url;
      setReviewUrl(url);
      setPhase('review');
    };
    recorderRef.current = recorder;
    recorder.start(250);
    setProgress(0);
    setPhase('recording');

    // Grab a mid-walk thumbnail
    timersRef.current.push(
      window.setTimeout(() => {
        if (liveVideoRef.current) thumbRef.current = grabCenterCroppedFrame(liveVideoRef.current);
      }, GUIDED_RECORDING_MS / 2)
    );

    const startedAt = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      setProgress(Math.min(1, elapsed / GUIDED_RECORDING_MS));
      if (elapsed < GUIDED_RECORDING_MS) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    // Hard auto-stop so nobody overfilms
    timersRef.current.push(
      window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, GUIDED_RECORDING_MS)
    );
  };

  const handleRecordTap = () => {
    if (phase !== 'ready') return;
    clearTimers();
    setCountdown(3);
    setPhase('countdown');
    [2, 1].forEach((n, i) => {
      timersRef.current.push(
        window.setTimeout(() => setCountdown(n), GUIDED_COUNTDOWN_STEP_MS * (i + 1))
      );
    });
    timersRef.current.push(window.setTimeout(startRecording, GUIDED_COUNTDOWN_STEP_MS * 3));
  };

  const handleRetake = () => {
    if (reviewUrlRef.current) URL.revokeObjectURL(reviewUrlRef.current);
    reviewUrlRef.current = null;
    setReviewUrl(null);
    setProgress(0);
    setPhase('ready');
    liveVideoRef.current?.play().catch(() => {});
  };

  const handleUseShot = () => {
    if (!reviewUrl) return;
    savedRef.current = true;
    const thumb = thumbRef.current;
    onSave({
      slotNumber: shot.slotNumber,
      videoUrl: reviewUrl,
      thumbnailUrl: thumb.dataUrl || shot.sampleThumbnailUrl,
      source: 'recorded',
      fileName: `shot-${shot.slotNumber}-guided.${
        chunksRef.current[0]?.type.includes('mp4') ? 'mp4' : 'webm'
      }`,
      durationSec: GUIDED_RECORDING_MS / 1000,
      inlineDataBase64: thumb.base64,
      mimeType: 'image/jpeg',
      isLandscape: streamLandscape,
    });
  };

  const showRotateBanner =
    (viewportLandscape || streamLandscape) && phase !== 'review' && phase !== 'error';
  const secondsLeft = Math.max(0, (GUIDED_RECORDING_MS * (1 - progress)) / 1000);

  return createPortal(
    <div
      data-testid="guided-camera-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Record Shot ${shot.slotNumber}: ${shot.name}`}
      className="fixed inset-0 z-[100] bg-[#141210] flex flex-col items-center text-[#F9F7F3]"
    >
      {/* Top bar */}
      <div className="w-full max-w-[440px] px-4 pt-4 pb-2 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#D06C4E]">
            Shot {shot.slotNumber} of 5
          </span>
          <h3 className="font-extrabold text-sm leading-snug">{shot.name}</h3>
          <p className="text-[11px] text-[#F9F7F3]/75 leading-snug">{shot.instruction}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={phase === 'recording'}
          aria-label="Close camera"
          className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center shrink-0 transition-colors disabled:opacity-40"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Rotate warning */}
      {showRotateBanner && (
        <div
          data-testid="rotate-phone-warning"
          role="alert"
          className="w-full max-w-[440px] px-4 pb-2 shrink-0"
        >
          <div className="px-3 py-2.5 rounded-xl bg-[#D06C4E] text-white flex items-center gap-2.5 shadow-lg">
            <Smartphone className="w-5 h-5 shrink-0 animate-pulse" />
            <div className="min-w-0">
              <span className="block text-sm font-black uppercase tracking-wide">
                Rotate your phone upright!
              </span>
              <span className="block text-[11px] font-semibold text-white/90">
                Hold it tall like a selfie. Sideways footage gets cropped to vertical.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 9:16 guide frame */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center px-4">
        <div
          data-testid="guided-camera-frame"
          className="relative h-full max-h-full aspect-[9/16] max-w-full rounded-[28px] overflow-hidden bg-black border-2 border-white/25"
        >
          {/* Live camera */}
          <video
            ref={liveVideoRef}
            onLoadedMetadata={updateStreamOrientation}
            onResize={updateStreamOrientation}
            muted
            playsInline
            autoPlay
            className={`absolute inset-0 w-full h-full object-cover ${
              phase === 'review' ? 'hidden' : ''
            }`}
          />

          {/* Recorded take */}
          {phase === 'review' && reviewUrl && (
            <video
              data-testid="guided-camera-review-video"
              src={reviewUrl}
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {/* Corner guides */}
          {phase !== 'review' && phase !== 'error' && (
            <div aria-hidden="true" className="absolute inset-4 pointer-events-none">
              <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#F9F7F3]/85 rounded-tl-2xl" />
              <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#F9F7F3]/85 rounded-tr-2xl" />
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#F9F7F3]/85 rounded-bl-2xl" />
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#F9F7F3]/85 rounded-br-2xl" />
            </div>
          )}

          {/* Reminder pill */}
          {(phase === 'ready' || phase === 'starting') && (
            <div className="absolute top-7 inset-x-0 flex justify-center px-6 pointer-events-none">
              <span
                data-testid="pre-shot-reminder-pill"
                className="px-3 py-1.5 rounded-full bg-black/70 border border-white/20 text-[11px] font-extrabold text-[#F9F7F3] text-center"
              >
                {GUIDED_PRE_SHOT_REMINDER}
              </span>
            </div>
          )}

          {phase === 'starting' && (
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[#F9F7F3]/80">
              Starting camera...
            </div>
          )}

          {/* Countdown */}
          {phase === 'countdown' && (
            <div
              data-testid="guided-camera-countdown"
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/35"
            >
              <span
                key={countdown}
                className="text-7xl font-black text-white drop-shadow-lg animate-pulse"
              >
                {countdown}
              </span>
              <span className="mt-2 text-xs font-extrabold text-white bg-black/60 px-3 py-1 rounded-full">
                Get ready to walk...
              </span>
            </div>
          )}

          {/* Recording progress ring */}
          {phase === 'recording' && (
            <div
              data-testid="guided-camera-recording"
              className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-2 pointer-events-none"
            >
              <div className="relative w-28 h-28">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r={RING_RADIUS}
                    fill="rgba(0,0,0,0.55)"
                    stroke="rgba(249,247,243,0.25)"
                    strokeWidth="6"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="#D06C4E"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="flex items-center gap-1 text-[10px] font-black text-white uppercase">
                    <span className="w-2 h-2 rounded-full bg-[#D06C4E] animate-pulse" />
                    Rec
                  </span>
                  <span className="text-xl font-black text-white tabular-nums">
                    {secondsLeft.toFixed(1)}s
                  </span>
                </div>
              </div>
              <span className="px-3 py-1.5 rounded-full bg-black/70 text-sm font-extrabold text-white">
                Walk forward slowly...
              </span>
            </div>
          )}

          {/* Camera error */}
          {phase === 'error' && (
            <div
              data-testid="guided-camera-error"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-[#2C2724]"
            >
              <AlertTriangle className="w-8 h-8 text-[#D06C4E]" />
              <p className="text-xs font-semibold leading-relaxed text-[#F9F7F3]/90">
                {errorMessage}
              </p>
              <button
                type="button"
                onClick={onUseCameraRoll}
                className="px-4 py-2.5 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-xs font-extrabold flex items-center gap-1.5"
              >
                <Images className="w-4 h-4" />
                Choose from Camera Roll
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="w-full max-w-[440px] px-4 pt-3 pb-6 shrink-0">
        {phase === 'review' ? (
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="guided-camera-retake-btn"
              onClick={handleRetake}
              className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              Retake
            </button>
            <button
              type="button"
              data-testid="guided-camera-use-btn"
              onClick={handleUseShot}
              className="flex-1 py-3 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              Use This Shot
            </button>
          </div>
        ) : phase === 'error' ? null : (
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              data-testid="guided-camera-shutter-btn"
              onClick={handleRecordTap}
              disabled={phase !== 'ready'}
              aria-label="Start 3-2-1 countdown and record 4.5 seconds"
              className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center disabled:opacity-50 transition-transform active:scale-90"
            >
              <span
                className={`block bg-[#D06C4E] transition-all ${
                  phase === 'recording' ? 'w-7 h-7 rounded-md' : 'w-14 h-14 rounded-full'
                }`}
              />
            </button>
            <span className="text-[11px] font-bold text-[#F9F7F3]/75">
              {phase === 'ready'
                ? 'Tap to start • 3-2-1, then 4.5s auto-stop'
                : phase === 'recording'
                ? 'Stops automatically'
                : ' '}
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

/* ------------------------------------------------------------------ */
/* Clip preview                                                        */
/* ------------------------------------------------------------------ */

const ClipPreviewModal: React.FC<{
  shot: GuidedShot;
  media: RecordedViralSlotMedia;
  onClose: () => void;
  onRetake: () => void;
  onReplaceFromRoll: () => void;
}> = ({ shot, media, onClose, onRetake, onReplaceFromRoll }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      data-testid="guided-clip-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview Shot ${shot.slotNumber}`}
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[340px] bg-[#F9F7F3] text-[#2C2724] rounded-[28px] p-3 space-y-3 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#D06C4E]">
              Shot {shot.slotNumber} of 5
            </span>
            <h4 className="font-extrabold text-sm truncate">{shot.name}</h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="w-8 h-8 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/20 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative w-full aspect-[9/16] max-h-[60vh] mx-auto rounded-2xl overflow-hidden bg-black">
          {media.videoUrl ? (
            <video
              src={media.videoUrl}
              poster={media.thumbnailUrl}
              autoPlay
              loop
              muted
              playsInline
              controls
              className="w-full h-full object-cover"
            />
          ) : (
            <img src={media.thumbnailUrl} alt={shot.name} className="w-full h-full object-cover" />
          )}
        </div>
        {media.isLandscape && (
          <p className="text-[11px] font-semibold text-[#9A4A33] bg-[#D06C4E]/10 border border-[#D06C4E]/30 rounded-xl px-2.5 py-2">
            Sideways clip: shown center-cropped to vertical, like it will appear in the feed.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onRetake}
            className="py-2.5 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-[11px] font-extrabold flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retake
          </button>
          <button
            type="button"
            onClick={onReplaceFromRoll}
            className="py-2.5 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/30 text-[11px] font-extrabold flex items-center justify-center gap-1.5"
          >
            <Images className="w-3.5 h-3.5" />
            Camera Roll
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ------------------------------------------------------------------ */
/* Guided 5-shot cards                                                 */
/* ------------------------------------------------------------------ */

interface GuidedShotCaptureProps {
  recordedMedia: Record<number, RecordedViralSlotMedia>;
  onUpdateRecordedMedia: React.Dispatch<
    React.SetStateAction<Record<number, RecordedViralSlotMedia>>
  >;
}

export const GuidedShotCapture: React.FC<GuidedShotCaptureProps> = ({
  recordedMedia,
  onUpdateRecordedMedia,
}) => {
  const [cameraShot, setCameraShot] = useState<GuidedShot | null>(null);
  const [previewShot, setPreviewShot] = useState<GuidedShot | null>(null);
  const [checkingShot, setCheckingShot] = useState<number | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<number, string>>({});
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const completed = countCompletedShots(recordedMedia);
  const nextShot = nextShotToCapture(recordedMedia);
  const remainingToProceed = Math.max(0, MIN_SHOTS_TO_PROCEED - completed);

  const saveMedia = (media: RecordedViralSlotMedia) => {
    const old = recordedMedia[media.slotNumber];
    if (old?.videoUrl?.startsWith('blob:') && old.videoUrl !== media.videoUrl) {
      URL.revokeObjectURL(old.videoUrl);
    }
    const next = { ...recordedMedia, [media.slotNumber]: media };
    onUpdateRecordedMedia(next);
    // Bring the next empty card into view
    const upcoming = nextShotToCapture(next);
    if (upcoming !== null) {
      window.setTimeout(
        () => cardRefs.current[upcoming]?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        150
      );
    }
    setCardErrors((prev) => {
      const { [media.slotNumber]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const openCameraRoll = (slotNumber: number) => {
    fileInputRefs.current[slotNumber]?.click();
  };

  const handleCameraRollPick = async (
    shot: GuidedShot,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type && !file.type.startsWith('video/')) {
      setCardErrors((prev) => ({
        ...prev,
        [shot.slotNumber]: 'That file isn’t a video. Pick a video clip from your Camera Roll.',
      }));
      return;
    }
    setCheckingShot(shot.slotNumber);
    const url = URL.createObjectURL(file);
    const meta = await readClipMetadata(url);
    setCheckingShot(null);
    const check = checkCameraRollClip(meta);
    if (!check.accepted) {
      URL.revokeObjectURL(url);
      setCardErrors((prev) => ({ ...prev, [shot.slotNumber]: check.error || 'Clip rejected.' }));
      return;
    }
    saveMedia({
      slotNumber: shot.slotNumber,
      videoUrl: url,
      thumbnailUrl: meta.thumbnailUrl || shot.sampleThumbnailUrl,
      source: 'uploaded',
      fileName: file.name,
      durationSec: Math.round(meta.durationSec * 10) / 10,
      inlineDataBase64: meta.thumbnailBase64,
      mimeType: 'image/jpeg',
      isLandscape: check.isLandscape,
    });
  };

  return (
    <div
      data-testid="guided-5-shot-capture"
      className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#D06C4E]/15 text-[#D06C4E] flex items-center justify-center font-extrabold text-xs shrink-0">
            2
          </div>
          <div>
            <h4 className="font-extrabold text-xs text-[#2C2724]">Guided 5-Shot Video</h4>
            <p className="text-[10px] text-[#6E655F]">
              Never filmed a room before? Follow each card. 4 seconds per shot.
            </p>
          </div>
        </div>
        <span
          data-testid="guided-shot-progress-pill"
          className={`px-2 py-1 rounded-full text-[10px] font-extrabold shrink-0 ${
            remainingToProceed === 0
              ? 'bg-[#E8EFE9] text-[#485B4A]'
              : 'bg-[#F2EFE9] text-[#6E655F]'
          }`}
        >
          {completed}/5 shots
        </span>
      </div>

      {/* Segment progress */}
      <div className="flex gap-1" aria-hidden="true">
        {GUIDED_SHOTS.map((s) => (
          <span
            key={s.slotNumber}
            className={`h-1.5 flex-1 rounded-full ${
              recordedMedia[s.slotNumber]
                ? 'bg-[#7A907C]'
                : s.slotNumber === nextShot
                ? 'bg-[#D06C4E]'
                : 'bg-[#2C2724]/10'
            }`}
          />
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-2.5">
        {GUIDED_SHOTS.map((shot) => {
          const media = recordedMedia[shot.slotNumber];
          const isDone = Boolean(media);
          const isNext = shot.slotNumber === nextShot;
          const error = cardErrors[shot.slotNumber];
          const isChecking = checkingShot === shot.slotNumber;

          return (
            <div
              key={shot.slotNumber}
              ref={(el) => {
                cardRefs.current[shot.slotNumber] = el;
              }}
              data-testid={`guided-shot-card-${shot.slotNumber}`}
              data-complete={isDone ? 'true' : 'false'}
              className={`p-3 rounded-xl border transition-colors space-y-2.5 ${
                isDone
                  ? 'bg-[#E8EFE9]/60 border-[#7A907C]/70'
                  : isNext
                  ? 'bg-[#D06C4E]/[0.06] border-[#D06C4E]/60'
                  : 'bg-[#F9F7F3] border-[#2C2724]/15'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* 9:16 thumbnail */}
                <button
                  type="button"
                  disabled={!isDone}
                  onClick={() => setPreviewShot(shot)}
                  aria-label={isDone ? `Preview Shot ${shot.slotNumber}` : undefined}
                  className="relative w-14 h-[100px] rounded-lg overflow-hidden border border-[#2C2724]/20 bg-[#2C2724] shrink-0 disabled:cursor-default"
                >
                  {isDone ? (
                    <>
                      <img
                        src={media.thumbnailUrl}
                        alt={`Shot ${shot.slotNumber} thumbnail`}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                        <Play className="w-5 h-5 text-white fill-white drop-shadow" />
                      </span>
                    </>
                  ) : (
                    <span className="absolute inset-0 flex flex-col items-center justify-center text-[#F9F7F3]/80">
                      <Video className="w-5 h-5" />
                      <span className="text-[8px] font-extrabold uppercase mt-1">9:16</span>
                    </span>
                  )}
                </button>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#D06C4E]">
                      Shot {shot.slotNumber}
                      {isNext && !isDone ? ' • Up next' : ''}
                    </span>
                    {isDone && (
                      <span
                        data-testid={`guided-shot-done-badge-${shot.slotNumber}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#E8EFE9] border border-[#7A907C] text-[#485B4A] text-[9px] font-extrabold"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        {media.source === 'recorded' ? 'Recorded' : 'From Roll'}
                      </span>
                    )}
                  </div>
                  <h5 className="text-xs font-extrabold text-[#2C2724] leading-snug">
                    {shot.name}
                  </h5>
                  <p className="text-[11px] text-[#6E655F] leading-snug">{shot.instruction}</p>
                </div>
              </div>

              {media?.isLandscape && (
                <p
                  data-testid={`guided-shot-landscape-note-${shot.slotNumber}`}
                  className="text-[10px] font-semibold text-[#9A4A33] bg-[#D06C4E]/10 border border-[#D06C4E]/25 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5"
                >
                  <Smartphone className="w-3.5 h-3.5 shrink-0 rotate-90 mt-px" />
                  <span>
                    This clip is sideways, so we&apos;ll center-crop it to vertical. Filming
                    upright next time keeps more of the room in frame.
                  </span>
                </p>
              )}

              {error && (
                <p
                  data-testid={`guided-shot-error-${shot.slotNumber}`}
                  role="alert"
                  className="text-[10px] font-bold text-[#9A4A33] bg-[#D06C4E]/10 border border-[#D06C4E]/40 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>{error}</span>
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid={`guided-record-btn-${shot.slotNumber}`}
                  onClick={() => setCameraShot(shot)}
                  className="py-2 px-2 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-[11px] font-extrabold flex items-center justify-center gap-1.5 shadow-warm-sm transition-all active:scale-95"
                >
                  {isDone ? (
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Camera className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{isDone ? 'Retake Guided 4s Clip' : 'Record Guided 4s Clip'}</span>
                </button>
                <button
                  type="button"
                  data-testid={`guided-roll-btn-${shot.slotNumber}`}
                  onClick={() => openCameraRoll(shot.slotNumber)}
                  disabled={isChecking}
                  className="py-2 px-2 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/30 text-[#2C2724] text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-60"
                >
                  <Images className="w-3.5 h-3.5 shrink-0 text-[#D06C4E]" />
                  <span>
                    {isChecking
                      ? 'Checking clip...'
                      : isDone
                      ? 'Replace from Camera Roll'
                      : 'Choose from Camera Roll'}
                  </span>
                </button>
                <input
                  ref={(el) => {
                    fileInputRefs.current[shot.slotNumber] = el;
                  }}
                  data-testid={`guided-roll-input-${shot.slotNumber}`}
                  type="file"
                  accept="video/*"
                  onChange={(e) => handleCameraRollPick(shot, e)}
                  className="hidden"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Gate status */}
      <div
        data-testid="guided-shot-gate-status"
        className={`p-2.5 rounded-xl text-[11px] font-bold flex items-center gap-2 ${
          remainingToProceed === 0
            ? 'bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/50'
            : 'bg-[#F2EFE9] text-[#6E655F] border border-[#2C2724]/10'
        }`}
      >
        {remainingToProceed === 0 ? (
          <>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {completed === 5
                ? 'All 5 shots ready. Nice work!'
                : `${completed} shots ready. You can continue, or add the rest for a fuller tour.`}
            </span>
          </>
        ) : (
          <>
            <Video className="w-4 h-4 shrink-0" />
            <span>
              Capture at least {MIN_SHOTS_TO_PROCEED} shots to continue ({remainingToProceed}{' '}
              more to go).
            </span>
          </>
        )}
      </div>

      {cameraShot && (
        <GuidedCameraModal
          key={cameraShot.slotNumber}
          shot={cameraShot}
          onClose={() => setCameraShot(null)}
          onSave={(media) => {
            saveMedia(media);
            setCameraShot(null);
          }}
          onUseCameraRoll={() => {
            const slot = cameraShot.slotNumber;
            setCameraShot(null);
            openCameraRoll(slot);
          }}
        />
      )}

      {previewShot && recordedMedia[previewShot.slotNumber] && (
        <ClipPreviewModal
          shot={previewShot}
          media={recordedMedia[previewShot.slotNumber]}
          onClose={() => setPreviewShot(null)}
          onRetake={() => {
            const shot = previewShot;
            setPreviewShot(null);
            setCameraShot(shot);
          }}
          onReplaceFromRoll={() => {
            const slot = previewShot.slotNumber;
            setPreviewShot(null);
            openCameraRoll(slot);
          }}
        />
      )}
    </div>
  );
};
