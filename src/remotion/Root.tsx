/**
 * Remotion Studio / CLI entry for Fenly's videos. The app itself does not
 * import this file: it renders FenlyViralTour through @remotion/player and
 * exports with @remotion/web-renderer (see src/components/ViralVideoEditor.tsx).
 */
import React from 'react';
import { Composition } from 'remotion';
import { FenlyViralTour } from './viral/FenlyViralTour';
import { SAMPLE_PLAN } from './viral/sample';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="FenlyViralTour"
      component={FenlyViralTour}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={SAMPLE_PLAN.totalFrames}
      defaultProps={{ plan: SAMPLE_PLAN }}
      calculateMetadata={({ props }) => ({
        durationInFrames: props.plan.totalFrames,
        fps: props.plan.fps,
        width: props.plan.width,
        height: props.plan.height,
      })}
    />
  );
};
