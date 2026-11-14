import { UserProfile } from '../types';

export const INITIAL_USER_PROFILE: UserProfile = {
  id: 'user-current',
  name: 'Taylor Jordan',
  email: 'taylor.jordan@example.com',
  isEmailVerified: true,
  isIdVerified: true,
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
  bio: 'Product Designer looking for a sunlit room in a warm, friendly apartment. I cook healthy dinners, keep common spaces clean, and respect quiet hours.',
  budgetMin: 900,
  budgetMax: 1600,
  preferredLocations: ['Mission District, SF', 'Williamsburg, Brooklyn', 'South Congress, Austin'],
  desiredAmenities: ['Private Bath', 'In-Unit W/D', 'High-Speed WiFi', 'Furnished', 'Pet Friendly'],
  occupation: 'Lead Product Designer',
  moveInDate: 'November 1, 2026',
  lifestyle: {
    sleepSchedule: 'Flexible',
    workStyle: 'Hybrid',
    pets: 'Loves Pets',
    cleanliness: 'Very Clean',
    socialVibe: 'Balanced',
  },
  renterProfile: {
    preferredMoveInDate: '2026-11-01',
    leaseDuration: '12 months',
    incomePeriod: 'Annual',
    householdIncome: '115,000',
    householdSize: '1',
    preferredBedrooms: '1',
    parkingNeeds: 'No',
    pets: 'No',
  },
};
