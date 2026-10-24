import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';

import {
  getPricingProduct,
  resolveProductCredits,
} from '../src/config/pricing';
import { paypalEnvironment, PayPalProvider } from '../src/core/payment/paypal';
import { PaymentStatus, PaymentType } from '../src/core/payment/types';

const packs = [
  ['pack_starter', 990, 1],
  ['pack_standard', 1990, 3],
  ['pack_pro', 2990, 5],
] as const;
const json = (value: unknown) => Response.json(value);
const provider = () =>
  new PayPalProvider({
    clientId: 'test-client',
    clientSecret: 'test-secret',
    environment: paypalEnvironment('production'),
  });
afterEach(() => mock.restoreAll());

test('the three one-time tiers have the exact prices and grant 1, 3 and 5 video renders', () => {
  for (const [id, cents, count] of packs) {
    const product = getPricingProduct(id)!;
    assert.equal(product.priceInCents, cents);
    assert.equal(product.currency, 'usd');
    assert.equal(product.type, PaymentType.ONE_TIME);
    assert.equal(product.videoCount, count);
    assert.equal(resolveProductCredits(product), count * 440);
    assert.equal(
      resolveProductCredits(product, { hotel_lobby_credits: '500' }),
      count * 500
    );
  }
});

test('live and production settings use the live API; sandbox stays isolated', () => {
  assert.equal(paypalEnvironment('live'), 'production');
  assert.equal(paypalEnvironment('production'), 'production');
  assert.equal(paypalEnvironment('sandbox'), 'sandbox');
});

test('PayPal receives each catalog amount in minor units and the correct currency', async () => {
  let orderCalls = 0;
  mock.method(
    globalThis,
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      assert.ok(url.startsWith('https://api-m.paypal.com/'));
      if (url.endsWith('/v1/oauth2/token'))
        return json({ access_token: 'test-token', expires_in: 3600 });
      const payload = JSON.parse(init!.body as string);
      const [id, cents] = packs[orderCalls++];
      const purchase = payload.purchase_units[0];
      assert.equal(payload.intent, 'CAPTURE');
      assert.equal(purchase.amount.value, (cents / 100).toFixed(2));
      assert.equal(purchase.amount.currency_code, 'USD');
      assert.equal(purchase.items[0].unit_amount.value, purchase.amount.value);
      assert.equal(
        payload.application_context.shipping_preference,
        'NO_SHIPPING'
      );
      return json({
        id,
        links: [
          {
            rel: 'approve',
            href: `https://www.paypal.com/checkoutnow?token=${id}`,
          },
        ],
      });
    }
  );
  const p = provider();
  for (const [id] of packs) {
    const product = getPricingProduct(id)!;
    const session = await p.createPayment({
      order: {
        type: product.type,
        orderNo: id,
        price: { amount: product.priceInCents, currency: product.currency },
        description: product.description,
      },
    });
    assert.match(session.checkoutInfo.checkoutUrl!, /paypal\.com\/checkoutnow/);
  }
  assert.equal(orderCalls, 3);
});

test('an approved PayPal order is captured and returned as a paid session', async () => {
  let captures = 0;
  mock.method(
    globalThis,
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/token'))
        return json({ access_token: 'test-token', expires_in: 3600 });
      if (url.endsWith('/capture')) {
        captures++;
        assert.equal(init?.method, 'POST');
        return json({
          id: 'ORDER',
          status: 'COMPLETED',
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: 'CAPTURE',
                    status: 'COMPLETED',
                    amount: { value: '19.90', currency_code: 'USD' },
                  },
                ],
              },
            },
          ],
        });
      }
      return json({ id: 'ORDER', status: 'APPROVED' });
    }
  );
  const session = await provider().getPaymentSession({ sessionId: 'ORDER' });
  assert.equal(captures, 1);
  assert.equal(session.paymentStatus, PaymentStatus.SUCCESS);
  assert.equal(session.paymentInfo?.paymentAmount, 1990);
  assert.equal(session.paymentInfo?.paymentCurrency, 'USD');
});

test('pending captures do not count as successful payments', async () => {
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    if (String(input).endsWith('/token'))
      return json({ access_token: 'test-token', expires_in: 3600 });
    return json({
      id: 'ORDER',
      status: 'COMPLETED',
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: 'PENDING-CAPTURE',
                status: 'PENDING',
                amount: { value: '9.90', currency_code: 'USD' },
              },
            ],
          },
        },
      ],
    });
  });
  const session = await provider().getPaymentSession({ sessionId: 'ORDER' });
  assert.equal(session.paymentStatus, PaymentStatus.PROCESSING);
});

test('an unapproved order never attempts capture', async () => {
  let captures = 0;
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/token'))
      return json({ access_token: 'test-token', expires_in: 3600 });
    if (url.endsWith('/capture')) captures++;
    return json({ id: 'ORDER', status: 'CREATED' });
  });
  assert.equal(
    (await provider().getPaymentSession({ sessionId: 'ORDER' })).paymentStatus,
    PaymentStatus.PROCESSING
  );
  assert.equal(captures, 0);
});

test('missing approval links cannot create unusable customer checkouts', async () => {
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) =>
    String(input).endsWith('/token')
      ? json({ access_token: 'test-token', expires_in: 3600 })
      : json({ id: 'ORDER', links: [] })
  );
  await assert.rejects(
    provider().createPayment({
      order: {
        type: PaymentType.ONE_TIME,
        price: { amount: 990, currency: 'USD' },
      },
    }),
    /checkout link/
  );
});
