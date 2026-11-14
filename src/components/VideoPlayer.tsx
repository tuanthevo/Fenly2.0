import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Heart } from 'lucide-react';
import { RoomListing } from '../types';

interface VideoPlayerProps {
  room: RoomListing;
  isActive: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onDoubleTapLike: () => void;
  onNextRoom: () => void;
  onPrevRoom: () => void;
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
      label: 'Clip 2/4 • Bedroom & Closet Space',
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
      label: 'Clip 4/4 • Kitchen & Private Balcony',
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
      imageUrl: 'https://images.unsplash.com/photo-1540518614846-7ede433c4573?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 translate-x-2 -translate-y-1',
    },
    {
      label: 'Clip 3/4 • Designer Kitchen & W/D',
      caption: 'Open concept kitchen with espresso bar & in-unit laundry',
      imageUrl: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-1 translate-y-2',
    },
    {
      label: 'Clip 4/4 • 360° Rooftop Deck',
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
      label: 'Clip 2/4 • Bedroom & Patio Doors',
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
      label: 'Photo 2/4 • Master Suite & Desk',
      caption: 'Spacious 260 sq ft bedroom with remote work nook',
      imageUrl: 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-2 translate-y-1',
    },
    {
      label: 'Photo 3/4 • Heated Tile Bath',
      caption: 'En-suite bathroom with heated floors & rain shower',
      imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-1 translate-y-2',
    },
    {
      label: 'Photo 4/4 • Sunset Rooftop View',
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
      imageUrl: 'https://images.unsplash.com/photo-1540518614846-7ede433c4573?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 translate-x-2 -translate-y-1',
    },
    {
      label: 'Clip 3/4 • Chef Kitchen & Bakery',
      caption: 'Fresh sourdough bread baked every weekend morning 🎨',
      imageUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-1 translate-y-2',
    },
    {
      label: 'Clip 4/4 • Clawfoot Tub & Yard',
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
      label: 'Photo 2/4 • Cedar Viewing Deck',
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
      label: 'Photo 4/4 • Walk to Erewhon & Cafes',
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
  const didSwipeRef = useRef<boolean>(false);
  const mouseStartY = useRef<number | null>(null);
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
      imageUrl: 'https://images.unsplash.com/photo-1540518614846-7ede433c4573?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-2 translate-y-1',
    },
    {
      label: 'Clip 3/4 • Bathroom & Laundry',
      caption: 'Sparkling clean bathroom & modern fixtures',
      imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-110 translate-x-1 translate-y-2',
    },
    {
      label: 'Clip 4/4 • Kitchen & View',
      caption: `Located in ${room.location} — ready ${room.availableDate}`,
      imageUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1080&q=80',
      motionClass: 'scale-115 -translate-x-1 -translate-y-2',
    },
  ];

  useEffect(() => {
    setSceneIndex(0);
    setSceneProgress(0);
    setIsPlaying(true);
  }, [room.id]);

  useEffect(() => {
    if (!isActive || !isPlaying) return;

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
  }, [isActive, isPlaying, scenes.length]);

  useEffect(() => {
    if (!isActive || !isPlaying || isMuted) {
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
  }, [sceneIndex, isActive, isPlaying, isMuted]);

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
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mouseStartY.current !== null) {
      const deltaY = mouseStartY.current - e.clientY;
      mouseStartY.current = null;
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
    setIsPlaying((prev) => !prev);
    setShowPlayIcon(true);
    setTimeout(() => setShowPlayIcon(false), 600);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      touchStartY.current = e.touches[0].clientY;
      touchCurrentY.current = e.touches[0].clientY;
      didSwipeRef.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const startY = touchStartY.current;
    if (e.touches.length > 0 && startY !== null) {
      const currentY = e.touches[0].clientY;
      touchCurrentY.current = currentY;
      if (Math.abs(startY - currentY) > 15) {
        didSwipeRef.current = true;
      }
    }
  };

  const finishTouchSwipe = (endY?: number) => {
    const startY = touchStartY.current;
    if (startY === null) return;
    const finalY = endY ?? touchCurrentY.current ?? startY;
    const deltaY = startY - finalY;
    touchStartY.current = null;
    touchCurrentY.current = null;

    if (deltaY > 35) {
      didSwipeRef.current = true;
      onNextRoom();
    } else if (deltaY < -35) {
      didSwipeRef.current = true;
      onPrevRoom();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const endY = e.changedTouches?.[0]?.clientY;
    finishTouchSwipe(endY);
  };

  const handleTouchCancel = () => {
    finishTouchSwipe();
  };

  const currentScene = scenes[sceneIndex] || scenes[0];
  const overallProgress = ((sceneIndex * 100 + sceneProgress) / (scenes.length * 100)) * 100;

  return (
    <div
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
      {/* Multi-Scene Kinematic Video Frames */}
      {scenes.map((scene, idx) => {
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

      {/* Segmented Short-Form Story/Reels Progress Bars at Top Edge */}
      <div className="absolute top-1 left-3 right-3 z-25 flex items-center gap-1.5 pointer-events-none">
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
