/**
 * Prewritten posts for each channel in the share kit. Facts only (rent, area,
 * move-in date, room details); never who should live there (fair housing).
 */
import type { FillListingInfo, ShareChannel } from './types.js';
import { areaLabel, formatMoveIn, formatRentCents } from './publicListing.js';

export type SharePosts = {
  facebook: { text: string };
  reddit: { title: string; body: string };
  tiktok: { caption: string };
  instagram: { caption: string };
  group_chat: { text: string };
};

function details(listing: FillListingInfo): string {
  const parts: string[] = [];
  if (listing.beds) parts.push(`${listing.beds} bd`);
  if (listing.baths) parts.push(`${listing.baths} ba`);
  if (listing.leaseTerm) parts.push(`${listing.leaseTerm} lease`);
  return parts.join(' · ');
}

function perks(listing: FillListingInfo, n = 3): string {
  return listing.amenities.slice(0, n).join(', ');
}

function hashtag(text: string): string {
  return '#' + text.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

export function buildSharePosts(
  listing: FillListingInfo,
  urls: Partial<Record<ShareChannel, string>>,
  today?: string
): SharePosts {
  const rent = formatRentCents(listing.rentCents) ?? '';
  const area = areaLabel(listing);
  const moveIn = formatMoveIn(listing.availableFrom, today);
  const when = moveIn ? (moveIn === 'now' ? 'available now' : `available ${moveIn}`) : 'available soon';
  const spec = details(listing);
  const extras = perks(listing);
  const url = (channel: ShareChannel) => urls[channel] ?? urls.direct ?? '';
  const headline = `Room for rent in ${area}${rent ? `, ${rent}/mo` : ''}, ${when}`;

  const lines = (...items: (string | false | null | undefined)[]) => items.filter(Boolean).join('\n');

  return {
    facebook: {
      text: lines(
        headline,
        spec && `${spec}`,
        extras && `Includes: ${extras}`,
        '',
        `Watch the 30-second video tour and apply here: ${url('facebook')}`,
        'Happy to answer questions in the comments or by message.'
      ),
    },
    reddit: {
      title: `[OFFERING] ${rent ? `${rent} / ` : ''}room in ${area} · ${when}`,
      body: lines(
        `${listing.title?.trim() || `Room in ${area}`}`,
        '',
        rent && `- Rent: ${rent}/mo`,
        `- Move-in: ${moveIn ?? 'flexible'}`,
        spec && `- ${spec}`,
        extras && `- ${extras}`,
        '',
        `Video tour + apply: ${url('reddit')}`
      ),
    },
    tiktok: {
      caption: lines(
        `${headline}. Full tour + apply: link in bio`,
        url('tiktok'),
        [hashtag(area), '#sfhousing', '#roomforrent', '#sfrooms'].join(' ')
      ),
    },
    instagram: {
      caption: lines(
        `${headline}. Tour + apply: link in bio`,
        url('instagram'),
        [hashtag(area), '#sfhousing', '#roomforrent', '#bayarearooms'].join(' ')
      ),
    },
    group_chat: {
      text: `My room in ${area} is opening up${moveIn ? ` (${moveIn === 'now' ? 'now' : moveIn})` : ''}${rent ? `, ${rent}/mo` : ''}. 30-sec tour + apply: ${url('group_chat')} Know anyone looking?`,
    },
  };
}

/** Every text in the kit, for checks (fair housing). */
export function allPostTexts(posts: SharePosts): string[] {
  return [
    posts.facebook.text,
    posts.reddit.title,
    posts.reddit.body,
    posts.tiktok.caption,
    posts.instagram.caption,
    posts.group_chat.text,
  ];
}
