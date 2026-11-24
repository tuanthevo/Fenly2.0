/**
 * What the Listing Details sheet shows for a room. A database room often has
 * no size, deposit, housemates or house rules yet, and a renter reads blank
 * fields and unbacked badges as a fake listing: so only what is known is shown,
 * and a badge appears only when the data backs it.
 */
import type { Host } from '../types';

interface DetailsRoom {
  price: number;
  deposit: number;
  squareFeet: number;
  availableDate: string;
  roommates: unknown[];
  houseRules: string[];
  host: Pick<Host, 'name' | 'verified' | 'phoneVerified' | 'occupation' | 'responseRate'>;
}

export interface RoomDetailsView {
  badges: string[];
  tiles: { label: string; value: string }[];
  showRoommates: boolean;
  showRules: boolean;
  host: { initials: string; verified: boolean; occupation: string | null; responds: string | null };
}

const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Up to two initials, for when there is no photo or it fails to load. */
export function hostInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

/** `escrow`: the 1.0 Home hub's move-in escrow is on (the `home_extras` flag). */
export function roomDetailsView(room: DetailsRoom, opts: { escrow?: boolean } = {}): RoomDetailsView {
  const badges: string[] = [];
  if (room.host.verified) badges.push(room.host.phoneVerified ? 'Phone verified' : 'Verified');
  if (opts.escrow) badges.push('Move-in escrow');

  const tiles = [{ label: 'Monthly rent', value: dollars(room.price) }];
  if (room.deposit > 0) tiles.push({ label: 'Deposit', value: dollars(room.deposit) });
  if (room.squareFeet > 0) tiles.push({ label: 'Room size', value: `${room.squareFeet} sq ft` });
  if (room.availableDate) tiles.push({ label: 'Available', value: room.availableDate });

  return {
    badges,
    tiles,
    showRoommates: room.roommates.length > 0,
    showRules: room.houseRules.length > 0,
    host: {
      initials: hostInitials(room.host.name),
      verified: Boolean(room.host.verified),
      occupation: room.host.occupation?.trim() || null,
      responds: room.host.responseRate?.trim() || null,
    },
  };
}
