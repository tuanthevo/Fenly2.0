/**
 * Share kit (Fenly 2.0 Fill): one tracked link per channel with a prewritten
 * post, plus download video and copy caption. Each copy is tracked (link_shared).
 */
import React, { useState } from 'react';
import { ChevronDown, Copy, Check, Download, Link2, Loader2, Share2 } from 'lucide-react';
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
  /** A photo listing made in a browser that can't export video: there is no file to download */
  noVideo?: boolean;
}

export const ShareKit: React.FC<ShareKitProps> = ({ listingId, links, posts, caption, videoUrl, videoBlob, noVideo }) => {
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
      className={`min-h-11 px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
        primary
          ? 'bg-[#B85B3F] hover:bg-[#A9513A] text-white shadow-warm-sm'
          : 'bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/30 text-[#2C2724]'
      }`}
    >
      {copiedKey === id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copiedKey === id ? 'Copied' : label}
    </button>
  );

  const Preview: React.FC<{ text: string }> = ({ text }) => (
    <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-[#2C2724] bg-[#F9F7F3] border border-[#2C2724]/10 rounded-xl p-2.5 max-h-36 overflow-y-auto font-[inherit]">
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

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareLink = async () => {
    try {
      await navigator.share({ title: 'My room on Fenn', text: posts.group_chat.text, url: url('direct') });
      trackEvent('link_shared', { channel: 'direct', what: 'link' }, listingId);
    } catch {
      // closed the share sheet: nothing to do
    }
  };

  /** One folded channel: the post is ready, the screen stays short until it is opened */
  const Channel: React.FC<{ id: string; title: string; hint?: string; children: React.ReactNode }> = ({ id, title, hint, children }) => (
    <details className="group rounded-2xl bg-white border border-[#2C2724]/15" data-testid={`share-channel-${id}`}>
      <summary className="min-h-12 px-3.5 flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="flex-1 text-sm font-extrabold">{title}</span>
        <ChevronDown className="w-4 h-4 text-[#6E655F] transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="px-3.5 pb-3.5 space-y-2">
        {hint && <p className="text-xs text-[#6E655F]">{hint}</p>}
        {children}
      </div>
    </details>
  );

  return (
    <div className="space-y-3" data-testid="share-kit">
      <div className="p-4 rounded-2xl bg-white border border-[#2C2724]/15 space-y-3">
        <div>
          <h3 className="text-sm font-extrabold text-[#2C2724] flex items-center gap-1.5">
            <Link2 className="w-4 h-4 text-[#D06C4E]" aria-hidden="true" /> Start here: share your link
          </h3>
          <p className="text-xs text-[#6E655F] mt-1">Send it to one group chat or post it once. That is enough to get started.</p>
        </div>
        <input
          readOnly
          aria-label="Your listing link"
          value={url('direct')}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full min-w-0 bg-[#F9F7F3] border border-[#2C2724]/20 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#2C2724]"
        />
        <div className={canShare ? 'grid grid-cols-2 gap-2' : 'grid'}>
          {canShare && (
            <button
              type="button"
              onClick={() => void shareLink()}
              data-testid="share-native"
              className="min-h-11 rounded-xl bg-[#B85B3F] hover:bg-[#A9513A] text-white text-sm font-extrabold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            >
              <Share2 className="w-4 h-4" aria-hidden="true" /> Share
            </button>
          )}
          <CopyButton id="direct-link" text={url('direct')} channel="direct" label="Copy link" primary={!canShare} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {noVideo ? (
            <p className="col-span-2 text-xs text-[#6E655F] leading-snug" data-testid="share-no-video">
              This browser can't make the video file. Open your listing in Chrome or Safari 26 to make one.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void download()}
              disabled={downloading}
              className="min-h-11 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/30 text-[#2C2724] text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download video
            </button>
          )}
          {caption && !noVideo ? <CopyButton id="caption" text={caption} channel="caption" label="Copy caption" /> : null}
        </div>
        {downloadError && <p className="text-xs font-bold text-[#9A4A33]">{downloadError}</p>}
      </div>

      <h3 className="text-xs font-extrabold text-[#6E655F] uppercase tracking-wide px-1 pt-1">Ready-made posts</h3>

      <Channel id="group_chat" title="Group chats and friends">
        <Preview text={posts.group_chat.text} />
        <CopyButton id="group-chat-post" text={posts.group_chat.text} channel="group_chat" label="Copy message" primary />
      </Channel>

      <Channel id="facebook" title="Facebook housing group">
        <Preview text={posts.facebook.text} />
        <CopyButton id="facebook-post" text={posts.facebook.text} channel="facebook" label="Copy post" primary />
      </Channel>

      <Channel id="reddit" title="Reddit (r/SFBayHousing)">
        <Preview text={`${posts.reddit.title}\n\n${posts.reddit.body}`} />
        <div className="grid grid-cols-2 gap-2">
          <CopyButton id="reddit-title" text={posts.reddit.title} channel="reddit" label="Copy title" />
          <CopyButton id="reddit-post" text={posts.reddit.body} channel="reddit" label="Copy post" primary />
        </div>
      </Channel>

      <Channel id="social" title="TikTok and Instagram" hint="Post the video, paste the caption, and put the link in your bio.">
        <Preview text={posts.tiktok.caption} />
        <div className="grid grid-cols-2 gap-2">
          <CopyButton id="tiktok-post" text={posts.tiktok.caption} channel="tiktok" label="TikTok caption" primary />
          <CopyButton id="instagram-post" text={posts.instagram.caption} channel="instagram" label="Instagram caption" />
          <CopyButton id="tiktok-link" text={url('tiktok')} channel="tiktok" label="TikTok bio link" />
          <CopyButton id="instagram-link" text={url('instagram')} channel="instagram" label="Instagram bio link" />
        </div>
      </Channel>

      <p className="text-xs text-[#6E655F] leading-relaxed px-1">
        Each channel has its own link, so the status page can show where your views and applicants come from.
      </p>
    </div>
  );
};
