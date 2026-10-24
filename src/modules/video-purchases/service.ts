import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';

import { db } from '@/core/db';
import {
  aiTask,
  order,
  user,
  verification,
  videoPurchase,
  type AiTask,
  type VideoPurchase,
} from '@/config/db/schema';
import { getUuid } from '@/lib/hash';

const YEAR = 365 * 24 * 60 * 60 * 1000;
export type VideoAccess = { userIds: string[]; verifiedEmails: string[] };

export async function tokenHash(token: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, '0')
  ).join('');
}

export async function saveToken(
  kind: string,
  value: string,
  ttl: number,
  token = `${getUuid()}${getUuid()}`
) {
  const id = `${kind}:${await tokenHash(token)}`;
  await db()
    .insert(verification)
    .values({
      id,
      identifier: id,
      value,
      expiresAt: new Date(Date.now() + ttl),
    });
  return token;
}

export async function readToken(kind: string, token?: string) {
  if (!token || !/^[a-f\d-]{72}$/i.test(token)) return undefined;
  const [row] = await db()
    .select()
    .from(verification)
    .where(
      and(
        eq(verification.id, `${kind}:${await tokenHash(token)}`),
        gt(verification.expiresAt, new Date())
      )
    )
    .limit(1);
  return row?.value;
}

export async function consumeEmailToken(token: string) {
  if (!/^[a-f\d-]{72}$/i.test(token)) return undefined;
  const [row] = await db()
    .delete(verification)
    .where(
      and(
        eq(verification.id, `video-email:${await tokenHash(token)}`),
        gt(verification.expiresAt, new Date())
      )
    )
    .returning({ value: verification.value });
  return row?.value;
}

export async function createGuest() {
  const id = `guest_${getUuid()}`;
  await db()
    .insert(user)
    .values({ id, name: 'Guest', email: `${id}@guest.invalid` });
  return { id, token: await saveToken('video-guest', id, YEAR) };
}

export function purchaseAccess(access: VideoAccess) {
  return or(
    access.userIds.length
      ? inArray(videoPurchase.userId, access.userIds)
      : sql`0 = 1`,
    access.verifiedEmails.length
      ? inArray(videoPurchase.email, access.verifiedEmails)
      : sql`0 = 1`
  );
}

export async function createPurchase(data: {
  userId: string;
  email?: string;
  locale?: string;
  input: string;
  taskId?: string;
}) {
  const [row] = await db()
    .insert(videoPurchase)
    .values({
      id: getUuid(),
      ...data,
      email: data.email || '',
      status: data.taskId ? 'started' : 'draft',
    })
    .returning();
  return row as VideoPurchase;
}

export async function findPurchase(id: string, access?: VideoAccess) {
  const [row] = await db()
    .select()
    .from(videoPurchase)
    .where(
      and(eq(videoPurchase.id, id), access ? purchaseAccess(access) : undefined)
    )
    .limit(1);
  return row as VideoPurchase | undefined;
}

export async function bindOrder(
  id: string,
  userId: string,
  orderNo: string,
  email: string
) {
  const [row] = await db()
    .update(videoPurchase)
    .set({ orderNo, email, status: 'waiting' })
    .where(
      and(
        eq(videoPurchase.id, id),
        eq(videoPurchase.userId, userId),
        eq(videoPurchase.status, 'checkout'),
        isNull(videoPurchase.orderNo)
      )
    )
    .returning();
  if (!row) throw new Error('Video checkout already started');
}

export async function listPaidPurchases(limit = 10, id?: string) {
  return db()
    .select({ purchase: videoPurchase })
    .from(videoPurchase)
    .innerJoin(order, eq(videoPurchase.orderNo, order.orderNo))
    .where(
      and(
        eq(videoPurchase.status, 'waiting'),
        eq(order.status, 'paid'),
        isNull(order.deletedAt),
        id ? eq(videoPurchase.id, id) : undefined
      )
    )
    .orderBy(videoPurchase.createdAt)
    .limit(limit);
}

export async function reserveCheckout(id: string, userId: string) {
  const rows = await db()
    .update(videoPurchase)
    .set({ status: 'checkout' })
    .where(
      and(
        eq(videoPurchase.id, id),
        eq(videoPurchase.userId, userId),
        eq(videoPurchase.status, 'draft')
      )
    )
    .returning({ id: videoPurchase.id });
  return rows.length > 0;
}

export async function finishPurchase(
  id: string,
  patch: Partial<Pick<VideoPurchase, 'status' | 'taskId' | 'error' | 'input'>>
) {
  await db().update(videoPurchase).set(patch).where(eq(videoPurchase.id, id));
}

export async function canAccessTask(
  task: { id: string; userId: string },
  access: VideoAccess
) {
  if (access.userIds.includes(task.userId)) return true;
  const [row] = await db()
    .select({ id: videoPurchase.id })
    .from(videoPurchase)
    .where(and(eq(videoPurchase.taskId, task.id), purchaseAccess(access)))
    .limit(1);
  return !!row;
}

export async function listVideos(
  access: VideoAccess,
  model: string,
  page: number,
  pageSize: number
) {
  const where = and(
    eq(aiTask.model, model),
    isNull(aiTask.deletedAt),
    or(
      access.userIds.length
        ? inArray(aiTask.userId, access.userIds)
        : sql`0 = 1`,
      inArray(
        aiTask.id,
        db()
          .select({ id: videoPurchase.taskId })
          .from(videoPurchase)
          .where(purchaseAccess(access))
      )
    )
  );
  const [items, totals] = await Promise.all([
    db()
      .select()
      .from(aiTask)
      .where(where)
      .orderBy(desc(aiTask.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db().select({ n: count() }).from(aiTask).where(where),
  ]);
  return { items: items as AiTask[], total: Number(totals[0]?.n || 0) };
}

export async function emailHasPurchases(email: string) {
  const [row] = await db()
    .select({ id: videoPurchase.id })
    .from(videoPurchase)
    .where(
      and(eq(videoPurchase.email, email), eq(videoPurchase.status, 'started'))
    )
    .limit(1);
  return !!row;
}

export async function lastContact(userId: string) {
  const [row] = await db()
    .select({ email: videoPurchase.email })
    .from(videoPurchase)
    .where(eq(videoPurchase.userId, userId))
    .orderBy(desc(videoPurchase.createdAt))
    .limit(1);
  if (row) return row.email || '';
  const [paidOrder] = await db()
    .select({ email: order.userEmail })
    .from(order)
    .where(and(eq(order.userId, userId), eq(order.status, 'paid')))
    .orderBy(desc(order.createdAt))
    .limit(1);
  return paidOrder?.email || '';
}

export async function listVideoEmails(limit = 10) {
  return db()
    .select({ purchase: videoPurchase })
    .from(videoPurchase)
    .innerJoin(aiTask, eq(videoPurchase.taskId, aiTask.id))
    .where(
      and(
        eq(aiTask.status, 'success'),
        eq(videoPurchase.status, 'started'),
        isNull(videoPurchase.emailSentAt),
        sql`${videoPurchase.email} <> ''`,
        or(
          isNull(videoPurchase.emailClaimedAt),
          lt(videoPurchase.emailClaimedAt, new Date(Date.now() - 5 * 60_000))
        )
      )
    )
    .limit(limit);
}

export async function claimVideoEmail(id: string) {
  const rows = await db()
    .update(videoPurchase)
    .set({ emailClaimedAt: new Date() })
    .where(
      and(
        eq(videoPurchase.id, id),
        isNull(videoPurchase.emailSentAt),
        or(
          isNull(videoPurchase.emailClaimedAt),
          lt(videoPurchase.emailClaimedAt, new Date(Date.now() - 5 * 60_000))
        )
      )
    )
    .returning({ id: videoPurchase.id });
  return rows.length > 0;
}

export async function markVideoEmailSent(id: string) {
  await db()
    .update(videoPurchase)
    .set({ emailSentAt: new Date() })
    .where(eq(videoPurchase.id, id));
}

/** Database-backed cooldown survives Worker restarts and cannot be bypassed with cookies. */
export async function claimRecoveryEmail(email: string) {
  const id = `video-recovery-rate:${await tokenHash(email)}`;
  await db()
    .delete(verification)
    .where(
      and(eq(verification.id, id), lt(verification.expiresAt, new Date()))
    );
  const rows = await db()
    .insert(verification)
    .values({
      id,
      identifier: id,
      value: '',
      expiresAt: new Date(Date.now() + 60_000),
    })
    .onConflictDoNothing()
    .returning({ id: verification.id });
  return rows.length > 0;
}

export async function existingCheckout(orderNo: string) {
  const [row] = await db()
    .select({ url: order.checkoutUrl, status: order.status })
    .from(order)
    .where(and(eq(order.orderNo, orderNo), isNull(order.deletedAt)))
    .limit(1);
  return row;
}

/**
 * A paid checkout owns a dedicated credit grant. On D1, reserve its task,
 * consume that grant and attach the task in one native atomic batch.
 */
export async function createD1PaidTask(
  purchase: VideoPurchase,
  data: {
    provider: string;
    model: string;
    prompt: string;
    costCredits: number;
    info: Record<string, unknown>;
  }
) {
  const { executeD1Batch } = await import('@/core/db/d1-batch');
  const { credit } = await import('@/config/db/schema');
  const [grant] = await db()
    .select()
    .from(credit)
    .where(
      and(
        eq(credit.orderNo, purchase.orderNo!),
        eq(credit.userId, purchase.userId),
        eq(credit.transactionType, 'grant'),
        eq(credit.status, 'active')
      )
    )
    .limit(1);
  if (!grant || grant.remainingCredits < data.costCredits) return null;
  const taskId = purchase.id;
  const consumeId = `video_${purchase.id}`;
  const now = Date.now();
  const info = JSON.stringify({ ...data.info, creditId: consumeId });
  const detail = JSON.stringify([
    {
      creditId: grant.id,
      transactionNo: grant.transactionNo,
      creditsConsumed: data.costCredits,
      creditsBefore: grant.remainingCredits,
      creditsAfter: grant.remainingCredits - data.costCredits,
    },
  ]);
  const eligible = sql`EXISTS (SELECT 1 FROM video_purchase p JOIN "order" o ON o.order_no = p.order_no JOIN credit c ON c.id = ${grant.id}
    WHERE p.id = ${purchase.id} AND p.status = 'waiting' AND p.task_id IS NULL AND o.status = 'paid' AND c.remaining_credits >= ${data.costCredits})`;
  const activeClaim = sql`EXISTS (SELECT 1 FROM video_purchase WHERE id = ${purchase.id} AND status = 'waiting' AND task_id IS NULL)`;
  const results = await executeD1Batch([
    sql`INSERT INTO ai_task (id, user_id, media_type, provider, model, prompt, status, cost_credits, task_info, created_at, updated_at)
      SELECT ${taskId}, ${purchase.userId}, 'video', ${data.provider}, ${data.model}, ${data.prompt}, 'pending', ${data.costCredits}, ${info}, ${now}, ${now} WHERE ${eligible}`,
    sql`INSERT INTO credit (id, user_id, user_email, transaction_no, transaction_type, transaction_scene, credits, remaining_credits, status, consumed_detail, metadata, created_at, updated_at)
      SELECT ${consumeId}, ${purchase.userId}, ${purchase.email}, ${consumeId}, 'consume', 'ai_task', ${-data.costCredits}, 0, 'active', ${detail}, ${JSON.stringify({ taskId })}, ${now}, ${now}
      WHERE ${activeClaim} AND EXISTS (SELECT 1 FROM ai_task WHERE id = ${taskId})`,
    sql`UPDATE credit SET remaining_credits = remaining_credits - ${data.costCredits}, updated_at = ${now}
      WHERE id = ${grant.id} AND ${activeClaim} AND EXISTS (SELECT 1 FROM credit WHERE id = ${consumeId})`,
    sql`UPDATE video_purchase SET status = 'started', task_id = ${taskId}
      WHERE id = ${purchase.id} AND status = 'waiting' AND EXISTS (SELECT 1 FROM credit WHERE id = ${consumeId})`,
  ]);
  if (!results[0]?.meta.changes) return null;
  const [task] = await db()
    .select()
    .from(aiTask)
    .where(eq(aiTask.id, taskId))
    .limit(1);
  return task;
}
