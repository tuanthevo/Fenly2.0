/**
 * Inbox (Fenly 2.0): one thread per application. Messages refresh every 10 s
 * while a thread is open. Flagged messages show a scam warning to the
 * recipient. Report and block from the thread menu. Applicants whose room was
 * filled see "This room is taken" with similar rooms nearby.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Ban, ChevronRight, Flag, Loader2, MoreHorizontal, Send, Users } from 'lucide-react';
import { findApi, type InboxThread, type ThreadMessage } from '../../lib/findApi';
import { ApiError } from '../../lib/fillApi';
import { roomTakenText } from '../../find/hostText';
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
        <div className="p-4 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-3">
          <h2 className="font-extrabold text-base">Inbox</h2>
          <p className="text-xs text-[#6E655F]">Messages with hosts and applicants show up here once you apply to a room or fill one.</p>
          <button type="button" onClick={onRequestSignIn} className="w-full py-2.5 rounded-xl bg-[#D06C4E] text-white text-sm font-extrabold shadow-warm-sm">
            Sign in
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

  return (
    <div className="flex-1 overflow-y-auto bg-[#F9F7F3] text-[#2C2724] p-3.5 space-y-3" data-testid="inbox-view">
      <h2 className="font-extrabold text-base px-1">Inbox</h2>
      {error && <p className="text-xs font-bold text-[#9A4A33]">{error}</p>}
      {threads === null && !error ? (
        <div className="flex justify-center py-8 text-[#6E655F]"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : threads && threads.length === 0 ? (
        <p className="text-xs text-[#6E655F] px-1">No conversations yet. Apply to a room in Find, or share your room’s link from Fill.</p>
      ) : (
        <div className="rounded-2xl bg-white border border-[#2C2724]/15 divide-y divide-[#2C2724]/10 shadow-warm-sm overflow-hidden">
          {threads?.map((t) => {
            const area = t.listing?.neighborhood || 'San Francisco';
            const taken = t.role === 'applicant' && t.declineReason === 'room_filled';
            return (
              <button key={t.applicationId} type="button" onClick={() => setOpenId(t.applicationId)} data-testid={`thread-${t.applicationId}`} className="w-full px-3.5 py-3 flex items-center gap-3 hover:bg-[#F9F7F3] text-left">
                {t.other?.photoUrl ? (
                  <img src={t.other.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-[#7A907C] shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#D06C4E]/15 text-[#D06C4E] flex items-center justify-center font-black shrink-0">
                    {(t.other?.firstName ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-extrabold truncate">{t.other?.firstName ?? (t.role === 'applicant' ? 'Host' : 'Applicant')}</span>
                    <span className="text-[10px] font-bold text-[#6E655F] truncate">· {area}</span>
                  </div>
                  <div className={`text-[11px] truncate ${t.unread ? 'font-extrabold text-[#2C2724]' : 'text-[#6E655F]'}`}>
                    {taken ? roomTakenText(area, t.similar.length) : t.lastMessage ? `${t.lastMessage.fromMe ? 'You: ' : ''}${t.lastMessage.body}` : STATUS_LINE[t.status] ?? t.status}
                  </div>
                </div>
                {t.unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#D06C4E] text-white text-[10px] font-black flex items-center justify-center">{t.unread}</span>}
                <ChevronRight className="w-4 h-4 text-[#6E655F] shrink-0" />
              </button>
            );
          })}
        </div>
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
  const area = thread.listing?.neighborhood || 'San Francisco';
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
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [messages?.length]);

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
        <button type="button" onClick={onBack} aria-label="Back to inbox" className="w-8 h-8 rounded-xl border border-[#2C2724] flex items-center justify-center shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold truncate">{thread.other?.firstName ?? 'Conversation'}</div>
          <div className="text-[10px] font-bold text-[#6E655F] truncate">
            {thread.listing?.title || `Room in ${area}`} · {STATUS_LINE[status] ?? status}
          </div>
        </div>
        {thread.role !== 'applicant' && thread.listing && (
          <button type="button" onClick={() => onOpenApplicants(thread.listing!.id)} className="px-2 py-1.5 rounded-lg border border-[#2C2724]/20 text-[10px] font-bold flex items-center gap-1 shrink-0">
            <Users className="w-3.5 h-3.5" /> Applicants
          </button>
        )}
        <div className="relative">
          <button type="button" onClick={() => setMenu(!menu)} aria-label="More" className="w-8 h-8 rounded-xl hover:bg-[#F2EFE9] flex items-center justify-center">
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menu && (
            <div className="absolute right-0 top-9 z-20 w-48 rounded-xl bg-white border border-[#2C2724]/20 shadow-warm p-1 text-xs font-bold">
              {thread.other && (
                <button type="button" onClick={() => { setMenu(false); setReport({ type: 'user', id: thread.other!.id, label: otherName }); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#F2EFE9] flex items-center gap-2">
                  <Flag className="w-3.5 h-3.5" /> Report {otherName}
                </button>
              )}
              {thread.role === 'applicant' && thread.listing && (
                <button type="button" onClick={() => { setMenu(false); setReport({ type: 'listing', id: thread.listing!.id, label: 'this listing' }); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#F2EFE9] flex items-center gap-2">
                  <Flag className="w-3.5 h-3.5" /> Report listing
                </button>
              )}
              {thread.other && (
                <button type="button" onClick={() => void block()} className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#F2EFE9] text-[#9A4A33] flex items-center gap-2">
                  <Ban className="w-3.5 h-3.5" /> Block {otherName}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {taken && (
          <div className="p-3 rounded-2xl bg-white border border-[#2C2724]/15 space-y-2" data-testid="room-taken">
            <p className="text-xs font-extrabold">{roomTakenText(area, thread.similar.length)}</p>
            {thread.similar.map((s) => (
              <a key={s.url} href={s.url} className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/10 text-xs font-bold">
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
                  <div className="text-[10px] font-bold text-[#9A4A33] bg-[#F7E3DC] border border-[#D06C4E]/40 rounded-lg px-2 py-1 flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {m.warning}
                  </div>
                )}
                <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap break-words ${m.fromMe ? 'bg-[#2C2724] text-[#F9F7F3] rounded-br-md' : 'bg-white border border-[#2C2724]/15 rounded-bl-md'}`}>{m.body}</div>
                {!m.fromMe && (
                  <button type="button" onClick={() => setReport({ type: 'message', id: m.id, label: 'this message' })} className="text-[9px] font-bold text-[#6E655F] hover:text-[#9A4A33]">
                    Report
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {notice && <p className="text-[11px] font-bold text-[#485B4A] bg-[#EBF0EC] px-3 py-2">{notice}</p>}
      {error && <p className="text-[11px] font-bold text-[#9A4A33] px-3 py-1">{error}</p>}
      {!taken && status !== 'withdrawn' && (
        <div className="flex items-end gap-2 p-2.5 border-t border-[#2C2724]/15 bg-white pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
            rows={1}
            placeholder={`Message ${otherName}`}
            className="flex-1 max-h-32 bg-[#F9F7F3] border border-[#2C2724]/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D06C4E] resize-none"
          />
          <button type="button" onClick={() => void send()} disabled={sending || !draft.trim()} aria-label="Send" data-testid="message-send" className="w-10 h-10 rounded-xl bg-[#D06C4E] text-white flex items-center justify-center disabled:opacity-50 shrink-0">
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
