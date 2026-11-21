import type { SavedVideoEdit } from './remotion/viral/editSettings';
export interface Host {
  id: string;
  name: string;
  avatar: string;
  verified: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  occupation: string;
  responseRate: string;
  rating: number;
  bio: string;
  joinedDate: string;
  totalListings?: number;
}

export interface Roommate {
  name: string;
  /** 1.0 demo rooms only; Fenly 2.0 never asks for or shows age (fair housing). */
  age?: number;
  role: string;
  avatar: string;
  vibe: string;
}

export interface StagedImage {
  id: string;
  url: string;
  style: string;
  size: '1K' | '2K' | '4K';
  createdAt: string;
  prompt: string;
}

export interface RoomListing {
  id: string;
  title: string;
  price: number;
  deposit: number;
  location: string;
  neighborhood: string;
  city: string;
  roomType: 'Private Room' | 'Master Suite' | 'Studio Sublet' | 'Shared Room' | 'Entire Place';
  spaceCategory?: 'room' | 'entire_place';
  leaseTerm: 'Month-to-month' | '3 Months' | '6 Months' | '9 Months' | '12+ Months';
  availableDate: string;
  squareFeet: number;
  amenities: string[];
  videoUrl: string;
  /** Fenly 2.0: room start times in the tour video (seconds), for left/right swipes */
  videoChapters?: number[];
  fallbackThumbnail: string;
  audioTrack: {
    title: string;
    artist: string;
  };
  host: Host;
  roommates: Roommate[];
  houseRules: string[];
  likesCount: number;
  savesCount: number;
  commentsCount: number;
  description: string;
  stagedImages?: StagedImage[];
  tourFormat?: 'live_walkthrough' | 'ai_photo_reel' | 'viral_edit';
  /** The edit behind a 'viral_edit' video, so the host can change it later (clips are kept on the device) */
  viralEdit?: SavedVideoEdit;
  coordinates?: {
    lat: number;
    lng: number;
  };
  distanceMiles?: number;
  customScenes?: {
    label: string;
    caption: string;
    imageUrl: string;
    videoUrl?: string;
    trimStart?: number;
    trimEnd?: number;
    playbackSpeed?: number;
    hookOverlay?: {
      line1_yellow: string;
      line2_white: string;
    };
    isCtaClip?: boolean;
    motionClass?: string;
  }[];
}

export interface Comment {
  id: string;
  roomId: string;
  author: {
    name: string;
    avatar: string;
    isLandlord?: boolean;
    isVerified?: boolean;
  };
  text: string;
  timestamp: string;
  likes: number;
  isLiked?: boolean;
}

export interface TourRequest {
  date: string;
  time: string;
  type: 'In-person' | 'Virtual Video Call';
  status: 'pending' | 'accepted' | 'declined';
}

export interface SharedListingCard {
  id: string;
  title: string;
  price: number;
  location: string;
  thumbnail: string;
  roomType: string;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  timestamp: string;
  isFromMe: boolean;
  status: 'sent' | 'delivered' | 'read';
  tourRequest?: TourRequest;
  sharedListing?: SharedListingCard;
  wasRedacted?: boolean;
  redactedTypes?: ('phone' | 'email' | 'link')[];
  systemWarning?: string;
}

export interface Conversation {
  id: string;
  roomId: string;
  roomTitle: string;
  roomPrice: number;
  roomLocation: string;
  roomThumbnail: string;
  host: Host;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: DirectMessage[];
  escrowStatus?: 'unfunded' | 'held_in_escrow' | 'released_on_move_in';
}

export interface FilterState {
  searchQuery: string;
  spaceCategory?: 'all' | 'room' | 'entire_place';
  city: string;
  neighborhood: string;
  minPrice: number;
  maxPrice: number;
  roomTypes: string[];
  amenities: string[];
  leaseTerms: string[];
  moveInDate?: string;
  instantMoveInOnly: boolean;
  utilitiesIncludedOnly: boolean;
  nearMeEnabled?: boolean;
  userCoords?: { lat: number; lng: number } | null;
  userLocationLabel?: string;
  minDistanceMiles?: number;
  maxDistanceMiles?: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  isEmailVerified: boolean;
  isIdVerified: boolean;
  avatar: string;
  bio: string;
  budgetMin: number;
  budgetMax: number;
  preferredLocations: string[];
  desiredAmenities: string[];
  occupation: string;
  moveInDate: string;
  lifestyle: {
    sleepSchedule: 'Early Bird' | 'Night Owl' | 'Flexible';
    workStyle: 'Remote' | 'Hybrid' | 'On-site';
    pets: 'Has Pet' | 'Loves Pets' | 'Allergic / No Pets';
    cleanliness: 'Very Clean' | 'Average' | 'Relaxed';
    socialVibe: 'Quiet & Private' | 'Social & Outgoing' | 'Balanced';
  };
  renterProfile?: {
    preferredMoveInDate: string;
    leaseDuration: 'Month to month' | '3 months' | '6 months' | '9 months' | '12 months' | '13+';
    incomePeriod: 'Annual' | 'Monthly';
    householdIncome: string;
    householdSize: '1' | '2' | '3' | '4' | '5+';
    preferredBedrooms: '0' | '1' | '2' | '3' | '4+';
    parkingNeeds: 'Yes' | 'No';
    pets: 'Yes' | 'No';
  };
}

export type ChatRole = 'lease_advisor' | 'roommate_concierge' | 'neighborhood_guide';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  modelUsed?: string;
}

export interface SubmittedApplication {
  id: string;
  roomId: string;
  roomTitle: string;
  roomPrice: number;
  roomLocation: string;
  roomThumbnail: string;
  hostName: string;
  applicantName: string;
  applicantEmail: string;
  applicantAvatar: string;
  applicantIncome: string;
  moveInDate: string;
  leaseTerm: string;
  submittedAt: string;
  status: 'Under Host Review' | 'Approved • Escrow Active' | 'Move-In Scheduled' | 'Declined';
  escrowAmount: number;
  idVerified: boolean;
  incomeVerified: boolean;
  backgroundCleared: boolean;
  note: string;
}

