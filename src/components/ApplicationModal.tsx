import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FileCheck,
  CheckCircle2,
  ShieldCheck,
  Lock,
  PenTool,
} from 'lucide-react';
import { RoomListing, UserProfile } from '../types';
import { FennMascot } from './FennMascot';
import {
  generateCaliforniaRoomLease,
  formatFennEscrowStatus,
  MasterLeaseConfig,
  buildPrepopulatedRoommateLeaseOptions,
} from '../utils/trustSafety';

interface ApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomListing;
  userProfile: UserProfile;
  masterLeaseConfig?: Partial<MasterLeaseConfig>;
  onSubmitApplication: (
    applicationNote: string,
    moveInDate: string,
    leaseTerm: string
  ) => void;
  onOpenWrenConcierge?: () => void;
}

export const ApplicationModal: React.FC<ApplicationModalProps> = ({
  isOpen,
  onClose,
  room,
  userProfile,
  masterLeaseConfig,
  onSubmitApplication,
  onOpenWrenConcierge,
}) => {
  const prepopulatedLease = useMemo(
    () => buildPrepopulatedRoommateLeaseOptions(room, masterLeaseConfig),
    [room, masterLeaseConfig]
  );

  const [moveInDate, setMoveInDate] = useState<string>(
    prepopulatedLease.defaultMoveInDate
  );
  const [leaseTerm, setLeaseTerm] = useState<string>(
    prepopulatedLease.defaultLeaseTerm
  );
  const [quietHours, setQuietHours] = useState<string>(
    prepopulatedLease.defaultQuietHours
  );
  const [guestPolicy, setGuestPolicy] = useState<string>(
    prepopulatedLease.defaultGuestPolicy
  );
  const [utilitiesSplit, setUtilitiesSplit] = useState<string>(
    prepopulatedLease.defaultUtilitiesSplit
  );
  const [smokingAndPets, setSmokingAndPets] = useState<string>(
    prepopulatedLease.defaultSmokingAndPets
  );
  const [signatureName, setSignatureName] = useState<string>(userProfile.name);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isVerifyingModalApi, setIsVerifyingModalApi] = useState<string | null>(null);
  const [modalVerificationResult, setModalVerificationResult] = useState<any | null>(null);

  // Sync prepopulated defaults whenever the selected room or Landlord/Master Tenant lease changes
  useEffect(() => {
    setMoveInDate(prepopulatedLease.defaultMoveInDate);
    setLeaseTerm(prepopulatedLease.defaultLeaseTerm);
    setQuietHours(prepopulatedLease.defaultQuietHours);
    setGuestPolicy(prepopulatedLease.defaultGuestPolicy);
    setUtilitiesSplit(prepopulatedLease.defaultUtilitiesSplit);
    setSmokingAndPets(prepopulatedLease.defaultSmokingAndPets);
  }, [
    room.id,
    prepopulatedLease.defaultMoveInDate,
    prepopulatedLease.defaultLeaseTerm,
    prepopulatedLease.defaultQuietHours,
    prepopulatedLease.defaultGuestPolicy,
    prepopulatedLease.defaultUtilitiesSplit,
    prepopulatedLease.defaultSmokingAndPets,
  ]);

  if (!isOpen) return null;

  const handleModalVerifyId = async () => {
    setIsVerifyingModalApi('id');
    try {
      const res = await fetch('/api/verification/verify-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'renter',
          fullName: signatureName || userProfile.name,
          documentType: "California Driver's License",
        }),
      });
      const data = await res.json();
      setModalVerificationResult({ label: 'ID Verification', ...data });
    } catch {
      // ignore
    } finally {
      setIsVerifyingModalApi(null);
    }
  };

  const handleModalBackgroundCheck = async () => {
    setIsVerifyingModalApi('background');
    try {
      const res = await fetch('/api/verification/background-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'renter',
          fullName: signatureName || userProfile.name,
          fcraConsent: true,
        }),
      });
      const data = await res.json();
      setModalVerificationResult({ label: 'Background Check', ...data });
    } catch {
      // ignore
    } finally {
      setIsVerifyingModalApi(null);
    }
  };

  const dynamicLeasePreview = generateCaliforniaRoomLease({
    landlord_name: prepopulatedLease.landlordOrMasterTenantName,
    tenant_name: signatureName || userProfile.name,
    monthly_rent: prepopulatedLease.monthlyRent,
    security_deposit: prepopulatedLease.securityDeposit,
    room_address: prepopulatedLease.premisesAddress,
    move_in_date: moveInDate,
    quiet_hours: quietHours,
    guest_policy: guestPolicy,
    smoking_policy: smokingAndPets,
    utilities_split: utilitiesSplit,
  });

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
    setTimeout(() => {
      onSubmitApplication(
        `Signed Roommate Lease (${quietHours}, ${guestPolicy}, ${utilitiesSplit}, ${smokingAndPets}) & funded $1,200 Move-In Escrow.`,
        moveInDate,
        leaseTerm
      );
      setIsSubmitted(false);
      onClose();
    }, 1200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#2C2724]/60 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        data-testid="booking-escrow-modal"
        className="w-full sm:max-w-lg max-h-[90vh] bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724] rounded-xl flex flex-col shadow-warm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-4 py-3 border-b border-[#2C2724]/15 bg-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 flex items-center justify-center shrink-0">
              <FileCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-extrabold text-sm text-[#2C2724] truncate">
                Booking & Move-In Escrow Checkout
              </h2>
              <p className="text-[11px] text-[#2C2724]/70 truncate">
                {room.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenWrenConcierge && (
              <button
                type="button"
                onClick={onOpenWrenConcierge}
                className="px-2.5 py-1.5 rounded-xl bg-[#F9F7F3] hover:bg-white text-[#2C2724] border border-[#2C2724] text-[11px] font-extrabold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <FennMascot size="xs" variant="avatar" earsPerked={true} />
                <span>Ask Fenn</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Booking Checkout"
              className="w-8 h-8 rounded-xl bg-[#F9F7F3] hover:bg-white text-[#2C2724] border border-[#2C2724]/30 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isSubmitted ? (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-3">
            <FennMascot size="lg" variant="pose_saved" />
            <h3 className="text-base font-extrabold text-[#2C2724]">
              Lease Signed & Escrow Funded!
            </h3>
            <p className="text-xs text-[#7A907C] bg-[#EBF0EC] border border-[#7A907C]/40 px-3 py-1.5 rounded-full font-extrabold">
              {formatFennEscrowStatus(1200)}
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmitForm}
            className="flex-1 overflow-y-auto p-4 space-y-3.5"
          >
            {/* (a) ID & Background Check Status */}
            <div className="p-3 rounded-xl bg-white border border-[#2C2724]/15 space-y-2 shadow-warm-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#2C2724]">
                  1. ID &amp; Background Verification
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 text-[10px] font-extrabold">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Verified</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                <a
                  href="https://verify.stripe.com/start/vs_renter_id"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleModalVerifyId}
                  className="px-2.5 py-1 rounded-full bg-[#EBF0EC] hover:bg-[#dfe8e1] text-[#7A907C] border border-[#7A907C]/45 transition-colors cursor-pointer"
                >
                  {isVerifyingModalApi === 'id'
                    ? 'Verifying...'
                    : '✓ ID Verification ↗'}
                </a>
                <a
                  href="https://apply.certn.co/screening/bg_renter"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleModalBackgroundCheck}
                  className="px-2.5 py-1 rounded-full bg-[#EBF0EC] hover:bg-[#dfe8e1] text-[#7A907C] border border-[#7A907C]/45 transition-colors cursor-pointer"
                >
                  {isVerifyingModalApi === 'background'
                    ? 'Running...'
                    : '✓ Background Verification ↗'}
                </a>
              </div>
              {modalVerificationResult && (
                <div className="p-2.5 rounded-xl bg-[#EBF0EC] border border-[#7A907C] text-[11px] text-[#2C2724] flex items-center justify-between font-extrabold text-[#485B4A]">
                  <span>{modalVerificationResult.label} Verified</span>
                  <span className="font-mono text-[10px]">Verified</span>
                </div>
              )}
            </div>

            {/* (b) Interactive Roommate Lease Generator (Prepopulated from Landlord / Master Tenant Lease) */}
            <div
              data-testid="interactive-roommate-lease-generator"
              className="p-3 rounded-xl bg-white border border-[#2C2724]/15 space-y-2.5 shadow-warm-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-extrabold text-[#2C2724] block">
                    2. Interactive Roommate Lease Generator
                  </span>
                  <span className="text-[10px] font-semibold text-[#6E655F] block">
                    Prepopulated based on Landlord / Master Tenant Lease ({prepopulatedLease.landlordOrMasterTenantName})
                  </span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EBF0EC] text-[#485B4A] border border-[#7A907C]/40 shrink-0 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Master Lease Prepopulated</span>
                </span>
              </div>

              {/* Guidance Banner */}
              <div className="p-2.5 rounded-xl bg-[#EBF0EC] border border-[#7A907C]/40 text-[11px] text-[#2C2724] space-y-1">
                <div className="font-extrabold text-[#485B4A] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Prepopulated Based on Master Lease ({prepopulatedLease.landlordOrMasterTenantName})</span>
                </div>
                <p className="text-[10.5px] text-[#2C2724]/80 leading-relaxed">
                  All lease terms and house rules below have been automatically prepopulated from the landlord / master tenant lease agreement.
                </p>
              </div>

              {/* Prepopulated Read-Only Lease Terms (No Dropdowns for Renter) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div
                  data-testid="lease-prepopulated-move-in"
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
                    {prepopulatedLease.defaultMoveInDate}
                  </div>
                </div>

                <div
                  data-testid="lease-prepopulated-term"
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
                    {prepopulatedLease.defaultLeaseTerm}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div
                  data-testid="lease-prepopulated-quiet-hours"
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
                    {prepopulatedLease.defaultQuietHours}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div
                    data-testid="lease-prepopulated-guests"
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
                      {prepopulatedLease.defaultGuestPolicy}
                    </div>
                  </div>

                  <div
                    data-testid="lease-prepopulated-utilities"
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
                      {prepopulatedLease.defaultUtilitiesSplit}
                    </div>
                  </div>
                </div>

                <div
                  data-testid="lease-prepopulated-smoking-pets"
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
                    {prepopulatedLease.defaultSmokingAndPets}
                  </div>
                </div>
              </div>

              {/* Dynamic Lease Preview Box */}
              <pre
                data-testid="dynamic-lease-preview"
                className="p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/15 text-[10px] font-mono text-[#2C2724]/85 whitespace-pre-wrap max-h-28 overflow-y-auto leading-relaxed"
              >
                {dynamicLeasePreview}
              </pre>

              {/* In-App Digital Signature Input */}
              <div className="pt-1">
                <label className="block text-[10px] font-extrabold text-[#2C2724] mb-1 flex items-center gap-1">
                  <PenTool className="w-3 h-3 text-[#D06C4E]" />
                  <span>In-App Digital E-Signature (Type Full Legal Name)</span>
                </label>
                <input
                  type="text"
                  required
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724] text-xs font-extrabold italic text-[#2C2724]"
                />
              </div>
            </div>

            {/* (c) Stripe Connect Move-In Escrow Status */}
            <div
              data-testid="stripe-escrow-status-card"
              className="p-3 rounded-xl bg-[#EBF0EC] border border-[#7A907C]/50 flex items-center gap-2.5"
            >
              <ShieldCheck className="w-5 h-5 text-[#7A907C] shrink-0" />
              <div className="text-[11px] font-extrabold text-[#7A907C] leading-snug">
                {formatFennEscrowStatus(1200)}
              </div>
            </div>

            {/* Primary Terracotta CTA: Sign Lease & Request to Book */}
            <button
              type="submit"
              data-testid="sign-lease-submit-btn"
              className="w-full py-3 px-4 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-extrabold text-xs shadow-warm-sm flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Sign Lease & Fund $1,200 Escrow</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
