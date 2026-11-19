/** Home hub navigation state (kept apart from HomeHubView so the app shell doesn't load it). */
export type HomeRole = 'account' | 'renter' | 'landlord';
export type RenterSubPage = 'none' | 'profile' | 'verification' | 'escrow' | 'lease' | 'applications' | 'pinned';
export type LandlordSubPage = 'none' | 'verification' | 'admin' | 'lease' | 'applications' | 'activeListings';
export type HomeNav = { role: HomeRole; renterPage: RenterSubPage; landlordPage: LandlordSubPage };
export const HOME_NAV_START: HomeNav = { role: 'account', renterPage: 'none', landlordPage: 'none' };
