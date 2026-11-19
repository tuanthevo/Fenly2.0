/**
 * Report a listing, a profile or a message, and optionally block the person.
 * Reports go to Fenly's review queue; the reported person is never told who reported them.
 */
import React, { useState } from 'react';
import { Flag, Loader2, X } from 'lucide-react';
import { findApi, type ReportReason } from '../../lib/findApi';

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'scam', label: 'Scam or asking for money first' },
  { id: 'fake_listing', label: "Fake listing or the room isn't real" },
  { id: 'fair_housing', label: 'Discriminatory (who can or can’t live there)' },
  { id: 'harassment', label: 'Harassment or threats' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'other', label: 'Something else' },
];

interface ReportSheetProps {
  targetType: 'listing' | 'user' | 'message';
  targetId: string;
  /** offer "Also block" when a person is behind the target */
  blockUserId?: string | null;
  label: string;
  onClose: (result: { reported: boolean; blocked: boolean }) => void;
}

export const ReportSheet: React.FC<ReportSheetProps> = ({ targetType, targetId, blockUserId, label, onClose }) => {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await findApi.report(targetType, targetId, reason, details.trim() || undefined);
      if (alsoBlock && blockUserId) await findApi.block(blockUserId);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the report.");
    } finally {
      setBusy(false);
    }
  };

  const close = () => onClose({ reported: done, blocked: done && alsoBlock && Boolean(blockUserId) });

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-[#2C2724]/60 backdrop-blur-xs" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Report ${label}`}
        data-testid="report-sheet"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724] rounded-t-3xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-warm space-y-3"
      >
        <div className="flex items-center justify-between border-b border-[#2C2724]/15 pb-3">
          <h3 className="font-extrabold text-sm flex items-center gap-2">
            <Flag className="w-4 h-4 text-[#D06C4E]" /> Report {label}
          </h3>
          <button type="button" onClick={close} aria-label="Close" className="w-7 h-7 rounded-xl bg-white border border-[#2C2724]/25 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        {done ? (
          <div className="space-y-3">
            <p className="text-xs font-bold text-[#485B4A] p-3 rounded-xl bg-[#EBF0EC] border border-[#7A907C]/40">
              Thanks. Our team reviews every report{alsoBlock && blockUserId ? ', and you won’t hear from this person again' : ''}.
            </p>
            <button type="button" onClick={close} className="w-full py-2.5 rounded-xl bg-[#2C2724] text-[#F9F7F3] text-xs font-extrabold">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={reason === r.id}
                  onClick={() => setReason(r.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-bold ${
                    reason === r.id ? 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724]' : 'bg-white border-[#2C2724]/20 hover:bg-[#F2EFE9]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <textarea
              value={details}
              maxLength={1000}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Anything we should know (optional)"
              className="w-full min-h-[64px] bg-white border border-[#2C2724]/25 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#D06C4E]"
            />
            {blockUserId && (
              <label className="flex items-center gap-2 text-xs font-bold">
                <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="accent-[#D06C4E]" />
                Also block this person
              </label>
            )}
            {error && <p className="text-xs font-bold text-[#9A4A33]">{error}</p>}
            <button
              type="button"
              disabled={!reason || busy}
              onClick={() => void submit()}
              className="w-full py-2.5 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-xs font-extrabold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Send report
            </button>
          </>
        )}
      </div>
    </div>
  );
};
