import React from 'react';
import { Play, DoorOpen, MessageCircle, BadgeCheck } from 'lucide-react';
import type { FennTab } from './BottomNavBar';

/**
 * Fenly 2.0 bottom navigation: Find, Fill, Inbox, Passport.
 * Same look as the 1.0 BottomNavBar (kept in place, unused); old tabs live in the
 * header menu behind feature flags.
 */
interface FenlyNavBarProps {
  activeTab: FennTab;
  onSelectTab: (tab: FennTab) => void;
  unreadCount?: number;
}

const TABS: { tab: FennTab; label: string; testId: string; icon: React.FC<{ className?: string }> }[] = [
  { tab: 'listings', label: 'Find', testId: 'nav-tab-find', icon: ({ className }) => <Play className={`${className} fill-current`} /> },
  { tab: 'fill', label: 'Fill', testId: 'nav-tab-fill', icon: DoorOpen },
  { tab: 'messages', label: 'Inbox', testId: 'nav-tab-inbox', icon: MessageCircle },
  { tab: 'passport', label: 'Passport', testId: 'nav-tab-passport', icon: BadgeCheck },
];

export const FenlyNavBar: React.FC<FenlyNavBarProps> = ({ activeTab, onSelectTab, unreadCount = 0 }) => (
  <nav
    aria-label="Bottom Navigation"
    data-testid="bottom-nav-bar"
    className="z-40 w-full px-1.5 py-1.5 border-t border-[#2C2724]/15 bg-[#F9F7F3] text-[#2C2724] transition-colors flex items-center justify-around shrink-0 shadow-[0_-4px_16px_rgba(44,39,36,0.06)]"
  >
    {TABS.map(({ tab, label, testId, icon: Icon }) => {
      const active = activeTab === tab;
      return (
        <button
          key={tab}
          type="button"
          onClick={() => onSelectTab(tab)}
          data-testid={testId}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          className={`relative flex-1 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
            active ? 'text-[#A9513A] font-extrabold' : 'text-[#2C2724]/65 hover:text-[#2C2724]'
          }`}
        >
          <div
            className={`relative w-8 h-6 rounded-xl flex items-center justify-center ${active ? 'bg-[#D06C4E]/15' : ''}`}
          >
            <Icon className="w-4 h-4" />
            {tab === 'messages' && unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#B85B3F] text-white text-[9px] font-black flex items-center justify-center shadow">
                {unreadCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight">{label}</span>
        </button>
      );
    })}
  </nav>
);
