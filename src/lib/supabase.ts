/**
 * Browser Supabase client (publishable key only; row-level security applies).
 * Returns null when the server has no Supabase config, so the demo still runs.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadAppConfig } from './appConfig';

let client: Promise<SupabaseClient | null> | null = null;

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!client) {
    client = loadAppConfig().then((config) =>
      config.supabase
        ? createClient(config.supabase.url, config.supabase.publishableKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
              // Implicit flow: a magic link still works when the phone opens it in a
              // different browser than the one that asked for it (PKCE would not).
              flowType: 'implicit',
            },
          })
        : null
    );
  }
  return client;
}
