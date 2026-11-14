import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Send, 
  Calendar, 
  Check, 
  CheckCheck, 
  MapPin, 
  ChevronLeft, 
  Building2, 
  MessageSquare,
  AlertTriangle,
  Lock
} from 'lucide-react';
import { Conversation, RoomListing, Host } from '../types';
import { geminiService } from '../services/geminiService';
import {
  maskAndScanMessage,
  evaluateLayer2OffPlatformAttempt,
} from '../utils/trustSafety';

interface DirectMessagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  inline?: boolean;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (convId: string) => void;
  onSendMessage: (convId: string, text: string, sharedListing?: any, tourRequest?: any) => void;
  onUpdateEscrowStatus?: (
    convId: string,
    status: 'unfunded' | 'held_in_escrow' | 'released_on_move_in'
  ) => void;
  currentRoom?: RoomListing;
  allRooms: RoomListing[];
  onViewRoomDetails: (roomId: string) => void;
  onViewHostProfile: (host: Host) => void;
}

export const DirectMessagingModal: React.FC<DirectMessagingModalProps> = ({
  isOpen,
  onClose,
  inline = false,
  conversations,
  activeConversationId,
  onSelectConversation,
  onSendMessage,
  onUpdateEscrowStatus,
  currentRoom,
  allRooms,
  onViewRoomDetails,
  onViewHostProfile,
}) => {
  const [inputText, setInputText] = useState('');
  const [showTourScheduler, setShowTourScheduler] = useState(false);
  const [tourDate, setTourDate] = useState('2026-10-25');
  const [tourTime, setTourTime] = useState('2:00 PM');
  const [tourType, setTourType] = useState<'In-person' | 'Virtual Video Call'>('In-person');
  const [isIntercepting, setIsIntercepting] = useState(false);
  const [blockedModalPayload, setBlockedModalPayload] = useState<{
    attemptedText: string;
    is_off_platform_attempt: boolean;
    confidence: number;
    reason?: string;
    latencyMs: number;
    modelUsed: string;
  } | null>(null);

  // Smart reply state powered by gemini-3.1-flash-lite
  const [smartReplies, setSmartReplies] = useState<string[]>([
    'Hi! Is this room still available?',
    'Can I schedule an in-person tour this weekend?',
    'Are utilities and internet included?',
  ]);
  const [smartReplyLatency, setSmartReplyLatency] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConv =
    activeConversationId === ''
      ? undefined
      : conversations.find((c) => c.id === activeConversationId) || conversations[0];

  // Auto-scroll messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [activeConv?.messages]);

  // Load low-latency smart replies when active conversation changes
  useEffect(() => {
    if (!isOpen || !activeConv) return;

    let isMounted = true;
    const fetchSmartReplies = async () => {
      const activeRoom = allRooms.find((r) => r.id === activeConv.roomId) || currentRoom;
      const res = await geminiService.getFastResponse('smart_replies', {
        room: activeRoom,
        conversationHistory: activeConv.messages,
      });

      if (isMounted) {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setSmartReplies(res.data.slice(0, 3));
        }
        setSmartReplyLatency(res.latencyMs);
      }
    };

    fetchSmartReplies();

    return () => {
      isMounted = false;
    };
  }, [activeConv?.id, isOpen]);

  if (!isOpen) return null;

  const isBookingConfirmed =
    activeConv?.escrowStatus === 'held_in_escrow' ||
    activeConv?.escrowStatus === 'released_on_move_in';

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text || !activeConv || isIntercepting) return;

    // Layer 1: Deterministic Regex Masking runs first (free & instant)
    // Layer 2: Gemini Flash AI Interceptor checks for sneaky bypasses (spelled-out digits, IG handles, cash requests)
    if (!isBookingConfirmed) {
      const localLayer2 = evaluateLayer2OffPlatformAttempt(text, false);
      if (localLayer2.is_off_platform_attempt) {
        setIsIntercepting(true);
        const interceptRes = await geminiService.interceptChatMessage(text, false);
        setIsIntercepting(false);

        if (interceptRes.is_off_platform_attempt || localLayer2.is_off_platform_attempt) {
          setBlockedModalPayload({
            attemptedText: text,
            is_off_platform_attempt: true,
            confidence: interceptRes.confidence || localLayer2.confidence,
            reason: interceptRes.reason || localLayer2.reason,
            latencyMs: interceptRes.latencyMs,
            modelUsed: interceptRes.modelUsed || 'gemini-3.8-flash',
          });
          return; // Block the message from sending!
        }
      }
    }

    onSendMessage(activeConv.id, text);
    setInputText('');
  };

  const handleScheduleTour = () => {
    if (!activeConv) return;
    const formattedDate = new Date(tourDate).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    onSendMessage(
      activeConv.id,
      `I'd love to request a ${tourType} tour on ${formattedDate} at ${tourTime}!`,
      undefined,
      {
        date: formattedDate,
        time: tourTime,
        type: tourType,
        status: 'pending',
      }
    );
    setShowTourScheduler(false);
  };

  const handleShareCurrentListing = (roomToShare?: RoomListing) => {
    const room = roomToShare || currentRoom || allRooms[0];
    if (!activeConv || !room) return;

    onSendMessage(
      activeConv.id,
      `Check out this room listing: "${room.title}" ($${room.price}/mo)`,
      {
        id: room.id,
        title: room.title,
        price: room.price,
        location: room.location,
        thumbnail: room.fallbackThumbnail,
        roomType: room.roomType,
      }
    );
  };

  return (
    <div
      className={
        inline
          ? 'relative flex-1 w-full h-full bg-[#F9F7F3] text-[#2C2724] flex flex-col overflow-hidden'
          : 'fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-[#2C2724]/60 backdrop-blur-sm animate-fadeIn'
      }
    >
      <div 
        className={
          inline
            ? 'relative w-full h-full bg-[#F9F7F3] text-[#2C2724] flex overflow-hidden flex-col'
            : 'relative w-full sm:max-w-4xl h-full sm:h-[88vh] bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724]/25 sm:rounded-2xl flex overflow-hidden shadow-warm flex-col md:flex-row'
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sage Green Anti-Leakage Warning Modal when Gemini blocks an off-platform circumvention attempt */}
        {blockedModalPayload && (
          <div
            data-testid="gemini-interceptor-modal"
            className="absolute inset-0 z-50 bg-[#2C2724]/65 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          >
            <div className="w-full max-w-md rounded-xl bg-[#EBF0EC] border-2 border-[#7A907C] shadow-xl p-5 space-y-3.5 text-[#2C2724]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#7A907C]/20 text-[#2C2724] border border-[#7A907C] flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-[#7A907C]" />
                  </div>
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded-full bg-[#7A907C] text-white text-[10px] font-extrabold uppercase tracking-wider mb-0.5">
                      Anti-Leakage Shield Active
                    </span>
                    <h3 className="text-sm font-extrabold text-[#2C2724]">
                      Stay Protected on Fenn Rentals
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBlockedModalPayload(null)}
                  aria-label="Close safety reminder modal"
                  className="w-7 h-7 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/20 flex items-center justify-center text-[#2C2724]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-[#2C2724] leading-relaxed">
                Staying on Fenn protects both Renter and Host with our{' '}
                <strong>24-Hour Move-In Escrow Guarantee</strong> and{' '}
                <strong>automated roommate lease coverage</strong>. Moving payments or contact details off-platform (Zelle, Venmo, cash, WhatsApp, or wire) voids escrow protection.
              </p>

              <div className="p-3 rounded-xl bg-[#F9F7F3] border border-[#7A907C]/40 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between text-[#2C2724]/75">
                  <span className="font-bold">Gemini Off-Platform Scan:</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-[#EBF0EC] text-[#2C2724] border border-[#7A907C]/40">
                    {blockedModalPayload.modelUsed} • {blockedModalPayload.latencyMs}ms
                  </span>
                </div>
                <pre className="p-2 rounded-xl bg-[#2C2724] text-[#F9F7F3] font-mono text-[10px] overflow-x-auto">
                  {JSON.stringify(
                    {
                      is_off_platform_attempt: blockedModalPayload.is_off_platform_attempt,
                      confidence: blockedModalPayload.confidence,
                    },
                    null,
                    2
                  )}
                </pre>
                {blockedModalPayload.reason && (
                  <p className="text-[11px] text-[#2C2724] font-bold">
                    Flagged: {blockedModalPayload.reason}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setBlockedModalPayload(null);
                    setInputText('');
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#D06C4E] hover:bg-[#b85a3e] text-white font-extrabold text-xs shadow-sm transition-colors"
                >
                  Keep Chat Protected on Fenn
                </button>
                <button
                  type="button"
                  onClick={() => setBlockedModalPayload(null)}
                  className="py-2.5 px-3 rounded-xl bg-[#F9F7F3] hover:bg-white text-[#2C2724] border border-[#2C2724]/30 font-bold text-xs transition-colors"
                >
                  Edit Message
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Left Side: Conversation List (Inbox) */}
        <div
          className={`w-full ${
            inline ? 'flex-1' : 'md:w-80 border-r border-[#2C2724]/15'
          } bg-[#F2EFE9] flex flex-col ${
            activeConv ? (inline ? 'hidden' : 'hidden md:flex') : 'flex'
          }`}
        >
          <div className="p-4 border-b border-[#2C2724]/15 flex items-center justify-between bg-white">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#D06C4E]/15 text-[#D06C4E] flex items-center justify-center border border-[#D06C4E]/30">
                <MessageSquare className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-base text-[#2C2724]">Direct Messages</h2>
            </div>
            {!inline && (
              <button
                onClick={onClose}
                aria-label="Close Direct Messages"
                className="md:hidden w-8 h-8 rounded-xl bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Conversations list */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#2C2724]/10">
            {conversations.map((conv) => {
              const isSelected = conv.id === activeConv?.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`w-full p-3.5 flex items-start gap-3 text-left transition-colors ${
                    isSelected ? 'bg-white border-l-4 border-[#D06C4E]' : 'hover:bg-white/60'
                  }`}
                >
                  <div className="relative shrink-0">
                    <img
                      src={conv.host.avatar}
                      alt={conv.host.name}
                      className="w-11 h-11 rounded-full object-cover border border-[#2C2724]/20"
                    />
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D06C4E] text-white text-[10px] font-black rounded-full flex items-center justify-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-semibold text-xs text-[#2C2724] truncate flex items-center gap-1">
                        {conv.host.name}
                        {conv.host.verified && (
                          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40">
                            <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-[#6E655F]">{conv.lastMessageTime}</span>
                    </div>
                    <p className="text-[11px] text-[#485B4A] font-semibold truncate mb-1">
                      ${conv.roomPrice}/mo • {conv.roomTitle}
                    </p>
                    <p className="text-xs text-[#6E655F] truncate">{conv.lastMessage}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: Active Chat Thread */}
        {activeConv ? (
          <div className="flex-1 flex flex-col bg-[#F9F7F3] min-w-0 h-full">
            {/* Chat Header */}
            <div className="p-3.5 sm:p-4 border-b border-[#2C2724]/15 bg-white flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  onClick={() => onSelectConversation('')}
                  aria-label="Back to conversation list"
                  className={`${
                    inline ? 'flex' : 'md:hidden flex'
                  } w-8 h-8 rounded-xl bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724] items-center justify-center mr-1 shrink-0`}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div 
                  className="relative cursor-pointer group shrink-0"
                  onClick={() => onViewHostProfile(activeConv.host)}
                  title="View Host Profile"
                >
                  <img
                    src={activeConv.host.avatar}
                    alt={activeConv.host.name}
                    className="w-10 h-10 rounded-full object-cover border border-[#2C2724]/20 group-hover:border-[#D06C4E] transition-colors"
                  />
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#7A907C] border border-white rounded-full" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span 
                      className="font-bold text-sm text-[#2C2724] hover:text-[#D06C4E] cursor-pointer transition-colors truncate"
                      onClick={() => onViewHostProfile(activeConv.host)}
                    >
                      {activeConv.host.name}
                    </span>
                    {activeConv.host.verified && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40 px-2 py-0.5 rounded-full font-bold shrink-0">
                        <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                        <span>Verified Host</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Header Right Actions */}
              {!inline && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={onClose}
                    aria-label="Close Direct Messages Modal"
                    className="w-8 h-8 rounded-xl bg-[#F9F7F3] hover:bg-white text-[#2C2724] border border-[#2C2724] flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Messages Thread */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="text-center my-2">
                <span className="text-[11px] bg-white text-[#6E655F] px-3 py-1 rounded-full border border-[#2C2724]/15">
                  Direct message inquiry regarding {activeConv.roomTitle}
                </span>
              </div>

              {activeConv.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.isFromMe ? 'items-end' : 'items-start'}`}
                >
                  {/* Shared Room Card inside chat message */}
                  {msg.sharedListing && (
                    <div 
                      onClick={() => onViewRoomDetails(msg.sharedListing!.id)}
                      className="w-64 mb-1.5 p-2.5 rounded-2xl bg-white border border-[#2C2724]/20 shadow-warm-sm cursor-pointer hover:border-[#D06C4E] transition-all group"
                    >
                      <div className="relative h-28 rounded-xl overflow-hidden mb-2">
                        <img
                          src={msg.sharedListing.thumbnail}
                          alt={msg.sharedListing.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <span className="absolute bottom-1.5 left-1.5 text-xs font-bold bg-[#F9F7F3] text-[#2C2724] px-2 py-0.5 rounded-lg border border-[#2C2724]/20">
                          ${msg.sharedListing.price}/mo
                        </span>
                      </div>
                      <div className="text-xs font-bold text-[#2C2724] truncate mb-0.5">
                        {msg.sharedListing.title}
                      </div>
                      <div className="text-[10px] text-[#6E655F] flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-[#D06C4E]" />
                        <span>{msg.sharedListing.location}</span>
                      </div>
                    </div>
                  )}

                  {/* Tour Request Card if attached */}
                  {msg.tourRequest && (
                    <div className="w-64 mb-1.5 p-3 rounded-2xl bg-[#E8EFE9] border border-[#7A907C]/40 text-left shadow-warm-sm">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Calendar className="w-4 h-4 text-[#485B4A]" />
                        <span className="text-xs font-bold text-[#2C2724]">
                          {msg.tourRequest.type} Tour Request
                        </span>
                      </div>
                      <div className="text-xs text-[#2C2724] font-semibold">
                        {msg.tourRequest.date} at {msg.tourRequest.time}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-[#485B4A]">
                        <span>Status:</span>
                        <span className="font-bold uppercase px-1.5 py-0.5 rounded bg-white text-[#485B4A] border border-[#7A907C]/30">
                          {msg.tourRequest.status}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div
                    className={`max-w-[82%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-warm-sm ${
                      msg.isFromMe
                        ? 'bg-[#2C2724] text-[#F9F7F3] rounded-br-none'
                        : 'bg-white text-[#2C2724] rounded-bl-none border border-[#2C2724]/15'
                    }`}
                  >
                    {msg.text}
                    {msg.wasRedacted && (
                      <div className="mt-1.5 pt-1.5 border-t border-white/20 text-[10px] font-semibold text-[#F9F7F3]/90 flex items-center gap-1">
                        <Lock className="w-3 h-3 shrink-0" />
                        <span>[Hidden until booking is confirmed]</span>
                      </div>
                    )}
                  </div>

                  {/* Automated AI Safety Intervention Warning to Both Users */}
                  {msg.systemWarning && (
                    <div
                      data-testid="ai-safety-intervention-banner"
                      className="mt-2 w-full max-w-[92%] sm:max-w-[80%] p-3 rounded-2xl bg-[#F2EFE9] border border-[#D06C4E] text-[#2C2724] text-[11px] leading-relaxed flex items-start gap-2.5 shadow-warm-sm"
                    >
                      <AlertTriangle className="w-4 h-4 text-[#D06C4E] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-[#D06C4E] block mb-0.5">
                          Automated Trust & Safety Intervention (Visible to Both Users)
                        </span>
                        <span>{msg.systemWarning}</span>
                      </div>
                    </div>
                  )}

                  {/* Timestamp & read receipt */}
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-[#6E655F] px-1">
                    <span>{msg.timestamp}</span>
                    {msg.isFromMe && (
                      <CheckCheck className="w-3 h-3 text-[#7A907C]" />
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Tour Scheduler Drawer */}
            {showTourScheduler && (
              <div className="p-3 bg-white border-t border-[#2C2724]/15 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[#2C2724] flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#D06C4E]" />
                    <span>Schedule a Room Tour</span>
                  </div>
                  <button
                    onClick={() => setShowTourScheduler(false)}
                    className="text-[#6E655F] hover:text-[#2C2724]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-[#6E655F] font-semibold block mb-1">Date</label>
                    <input
                      type="date"
                      value={tourDate}
                      onChange={(e) => setTourDate(e.target.value)}
                      className="w-full bg-[#F9F7F3] text-[#2C2724] text-xs px-2.5 py-1.5 rounded-xl border border-[#2C2724]/25"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6E655F] font-semibold block mb-1">Preferred Time</label>
                    <select
                      value={tourTime}
                      onChange={(e) => setTourTime(e.target.value)}
                      className="w-full bg-[#F9F7F3] text-[#2C2724] text-xs px-2.5 py-1.5 rounded-xl border border-[#2C2724]/25"
                    >
                      <option>11:00 AM</option>
                      <option>1:00 PM</option>
                      <option>2:00 PM</option>
                      <option>4:30 PM</option>
                      <option>6:00 PM</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6E655F] font-semibold block mb-1">Tour Type</label>
                    <select
                      value={tourType}
                      onChange={(e) => setTourType(e.target.value as any)}
                      className="w-full bg-[#F9F7F3] text-[#2C2724] text-xs px-2.5 py-1.5 rounded-xl border border-[#2C2724]/25"
                    >
                      <option>In-person</option>
                      <option>Virtual Video Call</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleScheduleTour}
                  className="w-full py-2 bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-bold text-xs rounded-xl shadow-warm-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3 h-3" />
                  <span>Send Tour Request Invitation</span>
                </button>
              </div>
            )}

            {/* Input Form & Quick Action Buttons */}
            <div className="p-3 bg-white border-t border-[#2C2724]/15">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTourScheduler(!showTourScheduler)}
                  className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 transition-colors ${
                    showTourScheduler
                      ? 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724]'
                      : 'bg-[#F9F7F3] text-[#2C2724] border-[#2C2724] hover:bg-white'
                  }`}
                  title="Schedule a Tour"
                >
                  <Calendar className="w-4 h-4 text-[#D06C4E]" />
                  <span className="hidden sm:inline">Tour</span>
                </button>

                <button
                  type="button"
                  onClick={() => onViewRoomDetails(activeConv.roomId)}
                  data-testid="chat-room-details-btn"
                  aria-label="Room Details"
                  className="p-2 rounded-xl bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724] hover:bg-white text-xs font-bold flex items-center justify-center transition-colors"
                  title="Room Details"
                >
                  <Building2 className="w-4 h-4 text-[#D06C4E]" />
                </button>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex-1 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={`Message ${activeConv.host.name}...`}
                    className="flex-1 px-3.5 py-2.5 bg-[#F9F7F3] border border-[#2C2724]/30 rounded-xl text-[#2C2724] placeholder-[#6E655F] text-xs sm:text-sm focus:outline-none focus:border-[#2C2724] transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim() || isIntercepting}
                    aria-label="Send Message"
                    className="p-2.5 bg-[#D06C4E] hover:bg-[#b85b3f] disabled:opacity-40 text-white rounded-xl shadow-warm-sm transition-all active:scale-95"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#6E655F]">
            <MessageSquare className="w-12 h-12 mb-3 stroke-1 text-[#6E655F]" />
            <p className="text-sm">Select a conversation or start one from any room listing</p>
          </div>
        )}
      </div>
    </div>
  );
};
