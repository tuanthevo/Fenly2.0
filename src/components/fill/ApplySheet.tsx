/**
 * Apply from a shared listing link (/r/<code> → /?apply=<id>&via=<code>).
 * Loads the published listing (anyone may read it), asks to sign in if needed,
 * prefills the move-in date from the Passport and sends the application with
 * the channel it came through.
 */
import React, { useEffect, useState } from 'react';
import { BadgeCheck, CheckCircle2, ChevronRight, Loader2, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { fillApi, ApiError, storageVideoType, uploadToStorage } from '../../lib/fillApi';
import { level1Missing, passportLevel } from '../../find/passportLevel';
import { IntroVideoPicker } from '../find/IntroVideoPicker';
import { announceInstallMoment } from '../../pwa/installPrompt';
import { formatMoveIn, formatRentCents } from '../../fill/publicListing';
import { todayIn } from '../../fill/fillStatus';

type PublicListing = {
  id: string;
  status: string;
  title: string | null;
  neighborhood: string | null;
  city: string;
  rent_cents: number | null;
  available_from: string | null;
};

interface ApplySheetProps {
  listingId: string;
  via: string | null;
  onClose: (applied: boolean) => void;
  onRequestSignIn: () => void;
  /** opens the Passport tab to finish Level 1 */
  onOpenPassport?: () => void;
}

type PassportPreview = { level: number; missing: number; phone: boolean; id: boolean; budgetMax: number | null };

export const ApplySheet: React.FC<ApplySheetProps> = ({ listingId, via, onClose, onRequestSignIn, onOpenPassport }) => {
  const { ready, configured, user, supabase } = useAuth();
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moveIn, setMoveIn] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [intro, setIntro] = useState<Blob | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [preview, setPreview] = useState<PassportPreview | null>(null);
  const today = todayIn(new Date());

  useEffect(() => {
    if (!ready) return;
    if (!supabase) {
      setLoadError("Applying isn't set up on this server yet.");
      return;
    }
    let alive = true;
    supabase
      .from('listings')
      .select('id, status, title, neighborhood, city, rent_cents, available_from')
      .eq('id', listingId)
      .in('status', ['published', 'filled'])
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e || !data) setLoadError('This listing is no longer available.');
        else {
          setListing(data as PublicListing);
          setMoveIn((current) => current || (data.available_from as string | null) || '');
        }
      });
    return () => {
      alive = false;
    };
  }, [ready, supabase, listingId]);

  // Prefill the move-in date from the Passport once signed in, and show what the host will see
  useEffect(() => {
    if (!supabase || !user) return;
    Promise.all([
      supabase
        .from('passports')
        .select('move_in_from, budget_max_cents, lifestyle, phone_verified, id_verified, rent_history_verified')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('users').select('photo_url, bio').eq('id', user.id).maybeSingle(),
    ]).then(([{ data }, { data: profile }]) => {
      if (!data) return;
      if (data.move_in_from) setMoveIn(data.move_in_from as string);
      const facts = {
        phoneVerified: data.phone_verified === true,
        photoUrl: profile?.photo_url ?? null,
        bio: profile?.bio ?? null,
        moveInFrom: data.move_in_from,
        budgetMaxCents: data.budget_max_cents,
        lifestyle: data.lifestyle,
        idVerified: data.id_verified === true,
        rentHistoryVerified: data.rent_history_verified === true,
      };
      setPreview({
        level: passportLevel(facts),
        missing: level1Missing(facts).length,
        phone: facts.phoneVerified,
        id: facts.idVerified,
        budgetMax: data.budget_max_cents,
      });
    });
  }, [supabase, user]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let introVideoPath: string | undefined;
      if (intro && user) {
        const { contentType, ext } = storageVideoType(intro);
        const id = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, '0')).join('');
        introVideoPath = `${user.id}/${id}.${ext}`;
        setUploadPct(0);
        await uploadToStorage('applicant-intros', introVideoPath, intro, contentType, (f) => setUploadPct(Math.round(f * 100)));
      }
      await fillApi.apply(listingId, { note: note.trim() || undefined, moveInDate: moveIn || null, via, introVideoPath });
      setDone(true);
      announceInstallMoment('applied');
    } catch (e) {
      if (e instanceof ApiError && e.body?.error === 'already_applied') setDone(true);
      else if (e instanceof ApiError && e.status === 403) setError(e.body?.message ?? "You can't apply to this room.");
      else setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
      setUploadPct(null);
    }
  };

  const rent = formatRentCents(listing?.rent_cents);
  const when = formatMoveIn(listing?.available_from, today);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#2C2724]/60 backdrop-blur-xs animate-fadeIn font-['Plus_Jakarta_Sans','Inter',sans-serif]"
      onClick={() => onClose(done)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Apply to this room"
        data-testid="apply-sheet"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm max-h-[92dvh] overflow-y-auto bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724] rounded-t-3xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-warm space-y-4"
      >
        <div className="flex items-center justify-between border-b border-[#2C2724]/15 pb-3">
          <h3 className="font-extrabold text-sm">Apply to this room</h3>
          <button
            type="button"
            onClick={() => onClose(done)}
            aria-label="Close"
            className="w-7 h-7 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/25 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loadError ? (
          <p className="text-xs font-bold text-[#9A4A33]">{loadError}</p>
        ) : !listing ? (
          <div className="flex justify-center py-6 text-[#6E655F]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            <div className="p-3 rounded-xl bg-white border border-[#2C2724]/20">
              <div className="text-sm font-extrabold">{listing.title || `Room in ${listing.neighborhood || listing.city}`}</div>
              <div className="text-xs text-[#6E655F] mt-0.5">
                {[rent ? `${rent}/mo` : null, when ? (when === 'now' ? 'Move in now' : `Move in ${when}`) : null, listing.neighborhood || listing.city]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>

            {listing.status === 'filled' ? (
              <p className="text-xs font-bold text-[#6E655F]">This room is taken. Browse similar rooms in Find.</p>
            ) : done ? (
              <div className="p-3 rounded-xl bg-[#EBF0EC] border border-[#7A907C]/40 text-xs font-bold text-[#485B4A] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>You applied. The host sees your Passport and will message you in Inbox.</span>
              </div>
            ) : !user ? (
              <div className="space-y-2">
                <p className="text-xs text-[#6E655F]">Sign in to apply. Your Passport fills in the application.</p>
                <button
                  type="button"
                  onClick={onRequestSignIn}
                  disabled={!configured}
                  className="w-full py-3 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-sm font-extrabold shadow-warm-sm disabled:opacity-50"
                >
                  Sign in to apply
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {preview && (
                  <div className="p-2.5 rounded-xl bg-white border border-[#2C2724]/15 space-y-1" data-testid="apply-passport-preview">
                    <div className="flex items-center gap-1.5 text-[11px] font-extrabold flex-wrap">
                      <span>Your Passport · Level {preview.level}</span>
                      {preview.phone && <span className="px-1.5 py-0.5 rounded-md bg-[#EBF0EC] text-[#485B4A] flex items-center gap-0.5"><BadgeCheck className="w-3 h-3" /> Phone</span>}
                      {preview.id && <span className="px-1.5 py-0.5 rounded-md bg-[#EBF0EC] text-[#485B4A] flex items-center gap-0.5"><BadgeCheck className="w-3 h-3" /> ID</span>}
                      {preview.budgetMax != null && <span className="text-[#6E655F] font-bold">Budget up to {formatRentCents(preview.budgetMax)}</span>}
                    </div>
                    {preview.missing > 0 && onOpenPassport && (
                      <button type="button" onClick={onOpenPassport} className="text-[11px] font-bold text-[#D06C4E] flex items-center gap-0.5">
                        Finish your Passport ({preview.missing} left): hosts see complete ones first <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
                <label className="block">
                  <span className="text-[11px] font-bold text-[#6E655F] block mb-1">When do you want to move in?</span>
                  <input
                    type="date"
                    min={today}
                    value={moveIn}
                    onChange={(e) => setMoveIn(e.target.value)}
                    className="w-full bg-white border border-[#2C2724]/25 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#D06C4E]"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold text-[#6E655F] block mb-1">A short note to the host (optional)</span>
                  <textarea
                    value={note}
                    maxLength={1000}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What you do, your schedule, why this room."
                    className="w-full min-h-[90px] bg-white border border-[#2C2724]/25 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#D06C4E]"
                  />
                </label>
                <IntroVideoPicker value={intro} onChange={setIntro} />
                {error && <p className="text-xs font-bold text-[#9A4A33]">{error}</p>}
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy}
                  data-testid="apply-submit"
                  className="w-full py-3 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-sm font-extrabold shadow-warm-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {uploadPct !== null ? `Uploading intro ${uploadPct}%` : 'Apply with my Passport'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
