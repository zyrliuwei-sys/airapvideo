import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { assertVideoOrigin, getVideoActor } from '@/core/auth/video-actor';
import { videoEmailProvider } from '@/core/email/video-delivery';
import { getPricingProduct, resolveProductCredits } from '@/config/pricing';
import { getAllConfigs } from '@/modules/config/service';
import { recordServerEvent } from '@/modules/events/service';
import { createCheckout } from '@/modules/payment/service';
import {
  bindOrder,
  existingCheckout,
  findPurchase,
  finishPurchase,
  reserveCheckout,
} from '@/modules/video-purchases/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

function safeSameOriginPath(
  input: string | undefined | null,
  fallbackPath: string,
  baseUrl: string
): string {
  if (!input) return fallbackPath;
  try {
    const appUrl = new URL(baseUrl);
    const candidate = new URL(input, appUrl);
    if (candidate.origin !== appUrl.origin) return fallbackPath;
    return candidate.pathname + candidate.search + candidate.hash;
  } catch {
    return fallbackPath;
  }
}

async function POST({ request }: { request: Request }) {
  let guestCookie: string | undefined;
  let reservedId: string | undefined;
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 1000,
    keyPrefix: 'checkout',
  });
  if (limited) return limited;

  try {
    assertVideoOrigin(request);
    const body = await request.json().catch(() => ({}));
    const { product_id, payment_provider, redirect, purchase_id } = body;
    const contactEmail = z
      .union([z.literal(''), z.email().max(191)])
      .parse(
        typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      );

    if (!product_id || typeof product_id !== 'string') {
      return respErr('Missing product_id');
    }

    // Look up product in the authoritative server-side catalog.
    // We DO NOT trust price / credits / plan from the request body.
    const product = getPricingProduct(product_id);
    if (!product) {
      return respErr('Unknown product');
    }
    const configs = await getAllConfigs();
    const productCredits = resolveProductCredits(product, configs);

    const actor = await getVideoActor(request, true);
    guestCookie = actor.cookie;
    if (product.plan && !actor.user)
      return respErr(
        'Sign in for a monthly subscription, or choose a one-time pack.',
        { headers: guestCookie ? { 'Set-Cookie': guestCookie } : {} }
      );
    const purchase = purchase_id
      ? await findPurchase(String(purchase_id), actor.access)
      : undefined;
    if (
      purchase_id &&
      (!purchase || !actor.access.userIds.includes(purchase.userId))
    ) {
      return respErr('Video checkout not found', { status: 404 });
    }
    if (purchase?.orderNo) {
      const existing = await existingCheckout(purchase.orderNo);
      if (existing?.url && ['created', 'pending'].includes(existing.status))
        return respData({ checkout_url: existing.url });
      return respErr('Payment already processed. Please return to your video.');
    }
    if (purchase) {
      const input = JSON.parse(purchase.input);
      if (productCredits < input.costCredits)
        return respErr('Choose a pack with enough credits for this video');
      if (!(await reserveCheckout(purchase.id, purchase.userId)))
        return respErr(
          'Video checkout already started. Please return to your video.'
        );
      reservedId = purchase.id;
    }
    const buyerId = purchase?.userId || actor.userId!;

    // Customer checkouts always use the catalog amount. Admin connection tests
    // have their own endpoint and cannot discount a customer's real order.
    if (contactEmail && !videoEmailProvider(configs))
      throw new Error(
        'Email delivery is unavailable. Leave email blank to continue.'
      );
    const chargeAmount = product.priceInCents;

    // Build success/cancel URLs — only accept same-origin redirects.
    const baseUrl = configs.app_url || 'http://localhost:3000';
    const safeRedirectPath = safeSameOriginPath(
      redirect,
      actor.user ? '/settings/billing' : '/videos',
      baseUrl
    );
    // Straight to the destination: safeSameOriginPath has already reduced it
    // to a path on this site. The old detour through /auth-callback exists to
    // hand a session token to a desktop client — a browser coming back from
    // checkout is already signed in, and that page isn't part of this app.
    // createCheckout wraps this in /api/payment/callback?order_no=… itself.
    const destination = new URL(safeRedirectPath, baseUrl);
    if (purchase) destination.searchParams.set('purchase', purchase.id);
    const successUrl = destination.toString();
    const cancelUrl = `${baseUrl}/pricing`;

    const checkout = await createCheckout({
      userId: buyerId,
      userEmail: contactEmail,
      productName: product.productName,
      planName: product.planName,
      credits: productCredits,
      creditsValidDays: product.creditsValidDays,
      paymentOrder: {
        productId: product.productId,
        price: { amount: chargeAmount, currency: product.currency },
        type: product.type,
        description: product.description,
        successUrl,
        cancelUrl,
        customer: {
          email: contactEmail || undefined,
          name: actor.user?.name || undefined,
        },
        plan: product.plan
          ? {
              name: product.plan.name,
              interval: product.plan.interval,
              intervalCount: product.plan.intervalCount,
            }
          : undefined,
      },
      provider: payment_provider,
    });

    if (purchase)
      await bindOrder(purchase.id, buyerId, checkout.orderNo, contactEmail);
    reservedId = undefined;

    // Funnel: "sent to the payment page", with the provider actually used.
    await recordServerEvent(request, {
      event: 'hl_checkout_start',
      userId: buyerId,
      paymentProvider: checkout.provider,
      productId: product.productId,
      props: { amount: chargeAmount, currency: product.currency },
    }).catch((e) => console.error('checkout event error:', e));

    return respData(
      { checkout_url: checkout.checkoutInfo.checkoutUrl },
      {
        headers: {
          'Cache-Control': 'no-store',
          ...(guestCookie ? { 'Set-Cookie': guestCookie } : {}),
        },
      }
    );
  } catch (error: any) {
    if (reservedId) await finishPurchase(reservedId, { status: 'draft' });
    console.error('checkout error:', error);
    return respErr(
      error instanceof z.ZodError
        ? 'Please enter a valid email address'
        : error.message || 'Checkout failed',
      { headers: guestCookie ? { 'Set-Cookie': guestCookie } : {} }
    );
  }
}

export const Route = createFileRoute('/api/payment/checkout')({
  server: {
    handlers: { POST },
  },
});
