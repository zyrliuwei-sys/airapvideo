import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, mock, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';

let temp: string;
let purchases: typeof import('../src/modules/video-purchases/service');
let actors: typeof import('../src/core/auth/video-actor');
let tasks: typeof import('../src/modules/ai-tasks/service');
let credits: typeof import('../src/modules/credits/service');
let payments: typeof import('../src/modules/payment/service');
let queue: typeof import('../src/routes/api/hotel-lobby/-purchase');
let schema: typeof import('../src/config/db/schema.sqlite');
let db: (typeof import('../src/core/db'))['db'];
let guest: { id: string; token: string };
let purchaseId: string;
let orderNo: string;
let taskId: string;
const email = 'buyer@example.invalid';
const sessionId = 'test-checkout-session';
let paymentSession: any;

before(async () => {
  temp = await mkdtemp(path.join(tmpdir(), 'airap-guest-video-'));
  process.env.DATABASE_PROVIDER = 'sqlite';
  process.env.DATABASE_URL = `file:${path.join(temp, 'test.db')}`;
  process.env.AUTH_SECRET = 'test-secret-at-least-thirty-two-characters';
  process.env.CONFIG_ENCRYPTION_KEY = '';
  ({ db } = await import('../src/core/db'));
  schema = await import('../src/config/db/schema.sqlite');
  for (const table of [
    schema.user,
    schema.session,
    schema.account,
    schema.verification,
    schema.aiTask,
    schema.credit,
    schema.config,
    schema.order,
    schema.subscription,
    schema.videoPurchase,
  ]) {
    const config = getTableConfig(table);
    const columns = config.columns.map((column) => {
      let def = '';
      if (['created_at', 'updated_at'].includes(column.name))
        def = ` DEFAULT ${Date.now()}`;
      else if (typeof column.default === 'string')
        def = ` DEFAULT '${column.default.replaceAll("'", "''")}'`;
      else if (
        typeof column.default === 'number' ||
        typeof column.default === 'boolean'
      )
        def = ` DEFAULT ${Number(column.default)}`;
      return `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : column.isUnique ? ' UNIQUE' : ''}${column.notNull ? ' NOT NULL' : ''}${def}`;
    });
    await db().run(
      sql.raw(`CREATE TABLE "${config.name}" (${columns.join(',')})`)
    );
  }
  const { saveConfigs } = await import('../src/modules/config/service');
  await saveConfigs({
    stripe_secret_key: 'sk_test_fake_local_only',
    default_payment_provider: 'stripe',
    evolink_api_key: 'fake-local-only',
    resend_api_key: 'fake-local-only',
    resend_sender_email: 'video@example.invalid',
    welcome_email_enabled: 'false',
  });
  purchases = await import('../src/modules/video-purchases/service');
  actors = await import('../src/core/auth/video-actor');
  tasks = await import('../src/modules/ai-tasks/service');
  credits = await import('../src/modules/credits/service');
  payments = await import('../src/modules/payment/service');
  queue = await import('../src/routes/api/hotel-lobby/-purchase');
  guest = await purchases.createGuest();
});

after(async () => {
  mock.restoreAll();
  await rm(temp, { recursive: true, force: true });
});

function request(token = guest.token) {
  return new Request('https://example.invalid/api/hotel-lobby/videos', {
    headers: { cookie: `video_guest=${token}` },
  });
}

async function paidCheckout(contact = email) {
  const { StripeProvider } = await import('../src/core/payment/stripe');
  const { PaymentType } = await import('../src/core/payment/types');
  const purchase = await purchases.createPurchase({
    userId: guest.id,
    email: contact,
    input: JSON.stringify({
      photos: [
        'https://cdn.example.invalid/a.jpg',
        'https://cdn.example.invalid/b.jpg',
      ],
      size: 'full',
      length: '8',
      costCredits: 440,
    }),
  });
  assert.equal(await purchases.reserveCheckout(purchase.id, guest.id), true);
  const createMock = mock.method(
    StripeProvider.prototype,
    'createPayment',
    async () => ({
      provider: 'stripe',
      checkoutInfo: {
        sessionId,
        checkoutUrl: 'https://checkout.example.invalid/pay',
      },
      checkoutParams: {},
      checkoutResult: {},
    })
  );
  const checkout = await payments.createCheckout({
    userId: guest.id,
    userEmail: contact,
    provider: 'stripe',
    credits: 880,
    paymentOrder: {
      type: PaymentType.ONE_TIME,
      productId: 'pack_starter',
      price: { amount: 990, currency: 'usd' },
    },
  });
  createMock.mock.restore();
  await purchases.bindOrder(purchase.id, guest.id, checkout.orderNo, contact);
  return { purchase, checkout };
}

test('guest cookie authenticates only its owner and is HttpOnly/SameSite/Secure', async () => {
  const actor = await actors.getVideoActor(request());
  assert.equal(actor.userId, guest.id);
  assert.equal(actor.user, undefined);
  assert.deepEqual(actor.access.userIds, [guest.id]);
  const anonymous = await actors.getVideoActor(
    new Request('https://example.invalid/')
  );
  assert.equal(anonymous.userId, undefined);
  assert.deepEqual(anonymous.access.userIds, []);
  const tampered = await actors.getVideoActor(
    request(guest.token.slice(0, -1) + (guest.token.endsWith('a') ? 'b' : 'a'))
  );
  assert.equal(tampered.userId, undefined);
  const cookie = actors.videoCookie('video_guest', guest.token, request());
  assert.match(cookie, /HttpOnly; SameSite=Lax; Secure/);
  const stored = await db().select().from(schema.verification);
  assert.ok(stored.every((row: any) => !row.id.includes(guest.token)));
});

test('rejects cross-site mutation requests', () => {
  assert.throws(
    () =>
      actors.assertVideoOrigin(
        new Request('https://example.invalid/api', {
          headers: { origin: 'https://attacker.invalid' },
        })
      ),
    /origin/
  );
  assert.throws(
    () =>
      actors.assertVideoOrigin(
        new Request('https://example.invalid/api', {
          headers: { 'sec-fetch-site': 'cross-site' },
        })
      ),
    /origin/
  );
});

test('unpaid checkout never creates a billable video task', async () => {
  const { purchase, checkout } = await paidCheckout();
  purchaseId = purchase.id;
  orderNo = checkout.orderNo;
  await queue.startPaidPurchases(purchase.id);
  const row = await purchases.findPurchase(purchase.id);
  assert.equal(row?.status, 'waiting');
  assert.equal(row?.taskId, null);
  assert.equal(await credits.getBalance(guest.id), 0);
  assert.equal(await purchases.reserveCheckout(purchase.id, guest.id), false);
});

test('concurrent webhook and browser return grant purchased credits once', async () => {
  const { StripeProvider } = await import('../src/core/payment/stripe');
  const { PaymentStatus } = await import('../src/core/payment/types');
  paymentSession = {
    paymentStatus: PaymentStatus.SUCCESS,
    paymentResult: { id: sessionId },
    paymentInfo: {
      paymentAmount: 990,
      paymentCurrency: 'usd',
      paidAt: new Date(),
    },
  };
  const webhookMock = mock.method(
    StripeProvider.prototype,
    'getPaymentEvent',
    async () => ({ eventType: 'checkout.success', paymentSession })
  );
  const callbackMock = mock.method(
    StripeProvider.prototype,
    'getPaymentSession',
    async () => paymentSession
  );
  await Promise.all([
    payments.handleWebhook({
      req: new Request('https://example.invalid/webhook'),
      provider: 'stripe',
    }),
    payments.handlePaymentCallback(orderNo),
  ]);
  assert.equal(await credits.getBalance(guest.id), 880);
  const grants = await db()
    .select()
    .from(schema.credit)
    .where(eq(schema.credit.orderNo, orderNo));
  assert.equal(grants.length, 1);
  webhookMock.mock.restore();
  callbackMock.mock.restore();
});

test('paid background processing creates and submits one task even without a browser', async () => {
  let submissions = 0;
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (_input: any, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.image_urls, [
        'https://cdn.example.invalid/a.jpg',
        'https://cdn.example.invalid/b.jpg',
      ]);
      submissions++;
      return Response.json({ id: 'guest-scene-request', status: 'pending' });
    }
  );
  await Promise.all([
    queue.startPaidPurchases(purchaseId),
    queue.startPaidPurchases(purchaseId),
  ]);
  const purchase = (await purchases.findPurchase(purchaseId))!;
  taskId = purchase.taskId!;
  assert.equal(purchase.status, 'started');
  assert.equal(submissions, 1);
  assert.equal(await credits.getBalance(guest.id), 440);
  assert.equal(purchase.input, '{}');
  const task = (await tasks.findTask(taskId))!;
  assert.equal(JSON.parse(task.taskInfo!).emailProvided, true);
  assert.equal(
    JSON.parse(task.taskInfo!).imageRequestId,
    'guest-scene-request'
  );
  await queue.startPaidPurchases(purchaseId);
  assert.equal(submissions, 1);
  fetchMock.mock.restore();
});

test('history and downloads require a guest session or verified mailbox; email text alone grants nothing', async () => {
  const task = (await tasks.findTask(taskId))!;
  assert.equal(
    await purchases.canAccessTask(task, { userIds: [], verifiedEmails: [] }),
    false
  );
  const another = await purchases.createGuest();
  assert.equal(
    await purchases.canAccessTask(task, {
      userIds: [another.id],
      verifiedEmails: [],
    }),
    false
  );
  assert.equal(
    await purchases.canAccessTask(task, {
      userIds: [guest.id],
      verifiedEmails: [],
    }),
    true
  );
  const emailAccess = { userIds: [], verifiedEmails: [email] };
  assert.equal(await purchases.canAccessTask(task, emailAccess), true);
  assert.equal(
    (await purchases.listVideos(emailAccess, 'hotel-lobby-duet', 1, 12)).total,
    1
  );
  assert.equal(
    (
      await purchases.listVideos(
        { userIds: [], verifiedEmails: [] },
        'hotel-lobby-duet',
        1,
        12
      )
    ).total,
    0
  );
});

test('video-ready email is sent once and grants access through a hashed, single-use link', async () => {
  const { ResendProvider } = await import('../src/core/email/resend');
  const sent: any[] = [];
  const sendMock = mock.method(
    ResendProvider.prototype,
    'sendEmail',
    async (message: any) => {
      sent.push(message);
      return { success: true, provider: 'resend' };
    }
  );
  await tasks.updateTask({
    taskId,
    status: tasks.AITaskStatus.SUCCESS,
    taskResult: { video: { url: 'https://cdn.example.invalid/video.mp4' } },
  });
  await Promise.all([queue.deliverVideoEmails(), queue.deliverVideoEmails()]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, email);
  const match = /token=([a-f\d-]+)/.exec(sent[0].text)!;
  const token = match[1];
  assert.equal(await purchases.consumeEmailToken(token), email);
  assert.equal(await purchases.consumeEmailToken(token), undefined);
  const access = await purchases.saveToken('video-access', email, 60_000);
  const actor = await actors.getVideoActor(
    new Request('https://example.invalid/videos', {
      headers: { cookie: `video_access=${access}` },
    })
  );
  assert.deepEqual(actor.access.verifiedEmails, [email]);
  assert.equal(actor.userId, undefined);
  assert.equal(
    (await purchases.listVideos(actor.access, 'hotel-lobby-duet', 1, 12)).total,
    1
  );
  sendMock.mock.restore();
});

test('expired links and unverified cookies cannot recover videos; recovery email has a durable cooldown', async () => {
  const expired = await purchases.saveToken('video-email', email, -1);
  assert.equal(await purchases.consumeEmailToken(expired), undefined);
  assert.equal(await purchases.readToken('video-access', expired), undefined);
  const claims = await Promise.all([
    purchases.claimRecoveryEmail(email),
    purchases.claimRecoveryEmail(email),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
});

test('email is optional and a failure restores credits to the same guest for retry', async () => {
  const task = await tasks.createTask({
    userId: guest.id,
    mediaType: 'video',
    provider: 'evolink',
    model: 'hotel-lobby-duet',
    prompt: 'duet',
    costCredits: 440,
  });
  const purchase = await purchases.createPurchase({
    userId: guest.id,
    email: '',
    input: '{}',
    taskId: task.id,
  });
  assert.equal(purchase.email, '');
  const pipeline = await import('../src/routes/api/hotel-lobby/-pipeline');
  await Promise.all([
    pipeline.failPipelineTask(task.id, 'test failure'),
    pipeline.failPipelineTask(task.id, 'test failure'),
  ]);
  assert.equal(await credits.getBalance(guest.id), 440);
  assert.equal((await purchases.listVideoEmails()).length, 0);
});

async function d1Fixture() {
  const { getUuid } = await import('../src/lib/hash');
  const [sourceOrder] = await db()
    .select()
    .from(schema.order)
    .where(eq(schema.order.orderNo, orderNo));
  const nextOrder = `ORD_${getUuid()}`;
  await db()
    .insert(schema.order)
    .values({ ...sourceOrder, id: getUuid(), orderNo: nextOrder });
  await credits.grant({ userId: guest.id, credits: 880, orderNo: nextOrder });
  const purchase = await purchases.createPurchase({
    userId: guest.id,
    input: '{}',
  });
  await purchases.reserveCheckout(purchase.id, guest.id);
  await purchases.bindOrder(purchase.id, guest.id, nextOrder, '');
  return (await purchases.findPurchase(purchase.id))!;
}

async function emulateD1(fail = false) {
  const { createClient } = await import('@libsql/client');
  const client = createClient({ url: `file:${path.join(temp, 'test.db')}` });
  (globalThis as any).__CF_ENV__ = {
    DB: {
      prepare: (query: string) => ({
        bind: (...args: any[]) => ({ sql: query, args }),
      }),
      batch: async (queries: any[]) => {
        const statements = fail
          ? queries.map((query, i) =>
              i === 1
                ? { sql: 'INSERT INTO nonexistent_table VALUES (1)', args: [] }
                : query
            )
          : queries;
        const results = await client.batch(statements, 'write');
        return results.map((result) => ({
          meta: { changes: result.rowsAffected },
        }));
      },
    },
  };
  return () => {
    delete (globalThis as any).__CF_ENV__;
    client.close();
  };
}

const d1TaskData = {
  provider: 'evolink',
  model: 'hotel-lobby-duet',
  prompt: 'duet',
  costCredits: 440,
  info: { length: '10', sceneClaimedAt: Date.now() },
};

test('native D1 atomic batch creates one paid task and consumes one grant under duplicate starts', async () => {
  const purchase = await d1Fixture();
  const close = await emulateD1();
  try {
    const results = await Promise.all([
      purchases.createD1PaidTask(purchase, d1TaskData),
      purchases.createD1PaidTask(purchase, d1TaskData),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(
      (await purchases.findPurchase(purchase.id))?.taskId,
      purchase.id
    );
    const [grant] = await db()
      .select()
      .from(schema.credit)
      .where(eq(schema.credit.orderNo, purchase.orderNo!));
    assert.equal(grant.remainingCredits, 440);
    const task = (await tasks.findTask(purchase.id))!;
    assert.equal(JSON.parse(task.taskInfo!).creditId, `video_${purchase.id}`);
  } finally {
    close();
  }
});

test('a failed native D1 batch rolls back the task and credit deduction together', async () => {
  const purchase = await d1Fixture();
  const close = await emulateD1(true);
  try {
    await assert.rejects(
      purchases.createD1PaidTask(purchase, d1TaskData),
      /nonexistent_table/
    );
    assert.equal(await tasks.findTask(purchase.id), undefined);
    assert.equal(
      (await purchases.findPurchase(purchase.id))?.status,
      'waiting'
    );
    const [grant] = await db()
      .select()
      .from(schema.credit)
      .where(eq(schema.credit.orderNo, purchase.orderNo!));
    assert.equal(grant.remainingCredits, 880);
  } finally {
    close();
  }
});

test('rejects oversized uploads and disguised non-image input before checkout', async () => {
  await assert.rejects(
    queue.readVideoBody(
      new Request('https://example.invalid/api', {
        method: 'POST',
        headers: { 'Content-Length': String(18 * 1024 * 1024) },
        body: '{}',
      })
    ),
    /too large/
  );
  const fakePhoto = `data:image/png;base64,${Buffer.from('not an image').toString('base64')}`;
  await assert.rejects(
    queue.preparePurchase(
      guest.id,
      { photoA: fakePhoto, photoB: fakePhoto },
      '',
      'en'
    ),
    /Invalid photo file/
  );
});
