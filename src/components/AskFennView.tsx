import React, { useState, useEffect } from 'react';
import {
  Send,
  Sparkles,
  SlidersHorizontal,
  Play,
  Bookmark,
  CheckCircle2,
  AlertTriangle,
  Sun,
  Coffee,
  Plus,
  MessageSquare,
  Clock,
  ChevronLeft,
} from 'lucide-react';
import { RoomListing, FilterState } from '../types';
import { FennMascot } from './FennMascot';
import {
  parseAskFennSearch,
  getRoomBedBathTag,
  AskFennSearchResult,
  AskFennChatSession,
  FennChatMessage,
} from '../utils/trustSafety';

interface AskFennViewProps {
  allRooms: RoomListing[];
  pinnedRoomIds: Set<string>;
  onTogglePin: (roomId: string) => void;
  onSelectRoomAndWatch: (roomId: string) => void;
  onApplySmartFilters: (filters: Partial<FilterState>) => void;
  sessions: AskFennChatSession[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onStartNewChat: () => void;
  onUpdateSession: (updatedSession: AskFennChatSession) => void;
}

const AI_STARTER_PROMPTS = [
  'Find a sunny 1BR in San Francisco under $1,600 with in-unit laundry',
  'Compare Mission District vs. Hayes Valley for transit and coffee',
  'What red flags should I look for in a California room rental lease?',
];

export const AskFennView: React.FC<AskFennViewProps> = ({
  allRooms,
  pinnedRoomIds,
  onTogglePin,
  onSelectRoomAndWatch,
  onApplySmartFilters,
  sessions,
  activeSessionId,
  onSelectSession,
  onStartNewChat,
  onUpdateSession,
}) => {
  const [queryInput, setQueryInput] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'chat' | 'saved_chats'>('chat');

  useEffect(() => {
    setViewMode('chat');
  }, [activeSessionId]);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const historicalSessions = sessions.filter((s) =>
    s.messages.some((m) => m.sender === 'user')
  );

  const activeSearch = activeSession.searchResult;
  const messages = activeSession.messages;
  const hasUserMessages = messages.some((m) => m.sender === 'user');
  const earsPerked = activeSearch.earsPerked && !isLoading;

  const buildChatTitle = (rawText: string, parsed: AskFennSearchResult) => {
    const clean = rawText.trim();
    if (clean.length <= 34) return clean;
    const neighborhoodPart =
      parsed.structuredFilters.neighborhood !== 'All Prime Neighborhoods'
        ? parsed.structuredFilters.neighborhood
        : parsed.structuredFilters.bedBathLabel;
    return `${neighborhoodPart} ≤ $${parsed.structuredFilters.maxPrice.toLocaleString()}`;
  };

  const handleRunAskFenn = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || !activeSession) return;

    const nowLabel = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const userMsg: FennChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: nowLabel,
    };

    const localParsed = parseAskFennSearch(trimmed, allRooms);
    const hasPriorUserMsg = activeSession.messages.some((m) => m.sender === 'user');
    const nextTitle = hasPriorUserMsg
      ? activeSession.title
      : buildChatTitle(trimmed, localParsed);

    const updatedMessages = [...activeSession.messages, userMsg];

    const optimisticSession: AskFennChatSession = {
      ...activeSession,
      title: nextTitle,
      createdAt: nowLabel,
      messages: updatedMessages,
      searchResult: localParsed,
    };

    onUpdateSession(optimisticSession);
    setQueryInput('');
    setIsLoading(true);

    try {
      const [askFennRes, aiChatRes] = await Promise.allSettled([
        fetch('/api/gemini/ask-fenn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: trimmed,
            rooms: allRooms,
          }),
        }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/gemini/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: updatedMessages.map((m) => ({
              role: m.sender === 'user' ? 'user' : 'assistant',
              content: m.text,
            })),
            role: 'roommate_concierge',
            taskComplexity: 'general',
          }),
        }).then((r) => (r.ok ? r.json() : null)),
      ]);

      const askFennData =
        askFennRes.status === 'fulfilled' ? askFennRes.value : null;
      const aiChatData =
        aiChatRes.status === 'fulfilled' ? aiChatRes.value : null;

      const finalResult: AskFennSearchResult =
        askFennData && askFennData.structuredFilters ? askFennData : localParsed;

      const aiReplyText =
        aiChatData?.reply || finalResult.fennReply || localParsed.fennReply;

      const fennMsg: FennChatMessage = {
        id: `f-${Date.now()}`,
        sender: 'fenn',
        text: aiReplyText,
        timestamp: nowLabel,
      };

      onUpdateSession({
        ...optimisticSession,
        searchResult: {
          ...finalResult,
          fennReply: aiReplyText,
        },
        messages: [...optimisticSession.messages, fennMsg],
      });
    } catch {
      const fennMsg: FennChatMessage = {
        id: `f-${Date.now()}`,
        sender: 'fenn',
        text: localParsed.fennReply,
        timestamp: nowLabel,
      };

      onUpdateSession({
        ...optimisticSession,
        searchResult: localParsed,
        messages: [...optimisticSession.messages, fennMsg],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const matchedRooms = allRooms.filter((r) =>
    activeSearch.matchedRoomIds.includes(r.id)
  );

  if (viewMode === 'saved_chats') {
    return (
      <div
        data-testid="ask-fenn-saved-chats-view"
        className="flex-1 flex flex-col bg-[#F9F7F3] text-[#2C2724] overflow-hidden font-['Plus_Jakarta_Sans','Inter',sans-serif]"
      >
        <div className="p-4 border-b border-[#2C2724]/15 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#D06C4E]/15 text-[#D06C4E] flex items-center justify-center border border-[#D06C4E]/30">
              <MessageSquare className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-base text-[#2C2724]">Saved Chats</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              onStartNewChat();
              setQueryInput('');
              setViewMode('chat');
            }}
            data-testid="ask-fenn-new-chat-btn"
            className="px-3 py-1.5 rounded-xl bg-[#D06C4E] hover:bg-[#b85a3e] text-white text-xs font-extrabold flex items-center gap-1 shadow-xs transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
          {historicalSessions.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#6E655F] space-y-2">
              <p className="font-bold text-[#2C2724]">No saved chats yet</p>
              <p>Send a message in Ask Fenn and your chat will be saved here automatically.</p>
            </div>
          ) : (
            historicalSessions.map((hist) => {
              const userTurns = hist.messages.filter((m) => m.sender === 'user');
              const lastUserMsg =
                userTurns[userTurns.length - 1]?.text || hist.title;
              return (
                <button
                  key={hist.id}
                  type="button"
                  data-testid={`ask-fenn-saved-chat-item-${hist.id}`}
                  onClick={() => {
                    onSelectSession(hist.id);
                    setViewMode('chat');
                  }}
                  className="w-full p-3.5 rounded-2xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/15 text-left flex items-start justify-between gap-3 shadow-xs transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-extrabold text-[#2C2724] truncate">
                        {hist.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6E655F] truncate">
                      “{lastUserMsg}”
                    </p>
                  </div>
                  <span className="text-[10px] text-[#6E655F] font-semibold flex items-center gap-1 shrink-0 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {hist.createdAt}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#F9F7F3] text-[#2C2724] overflow-hidden font-['Plus_Jakarta_Sans','Inter',sans-serif]">
      {/* Scrollable AI Chat + On-Demand Smart Filters & Video Tours Area */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* Top Navigation Row: Back Button to Saved Chats + New AI Chat Button */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setViewMode('saved_chats')}
            data-testid="ask-fenn-back-to-saved-btn"
            aria-label="Back to saved chats"
            title="Saved Chats"
            className="w-8 h-8 rounded-xl bg-white hover:bg-[#F2EFE9] text-[#2C2724] border border-[#2C2724] flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            data-testid="ask-fenn-inline-new-chat-btn"
            onClick={() => {
              onStartNewChat();
              setQueryInput('');
              setViewMode('chat');
            }}
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-[#F2EFE9] text-[#2C2724] border border-[#2C2724]/25 text-[11px] font-extrabold flex items-center gap-1 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 text-[#D06C4E]" />
            <span>New Chat</span>
          </button>
        </div>

        {/* AI Conversation Thread */}
        <div className="space-y-2.5" data-testid="ask-fenn-messages-list">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${
                msg.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.sender === 'fenn' && (
                <div className="w-7 h-7 rounded-xl bg-[#2C2724] flex items-center justify-center shrink-0">
                  <FennMascot size="xs" variant="avatar" earsPerked={earsPerked} />
                </div>
              )}
              <div
                className={`max-w-[84%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                  msg.sender === 'user'
                    ? 'bg-[#2C2724] text-[#F9F7F3] rounded-br-xs font-medium'
                    : 'bg-white text-[#2C2724] border border-[#2C2724]/15 rounded-bl-xs font-medium'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-[#2C2724]/70 font-semibold px-2">
              <Sparkles className="w-3.5 h-3.5 text-[#D06C4E] animate-spin" />
              <span>Fenn AI is thinking...</span>
            </div>
          )}
        </div>

        {/* Fresh New AI Chat State: Show Starter Prompts until user sends a message */}
        {!hasUserMessages ? (
          <div
            data-testid="ask-fenn-fresh-ai-chat-state"
            className="bg-white rounded-2xl border border-[#2C2724]/15 p-4 space-y-2.5 shadow-xs"
          >
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#2C2724]">
              <Sparkles className="w-3.5 h-3.5 text-[#D06C4E]" />
              <span>Start a New Chat with Fenn AI</span>
            </div>
            <p className="text-[11px] text-[#6E655F] leading-relaxed">
              Ask Fenn anything about San Francisco neighborhoods, budgets, roommate compatibility, or lease terms—or tap a prompt below:
            </p>
            <div className="space-y-1.5 pt-1">
              {AI_STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleRunAskFenn(prompt)}
                  className="w-full p-2.5 rounded-xl bg-[#F9F7F3] hover:bg-[#F2EFE9] border border-[#2C2724]/15 text-left text-[11px] font-bold text-[#2C2724] transition-colors cursor-pointer"
                >
                  “{prompt}”
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Translated Structured Search Filters Card (Shown after user chats with AI) */}
            <section
              data-testid="ask-fenn-structured-filters"
              className="bg-white rounded-2xl border-2 border-[#2C2724] p-3.5 shadow-sm space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#D06C4E]" />
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#2C2724]">
                    Translated Structured Search Filters
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onApplySmartFilters({
                      maxPrice: activeSearch.structuredFilters.maxPrice,
                      amenities: activeSearch.structuredFilters.amenities,
                      searchQuery:
                        activeSearch.structuredFilters.neighborhood ===
                        'All Prime Neighborhoods'
                          ? ''
                          : activeSearch.structuredFilters.neighborhood,
                    })
                  }
                  className="px-2.5 py-1 rounded-xl bg-[#D06C4E] hover:bg-[#b85a3e] text-white text-[10px] font-extrabold shadow-xs transition-all active:scale-95"
                >
                  Apply to Feed
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <span className="px-2.5 py-1 rounded-lg bg-[#EBF0EC] border border-[#7A907C] text-[#2C2724] text-[11px] font-extrabold">
                  Budget: ≤ ${activeSearch.structuredFilters.maxPrice.toLocaleString()}/mo
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#F9F7F3] border border-[#2C2724]/20 text-[#2C2724] text-[11px] font-bold">
                  Layout: {activeSearch.structuredFilters.bedBathLabel}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#F9F7F3] border border-[#2C2724]/20 text-[#2C2724] text-[11px] font-bold">
                  Area: {activeSearch.structuredFilters.neighborhood}
                </span>
                {activeSearch.structuredFilters.naturalLight && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F9F7F3] border border-[#2C2724]/15 text-[#2C2724] text-[11px] font-bold">
                    <Sun className="w-3 h-3 text-[#D06C4E]" />
                    Afternoon Sun
                  </span>
                )}
                {activeSearch.structuredFilters.nearCoffee && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F9F7F3] border border-[#2C2724]/15 text-[#2C2724] text-[11px] font-bold">
                    <Coffee className="w-3 h-3 text-[#D06C4E]" />
                    Walkable Coffee
                  </span>
                )}
                {activeSearch.structuredFilters.amenities.map((am) => (
                  <span
                    key={am}
                    className="px-2.5 py-1 rounded-lg bg-[#D06C4E]/15 border border-[#D06C4E]/40 text-[#D06C4E] text-[11px] font-extrabold"
                  >
                    ✓ {am}
                  </span>
                ))}
              </div>
            </section>

            {/* Recommended Video Tours + Pros / Cons / Red-Flag Decoder */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#2C2724]/80">
                  Fenn’s Scouted Video Tours & Red-Flag Audit
                </h2>
                <span className="text-[10px] font-bold text-[#D06C4E]">
                  {matchedRooms.length} matches
                </span>
              </div>

              {matchedRooms.map((room) => {
                const audit = activeSearch.audits.find((a) => a.roomId === room.id);
                const isSaved = pinnedRoomIds.has(room.id);
                const bedBath = getRoomBedBathTag(room);

                return (
                  <div
                    key={room.id}
                    className="bg-white rounded-2xl border border-[#2C2724]/20 overflow-hidden shadow-xs"
                  >
                    <div className="flex gap-3 p-3">
                      <div
                        onClick={() => onSelectRoomAndWatch(room.id)}
                        className="relative w-24 h-28 rounded-xl overflow-hidden bg-[#2C2724] shrink-0 cursor-pointer group"
                      >
                        <img
                          src={room.fallbackThumbnail}
                          alt={room.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-[#D06C4E] text-white flex items-center justify-center shadow">
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          </div>
                        </div>
                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-[#2C2724]/85 text-[#F9F7F3] text-[9px] font-extrabold">
                          ${room.price.toLocaleString()}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span className="px-2 py-0.5 rounded-md bg-[#2C2724] text-[#F9F7F3] text-[10px] font-extrabold">
                              {bedBath}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-[#F9F7F3] border border-[#2C2724]/15 text-[#2C2724] text-[10px] font-bold">
                              {room.neighborhood}
                            </span>
                          </div>
                          <h3 className="text-xs font-extrabold text-[#2C2724] line-clamp-1">
                            {room.title}
                          </h3>
                          {audit && (
                            <p className="text-[10px] text-[#2C2724]/75 mt-0.5 line-clamp-2">
                              {audit.finishHighlight}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 mt-2">
                          <button
                            type="button"
                            onClick={() => onSelectRoomAndWatch(room.id)}
                            className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#D06C4E] hover:bg-[#b85a3e] text-white text-[10px] font-extrabold flex items-center justify-center gap-1 transition-all active:scale-95"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Watch Tour</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onTogglePin(room.id)}
                            className={`py-1.5 px-2.5 rounded-xl text-[10px] font-extrabold border flex items-center gap-1 transition-all active:scale-95 ${
                              isSaved
                                ? 'bg-[#EBF0EC] text-[#485B4A] border-[#7A907C]'
                                : 'bg-[#F9F7F3] text-[#2C2724] border-[#2C2724]/30 hover:bg-[#F2EFE9]'
                            }`}
                          >
                            <Bookmark className={`w-3 h-3 ${isSaved ? 'fill-current' : ''}`} />
                            <span>{isSaved ? 'Saved' : 'Save Room'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Pros, Cons & Street-Smart Red-Flag Strip */}
                    {audit && (
                      <div className="px-3 py-2 bg-[#F9F7F3] border-t border-[#2C2724]/10 space-y-1 text-[10px]">
                        <div className="flex items-start gap-1.5 text-[#2C2724]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#7A907C] shrink-0 mt-0.5" />
                          <span>
                            <strong className="font-extrabold">Pros:</strong>{' '}
                            {audit.pros.join(' • ')}
                          </span>
                        </div>
                        <div className="flex items-start gap-1.5 text-[#2C2724]">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#D06C4E] shrink-0 mt-0.5" />
                          <span>
                            <strong className="font-extrabold text-[#D06C4E]">
                              Fenn’s Street-Smart Catch:
                            </strong>{' '}
                            {audit.redFlag}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          </>
        )}
      </div>

      {/* Bottom Natural-Language Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleRunAskFenn(queryInput);
        }}
        className="p-3 bg-white border-t border-[#2C2724]/15 flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          data-testid="ask-fenn-chat-input"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Message Fenn AI..."
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/25 text-xs text-[#2C2724] placeholder-[#6E655F] focus:outline-none focus:border-[#D06C4E]"
        />
        <button
          type="submit"
          data-testid="ask-fenn-send-btn"
          aria-label="Send to Fenn"
          className="px-3.5 py-2.5 rounded-xl bg-[#D06C4E] hover:bg-[#b85a3e] text-white font-extrabold text-xs flex items-center gap-1 shadow-xs transition-all active:scale-95"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
