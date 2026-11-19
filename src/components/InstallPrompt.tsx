/**
 * "Add to Home Screen" sheet, shown after a user publishes or applies
 * (src/pwa/installPrompt.ts decides when). Android/Chrome: the browser's own
 * prompt. iPhone: how to do it from the Share sheet.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Plus, Share, X } from 'lucide-react';
import {
  INSTALL_MOMENT_EVENT,
  detectPlatform,
  installHeadline,
  installPromptMode,
  type InstallMoment,
  type InstallPromptMode,
} from '../pwa/installPrompt';
import { trackEvent } from '../lib/analytics';

type DeferredPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const DISMISS_KEY = 'fenlyInstallDismissedAt';
const INSTALLED_KEY = 'fenlyInstalled';

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: we may ask again next time
  }
};

const isStandalone = () =>
  (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const InstallPrompt: React.FC = () => {
  const deferred = useRef<DeferredPrompt | null>(null);
  const [shown, setShown] = useState<{ mode: Exclude<InstallPromptMode, null>; moment: InstallMoment } | null>(null);

  useEffect(() => {
    const onBefore = (e: Event) => {
      e.preventDefault(); // keep it for the right moment
      deferred.current = e as DeferredPrompt;
    };
    const onInstalled = () => {
      write(INSTALLED_KEY, '1');
      setShown(null);
      trackEvent('pwa_installed');
    };
    const onMoment = (e: Event) => {
      const moment = (e as CustomEvent<InstallMoment>).detail;
      const dismissed = Number(read(DISMISS_KEY));
      const mode = installPromptMode({
        moment,
        standalone: isStandalone(),
        platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
        hasNativePrompt: Boolean(deferred.current),
        dismissedAt: Number.isFinite(dismissed) && dismissed > 0 ? dismissed : null,
        installed: read(INSTALLED_KEY) === '1',
        now: Date.now(),
      });
      if (!mode) return;
      // Let the success screen land first
      window.setTimeout(() => {
        setShown({ mode, moment });
        trackEvent('pwa_prompt_shown', { mode, moment });
      }, 1200);
    };
    window.addEventListener('beforeinstallprompt', onBefore);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener(INSTALL_MOMENT_EVENT, onMoment);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener(INSTALL_MOMENT_EVENT, onMoment);
    };
  }, []);

  if (!shown) return null;

  const dismiss = () => {
    write(DISMISS_KEY, String(Date.now()));
    trackEvent('pwa_prompt_dismissed', { mode: shown.mode });
    setShown(null);
  };

  const install = async () => {
    const prompt = deferred.current;
    if (!prompt) return dismiss();
    deferred.current = null;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    if (choice.outcome === 'accepted') write(INSTALLED_KEY, '1');
    else write(DISMISS_KEY, String(Date.now()));
    setShown(null);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="install-title"
        data-testid="install-prompt"
        className="pointer-events-auto w-full max-w-sm bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724] rounded-2xl p-4 shadow-warm space-y-3 animate-fadeIn"
      >
        <div className="flex items-start gap-3">
          <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 id="install-title" className="text-sm font-extrabold">Add Fenn to your home screen</h3>
            <p className="text-xs text-[#6E655F] mt-0.5 leading-relaxed">{installHeadline(shown.moment)}</p>
          </div>
          <button type="button" onClick={dismiss} aria-label="Not now" className="w-10 h-10 -mr-2 -mt-2 rounded-xl flex items-center justify-center hover:bg-[#F2EFE9] shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        {shown.mode === 'native' ? (
          <div className="flex gap-2">
            <button type="button" onClick={dismiss} className="flex-1 min-h-11 rounded-xl bg-white border border-[#2C2724]/25 text-xs font-bold">
              Not now
            </button>
            <button type="button" onClick={() => void install()} className="flex-1 min-h-11 rounded-xl bg-[#B85B3F] hover:bg-[#A9513A] text-white text-xs font-extrabold flex items-center justify-center gap-1.5">
              <Plus className="w-4 h-4" /> Add to Home Screen
            </button>
          </div>
        ) : (
          <ol className="text-xs font-semibold space-y-1.5 bg-white rounded-xl border border-[#2C2724]/15 p-3">
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#2C2724] text-white text-[10px] font-black flex items-center justify-center shrink-0">1</span>
              Tap <Share className="w-4 h-4 inline text-[#2C2724]" aria-label="Share" /> in Safari's toolbar
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#2C2724] text-white text-[10px] font-black flex items-center justify-center shrink-0">2</span>
              Choose <strong>Add to Home Screen</strong>
            </li>
          </ol>
        )}
      </div>
    </div>
  );
};
