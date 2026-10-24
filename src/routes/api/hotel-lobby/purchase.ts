import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { assertVideoOrigin, getVideoActor } from '@/core/auth/video-actor';
import { findPurchase } from '@/modules/video-purchases/service';
import { allowInWindow } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';
import { getLocale } from '@/paraglide/runtime.js';

import {
  preparePurchase,
  readVideoBody,
  startPaidPurchases,
} from './-purchase';

const emailSchema = z.union([z.literal(''), z.email().max(191)]);

async function POST({ request }: { request: Request }) {
  let cookie: string | undefined;
  try {
    assertVideoOrigin(request);
    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      'local';
    if (!allowInWindow(`video-draft:${ip}`, 20, 60 * 60_000))
      return respErr('Please try again later', { status: 429 });
    const body = await readVideoBody(request);
    const email = emailSchema.parse(
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    );
    const actor = await getVideoActor(request, true);
    cookie = actor.cookie;
    const purchase = await preparePurchase(
      actor.userId!,
      body,
      email,
      getLocale()
    );
    return respData(
      { id: purchase.id },
      {
        headers: {
          ...(cookie ? { 'Set-Cookie': cookie } : {}),
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error: any) {
    return respErr(
      error instanceof z.ZodError
        ? 'Please enter a valid email address'
        : error.message || 'Could not prepare video',
      { headers: cookie ? { 'Set-Cookie': cookie } : {} }
    );
  }
}

async function GET({ request }: { request: Request }) {
  try {
    const actor = await getVideoActor(request);
    const id = new URL(request.url).searchParams.get('id') || '';
    let purchase = await findPurchase(id, actor.access);
    if (!purchase) return respErr('Video checkout not found', { status: 404 });
    if (purchase.status === 'waiting') {
      await startPaidPurchases(id);
      purchase = (await findPurchase(id, actor.access))!;
    }
    return respData(
      {
        id: purchase.id,
        status: purchase.status,
        taskId: purchase.taskId,
        emailProvided: !!purchase.email,
        error: purchase.error,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: any) {
    return respErr(error.message || 'Query failed');
  }
}

export const Route = createFileRoute('/api/hotel-lobby/purchase')({
  server: { handlers: { POST, GET } },
});
