import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  Calendar,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { RoomListing, FilterState } from '../types';
import { FennMascot } from './FennMascot';
import {
  getWrenCoWatcherCallouts,
  shouldTriggerWrenInstantPivot,
  parseWrenChatToFeedQuery,
} from '../utils/trustSafety';

interface WrenCoWatcherProps {
  room: RoomListing;
  rapidSwipeCount: number;
  onResetSwipeCount: () => void;
  onApplyChatToFeedFilters: (partial: Partial<FilterState>) => void;
  onBookTourViaWren: (room: RoomListing, promptLabel: string, wrenConfirmation: string) => void;
  onOpenFullWrenModal: () => void;
}

export const WrenCoWatcher: React.FC<WrenCoWatcherProps> = ({
  room,
  rapidSwipeCount,
  onResetSwipeCount,
  onApplyChatToFeedFilters,
  onBookTourViaWren,
  onOpenFullWrenModal,
}) => {
  const [calloutIndex, setCalloutIndex] = useState(0);
  const [isBubbleDismissed, setIsBubbleDismissed] = useState(false);
  const [isMiniDrawerOpen, setIsMiniDrawerOpen] = useState(false);
  const [wrenMood, setWrenMood] = useState<'idle' | 'thinking' | 'flutter'>('idle');
  const [customInput, setCustomInput] = useState('');
  const [drawerMessages, setDrawerMessages] = useState<
    { id: string; from: 'wren' | 'user'; text: string; badge?: string }[]
  >([]);

  const callouts = getWrenCoWatcherCallouts(room);
  const pivotCheck = shouldTriggerWrenInstantPivot(rapidSwipeCount);

  // Reset callout cycle when room changes
  useEffect(() => {
    setCalloutIndex(0);
    setIsBubbleDismissed(false);
    setWrenMood('thinking');
    const timer = setTimeout(() => setWrenMood('idle'), 1100);
    return () => clearTimeout(timer);
  }, [room.id]);

  // Cycle between Context-Aware Callout and Red-Flag Radar while watching the video
  useEffect(() => {
    if (isMiniDrawerOpen || pivotCheck.triggered) return;
    const interval = setInterval(() => {
      setCalloutIndex((prev) => (prev + 1) % callouts.length);
    }, 5500);
    return () => clearInterval(interval);
  }, [callouts.length, isMiniDrawerOpen, pivotCheck.triggered]);

  // Initialize Mini Drawer greeting for the current room
  useEffect(() => {
    setDrawerMessages([
      {
        id: `init-${room.id}`,
        from: 'wren',
        badge: 'Co-Watching Live',
        text: `Heads up, "${room.title}" is getting lots of eyes today. Want me to swoop in and grab a tour slot for you, or reshuffle your video feed?`,
      },
    ]);
  }, [room.id, room.title]);

  const activeCallout = callouts[calloutIndex] || callouts[0];

  const handleOneTapAction = (actionType: 'parking' | 'pet_deposit' | 'tuesday_tour') => {
    setWrenMood('thinking');

    if (actionType === 'parking') {
      const userText = 'Ask about parking cost';
      const replyText = `I just checked with ${room.host.name}'s listing notes for ${room.location}: street permit parking is free with a residential sticker, and covered garage spots nearby run ~$165/mo. Street parking gets tight after 7 PM!`;
      setDrawerMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, from: 'user', text: userText },
      ]);
      setTimeout(() => {
        setWrenMood('idle');
        setDrawerMessages((prev) => [
          ...prev,
          {
            id: `w-${Date.now()}`,
            from: 'wren',
            badge: 'Red-Flag Radar • Parking',
            text: replyText,
          },
        ]);
      }, 450);
    } else if (actionType === 'pet_deposit') {
      const userText = 'Check pet deposit';
      const replyText = `Good news! ${room.host.name} allows well-behaved pets with a refundable $250 pet deposit (protected inside your Wren Rental Stripe Connect Move-In Guarantee) and $0 monthly pet rent.`;
      setDrawerMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, from: 'user', text: userText },
      ]);
      setTimeout(() => {
        setWrenMood('idle');
        setDrawerMessages((prev) => [
          ...prev,
          {
            id: `w-${Date.now()}`,
            from: 'wren',
            badge: 'Verified Lease Terms',
            text: replyText,
          },
        ]);
      }, 450);
    } else if (actionType === 'tuesday_tour') {
      const userText = 'Have Wren book a Tuesday tour';
      const confirmationText = `Hold onto your feathers—I just messaged ${room.host.name} behind the scenes and locked in your Tuesday 5:30 PM walkthrough for "${room.title}"! Your calendar invite is ready in Direct Messages.`;
      setDrawerMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, from: 'user', text: userText },
      ]);
      setTimeout(() => {
        setWrenMood('flutter');
        setDrawerMessages((prev) => [
          ...prev,
          {
            id: `w-${Date.now()}`,
            from: 'wren',
            badge: 'Tuesday 5:30 PM Tour Confirmed',
            text: confirmationText,
          },
        ]);
        onBookTourViaWren(room, userText, confirmationText);
        setTimeout(() => setWrenMood('idle'), 2400);
      }, 500);
    }
  };

  const handleChatToFeedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = customInput.trim();
    if (!prompt) return;

    setCustomInput('');
    setWrenMood('thinking');
    const handoff = parseWrenChatToFeedQuery(prompt);

    setDrawerMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, from: 'user', text: prompt },
    ]);

    setTimeout(() => {
      setWrenMood('flutter');
      setDrawerMessages((prev) => [
        ...prev,
        {
          id: `w-${Date.now()}`,
          from: 'wren',
          badge: 'Chat-to-Feed Curated',
          text: handoff.wrenReply,
        },
      ]);
      onApplyChatToFeedFilters({
        maxPrice: handoff.extractedMaxPrice,
        searchQuery: handoff.extractedSearchQuery,
        utilitiesIncludedOnly: handoff.utilitiesIncludedOnly,
      });
      onResetSwipeCount();
      setTimeout(() => setWrenMood('idle'), 2000);
    }, 450);
  };

  return (
    <>
      {/* Context / Red-Flag Radar / Instant Pivot Bubble */}
      <div
        data-testid="wren-co-watcher"
        className="absolute top-14 right-3 left-14 z-20 flex flex-row-reverse items-start gap-2 pointer-events-none"
      >
        {/* Live Context-Aware Callout / Red-Flag Radar / Instant Pivot Speech Bubble */}
        {!isBubbleDismissed && !isMiniDrawerOpen && (
          <div className="pointer-events-auto max-w-[260px] sm:max-w-[295px] rounded-xl bg-[#F9F7F3]/95 backdrop-blur-md border border-[#2C2724]/20 shadow-warm p-2.5 text-[#2C2724] animate-fadeIn">
            <div className="flex items-center justify-between gap-1.5 mb-1">
              <span
                className={`inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  pivotCheck.triggered
                    ? 'bg-[#D96B43] text-white'
                    : activeCallout.type === 'red_flag_radar'
                    ? 'bg-[#D96B43]/15 text-[#D96B43] border border-[#D96B43]/35'
                    : 'bg-[#E5A93C]/25 text-[#18181B] border border-[#E5A93C]'
                }`}
              >
                {pivotCheck.triggered ? (
                  <>
                    <SlidersHorizontal className="w-2.5 h-2.5" />
                    <span>Instant Pivot</span>
                  </>
                ) : activeCallout.type === 'red_flag_radar' ? (
                  <>
                    <AlertTriangle className="w-2.5 h-2.5" />
                    <span>{activeCallout.badgeLabel}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-2.5 h-2.5 text-[#D96B43]" />
                    <span>Fenn Radar</span>
                  </>
                )}
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCalloutIndex((prev) => (prev + 1) % callouts.length)}
                  className="text-[9px] font-bold text-[#18181B]/65 hover:text-[#18181B] px-1"
                  title="Next Fenn insight"
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={() => setIsBubbleDismissed(true)}
                  aria-label="Dismiss Fenn callout bubble"
                  className="text-[#18181B]/65 hover:text-[#18181B]"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsMiniDrawerOpen(true);
                if (pivotCheck.triggered) onResetSwipeCount();
              }}
              className="text-left w-full text-[11px] font-semibold text-[#18181B] leading-snug hover:text-[#D96B43] transition-colors"
            >
              “{pivotCheck.triggered ? pivotCheck.promptText : activeCallout.text}”
            </button>
          </div>
        )}
      </div>

      {/* Flow 3: Seamless Mini Chat Drawer Over the Bottom Third of the Playing Video */}
      {isMiniDrawerOpen && (
        <div
          data-testid="wren-mini-chat-drawer"
          className="absolute inset-x-0 bottom-0 z-30 h-[56%] bg-[#FAF6F0]/98 backdrop-blur-md border-t-2 border-[#18181B] rounded-t-3xl shadow-warm flex flex-col overflow-hidden animate-fadeIn pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mini Drawer Header */}
          <div className="px-3.5 py-2.5 bg-[#18181B] text-[#FAF6F0] border-b border-[#E5A93C]/25 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FennMascot size="sm" variant="pose_alert" earsPerked={true} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-extrabold text-[#FAF6F0]">Ask Fenn</h3>
                  <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-[#E5A93C] text-[#18181B]">
                    Tour Playing Live
                  </span>
                </div>
                <p className="text-[10px] text-[#FAF6F0]/75 truncate">
                  Scouting {room.title} (${room.price}/mo)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsMiniDrawerOpen(false);
                  onOpenFullWrenModal();
                }}
                className="px-2 py-1 rounded-lg bg-[#F2EFE9] hover:bg-[#E6E0D6] text-[#2C2724] border border-[#2C2724]/20 text-[10px] font-bold flex items-center gap-0.5"
              >
                <span>Full Chat</span>
                <ChevronRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setIsMiniDrawerOpen(false)}
                aria-label="Close Wren mini chat drawer"
                className="w-7 h-7 rounded-lg bg-[#F2EFE9] hover:bg-[#E6E0D6] text-[#2C2724] border border-[#2C2724]/20 flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Scrollable Conversation Thread Inside Mini Drawer */}
          <div className="flex-1 overflow-y-auto px-3.5 py-2.5 space-y-2 text-xs">
            {drawerMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.from === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                {msg.badge && (
                  <span className="text-[9px] font-bold text-[#485B4A] bg-[#E8EFE9] border border-[#7A907C]/40 px-2 py-0.5 rounded-full mb-1 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>{msg.badge}</span>
                  </span>
                )}
                <div
                  className={`max-w-[88%] px-3 py-2 rounded-2xl text-[11px] leading-relaxed shadow-warm-sm ${
                    msg.from === 'user'
                      ? 'bg-[#2C2724] text-[#F9F7F3] rounded-br-none'
                      : 'bg-white text-[#2C2724] border border-[#2C2724]/15 rounded-bl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          {/* One-Tap Prompts Tailored to What Isn't in the Video */}
          <div className="px-3 py-1.5 bg-[#F2EFE9] border-t border-[#2C2724]/12 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => handleOneTapAction('parking')}
              className="px-2.5 py-1 rounded-full bg-white hover:bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724]/25 text-[10px] font-bold shrink-0 active:scale-95"
            >
              Ask about parking cost
            </button>
            <button
              type="button"
              onClick={() => handleOneTapAction('pet_deposit')}
              className="px-2.5 py-1 rounded-full bg-white hover:bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724]/25 text-[10px] font-bold shrink-0 active:scale-95"
            >
              Check pet deposit
            </button>
            <button
              type="button"
              onClick={() => handleOneTapAction('tuesday_tour')}
              className="px-2.5 py-1 rounded-full bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-[10px] font-bold shrink-0 flex items-center gap-1 shadow-warm-sm active:scale-95"
            >
              <Calendar className="w-3 h-3" />
              <span>Have Wren book a Tuesday tour</span>
            </button>
          </div>

          {/* Chat-to-Feed Handoff Input ("Tell Wren what you're looking for") */}
          <form
            onSubmit={handleChatToFeedSubmit}
            className="p-2.5 bg-white border-t border-[#2C2724]/12 flex items-center gap-1.5"
          >
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Tell Wren what you're looking for (e.g. under $2,800, dog-friendly, hate carpet)..."
              className="flex-1 px-3 py-1.5 bg-[#F9F7F3] border border-[#2C2724]/25 rounded-xl text-[#2C2724] placeholder-[#6E655F] text-[11px] focus:outline-none focus:border-[#D06C4E]"
            />
            <button
              type="submit"
              aria-label="Send to Wren"
              className="p-2 bg-[#D06C4E] hover:bg-[#b85b3f] text-white rounded-xl shadow-warm-sm transition-all active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
