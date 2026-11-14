import React, { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Coffee,
  Train,
  Footprints,
  Bike,
  Play,
  Bookmark,
  Star,
  ShoppingBag,
  Wine,
  Utensils,
  Car,
  HeartPulse,
  ExternalLink,
  SlidersHorizontal,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { RoomListing } from '../types';
import { FennMascot, FennPinEarsCrown } from './FennMascot';
import { getRoomBedBathTag } from '../utils/trustSafety';

interface ExploreNeighborhoodViewProps {
  currentRoom: RoomListing;
  allRooms: RoomListing[];
  onSelectRoomAndWatch: (roomId: string) => void;
  pinnedRoomIds?: Set<string>;
  onTogglePin?: (roomId: string) => void;
  onOpenFilterModal?: () => void;
  onResetFilters?: () => void;
}

export type HighlightCategory =
  | 'all'
  | 'groceries'
  | 'drinks'
  | 'bars'
  | 'restaurants'
  | 'parking'
  | 'hospitals';

export interface NearbyPlaceItem {
  id: string;
  name: string;
  category: Exclude<HighlightCategory, 'all'>;
  primaryTypeLabel: string;
  rating: number | null;
  address: string;
  location: { lat: number; lng: number };
  googleMapsURI: string | null;
}

// Fixed 1-mile radius (1,609 meters) based on the filter selection
const ONE_MILE_METERS = 1609;

export const SPOT_CATEGORY_ORDER: Exclude<HighlightCategory, 'all'>[] = [
  'groceries',
  'drinks',
  'bars',
  'restaurants',
  'parking',
  'hospitals',
];

export const CATEGORY_CONFIG: {
  id: HighlightCategory;
  label: string;
  includedTypes: string[];
  colorHex: string;
  badgeBg: string;
  badgeText: string;
}[] = [
  {
    id: 'all',
    label: 'All Spots',
    includedTypes: [
      'supermarket',
      'grocery_store',
      'cafe',
      'coffee_shop',
      'bar',
      'restaurant',
      'parking',
      'hospital',
    ],
    colorHex: '#2C2724',
    badgeBg: 'bg-[#2C2724]',
    badgeText: 'text-[#F9F7F3]',
  },
  {
    id: 'groceries',
    label: 'Groceries',
    includedTypes: ['supermarket', 'grocery_store'],
    colorHex: '#7A907C',
    badgeBg: 'bg-[#7A907C]',
    badgeText: 'text-white',
  },
  {
    id: 'drinks',
    label: 'Drinks & Cafes',
    includedTypes: ['cafe', 'coffee_shop', 'bakery'],
    colorHex: '#D06C4E',
    badgeBg: 'bg-[#D06C4E]',
    badgeText: 'text-white',
  },
  {
    id: 'bars',
    label: 'Bars',
    includedTypes: ['bar', 'wine_bar', 'pub'],
    colorHex: '#8C4A32',
    badgeBg: 'bg-[#8C4A32]',
    badgeText: 'text-white',
  },
  {
    id: 'restaurants',
    label: 'Restaurants',
    includedTypes: ['restaurant'],
    colorHex: '#2C2724',
    badgeBg: 'bg-[#2C2724]',
    badgeText: 'text-[#F9F7F3]',
  },
  {
    id: 'parking',
    label: 'Parking',
    includedTypes: ['parking'],
    colorHex: '#4A6B82',
    badgeBg: 'bg-[#4A6B82]',
    badgeText: 'text-white',
  },
  {
    id: 'hospitals',
    label: 'Hospitals',
    includedTypes: ['hospital', 'medical_lab', 'doctor'],
    colorHex: '#B84A39',
    badgeBg: 'bg-[#B84A39]',
    badgeText: 'text-white',
  },
];

export function classifyPlaceCategory(primaryType?: string): Exclude<HighlightCategory, 'all'> {
  const t = (primaryType || '').toLowerCase();
  if (
    t.includes('market') ||
    t.includes('grocery') ||
    t.includes('supermarket') ||
    t.includes('store')
  ) {
    return 'groceries';
  }
  if (t.includes('parking') || t.includes('garage') || t.includes('lot')) {
    return 'parking';
  }
  if (
    t.includes('hospital') ||
    t.includes('medical') ||
    t.includes('clinic') ||
    t.includes('doctor') ||
    t.includes('health') ||
    t.includes('dentist')
  ) {
    return 'hospitals';
  }
  if (t.includes('bar') || t.includes('pub') || t.includes('wine') || t.includes('night')) {
    return 'bars';
  }
  if (t.includes('cafe') || t.includes('coffee') || t.includes('bakery') || t.includes('tea')) {
    return 'drinks';
  }
  return 'restaurants';
}

export function sortPlacesBySpotType(places: NearbyPlaceItem[]): NearbyPlaceItem[] {
  return [...places].sort((a, b) => {
    const idxA = SPOT_CATEGORY_ORDER.indexOf(a.category);
    const idxB = SPOT_CATEGORY_ORDER.indexOf(b.category);
    if (idxA !== idxB) return idxA - idxB;
    return a.name.localeCompare(b.name);
  });
}

export function buildFallbackPlacesAroundCenter(
  center: { lat: number; lng: number },
  activeCategory: HighlightCategory
): NearbyPlaceItem[] {
  const allFallback: NearbyPlaceItem[] = [
    {
      id: 'spot-grocery-1',
      name: 'Bi-Rite Market & Organic Groceries',
      category: 'groceries',
      primaryTypeLabel: 'Grocery Store',
      rating: 4.8,
      address: '3639 18th St, Near Listing',
      location: { lat: center.lat + 0.0021, lng: center.lng - 0.0024 },
      googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${center.lat + 0.0021},${center.lng - 0.0024}`,
    },
    {
      id: 'spot-grocery-2',
      name: 'Whole Foods Neighborhood Market',
      category: 'groceries',
      primaryTypeLabel: 'Supermarket',
      rating: 4.6,
      address: '2001 Market St, Near Listing',
      location: { lat: center.lat - 0.0025, lng: center.lng + 0.0018 },
      googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${center.lat - 0.0025},${center.lng + 0.0018}`,
    },
    {
      id: 'spot-drinks-1',
      name: 'Sightglass Coffee Roasters',
      category: 'drinks',
      primaryTypeLabel: 'Coffee Shop & Cafe',
      rating: 4.7,
      address: '3014 20th St, Near Listing',
      location: { lat: center.lat + 0.0014, lng: center.lng + 0.0022 },
      googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${center.lat + 0.0014},${center.lng + 0.0022}`,
    },
    {
      id: 'spot-drinks-2',
      name: 'Tartine Bakery & Espresso Bar',
      category: 'drinks',
      primaryTypeLabel: 'Cafe & Bakery',
      rating: 4.8,
      address: '600 Guerrero St, Near Listing',
      location: { lat: center.lat - 0.0012, lng: center.lng - 0.0029 },
      googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${center.lat - 0.0012},${center.lng - 0.0029}`,
    },
    {
      id: 'spot-bars-1',
      name: 'Trick Dog Craft Cocktail Bar',
      category: 'bars',
      primaryTypeLabel: 'Cocktail Bar',
      rating: 4.7,
      address: '3010 20th St, Near Listing',
      location: { lat: center.lat - 0.0022, lng: center.lng - 0.0015 },
      googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${center.lat - 0.0022},${center.lng - 0.0015}`,
    },
    {
      id: 'spot-bars-2',
      name: 'ABV Neighborhood Wine & Lounge',
      category: 'bars',
      primaryTypeLabel: 'Wine Bar & Pub',
      rating: 4.8,
      address: '3174 16th St, Near Listing',
      location: { lat: center.lat + 0.0028, lng: center.lng - 0.0011 },
      googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${center.lat + 0.0028},${center.lng - 0.0011}`,
    },
    {
      id: 'spot-restaurants-1',
      name: 'Foreign Cinema Courtyard Dining',
      category: 'restaurants',
      primaryTypeLabel: 'Restaurant',
      rating: 4.7,
      address: '2534 Mission St, Near Listing',
      location: { lat: center.lat - 0.0018, lng: center.lng + 0.0027 },
      googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${center.lat - 0.0018},${center.lng + 0.0027}`,
    },
    {
      id: 'spot-restaurants-2',
      name: 'Nopa Wood-Fired Kitchen',
      category: 'restaurants',
      primaryTypeLabel: 'Restaurant',
      rating: 4.8,
      address: '560 Divisadero St, Near Listing',
      location: { lat: center.lat + 0.0019, lng: center.lng + 0.0011 },
      googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${center.lat + 0.0019},${center.lng + 0.0011}`,
    },
    {
      id: 'spot-parking-1',
      name: 'Mission Bartlett 24/7 Covered Garage',
      category: 'parking',
      primaryTypeLabel: 'Parking Garage • EV Charging',
      rating: 4.5,
      address: '3255 21st St, Near Listing',
      location: { lat: center.lat + 0.0009, lng: center.lng - 0.0019 },
      googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${center.lat + 0.0009},${center.lng - 0.0019}`,
    },
    {
      id: 'spot-parking-2',
      name: 'Hoff Street Secure Resident Parking Lot',
      category: 'parking',
      primaryTypeLabel: 'Public & Monthly Parking',
      rating: 4.4,
      address: '42 Hoff St, Near Listing',
      location: { lat: center.lat - 0.0028, lng: center.lng - 0.0006 },
      googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${center.lat - 0.0028},${center.lng - 0.0006}`,
    },
    {
      id: 'spot-hospitals-1',
      name: 'UCSF Health & Urgent Care Medical Center',
      category: 'hospitals',
      primaryTypeLabel: 'Hospital & Urgent Care',
      rating: 4.7,
      address: '1001 Potrero Ave, Near Listing',
      location: { lat: center.lat + 0.0025, lng: center.lng + 0.0029 },
      googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${center.lat + 0.0025},${center.lng + 0.0029}`,
    },
    {
      id: 'spot-hospitals-2',
      name: 'CPMC Mission Bernal Campus Hospital',
      category: 'hospitals',
      primaryTypeLabel: '24-Hour Emergency Hospital',
      rating: 4.6,
      address: '3555 Cesar Chavez St, Near Listing',
      location: { lat: center.lat - 0.0031, lng: center.lng + 0.0012 },
      googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${center.lat - 0.0031},${center.lng + 0.0012}`,
    },
  ];

  const filtered =
    activeCategory === 'all'
      ? allFallback
      : allFallback.filter((item) => item.category === activeCategory);
  return sortPlacesBySpotType(filtered);
}

interface MapPlacesControllerProps {
  center: { lat: number; lng: number };
  activeCategory: HighlightCategory;
  onPlacesLoaded: (places: NearbyPlaceItem[]) => void;
  onLoadingChange: (loading: boolean) => void;
}

const MapPlacesController: React.FC<MapPlacesControllerProps> = ({
  center,
  activeCategory,
  onPlacesLoaded,
  onLoadingChange,
}) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');

  // Pan map smoothly to the selected listing at 1-mile neighborhood zoom (no radius circle drawn)
  useEffect(() => {
    if (!map) return;
    map.panTo(center);
    map.setZoom(14);
  }, [map, center.lat, center.lng]);

  // Fetch live nearby spots within a 1-mile radius (1,609 meters) via Places API (New)
  useEffect(() => {
    if (!placesLib) {
      onPlacesLoaded(buildFallbackPlacesAroundCenter(center, activeCategory));
      return;
    }
    let isCancelled = false;

    const fetchNearbyPlaces = async () => {
      onLoadingChange(true);
      try {
        const config =
          CATEGORY_CONFIG.find((c) => c.id === activeCategory) || CATEGORY_CONFIG[0];

        // See https://developers.google.com/maps/documentation/javascript/places-new?utm_campaign=gmp_mcp_codeassist_v1_aistudio
        const request: any = {
          fields: [
            'id',
            'displayName',
            'location',
            'formattedAddress',
            'rating',
            'primaryType',
            'primaryTypeDisplayName',
            'googleMapsURI',
          ],
          locationRestriction: {
            center,
            radius: ONE_MILE_METERS,
          },
          includedPrimaryTypes: config.includedTypes,
          maxResultCount: 14,
          internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
        };

        const response = await (placesLib.Place as any).searchNearby(request);
        if (isCancelled) return;

        const placesList: any[] = response?.places || [];
        const mapped: NearbyPlaceItem[] = placesList
          .filter((p: any) => Boolean(p.location))
          .map((p: any) => {
            const lat =
              typeof p.location?.lat === 'function'
                ? p.location.lat()
                : Number((p.location as any)?.lat ?? center.lat);
            const lng =
              typeof p.location?.lng === 'function'
                ? p.location.lng()
                : Number((p.location as any)?.lng ?? center.lng);

            return {
              id: p.id || `${lat}-${lng}`,
              name: p.displayName || 'Local Spot',
              category:
                activeCategory === 'all'
                  ? classifyPlaceCategory(p.primaryType || undefined)
                  : activeCategory,
              primaryTypeLabel:
                (p as any).primaryTypeDisplayName ||
                (p.primaryType ? p.primaryType.replace(/_/g, ' ') : 'Neighborhood Spot'),
              rating: typeof p.rating === 'number' ? p.rating : null,
              address: p.formattedAddress || '',
              location: { lat, lng },
              googleMapsURI: p.googleMapsURI || null,
            };
          });

        if (mapped.length > 0) {
          onPlacesLoaded(sortPlacesBySpotType(mapped));
        } else {
          onPlacesLoaded(buildFallbackPlacesAroundCenter(center, activeCategory));
        }
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        if (
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('429') ||
          msg.includes('QuotaExceededError')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        if (!isCancelled) {
          onPlacesLoaded(buildFallbackPlacesAroundCenter(center, activeCategory));
        }
      } finally {
        if (!isCancelled) {
          onLoadingChange(false);
        }
      }
    };

    fetchNearbyPlaces();
    return () => {
      isCancelled = true;
    };
  }, [placesLib, center.lat, center.lng, activeCategory]);

  return null;
};

export const ExploreNeighborhoodView: React.FC<ExploreNeighborhoodViewProps> = ({
  currentRoom,
  allRooms,
  onSelectRoomAndWatch,
  pinnedRoomIds = new Set(),
  onTogglePin,
  onOpenFilterModal,
  onResetFilters,
}) => {
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    currentRoom?.id || allRooms[0]?.id || 'room-1'
  );
  const [activeCategory, setActiveCategory] = useState<HighlightCategory>('all');
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlaceItem[]>(() =>
    buildFallbackPlacesAroundCenter(
      currentRoom?.coordinates || { lat: 37.7599, lng: -122.4148 },
      'all'
    )
  );
  const [selectedPlace, setSelectedPlace] = useState<NearbyPlaceItem | null>(null);
  const selectedPlaceId = selectedPlace?.id || null;
  const [, setIsLoadingPlaces] = useState<boolean>(false);
  const [isSpotsSectionOpen, setIsSpotsSectionOpen] = useState<boolean>(true);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());

  const toggleSpotCategory = (cat: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  // Compute listings within 1-mile radius based on the filter selection / reference room
  const areaRooms = useMemo(() => {
    if (allRooms.length === 0) return [];
    const refRoom =
      allRooms.find((r) => r.id === currentRoom?.id) || allRooms[0];
    const refCoords = refRoom?.coordinates || { lat: 37.7599, lng: -122.4148 };

    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const calcDistMiles = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 3958.8;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
          Math.cos(toRad(lat2)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const withDist = allRooms.map((room) => {
      const dist =
        room.distanceMiles !== undefined
          ? room.distanceMiles
          : room.coordinates
          ? calcDistMiles(
              refCoords.lat,
              refCoords.lng,
              room.coordinates.lat,
              room.coordinates.lng
            )
          : 0;
      return { ...room, distanceMiles: dist };
    });

    const withinOneMile = withDist.filter((r) => (r.distanceMiles ?? 0) <= 1.0);
    return withinOneMile.length > 0 ? withinOneMile : [withDist[0]];
  }, [allRooms, currentRoom?.id]);

  const activeSelectedRoom =
    areaRooms.find((r) => r.id === selectedRoomId) || areaRooms[0] || null;

  const listingCenter = activeSelectedRoom?.coordinates || {
    lat: 37.7599,
    lng: -122.4148,
  };

  // Update fallback places immediately when category or listing changes before Places API resolves
  useEffect(() => {
    setSelectedPlace(null);
    setNearbyPlaces(buildFallbackPlacesAroundCenter(listingCenter, activeCategory));
  }, [activeCategory, listingCenter.lat, listingCenter.lng]);

  // Keep selectedRoomId synced if areaRooms changes via filter modal
  useEffect(() => {
    if (areaRooms.length > 0 && !areaRooms.some((r) => r.id === selectedRoomId)) {
      setSelectedRoomId(areaRooms[0].id);
    }
  }, [areaRooms, selectedRoomId]);

  const sortedNearbyPlaces = useMemo(
    () => sortPlacesBySpotType(nearbyPlaces),
    [nearbyPlaces]
  );

  const groupedPlacesBySpotType = useMemo(() => {
    const groups: {
      category: Exclude<HighlightCategory, 'all'>;
      label: string;
      places: NearbyPlaceItem[];
    }[] = [];

    for (const cat of SPOT_CATEGORY_ORDER) {
      const items = sortedNearbyPlaces.filter((p) => p.category === cat);
      if (items.length > 0) {
        const config = CATEGORY_CONFIG.find((c) => c.id === cat);
        groups.push({
          category: cat,
          label: config?.label || cat,
          places: items,
        });
      }
    }
    return groups;
  }, [sortedNearbyPlaces]);

  const renderCategoryIcon = (
    cat: Exclude<HighlightCategory, 'all'>,
    className = 'w-3.5 h-3.5'
  ) => {
    switch (cat) {
      case 'groceries':
        return <ShoppingBag className={className} />;
      case 'drinks':
        return <Coffee className={className} />;
      case 'bars':
        return <Wine className={className} />;
      case 'parking':
        return <Car className={className} />;
      case 'hospitals':
        return <HeartPulse className={className} />;
      case 'restaurants':
      default:
        return <Utensils className={className} />;
    }
  };

  const getCategoryBadgeStyle = (cat: Exclude<HighlightCategory, 'all'>) => {
    switch (cat) {
      case 'groceries':
        return 'bg-[#7A907C] text-white';
      case 'drinks':
        return 'bg-[#D06C4E] text-white';
      case 'bars':
        return 'bg-[#8C4A32] text-white';
      case 'parking':
        return 'bg-[#4A6B82] text-white';
      case 'hospitals':
        return 'bg-[#B84A39] text-white';
      case 'restaurants':
      default:
        return 'bg-[#2C2724] text-[#F9F7F3]';
    }
  };

  const getCategoryLabel = (cat: Exclude<HighlightCategory, 'all'>) => {
    const found = CATEGORY_CONFIG.find((c) => c.id === cat);
    return found ? found.label : 'Spot';
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F9F7F3] text-[#2C2724] overflow-hidden">
      {/* Clean Scout Header: Only shows title and Filter Icon Button that opens the Filter Modal */}
      <header className="px-4 py-3 bg-white border-b border-[#2C2724]/15 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <FennMascot size="md" variant="pose_scouting" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-extrabold tracking-tight text-[#2C2724]">
                Scout Neighborhood
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 text-[10px] font-extrabold">
                1 mi Radius
              </span>
            </div>
            <p className="text-[11px] text-[#2C2724]/70 truncate">
              {areaRooms.length} {areaRooms.length === 1 ? 'listing' : 'listings'} within 1 mi matching filters
            </p>
          </div>
        </div>

        {/* Filter Icon Button that goes to the Filter section when selected */}
        <button
          type="button"
          data-testid="scout-open-filter-modal-btn"
          aria-label="Open Filters"
          onClick={() => onOpenFilterModal?.()}
          className="w-10 h-10 rounded-xl bg-[#F9F7F3] hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 shadow-warm-sm transition-all active:scale-95"
        >
          <SlidersHorizontal className="w-4 h-4 text-[#D06C4E]" />
        </button>
      </header>

      {/* Scrollable Google Map + Area Listings List + Spots List Sorted by Spot Type */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {areaRooms.length > 0 ? (
          <>
            {/* Interactive Google Map (Shows only Listing Price Pins; native Google Maps POIs handle restaurants, parking, etc.) */}
            <div
              data-testid="scout-map-canvas"
              className="relative w-full h-64 rounded-xl bg-[#EFE9DC] border border-[#2C2724] overflow-hidden shadow-warm-sm"
            >
              {apiKey ? (
                <APIProvider apiKey={apiKey}>
                  <Map
                    style={{ width: '100%', height: '100%' }}
                    defaultCenter={listingCenter}
                    defaultZoom={14}
                    mapId="DEMO_MAP_ID"
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    gestureHandling="greedy"
                    disableDefaultUI={false}
                    mapTypeControl={false}
                    streetViewControl={false}
                  >
                    <MapPlacesController
                      center={listingCenter}
                      activeCategory={activeCategory}
                      onPlacesLoaded={setNearbyPlaces}
                      onLoadingChange={setIsLoadingPlaces}
                    />

                    {/* Listing AdvancedMarkers (within 1 mi radius) */}
                    {areaRooms.map((room) => {
                      if (!room.coordinates) return null;
                      const isSelected = activeSelectedRoom?.id === room.id;
                      return (
                        <AdvancedMarker
                          key={room.id}
                          position={room.coordinates}
                          zIndex={isSelected ? 30 : 20}
                          onClick={() => setSelectedRoomId(room.id)}
                        >
                          <div className="flex flex-col items-center cursor-pointer">
                            <FennPinEarsCrown isSelected={isSelected} />
                            <div
                              className={`px-2.5 py-1 rounded-full font-black text-xs border shadow-warm-sm flex items-center gap-1 ${
                                isSelected
                                  ? 'bg-[#D06C4E] text-white border-[#2C2724]'
                                  : 'bg-[#2C2724] text-[#F9F7F3] border-[#F9F7F3]'
                              }`}
                            >
                              <span>${room.price.toLocaleString()}</span>
                            </div>
                          </div>
                        </AdvancedMarker>
                      );
                    })}
                  </Map>
                </APIProvider>
              ) : (
                <div className="w-full h-full flex items-center justify-center p-4 text-center text-xs text-[#6E655F]">
                  Loading Google Maps...
                </div>
              )}
            </div>

            {/* List of Listings in the Area Matching Filters (Click any listing to reveal Watch Tour, Walkability, etc.) */}
            <div
              data-testid="scout-area-listings-list"
              className="bg-white rounded-xl border border-[#2C2724]/15 p-3 space-y-2.5 shadow-warm-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2C2724]">
                  Listings in the Area • 1 mi Radius ({areaRooms.length})
                </span>
                <span className="text-[10px] font-bold text-[#7A907C]">
                  Click a listing for tour & walkability
                </span>
              </div>

              <div className="space-y-2">
                {areaRooms.map((room) => {
                  const isSelected = activeSelectedRoom?.id === room.id;
                  return (
                    <div
                      key={room.id}
                      data-testid={`scout-listing-item-${room.id}`}
                      onClick={() => setSelectedRoomId(room.id)}
                      className={`rounded-xl border p-2.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#F9F7F3] border-[#2C2724] shadow-warm-sm'
                          : 'bg-white border-[#2C2724]/15 hover:border-[#2C2724]/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-[#2C2724] shrink-0">
                          <img
                            src={room.fallbackThumbnail}
                            alt={room.title}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                            <div className="w-6 h-6 rounded-full bg-[#D06C4E] text-white flex items-center justify-center shadow">
                              <Play className="w-3 h-3 fill-current ml-0.5" />
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className="px-2 py-0.5 rounded-md bg-[#2C2724] text-[#F9F7F3] text-[10px] font-extrabold">
                              ${room.price.toLocaleString()}/mo
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-[#EBF0EC] text-[#7A907C] border border-[#7A907C]/40 text-[10px] font-extrabold">
                              {getRoomBedBathTag(room)}
                            </span>
                            {room.distanceMiles !== undefined && (
                              <span className="text-[10px] font-extrabold text-[#D06C4E]">
                                {room.distanceMiles.toFixed(1)} mi
                              </span>
                            )}
                          </div>
                          <h3 className="text-xs font-extrabold text-[#2C2724] truncate">
                            {room.title}
                          </h3>
                          <p className="text-[10px] text-[#2C2724]/70 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-[#D06C4E] shrink-0" />
                            <span className="truncate">{room.location}</span>
                          </p>
                        </div>

                        <div className="text-[#2C2724]/60 shrink-0">
                          {isSelected ? (
                            <ChevronUp className="w-4 h-4 text-[#D06C4E]" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </div>

                      {/* Expanded Information when Clicked: Watch Tour, Save to Den, and Walkability / Transit / Bike */}
                      {isSelected && (
                        <div
                          data-testid={`scout-listing-expanded-${room.id}`}
                          className="mt-2.5 pt-2.5 border-t border-[#2C2724]/12 space-y-2.5"
                        >
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="p-1.5 rounded-xl bg-white border border-[#2C2724]/12 flex items-center justify-center gap-1 text-[11px] font-extrabold text-[#2C2724]">
                              <Footprints className="w-3.5 h-3.5 text-[#7A907C]" />
                              <span>98 Walk</span>
                            </div>
                            <div className="p-1.5 rounded-xl bg-white border border-[#2C2724]/12 flex items-center justify-center gap-1 text-[11px] font-extrabold text-[#2C2724]">
                              <Train className="w-3.5 h-3.5 text-[#D06C4E]" />
                              <span>94 Transit</span>
                            </div>
                            <div className="p-1.5 rounded-xl bg-white border border-[#2C2724]/12 flex items-center justify-center gap-1 text-[11px] font-extrabold text-[#2C2724]">
                              <Bike className="w-3.5 h-3.5 text-[#7A907C]" />
                              <span>96 Bike</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              data-testid={`scout-watch-tour-btn-${room.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectRoomAndWatch(room.id);
                              }}
                              className="flex-1 py-1.5 px-3 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-[11px] font-extrabold flex items-center justify-center gap-1 transition-all active:scale-95"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Watch Tour</span>
                            </button>
                            {onTogglePin && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onTogglePin(room.id);
                                }}
                                className={`py-1.5 px-3 rounded-xl text-[11px] font-extrabold border flex items-center gap-1 transition-all active:scale-95 ${
                                  pinnedRoomIds.has(room.id)
                                    ? 'bg-[#EBF0EC] text-[#7A907C] border-[#7A907C]'
                                    : 'bg-white text-[#2C2724] border-[#2C2724]'
                                }`}
                              >
                                <Bookmark
                                  className={`w-3 h-3 ${
                                    pinnedRoomIds.has(room.id) ? 'fill-current' : ''
                                  }`}
                                />
                                <span>
                                  {pinnedRoomIds.has(room.id) ? 'In Den' : 'Save to Den'}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* All Spots List Sorted by Spot Type (Can be hidden when tapped) */}
            <div
              data-testid="scout-highlighted-places-section"
              className="bg-white rounded-xl border border-[#2C2724]/15 p-3 space-y-3 shadow-warm-sm"
            >
              <button
                type="button"
                data-testid="scout-toggle-spots-section-btn"
                onClick={() => setIsSpotsSectionOpen((prev) => !prev)}
                className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
              >
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2C2724]">
                  Spots Sorted by Type • 1 mi Radius
                </span>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#7A907C]">
                  <span>
                    {isSpotsSectionOpen ? 'Tap to hide' : `Tap to show (${sortedNearbyPlaces.length})`}
                  </span>
                  {isSpotsSectionOpen ? (
                    <ChevronUp className="w-4 h-4 text-[#D06C4E]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#2C2724]" />
                  )}
                </div>
              </button>

              {isSpotsSectionOpen && (
                <div data-testid="scout-spots-list-body" className="space-y-2.5 pt-1 border-t border-[#2C2724]/10">
                  {groupedPlacesBySpotType.map((group) => {
                    const isGroupHidden = hiddenCategories.has(group.category);
                    return (
                      <div
                        key={group.category}
                        data-testid={`scout-spot-group-${group.category}`}
                        className="space-y-1.5"
                      >
                        <button
                          type="button"
                          data-testid={`scout-toggle-spot-group-${group.category}`}
                          onClick={() => toggleSpotCategory(group.category)}
                          className="w-full flex items-center justify-between gap-2 py-1 px-1.5 rounded-lg hover:bg-[#F9F7F3] transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center ${getCategoryBadgeStyle(
                                group.category
                              )}`}
                            >
                              {renderCategoryIcon(group.category, 'w-3 h-3')}
                            </span>
                            <span className="text-[11px] font-extrabold text-[#2C2724]">
                              {group.label}
                            </span>
                            <span className="text-[10px] font-bold text-[#6E655F]">
                              ({group.places.length})
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-bold text-[#6E655F]">
                            <span>{isGroupHidden ? 'Show' : 'Hide'}</span>
                            {isGroupHidden ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronUp className="w-3.5 h-3.5 text-[#D06C4E]" />
                            )}
                          </div>
                        </button>

                        {!isGroupHidden && (
                          <div
                            data-testid={`scout-spot-group-items-${group.category}`}
                            className="space-y-1.5"
                          >
                            {group.places.map((place) => {
                              const isSelected = selectedPlaceId === place.id;
                              return (
                                <div
                                  key={place.id}
                                  data-testid={`scout-spot-list-item-${place.id}`}
                                  onClick={() =>
                                    setSelectedPlace(isSelected ? null : place)
                                  }
                                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                                    isSelected
                                      ? 'bg-[#EBF0EC] border-[#2C2724] shadow-warm-sm'
                                      : 'bg-[#F9F7F3] border-[#2C2724]/15 hover:border-[#2C2724]/40'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span
                                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${getCategoryBadgeStyle(
                                        place.category
                                      )}`}
                                    >
                                      {renderCategoryIcon(
                                        place.category,
                                        'w-3.5 h-3.5'
                                      )}
                                    </span>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-extrabold text-[#2C2724] truncate">
                                          {place.name}
                                        </span>
                                        {place.rating && (
                                          <span className="inline-flex items-center text-[#D06C4E] text-[10px] font-extrabold shrink-0">
                                            <Star className="w-2.5 h-2.5 fill-current mr-0.5" />
                                            {place.rating.toFixed(1)}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-[#6E655F] truncate capitalize">
                                        {group.label} • {place.primaryTypeLabel}
                                        {place.address
                                          ? ` • ${place.address}`
                                          : ''}
                                      </p>
                                    </div>
                                  </div>

                                  {place.googleMapsURI && (
                                    <a
                                      href={place.googleMapsURI}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="px-2 py-1 rounded-lg bg-white border border-[#2C2724]/15 text-[10px] font-extrabold text-[#485B4A] hover:underline flex items-center gap-0.5 shrink-0"
                                    >
                                      <span>Map</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Pose 2 (Empty State / No Results) */
          <div
            data-testid="scout-empty-state"
            className="bg-white rounded-xl border border-[#2C2724] p-6 text-center flex flex-col items-center space-y-2.5 my-4 shadow-warm-sm"
          >
            <FennMascot size="xl" variant="pose_empty" />
            <h3 className="text-sm font-extrabold text-[#2C2724]">
              No apartments match those exact filters
            </h3>
            <p className="text-xs text-[#2C2724]/70 max-w-xs leading-relaxed">
              Even Fenn’s radar ears couldn’t pick up a listing with those criteria. Try adjusting or resetting your filters.
            </p>
            <div className="flex items-center gap-2">
              {onOpenFilterModal && (
                <button
                  type="button"
                  onClick={onOpenFilterModal}
                  className="px-4 py-2 rounded-xl bg-[#2C2724] text-[#F9F7F3] text-xs font-extrabold shadow-warm-sm transition-all active:scale-95"
                >
                  Open Filters
                </button>
              )}
              {onResetFilters && (
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="px-4 py-2 rounded-xl bg-[#D06C4E] hover:bg-[#b85b3f] text-white text-xs font-extrabold shadow-warm-sm transition-all active:scale-95"
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
