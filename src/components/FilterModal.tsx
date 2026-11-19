import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  MapPin,
  DollarSign,
  SlidersHorizontal,
  RotateCcw,
  Check,
  Navigation,
  Calendar,
} from 'lucide-react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { FilterState, RoomListing } from '../types';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

import { LOCATION_PRESETS, type LocationPreset } from '../data/locationPresets';
export { LOCATION_PRESETS, type LocationPreset };

interface AutocompleteOption {
  id: string;
  primaryText: string;
  secondaryText: string;
  fullLabel: string;
  coords?: { lat: number; lng: number };
  placePrediction?: any;
}

const GoogleLocationAutocompleteInput: React.FC<{
  value: string;
  onSelectLocation: (
    text: string,
    coords: { lat: number; lng: number } | null
  ) => void;
}> = ({ value, onSelectLocation }) => {
  const placesLib = useMapsLibrary('places');
  const [isOpen, setIsOpen] = useState(false);
  const [googleOptions, setGoogleOptions] = useState<AutocompleteOption[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const query = value.trim();
    if (!placesLib || query.length < 2) {
      setGoogleOptions([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const AutocompleteSuggestion = (placesLib as any).AutocompleteSuggestion;
        if (AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
          const res =
            await AutocompleteSuggestion.fetchAutocompleteSuggestions({
              input: query,
              includedRegionCodes: ['us'],
            });
          if (cancelled) return;
          const suggestions: any[] = res?.suggestions || [];
          const mapped: AutocompleteOption[] = suggestions
            .slice(0, 5)
            .map((s: any, idx: number) => {
              const pred = s.placePrediction;
              const fullText = pred?.text?.text || query;
              const mainText = pred?.mainText?.text || fullText;
              const secondary = pred?.secondaryText?.text || 'Google Maps';
              return {
                id: pred?.placeId || `gmp-${idx}`,
                primaryText: mainText,
                secondaryText: secondary,
                fullLabel: fullText,
                placePrediction: pred,
              };
            });
          setGoogleOptions(mapped);
        }
      } catch {
        // Fallback handled by preset matches below
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, placesLib]);

  const queryLower = value.trim().toLowerCase();
  const presetMatches: AutocompleteOption[] = LOCATION_PRESETS.filter((p) => {
    if (!queryLower) return true;
    return (
      p.label.toLowerCase().includes(queryLower) ||
      p.zip.includes(queryLower) ||
      p.city.toLowerCase().includes(queryLower) ||
      p.neighborhood.toLowerCase().includes(queryLower)
    );
  })
    .slice(0, 6)
    .map((p) => ({
      id: `preset-${p.label}`,
      primaryText: p.label,
      secondaryText: p.secondaryText,
      fullLabel: p.label,
      coords: p.coords,
    }));

  // Combine Google Places suggestions with matching local presets (deduplicating by label)
  const combinedOptions: AutocompleteOption[] = [...googleOptions];
  for (const preset of presetMatches) {
    if (
      !combinedOptions.some(
        (o) => o.fullLabel.toLowerCase() === preset.fullLabel.toLowerCase()
      )
    ) {
      combinedOptions.push(preset);
    }
  }

  const handleChooseOption = async (opt: AutocompleteOption) => {
    setIsOpen(false);
    if (opt.coords) {
      onSelectLocation(opt.fullLabel, opt.coords);
      return;
    }

    if (opt.placePrediction?.toPlace) {
      try {
        const place = opt.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location'],
        });
        const lat =
          typeof place.location?.lat === 'function'
            ? place.location.lat()
            : Number(place.location?.lat);
        const lng =
          typeof place.location?.lng === 'function'
            ? place.location.lng()
            : Number(place.location?.lng);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          onSelectLocation(opt.fullLabel, { lat, lng });
          return;
        }
      } catch {
        // Fall through to text match
      }
    }

    const matchedPreset = LOCATION_PRESETS.find((p) =>
      opt.fullLabel.toLowerCase().includes(p.city.toLowerCase())
    );
    onSelectLocation(opt.fullLabel, matchedPreset?.coords || null);
  };

  return (
    <div ref={containerRef} className="relative">
      <MapPin className="w-3.5 h-3.5 text-[#D06C4E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        id="filter-city-input"
        data-testid="filter-city-input"
        type="text"
        autoComplete="off"
        value={value}
        onFocus={() => setIsOpen(true)}
        onChange={(e) => {
          const nextVal = e.target.value;
          setIsOpen(true);
          const matchedPreset = LOCATION_PRESETS.find(
            (p) =>
              p.label.toLowerCase() === nextVal.trim().toLowerCase() ||
              p.zip === nextVal.trim() ||
              p.neighborhood.toLowerCase() === nextVal.trim().toLowerCase() ||
              p.city.toLowerCase() === nextVal.trim().toLowerCase()
          );
          onSelectLocation(nextVal, matchedPreset?.coords || null);
        }}
        placeholder="City & state, zip code, or neighborhood (e.g. San Francisco, CA or 94110)..."
        className="w-full pl-8 pr-8 py-2.5 rounded-xl bg-white border border-[#2C2724] text-xs font-semibold text-[#2C2724] placeholder-[#2C2724]/50 focus:outline-none focus:border-[#D06C4E]"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onSelectLocation('', null);
            setIsOpen(false);
          }}
          aria-label="Clear location filter"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6E655F] hover:text-[#2C2724]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {isOpen && combinedOptions.length > 0 && (
        <div
          data-testid="google-location-autocomplete-list"
          className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-[#2C2724] rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-[#2C2724]/10"
        >
          {combinedOptions.slice(0, 6).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleChooseOption(opt)}
              className="w-full px-3 py-2 text-left hover:bg-[#F9F7F3] flex items-start gap-2 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5 text-[#D06C4E] shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-[#2C2724] truncate">
                  {opt.primaryText}
                </div>
                <div className="text-[10px] text-[#6E655F] truncate">
                  {opt.secondaryText}
                </div>
              </div>
            </button>
          ))}
          <div className="px-3 py-1 bg-[#F9F7F3] text-[9px] font-semibold text-[#6E655F] text-right">
            Powered by Google
          </div>
        </div>
      )}
    </div>
  );
};

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onUpdateFilters: (filters: Partial<FilterState>) => void;
  onResetFilters: () => void;
  allRooms: RoomListing[];
  matchedRoomsCount: number;
}

export const FilterModal: React.FC<FilterModalProps> = ({
  isOpen,
  onClose,
  filters,
  onUpdateFilters,
  onResetFilters,
  matchedRoomsCount,
}) => {
  if (!isOpen) return null;

  const selectedRoomType = filters.roomTypes[0] || 'all';
  const selectedLeaseTerm = filters.leaseTerms[0] || 'all';

  const AMENITY_OPTIONS = [
    'Private Bath',
    'In-Unit W/D',
    'Furnished',
    'Pet Friendly',
    'Utilities Included',
    'High-Speed WiFi',
    'Balcony',
    'Gym Access',
  ];

  const handleToggleAmenity = (amenity: string) => {
    const exists = filters.amenities.includes(amenity);
    const updated = exists
      ? filters.amenities.filter((a) => a !== amenity)
      : [...filters.amenities, amenity];
    onUpdateFilters({ amenities: updated });
  };

  const moveInUtilityMode =
    filters.instantMoveInOnly && filters.utilitiesIncludedOnly
      ? 'both'
      : filters.utilitiesIncludedOnly
      ? 'utilities'
      : filters.instantMoveInOnly
      ? 'instant'
      : 'all';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2C2724]/60 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        data-testid="filter-modal"
        className="w-full max-w-[420px] max-h-[88vh] bg-[#F9F7F3] text-[#2C2724] border border-[#2C2724] rounded-xl shadow-warm flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 bg-white border-b border-[#2C2724]/15 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4 text-[#2C2724]" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-[#2C2724]">
                Filter Fenn Listings
              </h2>
              <p className="text-[11px] text-[#2C2724]/70">
                Location autofill, mile radius & amenity selection
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onResetFilters}
              className="px-2.5 py-1.5 rounded-xl bg-[#F9F7F3] hover:bg-white text-[#2C2724] border border-[#2C2724]/30 text-[11px] font-bold flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Filter Modal"
              className="w-8 h-8 rounded-xl bg-[#F9F7F3] hover:bg-white text-[#2C2724] border border-[#2C2724]/30 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {/* 1. City, State, Zip Code, or Neighborhood (Google Autocomplete) */}
          <div className="space-y-1">
            <label
              htmlFor="filter-city-input"
              className="block text-xs font-extrabold text-[#2C2724]"
            >
              City, State, Zip Code, or Neighborhood
            </label>
            <APIProvider apiKey={MAPS_API_KEY}>
              <GoogleLocationAutocompleteInput
                value={filters.city}
                onSelectLocation={(text, coords) => {
                  onUpdateFilters({
                    city: text,
                    neighborhood: '',
                    userCoords: coords,
                    nearMeEnabled: Boolean(coords),
                    maxDistanceMiles: coords ? 1 : filters.maxDistanceMiles,
                  });
                }}
              />
            </APIProvider>
          </div>

          {/* 2. Mile Radius (Radio Choices + 1 to 50 Mile Slide Bar with 2 Buttons) */}
          {(() => {
            const minRadius = Math.max(
              1,
              Math.min(50, filters.minDistanceMiles || 1)
            );
            const maxRadius = Math.max(
              minRadius,
              Math.min(50, filters.maxDistanceMiles || 10)
            );
            const minPercent = ((minRadius - 1) / 49) * 100;
            const maxPercent = ((maxRadius - 1) / 49) * 100;
            const RADIO_MILE_CHOICES = [1, 5, 10, 25, 50];

            const handleSetMinRadius = (val: number) => {
              const clamped = Math.max(1, Math.min(val, maxRadius));
              onUpdateFilters({
                minDistanceMiles: clamped,
                maxDistanceMiles: maxRadius,
                nearMeEnabled: true,
              });
            };

            const handleSetMaxRadius = (val: number) => {
              const clamped = Math.max(minRadius, Math.min(50, val));
              onUpdateFilters({
                minDistanceMiles: minRadius,
                maxDistanceMiles: clamped,
                nearMeEnabled: true,
              });
            };

            return (
              <div
                id="filter-radius-select"
                data-testid="filter-radius-select"
                className="space-y-2 p-3 rounded-xl bg-white border border-[#2C2724]"
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-extrabold text-[#2C2724]">
                    <Navigation className="w-3.5 h-3.5 text-[#7A907C]" />
                    <span>Mile Radius</span>
                  </label>
                  <span
                    data-testid="filter-radius-value-badge"
                    className="px-2 py-0.5 rounded-full bg-[#EBF0EC] text-[#485B4A] border border-[#7A907C]/40 text-[10px] font-extrabold tabular-nums"
                  >
                    {minRadius === 1
                      ? `Within ${maxRadius} ${maxRadius === 1 ? 'mile' : 'miles'}`
                      : `${minRadius} mi – ${maxRadius} mi`}
                  </span>
                </div>

                {/* Radio Button Choices (1 mi, 5 mi, 10 mi, 25 mi, 50 mi) */}
                <div
                  role="radiogroup"
                  aria-label="Mile Radius Choices"
                  data-testid="filter-radius-radio-group"
                  className="grid grid-cols-5 gap-1.5"
                >
                  {RADIO_MILE_CHOICES.map((milesChoice) => {
                    const isChecked =
                      maxRadius === milesChoice && minRadius === 1;
                    return (
                      <label
                        key={milesChoice}
                        data-testid={`filter-radius-radio-${milesChoice}`}
                        className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border text-[10px] font-extrabold cursor-pointer select-none transition-colors ${
                          isChecked
                            ? 'bg-[#D06C4E] text-white border-[#D06C4E]'
                            : 'bg-[#F9F7F3] hover:bg-[#EBF0EC] text-[#2C2724] border-[#2C2724]/25'
                        }`}
                      >
                        <input
                          type="radio"
                          name="filter-mile-radius-choice"
                          value={milesChoice}
                          checked={isChecked}
                          onChange={() =>
                            onUpdateFilters({
                              minDistanceMiles: 1,
                              maxDistanceMiles: milesChoice,
                              nearMeEnabled: true,
                            })
                          }
                          className="sr-only"
                        />
                        <span
                          className={`w-2.5 h-2.5 rounded-full border flex items-center justify-center shrink-0 ${
                            isChecked
                              ? 'border-white bg-white'
                              : 'border-[#2C2724]/50 bg-white'
                          }`}
                        >
                          {isChecked && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#D06C4E]" />
                          )}
                        </span>
                        <span>{milesChoice} mi</span>
                      </label>
                    );
                  })}
                </div>

                {/* Slide Bar (1 mile to 50 miles) with 2 Step Buttons & 2 Dual-Range Thumb Buttons */}
                <div className="pt-1 space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    {/* Button 1: Decrease Mile Radius (-1 mi) */}
                    <button
                      type="button"
                      data-testid="filter-radius-decrease-btn"
                      onClick={() => handleSetMaxRadius(Math.max(1, maxRadius - 1))}
                      disabled={maxRadius <= 1}
                      aria-label="Decrease mile radius"
                      className="w-7 h-7 rounded-lg bg-[#F9F7F3] hover:bg-[#EBF0EC] disabled:opacity-40 text-[#2C2724] border border-[#2C2724] font-black text-xs flex items-center justify-center shrink-0 active:scale-95 transition-all"
                    >
                      −
                    </button>

                    {/* Slide Bar Track with 2 Draggable Handle Buttons (1 mi to 50 mi) */}
                    <div className="relative flex-1 h-7 flex items-center">
                      {/* Base Track */}
                      <div className="w-full h-2 rounded-full bg-[#F2EFE9] border border-[#2C2724]/25 overflow-hidden relative">
                        {/* Active Highlight Range */}
                        <div
                          className="absolute top-0 bottom-0 bg-[#D06C4E] rounded-full"
                          style={{
                            left: `${minPercent}%`,
                            width: `${Math.max(0, maxPercent - minPercent)}%`,
                          }}
                        />
                      </div>

                      {/* Left Handle Button (Min Mile: 1–50) */}
                      <input
                        type="range"
                        min={1}
                        max={50}
                        step={1}
                        value={minRadius}
                        aria-label="Minimum Mile Radius (1 to 50 miles)"
                        data-testid="filter-radius-slider-min"
                        onChange={(e) => handleSetMinRadius(Number(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer pointer-events-auto z-20"
                        style={{
                          clipPath: `inset(0 ${100 - (minPercent + maxPercent) / 2}% 0 0)`,
                        }}
                      />

                      {/* Right Handle Button (Max Mile: 1–50) */}
                      <input
                        type="range"
                        min={1}
                        max={50}
                        step={1}
                        value={maxRadius}
                        aria-label="Maximum Mile Radius (1 to 50 miles)"
                        data-testid="filter-radius-slider-max"
                        onChange={(e) => handleSetMaxRadius(Number(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer pointer-events-auto z-20"
                        style={{
                          clipPath: `inset(0 0 0 ${(minPercent + maxPercent) / 2}%)`,
                        }}
                      />

                      {/* Visual Thumb Button 1 (Min) */}
                      <div
                        data-testid="filter-radius-thumb-min"
                        className="w-4 h-4 rounded-full bg-white border-2 border-[#2C2724] shadow-xs pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 flex items-center justify-center"
                        style={{ left: `${minPercent}%` }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#7A907C]" />
                      </div>

                      {/* Visual Thumb Button 2 (Max) */}
                      <div
                        data-testid="filter-radius-thumb-max"
                        className="w-4 h-4 rounded-full bg-[#D06C4E] border-2 border-[#2C2724] shadow-xs pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 flex items-center justify-center"
                        style={{ left: `${maxPercent}%` }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      </div>
                    </div>

                    {/* Button 2: Increase Mile Radius (+1 mi) */}
                    <button
                      type="button"
                      data-testid="filter-radius-increase-btn"
                      onClick={() => handleSetMaxRadius(Math.min(50, maxRadius + 1))}
                      disabled={maxRadius >= 50}
                      aria-label="Increase mile radius"
                      className="w-7 h-7 rounded-lg bg-[#F9F7F3] hover:bg-[#EBF0EC] disabled:opacity-40 text-[#2C2724] border border-[#2C2724] font-black text-xs flex items-center justify-center shrink-0 active:scale-95 transition-all"
                    >
                      +
                    </button>
                  </div>

                  {/* 1 Mile to 50 Miles Scale Labels */}
                  <div className="flex items-center justify-between text-[10px] font-bold text-[#6E655F] px-1">
                    <span>1 mile</span>
                    <span>25 miles</span>
                    <span>50 miles</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 3. Monthly Rent Range (Min & Max Input) */}
          <div className="space-y-1">
            <span className="block text-xs font-extrabold text-[#2C2724]">
              Monthly Rent (Min & Max)
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="relative">
                <DollarSign className="w-3.5 h-3.5 text-[#D06C4E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="filter-min-rent-input"
                  data-testid="filter-min-rent-input"
                  type="number"
                  min={0}
                  step={50}
                  value={filters.minPrice === 0 ? '' : filters.minPrice}
                  onChange={(e) => {
                    const raw = e.target.value;
                    onUpdateFilters({
                      minPrice: raw === '' ? 0 : Math.max(0, Number(raw)),
                    });
                  }}
                  placeholder="Min (e.g. 500)"
                  aria-label="Minimum Monthly Rent"
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-white border border-[#2C2724] text-xs font-bold text-[#2C2724] placeholder-[#2C2724]/50 focus:outline-none focus:border-[#D06C4E]"
                />
              </div>

              <div className="relative">
                <DollarSign className="w-3.5 h-3.5 text-[#D06C4E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="filter-max-rent-input"
                  data-testid="filter-max-rent-input"
                  type="number"
                  min={0}
                  step={50}
                  value={filters.maxPrice === 0 ? '' : filters.maxPrice}
                  onChange={(e) => {
                    const raw = e.target.value;
                    onUpdateFilters({
                      maxPrice: raw === '' ? 10000 : Math.max(0, Number(raw)),
                    });
                  }}
                  placeholder="Max (e.g. 3500)"
                  aria-label="Maximum Monthly Rent"
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-white border border-[#2C2724] text-xs font-bold text-[#2C2724] placeholder-[#2C2724]/50 focus:outline-none focus:border-[#D06C4E]"
                />
              </div>
            </div>
          </div>

          {/* 4. Space Category & Room Type Dropdowns (2-Column Row) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label
                htmlFor="filter-space-select"
                className="block text-xs font-extrabold text-[#2C2724]"
              >
                Space Category
              </label>
              <select
                id="filter-space-select"
                value={filters.spaceCategory || 'all'}
                onChange={(e) =>
                  onUpdateFilters({
                    spaceCategory: e.target.value as
                      | 'all'
                      | 'room'
                      | 'entire_place',
                  })
                }
                className="w-full px-3 py-2.5 rounded-xl bg-white border border-[#2C2724] text-xs font-bold text-[#2C2724] focus:outline-none focus:border-[#D06C4E]"
              >
                <option value="all">All Spaces</option>
                <option value="room">Private Rooms</option>
                <option value="entire_place">Entire Places</option>
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="filter-roomtype-select"
                className="block text-xs font-extrabold text-[#2C2724]"
              >
                Room Type
              </label>
              <select
                id="filter-roomtype-select"
                value={selectedRoomType}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateFilters({
                    roomTypes: val === 'all' ? [] : [val],
                  });
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-white border border-[#2C2724] text-xs font-bold text-[#2C2724] focus:outline-none focus:border-[#D06C4E]"
              >
                <option value="all">Any Room Type</option>
                <option value="Master Suite">Master Suite</option>
                <option value="Private Room">Private Room</option>
                <option value="Entire Place">Entire Place</option>
                <option value="Studio Sublet">Studio Sublet</option>
              </select>
            </div>
          </div>

          {/* 5. Target Move-In Date Filter */}
          <div className="space-y-1.5" data-testid="filter-move-in-date-section">
            <div className="flex items-center justify-between">
              <label
                htmlFor="filter-move-in-date-input"
                className="block text-xs font-extrabold text-[#2C2724]"
              >
                Move-In Date
              </label>
              <span className="text-[10px] font-bold text-[#7A907C]">
                Available now or on/before date
              </span>
            </div>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-[#D06C4E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="filter-move-in-date-input"
                data-testid="filter-move-in-date-input"
                type="date"
                value={filters.moveInDate || ''}
                onChange={(e) => {
                  onUpdateFilters({
                    moveInDate: e.target.value,
                  });
                }}
                aria-label="Target Move-In Date"
                className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-white border border-[#2C2724] text-xs font-bold text-[#2C2724] focus:outline-none focus:border-[#D06C4E]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {[
                { label: 'Available Now', value: '2026-10-28' },
                { label: 'Nov 1, 2026', value: '2026-11-01' },
                { label: 'Nov 15, 2026', value: '2026-11-15' },
                { label: 'Dec 1, 2026', value: '2026-12-01' },
              ].map((preset) => {
                const isSelected = (filters.moveInDate || '2026-11-01') === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    data-testid={`filter-move-in-preset-${preset.value}`}
                    onClick={() => onUpdateFilters({ moveInDate: preset.value })}
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-extrabold transition-colors ${
                      isSelected
                        ? 'bg-[#D06C4E] text-white border-[#D06C4E]'
                        : 'bg-white hover:bg-[#F9F7F3] text-[#2C2724] border-[#2C2724]/25'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 6. Lease Duration & Move-In / Utilities Dropdowns (2-Column Row) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label
                htmlFor="filter-lease-select"
                className="block text-xs font-extrabold text-[#2C2724]"
              >
                Lease Duration
              </label>
              <select
                id="filter-lease-select"
                value={selectedLeaseTerm}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateFilters({
                    leaseTerms: val === 'all' ? [] : [val],
                  });
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-white border border-[#2C2724] text-xs font-bold text-[#2C2724] focus:outline-none focus:border-[#D06C4E]"
              >
                <option value="all">Any Lease Term</option>
                <option value="Month-to-month">Month-to-month</option>
                <option value="3 Months">3 Months</option>
                <option value="6 Months">6 Months</option>
                <option value="12+ Months">12+ Months</option>
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="filter-utilities-select"
                className="block text-xs font-extrabold text-[#2C2724]"
              >
                Move-In & Utilities
              </label>
              <select
                id="filter-utilities-select"
                value={moveInUtilityMode}
                onChange={(e) => {
                  const mode = e.target.value;
                  onUpdateFilters({
                    utilitiesIncludedOnly: mode === 'utilities' || mode === 'both',
                    instantMoveInOnly: mode === 'instant' || mode === 'both',
                  });
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-white border border-[#2C2724] text-xs font-bold text-[#2C2724] focus:outline-none focus:border-[#D06C4E]"
              >
                <option value="all">All Verified</option>
                <option value="utilities">Utilities Included</option>
                <option value="instant">Immediate Move-In</option>
                <option value="both">Both Included & Immediate</option>
              </select>
            </div>
          </div>

          {/* 7. Must-Have Amenity Selection Boxes at the Bottom */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="block text-xs font-extrabold text-[#2C2724]">
                Must-Have Amenities
              </span>
              {filters.amenities.length > 0 && (
                <button
                  type="button"
                  onClick={() => onUpdateFilters({ amenities: [] })}
                  className="text-[10px] font-bold text-[#D06C4E] hover:underline"
                >
                  Clear ({filters.amenities.length})
                </button>
              )}
            </div>

            <div
              data-testid="filter-amenities-checkbox-grid"
              className="grid grid-cols-2 gap-2"
            >
              {AMENITY_OPTIONS.map((amenity) => {
                const isSelected = filters.amenities.includes(amenity);
                return (
                  <label
                    key={amenity}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all select-none ${
                      isSelected
                        ? 'bg-[#EBF0EC] text-[#2C2724] border-[#7A907C]'
                        : 'bg-white hover:bg-[#F9F7F3] text-[#2C2724] border-[#2C2724]/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleAmenity(amenity)}
                      className="sr-only"
                    />
                    <span
                      className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-[#D06C4E] border-[#D06C4E] text-white'
                          : 'bg-[#F9F7F3] border-[#2C2724]/40'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                    <span className="truncate">{amenity}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="p-4 bg-white border-t border-[#2C2724]/15 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 text-xs font-extrabold">
            <Check className="w-3.5 h-3.5" />
            <span>{matchedRoomsCount} Verified Rooms</span>
          </span>

          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-extrabold text-xs shadow-warm-sm transition-all active:scale-95 text-center"
          >
            Show {matchedRoomsCount} Listings
          </button>
        </div>
      </div>
    </div>
  );
};
