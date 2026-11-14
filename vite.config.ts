import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

/**
 * Keeps server secrets out of the browser bundle.
 *
 * Only VITE_-prefixed variables reach client code (see envPrefix below), so
 * GEMINI_API_KEY stays on the server in server/ and api/. This guard fails the
 * build if a Gemini key is given a VITE_ name, or if the key's value shows up in
 * any file Vite emits for the browser.
 */
function keepSecretsServerSide(env: Record<string, string>): Plugin {
  const secret = env.GEMINI_API_KEY || '';
  return {
    name: 'fenly:keep-secrets-server-side',
    config() {
      const exposed = Object.keys(env).filter(
        (key) => key.startsWith('VITE_') && key.includes('GEMINI'),
      );
      if (exposed.length > 0) {
        throw new Error(
          `${exposed.join(', ')} would be bundled into the browser. ` +
            'Name it GEMINI_API_KEY (server-only) and call Gemini through /api instead.',
        );
      }
    },
    generateBundle(_options, bundle) {
      if (secret.length < 20) return; // unset or placeholder value
      for (const file of Object.values(bundle)) {
        const contents =
          file.type === 'chunk'
            ? file.code
            : typeof file.source === 'string'
              ? file.source
              : Buffer.from(file.source).toString('utf8');
        if (contents.includes(secret)) {
          this.error(
            `GEMINI_API_KEY leaked into ${file.fileName}. Keep Gemini calls in server/ and api/.`,
          );
        }
      }
    },
  };
}

export default defineConfig(({mode}) => {
  // All env vars (including non-VITE_ ones) for the guard above; this does not expose them.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // Only VITE_* variables are exposed to the browser (e.g. VITE_GOOGLE_MAPS_API_KEY,
    // a referrer-restricted browser key). Never use this prefix for secrets.
    envPrefix: 'VITE_',
    plugins: [react(), tailwindcss(), keepSecretsServerSide(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
