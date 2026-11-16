import React, { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import {
  ArrowLeft,
  X,
  Upload,
  Check,
  Sparkles,
  PenTool,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react';
import { RoomListing, UserProfile } from '../types';
import {
  ViralTourSlotConfig,
  GeminiViralTourPlan,
  AiLoadedPictureInfo,
  AiListingCopyOutput,
  generateAiListingTitleAndDescription,
} from '../utils/trustSafety';
import type { RecordedViralSlotMedia } from './GuidedViralTourStudio';
import { GuidedShotCapture } from './GuidedShotCapture';
import {
  createGuidedShotSlots,
  canProceedWithShots,
  MIN_SHOTS_TO_PROCEED,
} from '../utils/guidedShots';
import type { ViralVideoResult } from './ViralVideoEditor';
import type { ViralListingInfo } from '../remotion/viral/types';

// Remotion only downloads when the host reaches Step 3
const ViralVideoEditor = React.lazy(() =>
  import('./ViralVideoEditor').then((m) => ({ default: m.ViralVideoEditor }))
);

interface PostRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPublishRoom: (room: RoomListing) => void;
  userProfile: UserProfile;
  onOpenAiDirector?: () => void;
}

export const PostRoomModal: React.FC<PostRoomModalProps> = ({
  isOpen,
  onClose,
  onPublishRoom,
  userProfile,
}) => {
  // Manual Title & Description Option Toggle (OFF by default -> AI Auto-Fills from Location & Loaded Pictures)
  const [isManualCopyEnabled, setIsManualCopyEnabled] = useState<boolean>(false);
  const [manualTitle, setManualTitle] = useState(
    'Sunny Mission Loft with Chef Kitchen & Balcony'
  );
  const [manualDescription, setManualDescription] = useState(
    'Sunlit private room in the heart of Mission District with private bath, in-unit laundry, and walkable access to cafes and transit.'
  );

  const [price, setPrice] = useState(1450);
  const [deposit, setDeposit] = useState(1450);
  const [beds, setBeds] = useState<number>(1);
  const [baths, setBaths] = useState<number>(1);
  const [city, setCity] = useState('San Francisco');
  const [neighborhood, setNeighborhood] = useState('Mission District');
  const [roomType, setRoomType] = useState<RoomListing['roomType']>('Private Room');
  const [leaseTerm, setLeaseTerm] = useState<RoomListing['leaseTerm']>('6 Months');
  const [squareFeet, setSquareFeet] = useState(220);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([
    'Private Bath',
    'In-Unit W/D',
    'High-Speed WiFi',
    'Utilities Included',
  ]);

  // Additional loaded pictures uploaded by the landlord
  const [customLoadedPictures, setCustomLoadedPictures] = useState<AiLoadedPictureInfo[]>([]);
  const [aiGeneratedCopy, setAiGeneratedCopy] = useState<AiListingCopyOutput | null>(null);
  const [isGeneratingAiCopy, setIsGeneratingAiCopy] = useState<boolean>(false);

  // Guided 5-shot capture state (5 shots + recorded/uploaded clips + Gemini plan)
  const [viralSlots, setViralSlots] = useState<ViralTourSlotConfig[]>(() =>
    createGuidedShotSlots()
  );
  const [recordedViralMedia, setRecordedViralMedia] = useState<
    Record<number, RecordedViralSlotMedia>
  >({});
  const [generatedViralPlan, setGeneratedViralPlan] =
    useState<GeminiViralTourPlan | null>(null);

  const hasEnoughShots = canProceedWithShots(recordedViralMedia);

  // Step 3: Remotion viral editor. Memoized so the edit plan only rebuilds when a fact changes.
  const viralListing = useMemo<ViralListingInfo>(
    () => ({
      monthlyRent: Number(price) || 0,
      beds,
      baths,
      neighborhood,
      city,
      roomType,
      squareFeet: Number(squareFeet) || undefined,
      amenities: selectedAmenities,
      leaseTerm,
    }),
    [price, beds, baths, neighborhood, city, roomType, squareFeet, selectedAmenities, leaseTerm]
  );
  const [viralVideo, setViralVideo] = useState<ViralVideoResult | null>(null);
  const [retakeSlot, setRetakeSlot] = useState<number | null>(null);
  const clearRetakeSlot = useCallback(() => setRetakeSlot(null), []);

  // An attached video goes stale when a shot or a listing fact changes
  useEffect(() => {
    setViralVideo(null);
  }, [recordedViralMedia, viralListing]);

  // Combine uploaded pictures + frames from the captured guided shots
  const allLoadedPictures = useMemo<AiLoadedPictureInfo[]>(() => {
    const capturedSlots = viralSlots.filter((slot) => recordedViralMedia[slot.slotNumber]);
    const slotPics: AiLoadedPictureInfo[] = capturedSlots.map((slot) => {
      const media = recordedViralMedia[slot.slotNumber];
      const activeTitle = (
        slot.isSwapped && slot.alternateTitle ? slot.alternateTitle : slot.title
      ).replace(/^(Video|Shot) \d+:\s*/i, '');
      const activeSubtitle =
        slot.isSwapped && slot.alternateSubtitle
          ? slot.alternateSubtitle
          : slot.subtitle;
      return {
        id: slot.id,
        label: `${activeTitle} (${activeSubtitle})`,
        url: media?.thumbnailUrl || slot.sampleThumbnailUrl,
        visualCue: `${activeTitle} — ${activeSubtitle}`,
        base64Data: media?.inlineDataBase64,
        mimeType: media?.mimeType,
      };
    });
    return [...customLoadedPictures, ...slotPics];
  }, [customLoadedPictures, viralSlots, recordedViralMedia]);

  // Deterministic synthesis from location + loaded pictures (always in sync)
  const synthesizedAiCopy = useMemo(
    () =>
      generateAiListingTitleAndDescription({
        neighborhood,
        city,
        roomType,
        beds,
        baths,
        monthlyRent: price,
        squareFeet,
        leaseTerm,
        amenities: selectedAmenities,
        loadedPictures: allLoadedPictures,
      }),
    [
      neighborhood,
      city,
      roomType,
      beds,
      baths,
      price,
      squareFeet,
      leaseTerm,
      selectedAmenities,
      allLoadedPictures,
    ]
  );

  // Clear cached Gemini override when location, specs, or loaded pictures change so it stays fresh
  useEffect(() => {
    setAiGeneratedCopy(null);
  }, [
    neighborhood,
    city,
    roomType,
    beds,
    baths,
    price,
    squareFeet,
    leaseTerm,
    selectedAmenities,
    allLoadedPictures.length,
  ]);

  const activeAiCopy = aiGeneratedCopy || synthesizedAiCopy;
  const effectiveTitle = isManualCopyEnabled ? manualTitle : activeAiCopy.title;
  const effectiveDescription = isManualCopyEnabled
    ? manualDescription
    : activeAiCopy.description;

  const handleTriggerGeminiAutoFill = async () => {
    setIsGeneratingAiCopy(true);
    try {
      const res = await fetch('/api/gemini/auto-fill-listing-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          neighborhood,
          city,
          roomType,
          beds,
          baths,
          monthlyRent: price,
          squareFeet,
          leaseTerm,
          amenities: selectedAmenities,
          loadedPictures: allLoadedPictures,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.title && data?.description) {
          setAiGeneratedCopy(data);
        }
      }
    } catch {
      // Fallback to synthesizedAiCopy
    } finally {
      setIsGeneratingAiCopy(false);
    }
  };

  const handleUploadPictures = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach((file) => {
      const objectUrl = URL.createObjectURL(file);
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const base64Data = result.includes(',') ? result.split(',')[1] : undefined;
        setCustomLoadedPictures((prev) => [
          ...prev,
          {
            id: `pic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label: cleanName || 'Uploaded Room Photo',
            url: objectUrl,
            visualCue: `Uploaded photo (${cleanName || 'Bright Room Angle'})`,
            base64Data,
            mimeType: file.type || 'image/jpeg',
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  if (!isOpen) return null;

  const allAmenitiesOptions = [
    'Private Bath',
    'In-Unit W/D',
    'High-Speed WiFi',
    'Utilities Included',
    'Furnished',
    'Pet Friendly',
    'Balcony',
    'AC',
    'Gym',
    'Parking',
    'Transit Nearby',
  ];

  const toggleAmenity = (item: string) => {
    if (selectedAmenities.includes(item)) {
      setSelectedAmenities(selectedAmenities.filter((a) => a !== item));
    } else {
      setSelectedAmenities([...selectedAmenities, item]);
    }
  };

  const publishListingWithPlan = (planOverride?: GeminiViralTourPlan | null) => {
    if (!hasEnoughShots) return;
    const finalPlan = planOverride || generatedViralPlan;
    const capturedSlots = viralSlots.filter((slot) => recordedViralMedia[slot.slotNumber]);
    const viralScenes = capturedSlots.map((slot, idx) => {
      const media = recordedViralMedia[slot.slotNumber];
      const clipPlan =
        finalPlan?.clips.find((c) => c.slotNumber === slot.slotNumber) || finalPlan?.clips[idx];
      const isLastClip = idx === capturedSlots.length - 1;
      const activeTitle =
        slot.isSwapped && slot.alternateTitle ? slot.alternateTitle : slot.title;
      const featureCallout =
        slot.slotNumber >= 2 && slot.slotNumber <= 4
          ? finalPlan?.feature_callouts?.[slot.slotNumber - 2]
          : undefined;
      return {
        label: `Clip ${idx + 1}/${capturedSlots.length} • ${activeTitle}`,
        caption: isLastClip
            ? finalPlan?.cta_overlay || "Tap 'Book Tour' to see it in person"
            : featureCallout || clipPlan?.overlay_badge || slot.movementBadge,
        imageUrl: media?.thumbnailUrl || slot.sampleThumbnailUrl,
        videoUrl: media?.videoUrl || slot.sampleVideoUrl,
        trimStart: clipPlan?.trim_start ?? 0.5,
        trimEnd: clipPlan?.trim_end ?? 3.5,
        playbackSpeed: clipPlan?.playback_speed ?? (slot.pacerType === 'walking' ? 0.75 : 0.85),
        hookOverlay: finalPlan?.hook_overlay,
        isCtaClip: isLastClip,
      };
    });

    // With an exported viral edit, the feed plays that one MP4; the scenes keep
    // each shot's thumbnail so the slideshow fallback still works.
    const editScenes = viralVideo
      ? viralVideo.plan.shots.map((shot, idx) => ({
          label: `Clip ${idx + 1}/${viralVideo.plan.shots.length} • ${shot.room}`,
          caption: shot.tag || viralVideo.plan.hook.text,
          imageUrl:
            recordedViralMedia[shot.slotNumber]?.thumbnailUrl ||
            viralSlots.find((s) => s.slotNumber === shot.slotNumber)?.sampleThumbnailUrl ||
            '',
          isCtaClip: idx === viralVideo.plan.shots.length - 1,
        }))
      : null;

    const firstVideoUrl = viralVideo
      ? viralVideo.url
      : viralScenes.find((s) => s.videoUrl)?.videoUrl || '';

    const finalTitle =
      effectiveTitle.trim() ||
      `${neighborhood} ${beds} Bed ${baths} Bath (${roomType})`;

    const finalDescription =
      effectiveDescription.trim() ||
      finalPlan?.viral_caption ||
      synthesizedAiCopy.description;

    const newListing: RoomListing = {
      id: `room-custom-${Date.now()}`,
      title: finalTitle,
      price: Number(price),
      deposit: Number(deposit),
      location: `${neighborhood}, ${city}`,
      neighborhood,
      city,
      roomType,
      leaseTerm,
      availableDate: 'Immediately',
      squareFeet: Number(squareFeet),
      amenities: selectedAmenities,
      videoUrl: firstVideoUrl,
      fallbackThumbnail: customLoadedPictures[0]?.url || viralScenes[0].imageUrl,
      tourFormat: viralVideo ? 'viral_edit' : 'live_walkthrough',
      customScenes: editScenes || viralScenes,
      // Keep the clips and choices behind the video so the host can edit it later
      viralEdit: viralVideo
        ? {
            ...viralVideo.edit,
            clips: Object.values(recordedViralMedia).map((m) => ({
              slotNumber: m.slotNumber,
              videoUrl: m.videoUrl,
              thumbnailUrl: m.thumbnailUrl,
              durationSec: m.durationSec,
              isLandscape: m.isLandscape,
              source: m.source,
            })),
          }
        : undefined,
      audioTrack: {
        title: finalPlan?.voiceover_script || 'Original Room Tour Beats',
        artist: userProfile.name,
      },
      host: {
        id: `host-${userProfile.id}`,
        name: userProfile.name,
        avatar: userProfile.avatar,
        verified: true,
        occupation: userProfile.occupation,
        responseRate: '100% (within 5 mins)',
        rating: 5.0,
        bio: userProfile.bio,
        joinedDate: 'Host since 2026',
      },
      roommates: [
        {
          name: userProfile.name.split(' ')[0],
          age: 27,
          role: 'Host',
          avatar: userProfile.avatar,
          vibe: 'Friendly host, respectful of quiet hours.',
        },
      ],
      houseRules: [
        'No smoking inside',
        'Respect quiet hours after 11 PM',
        'Keep shared spaces tidy',
      ],
      likesCount: 1,
      savesCount: 0,
      commentsCount: 0,
      description: finalDescription,
    };

    onPublishRoom(newListing);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    publishListingWithPlan(generatedViralPlan);
  };

  return (
    <div
      data-testid="create-listing-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
    >
      <div
        className="w-full h-full sm:max-w-[440px] sm:max-h-[920px] sm:h-[96vh] sm:rounded-[32px] bg-[#F9F7F3] text-[#2C2724] border-0 sm:border-2 sm:border-[#2C2724]/25 flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-[#2C2724]/15 bg-[#F9F7F3] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to Landlord"
              className="w-9 h-9 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724] text-[#2C2724] flex items-center justify-center shrink-0 transition-all active:scale-90"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm text-[#2C2724] truncate">
                Create Listing
              </h3>
              <p className="text-[11px] text-[#6E655F] truncate">
                Guided Viral Home Tour Studio &amp; AI Listing Details
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Create Listing"
            className="w-8 h-8 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/20 text-[#2C2724] flex items-center justify-center shrink-0 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs"
        >
          {/* STEP 1: COMPACT LISTING DETAILS & LOCATION */}
          <div className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#D06C4E]/15 text-[#D06C4E] flex items-center justify-center font-extrabold text-xs">
                  1
                </div>
                <div>
                  <h4 className="font-extrabold text-xs text-[#2C2724]">
                    Location, Property Specs &amp; Loaded Pictures
                  </h4>
                  <p className="text-[10px] text-[#6E655F]">
                    Used by AI to auto-fill Title, Description &amp; Viral Tour
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-bold text-[#6E655F] block mb-1">
                  Monthly Rent ($)
                </label>
                <input
                  type="number"
                  required
                  min={200}
                  max={10000}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="w-full px-2.5 py-2 bg-[#F9F7F3] border border-[#2C2724]/25 rounded-xl text-[#2C2724] font-bold text-xs focus:outline-none focus:border-[#D06C4E]"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#6E655F] block mb-1">
                  Beds
                </label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={beds}
                  onChange={(e) => setBeds(Number(e.target.value))}
                  className="w-full px-2.5 py-2 bg-[#F9F7F3] border border-[#2C2724]/25 rounded-xl text-[#2C2724] font-bold text-xs focus:outline-none focus:border-[#D06C4E]"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#6E655F] block mb-1">
                  Baths
                </label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={baths}
                  onChange={(e) => setBaths(Number(e.target.value))}
                  className="w-full px-2.5 py-2 bg-[#F9F7F3] border border-[#2C2724]/25 rounded-xl text-[#2C2724] font-bold text-xs focus:outline-none focus:border-[#D06C4E]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-[#6E655F] block mb-1">
                  Neighborhood
                </label>
                <input
                  data-testid="create-listing-neighborhood-input"
                  type="text"
                  required
                  placeholder="e.g. Mission District"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full px-2.5 py-2 bg-[#F9F7F3] border border-[#2C2724]/25 rounded-xl text-[#2C2724] font-semibold text-xs focus:outline-none focus:border-[#D06C4E]"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#6E655F] block mb-1">
                  City
                </label>
                <select
                  data-testid="create-listing-city-select"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-2.5 py-2 bg-[#F9F7F3] border border-[#2C2724]/25 rounded-xl text-[#2C2724] font-semibold text-xs focus:outline-none focus:border-[#D06C4E]"
                >
                  <option>San Francisco</option>
                  <option>New York</option>
                  <option>Austin</option>
                  <option>Seattle</option>
                  <option>Chicago</option>
                  <option>Los Angeles</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-bold text-[#6E655F] block mb-1">
                  Room Type
                </label>
                <select
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value as RoomListing['roomType'])}
                  className="w-full px-2 py-2 bg-[#F9F7F3] border border-[#2C2724]/25 rounded-xl text-[#2C2724] font-semibold text-[11px] focus:outline-none"
                >
                  <option>Private Room</option>
                  <option>Master Suite</option>
                  <option>Studio Sublet</option>
                  <option>Shared Room</option>
                  <option>Entire Place</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#6E655F] block mb-1">
                  Lease Term
                </label>
                <select
                  value={leaseTerm}
                  onChange={(e) => setLeaseTerm(e.target.value as RoomListing['leaseTerm'])}
                  className="w-full px-2 py-2 bg-[#F9F7F3] border border-[#2C2724]/25 rounded-xl text-[#2C2724] font-semibold text-[11px] focus:outline-none"
                >
                  <option>Month-to-month</option>
                  <option>3 Months</option>
                  <option>6 Months</option>
                  <option>12+ Months</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#6E655F] block mb-1">
                  Sq Ft / Deposit
                </label>
                <div className="grid grid-cols-2 gap-1">
                  <input
                    type="number"
                    value={squareFeet}
                    onChange={(e) => setSquareFeet(Number(e.target.value))}
                    title="Square Feet"
                    className="w-full px-2 py-2 bg-[#F9F7F3] border border-[#2C2724]/25 rounded-xl text-[#2C2724] font-semibold text-[11px] focus:outline-none"
                  />
                  <input
                    type="number"
                    value={deposit}
                    onChange={(e) => setDeposit(Number(e.target.value))}
                    title="Security Deposit ($)"
                    className="w-full px-2 py-2 bg-[#F9F7F3] border border-[#2C2724]/25 rounded-xl text-[#2C2724] font-semibold text-[11px] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Amenities Pills (Top 2 highlighted for Gemini) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#6E655F]">
                  Select Amenities (Used by AI Title, Description &amp; Tour)
                </span>
                <span className="text-[10px] font-bold text-[#485B4A]">
                  Top 2: {selectedAmenities.slice(0, 2).join(' • ') || 'None'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allAmenitiesOptions.map((amenity) => {
                  const isSelected = selectedAmenities.includes(amenity);
                  return (
                    <button
                      key={amenity}
                      type="button"
                      onClick={() => toggleAmenity(amenity)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] border flex items-center gap-1 transition-all ${
                        isSelected
                          ? 'bg-[#E8EFE9] border-[#7A907C] text-[#485B4A] font-bold'
                          : 'bg-[#F9F7F3] border-[#2C2724]/15 text-[#6E655F] hover:text-[#2C2724]'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      <span>{amenity}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Loaded Pictures Strip (Analyzed by AI when Manual Option is OFF) */}
            <div
              data-testid="loaded-pictures-strip"
              className="p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/15 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#D06C4E]" />
                  <span className="text-[10px] font-extrabold text-[#2C2724]">
                    Loaded Pictures ({allLoadedPictures.length} Photos Analyzed by AI)
                  </span>
                </div>
                <label
                  data-testid="upload-listing-pictures-btn"
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#F2EFE9] text-[#2C2724] border border-[#2C2724]/30 text-[10px] font-bold cursor-pointer transition-colors"
                >
                  + Load Pictures
                  <input
                    data-testid="upload-listing-pictures-input"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleUploadPictures}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {allLoadedPictures.map((pic, idx) => (
                  <div
                    key={pic.id || idx}
                    className="relative w-14 h-14 rounded-lg overflow-hidden border border-[#2C2724]/20 shrink-0 bg-white"
                    title={pic.label}
                  >
                    <img
                      src={pic.url}
                      alt={pic.label}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-0 inset-x-0 bg-black/65 text-white text-[8px] font-bold px-1 py-0.5 truncate">
                      {pic.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* TITLE & DESCRIPTION SECTION (Manual Option Toggle vs AI Auto-Fill from Location & Loaded Pictures) */}
          <div
            data-testid="title-description-section"
            className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-extrabold text-xs text-[#2C2724] flex items-center gap-1.5">
                  {isManualCopyEnabled ? (
                    <PenTool className="w-3.5 h-3.5 text-[#D06C4E] shrink-0" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-[#485B4A] shrink-0" />
                  )}
                  <span>Title &amp; Description</span>
                </h4>
                <p className="text-[10px] text-[#6E655F]">
                  {isManualCopyEnabled
                    ? 'Manual Option ON — Type your custom listing title and description below'
                    : `Manual Option OFF — AI auto-fills from location (${neighborhood}, ${city}) & ${allLoadedPictures.length} loaded pictures`}
                </p>
              </div>

              {/* Manual Option Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={isManualCopyEnabled}
                data-testid="manual-title-description-toggle"
                onClick={() => {
                  const nextManual = !isManualCopyEnabled;
                  if (nextManual) {
                    // Seed manual fields with current values when turning manual mode on
                    setManualTitle(activeAiCopy.title);
                    setManualDescription(activeAiCopy.description);
                  }
                  setIsManualCopyEnabled(nextManual);
                }}
                className={`px-3 py-1.5 rounded-xl border text-[10px] font-extrabold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                  isManualCopyEnabled
                    ? 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724]'
                    : 'bg-[#EBF0EC] text-[#485B4A] border-[#7A907C]/50 hover:bg-[#dfe8e1]'
                }`}
              >
                <span>Manual Option: {isManualCopyEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {isManualCopyEnabled ? (
              /* MANUAL OPTION TURNED ON: User can input title and description */
              <div
                data-testid="manual-title-description-fields"
                className="space-y-2.5 animate-fadeIn"
              >
                <div>
                  <label className="text-[11px] font-bold text-[#2C2724] block mb-1">
                    Listing Title (Manual Input)
                  </label>
                  <input
                    data-testid="manual-listing-title-input"
                    type="text"
                    required
                    placeholder="e.g. Sunny Mission Loft with Chef Kitchen & Balcony"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F9F7F3] border border-[#2C2724] rounded-xl text-[#2C2724] font-semibold text-xs focus:outline-none focus:border-[#D06C4E]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#2C2724] block mb-1">
                    Listing Description (Manual Input)
                  </label>
                  <textarea
                    data-testid="manual-listing-description-input"
                    rows={3}
                    required
                    placeholder="Describe your flat, natural light, and ideal housemate vibe..."
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    className="w-full p-2.5 bg-[#F9F7F3] border border-[#2C2724] rounded-xl text-[#2C2724] placeholder-[#6E655F] text-xs focus:outline-none focus:border-[#D06C4E]"
                  />
                </div>
              </div>
            ) : (
              /* MANUAL OPTION TURNED OFF: AI leverages location + loaded pictures to auto-fill */
              <div
                data-testid="ai-autofill-title-description-fields"
                className="space-y-2.5 animate-fadeIn"
              >
                <div className="p-2.5 rounded-xl bg-[#EBF0EC] border border-[#7A907C]/40 flex items-center justify-between gap-2">
                  <div className="text-[10px] text-[#2C2724] min-w-0">
                    <span className="font-extrabold text-[#485B4A] block">
                      ✓ AI Auto-Fill Active (Location + Loaded Pictures)
                    </span>
                    <span className="text-[#6E655F] block truncate">
                      {activeAiCopy.locationContext} • {activeAiCopy.analyzedPicturesSummary}
                    </span>
                  </div>
                  <button
                    type="button"
                    data-testid="regenerate-ai-copy-btn"
                    onClick={handleTriggerGeminiAutoFill}
                    disabled={isGeneratingAiCopy}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#F2EFE9] text-[#2C2724] border border-[#2C2724]/30 text-[10px] font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${isGeneratingAiCopy ? 'animate-spin' : ''}`}
                    />
                    <span>{isGeneratingAiCopy ? 'Analyzing...' : 'AI Refresh'}</span>
                  </button>
                </div>

                <div
                  data-testid="ai-autofilled-title"
                  className="p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/20"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-extrabold text-[#6E655F]">
                      Listing Title (AI Auto-Filled)
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#EBF0EC] text-[#485B4A]">
                      AI Generated
                    </span>
                  </div>
                  <div className="text-xs font-extrabold text-[#2C2724]">
                    {activeAiCopy.title}
                  </div>
                </div>

                <div
                  data-testid="ai-autofilled-description"
                  className="p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/20"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-extrabold text-[#6E655F]">
                      Listing Description (AI Auto-Filled)
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#EBF0EC] text-[#485B4A]">
                      Location + {allLoadedPictures.length} Pictures
                    </span>
                  </div>
                  <p className="text-xs text-[#2C2724] leading-relaxed">
                    {activeAiCopy.description}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: GUIDED 5-SHOT VIDEO CAPTURE */}
          <GuidedShotCapture
            recordedMedia={recordedViralMedia}
            onUpdateRecordedMedia={setRecordedViralMedia}
            openCameraForSlot={retakeSlot}
            onCameraRequestHandled={clearRetakeSlot}
          />

          {/* STEP 3: REMOTION VIRAL EDITOR (loaded only once there is a shot to edit) */}
          {Object.keys(recordedViralMedia).length > 0 ? (
            <Suspense
              fallback={
                <div
                  data-testid="viral-editor-loading"
                  className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm flex items-center gap-2 text-[11px] font-bold text-[#6E655F]"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#D06C4E]" />
                  Loading editor…
                </div>
              }
            >
              <ViralVideoEditor
                listing={viralListing}
                recordedMedia={recordedViralMedia}
                onRetakeShot={setRetakeSlot}
                onVideoReady={setViralVideo}
              />
            </Suspense>
          ) : (
            <div
              data-testid="viral-video-editor-empty"
              className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm flex items-center gap-2"
            >
              <div className="w-6 h-6 rounded-lg bg-[#D06C4E]/15 text-[#D06C4E] flex items-center justify-center font-extrabold text-xs shrink-0">
                3
              </div>
              <p className="text-[11px] text-[#6E655F]">
                Record or choose a shot above and we’ll cut your shots into a vertical video.
              </p>
            </div>
          )}

          {/* Publish Action */}
          <div className="p-3.5 rounded-2xl bg-white border border-[#2C2724]/15 shadow-warm-sm">
            <button
              type="submit"
              data-testid="publish-listing-btn"
              disabled={!hasEnoughShots}
              className="w-full py-3 bg-[#D06C4E] hover:bg-[#b85b3f] text-white font-extrabold text-xs rounded-xl shadow-warm-sm transition-all flex items-center justify-center gap-2 active:scale-95 disabled:bg-[#2C2724]/15 disabled:text-[#6E655F] disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100"
            >
              <Upload className="w-4 h-4" />
              <span>Publish Listing to Feed</span>
            </button>
            {hasEnoughShots && viralVideo && (
              <p
                data-testid="publish-with-viral-video-note"
                className="text-[10px] text-center font-bold text-[#485B4A] mt-1.5"
              >
                Publishing with your edited video.
              </p>
            )}
            {!hasEnoughShots && (
              <p className="text-[10px] text-center text-[#6E655F] mt-1.5">
                Capture at least {MIN_SHOTS_TO_PROCEED} guided shots in Step 2 to publish.
              </p>
            )}
            {/* Back within thumb reach at the end of the form */}
            <button
              type="button"
              data-testid="create-listing-bottom-back"
              onClick={onClose}
              className="w-full mt-2 py-2.5 bg-white hover:bg-[#F2EFE9] text-[#2C2724] border border-[#2C2724]/30 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

