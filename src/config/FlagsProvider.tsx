import React, { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_FLAGS, type FeatureFlag, type FeatureFlags } from './featureFlags';
import { loadAppConfig } from '../lib/appConfig';

type FlagsState = {
  flags: FeatureFlags;
  /** True once /api/config answered (or failed). Before that every flag reads as off. */
  loaded: boolean;
  /** Whether the server has Supabase configured (sign-in available). */
  supabaseConfigured: boolean;
};

const FlagsContext = createContext<FlagsState>({ flags: { ...DEFAULT_FLAGS }, loaded: false, supabaseConfigured: false });

export const FlagsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<FlagsState>({ flags: { ...DEFAULT_FLAGS }, loaded: false, supabaseConfigured: false });
  useEffect(() => {
    let alive = true;
    loadAppConfig().then((config) => {
      if (alive) setState({ flags: config.flags, loaded: true, supabaseConfigured: Boolean(config.supabase) });
    });
    return () => {
      alive = false;
    };
  }, []);
  return <FlagsContext.Provider value={state}>{children}</FlagsContext.Provider>;
};

export function useFlags(): FlagsState {
  return useContext(FlagsContext);
}

export function useFlag(flag: FeatureFlag): boolean {
  return useContext(FlagsContext).flags[flag] === true;
}
