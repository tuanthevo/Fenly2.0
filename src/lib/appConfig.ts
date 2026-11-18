/**
 * Runtime config from GET /api/config: Supabase public settings and feature flags.
 * Loaded once per page; on any failure the app runs as the signed-out demo with
 * every hidden feature off.
 */
import { DEFAULT_FLAGS, resolveFlags, type FeatureFlags } from '../config/featureFlags';

export type AppConfig = {
  supabase: { url: string; publishableKey: string } | null;
  flags: FeatureFlags;
};

export const FALLBACK_CONFIG: AppConfig = { supabase: null, flags: { ...DEFAULT_FLAGS } };

let pending: Promise<AppConfig> | null = null;

export function loadAppConfig(): Promise<AppConfig> {
  if (!pending) {
    pending = fetch('/api/config', { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`config ${res.status}`))))
      .then((body): AppConfig => {
        const supabase =
          body?.supabase && typeof body.supabase.url === 'string' && typeof body.supabase.publishableKey === 'string'
            ? { url: body.supabase.url, publishableKey: body.supabase.publishableKey }
            : null;
        return { supabase, flags: resolveFlags(DEFAULT_FLAGS, body?.flags) };
      })
      .catch((error) => {
        console.warn('Fenly config unavailable, running as the local demo:', error instanceof Error ? error.message : error);
        return FALLBACK_CONFIG;
      });
  }
  return pending;
}
