import { createFileRoute } from '@tanstack/react-router';

import { assertVideoOrigin } from '@/core/auth/video-actor';
import {
  createPhoneUpload,
  endPhoneUpload,
  isPhotoDataUrl,
  PHONE_UPLOAD_SLOTS,
  savePhoneUploadPhoto,
  takePhoneUploadPhotos,
  type PhoneUploadSlot,
} from '@/modules/phone-upload/service';
import { allowInWindow } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

function clientIp(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    'local'
  );
}

// Desktop: open a session for the QR code.
async function POST({ request }: { request: Request }) {
  try {
    assertVideoOrigin(request);
    if (!allowInWindow(`phone-upload:${clientIp(request)}`, 20, 60 * 60_000))
      return respErr('Please try again later', { status: 429 });
    return respData(await createPhoneUpload(), noStore);
  } catch (error: any) {
    return respErr(error.message || 'Could not start phone upload');
  }
}

// Phone: send one photo for a slot.
async function PUT({ request }: { request: Request }) {
  try {
    assertVideoOrigin(request);
    if (!allowInWindow(`phone-photo:${clientIp(request)}`, 30, 10 * 60_000))
      return respErr('Please try again later', { status: 429 });
    const body = await request.json().catch(() => ({}));
    const slot = body.slot as PhoneUploadSlot;
    if (!PHONE_UPLOAD_SLOTS.includes(slot)) return respErr('Invalid slot');
    if (!isPhotoDataUrl(body.photo)) return respErr('Invalid photo file');
    if (!(await savePhoneUploadPhoto(body.token, slot, body.photo)))
      return respErr('This link has expired', { status: 410 });
    return respData({ ok: true }, noStore);
  } catch (error: any) {
    return respErr(error.message || 'Upload failed');
  }
}

// Desktop: poll for (and take) photos sent from the phone.
async function GET({ request }: { request: Request }) {
  try {
    const token = new URL(request.url).searchParams.get('token');
    const photos = await takePhoneUploadPhotos(token);
    if (!photos) return respErr('This link has expired', { status: 410 });
    return respData(photos, noStore);
  } catch (error: any) {
    return respErr(error.message || 'Query failed');
  }
}

// Desktop: close the session (dialog closed or both photos received).
async function DELETE({ request }: { request: Request }) {
  try {
    assertVideoOrigin(request);
    await endPhoneUpload(new URL(request.url).searchParams.get('token'));
    return respData({ ok: true }, noStore);
  } catch (error: any) {
    return respErr(error.message || 'Request failed');
  }
}

export const Route = createFileRoute('/api/phone-upload')({
  server: { handlers: { POST, PUT, GET, DELETE } },
});
