/**
 * Passport tab (Fenly 2.0). Signed out: what a Passport is + sign in.
 * Signed in: profile basics, Level 0-3 badges and the application profile
 * (move-in date, length of stay, budget, lifestyle answers), saved through row-level security.
 *
 * Lifestyle questions are logistics and habits only, never protected traits.
 */
import React, { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Phone, IdCard, Receipt, Loader2, LogOut, ShieldCheck, Check, Camera, Circle, Mail, ShieldAlert, BarChart3 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useFlag } from '../config/FlagsProvider';
import { LIFESTYLE_QUESTIONS, cleanLifestyle } from '../find/lifestyle';
import { LEVEL1_ITEM_TEXT, level1Missing } from '../find/passportLevel';
import { blobToBase64, findApi, shrinkImage } from '../lib/findApi';
import { uploadToStorage } from '../lib/fillApi';
import { TAB_VALUE } from '../config/launchCopy';
import { LEASE_TERMS } from '../fill/leaseTerms';

type PassportRow = {
  level: number;
  move_in_from: string | null;
  move_in_to: string | null;
  stay_length: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  lifestyle: Record<string, string>;
  phone_verified: boolean;
  id_verified: boolean;
  rent_history_verified: boolean;
};

export { LIFESTYLE_QUESTIONS };

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
  /** Fenly staff only (FENLY_ADMIN_EMAILS) */
  onOpenReview?: () => void;
  onOpenMetrics?: () => void;
}

const PHOTO_PATH = (uid: string) => `${uid}/photo.jpg`;

export const PassportView: React.FC<PassportViewProps> = ({ onRequestSignIn, onOpenReview, onOpenMetrics }) => {
  const { ready, configured, user, supabase, signOut } = useAuth();
  const idCheckOn = useFlag('id_check');
  const [bio, setBio] = useState('');
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [idRequests, setIdRequests] = useState<{ applicationId: string; area: string | null }[]>([]);
  const [idBusy, setIdBusy] = useState(false);
  const [idMessage, setIdMessage] = useState<string | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  const photoInput = useRef<HTMLInputElement>(null);
  const idInput = useRef<HTMLInputElement>(null);
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
      supabase.from('users').select('display_name, bio, photo_url, notify_email').eq('id', user.id).maybeSingle(),
      supabase
        .from('passports')
        .select(
          'level, move_in_from, move_in_to, stay_length, budget_min_cents, budget_max_cents, lifestyle, phone_verified, id_verified, rent_history_verified'
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
      setBio(profile.data?.bio ?? '');
      setPhotoPath(profile.data?.photo_url ?? null);
      setNotifyEmail(profile.data?.notify_email !== false);
      const row = (pass.data as PassportRow | null) ?? null;
      if (row) row.lifestyle = cleanLifestyle(row.lifestyle) as Record<string, string>;
      setPassport(row);
      setBudgetMin(dollars(row?.budget_min_cents ?? null));
      setBudgetMax(dollars(row?.budget_max_cents ?? null));
    });
    return () => {
      alive = false;
    };
  }, [supabase, user]);

  // Profile photo: a path in the private bucket (signed for display) or a provider URL (Google).
  useEffect(() => {
    if (!supabase || !photoPath) {
      setPhotoUrl(null);
      return;
    }
    if (/^https?:/.test(photoPath)) {
      setPhotoUrl(photoPath);
      return;
    }
    supabase.storage
      .from('profile-photos')
      .createSignedUrl(photoPath, 3600)
      .then(({ data }) => setPhotoUrl(data?.signedUrl ? `${data.signedUrl}&v=${photoVersion}` : null));
  }, [supabase, photoPath, photoVersion]);

  // Admin access and hosts' ID-check requests
  useEffect(() => {
    if (!user) return;
    findApi.me().then((me) => setIsAdmin(me.isAdmin)).catch(() => setIsAdmin(false));
    findApi
      .idRequests()
      .then((r) => setIdRequests(r.requests))
      .catch(() => setIdRequests([]));
  }, [user]);

  const uploadPhoto = async (file: File) => {
    if (!supabase || !user) return;
    setPhotoBusy(true);
    setMessage(null);
    try {
      const blob = await shrinkImage(file, 800);
      const path = PHOTO_PATH(user.id);
      await uploadToStorage('profile-photos', path, blob, 'image/jpeg');
      const { error } = await supabase.from('users').update({ photo_url: path }).eq('id', user.id);
      if (error) throw new Error(error.message);
      setPhotoPath(path);
      setPhotoVersion((v) => v + 1);
      setMessage('Photo saved');
    } catch (e) {
      setMessage(e instanceof Error ? `Couldn't save the photo: ${e.message}` : "Couldn't save the photo.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const verifyId = async (file: File) => {
    setIdBusy(true);
    setIdMessage(null);
    try {
      const blob = await shrinkImage(file, 1600, 0.85);
      const result = await findApi.verifyId(await blobToBase64(blob), 'image/jpeg');
      setIdMessage(result.verified ? 'ID verified. Hosts now see the badge, never the document.' : result.message);
      if (result.verified) {
        setIdRequests([]);
        setPassport((p) => (p ? { ...p, id_verified: true } : p));
      }
    } catch (e) {
      setIdMessage(e instanceof Error ? e.message : "Couldn't check the ID.");
    } finally {
      setIdBusy(false);
    }
  };

  const toggleEmail = async () => {
    const next = !notifyEmail;
    setNotifyEmail(next);
    try {
      await findApi.settings(next);
    } catch {
      setNotifyEmail(!next);
    }
  };

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
          <p className="text-sm text-[#6E655F] leading-relaxed">{TAB_VALUE.passport.line}</p>
          {configured ? (
            <button
              type="button"
              onClick={onRequestSignIn}
              className="w-full py-2.5 rounded-xl bg-[#B85B3F] hover:bg-[#A9513A] text-white text-sm font-extrabold shadow-warm-sm active:scale-95 transition-all"
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
        .update({ display_name: name || null, first_name: name ? name.split(/\s+/)[0].slice(0, 40) : null, bio: bio.trim().slice(0, 500) || null })
        .eq('id', user.id),
      supabase
        .from('passports')
        .update({
          move_in_from: passport.move_in_from || null,
          // "Move in by" is replaced by length of stay; clear the old end date so
          // it can't conflict with a later move-in date.
          move_in_to: null,
          stay_length: passport.stay_length || null,
          budget_min_cents: cents(budgetMin),
          budget_max_cents: cents(budgetMax),
          lifestyle: passport.lifestyle ?? {},
        })
        .eq('user_id', user.id),
    ]);
    setSaving(false);
    const error = profileResult.error ?? passportResult.error;
    setMessage(error ? `Couldn't save: ${error.message}` : 'Saved');
    if (!error) {
      const { data } = await supabase.from('passports').select('level').eq('user_id', user.id).maybeSingle();
      if (data) setPassport((p) => (p ? { ...p, level: data.level } : p));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F9F7F3]" data-testid="passport-signed-in">
      <div className={cardClass + ' flex items-center gap-3'}>
        <button
          type="button"
          onClick={() => photoInput.current?.click()}
          aria-label="Change photo"
          className="relative w-12 h-12 rounded-full bg-[#D06C4E]/15 text-[#A9513A] border-2 border-[#7A907C] flex items-center justify-center font-black text-lg shrink-0 overflow-hidden"
        >
          {photoUrl ? <img src={photoUrl} alt="" className="w-full h-full object-cover" /> : (displayName || user.email || user.phone || '?').trim().charAt(0).toUpperCase()}
          <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-[#2C2724] text-white flex items-center justify-center">
            {photoBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
          </span>
        </button>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void uploadPhoto(file);
          }}
        />
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
          Sign in with your phone to get the phone badge. Hosts can ask shortlisted applicants for an ID check. They see a badge, never your document.
        </p>
      </div>

      {passport && (() => {
        const missing = level1Missing({
          phoneVerified: passport.phone_verified,
          photoUrl: photoPath,
          bio,
          moveInFrom: passport.move_in_from,
          budgetMaxCents: cents(budgetMax),
          lifestyle: passport.lifestyle,
          idVerified: passport.id_verified,
          rentHistoryVerified: passport.rent_history_verified,
        });
        if (missing.length === 0) return null;
        return (
          <div className={cardClass + ' space-y-1.5'} data-testid="passport-level1">
            <h3 className="text-xs font-extrabold text-[#2C2724]">Finish Level 1 ({6 - missing.length}/6)</h3>
            <p className="text-[10px] text-[#6E655F]">Hosts see Level 1 applicants first. Fill these in, then save below.</p>
            {(['phone', 'photo', 'bio', 'move_in', 'budget', 'lifestyle'] as const).map((item) => {
              const done = !missing.includes(item);
              return (
                <div key={item} className={`text-[11px] font-bold flex items-center gap-1.5 ${done ? 'text-[#485B4A]' : 'text-[#2C2724]'}`}>
                  {done ? <BadgeCheck className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5 text-[#6E655F]" />}
                  {LEVEL1_ITEM_TEXT[item]}
                </div>
              );
            })}
          </div>
        );
      })()}

      {idCheckOn && passport && !passport.id_verified && idRequests.length > 0 && (
        <div className={cardClass + ' space-y-2 border-[#D06C4E]/50'} data-testid="passport-verify-id">
          <h3 className="text-xs font-extrabold text-[#2C2724] flex items-center gap-1.5">
            <IdCard className="w-4 h-4 text-[#D06C4E]" /> Verify your ID
          </h3>
          <p className="text-[11px] text-[#6E655F] leading-relaxed">
            The host of the room in {idRequests[0].area ?? 'San Francisco'} shortlisted you and asked for an ID check. Take a clear photo of your
            driver&apos;s license, state ID or passport. We check it once and don&apos;t keep the photo; hosts only see a badge.
          </p>
          <p className="text-[10px] text-[#8A5A14] bg-[#FBF1DE] rounded-lg px-2 py-1">Early version: an automated document check, not yet a full identity verification.</p>
          <button
            type="button"
            disabled={idBusy}
            onClick={() => idInput.current?.click()}
            className="w-full py-2.5 rounded-xl bg-[#B85B3F] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {idBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />} Photo of my ID
          </button>
          <input
            ref={idInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void verifyId(file);
            }}
          />
          {idMessage && <p className="text-[11px] font-bold text-[#485B4A]">{idMessage}</p>}
        </div>
      )}
      {idMessage && (passport?.id_verified || idRequests.length === 0) && <p className="text-[11px] font-bold text-[#485B4A] px-1">{idMessage}</p>}

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
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-[#6E655F]">Short bio (what you do, your routine)</span>
            <textarea className={inputClass + ' min-h-[70px]'} value={bio} maxLength={500} onChange={(e) => setBio(e.target.value)} />
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
              <span className="text-[11px] font-bold text-[#6E655F]">Length of stay</span>
              <select
                className={inputClass}
                value={passport.stay_length ?? ''}
                onChange={(e) => setPassport({ ...passport, stay_length: e.target.value || null })}
              >
                <option value="">Choose</option>
                {LEASE_TERMS.map((term) => (
                  <option key={term} value={term}>{term}</option>
                ))}
              </select>
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
              className="px-4 py-2.5 rounded-xl bg-[#B85B3F] hover:bg-[#A9513A] disabled:opacity-60 text-white text-xs font-extrabold shadow-warm-sm active:scale-95 transition-all flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save Passport
            </button>
            {message && <span className="text-xs font-bold text-[#485B4A]">{message}</span>}
          </div>
        </div>
      )}

      <div className={cardClass + ' flex items-center gap-3'}>
        <Mail className="w-4 h-4 text-[#6E655F] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-extrabold">Email me</div>
          <div className="text-[10px] text-[#6E655F]">New applicants, decisions and move-out reminders</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={notifyEmail}
          aria-label="Email notifications"
          onClick={() => void toggleEmail()}
          className={`w-11 h-6 rounded-full p-0.5 transition-colors ${notifyEmail ? 'bg-[#7A907C]' : 'bg-[#2C2724]/20'}`}
        >
          <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${notifyEmail ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {isAdmin && onOpenReview && (
        <button
          type="button"
          onClick={onOpenReview}
          className="w-full py-2.5 rounded-xl bg-[#2C2724] text-[#F9F7F3] text-xs font-extrabold flex items-center justify-center gap-1.5"
          data-testid="open-review-queue"
        >
          <ShieldAlert className="w-3.5 h-3.5" /> Review queue
        </button>
      )}
      {isAdmin && onOpenMetrics && (
        <button
          type="button"
          onClick={onOpenMetrics}
          className="w-full min-h-11 rounded-xl bg-white border border-[#2C2724] text-xs font-extrabold flex items-center justify-center gap-1.5"
          data-testid="open-metrics"
        >
          <BarChart3 className="w-3.5 h-3.5" /> Metrics
        </button>
      )}

      <button
        type="button"
        onClick={() => void signOut()}
        className="w-full py-2.5 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/25 text-xs font-bold text-[#2C2724] flex items-center justify-center gap-1.5"
      >
        <LogOut className="w-3.5 h-3.5" /> Sign out
      </button>
      <p className="text-center text-[11px] text-[#6E655F]">
        <a href="/privacy.html" className="inline-flex items-center min-h-10 px-2 underline font-bold">Privacy</a>
        <span aria-hidden="true">·</span>
        <a href="/terms.html" className="inline-flex items-center min-h-10 px-2 underline font-bold">Terms</a>
      </p>
    </div>
  );
};
