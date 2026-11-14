import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { FilterState } from '../types';

interface FilterBarProps {
  filters: FilterState;
  onUpdateFilters: (filters: Partial<FilterState>) => void;
  onOpenFilterModal: () => void;
  totalMatches: number;
  onResetFilters: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  onOpenFilterModal,
}) => {
  return (
    <div className="absolute top-2.5 left-3 sm:left-3.5 z-30 flex items-center gap-1.5 pointer-events-auto">
      {/* Filter Button Matched with Earth-Tone Palette (#F9F7F3 Oatmeal, #2C2724 Espresso) */}
      <button
        type="button"
        data-testid="open-filter-modal-btn"
        onClick={onOpenFilterModal}
        title="Filter Listings"
        aria-label="Filter Listings"
        className="relative w-10 h-9 rounded-xl flex items-center justify-center transition-all shadow-warm-sm active:scale-95 bg-[#F9F7F3] hover:bg-white text-[#2C2724] border border-[#2C2724]"
      >
        <SlidersHorizontal className="w-4 h-4" />
      </button>
    </div>
  );
};

