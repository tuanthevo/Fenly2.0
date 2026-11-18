import React from 'react';
import { Home, Play, Compass, MessageCircle, Zap } from 'lucide-react';
import { FennMascot } from './FennMascot';

export type FennTab = 'listings' | 'explore' | 'ask_fenn' | 'my_den' | 'messages' | 'house_os' | 'home' | 'fill' | 'passport';

interface BottomNavBarProps {
  activeTab: FennTab;
  onSelectTab: (tab: FennTab) => void;
  denSavedCount?: number;
  unreadCount?: number;
  earsPerked?: boolean;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onSelectTab,
  unreadCount = 0,
  earsPerked = true,
}) => {
  return (
    <nav
      aria-label="Bottom Navigation"
      data-testid="bottom-nav-bar"
      className="z-40 w-full px-1.5 py-1.5 border-t border-[#2C2724]/15 bg-[#F9F7F3] text-[#2C2724] transition-colors flex items-center justify-around shrink-0 shadow-[0_-4px_16px_rgba(44,39,36,0.06)]"
    >
      {/* 1. Home (Renter & Landlord Hub) */}
      <button
        type="button"
        onClick={() => onSelectTab('home')}
        data-testid="nav-tab-home"
        aria-label="Home"
        className={`flex-1 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
          activeTab === 'home'
            ? 'text-[#D06C4E] font-extrabold'
            : 'text-[#2C2724]/65 hover:text-[#2C2724]'
        }`}
      >
        <div
          className={`w-8 h-6 rounded-xl flex items-center justify-center ${
            activeTab === 'home' ? 'bg-[#D06C4E]/15' : ''
          }`}
        >
          <Home className="w-4 h-4" />
        </div>
        <span className="text-[10px] tracking-tight">Home</span>
      </button>

      {/* 2. Feed (Watch) */}
      <button
        type="button"
        onClick={() => onSelectTab('listings')}
        data-testid="nav-tab-feed"
        className={`flex-1 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
          activeTab === 'listings'
            ? 'text-[#D06C4E] font-extrabold'
            : 'text-[#2C2724]/65 hover:text-[#2C2724]'
        }`}
      >
        <div
          className={`w-8 h-6 rounded-xl flex items-center justify-center ${
            activeTab === 'listings' ? 'bg-[#D06C4E]/15' : ''
          }`}
        >
          <Play className="w-4 h-4 fill-current" />
        </div>
        <span className="text-[10px] tracking-tight">Feed</span>
      </button>

      {/* 3. Scout (Map + Filters) */}
      <button
        type="button"
        onClick={() => onSelectTab('explore')}
        data-testid="nav-tab-scout"
        className={`flex-1 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
          activeTab === 'explore'
            ? 'text-[#D06C4E] font-extrabold'
            : 'text-[#2C2724]/65 hover:text-[#2C2724]'
        }`}
      >
        <div
          className={`w-8 h-6 rounded-xl flex items-center justify-center ${
            activeTab === 'explore' ? 'bg-[#D06C4E]/15' : ''
          }`}
        >
          <Compass className="w-4 h-4" />
        </div>
        <span className="text-[10px] tracking-tight">Scout</span>
      </button>

      {/* 4. Ask Fenn (AI Search) */}
      <button
        type="button"
        onClick={() => onSelectTab('ask_fenn')}
        data-testid="nav-tab-ask-fenn"
        className={`flex-1 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
          activeTab === 'ask_fenn'
            ? 'text-[#D06C4E] font-extrabold'
            : 'text-[#2C2724]/65 hover:text-[#2C2724]'
        }`}
      >
        <div
          className={`w-8 h-6 rounded-xl flex items-center justify-center ${
            activeTab === 'ask_fenn' ? 'bg-[#D06C4E]/15' : ''
          }`}
        >
          <FennMascot size="xs" variant="avatar" earsPerked={earsPerked || activeTab === 'ask_fenn'} />
        </div>
        <span className="text-[10px] tracking-tight">Ask Fenn</span>
      </button>

      {/* 5. House OS (Monthly Living Loop: AI Utility Splitter + Credit Boost) */}
      <button
        type="button"
        onClick={() => onSelectTab('house_os')}
        data-testid="nav-tab-house-os"
        className={`flex-1 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
          activeTab === 'house_os'
            ? 'text-[#D06C4E] font-extrabold'
            : 'text-[#2C2724]/65 hover:text-[#2C2724]'
        }`}
      >
        <div
          className={`w-8 h-6 rounded-xl flex items-center justify-center ${
            activeTab === 'house_os' ? 'bg-[#EBF0EC] text-[#7A907C]' : ''
          }`}
        >
          <Zap className="w-4 h-4" />
        </div>
        <span className="text-[10px] tracking-tight">House OS</span>
      </button>

      {/* 6. Messages */}
      <button
        type="button"
        onClick={() => onSelectTab('messages')}
        data-testid="nav-tab-messages"
        className={`relative flex-1 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
          activeTab === 'messages'
            ? 'text-[#D06C4E] font-extrabold'
            : 'text-[#2C2724]/65 hover:text-[#2C2724]'
        }`}
      >
        <div
          className={`relative w-8 h-6 rounded-xl flex items-center justify-center ${
            activeTab === 'messages' ? 'bg-[#D06C4E]/15' : ''
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#D06C4E] text-white text-[9px] font-black flex items-center justify-center shadow">
              {unreadCount}
            </span>
          )}
        </div>
        <span className="text-[10px] tracking-tight">Messages</span>
      </button>
    </nav>
  );
};

