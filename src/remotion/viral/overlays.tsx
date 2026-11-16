/**
 * On-screen text for the viral tour. Every block sits inside SAFE (theme.ts)
 * so the platform UI never covers it, uses Fenly's colors and font, and is
 * readable with the sound off: big white type with an espresso outline, and
 * terracotta highlights for the price.
 *
 * Each component reads the frame itself, so only the text re-renders per frame.
 * Burned-in text has no emoji (they differ per device).
 */
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { FENN, SAFE, TYPE } from './theme';
import type { HookCopy, ViralEditPlan } from './types';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeIn = Easing.bezier(0.7, 0, 0.84, 0);

const outlined = (strokePx: number): React.CSSProperties => ({
  color: FENN.white,
  WebkitTextStroke: `${strokePx}px ${FENN.espresso}`,
  paintOrder: 'stroke fill',
  textShadow: '0 6px 24px rgba(44, 39, 36, 0.45)',
});

const pill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  whiteSpace: 'nowrap',
};

/** Dark gradients at the top and bottom so text stays legible on bright rooms. Static, so loops cleanly. */
export const LegibilityShade: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage:
        'linear-gradient(180deg, rgba(44, 39, 36, 0.55) 0%, rgba(44, 39, 36, 0) 34%, rgba(44, 39, 36, 0) 62%, rgba(44, 39, 36, 0.5) 100%)',
    }}
  />
);

/** The headline itself, without animation (used on frame 0 and by the loop bridge). */
export const HookHeadline: React.FC<{
  hook: HookCopy;
  fontSize: number;
  style?: React.CSSProperties;
}> = ({ hook, fontSize, style }) => (
  <AbsoluteFill
    style={{
      paddingTop: SAFE.top + 80,
      paddingLeft: 90,
      paddingRight: 90,
      flexDirection: 'column',
      alignItems: 'center',
      ...style,
    }}
  >
    <div
      style={{
        ...pill,
        fontSize: TYPE.kicker,
        fontWeight: 800,
        letterSpacing: '0.16em',
        color: FENN.oatmeal,
        backgroundColor: 'rgba(44, 39, 36, 0.82)',
        padding: '12px 26px',
        marginBottom: 28,
      }}
    >
      {hook.kicker}
    </div>
    <div
      style={{
        ...outlined(Math.round(fontSize / 9)),
        fontSize,
        fontWeight: 800,
        lineHeight: 1.12,
        textAlign: 'center',
        maxWidth: 900,
      }}
    >
      {hook.segments.map((seg, i) =>
        seg.em === 'price' ? (
          <span
            key={i}
            style={{
              display: 'inline-block',
              backgroundColor: FENN.terracotta,
              color: FENN.oatmeal,
              WebkitTextStroke: '0px transparent',
              textShadow: 'none',
              padding: '0 0.2em',
              borderRadius: '0.2em',
              rotate: '-2deg',
              boxShadow: '0 10px 28px rgba(44, 39, 36, 0.35)',
            }}
          >
            {seg.text}
          </span>
        ) : seg.em === 'place' ? (
          <span
            key={i}
            style={{
              whiteSpace: 'nowrap',
              textDecorationLine: 'underline',
              textDecorationColor: FENN.terracotta,
              textDecorationThickness: '0.12em',
              textUnderlineOffset: '0.14em',
            }}
          >
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </div>
  </AbsoluteFill>
);

/** Fully visible on frame 0 (the cover and the first thing a scroller sees), then lifts away on the first cut. */
export const HookTitle: React.FC<{ plan: ViralEditPlan }> = ({ plan }) => {
  const frame = useCurrentFrame();
  const exitStart = plan.hookExitFrame - 2;
  const exitEnd = exitStart + plan.hookExitFrames;
  if (frame > exitEnd) return null;
  return (
    <HookHeadline
      hook={plan.hook}
      fontSize={plan.hookFontSize}
      style={{
        scale: interpolate(frame, [0, 8], [1.06, 1], { ...clamp, easing: easeOut }),
        opacity: interpolate(frame, [exitStart, exitEnd], [1, 0], clamp),
        translate: interpolate(frame, [exitStart, exitEnd], ['0px 0px', '0px -70px'], { ...clamp, easing: easeIn }),
      }}
    />
  );
};

/** Segmented story bar: tells viewers the video is short and how far along they are. */
export const StoryProgress: React.FC<{ plan: ViralEditPlan }> = ({ plan }) => {
  const frame = useCurrentFrame();
  const end = plan.endCard.fromFrame;
  if (frame >= end + 8) return null;
  const opacity = interpolate(frame, [4, 12, end, end + 8], [0, 1, 1, 0], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        top: SAFE.top + 6,
        left: SAFE.left,
        width: 1080 - SAFE.left - SAFE.right,
        height: 8,
        display: 'flex',
        gap: 8,
        opacity,
      }}
    >
      {plan.shots.map((shot, i) => {
        const start = shot.startFrame;
        const stop = i < plan.shots.length - 1 ? plan.shots[i + 1].startFrame : end;
        const fill = interpolate(frame, [start, stop], [0, 100], clamp);
        return (
          <div
            key={shot.id}
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              overflow: 'hidden',
              backgroundColor: 'rgba(249, 247, 243, 0.32)',
            }}
          >
            <div style={{ width: `${fill}%`, height: 8, backgroundColor: FENN.oatmeal }} />
          </div>
        );
      })}
    </div>
  );
};

/** The rent stays on screen for anyone who joins mid-video (hidden as "$ ? ? ?" for guess-the-rent). */
export const PriceChip: React.FC<{ plan: ViralEditPlan }> = ({ plan }) => {
  const frame = useCurrentFrame();
  const from = plan.priceChipFromFrame;
  const to = plan.endCard.fromFrame;
  if (frame < from || frame >= to + 8) return null;
  const appear = interpolate(frame, [from, from + 8], [0, 1], { ...clamp, easing: easeOut });
  const leave = interpolate(frame, [to, to + 8], [1, 0], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        top: SAFE.top + 38,
        left: SAFE.left,
        opacity: Math.min(appear, leave),
        translate: `${interpolate(appear, [0, 1], [-30, 0])}px 0px`,
      }}
    >
      <div
        style={{
          ...pill,
          gap: 16,
          padding: '14px 28px 14px 22px',
          backgroundColor: 'rgba(44, 39, 36, 0.86)',
          color: FENN.oatmeal,
          fontSize: TYPE.chip,
          fontWeight: 800,
          boxShadow: '0 8px 24px rgba(44, 39, 36, 0.3)',
        }}
      >
        <span style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: FENN.terracotta }} />
        <span>{plan.hidePriceUntilEnd ? '$ ? ? ?' : plan.priceLabel}</span>
        {plan.placeLabel ? (
          <span style={{ fontSize: 34, fontWeight: 700, color: 'rgba(249, 247, 243, 0.78)' }}>
            {plan.placeLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
};

/** 2-3 word room callout, bottom left (above the caption area), pops in after the transition settles. */
export const RoomTag: React.FC<{ text: string; inFrame: number; outFrame: number }> = ({
  text,
  inFrame,
  outFrame,
}) => {
  const frame = useCurrentFrame();
  if (frame < inFrame || frame > outFrame) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 1196,
        left: SAFE.left,
        transformOrigin: 'left center',
        scale: interpolate(frame, [inFrame, inFrame + 8], [0.55, 1], {
          ...clamp,
          easing: Easing.spring({ damping: 12 }),
          output: 'perceptual-scale',
        }),
        opacity: interpolate(frame, [inFrame, inFrame + 3, outFrame - 3, outFrame], [0, 1, 1, 0], clamp),
      }}
    >
      <div
        style={{
          ...pill,
          gap: 18,
          padding: '18px 34px 18px 24px',
          borderRadius: 24,
          backgroundColor: FENN.oatmeal,
          color: FENN.espresso,
          fontSize: TYPE.tag,
          fontWeight: 800,
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
          boxShadow: '0 12px 32px rgba(44, 39, 36, 0.35)',
        }}
      >
        <span style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: FENN.terracotta }} />
        {text}
      </div>
    </div>
  );
};

/** Mid-video open loop ("Wait for the best part") to carry viewers to the payoff. */
export const ReHook: React.FC<{ text: string; durationInFrames: number }> = ({ text, durationInFrames }) => {
  const frame = useCurrentFrame();
  const last = durationInFrames - 1;
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 560 }}>
      <div
        style={{
          ...pill,
          padding: '16px 30px',
          backgroundColor: 'rgba(44, 39, 36, 0.9)',
          color: FENN.oatmeal,
          fontSize: 50,
          fontWeight: 800,
          rotate: '2deg',
          scale: interpolate(frame, [0, 7], [0.6, 1], {
            ...clamp,
            easing: Easing.spring({ damping: 12 }),
            output: 'perceptual-scale',
          }),
          opacity: interpolate(frame, [0, 3, last - 4, last], [0, 1, 1, 0], clamp),
        }}
      >
        {text}
        <span style={{ marginLeft: 16, color: FENN.terracotta }}>›››</span>
      </div>
    </AbsoluteFill>
  );
};

/** The payoff shot: "THE BEST PART" + the perk, centered. */
export const CloserReveal: React.FC<{
  kicker: string;
  label: string;
  inFrame: number;
  outFrame: number;
}> = ({ kicker, label, inFrame, outFrame }) => {
  const frame = useCurrentFrame();
  if (frame < inFrame || frame > outFrame + 6) return null;
  const opacity = interpolate(frame, [inFrame, inFrame + 3, outFrame, outFrame + 6], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 980, paddingLeft: 90, paddingRight: 90, opacity }}>
      <div
        style={{
          ...pill,
          padding: '12px 26px',
          backgroundColor: FENN.terracotta,
          color: FENN.oatmeal,
          fontSize: 38,
          fontWeight: 800,
          letterSpacing: '0.14em',
          marginBottom: 18,
          scale: interpolate(frame, [inFrame, inFrame + 6], [0.7, 1], { ...clamp, easing: easeOut }),
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          ...outlined(11),
          fontSize: 100,
          fontWeight: 800,
          lineHeight: 1.08,
          textAlign: 'center',
          textTransform: 'uppercase',
          scale: interpolate(frame, [inFrame + 2, inFrame + 10], [0.6, 1], {
            ...clamp,
            easing: Easing.spring({ damping: 11 }),
            output: 'perceptual-scale',
          }),
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};

/** The price question (or the guess-the-rent reveal) over the last shot. */
export const EndCard: React.FC<{ plan: ViralEditPlan }> = ({ plan }) => {
  const frame = useCurrentFrame();
  const card = plan.endCard;
  const shade = interpolate(frame, [0, 6], [0, 1], clamp);
  const line = (delay: number) => ({
    opacity: interpolate(frame, [delay, delay + 4], [0, 1], clamp),
    translate: interpolate(frame, [delay, delay + 6], ['0px 24px', '0px 0px'], { ...clamp, easing: easeOut }),
  });
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          opacity: shade,
          backgroundImage:
            'linear-gradient(0deg, rgba(44, 39, 36, 0.9) 0%, rgba(44, 39, 36, 0.62) 48%, rgba(44, 39, 36, 0.15) 80%, rgba(44, 39, 36, 0) 100%)',
        }}
      />
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 720, paddingLeft: 90, paddingRight: 90 }}>
        <div style={{ ...outlined(6), fontSize: 64, fontWeight: 700, textAlign: 'center', ...line(2) }}>
          {card.lead}
        </div>
        <div
          style={{
            ...pill,
            marginTop: 18,
            marginBottom: 18,
            padding: '6px 36px',
            borderRadius: 30,
            backgroundColor: FENN.terracotta,
            color: FENN.oatmeal,
            fontSize: 128,
            fontWeight: 800,
            rotate: '-2deg',
            boxShadow: '0 16px 40px rgba(44, 39, 36, 0.45)',
            opacity: interpolate(frame, [5, 8], [0, 1], clamp),
            scale: interpolate(frame, [5, 14], [0.5, 1], {
              ...clamp,
              easing: Easing.spring({ damping: 10 }),
              output: 'perceptual-scale',
            }),
          }}
        >
          {card.big}
        </div>
        <div style={{ ...outlined(6), fontSize: 64, fontWeight: 700, textAlign: 'center', ...line(9) }}>
          {card.tail}
        </div>
        <div
          style={{
            marginTop: 34,
            fontSize: TYPE.support,
            fontWeight: 700,
            color: 'rgba(249, 247, 243, 0.9)',
            textAlign: 'center',
            ...line(12),
          }}
        >
          {card.sub}
        </div>
        <div
          style={{
            ...pill,
            marginTop: 26,
            gap: 12,
            padding: '12px 26px',
            backgroundColor: FENN.oatmeal,
            color: FENN.espresso,
            fontSize: 36,
            fontWeight: 800,
            ...line(15),
          }}
        >
          <span style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: FENN.sage }} />
          {card.brand}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Small brand mark, off by default: Instagram only recommends Reels with no visible watermark. */
export const Watermark: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      top: SAFE.top + 44,
      right: SAFE.right,
      ...pill,
      padding: '8px 18px',
      backgroundColor: 'rgba(249, 247, 243, 0.85)',
      color: FENN.espresso,
      fontSize: 30,
      fontWeight: 800,
      letterSpacing: '0.04em',
    }}
  >
    fenn
  </div>
);
