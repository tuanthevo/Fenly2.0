/**
 * Find feed filters (Fenly 2.0): area, max rent, move-in by, and Saved.
 * Logistics only; never who lives there (fair housing).
 */
import React from 'react';
import { ArrowLeft, Pin, X } from 'lucide-react';
import { LAUNCH_AREAS, activeFilterCount, type FindFilters, type LaunchArea } from '../../find/findFilters';

const RENT_STEPS = [1200, 1500, 1800, 2200];

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
  `shrink-0 px-3 py-1.5 rounded-full text-[11px] font-extrabold border transition-all active:scale-95 ${
    on ? 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724]' : 'bg-white text-[#2C2724] border-[#2C2724]/25 hover:bg-[#F2EFE9]'
  }`;

export const FindFilterBar: React.FC<FindFilterBarProps> = ({ filters, onChange, savedOnly, onToggleSaved, savedCount, total, onBack, extraActions }) => {
  const setArea = (area: LaunchArea | null) => onChange({ ...filters, area });
  const count = activeFilterCount(filters);
  return (
    <div className="w-full bg-[#F9F7F3] border-b border-[#2C2724]/15 px-3 pt-2.5 pb-2 space-y-2 shrink-0" data-testid="find-filter-bar">
      <div className="flex items-center gap-2">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back" className="w-8 h-8 rounded-xl bg-white border border-[#2C2724] flex items-center justify-center shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold text-[#2C2724] leading-tight">Rooms in San Francisco</div>
          <div className="text-[10px] font-bold text-[#6E655F]">
            {total} {total === 1 ? 'room' : 'rooms'}
            {savedOnly ? ' saved' : count ? ` · ${count} filter${count === 1 ? '' : 's'}` : ' · Mission, Noe Valley, Bernal first'}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleSaved}
          aria-pressed={savedOnly}
          data-testid="find-saved-toggle"
          className={`${chip(savedOnly)} flex items-center gap-1`}
        >
          <Pin className={`w-3 h-3 ${savedOnly ? 'fill-[#F9F7F3]' : ''}`} /> Saved{savedCount ? ` ${savedCount}` : ''}
        </button>
        {extraActions}
      </div>
      {!savedOnly && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3">
          <button type="button" className={chip(filters.area === null)} onClick={() => setArea(null)}>
            All areas
          </button>
          {LAUNCH_AREAS.map((area) => (
            <button key={area} type="button" className={chip(filters.area === area)} aria-pressed={filters.area === area} onClick={() => setArea(filters.area === area ? null : area)}>
              {area}
            </button>
          ))}
          <label className={`${chip(filters.maxRentCents != null)} flex items-center gap-1 cursor-pointer`}>
            <span>Max</span>
            <select
              aria-label="Max rent"
              value={filters.maxRentCents ?? ''}
              onChange={(e) => onChange({ ...filters, maxRentCents: e.target.value ? Number(e.target.value) : null })}
              className="bg-transparent font-extrabold focus:outline-none cursor-pointer"
            >
              <option value="">any</option>
              {RENT_STEPS.map((d) => (
                <option key={d} value={d * 100}>
                  ${d.toLocaleString('en-US')}
                </option>
              ))}
            </select>
          </label>
          <label className={`${chip(filters.moveInBy != null)} flex items-center gap-1 cursor-pointer`}>
            <span>Move in by</span>
            <input
              type="date"
              aria-label="Move in by"
              value={filters.moveInBy ?? ''}
              onChange={(e) => onChange({ ...filters, moveInBy: e.target.value || null })}
              className="bg-transparent font-extrabold focus:outline-none w-[7.2rem]"
            />
          </label>
          {count > 0 && (
            <button type="button" onClick={() => onChange({ area: null, maxRentCents: null, moveInBy: null })} className="shrink-0 w-7 h-7 rounded-full bg-white border border-[#2C2724]/25 flex items-center justify-center" aria-label="Clear filters">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
