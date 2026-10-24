import { createFileRoute } from '@tanstack/react-router';

import { ACCESS_COOKIE, videoCookie } from '@/core/auth/video-actor';
import {
  consumeEmailToken,
  saveToken,
} from '@/modules/video-purchases/service';
import { localizeHref } from '@/paraglide/runtime.js';

async function GET({ request }: { request: Request }) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const email = await consumeEmailToken(token);
  const headers = new Headers({
    Location: localizeHref(email ? '/videos' : '/videos?link=expired'),
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  if (email)
    headers.set(
      'Set-Cookie',
      videoCookie(
        ACCESS_COOKIE,
        await saveToken('video-access', email, 365 * 24 * 60 * 60_000),
        request
      )
    );
  return new Response(null, { status: 303, headers });
}

export const Route = createFileRoute('/api/video-access/open')({
  server: { handlers: { GET } },
});
