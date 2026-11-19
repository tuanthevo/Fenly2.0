/**
 * Applicant inbox for one room (host and housemates). One card per applicant:
 * photo, name, badges, move-in fit, budget fit, intro video, lifestyle answers,
 * housemate votes. Host actions: shortlist, ask for an ID check, message,
 * decline (editable template), choose. Housemates vote; the host decides.
 *
 * The fit chips and the summary come from factual fields only (server: FactualApplicant).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Copy,
  Flag,
  IdCard,
  Loader2,
  MessageCircle,
  Phone,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  UserPlus,
  X,
} from 'lucide-react';
import { findApi, type ApplicantCard, type ApplicantsResponse } from '../../lib/findApi';
import { ApiError } from '../../lib/fillApi';
import { LIFESTYLE_QUESTIONS } from '../../find/lifestyle';
import { declineTemplate } from '../../find/hostText';
import { formatMoveIn, formatRentCents } from '../../fill/publicListing';
import { todayIn } from '../../fill/fillStatus';
import type { FitLevel } from '../../find/fit';
import { ReportSheet } from './ReportSheet';
import { EMPTY_STATE } from '../../config/launchCopy';

const FIT_STYLE: Record<FitLevel, string> = {
  great: 'bg-[#EBF0EC] text-[#485B4A] border-[#7A907C]/40',
  ok: 'bg-[#FBF1DE] text-[#8A5A14] border-[#E3B566]/50',
  off: 'bg-[#F7E3DC] text-[#9A4A33] border-[#D06C4E]/40',
  unknown: 'bg-[#F2EFE9] text-[#6E655F] border-[#2C2724]/15',
};

const STATUS_TEXT: Record<string, string> = {
  submitted: 'New',
  shortlisted: 'Shortlisted',
  chosen: 'Chosen',
  declined: 'Declined',
  withdrawn: 'Withdrew',
};

interface ApplicantInboxProps {
  listingId: string;
  onBack: () => void;
  onOpenThread: (applicationId: string) => void;
}

export const ApplicantInbox: React.FC<ApplicantInboxProps> = ({ listingId, onBack, onOpenThread }) => {
  const [data, setData] = useState<ApplicantsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<{ headline: string; applicants: Record<string, { fit: string; reason: string }>; source: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [declining, setDeclining] = useState<ApplicantCard | null>(null);
  const [declineText, setDeclineText] = useState('');
  const [choosing, setChoosing] = useState<ApplicantCard | null>(null);
  const [invite, setInvite] = useState<{ url: string; copied: boolean } | null>(null);
  const [reporting, setReporting] = useState<ApplicantCard | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await findApi.applicants(listingId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load applicants.");
    }
  }, [listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summarize = async () => {
    setAiBusy(true);
    try {
      setAi(await findApi.aiSummary(listingId));
    } catch {
      setAi(null);
    } finally {
      setAiBusy(false);
    }
  };

  const act = async (card: ApplicantCard, action: 'shortlist' | 'decline' | 'choose' | 'request-id', body: Record<string, unknown> = {}) => {
    setBusyId(card.applicationId);
    setActionError(null);
    try {
      await findApi.act(card.applicationId, action, body);
      await load();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.fairHousing) setActionError(`Please rephrase: "${e.fairHousing[0]?.phrases[0]}" can read as who may live there.`);
      else setActionError(e instanceof ApiError ? e.body?.message ?? e.message : "That didn't work. Try again.");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const vote = async (card: ApplicantCard, value: 1 | -1) => {
    const next = card.votes.mine === value ? 0 : value;
    setBusyId(card.applicationId);
    try {
      await findApi.vote(card.applicationId, next);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const makeInvite = async () => {
    try {
      const { url } = await findApi.invite(listingId);
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        // show the link to copy by hand
      }
      setInvite({ url, copied });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't make an invite link.");
    }
  };

  if (error) {
    return (
      <div className="w-full h-full bg-[#F9F7F3] p-4 space-y-3">
        <button type="button" onClick={onBack} className="text-xs font-bold flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
        <p className="text-xs font-bold text-[#9A4A33]">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="w-full h-full bg-[#F9F7F3] flex items-center justify-center text-[#6E655F]">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const isHost = data.role === 'host';
  const area = data.listing.neighborhood || 'San Francisco';
  const open = data.applicants.filter((a) => a.status === 'submitted' || a.status === 'shortlisted' || a.status === 'chosen');
  const closed = data.applicants.filter((a) => !open.includes(a));
  const today = todayIn(new Date());

  const card = (a: ApplicantCard) => {
    const aiNote = ai?.applicants[a.applicationId];
    const busy = busyId === a.applicationId;
    const canAct = isHost && (a.status === 'submitted' || a.status === 'shortlisted') && data.listing.status === 'published';
    return (
      <div key={a.applicationId} data-testid={`applicant-${a.applicationId}`} className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-2.5">
        <div className="flex items-start gap-3">
          {a.photoUrl ? (
            <img src={a.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-[#7A907C] shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-[#D06C4E]/15 text-[#D06C4E] border-2 border-[#7A907C] flex items-center justify-center font-black shrink-0">
              {(a.firstName ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-extrabold text-sm">{a.firstName ?? 'Applicant'}</span>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${a.status === 'chosen' ? 'bg-[#D06C4E] text-white border-[#D06C4E]' : 'bg-[#F2EFE9] border-[#2C2724]/15'}`}>
                {a.status === 'declined' && a.declineReason === 'room_filled' ? 'Room filled' : STATUS_TEXT[a.status] ?? a.status}
              </span>
              {a.fit.strong && a.status !== 'declined' && (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#EBF0EC] text-[#485B4A] border border-[#7A907C]/40 flex items-center gap-0.5">
                  <Star className="w-3 h-3" /> Strong fit
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[10px] font-bold">
              <span className={`px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${a.badges.phone ? 'bg-[#EBF0EC] text-[#485B4A]' : 'bg-[#F2EFE9] text-[#6E655F]'}`}>
                <Phone className="w-3 h-3" /> {a.badges.phone ? 'Phone' : 'No phone'}
              </span>
              {a.badges.id && (
                <span className="px-1.5 py-0.5 rounded-md bg-[#EBF0EC] text-[#485B4A] flex items-center gap-0.5" title={a.badges.idProvider === 'demo' ? 'Demo ID check: not a vendor verification yet' : undefined}>
                  <BadgeCheck className="w-3 h-3" /> ID{a.badges.idProvider === 'demo' ? ' (demo check)' : ''}
                </span>
              )}
              <span className="px-1.5 py-0.5 rounded-md bg-[#F2EFE9] text-[#6E655F]">Passport L{a.badges.level}</span>
              <span className="px-1.5 py-0.5 rounded-md bg-[#F2EFE9] text-[#6E655F]">via {a.channel}</span>
            </div>
          </div>
          <button type="button" onClick={() => setReporting(a)} aria-label="Report applicant" className="w-7 h-7 rounded-lg text-[#6E655F] hover:bg-[#F2EFE9] flex items-center justify-center shrink-0">
            <Flag className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${FIT_STYLE[a.fit.moveIn.level]}`}>
            {a.moveInDate ? `Move-in ${formatMoveIn(a.moveInDate, today) ?? a.moveInDate}: ` : ''}
            {a.fit.moveIn.text}
          </span>
          <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${FIT_STYLE[a.fit.budget.level]}`}>
            {a.budget.maxCents != null ? `Up to ${formatRentCents(a.budget.maxCents)}: ` : ''}
            {a.fit.budget.text}
          </span>
        </div>
        {aiNote && <p className="text-[11px] text-[#485B4A] font-semibold flex items-start gap-1"><Sparkles className="w-3 h-3 mt-0.5 shrink-0" />{aiNote.reason}</p>}

        {a.introUrl && <video src={a.introUrl} controls playsInline preload="metadata" className="w-full max-h-64 rounded-xl bg-black" />}
        {a.note && <p className="text-xs leading-relaxed bg-[#F9F7F3] rounded-xl p-2.5 border border-[#2C2724]/10">“{a.note}”</p>}
        {a.bio && <p className="text-[11px] text-[#6E655F]">{a.bio}</p>}
        {Object.keys(a.lifestyle).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {LIFESTYLE_QUESTIONS.filter((q) => a.lifestyle[q.key]).map((q) => (
              <span key={q.key} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F2EFE9] text-[#2C2724]">
                {q.label}: {a.lifestyle[q.key]}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[#2C2724]/10">
          <button type="button" disabled={busy} onClick={() => void vote(a, 1)} aria-pressed={a.votes.mine === 1} className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${a.votes.mine === 1 ? 'bg-[#EBF0EC] border-[#7A907C]' : 'bg-white border-[#2C2724]/20'}`}>
            <ThumbsUp className="w-3.5 h-3.5" /> {a.votes.up}
          </button>
          <button type="button" disabled={busy} onClick={() => void vote(a, -1)} aria-pressed={a.votes.mine === -1} className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${a.votes.mine === -1 ? 'bg-[#F7E3DC] border-[#D06C4E]' : 'bg-white border-[#2C2724]/20'}`}>
            <ThumbsDown className="w-3.5 h-3.5" /> {a.votes.down}
          </button>
          <button type="button" onClick={() => onOpenThread(a.applicationId)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-white border-[#2C2724]/20 flex items-center gap-1">
            <MessageCircle className="w-3.5 h-3.5" /> Message
          </button>
          {canAct && a.status === 'submitted' && (
            <button type="button" disabled={busy} onClick={() => void act(a, 'shortlist')} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-white border-[#2C2724]/20 flex items-center gap-1">
              <Star className="w-3.5 h-3.5" /> Shortlist
            </button>
          )}
          {canAct && a.status === 'shortlisted' && data.idCheckEnabled && !a.badges.id && (
            <button type="button" disabled={busy || Boolean(a.idCheckRequestedAt)} onClick={() => void act(a, 'request-id')} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-white border-[#2C2724]/20 flex items-center gap-1 disabled:opacity-60">
              <IdCard className="w-3.5 h-3.5" /> {a.idCheckRequestedAt ? 'ID check asked' : 'Ask for ID check'}
            </button>
          )}
          {canAct && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDeclining(a);
                  setDeclineText(declineTemplate(a.firstName, area));
                }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-white border-[#2C2724]/20 flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Decline
              </button>
              <button type="button" disabled={busy} onClick={() => setChoosing(a)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold bg-[#D06C4E] text-white flex items-center gap-1 ml-auto">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Choose
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full bg-[#F9F7F3] text-[#2C2724] pt-4 pb-10 px-3.5 overflow-y-auto space-y-3" data-testid="applicant-inbox">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Back" className="w-9 h-9 rounded-xl bg-white border border-[#2C2724] flex items-center justify-center shrink-0 active:scale-90">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-extrabold truncate">Applicants</h2>
          <div className="text-[11px] text-[#6E655F] truncate">
            {data.listing.title || `Room in ${area}`}
            {data.listing.status === 'filled' ? ' · Filled' : ''}
            {!isHost ? ' · You’re a housemate: vote, the host decides' : ''}
          </div>
        </div>
        {isHost && (
          <button type="button" onClick={() => void makeInvite()} className="px-2.5 py-2 rounded-xl bg-white border border-[#2C2724]/25 text-[11px] font-bold flex items-center gap-1 shrink-0">
            <UserPlus className="w-3.5 h-3.5" /> Housemates
          </button>
        )}
      </div>

      {invite && (
        <div className="p-3 rounded-xl bg-[#EBF0EC] border border-[#7A907C]/40 text-xs space-y-1.5">
          <div className="font-bold text-[#485B4A]">{invite.copied ? 'Invite link copied.' : 'Send this link to a housemate:'} It works once and expires in 7 days.</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate bg-white rounded-lg px-2 py-1 border border-[#2C2724]/10">{invite.url}</code>
            <button type="button" aria-label="Copy invite link" onClick={() => void navigator.clipboard?.writeText(invite.url).then(() => setInvite({ ...invite, copied: true }))} className="w-7 h-7 rounded-lg bg-white border border-[#2C2724]/20 flex items-center justify-center">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="p-3 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-2">
        <div className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-[#D06C4E] mt-0.5 shrink-0" />
          <p className="text-xs font-bold flex-1" data-testid="applicant-summary">{ai?.headline ?? data.summary}</p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-[#6E655F]">Based on badges, move-in, budget and lifestyle answers only.</p>
          {open.length > 0 && !ai && (
            <button type="button" onClick={() => void summarize()} disabled={aiBusy} className="text-[11px] font-extrabold text-[#D06C4E] flex items-center gap-1 shrink-0">
              {aiBusy && <Loader2 className="w-3 h-3 animate-spin" />} Compare with AI
            </button>
          )}
        </div>
      </div>

      {actionError && <p className="text-xs font-bold text-[#9A4A33]">{actionError}</p>}

      {data.applicants.length === 0 ? (
        <div className="p-4 rounded-2xl bg-white border border-[#2C2724]/15 text-center space-y-1">
          <h3 className="text-sm font-extrabold">{EMPTY_STATE.noApplicants.title}</h3>
          <p className="text-xs text-[#6E655F]">{EMPTY_STATE.noApplicants.line}</p>
        </div>
      ) : (
        <div className="space-y-2.5">{open.map(card)}</div>
      )}
      {closed.length > 0 && (
        <div className="space-y-2.5">
          <button type="button" onClick={() => setShowClosed(!showClosed)} className="text-[11px] font-extrabold text-[#6E655F] px-1">
            {showClosed ? 'Hide' : 'Show'} {closed.length} closed
          </button>
          {showClosed && closed.map(card)}
        </div>
      )}

      {declining && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-[#2C2724]/60" onClick={() => setDeclining(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-[#F9F7F3] border border-[#2C2724] rounded-t-3xl sm:rounded-2xl p-5 space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <h3 className="font-extrabold text-sm">Decline {declining.firstName ?? 'this applicant'}</h3>
            <p className="text-[11px] text-[#6E655F]">This message is sent in Inbox and by email. Edit it if you like.</p>
            <textarea value={declineText} maxLength={1000} onChange={(e) => setDeclineText(e.target.value)} className="w-full min-h-[120px] bg-white border border-[#2C2724]/25 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#D06C4E]" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeclining(null)} className="flex-1 py-2.5 rounded-xl bg-white border border-[#2C2724]/25 text-xs font-bold">Cancel</button>
              <button
                type="button"
                disabled={busyId === declining.applicationId}
                onClick={async () => {
                  if (await act(declining, 'decline', { message: declineText })) setDeclining(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#2C2724] text-[#F9F7F3] text-xs font-extrabold"
              >
                Send and decline
              </button>
            </div>
          </div>
        </div>
      )}

      {choosing && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-[#2C2724]/60" onClick={() => setChoosing(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-[#F9F7F3] border border-[#2C2724] rounded-t-3xl sm:rounded-2xl p-5 space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-testid="choose-confirm">
            <h3 className="font-extrabold text-sm">Choose {choosing.firstName ?? 'this applicant'}?</h3>
            <p className="text-xs text-[#6E655F] leading-relaxed">
              Your room is marked filled. {open.filter((a) => a !== choosing && a.status !== 'chosen').length} other applicant(s) get a kind note that the room is taken, with similar rooms nearby.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setChoosing(null)} className="flex-1 py-2.5 rounded-xl bg-white border border-[#2C2724]/25 text-xs font-bold">Not yet</button>
              <button
                type="button"
                disabled={busyId === choosing.applicationId}
                onClick={async () => {
                  if (await act(choosing, 'choose')) setChoosing(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#D06C4E] text-white text-xs font-extrabold flex items-center justify-center gap-1"
              >
                {busyId === choosing.applicationId && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Choose and fill the room
              </button>
            </div>
          </div>
        </div>
      )}

      {reporting && (
        <ReportSheet
          targetType="user"
          targetId={reporting.applicantId}
          blockUserId={reporting.applicantId}
          label={reporting.firstName ?? 'this applicant'}
          onClose={() => setReporting(null)}
        />
      )}
    </div>
  );
};
