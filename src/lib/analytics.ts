/**
 * Browser analytics: sends an allowlisted event to POST /api/events, where the
 * server's track() writes it. Fire-and-forget; never throws, never blocks the UI.
 */
import { getSupabase } from './supabase';

export type ClientEventName =
  | 'app_open'
  | 'feed_view'
  | 'listing_open'
  | 'sign_in_started'
  | 'signed_in'
  | 'apply_gate_shown'
  | 'publish_gate_shown'
  | 'menu_feature_opened'
  | 'fill_started'
  | 'tour_recorded'
  | 'link_shared';

const ANON_KEY = 'fenlyAnonId';
let memoryAnonId: string | null = null;

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return 'a_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A random per-browser id so signed-out funnels can be counted (no personal data). */
export function getAnonId(): string {
  try {
    const saved = localStorage.getItem(ANON_KEY);
    if (saved) return saved;
    const created = randomId();
    localStorage.setItem(ANON_KEY, created);
    return created;
  } catch {
    memoryAnonId ??= randomId();
    return memoryAnonId;
  }
}

export function trackEvent(name: ClientEventName, props: Record<string, unknown> = {}, listingId?: string): void {
  void (async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const supabase = await getSupabase();
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
      if (token) headers.Authorization = `Bearer ${token}`;
      await fetch('/api/events', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, props, anonId: getAnonId(), listingId }),
        keepalive: true,
      });
    } catch {
      // analytics must never break the app
    }
  })();
}
