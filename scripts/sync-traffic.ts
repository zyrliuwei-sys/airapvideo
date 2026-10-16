/**
 * Import daily browser traffic from Cloudflare Web Analytics into the
 * `traffic_daily` table (read by /admin/funnel → "Historical traffic").
 *
 *   npx tsx scripts/sync-traffic.ts                 # since 2026-09-28 → now
 *   npx tsx scripts/sync-traffic.ts --since 2026-10-10
 *   npx tsx scripts/sync-traffic.ts --dry-run       # print, write nothing
 *
 * Auth: CLOUDFLARE_API_TOKEN (needs Account Analytics: Read) or, if unset,
 * the local `wrangler login` OAuth token. Writes go to the remote D1 named in
 * wrangler.jsonc via `wrangler d1 execute --remote`. Re-running is safe: rows
 * are keyed by day|dim|value and overwritten.
 *
 * Web Analytics is sampled, so numbers are estimates (often multiples of 10).
 * "visits" = page loads whose referrer is not this site (≈ sessions);
 * "page views" = all page loads. Days are cut at UTC+8 like the dashboard.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CHUNK_DAYS = 10; // keeps each grouped query under the 10k row limit

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const dryRun = process.argv.includes('--dry-run');

function wranglerConfig() {
  const raw = readFileSync('wrangler.jsonc', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const host = new URL(raw.match(/"VITE_APP_URL"\s*:\s*"([^"]+)"/)![1]).host;
  const dbName = raw.match(/"database_name"\s*:\s*"([^"]+)"/)![1];
  return { host, dbName };
}

function apiToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const out = execSync('npx wrangler auth token', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return out.trim().split('\n').pop()!.trim();
}

async function cf(token: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json();
  if (json.errors?.length) {
    throw new Error(JSON.stringify(json.errors).slice(0, 500));
  }
  return json;
}

type Dim = 'total' | 'referer' | 'country' | 'path';
const DIM_FIELD: Record<Exclude<Dim, 'total'>, string> = {
  referer: 'refererHost',
  country: 'countryName',
  path: 'requestPath',
};

type HourRow = {
  hour: number;
  value: string;
  visits: number;
  pageViews: number;
};

/** One request: every dimension as an aliased group query, hourly. */
async function hourly(
  token: string,
  accountTag: string,
  host: string,
  from: Date,
  to: Date
): Promise<Record<Dim, HourRow[]>> {
  const dims: Dim[] = ['total', 'referer', 'country', 'path'];
  const groups = dims
    .map((dim) => {
      const field = dim === 'total' ? '' : DIM_FIELD[dim];
      return `${dim}: rumPageloadEventsAdaptiveGroups(limit: 10000, filter: $filter) {
        count sum { visits } dimensions { datetimeHour ${field} }
      }`;
    })
    .join('\n');
  const query = `query($acc: string!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!) {
    viewer { accounts(filter: { accountTag: $acc }) { ${groups} } }
  }`;
  const json = await cf(token, '/graphql', {
    query,
    variables: {
      acc: accountTag,
      filter: {
        requestHost: host,
        datetime_geq: from.toISOString(),
        datetime_lt: to.toISOString(),
      },
    },
  });
  const acc = json.data.viewer.accounts[0] ?? {};
  const out = {} as Record<Dim, HourRow[]>;
  for (const dim of dims) {
    const field = dim === 'total' ? '' : DIM_FIELD[dim];
    const rows: any[] = acc[dim] ?? [];
    if (rows.length >= 10000) {
      throw new Error(`row limit hit for ${dim}; lower CHUNK_DAYS`);
    }
    out[dim] = rows.map((r) => ({
      hour: Date.parse(r.dimensions.datetimeHour),
      value: field ? String(r.dimensions[field] ?? '') : '',
      visits: Number(r.sum?.visits) || 0,
      pageViews: Number(r.count) || 0,
    }));
  }
  return out;
}

const dayOf = (ts: number) =>
  new Date(ts + TZ_OFFSET_MS).toISOString().slice(0, 10);
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  const { host, dbName } = wranglerConfig();
  const token = apiToken();
  const since = arg('since') ?? '2026-09-28';
  // Start at UTC+8 midnight of `since` so the first day is complete.
  const start = Date.parse(`${since}T00:00:00Z`) - TZ_OFFSET_MS;
  const end = Math.ceil(Date.now() / HOUR_MS) * HOUR_MS;

  // GraphQL analytics has a small per-5-minute budget: pick the account
  // without probing when there is only one, and pass --account otherwise.
  const accounts = (await cf(token, '/accounts?per_page=50')).result as {
    id: string;
  }[];
  const accountTag =
    arg('account') ??
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    (accounts.length === 1 ? accounts[0].id : '');
  if (!accountTag) {
    throw new Error(
      `several accounts (${accounts.map((a) => a.id).join(', ')}); pass --account <id>`
    );
  }

  // day|dim|value → totals
  const agg = new Map<string, { visits: number; pageViews: number }>();
  for (let t = start; t < end; t += CHUNK_DAYS * DAY_MS) {
    const from = new Date(t);
    const to = new Date(Math.min(end, t + CHUNK_DAYS * DAY_MS));
    const chunk = await hourly(token, accountTag, host, from, to);
    for (const dim of Object.keys(chunk) as Dim[]) {
      for (const r of chunk[dim]) {
        // Own-site referrers are in-site navigation, not a traffic source.
        const value =
          dim === 'referer' &&
          (r.value === host || r.value.endsWith(`.${host}`))
            ? null
            : r.value;
        if (value === null) continue;
        const key = `${dayOf(r.hour)}|${dim}|${value}`;
        const cur = agg.get(key) ?? { visits: 0, pageViews: 0 };
        cur.visits += r.visits;
        cur.pageViews += r.pageViews;
        agg.set(key, cur);
      }
    }
  }

  const days = [...agg.keys()]
    .filter((k) => k.includes('|total|'))
    .map((k) => k.split('|')[0])
    .sort();
  console.log(`${host}: ${agg.size} rows, ${days[0]} → ${days.at(-1)}`);
  for (const d of days) {
    const v = agg.get(`${d}|total|`)!;
    console.log(`  ${d}  visits ${v.visits}  page views ${v.pageViews}`);
  }
  if (dryRun) return;

  const now = Date.now();
  const values = [...agg].map(([id, v]) => {
    const [day, dim, ...rest] = id.split('|');
    return `(${q(id)}, ${q(day)}, ${q(dim)}, ${q(rest.join('|'))}, ${v.visits}, ${v.pageViews}, ${now})`;
  });
  const statements: string[] = [];
  for (let i = 0; i < values.length; i += 200) {
    statements.push(
      `INSERT INTO traffic_daily (id, day, dim, value, visits, page_views, updated_at) VALUES\n${values
        .slice(i, i + 200)
        .join(
          ',\n'
        )}\nON CONFLICT(id) DO UPDATE SET visits = excluded.visits, page_views = excluded.page_views, updated_at = excluded.updated_at;`
    );
  }
  const file = join(mkdtempSync(join(tmpdir(), 'traffic-')), 'upsert.sql');
  writeFileSync(file, statements.join('\n'));
  execSync(`npx wrangler d1 execute ${dbName} --remote --file ${file}`, {
    stdio: 'inherit',
  });
  console.log(`Imported ${values.length} rows into ${dbName}.traffic_daily`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
