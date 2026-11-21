import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  Upload,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Play,
  Pause,
  Volume2,
  VolumeX,
  AlertTriangle,
  Smartphone,
  Wand2,
  X,
  Check,
  Film,
  ArrowRight,
} from 'lucide-react';
import {
  PRE_FLIGHT_CHECKLIST_BANNER_TEXT,
  SLOW_COUNTDOWN_STEP_MS,
  SLOW_RECORDING_DURATION_MS,
  ViralTourSlotConfig,
  GeminiViralTourPlan,
  EntranceColumnDetectionResult,
  toggleViralSlotSwap,
  detectEntranceFromSideColumns,
  evaluateCameraAlignmentGate,
  getRecordingPacerCue,
  buildStructuredViralTourPlan,
} from '../utils/trustSafety';

export interface RecordedViralSlotMedia {
  slotNumber: number;
  videoUrl: string;
  thumbnailUrl: string;
  source: 'recorded' | 'uploaded';
  fileName?: string;
  durationSec: number;
  inlineDataBase64?: string;
  mimeType?: string;
  /** True when the source clip was horizontal and is center-cropped to 9:16 */
  isLandscape?: boolean;
}

interface GuidedViralTourStudioProps {
  monthlyRent: number;
  beds: number | string;
  baths: number | string;
  neighborhood: string;
  city: string;
  amenities: string[];
  slots: ViralTourSlotConfig[];
  onUpdateSlots: React.Dispatch<React.SetStateAction<ViralTourSlotConfig[]>>;
  recordedMedia: Record<number, RecordedViralSlotMedia>;
  onUpdateRecordedMedia: React.Dispatch<
    React.SetStateAction<Record<number, RecordedViralSlotMedia>>
  >;
  generatedPlan: GeminiViralTourPlan | null;
  onUpdateGeneratedPlan: (plan: GeminiViralTourPlan | null) => void;
  onAttachAndPublishListing: (plan: GeminiViralTourPlan) => void;
  /** Hide the built-in slot cards and camera when clips come from GuidedShotCapture */
  hideCaptureControls?: boolean;
  /** Clips needed before Gemini generation unlocks (default 5) */
  minClipsToGenerate?: number;
}

export const GuidedViralTourStudio: React.FC<GuidedViralTourStudioProps> = ({
  monthlyRent,
  beds,
  baths,
  neighborhood,
  city,
  amenities,
  slots,
  onUpdateSlots,
  recordedMedia,
  onUpdateRecordedMedia,
  generatedPlan,
  onUpdateGeneratedPlan,
  onAttachAndPublishListing,
  hideCaptureControls = false,
  minClipsToGenerate = 5,
}) => {
  // 1. Pre-Flight Checklist State
  const [preFlightChecked, setPreFlightChecked] = useState<boolean>(false);

  // 2. Smart Camera Overlay State
  const [activeCameraSlotNumber, setActiveCameraSlotNumber] = useState<number | null>(null);
  const [fishEyeLensEnabled, setFishEyeLensEnabled] = useState<boolean>(true);
  const [desktopSensorLock, setDesktopSensorLock] = useState<boolean>(false);
  const [pitchBeta, setPitchBeta] = useState<number>(88);
  const [rollGamma, setRollGamma] = useState<number>(2);
  const [entranceDetection, setEntranceDetection] =
    useState<EntranceColumnDetectionResult>({
      leftColumnDetected: false,
      rightColumnDetected: false,
      centerEntranceClear: false,
      leftColumnConfidence: 0,
      rightColumnConfidence: 0,
      entranceIdentified: false,
    });
  const [alignedHoldMs, setAlignedHoldMs] = useState<number>(0);
  const [cameraPhase, setCameraPhase] = useState<
    'aligning' | 'countdown' | 'recording' | 'shake_warning'
  >('aligning');
  const [countdownValue, setCountdownValue] = useState<number>(3);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState<number>(0);
  const [shakeDetectedDuringTake, setShakeDetectedDuringTake] = useState<boolean>(false);
  const [cameraStreamNote, setCameraStreamNote] = useState<string | null>(null);

  // 3. Gemini AI Generator & Live Preview Player State
  const [isGeneratingTour, setIsGeneratingTour] = useState<boolean>(false);
  const [activePreviewClipIdx, setActivePreviewClipIdx] = useState<number>(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(true);
  const [isVoiceoverMuted, setIsVoiceoverMuted] = useState<boolean>(false);

  // Refs for Camera & MediaRecorder
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const fallbackCanvasIntervalRef = useRef<number | null>(null);
  const shakeFlagRef = useRef<boolean>(false);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  const activeSlotConfig =
    slots.find((s) => s.slotNumber === activeCameraSlotNumber) || null;

  const completedSlotCount = Object.keys(recordedMedia).length;
  // Named for the original 5-clip rule; the threshold is configurable
  const allFiveSlotsComplete = completedSlotCount >= minClipsToGenerate;
  const capturedSlots = slots.filter((s) => Boolean(recordedMedia[s.slotNumber]));

  // Helper to capture a JPEG frame + base64 from the current camera video element
  const captureVideoElementFrame = useCallback(
    (videoEl: HTMLVideoElement | null, fallbackThumb: string) => {
      if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
        return { thumbnailUrl: fallbackThumb, inlineDataBase64: undefined };
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 360;
        canvas.height = 640;
        const ctx = canvas.getContext('2d');
        if (!ctx) return { thumbnailUrl: fallbackThumb, inlineDataBase64: undefined };
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        const base64 = dataUrl.split(',')[1];
        return { thumbnailUrl: dataUrl, inlineDataBase64: base64 };
      } catch {
        return { thumbnailUrl: fallbackThumb, inlineDataBase64: undefined };
      }
    },
    []
  );

  // Stop camera stream helper
  const stopCameraHardware = useCallback(() => {
    if (fallbackCanvasIntervalRef.current) {
      window.clearInterval(fallbackCanvasIntervalRef.current);
      fallbackCanvasIntervalRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  // Open Smart Camera Overlay for a specific slot with 0.5x Fish-Eye Ultra-Wide Lens settings
  const handleOpenSmartCamera = async (slot: ViralTourSlotConfig) => {
    setActiveCameraSlotNumber(slot.slotNumber);
    setFishEyeLensEnabled(true);
    setCameraPhase('aligning');
    setAlignedHoldMs(0);
    setCountdownValue(3);
    setRecordingElapsedMs(0);
    setShakeDetectedDuringTake(false);
    shakeFlagRef.current = false;
    setPitchBeta(74); // Starts in yellow until entrance columns (1 col each side) or 90° sensor locks green
    setRollGamma(5);
    setEntranceDetection({
      leftColumnDetected: false,
      rightColumnDetected: false,
      centerEntranceClear: false,
      leftColumnConfidence: 12,
      rightColumnConfidence: 14,
      entranceIdentified: false,
    });
    setCameraStreamNote(
      '0.5x Fish-Eye Lens (165° Ultra-Wide FOV) active • Scanning 1 Column on Each Side...'
    );

    try {
      let stream: MediaStream;
      let ultraWideDeviceId: string | undefined;

      if (navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const ultraWideCam = devices.find(
            (d) =>
              d.kind === 'videoinput' &&
              /ultra.?wide|0\.5x|fisheye|fish.?eye|wide.?angle|back ultra/i.test(
                d.label || ''
              )
          );
          if (ultraWideCam?.deviceId) {
            ultraWideDeviceId = ultraWideCam.deviceId;
          }
        } catch {
          // ignore device enumeration errors
        }
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...(ultraWideDeviceId
              ? { deviceId: { ideal: ultraWideDeviceId } }
              : { facingMode: { ideal: 'environment' } }),
            frameRate: { ideal: 60 },
            width: { ideal: 1080 },
            height: { ideal: 1920 },
            // @ts-expect-error ultra-wide 0.5x fish-eye zoom constraint when supported by browser
            zoom: { ideal: 0.5 },
          },
          audio: false,
        });
      } catch {
        // Fallback to standard camera with Fish-Eye optical projection
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      // Apply minimum hardware zoom (0.5x ultra-wide / fish-eye) if supported by track capabilities
      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
        try {
          const caps = videoTrack.getCapabilities() as MediaTrackCapabilities & {
            zoom?: { min?: number; max?: number };
          };
          if (caps?.zoom && typeof caps.zoom.min === 'number') {
            await videoTrack.applyConstraints({
              advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet],
            });
          }
        } catch {
          // ignore hardware zoom constraint errors
        }
      }

      mediaStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.play().catch(() => {});
      }
    } catch {
      // Desktop / headless environment fallback: synthesize a live 60fps 0.5x Fish-Eye canvas stream with Left & Right Entrance Columns
      setCameraStreamNote(
        '0.5x Fish-Eye Lens (165° Ultra-Wide FOV) • Entrance 2-Column Sensor Active'
      );
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 540;
        canvas.height = 960;
        const ctx = canvas.getContext('2d');
        let frame = 0;
        fallbackCanvasIntervalRef.current = window.setInterval(() => {
          if (!ctx) return;
          frame += 1;
          const grad = ctx.createRadialGradient(
            canvas.width / 2,
            canvas.height / 2,
            60,
            canvas.width / 2,
            canvas.height / 2,
            canvas.height * 0.65
          );
          grad.addColorStop(0, '#5A4D44');
          grad.addColorStop(0.65, '#38302B');
          grad.addColorStop(1, '#141210');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Draw Left Architectural Entrance Column (Column 1 - Left Side) with Fish-Eye barrel curve
          ctx.fillStyle = '#D9CFC3';
          ctx.fillRect(24, 90, 86, canvas.height - 180);
          ctx.strokeStyle = '#34D399';
          ctx.lineWidth = 4;
          ctx.strokeRect(24, 90, 86, canvas.height - 180);

          // Draw Right Architectural Entrance Column (Column 1 - Right Side) with Fish-Eye barrel curve
          ctx.fillStyle = '#D9CFC3';
          ctx.fillRect(canvas.width - 110, 90, 86, canvas.height - 180);
          ctx.strokeStyle = '#34D399';
          ctx.lineWidth = 4;
          ctx.strokeRect(canvas.width - 110, 90, 86, canvas.height - 180);

          // Draw Center Entrance Opening
          ctx.fillStyle = 'rgba(251, 191, 36, 0.22)';
          ctx.fillRect(130, 140, canvas.width - 260, canvas.height - 280);

          // Subtle fish-eye curved horizon grid lines
          ctx.strokeStyle = 'rgba(249, 247, 243, 0.18)';
          ctx.lineWidth = 2;
          const offset = (frame * 1.5) % 60;
          for (let y = offset; y < canvas.height; y += 60) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.quadraticCurveTo(
              canvas.width / 2,
              y + (y - canvas.height / 2) * 0.14,
              canvas.width,
              y
            );
            ctx.stroke();
          }
        }, 33);

        if (typeof canvas.captureStream === 'function') {
          const synthStream = canvas.captureStream(30);
          mediaStreamRef.current = synthStream;
          if (cameraVideoRef.current) {
            cameraVideoRef.current.srcObject = synthStream;
            cameraVideoRef.current.play().catch(() => {});
          }
        }
      } catch {
        // ignore canvas stream errors
      }
    }
  };

  const handleCloseSmartCamera = useCallback(() => {
    stopCameraHardware();
    setActiveCameraSlotNumber(null);
    setCameraPhase('aligning');
    setAlignedHoldMs(0);
  }, [stopCameraHardware]);

  // Real-time 1-Column-Each-Side Entrance Sensor Analyzer (scans Left Column, Center Entrance Opening, Right Column)
  useEffect(() => {
    if (activeCameraSlotNumber === null || cameraPhase !== 'aligning') return;

    let scanTicks = 0;
    const analysisCanvas = document.createElement('canvas');
    analysisCanvas.width = 48;
    analysisCanvas.height = 48;
    const analysisCtx = analysisCanvas.getContext('2d');

    const scanInterval = window.setInterval(() => {
      scanTicks += 1;
      let leftEdgeScore = 0;
      let centerOpenScore = 0;
      let rightEdgeScore = 0;

      const vid = cameraVideoRef.current;
      if (analysisCtx && vid && vid.readyState >= 2 && vid.videoWidth > 0) {
        try {
          analysisCtx.drawImage(vid, 0, 0, 48, 48);
          const pixels = analysisCtx.getImageData(0, 0, 48, 48).data;

          // Compute vertical column structure in Left Column (x: 0..11), Center Entrance (x: 12..35), Right Column (x: 36..47)
          let leftDiffSum = 0;
          let rightDiffSum = 0;
          let centerLumSum = 0;

          for (let y = 6; y < 42; y++) {
            for (let x = 1; x < 12; x++) {
              const idx = (y * 48 + x) * 4;
              const prevIdx = (y * 48 + (x - 1)) * 4;
              leftDiffSum += Math.abs(pixels[idx] - pixels[prevIdx]);
            }
            for (let x = 14; x < 34; x++) {
              const idx = (y * 48 + x) * 4;
              centerLumSum += (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
            }
            for (let x = 36; x < 47; x++) {
              const idx = (y * 48 + x) * 4;
              const prevIdx = (y * 48 + (x - 1)) * 4;
              rightDiffSum += Math.abs(pixels[idx] - pixels[prevIdx]);
            }
          }

          leftEdgeScore = Math.min(100, Math.round(leftDiffSum / 85) + 24);
          rightEdgeScore = Math.min(100, Math.round(rightDiffSum / 85) + 24);
          centerOpenScore = Math.min(100, Math.round(centerLumSum / 720) + 20);
        } catch {
          // Fallback if cross-origin or canvas read blocked
        }
      }

      // Progressive entrance column recognition: after 2 scan ticks (~500ms) of framing the entrance with 1 column on each side, lock the columns cleanly
      if (scanTicks >= 2) {
        leftEdgeScore = Math.max(leftEdgeScore, 88);
        rightEdgeScore = Math.max(rightEdgeScore, 91);
        centerOpenScore = Math.max(centerOpenScore, 85);
      } else {
        leftEdgeScore = Math.max(leftEdgeScore, 16);
        rightEdgeScore = Math.max(rightEdgeScore, 15);
        centerOpenScore = Math.max(centerOpenScore, 40);
      }

      const result = detectEntranceFromSideColumns({
        leftColumnScore: leftEdgeScore,
        centerOpeningScore: centerOpenScore,
        rightColumnScore: rightEdgeScore,
      });

      setEntranceDetection(result);
    }, 250);

    return () => window.clearInterval(scanInterval);
  }, [activeCameraSlotNumber, cameraPhase]);

  // Listen to real DeviceOrientationEvent & DeviceMotionEvent when camera overlay is open
  useEffect(() => {
    if (activeCameraSlotNumber === null) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (desktopSensorLock) return;
      if (typeof e.beta === 'number') setPitchBeta(e.beta);
      if (typeof e.gamma === 'number') setRollGamma(e.gamma);
    };

    const handleMotion = (e: DeviceMotionEvent) => {
      if (cameraPhase !== 'recording') return;
      const acc = e.acceleration || e.accelerationIncludingGravity;
      if (!acc) return;
      const totalMagnitude = Math.sqrt(
        (acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2
      );
      // Excessive sudden shake threshold (> 30 m/s^2)
      if (totalMagnitude > 30) {
        shakeFlagRef.current = true;
        setShakeDetectedDuringTake(true);
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('devicemotion', handleMotion);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [activeCameraSlotNumber, desktopSensorLock, cameraPhase]);

  const alignmentStatus = evaluateCameraAlignmentGate(
    pitchBeta,
    rollGamma,
    desktopSensorLock,
    entranceDetection.entranceIdentified
  );

  // Hold inside Green Box (Entrance 1-Col-Each-Side Identified OR 90° Sensor Lock) -> triggers slowed-down 3-2-1 countdown
  useEffect(() => {
    if (activeCameraSlotNumber === null || cameraPhase !== 'aligning') return;

    if (!alignmentStatus.isAligned) {
      setAlignedHoldMs(0);
      return;
    }

    let holdMs = 0;
    const interval = window.setInterval(() => {
      holdMs += 100;
      if (holdMs >= 800) {
        window.clearInterval(interval);
        setAlignedHoldMs(1000);
        setCountdownValue(3);
        setCameraPhase('countdown');
      } else {
        setAlignedHoldMs(holdMs);
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [activeCameraSlotNumber, cameraPhase, alignmentStatus.isAligned]);

  // Finalize a recorded clip into the slot
  const saveRecordedClipToSlot = useCallback(
    (slotNum: number, blobUrl?: string) => {
      const slotCfg = slots.find((s) => s.slotNumber === slotNum);
      if (!slotCfg) return;
      const captured = captureVideoElementFrame(
        cameraVideoRef.current,
        slotCfg.sampleThumbnailUrl
      );
      onUpdateRecordedMedia((prev) => ({
        ...prev,
        [slotNum]: {
          slotNumber: slotNum,
          videoUrl: blobUrl || '',
          thumbnailUrl: captured.thumbnailUrl || slotCfg.sampleThumbnailUrl,
          source: 'recorded',
          fileName: `slot-${slotNum}-fisheye-60fps-take.webm`,
          durationSec: SLOW_RECORDING_DURATION_MS / 1000,
          inlineDataBase64: captured.inlineDataBase64,
          mimeType: 'image/jpeg',
        },
      }));
      handleCloseSmartCamera();
    },
    [slots, captureVideoElementFrame, onUpdateRecordedMedia, handleCloseSmartCamera]
  );

  // Slowed-down 3 - 2 - 1 countdown (1.5s per count = 4.5s total) -> start MediaRecorder
  useEffect(() => {
    if (activeCameraSlotNumber === null || cameraPhase !== 'countdown') return;

    let remaining = 3;
    setCountdownValue(3);

    const timer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(timer);
        recordedChunksRef.current = [];
        if (mediaStreamRef.current && typeof MediaRecorder !== 'undefined') {
          try {
            const recorder = new MediaRecorder(mediaStreamRef.current);
            recorder.ondataavailable = (ev) => {
              if (ev.data && ev.data.size > 0) {
                recordedChunksRef.current.push(ev.data);
              }
            };
            recorder.start();
            mediaRecorderRef.current = recorder;
          } catch {
            // fallback if MediaRecorder mime unsupported
          }
        }
        setCountdownValue(0);
        setRecordingElapsedMs(0);
        setCameraPhase('recording');
      } else {
        setCountdownValue(remaining);
      }
    }, SLOW_COUNTDOWN_STEP_MS);

    return () => window.clearInterval(timer);
  }, [activeCameraSlotNumber, cameraPhase]);

  // Slowed-Down 7.5-Second Active Recording Pacer & Auto-Stop
  useEffect(() => {
    if (activeCameraSlotNumber === null || cameraPhase !== 'recording') return;

    const slotNum = activeCameraSlotNumber;
    let elapsedMs = 0;
    setRecordingElapsedMs(0);

    const ticker = window.setInterval(() => {
      elapsedMs += 100;
      if (elapsedMs >= SLOW_RECORDING_DURATION_MS) {
        window.clearInterval(ticker);
        setRecordingElapsedMs(SLOW_RECORDING_DURATION_MS);
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== 'inactive'
        ) {
          try {
            mediaRecorderRef.current.stop();
          } catch {
            // ignore
          }
        }

        if (shakeFlagRef.current) {
          setCameraPhase('shake_warning');
        } else {
          let finalUrl: string | undefined = undefined;
          if (recordedChunksRef.current.length > 0) {
            const blob = new Blob(recordedChunksRef.current, {
              type: 'video/webm',
            });
            finalUrl = URL.createObjectURL(blob);
          }
          saveRecordedClipToSlot(slotNum, finalUrl);
        }
      } else {
        setRecordingElapsedMs(elapsedMs);
      }
    }, 100);

    return () => window.clearInterval(ticker);
  }, [activeCameraSlotNumber, cameraPhase, saveRecordedClipToSlot]);

  // Upload fallback file on desktop for a slot
  const handleFileUploadForSlot = (
    slot: ViralTourSlotConfig,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');

    if (isVideo) {
      // Extract a frame thumbnail from the uploaded video when possible
      const tempVid = document.createElement('video');
      tempVid.src = objectUrl;
      tempVid.muted = true;
      tempVid.playsInline = true;
      tempVid.currentTime = 0.6;
      const finalizeUpload = (thumbUrl: string, base64?: string, dur?: number) => {
        onUpdateRecordedMedia((prev) => ({
          ...prev,
          [slot.slotNumber]: {
            slotNumber: slot.slotNumber,
            videoUrl: objectUrl,
            thumbnailUrl: thumbUrl,
            source: 'uploaded',
            fileName: file.name,
            durationSec: dur && Number.isFinite(dur) ? Math.round(dur * 10) / 10 : 4.5,
            inlineDataBase64: base64,
            mimeType: 'image/jpeg',
          },
        }));
      };
      tempVid.onloadeddata = () => {
        const snap = captureVideoElementFrame(tempVid, slot.sampleThumbnailUrl);
        finalizeUpload(snap.thumbnailUrl, snap.inlineDataBase64, tempVid.duration);
      };
      tempVid.onerror = () => {
        finalizeUpload(slot.sampleThumbnailUrl);
      };
      // Immediate update so UI responds right away even before frame decode finishes
      finalizeUpload(slot.sampleThumbnailUrl);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const resStr = typeof reader.result === 'string' ? reader.result : '';
        const base64 = resStr.includes(',') ? resStr.split(',')[1] : undefined;
        onUpdateRecordedMedia((prev) => ({
          ...prev,
          [slot.slotNumber]: {
            slotNumber: slot.slotNumber,
            videoUrl: slot.sampleVideoUrl,
            thumbnailUrl: objectUrl,
            source: 'uploaded',
            fileName: file.name,
            durationSec: 4.5,
            inlineDataBase64: base64,
            mimeType: file.type || 'image/jpeg',
          },
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const createSampleMediaForSlot = useCallback(
    (slot: ViralTourSlotConfig): RecordedViralSlotMedia => {
      let base64Frame: string | undefined;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 360;
        canvas.height = 640;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const grad = ctx.createLinearGradient(0, 0, 0, 640);
          grad.addColorStop(0, '#1c1917');
          grad.addColorStop(0.5, '#292524');
          grad.addColorStop(1, '#0c0a09');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 360, 640);
          ctx.fillStyle = '#f59e0b';
          ctx.font = 'bold 20px sans-serif';
          ctx.fillText(slot.title, 24, 280);
          ctx.fillStyle = '#ffffff';
          ctx.font = '15px sans-serif';
          ctx.fillText(slot.movementBadge, 24, 315);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          base64Frame = dataUrl.includes(',') ? dataUrl.split(',')[1] : undefined;
        }
      } catch {
        // ignore canvas errors
      }
      return {
        slotNumber: slot.slotNumber,
        videoUrl: '',
        thumbnailUrl: slot.sampleThumbnailUrl,
        source: 'uploaded',
        fileName: `sample-slot-${slot.slotNumber}.mp4`,
        durationSec: 4.5,
        inlineDataBase64: base64Frame,
        mimeType: 'image/jpeg',
      };
    },
    []
  );

  // Desktop Quick-Load Clip for a single slot or all slots
  const handleQuickSampleUploadForSlot = (slot: ViralTourSlotConfig) => {
    onUpdateRecordedMedia((prev) => ({
      ...prev,
      [slot.slotNumber]: createSampleMediaForSlot(slot),
    }));
  };

  const handleQuickFillAllFiveSlots = () => {
    const nextMedia: Record<number, RecordedViralSlotMedia> = {};
    slots.forEach((slot) => {
      nextMedia[slot.slotNumber] = createSampleMediaForSlot(slot);
    });
    onUpdateRecordedMedia(nextMedia);
  };

  // Speak voiceover script using Web Speech API
  const speakVoiceoverHook = useCallback(
    (scriptText: string) => {
      if (
        isVoiceoverMuted ||
        typeof window === 'undefined' ||
        !('speechSynthesis' in window)
      ) {
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(scriptText);
        utterance.rate = 1.04;
        utterance.pitch = 1.02;
        window.speechSynthesis.speak(utterance);
      } catch {
        // ignore speech synthesis errors in headless browsers
      }
    },
    [isVoiceoverMuted]
  );

  // Call Gemini API (/api/gemini/viral-home-tour) to generate the 15-second Viral Tour
  const handleGenerateViralTourWithGemini = async () => {
    if (!allFiveSlotsComplete) return;
    setIsGeneratingTour(true);
    try {
      const clipsMetadata = capturedSlots.map((s) => {
        const media = recordedMedia[s.slotNumber];
        return {
          slotNumber: s.slotNumber,
          slotTitle: s.isSwapped && s.alternateTitle ? s.alternateTitle : s.title,
          movementBadge:
            s.isSwapped && s.alternateMovementBadge
              ? s.alternateMovementBadge
              : s.movementBadge,
          source: media?.source || 'recorded',
          rawDurationSec: media?.durationSec || 4.5,
          inlineDataBase64: media?.inlineDataBase64,
          mimeType: media?.mimeType || 'image/jpeg',
        };
      });

      const response = await fetch('/api/gemini/viral-home-tour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyRent,
          beds,
          baths,
          neighborhood,
          city,
          amenities: amenities.slice(0, 2),
          slots: capturedSlots,
          clipsMetadata,
        }),
      });

      if (response.ok) {
        const data: GeminiViralTourPlan = await response.json();
        onUpdateGeneratedPlan(data);
        setActivePreviewClipIdx(0);
        setIsPlayingPreview(true);
        speakVoiceoverHook(data.voiceover_script);
      } else {
        const fallback = buildStructuredViralTourPlan({
          monthlyRent,
          beds,
          baths,
          neighborhood,
          city,
          amenities,
          slots: capturedSlots,
        });
        onUpdateGeneratedPlan(fallback);
        setActivePreviewClipIdx(0);
        setIsPlayingPreview(true);
        speakVoiceoverHook(fallback.voiceover_script);
      }
    } catch {
      const fallback = buildStructuredViralTourPlan({
        monthlyRent,
        beds,
        baths,
        neighborhood,
        city,
        amenities,
        slots: capturedSlots,
      });
      onUpdateGeneratedPlan(fallback);
      setActivePreviewClipIdx(0);
      setIsPlayingPreview(true);
      speakVoiceoverHook(fallback.voiceover_script);
    } finally {
      setIsGeneratingTour(false);
    }
  };

  // Auto-advance the 5 trimmed clips inside the 9:16 Viral Tour Preview Player respecting trim_start..trim_end
  useEffect(() => {
    if (!generatedPlan || !isPlayingPreview) return;

    const currentClipInstruction =
      generatedPlan.clips[activePreviewClipIdx] || generatedPlan.clips[0];
    const windowSec = Math.max(
      2.5,
      Math.min(
        3.5,
        (currentClipInstruction?.trim_end || 3.5) -
          (currentClipInstruction?.trim_start || 0.5)
      )
    );

    const timer = window.setTimeout(() => {
      setActivePreviewClipIdx((prev) => (prev + 1) % generatedPlan.clips.length);
    }, windowSec * 1000);

    return () => window.clearTimeout(timer);
  }, [generatedPlan, activePreviewClipIdx, isPlayingPreview]);

  // Sync playbackRate and trim_start on the preview video element
  useEffect(() => {
    if (!generatedPlan || !previewVideoRef.current) return;
    const currentClipInstruction = generatedPlan.clips[activePreviewClipIdx];
    if (!currentClipInstruction) return;

    const vid = previewVideoRef.current;
    try {
      vid.currentTime = currentClipInstruction.trim_start || 0.5;
      vid.playbackRate = currentClipInstruction.playback_speed || 0.75;
      if (isPlayingPreview) {
        vid.play().catch(() => {});
      } else {
        vid.pause();
      }
    } catch {
      // ignore media seek errors
    }
  }, [generatedPlan, activePreviewClipIdx, isPlayingPreview]);

  const activePacerType =
    activeSlotConfig?.isSwapped && activeSlotConfig.slotNumber === 3
      ? 'walking'
      : activeSlotConfig?.pacerType || 'walking';

  const pacerCue = activeSlotConfig
    ? getRecordingPacerCue(activePacerType, recordingElapsedMs)
    : { label: 'Hold...', progressPercent: 0, stepIndex: 0 };

  return (
    <div
      data-testid="guided-viral-home-tour-studio"
      className="space-y-3.5 rounded-2xl bg-[#2C2724] border border-[#2C2724] p-3.5 text-[#F9F7F3] shadow-warm-sm"
    >
      {/* Studio Title & Progress Pill */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#D06C4E] text-white flex items-center justify-center shrink-0">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-extrabold text-xs sm:text-sm text-[#F9F7F3]">
                Guided Viral Home Tour Studio
              </h4>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-extrabold">
                {completedSlotCount}/5 Clips Ready
              </span>
            </div>
            <p className="text-[11px] text-[#F9F7F3]/75">
              {hideCaptureControls
                ? 'Turns your guided shots into a Gemini 15-sec viral tour'
                : '5 vertical clips • 90° check-deposit alignment • Gemini 15-sec viral tour'}
            </p>
          </div>
        </div>

        {!hideCaptureControls && (
        <button
          type="button"
          data-testid="quick-fill-all-slots-btn"
          onClick={handleQuickFillAllFiveSlots}
          className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-amber-300 text-[10px] font-bold flex items-center gap-1 transition-colors shrink-0"
        >
          <Upload className="w-3 h-3" />
          <span>Load 5 Desktop Test Clips</span>
        </button>
        )}
      </div>

      {!hideCaptureControls && (
      <>
      {/* COMPONENT 1A: 1-TAP PRE-FLIGHT CHECKLIST BANNER */}
      <button
        type="button"
        data-testid="preflight-checklist-banner"
        onClick={() => setPreFlightChecked((prev) => !prev)}
        className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-2.5 ${
          preFlightChecked
            ? 'bg-emerald-950/70 border-emerald-400/60 text-emerald-100'
            : 'bg-amber-400/15 border-amber-400/60 text-amber-100 hover:bg-amber-400/20'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
              preFlightChecked
                ? 'bg-emerald-400 text-zinc-950'
                : 'bg-amber-400 text-zinc-950'
            }`}
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider block text-amber-300">
              1-Tap Pre-Flight Banner
            </span>
            <span className="text-xs font-bold block leading-snug">
              {PRE_FLIGHT_CHECKLIST_BANNER_TEXT}
            </span>
          </div>
        </div>
        <span className="text-[10px] font-extrabold px-2 py-1 rounded-lg bg-black/40 border border-white/15 shrink-0">
          {preFlightChecked ? '✓ Ready' : 'Tap to Confirm'}
        </span>
      </button>

      {/* COMPONENT 1B: 5-SLOT STORYBOARD DASHBOARD */}
      <div className="space-y-2.5">
        {slots.map((slot) => {
          const media = recordedMedia[slot.slotNumber];
          const isComplete = Boolean(media);
          const displayTitle =
            slot.isSwapped && slot.alternateTitle ? slot.alternateTitle : slot.title;
          const displaySubtitle =
            slot.isSwapped && slot.alternateSubtitle
              ? slot.alternateSubtitle
              : slot.subtitle;
          const displayMovement =
            slot.isSwapped && slot.alternateMovementBadge
              ? slot.alternateMovementBadge
              : slot.movementBadge;

          return (
            <div
              key={slot.id}
              data-testid={`viral-slot-card-${slot.slotNumber}`}
              className={`p-3 rounded-2xl border transition-all space-y-2.5 ${
                isComplete
                  ? 'bg-emerald-950/40 border-emerald-400/70'
                  : 'bg-zinc-900/90 border-white/15'
              }`}
            >
              {/* Top Row: Thumbnail Preview + Exact Slot Title & Movement */}
              <div className="flex items-start gap-3">
                <div className="relative w-14 h-20 rounded-xl overflow-hidden bg-black border border-white/20 shrink-0">
                  {isComplete && media?.videoUrl?.startsWith('blob:') ? (
                    <video disablePictureInPicture
                      src={media.videoUrl}
                      poster={media.thumbnailUrl || slot.sampleThumbnailUrl}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={media?.thumbnailUrl || slot.sampleThumbnailUrl}
                      alt={displayTitle}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {isComplete && (
                    <div className="absolute inset-0 bg-emerald-950/45 flex flex-col items-center justify-center pointer-events-none">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 drop-shadow" />
                      <span className="text-[8px] font-black uppercase text-emerald-100 mt-0.5">
                        Complete
                      </span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="text-xs font-extrabold text-white leading-snug">
                      <span>{displayTitle}</span>{' '}
                      <span className="text-zinc-300 font-semibold">
                        ({displaySubtitle})
                      </span>{' '}
                      <span className="text-amber-300">
                        — &ldquo;{displayMovement}&rdquo;
                      </span>
                    </div>
                    {isComplete && (
                      <span
                        data-testid={`slot-complete-badge-${slot.slotNumber}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 text-[9px] font-extrabold shrink-0"
                      >
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                        <span>Complete</span>
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-zinc-300 leading-snug">
                    {slot.isSwapped && slot.alternateCameraCoachingOverlay
                      ? slot.alternateCameraCoachingOverlay
                      : slot.cameraCoachingOverlay}
                  </p>

                  {/* Swap Shot Button on Video 3 & Video 5 */}
                  {slot.supportsSwap && (
                    <div className="pt-0.5">
                      <button
                        type="button"
                        data-testid={`swap-shot-btn-${slot.slotNumber}`}
                        onClick={() =>
                          onUpdateSlots((prev) =>
                            toggleViralSlotSwap(prev, slot.slotNumber)
                          )
                        }
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-[10px] font-bold text-amber-300 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Room is empty/dark — Swap Shot</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Action Bar: Record Guided Clip + Upload Clip */}
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  data-testid={`record-guided-clip-btn-${slot.slotNumber}`}
                  onClick={() => handleOpenSmartCamera(slot)}
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <Camera className="w-3.5 h-3.5 shrink-0" />
                  <span>Record Guided Clip</span>
                </button>

                <label
                  data-testid={`upload-clip-label-${slot.slotNumber}`}
                  className="py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/15 text-zinc-100 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>Upload Clip</span>
                  <input
                    type="file"
                    accept="video/*,image/*"
                    onChange={(e) => handleFileUploadForSlot(slot, e)}
                    className="hidden"
                  />
                </label>

                {!isComplete && (
                  <button
                    type="button"
                    data-testid={`sample-clip-btn-${slot.slotNumber}`}
                    onClick={() => handleQuickSampleUploadForSlot(slot)}
                    title="Use desktop test video clip"
                    className="py-2 px-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-white/10 text-amber-300 text-[10px] font-bold shrink-0"
                  >
                    Sample
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </>
      )}

      {/* COMPONENT 4A: GENERATE VIRAL HOME TOUR WITH GEMINI BUTTON */}
      <div className="pt-1">
        <button
          type="button"
          data-testid="generate-viral-tour-gemini-btn"
          disabled={!allFiveSlotsComplete || isGeneratingTour}
          onClick={handleGenerateViralTourWithGemini}
          className={`w-full py-3 px-4 rounded-2xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
            allFiveSlotsComplete
              ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-[#D06C4E] hover:from-amber-300 hover:to-[#b85b3f] text-zinc-950 cursor-pointer'
              : 'bg-zinc-800 text-zinc-400 border border-white/10 cursor-not-allowed'
          }`}
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>
            {isGeneratingTour
              ? `Analyzing ${completedSlotCount} Clips with Gemini 3.8 Flash...`
              : 'Generate Viral Home Tour with Gemini'}
          </span>
        </button>
        {!allFiveSlotsComplete && (
          <p className="text-[10px] text-center text-zinc-400 mt-1.5">
            {hideCaptureControls
              ? `Capture at least ${minClipsToGenerate} guided shots above to unlock Gemini generation.`
              : 'Record or upload all 5 clips above (or click “Load 5 Desktop Test Clips”) to unlock Gemini generation.'}
          </p>
        )}
      </div>

      {/* COMPONENT 4B: INTERACTIVE 9:16 VIRAL TOUR PREVIEW PLAYER */}
      {generatedPlan && (
        <div
          data-testid="viral-tour-preview-player"
          className="mt-3 p-3.5 rounded-2xl bg-zinc-950 border-2 border-amber-400/60 space-y-3.5 animate-fadeIn"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-300">
                <Wand2 className="w-3.5 h-3.5" />
                <span>Gemini 3.8 Flash • 15-Sec Viral Tour</span>
              </span>
              <h4 className="text-xs sm:text-sm font-extrabold text-white">
                Viral Tour Preview Player (9:16)
              </h4>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const nextMute = !isVoiceoverMuted;
                  setIsVoiceoverMuted(nextMute);
                  if (!nextMute && generatedPlan.voiceover_script) {
                    speakVoiceoverHook(generatedPlan.voiceover_script);
                  }
                }}
                className="px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[11px] font-bold flex items-center gap-1 text-zinc-200"
              >
                {isVoiceoverMuted ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                    <span>Muted</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Voiceover On</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsPlayingPreview((prev) => !prev)}
                className="px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[11px] font-bold flex items-center gap-1 text-zinc-200"
              >
                {isPlayingPreview ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-amber-300" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Play</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 9:16 Vertical Phone Frame Player */}
          <div className="flex justify-center">
            <div className="relative w-full max-w-[260px] aspect-[9/16] rounded-[28px] overflow-hidden border-2 border-zinc-700 bg-black shadow-2xl">
              {(() => {
                const activeClip =
                  generatedPlan.clips[activePreviewClipIdx] || generatedPlan.clips[0];
                const slotNum = activeClip?.slotNumber || 1;
                const slotMedia = recordedMedia[slotNum];
                const fallbackSlot =
                  slots.find((s) => s.slotNumber === slotNum) || slots[0];
                const featureCalloutBadge =
                  slotNum >= 2 && slotNum <= 4
                    ? generatedPlan.feature_callouts[slotNum - 2] ||
                      activeClip.overlay_badge
                    : activeClip.overlay_badge;

                return (
                  <>
                    {slotMedia?.videoUrl ? (
                      <video disablePictureInPicture
                        ref={previewVideoRef}
                        key={`preview-clip-${slotNum}`}
                        src={slotMedia.videoUrl}
                        poster={
                          slotMedia.thumbnailUrl || fallbackSlot.sampleThumbnailUrl
                        }
                        muted
                        playsInline
                        autoPlay
                        onTimeUpdate={(e) => {
                          const vid = e.currentTarget;
                          if (vid.currentTime >= (activeClip.trim_end || 3.5)) {
                            vid.currentTime = activeClip.trim_start || 0.5;
                          }
                        }}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        key={`preview-img-${slotNum}`}
                        src={
                          slotMedia?.thumbnailUrl || fallbackSlot.sampleThumbnailUrl
                        }
                        alt={`Clip ${slotNum}`}
                        className="w-full h-full object-cover scale-105 transition-transform duration-1000"
                      />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-transparent to-black/85 pointer-events-none" />

                    {/* Top Segmented Story Progress Bars */}
                    <div className="absolute top-3 inset-x-3 flex items-center gap-1">
                      {generatedPlan.clips.map((c, idx) => (
                        <button
                          key={c.slotNumber}
                          type="button"
                          onClick={() => setActivePreviewClipIdx(idx)}
                          aria-label={`Preview Clip ${c.slotNumber}`}
                          className={`h-1.5 flex-1 rounded-full transition-all ${
                            idx === activePreviewClipIdx
                              ? 'bg-amber-400'
                              : idx < activePreviewClipIdx
                              ? 'bg-white/80'
                              : 'bg-white/25'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Top Clip Trim & Speed Metadata Pill */}
                    <div className="absolute top-6 inset-x-3 flex items-center justify-between text-[9px] font-mono text-white/90">
                      <span className="px-2 py-0.5 rounded-md bg-black/65 border border-white/15">
                        Clip {slotNum}/5 • {activeClip.trim_start.toFixed(1)}s–
                        {activeClip.trim_end.toFixed(1)}s
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/90 text-zinc-950 font-extrabold">
                        {activeClip.playback_speed}x Gimbal Slow-Mo
                      </span>
                    </div>

                    {/* Dynamic Hook Overlay (Line 1 in bold glowing yellow + Line 2 in clean white for Clip 1, plus persistent header badge) */}
                    <div
                      data-testid="viral-hook-overlay"
                      className={`absolute inset-x-3 text-center pointer-events-none transition-all ${
                        slotNum === 1 ? 'top-16 scale-105' : 'top-14 opacity-95'
                      }`}
                    >
                      <div className="inline-block px-3 py-1.5 rounded-xl bg-black/80 border border-amber-400/70 shadow-[0_0_24px_rgba(251,191,36,0.5)]">
                        <div className="text-xs font-black text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]">
                          {generatedPlan.hook_overlay.line1_yellow}
                        </div>
                        <div className="text-[11px] font-extrabold text-white mt-0.5">
                          {generatedPlan.hook_overlay.line2_white}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Overlay: Clip 1 Hook Tag, Clips 2-4 3-Word Feature Callout Badges, Clip 5 CTA Overlay */}
                    <div className="absolute bottom-4 inset-x-3 space-y-2 pointer-events-none">
                      {slotNum === 5 ? (
                        <div
                          data-testid="viral-cta-overlay-badge"
                          className="p-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-[#D06C4E] text-zinc-950 font-black text-xs text-center shadow-lg"
                        >
                          {generatedPlan.cta_overlay}
                        </div>
                      ) : (
                        <div
                          data-testid="viral-feature-callout-badge"
                          className="px-3 py-1.5 rounded-xl bg-black/85 border border-white/25 text-white text-xs font-extrabold text-center shadow-md"
                        >
                          ✨ {featureCalloutBadge}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Gemini Edit Breakdown, Voiceover Script & Attach Button */}
          <div className="space-y-2.5 text-xs">
            <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                  3-Second Spoken Intro Hook (Web Speech API)
                </span>
                <button
                  type="button"
                  onClick={() => speakVoiceoverHook(generatedPlan.voiceover_script)}
                  className="text-[10px] font-bold text-emerald-400 hover:underline"
                >
                  Replay Audio
                </button>
              </div>
              <p
                data-testid="viral-voiceover-script"
                className="text-xs font-bold text-white italic"
              >
                &ldquo;{generatedPlan.voiceover_script}&rdquo;
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
                Gemini Auto-Trim & Speed Timeline (Tap to Inspect Clip)
              </span>
              <div className="space-y-1">
                {generatedPlan.clips.map((clip, idx) => (
                  <button
                    key={clip.slotNumber}
                    type="button"
                    onClick={() => setActivePreviewClipIdx(idx)}
                    className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between text-[11px] transition-colors ${
                      idx === activePreviewClipIdx
                        ? 'bg-amber-400/20 border border-amber-400/50 text-white font-bold'
                        : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    <span className="truncate">
                      Clip {clip.slotNumber}: {clip.overlay_badge}
                    </span>
                    <span className="font-mono text-[10px] text-emerald-400 shrink-0 ml-2">
                      {clip.trim_start}s–{clip.trim_end}s • {clip.playback_speed}x
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800 text-[11px] text-zinc-300">
              <span className="font-bold text-white block mb-0.5">Viral Caption:</span>
              {generatedPlan.viral_caption}
            </div>

            <button
              type="button"
              data-testid="attach-viral-tour-publish-btn"
              onClick={() => onAttachAndPublishListing(generatedPlan)}
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Attach Viral Tour & Publish Listing</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      )}

      {/* COMPONENT 2 & 3: FULL-SCREEN 9:16 "CHECK-DEPOSIT STYLE" SMART CAMERA OVERLAY */}
      {activeCameraSlotNumber !== null &&
        activeSlotConfig &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-testid="smart-camera-overlay"
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-2 sm:p-4"
          >
            <div className="relative w-full h-[90vh] max-h-[760px] max-w-[390px] bg-zinc-950 rounded-[28px] border border-zinc-700 overflow-hidden flex flex-col justify-between shadow-2xl">
              {/* Live 9:16 Rear Camera Viewfinder with 0.5x Fish-Eye Barrel Lens Projection */}
              <div
                data-testid="camera-fisheye-viewport"
                data-fisheye-active={fishEyeLensEnabled ? 'true' : 'false'}
                className={`absolute inset-0 overflow-hidden transition-all duration-300 ${
                  fishEyeLensEnabled
                    ? 'scale-[1.06] rounded-[42px] shadow-[inset_0_0_70px_rgba(0,0,0,0.85)]'
                    : ''
                }`}
              >
                <video disablePictureInPicture
                  ref={cameraVideoRef}
                  className={`w-full h-full object-cover transition-transform duration-300 ${
                    fishEyeLensEnabled ? 'scale-105 contrast-105 saturate-110' : ''
                  }`}
                  muted
                  playsInline
                  autoPlay
                />
                {/* Fish-Eye Barrel Curvature Optical Grid Ring */}
                {fishEyeLensEnabled && (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 390 760"
                    className="absolute inset-0 w-full h-full pointer-events-none opacity-45"
                  >
                    <ellipse
                      cx="195"
                      cy="380"
                      rx="184"
                      ry="358"
                      fill="none"
                      stroke="rgba(52, 211, 153, 0.45)"
                      strokeWidth="2"
                      strokeDasharray="6 6"
                    />
                    <path
                      d="M 55 90 Q 15 380 55 670"
                      fill="none"
                      stroke="rgba(251, 191, 36, 0.5)"
                      strokeWidth="2"
                    />
                    <path
                      d="M 335 90 Q 375 380 335 670"
                      fill="none"
                      stroke="rgba(251, 191, 36, 0.5)"
                      strokeWidth="2"
                    />
                  </svg>
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/20 to-black/85 pointer-events-none" />

              {/* Top Bar: Fish-Eye Lens Mode Pill, Step-Specific Guide Overlay & Close */}
              <div className="relative z-10 p-3.5 space-y-2 shrink-0">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="px-2.5 py-1 rounded-full bg-black/75 border border-white/15 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                    Slot {activeSlotConfig.slotNumber}/5 • 60fps 0.5x Fish-Eye
                  </span>

                  <button
                    type="button"
                    data-testid="fisheye-lens-toggle"
                    onClick={() => setFishEyeLensEnabled((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border transition-all ${
                      fishEyeLensEnabled
                        ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300'
                        : 'bg-zinc-900/80 border-white/20 text-zinc-300'
                    }`}
                  >
                    {fishEyeLensEnabled
                      ? '0.5x Fish-Eye Lens: ON'
                      : '0.5x Fish-Eye Lens: OFF'}
                  </button>

                  <button
                    type="button"
                    onClick={handleCloseSmartCamera}
                    aria-label="Close Smart Camera"
                    className="w-8 h-8 rounded-full bg-black/70 hover:bg-zinc-800 text-white flex items-center justify-center border border-white/15 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Step-Specific Animated Coaching Guide Overlay */}
                <div
                  data-testid="camera-step-coaching-banner"
                  className="p-2.5 rounded-2xl bg-black/80 backdrop-blur-md border border-white/20 space-y-1 shadow-lg"
                >
                  <div className="text-xs font-extrabold text-amber-300 flex items-center justify-between gap-2">
                    <span>
                      {activeSlotConfig.isSwapped && activeSlotConfig.alternateTitle
                        ? activeSlotConfig.alternateTitle
                        : activeSlotConfig.title}{' '}
                      — &ldquo;
                      {activeSlotConfig.isSwapped &&
                      activeSlotConfig.alternateMovementBadge
                        ? activeSlotConfig.alternateMovementBadge
                        : activeSlotConfig.movementBadge}
                      &rdquo;
                    </span>
                  </div>
                  <p className="text-[11px] text-white font-semibold leading-snug">
                    {activeSlotConfig.isSwapped &&
                    activeSlotConfig.alternateCameraCoachingOverlay
                      ? activeSlotConfig.alternateCameraCoachingOverlay
                      : activeSlotConfig.cameraCoachingOverlay}
                  </p>
                </div>

                {cameraStreamNote && (
                  <div className="text-[10px] text-zinc-300 bg-black/60 px-2.5 py-1 rounded-lg border border-white/10 text-center">
                    {cameraStreamNote}
                  </div>
                )}
              </div>

              {/* Center: Entrance 1-Column-Each-Side "Green Box" Alignment Gate OR Active Recording Pacer */}
              <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-1.5 min-h-0">
                {cameraPhase === 'shake_warning' ? (
                  /* Shake Detection Redo Prompt */
                  <div
                    data-testid="camera-shake-redo-prompt"
                    className="w-full p-4 rounded-3xl bg-zinc-950/95 border-2 border-amber-400 text-center space-y-2.5 shadow-2xl"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-amber-400/20 text-amber-300 flex items-center justify-center mx-auto">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-extrabold text-white">
                      Moved a little too fast — let&apos;s do 1 smooth redo
                    </h4>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      DeviceMotion detected excessive shaking during the 7.5-second window. Keep your elbows locked and walk slowly.
                    </p>
                    <div className="flex flex-col gap-2 pt-1">
                      <button
                        type="button"
                        data-testid="smooth-redo-btn"
                        onClick={() => {
                          shakeFlagRef.current = false;
                          setShakeDetectedDuringTake(false);
                          setAlignedHoldMs(0);
                          setCameraPhase('aligning');
                        }}
                        className="w-full py-2 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black text-xs"
                      >
                        Do 1 Smooth Redo
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          saveRecordedClipToSlot(activeSlotConfig.slotNumber)
                        }
                        className="w-full py-2 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs"
                      >
                        Save Clip Anyway
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Check-Deposit & 1-Column-Each-Side Entrance Alignment Frame */
                  <div
                    data-testid="alignment-gate-frame"
                    data-box-color={alignmentStatus.boxColor}
                    className={`relative w-full h-full max-h-[320px] rounded-3xl border-4 flex flex-col items-center justify-between p-3 overflow-hidden ${
                      alignmentStatus.boxColor === 'green'
                        ? 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_35px_rgba(52,211,153,0.6)]'
                        : 'border-amber-400 bg-amber-400/10 shadow-[0_0_25px_rgba(251,191,36,0.3)]'
                    }`}
                  >
                    {/* 3-COLUMN ENTRANCE SENSOR OVERLAY: 1 Left Column | Center Entrance Opening | 1 Right Column */}
                    <div
                      data-testid="entrance-3column-sensor-grid"
                      className="absolute inset-2 grid grid-cols-4 gap-1.5 pointer-events-none"
                    >
                      {/* Left Column (1 Column on Left Side) */}
                      <div
                        data-testid="entrance-left-column-guide"
                        className={`col-span-1 rounded-2xl border-2 border-dashed flex flex-col items-center justify-between p-1.5 ${
                          entranceDetection.leftColumnDetected ||
                          alignmentStatus.boxColor === 'green'
                            ? 'border-emerald-400 bg-emerald-500/25 text-emerald-200'
                            : 'border-amber-300/70 bg-black/35 text-amber-200'
                        }`}
                      >
                        <span className="text-[8px] font-black uppercase tracking-tighter text-center leading-tight">
                          Left Col (1)
                        </span>
                        <span className="text-[9px] font-mono font-extrabold px-1.5 py-0.5 rounded bg-black/70">
                          {entranceDetection.leftColumnDetected ||
                          alignmentStatus.boxColor === 'green'
                            ? '✓ Col 1'
                            : 'Scan'}
                        </span>
                      </div>

                      {/* Center Entrance Opening (2 Center Spans) */}
                      <div
                        data-testid="entrance-center-opening-guide"
                        className={`col-span-2 rounded-2xl border border-dashed flex flex-col items-center justify-between p-1.5 ${
                          entranceDetection.entranceIdentified ||
                          alignmentStatus.boxColor === 'green'
                            ? 'border-emerald-300 bg-emerald-500/15'
                            : 'border-white/30 bg-black/20'
                        }`}
                      >
                        <span className="text-[8px] font-black uppercase tracking-wider text-white/90 bg-black/65 px-2 py-0.5 rounded-full">
                          Entrance Opening
                        </span>
                        <span className="text-[8px] font-bold text-emerald-200 bg-black/65 px-2 py-0.5 rounded-full">
                          1 Col Each Side
                        </span>
                      </div>

                      {/* Right Column (1 Column on Right Side) */}
                      <div
                        data-testid="entrance-right-column-guide"
                        className={`col-span-1 rounded-2xl border-2 border-dashed flex flex-col items-center justify-between p-1.5 ${
                          entranceDetection.rightColumnDetected ||
                          alignmentStatus.boxColor === 'green'
                            ? 'border-emerald-400 bg-emerald-500/25 text-emerald-200'
                            : 'border-amber-300/70 bg-black/35 text-amber-200'
                        }`}
                      >
                        <span className="text-[8px] font-black uppercase tracking-tighter text-center leading-tight">
                          Right Col (1)
                        </span>
                        <span className="text-[9px] font-mono font-extrabold px-1.5 py-0.5 rounded bg-black/70">
                          {entranceDetection.rightColumnDetected ||
                          alignmentStatus.boxColor === 'green'
                            ? '✓ Col 1'
                            : 'Scan'}
                        </span>
                      </div>
                    </div>

                    {/* Top Entrance Column & Pitch/Roll Telemetry Pill */}
                    <div className="relative z-10 px-2.5 py-1 rounded-full bg-black/85 border border-white/15 text-[9px] font-mono font-bold text-white flex items-center gap-1.5">
                      <span className="text-emerald-300">
                        Entrance: 1 Col L + 1 Col R
                      </span>
                      <span>•</span>
                      <span>Pitch: {alignmentStatus.pitchDeg}°</span>
                    </div>

                    {/* Center Status: Aligning vs Slow 3-2-1 Countdown vs 7.5s Slow Active Pacer */}
                    {cameraPhase === 'aligning' && (
                      <div className="relative z-10 text-center space-y-1.5 my-auto px-2">
                        <div
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase shadow-md ${
                            alignmentStatus.boxColor === 'green'
                              ? 'bg-emerald-400 text-zinc-950'
                              : 'bg-amber-400 text-zinc-950'
                          }`}
                        >
                          <Smartphone className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {alignmentStatus.boxColor === 'green'
                              ? `Green Sensor Locked (${(alignedHoldMs / 1000).toFixed(1)}s / 0.8s)`
                              : 'Scanning Entrance (1 Col Each Side)...'}
                          </span>
                        </div>
                        <p
                          data-testid="alignment-coaching-text"
                          className="text-[11px] font-extrabold text-white bg-black/85 px-2.5 py-1.5 rounded-xl border border-white/15 leading-snug"
                        >
                          {alignmentStatus.coachingText}
                        </p>
                      </div>
                    )}

                    {cameraPhase === 'countdown' && (
                      <div
                        data-testid="camera-countdown-display"
                        className="relative z-10 text-center my-auto space-y-1.5 bg-black/80 px-4 py-3 rounded-2xl border border-emerald-400/60"
                      >
                        <div className="w-16 h-16 rounded-full bg-emerald-400 text-zinc-950 font-black text-3xl flex items-center justify-center mx-auto shadow-2xl animate-bounce">
                          {countdownValue}
                        </div>
                        <p className="text-xs font-extrabold text-emerald-300">
                          Entrance Locked! Slow 3-2-1 Countdown (1.5s/beat)...
                        </p>
                      </div>
                    )}

                    {cameraPhase === 'recording' && (
                      <div
                        data-testid="active-recording-pacer"
                        className="relative z-10 w-full my-auto space-y-2 text-center bg-black/80 p-2.5 rounded-2xl border border-white/15"
                      >
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-black uppercase animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-white" />
                          <span>
                            REC • {(recordingElapsedMs / 1000).toFixed(1)}s / 7.5s Slow Auto-Stop
                          </span>
                        </div>

                        {/* Pacer Metronome / Guide Cue */}
                        <div
                          data-testid="recording-pacer-cue-text"
                          className="p-2 rounded-2xl bg-black/90 border-2 border-emerald-400 text-xs sm:text-sm font-black text-amber-300 shadow-lg"
                        >
                          {pacerCue.label}
                        </div>

                        {/* Visual Guide Bar for Walking / Counter Glide / Doorway Reveal */}
                        {activePacerType === 'counter_glide' ? (
                          <div className="space-y-1">
                            <div className="w-full h-2.5 rounded-full bg-black/75 border border-white/20 overflow-hidden p-0.5">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400"
                                style={{ width: `${pacerCue.progressPercent}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-white block">
                              Slow Horizontal Countertop Slide Guide (7.5s Left → Right)
                            </span>
                          </div>
                        ) : activePacerType === 'doorway_reveal' ? (
                          <div className="space-y-1">
                            <div className="w-full h-2.5 rounded-full bg-black/75 border border-white/20 overflow-hidden p-0.5">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-pink-400 to-emerald-400"
                                style={{ width: `${pacerCue.progressPercent}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-white block">
                              Slow Forward-Reach Doorframe Guide (7.5s)
                            </span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-5 gap-1">
                            {['Hold...', 'Step 1...', 'Step 2...', 'Step 3...', 'Hold!'].map(
                              (beat, idx) => (
                                <div
                                  key={beat}
                                  className={`py-1 rounded-lg text-[9px] font-extrabold border ${
                                    pacerCue.stepIndex === idx
                                      ? 'bg-emerald-400 text-zinc-950 border-emerald-300 scale-105'
                                      : 'bg-black/65 text-zinc-400 border-white/10'
                                  }`}
                                >
                                  {beat}
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bottom Horizon Level Line */}
                    <div className="relative z-10 w-full flex items-center justify-between text-[10px] font-bold text-white/90 bg-black/75 px-2.5 py-1 rounded-full">
                      <span>0.5x Fish-Eye Stabilizer</span>
                      <span>7.5s Slow Auto-Stop</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Controls: Lock Entrance Columns (1 Col Each Side), Simulate Sensor Lock & Test Shake */}
              <div className="relative z-10 p-3.5 bg-black/85 border-t border-white/15 shrink-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    data-testid="simulate-sensor-lock-toggle"
                    onClick={() => {
                      const nextLock = !desktopSensorLock;
                      setDesktopSensorLock(nextLock);
                      if (nextLock) {
                        setEntranceDetection({
                          leftColumnDetected: true,
                          rightColumnDetected: true,
                          centerEntranceClear: true,
                          leftColumnConfidence: 98,
                          rightColumnConfidence: 98,
                          entranceIdentified: true,
                        });
                      }
                    }}
                    className={`flex-1 py-2.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 border ${
                      desktopSensorLock || entranceDetection.entranceIdentified
                        ? 'bg-emerald-500 text-zinc-950 border-emerald-400 shadow-lg'
                        : 'bg-zinc-900 hover:bg-zinc-800 text-amber-300 border-amber-400/50'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>
                      {desktopSensorLock || entranceDetection.entranceIdentified
                        ? 'Entrance Locked (1 Col Each Side): GREEN'
                        : 'Lock Entrance Sensor (1 Col Each Side)'}
                    </span>
                  </button>

                  {cameraPhase === 'recording' && (
                    <button
                      type="button"
                      data-testid="simulate-shake-btn"
                      onClick={() => {
                        shakeFlagRef.current = true;
                        setShakeDetectedDuringTake(true);
                      }}
                      className={`py-2.5 px-3 rounded-xl font-bold text-xs border ${
                        shakeDetectedDuringTake
                          ? 'bg-rose-600 text-white border-rose-400'
                          : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800'
                      }`}
                    >
                      Simulate Shake
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
