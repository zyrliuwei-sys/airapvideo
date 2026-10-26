import { and, eq, gt, inArray, like } from 'drizzle-orm';

import { db } from '@/core/db';
import { verification } from '@/config/db/schema';
import { getUuid } from '@/lib/hash';

/**
 * Phone → desktop photo hand-off. The desktop opens a session and shows its
 * token as a QR code; the phone uploads one photo per slot; the desktop polls
 * and takes (deletes) them. Everything lives in the verification table with
 * an expiry, so photos never reach public storage.
 */
export const PHONE_UPLOAD_TTL = 30 * 60_000;
export const PHONE_UPLOAD_SLOTS = ['a', 'b'] as const;
export type PhoneUploadSlot = (typeof PHONE_UPLOAD_SLOTS)[number];

const KIND = 'phone-upload';
// A 1280px JPEG at 0.85 is well under this; caps a D1 row comfortably.
const MAX_PHOTO_CHARS = 1_500_000;

async function sessionId(token: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token)
  );
  const hash = Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, '0')
  ).join('');
  return `${KIND}:${hash}`;
}

function isToken(token: unknown): token is string {
  return typeof token === 'string' && /^[a-f\d-]{72}$/i.test(token);
}

export async function createPhoneUpload() {
  const token = `${getUuid()}${getUuid()}`;
  const id = await sessionId(token);
  await db()
    .insert(verification)
    .values({
      id,
      identifier: id,
      value: '',
      expiresAt: new Date(Date.now() + PHONE_UPLOAD_TTL),
    });
  return { token, expiresAt: Date.now() + PHONE_UPLOAD_TTL };
}

async function findSession(token: unknown) {
  if (!isToken(token)) return null;
  const id = await sessionId(token);
  const [row] = await db()
    .select({ id: verification.id, expiresAt: verification.expiresAt })
    .from(verification)
    .where(and(eq(verification.id, id), gt(verification.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

/** Accepts a base64 JPEG/PNG/WebP data URL whose bytes match its type. */
export function isPhotoDataUrl(photo: unknown): photo is string {
  if (typeof photo !== 'string' || photo.length > MAX_PHOTO_CHARS) return false;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
    photo
  );
  if (!match) return false;
  const head = Uint8Array.from(atob(match[2].slice(0, 24)), (c) =>
    c.charCodeAt(0)
  );
  const starts = (signature: number[]) =>
    signature.every((n, i) => head[i] === n);
  if (match[1] === 'jpeg') return starts([255, 216, 255]);
  if (match[1] === 'png') return starts([137, 80, 78, 71, 13, 10, 26, 10]);
  return (
    starts([82, 73, 70, 70]) &&
    String.fromCharCode(...head.subarray(8, 12)) === 'WEBP'
  );
}

export async function savePhoneUploadPhoto(
  token: unknown,
  slot: PhoneUploadSlot,
  photo: string
) {
  const session = await findSession(token);
  if (!session) return false;
  const id = `${session.id}:${slot}`;
  await db().delete(verification).where(eq(verification.id, id));
  await db().insert(verification).values({
    id,
    identifier: session.id,
    value: photo,
    expiresAt: session.expiresAt,
  });
  return true;
}

/**
 * Photos uploaded since the last call, removed as they are returned.
 * `null` when the session is missing or expired.
 */
export async function takePhoneUploadPhotos(token: unknown) {
  const session = await findSession(token);
  if (!session) return null;
  const ids = PHONE_UPLOAD_SLOTS.map((slot) => `${session.id}:${slot}`);
  const rows = await db()
    .select({ id: verification.id, value: verification.value })
    .from(verification)
    .where(inArray(verification.id, ids));
  if (rows.length) {
    await db()
      .delete(verification)
      .where(
        inArray(
          verification.id,
          rows.map((row: { id: string }) => row.id)
        )
      );
  }
  const photos: Partial<Record<PhoneUploadSlot, string>> = {};
  for (const row of rows) {
    photos[row.id.slice(-1) as PhoneUploadSlot] = row.value;
  }
  return photos;
}

export async function endPhoneUpload(token: unknown) {
  if (!isToken(token)) return;
  const id = await sessionId(token);
  await db()
    .delete(verification)
    .where(like(verification.id, `${id}%`));
}
