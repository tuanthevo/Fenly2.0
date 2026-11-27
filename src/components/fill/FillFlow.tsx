/**
 * Fill my room (Fenly 2.0): move-out date + rent → lease check → Quick Tour →
 * details + AI copy → video → publish → share kit. Each step saves to Supabase,
 * so the host can leave and pick up where they stopped.
 */
import { announceInstallMoment } from '../../pwa/installPrompt';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Home,
  Key,
  Loader2,
  MapPin,
  Sparkles,
  UploadCloud,
  HelpCircle,
} from 'lucide-react';
import { GuidedShotCapture } from '../GuidedShotCapture';
import type { RecordedViralSlotMedia } from '../GuidedViralTourStudio';
import type { ViralVideoResult } from '../ViralVideoEditor';
import type { ViralListingInfo } from '../../remotion/viral/types';
import { canProceedWithShots, GUIDED_SHOTS } from '../../utils/guidedShots';
import { fairHousingIssues } from '../../remotion/viral/copy';
import {
  ApiError,
  fillApi,
  grabVideoFrame,
  saveMediaRows,
  storageVideoType,
  uploadToStorage,
  type LinkRow,
  type ListingRow,
  type MediaRow,
} from '../../lib/fillApi';
import {
  PROBLEM_STEP,
  depositCheck,
  rawClipPath,
  resumeStep,
  slotFromRawPath,
  type FairHousingIssue,
  type FillStep,
} from '../../fill/listingRules';
import { FILL_AMENITIES, leaseTermOptions } from '../../fill/neighborhoods';
import { BAY_AREA_CITIES, BAY_AREA_REGIONS, areaLabel, bayAreaCity, nearestArea, serviceCity } from '../../geo/bayArea';
import { nearestNorcalCity } from '../../geo/norcal';
import { lookupBayAreaPlace } from '../../lib/geocode';
import { chaptersFromPlan } from '../../find/videoChapters';
import { formatMoveIn, formatRentCents } from '../../fill/publicListing';
import { todayIn } from '../../fill/fillStatus';
import type { SharePosts } from '../../fill/sharePosts';
import { trackEvent } from '../../lib/analytics';
import { ShareKit } from './ShareKit';

const ViralVideoEditor = React.lazy(() => import('../ViralVideoEditor').then((m) => ({ default: m.ViralVideoEditor })));

const STEPS: { id: FillStep; label: string }[] = [
  { id: 'start', label: 'Basics' },
  { id: 'lease', label: 'Lease' },
  { id: 'tour', label: 'Tour' },
  { id: 'details', label: 'Describe' },
  { id: 'video', label: 'Video' },
  { id: 'publish', label: 'Publish' },
];

/** Editing a live listing: what renters see, without the lease check, the tour or publishing again */
const EDIT_STEPS: { id: FillStep; label: string }[] = [
  { id: 'start', label: 'Basics' },
  { id: 'details', label: 'Describe' },
  { id: 'video', label: 'Video' },
];

const card = 'p-4 rounded-2xl bg-white border border-[#2C2724]/10';
const input =
  'w-full bg-white border border-[#2C2724]/15 rounded-xl px-3 py-2.5 text-sm text-[#2C2724] focus:outline-none focus:border-[#A9513A]';
const primaryBtn =
  'w-full py-3 rounded-xl bg-[#B85B3F] hover:bg-[#A9513A] disabled:opacity-50 text-white text-sm font-extrabold flex items-center justify-center gap-2 active:scale-95 transition-all';
const secondaryBtn =
  'w-full min-h-10 py-2.5 rounded-xl bg-white hover:bg-[#F2EFE9] border border-[#2C2724]/15 text-[#2C2724] text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-95 transition-all';
const label = 'text-[11px] font-bold text-[#6E655F] block mb-1';

const OUTSIDE_AREA =
  'Fenn is in Northern California for now. Type a Northern California city or ZIP code.';

const LANDLORD_MESSAGE =
  "Hi, I'm planning to move out on [date]. Would you be OK with me finding a replacement roommate for my room? I'll share applicants with you before anyone signs. Thanks!";

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.errors.join(' ') || error.message;
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

interface FillFlowProps {
  /** Resume this draft; null starts a new one */
  listingId: string | null;
  onClose: () => void;
  /** After publishing, show the listing's status page */
  onOpenStatus: (listingId: string) => void;
  /** The draft now exists (lets the app put its id in the history, so a reload resumes it) */
  onDraftCreated?: (listingId: string) => void;
  /**
   * 'edit' changes a listing that's already live: the basics, the text and (optionally) the video.
   * Each step saves on Continue; the lease check, the tour and publishing are skipped.
   */
  mode?: 'create' | 'edit';
  /** Edit mode: open at the video editor instead of the basics ("Edit video" on the status page) */
  startAt?: 'video';
}

export const FillFlow: React.FC<FillFlowProps> = ({ listingId: requestedId, onClose, onOpenStatus, onDraftCreated, mode = 'create', startAt }) => {
  const editing = mode === 'edit' && Boolean(requestedId);
  const steps = editing ? EDIT_STEPS : STEPS;
  // Only the id this flow opened with is loaded; later id changes come from this flow itself
  const listingId = useRef(requestedId).current;
  const today = useMemo(() => todayIn(new Date()), []);
  const [step, setStep] = useState<FillStep>('start');
  const [loading, setLoading] = useState(Boolean(listingId));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listing, setListing] = useState<ListingRow | null>(null);

  // Step 1: the basics (date, money, the room's facts). The video puts these on screen, so they come first.
  /** The date the room should be filled (stored as move_out_date; the room is available that day) */
  const [moveOut, setMoveOut] = useState('');
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');
  // Step 3
  const [media, setMedia] = useState<Record<number, RecordedViralSlotMedia>>({});
  const uploadedClips = useRef(new Map<number, string>()); // slot -> videoUrl already in Storage
  const [retakeSlot, setRetakeSlot] = useState<number | null>(null);
  const clearRetake = useCallback(() => setRetakeSlot(null), []);
  const [city, setCity] = useState('');
  /** One of the city's listed neighborhoods (SF, Oakland, Berkeley, San Jose), or '' */
  const [neighborhood, setNeighborhood] = useState('');
  const [beds, setBeds] = useState(1);
  const [baths, setBaths] = useState(1);
  const [squareFeet, setSquareFeet] = useState('');
  const [areaQuery, setAreaQuery] = useState(''); // address or ZIP: only used to pick the area, never saved
  const [areaNote, setAreaNote] = useState<string | null>(null);
  const [areaBusy, setAreaBusy] = useState(false);
  const [leaseTerm, setLeaseTerm] = useState('6 months');
  const [amenities, setAmenities] = useState<string[]>([]);
  // Step 4: describe (AI writes it from the clips)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [approved, setApproved] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const aiTried = useRef(false);
  const [issues, setIssues] = useState<FairHousingIssue[]>([]);
  // Step 5
  const [mediaKinds, setMediaKinds] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  // Publish / share
  const [problems, setProblems] = useState<{ step: FillStep; text: string }[]>([]);
  const [published, setPublished] = useState<{ links: LinkRow[]; posts: SharePosts } | null>(null);

  // Blob URLs this flow created are freed when it closes
  const ownUrls = useRef(new Set<string>());
  useEffect(
    () => () => {
      ownUrls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    []
  );

  const applyListing = (row: ListingRow) => {
    setListing(row);
    setMoveOut(row.move_out_date ?? '');
    setRent(row.rent_cents ? String(Math.round(row.rent_cents / 100)) : '');
    setDeposit(row.deposit_cents == null ? '' : String(Math.round(row.deposit_cents / 100)));
    // A saved city outside Northern California (or none yet) leaves the picker empty
    const savedCity = serviceCity(row.city);
    setCity(savedCity?.name ?? '');
    setNeighborhood(savedCity && row.neighborhood ? row.neighborhood : '');
    setBeds(row.beds ?? 1);
    setBaths(row.baths == null ? 1 : Number(row.baths));
    setSquareFeet(row.square_feet ? String(row.square_feet) : '');
    setLeaseTerm(row.lease_term || '6 months');
    setAmenities(row.amenities ?? []);
    setTitle(row.title ?? '');
    setDescription(row.description ?? '');
    setApproved(Boolean(row.copy_approved_at));
  };

  // Saved raw clips (resume / edit), downloaded only when a step needs them: they are tens of MB,
  // and the basics and the text don't use them (it used to block the whole screen for ~20 s)
  const savedClips = useRef<MediaRow[]>([]);
  const [clipsState, setClipsState] = useState<{ status: 'idle' | 'loading' | 'done'; loaded: number; total: number }>({
    status: 'idle',
    loaded: 0,
    total: 0,
  });
  const clipsPromise = useRef<Promise<void> | null>(null);

  /** Downloads the saved clips in parallel, back into the capture cards (once). */
  const restoreClips = useCallback((): Promise<void> => {
    if (clipsPromise.current) return clipsPromise.current;
    const rows = savedClips.current.filter((m) => m.kind === 'raw_clip' && m.signedUrl && slotFromRawPath(m.path));
    if (rows.length === 0) {
      setClipsState({ status: 'done', loaded: 0, total: 0 });
      return (clipsPromise.current = Promise.resolve());
    }
    setClipsState({ status: 'loading', loaded: 0, total: rows.length });
    clipsPromise.current = Promise.all(
      rows.map(async (m) => {
        const slot = slotFromRawPath(m.path)!;
        try {
          const blob = await fetch(m.signedUrl!).then((r) => (r.ok ? r.blob() : Promise.reject(new Error())));
          const url = URL.createObjectURL(blob);
          ownUrls.current.add(url);
          const frame = await grabVideoFrame(blob, 0.6, 320).catch(() => null);
          const clip: RecordedViralSlotMedia = {
            slotNumber: slot,
            videoUrl: url,
            thumbnailUrl: frame?.dataUrl ?? '', // never a stock photo: the card shows the clip itself
            source: 'uploaded',
            durationSec: Math.round(((m.duration_ms ?? (frame?.durationSec ?? 5) * 1000) / 1000) * 10) / 10,
            isLandscape: Boolean(m.width && m.height && m.width > m.height),
            inlineDataBase64: frame?.dataUrl.split(',')[1],
            mimeType: 'image/jpeg',
          };
          uploadedClips.current.set(slot, url);
          // Keep anything filmed meanwhile: a restored clip never replaces a newer take
          setMedia((prev) => (prev[slot] ? prev : { ...prev, [slot]: clip }));
        } catch {
          // a clip that can't be restored is simply recorded again
        } finally {
          setClipsState((c) => ({ ...c, loaded: c.loaded + 1 }));
        }
      })
    ).then(() => setClipsState((c) => ({ ...c, status: 'done' })));
    return clipsPromise.current;
  }, []);

  // Resume a draft or edit a listing: the fields and the right step first, the clips only when needed
  useEffect(() => {
    if (!listingId) return;
    let alive = true;
    (async () => {
      try {
        const data = await fillApi.get(listingId);
        if (!alive) return;
        applyListing(data.listing);
        setMediaKinds(data.media.map((m) => m.kind));
        savedClips.current = data.media;
        const thumb = data.media.find((m) => m.kind === 'thumbnail')?.signedUrl;
        if (thumb) setCover(thumb);
        if (editing) setStep(startAt === 'video' ? 'video' : 'start');
        else {
          const rawClips = data.media.filter((m) => m.kind === 'raw_clip' && m.signedUrl && slotFromRawPath(m.path)).length;
          const next = resumeStep(data.listing, data.media.map((m) => m.kind), rawClips);
          if (next === 'share') onOpenStatus(listingId);
          else setStep(next);
        }
      } catch (e) {
        if (alive) setError(messageOf(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  // Steps that use the clips fetch them: the tour (capture cards), the video, and a new listing's
  // text (the AI writer looks at a frame from each room). Editing the text keeps working without them.
  useEffect(() => {
    if (!listingId || loading) return;
    if (step === 'tour' || step === 'video' || (step === 'details' && !editing)) void restoreClips();
  }, [listingId, loading, step, editing, restoreClips]);
  const clipsLoading = clipsState.status === 'loading';

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (e instanceof ApiError && e.fairHousing) setIssues(e.fairHousing);
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  const rentCents = Math.round(Number(rent.replace(/[^\d.]/g, '')) * 100);
  const cityNeighborhoods = useMemo(() => (bayAreaCity(city)?.neighborhoods ?? []).map((h) => h.name), [city]);
  const depositCents = deposit === '' ? null : Math.round(Number(deposit) * 100);
  const depositRule = depositCheck(rentCents, depositCents);

  /* ---------- Step 1: the basics ---------- */
  const submitStart = () =>
    run('start', async () => {
      if (!moveOut) throw new Error('Pick the date you need the room filled.');
      if (!(rentCents >= 10000 && rentCents <= 2000000)) throw new Error('Rent must be between $100 and $20,000.');
      if (depositRule.error) throw new Error(depositRule.error);
      if (!serviceCity(city)) throw new Error('Pick the city the room is in, or type its ZIP code.');
      const sqft = squareFeet ? Number(squareFeet) : null;
      if (sqft !== null && !(sqft >= 50 && sqft <= 10000)) throw new Error('Room size must be between 50 and 10,000 sq ft, or left blank.');
      let id = listing?.id;
      if (!id) {
        const { listing: created } = await fillApi.createDraft(moveOut, rentCents);
        // Keep what the host typed: the new row's empty fields must not overwrite the form
        setListing(created);
        onDraftCreated?.(created.id);
        id = created.id;
      }
      const { listing: updated } = await fillApi.patch(id, {
        move_out_date: moveOut,
        available_from: moveOut,
        rent_cents: rentCents,
        deposit_cents: depositCents,
        neighborhood: neighborhood || null,
        city,
        beds,
        baths,
        square_feet: sqft,
        lease_term: leaseTerm,
        amenities,
      });
      applyListing(updated);
      setStep(editing ? 'details' : 'lease');
    });

  /* ---------- Step 2: lease ---------- */
  const [leaseChoice, setLeaseChoice] = useState<ListingRow['lease_permission']>(null);
  useEffect(() => setLeaseChoice(listing?.lease_permission ?? null), [listing?.lease_permission]);
  const chooseLease = (choice: NonNullable<ListingRow['lease_permission']>) =>
    run('lease', async () => {
      setLeaseChoice(choice);
      const { listing: updated } = await fillApi.patch(listing!.id, { lease_permission: choice });
      setListing(updated);
      if (choice !== 'not_sure') setStep('tour');
    });

  /* ---------- Step 3: tour ---------- */
  const enoughShots = canProceedWithShots(media);
  const submitTour = () =>
    run('tour', async () => {
      const id = listing!.id;
      const slots = Object.values(media).filter((m) => uploadedClips.current.get(m.slotNumber) !== m.videoUrl);
      trackEvent('tour_recorded', { shots: Object.keys(media).length, extras: Object.keys(media).length > 3 }, id);
      for (let i = 0; i < slots.length; i++) {
        const m = slots[i];
        const blob = await fetch(m.videoUrl).then((r) => r.blob());
        const { contentType, ext } = storageVideoType(blob);
        const path = rawClipPath(id, m.slotNumber, ext);
        await uploadToStorage('listing-videos', path, blob, contentType, (f) => setUploadProgress((i + f) / slots.length));
        await saveMediaRows([
          {
            listing_id: id,
            kind: 'raw_clip',
            bucket: 'listing-videos',
            path,
            duration_ms: Math.round(m.durationSec * 1000),
            bytes: blob.size,
          },
        ]);
        uploadedClips.current.set(m.slotNumber, m.videoUrl);
      }
      setUploadProgress(null);
      setStep('details');
    }).finally(() => setUploadProgress(null));

  /* ---------- Step 1: where the room is ---------- */
  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // A launch-area city (with its neighborhood) when close to one, else the nearest Northern California city
        const other = nearestNorcalCity(pos.coords.latitude, pos.coords.longitude);
        const found = nearestArea(pos.coords.latitude, pos.coords.longitude) ?? (other ? { city: other.name, neighborhood: null } : null);
        if (found) {
          setCity(found.city);
          setNeighborhood(found.neighborhood ?? '');
          setAreaNote(`${areaLabel(found)}, from your location. Change it below if that's not right.`);
        } else setError(OUTSIDE_AREA);
      },
      () => setError('Location is off. Pick your city from the list.'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  };

  /** Address, ZIP or city -> city and neighborhood (names and SF ZIPs locally, the rest through Google Maps). */
  const findArea = async () => {
    const text = areaQuery.trim();
    if (!text || areaBusy) return;
    setError(null);
    setAreaNote(null);
    setAreaBusy(true);
    const place = await lookupBayAreaPlace(text);
    setAreaBusy(false);
    if (place.kind === 'outside') return setAreaNote(OUTSIDE_AREA);
    if (place.kind === 'unknown') return setAreaNote("We couldn't place that. Try a 5-digit ZIP code or a city name, or pick below.");
    setCity(place.city);
    setNeighborhood(place.neighborhood ?? '');
    setAreaNote(`${areaLabel(place)}. Change it below if that's not right.`);
  };

  /* ---------- Step 4: describe ---------- */
  const writeWithAi = async () => {
    setAiBusy(true);
    setError(null);
    try {
      const pictures = Object.values(media)
        .filter((m) => m.inlineDataBase64)
        .map((m) => ({
          label: GUIDED_SHOTS[m.slotNumber - 1]?.name ?? 'Room',
          visualCue: GUIDED_SHOTS[m.slotNumber - 1]?.name,
          base64Data: m.inlineDataBase64,
          mimeType: m.mimeType ?? 'image/jpeg',
        }));
      const res = await fetch('/api/gemini/auto-fill-listing-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          neighborhood: neighborhood || city,
          city,
          roomType: 'Private Room',
          beds,
          baths,
          monthlyRent: Math.round(rentCents / 100),
          leaseTerm,
          amenities,
          loadedPictures: pictures,
        }),
      });
      const data = res.ok ? await res.json() : null;
      if (data?.title && data?.description) {
        setTitle(String(data.title).slice(0, 120));
        setDescription(String(data.description).slice(0, 4000));
        setApproved(false);
      } else {
        setError("The AI writer isn't available right now. Write a short title and description yourself.");
      }
    } catch {
      setError("The AI writer isn't available right now. Write a short title and description yourself.");
    } finally {
      setAiBusy(false);
    }
  };

  useEffect(() => {
    // The writer looks at a frame from each room: wait until the clips are here (just filmed, or
    // downloaded again for a resumed draft) so it never writes blind
    const clipsReady = Object.keys(media).length > 0 || clipsState.status === 'done';
    if (step === 'details' && !loading && !title && !description && !aiTried.current && clipsReady) {
      aiTried.current = true;
      void writeWithAi();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loading, clipsState.status]);

  const liveIssues = useMemo(
    () => [...new Set([...fairHousingIssues(title), ...fairHousingIssues(description)])],
    [title, description]
  );

  /** Saves the text. Editing a live listing ends here (back to its status) unless the host asked for a new video. */
  const submitDetails = (thenVideo = false) =>
    run('details', async () => {
      setIssues([]);
      if (!title.trim() || !description.trim()) throw new Error('Add a title and a description.');
      if (liveIssues.length > 0) throw new Error('Change the highlighted words in your text first.');
      if (!approved) throw new Error('Tick "I checked this text and it\'s accurate" first.');
      const { listing: updated } = await fillApi.patch(listing!.id, {
        title,
        description,
        copy_approved: true,
      });
      setListing(updated);
      if (editing && !thenVideo) onOpenStatus(updated.id);
      else setStep('video');
    });

  /* ---------- Step 5: video ---------- */
  const viralListing = useMemo<ViralListingInfo>(
    () => ({
      monthlyRent: Math.round(rentCents / 100) || 0,
      beds,
      baths,
      neighborhood,
      city,
      roomType: 'Private Room',
      amenities,
      leaseTerm,
    }),
    [rentCents, beds, baths, neighborhood, city, amenities, leaseTerm]
  );

  const saveVideo = (result: ViralVideoResult) =>
    run('video', async () => {
      const id = listing!.id;
      const files: { blob: Blob; bucket: 'listing-videos' | 'listing-thumbnails'; path: string; type: string; weight: number }[] = [
        { blob: result.blob, bucket: 'listing-videos', path: `${id}/full.mp4`, type: 'video/mp4', weight: result.blob.size },
      ];
      if (result.teaser) {
        files.push({ blob: result.teaser.blob, bucket: 'listing-videos', path: `${id}/teaser.mp4`, type: 'video/mp4', weight: result.teaser.blob.size });
      }
      const frame = await grabVideoFrame(result.blob, 1.5, 1280);
      files.push({ blob: frame.blob, bucket: 'listing-thumbnails', path: `${id}/thumb.jpg`, type: 'image/jpeg', weight: frame.blob.size });
      const total = files.reduce((n, f) => n + f.weight, 0);
      let done = 0;
      setUploadProgress(0);
      for (const f of files) {
        await uploadToStorage(f.bucket, f.path, f.blob, f.type, (p) => setUploadProgress((done + p * f.weight) / total));
        done += f.weight;
      }
      const seconds = (plan: ViralVideoResult['plan']) => Math.round((plan.totalFrames / plan.fps) * 1000);
      await saveMediaRows([
        { listing_id: id, kind: 'video_full', bucket: 'listing-videos', path: `${id}/full.mp4`, duration_ms: seconds(result.plan), width: result.plan.width, height: result.plan.height, bytes: result.blob.size },
        ...(result.teaser
          ? [{ listing_id: id, kind: 'video_teaser' as const, bucket: 'listing-videos', path: `${id}/teaser.mp4`, duration_ms: seconds(result.teaser.plan), width: result.teaser.plan.width, height: result.teaser.plan.height, bytes: result.teaser.blob.size }]
          : []),
        { listing_id: id, kind: 'thumbnail', bucket: 'listing-thumbnails', path: `${id}/thumb.jpg`, width: frame.width, height: frame.height, bytes: frame.blob.size },
      ]);
      // The edit behind the video (no blob URLs: clips point at their Storage paths)
      let edit: Record<string, unknown> = {
        ...result.edit,
        // Where each room starts in the video: the Find feed jumps room to room on a left/right swipe
        chapters: chaptersFromPlan(result.plan),
        clips: Object.values(media).map((m) => ({
          slotNumber: m.slotNumber,
          durationSec: m.durationSec,
          isLandscape: m.isLandscape ?? false,
          source: m.source,
        })),
      };
      if (JSON.stringify(edit).length > 150_000) edit = { ...edit, analyses: {} };
      const { listing: updated } = await fillApi.patch(id, { viral_edit: edit, caption: result.caption.slice(0, 2200) });
      setListing(updated);
      setVideoBlob(result.blob);
      setCover(frame.dataUrl);
      setMediaKinds((k) => [...new Set([...k, 'video_full', 'thumbnail', ...(result.teaser ? ['video_teaser'] : [])])]);
      if (editing) onOpenStatus(id);
      else setStep('publish');
    }).finally(() => setUploadProgress(null));

  /* ---------- Publish ---------- */
  const publish = () =>
    run('publish', async () => {
      setProblems([]);
      setIssues([]);
      try {
        const result = await fillApi.publish(listing!.id);
        setListing(result.listing);
        setPublished({ links: result.links, posts: result.posts });
        setStep('share');
        announceInstallMoment('published');
      } catch (e) {
        if (e instanceof ApiError && e.problems) {
          setProblems(e.problems.problems.map((p, i) => ({ step: PROBLEM_STEP[p], text: e.problems!.messages[i] })));
          throw new Error('A few things to finish before publishing.');
        }
        throw e;
      }
    });

  /* ---------- Layout ---------- */
  const stepIndex = steps.findIndex((s) => s.id === step);
  const goBack = () => {
    if (step === 'share' || stepIndex <= 0) return onClose();
    setError(null);
    setStep(steps[stepIndex - 1].id);
  };
  /** The header arrow does what the step's main button does, and says what's missing when it can't. */
  const goForward = () => {
    setError(null);
    if (step === 'start') return void submitStart();
    if (step === 'lease') {
      if (!leaseChoice) return setError('Pick one answer to continue.');
      return setStep('tour');
    }
    if (step === 'tour') {
      if (!enoughShots) return setError('Film all 4 areas to continue: bedroom, kitchen, living room and bathroom.');
      return void submitTour();
    }
    if (step === 'details') return void submitDetails();
    if (step === 'video' && editing) return onOpenStatus(listing!.id);
    if (step === 'video') {
      if (!mediaKinds.includes('video_full')) return setError('Make your video first, then tap "Use this video".');
      return setStep('publish');
    }
  };
  const canGoForward = step !== 'publish' && step !== 'share' && !(editing && step === 'video');

  return (
    // Lives inside the Fill tab, above the app's bottom navigation (which stays usable)
    <div className="relative flex-1 min-h-0 w-full flex flex-col font-['Plus_Jakarta_Sans','Inter',sans-serif]">
      <div className="w-full flex-1 min-h-0 bg-[#F9F7F3] text-[#2C2724] flex flex-col overflow-hidden" data-testid="fill-flow">
        {/* Header */}
        <div className="px-3.5 pt-3 pb-2 border-b border-[#2C2724]/10 space-y-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goBack}
              aria-label="Back"
              className="w-10 h-10 rounded-xl hover:bg-[#F2EFE9] text-[#2C2724] flex items-center justify-center shrink-0 active:scale-90"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="flex-1 text-base font-extrabold">{step === 'share' ? 'Share your room' : editing ? 'Edit listing' : 'Fill my room'}</h2>
            {canGoForward && (
              <button
                type="button"
                onClick={goForward}
                disabled={busy !== null}
                aria-label="Next"
                data-testid="fill-forward"
                className="w-10 h-10 rounded-xl hover:bg-[#F2EFE9] text-[#2C2724] flex items-center justify-center shrink-0 active:scale-90 disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={step === 'share' ? 'Done' : editing ? 'Close' : 'Save and exit'}
              title="Everything you've done is saved"
              className="min-h-10 px-3 rounded-xl hover:bg-[#F2EFE9] text-xs font-bold text-[#6E655F] flex items-center gap-1 shrink-0"
            >
              {step === 'share' ? 'Done' : editing ? 'Close' : 'Save & exit'}
            </button>
          </div>
          {step !== 'share' && (
            <div className="flex gap-1" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
              {steps.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-[#D06C4E]' : 'bg-[#2C2724]/10'}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3">
          {loading ? (
            <div className="flex justify-center py-16 text-[#6E655F]">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <>
              {step === 'start' && (
                <div className="space-y-3">
                  <div className={`${card} space-y-4`}>
                    <div>
                      <h3 className="text-lg font-extrabold leading-tight">Let's fill your room</h3>
                      <p className="text-xs text-[#6E655F] mt-1">The basics, then four short clips (bedroom, kitchen, living room, bathroom), 5-15 seconds each. About 10 minutes in all.</p>
                    </div>
                    <div>
                      <label className={label} htmlFor="fill-move-out">When do you need to fill the room?</label>
                      <input id="fill-move-out" type="date" min={today} className={input} value={moveOut} onChange={(e) => setMoveOut(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={label} htmlFor="fill-rent">Rent ($ per month)</label>
                        <input
                          id="fill-rent"
                          inputMode="numeric"
                          placeholder="1450"
                          className={input}
                          value={rent}
                          onChange={(e) => setRent(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
                        />
                      </div>
                      <div>
                        <label className={label} htmlFor="fill-deposit">Security deposit ($)</label>
                        <input
                          id="fill-deposit"
                          inputMode="numeric"
                          placeholder={rent || '1450'}
                          className={input}
                          value={deposit}
                          aria-describedby="fill-deposit-hint"
                          onChange={(e) => setDeposit(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
                        />
                      </div>
                    </div>
                    <p
                      id="fill-deposit-hint"
                      className={`text-[11px] -mt-2 ${depositRule.error ? 'text-[#A9513A] font-bold' : 'text-[#6E655F]'}`}
                      role={depositRule.error || depositRule.note ? 'status' : undefined}
                    >
                      {depositRule.error ?? depositRule.note ?? 'Optional. Enter 0 if there is no deposit.'}
                    </p>
                  </div>
                  <div className={`${card} space-y-3`} data-testid="fill-room-facts">
                    <div>
                      <h3 className="text-sm font-extrabold">About the room</h3>
                      <p className="text-xs text-[#6E655F] mt-0.5">These go on your video and listing. Change anything later.</p>
                    </div>
                    <div>
                      <label className={label} htmlFor="fill-area-query">Address, ZIP code or city (only used to find your area, never saved)</label>
                      <form
                        className="flex gap-2 mb-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void findArea();
                        }}
                      >
                        <input
                          id="fill-area-query"
                          className={input}
                          placeholder="94612 or 123 Main St, Oakland"
                          autoComplete="off"
                          value={areaQuery}
                          onChange={(e) => setAreaQuery(e.target.value.slice(0, 120))}
                        />
                        <button type="submit" disabled={areaBusy || !areaQuery.trim()} className="min-h-10 px-3 rounded-xl bg-white border border-[#2C2724]/15 hover:bg-[#F2EFE9] text-xs font-bold shrink-0 disabled:opacity-50">
                          {areaBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Find'}
                        </button>
                      </form>
                      {areaNote && <p className="text-[11px] text-[#6E655F] font-semibold mb-2" role="status">{areaNote}</p>}
                      <label className={label} htmlFor="fill-city">City (we show the area, never the address)</label>
                      <div className="flex gap-2">
                        <select
                          id="fill-city"
                          className={input}
                          value={city}
                          onChange={(e) => {
                            setCity(e.target.value);
                            setNeighborhood('');
                          }}
                        >
                          <option value="" disabled>
                            Pick a city
                          </option>
                          {/* A city found by ZIP or address outside the listed ones (Sacramento, Santa Cruz...) */}
                          {city && !bayAreaCity(city) && <option value={city}>{city}</option>}
                          {BAY_AREA_REGIONS.map((region) => (
                            <optgroup key={region} label={region}>
                              {BAY_AREA_CITIES.filter((c) => c.region === region).map((c) => (
                                <option key={c.name} value={c.name}>{c.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <button type="button" onClick={useMyLocation} aria-label="Use my location" className="w-11 rounded-xl bg-white border border-[#2C2724]/15 hover:bg-[#F2EFE9] flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4 text-[#D06C4E]" />
                        </button>
                      </div>
                      {cityNeighborhoods.length > 0 && (
                        <>
                          <label className={`${label} mt-2`} htmlFor="fill-neighborhood">Neighborhood</label>
                          <select id="fill-neighborhood" className={input} value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)}>
                            <option value="">Not sure / skip</option>
                            {[...new Set([...(neighborhood ? [neighborhood] : []), ...cityNeighborhoods])].map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Stepper label="Beds" value={beds} min={1} max={6} step={1} onChange={setBeds} />
                      <Stepper label="Baths" value={baths} min={0.5} max={4} step={0.5} onChange={setBaths} />
                      <div>
                        <label className={label} htmlFor="fill-square-feet">Size (sq ft)</label>
                        <input
                          id="fill-square-feet"
                          inputMode="numeric"
                          placeholder="150"
                          className={input}
                          value={squareFeet}
                          onChange={(e) => setSquareFeet(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
                        />
                      </div>
                    </div>
                    <div className="space-y-3" data-testid="fill-more-details">
                    <div>
                      <div>
                        <label className={label} htmlFor="fill-lease-term">Lease term</label>
                        <select id="fill-lease-term" className={input} value={leaseTerm} onChange={(e) => setLeaseTerm(e.target.value)}>
                          {leaseTermOptions(leaseTerm).map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <span className={label}>What's included</span>
                      <div className="flex flex-wrap gap-1.5">
                        {FILL_AMENITIES.map((a) => {
                          const on = amenities.includes(a);
                          return (
                            <button
                              key={a}
                              type="button"
                              aria-pressed={on}
                              onClick={() => setAmenities((prev) => (on ? prev.filter((x) => x !== a) : [...prev, a]))}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                                on ? 'bg-[#2C2724] text-[#F9F7F3] border-[#2C2724]' : 'bg-white text-[#2C2724] border-[#2C2724]/25 hover:bg-[#F2EFE9]'
                              }`}
                            >
                              {a}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    </div>
                  </div>
                  <button type="button" className={primaryBtn} disabled={busy !== null} onClick={() => void submitStart()} data-testid="fill-start-continue">
                    {busy === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Continue
                  </button>
                </div>
              )}

              {step === 'lease' && (
                <div className="space-y-3">
                  <div className="px-1 pt-1">
                    <h3 className="text-base font-extrabold">Can you find your own replacement?</h3>
                    <p className="text-xs text-[#6E655F] mt-1">We ask everyone. It keeps you and your housemates covered.</p>
                  </div>
                  {(
                    [
                      { id: 'can_replace', icon: Key, text: 'My lease or landlord lets me find a replacement' },
                      { id: 'leaseholder', icon: Home, text: "I'm the leaseholder renting out a room" },
                      { id: 'not_sure', icon: HelpCircle, text: 'Not sure' },
                    ] as const
                  ).map(({ id, icon: Icon, text }) => (
                    <button
                      key={id}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void chooseLease(id)}
                      data-testid={`fill-lease-${id}`}
                      className={`w-full p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all active:scale-[0.99] ${
                        leaseChoice === id ? 'bg-[#D06C4E]/10 border-[#D06C4E]' : 'bg-white border-[#2C2724]/10 hover:bg-[#F2EFE9]'
                      }`}
                    >
                      <Icon className="w-5 h-5 text-[#D06C4E] shrink-0" />
                      <span className="text-sm font-bold flex-1">{text}</span>
                      {leaseChoice === id && (busy === 'lease' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-[#7A907C]" />)}
                    </button>
                  ))}
                  {leaseChoice === 'not_sure' && (
                    <div className={`${card} space-y-2.5`} data-testid="fill-lease-guide">
                      <h4 className="text-sm font-extrabold">How to check, in 5 minutes</h4>
                      <ol className="text-xs text-[#2C2724] space-y-1.5 list-decimal pl-4 leading-relaxed">
                        <li>Open your lease and find the section called "assignment", "subletting" or "occupants".</li>
                        <li>If it needs the landlord's OK, ask in writing (text or email) so you have a record.</li>
                        <li>Once they say yes, come back and pick the first option. Your draft is saved.</li>
                      </ol>
                      <p className="text-[11px] text-[#6E655F]">Rules differ by city and lease. This is general info, not legal advice.</p>
                      <div className="p-2.5 rounded-xl bg-[#F9F7F3] border border-[#2C2724]/10 text-[11px] leading-relaxed">{LANDLORD_MESSAGE}</div>
                      <button type="button" className={secondaryBtn} onClick={() => void navigator.clipboard?.writeText(LANDLORD_MESSAGE)}>
                        <Copy className="w-3.5 h-3.5" /> Copy message for my landlord
                      </button>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button type="button" className={secondaryBtn} onClick={onClose} data-testid="fill-save-draft-exit">
                          Save draft & exit
                        </button>
                        <button type="button" className={secondaryBtn} onClick={() => setStep('tour')}>
                          Film the tour now
                        </button>
                      </div>
                      <p className="text-[10px] text-[#6E655F]">You can film and write everything now; publishing waits until this is confirmed.</p>
                    </div>
                  )}
                </div>
              )}

              {(step === 'tour' || step === 'video') && clipsLoading && (
                <div className={`${card} flex items-center gap-3`} role="status" data-testid="fill-clips-loading">
                  <Loader2 className="w-5 h-5 animate-spin text-[#A9513A] shrink-0" />
                  <div>
                    <div className="text-sm font-extrabold">Loading your clips</div>
                    <div className="text-xs text-[#6E655F]">
                      {clipsState.loaded} of {clipsState.total} ready
                    </div>
                  </div>
                </div>
              )}

              {step === 'tour' && !clipsLoading && (
                <div className="space-y-3">
                  <GuidedShotCapture
                    mode="quick"
                    allowExtras
                    stepLabel={null}
                    recordedMedia={media}
                    onUpdateRecordedMedia={setMedia}
                    openCameraForSlot={retakeSlot}
                    onCameraRequestHandled={clearRetake}
                  />
                  {uploadProgress !== null && <Progress value={uploadProgress} text="Saving your clips" />}
                  <button type="button" className={primaryBtn} disabled={!enoughShots || busy !== null} onClick={() => void submitTour()} data-testid="fill-tour-continue">
                    {busy === 'tour' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {enoughShots ? 'Continue' : 'Film all 4 areas to continue'}
                  </button>
                </div>
              )}

              {step === 'details' && (
                <div className="space-y-3">
                  <div className={`${card} space-y-3`}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-extrabold">Title and description</h3>
                      <button
                        type="button"
                        onClick={() => void writeWithAi()}
                        disabled={aiBusy}
                        className="min-h-10 px-2.5 rounded-xl hover:bg-[#F2EFE9] text-[#A9513A] text-[11px] font-bold flex items-center gap-1 disabled:opacity-60"
                      >
                        {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {title ? 'Rewrite with AI' : 'Write it for me'}
                      </button>
                    </div>
                    <input
                      aria-label="Title"
                      className={input}
                      maxLength={120}
                      placeholder={aiBusy ? 'Writing…' : 'Sunny room near Dolores Park'}
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        setApproved(false);
                      }}
                    />
                    <textarea
                      aria-label="Description"
                      className={`${input} min-h-[110px] leading-relaxed`}
                      maxLength={4000}
                      placeholder={aiBusy ? 'Writing…' : 'What the room and home are like, what is included, the area.'}
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        setApproved(false);
                      }}
                    />
                    {(liveIssues.length > 0 || issues.length > 0) && (
                      <div className="p-2.5 rounded-xl bg-[#D06C4E]/10 border border-[#D06C4E]/40 text-[11px] text-[#9A4A33] font-bold flex gap-1.5" role="alert">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                        <span>
                          Describe the room, not who should live there. Please change:{' '}
                          {[...new Set([...liveIssues, ...issues.flatMap((i) => i.phrases)])].map((p) => `"${p}"`).join(', ')}
                        </span>
                      </div>
                    )}
                    <label className="flex items-start gap-2 text-xs font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 w-4 h-4 accent-[#D06C4E]"
                        checked={approved}
                        onChange={(e) => setApproved(e.target.checked)}
                        data-testid="fill-copy-approved"
                      />
                      <span>I checked this text and it's accurate.</span>
                    </label>
                  </div>
                  <button
                    type="button"
                    className={primaryBtn}
                    disabled={busy !== null}
                    onClick={() => void submitDetails()}
                    data-testid="fill-details-continue"
                  >
                    {busy === 'details' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {editing ? 'Save changes' : 'Continue to the video'}
                  </button>
                  {editing && (
                    <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => void submitDetails(true)} data-testid="fill-edit-new-video">
                      Save and make a new video
                    </button>
                  )}
                </div>
              )}

              {step === 'video' && !clipsLoading && (
                <div className="space-y-3">
                  <Suspense
                    fallback={
                      <div className={`${card} flex items-center gap-2 text-xs text-[#6E655F]`}>
                        <Loader2 className="w-4 h-4 animate-spin" /> Opening the video editor…
                      </div>
                    }
                  >
                    <ViralVideoEditor
                      listing={viralListing}
                      recordedMedia={media}
                      onRetakeShot={(slot) => {
                        setRetakeSlot(slot);
                        setStep('tour');
                      }}
                      onVideoReady={(result) => void saveVideo(result)}
                      // No teaser: nothing plays it while the full tour exists, and it added ~13 s of
                      // rendering plus an upload. Pass exportTeaserToo to bring it back.
                    />
                  </Suspense>
                  {uploadProgress !== null && <Progress value={uploadProgress} text="Uploading your video" />}
                  {mediaKinds.includes('video_full') && busy !== 'video' && (
                    <button
                      type="button"
                      className={secondaryBtn}
                      // A live listing has nothing to publish again: back to its status page
                      onClick={() => (editing && listing ? onOpenStatus(listing.id) : setStep('publish'))}
                    >
                      Keep the video I already made
                    </button>
                  )}
                </div>
              )}

              {step === 'publish' && listing && (
                <div className="space-y-3">
                  <div className={`${card} flex gap-3`}>
                    {cover ? (
                      <img src={cover} alt="Video cover" className="w-20 h-[142px] rounded-xl object-cover border border-[#2C2724]/15 shrink-0" />
                    ) : (
                      <div className="w-20 h-[142px] rounded-xl bg-[#2C2724]/10 shrink-0" />
                    )}
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-sm font-extrabold leading-snug">{title}</h3>
                      <p className="text-xs font-extrabold text-[#A9513A]">
                        {formatRentCents(listing.rent_cents)}/mo
                        {listing.deposit_cents != null ? (
                          <span className="font-bold text-[#6E655F]">
                            {' · '}
                            {listing.deposit_cents === 0 ? 'No deposit' : `${formatRentCents(listing.deposit_cents)} deposit`}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-[#6E655F]">
                        {areaLabel({ city, neighborhood: neighborhood || null })}
                        {formatMoveIn(moveOut, today) ? ` · Move in ${formatMoveIn(moveOut, today)}` : ''}
                      </p>
                      <p className="text-[11px] text-[#6E655F]">Your link shows the area only. The exact address stays private.</p>
                    </div>
                  </div>
                  {problems.length > 0 && (
                    <div className={`${card} space-y-2`} role="alert">
                      {problems.map((p) => (
                        <button
                          key={p.text}
                          type="button"
                          onClick={() => setStep(p.step)}
                          className="w-full text-left p-2.5 rounded-xl bg-[#D06C4E]/10 border border-[#D06C4E]/30 text-xs font-bold text-[#9A4A33]"
                        >
                          {p.text}
                        </button>
                      ))}
                    </div>
                  )}
                  {issues.length > 0 && (
                    <div className={`${card} text-xs font-bold text-[#9A4A33]`} role="alert">
                      Describe the room, not who should live there. Please change:{' '}
                      {issues.flatMap((i) => i.phrases).map((p) => `"${p}"`).join(', ')}
                      <button type="button" className={`${secondaryBtn} mt-2`} onClick={() => setStep('details')}>
                        Edit the text
                      </button>
                    </div>
                  )}
                  <button type="button" className={primaryBtn} disabled={busy !== null} onClick={() => void publish()} data-testid="fill-publish">
                    {busy === 'publish' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                    Publish and get my links
                  </button>
                </div>
              )}

              {step === 'share' && listing && published && (
                <div className="space-y-3">
                  <div className={`${card} flex items-center gap-2.5 bg-[#EBF0EC] border-[#7A907C]/40`}>
                    <CheckCircle2 className="w-5 h-5 text-[#485B4A] shrink-0" />
                    <p className="text-xs font-bold text-[#485B4A]">Your room is live. Post it where people are looking.</p>
                  </div>
                  <ShareKit listingId={listing.id} links={published.links} posts={published.posts} caption={listing.caption} videoBlob={videoBlob} />
                  <button type="button" className={primaryBtn} onClick={() => onOpenStatus(listing.id)} data-testid="fill-open-status">
                    <Check className="w-4 h-4" /> See views and applicants
                  </button>
                </div>
              )}

              {error && (
                <p className="text-xs font-bold text-[#9A4A33] p-3 rounded-xl bg-[#D06C4E]/10 border border-[#D06C4E]/30" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Progress: React.FC<{ value: number; text: string }> = ({ value, text }) => (
  <div className="space-y-1" data-testid="fill-upload-progress">
    <p className="text-[11px] font-bold text-[#6E655F] flex items-center gap-1.5">
      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D06C4E]" /> {text}… {Math.round(value * 100)}%
    </p>
    <div className="h-1.5 rounded-full bg-[#2C2724]/10 overflow-hidden">
      <div className="h-full bg-[#D06C4E] transition-all" style={{ width: `${Math.max(3, Math.round(value * 100))}%` }} />
    </div>
  </div>
);

const Stepper: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }> = ({
  label: text,
  value,
  min,
  max,
  step,
  onChange,
}) => (
  <div>
    <span className={label}>{text}</span>
    <div className="flex items-center rounded-xl border border-[#2C2724]/15 bg-white overflow-hidden">
      <button type="button" aria-label={`Fewer ${text.toLowerCase()}`} className="px-2.5 py-2 font-black" onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <span className="flex-1 text-center text-sm font-extrabold tabular-nums">{value}</span>
      <button type="button" aria-label={`More ${text.toLowerCase()}`} className="px-2.5 py-2 font-black" onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  </div>
);
