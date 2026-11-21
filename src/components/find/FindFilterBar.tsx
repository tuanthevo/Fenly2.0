/**
 * Find feed header (Fenly 2.0): "Rooms in <place>", a Filters sheet (a city,
 * neighborhood or ZIP found through Google Maps, a radius in miles, a typed
 * min/max rent, move-in by) and Saved. Logistics only; never who lives there (fair housing).
 */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, MapPin, Pin, SlidersHorizontal, X } from 'lucide-react';
import { DEFAULT_RADIUS_MILES, RADIUS_MILES } from '../../geo/bayArea';
import { lookupBayAreaPlace } from '../../lib/geocode';
import { EMPTY_FIND_FILTERS, activeFilterCount, cleanPlaceLabel, rentInput, rentRangeError, type FindFilters, type FindNear } from '../../find/findFilters';

const dollarsText = (cents: number | null) => (cents == null ? '' : String(Math.round(cents / 100)));

interface FindFilterBarProps {
  filters: FindFilters;
  onChange: (next: FindFilters) => void;
  savedOnly: boolean;
  onToggleSaved: () => void;
  savedCount: number;
  total: number;
  onBack?: () => void;
  extraActions?: React.ReactNode;
}

const chip = (on: boolean) =>
  `shrink-0 min-h-10 inline-flex items-center px-3 py-1.5 rounded-full text-xs font-extrabold border transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${
    on ? 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724]' : 'bg-white text-[#2C2724] border-[#2C2724]/25 hover:bg-[#F2EFE9]'
  }`;
const input =
  'w-full bg-white border border-[#2C2724]/15 rounded-xl px-3 py-2.5 text-sm text-[#2C2724] focus:outline-none focus:border-[#A9513A]';
const sectionLabel = 'text-[11px] font-bold text-[#6E655F] block mb-1.5';

export const FindFilterBar: React.FC<FindFilterBarProps> = ({ filters, onChange, savedOnly, onToggleSaved, savedCount, total, onBack, extraActions }) => {
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);
  const place = filters.near?.label ?? 'the Bay Area';
  return (
    <div className="w-full bg-[#F9F7F3] border-b border-[#2C2724]/15 px-3 py-2.5 shrink-0" data-testid="find-filter-bar">
      <div className="flex items-center gap-2">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back" className="w-10 h-10 rounded-xl bg-white border border-[#2C2724] flex items-center justify-center shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-extrabold text-[#2C2724] leading-tight truncate" data-testid="find-title">
            Rooms in {place}
          </h1>
          <div className="text-[10px] font-bold text-[#6E655F] truncate">
            {total} {total === 1 ? 'room' : 'rooms'}
            {savedOnly ? ' saved' : filters.near ? ` within ${filters.near.miles} mi` : ''}
          </div>
        </div>
        {!savedOnly && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            data-testid="find-filters-open"
            aria-haspopup="dialog"
            className={`${chip(count > 0)} gap-1.5`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters{count ? ` ${count}` : ''}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleSaved}
          aria-pressed={savedOnly}
          data-testid="find-saved-toggle"
          className={`${chip(savedOnly)} gap-1`}
        >
          <Pin className={`w-3 h-3 ${savedOnly ? 'fill-[#F9F7F3]' : ''}`} /> Saved{savedCount ? ` ${savedCount}` : ''}
        </button>
        {extraActions}
      </div>
      {open && (
        <FilterSheet
          filters={filters}
          onClose={() => setOpen(false)}
          onApply={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
};

/** The Filters sheet. Edits a draft; nothing changes in the feed until "Show rooms". */
const FilterSheet: React.FC<{ filters: FindFilters; onClose: () => void; onApply: (next: FindFilters) => void }> = ({ filters, onClose, onApply }) => {
  const [draft, setDraft] = useState<FindFilters>(filters);
  const [query, setQuery] = useState(filters.near?.label ?? '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const miles = draft.near?.miles ?? DEFAULT_RADIUS_MILES;
  // Rent is typed: kept as text while editing, checked on every change
  const [minText, setMinText] = useState(dollarsText(filters.minRentCents));
  const [maxText, setMaxText] = useState(dollarsText(filters.maxRentCents));
  const min = rentInput(minText);
  const max = rentInput(maxText);
  const rentError = min.error ?? max.error ?? rentRangeError(min.cents, max.cents);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const findPlace = async () => {
    const text = query.trim();
    if (!text || busy) return;
    setBusy(true);
    setNote(null);
    const result = await lookupBayAreaPlace(text);
    setBusy(false);
    if (result.kind === 'outside') {
      return setNote({ text: 'Fenn is in the Bay Area for now: San Francisco, the East Bay, the Peninsula and the South Bay.', bad: true });
    }
    if (result.kind === 'unknown') return setNote({ text: "We couldn't find that. Try a city name or a 5-digit ZIP code.", bad: true });
    const near: FindNear = { label: cleanPlaceLabel(result.label) || result.city, lat: result.lat, lng: result.lng, miles };
    setDraft((d) => ({ ...d, near }));
    setQuery(near.label);
    setNote({ text: result.label !== result.city ? `${result.label}, ${result.city}` : result.city, bad: false });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#2C2724]/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="find-filters-title"
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-[#F9F7F3] rounded-t-2xl sm:rounded-2xl p-4 space-y-5"
        onClick={(e) => e.stopPropagation()}
        data-testid="find-filters-sheet"
      >
        <div className="flex items-center justify-between">
          <h2 id="find-filters-title" className="text-base font-extrabold text-[#2C2724]">Filters</h2>
          <button type="button" onClick={onClose} aria-label="Close filters" className="w-10 h-10 rounded-xl hover:bg-[#F2EFE9] flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <section>
          <label className={sectionLabel} htmlFor="find-place">Where</label>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void findPlace();
            }}
          >
            <input
              id="find-place"
              ref={inputRef}
              className={input}
              placeholder="City, neighborhood or ZIP"
              autoComplete="off"
              enterKeyHint="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value.slice(0, 120));
                setNote(null);
              }}
            />
            <button type="submit" disabled={busy || !query.trim()} className="min-h-10 px-3 rounded-xl bg-white border border-[#2C2724]/15 hover:bg-[#F2EFE9] text-xs font-bold shrink-0 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Find'}
            </button>
          </form>
          {note ? (
            <p className={`mt-1.5 text-[11px] font-bold flex items-center gap-1 ${note.bad ? 'text-[#A9513A]' : 'text-[#485B4A]'}`} role="status">
              {!note.bad && <MapPin className="w-3.5 h-3.5 shrink-0" />}
              {note.text}
            </p>
          ) : draft.near ? (
            <p className="mt-1.5 text-[11px] font-bold text-[#485B4A] flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 shrink-0" /> {draft.near.label}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-[#6E655F]">Leave empty to see the whole Bay Area.</p>
          )}
          {draft.near && (
            <button
              type="button"
              className="mt-1 min-h-10 text-[11px] font-bold text-[#A9513A] underline underline-offset-2"
              onClick={() => {
                setDraft((d) => ({ ...d, near: null }));
                setQuery('');
                setNote(null);
              }}
            >
              Anywhere in the Bay Area
            </button>
          )}
        </section>

        <section>
          <span className={sectionLabel} id="find-radius-label">
            Distance{draft.near ? '' : ' (find a place first)'}
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="find-radius-label">
            {RADIUS_MILES.map((m) => (
              <button
                key={m}
                type="button"
                disabled={!draft.near}
                aria-pressed={draft.near?.miles === m}
                className={chip(draft.near?.miles === m)}
                onClick={() => setDraft((d) => (d.near ? { ...d, near: { ...d.near, miles: m } } : d))}
              >
                {m} mi
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={sectionLabel} htmlFor="find-min-rent">Min rent ($/mo)</label>
              <input
                id="find-min-rent"
                inputMode="numeric"
                autoComplete="off"
                placeholder="No min"
                className={input}
                value={minText}
                aria-invalid={Boolean(min.error || rentRangeError(min.cents, max.cents))}
                aria-describedby="find-rent-hint"
                onChange={(e) => setMinText(e.target.value.replace(/[^\d$,]/g, '').slice(0, 7))}
              />
            </div>
            <div>
              <label className={sectionLabel} htmlFor="find-max-rent">Max rent ($/mo)</label>
              <input
                id="find-max-rent"
                inputMode="numeric"
                autoComplete="off"
                placeholder="No max"
                className={input}
                value={maxText}
                aria-invalid={Boolean(max.error || rentRangeError(min.cents, max.cents))}
                aria-describedby="find-rent-hint"
                onChange={(e) => setMaxText(e.target.value.replace(/[^\d$,]/g, '').slice(0, 7))}
              />
            </div>
          </div>
          <p id="find-rent-hint" className={`mt-1.5 text-[11px] ${rentError ? 'font-bold text-[#A9513A]' : 'text-[#6E655F]'}`} role={rentError ? 'alert' : undefined}>
            {rentError ?? 'Leave either one empty for no limit.'}
          </p>
        </section>

        <section>
          <label className={sectionLabel} htmlFor="find-move-in">Move in by</label>
          <input
            id="find-move-in"
            type="date"
            className={input}
            value={draft.moveInBy ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, moveInBy: e.target.value || null }))}
          />
        </section>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => onApply(EMPTY_FIND_FILTERS)}
            className="min-h-11 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/15 text-[#2C2724] text-sm font-extrabold"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={() => onApply({ ...draft, minRentCents: min.cents, maxRentCents: max.cents })}
            disabled={Boolean(rentError)}
            data-testid="find-filters-apply"
            className="min-h-11 rounded-xl bg-[#B85B3F] hover:bg-[#A9513A] disabled:opacity-50 text-white text-sm font-extrabold"
          >
            Show rooms
          </button>
        </div>
      </div>
    </div>
  );
};
