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
import { AbsoluteFill, Easing, Img, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Audio, Video } from '@remotion/media';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { colorCorrection } from '@remotion/effects/color-correction';
import { blur } from '@remotion/effects/blur';
import { brandFont } from './fonts';
import {
  Callout,
  CloserReveal,
  EndCard,
  HookHeadline,
  HookTitle,
  LegibilityShade,
  PriceChip,
  ReHook,
  RoomTag,
  StoryProgress,
  TextScaleProvider,
  Watermark,
} from './overlays';
import { sfxSrc } from './sfx';
import { FENN } from './theme';
import { gradeFor } from './look';
import { CutOverlay, cutPresentation, isOverlayCut } from './transitions';
import { PUNCH_FRAMES, PUNCH_SCALE } from './plan';
import type { ViralCutKind, ViralEditPlan, ViralShot } from './types';

export type FenlyViralTourProps = { plan: ViralEditPlan };

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const WHIP_BLUR = 18;
const ZOOM_BLUR = 8;

const blurFor = (kind: ViralCutKind | null) =>
  kind === 'whip-left' || kind === 'whip-right' ? WHIP_BLUR : kind === 'zoom-through' ? ZOOM_BLUR : 0;

/** Warm, slightly punchy grade, the exposure fix from the clip analysis, and the host's lighting choice (look.ts). */
function gradeEffects(plan: ViralEditPlan, shot: ViralShot, blurRadius: number) {
  if (!plan.enableEffects) return undefined;
  return [
    colorCorrection(gradeFor(shot.exposure, plan.look)),
    blur({ radius: Math.max(1, blurRadius), disabled: blurRadius < 0.75 }),
  ];
}

/**
 * A still photo moved along its camera path (photo tours, photoTour.ts):
 * The camera pans one way only (up, down, left or right). Sideways pans slide
 * object-position along the wide photo; up/down pans shift the enlarged photo
 * within its margin. `atFrame` freezes the pose (used by the loop bridge).
 */
const PhotoFootage: React.FC<{ shot: ViralShot; blurRadius: number; atFrame?: number }> = ({ shot, blurRadius, atFrame }) => {
  const current = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = atFrame ?? current;
  const m = shot.photo!;
  const d = Math.max(1, shot.durationInFrames - 1);
  const ease = Easing.bezier(0.45, 0, 0.55, 1);
  const p = interpolate(frame, [0, d], [0, 1], { ...clamp, easing: ease });
  const scale = m.fromScale + (m.toScale - m.fromScale) * p;
  const x = m.fromX + (m.toX - m.fromX) * p;
  const y = m.fromY + (m.toY - m.fromY) * p;
  // Up/down: y = 0 shows the top edge of the enlarged photo, 100 the bottom
  const shiftY = (50 - y) * (scale - 1);
  const door = m.doorway ? interpolate(frame, [0, Math.round(0.8 * fps)], [1, 0], { ...clamp, easing: Easing.bezier(0.5, 0, 0.2, 1) }) : 0;
  return (
    <AbsoluteFill>
      <Img
        src={shot.src}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${x}% 50%`,
          scale: String(scale),
          translate: `0px ${shiftY}%`,
          filter: `saturate(1.08) contrast(1.04)${blurRadius >= 0.75 ? ` blur(${(blurRadius * 0.6).toFixed(1)}px)` : ''}`,
        }}
      />
      {door > 0 ? (
        <>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${22 * door}%`, background: 'linear-gradient(90deg, #1E1A18 70%, rgba(30,26,24,0.85))', boxShadow: '12px 0 40px rgba(0,0,0,0.45)' }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: `${22 * door}%`, background: 'linear-gradient(270deg, #1E1A18 70%, rgba(30,26,24,0.85))', boxShadow: '-12px 0 40px rgba(0,0,0,0.45)' }} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * The footage of one shot. With a speed ramp it is two back-to-back segments
 * of the same clip: the ramp (fast, hidden under the incoming cut's motion
 * blur) and the settle, which picks up exactly where the ramp left off.
 */
const ShotFootage: React.FC<{ plan: ViralEditPlan; shot: ViralShot; blurRadius: number }> = ({ plan, shot, blurRadius }) => {
  const { fps } = useVideoConfig();
  if (shot.photo) return <PhotoFootage shot={shot} blurRadius={blurRadius} />;
  const trim = shot.srcStartSec * fps;
  const common = {
    src: shot.src,
    volume: plan.audio.roomSoundVolume,
    objectFit: 'cover' as const,
    style: { width: '100%', height: '100%' },
    maxCanvasSinkFrameSize: { width: 1280, height: 1280 },
    effects: gradeEffects(plan, shot, blurRadius),
  };
  if (shot.rampFrames <= 0) {
    return (
      <Video
        {...common}
        name={`${shot.room} footage`}
        trimBefore={Math.round(trim)}
        playbackRate={shot.playbackRate}
        muted={!plan.audio.keepRoomSound}
      />
    );
  }
  return (
    <>
      <Sequence name="Speed ramp" durationInFrames={shot.rampFrames}>
        <Video {...common} name={`${shot.room} ramp`} trimBefore={Math.round(trim)} playbackRate={shot.rampRate} muted />
      </Sequence>
      <Sequence name="Settle" from={shot.rampFrames} premountFor={Math.min(shot.rampFrames, 15)}>
        <Video
          {...common}
          name={`${shot.room} footage`}
          trimBefore={Math.round(trim + shot.rampFrames * shot.rampRate)}
          playbackRate={shot.playbackRate}
          muted={!plan.audio.keepRoomSound}
        />
      </Sequence>
    </>
  );
};

/**
 * The shot's push-in zoom, combined with its reframe: a wall or door edge
 * along one side is cropped by zooming in a little, anchored on the other side.
 */
function reframeStyle(shot: ViralShot, zoom: number): React.CSSProperties {
  const reframe = shot.reframe ?? { scale: 1, originX: 50 };
  return { scale: zoom * reframe.scale, transformOrigin: `${reframe.originX}% 50%` };
}

const ShotLayer: React.FC<{
  plan: ViralEditPlan;
  shot: ViralShot;
  inKind: ViralCutKind | null;
  outKind: ViralCutKind | null;
}> = ({ plan, shot, inKind, outKind }) => {
  const frame = useCurrentFrame();
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

  // Slow push-in keeps every shot moving. The opener starts tight and settles
  // while the headline is up, then pushes in again under the facts.
  const hookExit = Math.max(1, Math.min(d, plan.hookExitFrame - shot.startFrame));
  // Photo shots carry their own camera path
  const zoom = shot.photo
    ? 1
    : shot.role === 'hook'
      ? frame < hookExit
        ? interpolate(frame, [0, hookExit], [1.12, 1], { ...clamp, easing: Easing.bezier(0.33, 0, 0.67, 1) })
        : interpolate(frame, [hookExit, d], [1, 1.06], clamp)
      : interpolate(frame, [0, d], [1, 1.08], clamp);
  // Gentle punch-ins fill quiet stretches (plan.ts QUIET_MAX_SEC)
  const punch = (shot.punchInFrames ?? []).reduce(
    (z, p) => z * interpolate(frame, [p, p + PUNCH_FRAMES], [1, PUNCH_SCALE], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    1
  );

  const endCardLocal = plan.endCard.fromFrame - shot.startFrame;

  return (
    <AbsoluteFill style={{ backgroundColor: FENN.espresso, overflow: 'hidden' }}>
      <AbsoluteFill style={reframeStyle(shot, zoom * punch)}>
        <ShotFootage plan={plan} shot={shot} blurRadius={blurRadius} />
      </AbsoluteFill>
      {shot.role === 'tour' && shot.tag ? (
        <RoomTag text={shot.tag} inFrame={shot.tagInFrame} outFrame={d - shot.outOverlapFrames - 1} />
      ) : null}
      {shot.callouts.map((c, i) => (
        <Callout key={`${c.text}-${i}`} text={c.text} kind={c.kind} inFrame={c.inFrame} outFrame={c.outFrame} row={c.row} />
      ))}
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
        <AbsoluteFill style={hook.photo ? undefined : reframeStyle(hook, 1.12)}>
          {hook.photo ? (
            <PhotoFootage shot={hook} blurRadius={0} atFrame={0} />
          ) : (
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
          )}
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
      // AI tracks are 30 s clips and a full tour runs 30-45 s: loop rather than go silent
      loop
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
    <TextScaleProvider value={plan.textScale ?? 1}>
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
    </TextScaleProvider>
  );
};
