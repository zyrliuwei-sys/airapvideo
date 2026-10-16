/**
 * Fire a funnel event to whichever analytics the admin enabled (GA4 and/or
 * Plausible), and to the site's own event table (/api/events). A no-op on
 * the server; never throws.
 *
 * `product_id` / `payment_provider` / `experiment` props are lifted into
 * their own columns in the event table; the rest is kept as JSON.
 */
export function track(name: string, props?: Record<string, string | number>) {
  if (typeof window === 'undefined') return;
  const w = window as any;
  try {
    w.gtag?.('event', name, props);
    w.plausible?.(name, props ? { props } : undefined);
  } catch {
    // Analytics must never break the page.
  }
  sendFirstParty(name, props);
}

const FIRST_TOUCH_KEY = 'hl-first-touch';

type ClientTouch = { referrer: string; utm: string };

/**
 * What this browser saw on its first landing: external referrer host and
 * utm_source/medium/campaign. Call once at boot so a visitor who lands on any
 * page (not only the homepage) keeps the right source. The server pins it by
 * cookie on the first event; this copy only bridges until then.
 */
export function captureFirstTouch() {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(FIRST_TOUCH_KEY)) return;
    let referrer = '';
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.hostname !== window.location.hostname) {
        referrer = ref.hostname;
      }
    } catch {}
    const q = new URLSearchParams(window.location.search);
    const utm = ['utm_source', 'utm_medium', 'utm_campaign']
      .map((k) => q.get(k) || '')
      .join('/')
      .replace(/\/+$/, '');
    localStorage.setItem(
      FIRST_TOUCH_KEY,
      JSON.stringify({ referrer, utm } satisfies ClientTouch)
    );
  } catch {
    // Blocked storage: the server falls back to the current request.
  }
}

function firstTouch(): ClientTouch | undefined {
  try {
    return (
      JSON.parse(localStorage.getItem(FIRST_TOUCH_KEY) || 'null') ?? undefined
    );
  } catch {
    return undefined;
  }
}

function sendFirstParty(name: string, props?: Record<string, string | number>) {
  try {
    // Child effects run before the root's boot capture; make sure the very
    // first event already carries the landing referrer.
    captureFirstTouch();
    const { product_id, payment_provider, experiment, ...rest } = props ?? {};
    const body = JSON.stringify({
      event: name,
      build: __GIT_COMMIT__,
      path: window.location.pathname,
      ft: firstTouch(),
      product_id,
      payment_provider,
      experiment,
      props: Object.keys(rest).length ? rest : undefined,
    });
    // keepalive: still delivered when the page navigates away right after
    // (sign-up redirect, jump to the payment page).
    fetch('/api/events', {
      method: 'POST',
      body,
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
    }).catch(() => {});
  } catch {
    // Tracking must never break the page.
  }
}
