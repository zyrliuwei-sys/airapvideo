import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import {
  CLIENT_EVENTS,
  isBotRequest,
  recordEvent,
  resolveVisitor,
  visitorCookies,
} from '@/modules/events/service';
import { md5 } from '@/lib/hash';
import { allowInWindow } from '@/lib/rate-limit';

// First-party funnel beacon (see src/lib/track.ts). Always answers 204 so a
// tracking hiccup never surfaces in the page; bad or excess events are
// simply dropped.
const MAX_BODY = 2048;
const PER_VISITOR_MINUTE = 30;
// Cookie-less clients mint a new visitor id each call; cap the IP as well.
const PER_IP_MINUTE = 120;

function noContent(cookies: string[] = []) {
  const headers = new Headers({ 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 204, headers });
}

async function POST({ request }: { request: Request }) {
  try {
    if (isBotRequest(request)) return noContent();
    const raw = await request.text();
    if (raw.length > MAX_BODY) return noContent();
    const body = JSON.parse(raw || '{}');
    const name = typeof body.event === 'string' ? body.event : '';
    if (!CLIENT_EVENTS.has(name)) return noContent();

    const visitor = resolveVisitor(request, body.ft);
    const cookies = visitorCookies(request, visitor);
    const ip = md5(request.headers.get('cf-connecting-ip') || '');
    if (
      !allowInWindow(`ev-ip|${ip}`, PER_IP_MINUTE, 60_000) ||
      !allowInWindow(`ev|${visitor.visitorId}`, PER_VISITOR_MINUTE, 60_000)
    ) {
      return noContent(cookies);
    }

    const session = await getAuth()
      .api.getSession({ headers: request.headers })
      .catch(() => null);

    await recordEvent({
      visitor,
      event: name,
      userId: session?.user?.id,
      build: body.build,
      experiment: body.experiment,
      paymentProvider: body.payment_provider,
      productId: body.product_id,
      path: body.path,
      props:
        body.props && typeof body.props === 'object' ? body.props : undefined,
    });
    return noContent(cookies);
  } catch (error) {
    console.error('event beacon error:', error);
    return noContent();
  }
}

export const Route = createFileRoute('/api/events')({
  server: { handlers: { POST } },
});
