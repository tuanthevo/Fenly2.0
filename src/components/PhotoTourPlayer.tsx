/**
 * Plays a photo tour (a listing's stills edited into a "walking into the home"
 * short) in the feed with the Remotion Player. Lazy-loaded by VideoPlayer so
 * the feed doesn't pull Remotion in until a card is on screen.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { FenlyViralTour } from '../remotion/viral/FenlyViralTour';
import type { ViralEditPlan } from '../remotion/viral/types';

type Props = {
  plan: ViralEditPlan;
  playing: boolean;
  muted: boolean;
  onProgress?: (fraction: number) => void;
};

/**
 * Fills the card like object-fit: cover, but never crops more than ~4% off each
 * side, so the callouts near the edges stay readable; any gap shows the
 * blurred backdrop behind the player.
 */
function useCoverSize(ref: React.RefObject<HTMLDivElement | null>, aspect: number) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      const contain = Math.min(w / aspect, h);
      const cover = Math.max(w / aspect, h);
      const height = Math.min(cover, contain * 1.08);
      setSize({ width: height * aspect, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, aspect]);
  return size;
}

const PhotoTourPlayer: React.FC<Props> = ({ plan, playing, muted, onProgress }) => {
  const playerRef = useRef<PlayerRef>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const size = useCoverSize(boxRef, plan.width / plan.height);

  // The Player's methods flush React updates synchronously, which React doesn't
  // allow during an effect: run them right after the commit instead.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const player = playerRef.current;
      if (!player) return;
      if (playing) player.play();
      else player.pause();
    }, 0);
    return () => window.clearTimeout(id);
  }, [playing, size]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const player = playerRef.current;
      if (!player) return;
      if (muted) player.mute();
      else player.unmute();
    }, 0);
    return () => window.clearTimeout(id);
  }, [muted, size]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !onProgress) return;
    const handle = (e: { detail: { frame: number } }) => onProgress(e.detail.frame / Math.max(1, plan.totalFrames - 1));
    player.addEventListener('frameupdate', handle);
    return () => player.removeEventListener('frameupdate', handle);
  }, [plan, onProgress, size]);

  return (
    <div
      ref={boxRef}
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      data-testid="photo-tour-player"
      role="img"
      aria-label={`Photo tour of this room: ${plan.priceLabel}${plan.placeLabel ? ` in ${plan.placeLabel}` : ''}`}
    >
      {size ? (
        <div style={{ width: size.width, height: size.height, flex: 'none' }}>
          <Player
            ref={playerRef}
            component={FenlyViralTour}
            inputProps={{ plan }}
            durationInFrames={plan.totalFrames}
            compositionWidth={plan.width}
            compositionHeight={plan.height}
            fps={plan.fps}
            loop
            autoPlay={playing}
            initiallyMuted
            controls={false}
            clickToPlay={false}
            doubleClickToFullscreen={false}
            spaceKeyToPlayOrPause={false}
            acknowledgeRemotionLicense
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      ) : null}
    </div>
  );
};

export default PhotoTourPlayer;
