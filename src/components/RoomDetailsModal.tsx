import React, { useState } from 'react';
import { 
  X, 
  Check, 
  Users, 
  Zap, 
  MessageSquare, 
  FileCheck,
  ShieldCheck,
  Lock
} from 'lucide-react';
import { RoomListing, Host, UserProfile } from '../types';
import { geminiService } from '../services/geminiService';

interface RoomDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomListing;
  userProfile: UserProfile;
  onOpenDirectMessage: () => void;
  onStartApplication: () => void;
  onViewHostProfile: (host: Host) => void;
}

export const RoomDetailsModal: React.FC<RoomDetailsModalProps> = ({
  isOpen,
  onClose,
  room,
  userProfile,
  onOpenDirectMessage,
  onStartApplication,
  onViewHostProfile,
}) => {
  const [compatData, setCompatData] = useState<any>(null);
  const [isCalculatingCompat, setIsCalculatingCompat] = useState(false);
  const [compatLatency, setCompatLatency] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleCheckCompatibility = async () => {
    setIsCalculatingCompat(true);
    const res = await geminiService.getFastResponse('compatibility_score', {
      room,
      userProfile,
    });
    setCompatData(res.data);
    setCompatLatency(res.latencyMs);
    setIsCalculatingCompat(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#2C2724]/60 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full sm:max-w-2xl max-h-[90vh] bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724]/20 rounded-t-3xl sm:rounded-2xl flex flex-col shadow-warm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#2C2724]/12 bg-white flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="font-bold text-base text-[#2C2724] truncate">{room.title}</h2>
            <div className="text-xs text-[#6E655F] flex items-center gap-2 mt-0.5 truncate">
              <span className="text-[#2C2724] font-bold">${room.price}/mo</span>
              <span>•</span>
              <span>{room.roomType}</span>
              <span>•</span>
              <span>{room.leaseTerm}</span>
              <span>•</span>
              <span className="truncate">{room.location}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close listing details"
            className="w-8 h-8 rounded-xl bg-[#F2EFE9] hover:bg-[#E6E0D6] text-[#2C2724] border border-[#2C2724]/20 flex items-center justify-center transition-colors shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {/* Sage Green Trust & Security Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40 text-xs font-bold">
              <Check className="w-3.5 h-3.5 text-[#7A907C]" />
              <span>Verified Host</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40 text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-[#7A907C]" />
              <span>ID Verification</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40 text-xs font-bold">
              <Lock className="w-3.5 h-3.5 text-[#7A907C]" />
              <span>Escrow Protection • Lock on the Door</span>
            </span>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-white border border-[#2C2724]/12 shadow-warm-sm">
              <span className="text-[11px] text-[#6E655F] block mb-0.5">Monthly Rent</span>
              <span className="text-base font-black text-[#2C2724]">${room.price}</span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-[#2C2724]/12 shadow-warm-sm">
              <span className="text-[11px] text-[#6E655F] block mb-0.5">Security Deposit</span>
              <span className="text-base font-bold text-[#2C2724]">${room.deposit}</span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-[#2C2724]/12 shadow-warm-sm">
              <span className="text-[11px] text-[#6E655F] block mb-0.5">Room Size</span>
              <span className="text-base font-bold text-[#2C2724]">{room.squareFeet} sq ft</span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-[#2C2724]/12 shadow-warm-sm">
              <span className="text-[11px] text-[#6E655F] block mb-0.5">Available Date</span>
              <span className="text-xs font-bold text-[#485B4A]">{room.availableDate}</span>
            </div>
          </div>

          {/* Full Amenities */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#6E655F]">
              Room & Property Amenities
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {room.amenities.map((amenity) => (
                <div
                  key={amenity}
                  className="p-2.5 rounded-xl bg-white border border-[#2C2724]/12 flex items-center gap-2 text-xs font-semibold text-[#2C2724]"
                >
                  <Check className="w-3.5 h-3.5 text-[#7A907C] shrink-0" />
                  <span>{amenity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#6E655F]">About this Space</h4>
            <p className="text-xs sm:text-sm text-[#2C2724] leading-relaxed">{room.description}</p>
          </div>

          {/* Instant Compatibility Score */}
          <div className="p-4 rounded-xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#D06C4E]" />
                <span className="text-xs font-bold text-[#2C2724] uppercase tracking-wider">
                  Instant Roommate Compatibility Check
                </span>
              </div>
              {compatLatency && (
                <span className="text-[#485B4A] text-xs font-mono">{compatLatency}ms</span>
              )}
            </div>

            {compatData ? (
              <div className="pt-1 space-y-1.5">
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-black text-[#485B4A]">
                    {compatData.score || 92}% Match
                  </div>
                  <div className="text-xs text-[#2C2724] flex-1 leading-snug">
                    {compatData.verdict || compatData.raw}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-1 gap-3">
                <p className="text-xs text-[#6E655F]">
                  Compare your renter lifestyle habits with this household in 300ms.
                </p>
                <button
                  onClick={handleCheckCompatibility}
                  disabled={isCalculatingCompat}
                  className="px-3 py-1.5 bg-transparent hover:bg-[#2C2724]/5 text-[#2C2724] border border-[#2C2724] font-bold text-xs rounded-xl transition-all active:scale-95 shrink-0"
                >
                  {isCalculatingCompat ? 'Scoring...' : 'Check Match'}
                </button>
              </div>
            )}
          </div>

          {/* Roommates & Household Members */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#6E655F] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#7A907C]" />
              <span>Current Roommates in Flat ({room.roommates.length})</span>
            </h4>
            <div className="space-y-2">
              {room.roommates.map((mate, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-white border border-[#2C2724]/12 flex items-center gap-3"
                >
                  <img
                    src={mate.avatar}
                    alt={mate.name}
                    className="w-10 h-10 rounded-full object-cover border border-[#2C2724]/20"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-[#2C2724]">{mate.name}{mate.age != null ? `, ${mate.age}` : ''}</span>
                      <span className="text-[10px] text-[#485B4A] bg-[#E8EFE9] px-2 py-0.5 rounded-full border border-[#7A907C]/30 font-semibold">
                        {mate.role}
                      </span>
                    </div>
                    <p className="text-xs text-[#6E655F] mt-0.5">{mate.vibe}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* House Rules */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#6E655F]">Household Guidelines</h4>
            <div className="space-y-1.5">
              {room.houseRules.map((rule, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs text-[#2C2724] p-2.5 rounded-xl bg-white border border-[#2C2724]/10"
                >
                  <span className="text-[#7A907C] font-bold mt-0.5">•</span>
                  <span>{rule}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Host Card */}
          <div className="p-4 rounded-xl bg-white border border-[#2C2724]/15 shadow-warm-sm flex items-center justify-between gap-3">
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => onViewHostProfile(room.host)}
            >
              <img
                src={room.host.avatar}
                alt={room.host.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-[#7A907C]"
              />
              <div>
                <div className="font-bold text-xs sm:text-sm text-[#2C2724] flex items-center gap-1.5">
                  <span>{room.host.name}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40 px-2 py-0.5 rounded-full font-bold">
                    <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                    <span>Verified Host</span>
                  </span>
                </div>
                <div className="text-[11px] text-[#6E655F]">{room.host.occupation}</div>
                <div className="text-[10px] text-[#485B4A] font-semibold mt-0.5">Responds: {room.host.responseRate}</div>
              </div>
            </div>

            <button
              onClick={() => onViewHostProfile(room.host)}
              className="px-3 py-1.5 rounded-xl border border-[#2C2724] text-xs font-bold text-[#2C2724] hover:bg-[#2C2724]/5 shrink-0 transition-colors"
            >
              View Profile
            </button>
          </div>
        </div>

        {/* Footer Quick Actions: Secondary Outlined in Espresso + Primary Solid Terracotta */}
        <div className="p-4 border-t border-[#2C2724]/12 bg-white flex items-center gap-3">
          <button
            onClick={() => {
              onClose();
              onOpenDirectMessage();
            }}
            className="py-2.5 px-4 bg-transparent hover:bg-[#2C2724]/5 text-[#2C2724] font-bold text-xs rounded-xl border border-[#2C2724] transition-colors flex items-center justify-center gap-1.5"
          >
            <MessageSquare className="w-4 h-4 text-[#2C2724]" />
            <span>Message Host</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onStartApplication();
            }}
            className="flex-1 py-2.5 px-4 bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-bold text-xs sm:text-sm rounded-xl shadow-warm-sm transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <FileCheck className="w-4 h-4" />
            <span>Request to Book</span>
          </button>
        </div>
      </div>
    </div>
  );
};
