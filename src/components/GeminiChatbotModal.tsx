import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Send, 
  Scale, 
  Users, 
  Zap, 
  Building2, 
  RotateCcw,
  Copy,
  Check,
  Play
} from 'lucide-react';
import { ChatMessage, ChatRole, RoomListing, FilterState } from '../types';
import { geminiService } from '../services/geminiService';
import { WrenMascot } from './WrenMascot';
import { parseWrenChatToFeedQuery } from '../utils/trustSafety';

interface GeminiChatbotModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRoom?: RoomListing;
  onApplyChatToFeedFilters?: (partial: Partial<FilterState>) => void;
}

export const GeminiChatbotModal: React.FC<GeminiChatbotModalProps> = ({
  isOpen,
  onClose,
  currentRoom,
  onApplyChatToFeedFilters,
}) => {
  const [role, setRole] = useState<ChatRole>('roommate_concierge');
  const [inputMessage, setInputMessage] = useState('');
  const [curationQuery, setCurationQuery] = useState(
    'Need a 1-bed under $2,800, dog-friendly, hate carpet'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [wrenMood, setWrenMood] = useState<'idle' | 'thinking' | 'flutter'>('idle');
  const [includeRoomContext, setIncludeRoomContext] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Ears perked—I'm Fenn! Tell me what you're looking for (like "Need a 1-bed under $2,800, dog-friendly, hate carpet") and I'll curate your video feed on the spot, or ask me for a Scout's-Eye View of the block, lease red-flag checks, or roommate match tips.`,
      timestamp: 'Just now',
      modelUsed: 'gemini-3.8-flash',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  if (!isOpen) return null;

  const getRoleDetails = (currentRole: ChatRole) => {
    switch (currentRole) {
      case 'lease_advisor':
        return {
          title: 'Lease & Red-Flag Radar',
          model: 'gemini-4-argon',
          complexity: 'complex' as const,
          icon: Scale,
          description: 'Analyzes deposit return laws, subletting clauses, liability, and tenant rights.',
          suggestedPrompts: [
            'What red flags should I watch for in a room sublease contract?',
            'How is my security deposit protected with the Fenn Rentals Move-In Guarantee?',
            'What clauses must be in writing before I pay first month rent?',
          ],
        };
      case 'neighborhood_guide':
        return {
          title: 'Scout’s-Eye View (Block & Transit)',
          model: 'gemini-3.1-flash-lite',
          complexity: 'fast' as const,
          icon: Zap,
          description: 'Real vibe of a block—noise levels, coffee shops, street parking after 7 PM, and transit.',
          suggestedPrompts: [
            'Give me the Scout’s-Eye View on street parking, noise levels, and coffee shops here.',
            'How safe and walkable is this block after 7 PM?',
            'What is the morning commute time to downtown?',
          ],
        };
      case 'roommate_concierge':
      default:
        return {
          title: 'Tell Fenn What You’re Looking For',
          model: 'gemini-3.8-flash',
          complexity: 'general' as const,
          icon: Users,
          description: 'Curates your video tours, checks roommate habits, and grabs tour slots.',
          suggestedPrompts: [
            'Need a 1-bed under $2,800, dog-friendly, hate carpet',
            'Ears perked—scout sunny rooms under $1,600 with utilities included',
            'Heads up, grab a Tuesday tour slot and draft an intro note to the host',
          ],
        };
    }
  };

  const activeDetails = getRoleDetails(role);

  const handleChatToFeedHandoff = (promptText?: string) => {
    const query = (promptText ?? curationQuery).trim();
    if (!query) return;

    setWrenMood('thinking');
    const handoff = parseWrenChatToFeedQuery(query);

    const userMsg: ChatMessage = {
      id: `user-curation-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const wrenMsg: ChatMessage = {
      id: `wren-curation-${Date.now() + 1}`,
      role: 'assistant',
      content: handoff.wrenReply,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'Wren Chat-to-Feed Algorithm',
    };

    setMessages((prev) => [...prev, userMsg, wrenMsg]);
    setTimeout(() => {
      setWrenMood('flutter');
      if (onApplyChatToFeedFilters) {
        onApplyChatToFeedFilters({
          maxPrice: handoff.extractedMaxPrice,
          searchQuery: handoff.extractedSearchQuery,
          utilitiesIncludedOnly: handoff.utilitiesIncludedOnly,
        });
      }
      setTimeout(() => setWrenMood('idle'), 2200);
    }, 350);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim() || isLoading) return;

    // If user is describing room search criteria ("under $...", "hate carpet", "dog-friendly"), run Chat-to-Feed handoff!
    if (/\b(under\s*\$?\d+|hate\s+carpet|dog[- ]friendly|scout\s+sunny)\b/i.test(text)) {
      setInputMessage('');
      handleChatToFeedHandoff(text);
      return;
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);
    setWrenMood('thinking');

    try {
      const chatHistory = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const contextData = includeRoomContext && currentRoom ? {
        title: currentRoom.title,
        price: currentRoom.price,
        location: currentRoom.location,
        amenities: currentRoom.amenities,
        houseRules: currentRoom.houseRules,
        roommates: currentRoom.roommates,
        description: currentRoom.description,
      } : null;

      const result = await geminiService.sendChatMessage(
        chatHistory,
        role,
        activeDetails.complexity,
        contextData
      );

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: result.modelUsed,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setWrenMood('flutter');
      setTimeout(() => setWrenMood('idle'), 1600);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Hold onto your feathers—I hit a quick snag pulling that up. Try asking me again!',
          timestamp: 'Just now',
          modelUsed: activeDetails.model,
        },
      ]);
      setWrenMood('idle');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResetChat = () => {
    setWrenMood('flutter');
    setTimeout(() => setWrenMood('idle'), 1200);
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        content: `Hold onto your feathers—fresh slate! Tell me what you're looking for and I'll curate your video feed.`,
        timestamp: 'Just now',
        modelUsed: activeDetails.model,
      },
    ]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#2C2724]/60 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full sm:max-w-lg h-[88vh] sm:h-[84vh] bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724]/20 rounded-2xl flex flex-col shadow-warm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-4 py-3 border-b border-[#2C2724]/12 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/25 flex items-center justify-center shadow-warm-sm">
              <WrenMascot size="md" mood={isLoading ? 'thinking' : wrenMood} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm sm:text-base text-[#2C2724]">Fenn</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40">
                  {activeDetails.model}
                </span>
              </div>
              <p className="text-[11px] text-[#6E655F]">{activeDetails.title}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleResetChat}
              className="w-8 h-8 rounded-xl bg-[#F9F7F3] hover:bg-[#F2EFE9] text-[#2C2724] border border-[#2C2724]/20 flex items-center justify-center transition-colors"
              title="Reset Chat"
              aria-label="Reset Chat"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Fenn"
              title="Close"
              className="w-8 h-8 rounded-xl bg-[#F2EFE9] hover:bg-[#E6E0D6] text-[#2C2724] border border-[#2C2724]/20 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Flow 1: The "Chat-to-Feed" Handoff ("Tell Fenn what you're looking for") */}
        <div className="px-3.5 py-2.5 bg-[#F2EFE9] border-b border-[#2C2724]/12 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-[#2C2724]">
              Tell Fenn what you&apos;re looking for (Chat-to-Feed Handoff)
            </span>
            <span className="text-[10px] font-semibold text-[#485B4A] bg-[#E8EFE9] px-2 py-0.5 rounded-full border border-[#7A907C]/40">
              Instant Tour Alerts Ready
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={curationQuery}
              onChange={(e) => setCurationQuery(e.target.value)}
              aria-label="Tell Wren what you're looking for"
              className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-[#2C2724]/25 text-xs text-[#2C2724] focus:outline-none focus:border-[#D06C4E]"
            />
            <button
              type="button"
              onClick={() => handleChatToFeedHandoff()}
              className="px-3 py-1.5 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-bold text-xs shadow-warm-sm flex items-center gap-1 shrink-0 active:scale-95"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Curate Feed</span>
            </button>
          </div>
        </div>

        {/* Role Selector Tabs */}
        <div className="px-3.5 py-2 bg-white border-b border-[#2C2724]/12 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setRole('roommate_concierge')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 ${
              role === 'roommate_concierge'
                ? 'bg-[#2C2724] text-[#F9F7F3] shadow-sm'
                : 'bg-[#F9F7F3] text-[#2C2724] hover:bg-[#F2EFE9] border border-[#2C2724]/20'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Tell Fenn</span>
          </button>

          <button
            type="button"
            onClick={() => setRole('neighborhood_guide')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 ${
              role === 'neighborhood_guide'
                ? 'bg-[#2C2724] text-[#F9F7F3] shadow-sm'
                : 'bg-[#F9F7F3] text-[#2C2724] hover:bg-[#F2EFE9] border border-[#2C2724]/20'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Scout’s-Eye View</span>
          </button>

          <button
            type="button"
            onClick={() => setRole('lease_advisor')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 ${
              role === 'lease_advisor'
                ? 'bg-[#2C2724] text-[#F9F7F3] shadow-sm'
                : 'bg-[#F9F7F3] text-[#2C2724] hover:bg-[#F2EFE9] border border-[#2C2724]/20'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Red-Flag Radar</span>
          </button>
        </div>

        {/* Current Room Context Bar */}
        {currentRoom && (
          <div className="px-4 py-2 bg-[#F9F7F3] border-b border-[#2C2724]/12 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 truncate">
              <Building2 className="w-3.5 h-3.5 text-[#D06C4E] shrink-0" />
              <span className="text-[#6E655F]">Co-Watching:</span>
              <span className="text-[#2C2724] font-bold truncate">{currentRoom.title}</span>
              <span className="text-[#485B4A] font-bold shrink-0">${currentRoom.price}/mo</span>
            </div>
            <label className="flex items-center gap-1.5 text-[#6E655F] hover:text-[#2C2724] cursor-pointer text-[11px] shrink-0 pl-2">
              <input
                type="checkbox"
                checked={includeRoomContext}
                onChange={(e) => setIncludeRoomContext(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#7A907C] rounded"
              />
              <span>Include Room</span>
            </label>
          </div>
        )}

        {/* Scrollable Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {messages.map((m) => {
            const isUser = m.role === 'user';
            const isCurationHandoff = m.modelUsed === 'Wren Chat-to-Feed Algorithm';
            return (
              <div
                key={m.id}
                className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-white border border-[#2C2724]/20 flex items-center justify-center shrink-0 mt-0.5 shadow-warm-sm">
                    <WrenMascot size="sm" mood={wrenMood} />
                  </div>
                )}
                <div className={`max-w-[84%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`p-3 rounded-2xl text-xs leading-relaxed shadow-warm-sm ${
                      isUser
                        ? 'bg-[#2C2724] text-[#F9F7F3] rounded-tr-none'
                        : 'bg-white text-[#2C2724] rounded-tl-none border border-[#2C2724]/15'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                    {isCurationHandoff && (
                      <button
                        type="button"
                        onClick={onClose}
                        className="mt-2.5 w-full py-2 px-3 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-warm-sm transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Watch Curated Video Feed Now</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1 px-1 text-[10px] text-[#6E655F]">
                    <span>{m.timestamp}</span>
                    {m.modelUsed && (
                      <span className="font-mono text-[#485B4A] bg-[#E8EFE9] border border-[#7A907C]/30 px-1.5 py-0.2 rounded">
                        {m.modelUsed}
                      </span>
                    )}
                    {!isUser && (
                      <button
                        type="button"
                        onClick={() => handleCopy(m.id, m.content)}
                        className="hover:text-[#2C2724] transition-colors ml-1 flex items-center gap-0.5"
                      >
                        {copiedId === m.id ? (
                          <>
                            <Check className="w-3 h-3 text-[#485B4A]" />
                            <span className="text-[#485B4A] text-[9px]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span className="text-[9px]">Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-2.5 items-center">
              <div className="w-8 h-8 rounded-xl bg-white border border-[#2C2724]/20 flex items-center justify-center shrink-0">
                <WrenMascot size="sm" mood="thinking" />
              </div>
              <div className="p-3 rounded-2xl bg-white border border-[#2C2724]/15 text-xs text-[#6E655F] flex items-center gap-2">
                <span className="animate-pulse">Fenn is scouting floorplans & landlord notes...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompt Chips */}
        <div className="px-3.5 py-2 bg-[#F2EFE9] border-t border-[#2C2724]/12">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {activeDetails.suggestedPrompts.map((prompt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSendMessage(prompt)}
                className="px-2.5 py-1 rounded-full text-[11px] bg-white hover:bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724]/20 transition-all shrink-0 active:scale-95 text-left"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Input */}
        <div className="p-3 bg-white border-t border-[#2C2724]/12">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={`Ask Fenn (${activeDetails.title})...`}
              className="flex-1 px-3.5 py-2 bg-[#F9F7F3] border border-[#2C2724]/25 rounded-xl text-[#2C2724] placeholder-[#6E655F] text-xs focus:outline-none focus:border-[#D06C4E] transition-colors"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              aria-label="Send message to Fenn"
              className="p-2.5 bg-[#D06C4E] hover:bg-[#b85b3f] disabled:opacity-40 text-white rounded-xl shadow-warm-sm transition-all active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};


