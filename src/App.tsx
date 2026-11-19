import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
  ArrowLeft,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { 
  RoomListing, 
  FilterState, 
  Conversation, 
  Host, 
  UserProfile, 
  StagedImage,
  SubmittedApplication
} from './types';
import { INITIAL_ROOMS, INITIAL_CONVERSATIONS } from './data/mockRooms';
import {
  isHostListing,
  loadSavedListings,
  mergeSavedListings,
  syncSavedListings,
} from './utils/listingStore';
import { INITIAL_USER_PROFILE } from './data/userProfile';
import {
  maskAndScanMessage,
  DEFAULT_WARNING_BANNER,
  createInitialAskFennHistory,
  startNewAskFennChatAndSaveHistory,
  AskFennChatSession,
  isRoomAvailableOnOrBeforeMoveIn,
  MasterLeaseConfig,
} from './utils/trustSafety';
import { geminiService } from './services/geminiService';

import { HeaderNav } from './components/HeaderNav';
import { FilterBar } from './components/FilterBar';
import { VideoPlayer } from './components/VideoPlayer';
import { SidebarActions } from './components/SidebarActions';
import { VideoInfoOverlay } from './components/VideoInfoOverlay';
import { useHistoryNav } from './utils/historyNav';
import { LOCATION_PRESETS } from './data/locationPresets';
import { HOME_NAV_START, type HomeNav } from './components/homeNav';
import { lazyComponent, lazyModal, lazyScreen } from './utils/lazyComponent';

// Code-split screens and modals: the app shell (Find feed, nav, sign-in) loads first;
// everything else downloads when it's opened. Hidden 1.0 screens never load unless their flag is on.
const FilterModal = lazyModal(() => import('./components/FilterModal').then((m) => m.FilterModal));
const DirectMessagingModal = lazyModal(() => import('./components/DirectMessagingModal').then((m) => m.DirectMessagingModal));
const GeminiChatbotModal = lazyModal(() => import('./components/GeminiChatbotModal').then((m) => m.GeminiChatbotModal));
const AiStagingStudioModal = lazyModal(() => import('./components/AiStagingStudioModal').then((m) => m.AiStagingStudioModal));
const RoomDetailsModal = lazyModal(() => import('./components/RoomDetailsModal').then((m) => m.RoomDetailsModal));
const ApplicationModal = lazyModal(() => import('./components/ApplicationModal').then((m) => m.ApplicationModal));
const UserProfileModal = lazyModal(() => import('./components/UserProfileModal').then((m) => m.UserProfileModal));
const PostRoomModal = lazyModal(() => import('./components/PostRoomModal').then((m) => m.PostRoomModal));
const AiDirectorStudioModal = lazyModal(() => import('./components/AiDirectorStudioModal').then((m) => m.AiDirectorStudioModal));
const ShareModal = lazyModal(() => import('./components/ShareModal').then((m) => m.ShareModal));
const FennStickerSheetModal = lazyModal(() => import('./components/FennMascot').then((m) => m.FennStickerSheetModal));
const FennMascot = lazyComponent(() => import('./components/FennMascot').then((m) => m.FennMascot));
const EditListingModal = lazyComponent(() => import('./components/EditListingModal').then((m) => m.EditListingModal));
const ExploreNeighborhoodView = lazyScreen(() => import('./components/ExploreNeighborhoodView').then((m) => m.ExploreNeighborhoodView));
const HomeHubView = lazyScreen(() => import('./components/HomeHubView').then((m) => m.HomeHubView));
const AskFennView = lazyScreen(() => import('./components/AskFennView').then((m) => m.AskFennView));
const MyDenView = lazyScreen(() => import('./components/MyDenView').then((m) => m.MyDenView));
const HouseOsView = lazyScreen(() => import('./components/HouseOsView').then((m) => m.HouseOsView));
const PassportView = lazyScreen(() => import('./components/PassportView').then((m) => m.PassportView));
const FillStatusView = lazyScreen(() => import('./components/fill/FillStatusView').then((m) => m.FillStatusView));
const InboxView = lazyScreen(() => import('./components/find/InboxView').then((m) => m.InboxView));
const ApplicantInbox = lazyScreen(() => import('./components/find/ApplicantInbox').then((m) => m.ApplicantInbox));
const ReviewQueue = lazyScreen(() => import('./components/find/ReviewQueue').then((m) => m.ReviewQueue));
const MetricsView = lazyScreen(() => import('./components/find/MetricsView').then((m) => m.MetricsView));
const FillFlow = lazyComponent(() => import('./components/fill/FillFlow').then((m) => m.FillFlow));
const ApplySheet = lazyComponent(() => import('./components/fill/ApplySheet').then((m) => m.ApplySheet));
import { BottomNavBar, FennTab } from './components/BottomNavBar';
import { FenlyNavBar } from './components/FenlyNavBar';
import { NavMenu } from './components/NavMenu';
import { SignInSheet, type SignInReason } from './components/SignInSheet';
import { useFlags } from './config/FlagsProvider';
import { fallbackTab, isTabAllowed } from './config/featureFlags';
import { useAuth } from './auth/AuthProvider';
import { needsSignIn } from './utils/authGuards';
import { trackEvent } from './lib/analytics';
import { FillHome } from './components/fill/FillHome';
import { parseStoredVia, rememberVia, viaForListing } from './fill/attribution';
import { todayIn } from './fill/fillStatus';
import { FindFilterBar } from './components/find/FindFilterBar';
import { ReportSheet } from './components/find/ReportSheet';
import { findApi } from './lib/findApi';
import { InstallPrompt } from './components/InstallPrompt';
import {
  DB_ROOM_PREFIX,
  EMPTY_FIND_FILTERS,
  dbListingId,
  isDbRoomId,
  matchesFindFilters,
  toIsoDate,
  toRoomListing,
  type FindFilters,
  type FindListing,
} from './find/findFilters';
import { isListingId } from './fill/linkCodes';

/** The screen being shown: a bottom tab, a full-screen overlay ('post' or 'edit:<id>'), and the Home page. */
type AppNav = { tab: FennTab; overlay: string | null; home: HomeNav };

export default function App() {
  // --- STATE ---
  const [rooms, setRooms] = useState<RoomListing[]>(INITIAL_ROOMS);

  // Listings the host publishes, edits or deletes are kept on this device (IndexedDB) so
  // they and their videos survive a reload. Nothing is saved until the saved ones
  // have loaded, so a quick save can't wipe them.
  const [savedListingsLoaded, setSavedListingsLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadSavedListings()
      .then(({ rooms: saved, deletedIds }) => {
        if (cancelled) return;
        // Merge first, outside React's updater, so a bad record can't half-apply
        const merged = mergeSavedListings(saved, INITIAL_ROOMS, deletedIds);
        if (saved.length > 0 || deletedIds.length > 0) {
          setRooms((prev) => {
            // Keep anything published while loading
            const ids = new Set(merged.map((r) => r.id));
            return [...prev.filter((r) => !ids.has(r.id) && !INITIAL_ROOMS.some((b) => b.id === r.id)), ...merged];
          });
        }
        // Only now may saving start: saving makes storage match the feed, so starting it
        // after a failed load would erase everything that was saved
        setSavedListingsLoaded(true);
      })
      .catch((error) => {
        console.warn('Could not load saved listings; saving is off for this visit so nothing is overwritten:', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // What to save: the host's own listings, plus built-in listings the host edited or deleted
  const builtInJson = useMemo(() => new Map(INITIAL_ROOMS.map((r) => [r.id, JSON.stringify(r)])), []);
  const roomsToSave = useMemo(
    () => rooms.filter((r) => isHostListing(r) || (builtInJson.has(r.id) && builtInJson.get(r.id) !== JSON.stringify(r))),
    [rooms, builtInJson]
  );
  const deletedBuiltInIds = useMemo(() => {
    const present = new Set(rooms.map((r) => r.id));
    return INITIAL_ROOMS.filter((r) => !present.has(r.id)).map((r) => r.id);
  }, [rooms]);
  const saveKey = useMemo(() => JSON.stringify([roomsToSave, deletedBuiltInIds]), [roomsToSave, deletedBuiltInIds]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!savedListingsLoaded) return;
    // One save at a time, in order
    saveQueueRef.current = saveQueueRef.current
      .then(() => syncSavedListings(roomsToSave, deletedBuiltInIds))
      .catch((error) => console.warn('Could not save listings:', error));
    // saveKey changes exactly when something to save changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveKey, savedListingsLoaded]);
  const [currentRoomIndex, setCurrentRoomIndex] = useState<number>(0);
  const [rapidSwipeCount, setRapidSwipeCount] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  // Screens live in the browser history: the phone's back / forward gestures move between
  // tabs, Home pages, Create Listing and Edit Listing instead of leaving the app.
  const { nav, navigate, back: goBack, canGoBack } = useHistoryNav<AppNav>({
    tab: 'listings',
    overlay: null,
    home: HOME_NAV_START,
  });
  const activeTab = nav.tab;
  // Fenly 2.0: hidden features (flags) and sign-in at Apply / Publish
  const { flags, loaded: flagsLoaded, supabaseConfigured } = useFlags();
  const auth = useAuth();
  const setActiveTab = useCallback(
    (requested: FennTab) => {
      // A tab whose feature is hidden lands on its 2.0 home instead (Home -> Fill, others -> Find)
      const tab = fallbackTab(requested, flags);
      // Opening Home (or Fill, which shows Home's landlord pages) from another tab starts on its main page
      navigate((prev) => ({
        ...prev,
        tab,
        home: (tab === 'home' || tab === 'fill') && prev.tab !== tab ? HOME_NAV_START : prev.home,
      }));
    },
    [navigate, flags]
  );
  // A tab restored from history whose flag is off goes to its fallback once the flags have loaded
  useEffect(() => {
    if (flagsLoaded && !isTabAllowed(activeTab, flags)) {
      navigate((prev) => ({ ...prev, tab: fallbackTab(prev.tab, flags) }), { replace: true });
    }
  }, [flagsLoaded, flags, activeTab, navigate]);
  const [signInReason, setSignInReason] = useState<SignInReason | null>(null);
  const closeSignIn = useCallback(() => setSignInReason(null), []);
  const requireAccount = (action: 'apply' | 'publish', proceed: () => void) => {
    if (needsSignIn(action, { configured: auth.configured, signedIn: Boolean(auth.user) })) {
      trackEvent(action === 'apply' ? 'apply_gate_shown' : 'publish_gate_shown');
      setSignInReason(action);
      return;
    }
    proceed();
  };
  useEffect(() => {
    trackEvent('app_open', { tab: activeTab });
    // once per page load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (activeTab === 'listings') trackEvent('feed_view');
  }, [activeTab]);
  const handleHomeNavChange = useCallback(
    (patch: Partial<HomeNav>) => navigate((prev) => ({ ...prev, home: { ...prev.home, ...patch } })),
    [navigate]
  );
  const [isStickerSheetOpen, setIsStickerSheetOpen] = useState<boolean>(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState<boolean>(false);
  const [askFennSessions, setAskFennSessions] = useState<AskFennChatSession[]>(() =>
    createInitialAskFennHistory(INITIAL_ROOMS)
  );
  const [activeAskFennSessionId, setActiveAskFennSessionId] = useState<string>(
    'fenn-chat-fresh-init'
  );

  const handleStartNewAskFennChat = useCallback(() => {
    const newId = `fenn-chat-${Date.now()}`;
    setAskFennSessions((prev) => {
      const next = startNewAskFennChatAndSaveHistory(prev, rooms, newId, 'Just now');
      return next.sessions;
    });
    setActiveAskFennSessionId(newId);
  }, [rooms]);

  const handleSelectNavTab = useCallback(
    (tab: FennTab) => {
      if (tab === 'ask_fenn') {
        handleStartNewAskFennChat();
      }
      setActiveTab(tab);
    },
    [handleStartNewAskFennChat]
  );

  useEffect(() => {
    const handleQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  // Likes & Pinned Rooms
  const [likedRoomIds, setLikedRoomIds] = useState<Set<string>>(new Set(['room-1']));
  const [pinnedRoomIds, setPinnedRoomIds] = useState<Set<string>>(new Set(['room-1', 'room-3']));

  // Fenly 2.0 Find (with Supabase): published rooms from the database, demo rooms behind a flag
  const findMode = flagsLoaded && supabaseConfigured;
  const [findFilters, setFindFilters] = useState<FindFilters>(EMPTY_FIND_FILTERS);
  const [findListings, setFindListings] = useState<FindListing[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ id: string; hostId: string | null } | null>(null);
  const [inboxThreadId, setInboxThreadId] = useState<string | null>(null);
  const [findNotice, setFindNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!findMode) return;
    let alive = true;
    const load = savedOnly && auth.user ? findApi.savedListings() : findApi.feed(findFilters);
    load
      .then((data) => alive && setFindListings(data.listings))
      .catch(() => alive && setFindListings([]));
    return () => {
      alive = false;
    };
  }, [findMode, findFilters, savedOnly, auth.user]);
  // Saved rooms follow the account once signed in (rooms saved while signed out are synced up)
  useEffect(() => {
    if (!findMode || !auth.user) return;
    let alive = true;
    findApi
      .savedIds()
      .then(async ({ listingIds }) => {
        if (!alive) return;
        const server = new Set(listingIds.map((id) => `${DB_ROOM_PREFIX}${id}`));
        let local: string[] = [];
        setPinnedRoomIds((prev) => {
          local = [...prev].filter((id) => isDbRoomId(id) && !server.has(id));
          return new Set([...prev, ...server]);
        });
        await Promise.all(local.map((id) => findApi.save(dbListingId(id)!).catch(() => undefined)));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [findMode, auth.user]);

  // User Profile
  const [userProfile, setUserProfile] = useState<UserProfile>(INITIAL_USER_PROFILE);
  const [selectedHostForProfile, setSelectedHostForProfile] = useState<Host | null>(null);
  const [profileInitialTab, setProfileInitialTab] = useState<'renter' | 'lister'>('renter');

  // Shared Landlord / Master Tenant Lease Configuration (prepopulates Renter lease dropdowns)
  const [masterLeaseConfig, setMasterLeaseConfig] = useState<MasterLeaseConfig>({
    landlordName: 'Sarah Chen',
    tenantName: INITIAL_USER_PROFILE.name || 'Alex Rivera',
    monthlyRent: 1200,
    securityDeposit: 1200,
    leaseTerm: '12+ Months',
    earliestMoveInDate: INITIAL_USER_PROFILE.renterProfile?.preferredMoveInDate || '2026-11-01',
    ruleMax2OvernightGuests: true,
    ruleQuietHoursWeekdays: true,
    ruleNoSmokingIndoors: true,
  });

  // Filtering State (includes Move-In Date synced with Renter profile default)
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    spaceCategory: 'all',
    city: '',
    neighborhood: '',
    minPrice: 500,
    maxPrice: 3500,
    roomTypes: [],
    amenities: [],
    leaseTerms: [],
    moveInDate: INITIAL_USER_PROFILE.renterProfile?.preferredMoveInDate || '2026-11-01',
    instantMoveInOnly: false,
    utilitiesIncludedOnly: false,
    nearMeEnabled: false,
    userCoords: null,
    userLocationLabel: '',
    maxDistanceMiles: 0,
  });

  // Conversations & Direct Messaging
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS);
  const [activeConversationId, setActiveConversationId] = useState<string | null>('conv-sarah');

  // Submitted Applications (shared between Renter Applications status & Landlord Applications review)
  const [submittedApplications, setSubmittedApplications] = useState<SubmittedApplication[]>([
    {
      id: 'app-101',
      roomId: 'room-1',
      roomTitle: 'Sun-Drenched Mission Loft Room',
      roomPrice: 1450,
      roomLocation: 'Mission District, San Francisco, CA',
      roomThumbnail:
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80',
      hostName: 'Sarah Miller',
      applicantName: 'Alex Rivera',
      applicantEmail: 'alex.rivera@fennrentals.com',
      applicantAvatar:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      applicantIncome: '$115,000/yr',
      moveInDate: '2026-11-01',
      leaseTerm: '12+ Months',
      submittedAt: 'Oct 26, 2026',
      status: 'Approved • Escrow Active',
      escrowAmount: 1200,
      idVerified: true,
      incomeVerified: true,
      backgroundCleared: true,
      note: 'Signed California Room Rental Agreement & funded $1,200 Move-In Escrow.',
    },
    {
      id: 'app-102',
      roomId: 'room-2',
      roomTitle: 'Williamsburg Skyline Studio',
      roomPrice: 1650,
      roomLocation: 'Williamsburg, Brooklyn, NY',
      roomThumbnail:
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80',
      hostName: 'Marcus Vance',
      applicantName: 'Alex Rivera',
      applicantEmail: 'alex.rivera@fennrentals.com',
      applicantAvatar:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      applicantIncome: '$115,000/yr',
      moveInDate: '2026-11-15',
      leaseTerm: '6 Months',
      submittedAt: 'Oct 27, 2026',
      status: 'Under Host Review',
      escrowAmount: 1200,
      idVerified: true,
      incomeVerified: true,
      backgroundCleared: true,
      note: 'Remote product designer, quiet weeknights, verified payroll & ID attached.',
    },
  ]);

  // Modals
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isDmModalOpen, setIsDmModalOpen] = useState(false);
  const [isChatbotModalOpen, setIsChatbotModalOpen] = useState(false);
  const [isAiStagingOpen, setIsAiStagingOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isApplicationModalOpen, setIsApplicationModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const isPostRoomOpen = nav.overlay === 'post';
  const setIsPostRoomOpen = useCallback(
    (open: boolean) =>
      navigate((prev) => ({ ...prev, overlay: open ? 'post' : prev.overlay === 'post' ? null : prev.overlay })),
    [navigate]
  );
  // Sign-in comes before the application form, and before Create Listing so a
  // recorded tour isn't lost to the email-link / Google redirect.
  const openApplication = () => requireAccount('apply', () => setIsApplicationModalOpen(true));
  const openPostRoom = () => requireAccount('publish', () => setIsPostRoomOpen(true));

  // Fenly 2.0 Fill: the flow ('fill:new' / 'fill:<id>') and a listing's status ('status:<id>')
  // are history entries, so the phone's back gesture closes them.
  const fillOverlay = nav.overlay?.startsWith('fill:') ? nav.overlay.slice('fill:'.length) : null;
  const fillListingId = fillOverlay && fillOverlay !== 'new' && isListingId(fillOverlay) ? fillOverlay : null;
  const statusListingId =
    nav.overlay?.startsWith('status:') && isListingId(nav.overlay.slice('status:'.length))
      ? nav.overlay.slice('status:'.length)
      : null;
  const openFill = (listingId: string | null) =>
    requireAccount('publish', () => navigate((prev) => ({ ...prev, overlay: `fill:${listingId ?? 'new'}` })));
  const closeOverlay = () => navigate((prev) => ({ ...prev, overlay: null }));
  const openFillStatus = (listingId: string, replace = false) =>
    navigate((prev) => ({ ...prev, tab: 'fill', overlay: `status:${listingId}` }), { replace });

  // Apply from a shared link: /?apply=<listing id>&via=<link code>. The request (and the
  // channel it came through) is kept on the device, so it survives the sign-in round trip.
  const [applyTarget, setApplyTarget] = useState<{ listingId: string; via: string | null } | null>(null);
  useEffect(() => {
    const read = (key: string) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    };
    const write = (key: string, value: string | null) => {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        // private mode: attribution just won't persist
      }
    };
    const now = Date.now();
    const params = new URLSearchParams(window.location.search);
    const apply = params.get('apply');
    let target: string | null = null;
    if (apply && isListingId(apply)) {
      const via = params.get('via');
      const next = rememberVia(parseStoredVia(read('fenlyVia')), { code: via, listingId: apply, direct: !via }, now);
      write('fenlyVia', next ? JSON.stringify(next) : null);
      write('fenlyPendingApply', JSON.stringify({ listingId: apply, at: now }));
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash);
      target = apply;
    } else {
      try {
        const pending = JSON.parse(read('fenlyPendingApply') ?? 'null');
        if (pending && isListingId(pending.listingId) && now - pending.at < 2 * 3600_000) target = pending.listingId;
      } catch {
        // ignore
      }
    }
    if (target) setApplyTarget({ listingId: target, via: viaForListing(parseStoredVia(read('fenlyVia')), target, now) });
  }, []);
  // Find & Apply overlays: a room's applicants ('applicants:<id>'), the review queue ('review')
  const applicantsListingId =
    nav.overlay?.startsWith('applicants:') && isListingId(nav.overlay.slice('applicants:'.length))
      ? nav.overlay.slice('applicants:'.length)
      : null;
  const reviewOpen = nav.overlay === 'review';
  const metricsOpen = nav.overlay === 'metrics';
  const openApplicants = (listingId: string) => navigate((prev) => ({ ...prev, tab: 'fill', overlay: `applicants:${listingId}` }));
  const openThread = (applicationId: string) => {
    setInboxThreadId(applicationId);
    navigate((prev) => ({ ...prev, tab: 'messages', overlay: null }));
  };
  const openDbApply = (listingId: string) => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('fenlyVia');
    } catch {
      // ignore
    }
    setApplyTarget({ listingId, via: viaForListing(parseStoredVia(stored), listingId, Date.now()) });
  };

  // Deep links from emails and invites: ?house=<token>, ?inbox=<application id>, ?passport=..., ?applicants=<id>, ?fill=<id>
  const [pendingHouse, setPendingHouse] = useState<string | null>(() => {
    try {
      return localStorage.getItem('fenlyPendingHouse');
    } catch {
      return null;
    }
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let handled = false;
    const house = params.get('house');
    if (house && /^[A-Za-z0-9_-]{32}$/.test(house)) {
      try {
        localStorage.setItem('fenlyPendingHouse', house);
      } catch {
        // private mode: the invite works while this tab stays open
      }
      setPendingHouse(house);
      handled = true;
    }
    const inbox = params.get('inbox');
    if (inbox) {
      if (isListingId(inbox)) setInboxThreadId(inbox);
      navigate((prev) => ({ ...prev, tab: 'messages', overlay: null }), { replace: true });
      handled = true;
    }
    if (params.get('passport')) {
      navigate((prev) => ({ ...prev, tab: 'passport', overlay: null }), { replace: true });
      handled = true;
    }
    const applicants = params.get('applicants');
    if (applicants && isListingId(applicants)) {
      navigate((prev) => ({ ...prev, tab: 'fill', overlay: `applicants:${applicants}` }), { replace: true });
      handled = true;
    }
    const report = params.get('report');
    if (report && isListingId(report)) {
      setPendingReport(report);
      navigate((prev) => ({ ...prev, tab: 'listings', overlay: null }), { replace: true });
      handled = true;
    }
    const fill = params.get('fill');
    if (fill && isListingId(fill)) {
      navigate((prev) => ({ ...prev, tab: 'fill', overlay: `status:${fill}` }), { replace: true });
      handled = true;
    }
    if (handled) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash);
    // once per page load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Reporting from the public listing page (/r/...): sign in first, then the report sheet opens
  const [pendingReport, setPendingReport] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingReport || !auth.ready) return;
    if (!auth.user) {
      if (auth.configured) setSignInReason('report');
      return;
    }
    setReportTarget({ id: pendingReport, hostId: null });
    setPendingReport(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingReport, auth.ready, auth.user]);

  // A housemate invite needs an account: ask to sign in, then join and open the applicants
  useEffect(() => {
    if (!pendingHouse || !auth.ready) return;
    if (!auth.user) {
      if (auth.configured) setSignInReason('house');
      return;
    }
    const clear = () => {
      setPendingHouse(null);
      try {
        localStorage.removeItem('fenlyPendingHouse');
      } catch {
        // ignore
      }
    };
    findApi
      .redeemInvite(pendingHouse)
      .then((r) => {
        clear();
        setFindNotice(r.alreadyMember ? null : `You joined the house${r.neighborhood ? ` in ${r.neighborhood}` : ''}. Vote on applicants with a thumbs up or down.`);
        navigate((prev) => ({ ...prev, tab: 'fill', overlay: `applicants:${r.listingId}` }));
      })
      .catch((e) => {
        clear();
        setFindNotice(e?.body?.message ?? "That invite link didn't work. Ask the host for a new one.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHouse, auth.ready, auth.user]);

  const closeApply = () => {
    setApplyTarget(null);
    try {
      localStorage.removeItem('fenlyPendingApply');
    } catch {
      // ignore
    }
  };
  const [isAiDirectorOpen, setIsAiDirectorOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  // Haversine formula to calculate distance in miles between two GPS coordinates
  const getDistanceMiles = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 3958.8; // Earth radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // --- FILTERING & SHARED LOCATION LOGIC ---
  const legacyFilteredRooms = useMemo(() => {
    const cityQuery = filters.city.trim().toLowerCase();
    const matchedPreset = cityQuery
      ? LOCATION_PRESETS.find(
          (p) =>
            p.label.toLowerCase() === cityQuery ||
            p.zip.toLowerCase() === cityQuery ||
            (p.neighborhood && p.neighborhood.toLowerCase() === cityQuery) ||
            p.city.toLowerCase() === cityQuery ||
            p.label.toLowerCase().includes(cityQuery) ||
            cityQuery.includes(p.zip.toLowerCase())
        )
      : undefined;

    const effectiveCoords =
      filters.userCoords ||
      matchedPreset?.coords ||
      (filters.maxDistanceMiles && filters.maxDistanceMiles > 0
        ? rooms[0]?.coordinates || null
        : null);

    const roomsWithDistance = rooms.map((room) => {
      if (effectiveCoords && room.coordinates) {
        const dist = getDistanceMiles(
          effectiveCoords.lat,
          effectiveCoords.lng,
          room.coordinates.lat,
          room.coordinates.lng
        );
        return { ...room, distanceMiles: dist };
      }
      return { ...room, distanceMiles: undefined };
    });

    const effectiveMoveInDate =
      filters.moveInDate !== undefined
        ? filters.moveInDate
        : userProfile.renterProfile?.preferredMoveInDate || '2026-11-01';

    const matched = roomsWithDistance.filter((room) => {
      // Only show listings that are currently available OR will be available at the move-in date or prior
      if (
        !isRoomAvailableOnOrBeforeMoveIn(
          room.availableDate,
          effectiveMoveInDate,
          '2026-10-28'
        )
      ) {
        return false;
      }

      // Search Query
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesTitle = room.title.toLowerCase().includes(query);
        const matchesLoc = room.location.toLowerCase().includes(query);
        const matchesDesc = room.description.toLowerCase().includes(query);
        if (!matchesTitle && !matchesLoc && !matchesDesc) return false;
      }

      // Space Category Filter: A Room vs. Entire Place
      if (filters.spaceCategory && filters.spaceCategory !== 'all') {
        const roomCat =
          room.spaceCategory ||
          (room.roomType === 'Entire Place' || room.roomType === 'Studio Sublet'
            ? 'entire_place'
            : 'room');
        if (roomCat !== filters.spaceCategory) return false;
      }

      // Mile Radius Filter (if maxDistanceMiles > 0 and reference coords exist)
      const hasRadiusFilter =
        Boolean(filters.maxDistanceMiles && filters.maxDistanceMiles > 0) &&
        room.distanceMiles !== undefined;

      if (hasRadiusFilter && filters.maxDistanceMiles) {
        if ((room.distanceMiles ?? 99999) > filters.maxDistanceMiles) return false;
        if (
          filters.minDistanceMiles &&
          filters.minDistanceMiles > 1 &&
          (room.distanceMiles ?? 0) < filters.minDistanceMiles
        ) {
          return false;
        }
      }

      // City, State, Zip Code, or Neighborhood Filter
      if (cityQuery && !hasRadiusFilter) {
        const roomCity = room.city.toLowerCase();
        const roomHood = room.neighborhood.toLowerCase();
        const roomLoc = room.location.toLowerCase();
        const directMatch =
          roomCity.includes(cityQuery) ||
          cityQuery.includes(roomCity) ||
          roomHood.includes(cityQuery) ||
          cityQuery.includes(roomHood) ||
          roomLoc.includes(cityQuery);

        const presetMatch = matchedPreset
          ? matchedPreset.neighborhood
            ? roomHood.includes(matchedPreset.neighborhood.toLowerCase()) ||
              roomLoc.includes(matchedPreset.neighborhood.toLowerCase())
            : roomCity.includes(matchedPreset.city.toLowerCase())
          : false;

        if (!directMatch && !presetMatch) {
          return false;
        }
      }

      // Neighborhood
      if (
        filters.neighborhood &&
        !room.neighborhood.toLowerCase().includes(filters.neighborhood.toLowerCase()) &&
        !room.location.toLowerCase().includes(filters.neighborhood.toLowerCase())
      ) {
        return false;
      }

      // Price Range (min & max)
      if (room.price < filters.minPrice || room.price > filters.maxPrice) {
        return false;
      }

      // Room Type
      if (filters.roomTypes.length > 0 && !filters.roomTypes.includes(room.roomType)) {
        return false;
      }

      // Amenities (Must match all selected amenities)
      if (filters.amenities.length > 0) {
        const hasAllAmenities = filters.amenities.every((req) => {
          return room.amenities.some(
            (a) => a.toLowerCase().includes(req.toLowerCase()) || req.toLowerCase().includes(a.toLowerCase())
          );
        });
        if (!hasAllAmenities) return false;
      }

      // Lease Term
      if (filters.leaseTerms.length > 0 && !filters.leaseTerms.includes(room.leaseTerm)) {
        return false;
      }

      // Special Toggles
      if (filters.instantMoveInOnly && !room.availableDate.toLowerCase().includes('immediately')) {
        return false;
      }

      if (
        filters.utilitiesIncludedOnly &&
        !room.amenities.some((a) => a.toLowerCase().includes('utilities'))
      ) {
        return false;
      }

      return true;
    });

    // When Shared Location is enabled, sort listings from closest to farthest
    if (filters.nearMeEnabled && filters.userCoords) {
      matched.sort((a, b) => (a.distanceMiles ?? 99999) - (b.distanceMiles ?? 99999));
    }

    return matched;
  }, [rooms, filters, userProfile.renterProfile?.preferredMoveInDate]);

  const findRooms = useMemo(() => {
    const today = todayIn(new Date());
    const real = findListings.map((l) => toRoomListing(l, today));
    const demo = flags.demo_listings
      ? rooms.filter((r) =>
          matchesFindFilters(
            { neighborhood: r.neighborhood, rentCents: r.price * 100, availableFrom: toIsoDate(r.availableDate, today) },
            findFilters
          )
        )
      : [];
    const all = [...real, ...demo];
    return savedOnly ? all.filter((r) => pinnedRoomIds.has(r.id)) : all;
  }, [findListings, flags.demo_listings, rooms, findFilters, savedOnly, pinnedRoomIds]);
  const filteredRooms = findMode ? findRooms : legacyFilteredRooms;

  // Keep index within bounds
  useEffect(() => {
    if (currentRoomIndex >= filteredRooms.length) {
      setCurrentRoomIndex(Math.max(0, filteredRooms.length - 1));
    }
  }, [filteredRooms.length, currentRoomIndex]);

  const currentRoom = filteredRooms[currentRoomIndex] || filteredRooms[0] || rooms[0];
  const pinnedRoomsList = useMemo(
    () => rooms.filter((r) => pinnedRoomIds.has(r.id)),
    [rooms, pinnedRoomIds]
  );

  // --- ACTIONS & MOBILE NATIVE SCROLL-SNAP + SWIPE ---
  const lastRoomSwitchRef = useRef<number>(0);
  const feedScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const feedTouchStartYRef = useRef<number | null>(null);
  const feedTouchLastYRef = useRef<number | null>(null);
  const feedScrollTopStartRef = useRef<number>(0);

  const scrollToRoomIndex = useCallback(
    (targetIdx: number) => {
      if (filteredRooms.length <= 0) return;
      const clampedIdx =
        ((targetIdx % filteredRooms.length) + filteredRooms.length) %
        filteredRooms.length;
      setCurrentRoomIndex(clampedIdx);
      const el = feedScrollContainerRef.current;
      if (el && el.clientHeight > 0) {
        el.scrollTo({
          top: clampedIdx * el.clientHeight,
          behavior: 'smooth',
        });
      }
    },
    [filteredRooms.length]
  );

  const handleNextRoom = useCallback(() => {
    if (filteredRooms.length <= 1) return;
    const now = Date.now();
    if (now - lastRoomSwitchRef.current < 240) return;
    lastRoomSwitchRef.current = now;
    const nextIdx = (currentRoomIndex + 1) % filteredRooms.length;
    scrollToRoomIndex(nextIdx);
    setRapidSwipeCount((prev) => prev + 1);
  }, [filteredRooms.length, currentRoomIndex, scrollToRoomIndex]);

  const handlePrevRoom = useCallback(() => {
    if (filteredRooms.length <= 1) return;
    const now = Date.now();
    if (now - lastRoomSwitchRef.current < 240) return;
    lastRoomSwitchRef.current = now;
    const prevIdx =
      (currentRoomIndex - 1 + filteredRooms.length) % filteredRooms.length;
    scrollToRoomIndex(prevIdx);
    setRapidSwipeCount((prev) => prev + 1);
  }, [filteredRooms.length, currentRoomIndex, scrollToRoomIndex]);

  const handleFeedNativeScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.clientHeight <= 0) return;
    const newIdx = Math.round(el.scrollTop / el.clientHeight);
    if (
      newIdx >= 0 &&
      newIdx < filteredRooms.length &&
      newIdx !== currentRoomIndex
    ) {
      lastRoomSwitchRef.current = Date.now();
      setCurrentRoomIndex(newIdx);
    }
  };

  const handleFeedTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) {
      feedTouchStartYRef.current = e.touches[0].clientY;
      feedTouchLastYRef.current = e.touches[0].clientY;
      feedScrollTopStartRef.current =
        feedScrollContainerRef.current?.scrollTop ?? 0;
    }
  };

  const handleFeedTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0 && feedTouchStartYRef.current !== null) {
      feedTouchLastYRef.current = e.touches[0].clientY;
    }
  };

  const finishFeedTouch = (endY?: number) => {
    if (feedTouchStartYRef.current === null) return;
    const finalY =
      endY ?? feedTouchLastYRef.current ?? feedTouchStartYRef.current;
    const deltaY = feedTouchStartYRef.current - finalY;
    const scrollMoved = Math.abs(
      (feedScrollContainerRef.current?.scrollTop ?? 0) -
        feedScrollTopStartRef.current
    );
    feedTouchStartYRef.current = null;
    feedTouchLastYRef.current = null;

    // Fallback if browser didn't natively scroll the container
    if (scrollMoved < 20) {
      if (deltaY > 40) {
        handleNextRoom();
      } else if (deltaY < -40) {
        handlePrevRoom();
      }
    }
  };

  const handleFeedWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY > 35) {
      handleNextRoom();
    } else if (e.deltaY < -35) {
      handlePrevRoom();
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (activeTab !== 'listings') return;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        handleNextRoom();
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        handlePrevRoom();
      } else if (e.key === 'm') {
        setIsMuted((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextRoom, handlePrevRoom, activeTab]);

  const handleToggleLike = (roomId?: string) => {
    const targetId = roomId || currentRoom.id;
    setLikedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) {
        next.delete(targetId);
      } else {
        next.add(targetId);
      }
      return next;
    });
  };

  const handleTogglePin = (roomId?: string) => {
    const targetId = roomId || currentRoom.id;
    const listingId = dbListingId(targetId);
    if (findMode && listingId && auth.user) {
      const saving = !pinnedRoomIds.has(targetId);
      (saving ? findApi.save(listingId) : findApi.unsave(listingId)).catch(() =>
        setPinnedRoomIds((prev) => {
          const next = new Set(prev);
          if (saving) next.delete(targetId);
          else next.add(targetId);
          return next;
        })
      );
    }
    setPinnedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) {
        next.delete(targetId);
      } else {
        next.add(targetId);
      }
      return next;
    });
  };

  const handleUpdateFilters = (partial: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  };

  const handleResetFilters = () => {
    setFilters({
      searchQuery: '',
      spaceCategory: 'all',
      city: '',
      neighborhood: '',
      minPrice: 500,
      maxPrice: 3500,
      roomTypes: [],
      amenities: [],
      leaseTerms: [],
      moveInDate: userProfile.renterProfile?.preferredMoveInDate || '2026-11-01',
      instantMoveInOnly: false,
      utilitiesIncludedOnly: false,
      nearMeEnabled: false,
      userCoords: null,
      userLocationLabel: '',
      maxDistanceMiles: 0,
    });
  };

  // --- DIRECT MESSAGING INITIATION ---
  const handleOpenDirectMessage = (targetRoom?: RoomListing) => {
    const roomToMsg = targetRoom || currentRoom;
    if (!roomToMsg) return;

    let existingConv = conversations.find((c) => c.host.id === roomToMsg.host.id);

    if (!existingConv) {
      const newConv: Conversation = {
        id: `conv-${roomToMsg.host.id}-${Date.now()}`,
        roomId: roomToMsg.id,
        roomTitle: roomToMsg.title,
        roomPrice: roomToMsg.price,
        roomLocation: roomToMsg.location,
        roomThumbnail: roomToMsg.fallbackThumbnail,
        host: roomToMsg.host,
        lastMessage: 'Started inquiry regarding this room',
        lastMessageTime: 'Just now',
        unreadCount: 0,
        messages: [
          {
            id: `m-init-${Date.now()}`,
            conversationId: `conv-${roomToMsg.host.id}`,
            senderId: 'me',
            text: `Hi ${roomToMsg.host.name}! I'm interested in renting your room in ${roomToMsg.location}. Is it still available?`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isFromMe: true,
            status: 'sent',
            sharedListing: {
              id: roomToMsg.id,
              title: roomToMsg.title,
              price: roomToMsg.price,
              location: roomToMsg.location,
              thumbnail: roomToMsg.fallbackThumbnail,
              roomType: roomToMsg.roomType,
            },
          },
        ],
      };

      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
    } else {
      setActiveConversationId(existingConv.id);
    }

    setIsDmModalOpen(true);
  };

  const handleOpenDirectMessageWithHost = (host: Host, room: RoomListing) => {
    handleOpenDirectMessage(room);
  };

  const handleBookTourViaWren = (
    roomToBook: RoomListing,
    _promptLabel: string,
    wrenConfirmation: string
  ) => {
    let existingConv = conversations.find((c) => c.host.id === roomToBook.host.id);
    const tourMsgText = `🐦 Wren Scheduled Tour (Tue 5:30 PM): "${wrenConfirmation}"`;

    if (!existingConv) {
      const newConv: Conversation = {
        id: `conv-${roomToBook.host.id}-${Date.now()}`,
        roomId: roomToBook.id,
        roomTitle: roomToBook.title,
        roomPrice: roomToBook.price,
        roomLocation: roomToBook.location,
        roomThumbnail: roomToBook.fallbackThumbnail,
        host: roomToBook.host,
        lastMessage: tourMsgText,
        lastMessageTime: 'Just now',
        unreadCount: 1,
        messages: [
          {
            id: `m-wren-tour-${Date.now()}`,
            conversationId: `conv-${roomToBook.host.id}`,
            senderId: 'me',
            text: tourMsgText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isFromMe: true,
            status: 'delivered',
            tourRequest: {
              date: 'Tue, Nov 3',
              time: '5:30 PM',
              type: 'In-person',
              status: 'accepted',
            },
          },
        ],
      };
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
    } else {
      handleSendMessage(existingConv.id, tourMsgText, undefined, {
        date: 'Tue, Nov 3',
        time: '5:30 PM',
        type: 'In-person',
        status: 'accepted',
      });
    }
  };

  const handleSubmitApplication = (applicationNote: string, moveInDate: string, leaseTerm: string) => {
    const roomToMsg = currentRoom;
    if (!roomToMsg) return;

    const newApp: SubmittedApplication = {
      id: `app-${Date.now()}`,
      roomId: roomToMsg.id,
      roomTitle: roomToMsg.title,
      roomPrice: roomToMsg.price,
      roomLocation: roomToMsg.location,
      roomThumbnail: roomToMsg.fallbackThumbnail,
      hostName: roomToMsg.host.name,
      applicantName: userProfile.name,
      applicantEmail: userProfile.email,
      applicantAvatar: userProfile.avatar,
      applicantIncome: `$${userProfile.renterProfile?.householdIncome || '115,000'}/yr`,
      moveInDate,
      leaseTerm,
      submittedAt: 'Just now',
      status: 'Under Host Review',
      escrowAmount: 1200,
      idVerified: true,
      incomeVerified: true,
      backgroundCleared: true,
      note: applicationNote,
    };

    setSubmittedApplications((prev) => {
      const filtered = prev.filter((a) => a.roomId !== roomToMsg.id);
      return [newApp, ...filtered];
    });

    let existingConv = conversations.find((c) => c.host.id === roomToMsg.host.id);
    const appMsgText = `📄 Rental Application Submitted (Move-in: ${moveInDate}, Term: ${leaseTerm}): "${applicationNote}"`;

    if (!existingConv) {
      const newConv: Conversation = {
        id: `conv-${roomToMsg.host.id}-${Date.now()}`,
        roomId: roomToMsg.id,
        roomTitle: roomToMsg.title,
        roomPrice: roomToMsg.price,
        roomLocation: roomToMsg.location,
        roomThumbnail: roomToMsg.fallbackThumbnail,
        host: roomToMsg.host,
        lastMessage: appMsgText,
        lastMessageTime: 'Just now',
        unreadCount: 0,
        messages: [
          {
            id: `m-app-${Date.now()}`,
            conversationId: `conv-${roomToMsg.host.id}`,
            senderId: 'me',
            text: appMsgText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isFromMe: true,
            status: 'sent',
            sharedListing: {
              id: roomToMsg.id,
              title: roomToMsg.title,
              price: roomToMsg.price,
              location: roomToMsg.location,
              thumbnail: roomToMsg.fallbackThumbnail,
              roomType: roomToMsg.roomType,
            },
          },
        ],
      };
      setConversations((prev) => [
        { ...newConv, escrowStatus: 'held_in_escrow' },
        ...prev,
      ]);
      setActiveConversationId(newConv.id);
    } else {
      handleSendMessage(existingConv.id, appMsgText, {
        id: roomToMsg.id,
        title: roomToMsg.title,
        price: roomToMsg.price,
        location: roomToMsg.location,
        thumbnail: roomToMsg.fallbackThumbnail,
        roomType: roomToMsg.roomType,
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === existingConv.id ? { ...c, escrowStatus: 'held_in_escrow' } : c
        )
      );
      setActiveConversationId(existingConv.id);
    }

    setIsDmModalOpen(true);
  };

  const handleUpdateEscrowStatus = (
    convId: string,
    status: 'unfunded' | 'held_in_escrow' | 'released_on_move_in'
  ) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, escrowStatus: status } : c))
    );
  };

  const handleSendMessage = (
    convId: string,
    text: string,
    sharedListing?: any,
    tourRequest?: any
  ) => {
    const targetConv = conversations.find((c) => c.id === convId);
    const isEscrowCleared =
      targetConv?.escrowStatus === 'held_in_escrow' ||
      targetConv?.escrowStatus === 'released_on_move_in';

    const scan = maskAndScanMessage(text, isEscrowCleared);
    const msgId = `msg-${Date.now()}`;

    const newMsg = {
      id: msgId,
      conversationId: convId,
      senderId: 'me',
      text: scan.sanitizedText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isFromMe: true,
      status: 'delivered' as const,
      sharedListing,
      tourRequest,
      wasRedacted: scan.wasRedacted,
      redactedTypes: scan.redactedTypes,
      systemWarning: scan.warningBannerText || undefined,
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === convId) {
          return {
            ...c,
            lastMessage: scan.sanitizedText,
            lastMessageTime: 'Just now',
            messages: [...c.messages, newMsg],
          };
        }
        return c;
      })
    );

    if (!isEscrowCleared && !scan.circumventionDetected) {
      geminiService
        .getFastResponse('trust_safety_check', { messageText: text })
        .then((res) => {
          if (res.data?.flagged) {
            const aiWarning = res.data.warning || DEFAULT_WARNING_BANNER;
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === msgId ? { ...m, systemWarning: aiWarning } : m
                  ),
                };
              })
            );
          }
        })
        .catch(() => {});
    }

    // Simulated host reply after 1.8s
    setTimeout(() => {
      const replies = scan.circumventionDetected
        ? [
            "Let's keep our chat and deposit on Fenn Rentals so you stay covered by the Move-In Guarantee escrow protection and we get the free digital lease & background check!",
          ]
        : [
            "Hi! Thanks for your application & message on Fenn Rentals! I'd love to chat and set up a walkthrough.",
            "Hello! Thank you for reaching out. Your profile looks like a great fit for the household!",
            "Sounds wonderful! Looking forward to meeting you and showing you the space.",
          ];
      const randomReply = replies[Math.floor(Math.random() * replies.length)];

      const hostReply = {
        id: `msg-reply-${Date.now()}`,
        conversationId: convId,
        senderId: 'host',
        text: randomReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isFromMe: false,
        status: 'read' as const,
      };

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === convId) {
            return {
              ...c,
              lastMessage: randomReply,
              lastMessageTime: 'Just now',
              messages: [...c.messages, hostReply],
            };
          }
          return c;
        })
      );
    }, 1800);
  };

  const handleViewHostProfile = (host: Host) => {
    setSelectedHostForProfile(host);
    setProfileInitialTab('lister');
    setIsProfileModalOpen(true);
  };

  const handleViewRoomDetails = (roomId: string) => {
    trackEvent('listing_open', { room: roomId });
    const foundIdx = filteredRooms.findIndex((r) => r.id === roomId);
    if (foundIdx !== -1) {
      setCurrentRoomIndex(foundIdx);
    }
    setIsDetailsModalOpen(true);
  };

  const handleSelectRoomAndWatch = (roomId: string) => {
    handleResetFilters();
    const foundIdx = rooms.findIndex((r) => r.id === roomId);
    if (foundIdx !== -1) {
      setCurrentRoomIndex(foundIdx);
    }
    setActiveTab('listings');
  };

  const handleSaveStagedImageToRoom = (roomId: string, stagedImage: StagedImage) => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id === roomId) {
          return {
            ...r,
            stagedImages: [...(r.stagedImages || []), stagedImage],
          };
        }
        return r;
      })
    );
  };

  const handlePublishRoom = (newRoom: RoomListing) => {
    setRooms((prev) => [newRoom, ...prev]);
    setCurrentRoomIndex(0);
    // Replace the Create Listing step: back from the feed returns to Home, not to the finished form
    navigate((prev) => ({ ...prev, tab: 'listings', overlay: null }), { replace: true });
  };

  // Edit / delete a listing (Home > Landlord > Active Room Listing)
  const editingRoomId = nav.overlay?.startsWith('edit:') ? nav.overlay.slice('edit:'.length) : null;
  const setEditingRoomId = (value: string | null | ((current: string | null) => string | null)) =>
    navigate((prev) => {
      const current = prev.overlay?.startsWith('edit:') ? prev.overlay.slice('edit:'.length) : null;
      const next = typeof value === 'function' ? value(current) : value;
      return { ...prev, overlay: next ? `edit:${next}` : current ? null : prev.overlay };
    });
  const editingRoom = useMemo(() => rooms.find((r) => r.id === editingRoomId) ?? null, [rooms, editingRoomId]);
  const handleSaveRoom = (updated: RoomListing) => {
    setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };
  const handleDeleteRoom = (roomId: string) => {
    const index = rooms.findIndex((r) => r.id === roomId);
    if (index === -1) return;
    // Keep the feed on a valid card
    setCurrentRoomIndex((current) => Math.max(0, Math.min(current > index ? current - 1 : current, rooms.length - 2)));
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    setEditingRoomId((id) => (id === roomId ? null : id));
  };

  const homeRole = activeTab === 'fill' ? 'landlord' : nav.home.role;

  const unreadMessagesCount = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  return (
    <div className="relative w-screen h-[100dvh] bg-[#2C2724] text-[#2C2724] overflow-hidden flex items-center justify-center font-['Plus_Jakarta_Sans','Inter',sans-serif]">
      {/* Full-screen on mobile phone, 9:16 phone frame on desktop */}
      <main className="relative w-full h-full sm:max-w-[440px] sm:max-h-[920px] sm:h-[96vh] sm:rounded-[32px] bg-[#F9F7F3] text-[#2C2724] overflow-hidden shadow-2xl border-0 sm:border-2 sm:border-[#2C2724]/25 flex flex-col min-h-0">
        {gmpQuotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}

        {/* SCREEN 1: Feed (Watch) — Native Vertical Scroll-Snap Video Feed */}
        {activeTab === 'listings' && (
          <>
            {/* Clean Filter Button matching Earth-Tone palette (2.0 with Supabase: area / rent / move-in chips) */}
            {findMode ? (
              <FindFilterBar
                filters={findFilters}
                onChange={(next) => {
                  setFindFilters(next);
                  setCurrentRoomIndex(0);
                }}
                savedOnly={savedOnly}
                onToggleSaved={() => {
                  setSavedOnly((v) => !v);
                  setCurrentRoomIndex(0);
                }}
                savedCount={[...pinnedRoomIds].filter((id) => isDbRoomId(id) || flags.demo_listings).length}
                total={filteredRooms.length}
                onBack={canGoBack ? goBack : undefined}
                extraActions={<NavMenu activeTab={activeTab} onSelectTab={handleSelectNavTab} />}
              />
            ) : (
            <FilterBar
              filters={filters}
              onUpdateFilters={handleUpdateFilters}
              onOpenFilterModal={() => setIsFilterModalOpen(true)}
              onBack={canGoBack ? goBack : undefined}
              extraActions={<NavMenu activeTab={activeTab} onSelectTab={handleSelectNavTab} />}
              totalMatches={filteredRooms.length}
              onResetFilters={handleResetFilters}
            />
            )}
            {findNotice && activeTab === 'listings' && (
              <button type="button" onClick={() => setFindNotice(null)} className="w-full text-left px-3 py-2 bg-[#EBF0EC] text-[11px] font-bold text-[#485B4A] shrink-0">
                {findNotice}
              </button>
            )}

            {filteredRooms.length > 0 ? (
              <div className="relative w-full h-full flex-1 min-h-0 overflow-hidden bg-[#2C2724]">
                <div
                  ref={feedScrollContainerRef}
                  data-testid="feed-swipe-container"
                  onScroll={handleFeedNativeScroll}
                  onTouchStart={handleFeedTouchStart}
                  onTouchMove={handleFeedTouchMove}
                  onTouchEnd={(e) => finishFeedTouch(e.changedTouches?.[0]?.clientY)}
                  onTouchCancel={() => finishFeedTouch()}
                  onWheel={handleFeedWheel}
                  className="relative w-full h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar touch-pan-y overscroll-y-contain select-none"
                >
                  {filteredRooms.map((room, idx) => (
                    <div
                      key={room.id}
                      data-testid={`feed-slide-${idx}`}
                      className="relative w-full h-full shrink-0 snap-start snap-always overflow-hidden"
                    >
                      {Math.abs(idx - currentRoomIndex) > 1 ? (
                        <img
                          src={room.fallbackThumbnail || undefined}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          data-testid={`feed-poster-${idx}`}
                          className="absolute inset-0 w-full h-full object-cover bg-[#2C2724]"
                        />
                      ) : (
                      <>
                      <VideoPlayer
                        room={room}
                        isActive={idx === currentRoomIndex}
                        isMuted={isMuted}
                        onToggleMute={() => setIsMuted((prev) => !prev)}
                        onDoubleTapLike={() => handleToggleLike(room.id)}
                        onNextRoom={handleNextRoom}
                        onPrevRoom={handlePrevRoom}
                        currentIndex={idx}
                        totalRooms={filteredRooms.length}
                      />

                      {/* Right Action Sidebar: Pin (My Den), Scout (Map), Share */}
                      <SidebarActions
                        room={room}
                        isPinned={pinnedRoomIds.has(room.id)}
                        onTogglePin={() => handleTogglePin(room.id)}
                        onOpenExplore={() => setActiveTab('explore')}
                        onOpenDetails={() => {
                          setCurrentRoomIndex(idx);
                          setIsDetailsModalOpen(true);
                        }}
                        onOpenShare={() => {
                          setCurrentRoomIndex(idx);
                          setIsShareOpen(true);
                        }}
                        onReport={
                          isDbRoomId(room.id)
                            ? () => {
                                if (!auth.user) {
                                  if (auth.configured) setSignInReason('report');
                                  return;
                                }
                                setReportTarget({ id: dbListingId(room.id)!, hostId: room.host.id || null });
                              }
                            : undefined
                        }
                      />

                      {/* Bottom Room Info, Trust Badges & One-Tap Save to Den / Request to Book */}
                      <VideoInfoOverlay
                        room={room}
                        onViewHostProfile={handleViewHostProfile}
                        onOpenDetails={() => {
                          setCurrentRoomIndex(idx);
                          setIsDetailsModalOpen(true);
                        }}
                        onRequestToBook={() => {
                          setCurrentRoomIndex(idx);
                          const dbId = dbListingId(room.id);
                          if (dbId) openDbApply(dbId);
                          else openApplication();
                        }}
                        isPinned={pinnedRoomIds.has(room.id)}
                        onTogglePin={() => handleTogglePin(room.id)}
                      />
                      </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Top-Right Mobile & Desktop Listing Scroll Controls (Swipe or Tap Up/Down) */}
                {filteredRooms.length > 1 && (
                  <div
                    data-testid="feed-scroll-controls"
                    className="absolute top-2.5 right-3 sm:right-3.5 z-30 flex items-center gap-1 bg-[#F9F7F3]/95 backdrop-blur-xs border border-[#2C2724] rounded-xl px-1.5 py-1 shadow-warm-sm pointer-events-auto"
                  >
                    <button
                      type="button"
                      data-testid="feed-scroll-prev-btn"
                      onClick={handlePrevRoom}
                      aria-label="Previous Listing"
                      title="Previous Listing"
                      className="w-7 h-7 rounded-lg hover:bg-[#EBF0EC] text-[#2C2724] flex items-center justify-center active:scale-90 transition-all"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <span
                      data-testid="feed-scroll-counter"
                      className="text-[10px] font-extrabold text-[#2C2724] px-1 tabular-nums"
                    >
                      {currentRoomIndex + 1}/{filteredRooms.length}
                    </span>
                    <button
                      type="button"
                      data-testid="feed-scroll-next-btn"
                      onClick={handleNextRoom}
                      aria-label="Next Listing"
                      title="Next Listing"
                      className="w-7 h-7 rounded-lg hover:bg-[#EBF0EC] text-[#2C2724] flex items-center justify-center active:scale-90 transition-all"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Pose 2 (Empty State / No Results): Fenn lying down with oversized ears flopped over eyes */
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 text-center bg-[#F9F7F3] text-[#2C2724] space-y-3">
                <FennMascot size="xl" variant="pose_empty" />
                <div className="space-y-1">
                  <h3 className="font-extrabold text-base text-[#2C2724]">
                    No video tours match those filters
                  </h3>
                  <p className="text-xs text-[#2C2724]/70 max-w-xs">
                    Fenn’s radar ears couldn’t spot a match. Try loosening your budget or resetting filters.
                  </p>
                </div>
                <button
                  onClick={
                    findMode
                      ? () => {
                          setFindFilters(EMPTY_FIND_FILTERS);
                          setSavedOnly(false);
                        }
                      : handleResetFilters
                  }
                  className="px-4 py-2.5 bg-[#D06C4E] hover:bg-[#b85a3e] text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors"
                >
                  Reset All Filters
                </button>
              </div>
            )}
          </>
        )}

        {/* SCREEN 2: Scout (Map + Filters) — Map price pins with fennec-fox ear silhouettes */}
        {activeTab === 'explore' && (
          <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
            <ExploreNeighborhoodView
              currentRoom={currentRoom}
              allRooms={filteredRooms}
              onSelectRoomAndWatch={handleSelectRoomAndWatch}
              pinnedRoomIds={pinnedRoomIds}
              onTogglePin={handleTogglePin}
              onOpenFilterModal={() => setIsFilterModalOpen(true)}
              onResetFilters={handleResetFilters}
            />
          </div>
        )}

        {/* SCREEN 3: Ask Fenn (AI Search) — Smart-filter chat & ear-perking fennec fox SVG */}
        {activeTab === 'ask_fenn' && (
          <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
            <AskFennView
              allRooms={rooms}
              pinnedRoomIds={pinnedRoomIds}
              onTogglePin={handleTogglePin}
              onSelectRoomAndWatch={handleSelectRoomAndWatch}
              onApplySmartFilters={(partial) => {
                handleUpdateFilters(partial);
                setCurrentRoomIndex(0);
                setActiveTab('listings');
              }}
              sessions={askFennSessions}
              activeSessionId={activeAskFennSessionId}
              onSelectSession={(sessionId) => setActiveAskFennSessionId(sessionId)}
              onStartNewChat={handleStartNewAskFennChat}
              onUpdateSession={(updated) =>
                setAskFennSessions((prev) =>
                  prev.map((s) => (s.id === updated.id ? updated : s))
                )
              }
            />
          </div>
        )}

        {/* SCREEN 4: House OS (Monthly Living Loop — AI Utility Bill Splitter & Fenn Credit Boost) */}
        {activeTab === 'house_os' && (
          <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
            <HouseOsView
              onOpenRenterLandlordHub={() => setActiveTab('home')}
              onOpenMessages={() => setActiveTab('messages')}
            />
          </div>
        )}

        {/* SCREEN 5: Messages (Protected In-App Chat & Anti-Leakage Shield) */}
        {activeTab === 'messages' && findMode && (
          <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
            <InboxView
              signedIn={Boolean(auth.user)}
              onRequestSignIn={() => setSignInReason('message')}
              initialThreadId={inboxThreadId}
              onOpenApplicants={openApplicants}
            />
          </div>
        )}
        {activeTab === 'messages' && flagsLoaded && !supabaseConfigured && (
          <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
            <DirectMessagingModal
              isOpen={true}
              inline={true}
              onClose={() => setActiveTab('listings')}
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelectConversation={(id) => setActiveConversationId(id)}
              onSendMessage={handleSendMessage}
              onUpdateEscrowStatus={handleUpdateEscrowStatus}
              currentRoom={currentRoom}
              allRooms={rooms}
              onViewRoomDetails={handleViewRoomDetails}
              onViewHostProfile={handleViewHostProfile}
            />
          </div>
        )}

        {/* Saved Den View (accessible if needed) */}
        {activeTab === 'my_den' && (
          <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
            <MyDenView
              savedRooms={pinnedRoomsList}
              allRooms={rooms}
              onSelectRoomAndWatch={handleSelectRoomAndWatch}
              onRemoveFromDen={(roomId) => handleTogglePin(roomId)}
              onRequestToBookRoom={(room) => {
                const idx = rooms.findIndex((r) => r.id === room.id);
                if (idx !== -1) setCurrentRoomIndex(idx);
                openApplication();
              }}
              onOpenRenterLandlordHub={() => setActiveTab('home')}
              onOpenMessages={() => setActiveTab('messages')}
            />
          </div>
        )}

        {/* Passport (Fenly 2.0) */}
        {activeTab === 'passport' && (
          <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
            {reviewOpen ? (
              <ReviewQueue onBack={closeOverlay} />
            ) : metricsOpen ? (
              <MetricsView onBack={closeOverlay} />
            ) : (
              <PassportView
                onRequestSignIn={() => setSignInReason('passport')}
                onOpenReview={() => navigate((prev) => ({ ...prev, tab: 'passport', overlay: 'review' }))}
                onOpenMetrics={() => navigate((prev) => ({ ...prev, tab: 'passport', overlay: 'metrics' }))}
              />
            )}
          </div>
        )}

        {/* Fenly 2.0 Fill tab (with Supabase): fill a room, drafts, live listings' status */}
        {activeTab === 'fill' && flagsLoaded && supabaseConfigured && (
          <div className="relative flex-1 min-h-0 w-full flex flex-col overflow-hidden">
            {applicantsListingId ? (
              <ApplicantInbox key={applicantsListingId} listingId={applicantsListingId} onBack={closeOverlay} onOpenThread={openThread} />
            ) : statusListingId ? (
              <FillStatusView key={statusListingId} listingId={statusListingId} onBack={closeOverlay} />
            ) : (
              <FillHome
                signedIn={Boolean(auth.user)}
                onStartFill={() => openFill(null)}
                onResume={(id) => openFill(id)}
                onOpenStatus={(id) => openFillStatus(id)}
                onOpenApplicants={openApplicants}
                onBack={() => setActiveTab('listings')}
              />
            )}
          </div>
        )}

        {/* Renter & Landlord Hub; without Supabase (local demo) the Fill tab shows its 1.0 landlord pages */}
        {(activeTab === 'home' || (activeTab === 'fill' && flagsLoaded && !supabaseConfigured)) && (
          <div className="relative flex-1 min-h-0 w-full flex flex-col overflow-hidden">
            <HomeHubView
              userProfile={userProfile}
              onUpdateUserProfile={(updated) => {
                setUserProfile((prev) => ({ ...prev, ...updated }));
                if (updated.renterProfile?.preferredMoveInDate) {
                  setFilters((prev) => ({
                    ...prev,
                    moveInDate: updated.renterProfile?.preferredMoveInDate,
                  }));
                }
              }}
              pinnedRooms={pinnedRoomsList}
              allRooms={rooms}
              conversations={conversations}
              submittedApplications={submittedApplications}
              onUpdateApplicationStatus={(appId, newStatus) =>
                setSubmittedApplications((prev) =>
                  prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a))
                )
              }
              onSelectRoomAndWatch={handleSelectRoomAndWatch}
              onStartApplicationForRoom={(room) => {
                const idx = rooms.findIndex((r) => r.id === room.id);
                if (idx !== -1) setCurrentRoomIndex(idx);
                openApplication();
              }}
              onOpenDirectMessages={(convId) => {
                if (convId) setActiveConversationId(convId);
                setActiveTab('messages');
              }}
              onOpenAiDirector={() => setIsAiDirectorOpen(true)}
              onOpenPostRoom={openPostRoom}
              onEditRoom={setEditingRoomId}
              onDeleteRoom={handleDeleteRoom}
              homeNav={nav.home}
              onHomeNavChange={handleHomeNavChange}
              onBack={() => setActiveTab('listings')}
              lockedRole={activeTab === 'fill' ? 'landlord' : undefined}
              extrasEnabled={flags.home_extras}
              masterLeaseConfig={masterLeaseConfig}
              onUpdateMasterLeaseConfig={(updated) =>
                setMasterLeaseConfig((prev) => ({ ...prev, ...updated }))
              }
            />
            {/* Back within thumb reach on Home's sub-pages (the top one scrolls away on long pages) */}
            {((homeRole === 'landlord' && nav.home.landlordPage !== 'none') ||
              (homeRole === 'renter' && nav.home.renterPage !== 'none')) && (
              <button
                type="button"
                data-testid="home-bottom-back"
                onClick={() =>
                  handleHomeNavChange(homeRole === 'landlord' ? { landlordPage: 'none' } : { renterPage: 'none' })
                }
                className="absolute bottom-3 left-3 z-30 px-3.5 py-2.5 rounded-full bg-[#2C2724] text-[#F9F7F3] text-xs font-extrabold shadow-warm flex items-center gap-1.5 active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
        )}

        {/* Fenly 2.0 bottom navigation: Find, Fill, Inbox, Passport (1.0 tabs live in the menu behind flags) */}
        <FenlyNavBar activeTab={activeTab} onSelectTab={handleSelectNavTab} unreadCount={unreadMessagesCount} />
      </main>

      {/* --- MODALS & DRAWERS --- */}

      {/* 0. Fenn App Icon, 4-Pose Sticker Sheet & System Instructions Modal */}
      <FennStickerSheetModal
        isOpen={flags.mascots && isStickerSheetOpen}
        onClose={() => setIsStickerSheetOpen(false)}
      />

      {/* 1. Comprehensive Filter Modal */}
      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        filters={filters}
        onUpdateFilters={handleUpdateFilters}
        onResetFilters={handleResetFilters}
        allRooms={rooms}
        matchedRoomsCount={filteredRooms.length}
      />

      {/* 2. Direct Messaging Modal */}
      <DirectMessagingModal
        isOpen={isDmModalOpen}
        onClose={() => setIsDmModalOpen(false)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(id) => setActiveConversationId(id)}
        onSendMessage={handleSendMessage}
        onUpdateEscrowStatus={handleUpdateEscrowStatus}
        currentRoom={currentRoom}
        allRooms={rooms}
        onViewRoomDetails={handleViewRoomDetails}
        onViewHostProfile={handleViewHostProfile}
      />

      {/* 3. Standalone AI Concierge Modal */}
      <GeminiChatbotModal
        isOpen={isChatbotModalOpen}
        onClose={() => setIsChatbotModalOpen(false)}
        currentRoom={currentRoom}
        onApplyChatToFeedFilters={(partial) => {
          handleUpdateFilters(partial);
          setCurrentRoomIndex(0);
          setActiveTab('listings');
        }}
      />

      {/* 4. AI Room Staging Studio */}
      <AiStagingStudioModal
        isOpen={flags.ai_staging && isAiStagingOpen}
        onClose={() => setIsAiStagingOpen(false)}
        room={currentRoom}
        onSaveStagedImageToRoom={handleSaveStagedImageToRoom}
      />

      {/* 5. Room Details Modal */}
      <RoomDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        room={currentRoom}
        userProfile={userProfile}
        onOpenDirectMessage={() => handleOpenDirectMessage(currentRoom)}
        onStartApplication={() => openApplication()}
        onViewHostProfile={handleViewHostProfile}
      />

      {/* 6. Rental Application Process Modal (Single Screen) */}
      <ApplicationModal
        isOpen={isApplicationModalOpen}
        onClose={() => setIsApplicationModalOpen(false)}
        room={currentRoom}
        userProfile={userProfile}
        onSubmitApplication={handleSubmitApplication}
        onOpenWrenConcierge={() => {
          setIsApplicationModalOpen(false);
          handleSelectNavTab('ask_fenn');
        }}
        masterLeaseConfig={masterLeaseConfig}
      />

      {/* 7. User Profile (Renter & Lister) Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        userProfile={userProfile}
        onUpdateUserProfile={(updated) => setUserProfile((prev) => ({ ...prev, ...updated }))}
        selectedHost={selectedHostForProfile}
        allRooms={rooms}
        onOpenDirectMessageWithHost={handleOpenDirectMessageWithHost}
        onViewRoomDetails={handleViewRoomDetails}
        onOpenAiDirector={() => setIsAiDirectorOpen(true)}
        onOpenPostRoom={openPostRoom}
        initialTab={profileInitialTab}
      />

      {/* 8. Post a Room Creator Studio Modal */}
      <PostRoomModal
        isOpen={isPostRoomOpen}
        onClose={() => setIsPostRoomOpen(false)}
        onPublishRoom={handlePublishRoom}
        userProfile={userProfile}
        onOpenAiDirector={() => setIsAiDirectorOpen(true)}
      />

      {/* Fenly 2.0: Fill my room */}
      {fillOverlay && supabaseConfigured && (fillOverlay === 'new' || fillListingId) && (
        <FillFlow
          listingId={fillListingId}
          onClose={closeOverlay}
          onOpenStatus={(id) => openFillStatus(id, true)}
          onDraftCreated={(id) => navigate((prev) => ({ ...prev, overlay: `fill:${id}` }), { replace: true })}
        />
      )}

      {/* Fenly 2.0: apply from a shared listing link */}
      {applyTarget && (
        <ApplySheet
          listingId={applyTarget.listingId}
          via={applyTarget.via}
          onClose={closeApply}
          onRequestSignIn={() => setSignInReason('apply')}
          onOpenPassport={() => {
            closeApply();
            navigate((prev) => ({ ...prev, tab: 'passport', overlay: null }));
          }}
        />
      )}

      {/* Fenly 2.0: report a listing from the Find feed */}
      {reportTarget && (
        <ReportSheet
          targetType="listing"
          targetId={reportTarget.id}
          blockUserId={reportTarget.hostId}
          label="this listing"
          onClose={({ blocked }) => {
            setReportTarget(null);
            if (blocked) {
              setFindListings((prev) => prev.filter((l) => l.host.id !== reportTarget.hostId));
              setFindNotice("You won't see this host's rooms again.");
            }
          }}
        />
      )}

      {/* Edit / delete a listing (from Active Room Listing) */}
      {editingRoom && (
        <EditListingModal
          key={editingRoom.id}
          room={editingRoom}
          onClose={() => setEditingRoomId(null)}
          onSave={handleSaveRoom}
          onDelete={handleDeleteRoom}
        />
      )}

      {/* 9. Landlord AI Director & Walkability Studio */}
      <AiDirectorStudioModal
        isOpen={isAiDirectorOpen}
        onClose={() => setIsAiDirectorOpen(false)}
        onApplyEditedListing={(updated) => {
          if (currentRoom) {
            setRooms((prev) =>
              prev.map((r) => (r.id === currentRoom.id ? { ...r, ...updated } : r))
            );
          }
        }}
        room={currentRoom}
      />

      {/* Fenly 2.0: "Add to Home Screen" after publishing or applying */}
      <InstallPrompt />

      {/* Fenly 2.0 sign-in (Apply, Create Listing, Passport) */}
      <SignInSheet isOpen={signInReason !== null} reason={signInReason ?? 'passport'} onClose={closeSignIn} />

      {/* 10. Share Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        room={currentRoom}
      />
    </div>
  );
}
