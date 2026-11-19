/**
 * Fill tab home (Fenly 2.0): start filling a room, resume drafts, open live
 * listings' status. Signed out, the button asks to sign in first (App's gate).
 */
import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, DoorOpen, Loader2, Plus, Video, Link2, LineChart, Users } from 'lucide-react';
import { fillApi } from '../../lib/fillApi';
import { findApi, type HostingRow } from '../../lib/findApi';
import { formatRentCents } from '../../fill/publicListing';
import { daysUntil, todayIn } from '../../fill/fillStatus';

type Row = Awaited<ReturnType<typeof fillApi.listMine>>['listings'][number];

const STATUS_CHIP: Record<string, { text: string; className: string }> = {
  draft: { text: 'Draft', className: 'bg-[#F2EFE9] text-[#6E655F] border-[#2C2724]/15' },
  published: { text: 'Live', className: 'bg-[#EBF0EC] text-[#485B4A] border-[#7A907C]/40' },
  filled: { text: 'Filled', className: 'bg-[#D06C4E]/15 text-[#9A4A33] border-[#D06C4E]/40' },
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
          className="w-9 h-9 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 active:scale-90"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="flex-1 text-base font-extrabold">Fill a room</h2>
      </div>

      <div className="p-4 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D06C4E]/15 text-[#D06C4E] flex items-center justify-center shrink-0">
            <DoorOpen className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold">Moving out? Find your replacement.</h3>
            <p className="text-xs text-[#6E655F] mt-0.5 leading-relaxed">
              A 15-second tour becomes a video and a link you post in your groups. Applicants come with a verified Passport.
            </p>
          </div>
        </div>
        <ul className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-[#6E655F]">
          <li className="p-2 rounded-xl bg-[#F9F7F3]"><Video className="w-4 h-4 mx-auto mb-1 text-[#D06C4E]" />Film 3 shots</li>
          <li className="p-2 rounded-xl bg-[#F9F7F3]"><Link2 className="w-4 h-4 mx-auto mb-1 text-[#D06C4E]" />Share your link</li>
          <li className="p-2 rounded-xl bg-[#F9F7F3]"><LineChart className="w-4 h-4 mx-auto mb-1 text-[#D06C4E]" />Track applicants</li>
        </ul>
        <button
          type="button"
          onClick={onStartFill}
          data-testid="fill-start"
          className="w-full py-3 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-sm font-extrabold shadow-warm-sm flex items-center justify-center gap-2 active:scale-95"
        >
          <Plus className="w-4 h-4" /> Fill my room
        </button>
      </div>

      {signedIn && hosting.length > 0 && onOpenApplicants && (
        <div className="space-y-2" data-testid="fill-applicants">
          <h3 className="text-xs font-extrabold text-[#6E655F] uppercase tracking-wide px-1">Applicants</h3>
          <div className="rounded-2xl bg-white border border-[#2C2724]/15 divide-y divide-[#2C2724]/10 shadow-warm-sm overflow-hidden">
            {hosting.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => onOpenApplicants(h.id)}
                data-testid={`fill-applicants-${h.id}`}
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[#F9F7F3] transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-[#EBF0EC] text-[#485B4A] flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate">{h.title || `Room in ${h.neighborhood || 'San Francisco'}`}</div>
                  <div className="text-[11px] text-[#6E655F]">
                    {h.applicants === 0 ? 'No applicants yet' : `${h.applicants} applicant${h.applicants === 1 ? '' : 's'}${h.open ? ` · ${h.open} open` : ''}`}
                    {h.status === 'filled' ? ' · Filled' : ''}
                    {h.role === 'housemate' ? ' · You’re a housemate' : ''}
                  </div>
                </div>
                {h.open > 0 && h.status === 'published' && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#D06C4E] text-white text-[10px] font-black flex items-center justify-center">{h.open}</span>
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
            <p className="text-xs text-[#6E655F] px-1">No rooms yet. Start with "Fill my room".</p>
          ) : (
            <div className="rounded-2xl bg-white border border-[#2C2724]/15 divide-y divide-[#2C2724]/10 shadow-warm-sm overflow-hidden">
              {rows?.map((row) => {
                const chip = STATUS_CHIP[row.status] ?? STATUS_CHIP.draft;
                const days = daysUntil(row.move_out_date, today);
                return (
                  <button
                    key={row.id}
                    type="button"
                    data-testid={`fill-listing-${row.id}`}
                    onClick={() => (row.status === 'draft' ? onResume(row.id) : onOpenStatus(row.id))}
                    className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[#F9F7F3] transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${chip.className}`}>{chip.text}</span>
                        <span className="text-xs font-bold truncate">{row.title || `Room in ${row.neighborhood || 'San Francisco'}`}</span>
                      </div>
                      <div className="text-[11px] text-[#6E655F] mt-0.5">
                        {[
                          row.rent_cents ? `${formatRentCents(row.rent_cents)}/mo` : null,
                          days !== null ? (days >= 0 ? `${days} days to move-out` : 'Move-out passed') : null,
                          row.status === 'draft' && row.lease_permission === 'not_sure' ? 'Lease check pending' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
