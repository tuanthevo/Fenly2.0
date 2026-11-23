/**
 * The Part 6 funnel (docs/strategy/ceo-operating-plan.md) for the admin
 * metrics page. Pure: the route gathers counts, this turns them into rows with
 * rates and the plan's "If low, try" advice.
 */

export type FunnelInput = {
  days: number;
  events: {
    fill_started: number;
    listing_published: number;
    link_shared: number;
    link_opened: number;
    application_submitted: number;
  };
  /** listings published in the window, and how many of them were shared at least once */
  publishedListings: number;
  sharedListings: number;
  /** listings that got an application in the window, and how many of those are filled */
  listingsWithApplications: number;
  filledOfThose: number;
  /** rooms filled in the window (all areas / launch area) and the median days from publish to fill */
  filled: number;
  filledLaunchArea: number;
  medianDaysToFill: number | null;
  /** applications in the window, and how many came through a shared (non-direct) link */
  applications: number;
  applicationsViaSharedLink: number;
  /** people chosen 60+ days ago, and how many updated their Passport in the last 60 days */
  chosenLongAgo: number;
  chosenStillActive: number;
};

export type FunnelRow = {
  id: string;
  step: string;
  metric: string;
  /** the step's main number, already formatted */
  value: string | null;
  /** 0-1, or null when there's no denominator yet */
  rate: number | null;
  /** what the plan says to try when this step is low */
  ifLow: string;
  note?: string;
};

export type FunnelReport = {
  days: number;
  rows: FunnelRow[];
  /** Video vs photo listings (the photo listings experiment); missing on older servers */
  mediaSplit?: MediaSplitRow[];
  northStar: { filledLaunchArea: number; perWeek: number };
  virality: { rate: number | null; viaLink: number; applications: number };
};

export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.min(1, Math.max(0, numerator / denominator)) : null;
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildFunnel(i: FunnelInput): FunnelReport {
  const e = i.events;
  const sharesPerListing = i.publishedListings > 0 ? round1(e.link_shared / i.publishedListings) : null;
  const rows: FunnelRow[] = [
    {
      id: 'post_reply',
      step: 'Move-out post seen → reply',
      metric: 'Posts found per day',
      value: null,
      rate: null,
      ifLow: 'More groups, earlier in the day, partner admins',
      note: 'Tracked by hand outside the app (Phase 0 sheet).',
    },
    {
      id: 'reply_start',
      step: 'Reply → started a Fill',
      metric: 'Fills started',
      value: String(e.fill_started),
      rate: null,
      ifLow: 'Simpler offer, show an example video, faster turnaround',
      note: 'Replies happen outside the app; this is the number of Fills started.',
    },
    {
      id: 'start_publish',
      step: 'Started → published',
      metric: 'Completion rate',
      value: String(e.listing_published),
      rate: ratio(e.listing_published, e.fill_started),
      ifLow: 'Fewer fields, Quick Tour only, save drafts',
    },
    {
      id: 'publish_share',
      step: 'Published → shared',
      metric: 'Links shared per listing',
      value: sharesPerListing == null ? null : String(sharesPerListing),
      rate: ratio(i.sharedListings, i.publishedListings),
      ifLow: 'Better share kit, prewritten posts per channel',
      note: 'Rate = listings shared at least once.',
    },
    {
      id: 'open_apply',
      step: 'Link opened → applied',
      metric: 'Apply rate',
      value: String(e.application_submitted),
      rate: ratio(e.application_submitted, e.link_opened),
      ifLow: 'Fewer fields, apply without ID, show housemates and total cost',
      note: `${e.link_opened} link opens.`,
    },
    {
      id: 'apply_fill',
      step: 'Applied → filled',
      metric: 'Fill rate, days to fill',
      value: i.medianDaysToFill == null ? null : `${round1(i.medianDaysToFill)} days median`,
      rate: ratio(i.filledOfThose, i.listingsWithApplications),
      ifLow: 'Applicant summaries, reminders, housemate voting',
      note: `${i.filled} rooms filled.`,
    },
    {
      id: 'fill_passport',
      step: 'Filled → active Passport',
      metric: '60-day activity',
      value: `${i.chosenStillActive} of ${i.chosenLongAgo}`,
      rate: ratio(i.chosenStillActive, i.chosenLongAgo),
      ifLow: 'References, rent history, move-out tracking',
      note: 'People chosen 60+ days ago who updated their Passport since.',
    },
  ];
  return {
    days: i.days,
    rows,
    northStar: { filledLaunchArea: i.filledLaunchArea, perWeek: round1(i.filledLaunchArea / Math.max(1, i.days / 7)) },
    virality: { rate: ratio(i.applicationsViaSharedLink, i.applications), viaLink: i.applicationsViaSharedLink, applications: i.applications },
  };
}

/* ---------- video vs photos ---------- */

export type MediaListing = {
  media_type?: string | null;
  created_at: string;
  published_at: string | null;
  filled_at: string | null;
  /** Applications this listing has received */
  applications: number;
};

export type MediaSplitRow = {
  mediaType: 'video' | 'photos';
  /** Times the option was picked on the chooser */
  chosen: number;
  /** Listings started in the window that ended up as this kind */
  started: number;
  published: number;
  completionRate: number | null;
  medianHoursToPublish: number | null;
  /** Applications per published listing */
  applicantsPerListing: number | null;
  filled: number;
  medianDaysToFill: number | null;
};

/**
 * The photo listings experiment: do photos bring more finished listings without fewer
 * applicants? Listings started in the window, split by kind (no media_type = video).
 */
export function buildMediaSplit(input: { chosen: { video: number; photos: number }; listings: MediaListing[] }): MediaSplitRow[] {
  const HOUR = 3_600_000;
  return (['video', 'photos'] as const).map((mediaType) => {
    const started = input.listings.filter((l) => (l.media_type === 'photos' ? 'photos' : 'video') === mediaType);
    const published = started.filter((l) => l.published_at);
    const filled = published.filter((l) => l.filled_at);
    const span = (from: string, to: string) => Date.parse(to) - Date.parse(from);
    return {
      mediaType,
      chosen: input.chosen[mediaType],
      started: started.length,
      published: published.length,
      completionRate: ratio(published.length, started.length),
      medianHoursToPublish: median(published.map((l) => span(l.created_at, l.published_at!) / HOUR)),
      applicantsPerListing: published.length ? published.reduce((n, l) => n + l.applications, 0) / published.length : null,
      filled: filled.length,
      medianDaysToFill: median(filled.map((l) => span(l.published_at!, l.filled_at!) / (24 * HOUR))),
    };
  });
}

export function parseMetricsDays(value: unknown): 7 | 28 {
  return String(value) === '28' ? 28 : 7;
}
