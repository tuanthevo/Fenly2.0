/**
 * Review queue for Fenly staff (FENLY_ADMIN_EMAILS): AI, heuristic and user
 * flags on listings, profiles and messages. Clear (nothing wrong) or Hide.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, EyeOff, Loader2, ShieldAlert } from 'lucide-react';
import { findApi, type QueueFlag } from '../../lib/findApi';

const SEVERITY: Record<string, string> = {
  high: 'bg-[#B85B3F] text-white',
  medium: 'bg-[#FBF1DE] text-[#8A5A14]',
  low: 'bg-[#F2EFE9] text-[#6E655F]',
};

export const ReviewQueue: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [flags, setFlags] = useState<QueueFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setFlags((await findApi.queue()).flags);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the queue.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (flag: QueueFlag, action: 'clear' | 'hide') => {
    setBusy(flag.id);
    try {
      await findApi.resolveFlag(flag.id, action);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F9F7F3] text-[#2C2724] p-3.5 space-y-3" data-testid="review-queue">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Back" className="w-10 h-10 rounded-xl bg-white border border-[#2C2724] flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
        <h1 className="font-extrabold text-base flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-[#D06C4E]" aria-hidden="true" /> Review queue</h1>
      </div>
      {error && <p className="text-xs font-bold text-[#9A4A33]">{error}</p>}
      {flags === null && !error ? (
        <div className="flex justify-center py-8 text-[#6E655F]"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : flags?.length === 0 ? (
        <p className="text-xs text-[#6E655F]">Nothing to review.</p>
      ) : (
        flags?.map((f) => (
          <div key={f.id} className="p-3 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap text-xs font-extrabold">
              <span className={`px-2 py-0.5 rounded-full ${SEVERITY[f.severity]}`}>{f.severity}</span>
              <span className="px-2 py-0.5 rounded-full bg-[#F2EFE9]">{f.category.replace('_', ' ')}</span>
              <span className="px-2 py-0.5 rounded-full bg-[#F2EFE9]">{f.targetType}</span>
              <span className="text-[#6E655F]">{f.source} · {new Date(f.createdAt).toLocaleString()}</span>
              {f.target?.hidden && <span className="px-2 py-0.5 rounded-full bg-[#2C2724] text-white">hidden</span>}
            </div>
            {f.reason && <p className="text-xs font-bold">{f.reason}</p>}
            {f.target ? (
              <div className="text-xs bg-[#F9F7F3] rounded-xl p-2.5 border border-[#2C2724]/10">
                <div className="font-extrabold">{f.target.title}</div>
                <div className="text-xs text-[#6E655F]">{f.target.sub}</div>
                <p className="mt-1 whitespace-pre-wrap break-words">{f.target.text}</p>
              </div>
            ) : (
              <p className="text-xs text-[#6E655F]">The item was deleted.</p>
            )}
            <div className="flex gap-2">
              <button type="button" disabled={busy === f.id} onClick={() => void resolve(f, 'clear')} className="flex-1 py-2 rounded-xl bg-white border border-[#2C2724]/25 text-xs font-bold flex items-center justify-center gap-1">
                <Check className="w-3.5 h-3.5" /> Looks fine
              </button>
              {f.targetType !== 'user' && (
                <button type="button" disabled={busy === f.id} onClick={() => void resolve(f, 'hide')} className="flex-1 py-2 rounded-xl bg-[#2C2724] text-[#F9F7F3] text-xs font-extrabold flex items-center justify-center gap-1">
                  <EyeOff className="w-3.5 h-3.5" /> Hide {f.targetType}
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
