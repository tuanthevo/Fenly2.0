/**
 * Fill tab home (Fenly 2.0): start filling a room, resume drafts, open live
 * listings' status. Signed out, the button asks to sign in first (App's gate).
 */
import React, { useEffect, useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { fillApi } from '../../lib/fillApi';
import { findApi, type HostingRow } from '../../lib/findApi';
import { EMPTY_STATE } from '../../config/launchCopy';
import { formatRentCents } from '../../fill/publicListing';
import { daysUntil, todayIn } from '../../fill/fillStatus';
import { mediaTypeOf } from '../../fill/listingRules';
import { DeleteListing } from './DeleteListing';

type Row = Awaited<ReturnType<typeof fillApi.listMine>>['listings'][number];

/** What "Fill my room" asks for, shown before the sign-in so nothing is a surprise */
const HOW_IT_WORKS: { title: string; line: string }[] = [
  { title: 'Tell us the basics', line: 'Rent, move-out date and what is included. About 2 minutes.' },
  { title: 'Show the room', line: 'Film 4 short clips standing still, or take photos. Fenn makes the tour.' },
  { title: 'Share one link', line: 'Post it anywhere. Applicants reach you here, not on your phone number.' },
];

const STATUS_CHIP: Record<string, { text: string; className: string }> = {
  draft: { text: 'Draft', className: 'text-[#6E655F]' },
  published: { text: 'Live', className: 'text-[#485B4A]' },
  filled: { text: 'Filled', className: 'text-[#9A4A33]' },
};

interface FillHomeProps {
  signedIn: boolean;
  onStartFill: () => void;
  onResume: (listingId: string) => void;
  onOpenStatus: (listingId: string) => void;
  /** applicant inbox for a live or filled room (host or housemate) */
  onOpenApplicants?: (listingId: string) => void;
  onBack: () => void;
}

export const FillHome: React.FC<FillHomeProps> = ({ signedIn, onStartFill, onResume, onOpenStatus, onOpenApplicants }) => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hosting, setHosting] = useState<HostingRow[]>([]);

  useEffect(() => {
    if (!signedIn || !onOpenApplicants) {
      setHosting([]);
      return;
    }
    let alive = true;
    findApi
      .hosting()
      .then((data) => alive && setHosting(data.listings))
      .catch(() => alive && setHosting([]));
    return () => {
      alive = false;
    };
  }, [signedIn, onOpenApplicants]);

  useEffect(() => {
    if (!signedIn) {
      setRows(null);
      return;
    }
    let alive = true;
    fillApi
      .listMine()
      .then((data) => alive && setRows(data.listings))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't load your listings."));
    return () => {
      alive = false;
    };
  }, [signedIn]);

  const today = todayIn(new Date());
  const returning = signedIn && (rows?.length ?? 0) > 0;

  return (
    <div className="w-full h-full bg-[#F9F7F3] text-[#2C2724] pt-4 pb-8 px-3.5 overflow-y-auto flex flex-col gap-4" data-testid="fill-home">
      <div className="px-1 pt-1">
        <h2 className="text-2xl font-extrabold leading-tight">{returning ? 'Your rooms' : 'Moving out? Find your replacement.'}</h2>
        {!returning && <p className="text-sm text-[#6E655F] mt-1.5">A room tour and one link, ready in about 10 minutes.</p>}
      </div>

      <div className={`p-4 rounded-2xl bg-white border border-[#2C2724]/10 space-y-4 ${returning ? 'order-last' : ''}`}>
        {!returning && (
        <ol className="space-y-3.5" data-testid="fill-how-it-works">
          {HOW_IT_WORKS.map((item, i) => (
            <li key={item.title} className="flex gap-3">
              <span aria-hidden="true" className="w-7 h-7 rounded-full bg-[#EBF0EC] text-[#485B4A] text-sm font-extrabold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-extrabold">{item.title}</div>
                <p className="text-sm text-[#6E655F] leading-snug mt-0.5">{item.line}</p>
              </div>
            </li>
          ))}
        </ol>
        )}
        <button
          type="button"
          onClick={onStartFill}
          data-testid="fill-start"
          className="w-full min-h-12 rounded-xl bg-[#B85B3F] hover:bg-[#A9513A] text-white text-base font-extrabold flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" /> {returning ? 'Fill another room' : 'Fill my room'}
        </button>
        <p className="text-xs text-[#6E655F] text-center">
          {signedIn ? 'Your draft saves as you go. Stop and come back any time.' : "You'll sign in first, so your draft is saved as you go."}
        </p>
        <a href="/help.html" target="_blank" rel="noopener" className="flex items-center justify-center min-h-10 text-sm font-extrabold text-[#A9513A] underline underline-offset-2">
          How Fenn works
        </a>
      </div>

      {signedIn && onOpenApplicants && hosting.some((h) => h.applicants > 0 || h.role === 'housemate') && (
        <div className="space-y-2" data-testid="fill-applicants">
          <h3 className="text-xs font-extrabold text-[#6E655F] uppercase tracking-wide px-1">Applicants</h3>
          <div className="rounded-2xl bg-white border border-[#2C2724]/10 divide-y divide-[#2C2724]/10 overflow-hidden">
            {hosting.filter((h) => h.applicants > 0 || h.role === 'housemate').map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => onOpenApplicants(h.id)}
                data-testid={`fill-applicants-${h.id}`}
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[#F9F7F3] transition-colors text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate">{h.title || `Room in ${h.neighborhood || 'the Bay Area'}`}</div>
                  <div className="text-xs text-[#6E655F]">
                    {h.applicants === 0 ? 'No applicants yet' : `${h.applicants} applicant${h.applicants === 1 ? '' : 's'}${h.open ? ` · ${h.open} open` : ''}`}
                    {h.status === 'filled' ? ' · Filled' : ''}
                    {h.role === 'housemate' ? ' · You’re a housemate' : ''}
                  </div>
                </div>
                {h.open > 0 && h.status === 'published' && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#B85B3F] text-white text-xs font-black flex items-center justify-center">{h.open}</span>
                )}
                <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {signedIn && (
        <div className="space-y-2">
          {!returning && <h3 className="text-xs font-extrabold text-[#6E655F] uppercase tracking-wide px-1">Your rooms</h3>}
          {error && <p className="text-xs font-bold text-[#9A4A33]">{error}</p>}
          {rows === null && !error ? (
            <div className="rounded-2xl bg-white border border-[#2C2724]/10 divide-y divide-[#2C2724]/10" role="status" aria-label="Loading your rooms">
              {[0, 1].map((i) => (
                <div key={i} className="px-4 py-3.5 space-y-2 animate-pulse">
                  <div className="h-3.5 w-2/5 rounded bg-[#2C2724]/10" />
                  <div className="h-3 w-3/5 rounded bg-[#2C2724]/10" />
                </div>
              ))}
            </div>
          ) : rows && rows.length === 0 ? (
            <p className="text-xs text-[#6E655F] px-1">{EMPTY_STATE.fillNoRooms.line}</p>
          ) : (
            <div className="rounded-2xl bg-white border border-[#2C2724]/10 divide-y divide-[#2C2724]/10 overflow-hidden">
              {rows?.map((row) => {
                const chip = STATUS_CHIP[row.status] ?? STATUS_CHIP.draft;
                const days = daysUntil(row.move_out_date, today);
                const name = row.title || `Room in ${row.neighborhood || 'the Bay Area'}`;
                return (
                  // A draft row carries its own delete button beside the row button (live rooms delete from Edit)
                  <div key={row.id} className="flex items-center">
                  <button
                    type="button"
                    data-testid={`fill-listing-${row.id}`}
                    onClick={() => (row.status === 'draft' ? onResume(row.id) : onOpenStatus(row.id))}
                    className="min-w-0 flex-1 px-4 py-3.5 flex items-center gap-3 hover:bg-[#F9F7F3] transition-colors text-left"
                  >
                    {row.status !== 'draft' && (
                      <img
                        src={`/api/media/thumb/${row.id}.jpg`}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                        className="w-11 h-14 rounded-lg object-cover bg-[#F2EFE9] shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{name}</div>
                      <div className="text-xs text-[#6E655F] mt-0.5">
                        <span className={`font-bold ${chip.className}`}>{chip.text}</span>
                        {[
                          row.rent_cents ? `${formatRentCents(row.rent_cents)}/mo` : null,
                          days !== null ? (days >= 0 ? `${days} days to move-out` : 'Move-out passed') : null,
                          row.status === 'draft' && row.lease_permission === 'not_sure' ? 'Lease check pending' : null,
                        ]
                          .filter(Boolean)
                          .map((part) => ` · ${part}`)
                          .join('')}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
                  </button>
                  {row.status === 'draft' && (
                    <div className="pr-2 border-l border-[#2C2724]/10 pl-2">
                      <DeleteListing
                        variant="icon"
                        name={name}
                        listingId={row.id}
                        status={row.status}
                        mediaType={mediaTypeOf(row)}
                        onDeleted={() => setRows((all) => (all ?? []).filter((r) => r.id !== row.id))}
                      />
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
