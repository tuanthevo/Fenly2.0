/**
 * First-visit line on each 2.0 tab: what this tab does for you, in one line.
 * Dismissed per tab and remembered on this device.
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { TAB_VALUE, type ValueTab } from '../config/launchCopy';

const KEY = 'fenlyOnboarded';

function readSeen(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const OnboardingBanner: React.FC<{ tab: ValueTab }> = ({ tab }) => {
  const [seen, setSeen] = useState<string[]>(readSeen);
  if (seen.includes(tab)) return null;
  const dismiss = () => {
    const next = [...seen, tab];
    setSeen(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // private mode: shows again next visit
    }
  };
  const { title, line } = TAB_VALUE[tab];
  return (
    <div role="note" aria-label={`About ${title}`} data-testid={`onboarding-${tab}`} className="w-full shrink-0 flex items-center gap-2 pl-3.5 pr-1 py-1 bg-[#EBF0EC] border-b border-[#7A907C]/40 text-[#2C2724]">
      <p className="flex-1 text-xs font-semibold leading-snug">
        <span className="font-extrabold">{title}:</span> {line}
      </p>
      <button type="button" onClick={dismiss} aria-label={`Dismiss the ${title} tip`} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/60 shrink-0">
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
};
