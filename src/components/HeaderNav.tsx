import React from 'react';
import { Play, Home } from 'lucide-react';
import { FennTab } from './BottomNavBar';

interface HeaderNavProps {
  activeTab: FennTab;
  onSelectTab: (tab: FennTab) => void;
  onOpenMessages?: () => void;
  onOpenStickerSheet?: () => void;
  unreadCount?: number;
  pinnedCount?: number;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  return (
    <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 sm:px-3.5 py-2.5 bg-gradient-to-b from-[#2C2724]/75 to-transparent pointer-events-none h-14">
      {/* Centered Navigation: Home (Renter/Landlord) & Play (Feed) separated with a rectangle each */}
      <nav
        aria-label="Primary navigation"
        className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2.5 pointer-events-auto"
      >
        <button
          type="button"
          onClick={() => onSelectTab('home')}
          aria-label="Home"
          title="Renter & Landlord Hub"
          className={`w-11 h-9 rounded-xl border transition-all duration-200 flex items-center justify-center shadow-sm active:scale-95 ${
            activeTab === 'home'
              ? 'bg-[#D06C4E] text-white border-[#D06C4E]'
              : 'bg-[#F9F7F3] hover:bg-white text-[#2C2724] border-[#2C2724]/30'
          }`}
        >
          <Home className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('listings')}
          aria-label="Listings"
          title="Video Feed"
          className={`w-11 h-9 rounded-xl border transition-all duration-200 flex items-center justify-center shadow-sm active:scale-95 ${
            activeTab === 'listings'
              ? 'bg-[#D06C4E] text-white border-[#D06C4E]'
              : 'bg-[#F9F7F3] hover:bg-white text-[#2C2724] border-[#2C2724]/30'
          }`}
        >
          <Play className="w-4 h-4 fill-current" />
        </button>
      </nav>
    </header>
  );
};

