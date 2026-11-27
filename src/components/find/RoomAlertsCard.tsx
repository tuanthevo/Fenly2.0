/**
 * Passport: "New rooms that match" (daily digest). The renter turns it on and picks a
 * place + radius; the budget, move-in date and length of stay already on the Passport
 * do the matching (src/find/roomAlerts.ts, sent by the daily cron). Saves straight to
 * the renter's own passports row (alert_* columns, migration 0007).
 */
import React, { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BellRing, Loader2, MapPin } from 'lucide-react';
import { DEFAULT_RADIUS_MILES, RADIUS_MILES } from '../../geo/bayArea';
import { cleanPlaceLabel } from '../../find/findFilters';
import { lookupBayAreaPlace } from '../../lib/geocode';

type AlertRow = { alert_rooms: boolean; alert_place: string | null; alert_lat: number | null; alert_lng: number | null; alert_miles: number | null };

const cardClass = 'p-4 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm';
const chip = (on: boolean) =>
  `min-h-10 px-3 rounded-full text-xs font-extrabold border transition-all active:scale-95 ${
    on ? 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724]' : 'bg-white text-[#2C2724] border-[#2C2724]/25 hover:bg-[#F2EFE9]'
  }`;

export const RoomAlertsCard: React.FC<{ supabase: SupabaseClient; userId: string; emailOn: boolean }> = ({ supabase, userId, emailOn }) => {
  const [row, setRow] = useState<AlertRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from('passports')
      .select('alert_rooms, alert_place, alert_lat, alert_lng, alert_miles')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        // Before migration 0007 the columns don't exist: keep the card out of the way
        if (error) return setMissing(true);
        const r = (data as AlertRow | null) ?? { alert_rooms: false, alert_place: null, alert_lat: null, alert_lng: null, alert_miles: null };
        setRow(r);
        setQuery(r.alert_place ?? '');
      });
    return () => {
      alive = false;
    };
  }, [supabase, userId]);

  const save = async (patch: Partial<AlertRow>) => {
    if (!row) return;
    const prev = row;
    setRow({ ...row, ...patch });
    const { error } = await supabase.from('passports').update(patch).eq('user_id', userId);
    if (error) {
      setRow(prev);
      setNote({ text: "Couldn't save that. Try again.", bad: true });
    }
  };

  const findPlace = async () => {
    const text = query.trim();
    if (!text || busy) return;
    setBusy(true);
    setNote(null);
    const place = await lookupBayAreaPlace(text);
    setBusy(false);
    if (place.kind === 'outside') return setNote({ text: 'Fenn is in Northern California for now. Try a Northern California city or ZIP code.', bad: true });
    if (place.kind === 'unknown') return setNote({ text: "We couldn't find that. Try a city name or a 5-digit ZIP code.", bad: true });
    const label = cleanPlaceLabel(place.label) || place.city;
    setQuery(label);
    setNote({ text: place.label !== place.city ? `${place.label}, ${place.city}` : place.city, bad: false });
    // Saved to 2 decimals (about half a mile): enough to match rooms by area, never an exact address
    const coarse = (n: number) => Math.round(n * 100) / 100;
    await save({ alert_place: label, alert_lat: coarse(place.lat), alert_lng: coarse(place.lng), alert_miles: row?.alert_miles ?? DEFAULT_RADIUS_MILES });
  };

  if (missing || !row) return null;
  const on = row.alert_rooms;
  return (
    <div className={`${cardClass} space-y-3`} data-testid="room-alerts">
      <div className="flex items-center gap-3">
        <BellRing className="w-4 h-4 text-[#6E655F] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-extrabold">New rooms that match</div>
          <div className="text-xs text-[#6E655F]">A daily email when new rooms fit your budget, move-in date and stay</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="New rooms that match"
          onClick={() => void save({ alert_rooms: !on })}
          data-testid="room-alerts-toggle"
          className="w-12 h-10 flex items-center justify-center shrink-0"
        >
          <span className={`block w-11 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-[#485B4A]' : 'bg-[#2C2724]/30'}`}>
            <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
          </span>
        </button>
      </div>

      {on && (
        <div className="space-y-2.5 pt-1 border-t border-[#2C2724]/10">
          <div>
            <label className="text-xs font-bold text-[#6E655F] block mb-1 mt-2" htmlFor="room-alerts-place">
              Near
            </label>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void findPlace();
              }}
            >
              <input
                id="room-alerts-place"
                className="w-full bg-white border border-[#2C2724]/15 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#A9513A]"
                placeholder="City, neighborhood or ZIP"
                autoComplete="off"
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
              <p className={`mt-1.5 text-xs font-bold flex items-center gap-1 ${note.bad ? 'text-[#A9513A]' : 'text-[#485B4A]'}`} role="status">
                {!note.bad && <MapPin className="w-3.5 h-3.5 shrink-0" />}
                {note.text}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-[#6E655F]">{row.alert_place ? `Rooms near ${row.alert_place}` : 'Empty: anywhere in the Bay Area'}</p>
            )}
            {row.alert_place && (
              <button
                type="button"
                className="min-h-10 text-xs font-bold text-[#A9513A] underline underline-offset-2"
                onClick={() => {
                  setQuery('');
                  setNote(null);
                  void save({ alert_place: null, alert_lat: null, alert_lng: null, alert_miles: null });
                }}
              >
                Anywhere in the Bay Area
              </button>
            )}
          </div>
          {row.alert_place && (
            <div role="group" aria-label="Distance" className="flex flex-wrap gap-1.5">
              {RADIUS_MILES.map((m) => (
                <button key={m} type="button" aria-pressed={(row.alert_miles ?? DEFAULT_RADIUS_MILES) === m} className={chip((row.alert_miles ?? DEFAULT_RADIUS_MILES) === m)} onClick={() => void save({ alert_miles: m })}>
                  {m} mi
                </button>
              ))}
            </div>
          )}
          {!emailOn && <p className="text-xs font-bold text-[#A9513A]">Turn on "Email me" above to get these by email.</p>}
        </div>
      )}
    </div>
  );
};
