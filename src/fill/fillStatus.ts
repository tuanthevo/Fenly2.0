/**
 * Fill status math: days until move-out, views and applications per channel,
 * and the nudges shown to the host. Pure; the server feeds it rows.
 */
import type { ShareChannel } from './types.js';
import { channelLabel } from './attribution.js';

export const FILL_TIME_ZONE = 'America/Los_Angeles';
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date (YYYY-MM-DD) in the launch area's time zone. */
export function todayIn(now: Date, timeZone = FILL_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** Whole calendar days from `today` to `date` (negative once it has passed). */
export function daysUntil(date: string | null | undefined, today: string): number | null {
  if (!date || !ISO_DATE.test(date) || !ISO_DATE.test(today)) return null;
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  return Math.round((b - a) / DAY_MS);
}

export type ChannelSummary = {
  channel: ShareChannel;
  views: number;
  uniqueViewers: number;
  applications: number;
  /** applications / unique viewers, or null with no viewers */
  conversion: number | null;
};

export type FillSummary = { rows: ChannelSummary[]; totals: Omit<ChannelSummary, 'channel'> };

export const CHANNEL_ORDER: ShareChannel[] = ['facebook', 'reddit', 'tiktok', 'instagram', 'group_chat', 'direct'];

export function summarizeByChannel(
  links: { id: string; channel: ShareChannel }[],
  visits: { link_id: string; anon_id: string | null }[],
  applications: { source_link_id: string | null }[]
): FillSummary {
  const channelOf = new Map(links.map((l) => [l.id, l.channel]));
  const acc = new Map<ShareChannel, { views: number; viewers: Set<string>; applications: number }>();
  const bucket = (channel: ShareChannel) => {
    let entry = acc.get(channel);
    if (!entry) acc.set(channel, (entry = { views: 0, viewers: new Set(), applications: 0 }));
    return entry;
  };
  for (const link of links) bucket(link.channel);
  let anonymousViews = 0;
  for (const visit of visits) {
    const channel = channelOf.get(visit.link_id);
    if (!channel) continue;
    const entry = bucket(channel);
    entry.views++;
    if (visit.anon_id) entry.viewers.add(visit.anon_id);
    else anonymousViews++;
  }
  for (const application of applications) {
    // No (or unknown) link: the applicant came straight to the listing
    const channel = (application.source_link_id && channelOf.get(application.source_link_id)) || 'direct';
    bucket(channel).applications++;
  }
  const rows = CHANNEL_ORDER.filter((c) => acc.has(c)).map((channel): ChannelSummary => {
    const e = acc.get(channel)!;
    const unique = e.viewers.size;
    return {
      channel,
      views: e.views,
      uniqueViewers: unique,
      applications: e.applications,
      conversion: unique > 0 ? e.applications / unique : null,
    };
  });
  const views = rows.reduce((n, r) => n + r.views, 0);
  const uniqueViewers = rows.reduce((n, r) => n + r.uniqueViewers, 0) + anonymousViews;
  const applied = rows.reduce((n, r) => n + r.applications, 0);
  return {
    rows,
    totals: { views, uniqueViewers, applications: applied, conversion: uniqueViewers > 0 ? applied / uniqueViewers : null },
  };
}

export type Nudge = { id: string; text: string; priority: number };

const POSTABLE: ShareChannel[] = ['facebook', 'reddit', 'tiktok', 'instagram', 'group_chat'];
const WHERE: Partial<Record<ShareChannel, string>> = {
  facebook: 'another Facebook housing group',
  reddit: 'r/SFBayHousing again',
  tiktok: 'TikTok again with a new hook',
  instagram: 'your Instagram story',
  group_chat: 'another group chat',
};

/** Up to 3 nudges, most urgent first. */
export function fillNudges(
  summary: FillSummary,
  ctx: { daysLeft: number | null; publishedAt: string | null; now: number },
  max = 3
): Nudge[] {
  const nudges: Nudge[] = [];
  const published = ctx.publishedAt ? Date.parse(ctx.publishedAt) : NaN;
  const hoursLive = Number.isFinite(published) ? (ctx.now - published) / 3_600_000 : 0;
  const { totals } = summary;

  if (ctx.daysLeft !== null && ctx.daysLeft < 0) {
    nudges.push({ id: 'move_out_passed', priority: 0, text: 'Your fill-by date has passed. Update it, or mark the room filled.' });
  } else if (ctx.daysLeft !== null && ctx.daysLeft <= 7) {
    const days = ctx.daysLeft === 1 ? '1 day' : `${ctx.daysLeft} days`;
    nudges.push({ id: 'move_out_soon', priority: 1, text: `${days} left to fill the room. Repost in every channel today.` });
  }
  if (totals.views === 0 && hoursLive >= 12) {
    nudges.push({ id: 'no_views', priority: 1, text: 'No views yet. Post your link in a Facebook housing group; it takes 2 minutes.' });
  }
  if (totals.views >= 30 && totals.applications === 0) {
    nudges.push({
      id: 'views_no_applications',
      priority: 2,
      text: `${totals.views} views, no applications yet. Put the move-in date and total monthly cost in your post, or retake the first shot.`,
    });
  }
  if (hoursLive >= 72 && totals.views > 0) {
    const quiet = summary.rows.find((r) => POSTABLE.includes(r.channel) && r.views === 0);
    if (quiet) {
      nudges.push({
        id: `quiet_${quiet.channel}`,
        priority: 3,
        text: `Your ${channelLabel(quiet.channel)} link has no views after 3 days. Try ${WHERE[quiet.channel]}.`,
      });
    }
  }
  const best = summary.rows
    .filter((r) => r.channel !== 'direct' && r.applications > 0)
    .sort((a, b) => b.applications - a.applications)[0];
  if (best) {
    nudges.push({ id: `best_${best.channel}`, priority: 4, text: `${channelLabel(best.channel)} is bringing applicants. Post there again.` });
  }
  return nudges.sort((a, b) => a.priority - b.priority).slice(0, max);
}
