/**
 * One-line value copy for each 2.0 tab (first-visit banner) and the empty
 * states. Kept here so it's tested: one line each (≤ 90 characters), no emoji,
 * fair-housing clean (it describes rooms and features, never who should live there).
 */

export type ValueTab = 'listings' | 'fill' | 'messages' | 'passport';

export const TAB_VALUE: Record<ValueTab, { title: string; line: string }> = {
  listings: { title: 'Find', line: 'Watch real rooms around the Bay Area. Apply in one tap with your Passport.' },
  fill: { title: 'Fill', line: 'Moving out? Film 3 shots, share one link, and let your replacement find you.' },
  messages: { title: 'Inbox', line: 'Every conversation with hosts and applicants, in one place, without sharing your number.' },
  passport: { title: 'Passport', line: 'One verified profile you reuse for every room. Hosts see badges, never documents.' },
};

export const EMPTY_STATE = {
  findNoRooms: { title: 'No rooms here yet', line: 'New rooms in the launch area show up here as hosts publish them.' },
  findFiltered: { title: 'No rooms match', line: 'Try another area, a higher rent, or a later move-in date.' },
  findSaved: { title: 'No saved rooms yet', line: 'Tap the pin on any room to keep it here.' },
  fillNoRooms: { title: 'No rooms yet', line: 'Tap "Fill my room" to make your tour and link in about 10 minutes.' },
  inboxEmpty: { title: 'No conversations yet', line: 'Apply to a room in Find, or share your room’s link from Fill.' },
  noApplicants: { title: 'No applicants yet', line: 'Share your link in one more group: most rooms fill from the second post.' },
} as const;

export const ALL_LAUNCH_LINES: string[] = [
  ...Object.values(TAB_VALUE).map((v) => v.line),
  ...Object.values(EMPTY_STATE).map((v) => v.line),
];
