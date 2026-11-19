/**
 * Optional 15-second intro video for an application: record with the front
 * camera (stops by itself at 15 s) or pick one from the camera roll.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Circle, Film, Square, Trash2, Video } from 'lucide-react';

export const INTRO_MAX_SEC = 15;
const MAX_PICKED_SEC = 20;
const MAX_BYTES = 20 * 1024 * 1024;

function recorderType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return '';
}

async function durationOf(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob);
  try {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = url;
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error('Could not read that video.'));
    });
    return v.duration;
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface IntroVideoPickerProps {
  value: Blob | null;
  onChange: (blob: Blob | null) => void;
}

export const IntroVideoPicker: React.FC<IntroVideoPickerProps> = ({ value, onChange }) => {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => stopStream, []);

  const start = async () => {
    setError(null);
    const type = recorderType();
    if (!navigator.mediaDevices?.getUserMedia || !type) {
      setError("This browser can't record here. Pick a video from your camera roll instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: true });
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        void liveRef.current.play();
      }
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_000_000 });
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        stopStream();
        setRecording(false);
        onChange(new Blob(chunks, { type: type.split(';')[0] }));
      };
      recorderRef.current = recorder;
      recorder.start(500);
      setRecording(true);
      setSeconds(0);
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(s);
        if (s >= INTRO_MAX_SEC && recorder.state === 'recording') recorder.stop();
      }, 250);
    } catch {
      stopStream();
      setError('Allow camera and microphone to record, or pick a video instead.');
    }
  };

  const stop = () => recorderRef.current?.state === 'recording' && recorderRef.current.stop();

  const pick = async (file: File) => {
    setError(null);
    if (file.size > MAX_BYTES) return setError('That video is over 20 MB. Keep it to about 15 seconds.');
    try {
      const d = await durationOf(file);
      if (d > MAX_PICKED_SEC) return setError(`That video is ${Math.round(d)} seconds. Keep it to about 15.`);
      onChange(file);
    } catch {
      setError("Couldn't read that video.");
    }
  };

  return (
    <div className="space-y-2" data-testid="intro-video">
      <span className="text-[11px] font-bold text-[#6E655F] block">15-second intro video (optional)</span>
      {recording ? (
        <div className="relative rounded-xl overflow-hidden bg-black">
          <video ref={liveRef} muted playsInline className="w-full max-h-64 object-cover -scale-x-100" />
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#B85B3F] text-white text-[11px] font-black">● {INTRO_MAX_SEC - seconds}s</div>
          <button type="button" onClick={stop} className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-white text-[#2C2724] text-xs font-extrabold flex items-center gap-1">
            <Square className="w-3 h-3 fill-current" /> Stop
          </button>
        </div>
      ) : previewUrl ? (
        <div className="space-y-1.5">
          <video src={previewUrl} controls playsInline className="w-full max-h-64 rounded-xl bg-black" />
          <button type="button" onClick={() => onChange(null)} className="text-[11px] font-bold text-[#9A4A33] flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> Remove
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void start()} className="py-2.5 rounded-xl bg-white border border-[#2C2724]/25 text-xs font-bold flex items-center justify-center gap-1.5">
            <Circle className="w-3.5 h-3.5 text-[#D06C4E] fill-[#D06C4E]" /> Record
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="py-2.5 rounded-xl bg-white border border-[#2C2724]/25 text-xs font-bold flex items-center justify-center gap-1.5">
            <Film className="w-3.5 h-3.5" /> Pick a video
          </button>
        </div>
      )}
      {!recording && !previewUrl && (
        <p className="text-[10px] text-[#6E655F] flex items-center gap-1">
          <Video className="w-3 h-3" /> Say hi, what you do and your routine. Only this room’s host and housemates see it.
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void pick(file);
        }}
      />
      {error && <p className="text-[11px] font-bold text-[#9A4A33]">{error}</p>}
    </div>
  );
};
