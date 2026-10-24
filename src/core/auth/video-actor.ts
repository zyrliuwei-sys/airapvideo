import { getAuth } from '@/core/auth';
import {
  createGuest,
  readToken,
  type VideoAccess,
} from '@/modules/video-purchases/service';
import { getCookieFromHeader } from '@/lib/cookie';

export const GUEST_COOKIE = 'video_guest';
export const ACCESS_COOKIE = 'video_access';

export function videoCookie(name: string, token: string, request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`;
}

export function assertVideoOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    throw new Error('Invalid request origin');
  }
}

export async function getVideoActor(request: Request, create = false) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  const cookies = request.headers.get('cookie');
  let guestId = await readToken(
    'video-guest',
    getCookieFromHeader(cookies, GUEST_COOKIE)
  );
  const verifiedEmail = await readToken(
    'video-access',
    getCookieFromHeader(cookies, ACCESS_COOKIE)
  );
  let cookie: string | undefined;
  if (create && !session?.user && !guestId) {
    const guest = await createGuest();
    guestId = guest.id;
    cookie = videoCookie(GUEST_COOKIE, guest.token, request);
  }
  const access: VideoAccess = {
    userIds: [
      ...new Set(
        [session?.user?.id, guestId].filter((id): id is string => !!id)
      ),
    ],
    verifiedEmails: [
      ...new Set(
        [
          session?.user?.emailVerified
            ? session.user.email.toLowerCase()
            : undefined,
          verifiedEmail,
        ].filter((email): email is string => !!email)
      ),
    ],
  };
  return {
    userId: session?.user?.id || guestId,
    user: session?.user,
    access,
    cookie,
  };
}
