import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  Mail, 
  Phone, 
  MapPin, 
  Sparkles, 
  Home, 
  Star, 
  MessageSquare, 
  Edit3, 
  Check, 
  Wand2,
  Plus,
  Video
} from 'lucide-react';
import { UserProfile, Host, RoomListing } from '../types';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  onUpdateUserProfile: (profile: Partial<UserProfile>) => void;
  selectedHost?: Host | null;
  allRooms: RoomListing[];
  onOpenDirectMessageWithHost: (host: Host, room: RoomListing) => void;
  onViewRoomDetails: (roomId: string) => void;
  onOpenAiDirector?: () => void;
  onOpenPostRoom?: () => void;
  initialTab?: 'renter' | 'lister';
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onUpdateUserProfile,
  selectedHost,
  allRooms,
  onOpenDirectMessageWithHost,
  onViewRoomDetails,
  onOpenAiDirector,
  onOpenPostRoom,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<'renter' | 'lister'>(
    initialTab || (selectedHost ? 'lister' : 'renter')
  );
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationSuccess, setVerificationSuccess] = useState(false);

  // Edit state for renter profile
  const [isEditing, setIsEditing] = useState(false);
  const [editBudgetMin, setEditBudgetMin] = useState(userProfile.budgetMin);
  const [editBudgetMax, setEditBudgetMax] = useState(userProfile.budgetMax);
  const [editBio, setEditBio] = useState(userProfile.bio);
  const [editOccupation, setEditOccupation] = useState(userProfile.occupation);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    } else if (selectedHost) {
      setActiveTab('lister');
    } else {
      setActiveTab('renter');
    }
  }, [initialTab, selectedHost, isOpen]);

  if (!isOpen) return null;

  const currentHost = selectedHost || allRooms[0].host;
  const hostListings = allRooms.filter((r) => r.host.id === currentHost.id);

  const handleVerifyEmail = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateUserProfile({ isEmailVerified: true });
    setVerificationSuccess(true);
    setTimeout(() => {
      setIsVerifyingEmail(false);
      setVerificationSuccess(false);
    }, 1500);
  };

  const handleSaveRenterProfile = () => {
    onUpdateUserProfile({
      budgetMin: editBudgetMin,
      budgetMax: editBudgetMax,
      bio: editBio,
      occupation: editOccupation,
    });
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full sm:max-w-2xl max-h-[92vh] bg-zinc-950 border border-zinc-800 sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Switcher Tabs */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('renter')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                activeTab === 'renter'
                  ? 'bg-white text-zinc-900 shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              My Renter Profile
            </button>
            <button
              onClick={() => setActiveTab('lister')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'lister'
                  ? 'bg-pink-500 text-white shadow-md shadow-pink-500/25'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Landlord / Lister Home ({currentHost.name.split(' ')[0]})</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {activeTab === 'renter' ? (
            /* --- RENTER PROFILE --- */
            <div className="space-y-6">
              {/* Profile Card Header */}
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                <div className="relative">
                  <img
                    src={userProfile.avatar}
                    alt={userProfile.name}
                    className="w-16 h-16 rounded-full object-cover border-2 border-emerald-400"
                  />
                  {userProfile.isEmailVerified && (
                    <div className="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center border-2 border-zinc-900" title="Verified Renter">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white truncate">{userProfile.name}</h3>
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      className="px-2.5 py-1 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{isEditing ? 'Cancel' : 'Edit Profile'}</span>
                    </button>
                  </div>
                  <p className="text-xs text-zinc-400">{userProfile.occupation}</p>
                  <p className="text-xs text-emerald-400 font-semibold mt-1">
                    Seeking room in: {userProfile.preferredLocations[0]}
                  </p>
                </div>
              </div>

              {/* Trust & Verification Section */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-900/40 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Trust &amp; Verification Status
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {/* Email verification card */}
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="text-xs font-semibold text-white">Email Verification</div>
                    </div>
                    {userProfile.isEmailVerified ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        <Check className="w-3 h-3 stroke-[3]" /> Verified
                      </span>
                    ) : (
                      <button
                        onClick={() => setIsVerifyingEmail(true)}
                        className="text-xs font-bold text-pink-400 hover:text-pink-300 underline"
                      >
                        Verify Now
                      </button>
                    )}
                  </div>

                  {/* ID verification */}
                  <a
                    href="https://verify.stripe.com/start/vs_renter_id"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between hover:border-emerald-500/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div className="text-xs font-semibold text-white">ID Verification</div>
                    </div>
                    <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      <Check className="w-3 h-3 stroke-[3]" /> Verified
                    </span>
                  </a>
                </div>

                {/* Email Verification Flow Modal / Box */}
                {isVerifyingEmail && (
                  <form onSubmit={handleVerifyEmail} className="p-3 rounded-xl bg-zinc-900 border border-pink-500/40 space-y-2 animate-fadeIn">
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-pink-400" />
                      <span>Enter verification code sent to {userProfile.email}</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. 582914"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg text-white text-xs"
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors"
                      >
                        Confirm & Verify
                      </button>
                    </div>
                    {verificationSuccess && (
                      <p className="text-xs text-emerald-400 font-bold">Email successfully verified!</p>
                    )}
                  </form>
                )}
              </div>

              {/* Renter Preferences: Budget, Location, Amenities */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                  Renter Housing Criteria
                </h4>

                {/* Budget */}
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-zinc-400 block mb-0.5">Target Monthly Budget</span>
                    <span className="text-sm font-bold text-emerald-400">
                      ${userProfile.budgetMin} – ${userProfile.budgetMax} / month
                    </span>
                  </div>
                  {isEditing && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editBudgetMin}
                        onChange={(e) => setEditBudgetMin(Number(e.target.value))}
                        className="w-20 px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs text-white"
                      />
                      <span className="text-zinc-500 text-xs">to</span>
                      <input
                        type="number"
                        value={editBudgetMax}
                        onChange={(e) => setEditBudgetMax(Number(e.target.value))}
                        className="w-20 px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs text-white"
                      />
                    </div>
                  )}
                </div>

                {/* Preferred Locations */}
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <span className="text-xs text-zinc-400 block">Preferred Neighborhoods</span>
                  <div className="flex flex-wrap gap-1.5">
                    {userProfile.preferredLocations.map((loc) => (
                      <span
                        key={loc}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-pink-500/10 text-pink-300 border border-pink-500/20 flex items-center gap-1"
                      >
                        <MapPin className="w-3 h-3 text-pink-400" />
                        {loc}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Desired Amenities */}
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <span className="text-xs text-zinc-400 block">Desired Amenities</span>
                  <div className="flex flex-wrap gap-1.5">
                    {userProfile.desiredAmenities.map((amenity) => (
                      <span
                        key={amenity}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 flex items-center gap-1"
                      >
                        <Check className="w-3 h-3 text-emerald-400" />
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Lifestyle & Compatibility */}
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2.5">
                  <span className="text-xs text-zinc-400 block">Lifestyle & Habits</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs">
                      <div className="text-[10px] text-zinc-500">Sleep Schedule</div>
                      <div className="font-semibold text-white">{userProfile.lifestyle.sleepSchedule}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs">
                      <div className="text-[10px] text-zinc-500">Work Style</div>
                      <div className="font-semibold text-white">{userProfile.lifestyle.workStyle}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs">
                      <div className="text-[10px] text-zinc-500">Pets</div>
                      <div className="font-semibold text-white">{userProfile.lifestyle.pets}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs">
                      <div className="text-[10px] text-zinc-500">Cleanliness</div>
                      <div className="font-semibold text-white">{userProfile.lifestyle.cleanliness}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs">
                      <div className="text-[10px] text-zinc-500">Social Vibe</div>
                      <div className="font-semibold text-white">{userProfile.lifestyle.socialVibe}</div>
                    </div>
                  </div>
                </div>

                {/* Bio & About */}
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1.5">
                  <span className="text-xs text-zinc-400 block">About Taylor</span>
                  {isEditing ? (
                    <textarea
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      rows={3}
                      className="w-full p-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs text-white"
                    />
                  ) : (
                    <p className="text-xs text-zinc-200 leading-relaxed">{userProfile.bio}</p>
                  )}
                </div>

                {isEditing && (
                  <button
                    onClick={handleSaveRenterProfile}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-colors"
                  >
                    Save Changes
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* --- LISTER / LANDLORD HOME PROFILE --- */
            <div className="space-y-6">
              {/* LANDLORD AI DIRECTOR & CREATOR STUDIO CARD */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-pink-950/60 via-purple-950/40 to-zinc-900 border border-pink-500/40 space-y-3 shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-500 to-amber-500 text-white flex items-center justify-center shrink-0 shadow-md">
                      <Wand2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                        <span>Landlord AI Video Director</span>
                        <span className="text-[10px] bg-pink-500/20 text-pink-300 border border-pink-500/30 px-1.5 py-0.2 rounded font-bold">
                          Creator Tool
                        </span>
                      </h4>
                      <p className="text-xs text-zinc-300 mt-0.5">
                        Step-by-step recording instructions for each room scenario, AI auto-edit scriptwriter, and Yelp/Belly/Google walkability integration.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {onOpenAiDirector && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenAiDirector();
                      }}
                      className="flex-1 py-2.5 px-4 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold text-xs rounded-xl shadow-md shadow-pink-500/20 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Launch Landlord AI Director & Recording Guide</span>
                    </button>
                  )}
                  {onOpenPostRoom && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenPostRoom();
                      }}
                      className="py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl border border-zinc-700 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Post New Room</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Host Header */}
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                <div className="relative">
                  <img
                    src={currentHost.avatar}
                    alt={currentHost.name}
                    className="w-16 h-16 rounded-full object-cover border-2 border-pink-500"
                  />
                  <div className="absolute bottom-0 right-0 w-5 h-5 bg-pink-500 text-white rounded-full flex items-center justify-center border-2 border-zinc-900">
                    <Star className="w-3 h-3 fill-white stroke-none" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-base font-bold text-white truncate">{currentHost.name}</h3>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-bold">
                      Verified Lister
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">{currentHost.occupation}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs">
                    <span className="flex items-center gap-1 text-amber-400 font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      {currentHost.rating}
                    </span>
                    <span className="text-zinc-500">•</span>
                    <span className="text-zinc-400">{currentHost.joinedDate}</span>
                  </div>
                </div>
              </div>

              {/* Verified Trust Badges */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-center">
                  <Mail className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                  <div className="text-[11px] font-semibold text-white">Email Verified</div>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-center">
                  <Phone className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                  <div className="text-[11px] font-semibold text-white">Phone Verified</div>
                </div>
                <a
                  href="https://verify.stripe.com/start/vs_landlord_id"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-emerald-500/40 text-center transition-colors block"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                  <div className="text-[11px] font-semibold text-white">ID Verified</div>
                </a>
              </div>

              {/* Host Bio */}
              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1.5">
                <span className="text-xs font-bold text-white block">About {currentHost.name}</span>
                <p className="text-xs text-zinc-300 leading-relaxed">{currentHost.bio}</p>
                <div className="pt-2 flex items-center gap-2 text-xs text-zinc-400">
                  <span className="font-semibold text-emerald-400">Response Rate:</span>
                  <span>{currentHost.responseRate}</span>
                </div>
              </div>

              {/* Rooms Listed by this Host */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Home className="w-3.5 h-3.5 text-pink-400" />
                    Rooms Offered by {currentHost.name} ({hostListings.length})
                  </h4>
                </div>

                <div className="space-y-2.5">
                  {hostListings.map((room) => (
                    <div
                      key={room.id}
                      className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-3 hover:border-zinc-700 transition-colors"
                    >
                      <div 
                        className="flex items-center gap-3 min-w-0 cursor-pointer"
                        onClick={() => onViewRoomDetails(room.id)}
                      >
                        <img
                          src={room.fallbackThumbnail}
                          alt={room.title}
                          className="w-14 h-14 rounded-xl object-cover border border-zinc-700 shrink-0"
                        />
                        <div className="min-w-0">
                          <h5 className="font-bold text-xs text-white truncate hover:text-pink-400">
                            {room.title}
                          </h5>
                          <p className="text-xs text-emerald-400 font-bold mt-0.5">
                            ${room.price}/month • {room.roomType}
                          </p>
                          <p className="text-[11px] text-zinc-400 truncate flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-pink-400" />
                            {room.location}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => onOpenDirectMessageWithHost(currentHost, room)}
                        className="px-3 py-2 bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1 shrink-0 active:scale-95"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Message</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
