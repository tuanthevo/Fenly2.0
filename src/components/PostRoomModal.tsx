import React, { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import { ArrowLeft, ChevronDown, RefreshCw } from 'lucide-react';
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

  const fieldLabel = 'text-[11px] font-bold text-[#6E655F] block mb-1';
  const field =
    'w-full min-h-10 px-3 py-2 bg-[#F9F7F3] border border-[#2C2724]/15 rounded-xl text-[#2C2724] font-semibold text-xs focus:outline-none focus:border-[#A9513A]';
  const section = 'p-4 rounded-2xl bg-white border border-[#2C2724]/10 space-y-3';

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
        <div className="px-3.5 py-3 border-b border-[#2C2724]/10 bg-[#F9F7F3] flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to Landlord"
            className="w-10 h-10 rounded-xl hover:bg-[#F2EFE9] text-[#2C2724] flex items-center justify-center shrink-0 transition-all active:scale-90"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h3 className="font-extrabold text-base text-[#2C2724] truncate">Create listing</h3>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
          {/* The room: the essentials up front, the rest under "More details" */}
          <div className={section}>
            <h4 className="font-extrabold text-sm text-[#2C2724]">The room</h4>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={fieldLabel} htmlFor="create-listing-rent">
                  Rent per month ($)
                </label>
                <input
                  id="create-listing-rent"
                  type="number"
                  required
                  min={200}
                  max={10000}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className={field}
                />
              </div>
              <div>
                <label className={fieldLabel} htmlFor="create-listing-room-type">
                  Room type
                </label>
                <select
                  id="create-listing-room-type"
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value as RoomListing['roomType'])}
                  className={field}
                >
                  <option>Private Room</option>
                  <option>Master Suite</option>
                  <option>Studio Sublet</option>
                  <option>Shared Room</option>
                  <option>Entire Place</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={fieldLabel} htmlFor="create-listing-neighborhood">
                  Neighborhood
                </label>
                <input
                  id="create-listing-neighborhood"
                  data-testid="create-listing-neighborhood-input"
                  type="text"
                  required
                  placeholder="e.g. Mission District"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className={field}
                />
              </div>
              <div>
                <label className={fieldLabel} htmlFor="create-listing-city">
                  City
                </label>
                <select
                  id="create-listing-city"
                  data-testid="create-listing-city-select"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={field}
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

            <details className="group" data-testid="create-listing-more-details">
              <summary className="min-h-10 flex items-center justify-between cursor-pointer list-none text-xs font-bold text-[#2C2724] [&::-webkit-details-marker]:hidden">
                <span>
                  More details{' '}
                  <span className="font-semibold text-[#6E655F]">
                    · {beds} bed · {baths} bath · {leaseTerm}
                    {selectedAmenities.length ? ` · ${selectedAmenities.length} amenities` : ''}
                    {allLoadedPictures.length ? ` · ${allLoadedPictures.length} photos` : ''}
                  </span>
                </span>
                <ChevronDown className="w-4 h-4 text-[#6E655F] transition-transform group-open:rotate-180" />
              </summary>

              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={fieldLabel} htmlFor="create-listing-beds">
                      Beds
                    </label>
                    <input id="create-listing-beds" type="number" min={1} max={6} value={beds} onChange={(e) => setBeds(Number(e.target.value))} className={field} />
                  </div>
                  <div>
                    <label className={fieldLabel} htmlFor="create-listing-baths">
                      Baths
                    </label>
                    <input id="create-listing-baths" type="number" min={1} max={6} value={baths} onChange={(e) => setBaths(Number(e.target.value))} className={field} />
                  </div>
                  <div>
                    <label className={fieldLabel} htmlFor="create-listing-lease">
                      Lease
                    </label>
                    <select
                      id="create-listing-lease"
                      value={leaseTerm}
                      onChange={(e) => setLeaseTerm(e.target.value as RoomListing['leaseTerm'])}
                      className={`${field} px-2`}
                    >
                      <option>Month-to-month</option>
                      <option>3 Months</option>
                      <option>6 Months</option>
                      <option>12+ Months</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={fieldLabel} htmlFor="create-listing-sqft">
                      Size (sq ft)
                    </label>
                    <input id="create-listing-sqft" type="number" value={squareFeet} onChange={(e) => setSquareFeet(Number(e.target.value))} className={field} />
                  </div>
                  <div>
                    <label className={fieldLabel} htmlFor="create-listing-deposit">
                      Deposit ($)
                    </label>
                    <input id="create-listing-deposit" type="number" value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} className={field} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className={fieldLabel}>Amenities</span>
                  <div className="flex flex-wrap gap-1.5">
                    {allAmenitiesOptions.map((amenity) => {
                      const isSelected = selectedAmenities.includes(amenity);
                      return (
                        <button
                          key={amenity}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => toggleAmenity(amenity)}
                          className={`min-h-8 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                            isSelected
                              ? 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724]'
                              : 'bg-white text-[#2C2724] border-[#2C2724]/15 hover:bg-[#F2EFE9]'
                          }`}
                        >
                          {amenity}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pictures (used by AI for the title and description) */}
                <div data-testid="loaded-pictures-strip" className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={fieldLabel}>Photos{allLoadedPictures.length ? ` (${allLoadedPictures.length})` : ''}</span>
                    <label
                      data-testid="upload-listing-pictures-btn"
                      className="min-h-10 px-2.5 inline-flex items-center rounded-lg hover:bg-[#F2EFE9] text-[#A9513A] text-[11px] font-bold cursor-pointer transition-colors"
                    >
                      Add photos
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
                  {allLoadedPictures.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {allLoadedPictures.map((pic, idx) => (
                        <img
                          key={pic.id || idx}
                          src={pic.url}
                          alt={pic.label}
                          title={pic.label}
                          className="w-14 h-14 rounded-lg object-cover shrink-0"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </details>
          </div>

          {/* Title and description: AI writes it from the details, or the host types their own */}
          <div data-testid="title-description-section" className={section}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-extrabold text-sm text-[#2C2724]">Title and description</h4>
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
                className="min-h-10 px-2.5 rounded-lg hover:bg-[#F2EFE9] text-[11px] font-bold text-[#A9513A] shrink-0"
              >
                {isManualCopyEnabled ? 'Let AI write it' : 'Write my own'}
              </button>
            </div>

            {isManualCopyEnabled ? (
              <div data-testid="manual-title-description-fields" className="space-y-2.5 animate-fadeIn">
                <div>
                  <label className={fieldLabel} htmlFor="create-listing-title">
                    Title
                  </label>
                  <input
                    id="create-listing-title"
                    data-testid="manual-listing-title-input"
                    type="text"
                    required
                    placeholder="e.g. Sunny Mission room with chef kitchen"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    className={field}
                  />
                </div>
                <div>
                  <label className={fieldLabel} htmlFor="create-listing-description">
                    Description
                  </label>
                  <textarea
                    id="create-listing-description"
                    data-testid="manual-listing-description-input"
                    rows={3}
                    required
                    placeholder="The room, the home, what's included and the area."
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    className={`${field} leading-relaxed`}
                  />
                </div>
              </div>
            ) : (
              <div data-testid="ai-autofill-title-description-fields" className="space-y-1.5 animate-fadeIn">
                <div data-testid="ai-autofilled-title" className="text-sm font-extrabold text-[#2C2724]">
                  {activeAiCopy.title}
                </div>
                <p data-testid="ai-autofilled-description" className="text-xs text-[#2C2724]/85 leading-relaxed">
                  {activeAiCopy.description}
                </p>
                <button
                  type="button"
                  data-testid="regenerate-ai-copy-btn"
                  onClick={handleTriggerGeminiAutoFill}
                  disabled={isGeneratingAiCopy}
                  className="min-h-10 -ml-2 px-2 rounded-lg hover:bg-[#F2EFE9] text-[11px] font-bold text-[#6E655F] flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingAiCopy ? 'animate-spin' : ''}`} />
                  {isGeneratingAiCopy ? 'Writing…' : 'Rewrite with AI'}
                </button>
              </div>
            )}
          </div>

          {/* Guided video shots */}
          <GuidedShotCapture
            recordedMedia={recordedViralMedia}
            onUpdateRecordedMedia={setRecordedViralMedia}
            openCameraForSlot={retakeSlot}
            onCameraRequestHandled={clearRetakeSlot}
          />

          {/* Video editor (loaded only once there is a shot to edit) */}
          {Object.keys(recordedViralMedia).length > 0 ? (
            <Suspense
              fallback={
                <div data-testid="viral-editor-loading" className="px-1 flex items-center gap-2 text-[11px] font-bold text-[#6E655F]">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
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
            <p data-testid="viral-video-editor-empty" className="px-1 text-[11px] text-[#6E655F]">
              Record a shot above and we’ll cut your shots into a vertical video.
            </p>
          )}

          {/* Publish */}
          <div className="space-y-1.5 pt-1">
            <button
              type="submit"
              data-testid="publish-listing-btn"
              disabled={!hasEnoughShots}
              className="w-full min-h-11 py-3 bg-[#B85B3F] hover:bg-[#A9513A] text-white font-extrabold text-sm rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95 disabled:bg-[#2C2724]/10 disabled:text-[#6E655F] disabled:cursor-not-allowed disabled:active:scale-100"
            >
              Publish listing
            </button>
            {hasEnoughShots && viralVideo && (
              <p data-testid="publish-with-viral-video-note" className="text-[11px] text-center text-[#485B4A]">
                Publishing with your edited video.
              </p>
            )}
            {!hasEnoughShots && (
              <p className="text-[11px] text-center text-[#6E655F]">
                Record at least {MIN_SHOTS_TO_PROCEED} shots to publish.
              </p>
            )}
            {/* Back within thumb reach at the end of the form */}
            <button
              type="button"
              data-testid="create-listing-bottom-back"
              onClick={onClose}
              className="w-full min-h-10 text-[#6E655F] hover:text-[#2C2724] font-bold text-xs rounded-xl"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
