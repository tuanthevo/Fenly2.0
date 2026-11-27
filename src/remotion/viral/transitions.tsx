/**
 * Cuts between rooms: fast whip pans and a zoom-through (0.2-0.27 s), plus a
 * light-leak or white-flash hit on the cut into the closing shot. Motion blur
 * for whips is added on the footage itself (see ShotLayer), so these
 * presentations only move and fade.
 */
import React from 'react';
import { AbsoluteFill, Easing, Solid, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import { lightLeak } from '@remotion/effects/light-leak';
import type { ViralCutKind } from './types';

type NoProps = Record<string, never>;

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const whipEase = Easing.bezier(0.7, 0, 0.3, 1);

const WhipLeftPresentation: React.FC<TransitionPresentationComponentProps<NoProps>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  const p = whipEase(presentationProgress);
  const x = presentationDirection === 'exiting' ? -p * 100 : (1 - p) * 100;
  return <AbsoluteFill style={{ translate: `${x}% 0px` }}>{children}</AbsoluteFill>;
};

const WhipRightPresentation: React.FC<TransitionPresentationComponentProps<NoProps>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  const p = whipEase(presentationProgress);
  const x = presentationDirection === 'exiting' ? p * 100 : -(1 - p) * 100;
  return <AbsoluteFill style={{ translate: `${x}% 0px` }}>{children}</AbsoluteFill>;
};

const ZoomThroughPresentation: React.FC<TransitionPresentationComponentProps<NoProps>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  if (presentationDirection === 'exiting') {
    return (
      <AbsoluteFill
        style={{
          scale: interpolate(presentationProgress, [0, 1], [1, 1.35], { ...clamp, easing: Easing.bezier(0.5, 0, 0.75, 0) }),
          opacity: interpolate(presentationProgress, [0.35, 1], [1, 0], clamp),
        }}
      >
        {children}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill
      style={{
        scale: interpolate(presentationProgress, [0, 1], [1.25, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
        opacity: interpolate(presentationProgress, [0, 0.6], [0, 1], clamp),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Photo listings: the next photo fades in over the current one (which stays solid, so the frame never dims). */
const CrossfadePresentation: React.FC<TransitionPresentationComponentProps<NoProps>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => <AbsoluteFill style={{ opacity: presentationDirection === 'entering' ? presentationProgress : 1 }}>{children}</AbsoluteFill>;

const PRESENTATIONS: Record<'whip-left' | 'whip-right' | 'zoom-through' | 'crossfade', TransitionPresentation<NoProps>> = {
  'whip-left': { component: WhipLeftPresentation, props: {} },
  'whip-right': { component: WhipRightPresentation, props: {} },
  'zoom-through': { component: ZoomThroughPresentation, props: {} },
  crossfade: { component: CrossfadePresentation, props: {} },
};

export function cutPresentation(kind: ViralCutKind): TransitionPresentation<NoProps> {
  if (kind === 'whip-left' || kind === 'whip-right' || kind === 'zoom-through' || kind === 'crossfade') return PRESENTATIONS[kind];
  return PRESENTATIONS['whip-left'];
}

export const isOverlayCut = (kind: ViralCutKind) => kind === 'flash' || kind === 'light-leak';

/** Peak brightness at the cut point (the middle of the overlay). */
export const CutOverlay: React.FC<{
  kind: 'flash' | 'light-leak';
  durationInFrames: number;
  enableEffects: boolean;
}> = ({ kind, durationInFrames, enableEffects }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const last = Math.max(1, durationInFrames - 1);
  if (kind === 'light-leak' && enableEffects) {
    return (
      <Solid
        width={width}
        height={height}
        effects={[
          lightLeak({
            seed: 3,
            hueShift: 0,
            progress: interpolate(frame, [0, last], [0, 1], clamp),
          }),
        ]}
      />
    );
  }
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#FFFFFF',
        opacity: interpolate(frame, [0, last / 2, last], [0, 0.85, 0], clamp),
      }}
    />
  );
};
