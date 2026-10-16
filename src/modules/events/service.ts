import {
  and,
  count,
  countDistinct,
  eq,
  gte,
  inArray,
  isNotNull,
  like,
  lt,
  ne,
  notInArray,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/core/db';
import {
  event,
  hotelPreview,
  order,
  trafficDaily,
  user,
} from '@/config/db/schema';
import { getUuid } from '@/lib/hash';

// ─── Event vocabulary ────────────────────────────────────────────────────────

/** Funnel steps in order. `paid` comes from the order table, not events. */
export const FUNNEL_STEPS = [
  { key: 'visit', event: 'hl_home_view' },
  { key: 'upload', event: 'hl_photo_upload' },
  { key: 'generate', event: 'hl_generate_click' },
  { key: 'paywall', event: 'hl_paywall_open' },
  { key: 'plan', event: 'hl_plan_select' },
  { key: 'checkout', event: 'hl_checkout_start' },
  { key: 'paid', event: null },
] as const;

export type FunnelStepKey = (typeof FUNNEL_STEPS)[number]['key'];

/** Names the browser may send (anything else is dropped). */
export const CLIENT_EVENTS = new Set([
  'hl_home_view',
  'hl_photo_upload',
  'hl_generate_click',
  'hl_paywall_open',
  'hl_plan_select',
  'begin_checkout',
  'hl_sign_in_prompt',
  'hl_animate_click',
  'hl_video_start',
  'hl_video_ready',
  'hl_preview_ready',
]);

/** Owner's own test account — excluded from every dashboard number. */
export const TEST_USER_IDS = ['d77bb77a-7051-4d84-8c12-9c1780a68109'];

// Dashboard days are cut at Beijing midnight.
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Visitor identity + first touch (cookies) ───────────────────────────────

export const VISITOR_COOKIE = 'hl_did';
const FIRST_TOUCH_COOKIE = 'hl_ft';
const YEAR_S = 31536000;

export type FirstTouch = {
  source: string;
  referrer: string;
  utm: string;
  country: string;
};

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}

const clip = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';

/** Referrer host / utm_source → a coarse channel name. */
export function classifySource(referrerHost: string, utmSource: string) {
  const s = (utmSource || referrerHost).toLowerCase();
  if (!s) return 'direct';
  const rules: [RegExp, string][] = [
    [/chatgpt|openai/, 'chatgpt'],
    [/perplexity/, 'perplexity'],
    [/gemini|bard/, 'gemini'],
    [/claude|anthropic/, 'claude'],
    [/copilot/, 'copilot'],
    [/google/, 'google'],
    [/bing/, 'bing'],
    [/duckduckgo/, 'duckduckgo'],
    [/yandex/, 'yandex'],
    [/baidu/, 'baidu'],
    [/facebook|^fb$|instagram/, 'meta'],
    [/^t\.co$|twitter|^x\.com$/, 'x'],
    [/reddit/, 'reddit'],
    [/youtube/, 'youtube'],
    [/tiktok/, 'tiktok'],
  ];
  for (const [re, name] of rules) if (re.test(s)) return name;
  return s.replace(/^www\./, '').slice(0, 64);
}

function encodeFirstTouch(ft: FirstTouch) {
  return [ft.source, ft.country, ft.referrer, ft.utm]
    .map((v) => encodeURIComponent(v))
    .join('|');
}

function decodeFirstTouch(raw: string | undefined): FirstTouch | null {
  if (!raw) return null;
  try {
    const [source, country, referrer, utm] = raw
      .split('|')
      .map((v) => decodeURIComponent(v));
    return source
      ? {
          source,
          country: country || '',
          referrer: referrer || '',
          utm: utm || '',
        }
      : null;
  } catch {
    return null;
  }
}

export type VisitorContext = {
  visitorId: string;
  isNewVisitor: boolean;
  firstTouch: FirstTouch;
  isNewFirstTouch: boolean;
};

/**
 * Resolve the visitor id and first-touch attribution for a request. The
 * cookies win; `clientTouch` (what the browser saw on its first landing) is
 * only used the first time, then pinned by cookie.
 */
export function resolveVisitor(
  request: Request,
  clientTouch?: { referrer?: unknown; utm?: unknown }
): VisitorContext {
  const existingId = readCookie(request, VISITOR_COOKIE);
  const validId = existingId && /^[\w-]{8,64}$/.test(existingId);
  const pinned = decodeFirstTouch(readCookie(request, FIRST_TOUCH_COOKIE));

  let firstTouch = pinned;
  if (!firstTouch) {
    const referrer = clip(clientTouch?.referrer, 120)
      .toLowerCase()
      .replace(/^www\./, '');
    const utm = clip(clientTouch?.utm, 160);
    firstTouch = {
      source: classifySource(referrer, utm.split('/')[0] || ''),
      referrer,
      utm,
      country: clip(request.headers.get('cf-ipcountry'), 8).toUpperCase(),
    };
  }

  return {
    visitorId: validId ? existingId! : getUuid(),
    isNewVisitor: !validId,
    firstTouch,
    isNewFirstTouch: !pinned,
  };
}

/** Set-Cookie values to pin a freshly minted visitor / first touch. */
export function visitorCookies(request: Request, ctx: VisitorContext) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const attrs = `; Path=/; Max-Age=${YEAR_S}; HttpOnly; SameSite=Lax${secure}`;
  const cookies: string[] = [];
  if (ctx.isNewVisitor)
    cookies.push(`${VISITOR_COOKIE}=${ctx.visitorId}${attrs}`);
  if (ctx.isNewFirstTouch) {
    cookies.push(
      `${FIRST_TOUCH_COOKIE}=${encodeFirstTouch(ctx.firstTouch)}${attrs}`
    );
  }
  return cookies;
}

const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|monitor/i;

export function isBotRequest(request: Request) {
  const ua = request.headers.get('user-agent') || '';
  return !ua || BOT_UA.test(ua);
}

// ─── Writing ────────────────────────────────────────────────────────────────

export type RecordEventInput = {
  visitor: VisitorContext;
  event: string;
  userId?: string | null;
  build?: string;
  experiment?: string;
  paymentProvider?: string | null;
  productId?: string | null;
  path?: string | null;
  props?: Record<string, unknown> | null;
};

export async function recordEvent(input: RecordEventInput) {
  const { visitor } = input;
  const props =
    input.props && Object.keys(input.props).length
      ? JSON.stringify(input.props).slice(0, 1000)
      : null;
  await db()
    .insert(event)
    .values({
      id: getUuid(),
      visitorId: visitor.visitorId,
      userId: input.userId || null,
      event: input.event,
      firstSource: visitor.firstTouch.source,
      firstReferrer: visitor.firstTouch.referrer,
      firstUtm: visitor.firstTouch.utm,
      firstCountry: visitor.firstTouch.country,
      build: clip(input.build, 40),
      experiment: clip(input.experiment, 80),
      paymentProvider: clip(input.paymentProvider, 32) || null,
      productId: clip(input.productId, 80) || null,
      path: clip(input.path, 200) || null,
      props,
    });
}

/**
 * Server-side event (checkout created, payment returned). Requests from the
 * browser carry the visitor cookies; when they don't, fall back to the
 * user's earliest event so the row still lands on the right visitor.
 */
export async function recordServerEvent(
  request: Request,
  input: Omit<RecordEventInput, 'visitor' | 'build'>
) {
  let visitor = resolveVisitor(request);
  if (visitor.isNewVisitor && input.userId) {
    const [prior] = await db()
      .select()
      .from(event)
      .where(eq(event.userId, input.userId))
      .orderBy(event.createdAt)
      .limit(1);
    if (prior) {
      visitor = {
        visitorId: prior.visitorId,
        isNewVisitor: false,
        isNewFirstTouch: false,
        firstTouch: {
          source: prior.firstSource,
          referrer: prior.firstReferrer,
          utm: prior.firstUtm,
          country: prior.firstCountry,
        },
      };
    }
  }
  await recordEvent({ ...input, visitor, build: __GIT_COMMIT__ });
}

/** Record `hl_payment_success` once per order (callback can be revisited). */
export async function recordPaymentSuccess(request: Request, orderNo: string) {
  const [paid] = await db()
    .select()
    .from(order)
    .where(and(eq(order.orderNo, orderNo), eq(order.status, 'paid')))
    .limit(1);
  if (!paid) return;
  const [seen] = await db()
    .select({ id: event.id })
    .from(event)
    .where(
      and(
        eq(event.event, 'hl_payment_success'),
        eq(event.userId, paid.userId),
        sql`${event.props} like ${`%"${orderNo}"%`}`
      )
    )
    .limit(1);
  if (seen) return;
  await recordServerEvent(request, {
    event: 'hl_payment_success',
    userId: paid.userId,
    paymentProvider: paid.paymentProvider,
    productId: paid.productId,
    props: { order_no: orderNo, amount: paid.amount, currency: paid.currency },
  });
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

type Counts = Partial<Record<FunnelStepKey, number>>;

export type FunnelRow = {
  key: string;
  steps: Counts;
  orders: number;
  revenue: number; // cents
};

export type PeriodStats = {
  visitors: number;
  paywall: number;
  checkout: number;
  payers: number;
  orders: number;
  revenue: number;
};

/**
 * One day of the long view: Cloudflare Web Analytics visits (imported into
 * traffic_daily) next to business-table counts, so days before the event
 * table still have a funnel.
 */
export type HistoryRow = {
  day: string;
  visits: number; // sampled estimate, excluded countries subtracted
  pageViews: number;
  previews: number; // distinct devices that ran a free preview (≤ 10-09)
  signups: number;
  checkoutUsers: number; // distinct users who created an order
  payers: number;
  orders: number;
  revenue: number; // cents
};

export type TrafficShare = { value: string; visits: number; pageViews: number };

export type FunnelDashboard = {
  generatedAt: number;
  timezone: string;
  days: number;
  testUserIds: string[];
  excludedCountries: string[];
  today: PeriodStats;
  yesterday: PeriodStats;
  unpaidCheckout24h: number;
  daily: FunnelRow[];
  bySource: FunnelRow[];
  byCountry: FunnelRow[];
  byBuild: FunnelRow[];
  byProvider: {
    provider: string;
    checkoutVisitors: number;
    ordersCreated: number;
    ordersPaid: number;
    payers: number;
    revenue: number;
  }[];
  history: HistoryRow[];
  /** Last day present in traffic_daily ('' if never imported). */
  trafficSyncedTo: string;
  topReferers: TrafficShare[];
  topCountries: TrafficShare[];
  topPaths: TrafficShare[];
};

const STEP_BY_EVENT = new Map<string, FunnelStepKey>(
  FUNNEL_STEPS.filter((s) => s.event).map((s) => [s.event!, s.key])
);
const STEP_EVENTS = [...STEP_BY_EVENT.keys()];

const dayExpr = (col: AnyColumn) =>
  sql<string>`strftime('%Y-%m-%d', (${col} + ${TZ_OFFSET_MS}) / 1000, 'unixepoch')`;

function excludedVisitors() {
  return db()
    .select({ v: event.visitorId })
    .from(event)
    .where(inArray(event.userId, TEST_USER_IDS));
}

function eventFilter(from: number, to: number, excludeCountries: string[]) {
  const conds: SQL[] = [
    gte(event.createdAt, new Date(from)),
    lt(event.createdAt, new Date(to)),
    notInArray(event.visitorId, excludedVisitors()),
  ];
  if (excludeCountries.length) {
    conds.push(notInArray(event.firstCountry, excludeCountries));
  }
  return and(...conds)!;
}

/** Distinct visitors per (dimension, step event). */
async function stepCounts(
  dim: SQL | AnyColumn,
  from: number,
  to: number,
  excludeCountries: string[]
) {
  const rows: { k: string | null; ev: string; n: number }[] = await db()
    .select({
      k: sql<string>`${dim}`.as('k'),
      ev: event.event,
      n: countDistinct(event.visitorId),
    })
    .from(event)
    .where(
      and(
        eventFilter(from, to, excludeCountries),
        inArray(event.event, STEP_EVENTS)
      )
    )
    .groupBy(sql`k`, event.event);
  return rows;
}

type PaidOrder = {
  userId: string;
  amount: number;
  provider: string;
  paidAt: number;
  source: string;
  country: string;
  build: string;
};

/** Paid orders in range with the payer's first-touch + checkout build. */
async function paidOrders(
  from: number,
  to: number,
  excludeCountries: string[]
): Promise<PaidOrder[]> {
  const firstTouch = db()
    .select({
      userId: event.userId,
      source: sql<string>`${event.firstSource}`.as('ft_source'),
      country: sql<string>`${event.firstCountry}`.as('ft_country'),
      t: sql<number>`min(${event.createdAt})`.as('ft_t'),
    })
    .from(event)
    .where(isNotNull(event.userId))
    .groupBy(event.userId)
    .as('ft');
  const lastCheckout = db()
    .select({
      userId: event.userId,
      build: sql<string>`${event.build}`.as('co_build'),
      t: sql<number>`max(${event.createdAt})`.as('co_t'),
    })
    .from(event)
    .where(eq(event.event, 'hl_checkout_start'))
    .groupBy(event.userId)
    .as('co');

  const rows = await db()
    .select({
      userId: order.userId,
      amount: order.amount,
      provider: order.paymentProvider,
      paidAt: order.paidAt,
      source: firstTouch.source,
      country: firstTouch.country,
      build: lastCheckout.build,
    })
    .from(order)
    .leftJoin(firstTouch, eq(firstTouch.userId, order.userId))
    .leftJoin(lastCheckout, eq(lastCheckout.userId, order.userId))
    .where(
      and(
        eq(order.status, 'paid'),
        gte(order.paidAt, new Date(from)),
        lt(order.paidAt, new Date(to)),
        notInArray(order.userId, TEST_USER_IDS)
      )
    );

  return rows
    .map((r: any) => ({
      userId: r.userId,
      amount: Number(r.amount) || 0,
      provider: r.provider || '',
      paidAt: r.paidAt instanceof Date ? r.paidAt.getTime() : Number(r.paidAt),
      source: r.source || 'unknown',
      country: r.country || 'unknown',
      build: r.build || 'unknown',
    }))
    .filter((r: PaidOrder) => !excludeCountries.includes(r.country));
}

function buildRows(
  counts: { k: string | null; ev: string; n: number }[],
  paid: PaidOrder[],
  paidKey: (p: PaidOrder) => string
): FunnelRow[] {
  const rows = new Map<string, FunnelRow>();
  const row = (key: string) => {
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { key, steps: {}, orders: 0, revenue: 0 }));
    return r;
  };
  for (const c of counts) {
    const step = STEP_BY_EVENT.get(c.ev);
    if (step) row(c.k || 'unknown').steps[step] = Number(c.n) || 0;
  }
  const payers = new Map<string, Set<string>>();
  for (const p of paid) {
    const key = paidKey(p);
    const r = row(key);
    r.orders += 1;
    r.revenue += p.amount;
    if (!payers.has(key)) payers.set(key, new Set());
    payers.get(key)!.add(p.userId);
  }
  for (const [key, set] of payers) row(key).steps.paid = set.size;
  return [...rows.values()];
}

const byVisitors = (a: FunnelRow, b: FunnelRow) =>
  (b.steps.visit ?? 0) - (a.steps.visit ?? 0) || b.revenue - a.revenue;

async function periodStats(
  from: number,
  to: number,
  excludeCountries: string[]
): Promise<PeriodStats> {
  const [counts, paid] = await Promise.all([
    db()
      .select({ ev: event.event, n: countDistinct(event.visitorId) })
      .from(event)
      .where(
        and(
          eventFilter(from, to, excludeCountries),
          inArray(event.event, [
            'hl_home_view',
            'hl_paywall_open',
            'hl_checkout_start',
          ])
        )
      )
      .groupBy(event.event),
    paidOrders(from, to, excludeCountries),
  ]);
  const n = (ev: string) =>
    Number(counts.find((c: { ev: string }) => c.ev === ev)?.n) || 0;
  return {
    visitors: n('hl_home_view'),
    paywall: n('hl_paywall_open'),
    checkout: n('hl_checkout_start'),
    payers: new Set(paid.map((p) => p.userId)).size,
    orders: paid.length,
    revenue: paid.reduce((sum, p) => sum + p.amount, 0),
  };
}

/** Drop the all-zero days before the site had any data (pre-launch). */
function trimLeadingEmpty(rows: HistoryRow[]) {
  const first = rows.findIndex(
    (r) => r.pageViews || r.visits || r.previews || r.signups || r.payers
  );
  return first === -1 ? rows : rows.slice(first);
}

/** Daily traffic + business counts for [from, to), keyed by UTC+8 day. */
async function historyRows(
  from: number,
  to: number,
  fromDay: string,
  toDay: string,
  excludeCountries: string[]
) {
  const dayWhere = and(
    gte(trafficDaily.day, fromDay),
    lt(trafficDaily.day, toDay + '~')
  )!;
  const shares = (dim: string) =>
    db()
      .select({
        value: trafficDaily.value,
        visits: sql<number>`sum(${trafficDaily.visits})`,
        pageViews: sql<number>`sum(${trafficDaily.pageViews})`,
      })
      .from(trafficDaily)
      .where(and(dayWhere, eq(trafficDaily.dim, dim)))
      .groupBy(trafficDaily.value);
  const range = (col: AnyColumn) =>
    and(gte(col, new Date(from)), lt(col, new Date(to)))!;

  const [
    traffic,
    excluded,
    admin,
    synced,
    previews,
    signups,
    checkout,
    paid,
    ref,
    ctry,
    path,
  ] = await Promise.all([
    db()
      .select({
        day: trafficDaily.day,
        visits: trafficDaily.visits,
        pageViews: trafficDaily.pageViews,
      })
      .from(trafficDaily)
      .where(and(dayWhere, eq(trafficDaily.dim, 'total'))),
    excludeCountries.length
      ? db()
          .select({
            day: trafficDaily.day,
            visits: sql<number>`sum(${trafficDaily.visits})`,
            pageViews: sql<number>`sum(${trafficDaily.pageViews})`,
          })
          .from(trafficDaily)
          .where(
            and(
              dayWhere,
              eq(trafficDaily.dim, 'country'),
              inArray(trafficDaily.value, excludeCountries)
            )
          )
          .groupBy(trafficDaily.day)
      : Promise.resolve([]),
    // Admin pages are the owner's own browsing, not traffic.
    db()
      .select({
        day: trafficDaily.day,
        visits: sql<number>`sum(${trafficDaily.visits})`,
        pageViews: sql<number>`sum(${trafficDaily.pageViews})`,
      })
      .from(trafficDaily)
      .where(
        and(
          dayWhere,
          eq(trafficDaily.dim, 'path'),
          like(trafficDaily.value, '/admin%')
        )
      )
      .groupBy(trafficDaily.day),
    db()
      .select({ day: sql<string>`max(${trafficDaily.day})` })
      .from(trafficDaily),
    db()
      .select({
        day: dayExpr(hotelPreview.createdAt).as('d'),
        n: countDistinct(hotelPreview.deviceId),
      })
      .from(hotelPreview)
      .where(range(hotelPreview.createdAt))
      .groupBy(sql`d`),
    db()
      .select({ day: dayExpr(user.createdAt).as('d'), n: count() })
      .from(user)
      .where(and(range(user.createdAt), notInArray(user.id, TEST_USER_IDS)))
      .groupBy(sql`d`),
    db()
      .select({
        day: dayExpr(order.createdAt).as('d'),
        n: countDistinct(order.userId),
      })
      .from(order)
      .where(
        and(
          range(order.createdAt),
          notInArray(order.userId, TEST_USER_IDS),
          ne(order.status, 'deleted')
        )
      )
      .groupBy(sql`d`),
    db()
      .select({
        day: dayExpr(order.paidAt).as('d'),
        payers: countDistinct(order.userId),
        orders: count(),
        revenue: sql<number>`sum(${order.amount})`,
      })
      .from(order)
      .where(
        and(
          eq(order.status, 'paid'),
          range(order.paidAt),
          notInArray(order.userId, TEST_USER_IDS)
        )
      )
      .groupBy(sql`d`),
    shares('referer'),
    shares('country'),
    shares('path'),
  ]);

  const rows = new Map<string, HistoryRow>();
  const row = (day: string) => {
    let r = rows.get(day);
    if (!r) {
      rows.set(
        day,
        (r = {
          day,
          visits: 0,
          pageViews: 0,
          previews: 0,
          signups: 0,
          checkoutUsers: 0,
          payers: 0,
          orders: 0,
          revenue: 0,
        })
      );
    }
    return r;
  };
  for (let t = from; t < to; t += DAY_MS) {
    row(new Date(t + TZ_OFFSET_MS).toISOString().slice(0, 10));
  }
  for (const t of traffic as any[]) {
    const r = row(t.day);
    r.visits += Number(t.visits) || 0;
    r.pageViews += Number(t.pageViews) || 0;
  }
  for (const e of [...(excluded as any[]), ...(admin as any[])]) {
    const r = row(e.day);
    r.visits = Math.max(0, r.visits - (Number(e.visits) || 0));
    r.pageViews = Math.max(0, r.pageViews - (Number(e.pageViews) || 0));
  }
  for (const p of previews as any[]) row(p.day).previews = Number(p.n) || 0;
  for (const u of signups as any[]) row(u.day).signups = Number(u.n) || 0;
  for (const c of checkout as any[])
    row(c.day).checkoutUsers = Number(c.n) || 0;
  for (const p of paid as any[]) {
    const r = row(p.day);
    r.payers = Number(p.payers) || 0;
    r.orders = Number(p.orders) || 0;
    r.revenue = Number(p.revenue) || 0;
  }

  const top = (list: any[], key: 'visits' | 'pageViews', skip: string[] = []) =>
    list
      .map((x) => ({
        value: String(x.value ?? ''),
        visits: Number(x.visits) || 0,
        pageViews: Number(x.pageViews) || 0,
      }))
      .filter((x) => !skip.includes(x.value))
      .sort((a, b) => b[key] - a[key])
      .slice(0, 10);

  return {
    history: trimLeadingEmpty(
      [...rows.values()]
        .filter((r) => r.day >= fromDay && r.day <= toDay)
        .sort((a, b) => a.day.localeCompare(b.day))
    ).reverse(),
    trafficSyncedTo: String((synced as any[])[0]?.day ?? ''),
    topReferers: top(ref as any[], 'visits'),
    topCountries: top(ctry as any[], 'visits', excludeCountries),
    topPaths: top(
      (path as any[]).filter((x) => !String(x.value).startsWith('/admin')),
      'pageViews'
    ),
  };
}

/** Start of the Beijing-time day containing `ts`. */
function dayStart(ts: number) {
  return Math.floor((ts + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS;
}

export async function getFunnelDashboard(params: {
  days: number;
  excludeCountries?: string[];
  now?: number;
}): Promise<FunnelDashboard> {
  const now = params.now ?? Date.now();
  const days = Math.min(90, Math.max(1, Math.floor(params.days)));
  const excl = (params.excludeCountries ?? []).map((c) => c.toUpperCase());
  const todayStart = dayStart(now);
  const from = todayStart - (days - 1) * DAY_MS;

  const [today, yesterday, daily, source, country, build, paid] =
    await Promise.all([
      periodStats(todayStart, now, excl),
      periodStats(todayStart - DAY_MS, now - DAY_MS, excl),
      stepCounts(dayExpr(event.createdAt), from, now, excl),
      stepCounts(event.firstSource, from, now, excl),
      stepCounts(event.firstCountry, from, now, excl),
      stepCounts(event.build, from, now, excl),
      paidOrders(from, now, excl),
    ]);

  const toDay = (ts: number) =>
    new Date(ts + TZ_OFFSET_MS).toISOString().slice(0, 10);
  const longView = await historyRows(from, now, toDay(from), toDay(now), excl);

  // ── Payment providers: orders created in range (cohort) vs paid.
  const orderWhere = and(
    gte(order.createdAt, new Date(from)),
    lt(order.createdAt, new Date(now)),
    notInArray(order.userId, TEST_USER_IDS),
    ne(order.status, 'deleted')
  );
  const [providerOrders, providerCheckout, unpaid] = await Promise.all([
    db()
      .select({
        provider: order.paymentProvider,
        created: count(),
        paid: sql<number>`sum(case when ${order.status} = 'paid' then 1 else 0 end)`,
        payers: sql<number>`count(distinct case when ${order.status} = 'paid' then ${order.userId} end)`,
        revenue: sql<number>`sum(case when ${order.status} = 'paid' then ${order.amount} else 0 end)`,
      })
      .from(order)
      .where(orderWhere)
      .groupBy(order.paymentProvider),
    db()
      .select({
        provider: event.paymentProvider,
        n: countDistinct(event.visitorId),
      })
      .from(event)
      .where(
        and(eventFilter(from, now, excl), eq(event.event, 'hl_checkout_start'))
      )
      .groupBy(event.paymentProvider),
    // Users who reached checkout in the last 24h but have no paid order since.
    db()
      .select({ n: countDistinct(event.userId) })
      .from(event)
      .where(
        and(
          eventFilter(now - DAY_MS, now, excl),
          eq(event.event, 'hl_checkout_start'),
          isNotNull(event.userId),
          notInArray(
            event.userId,
            db()
              .select({ u: order.userId })
              .from(order)
              .where(
                and(
                  eq(order.status, 'paid'),
                  gte(order.paidAt, new Date(now - DAY_MS))
                )
              )
          )
        )
      ),
  ]);

  const providers = new Set<string>([
    ...providerOrders.map((r: any) => r.provider || ''),
    ...providerCheckout.map((r: any) => r.provider || ''),
  ]);
  const byProvider = [...providers]
    .map((provider) => {
      const o: any = providerOrders.find(
        (r: any) => (r.provider || '') === provider
      );
      const c: any = providerCheckout.find(
        (r: any) => (r.provider || '') === provider
      );
      return {
        provider: provider || 'unknown',
        checkoutVisitors: Number(c?.n) || 0,
        ordersCreated: Number(o?.created) || 0,
        ordersPaid: Number(o?.paid) || 0,
        payers: Number(o?.payers) || 0,
        revenue: Number(o?.revenue) || 0,
      };
    })
    .sort((a, b) => b.ordersCreated - a.ordersCreated);

  // Every day in range shows, even with no events.
  const dailyRows = buildRows(daily, paid, (p) => toDay(p.paidAt));
  for (let t = from; t <= now; t += DAY_MS) {
    const key = toDay(t);
    if (!dailyRows.some((r) => r.key === key)) {
      dailyRows.push({ key, steps: {}, orders: 0, revenue: 0 });
    }
  }

  return {
    generatedAt: now,
    timezone: 'UTC+8',
    days,
    testUserIds: TEST_USER_IDS,
    excludedCountries: excl,
    today,
    yesterday,
    unpaidCheckout24h: Number(unpaid[0]?.n) || 0,
    daily: dailyRows.sort((a, b) => b.key.localeCompare(a.key)),
    bySource: buildRows(source, paid, (p) => p.source).sort(byVisitors),
    byCountry: buildRows(country, paid, (p) => p.country).sort(byVisitors),
    byBuild: buildRows(build, paid, (p) => p.build).sort(byVisitors),
    byProvider,
    ...longView,
  };
}
