/**
 * The photos of a photo listing while the host works on it in the Fill flow:
 * adding and retaking shots (with the instant checks), captions, order, the AI
 * suggestions, and saving to Supabase (Storage + listing_photos).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { photoWarnings, type PhotoWarning, type PhotoWarningId, PHOTO_WARNING_TEXT } from '../../fill/photoChecks';
import { canAddPhoto, coverSlot, isRequiredSlot, photoPath, type PhotoSlot } from '../../fill/photoShots';
import type { PhotoAssist, PhotoPrivacyFlag } from '../../fill/photoAssist';
import { deletePhotos, fillApi, savePhotoRows, uploadToStorage, type PhotoRow } from '../../lib/fillApi';
import { describeSavedPhoto, processPhoto } from '../../lib/photoProcess';

export type DraftPhoto = {
  /** Local id; also part of the file's Storage path */
  key: string;
  slot: PhotoSlot;
  /** Object URL of the cleaned JPEG (previews, the tour, the export) */
  url: string;
  blob: Blob;
  /** Storage path once uploaded */
  path: string | null;
  width: number;
  height: number;
  phash: string | null;
  warnings: PhotoWarning[];
  privacy: PhotoPrivacyFlag[];
  caption: string;
  thumbBase64: string;
};

const newKey = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const isWarningId = (v: unknown): v is PhotoWarningId => typeof v === 'string' && v in PHOTO_WARNING_TEXT;

export function usePhotoDraft() {
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [approved, setApproved] = useState(false);
  const [facts, setFacts] = useState<PhotoAssist['facts'] | null>(null);
  const [adding, setAdding] = useState<PhotoSlot | null>(null);
  const [assistBusy, setAssistBusy] = useState(false);
  const removedPaths = useRef<string[]>([]);
  const urls = useRef(new Set<string>());
  const latest = useRef(photos);
  latest.current = photos;

  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    []
  );

  /** Adds a photo, or replaces the one in a named shot (a retake). Extras ("other") always add. */
  const add = useCallback(async (slot: PhotoSlot, file: Blob): Promise<void> => {
    setAdding(slot);
    try {
      const p = await processPhoto(file);
      urls.current.add(p.url);
      setPhotos((prev) => {
        const replaced = slot === 'other' ? undefined : prev.find((x) => x.slot === slot);
        if (!replaced && !canAddPhoto(prev.length)) return prev;
        if (replaced?.path) removedPaths.current.push(replaced.path);
        const others = prev.filter((x) => x !== replaced);
        const photo: DraftPhoto = {
          key: newKey(),
          slot,
          url: p.url,
          blob: p.blob,
          path: null,
          width: p.width,
          height: p.height,
          phash: p.phash,
          warnings: photoWarnings({
            brightness: p.brightness,
            sharpness: p.sharpness,
            width: p.originalWidth,
            height: p.originalHeight,
            required: isRequiredSlot(slot),
            phash: p.phash,
            otherHashes: others.map((x) => x.phash).filter((h): h is string => Boolean(h)),
          }),
          privacy: [],
          caption: '',
          thumbBase64: p.thumbBase64,
        };
        return replaced ? prev.map((x) => (x === replaced ? photo : x)) : [...prev, photo];
      });
      setApproved(false);
    } finally {
      setAdding(null);
    }
  }, []);

  const remove = useCallback((key: string) => {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.key === key);
      if (gone?.path) removedPaths.current.push(gone.path);
      return prev.filter((p) => p.key !== key);
    });
    setApproved(false);
  }, []);

  const move = useCallback((key: string, by: -1 | 1) => {
    setPhotos((prev) => {
      const from = prev.findIndex((p) => p.key === key);
      const to = from + by;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }, []);

  const setCaption = useCallback((key: string, caption: string) => {
    setPhotos((prev) => prev.map((p) => (p.key === key ? { ...p, caption: caption.slice(0, 80) } : p)));
    setApproved(false);
  }, []);

  /** A resumed draft: downloads the saved photos back into the flow (they are small). */
  const restore = useCallback(async (rows: PhotoRow[]): Promise<void> => {
    const loaded = await Promise.all(
      rows.map(async (row): Promise<DraftPhoto | null> => {
        try {
          if (!row.signedUrl) return null;
          const blob = await fetch(row.signedUrl).then((r) => (r.ok ? r.blob() : Promise.reject(new Error())));
          const info = await describeSavedPhoto(blob);
          const url = URL.createObjectURL(blob);
          urls.current.add(url);
          return {
            key: /-([a-z0-9]+)\.jpg$/i.exec(row.storage_path)?.[1] ?? newKey(),
            slot: row.slot,
            url,
            blob,
            path: row.storage_path,
            width: row.width ?? info.width,
            height: row.height ?? info.height,
            phash: row.phash,
            warnings: (Array.isArray(row.qc_flags) ? row.qc_flags : []).filter(isWarningId).map((id) => ({ id, text: PHOTO_WARNING_TEXT[id] })),
            privacy: [],
            caption: row.caption ?? '',
            thumbBase64: info.thumbBase64,
          };
        } catch {
          return null; // a photo that can't be restored is simply taken again
        }
      })
    );
    const ok = loaded.filter((p): p is DraftPhoto => p !== null);
    setPhotos((prev) => (prev.length ? prev : ok));
    setApproved(ok.length > 0 && rows.every((r) => r.caption_approved));
  }, []);

  /** Uploads new photos and saves order, captions and approval. */
  const save = useCallback(async (listingId: string, opts: { approved?: boolean; onProgress?: (fraction: number) => void } = {}): Promise<void> => {
    const current = latest.current;
    const fresh = current.filter((p) => !p.path);
    const paths = new Map<string, string>();
    for (let i = 0; i < fresh.length; i++) {
      const p = fresh[i];
      const path = photoPath(listingId, p.slot, p.key);
      await uploadToStorage('listing-photos', path, p.blob, 'image/jpeg', (f) => opts.onProgress?.((i + f) / fresh.length));
      paths.set(p.key, path);
    }
    const saved = current.map((p) => ({ ...p, path: p.path ?? paths.get(p.key)! }));
    await savePhotoRows(
      listingId,
      saved.map((p, position) => ({
        slot: p.slot,
        position,
        storage_path: p.path,
        width: p.width,
        height: p.height,
        caption: p.caption.trim() || null,
        caption_approved: opts.approved ?? false,
        phash: p.phash,
        qc_flags: p.warnings.map((w) => w.id),
      }))
    );
    const gone = removedPaths.current.splice(0);
    await deletePhotos(gone).catch(() => undefined);
    setPhotos((prev) => prev.map((p) => (paths.has(p.key) ? { ...p, path: paths.get(p.key)! } : p)));
    if (opts.approved !== undefined) setApproved(opts.approved);
  }, []);

  /**
   * Asks the AI to order the photos, caption the ones the host hasn't captioned, suggest facts and
   * flag privacy problems. Never throws: without it the host orders and captions by hand.
   */
  const runAssist = useCallback(async (listing: Record<string, unknown>): Promise<void> => {
    const current = latest.current;
    if (current.length === 0) return;
    setAssistBusy(true);
    try {
      const { assist } = await fillApi.photoAssist({
        listing,
        photos: current.map((p) => ({ id: p.key, slot: p.slot, jpegBase64: p.thumbBase64 })),
      });
      setPhotos((prev) => {
        const byKey = new Map(prev.map((p) => [p.key, p]));
        const ordered = assist.order.map((key) => byKey.get(key)).filter((p): p is DraftPhoto => Boolean(p));
        const rest = prev.filter((p) => !assist.order.includes(p.key));
        const next = [...ordered, ...rest].map((p) => ({
          ...p,
          caption: p.caption.trim() ? p.caption : assist.captions[p.key] ?? '',
          privacy: assist.flags[p.key] ?? [],
        }));
        latest.current = next; // a save right after this call must see the new order and captions
        return next;
      });
      setFacts(assist.facts);
      setApproved(false);
    } catch {
      // suggestions are optional
    } finally {
      setAssistBusy(false);
    }
  }, []);

  const slots = photos.map((p) => p.slot);
  const cover = photos.find((p) => p.slot === coverSlot(slots)) ?? null;
  return { photos, slots, cover, approved, setApproved, facts, adding, assistBusy, add, remove, move, setCaption, restore, save, runAssist };
}

export type PhotoDraft = ReturnType<typeof usePhotoDraft>;
