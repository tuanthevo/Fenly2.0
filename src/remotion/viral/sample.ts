/**
 * Sample plan for Remotion Studio (npm run remotion:studio).
 *
 * By default every shot uses Remotion's public sample clip so Studio opens
 * without any setup. To preview real footage, copy 3-5 phone clips to
 * public/samples/ (gitignored) as shot-1.mov ... shot-5.mov (any extension the
 * browser can decode), set USE_LOCAL_SAMPLES to true and fill in durations.
 */
import { staticFile } from 'remotion';
import { buildViralEditPlan } from './plan';
import type { ViralClipInput, ViralListingInfo } from './types';

export const USE_LOCAL_SAMPLES = false;

const REMOTE_SAMPLE = 'https://remotion.media/video.mp4';

const LOCAL_SAMPLES: { slotNumber: number; room: string; file: string; durationSec: number }[] = [
  { slotNumber: 1, room: 'Bedroom Hook', file: 'samples/shot-1.mov', durationSec: 4.5 },
  { slotNumber: 2, room: 'Kitchen & Shared Space', file: 'samples/shot-2.mov', durationSec: 4.5 },
  { slotNumber: 3, room: 'Bathroom Peek', file: 'samples/shot-3.mov', durationSec: 4.5 },
  { slotNumber: 4, room: 'Closet & Storage', file: 'samples/shot-4.mov', durationSec: 4.5 },
  { slotNumber: 5, room: 'Standout Perk', file: 'samples/shot-5.mov', durationSec: 4.5 },
];

export const SAMPLE_LISTING: ViralListingInfo = {
  monthlyRent: 1450,
  beds: 1,
  baths: 1,
  neighborhood: 'Mission District',
  city: 'San Francisco',
  roomType: 'Private Room',
  squareFeet: 220,
  amenities: ['Private Bath', 'In-Unit W/D', 'High-Speed WiFi', 'Utilities Included'],
};

const SAMPLE_CLIPS: ViralClipInput[] = LOCAL_SAMPLES.map((s) => ({
  slotNumber: s.slotNumber,
  room: s.room,
  src: USE_LOCAL_SAMPLES ? staticFile(s.file) : REMOTE_SAMPLE,
  durationSec: USE_LOCAL_SAMPLES ? s.durationSec : 10,
}));

export const SAMPLE_PLAN = buildViralEditPlan({ listing: SAMPLE_LISTING, clips: SAMPLE_CLIPS });
