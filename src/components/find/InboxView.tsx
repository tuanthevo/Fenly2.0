/**
 * Inbox (Fenly 2.0): one thread per application. Messages refresh every 10 s
 * while a thread is open. Flagged messages show a scam warning to the
 * recipient. Report and block from the thread menu. Applicants whose room was
 * filled see "This room is taken" with similar rooms nearby.
 *
 * A renter's rows lead with the room (cover, rent, place) and always show where
 * the application stands; closed ones fold into "Past applications"
 * (src/find/inboxRows.ts). Hosts' rows lead with the applicant, as before.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Ban, ChevronDown, ChevronRight, Flag, Home, Loader2, MoreHorizontal, Send, Users } from 'lucide-react';
import { findApi, type InboxThread, type ThreadMessage } from '../../lib/findApi';
import { ApiError } from '../../lib/fillApi';
import { roomTakenText } from '../../find/hostText';
import { applicationStatus, canViewRoom, roomLine, splitInbox, type StatusTone } from '../../find/inboxRows';
import { EMPTY_STATE, TAB_VALUE } from '../../config/launchCopy';
import { formatRentCents } from '../../fill/publicListing';
import { ReportSheet } from './ReportSheet';

const POLL_MS = 10_000;

const STATUS_LINE: Record<string, string> = {
  submitted: 'Applied',
  shortlisted: 'Shortlisted',
  chosen: 'Chosen',
  declined: 'Not chosen',
  withdrawn: 'Withdrawn',
};

const CHIP_TONE: Record<StatusTone, string> = {
  pending: 'bg-white border-[#2C2724]/25 text-[#2C2724]',
  good: 'bg-[#E8EFE9] border-[#7A907C]/50 text-[#485B4A]',
  closed: 'bg-[#F2EFE9] border-[#F2EFE9] text-[#6E655F]',
};

/** Where a renter's application stands: Pending, Shortlisted, Chosen, Not chosen */
const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  const { label, tone } = applicationStatus(status);
  return (
    <span data-testid="application-status" className={`shrink-0 px-2 py-0.5 rounded-full border text-xs font-extrabold whitespace-nowrap ${CHIP_TONE[tone]}`}>
      {label}
    </span>
  );
};

/** The room's video cover; a plain tile when the room has none (or is no longer listed) */
const RoomThumb: React.FC<{ listing: InboxThread['listing'] }> = ({ listing }) => {
  const [failed, setFailed] = useState(false);
  if (!listing || !canViewRoom(listing) || failed) {
    return (
      <div className="w-12 h-12 rounded-xl bg-[#F2EFE9] text-[#6E655F] flex items-center justify-center shrink-0">
        <Home className="w-5 h-5" />
      </div>
    );
  }
  return (
    <img
      src={`/api/media/thumb/${listing.id}`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-12 h-12 rounded-xl object-cover bg-[#F2EFE9] shrink-0"
    />
  );
};

/** In a renter's conversation: which room this is, where the application stands, and a way back to the room page */
const RoomStrip: React.FC<{ listing: InboxThread['listing']; status: string }> = ({ listing, status }) => {
  const body = (
    <>
      <RoomThumb listing={listing} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold truncate mb-0.5">{roomLine(listing)}</div>
        <div className="flex"><StatusChip status={status} /></div>
      </div>
    </>
  );
  const box = 'flex items-center gap-3 px-3.5 py-2.5 bg-white border-b border-[#2C2724]/15 text-left';
  return listing && canViewRoom(listing) ? (
    <a href={`/r/${listing.id}`} data-testid="thread-view-room" className={`${box} hover:bg-[#F9F7F3]`}>
      {body}
      <span className="shrink-0 flex items-center gap-0.5 text-xs font-extrabold text-[#A9513A]">
        View room <ChevronRight className="w-4 h-4" />
      </span>
    </a>
  ) : (
    <div data-testid="thread-room" className={box}>
      {body}
    </div>
  );
};

const ThreadRow: React.FC<{ thread: InboxThread; onOpen: () => void }> = ({ thread: t, onOpen }) => {
  const area = t.listing?.neighborhood || 'the Bay Area';
  const mine = t.role === 'applicant';
  const taken = mine && t.declineReason === 'room_filled';
  const who = t.other?.firstName ?? (mine ? 'Host' : 'Applicant');
  const preview = taken
    ? roomTakenText(area, t.similar.length)
    : t.lastMessage
    ? `${t.lastMessage.fromMe ? 'You' : who}: ${t.lastMessage.body}`
    : mine
    ? `Host: ${who}`
    : STATUS_LINE[t.status] ?? t.status;
  return (
    <button type="button" onClick={onOpen} data-testid={`thread-${t.applicationId}`} className="w-full px-3.5 py-3 flex items-center gap-3 hover:bg-[#F9F7F3] text-left">
      {mine ? (
        <RoomThumb listing={t.listing} />
      ) : t.other?.photoUrl ? (
        <img src={t.other.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-[#7A907C] shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-[#D06C4E]/15 text-[#A9513A] flex items-center justify-center font-black shrink-0">
          {who.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        {mine ? (
          <div className="text-sm font-extrabold truncate mb-0.5">{roomLine(t.listing)}</div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-extrabold truncate">{who}</span>
            <span className="text-xs font-bold text-[#6E655F] truncate">· {area}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 min-w-0">
          {mine && <StatusChip status={t.status} />}
          <span className={`text-xs truncate ${t.unread ? 'font-extrabold text-[#2C2724]' : 'text-[#6E655F]'}`}>{preview}</span>
        </div>
      </div>
      {t.unread > 0 && (
        <span aria-label={`${t.unread} unread`} className="min-w-5 h-5 px-1.5 rounded-full bg-[#B85B3F] text-white text-xs font-black flex items-center justify-center">
          {t.unread}
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
    </button>
  );
};

interface InboxViewProps {
  signedIn: boolean;
  onRequestSignIn: () => void;
  /** open this thread first (deep link or "Message" on an applicant card) */
  initialThreadId?: string | null;
  onOpenApplicants: (listingId: string) => void;
}

export const InboxView: React.FC<InboxViewProps> = ({ signedIn, onRequestSignIn, initialThreadId, onOpenApplicants }) => {
  const [threads, setThreads] = useState<InboxThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialThreadId ?? null);
  const [showPast, setShowPast] = useState(false);

  const loadThreads = useCallback(async () => {
    try {
      setThreads((await findApi.inbox()).threads);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your inbox.");
    }
  }, []);

  useEffect(() => {
    if (signedIn) void loadThreads();
  }, [signedIn, loadThreads]);
  useEffect(() => {
    if (initialThreadId) setOpenId(initialThreadId);
  }, [initialThreadId]);

  if (!signedIn) {
    return (
      <div className="flex-1 p-4 bg-[#F9F7F3]" data-testid="inbox-signed-out">
        <div className="px-1 pt-1 pb-4">
          <h2 className="text-2xl font-extrabold leading-tight">Your conversations, in one place</h2>
          <p className="text-sm text-[#6E655F] mt-1.5">{TAB_VALUE.messages.line}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-[#2C2724]/10 space-y-4">
          <ul className="space-y-3 text-sm">
            <li>
              <span className="font-extrabold block">See where each application stands</span>
              <span className="text-[#6E655F]">Pending, Shortlisted or Chosen, on every room you applied to.</span>
            </li>
            <li>
              <span className="font-extrabold block">Message hosts without sharing your number</span>
              <span className="text-[#6E655F]">Messages that look like a scam are flagged for you.</span>
            </li>
          </ul>
          <button type="button" onClick={onRequestSignIn} className="w-full min-h-12 rounded-xl bg-[#B85B3F] hover:bg-[#A9513A] text-white text-base font-extrabold active:scale-95 transition-all">
            Sign in to see your Inbox
          </button>
        </div>
      </div>
    );
  }

  const open = threads?.find((t) => t.applicationId === openId) ?? null;
  if (openId && (open || threads === null)) {
    return open ? (
      <ThreadView
        thread={open}
        onBack={() => {
          setOpenId(null);
          void loadThreads();
        }}
        onOpenApplicants={onOpenApplicants}
      />
    ) : (
      <div className="flex-1 flex items-center justify-center bg-[#F9F7F3] text-[#6E655F]"><Loader2 className="w-5 h-5 animate-spin" /></div>
    );
  }

  const { active, past } = splitInbox(threads ?? []);

  return (
    <div className="flex-1 overflow-y-auto bg-[#F9F7F3] text-[#2C2724] p-3.5 space-y-3" data-testid="inbox-view">
      <h2 className="font-extrabold text-base px-1">Inbox</h2>
      {error && <p className="text-xs font-bold text-[#9A4A33]">{error}</p>}
      {threads === null && !error ? (
        <div className="flex justify-center py-8 text-[#6E655F]"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : threads && threads.length === 0 ? (
        <div className="p-4 rounded-2xl bg-white border border-[#2C2724]/15 text-center space-y-1" data-testid="inbox-empty">
          <h2 className="text-sm font-extrabold">{EMPTY_STATE.inboxEmpty.title}</h2>
          <p className="text-xs text-[#6E655F]">{EMPTY_STATE.inboxEmpty.line}</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="rounded-2xl bg-white border border-[#2C2724]/15 divide-y divide-[#2C2724]/10 shadow-warm-sm overflow-hidden">
              {active.map((t) => (
                <ThreadRow key={t.applicationId} thread={t} onOpen={() => setOpenId(t.applicationId)} />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <section className="space-y-2">
              <button
                type="button"
                data-testid="inbox-past-toggle"
                aria-expanded={showPast}
                aria-controls="inbox-past"
                onClick={() => setShowPast(!showPast)}
                className="w-full min-h-10 px-1 flex items-center justify-between text-xs font-extrabold text-[#6E655F] hover:text-[#2C2724]"
              >
                <span>Past applications ({past.length})</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showPast ? 'rotate-180' : ''}`} />
              </button>
              {showPast && (
                <div id="inbox-past" className="rounded-2xl bg-white border border-[#2C2724]/15 divide-y divide-[#2C2724]/10 overflow-hidden">
                  {past.map((t) => (
                    <ThreadRow key={t.applicationId} thread={t} onOpen={() => setOpenId(t.applicationId)} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};

const ThreadView: React.FC<{ thread: InboxThread; onBack: () => void; onOpenApplicants: (listingId: string) => void }> = ({ thread, onBack, onOpenApplicants }) => {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [status, setStatus] = useState(thread.status);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState<{ type: 'user' | 'message' | 'listing'; id: string; label: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const area = thread.listing?.neighborhood || 'the Bay Area';
  const otherName = thread.other?.firstName ?? (thread.role === 'applicant' ? 'the host' : 'the applicant');

  const load = useCallback(async () => {
    try {
      const data = await findApi.messages(thread.applicationId);
      setMessages(data.messages);
      setStatus(data.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load messages.");
    }
  }, [thread.applicationId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);
  // Braces matter: newer Chrome returns a promise from scrollIntoView, and an effect that returns one crashes the screen
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const sent = await findApi.send(thread.applicationId, body);
      setDraft('');
      if (sent.masked) setNotice('Contact details stay hidden until the host chooses you. Keep chatting here.');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.body?.message ?? e.message : "Couldn't send. Try again.");
    } finally {
      setSending(false);
    }
  };

  const block = async () => {
    if (!thread.other) return;
    setMenu(false);
    try {
      await findApi.block(thread.other.id);
      setNotice(`You blocked ${otherName}. They can't message you or apply to your rooms.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't block.");
    }
  };

  const taken = thread.role === 'applicant' && thread.declineReason === 'room_filled';

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F9F7F3] text-[#2C2724]" data-testid="thread-view">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#2C2724]/15 bg-white">
        <button type="button" onClick={onBack} aria-label="Back to inbox" className="w-10 h-10 rounded-xl border border-[#2C2724] flex items-center justify-center shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold truncate">{thread.other?.firstName ?? 'Conversation'}</div>
          <div className="text-xs font-bold text-[#6E655F] truncate">
            {thread.role === 'applicant' ? 'Host' : `${thread.listing?.title || `Room in ${area}`} · ${STATUS_LINE[status] ?? status}`}
          </div>
        </div>
        {thread.role !== 'applicant' && thread.listing && (
          <button type="button" onClick={() => onOpenApplicants(thread.listing!.id)} className="min-h-10 px-2 rounded-lg border border-[#2C2724]/20 text-xs font-bold flex items-center gap-1 shrink-0">
            <Users className="w-3.5 h-3.5" /> Applicants
          </button>
        )}
        <div className="relative">
          <button type="button" onClick={() => setMenu(!menu)} aria-label="More" className="w-10 h-10 rounded-xl hover:bg-[#F2EFE9] flex items-center justify-center">
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-11 z-20 w-52 rounded-xl bg-white border border-[#2C2724]/20 shadow-warm p-1 text-xs font-bold">
              {thread.other && (
                <button type="button" onClick={() => { setMenu(false); setReport({ type: 'user', id: thread.other!.id, label: otherName }); }} className="w-full min-h-10 text-left px-3 py-2 rounded-lg hover:bg-[#F2EFE9] flex items-center gap-2">
                  <Flag className="w-3.5 h-3.5" /> Report {otherName}
                </button>
              )}
              {thread.role === 'applicant' && thread.listing && (
                <button type="button" onClick={() => { setMenu(false); setReport({ type: 'listing', id: thread.listing!.id, label: 'this listing' }); }} className="w-full min-h-10 text-left px-3 py-2 rounded-lg hover:bg-[#F2EFE9] flex items-center gap-2">
                  <Flag className="w-3.5 h-3.5" /> Report listing
                </button>
              )}
              {thread.other && (
                <button type="button" onClick={() => void block()} className="w-full min-h-10 text-left px-3 py-2 rounded-lg hover:bg-[#F2EFE9] text-[#9A4A33] flex items-center gap-2">
                  <Ban className="w-3.5 h-3.5" /> Block {otherName}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {thread.role === 'applicant' && <RoomStrip listing={thread.listing} status={status} />}

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {taken && (
          <div className="p-3 rounded-2xl bg-white border border-[#2C2724]/15 space-y-2" data-testid="room-taken">
            <p className="text-xs font-extrabold">{roomTakenText(area, thread.similar.length)}</p>
            {thread.similar.map((s) => (
              <a key={s.url} href={s.url} className="flex items-center justify-between min-h-11 px-3 py-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/10 text-xs font-bold">
                <span>{s.area} · {s.rent}/mo</span>
                <ChevronRight className="w-4 h-4" />
              </a>
            ))}
          </div>
        )}
        {status === 'chosen' && thread.role === 'applicant' && (
          <p className="text-xs font-bold p-3 rounded-xl bg-[#EBF0EC] border border-[#7A907C]/40 text-[#485B4A]">The host chose you. Sort out the move-in details here.</p>
        )}
        {messages === null ? (
          <div className="flex justify-center py-8 text-[#6E655F]"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : messages.length === 0 && !taken ? (
          <p className="text-xs text-[#6E655F] text-center py-6">Say hi to {otherName}. {formatRentCents(thread.listing?.rentCents) ? `Room: ${formatRentCents(thread.listing?.rentCents)}/mo.` : ''}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[80%] space-y-1">
                {m.warning && (
                  <div className="text-xs font-bold text-[#9A4A33] bg-[#F7E3DC] border border-[#D06C4E]/40 rounded-lg px-2 py-1 flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {m.warning}
                  </div>
                )}
                <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap break-words ${m.fromMe ? 'bg-[#2C2724] text-[#F9F7F3] rounded-br-md' : 'bg-white border border-[#2C2724]/15 rounded-bl-md'}`}>{m.body}</div>
                {!m.fromMe && (
                  <button type="button" onClick={() => setReport({ type: 'message', id: m.id, label: 'this message' })} className="min-h-8 px-1 text-xs font-bold text-[#6E655F] hover:text-[#9A4A33]" aria-label="Report this message">
                    Report
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {notice && <p className="text-xs font-bold text-[#485B4A] bg-[#EBF0EC] px-3 py-2">{notice}</p>}
      {error && <p className="text-xs font-bold text-[#9A4A33] px-3 py-1">{error}</p>}
      {!taken && status !== 'withdrawn' && (
        <div className="flex items-end gap-2 p-2.5 border-t border-[#2C2724]/15 bg-white pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <textarea
            aria-label={`Message ${otherName}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
            rows={1}
            placeholder={`Message ${otherName}`}
            className="flex-1 max-h-32 bg-[#F9F7F3] border border-[#2C2724]/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D06C4E] resize-none"
          />
          <button type="button" onClick={() => void send()} disabled={sending || !draft.trim()} aria-label="Send" data-testid="message-send" className="w-10 h-10 rounded-xl bg-[#B85B3F] text-white flex items-center justify-center disabled:opacity-50 shrink-0">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      )}

      {report && (
        <ReportSheet
          targetType={report.type}
          targetId={report.id}
          blockUserId={report.type !== 'listing' ? thread.other?.id ?? null : null}
          label={report.label}
          onClose={({ blocked }) => {
            setReport(null);
            if (blocked) setNotice(`You blocked ${otherName}.`);
          }}
        />
      )}
    </div>
  );
};
