/**
 * "Delete listing" on the edit screen: a quiet button at the very end of the
 * form (far from Save and Close) and a confirm sheet that says what is removed.
 * Deleting is for good, so the sheet opens with focus on the way out.
 * Draft rows in "Your rooms" use the same sheet behind a small trash button
 * (`variant="icon"`).
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Trash2 } from 'lucide-react';
import { fillApi } from '../../lib/fillApi';
import { deleteListingCopy } from '../../fill/deleteListing';
import type { MediaType } from '../../fill/listingRules';

interface DeleteListingProps {
  listingId: string;
  status: string;
  mediaType: MediaType;
  disabled?: boolean;
  onDeleted: () => void;
  /** 'icon': a 40 px trash button for a list row; `name` says which room it deletes */
  variant?: 'button' | 'icon';
  name?: string;
}

export const DeleteListing: React.FC<DeleteListingProps> = ({ listingId, status, mediaType, disabled, onDeleted, variant = 'button', name }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const copy = deleteListingCopy(status, mediaType);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setError(null);
    openerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    keepRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await fillApi.remove(listingId);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "We couldn't delete the listing. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className={variant === 'icon' ? 'shrink-0' : 'pt-5 mt-2 border-t border-[#2C2724]/10'}>
      {variant === 'icon' ? (
        <button
          ref={openerRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          aria-label={name ? `${copy.confirm}: ${name}` : copy.confirm}
          data-testid={`fill-delete-${listingId}`}
          className="w-10 h-10 rounded-xl hover:bg-[#D06C4E]/10 text-[#6E655F] hover:text-[#9A4A33] flex items-center justify-center active:scale-90 transition-all disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      ) : (
        <button
          ref={openerRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          data-testid="fill-delete-listing"
          className="w-full min-h-11 rounded-xl border border-[#9A4A33]/35 hover:bg-[#D06C4E]/10 text-[#9A4A33] text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" /> {copy.confirm}
        </button>
      )}

      {open &&
        // Rendered on <body>: inside a scrolling screen, iPhone browsers draw it under the bottom tab bar
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-[#2C2724]/60 font-['Plus_Jakarta_Sans','Inter',sans-serif]" onClick={close}>
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-listing-title"
              aria-describedby="delete-listing-text"
              data-testid="delete-listing-sheet"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724] rounded-t-3xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-warm space-y-4"
            >
              <h3 id="delete-listing-title" className="text-base font-extrabold">
                {copy.title}
              </h3>
              {name && <p className="text-sm font-bold -mt-2 truncate">{name}</p>}
              <ul id="delete-listing-text" className="space-y-1.5 text-sm leading-snug">
                {copy.lines.map((line, i) => (
                  <li key={line} className={i === copy.lines.length - 1 ? 'font-extrabold' : 'text-[#6E655F]'}>
                    {line}
                  </li>
                ))}
              </ul>
              {error && (
                <p className="text-xs font-bold text-[#9A4A33] p-3 rounded-xl bg-[#D06C4E]/10 border border-[#D06C4E]/30" role="alert">
                  {error}
                </p>
              )}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={busy}
                  data-testid="delete-listing-confirm"
                  className="w-full min-h-11 rounded-xl bg-[#9A4A33] hover:bg-[#873F2B] disabled:opacity-60 text-white text-sm font-extrabold flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Trash2 className="w-4 h-4" aria-hidden="true" />}
                  {busy ? 'Deleting' : copy.confirm}
                </button>
                <button
                  ref={keepRef}
                  type="button"
                  onClick={close}
                  disabled={busy}
                  data-testid="delete-listing-cancel"
                  className="w-full min-h-11 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/25 text-[#2C2724] text-sm font-extrabold disabled:opacity-60 active:scale-95 transition-all"
                >
                  {copy.cancel}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
