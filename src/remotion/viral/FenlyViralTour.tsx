/**
 * FenlyViralTour: the Remotion composition that turns a ViralEditPlan into a
 * 1080x1920 short. Used by the in-app <Player> preview, the in-browser MP4
 * export (@remotion/web-renderer) and Remotion Studio (src/remotion/Root.tsx).
 *
 * Layers, back to front:
 *   TransitionSeries of shots (footage + room callouts)
 *   legibility shade, story progress, price chip, hook headline, re-hook,
 *   end card, loop bridge (first frame fades back in), sound
 *
 * The clips and copy come from the plan (generated per listing), so the
 * layers are built programmatically rather than edited in Studio.
 */
import React from 'react';
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Audio, Video } from '@remotion/media';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { colorCorrection } from '@remotion/effects/color-correction';
import { blur } from '@remotion/effects/blur';
import { brandFont } from './fonts';
import {
  CloserReveal,
  EndCard,
  HookHeadline,
  HookTitle,
  LegibilityShade,
  PriceChip,
  ReHook,
  RoomTag,
  StoryProgress,
  Watermark,
} from './overlays';
import { sfxSrc } from './sfx';
import { FENN } from './theme';
import { CutOverlay, cutPresentation, isOverlayCut } from './transitions';
import type { ViralCutKind, ViralEditPlan, ViralShot } from './types';

export type FenlyViralTourProps = { plan: ViralEditPlan };

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const WHIP_BLUR = 18;
const ZOOM_BLUR = 8;

const blurFor = (kind: ViralCutKind | null) =>
  kind === 'whip-left' || kind === 'whip-right' ? WHIP_BLUR : kind === 'zoom-through' ? ZOOM_BLUR : 0;

/** Warm, slightly punchy grade plus the exposure fix from the clip analysis. */
function gradeEffects(plan: ViralEditPlan, shot: ViralShot, blurRadius: number) {
  if (!plan.enableEffects) return undefined;
  return [
    colorCorrection({
      exposure: shot.exposure,
      temperature: 0.04,
      shadows: shot.exposure > 0.2 ? 0.1 : 0.03,
      contrast: 1.06,
      saturation: 1.06,
      vibrance: 0.12,
    }),
    blur({ radius: Math.max(1, blurRadius), disabled: blurRadius < 0.75 }),
  ];
}

const ShotLayer: React.FC<{
  plan: ViralEditPlan;
  shot: ViralShot;
  inKind: ViralCutKind | null;
  outKind: ViralCutKind | null;
}> = ({ plan, shot, inKind, outKind }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = shot.durationInFrames;

  // Motion blur while a whip / zoom transition is moving this shot
  const blurIn =
    shot.inOverlapFrames > 0
      ? interpolate(frame, [0, shot.inOverlapFrames], [blurFor(inKind), 0], clamp)
      : 0;
  const blurOut =
    shot.outOverlapFrames > 0
      ? interpolate(frame, [d - shot.outOverlapFrames, d], [0, blurFor(outKind)], clamp)
      : 0;
  const blurRadius = Math.max(blurIn, blurOut);

  // Slow push-in keeps every shot moving; the hook starts a little tighter
  const zoom =
    shot.role === 'hook'
      ? interpolate(frame, [0, d], [1.12, 1.03], { ...clamp, easing: Easing.bezier(0.33, 0, 0.67, 1) })
      : interpolate(frame, [0, d], [1, 1.07], clamp);

  const endCardLocal = plan.endCard.fromFrame - shot.startFrame;

  return (
    <AbsoluteFill style={{ backgroundColor: FENN.espresso, overflow: 'hidden' }}>
      <AbsoluteFill style={{ scale: zoom }}>
        <Video
          name={`${shot.room} footage`}
          src={shot.src}
          trimBefore={Math.round(shot.srcStartSec * fps)}
          playbackRate={shot.playbackRate}
          muted={!plan.audio.keepRoomSound}
          volume={plan.audio.roomSoundVolume}
          objectFit="cover"
          style={{ width: '100%', height: '100%' }}
          maxCanvasSinkFrameSize={{ width: 1280, height: 1280 }}
          effects={gradeEffects(plan, shot, blurRadius)}
        />
      </AbsoluteFill>
      {shot.role === 'tour' && shot.tag ? (
        <RoomTag text={shot.tag} inFrame={shot.tagInFrame} outFrame={d - shot.outOverlapFrames - 1} />
      ) : null}
      {shot.role === 'closer' && shot.tag ? (
        <CloserReveal kicker={shot.kicker} label={shot.tag} inFrame={shot.tagInFrame} outFrame={endCardLocal} />
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * The last frames fade the opening shot (and headline) back in, playing the
 * footage that leads up to the hook's first frame, so when the platform loops
 * the video the cut back to frame 0 is invisible.
 */
const LoopBridge: React.FC<{ plan: ViralEditPlan }> = ({ plan }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hook = plan.shots[0];
  const n = plan.loopBridgeFrames;
  const leadInSec = (n / fps) * hook.playbackRate;
  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(frame, [0, n - 1], [0, 1], { ...clamp, easing: Easing.bezier(0.33, 0, 0.2, 1) }),
      }}
    >
      <AbsoluteFill style={{ backgroundColor: FENN.espresso, overflow: 'hidden' }}>
        <AbsoluteFill style={{ scale: 1.12 }}>
          <Video
            name="Loop bridge footage"
            src={hook.src}
            trimBefore={Math.round(Math.max(0, hook.srcStartSec - leadInSec) * fps)}
            playbackRate={hook.playbackRate}
            muted
            objectFit="cover"
            style={{ width: '100%', height: '100%' }}
            maxCanvasSinkFrameSize={{ width: 1280, height: 1280 }}
            effects={gradeEffects(plan, hook, 0)}
          />
        </AbsoluteFill>
      </AbsoluteFill>
      <LegibilityShade />
      <HookHeadline hook={plan.hook} fontSize={plan.hookFontSize} style={{ scale: 1.06 }} />
    </AbsoluteFill>
  );
};

const MusicBed: React.FC<{ plan: ViralEditPlan }> = ({ plan }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const music = plan.audio.music;
  if (!music) return null;
  return (
    <Audio
      name="Music"
      src={music.src}
      trimBefore={Math.round(music.startSec * fps)}
      volume={interpolate(frame, [0, 4, plan.totalFrames - 10, plan.totalFrames - 1], [0, music.volume, music.volume, 0], clamp)}
    />
  );
};

const SoundLayer: React.FC<{ plan: ViralEditPlan }> = ({ plan }) => (
  <>
    {plan.audio.sfxEnabled
      ? plan.sfx.map((cue, i) => (
          <Audio key={`sfx-${i}`} name={`SFX ${cue.kind}`} src={sfxSrc(cue.kind)} from={cue.atFrame} volume={cue.volume} />
        ))
      : null}
    <MusicBed plan={plan} />
  </>
);

export const FenlyViralTour: React.FC<FenlyViralTourProps> = ({ plan }) => {
  const { fps } = useVideoConfig();
  const series: React.ReactNode[] = [];
  plan.shots.forEach((shot, i) => {
    const inKind = i > 0 ? plan.cuts[i - 1].kind : null;
    const outKind = i < plan.cuts.length ? plan.cuts[i].kind : null;
    series.push(
      <TransitionSeries.Sequence
        key={shot.id}
        name={`${i + 1}. ${shot.room}`}
        durationInFrames={shot.durationInFrames}
        premountFor={Math.round(0.8 * fps)}
      >
        <ShotLayer plan={plan} shot={shot} inKind={inKind} outKind={outKind} />
      </TransitionSeries.Sequence>
    );
    const cut = plan.cuts[i];
    if (!cut) return;
    if (isOverlayCut(cut.kind)) {
      series.push(
        <TransitionSeries.Overlay key={`cut-${i}`} durationInFrames={cut.durationInFrames}>
          <CutOverlay
            kind={cut.kind === 'light-leak' ? 'light-leak' : 'flash'}
            durationInFrames={cut.durationInFrames}
            enableEffects={plan.enableEffects}
          />
        </TransitionSeries.Overlay>
      );
    } else {
      series.push(
        <TransitionSeries.Transition
          key={`cut-${i}`}
          presentation={cutPresentation(cut.kind)}
          timing={linearTiming({ durationInFrames: cut.durationInFrames })}
        />
      );
    }
  });

  return (
    <AbsoluteFill style={{ backgroundColor: FENN.espresso, fontFamily: brandFont }}>
      <TransitionSeries name="Tour shots">{series}</TransitionSeries>
      <LegibilityShade />
      <StoryProgress plan={plan} />
      <PriceChip plan={plan} />
      {plan.showWatermark ? <Watermark /> : null}
      <HookTitle plan={plan} />
      {plan.rehook ? (
        <Sequence
          name="Re-hook"
          from={plan.rehook.fromFrame}
          durationInFrames={plan.rehook.durationInFrames}
        >
          <ReHook text={plan.rehook.text} durationInFrames={plan.rehook.durationInFrames} />
        </Sequence>
      ) : null}
      <Sequence name="End card" from={plan.endCard.fromFrame} durationInFrames={plan.endCard.durationInFrames}>
        <EndCard plan={plan} />
      </Sequence>
      <Sequence
        name="Loop bridge"
        from={plan.totalFrames - plan.loopBridgeFrames}
        durationInFrames={plan.loopBridgeFrames}
      >
        <LoopBridge plan={plan} />
      </Sequence>
      <SoundLayer plan={plan} />
    </AbsoluteFill>
  );
};
