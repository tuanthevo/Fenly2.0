/**
 * Share kit (Fenly 2.0 Fill): one tracked link per channel with a prewritten
 * post, plus download video and copy caption. Each copy is tracked (link_shared).
 */
import React, { useState } from 'react';
import { Copy, Check, Download, Link2, Loader2, MessageCircle, Users } from 'lucide-react';
import type { SharePosts } from '../../fill/sharePosts';
import type { LinkRow } from '../../lib/fillApi';
import type { ShareChannel } from '../../fill/types';
import { trackEvent } from '../../lib/analytics';
import { shareOrDownloadVideo } from '../../remotion/viral/exportVideo';

interface ShareKitProps {
  listingId: string;
  links: LinkRow[];
  posts: SharePosts;
  caption?: string | null;
  /** Signed URL of the full tour (for Download); may be missing right after publish */
  videoUrl?: string | null;
  /** The just-exported video, when still in memory */
  videoBlob?: Blob | null;
}

const cardClass = 'p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-2';

export const ShareKit: React.FC<ShareKitProps> = ({ listingId, links, posts, caption, videoUrl, videoBlob }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const url = (channel: ShareChannel) => links.find((l) => l.channel === channel)?.url ?? '';

  const copy = async (key: string, text: string, channel: ShareChannel | 'caption') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1800);
      trackEvent('link_shared', { channel, what: key.includes('link') ? 'link' : 'post' }, listingId);
    } catch {
      setCopiedKey(null);
    }
  };

  const CopyButton: React.FC<{ id: string; text: string; channel: ShareChannel | 'caption'; label: string; primary?: boolean }> = ({
    id,
    text,
    channel,
    label,
    primary,
  }) => (
    <button
      type="button"
      data-testid={`share-copy-${id}`}
      onClick={() => void copy(id, text, channel)}
      className={`px-3 py-2 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
        primary
          ? 'bg-[#D06C4E] hover:bg-[#b85b3f] text-white shadow-warm-sm'
          : 'bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/30 text-[#2C2724]'
      }`}
    >
      {copiedKey === id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copiedKey === id ? 'Copied' : label}
    </button>
  );

  const Preview: React.FC<{ text: string }> = ({ text }) => (
    <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[#2C2724] bg-[#F9F7F3] border border-[#2C2724]/10 rounded-xl p-2.5 max-h-36 overflow-y-auto font-[inherit]">
      {text}
    </pre>
  );

  const download = async () => {
    setDownloadError(null);
    setDownloading(true);
    try {
      const blob = videoBlob ?? (videoUrl ? await fetch(videoUrl).then((r) => (r.ok ? r.blob() : Promise.reject(new Error()))) : null);
      if (!blob) throw new Error();
      await shareOrDownloadVideo(blob, 'fenn-room-tour.mp4', caption ?? '');
      trackEvent('link_shared', { channel: 'video_download' }, listingId);
    } catch {
      setDownloadError("Couldn't get the video. Try again in a moment.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="share-kit">
      <div className={cardClass}>
        <h3 className="text-xs font-extrabold text-[#2C2724] flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-[#D06C4E]" /> Your listing link
        </h3>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url('direct')}
            className="flex-1 min-w-0 bg-[#F9F7F3] border border-[#2C2724]/20 rounded-xl px-2.5 py-2 text-xs font-semibold text-[#2C2724]"
          />
          <CopyButton id="direct-link" text={url('direct')} channel="direct" label="Copy" primary />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void download()}
            disabled={downloading}
            className="py-2 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/30 text-[#2C2724] text-[11px] font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Download video
          </button>
          {caption ? (
            <CopyButton id="caption" text={caption} channel="caption" label="Copy caption" />
          ) : (
            <span />
          )}
        </div>
        {downloadError && <p className="text-[11px] font-bold text-[#9A4A33]">{downloadError}</p>}
      </div>

      <div className={cardClass}>
        <h3 className="text-xs font-extrabold text-[#2C2724] flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-[#7A907C]" /> Facebook housing group
        </h3>
        <Preview text={posts.facebook.text} />
        <CopyButton id="facebook-post" text={posts.facebook.text} channel="facebook" label="Copy post" primary />
      </div>

      <div className={cardClass}>
        <h3 className="text-xs font-extrabold text-[#2C2724]">Reddit (r/SFBayHousing)</h3>
        <Preview text={`${posts.reddit.title}\n\n${posts.reddit.body}`} />
        <div className="grid grid-cols-2 gap-2">
          <CopyButton id="reddit-title" text={posts.reddit.title} channel="reddit" label="Copy title" />
          <CopyButton id="reddit-post" text={posts.reddit.body} channel="reddit" label="Copy post" primary />
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="text-xs font-extrabold text-[#2C2724]">TikTok / Instagram</h3>
        <p className="text-[11px] text-[#6E655F]">Post the video, paste the caption, and put the link in your bio.</p>
        <Preview text={posts.tiktok.caption} />
        <div className="grid grid-cols-2 gap-2">
          <CopyButton id="tiktok-post" text={posts.tiktok.caption} channel="tiktok" label="TikTok caption" primary />
          <CopyButton id="instagram-post" text={posts.instagram.caption} channel="instagram" label="Instagram caption" />
          <CopyButton id="tiktok-link" text={url('tiktok')} channel="tiktok" label="TikTok bio link" />
          <CopyButton id="instagram-link" text={url('instagram')} channel="instagram" label="Instagram bio link" />
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="text-xs font-extrabold text-[#2C2724] flex items-center gap-1.5">
          <MessageCircle className="w-3.5 h-3.5 text-[#D06C4E]" /> Group chats and friends
        </h3>
        <Preview text={posts.group_chat.text} />
        <CopyButton id="group-chat-post" text={posts.group_chat.text} channel="group_chat" label="Copy message" primary />
      </div>
      <p className="text-[10px] text-[#6E655F] leading-relaxed px-1">
        Each channel has its own link, so the status page can show where your views and applicants come from.
      </p>
    </div>
  );
};
