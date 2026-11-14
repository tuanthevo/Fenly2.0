import React, { useState } from 'react';
import { X, Copy, Check, Share2, MessageCircle, Mail, Send, MapPin } from 'lucide-react';
import { RoomListing } from '../types';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomListing;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, room }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}/#room-${room.id}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2C2724]/60 backdrop-blur-xs animate-fadeIn font-['Plus_Jakarta_Sans','Inter',sans-serif]"
      onClick={onClose}
    >
      <div
        data-testid="share-room-modal"
        className="w-full max-w-sm bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724] rounded-2xl p-5 shadow-warm space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#2C2724]/15 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 flex items-center justify-center">
              <Share2 className="w-3.5 h-3.5" />
            </div>
            <h3 className="font-extrabold text-sm text-[#2C2724]">Share Listing Tour</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Share Modal"
            className="w-7 h-7 rounded-xl bg-white hover:bg-[#F2EFE9] text-[#2C2724] border border-[#2C2724]/25 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Room Preview Card */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-[#2C2724]/20 shadow-warm-sm">
          <img
            src={room.fallbackThumbnail}
            alt={room.title}
            className="w-14 h-14 rounded-xl object-cover shrink-0 border border-[#2C2724]/15"
          />
          <div className="min-w-0">
            <h4 className="font-extrabold text-xs text-[#2C2724] truncate">{room.title}</h4>
            <div className="text-xs font-extrabold text-[#485B4A] mt-0.5">${room.price}/month</div>
            <div className="text-[11px] text-[#6E655F] truncate flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-[#D06C4E] shrink-0" />
              <span className="truncate">{room.location}</span>
            </div>
          </div>
        </div>

        {/* Link Copy Box */}
        <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-[#2C2724]">
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="flex-1 bg-transparent text-xs font-semibold text-[#2C2724] px-1.5 focus:outline-none truncate"
          />
          <button
            type="button"
            onClick={handleCopyLink}
            className="px-3.5 py-1.5 bg-[#D06C4E] hover:bg-[#b85b3f] text-white rounded-xl text-xs font-extrabold transition-all flex items-center gap-1 shrink-0 shadow-warm-sm"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>

        {/* Quick Social Buttons */}
        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
          <button
            type="button"
            onClick={handleCopyLink}
            className="p-2.5 rounded-xl bg-white hover:bg-[#F2EFE9] text-[#2C2724] text-xs font-extrabold border border-[#2C2724]/20 flex flex-col items-center gap-1 shadow-warm-sm transition-colors"
          >
            <MessageCircle className="w-4 h-4 text-[#7A907C]" />
            <span className="text-[10px]">Messages</span>
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="p-2.5 rounded-xl bg-white hover:bg-[#F2EFE9] text-[#2C2724] text-xs font-extrabold border border-[#2C2724]/20 flex flex-col items-center gap-1 shadow-warm-sm transition-colors"
          >
            <Mail className="w-4 h-4 text-[#D06C4E]" />
            <span className="text-[10px]">Email</span>
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="p-2.5 rounded-xl bg-white hover:bg-[#F2EFE9] text-[#2C2724] text-xs font-extrabold border border-[#2C2724]/20 flex flex-col items-center gap-1 shadow-warm-sm transition-colors"
          >
            <Send className="w-4 h-4 text-[#2C2724]" />
            <span className="text-[10px]">Direct SMS</span>
          </button>
        </div>
      </div>
    </div>
  );
};

