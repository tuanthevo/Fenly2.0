import React, { useRef, useState, useEffect, useMemo, Suspense } from 'react';
import { Play, Pause, Heart } from 'lucide-react';
import { RoomListing } from '../types';
import { photoTourPlanForRoom } from '../utils/photoTourListing';
import { useFlag } from '../config/FlagsProvider';
import { chapterJump, roomStarts } from '../find/videoChapters';

// The photo tour pulls in Remotion: load it only when a card is on screen
const PhotoTourPlayer = React.lazy(() => import('./PhotoTourPlayer'));

/** Loads each photo once; resolves to the set of URLs that loaded (null while loading or when off). */
const photoLoadCache = new Map<string, Promise<boolean>>();
function loadPhoto(url: string): Promise<boolean> {
  let pending = photoLoadCache.get(url);
  if (!pending) {
    pending = new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
    photoLoadCache.set(url, pending);
  }
  return pending;
}
function useLoadedPhotos(urls: string[] | null): Set<string> | null {
  const key = urls ? urls.join('|') : '';
  const [loaded, setLoaded] = useState<{ key: string; set: Set<string> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const list = key.split('|');
    Promise.all(list.map(loadPhoto)).then((ok) => {
      if (!cancelled) setLoaded({ key, set: new Set(list.filter((_, i) => ok[i])) });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return loaded && loaded.key === key ? loaded.set : null;
}

/** If the photo tour can't load or play, the card falls back to the photo slideshow. */
class PhotoTourBoundary extends React.Component<{ onError: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface VideoPlayerProps {
  room: RoomListing;
  isActive: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onDoubleTapLike: () => void;
  onNextRoom: () => void;
  onPrevRoom: () => void;
  /** The browser refused to start the tour with sound, so it plays muted: the feed's mute state follows */
  onAutoplayMuted?: () => void;
  currentIndex?: number;
  totalRooms?: number;
}

interface TourScene {
  label: string;
  caption: string;
  imageUrl: string;
  motionClass?: string;
}

const ROOM_TOUR_SCENES: Record<string, TourScene[]> = {
  'room-1': [
    {
      label: 'Clip 1/4 • Front Door & Living Area',
      caption: 'Walking through the front door into our sunlit Mission flat ✨',
      imageUrl: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-2 -translate-y-1',
    },
    {
      label: 'Clip 2/4 • Living Room & Fireplace',
      caption: 'South-facing master bedroom with bay windows & walk-in closet 🌿',
      imageUrl: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-2 translate-y-1',
    },
    {
      label: 'Clip 3/4 • En-Suite Bath & Pressure',
      caption: 'Private attached bathroom with modern vanity & walk-in shower 🚿',
      imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-1 translate-y-2',
    },
    {
      label: 'Clip 4/4 • Open Kitchen',
      caption: 'Chef kitchen & private balcony for morning coffee ☕',
      imageUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-1 -translate-y-2',
    },
  ],
  'room-2': [
    {
      label: 'Clip 1/4 • Warehouse Loft Entry',
      caption: '12ft ceilings & exposed brick in Williamsburg, Brooklyn 🗽',
      imageUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 -translate-x-2 translate-y-1',
    },
    {
      label: 'Clip 2/4 • Skyline Studio Bedroom',
      caption: 'Furnished bedroom with industrial windows & warm afternoon light',
      imageUrl: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 translate-x-2 -translate-y-1',
    },
    {
      label: 'Clip 3/4 • Designer Kitchen',
      caption: 'Open concept kitchen with espresso bar & in-unit laundry',
      imageUrl: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-1 translate-y-2',
    },
    {
      label: 'Clip 4/4 • Skyline View',
      caption: 'Direct Manhattan skyline views from the shared rooftop 🌇',
      imageUrl: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-2 -translate-y-1',
    },
  ],
  'room-3': [
    {
      label: 'Clip 1/4 • South Congress Oasis',
      caption: 'Welcome to our sunny boho bungalow in Austin, TX 🎸',
      imageUrl: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-2 translate-y-1',
    },
    {
      label: 'Clip 2/4 • Cozy Bedroom',
      caption: 'Queen Casper bed with French doors straight to the garden',
      imageUrl: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-2 -translate-y-1',
    },
    {
      label: 'Clip 3/4 • En-Suite Bathroom',
      caption: 'Bright tiled bathroom with soaking tub & natural light',
      imageUrl: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-1 -translate-y-2',
    },
    {
      label: 'Clip 4/4 • Backyard Pool & Deck',
      caption: 'Resort-style backyard pool & shaded lounge patio 🏊‍♂️',
      imageUrl: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-1 translate-y-2',
    },
  ],
  'room-4': [
    {
      label: 'Photo 1/4 • Capitol Hill Townhome',
      caption: 'Modernist corner suite with floor-to-ceiling windows ☕',
      imageUrl: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-2 -translate-y-1',
    },
    {
      label: 'Photo 2/4 • Primary Suite',
      caption: 'Spacious 260 sq ft bedroom with remote work nook',
      imageUrl: 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-2 translate-y-1',
    },
    {
      label: 'Photo 3/4 • Walk-In Shower',
      caption: 'En-suite bathroom with heated floors & rain shower',
      imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-1 translate-y-2',
    },
    {
      label: 'Photo 4/4 • Sunny Living Room',
      caption: '3 mins walk to Capitol Hill Light Rail & local cafes 🏔️',
      imageUrl: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-1 -translate-y-2',
    },
  ],
  'room-5': [
    {
      label: 'Clip 1/4 • Logan Square Greystone',
      caption: 'Original hardwood floors & restored pocket doors in Chicago 🥖',
      imageUrl: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 -translate-x-2 translate-y-1',
    },
    {
      label: 'Clip 2/4 • Sunlit Private Bedroom',
      caption: 'Cozy furnished room with tall windows & plant shelf',
      imageUrl: 'https://images.unsplash.com/photo-1617325247661-675ab4b64ae2?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 translate-x-2 -translate-y-1',
    },
    {
      label: 'Clip 3/4 • Chef Kitchen',
      caption: 'Fresh sourdough bread baked every weekend morning 🎨',
      imageUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-1 translate-y-2',
    },
    {
      label: 'Clip 4/4 • Bright Bathroom',
      caption: 'Vintage clawfoot tub & shared backyard garden',
      imageUrl: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-2 -translate-y-1',
    },
  ],
  'room-6': [
    {
      label: 'Photo 1/4 • Silver Lake Studio',
      caption: 'Private entrance mid-century studio with canyon views 🌅',
      imageUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-2 translate-y-1',
    },
    {
      label: 'Photo 2/4 • Living Room & Fireplace',
      caption: 'Step out onto your private cedar deck overlooking the hills',
      imageUrl: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-2 -translate-y-1',
    },
    {
      label: 'Photo 3/4 • En-Suite Designer Bath',
      caption: 'Custom ceramic tile bathroom & skylight',
      imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-1 -translate-y-2',
    },
    {
      label: 'Photo 4/4 • Bright Bedroom',
      caption: '8-minute walk to Intelligentsia Coffee & Silver Lake Reservoir 🥑',
      imageUrl: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-1 translate-y-2',
    },
  ],
};

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  room,
  isActive,
  isMuted,
  onDoubleTapLike,
  onNextRoom,
  onPrevRoom,
  onAutoplayMuted,
  currentIndex = 0,
  totalRooms = 1,
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);

  const lastTapRef = useRef<number>(0);
  const touchStartY = useRef<number | null>(null);
  const touchCurrentY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);
  const didSwipeRef = useRef<boolean>(false);
  const mouseStartY = useRef<number | null>(null);
  const mouseStartX = useRef<number | null>(null);
  const lastWheelTimeRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const scenes: TourScene[] = room.customScenes || ROOM_TOUR_SCENES[room.id] || [
    {
      label: 'Clip 1/4 • Entry & Common Space',
      caption: `Welcome inside our flat in ${room.neighborhood} ✨`,
      imageUrl: room.fallbackThumbnail,
      motionClass: 'scale-110 translate-x-2 -translate-y-1',
    },
    {
      label: 'Clip 2/4 • Private Room Walkthrough',
      caption: `${room.squareFeet} sq ft ${room.roomType} with abundant natural light`,
      imageUrl: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-2 translate-y-1',
    },
    {
      label: 'Clip 3/4 • Bathroom',
      caption: 'Sparkling clean bathroom & modern fixtures',
      imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-1 translate-y-2',
    },
    {
      label: 'Clip 4/4 • Kitchen',
      caption: `Located in ${room.location} — ready ${room.availableDate}`,
      imageUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-1 -translate-y-2',
    },
  ];

  const isViralEdit = room.tourFormat === 'viral_edit' && Boolean(room.videoUrl);
  const viralVideoRef = useRef<HTMLVideoElement | null>(null);
  // Left/right arrow keys on a computer: room to room in the card that's on screen (up/down change listing in App)
  const jumpRoomRef = useRef<(dir: 'next' | 'prev') => void>(() => {});
  useEffect(() => {
    if (!isActive || !isViralEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'ArrowRight') jumpRoomRef.current('next');
      else if (e.key === 'ArrowLeft') jumpRoomRef.current('prev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, isViralEdit]);

  // The tour video's real progress (0-100) for the bottom bar; its own story bar is drawn into the video
  const [videoProgress, setVideoProgress] = useState(0);

  /**
   * Start the tour video. Browsers can refuse to start a video with sound
   * without a tap; then it plays muted instead of sitting on a paused frame.
   * If even muted playback is refused (e.g. iPhone Low Power Mode), the card
   * shows a play button and a tap starts it.
   */
  const startPlayback = (video: HTMLVideoElement) => {
    video.muted = isMuted;
    video.play().catch((err: unknown) => {
      if ((err as { name?: string } | null)?.name !== 'NotAllowedError') return; // AbortError: a newer pause won
      if (!video.muted) {
        video.muted = true;
        onAutoplayMuted?.();
        video.play().catch(() => setIsPlaying(false));
      } else {
        setIsPlaying(false);
      }
    });
  };

  /** Left/right swipe: jump to the next room, or back to this/the previous room's start. */
  const jumpRoom = (dir: 'next' | 'prev') => {
    if (!isViralEdit) {
      // Photo slideshow: one photo per swipe
      setSceneIndex((i) => (dir === 'next' ? Math.min(scenes.length - 1, i + 1) : Math.max(0, i - 1)));
      setSceneProgress(0);
      return;
    }
    const video = viralVideoRef.current;
    if (!video) return;
    const to = chapterJump(roomStarts(room.videoChapters, video.duration), video.currentTime, dir);
    if (to == null) return;
    video.currentTime = to;
    setIsPlaying(true);
    startPlayback(video);
  };
  jumpRoomRef.current = jumpRoom;

  // Sideways swipes are read on the whole card (the room info panel and the
  // side buttons sit on top of the video and would otherwise swallow them).
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const card = containerRef.current?.parentElement;
    if (!isActive || !card) return;
    let start: { x: number; y: number } | null = null;
    const onStart = (e: TouchEvent) => {
      start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    };
    const onEnd = (e: TouchEvent) => {
      const end = e.changedTouches[0];
      if (!start || !end) return;
      const dx = start.x - end.clientX;
      const dy = start.y - end.clientY;
      start = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        didSwipeRef.current = true;
        jumpRoomRef.current(dx > 0 ? 'next' : 'prev');
      }
    };
    const onCancel = () => {
      start = null;
    };
    card.addEventListener('touchstart', onStart, { passive: true });
    card.addEventListener('touchend', onEnd, { passive: true });
    card.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      card.removeEventListener('touchstart', onStart);
      card.removeEventListener('touchend', onEnd);
      card.removeEventListener('touchcancel', onCancel);
    };
  }, [isActive]);

  // Listing photos edited into a "walking into the home" short (src/remotion/viral/photoTour.ts).
  // Photos are loaded first and any that fail are skipped, so a dead link never shows as a black frame.
  // Off unless the photo_tour flag is on (a demo feature); the slideshow below plays instead
  const photoTourOn = useFlag('photo_tour');
  const loadedPhotos = useLoadedPhotos(photoTourOn && isActive && !isViralEdit ? scenes.map((s) => s.imageUrl) : null);
  const photoTourPlan = useMemo(
    () => (isViralEdit || !loadedPhotos ? null : photoTourPlanForRoom(room, scenes.filter((s) => loadedPhotos.has(s.imageUrl)))),
    // scenes is derived from room
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room, isViralEdit, loadedPhotos]
  );
  const [photoTourFailed, setPhotoTourFailed] = useState(false);
  const showPhotoTour = Boolean(photoTourPlan) && !photoTourFailed;
  const [tourProgress, setTourProgress] = useState(0);
  const handleTourProgress = React.useCallback((fraction: number) => {
    setTourProgress(Math.round(fraction * 200) / 200);
  }, []);

  // Only the card on screen plays its exported edit
  useEffect(() => {
    const video = viralVideoRef.current;
    if (!video) return;
    if (isActive && isPlaying) {
      startPlayback(video);
    } else {
      video.pause();
    }
  }, [isActive, isPlaying, isViralEdit]);

  useEffect(() => {
    setSceneIndex(0);
    setSceneProgress(0);
    setVideoProgress(0);
    setIsPlaying(true);
  }, [room.id]);

  useEffect(() => {
    if (!isActive || !isPlaying || showPhotoTour) return;

    const SCENE_DURATION_MS = 3800;
    const TICK_MS = 40;
    const step = (TICK_MS / SCENE_DURATION_MS) * 100;

    const timer = setInterval(() => {
      setSceneProgress((prev) => {
        if (prev + step >= 100) {
          setSceneIndex((idx) => (idx + 1) % scenes.length);
          return 0;
        }
        return prev + step;
      });
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [isActive, isPlaying, scenes.length, showPhotoTour]);

  useEffect(() => {
    if (!isActive || !isPlaying || isMuted || showPhotoTour) {
      if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
        audioCtxRef.current.suspend().catch(() => {});
      }
      return;
    }

    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioContextClass();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const notes = [261.63, 329.63, 392.0, 493.88];
      const noteFreq = notes[sceneIndex % notes.length];

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(noteFreq, ctx.currentTime);

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.025, ctx.currentTime + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.4);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 3.5);
    } catch {}
  }, [sceneIndex, isActive, isPlaying, isMuted, showPhotoTour]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 500) return;

    if (e.deltaY > 35) {
      lastWheelTimeRef.current = now;
      onNextRoom();
    } else if (e.deltaY < -35) {
      lastWheelTimeRef.current = now;
      onPrevRoom();
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    mouseStartY.current = e.clientY;
    mouseStartX.current = e.clientX;
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mouseStartY.current !== null) {
      const deltaY = mouseStartY.current - e.clientY;
      const deltaX = (mouseStartX.current ?? e.clientX) - e.clientX;
      mouseStartY.current = null;
      mouseStartX.current = null;
      // Sideways drag: room to room inside the tour (left = next room)
      if (Math.abs(deltaX) > 65 && Math.abs(deltaX) > Math.abs(deltaY)) {
        didSwipeRef.current = true;
        jumpRoom(deltaX > 0 ? 'next' : 'prev');
        return;
      }
      if (Math.abs(deltaY) > 65) {
        if (deltaY > 0) onNextRoom();
        else onPrevRoom();
        return;
      }
    }
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (didSwipeRef.current) {
      didSwipeRef.current = false;
      return;
    }

    const now = Date.now();
    const timeDiff = now - lastTapRef.current;

    if (timeDiff < 300) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const newHeart = { id: Date.now(), x, y };
      setHearts((prev) => [...prev, newHeart]);
      setTimeout(() => {
        setHearts((prev) => prev.filter((h) => h.id !== newHeart.id));
      }, 900);

      onDoubleTapLike();
      lastTapRef.current = 0;
      return;
    }

    lastTapRef.current = now;
    const video = viralVideoRef.current;
    if (isViralEdit && video) {
      // Follow what the video is really doing, and start it inside the tap so the browser allows it
      if (video.paused) {
        setIsPlaying(true);
        startPlayback(video);
      } else {
        setIsPlaying(false);
      }
    } else {
      setIsPlaying((prev) => !prev);
    }
    setShowPlayIcon(true);
    setTimeout(() => setShowPlayIcon(false), 600);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      touchStartY.current = e.touches[0].clientY;
      touchCurrentY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
      touchCurrentX.current = e.touches[0].clientX;
      didSwipeRef.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const startY = touchStartY.current;
    if (e.touches.length > 0 && startY !== null) {
      const currentY = e.touches[0].clientY;
      touchCurrentY.current = currentY;
      touchCurrentX.current = e.touches[0].clientX;
      if (Math.abs(startY - currentY) > 15 || Math.abs((touchStartX.current ?? 0) - e.touches[0].clientX) > 15) {
        didSwipeRef.current = true;
      }
    }
  };

  /** Up/down: next/previous listing. Left/right: next/previous room inside this listing's tour. */
  const finishTouchSwipe = (endY?: number, endX?: number) => {
    const startY = touchStartY.current;
    if (startY === null) return;
    const finalY = endY ?? touchCurrentY.current ?? startY;
    const deltaY = startY - finalY;
    const startX = touchStartX.current ?? 0;
    const deltaX = startX - (endX ?? touchCurrentX.current ?? startX);
    touchStartY.current = null;
    touchCurrentY.current = null;
    touchStartX.current = null;
    touchCurrentX.current = null;

    // Sideways swipes are handled on the whole card (effect above)
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
      didSwipeRef.current = true;
    } else if (deltaY > 35) {
      didSwipeRef.current = true;
      onNextRoom();
    } else if (deltaY < -35) {
      didSwipeRef.current = true;
      onPrevRoom();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    finishTouchSwipe(e.changedTouches?.[0]?.clientY, e.changedTouches?.[0]?.clientX);
  };

  const handleTouchCancel = () => {
    finishTouchSwipe();
  };

  const currentScene = scenes[sceneIndex] || scenes[0];
  const overallProgress = isViralEdit
    ? videoProgress
    : showPhotoTour
    ? tourProgress * 100
    : ((sceneIndex * 100 + sceneProgress) / (scenes.length * 100)) * 100;

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden select-none touch-pan-y cursor-pointer"
    >
      {/* Exported viral edit (one MP4) replaces the image slideshow */}
      {isViralEdit && (
        <video disablePictureInPicture
          ref={viralVideoRef}
          src={room.videoUrl}
          // No autoPlay attribute: only the card on screen plays (effect above); its neighbours just buffer
          preload="auto"
          loop
          playsInline
          muted={isMuted}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            setVideoProgress(v.duration > 0 ? (v.currentTime / v.duration) * 100 : 0);
          }}
          className="absolute inset-0 w-full h-full object-cover z-10"
        />
      )}

      {/* Photo tour: the listing photos as a walk-through video (the slideshow below stays as poster and fallback) */}
      {showPhotoTour && isActive && photoTourPlan && (
        <div className="absolute inset-0 z-[15] bg-black">
          <div
            className="absolute inset-0 scale-110 blur-2xl brightness-50"
            style={{ backgroundImage: `url(${scenes[0]?.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
          <PhotoTourBoundary onError={() => setPhotoTourFailed(true)}>
            <Suspense fallback={null}>
              <PhotoTourPlayer
                plan={photoTourPlan}
                playing={isPlaying}
                muted={isMuted}
                onProgress={handleTourProgress}
              />
            </Suspense>
          </PhotoTourBoundary>
        </div>
      )}

      {/* Multi-Scene Kinematic Video Frames */}
      {!isViralEdit && scenes.map((scene, idx) => {
        const isCurrent = idx === sceneIndex;
        const motion = scene.motionClass || 'scale-110 translate-x-2 -translate-y-1';
        return (
          <div
            key={idx}
            className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
              isCurrent ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
            }`}
          >
            <img
              src={scene.imageUrl}
              alt={scene.label}
              className={`w-full h-full object-cover transition-transform duration-[4000ms] ease-linear ${
                isCurrent && isPlaying ? motion : 'scale-100 translate-x-0 translate-y-0'
              }`}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/65" />
          </div>
        );
      })}

      {/* Segmented Short-Form Story/Reels Progress Bars at Top Edge (the photo slideshow only: a tour video
          and the photo tour draw their own bar, so a second, timer-driven one here would be wrong) */}
      <div className={`absolute top-1 left-3 right-3 z-25 flex items-center gap-1.5 pointer-events-none ${isViralEdit || (showPhotoTour && isActive) ? 'hidden' : ''}`}>
        {scenes.map((_, idx) => {
          const widthPct =
            idx < sceneIndex ? 100 : idx === sceneIndex ? sceneProgress : 0;
          return (
            <div
              key={idx}
              className="flex-1 h-1 rounded-full bg-white/30 overflow-hidden backdrop-blur-sm"
            >
              <div
                className="h-full bg-[#F9F7F3] transition-all duration-75"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Paused tour video (by a tap, or the browser refused to start it): a play button until it plays */}
      {isViralEdit && isActive && !isPlaying && !showPlayIcon && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30" data-testid="video-paused">
          <div className="w-16 h-16 rounded-2xl bg-[#2C2724]/75 backdrop-blur-md text-[#F9F7F3] flex items-center justify-center shadow-warm border border-[#F9F7F3]/20">
            <Play className="w-8 h-8 fill-[#F9F7F3] ml-1" />
          </div>
        </div>
      )}

      {/* Center Play / Pause Indicator */}
      {showPlayIcon && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="w-16 h-16 rounded-2xl bg-[#2C2724]/75 backdrop-blur-md text-[#F9F7F3] flex items-center justify-center shadow-warm border border-[#F9F7F3]/20">
            {isPlaying ? (
              <Pause className="w-8 h-8 fill-[#F9F7F3]" />
            ) : (
              <Play className="w-8 h-8 fill-[#F9F7F3] ml-1" />
            )}
          </div>
        </div>
      )}

      {/* Floating Hearts on Double Tap */}
      {hearts.map((heart) => (
        <div
          key={heart.id}
          className="absolute pointer-events-none z-40 animate-heart-float"
          style={{ left: heart.x - 28, top: heart.y - 28 }}
        >
          <Heart className="w-14 h-14 text-[#D06C4E] fill-[#D06C4E] drop-shadow-lg" />
        </div>
      ))}

      {/* Bottom Overall Video Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#F9F7F3]/20 z-30">
        <div
          className="h-full bg-[#D06C4E] transition-all duration-75"
          style={{ width: `${overallProgress}%` }}
        />
      </div>
    </div>
  );
};
