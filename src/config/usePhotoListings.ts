/**
 * Whether this person may use photo listings: everyone once the photo_listings
 * flag is on, and admins (FENLY_ADMIN_EMAILS, checked on the server) before that.
 */
import { useEffect, useState } from 'react';
import { useFlag } from './FlagsProvider';
import { canUsePhotoListings } from './featureFlags';
import { findApi } from '../lib/findApi';

let adminCheck: Promise<boolean> | null = null;

export function usePhotoListings(): boolean {
  const flagOn = useFlag('photo_listings');
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (flagOn) return;
    let alive = true;
    // Signed out, or not an admin: the request fails or says false, and the feature stays hidden
    adminCheck ??= findApi.me().then((me) => me.isAdmin === true).catch(() => false);
    void adminCheck.then((admin) => {
      if (!admin) adminCheck = null; // someone may sign in later in this session
      if (alive) setIsAdmin(admin);
    });
    return () => {
      alive = false;
    };
  }, [flagOn]);
  return canUsePhotoListings({ photo_listings: flagOn }, isAdmin);
}
