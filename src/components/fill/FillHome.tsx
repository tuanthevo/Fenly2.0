/**
 * Fill tab home (Fenly 2.0): start filling a room, resume drafts, open live
 * listings' status. Signed out, the button asks to sign in first (App's gate).
 */
import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { fillApi } from '../../lib/fillApi';
import { findApi, type HostingRow } from '../../lib/findApi';
import { EMPTY_STATE } from '../../config/launchCopy';
import { formatRentCents } from '../../fill/publicListing';
import { daysUntil, todayIn } from '../../fill/fillStatus';
import { mediaTypeOf } from '../../fill/listingRules';
import { DeleteListing } from './DeleteListing';

type Row = Awaited<ReturnType<typeof fillApi.listMine>>['listings'][number];

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

export const FillHome: React.FC<FillHomeProps> = ({ signedIn, onStartFill, onResume, onOpenStatus, onOpenApplicants, onBack }) => {
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

  return (
    <div className="w-full h-full bg-[#F9F7F3] text-[#2C2724] pt-4 pb-8 px-3.5 overflow-y-auto space-y-4" data-testid="fill-home">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Find"
          className="w-10 h-10 rounded-xl hover:bg-[#F2EFE9] text-[#2C2724] flex items-center justify-center shrink-0 active:scale-90"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="flex-1 text-base font-extrabold">Fill a room</h2>
      </div>

      <div className="p-4 rounded-2xl bg-white border border-[#2C2724]/10 space-y-3">
        <div>
          <h3 className="text-sm font-extrabold">Moving out? Find your replacement.</h3>
          <p className="text-xs text-[#6E655F] mt-0.5 leading-relaxed">Film 4 short clips, share one link, track applicants.</p>
        </div>
        <button
          type="button"
          onClick={onStartFill}
          data-testid="fill-start"
          className="w-full py-3 rounded-xl bg-[#B85B3F] hover:bg-[#A9513A] text-white text-sm font-extrabold flex items-center justify-center gap-2 active:scale-95"
        >
          <Plus className="w-4 h-4" /> Fill my room
        </button>
      </div>

      {signedIn && hosting.length > 0 && onOpenApplicants && (
        <div className="space-y-2" data-testid="fill-applicants">
          <h3 className="text-xs font-extrabold text-[#6E655F] uppercase tracking-wide px-1">Applicants</h3>
          <div className="rounded-2xl bg-white border border-[#2C2724]/10 divide-y divide-[#2C2724]/10 overflow-hidden">
            {hosting.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => onOpenApplicants(h.id)}
                data-testid={`fill-applicants-${h.id}`}
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[#F9F7F3] transition-colors text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate">{h.title || `Room in ${h.neighborhood || 'the Bay Area'}`}</div>
                  <div className="text-[11px] text-[#6E655F]">
                    {h.applicants === 0 ? 'No applicants yet' : `${h.applicants} applicant${h.applicants === 1 ? '' : 's'}${h.open ? ` · ${h.open} open` : ''}`}
                    {h.status === 'filled' ? ' · Filled' : ''}
                    {h.role === 'housemate' ? ' · You’re a housemate' : ''}
                  </div>
                </div>
                {h.open > 0 && h.status === 'published' && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#B85B3F] text-white text-[10px] font-black flex items-center justify-center">{h.open}</span>
                )}
                <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {signedIn && (
        <div className="space-y-2">
          <h3 className="text-xs font-extrabold text-[#6E655F] uppercase tracking-wide px-1">Your rooms</h3>
          {error && <p className="text-xs font-bold text-[#9A4A33]">{error}</p>}
          {rows === null && !error ? (
            <div className="flex justify-center py-6 text-[#6E655F]">
              <Loader2 className="w-5 h-5 animate-spin" />
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
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{name}</div>
                      <div className="text-[11px] text-[#6E655F] mt-0.5">
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
