import React, { useEffect, useRef, useState } from 'react';
import { Menu, Home, Compass, Sparkles, Zap } from 'lucide-react';
import type { FennTab } from './BottomNavBar';
import { useFlags } from '../config/FlagsProvider';
import { visibleMenuFeatures, type MenuFeature } from '../config/featureFlags';
import { trackEvent } from '../lib/analytics';

const ICONS: Record<MenuFeature['tab'], React.FC<{ className?: string }>> = {
  home: Home,
  explore: Compass,
  ask_fenn: Sparkles,
  house_os: Zap,
};

/** Header menu for the 1.0 tabs. Renders nothing unless at least one of their flags is on. */
export const NavMenu: React.FC<{ activeTab: FennTab; onSelectTab: (tab: FennTab) => void }> = ({
  activeTab,
  onSelectTab,
}) => {
  const { flags } = useFlags();
  const items = visibleMenuFeatures(flags);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative pointer-events-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More features"
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="nav-menu-button"
        className="relative w-10 h-9 rounded-xl flex items-center justify-center transition-all shadow-warm-sm active:scale-95 bg-[#F9F7F3] hover:bg-white text-[#2C2724] border border-[#2C2724]"
      >
        <Menu className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="menu"
          data-testid="nav-menu"
          className="absolute left-0 top-11 min-w-[160px] p-1.5 rounded-2xl bg-[#F9F7F3] border border-[#2C2724] shadow-warm space-y-0.5"
        >
          {items.map((item) => {
            const Icon = ICONS[item.tab];
            const active = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  trackEvent('menu_feature_opened', { tab: item.tab });
                  onSelectTab(item.tab);
                }}
                className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
                  active ? 'bg-[#D06C4E]/15 text-[#D06C4E]' : 'text-[#2C2724] hover:bg-[#F2EFE9]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
