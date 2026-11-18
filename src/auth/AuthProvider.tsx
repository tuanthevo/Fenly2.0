/**
 * Supabase Auth for the browser: email magic link, Google, and phone codes.
 *
 * When the server has no Supabase config, `configured` is false and every
 * method resolves with an explanation; the app keeps running as the demo.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import { trackEvent } from '../lib/analytics';
import { friendlyAuthError, isPlausibleEmail, normalizePhone, safeRedirectPath } from '../utils/authGuards';

export type AuthResult = { ok: true } | { ok: false; error: string };

type AuthState = {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  user: User | null;
  supabase: SupabaseClient | null;
  signInWithEmail: (email: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  sendPhoneCode: (phone: string) => Promise<AuthResult & { phone?: string }>;
  verifyPhoneCode: (phone: string, code: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
};

const NOT_CONFIGURED: AuthResult = { ok: false, error: "Sign-in isn't set up on this server yet." };

const AuthContext = createContext<AuthState | null>(null);

/** Come back to the same screen after the email link or Google. */
function returnUrl(): string {
  const path = safeRedirectPath(window.location.pathname + window.location.search);
  return window.location.origin + path;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    getSupabase().then(async (client) => {
      if (!alive) return;
      setSupabase(client);
      if (client) {
        const { data } = await client.auth.getSession();
        if (!alive) return;
        setSession(data.session);
        const { data: listener } = client.auth.onAuthStateChange((event, next) => {
          setSession(next);
          if (event === 'SIGNED_IN') trackEvent('signed_in', { method: next?.user.app_metadata?.provider ?? 'unknown' });
        });
        unsubscribe = () => listener.subscription.unsubscribe();
      }
      setReady(true);
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  const signInWithEmail = useCallback(
    async (email: string): Promise<AuthResult> => {
      if (!supabase) return NOT_CONFIGURED;
      if (!isPlausibleEmail(email)) return { ok: false, error: 'Check the email address.' };
      trackEvent('sign_in_started', { method: 'email' });
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: returnUrl(), shouldCreateUser: true },
      });
      return error ? { ok: false, error: friendlyAuthError(error.message, 'email') } : { ok: true };
    },
    [supabase]
  );

  const signInWithGoogle = useCallback(async (): Promise<AuthResult> => {
    if (!supabase) return NOT_CONFIGURED;
    trackEvent('sign_in_started', { method: 'google' });
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl() } });
    return error ? { ok: false, error: friendlyAuthError(error.message, 'google') } : { ok: true };
  }, [supabase]);

  const sendPhoneCode = useCallback(
    async (input: string) => {
      if (!supabase) return NOT_CONFIGURED;
      const phone = normalizePhone(input);
      if (!phone) return { ok: false as const, error: 'Check the phone number (include the area code).' };
      trackEvent('sign_in_started', { method: 'phone' });
      const { error } = await supabase.auth.signInWithOtp({ phone });
      return error ? { ok: false as const, error: friendlyAuthError(error.message, 'phone') } : { ok: true as const, phone };
    },
    [supabase]
  );

  const verifyPhoneCode = useCallback(
    async (phone: string, code: string): Promise<AuthResult> => {
      if (!supabase) return NOT_CONFIGURED;
      const token = code.replace(/\D/g, '');
      if (token.length < 6) return { ok: false, error: 'Enter the 6-digit code.' };
      const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
      return error ? { ok: false, error: friendlyAuthError(error.message, 'phone') } : { ok: true };
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, [supabase]);

  const getAccessToken = useCallback(async () => {
    if (!supabase) return null;
    return (await supabase.auth.getSession()).data.session?.access_token ?? null;
  }, [supabase]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      configured: Boolean(supabase),
      session,
      user: session?.user ?? null,
      supabase,
      signInWithEmail,
      signInWithGoogle,
      sendPhoneCode,
      verifyPhoneCode,
      signOut,
      getAccessToken,
    }),
    [ready, supabase, session, signInWithEmail, signInWithGoogle, sendPhoneCode, verifyPhoneCode, signOut, getAccessToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
