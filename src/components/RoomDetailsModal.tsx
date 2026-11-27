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
import { useFlag } from '../config/FlagsProvider';
import { hostInitials, roomDetailsView } from '../find/roomDetails';

/** A person's photo, or their initials when there is none or it fails to load. */
const Avatar: React.FC<{ src: string; name: string; className: string }> = ({ src, name, className }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span aria-hidden="true" className={`${className} bg-[#EBF0EC] text-[#485B4A] font-extrabold text-xs flex items-center justify-center shrink-0`}>
        {hostInitials(name)}
      </span>
    );
  }
  return <img src={src} alt="" onError={() => setFailed(true)} className={`${className} object-cover shrink-0`} />;
};

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
  const escrowOn = useFlag('home_extras');

  if (!isOpen) return null;
  const view = roomDetailsView(room, { escrow: escrowOn });

  const handleCheckCompatibility = async () => {
    setIsCalculatingCompat(true);
    const res = await geminiService.getFastResponse('compatibility_score', {
      room,
      userProfile,
    });
    setCompatData(res.data);
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
            className="w-10 h-10 rounded-xl bg-[#F2EFE9] hover:bg-[#E6E0D6] text-[#2C2724] border border-[#2C2724]/20 flex items-center justify-center transition-colors shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {/* Trust badges: only the ones this room's data backs */}
          {view.badges.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {view.badges.map((badge) => (
                <span key={badge} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40 text-xs font-bold">
                  {badge === 'Move-in escrow' ? <Lock className="w-3.5 h-3.5 text-[#485B4A]" /> : <ShieldCheck className="w-3.5 h-3.5 text-[#485B4A]" />}
                  <span>{badge}</span>
                </span>
              ))}
            </div>
          )}

          {/* Key facts: a tile only when the host gave the value */}
          <div className="grid grid-cols-2 gap-2.5">
            {view.tiles.map((tile) => (
              <div key={tile.label} className="p-3 rounded-xl bg-white border border-[#2C2724]/12">
                <span className="text-xs text-[#6E655F] block mb-0.5">{tile.label}</span>
                <span className="text-base font-extrabold text-[#2C2724]">{tile.value}</span>
              </div>
            ))}
          </div>

          {/* Full Amenities */}
          {room.amenities.length > 0 && (
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
          )}

          {/* Description */}
          {room.description.trim() && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#6E655F]">About this Space</h4>
              <p className="text-sm text-[#2C2724] leading-relaxed">{room.description}</p>
            </div>
          )}

          {/* Instant Compatibility Score */}
          <div className="p-4 rounded-xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#D06C4E]" />
                <span className="text-xs font-bold text-[#2C2724] uppercase tracking-wider">
                  Instant Roommate Compatibility Check
                </span>
              </div>
            </div>

            {compatData ? (
              <div className="pt-1 space-y-1.5">
                <div className="flex items-center gap-3">
                  {compatData.score != null && (
                    <div className="text-2xl font-black text-[#485B4A]">{compatData.score}% Match</div>
                  )}
                  <div className="text-xs text-[#2C2724] flex-1 leading-snug">
                    {compatData.verdict || compatData.raw}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-1 gap-3">
                <p className="text-xs text-[#6E655F]">
                  See how your day-to-day habits fit this household.
                </p>
                <button
                  onClick={handleCheckCompatibility}
                  disabled={isCalculatingCompat}
                  className="min-h-10 px-3 py-1.5 bg-transparent hover:bg-[#2C2724]/5 text-[#2C2724] border border-[#2C2724] font-bold text-xs rounded-xl transition-all active:scale-95 shrink-0"
                >
                  {isCalculatingCompat ? 'Checking' : 'Check match'}
                </button>
              </div>
            )}
          </div>

          {/* Housemates: only when the host added some */}
          {view.showRoommates && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#6E655F] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#485B4A]" />
                <span>Current housemates ({room.roommates.length})</span>
              </h4>
              <div className="space-y-2">
                {room.roommates.map((mate, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white border border-[#2C2724]/12 flex items-center gap-3">
                    <Avatar src={mate.avatar} name={mate.name} className="w-10 h-10 rounded-full border border-[#2C2724]/20" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-[#2C2724]">{mate.name}{mate.age != null ? `, ${mate.age}` : ''}</span>
                        <span className="text-[11px] text-[#485B4A] bg-[#E8EFE9] px-2 py-0.5 rounded-full border border-[#7A907C]/30 font-semibold">
                          {mate.role}
                        </span>
                      </div>
                      {mate.vibe && <p className="text-xs text-[#6E655F] mt-0.5">{mate.vibe}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* House rules: only when the host wrote some */}
          {view.showRules && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#6E655F]">House rules</h4>
              <ul className="space-y-1.5">
                {room.houseRules.map((rule, i) => (
                  <li key={i} className="text-xs text-[#2C2724] p-2.5 rounded-xl bg-white border border-[#2C2724]/10">
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Host Card */}
          <div className="p-4 rounded-xl bg-white border border-[#2C2724]/15 flex items-center justify-between gap-3">
            <button type="button" className="flex items-center gap-3 min-w-0 text-left" onClick={() => onViewHostProfile(room.host)}>
              <Avatar src={room.host.avatar} name={room.host.name} className="w-12 h-12 rounded-full border-2 border-[#7A907C]" />
              <span className="min-w-0">
                <span className="font-bold text-sm text-[#2C2724] flex items-center gap-1.5 flex-wrap">
                  <span>{room.host.name}</span>
                  {view.host.verified && (
                    <span className="inline-flex items-center gap-1 text-[11px] bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40 px-2 py-0.5 rounded-full font-bold">
                      <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                      <span>Verified</span>
                    </span>
                  )}
                </span>
                {view.host.occupation && <span className="block text-xs text-[#6E655F]">{view.host.occupation}</span>}
                {view.host.responds && <span className="block text-xs text-[#485B4A] font-semibold mt-0.5">Responds: {view.host.responds}</span>}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onViewHostProfile(room.host)}
              className="min-h-10 px-3 py-1.5 rounded-xl border border-[#2C2724] text-xs font-bold text-[#2C2724] hover:bg-[#2C2724]/5 shrink-0 transition-colors"
            >
              View profile
            </button>
          </div>
        </div>

        {/* Footer: message the host, or apply (white text sits on the darker terracotta) */}
        <div className="p-4 border-t border-[#2C2724]/12 bg-white flex items-center gap-3">
          <button
            onClick={() => {
              onClose();
              onOpenDirectMessage();
            }}
            className="min-h-11 py-2.5 px-4 bg-transparent hover:bg-[#2C2724]/5 text-[#2C2724] font-bold text-xs rounded-xl border border-[#2C2724] transition-colors flex items-center justify-center gap-1.5"
          >
            <MessageSquare className="w-4 h-4 text-[#2C2724]" />
            <span>Message host</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onStartApplication();
            }}
            className="flex-1 min-h-11 py-2.5 px-4 bg-[#B85B3F] hover:bg-[#A9513A] text-white font-extrabold text-sm rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <FileCheck className="w-4 h-4" />
            <span>Apply</span>
          </button>
        </div>
      </div>
    </div>
  );
};
