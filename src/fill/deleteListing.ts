/**
 * The words on the "Delete listing" confirm sheet (edit screen). Deleting is for
 * good: the server removes the listing's files and rows, so the warning says
 * exactly what goes.
 */
import type { MediaType } from './listingRules';

export interface DeleteListingCopy {
  title: string;
  lines: string[];
  confirm: string;
  cancel: string;
}

export function deleteListingCopy(status: string, mediaType: MediaType): DeleteListingCopy {
  const media = mediaType === 'photos' ? 'photos and photo tour' : 'video';
  if (status === 'draft') {
    return {
      title: 'Delete this draft?',
      lines: [`The draft and its ${media} are removed.`, "This can't be undone."],
      confirm: 'Delete draft',
      cancel: 'Keep draft',
    };
  }
  return {
    title: 'Delete this listing?',
    lines: [
      `The listing and its ${media} are removed, and it leaves Find.`,
      'Every link you shared will stop working.',
      'Applications and messages about this room are deleted, for you and for the renters.',
      "This can't be undone.",
    ],
    confirm: 'Delete listing',
    cancel: 'Keep listing',
  };
}
