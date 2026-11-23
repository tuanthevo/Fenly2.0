/**
 * Fill status (Fenly 2.0): days until move-out, views and applications per
 * channel, nudges, and a way back into the share kit.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CalendarClock, Clapperboard, Eye, FileCheck, Lightbulb, Loader2, Pencil, RefreshCw, Share2 } from 'lucide-react';
import { fillApi, type LinkRow } from '../../lib/fillApi';
import { channelLabel } from '../../fill/attribution';
import { formatRentCents } from '../../fill/publicListing';
import type { SharePosts } from '../../fill/sharePosts';
import type { FillSummary, Nudge } from '../../fill/fillStatus';
import { ShareKit } from './ShareKit';

type StatusData = Awaited<ReturnType<typeof fillApi.status>>;

const cardClass = 'p-4 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm';

export const FillStatusView: React.FC<{ listingId: string; onBack: () => void; onEdit?: () => void; onEditVideo?: () => void }> = ({ listingId, onBack, onEdit, onEditVideo }) => {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [kit, setKit] = useState<{ links: LinkRow[]; posts: SharePosts; caption: string | null; videoUrl: string | null; noVideo: boolean } | null>(null);
  const [kitLoading, setKitLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fillApi.status(listingId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the status.");
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openKit = async () => {
    setKitLoading(true);
    try {
      // Publishing again is safe: it returns the same links and fresh posts
      const [published, details] = await Promise.all([fillApi.publish(listingId), fillApi.get(listingId)]);
      setKit({
        links: published.links,
        posts: published.posts,
        caption: details.listing.caption,
        videoUrl: details.media.find((m) => m.kind === 'video_full')?.signedUrl ?? null,
        noVideo: details.listing.media_type === 'photos' && !details.media.some((m) => m.kind === 'video_full'),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the share kit.");
    } finally {
      setKitLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#F9F7F3] p-3.5 space-y-3" data-testid="fill-status">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={kit ? () => setKit(null) : onBack}
          aria-label="Back"
          className="w-10 h-10 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 active:scale-90"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="flex-1 min-w-0 text-base font-extrabold text-[#2C2724] truncate">
          {kit ? 'Share kit' : data?.listing.title || 'Fill status'}
        </h2>
        {!kit && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            data-testid="fill-status-edit"
            className="min-h-10 px-3 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/25 text-[#2C2724] text-xs font-extrabold flex items-center gap-1.5 shrink-0 active:scale-95"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        )}
        {!kit && (
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh"
            className="w-10 h-10 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/25 text-[#2C2724] flex items-center justify-center shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {error && <p className="text-xs font-bold text-[#9A4A33] p-3 rounded-xl bg-[#D06C4E]/10">{error}</p>}

      {kit ? (
        <ShareKit listingId={listingId} links={kit.links} posts={kit.posts} caption={kit.caption} videoUrl={kit.videoUrl} noVideo={kit.noVideo} />
      ) : loading && !data ? (
        <div className="flex justify-center py-10 text-[#6E655F]">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : data ? (
        <>
          <DaysLeftCard daysLeft={data.daysLeft} moveOut={data.listing.move_out_date} rent={data.listing.rent_cents} />
          <Totals summary={data.summary} />
          {data.nudges.length > 0 && <Nudges nudges={data.nudges} />}
          <ChannelTable summary={data.summary} />
          <button
            type="button"
            onClick={() => void openKit()}
            disabled={kitLoading}
            className="w-full py-3 rounded-xl bg-[#B85B3F] hover:bg-[#A9513A] text-white text-sm font-extrabold shadow-warm-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
          >
            {kitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            Share again
          </button>
          {/* Straight to the part the host wants to change: the facts and text, or the video */}
          {(onEdit || onEditVideo) && (
            <div className="grid grid-cols-2 gap-2">
              {onEdit && (
                <button type="button" onClick={onEdit} data-testid="fill-status-edit-details" className="min-h-11 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/25 text-[#2C2724] text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-95">
                  <Pencil className="w-3.5 h-3.5" /> Edit details
                </button>
              )}
              {onEditVideo && (
                <button type="button" onClick={onEditVideo} data-testid="fill-status-edit-video" className="min-h-11 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/25 text-[#2C2724] text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-95">
                  <Clapperboard className="w-3.5 h-3.5" /> Edit video
                </button>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};

const DaysLeftCard: React.FC<{ daysLeft: number | null; moveOut: string | null; rent: number | null }> = ({ daysLeft, moveOut, rent }) => {
  const urgent = daysLeft !== null && daysLeft <= 7;
  return (
    <div className={`${cardClass} flex items-center gap-3`}>
      <div
        className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 ${
          urgent ? 'bg-[#B85B3F] text-white' : 'bg-[#EBF0EC] text-[#485B4A]'
        }`}
      >
        <span className="text-xl font-black leading-none">{daysLeft === null ? '?' : Math.max(0, daysLeft)}</span>
        <span className="text-[9px] font-extrabold uppercase">days</span>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-extrabold text-[#2C2724] flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4 text-[#D06C4E]" />
          {daysLeft === null ? 'Add the date you need it filled' : daysLeft < 0 ? 'Fill-by date has passed' : 'left to fill the room'}
        </div>
        <div className="text-[11px] text-[#6E655F]">
          {moveOut ? `Fill by ${moveOut}` : ''}
          {rent ? ` · ${formatRentCents(rent)}/mo` : ''}
        </div>
      </div>
    </div>
  );
};

const Totals: React.FC<{ summary: FillSummary }> = ({ summary }) => (
  <div className="grid grid-cols-2 gap-2">
    <div className={cardClass}>
      <div className="text-[11px] font-bold text-[#6E655F] flex items-center gap-1">
        <Eye className="w-3.5 h-3.5" /> Views
      </div>
      <div className="text-2xl font-black text-[#2C2724]">{summary.totals.views}</div>
      <div className="text-[10px] text-[#6E655F]">{summary.totals.uniqueViewers} people</div>
    </div>
    <div className={cardClass}>
      <div className="text-[11px] font-bold text-[#6E655F] flex items-center gap-1">
        <FileCheck className="w-3.5 h-3.5" /> Applications
      </div>
      <div className="text-2xl font-black text-[#D06C4E]">{summary.totals.applications}</div>
      <div className="text-[10px] text-[#6E655F]">
        {summary.totals.conversion === null ? '—' : `${Math.round(summary.totals.conversion * 100)}% of viewers`}
      </div>
    </div>
  </div>
);

const Nudges: React.FC<{ nudges: Nudge[] }> = ({ nudges }) => (
  <div className={`${cardClass} space-y-2`} data-testid="fill-nudges">
    <h3 className="text-xs font-extrabold text-[#2C2724] flex items-center gap-1.5">
      <Lightbulb className="w-3.5 h-3.5 text-[#E5A93C]" /> Next steps
    </h3>
    {nudges.map((n) => (
      <p key={n.id} className="text-xs text-[#2C2724] leading-snug p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/10">
        {n.text}
      </p>
    ))}
  </div>
);

const ChannelTable: React.FC<{ summary: FillSummary }> = ({ summary }) => (
  <div className={cardClass}>
    <h3 className="text-xs font-extrabold text-[#2C2724] mb-2">By channel</h3>
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase text-[#6E655F]">
          <th className="text-left font-extrabold pb-1.5">Channel</th>
          <th className="text-right font-extrabold pb-1.5">Views</th>
          <th className="text-right font-extrabold pb-1.5">Applied</th>
        </tr>
      </thead>
      <tbody>
        {summary.rows.map((row) => (
          <tr key={row.channel} className="border-t border-[#2C2724]/10">
            <td className="py-2 font-bold text-[#2C2724]">{channelLabel(row.channel)}</td>
            <td className="py-2 text-right tabular-nums">{row.views}</td>
            <td className="py-2 text-right tabular-nums font-extrabold text-[#A9513A]">{row.applications}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
