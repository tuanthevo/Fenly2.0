import React, { useState, useEffect } from 'react';
import { 
  Home, 
  Plus, 
  Pin, 
  Play, 
  FileCheck, 
  User, 
  Building2, 
  MapPin, 
  ArrowLeft,
  UserCircle,
  ChevronRight,
  Bell,
  Smartphone,
  HelpCircle,
  Shield,
  ShieldCheck,
  CreditCard,
  DollarSign,
  CheckCircle2,
  Check,
  FileText,
  Lock,
  MessageSquare,
  Camera,
  AlertTriangle,
  Clock,
  PenTool,
  LogOut
} from 'lucide-react';
import { RoomListing, UserProfile, Conversation, SubmittedApplication } from '../types';
import { ConfirmDeleteListing, ListingActionsRow, useCanHover } from './ListingActionsRow';
import { isHostListing } from '../utils/listingStore';
import {
  LANDLORD_INCLUDED_BENEFITS,
  calculateStripeConnectSplit,
  generateCaliforniaRoomLease,
  MasterLeaseConfig,
  buildPrepopulatedRoommateLeaseOptions,
} from '../utils/trustSafety';

export type HomeRole = 'account' | 'renter' | 'landlord';
export type RenterSubPage = 'none' | 'profile' | 'verification' | 'escrow' | 'lease' | 'applications' | 'pinned';
export type LandlordSubPage = 'none' | 'verification' | 'admin' | 'lease' | 'applications' | 'activeListings';
export type HomeNav = { role: HomeRole; renterPage: RenterSubPage; landlordPage: LandlordSubPage };
export const HOME_NAV_START: HomeNav = { role: 'account', renterPage: 'none', landlordPage: 'none' };

interface HomeHubViewProps {
  userProfile: UserProfile;
  onUpdateUserProfile: (partial: Partial<UserProfile>) => void;
  masterLeaseConfig?: MasterLeaseConfig;
  onUpdateMasterLeaseConfig?: (partial: Partial<MasterLeaseConfig>) => void;
  pinnedRooms: RoomListing[];
  allRooms: RoomListing[];
  conversations: Conversation[];
  submittedApplications?: SubmittedApplication[];
  onUpdateApplicationStatus?: (
    appId: string,
    newStatus: SubmittedApplication['status']
  ) => void;
  onSelectRoomAndWatch: (roomId: string) => void;
  onStartApplicationForRoom: (room: RoomListing) => void;
  onOpenDirectMessages: (convId?: string) => void;
  onOpenAiDirector: () => void;
  onOpenPostRoom: () => void;
  /** Opens the edit screen for a listing (Active Room Listing) */
  onEditRoom?: (roomId: string) => void;
  /** Deletes a listing after the host confirms */
  onDeleteRoom?: (roomId: string) => void;
  /** Which Home page shows (App keeps it in the browser history) */
  homeNav?: HomeNav;
  onHomeNavChange?: (patch: Partial<HomeNav>) => void;
  onBack: () => void;
}

const LEASE_DURATIONS = [
  'Month to month',
  '3 months',
  '6 months',
  '9 months',
  '12 months',
  '13+',
] as const;

const HOUSEHOLD_SIZES = ['1', '2', '3', '4', '5+'] as const;
const BEDROOM_COUNTS = ['0', '1', '2', '3', '4+'] as const;
const YES_NO_OPTIONS = ['Yes', 'No'] as const;

export const HomeHubView: React.FC<HomeHubViewProps> = ({
  userProfile,
  onUpdateUserProfile,
  masterLeaseConfig,
  onUpdateMasterLeaseConfig,
  pinnedRooms,
  allRooms,
  submittedApplications = [],
  onUpdateApplicationStatus,
  onSelectRoomAndWatch,
  onStartApplicationForRoom,
  onOpenDirectMessages,
  onOpenPostRoom,
  onEditRoom,
  onDeleteRoom,
  homeNav,
  onHomeNavChange,
  onBack,
}) => {
  const canHover = useCanHover();
  const [pendingDelete, setPendingDelete] = useState<RoomListing | null>(null);
  // The host's own listings; the demo shows three sample listings until they post one
  const ownRooms = allRooms.filter(isHostListing);
  const activeLandlordRooms = ownRooms.length > 0 ? ownRooms : allRooms.slice(0, 3);
  // Which Home page is showing. App passes it in (homeNav) so the phone's back / forward
  // gestures move between these pages; without it the component keeps its own.
  const [localHomeNav, setLocalHomeNav] = useState<HomeNav>(HOME_NAV_START);
  const currentHomeNav = homeNav ?? localHomeNav;
  const changeHomeNav = (patch: Partial<HomeNav>) =>
    onHomeNavChange ? onHomeNavChange(patch) : setLocalHomeNav((prev) => ({ ...prev, ...patch }));
  const roleMode = currentHomeNav.role;
  const renterSubPage = currentHomeNav.renterPage;
  const landlordSubPage = currentHomeNav.landlordPage;
  const setRoleMode = (role: HomeRole) => changeHomeNav({ role });
  const setRenterSubPage = (renterPage: RenterSubPage) => changeHomeNav({ renterPage });
  const setLandlordSubPage = (landlordPage: LandlordSubPage) => changeHomeNav({ landlordPage });
  const [renterVerification, setRenterVerification] = useState({
    id: true,
    income: true,
    background: false,
  });
  const [landlordVerification, setLandlordVerification] = useState({
    id: true,
    background: true,
    property: false,
  });

  // Stripe Identity native camera modal & webhook simulation state
  const [showStripeIdentityModal, setShowStripeIdentityModal] = useState(false);
  const [stripeIdentityTarget, setStripeIdentityTarget] = useState<'renter' | 'landlord'>('renter');
  const [fcraConsentChecked, setFcraConsentChecked] = useState(true);

  // Pillar 2: Stripe Connect Separate Charges & Transfers state
  const [escrowState, setEscrowState] = useState<
    'held_24h_timer' | 'released_via_webhook' | 'scam_reported_frozen'
  >('held_24h_timer');

  // Pillar 3: Hybrid California Room Rental Agreement + Dropbox Sign Embedded Signing state
  const [landlordAdminSuite, setLandlordAdminSuite] = useState<Record<string, boolean>>({
    stripe_identity: true,
    fcra_screening: true,
    hybrid_california_lease: true,
    stripe_connect_escrow: true,
  });
  const [ruleMax2OvernightGuests, setRuleMax2OvernightGuests] = useState(
    masterLeaseConfig?.ruleMax2OvernightGuests ?? true
  );
  const [ruleQuietHoursWeekdays, setRuleQuietHoursWeekdays] = useState(
    masterLeaseConfig?.ruleQuietHoursWeekdays ?? true
  );
  const [ruleNoSmokingIndoors, setRuleNoSmokingIndoors] = useState(
    masterLeaseConfig?.ruleNoSmokingIndoors ?? true
  );
  const [leaseMonthlyRent, setLeaseMonthlyRent] = useState(
    masterLeaseConfig?.monthlyRent ?? 1450
  );
  const [tenantSignatureText, setTenantSignatureText] = useState(
    masterLeaseConfig?.tenantName || userProfile.name || 'Alex Rivera'
  );
  const [landlordSignatureText, setLandlordSignatureText] = useState(
    masterLeaseConfig?.landlordName || 'Sarah Miller'
  );
  const [dropboxSignCompleted, setDropboxSignCompleted] = useState(false);

  // Selected room for Renter Interactive Roommate Lease Generator
  const [selectedLeaseRoomId, setSelectedLeaseRoomId] = useState<string>(
    allRooms[0]?.id || 'room-1'
  );
  const selectedLeaseRoom =
    allRooms.find((r) => r.id === selectedLeaseRoomId) || allRooms[0];

  const effectiveMasterLease: Partial<MasterLeaseConfig> = {
    landlordName: landlordSignatureText || masterLeaseConfig?.landlordName || 'Sarah Miller',
    tenantName: tenantSignatureText || masterLeaseConfig?.tenantName || userProfile.name,
    monthlyRent: leaseMonthlyRent,
    securityDeposit: selectedLeaseRoom?.deposit || masterLeaseConfig?.securityDeposit || 1200,
    leaseTerm: selectedLeaseRoom?.leaseTerm || masterLeaseConfig?.leaseTerm || '6 Months',
    earliestMoveInDate: masterLeaseConfig?.earliestMoveInDate || '2026-11-01',
    ruleMax2OvernightGuests,
    ruleQuietHoursWeekdays,
    ruleNoSmokingIndoors,
    quietHoursClause: ruleQuietHoursWeekdays
      ? '10:00 PM – 8:00 AM Sun–Thu, 11:30 PM – 9:00 AM Fri–Sat'
      : 'Flexible respectful hours agreed by housemates',
    guestPolicyClause: ruleMax2OvernightGuests
      ? 'No overnight guests more than 2 nights a week without prior notice'
      : 'Overnight guests permitted with 24-hour heads-up in house chat',
    smokingAndPetsClause: ruleNoSmokingIndoors
      ? 'Strictly 100% smoke-free & vape-free indoors'
      : 'Outdoor patio smoking only',
  };

  const prepopulatedRenterLease = buildPrepopulatedRoommateLeaseOptions(
    selectedLeaseRoom,
    effectiveMasterLease
  );

  const [renterSelectedMoveIn, setRenterSelectedMoveIn] = useState<string>(
    prepopulatedRenterLease.defaultMoveInDate
  );
  const [renterSelectedTerm, setRenterSelectedTerm] = useState<string>(
    prepopulatedRenterLease.defaultLeaseTerm
  );
  const [renterSelectedQuietHours, setRenterSelectedQuietHours] = useState<string>(
    prepopulatedRenterLease.defaultQuietHours
  );
  const [renterSelectedGuestPolicy, setRenterSelectedGuestPolicy] = useState<string>(
    prepopulatedRenterLease.defaultGuestPolicy
  );
  const [renterSelectedUtilities, setRenterSelectedUtilities] = useState<string>(
    prepopulatedRenterLease.defaultUtilitiesSplit
  );
  const [renterSelectedSmokingPets, setRenterSelectedSmokingPets] = useState<string>(
    prepopulatedRenterLease.defaultSmokingAndPets
  );

  // Sync state whenever masterLeaseConfig changes from outside
  useEffect(() => {
    if (masterLeaseConfig) {
      if (masterLeaseConfig.ruleMax2OvernightGuests !== undefined) {
        setRuleMax2OvernightGuests(masterLeaseConfig.ruleMax2OvernightGuests);
      }
      if (masterLeaseConfig.ruleQuietHoursWeekdays !== undefined) {
        setRuleQuietHoursWeekdays(masterLeaseConfig.ruleQuietHoursWeekdays);
      }
      if (masterLeaseConfig.ruleNoSmokingIndoors !== undefined) {
        setRuleNoSmokingIndoors(masterLeaseConfig.ruleNoSmokingIndoors);
      }
      if (masterLeaseConfig.monthlyRent !== undefined) {
        setLeaseMonthlyRent(masterLeaseConfig.monthlyRent);
      }
      if (masterLeaseConfig.landlordName) {
        setLandlordSignatureText(masterLeaseConfig.landlordName);
      }
    }
  }, [masterLeaseConfig]);

  const handleResetToLandlordDefaults = () => {
    setRenterSelectedMoveIn(prepopulatedRenterLease.defaultMoveInDate);
    setRenterSelectedTerm(prepopulatedRenterLease.defaultLeaseTerm);
    setRenterSelectedQuietHours(prepopulatedRenterLease.defaultQuietHours);
    setRenterSelectedGuestPolicy(prepopulatedRenterLease.defaultGuestPolicy);
    setRenterSelectedUtilities(prepopulatedRenterLease.defaultUtilitiesSplit);
    setRenterSelectedSmokingPets(prepopulatedRenterLease.defaultSmokingAndPets);
  };

  const syncMasterLeaseChange = (partial: Partial<MasterLeaseConfig>) => {
    if (onUpdateMasterLeaseConfig) {
      onUpdateMasterLeaseConfig(partial);
    }
  };

  const [activeAccountItem, setActiveAccountItem] = useState<string | null>(null);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [autoplayVideos, setAutoplayVideos] = useState(true);
  const [isLoggedOut, setIsLoggedOut] = useState(false);

  const renterProfile = userProfile.renterProfile || {
    preferredMoveInDate: '2026-11-01',
    leaseDuration: '12 months',
    incomePeriod: 'Annual',
    householdIncome: '115,000',
    householdSize: '1',
    preferredBedrooms: '1',
    parkingNeeds: 'No',
    pets: 'No',
  };

  const updateRenterProfile = (
    partial: Partial<NonNullable<UserProfile['renterProfile']>>
  ) => {
    onUpdateUserProfile({
      renterProfile: {
        ...renterProfile,
        ...partial,
      },
    });
  };

  const toggleAccountItem = (key: string) => {
    setActiveAccountItem((prev) => (prev === key ? null : key));
  };

  const applicationRooms = pinnedRooms.length > 0 ? pinnedRooms : allRooms.slice(0, 2);
  const renterVerifiedCount = Object.values(renterVerification).filter(Boolean).length;
  const landlordVerifiedCount = Object.values(landlordVerification).filter(Boolean).length;

  const [isVerifyingApi, setIsVerifyingApi] = useState<string | null>(null);
  const [latestVerificationReport, setLatestVerificationReport] = useState<any | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Hosted Verification Portal state (redirects user to a dedicated verification page/link)
  const [activeVerificationPortal, setActiveVerificationPortal] = useState<{
    kind: 'id' | 'background' | 'income' | 'property';
    target: 'renter' | 'landlord';
    hostedUrl: string;
    providerName: string;
  } | null>(null);
  const [portalDocType, setPortalDocType] = useState<string>("California Driver's License");
  const [portalIdUploaded, setPortalIdUploaded] = useState<boolean>(true);
  const [portalSelfieCaptured, setPortalSelfieCaptured] = useState<boolean>(true);
  const [portalSsnLast4, setPortalSsnLast4] = useState<string>('4829');
  const [portalDob, setPortalDob] = useState<string>('1996-04-18');
  const [portalPayrollProvider, setPortalPayrollProvider] = useState<string>('ADP Workforce Now');

  const VERIFICATION_LINKS = {
    renterId: 'https://verify.stripe.com/start/vs_renter_id',
    renterIncome: 'https://connect.measureone.com/payroll/inc_renter',
    renterBackground: 'https://apply.certn.co/screening/bg_renter',
    landlordId: 'https://verify.stripe.com/start/vs_landlord_id',
    landlordBackground: 'https://apply.certn.co/screening/bg_landlord',
    landlordProperty: 'https://verify.stripe.com/property-deed/prop_landlord',
  } as const;

  const openVerifyIdPortal = (target: 'renter' | 'landlord') => {
    setVerificationError(null);
    const hostedUrl =
      target === 'renter' ? VERIFICATION_LINKS.renterId : VERIFICATION_LINKS.landlordId;
    setActiveVerificationPortal({
      kind: 'id',
      target,
      hostedUrl,
      providerName: 'Stripe Identity Verification',
    });
  };

  const openBackgroundCheckPortal = (target: 'renter' | 'landlord') => {
    setVerificationError(null);
    const hostedUrl =
      target === 'renter'
        ? VERIFICATION_LINKS.renterBackground
        : VERIFICATION_LINKS.landlordBackground;
    setActiveVerificationPortal({
      kind: 'background',
      target,
      hostedUrl,
      providerName: 'Background Screening Portal',
    });
  };

  const openIncomeCheckPortal = () => {
    setVerificationError(null);
    setActiveVerificationPortal({
      kind: 'income',
      target: 'renter',
      hostedUrl: VERIFICATION_LINKS.renterIncome,
      providerName: 'MeasureOne Income Verification',
    });
  };

  const openPropertyCheckPortal = () => {
    setVerificationError(null);
    setActiveVerificationPortal({
      kind: 'property',
      target: 'landlord',
      hostedUrl: VERIFICATION_LINKS.landlordProperty,
      providerName: 'Property Ownership Verification',
    });
  };

  const handleRunVerifyIdApi = async (target: 'renter' | 'landlord') => {
    setIsVerifyingApi(`${target}_id`);
    setVerificationError(null);
    try {
      const response = await fetch('/api/verification/verify-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: target,
          fullName: target === 'renter' ? userProfile.name : 'Sarah Miller',
          documentType: portalDocType,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setVerificationError(data.error || 'Failed to verify ID');
      } else {
        setLatestVerificationReport({ type: 'ID Verification', ...data });
        if (target === 'renter') {
          setRenterVerification((prev) => ({ ...prev, id: true }));
        } else {
          setLandlordVerification((prev) => ({ ...prev, id: true }));
        }
      }
    } catch (err: any) {
      setVerificationError(err.message || 'Verification API request failed');
    } finally {
      setIsVerifyingApi(null);
      setShowStripeIdentityModal(false);
      setActiveVerificationPortal(null);
    }
  };

  const handleRunBackgroundCheckApi = async (target: 'renter' | 'landlord') => {
    setIsVerifyingApi(`${target}_background`);
    setVerificationError(null);
    try {
      const response = await fetch('/api/verification/background-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: target,
          fullName: target === 'renter' ? userProfile.name : 'Sarah Miller',
          fcraConsent: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setVerificationError(data.error || 'Background check failed');
      } else {
        setLatestVerificationReport({ type: 'Background & Credit Check', ...data });
        if (target === 'renter') {
          setRenterVerification((prev) => ({ ...prev, background: true }));
        } else {
          setLandlordVerification((prev) => ({ ...prev, background: true }));
        }
      }
    } catch (err: any) {
      setVerificationError(err.message || 'Background check API request failed');
    } finally {
      setIsVerifyingApi(null);
      setActiveVerificationPortal(null);
    }
  };

  const handleRunIncomeCheckApi = async () => {
    setIsVerifyingApi('renter_income');
    setVerificationError(null);
    try {
      const response = await fetch('/api/verification/income-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: userProfile.name,
          statedIncome: renterProfile.householdIncome,
          monthlyRent: 1450,
        }),
      });
      const data = await response.json();
      setLatestVerificationReport({ type: 'Income & Payroll Verification', ...data });
      setRenterVerification((prev) => ({ ...prev, income: true }));
    } catch (err: any) {
      setVerificationError(err.message || 'Income check API request failed');
    } finally {
      setIsVerifyingApi(null);
      setActiveVerificationPortal(null);
    }
  };

  const handleRunPropertyCheckApi = () => {
    setLandlordVerification((prev) => ({ ...prev, property: true }));
    setLatestVerificationReport({
      type: 'Property Verification',
      session_id: 'prop_verified_901',
      latencyMs: 95,
    });
    setActiveVerificationPortal(null);
  };

  const completeStripeIdentityScan = () => {
    handleRunVerifyIdApi(stripeIdentityTarget);
  };

  // Dedicated Hosted Verification Portal Screen (simulates navigating to the external verification link & returning via webhook)
  if (activeVerificationPortal) {
    return (
      <div
        data-testid="hosted-verification-portal"
        className="w-full h-full bg-[#F9F7F3] text-[#2C2724] flex flex-col overflow-hidden animate-fadeIn"
      >
        {/* Browser-style Hosted Verification URL Bar */}
        <div className="px-3.5 py-2.5 bg-[#2C2724] text-[#F9F7F3] flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveVerificationPortal(null)}
            className="px-2.5 py-1 rounded-lg bg-[#F9F7F3]/15 hover:bg-[#F9F7F3]/25 text-[#F9F7F3] text-[11px] font-bold flex items-center gap-1 shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Fenn</span>
          </button>

          <a
            href={activeVerificationPortal.hostedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-2.5 py-1 rounded-lg bg-black/35 hover:bg-black/50 border border-[#F9F7F3]/20 flex items-center gap-1.5 min-w-0"
          >
            <Lock className="w-3 h-3 text-[#7A907C] shrink-0" />
            <span className="text-[10px] font-mono text-[#F9F7F3]/90 truncate underline">
              {activeVerificationPortal.hostedUrl}
            </span>
          </a>

          <a
            href={activeVerificationPortal.hostedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-lg bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-[10px] font-extrabold shrink-0"
          >
            Open Link ↗
          </a>
        </div>

        {/* Hosted Verification Step-by-Step Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="p-4 rounded-xl bg-white border border-[#2C2724]/20 shadow-warm-sm space-y-1.5">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 text-[10px] font-extrabold">
              <ShieldCheck className="w-3 h-3" />
              <span>{activeVerificationPortal.providerName}</span>
            </span>
            <h2 className="text-sm font-extrabold text-[#2C2724]">
              {activeVerificationPortal.kind === 'id'
                ? 'ID Verification'
                : activeVerificationPortal.kind === 'background'
                ? 'Background Verification'
                : activeVerificationPortal.kind === 'property'
                ? 'Property Verification'
                : 'Income Verification'}
            </h2>
          </div>

          {activeVerificationPortal.kind === 'id' && (
            <div className="p-4 rounded-xl bg-white border border-[#2C2724]/20 shadow-warm-sm space-y-3.5">
              <div>
                <label className="block text-xs font-extrabold text-[#2C2724] mb-1">
                  1. Select Government ID Document
                </label>
                <select
                  value={portalDocType}
                  onChange={(e) => setPortalDocType(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724] text-xs font-bold text-[#2C2724]"
                >
                  <option value="California Driver's License">California Driver&apos;s License</option>
                  <option value="U.S. Passport">U.S. Passport</option>
                  <option value="State Identification Card">State Identification Card</option>
                </select>
              </div>

              <div className="p-3 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/20 flex items-center justify-between">
                <div className="text-xs font-extrabold text-[#2C2724]">
                  2. Front &amp; Back Barcode Scan
                </div>
                <button
                  type="button"
                  onClick={() => setPortalIdUploaded(true)}
                  className="px-3 py-1.5 rounded-xl bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C] text-xs font-extrabold"
                >
                  {portalIdUploaded ? '✓ ID Scanned' : 'Scan ID'}
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/20 flex items-center justify-between">
                <div className="text-xs font-extrabold text-[#2C2724]">
                  3. Biometric Liveness Selfie
                </div>
                <button
                  type="button"
                  onClick={() => setPortalSelfieCaptured(true)}
                  className="px-3 py-1.5 rounded-xl bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C] text-xs font-extrabold"
                >
                  {portalSelfieCaptured ? '✓ Selfie Matched' : 'Take Selfie'}
                </button>
              </div>

              <button
                type="button"
                data-testid="complete-hosted-verification-btn"
                disabled={Boolean(isVerifyingApi)}
                onClick={() => handleRunVerifyIdApi(activeVerificationPortal.target)}
                className="w-full py-3 px-4 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] disabled:opacity-50 text-white font-extrabold text-xs shadow-warm-sm transition-all"
              >
                {isVerifyingApi
                  ? 'Submitting...'
                  : 'Submit ID Verification & Return to Fenn'}
              </button>
            </div>
          )}

          {activeVerificationPortal.kind === 'background' && (
            <div className="p-4 rounded-xl bg-white border border-[#2C2724]/20 shadow-warm-sm space-y-3.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-extrabold text-[#2C2724] mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={portalDob}
                    onChange={(e) => setPortalDob(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724] text-xs font-bold text-[#2C2724]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-[#2C2724] mb-1">
                    SSN (Last 4 Digits)
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={portalSsnLast4}
                    onChange={(e) => setPortalSsnLast4(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724] text-xs font-bold text-[#2C2724]"
                  />
                </div>
              </div>

              <button
                type="button"
                data-testid="complete-hosted-verification-btn"
                disabled={Boolean(isVerifyingApi)}
                onClick={() => handleRunBackgroundCheckApi(activeVerificationPortal.target)}
                className="w-full py-3 px-4 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] disabled:opacity-50 text-white font-extrabold text-xs shadow-warm-sm transition-all"
              >
                {isVerifyingApi
                  ? 'Running Screening...'
                  : 'Authorize & Submit Background Check'}
              </button>
            </div>
          )}

          {activeVerificationPortal.kind === 'income' && (
            <div className="p-4 rounded-xl bg-white border border-[#2C2724]/20 shadow-warm-sm space-y-3.5">
              <div>
                <label className="block text-xs font-extrabold text-[#2C2724] mb-1">
                  Select Payroll or Direct Deposit Provider
                </label>
                <select
                  value={portalPayrollProvider}
                  onChange={(e) => setPortalPayrollProvider(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724] text-xs font-bold text-[#2C2724]"
                >
                  <option value="ADP Workforce Now">ADP Workforce Now</option>
                  <option value="Workday Payroll">Workday Payroll</option>
                  <option value="Gusto">Gusto</option>
                  <option value="Rippling">Rippling</option>
                  <option value="Chase / Bank Direct Deposit">Chase / Bank Direct Deposit</option>
                </select>
              </div>

              <button
                type="button"
                data-testid="complete-hosted-verification-btn"
                disabled={Boolean(isVerifyingApi)}
                onClick={handleRunIncomeCheckApi}
                className="w-full py-3 px-4 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] disabled:opacity-50 text-white font-extrabold text-xs shadow-warm-sm transition-all"
              >
                {isVerifyingApi
                  ? 'Verifying Payroll Stream...'
                  : 'Connect Payroll & Return to Fenn'}
              </button>
            </div>
          )}

          {activeVerificationPortal.kind === 'property' && (
            <div className="p-4 rounded-xl bg-white border border-[#2C2724]/20 shadow-warm-sm space-y-3.5">
              <div className="p-3 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/20 flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#2C2724]">
                  Property Deed / Master Lease Document
                </span>
                <span className="px-3 py-1 rounded-xl bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C] text-xs font-extrabold">
                  ✓ Uploaded
                </span>
              </div>

              <button
                type="button"
                data-testid="complete-hosted-verification-btn"
                onClick={handleRunPropertyCheckApi}
                className="w-full py-3 px-4 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-extrabold text-xs shadow-warm-sm transition-all"
              >
                Submit Property Verification &amp; Return to Fenn
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (roleMode === 'renter' && renterSubPage === 'verification') {
    return (
      <div
        data-testid="renter-verification-subpage"
        className="w-full h-full bg-[#F9F7F3] text-[#2C2724] pt-4 pb-8 px-3.5 overflow-y-auto space-y-4 animate-fadeIn"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRenterSubPage('none')}
            aria-label="Back to Renter"
            title="Back to Renter"
            className="w-9 h-9 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 transition-all active:scale-90"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-bold text-[#2C2724]">Renter Verification</h1>
        </div>

        {verificationError && (
          <div className="p-3 rounded-xl bg-[#D06C4E]/15 border border-[#D06C4E] text-xs font-bold text-[#2C2724] flex items-center justify-between gap-2">
            <span>{verificationError}</span>
            <button
              type="button"
              onClick={() => setVerificationError(null)}
              className="text-[10px] underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Live API Verification Report Card */}
        {latestVerificationReport && (
          <div
            data-testid="live-verification-api-report"
            className="p-3.5 rounded-xl bg-[#EBF0EC] border-2 border-[#7A907C] text-[#2C2724] flex items-center justify-between gap-2 shadow-warm-sm animate-fadeIn"
          >
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#485B4A]" />
              <span className="text-xs font-extrabold text-[#2C2724]">
                {latestVerificationReport.type} Passed
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-[#485B4A] border border-[#7A907C]/40">
              Verified
            </span>
          </div>
        )}

        {/* Stripe Identity Native Camera Modal Simulation */}
        {showStripeIdentityModal && (
          <div className="p-4 rounded-2xl bg-white border-2 border-[#7A907C] shadow-warm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-[#485B4A]" />
                <span className="text-xs font-bold text-[#2C2724]">ID Verification</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isVerifyingApi === 'renter_id'}
                onClick={completeStripeIdentityScan}
                className="flex-1 py-2 px-3 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] disabled:opacity-50 text-white font-bold text-xs shadow-warm-sm transition-colors"
              >
                {isVerifyingApi === 'renter_id'
                  ? 'Verifying...'
                  : 'Complete License + Live Selfie Scan'}
              </button>
              <button
                type="button"
                onClick={() => setShowStripeIdentityModal(false)}
                className="py-2 px-3 rounded-xl bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724] font-bold text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-white border border-[#2C2724]/15 divide-y divide-[#2C2724]/10 shadow-warm-sm overflow-hidden">
          {/* 1. ID Verification Link */}
          <a
            href={VERIFICATION_LINKS.renterId}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="renter-verify-id-btn"
            onClick={() => openVerifyIdPortal('renter')}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#F9F7F3] transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <CreditCard className="w-4 h-4 text-[#7A907C] shrink-0" />
              <span className="text-xs font-bold text-[#2C2724]">ID Verification</span>
            </div>
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 ${
                renterVerification.id
                  ? 'bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40'
                  : 'bg-[#D06C4E] text-white'
              }`}
            >
              {isVerifyingApi === 'renter_id' ? (
                <span>Verifying...</span>
              ) : renterVerification.id ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Verified</span>
                </>
              ) : (
                <span>Verify ↗</span>
              )}
            </span>
          </a>

          {/* 2. Income Verification Link */}
          <a
            href={VERIFICATION_LINKS.renterIncome}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="renter-verify-income-btn"
            onClick={() => openIncomeCheckPortal()}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#F9F7F3] transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <DollarSign className="w-4 h-4 text-[#7A907C] shrink-0" />
              <span className="text-xs font-bold text-[#2C2724]">Income Verification</span>
            </div>
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 ${
                renterVerification.income
                  ? 'bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40'
                  : 'bg-[#D06C4E] text-white'
              }`}
            >
              {isVerifyingApi === 'renter_income' ? (
                <span>Checking...</span>
              ) : renterVerification.income ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Verified</span>
                </>
              ) : (
                <span>Verify ↗</span>
              )}
            </span>
          </a>

          {/* 3. Background Verification Link */}
          <a
            href={VERIFICATION_LINKS.renterBackground}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="renter-background-check-btn"
            onClick={() => openBackgroundCheckPortal('renter')}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#F9F7F3] transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-[#7A907C] shrink-0" />
              <span className="text-xs font-bold text-[#2C2724]">Background Verification</span>
            </div>
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 ${
                renterVerification.background
                  ? 'bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40'
                  : 'bg-[#D06C4E] text-white'
              }`}
            >
              {isVerifyingApi === 'renter_background' ? (
                <span>Running...</span>
              ) : renterVerification.background ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Verified</span>
                </>
              ) : (
                <span>Verify ↗</span>
              )}
            </span>
          </a>
        </div>
      </div>
    );
  }

  if (roleMode === 'landlord' && landlordSubPage === 'verification') {
    return (
      <div
        data-testid="landlord-verification-subpage"
        className="w-full h-full bg-[#F9F7F3] text-[#2C2724] pt-4 pb-8 px-3.5 overflow-y-auto space-y-4 animate-fadeIn"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLandlordSubPage('none')}
            aria-label="Back to Landlord"
            title="Back to Landlord"
            className="w-9 h-9 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 transition-all active:scale-90"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-bold text-[#2C2724]">Landlord Verification</h1>
        </div>

        {/* Live API Verification Report Card */}
        {latestVerificationReport && (
          <div className="p-3.5 rounded-xl bg-[#EBF0EC] border-2 border-[#7A907C] text-[#2C2724] flex items-center justify-between gap-2 shadow-warm-sm animate-fadeIn">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#485B4A]" />
              <span className="text-xs font-extrabold text-[#2C2724]">
                {latestVerificationReport.type} Passed
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-[#485B4A] border border-[#7A907C]/40">
              Verified
            </span>
          </div>
        )}

        <div className="rounded-2xl bg-white border border-[#2C2724]/15 divide-y divide-[#2C2724]/10 shadow-warm-sm overflow-hidden">
          {/* 1. ID Verification Link */}
          <a
            href={VERIFICATION_LINKS.landlordId}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="landlord-verify-id-btn"
            onClick={() => openVerifyIdPortal('landlord')}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#F9F7F3] transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <CreditCard className="w-4 h-4 text-[#7A907C] shrink-0" />
              <span className="text-xs font-bold text-[#2C2724]">ID Verification</span>
            </div>
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 ${
                landlordVerification.id
                  ? 'bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40'
                  : 'bg-[#D06C4E] text-white'
              }`}
            >
              {isVerifyingApi === 'landlord_id' ? (
                <span>Verifying...</span>
              ) : landlordVerification.id ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Verified</span>
                </>
              ) : (
                <span>Verify ↗</span>
              )}
            </span>
          </a>

          {/* 2. Background Verification Link */}
          <a
            href={VERIFICATION_LINKS.landlordBackground}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="landlord-verify-background-btn"
            onClick={() => openBackgroundCheckPortal('landlord')}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#F9F7F3] transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-[#7A907C] shrink-0" />
              <span className="text-xs font-bold text-[#2C2724]">Background Verification</span>
            </div>
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 ${
                landlordVerification.background
                  ? 'bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40'
                  : 'bg-[#D06C4E] text-white'
              }`}
            >
              {isVerifyingApi === 'landlord_background' ? (
                <span>Running...</span>
              ) : landlordVerification.background ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Verified</span>
                </>
              ) : (
                <span>Verify ↗</span>
              )}
            </span>
          </a>

          {/* 3. Property Verification Link */}
          <a
            href={VERIFICATION_LINKS.landlordProperty}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="landlord-verify-property-btn"
            onClick={() => openPropertyCheckPortal()}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#F9F7F3] transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Building2 className="w-4 h-4 text-[#7A907C] shrink-0" />
              <span className="text-xs font-bold text-[#2C2724]">Property Verification</span>
            </div>
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 ${
                landlordVerification.property
                  ? 'bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40'
                  : 'bg-[#D06C4E] text-white'
              }`}
            >
              {landlordVerification.property ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Verified</span>
                </>
              ) : (
                <span>Verify ↗</span>
              )}
            </span>
          </a>
        </div>
      </div>
    );
  }

  if (roleMode === 'landlord' && landlordSubPage === 'activeListings') {
    return (
      <div className="w-full h-full bg-[#F9F7F3] text-[#2C2724] pt-4 pb-8 px-3.5 overflow-y-auto space-y-4 animate-fadeIn">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLandlordSubPage('none')}
            aria-label="Back to Landlord"
            title="Back to Landlord"
            className="w-9 h-9 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 transition-all active:scale-90"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-[#2C2724]">Active Room Listing ({activeLandlordRooms.length})</h1>
            <p className="text-[11px] text-[#6E655F]">Your published room tours</p>
          </div>
        </div>

        {(onEditRoom || onDeleteRoom) && (
          <p className="text-[10px] text-[#6E655F]" data-testid="active-listings-hint">
            {canHover ? 'Use Edit to change a listing or its video.' : 'Swipe a listing left to edit or delete it.'}
          </p>
        )}

        <div className="space-y-2.5">
          {activeLandlordRooms.map((room) => (
            <ListingActionsRow
              key={room.id}
              room={room}
              canHover={canHover}
              onView={() => onSelectRoomAndWatch(room.id)}
              onEdit={() => onEditRoom?.(room.id)}
              onDelete={() => setPendingDelete(room)}
            />
          ))}
        </div>
        {pendingDelete && (
          <ConfirmDeleteListing
            room={pendingDelete}
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => {
              onDeleteRoom?.(pendingDelete.id);
              setPendingDelete(null);
            }}
          />
        )}
      </div>
    );
  }

  if (roleMode === 'renter' && renterSubPage === 'escrow') {
    const split = calculateStripeConnectSplit(1200, '2026-11-01T14:00:00Z');
    return (
      <div className="w-full h-full bg-[#F9F7F3] text-[#2C2724] pt-4 pb-8 px-3.5 overflow-y-auto space-y-4 animate-fadeIn">
        {/* Clean Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRenterSubPage('none')}
            aria-label="Back to Renter"
            title="Back to Renter"
            className="w-9 h-9 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 transition-all active:scale-90"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-[#2C2724]">Move-In Guarantee</h1>
            <p className="text-[11px] text-[#6E655F]">
              24-hour escrow protection for your deposit &amp; first month&apos;s rent
            </p>
          </div>
        </div>

        {/* Hero Escrow Protection Summary Card */}
        <div className="p-4 rounded-2xl bg-[#E8EFE9] border border-[#7A907C]/50 space-y-3 shadow-warm-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#485B4A] block">
                Protected Move-In Deposit
              </span>
              <div className="text-2xl font-extrabold text-[#2C2724] mt-0.5">
                ${split.totalHeldAmount.toLocaleString('en-US')}.00
              </div>
              <span className="text-[11px] text-[#6E655F] block mt-0.5">
                Sun-Drenched Mission Loft Room • Move-in Nov 1, 2026
              </span>
            </div>

            <span
              data-testid="stripe-connect-held-badge"
              aria-label={split.badgeText}
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl border shrink-0 ${
                escrowState === 'scam_reported_frozen'
                  ? 'bg-[#D06C4E] text-white border-[#D06C4E]'
                  : 'bg-white text-[#485B4A] border-[#7A907C]'
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[3] shrink-0" />
              <span>
                {escrowState === 'released_via_webhook'
                  ? 'Released to Host'
                  : escrowState === 'scam_reported_frozen'
                  ? 'Frozen for Refund'
                  : 'Held Safely in Escrow'}
              </span>
            </span>
          </div>

          <div className="pt-2.5 border-t border-[#7A907C]/25 flex items-center justify-between text-xs">
            <span className="font-semibold text-[#485B4A] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>
                {escrowState === 'held_24h_timer'
                  ? '23h 59m remaining in inspection window'
                  : escrowState === 'released_via_webhook'
                  ? '24-hour inspection window completed'
                  : 'Inspection timer paused — payout frozen'}
              </span>
            </span>
            <span className="text-[11px] font-bold text-[#2C2724]">Nov 1, 2:00 PM</span>
          </div>
        </div>

        {/* Clean 3-Step Escrow Protection Timeline */}
        <div className="rounded-2xl bg-white border border-[#2C2724]/15 divide-y divide-[#2C2724]/10 shadow-warm-sm overflow-hidden text-xs">
          {/* Step 1 */}
          <div className="p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-[#E8EFE9] text-[#485B4A] font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                1
              </div>
              <div>
                <span className="font-bold text-[#2C2724] block">
                  Deposit Held in Fenn Escrow
                </span>
                <span className="text-[11px] text-[#6E655F] leading-relaxed block mt-0.5">
                  Your funds stay safely with Fenn Rentals instead of going directly to the host before you arrive.
                </span>
              </div>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#E8EFE9] text-[#485B4A] shrink-0">
              ${split.totalHeldAmount.toLocaleString('en-US')} Held
            </span>
          </div>

          {/* Step 2 */}
          <div className="p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-[#E8EFE9] text-[#485B4A] font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                2
              </div>
              <div>
                <span className="font-bold text-[#2C2724] block">
                  24-Hour Move-In Inspection
                </span>
                <span className="text-[11px] text-[#6E655F] leading-relaxed block mt-0.5">
                  Pick up your keys and confirm the room matches the video tour within 24 hours of move-in.
                </span>
              </div>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#F2EFE9] text-[#2C2724] shrink-0">
              {escrowState === 'held_24h_timer'
                ? '23h 59m Left'
                : escrowState === 'released_via_webhook'
                ? 'Verified'
                : 'Paused'}
            </span>
          </div>

          {/* Step 3 */}
          <div className="p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-[#E8EFE9] text-[#485B4A] font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <span className="font-bold text-[#2C2724] block">
                    Automatic Host Payout
                  </span>
                  <span className="text-[11px] text-[#6E655F] leading-relaxed block mt-0.5">
                    Once your 24-hour window clears, ${split.landlordTransferAmount.toLocaleString('en-US')} releases to the host and ${split.platformFeeAmount.toLocaleString('en-US')} covers platform escrow protection.
                  </span>
                </div>
              </div>
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg shrink-0 ${
                  escrowState === 'released_via_webhook'
                    ? 'bg-[#E8EFE9] text-[#485B4A]'
                    : escrowState === 'scam_reported_frozen'
                    ? 'bg-[#D06C4E] text-white'
                    : 'bg-[#F2EFE9] text-[#6E655F]'
                }`}
              >
                {escrowState === 'released_via_webhook'
                  ? 'Released'
                  : escrowState === 'scam_reported_frozen'
                  ? 'Frozen'
                  : 'Scheduled'}
              </span>
            </div>

            {escrowState === 'released_via_webhook' && (
              <div className="p-3 rounded-xl bg-[#E8EFE9] border border-[#7A907C]/40 text-[11px] text-[#2C2724]">
                <strong className="text-[#485B4A]">Move-In Confirmed:</strong> ${split.landlordTransferAmount.toLocaleString('en-US')} has been transferred to the host’s linked bank account and ${split.platformFeeAmount.toLocaleString('en-US')} allocated to {split.platformEntityName}.
              </div>
            )}

            {escrowState === 'scam_reported_frozen' && (
              <div className="p-3 rounded-xl bg-[#D06C4E]/15 border border-[#D06C4E] text-[11px] text-[#2C2724] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#D06C4E] shrink-0 mt-0.5" />
                <span>
                  <strong>Payout Frozen:</strong> Host transfer has been halted. Your ${split.totalHeldAmount.toLocaleString('en-US')} deposit remains protected in escrow for a full refund.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Full-Width Stacked Action Controls */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setEscrowState('released_via_webhook')}
            className="w-full py-3 px-4 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-bold text-xs shadow-warm-sm transition-colors"
          >
            Confirm Move-In &amp; Release Funds
          </button>

          <button
            type="button"
            onClick={() =>
              setEscrowState((prev) =>
                prev === 'scam_reported_frozen' ? 'held_24h_timer' : 'scam_reported_frozen'
              )
            }
            className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-[#F2EFE9] text-[#2C2724] border border-[#2C2724] font-bold text-xs transition-colors"
          >
            {escrowState === 'scam_reported_frozen'
              ? 'Resolve Issue & Resume 24h Timer'
              : 'Report Move-In Issue (Freeze Payout)'}
          </button>

          <button
            type="button"
            onClick={() => onOpenDirectMessages()}
            className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-[#F2EFE9] text-[#2C2724] border border-[#2C2724]/25 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <MessageSquare className="w-4 h-4 text-[#D06C4E]" />
            <span>Message Host in Protected Chat</span>
          </button>
        </div>
      </div>
    );
  }

  if (roleMode === 'landlord' && landlordSubPage === 'admin') {
    const adminBenefits = LANDLORD_INCLUDED_BENEFITS.filter(
      (b) => b.id !== 'hybrid_california_lease'
    );

    return (
      <div className="w-full h-full bg-[#F9F7F3] text-[#2C2724] pt-4 pb-8 px-3.5 overflow-y-auto space-y-4 animate-fadeIn">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLandlordSubPage('none')}
            aria-label="Back to Landlord"
            title="Back to Landlord"
            className="w-9 h-9 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 transition-all active:scale-90"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-[#2C2724]">Admin & Screening</h1>
            <p className="text-[11px] text-[#6E655F]">
              Stripe Identity • Certn/MeasureOne/TransUnion (CA § 1950.6) • Auto-Payouts
            </p>
          </div>
        </div>

        {/* 1. Stitched API Partner Overview (Admin & Screening) */}
        <div className="rounded-2xl bg-white border border-[#2C2724]/15 divide-y divide-[#2C2724]/10 shadow-warm-sm overflow-hidden">
          {adminBenefits.map((benefit) => {
            const isEnabled = landlordAdminSuite[benefit.id] ?? true;
            return (
              <button
                key={benefit.id}
                type="button"
                onClick={() =>
                  setLandlordAdminSuite((prev) => ({
                    ...prev,
                    [benefit.id]: !isEnabled,
                  }))
                }
                className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#F9F7F3] transition-colors text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#2C2724]">{benefit.title}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F2EFE9] text-[#2C2724] border border-[#2C2724]/15">
                      {benefit.providerBadge}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#6E655F] block mt-0.5">
                    {benefit.description}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 ${
                    isEnabled
                      ? 'bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40'
                      : 'bg-[#F2EFE9] text-[#6E655F]'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{isEnabled ? benefit.onPlatformCost : 'Enable'}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* 2. FCRA & CA Civil Code § 1950.6 Screening Pass/Fail Summary */}
        <div className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#2C2724]">
              Applicant Screening Summary (Alex Rivera)
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40">
              CA Civil Code § 1950.6 ($40 Tenant Fee Paid)
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/10">
              <span className="text-[10px] text-[#6E655F] block">Stripe Identity</span>
              <span className="font-bold text-[#485B4A] flex items-center gap-1">
                <Check className="w-3 h-3 stroke-[3] shrink-0" />
                <span>PASS (Verified)</span>
              </span>
            </div>
            <div className="p-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/10">
              <span className="text-[10px] text-[#6E655F] block">Certn / TransUnion</span>
              <span className="font-bold text-[#485B4A] flex items-center gap-1">
                <Check className="w-3 h-3 stroke-[3] shrink-0" />
                <span>PASS (745 / Clean)</span>
              </span>
            </div>
            <div className="p-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/10">
              <span className="text-[10px] text-[#6E655F] block">MeasureOne Payroll</span>
              <span className="font-bold text-[#485B4A] flex items-center gap-1">
                <Check className="w-3 h-3 stroke-[3] shrink-0" />
                <span>PASS ($115k/yr)</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (
    (roleMode === 'landlord' && landlordSubPage === 'lease') ||
    (roleMode === 'renter' && renterSubPage === 'lease')
  ) {
    const isRenterView = roleMode === 'renter';

    const generatedLeaseText = generateCaliforniaRoomLease({
      landlord_name: prepopulatedRenterLease.landlordOrMasterTenantName,
      tenant_name: tenantSignatureText || userProfile.name || 'Alex Rivera',
      monthly_rent: prepopulatedRenterLease.monthlyRent,
      security_deposit: prepopulatedRenterLease.securityDeposit,
      room_address: prepopulatedRenterLease.premisesAddress,
      move_in_date: prepopulatedRenterLease.defaultMoveInDate,
      quiet_hours: prepopulatedRenterLease.defaultQuietHours,
      guest_policy: prepopulatedRenterLease.defaultGuestPolicy,
      smoking_policy: prepopulatedRenterLease.defaultSmokingAndPets,
      utilities_split: prepopulatedRenterLease.defaultUtilitiesSplit,
    });

    return (
      <div className="w-full h-full bg-[#F9F7F3] text-[#2C2724] pt-4 pb-8 px-3.5 overflow-y-auto space-y-4 animate-fadeIn">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              isRenterView ? setRenterSubPage('none') : setLandlordSubPage('none')
            }
            aria-label={isRenterView ? 'Back to Renter' : 'Back to Landlord'}
            title={isRenterView ? 'Back to Renter' : 'Back to Landlord'}
            className="w-9 h-9 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 transition-all active:scale-90"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-[#2C2724]">
              {isRenterView
                ? 'Interactive Roommate Lease Generator'
                : 'Lease Agreement & Roommate Lease Generator'}
            </h1>
            <p className="text-[11px] text-[#6E655F]">
              Prepopulated based on Landlord / Master Tenant Lease
            </p>
          </div>
        </div>

        {/* Landlord / Master Tenant Lease Baseline Configuration */}
        {!isRenterView && (
          <div className="p-4 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-[#2C2724]">
                  Master Tenant / Landlord Lease Baseline
                </h3>
                <p className="text-[11px] text-[#6E655F]">
                  These master lease settings automatically prepopulate the Renter&apos;s lease agreement below
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40">
                Master Lease Source
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/15 cursor-pointer">
                <span className="font-semibold text-[#2C2724]">
                  No overnight guests more than 2 nights a week ({'{{guest_policy}}'})
                </span>
                <input
                  type="checkbox"
                  checked={ruleMax2OvernightGuests}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setRuleMax2OvernightGuests(next);
                    const nextClause = next
                      ? 'No overnight guests more than 2 nights a week without prior notice'
                      : 'Overnight guests permitted with 24-hour heads-up in house chat';
                    setRenterSelectedGuestPolicy(nextClause);
                    syncMasterLeaseChange({
                      ruleMax2OvernightGuests: next,
                      guestPolicyClause: nextClause,
                    });
                  }}
                  className="w-4 h-4 accent-[#D06C4E]"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/15 cursor-pointer">
                <span className="font-semibold text-[#2C2724]">
                  Weeknight Quiet Hours 10:00 PM – 8:00 AM ({'{{quiet_hours}}'})
                </span>
                <input
                  type="checkbox"
                  checked={ruleQuietHoursWeekdays}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setRuleQuietHoursWeekdays(next);
                    const nextClause = next
                      ? '10:00 PM – 8:00 AM Sun–Thu, 11:30 PM – 9:00 AM Fri–Sat'
                      : 'Flexible respectful hours agreed by housemates';
                    setRenterSelectedQuietHours(nextClause);
                    syncMasterLeaseChange({
                      ruleQuietHoursWeekdays: next,
                      quietHoursClause: nextClause,
                    });
                  }}
                  className="w-4 h-4 accent-[#D06C4E]"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/15 cursor-pointer">
                <span className="font-semibold text-[#2C2724]">
                  100% Smoke-Free &amp; Vape-Free Indoors
                </span>
                <input
                  type="checkbox"
                  checked={ruleNoSmokingIndoors}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setRuleNoSmokingIndoors(next);
                    const nextClause = next
                      ? 'Strictly 100% smoke-free & vape-free indoors'
                      : 'Outdoor patio smoking only';
                    setRenterSelectedSmokingPets(nextClause);
                    syncMasterLeaseChange({
                      ruleNoSmokingIndoors: next,
                      smokingAndPetsClause: nextClause,
                    });
                  }}
                  className="w-4 h-4 accent-[#D06C4E]"
                />
              </label>
            </div>
          </div>
        )}

        {/* Interactive Roommate Lease Generator (Prepopulated from Landlord / Master Tenant Lease — No Renter Dropdowns) */}
        <div
          data-testid="hub-interactive-roommate-lease-generator"
          className="p-4 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-[#2C2724]">
                Interactive Roommate Lease Generator
              </h3>
              <p className="text-[11px] text-[#6E655F]">
                Prepopulated based on Landlord / Master Tenant Lease ({prepopulatedRenterLease.landlordOrMasterTenantName})
              </p>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40 shrink-0 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>Prepopulated</span>
            </span>
          </div>

          {/* Active Landlord / Master Tenant Listing Summary */}
          <div
            data-testid="hub-lease-listing-summary"
            className="p-3 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/20 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <span className="text-[10px] font-extrabold text-[#6E655F] block">
                Landlord / Master Tenant Listing
              </span>
              <span className="text-xs font-extrabold text-[#2C2724] block truncate">
                {selectedLeaseRoom?.title || 'Sunny Mission Loft Suite'} ({prepopulatedRenterLease.landlordOrMasterTenantName})
              </span>
              <span className="text-[10px] text-[#6E655F] block truncate">
                {prepopulatedRenterLease.premisesAddress}
              </span>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs font-extrabold text-[#485B4A] block">
                ${prepopulatedRenterLease.monthlyRent}/mo
              </span>
              <span className="text-[10px] font-semibold text-[#6E655F] block">
                ${prepopulatedRenterLease.securityDeposit} deposit
              </span>
            </div>
          </div>

          {/* Renter Prepopulation Banner */}
          <div className="p-3 rounded-xl bg-[#EBF0EC] border border-[#7A907C]/40 text-xs text-[#2C2724] space-y-1">
            <div className="font-extrabold text-[#485B4A] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Prepopulated from Landlord / Master Tenant Lease</span>
            </div>
            <p className="text-[11px] text-[#2C2724]/80 leading-relaxed">
              The move-in date, lease duration, quiet hours, guest policy, utility split, and house rules below are prepopulated directly from{' '}
              <strong>{prepopulatedRenterLease.landlordOrMasterTenantName}</strong>&apos;s master lease agreement.
            </p>
          </div>

          {/* Prepopulated Read-Only Lease Terms (No Dropdowns for Renter) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div
              data-testid="hub-lease-prepopulated-move-in"
              className="p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/20"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-extrabold text-[#6E655F]">
                  Target Move-In Date
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#EBF0EC] text-[#485B4A]">
                  Master Lease
                </span>
              </div>
              <div className="text-xs font-extrabold text-[#2C2724]">
                {prepopulatedRenterLease.defaultMoveInDate}
              </div>
            </div>

            <div
              data-testid="hub-lease-prepopulated-term"
              className="p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/20"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-extrabold text-[#6E655F]">
                  Lease Duration
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#EBF0EC] text-[#485B4A]">
                  Master Lease
                </span>
              </div>
              <div className="text-xs font-extrabold text-[#2C2724]">
                {prepopulatedRenterLease.defaultLeaseTerm}
              </div>
            </div>
          </div>

          <div
            data-testid="hub-lease-prepopulated-quiet-hours"
            className="p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/20"
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-extrabold text-[#6E655F]">
                Quiet Hours Clause ({'{{quiet_hours}}'})
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#EBF0EC] text-[#485B4A]">
                Prepopulated
              </span>
            </div>
            <div className="text-xs font-bold text-[#2C2724]">
              {prepopulatedRenterLease.defaultQuietHours}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div
              data-testid="hub-lease-prepopulated-guests"
              className="p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/20"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-extrabold text-[#6E655F]">
                  Overnight Guest Policy ({'{{guest_policy}}'})
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#EBF0EC] text-[#485B4A]">
                  Prepopulated
                </span>
              </div>
              <div className="text-xs font-bold text-[#2C2724]">
                {prepopulatedRenterLease.defaultGuestPolicy}
              </div>
            </div>

            <div
              data-testid="hub-lease-prepopulated-utilities"
              className="p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/20"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-extrabold text-[#6E655F]">
                  Utilities Split Mode
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#EBF0EC] text-[#485B4A]">
                  Prepopulated
                </span>
              </div>
              <div className="text-xs font-bold text-[#2C2724]">
                {prepopulatedRenterLease.defaultUtilitiesSplit}
              </div>
            </div>
          </div>

          <div
            data-testid="hub-lease-prepopulated-smoking-pets"
            className="p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/20"
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-extrabold text-[#6E655F]">
                Smoking, Pets &amp; House Rules Clause
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#EBF0EC] text-[#485B4A]">
                Prepopulated
              </span>
            </div>
            <div className="text-xs font-bold text-[#2C2724]">
              {prepopulatedRenterLease.defaultSmokingAndPets}
            </div>
          </div>

          <pre
            data-testid="california-lease-preview"
            className="p-3 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/20 font-mono text-[10px] text-[#2C2724] whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed"
          >
            {generatedLeaseText}
          </pre>
        </div>

        {/* Part B: Dropbox Sign (HelloSign) Embedded Signing (sign_url) */}
        <div className="p-4 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PenTool className="w-4 h-4 text-[#D06C4E]" />
              <div>
                <h3 className="text-xs font-bold text-[#2C2724]">
                  Dropbox Sign (HelloSign) Embedded Signing
                </h3>
                <p className="text-[11px] text-[#6E655F]">
                  In-app sign_url canvas • Stamps IP address &amp; ESIGN/UETA cryptographic audit trail
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40">
              {dropboxSignCompleted ? 'signature_request_all_signed' : 'awaiting_signature'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="flex flex-col justify-between">
              <label className="text-[10px] text-[#6E655F] font-semibold block mb-1">
                Landlord / Master Tenant Signature ({'{{landlord_name}}'})
              </label>
              <input
                type="text"
                value={landlordSignatureText}
                onChange={(e) => setLandlordSignatureText(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/25 font-serif italic text-sm text-[#2C2724]"
              />
            </div>
            <div className="flex flex-col justify-between">
              <label className="text-[10px] text-[#6E655F] font-semibold block mb-1">
                Renter / Incoming Roommate Signature ({'{{tenant_name}}'})
              </label>
              <input
                type="text"
                value={tenantSignatureText}
                onChange={(e) => setTenantSignatureText(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/25 font-serif italic text-sm text-[#2C2724]"
              />
            </div>
          </div>

          {dropboxSignCompleted && (
            <div className="p-3 rounded-xl bg-[#E8EFE9] border border-[#7A907C]/50 text-[11px] text-[#2C2724] space-y-1">
              <div className="font-bold text-[#485B4A] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Webhook Fired: signature_request_all_signed • Final Payment Step Unlocked</span>
              </div>
              <div className="text-[10px] font-mono text-[#6E655F]">
                IP Audit Trail: 192.0.2.44 • SHA-256: 8f9c2b4e...d91a • ESIGN Act Compliant
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setDropboxSignCompleted(true)}
            className="w-full py-2.5 px-4 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-bold text-xs shadow-warm-sm transition-colors flex items-center justify-center gap-1.5"
          >
            {dropboxSignCompleted ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Signed via Dropbox Sign Embedded (Audit Trail Stamped)</span>
              </>
            ) : (
              <span>Sign Lease In-App via Dropbox Sign (Fire signature_request_all_signed)</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (roleMode === 'renter' && renterSubPage === 'profile') {
    return (
      <div className="w-full h-full bg-[#F9F7F3] text-[#2C2724] pt-4 pb-8 px-3.5 overflow-y-auto space-y-4 animate-fadeIn">
        {/* Minimalist Top Bar with Back Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRenterSubPage('none')}
            aria-label="Back to Renter"
            title="Back to Renter"
            className="w-9 h-9 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 transition-all active:scale-90"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-[#2C2724]">Renter Profile</h1>
            <p className="text-[11px] text-[#6E655F]">Your pre-filled rental preferences</p>
          </div>
        </div>

        {/* Minimalist Single Divided List Card */}
        <div className="rounded-2xl bg-white border border-[#2C2724]/15 divide-y divide-[#2C2724]/10 shadow-warm-sm overflow-hidden">
          {/* 1. Preferred Move-in Date */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-4">
            <label htmlFor="preferred-move-in-date" className="text-xs font-semibold text-[#2C2724]">
              Preferred move-in date
            </label>
            <input
              id="preferred-move-in-date"
              type="date"
              value={renterProfile.preferredMoveInDate}
              onChange={(e) =>
                updateRenterProfile({ preferredMoveInDate: e.target.value })
              }
              className="bg-white border border-[#2C2724]/25 rounded-xl px-2.5 py-1 text-xs font-bold text-[#2C2724] text-right focus:outline-none cursor-pointer"
            />
          </div>

          {/* 2. Preferred Lease Duration */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-4">
            <label htmlFor="preferred-lease-duration" className="text-xs font-semibold text-[#2C2724]">
              Preferred lease duration
            </label>
            <select
              id="preferred-lease-duration"
              value={renterProfile.leaseDuration}
              onChange={(e) =>
                updateRenterProfile({
                  leaseDuration: e.target.value as NonNullable<
                    UserProfile['renterProfile']
                  >['leaseDuration'],
                })
              }
              className="bg-[#F9F7F3] border border-[#2C2724]/20 rounded-xl px-2.5 py-1 text-xs font-bold text-[#2C2724] text-right focus:outline-none cursor-pointer"
            >
              {LEASE_DURATIONS.map((duration) => (
                <option key={duration} value={duration} className="bg-white text-[#2C2724]">
                  {duration}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Household Income Before Taxes */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-3">
            <div>
              <label htmlFor="household-income-input" className="text-xs font-semibold text-[#2C2724] block">
                Household income
              </label>
              <span className="text-[10px] text-[#6E655F]">Before taxes</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[#F9F7F3] border border-[#2C2724]/25 rounded-xl px-2.5 py-1">
                <span className="text-xs text-[#6E655F] mr-1">$</span>
                <input
                  id="household-income-input"
                  type="text"
                  value={renterProfile.householdIncome}
                  onChange={(e) =>
                    updateRenterProfile({ householdIncome: e.target.value })
                  }
                  placeholder={renterProfile.incomePeriod === 'Annual' ? '115,000' : '9,500'}
                  className="w-20 bg-transparent text-xs font-bold text-[#2C2724] text-right focus:outline-none"
                />
              </div>
              <select
                aria-label="Income period"
                value={renterProfile.incomePeriod}
                onChange={(e) =>
                  updateRenterProfile({
                    incomePeriod: e.target.value as 'Annual' | 'Monthly',
                  })
                }
                className="bg-[#F9F7F3] border border-[#2C2724]/20 rounded-xl px-2 py-1 text-xs font-bold text-[#2C2724] focus:outline-none cursor-pointer"
              >
                <option value="Annual" className="bg-white text-[#2C2724]">Annual</option>
                <option value="Monthly" className="bg-white text-[#2C2724]">Monthly</option>
              </select>
            </div>
          </div>

          {/* 4. Total People in Household */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-4">
            <label htmlFor="total-people-household" className="text-xs font-semibold text-[#2C2724]">
              Total people in household
            </label>
            <select
              id="total-people-household"
              value={renterProfile.householdSize}
              onChange={(e) =>
                updateRenterProfile({
                  householdSize: e.target.value as NonNullable<
                    UserProfile['renterProfile']
                  >['householdSize'],
                })
              }
              className="bg-[#F9F7F3] border border-[#2C2724]/20 rounded-xl px-2.5 py-1 text-xs font-bold text-[#2C2724] text-right focus:outline-none cursor-pointer"
            >
              {HOUSEHOLD_SIZES.map((count) => (
                <option key={count} value={count} className="bg-white text-[#2C2724]">
                  {count}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Preferred Number of Bedrooms */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-4">
            <label htmlFor="preferred-bedrooms" className="text-xs font-semibold text-[#2C2724]">
              Preferred bedrooms
            </label>
            <select
              id="preferred-bedrooms"
              value={renterProfile.preferredBedrooms}
              onChange={(e) =>
                updateRenterProfile({
                  preferredBedrooms: e.target.value as NonNullable<
                    UserProfile['renterProfile']
                  >['preferredBedrooms'],
                })
              }
              className="bg-[#F9F7F3] border border-[#2C2724]/20 rounded-xl px-2.5 py-1 text-xs font-bold text-[#2C2724] text-right focus:outline-none cursor-pointer"
            >
              {BEDROOM_COUNTS.map((beds) => (
                <option key={beds} value={beds} className="bg-white text-[#2C2724]">
                  {beds}
                </option>
              ))}
            </select>
          </div>

          {/* 6. Parking Needs */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-4">
            <label htmlFor="parking-needs" className="text-xs font-semibold text-[#2C2724]">
              Parking needs
            </label>
            <select
              id="parking-needs"
              value={renterProfile.parkingNeeds}
              onChange={(e) =>
                updateRenterProfile({
                  parkingNeeds: e.target.value as 'Yes' | 'No',
                })
              }
              className="bg-[#F9F7F3] border border-[#2C2724]/20 rounded-xl px-2.5 py-1 text-xs font-bold text-[#2C2724] text-right focus:outline-none cursor-pointer"
            >
              {YES_NO_OPTIONS.map((opt) => (
                <option key={opt} value={opt} className="bg-white text-[#2C2724]">
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* 7. Pets */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-4">
            <label htmlFor="pets-preference" className="text-xs font-semibold text-[#2C2724]">
              Pets
            </label>
            <select
              id="pets-preference"
              value={renterProfile.pets}
              onChange={(e) =>
                updateRenterProfile({
                  pets: e.target.value as 'Yes' | 'No',
                })
              }
              className="bg-[#F9F7F3] border border-[#2C2724]/20 rounded-xl px-2.5 py-1 text-xs font-bold text-[#2C2724] text-right focus:outline-none cursor-pointer"
            >
              {YES_NO_OPTIONS.map((opt) => (
                <option key={opt} value={opt} className="bg-white text-[#2C2724]">
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }

  if (roleMode === 'landlord' && landlordSubPage === 'applications') {
    return (
      <div
        data-testid="landlord-applications-subpage"
        className="w-full h-full bg-[#F9F7F3] text-[#2C2724] pt-4 pb-8 px-3.5 overflow-y-auto space-y-4 animate-fadeIn"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLandlordSubPage('none')}
            aria-label="Back to Landlord"
            title="Back to Landlord"
            className="w-9 h-9 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 transition-all active:scale-90"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-[#2C2724]">
              Submitted Applications ({submittedApplications.length})
            </h1>
            <p className="text-[11px] text-[#6E655F]">
              Review verified applicants, screening pass status & approve leases
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {submittedApplications.map((app) => (
            <div
              key={app.id}
              data-testid={`landlord-application-card-${app.id}`}
              className="p-4 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={app.roomThumbnail}
                    alt={app.roomTitle}
                    className="w-12 h-12 rounded-xl object-cover shrink-0 border border-[#2C2724]/15"
                  />
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs text-[#2C2724] truncate">{app.roomTitle}</h4>
                    <div className="text-xs font-bold text-[#485B4A]">
                      ${app.roomPrice}/mo • {app.roomLocation}
                    </div>
                    <div className="text-[11px] text-[#6E655F]">
                      Applicant: <strong className="text-[#2C2724]">{app.applicantName}</strong> ({app.applicantIncome})
                    </div>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 border ${
                    app.status.includes('Approved') || app.status.includes('Scheduled')
                      ? 'bg-[#E8EFE9] text-[#485B4A] border-[#7A907C]/40'
                      : 'bg-[#F9F7F3] text-[#D06C4E] border-[#D06C4E]/40'
                  }`}
                >
                  {app.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div className="p-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/10">
                  <span className="text-[#6E655F] block">Move-In Date</span>
                  <span className="font-bold text-[#2C2724]">{app.moveInDate}</span>
                </div>
                <div className="p-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/10">
                  <span className="text-[#6E655F] block">Lease Term</span>
                  <span className="font-bold text-[#2C2724]">{app.leaseTerm}</span>
                </div>
                <div className="p-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/10">
                  <span className="text-[#6E655F] block">Escrow Deposit</span>
                  <span className="font-bold text-[#485B4A]">${app.escrowAmount} Held</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                <span className="px-2 py-0.5 rounded-full bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40">
                  ✓ Stripe Identity Verified
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40">
                  ✓ MeasureOne Income ({app.applicantIncome})
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40">
                  ✓ Certn Background Clear
                </span>
              </div>

              <p className="text-[11px] text-[#6E655F] bg-[#F9F7F3] p-2.5 rounded-xl border border-[#2C2724]/10">
                “{app.note}”
              </p>

              <div className="flex items-center gap-2 pt-1">
                {app.status === 'Under Host Review' ? (
                  <button
                    type="button"
                    data-testid={`approve-application-btn-${app.id}`}
                    onClick={() =>
                      onUpdateApplicationStatus &&
                      onUpdateApplicationStatus(app.id, 'Approved • Escrow Active')
                    }
                    className="flex-1 py-2 px-3 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-bold text-xs shadow-warm-sm transition-colors"
                  >
                    Approve Application
                  </button>
                ) : (
                  <span className="flex-1 py-2 px-3 rounded-xl bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40 font-bold text-xs text-center">
                    ✓ Application Approved
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onOpenDirectMessages()}
                  className="py-2 px-3 rounded-xl bg-[#F9F7F3] hover:bg-[#F2EFE9] text-[#2C2724] border border-[#2C2724] font-bold text-xs transition-colors"
                >
                  Message Applicant
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (roleMode === 'renter' && renterSubPage === 'applications') {
    return (
      <div
        data-testid="renter-applications-subpage"
        className="w-full h-full bg-[#F9F7F3] text-[#2C2724] pt-4 pb-8 px-3.5 overflow-y-auto space-y-4 animate-fadeIn"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRenterSubPage('none')}
            aria-label="Back to Renter"
            title="Back to Renter"
            className="w-9 h-9 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 transition-all active:scale-90"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-[#2C2724]">
              Submitted Applications ({submittedApplications.length})
            </h1>
            <p className="text-[11px] text-[#6E655F]">
              Live status of rooms you have already applied to
            </p>
          </div>
        </div>

        {submittedApplications.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white border border-[#2C2724]/15 text-center text-xs text-[#6E655F]">
            You haven&apos;t submitted any applications yet.
          </div>
        ) : (
          <div className="space-y-3">
            {submittedApplications.map((app) => (
              <div
                key={app.id}
                data-testid={`renter-application-status-${app.id}`}
                className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    onClick={() => onSelectRoomAndWatch(app.roomId)}
                    className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                  >
                    <img
                      src={app.roomThumbnail}
                      alt={app.roomTitle}
                      className="w-12 h-12 rounded-xl object-cover shrink-0 border border-[#2C2724]/15"
                    />
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-[#2C2724] truncate">{app.roomTitle}</h4>
                      <div className="text-xs text-[#6E655F] font-semibold mt-0.5">
                        ${app.roomPrice}/mo • {app.roomLocation}
                      </div>
                      <div className="text-[10px] text-[#6E655F] mt-0.5">
                        Move-in: <strong className="text-[#2C2724]">{app.moveInDate}</strong> • Term:{' '}
                        <strong className="text-[#2C2724]">{app.leaseTerm}</strong>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] px-2.5 py-1 rounded-full font-bold shrink-0 border ${
                      app.status.includes('Approved')
                        ? 'bg-[#E8EFE9] text-[#485B4A] border-[#7A907C]/40'
                        : 'bg-[#F9F7F3] text-[#D06C4E] border-[#D06C4E]/40'
                    }`}
                  >
                    {app.status}
                  </span>
                </div>

                <div className="pt-2 border-t border-[#2C2724]/10 flex items-center justify-between text-[10px] text-[#6E655F]">
                  <span>Submitted {app.submittedAt} • Host: {app.hostName}</span>
                  <span className="font-bold text-[#485B4A]">
                    ✓ ${app.escrowAmount} Escrow Protected
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (roleMode === 'renter' && renterSubPage === 'pinned') {
    return (
      <div className="w-full h-full bg-[#F9F7F3] text-[#2C2724] pt-4 pb-8 px-3.5 overflow-y-auto space-y-4 animate-fadeIn">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRenterSubPage('none')}
            aria-label="Back to Renter"
            title="Back to Renter"
            className="w-9 h-9 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 transition-all active:scale-90"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-[#2C2724]">My Den • Saved Rooms ({pinnedRooms.length})</h1>
            <p className="text-[11px] text-[#6E655F]">Saved video tours & pinned rooms</p>
          </div>
        </div>

        {pinnedRooms.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white border border-[#2C2724]/15 text-center text-xs text-[#6E655F]">
            Your Den is empty! Tap the Save icon on any video tour to save rooms here.
          </div>
        ) : (
          <div className="space-y-2.5">
            {pinnedRooms.map((room) => (
              <div
                key={room.id}
                className="p-3 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm flex items-center justify-between gap-3"
              >
                <div
                  onClick={() => onSelectRoomAndWatch(room.id)}
                  className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                >
                  <img
                    src={room.fallbackThumbnail}
                    alt={room.title}
                    className="w-12 h-12 rounded-xl object-cover shrink-0 border border-[#2C2724]/15"
                  />
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs text-[#2C2724] truncate">{room.title}</h4>
                    <div className="text-xs text-[#485B4A] font-bold mt-0.5">
                      ${room.price}/mo • {room.roomType}
                    </div>
                    <div className="text-[11px] text-[#6E655F] truncate flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#D06C4E]" />
                      <span>{room.location}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onStartApplicationForRoom(room)}
                  className="px-3.5 py-1.5 bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-bold text-xs rounded-xl shrink-0 shadow-warm-sm transition-colors"
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#F9F7F3] text-[#2C2724] pt-4 pb-8 px-3.5 overflow-y-auto space-y-4">
      {/* Top Bar: Back button at top-left corner + Account | Renter Home | Landlord Home switcher */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          aria-label="Back to Listings"
          title="Back to Listings"
          className="w-9 h-9 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 transition-all active:scale-90"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Role & Account Switcher */}
        <div className="flex-1 p-1 rounded-xl bg-[#F2EFE9] border border-[#2C2724]/20 grid grid-cols-3 gap-1">
          <button
            onClick={() => setRoleMode('account')}
            className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
              roleMode === 'account'
                ? 'bg-[#2C2724] text-[#F9F7F3] shadow-sm'
                : 'text-[#6E655F] hover:text-[#2C2724]'
            }`}
          >
            <UserCircle className="w-3 h-3 shrink-0" />
            <span>Account</span>
          </button>

          <button
            onClick={() => setRoleMode('renter')}
            className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
              roleMode === 'renter'
                ? 'bg-[#2C2724] text-[#F9F7F3] shadow-sm'
                : 'text-[#6E655F] hover:text-[#2C2724]'
            }`}
          >
            <User className="w-3 h-3 shrink-0" />
            <span>Renter</span>
          </button>

          <button
            onClick={() => setRoleMode('landlord')}
            className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
              roleMode === 'landlord'
                ? 'bg-[#D06C4E] text-white shadow-sm'
                : 'text-[#6E655F] hover:text-[#2C2724]'
            }`}
          >
            <Building2 className="w-3 h-3 shrink-0" />
            <span>Landlord</span>
          </button>
        </div>
      </div>

      {roleMode === 'account' && (
        /* --- SIMPLE ACCOUNT VIEW --- */
        <div className="space-y-4 animate-fadeIn">
          {/* Simple User Header: Photo, Name, and Verified Checkmark Only */}
          <div className="p-4 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm flex items-center gap-3.5">
            <img
              src={userProfile.avatar}
              alt={userProfile.name}
              className="w-14 h-14 rounded-full object-cover border-2 border-[#7A907C] shrink-0"
            />
            <div className="font-bold text-base text-[#2C2724] flex items-center gap-2 flex-wrap">
              <span>{userProfile.name}</span>
              <span className="inline-flex items-center gap-1 text-[11px] bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40 px-2.5 py-0.5 rounded-full font-bold">
                <Check className="w-3 h-3 stroke-[2.5]" />
                <span>Verified</span>
              </span>
            </div>
          </div>

          {/* Settings: Account / Notifications / App */}
          <div className="space-y-1.5">
            <h3 className="px-1 text-[11px] font-bold uppercase tracking-wider text-[#6E655F]">
              Settings
            </h3>
            <div className="rounded-2xl bg-white border border-[#2C2724]/15 divide-y divide-[#2C2724]/10 shadow-warm-sm overflow-hidden">
              {/* Account */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleAccountItem('account')}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <UserCircle className="w-4 h-4 text-[#D06C4E]" />
                    <span className="text-xs font-bold text-[#2C2724]">Account</span>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 text-[#6E655F] transition-transform ${
                      activeAccountItem === 'account' ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                {activeAccountItem === 'account' && (
                  <div className="px-4 pb-3.5 pt-1 bg-[#F9F7F3] space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[#6E655F]">
                      <span>Name</span>
                      <span className="text-[#2C2724] font-semibold">{userProfile.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-[#6E655F]">
                      <span>Email</span>
                      <span className="text-[#2C2724] font-semibold">{userProfile.email}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Notifications */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleAccountItem('notifications')}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <Bell className="w-4 h-4 text-[#D06C4E]" />
                    <span className="text-xs font-bold text-[#2C2724]">Notifications</span>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 text-[#6E655F] transition-transform ${
                      activeAccountItem === 'notifications' ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                {activeAccountItem === 'notifications' && (
                  <div className="px-4 pb-3.5 pt-1 bg-[#F9F7F3] space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#6E655F]">Fenn Instant Tour Alerts</span>
                      <button
                        type="button"
                        onClick={() => setPushNotifications((v) => !v)}
                        className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${
                          pushNotifications
                            ? 'bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40'
                            : 'bg-[#F2EFE9] text-[#6E655F]'
                        }`}
                      >
                        {pushNotifications ? 'On' : 'Off'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6E655F]">Email Alerts</span>
                      <button
                        type="button"
                        onClick={() => setEmailNotifications((v) => !v)}
                        className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${
                          emailNotifications
                            ? 'bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40'
                            : 'bg-[#F2EFE9] text-[#6E655F]'
                        }`}
                      >
                        {emailNotifications ? 'On' : 'Off'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* App */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleAccountItem('app')}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-4 h-4 text-[#D06C4E]" />
                    <span className="text-xs font-bold text-[#2C2724]">App</span>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 text-[#6E655F] transition-transform ${
                      activeAccountItem === 'app' ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                {activeAccountItem === 'app' && (
                  <div className="px-4 pb-3.5 pt-1 bg-[#F9F7F3] flex items-center justify-between text-xs">
                    <span className="text-[#6E655F]">Autoplay Video Tours</span>
                    <button
                      type="button"
                      onClick={() => setAutoplayVideos((v) => !v)}
                      className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${
                        autoplayVideos
                          ? 'bg-[#E8EFE9] text-[#485B4A] border border-[#7A907C]/40'
                          : 'bg-[#F2EFE9] text-[#6E655F]'
                      }`}
                    >
                      {autoplayVideos ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Support and Legal: Help & Feedback / Privacy Notice / Terms of Use */}
          <div className="space-y-1.5">
            <h3 className="px-1 text-[11px] font-bold uppercase tracking-wider text-[#6E655F]">
              Support and Legal
            </h3>
            <div className="rounded-2xl bg-white border border-[#2C2724]/15 divide-y divide-[#2C2724]/10 shadow-warm-sm overflow-hidden">
              {/* Help & Feedback */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleAccountItem('help')}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <HelpCircle className="w-4 h-4 text-[#7A907C]" />
                    <span className="text-xs font-bold text-[#2C2724]">Help & Feedback</span>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 text-[#6E655F] transition-transform ${
                      activeAccountItem === 'help' ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                {activeAccountItem === 'help' && (
                  <div className="px-4 pb-3.5 pt-1 bg-[#F9F7F3] text-xs text-[#6E655F] leading-relaxed">
                    Need help with a room tour or application? Reach our 24/7 Fenn Rentals member support team at support@fennrentals.com.
                  </div>
                )}
              </div>

              {/* Privacy Notice */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleAccountItem('privacy')}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <Shield className="w-4 h-4 text-[#7A907C]" />
                    <span className="text-xs font-bold text-[#2C2724]">Privacy Notice</span>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 text-[#6E655F] transition-transform ${
                      activeAccountItem === 'privacy' ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                {activeAccountItem === 'privacy' && (
                  <div className="px-4 pb-3.5 pt-1 bg-[#F9F7F3] text-xs text-[#6E655F] leading-relaxed">
                    Your location and renter profile details are only shared with verified hosts when you choose to apply or message.
                  </div>
                )}
              </div>

              {/* Terms of Use */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleAccountItem('terms')}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-[#7A907C]" />
                    <span className="text-xs font-bold text-[#2C2724]">Terms of Use</span>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 text-[#6E655F] transition-transform ${
                      activeAccountItem === 'terms' ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                {activeAccountItem === 'terms' && (
                  <div className="px-4 pb-3.5 pt-1 bg-[#F9F7F3] text-xs text-[#6E655F] leading-relaxed">
                    Fenn Rentals verified listings and walkthroughs follow our community safety, fair housing, and anti-scam standards.
                  </div>
                )}
              </div>
            </div>
          </div>

          {isLoggedOut && (
            <div className="p-3 rounded-xl bg-[#EBF0EC] border border-[#7A907C] text-center text-xs font-bold text-[#2C2724] flex items-center justify-between gap-2">
              <span>You have been logged out of {userProfile.email}.</span>
              <button
                type="button"
                onClick={() => setIsLoggedOut(false)}
                className="px-2.5 py-1 rounded-lg bg-[#2C2724] text-[#F9F7F3] text-[10px] font-extrabold"
              >
                Sign Back In
              </button>
            </div>
          )}

          {/* Bottom-Center Log Out Button */}
          <div className="pt-4 pb-2 flex justify-center">
            <button
              type="button"
              data-testid="account-logout-btn"
              onClick={() => setIsLoggedOut(true)}
              className="px-6 py-2.5 rounded-xl bg-white hover:bg-[#D06C4E] text-[#D06C4E] hover:text-white border border-[#D06C4E] font-extrabold text-xs flex items-center justify-center gap-2 shadow-warm-sm transition-all active:scale-95"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}

      {roleMode === 'landlord' && (
        /* --- MINIMALIST LANDLORD HOME VIEW --- */
        <div className="space-y-4 animate-fadeIn">
          <div className="rounded-2xl bg-white border border-[#2C2724]/15 divide-y divide-[#2C2724]/10 shadow-warm-sm overflow-hidden">
            {/* 1. Landlord Verification Button */}
            <button
              type="button"
              data-testid="landlord-verification-menu-btn"
              onClick={() => setLandlordSubPage('verification')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-[#7A907C] shrink-0" />
                <span className="text-xs font-bold text-[#2C2724] block">Landlord Verification</span>
              </div>
              <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
            </button>

            {/* 2. Admin & Screening Button */}
            <button
              type="button"
              onClick={() => setLandlordSubPage('admin')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <FileCheck className="w-4 h-4 text-[#7A907C] shrink-0" />
                <div>
                  <span className="text-xs font-bold text-[#2C2724] block">Admin & Screening</span>
                  <span className="text-[11px] text-[#6E655F]">
                    Stripe Identity, CA § 1950.6 Credit/Criminal Check & Rent Auto-Pay
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
            </button>

            {/* 3. Lease Agreement Button */}
            <button
              type="button"
              onClick={() => setLandlordSubPage('lease')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-[#7A907C] shrink-0" />
                <div>
                  <span className="text-xs font-bold text-[#2C2724] block">Lease Agreement</span>
                  <span className="text-[11px] text-[#6E655F]">
                    California Room Rental Agreement Generator & Dropbox Sign
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
            </button>

            {/* 4. Applications Button (Landlord) */}
            <button
              type="button"
              data-testid="landlord-applications-btn"
              onClick={() => setLandlordSubPage('applications')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <FileCheck className="w-4 h-4 text-[#D06C4E] shrink-0" />
                <div>
                  <span className="text-xs font-bold text-[#2C2724] block">Applications</span>
                  <span className="text-[11px] text-[#6E655F]">
                    {submittedApplications.length} submitted {submittedApplications.length === 1 ? 'application' : 'applications'} • Review status & approve
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
            </button>

            {/* 5. Active Room Listing Button */}
            <button
              type="button"
              onClick={() => setLandlordSubPage('activeListings')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Home className="w-4 h-4 text-[#7A907C] shrink-0" />
                <div>
                  <span className="text-xs font-bold text-[#2C2724] block">Active Room Listing</span>
                  <span className="text-[11px] text-[#6E655F]">
                    {activeLandlordRooms.length} active room {activeLandlordRooms.length === 1 ? 'listing' : 'listings'}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
            </button>

            {/* 6. Create Listing Button */}
            <button
              type="button"
              onClick={onOpenPostRoom}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Plus className="w-4 h-4 text-[#D06C4E] shrink-0" />
                <div>
                  <span className="text-xs font-bold text-[#2C2724] block">Create Listing</span>
                  <span className="text-[11px] text-[#6E655F]">
                    Post a new room video tour and details
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
            </button>
          </div>
        </div>
      )}

      {roleMode === 'renter' && (
        /* --- MINIMALIST RENTER HOME VIEW --- */
        <div className="space-y-4 animate-fadeIn">
          <div className="rounded-2xl bg-white border border-[#2C2724]/15 divide-y divide-[#2C2724]/10 shadow-warm-sm overflow-hidden">
            {/* 1. Renter Profile Button */}
            <button
              type="button"
              onClick={() => setRenterSubPage('profile')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-[#D06C4E] shrink-0" />
                <div>
                  <span className="text-xs font-bold text-[#2C2724] block">Renter Profile</span>
                  <span className="text-[11px] text-[#6E655F]">
                    {renterProfile.leaseDuration} • {renterProfile.preferredBedrooms} bed • Move-in {renterProfile.preferredMoveInDate}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
            </button>

            {/* 2. Renter Verification Button */}
            <button
              type="button"
              data-testid="renter-verification-menu-btn"
              onClick={() => setRenterSubPage('verification')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-[#7A907C] shrink-0" />
                <span className="text-xs font-bold text-[#2C2724] block">Renter Verification</span>
              </div>
              <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
            </button>

            {/* 3. Move-In Guarantee (Escrow & 24h Protection) */}
            <button
              type="button"
              onClick={() => setRenterSubPage('escrow')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Lock className="w-4 h-4 text-[#7A907C] shrink-0" />
                <div>
                  <span className="text-xs font-bold text-[#2C2724] block">Move-In Guarantee (Escrow)</span>
                  <span className="text-[11px] text-[#6E655F] inline-flex items-center gap-1 flex-wrap">
                    <Check className="w-3 h-3 stroke-[3] text-[#485B4A] shrink-0" />
                    <span>$1,200 held safely in escrow • 24-hour move-in protection</span>
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
            </button>

            {/* 4. Interactive Roommate Lease Generator Button */}
            <button
              type="button"
              data-testid="renter-lease-generator-btn"
              onClick={() => setRenterSubPage('lease')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-[#D06C4E] shrink-0" />
                <div>
                  <span className="text-xs font-bold text-[#2C2724] block">
                    Interactive Roommate Lease Generator
                  </span>
                  <span className="text-[11px] text-[#6E655F]">
                    Prepopulated automatically based on Landlord / Master Tenant lease
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
            </button>

            {/* 5. Applications Button */}
            <button
              type="button"
              data-testid="renter-applications-btn"
              onClick={() => setRenterSubPage('applications')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <FileCheck className="w-4 h-4 text-[#7A907C] shrink-0" />
                <div>
                  <span className="text-xs font-bold text-[#2C2724] block">Applications</span>
                  <span className="text-[11px] text-[#6E655F]">
                    {submittedApplications.length} submitted {submittedApplications.length === 1 ? 'application' : 'applications'} • Track status
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
            </button>

            {/* 5. Pinned Rooms / My Den (Saved Rooms) Button */}
            <button
              type="button"
              onClick={() => setRenterSubPage('pinned')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F9F7F3] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Pin className="w-4 h-4 text-[#D06C4E] shrink-0" />
                <div>
                  <span className="text-xs font-bold text-[#2C2724] block">My Den (Saved Rooms)</span>
                  <span className="text-[11px] text-[#6E655F]">
                    {pinnedRooms.length} Saved {pinnedRooms.length === 1 ? 'Room' : 'Rooms'} • Instant Tour Alerts enabled
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
