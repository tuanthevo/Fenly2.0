import React, { useEffect, useState } from 'react';
import { Mail, Phone, X, ShieldCheck, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';

export type SignInReason = 'apply' | 'publish' | 'passport' | 'message' | 'house' | 'report';

const REASON_TEXT: Record<SignInReason, string> = {
  apply: 'Sign in to apply. Your Passport fills in the application for you.',
  publish: 'Sign in to list your room. Your listing and applicants stay under your account.',
  passport: 'Sign in to build your Renter Passport.',
  message: 'Sign in to see your messages.',
  house: 'Sign in to join your house and review applicants with the host.',
  report: 'Sign in to send a report. We review every one.',
};

interface SignInSheetProps {
  isOpen: boolean;
  reason: SignInReason;
  onClose: () => void;
}

type Step = { kind: 'choose' } | { kind: 'emailSent'; email: string } | { kind: 'phoneCode'; phone: string };

const inputClass =
  'flex-1 min-w-0 bg-white border border-[#2C2724]/25 rounded-xl px-3 py-2.5 text-sm text-[#2C2724] placeholder:text-[#6E655F]/70 focus:outline-none focus:border-[#D06C4E]';
const primaryButton =
  'px-3.5 py-2.5 bg-[#B85B3F] hover:bg-[#A9513A] disabled:opacity-60 text-white rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 shrink-0 shadow-warm-sm active:scale-95';

export const SignInSheet: React.FC<SignInSheetProps> = ({ isOpen, reason, onClose }) => {
  const { configured, user, signInWithEmail, signInWithGoogle, sendPhoneCode, verifyPhoneCode } = useAuth();
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | 'phone' | 'code' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset when reopened; close once signed in (phone code or a session from another tab).
  useEffect(() => {
    if (isOpen) {
      setStep({ kind: 'choose' });
      setError(null);
      setCode('');
    }
  }, [isOpen]);
  useEffect(() => {
    if (isOpen && user) onClose();
  }, [isOpen, user, onClose]);

  if (!isOpen) return null;

  const run = async (which: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(which);
    setError(null);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-[#2C2724]/60 backdrop-blur-xs animate-fadeIn font-['Plus_Jakarta_Sans','Inter',sans-serif]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-in-title"
        data-testid="sign-in-sheet"
        className="w-full max-w-sm bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724] rounded-t-3xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-warm space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#2C2724]/15 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
            <h3 id="sign-in-title" className="font-extrabold text-sm text-[#2C2724]">
              Sign in to Fenn
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign-in"
            className="w-10 h-10 rounded-xl bg-white hover:bg-[#F2EFE9] text-[#2C2724] border border-[#2C2724]/25 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[#6E655F] leading-relaxed">{REASON_TEXT[reason]}</p>

        {!configured ? (
          <div className="p-3 rounded-xl bg-white border border-[#2C2724]/20 text-xs text-[#6E655F]">
            Sign-in isn't set up on this server yet. You can keep browsing rooms.
          </div>
        ) : step.kind === 'emailSent' ? (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#EBF0EC] border border-[#7A907C]/40 text-xs text-[#485B4A] leading-relaxed">
              Check <span className="font-extrabold">{step.email}</span>. Tap the link in the email on this phone to finish
              signing in.
            </div>
            <button
              type="button"
              onClick={() => setStep({ kind: 'choose' })}
              className="text-xs font-bold text-[#6E655F] hover:text-[#2C2724] flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Use another way
            </button>
          </div>
        ) : step.kind === 'phoneCode' ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run('code', async () => {
                const result = await verifyPhoneCode(step.phone, code);
                if (!result.ok) setError(result.error);
              });
            }}
          >
            <label className="text-xs font-bold text-[#2C2724] block" htmlFor="sign-in-code">
              Enter the 6-digit code sent to {step.phone}
            </label>
            <div className="flex gap-2">
              <input
                id="sign-in-code"
                className={inputClass}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
              />
              <button type="submit" disabled={busy !== null} className={primaryButton}>
                {busy === 'code' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setStep({ kind: 'choose' })}
              className="text-xs font-bold text-[#6E655F] hover:text-[#2C2724] flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run('google', async () => {
                  const result = await signInWithGoogle();
                  if (!result.ok) setError(result.error);
                })
              }
              className="w-full py-2.5 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-sm font-extrabold text-[#2C2724] flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
            >
              {busy === 'google' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span aria-hidden className="font-black text-[#D06C4E]">G</span>
              )}
              Continue with Google
            </button>

            <form
              className="space-y-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void run('email', async () => {
                  const result = await signInWithEmail(email);
                  if (result.ok) setStep({ kind: 'emailSent', email: email.trim() });
                  else setError(result.error);
                });
              }}
            >
              <label htmlFor="sign-in-email" className="text-xs font-bold text-[#6E655F] flex items-center gap-1">
                <Mail className="w-3 h-3" /> Email me a sign-in link
              </label>
              <div className="flex gap-2">
                <input
                  id="sign-in-email"
                  type="email"
                  autoComplete="email"
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <button type="submit" disabled={busy !== null} className={primaryButton}>
                  {busy === 'email' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Send link'}
                </button>
              </div>
            </form>

            <form
              className="space-y-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void run('phone', async () => {
                  const result = await sendPhoneCode(phone);
                  if (result.ok && result.phone) setStep({ kind: 'phoneCode', phone: result.phone });
                  else if (!result.ok) setError(result.error);
                });
              }}
            >
              <label htmlFor="sign-in-phone" className="text-xs font-bold text-[#6E655F] flex items-center gap-1">
                <Phone className="w-3 h-3" /> Text me a code
              </label>
              <div className="flex gap-2">
                <input
                  id="sign-in-phone"
                  type="tel"
                  autoComplete="tel"
                  className={inputClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(415) 555-0100"
                />
                <button type="submit" disabled={busy !== null} className={primaryButton}>
                  {busy === 'phone' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Send code'}
                </button>
              </div>
            </form>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs font-bold text-[#9A4A33]">
            {error}
          </p>
        )}
        <p className="text-xs text-[#6E655F] leading-relaxed">
          We only show badges to hosts (phone verified, ID verified). Your documents stay private. By continuing you agree to the{' '}
          <a href="/terms.html" target="_blank" rel="noopener" className="underline font-bold text-[#6E655F]">Terms</a> and{' '}
          <a href="/privacy.html" target="_blank" rel="noopener" className="underline font-bold text-[#6E655F]">Privacy policy</a>.
        </p>
      </div>
    </div>
  );
};
