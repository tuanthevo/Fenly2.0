/**
 * Browser helpers for the Fill flow: typed calls to /api/listings/*, uploads
 * straight to Supabase Storage (never through /api: Vercel caps bodies at
 * 4.5 MB), and the small media utilities the flow needs.
 */
import { getSupabase } from './supabase';
import { loadAppConfig } from './appConfig';
import type { FairHousingIssue, PublishProblem } from '../fill/listingRules';
import type { SharePosts } from '../fill/sharePosts';
import type { ChannelSummary, FillSummary, Nudge } from '../fill/fillStatus';
import type { ShareChannel } from '../fill/types';

export type ListingRow = {
  id: string;
  owner_id: string;
  status: 'draft' | 'published' | 'filled' | 'archived';
  title: string | null;
  description: string | null;
  neighborhood: string | null;
  city: string;
  rent_cents: number | null;
  deposit_cents: number | null;
  available_from: string | null;
  move_out_date: string | null;
  lease_term: string | null;
  lease_permission: 'can_replace' | 'leaseholder' | 'not_sure' | null;
  beds: number | null;
  baths: number | string | null;
  square_feet: number | null;
  amenities: string[];
  house_rules: string | null;
  caption: string | null;
  viral_edit: unknown;
  copy_approved_at: string | null;
  published_at: string | null;
  updated_at: string;
};

export type MediaRow = {
  id: string;
  kind: 'video_full' | 'video_teaser' | 'thumbnail' | 'raw_clip';
  bucket: string;
  path: string;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  signedUrl: string | null;
};

export type LinkRow = { id: string; channel: ShareChannel; code: string; url: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: Record<string, any>
  ) {
    super(body?.message || body?.error || `Request failed (${status})`);
  }
  get fairHousing(): FairHousingIssue[] | null {
    return this.body?.error === 'fair_housing' ? (this.body.issues as FairHousingIssue[]) : null;
  }
  get problems(): { problems: PublishProblem[]; messages: string[] } | null {
    return this.body?.error === 'not_ready' ? { problems: this.body.problems, messages: this.body.messages } : null;
  }
  get errors(): string[] {
    return Array.isArray(this.body?.errors) ? this.body.errors : [];
  }
}

async function accessToken(): Promise<string | null> {
  const supabase = await getSupabase();
  return supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export const fillApi = {
  createDraft: (moveOutDate: string, rentCents: number) =>
    api<{ listing: ListingRow }>('/api/listings', { method: 'POST', body: { moveOutDate, rentCents } }),
  listMine: () => api<{ listings: Pick<ListingRow, 'id' | 'status' | 'title' | 'neighborhood' | 'rent_cents' | 'move_out_date' | 'lease_permission' | 'published_at' | 'updated_at'>[] }>('/api/listings/mine'),
  get: (id: string) => api<{ listing: ListingRow; media: MediaRow[]; links: LinkRow[] }>(`/api/listings/${id}`),
  patch: (id: string, patch: Record<string, unknown>) =>
    api<{ listing: ListingRow }>(`/api/listings/${id}`, { method: 'PATCH', body: patch }),
  publish: (id: string) =>
    api<{ listing: ListingRow; links: LinkRow[]; posts: SharePosts }>(`/api/listings/${id}/publish`, { method: 'POST', body: {} }),
  status: (id: string) =>
    api<{
      listing: Pick<ListingRow, 'id' | 'status' | 'title' | 'move_out_date' | 'published_at' | 'rent_cents' | 'neighborhood'>;
      summary: FillSummary;
      daysLeft: number | null;
      nudges: Nudge[];
      links: LinkRow[];
    }>(`/api/listings/${id}/status`),
  /** "Improve with AI" for the note to the host: a suggested rewrite, never sent until the applicant picks it */
  rewriteNote: (note: string) => api<{ rewrite: string }>('/api/gemini/rewrite-note', { method: 'POST', body: { note } }),
  apply: (id: string, body: { note?: string; moveInDate?: string | null; via?: string | null; introVideoPath?: string }) =>
    api<{ application: { id: string } }>(`/api/listings/${id}/apply`, { method: 'POST', body }),
};

export type { ChannelSummary };

/** The content type Storage accepts for a clip (the bucket allows mp4, webm and mov). */
export function storageVideoType(blob: Blob): { contentType: string; ext: string } {
  const type = blob.type.toLowerCase();
  if (type.startsWith('video/webm')) return { contentType: 'video/webm', ext: 'webm' };
  if (type.startsWith('video/quicktime')) return { contentType: 'video/quicktime', ext: 'mov' };
  return { contentType: 'video/mp4', ext: 'mp4' };
}

/**
 * Uploads straight to Supabase Storage with progress (XHR, since fetch can't
 * report upload progress). Row-level security allows only the listing's owner.
 */
export async function uploadToStorage(
  bucket: 'listing-videos' | 'listing-thumbnails' | 'profile-photos' | 'applicant-intros',
  path: string,
  blob: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const [config, token] = await Promise.all([loadAppConfig(), accessToken()]);
  if (!config.supabase || !token) throw new Error('Sign in again to upload.');
  const url = `${config.supabase.url}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', config.supabase!.publishableKey);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status}).`;
      try {
        const body = JSON.parse(xhr.responseText);
        if (/maximum allowed size|too large|413/i.test(body?.message ?? body?.error ?? '')) {
          message = 'That video is larger than this Supabase project allows per file. Raise the file size limit in Storage settings.';
        } else if (body?.message) message = `Upload failed: ${body.message}`;
      } catch {
        // keep the generic message
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.send(blob);
  });
}

/** Records uploaded files on the listing (owner-only through RLS). Same path again replaces the row. */
export async function saveMediaRows(
  rows: {
    listing_id: string;
    kind: MediaRow['kind'];
    bucket: string;
    path: string;
    duration_ms?: number | null;
    width?: number | null;
    height?: number | null;
    bytes?: number | null;
  }[]
): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Sign-in is not set up.');
  const { error } = await supabase.from('listing_media').upsert(rows, { onConflict: 'bucket,path' });
  if (error) throw new Error(`Couldn't save the video to your listing: ${error.message}`);
}

/** A JPEG of one frame (default 1.5 s in), scaled to `maxHeight`, plus the video's size. */
export async function grabVideoFrame(
  src: Blob | string,
  atSec = 1.5,
  maxHeight = 1280
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number; durationSec: number }> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not read the video.'));
    });
    const target = Math.min(Math.max(0, atSec), Math.max(0, (video.duration || atSec) - 0.1));
    await new Promise<void>((resolve) => {
      video.onseeked = () => window.setTimeout(resolve, 200); // drawing right after seeked can show the old frame
      video.currentTime = target;
    });
    const scale = Math.min(1, maxHeight / (video.videoHeight || maxHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((video.videoWidth || 720) * scale);
    canvas.height = Math.round((video.videoHeight || 1280) * scale);
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the cover image.'))), 'image/jpeg', 0.82)
    );
    return {
      blob,
      dataUrl: canvas.toDataURL('image/jpeg', 0.6),
      width: video.videoWidth,
      height: video.videoHeight,
      durationSec: video.duration,
    };
  } finally {
    if (typeof src !== 'string') URL.revokeObjectURL(url);
  }
}
