import React, { useState } from 'react';
import {
  Play,
  Calendar,
  MapPin,
  Trash2,
  CheckCircle2,
  Plus,
  Building2,
  MessageCircle,
  Clock,
  Video,
} from 'lucide-react';
import { RoomListing } from '../types';
import { FennMascot } from './FennMascot';
import { getRoomBedBathTag } from '../utils/trustSafety';

interface ScheduledViewing {
  id: string;
  roomId: string;
  roomTitle: string;
  neighborhood: string;
  price: number;
  thumbnail: string;
  dateLabel: string;
  timeLabel: string;
  tourType: 'In-Person Walkthrough' | 'Live Video Call';
  status: 'Confirmed' | 'Host Reviewing';
}

interface MyDenViewProps {
  savedRooms: RoomListing[];
  allRooms: RoomListing[];
  onSelectRoomAndWatch: (roomId: string) => void;
  onRemoveFromDen: (roomId: string) => void;
  onRequestToBookRoom: (room: RoomListing) => void;
  onOpenRenterLandlordHub: () => void;
  onOpenMessages: () => void;
}

export const MyDenView: React.FC<MyDenViewProps> = ({
  savedRooms,
  allRooms,
  onSelectRoomAndWatch,
  onRemoveFromDen,
  onRequestToBookRoom,
  onOpenRenterLandlordHub,
  onOpenMessages,
}) => {
  const [scheduledViewings, setScheduledViewings] = useState<ScheduledViewing[]>([
    {
      id: 'view-1',
      roomId: 'room-1',
      roomTitle: 'Sun-drenched Mission Loft Room with Private Balcony & Bath',
      neighborhood: 'Mission District, SF',
      price: 1450,
      thumbnail:
        'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=600&q=80',
      dateLabel: 'Tue, Nov 3',
      timeLabel: '5:30 PM',
      tourType: 'In-Person Walkthrough',
      status: 'Confirmed',
    },
    {
      id: 'view-2',
      roomId: 'room-2',
      roomTitle: 'Williamsburg Skyline Studio Bedroom with Exposed Brick',
      neighborhood: 'Williamsburg, Brooklyn',
      price: 1650,
      thumbnail:
        'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80',
      dateLabel: 'Thu, Nov 5',
      timeLabel: '12:15 PM',
      tourType: 'Live Video Call',
      status: 'Confirmed',
    },
  ]);

  const [justScheduledRoomId, setJustScheduledRoomId] = useState<string | null>(null);

  const handleQuickScheduleViewing = (room: RoomListing) => {
    const existing = scheduledViewings.some((v) => v.roomId === room.id);
    if (!existing) {
      setScheduledViewings((prev) => [
        {
          id: `view-${Date.now()}`,
          roomId: room.id,
          roomTitle: room.title,
          neighborhood: room.neighborhood,
          price: room.price,
          thumbnail: room.fallbackThumbnail,
          dateLabel: 'Sat, Nov 7',
          timeLabel: '2:00 PM',
          tourType: 'In-Person Walkthrough',
          status: 'Confirmed',
        },
        ...prev,
      ]);
    }
    setJustScheduledRoomId(room.id);
    setTimeout(() => setJustScheduledRoomId(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#FAF6F0] text-[#18181B] overflow-hidden">
      {/* Header Featuring Pose 4 (Saved / Success): Fenn curled inside keyhole house */}
      <header className="px-4 pt-3.5 pb-3 bg-[#18181B] text-[#FAF6F0] border-b border-[#E5A93C]/30 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <FennMascot
            size="md"
            variant={savedRooms.length > 0 ? 'pose_saved' : 'pose_empty'}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-extrabold tracking-tight text-[#FAF6F0]">
                My Den
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-[#E5A93C] text-[#18181B] text-[10px] font-extrabold">
                {savedRooms.length} Saved
              </span>
            </div>
            <p className="text-[11px] text-[#FAF6F0]/75 truncate">
              Saved video tours & scheduled viewings
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenRenterLandlordHub}
            className="px-2.5 py-1.5 rounded-xl bg-[#FAF6F0]/10 hover:bg-[#FAF6F0]/20 border border-[#FAF6F0]/20 text-[#FAF6F0] text-[10px] font-extrabold flex items-center gap-1"
            title="Open Renter & Landlord Hub"
          >
            <Building2 className="w-3.5 h-3.5 text-[#E5A93C]" />
            <span>Renter / Landlord</span>
          </button>
          <button
            type="button"
            onClick={onOpenMessages}
            aria-label="Open Direct Messages"
            className="w-8 h-8 rounded-xl bg-[#FAF6F0]/10 hover:bg-[#FAF6F0]/20 border border-[#FAF6F0]/20 text-[#FAF6F0] flex items-center justify-center"
          >
            <MessageCircle className="w-4 h-4 text-[#E5A93C]" />
          </button>
        </div>
      </header>

      {/* Scrollable Den Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {/* Section 1: Saved Video Tours Grid */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#18181B]">
              Saved Video Tours ({savedRooms.length})
            </h2>
            <span className="text-[10px] font-semibold text-[#18181B]/65">
              Tap any card to watch full walkthrough
            </span>
          </div>

          {savedRooms.length > 0 ? (
            <div
              data-testid="my-den-saved-grid"
              className="grid grid-cols-2 gap-2.5"
            >
              {savedRooms.map((room) => {
                const bedBath = getRoomBedBathTag(room);
                return (
                  <div
                    key={room.id}
                    className="group bg-white rounded-2xl border border-[#18181B]/20 overflow-hidden shadow-xs flex flex-col"
                  >
                    {/* Vertical Video Thumbnail */}
                    <div
                      onClick={() => onSelectRoomAndWatch(room.id)}
                      className="relative aspect-[4/5] bg-[#18181B] overflow-hidden cursor-pointer"
                    >
                      <img
                        src={room.fallbackThumbnail}
                        alt={room.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#18181B]/90 via-transparent to-[#18181B]/35" />

                      {/* Top Overlay: Bed/Bath & Remove */}
                      <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1">
                        <span className="px-2 py-0.5 rounded-md bg-[#18181B]/80 backdrop-blur-xs text-[#E5A93C] text-[9px] font-extrabold">
                          {bedBath}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveFromDen(room.id);
                          }}
                          aria-label="Remove from Den"
                          className="w-6 h-6 rounded-lg bg-[#18181B]/75 hover:bg-[#D96B43] text-[#FAF6F0] flex items-center justify-center transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Center Play Badge */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-9 h-9 rounded-full bg-[#E5A93C]/95 text-[#18181B] flex items-center justify-center shadow-md">
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </div>
                      </div>

                      {/* Bottom Overlay: Price & Neighborhood */}
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className="text-xs font-black text-[#FAF6F0]">
                          ${room.price.toLocaleString()}
                          <span className="text-[9px] font-normal text-[#FAF6F0]/80">
                            /mo
                          </span>
                        </div>
                        <p className="text-[10px] font-bold text-[#E5A93C] truncate">
                          {room.neighborhood}
                        </p>
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="p-2.5 flex flex-col gap-1.5">
                      <h3 className="text-[11px] font-extrabold text-[#18181B] line-clamp-1">
                        {room.title}
                      </h3>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleQuickScheduleViewing(room)}
                          className="flex-1 py-1.5 px-2 rounded-lg bg-[#FAF6F0] hover:bg-[#E5A93C]/25 border border-[#18181B]/20 text-[#18181B] text-[10px] font-extrabold flex items-center justify-center gap-1 transition-all active:scale-95"
                        >
                          <Calendar className="w-3 h-3 text-[#D96B43]" />
                          <span>
                            {justScheduledRoomId === room.id ? 'Booked!' : 'Book Tour'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRequestToBookRoom(room)}
                          className="py-1.5 px-2 rounded-lg bg-[#D96B43] hover:bg-[#c25b35] text-white text-[10px] font-extrabold transition-all active:scale-95"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Pose 2: Empty State — Fenn lying down with oversized ears flopped over eyes */
            <div className="bg-white rounded-2xl border border-[#18181B]/15 p-6 text-center flex flex-col items-center space-y-2">
              <FennMascot size="lg" variant="pose_empty" />
              <h3 className="text-xs font-extrabold text-[#18181B]">
                Your Den is currently empty
              </h3>
              <p className="text-[11px] text-[#18181B]/65 max-w-xs">
                Tap “Save to Den” while watching vertical video tours and Fenn will keep his ears perked for price drops here.
              </p>
              {allRooms[0] && (
                <button
                  type="button"
                  onClick={() => onSelectRoomAndWatch(allRooms[0].id)}
                  className="mt-1 px-4 py-2 rounded-xl bg-[#D96B43] text-white text-xs font-extrabold"
                >
                  Explore Video Feed
                </button>
              )}
            </div>
          )}
        </section>

        {/* Section 2: Scheduled Viewings */}
        <section
          data-testid="my-den-scheduled-viewings"
          className="space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#D96B43]" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#18181B]">
                Scheduled Viewings ({scheduledViewings.length})
              </h2>
            </div>
            {savedRooms[0] && (
              <button
                type="button"
                onClick={() => handleQuickScheduleViewing(savedRooms[0])}
                className="text-[10px] font-extrabold text-[#D96B43] flex items-center gap-0.5 hover:underline"
              >
                <Plus className="w-3 h-3" />
                <span>Add Viewing</span>
              </button>
            )}
          </div>

          <div className="space-y-2">
            {scheduledViewings.map((viewing) => (
              <div
                key={viewing.id}
                className="bg-white rounded-2xl border border-[#18181B]/20 p-3 flex items-center gap-3 shadow-xs"
              >
                <img
                  src={viewing.thumbnail}
                  alt={viewing.roomTitle}
                  onClick={() => onSelectRoomAndWatch(viewing.roomId)}
                  className="w-14 h-14 rounded-xl object-cover shrink-0 cursor-pointer border border-[#18181B]/15"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E5A93C]/25 text-[#18181B] text-[9px] font-extrabold">
                      <CheckCircle2 className="w-2.5 h-2.5 text-[#D96B43]" />
                      {viewing.status}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#18181B]/70">
                      <Video className="w-3 h-3 text-[#D96B43]" />
                      {viewing.tourType}
                    </span>
                  </div>
                  <h3 className="text-xs font-extrabold text-[#18181B] truncate">
                    {viewing.roomTitle}
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] text-[#18181B]/70 font-semibold mt-0.5">
                    <span className="inline-flex items-center gap-1 text-[#D96B43] font-extrabold">
                      <Clock className="w-3 h-3" />
                      {viewing.dateLabel} • {viewing.timeLabel}
                    </span>
                    <span className="inline-flex items-center gap-0.5 truncate">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {viewing.neighborhood}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
