// Remotion Studio / CLI config (npm run remotion:studio, npm run remotion:render).
// The app itself renders through @remotion/player and @remotion/web-renderer.
import { Config } from '@remotion/cli/config';

Config.setEntryPoint('src/remotion/index.ts');
// FenlyViralTour uses WebGL effects (color grade, motion blur, light leak)
Config.setChromiumOpenGlRenderer('angle');
