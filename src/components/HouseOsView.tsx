import React, { useState } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  ShieldCheck,
  TrendingUp,
  Zap,
  Sparkles,
  Calendar,
  Building2,
  Receipt,
  CreditCard,
  Flame,
} from 'lucide-react';
import {
  SAMPLE_PGE_UTILITY_BILL,
  calculateUtilityBillSplit,
  INITIAL_CREDIT_BOOST_LOGS,
  UtilityBillSplitSummary,
} from '../utils/trustSafety';

interface HouseOsViewProps {
  onOpenRenterLandlordHub: () => void;
  onOpenMessages: () => void;
}

export const HouseOsView: React.FC<HouseOsViewProps> = ({
  onOpenRenterLandlordHub,
  onOpenMessages,
}) => {
  const [splitSummary, setSplitSummary] = useState<UtilityBillSplitSummary>(() =>
    calculateUtilityBillSplit(SAMPLE_PGE_UTILITY_BILL)
  );
  const [isParsingBill, setIsParsingBill] = useState(false);
  const [billAddedToStripePull, setBillAddedToStripePull] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>(
    'PGE_Statement_Oct2026_742Valencia.pdf'
  );

  // Fenn Credit Boost state
  const [creditBoostEnabled, setCreditBoostEnabled] = useState<boolean>(true);
  const [streakMonths] = useState<number>(6);

  const handleTestWithSamplePgeBill = async () => {
    setIsParsingBill(true);
    setBillAddedToStripePull(false);
    setUploadedFileName('Sample_PGE_Bill_742Valencia_Oct2026.pdf');

    try {
      const response = await fetch('/api/gemini/parse-utility-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billText:
            'Pacific Gas & Electric (PG&E) Statement. Service Address: 742 Valencia St, Apt 3B, Mission District, San Francisco, CA 94110. Billing Period: Oct 01, 2026 - Oct 31, 2026. Total Amount Due: $228.60. Due Date: Nov 15, 2026.',
        }),
      });
      const data = await response.json();
      if (response.ok && data.bill) {
        setSplitSummary(data);
      } else {
        setSplitSummary(calculateUtilityBillSplit(SAMPLE_PGE_UTILITY_BILL));
      }
    } catch {
      setSplitSummary(calculateUtilityBillSplit(SAMPLE_PGE_UTILITY_BILL));
    } finally {
      setIsParsingBill(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    handleTestWithSamplePgeBill();
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F9F7F3] text-[#2C2724] overflow-hidden">
      {/* Top Header */}
      <header className="px-4 py-3.5 bg-white border-b border-[#2C2724]/15 flex items-center justify-between gap-2 shrink-0">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-sm font-extrabold text-[#2C2724]">
              House OS • Monthly Living Loop
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 text-[10px] font-extrabold">
              Move-In Escrow Active
            </span>
          </div>
          <p className="text-[11px] text-[#2C2724]/70">
            AI Utility Bill Splitter & Fenn Credit Boost
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenRenterLandlordHub}
            className="px-2.5 py-1.5 rounded-xl bg-[#F9F7F3] hover:bg-white text-[#2C2724] border border-[#2C2724] text-[10px] font-extrabold flex items-center gap-1 shadow-warm-sm"
          >
            <Building2 className="w-3.5 h-3.5 text-[#D06C4E]" />
            <span>Renter / Landlord</span>
          </button>
          <button
            type="button"
            onClick={onOpenMessages}
            className="px-2.5 py-1.5 rounded-xl bg-[#F9F7F3] hover:bg-white text-[#2C2724] border border-[#2C2724] text-[10px] font-extrabold"
          >
            Chat
          </button>
        </div>
      </header>

      {/* Scrollable Dashboard */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {/* MODULE 1: AI Utility Bill Splitter (Powered by Gemini) */}
        <section
          data-testid="house-os-utility-splitter"
          className="bg-white rounded-xl border border-[#2C2724]/20 p-4 shadow-warm-sm space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 text-[10px] font-extrabold">
                <Sparkles className="w-3 h-3" />
                <span>Gemini Structured JSON Extraction</span>
              </span>
              <h2 className="text-sm font-extrabold text-[#2C2724] mt-1">
                AI Utility Bill Splitter
              </h2>
              <p className="text-[11px] text-[#2C2724]/70">
                Upload a utility statement or test with a sample PG&E bill to auto-split across 3 roommates.
              </p>
            </div>
          </div>

          {/* Upload / Sample Bill Trigger Row */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="test-sample-pge-bill-btn"
              onClick={handleTestWithSamplePgeBill}
              disabled={isParsingBill}
              className="px-3 py-2 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-xs font-extrabold flex items-center gap-1.5 shadow-warm-sm transition-all active:scale-95"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>
                {isParsingBill ? 'Extracting via Gemini...' : 'Test with Sample PG&E Bill'}
              </span>
            </button>

            <label className="px-3 py-2 rounded-xl bg-[#F9F7F3] hover:bg-white text-[#2C2724] border border-[#2C2724] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95">
              <Upload className="w-3.5 h-3.5 text-[#D06C4E]" />
              <span>Upload Bill PDF/Image</span>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Extracted Structured JSON Fields Card */}
          <div className="p-3 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/15 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold text-[#2C2724] flex items-center gap-1.5 min-w-0">
                <FileText className="w-3.5 h-3.5 text-[#D06C4E] shrink-0" />
                <span className="truncate">{uploadedFileName}</span>
              </span>
              {splitSummary.bill.address_match_verified && (
                <span
                  data-testid="address-match-verified-badge"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 text-[10px] font-extrabold shrink-0"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Address Match Verified</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded-lg bg-white border border-[#2C2724]/10">
                <div className="text-[9px] uppercase font-bold text-[#2C2724]/60">
                  utility_provider
                </div>
                <div className="font-extrabold text-[#2C2724]">
                  {splitSummary.bill.utility_provider}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-[#2C2724]/10">
                <div className="text-[9px] uppercase font-bold text-[#2C2724]/60">
                  billing_period
                </div>
                <div className="font-extrabold text-[#2C2724]">
                  {splitSummary.bill.billing_period}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-[#2C2724]/10">
                <div className="text-[9px] uppercase font-bold text-[#2C2724]/60">
                  total_amount_due
                </div>
                <div className="font-black text-sm text-[#D06C4E]">
                  ${splitSummary.bill.total_amount_due.toFixed(2)}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-[#2C2724]/10">
                <div className="text-[9px] uppercase font-bold text-[#2C2724]/60">
                  due_date • 3-way split
                </div>
                <div className="font-extrabold text-[#2C2724]">
                  {splitSummary.bill.due_date} (${splitSummary.perRoommateShare.toFixed(2)}/ea)
                </div>
              </div>
            </div>

            <div className="text-[10px] text-[#2C2724]/75 font-medium">
              <strong>service_address:</strong> {splitSummary.bill.service_address}
            </div>
          </div>

          {/* Itemized 3-Roommate Combined Base Rent + Utility Share Breakdown */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-extrabold text-[#2C2724]">
              <span>Roommate Invoice Breakdown ({splitSummary.roommateCount} Rooms)</span>
              <span className="text-[#7A907C]">Base Rent + Utility Share</span>
            </div>

            {splitSummary.splits.map((rm, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/15 flex items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-extrabold text-[#2C2724]">{rm.roommateName}</div>
                  <div className="text-[10px] text-[#2C2724]/65">
                    {rm.roomLabel} • ${rm.baseRent.toLocaleString()} rent + $
                    {rm.utilityShare.toFixed(2)} PG&E
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-xs text-[#2C2724]">
                    ${rm.combinedStripePull.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[9px] font-bold text-[#7A907C]">
                    {billAddedToStripePull ? 'Queued in Stripe Pull ✓' : 'Combined Invoice'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons: Split Bill & Add to Next Month's Automated Stripe Rent Pull */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleTestWithSamplePgeBill}
              className="py-2.5 px-3.5 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-extrabold text-xs shadow-warm-sm transition-all active:scale-95 shrink-0"
            >
              Split Bill
            </button>
            <button
              type="button"
              data-testid="add-to-stripe-rent-pull-btn"
              onClick={() => setBillAddedToStripePull(true)}
              className={`flex-1 py-2.5 px-3 rounded-xl font-extrabold text-xs border transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                billAddedToStripePull
                  ? 'bg-[#EBF0EC] text-[#7A907C] border-[#7A907C]'
                  : 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724] hover:bg-[#2C2724]/90'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>
                {billAddedToStripePull
                  ? 'Added to Next Month’s Stripe Rent Pull ✓'
                  : "Add to Next Month's Automated Stripe Rent Pull"}
              </span>
            </button>
          </div>
        </section>

        {/* MODULE 2: Fenn Credit Boost (Rent Reporting to Equifax & TransUnion) */}
        <section
          data-testid="house-os-credit-boost"
          className="bg-white rounded-xl border border-[#2C2724]/20 p-4 shadow-warm-sm space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  data-testid="credit-boost-badge"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 text-[10px] font-extrabold"
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>{creditBoostEnabled ? 'Credit Boost On' : 'Credit Boost Paused'}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724]/20 text-[10px] font-extrabold">
                  <Flame className="w-3 h-3 text-[#D06C4E]" />
                  <span>{streakMonths} Month On-Time Streak</span>
                </span>
              </div>
              <h2 className="text-sm font-extrabold text-[#2C2724] mt-1.5">
                Fenn Credit Boost • Rent Reporting
              </h2>
            </div>

            {/* Estimated Credit Score Impact Pill */}
            <div className="px-3 py-1.5 rounded-xl bg-[#EBF0EC] border border-[#7A907C]/40 text-right shrink-0">
              <div className="text-sm font-black text-[#7A907C] flex items-center gap-0.5 justify-end">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>+28 pts</span>
              </div>
              <div className="text-[9px] font-bold text-[#2C2724]/70">Est. Score Impact</div>
            </div>
          </div>

          {/* Opt-in Toggle Row */}
          <div className="p-3 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/15 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold text-[#2C2724]">
                Report on-time rent to Equifax & TransUnion
              </div>
              <div className="text-[10px] text-[#2C2724]/70">
                Automatically furnishes verified Stripe Connect rent payments every month at $0 extra fee.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={creditBoostEnabled}
              data-testid="credit-boost-toggle"
              onClick={() => setCreditBoostEnabled((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all shrink-0 ${
                creditBoostEnabled
                  ? 'bg-[#7A907C] text-white border-[#7A907C]'
                  : 'bg-white text-[#2C2724] border-[#2C2724]/40'
              }`}
            >
              {creditBoostEnabled ? 'Enabled ✓' : 'Enable'}
            </button>
          </div>

          {/* Past Months' Rent Payments Furnished to Bureaus Log */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-extrabold text-[#2C2724] flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-[#7A907C]" />
              <span>Bureau Reporting Log (Equifax & TransUnion)</span>
            </div>

            <div className="space-y-1.5">
              {INITIAL_CREDIT_BOOST_LOGS.map((entry) => (
                <div
                  key={entry.id}
                  className="px-3 py-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/12 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-[#7A907C]" />
                    <div>
                      <span className="font-extrabold text-[#2C2724]">
                        {entry.monthLabel}
                      </span>
                      <span className="text-[10px] text-[#2C2724]/65 ml-1.5">
                        (${entry.amountReported.toLocaleString()} • {entry.bureaus})
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 text-[10px] font-extrabold">
                      {entry.status}
                    </span>
                    <span className="text-[11px] font-black text-[#7A907C]">
                      {entry.scoreDelta}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
