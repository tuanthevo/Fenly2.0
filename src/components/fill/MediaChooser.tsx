/**
 * Fill my room: how the host shows the place. Two equal cards, one tap each.
 * Only shown when photo listings are available to this host; the choice can be
 * changed until the listing is published.
 */
import React from 'react';
import { Camera, ShieldCheck, Video } from 'lucide-react';
import type { MediaType } from '../../fill/listingRules';

export const MEDIA_OPTIONS: { id: MediaType; title: string; text: string; badge?: string }[] = [
  { id: 'video', title: 'Record a video', text: 'About 3 minutes. Best for showing the whole place.', badge: 'Verified real' },
  { id: 'photos', title: 'Take photos', text: "About 5 minutes. Easiest if you're short on time." },
];

const ICONS = { video: Video, photos: Camera } as const;

export const MediaChooser: React.FC<{ busy: MediaType | null; onChoose: (type: MediaType) => void }> = ({ busy, onChoose }) => (
  <div className="space-y-3" data-testid="fill-media-chooser">
    <div className="px-1 pt-1">
      <h3 className="text-base font-extrabold">How do you want to show your room?</h3>
      <p className="text-xs text-[#6E655F] mt-1">Pick one. You can switch before you publish, and nothing else in your draft changes.</p>
    </div>
    <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-3">
      {MEDIA_OPTIONS.map(({ id, title, text, badge }) => {
        const Icon = ICONS[id];
        return (
          <button
            key={id}
            type="button"
            disabled={busy !== null}
            onClick={() => onChoose(id)}
            data-testid={`fill-media-${id}`}
            className="relative w-full min-h-[136px] p-4 rounded-2xl bg-white border border-[#2C2724]/15 hover:border-[#A9513A] hover:bg-[#F2EFE9] text-left flex flex-col justify-between gap-3 transition-colors active:scale-[0.99] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A9513A]"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="w-11 h-11 rounded-xl bg-[#D06C4E]/10 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-[#D06C4E]" aria-hidden="true" />
              </span>
              {badge && (
                <span className="px-2 py-1 rounded-full bg-[#EBF0EC] border border-[#7A907C]/40 text-xs font-bold text-[#485B4A] flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  {badge}
                </span>
              )}
            </span>
            <span>
              <span className="block text-base font-extrabold text-[#2C2724]">{title}</span>
              <span className="block text-xs text-[#6E655F] mt-0.5 leading-relaxed">{text}</span>
            </span>
          </button>
        );
      })}
    </div>
  </div>
);
