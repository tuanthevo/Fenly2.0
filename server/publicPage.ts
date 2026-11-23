/**
 * Server-rendered public listing page (/r/<code>): small, fast, readable without
 * JavaScript, with Open Graph tags so link previews show the video cover, price,
 * move-in date and area. Every listing value is HTML-escaped.
 */
import { escapeHtml, formatMoveIn, formatRentCents, listingHeadline } from "../src/fill/publicListing.js";
import type { FillListingInfo } from "../src/fill/types.js";

const STYLE = `
:root{--bg:#F9F7F3;--ink:#2C2724;--muted:#6E655F;--accent:#D06C4E;--cta:#B85B3F;--cta-dark:#A9513A;--sage:#7A907C;--sage-bg:#EBF0EC;--card:#fff;--line:rgba(44,39,36,.15)}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font-family:'Plus Jakarta Sans',Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:480px;margin:0 auto;padding:16px 16px 112px}
.video{position:relative;width:100%;aspect-ratio:9/16;max-height:72vh;border-radius:24px;overflow:hidden;background:#000;box-shadow:0 8px 24px rgba(44,39,36,.18)}
.video video,.video img{width:100%;height:100%;object-fit:cover;display:block}
h1{font-size:20px;line-height:1.25;margin:16px 0 6px;font-weight:800}
.facts{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.chip{font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px;background:var(--card);border:1px solid var(--line)}
.chip.price{background:var(--cta);color:#fff;border-color:var(--cta)}
.chip.sage{background:var(--sage-bg);color:#485B4A;border-color:rgba(122,144,124,.4)}
p{font-size:14px;line-height:1.55;color:var(--muted);margin:8px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;margin:14px 0}
.card h2{font-size:13px;margin:0 0 6px;font-weight:800;color:var(--ink)}
.cta{position:fixed;left:0;right:0;bottom:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:rgba(249,247,243,.96);border-top:1px solid var(--line)}
.cta a{display:block;max-width:448px;margin:0 auto;text-align:center;background:var(--cta);color:#fff;font-weight:800;font-size:15px;padding:14px;border-radius:14px;text-decoration:none}
.cta a:hover,.cta a:active{background:var(--cta-dark)}
.cta a.secondary{background:var(--card);color:var(--ink);border:1px solid var(--ink)}
.made{position:absolute;left:10px;bottom:10px;margin:0;padding:4px 9px;border-radius:999px;background:rgba(44,39,36,.72);color:#fff;font-size:11px;font-weight:700;line-height:1.3;pointer-events:none}
.brand{font-weight:800;color:var(--cta-dark);text-decoration:none;font-size:15px}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
header span{font-size:11px;color:var(--muted);font-weight:700}
`;

export type ListingPageInput = {
  listing: FillListingInfo;
  status: "published" | "filled";
  metaTags: string;
  videoUrl: string | null;
  posterUrl: string | null;
  applyHref: string;
  findHref: string;
  today: string;
};

// The app's font (same request as index.html), so a shared link looks like the app
const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">`;

function page(title: string, head: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F9F7F3">
<title>${escapeHtml(title)}</title>
${FONT_LINKS}
${head}
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * First paint on mobile data: connect to the media host early and fetch the
 * cover first, so the room shows before the video has buffered.
 */
function speedHints(input: ListingPageInput): string {
  const hints: string[] = ['<link rel="icon" href="/icons/fenn.svg" type="image/svg+xml">', '<link rel="manifest" href="/manifest.webmanifest">'];
  const media = input.posterUrl ?? input.videoUrl;
  try {
    if (media && /^https:/.test(media)) hints.push(`<link rel="preconnect" href="${escapeHtml(new URL(media).origin)}" crossorigin>`);
  } catch {
    // not a URL: skip the hint
  }
  if (input.posterUrl) hints.push(`<link rel="preload" as="image" href="${escapeHtml(input.posterUrl)}" fetchpriority="high">`);
  return hints.join("\n");
}

export function renderListingPage(input: ListingPageInput): string {
  const { listing } = input;
  const title = listing.title?.trim() || listingHeadline(listing);
  const rent = formatRentCents(listing.rentCents);
  const deposit =
    listing.depositCents == null ? null : listing.depositCents === 0 ? "No deposit" : `${formatRentCents(listing.depositCents)} deposit`;
  const moveIn = formatMoveIn(listing.availableFrom, input.today);
  const area = listing.neighborhood ? `${listing.neighborhood}, ${listing.city}` : listing.city;
  const specs = [listing.beds ? `${listing.beds} bd` : null, listing.baths ? `${listing.baths} ba` : null, listing.leaseTerm]
    .filter(Boolean)
    .join(" · ");
  const filled = input.status === "filled";
  const photos = listing.mediaType === "photos";
  const tour = photos ? "Photo tour" : "Video tour";
  // Photo tours say so on the picture itself, so nobody takes moving photos for filmed video
  const madeFrom = photos ? `<p class="made">${escapeHtml("Made from the host's photos")}</p>` : "";

  const media = input.videoUrl
    ? `<video disablepictureinpicture src="${escapeHtml(input.videoUrl)}"${input.posterUrl ? ` poster="${escapeHtml(input.posterUrl)}"` : ""} playsinline muted autoplay loop controls preload="none" aria-label="${tour} of the room in ${escapeHtml(area)}"></video>`
    : input.posterUrl
      ? `<img src="${escapeHtml(input.posterUrl)}" alt="Room in ${escapeHtml(area)}" fetchpriority="high">`
      : "";

  const amenities = listing.amenities.length
    ? `<div class="card"><h2>Included</h2><div class="facts">${listing.amenities
        .map((a) => `<span class="chip">${escapeHtml(a)}</span>`)
        .join("")}</div></div>`
    : "";

  const body = `<main>
<header><a class="brand" href="${escapeHtml(input.findHref)}">Fenn</a><span>${tour} · area shown, exact address after you're accepted</span></header>
${media ? `<div class="video">${media}${madeFrom}</div>` : ""}
<h1>${escapeHtml(title)}</h1>
<div class="facts">
${rent ? `<span class="chip price">${escapeHtml(rent)}/mo</span>` : ""}
${deposit ? `<span class="chip">${escapeHtml(deposit)}</span>` : ""}
${moveIn ? `<span class="chip sage">${moveIn === "now" ? "Move in now" : `Move in ${escapeHtml(moveIn)}`}</span>` : ""}
<span class="chip">${escapeHtml(area)}</span>
${specs ? `<span class="chip">${escapeHtml(specs)}</span>` : ""}
</div>
${listing.description ? `<p>${escapeHtml(listing.description)}</p>` : ""}
${amenities}
${filled ? `<div class="card"><h2>This room is taken</h2><p>It filled through Fenn. See similar rooms nearby.</p></div>` : ""}
<p style="font-size:12px;margin-top:18px">Something wrong with this listing? <a href="/?report=${escapeHtml(listing.id)}" style="color:inherit">Report it</a>. Never pay a deposit before you have seen the room.</p>
</main>
<div class="cta">${
    filled
      ? `<a class="secondary" href="${escapeHtml(input.findHref)}">See similar rooms</a>`
      : `<a href="${escapeHtml(input.applyHref)}">Apply to this room</a>`
  }</div>`;

  return page(`${title} · Fenn`, `${speedHints(input)}
${input.metaTags}`, body);
}

export function renderNotFoundPage(findHref: string): string {
  return page(
    "Listing not available · Fenn",
    '<meta name="robots" content="noindex">',
    `<main><header><a class="brand" href="${escapeHtml(findHref)}">Fenn</a></header>
<div class="card"><h2>This listing isn't available</h2><p>It may have been taken down or the link is mistyped. Browse other rooms on Fenn.</p></div></main>
<div class="cta"><a href="${escapeHtml(findHref)}">Browse rooms</a></div>`
  );
}
