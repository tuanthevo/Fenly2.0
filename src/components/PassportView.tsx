/**
 * Passport tab (Fenly 2.0). Signed out: what a Passport is + sign in.
 * Signed in: profile basics, Level 0-3 badges and the application profile
 * (move-in window, budget, lifestyle answers), saved through row-level security.
 *
 * Lifestyle questions are logistics and habits only, never protected traits.
 */
import React, { useEffect, useState } from 'react';
import { BadgeCheck, Phone, IdCard, Receipt, Loader2, LogOut, ShieldCheck, Check } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';

type PassportRow = {
  level: number;
  move_in_from: string | null;
  move_in_to: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  lifestyle: Record<string, string>;
  phone_verified: boolean;
  id_verified: boolean;
  rent_history_verified: boolean;
};

export const LIFESTYLE_QUESTIONS = [
  { key: 'schedule', label: 'Schedule', options: ['Early bird', 'Night owl', 'Varies'] },
  { key: 'social', label: 'At home I am', options: ['Quiet', 'Social', 'In between'] },
  { key: 'guests', label: 'Guests over', options: ['Rarely', 'Sometimes', 'Often'] },
  { key: 'tidiness', label: 'Shared spaces', options: ['Relaxed', 'Tidy', 'Very tidy'] },
  { key: 'wfh', label: 'Work from home', options: ['Never', 'Some days', 'Most days'] },
] as const;

const cardClass = 'p-4 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm';
const inputClass =
  'w-full bg-white border border-[#2C2724]/25 rounded-xl px-3 py-2 text-sm text-[#2C2724] focus:outline-none focus:border-[#D06C4E]';

const dollars = (cents: number | null) => (cents == null ? '' : String(Math.round(cents / 100)));
const cents = (value: string) => {
  const n = Number(value.replace(/[^\d]/g, ''));
  return value.trim() === '' || !Number.isFinite(n) ? null : n * 100;
};

interface PassportViewProps {
  onRequestSignIn: () => void;
}

export const PassportView: React.FC<PassportViewProps> = ({ onRequestSignIn }) => {
  const { ready, configured, user, supabase, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [passport, setPassport] = useState<PassportRow | null>(null);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');

  useEffect(() => {
    if (!supabase || !user) {
      setPassport(null);
      return;
    }
    let alive = true;
    setLoading(true);
    Promise.all([
      supabase.from('users').select('display_name').eq('id', user.id).maybeSingle(),
      supabase
        .from('passports')
        .select(
          'level, move_in_from, move_in_to, budget_min_cents, budget_max_cents, lifestyle, phone_verified, id_verified, rent_history_verified'
        )
        .eq('user_id', user.id)
        .maybeSingle(),
    ]).then(([profile, pass]) => {
      if (!alive) return;
      setLoading(false);
      if (profile.error || pass.error) {
        setMessage("Couldn't load your Passport. Has the database SQL been run?");
        return;
      }
      setDisplayName(profile.data?.display_name ?? '');
      const row = (pass.data as PassportRow | null) ?? null;
      setPassport(row);
      setBudgetMin(dollars(row?.budget_min_cents ?? null));
      setBudgetMax(dollars(row?.budget_max_cents ?? null));
    });
    return () => {
      alive = false;
    };
  }, [supabase, user]);

  if (!ready) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#6E655F]">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F9F7F3]" data-testid="passport-signed-out">
        <div className={cardClass + ' space-y-3'}>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h2 className="font-extrabold text-base text-[#2C2724]">Your Renter Passport</h2>
          </div>
          <p className="text-xs text-[#6E655F] leading-relaxed">
            One profile you take from move to move: verified phone and ID, rent history and housemate references. Apply
            to any room with one tap. Hosts see badges, never your documents.
          </p>
          {configured ? (
            <button
              type="button"
              onClick={onRequestSignIn}
              className="w-full py-2.5 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-sm font-extrabold shadow-warm-sm active:scale-95 transition-all"
            >
              Sign in to start your Passport
            </button>
          ) : (
            <p className="text-xs font-bold text-[#6E655F] p-3 rounded-xl bg-[#F2EFE9]">
              Sign-in isn't set up on this server yet.
            </p>
          )}
        </div>
      </div>
    );
  }

  const badges = [
    { key: 'phone', label: 'Phone verified', on: passport?.phone_verified, icon: Phone, level: 1 },
    { key: 'id', label: 'ID verified', on: passport?.id_verified, icon: IdCard, level: 2 },
    { key: 'rent', label: 'Rent history', on: passport?.rent_history_verified, icon: Receipt, level: 3 },
  ];

  const save = async () => {
    if (!supabase || !passport) return;
    setSaving(true);
    setMessage(null);
    const name = displayName.trim().slice(0, 80);
    const [profileResult, passportResult] = await Promise.all([
      supabase
        .from('users')
        .update({ display_name: name || null, first_name: name ? name.split(/\s+/)[0].slice(0, 40) : null })
        .eq('id', user.id),
      supabase
        .from('passports')
        .update({
          move_in_from: passport.move_in_from || null,
          move_in_to: passport.move_in_to || null,
          budget_min_cents: cents(budgetMin),
          budget_max_cents: cents(budgetMax),
          lifestyle: passport.lifestyle ?? {},
        })
        .eq('user_id', user.id),
    ]);
    setSaving(false);
    const error = profileResult.error ?? passportResult.error;
    setMessage(error ? `Couldn't save: ${error.message}` : 'Saved');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F9F7F3]" data-testid="passport-signed-in">
      <div className={cardClass + ' flex items-center gap-3'}>
        <div className="w-12 h-12 rounded-full bg-[#D06C4E]/15 text-[#D06C4E] border-2 border-[#7A907C] flex items-center justify-center font-black text-lg shrink-0">
          {(displayName || user.email || user.phone || '?').trim().charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-sm text-[#2C2724] truncate">{displayName || 'Your Passport'}</div>
          <div className="text-[11px] text-[#6E655F] truncate">{user.email ?? user.phone}</div>
        </div>
        <span className="text-[11px] bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40 px-2.5 py-0.5 rounded-full font-bold shrink-0">
          Level {passport?.level ?? 0}
        </span>
      </div>

      <div className={cardClass + ' space-y-2'}>
        <h3 className="text-xs font-extrabold text-[#2C2724]">Badges</h3>
        <div className="grid grid-cols-3 gap-2">
          {badges.map(({ key, label, on, icon: Icon }) => (
            <div
              key={key}
              className={`p-2 rounded-xl border text-center space-y-1 ${
                on ? 'bg-[#EBF0EC] border-[#7A907C]/40 text-[#485B4A]' : 'bg-[#F2EFE9] border-[#2C2724]/10 text-[#6E655F]'
              }`}
            >
              {on ? <BadgeCheck className="w-4 h-4 mx-auto" /> : <Icon className="w-4 h-4 mx-auto opacity-70" />}
              <div className="text-[10px] font-bold leading-tight">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[#6E655F]">
          Sign in with your phone to get the phone badge. ID checks come later, for finalists.
        </p>
      </div>

      {loading || !passport ? (
        <div className={cardClass + ' text-xs text-[#6E655F] flex items-center gap-2'}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? 'Loading your Passport…' : message ?? 'No Passport found yet.'}
        </div>
      ) : (
        <div className={cardClass + ' space-y-3'}>
          <h3 className="text-xs font-extrabold text-[#2C2724]">Application profile</h3>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-[#6E655F]">Name hosts see</span>
            <input className={inputClass} value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-[#6E655F]">Move in from</span>
              <input
                type="date"
                className={inputClass}
                value={passport.move_in_from ?? ''}
                onChange={(e) => setPassport({ ...passport, move_in_from: e.target.value || null })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-[#6E655F]">Move in by</span>
              <input
                type="date"
                className={inputClass}
                value={passport.move_in_to ?? ''}
                onChange={(e) => setPassport({ ...passport, move_in_to: e.target.value || null })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-[#6E655F]">Budget from ($/mo)</span>
              <input inputMode="numeric" className={inputClass} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-[#6E655F]">Budget up to ($/mo)</span>
              <input inputMode="numeric" className={inputClass} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
            </label>
          </div>
          {LIFESTYLE_QUESTIONS.map((question) => (
            <div key={question.key} className="space-y-1">
              <span className="text-[11px] font-bold text-[#6E655F]">{question.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {question.options.map((option) => {
                  const selected = passport.lifestyle?.[question.key] === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setPassport({
                          ...passport,
                          lifestyle: { ...(passport.lifestyle ?? {}), [question.key]: option },
                        })
                      }
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                        selected
                          ? 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724]'
                          : 'bg-white text-[#2C2724] border-[#2C2724]/25 hover:bg-[#F2EFE9]'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] disabled:opacity-60 text-white text-xs font-extrabold shadow-warm-sm active:scale-95 transition-all flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save Passport
            </button>
            {message && <span className="text-xs font-bold text-[#485B4A]">{message}</span>}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => void signOut()}
        className="w-full py-2.5 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/25 text-xs font-bold text-[#2C2724] flex items-center justify-center gap-1.5"
      >
        <LogOut className="w-3.5 h-3.5" /> Sign out
      </button>
    </div>
  );
};
