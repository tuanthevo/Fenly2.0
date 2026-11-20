/**
 * Browser calls for Find & Apply (feed, saved rooms, applicants, inbox,
 * reports/blocks, Passport ID check, review queue). Same auth and error
 * handling as fillApi.
 */
import { api } from './fillApi';
import { findQueryString, type FindFilters, type FindListing } from '../find/findFilters';
import type { Fit } from '../find/fit';
import type { Lifestyle } from '../find/lifestyle';
import type { FunnelReport } from '../../server/metrics';
export type { FunnelReport };

export type HostingRow = {
  id: string;
  title: string | null;
  neighborhood: string | null;
  status: 'published' | 'filled';
  rentCents: number | null;
  moveOutDate: string | null;
  role: 'host' | 'housemate';
  applicants: number;
  open: number;
};

export type ApplicantCard = {
  applicationId: string;
  applicantId: string;
  status: 'submitted' | 'shortlisted' | 'declined' | 'chosen' | 'withdrawn';
  declineReason: 'host' | 'room_filled' | null;
  createdAt: string;
  firstName: string | null;
  photoUrl: string | null;
  bio: string | null;
  note: string | null;
  introUrl: string | null;
  moveInDate: string | null;
  channel: string;
  lifestyle: Lifestyle;
  badges: { phone: boolean; id: boolean; idProvider: string | null; rentHistory: boolean; level: number };
  budget: { minCents: number | null; maxCents: number | null };
  moveInWindow: { from: string | null; to: string | null };
  stayLength: string | null;
  fit: { moveIn: Fit; budget: Fit; strong: boolean };
  votes: { up: number; down: number; mine: number };
  idCheckRequestedAt: string | null;
};

export type ApplicantsResponse = {
  listing: { id: string; title: string | null; neighborhood: string | null; status: string; rentCents: number | null; availableFrom: string | null };
  role: 'host' | 'housemate';
  applicants: ApplicantCard[];
  summary: string;
  idCheckEnabled: boolean;
};

export type SimilarRoom = { listingId?: string; area: string; rent: string; url: string };

export type InboxThread = {
  applicationId: string;
  listing: { id: string; title: string | null; neighborhood: string | null; status: string; rentCents: number | null } | null;
  role: 'applicant' | 'host' | 'housemate';
  status: string;
  declineReason: string | null;
  other: { id: string; firstName: string | null; photoUrl: string | null } | null;
  lastMessage: { body: string; at: string; fromMe: boolean } | null;
  unread: number;
  similar: SimilarRoom[];
  updatedAt: string;
};

export type ThreadMessage = { id: string; fromMe: boolean; senderId: string; body: string; warning: string | null; at: string };

export type ReportReason = 'scam' | 'fair_housing' | 'harassment' | 'fake_listing' | 'inappropriate' | 'other';

export type QueueFlag = {
  id: string;
  targetType: 'listing' | 'user' | 'message';
  targetId: string;
  source: string;
  category: string;
  severity: 'low' | 'medium' | 'high';
  reason: string | null;
  createdAt: string;
  target: { title: string; text: string; sub: string; hidden: boolean } | null;
};

export const findApi = {
  feed: (filters: FindFilters) => api<{ listings: FindListing[]; configured: boolean }>(`/api/find?${findQueryString(filters)}`),
  savedIds: () => api<{ listingIds: string[] }>('/api/saved'),
  savedListings: () => api<{ listings: FindListing[] }>('/api/saved/listings'),
  save: (listingId: string) => api<void>(`/api/saved/${listingId}`, { method: 'PUT', body: {} }),
  unsave: (listingId: string) => api<void>(`/api/saved/${listingId}`, { method: 'DELETE' }),

  hosting: () => api<{ listings: HostingRow[] }>('/api/hosting'),
  applicants: (listingId: string) => api<ApplicantsResponse>(`/api/listings/${listingId}/applicants`),
  aiSummary: (listingId: string) =>
    api<{ headline: string; applicants: Record<string, { fit: string; reason: string }>; source: 'ai' | 'rules' }>(
      `/api/listings/${listingId}/applicants/summary`,
      { method: 'POST', body: {} }
    ),
  act: (applicationId: string, action: 'shortlist' | 'decline' | 'choose' | 'request-id', body: Record<string, unknown> = {}) =>
    api<Record<string, unknown>>(`/api/applications/${applicationId}/${action}`, { method: 'POST', body }),
  vote: (applicationId: string, vote: 1 | -1 | 0) => api<{ vote: number }>(`/api/applications/${applicationId}/vote`, { method: 'POST', body: { vote } }),
  invite: (listingId: string) => api<{ url: string; expiresInDays: number }>(`/api/listings/${listingId}/invites`, { method: 'POST', body: {} }),
  redeemInvite: (token: string) =>
    api<{ listingId: string; title?: string | null; neighborhood?: string | null; alreadyMember?: boolean }>('/api/invites/redeem', { method: 'POST', body: { token } }),

  inbox: () => api<{ threads: InboxThread[] }>('/api/inbox'),
  messages: (applicationId: string) => api<{ status: string; messages: ThreadMessage[] }>(`/api/applications/${applicationId}/messages`),
  send: (applicationId: string, body: string) =>
    api<{ id: string; body: string; at: string; masked: boolean }>(`/api/applications/${applicationId}/messages`, { method: 'POST', body: { body } }),
  report: (targetType: 'listing' | 'user' | 'message', targetId: string, reason: ReportReason, details?: string) =>
    api<{ reported: boolean }>('/api/reports', { method: 'POST', body: { targetType, targetId, reason, details } }),
  blocks: () => api<{ blocked: string[] }>('/api/blocks'),
  block: (userId: string) => api<{ blocked: boolean }>(`/api/blocks/${userId}`, { method: 'POST', body: {} }),
  unblock: (userId: string) => api<void>(`/api/blocks/${userId}`, { method: 'DELETE' }),

  me: () => api<{ profile: { notify_email?: boolean } | null; isAdmin: boolean }>('/api/me'),
  idRequests: () =>
    api<{ idVerified: boolean; requests: { applicationId: string; area: string | null; title: string | null; requestedAt: string }[] }>('/api/passport/id-requests'),
  verifyId: (imageBase64: string, mimeType: string) =>
    api<{ verified: boolean; message: string; provider: string }>('/api/passport/verify-id', { method: 'POST', body: { imageBase64, mimeType } }),
  settings: (notifyEmail: boolean) => api<{ notifyEmail: boolean }>('/api/me/settings', { method: 'PATCH', body: { notifyEmail } }),

  queue: () => api<{ flags: QueueFlag[] }>('/api/admin/queue'),
  metrics: (days: 7 | 28) => api<FunnelReport>(`/api/admin/metrics?days=${days}`),
  resolveFlag: (flagId: string, action: 'clear' | 'hide') => api<{ ok: boolean }>(`/api/admin/flags/${flagId}`, { method: 'POST', body: { action } }),
};

/** Downscales a photo in the browser (JPEG), for profile photos and ID checks. */
export async function shrinkImage(file: Blob, maxSide: number, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that photo.'))), 'image/jpeg', quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return btoa(binary);
}
