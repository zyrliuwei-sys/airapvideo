import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';

import { apiGet } from '@/lib/api-client';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Mirrors FunnelDashboard in src/modules/events/service.ts.
type StepKey =
  | 'visit'
  | 'upload'
  | 'generate'
  | 'paywall'
  | 'plan'
  | 'checkout'
  | 'paid';

type FunnelRow = {
  key: string;
  steps: Partial<Record<StepKey, number>>;
  orders: number;
  revenue: number;
};

type PeriodStats = {
  visitors: number;
  paywall: number;
  checkout: number;
  payers: number;
  orders: number;
  revenue: number;
};

type Dashboard = {
  generatedAt: number;
  days: number;
  testUserIds: string[];
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
  trafficSyncedTo: string;
  topReferers: TrafficShare[];
  topCountries: TrafficShare[];
  topPaths: TrafficShare[];
};

type HistoryRow = {
  day: string;
  visits: number;
  pageViews: number;
  previews: number;
  signups: number;
  checkoutUsers: number;
  payers: number;
  orders: number;
  revenue: number;
};

type TrafficShare = { value: string; visits: number; pageViews: number };

const STEPS: StepKey[] = [
  'visit',
  'upload',
  'generate',
  'paywall',
  'plan',
  'checkout',
  'paid',
];

const stepLabel = (step: StepKey) =>
  ({
    visit: m['admin.funnel.step.visit'](),
    upload: m['admin.funnel.step.upload'](),
    generate: m['admin.funnel.step.generate'](),
    paywall: m['admin.funnel.step.paywall'](),
    plan: m['admin.funnel.step.plan'](),
    checkout: m['admin.funnel.step.checkout'](),
    paid: m['admin.funnel.step.paid'](),
  })[step];

const RANGES = ['1', '7', '14', '30', '60'];
const CN_TRAFFIC = 'CN,HK';

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const pct = (num: number, den: number) =>
  den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—';

function StatCard({
  title,
  value,
  previous,
  format = (n) => n.toLocaleString('en-US'),
  hint,
}: {
  title: string;
  value: number;
  previous?: number;
  format?: (n: number) => string;
  hint?: string;
}) {
  const delta =
    previous !== undefined && previous > 0
      ? ((value - previous) / previous) * 100
      : null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{format(value)}</div>
        {previous !== undefined ? (
          <p className="text-muted-foreground mt-1 text-xs tabular-nums">
            {m['admin.funnel.card.yesterday']({ value: format(previous) })}
            {delta !== null ? (
              <span
                className={cn(
                  'ml-1 font-medium',
                  delta >= 0 ? 'text-emerald-600' : 'text-red-600'
                )}
              >
                {delta >= 0 ? '+' : ''}
                {delta.toFixed(0)}%
              </span>
            ) : null}
          </p>
        ) : null}
        {hint ? (
          <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FunnelTable({
  title,
  dimension,
  rows,
}: {
  title: string;
  dimension: string;
  rows: FunnelRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dimension}</TableHead>
              {STEPS.map((s) => (
                <TableHead key={s} className="text-right">
                  {stepLabel(s)}
                </TableHead>
              ))}
              <TableHead className="text-right">
                {m['admin.funnel.col.revenue']()}
              </TableHead>
              <TableHead className="text-right">
                {m['admin.funnel.col.visit_to_paid']()}
              </TableHead>
              <TableHead className="text-right">
                {m['admin.funnel.col.rev_per_visitor']()}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={STEPS.length + 4}
                  className="text-muted-foreground text-center"
                >
                  {m['admin.funnel.empty']()}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const visit = row.steps.visit ?? 0;
                return (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {row.key || '—'}
                    </TableCell>
                    {STEPS.map((s, i) => {
                      const n = row.steps[s] ?? 0;
                      return (
                        <TableCell key={s} className="text-right tabular-nums">
                          <div>{n.toLocaleString('en-US')}</div>
                          {i > 0 ? (
                            <div className="text-muted-foreground text-xs">
                              {pct(n, visit)}
                            </div>
                          ) : null}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right tabular-nums">
                      {usd(row.revenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(row.steps.paid ?? 0, visit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {visit > 0 ? usd(row.revenue / visit) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const num = (n: number) => n.toLocaleString('en-US');

/** Cloudflare visits next to business-table counts, one row per day. */
function HistoryTable({
  rows,
  syncedTo,
}: {
  rows: HistoryRow[];
  syncedTo: string;
}) {
  // Page views lead: Web Analytics "visits" are a coarse sampled estimate
  // at this traffic level, so no rate is computed from them.
  const cols: { label: string; value: (r: HistoryRow) => string }[] = [
    {
      label: m['admin.funnel.history.page_views'](),
      value: (r) => num(r.pageViews),
    },
    { label: m['admin.funnel.history.visits'](), value: (r) => num(r.visits) },
    {
      label: m['admin.funnel.history.previews'](),
      value: (r) => num(r.previews),
    },
    {
      label: m['admin.funnel.history.signups'](),
      value: (r) => num(r.signups),
    },
    {
      label: m['admin.funnel.history.checkout'](),
      value: (r) => num(r.checkoutUsers),
    },
    { label: m['admin.funnel.step.paid'](), value: (r) => num(r.payers) },
    { label: m['admin.funnel.col.revenue'](), value: (r) => usd(r.revenue) },
    {
      label: m['admin.funnel.history.signup_to_checkout'](),
      value: (r) => pct(r.checkoutUsers, r.signups),
    },
    {
      label: m['admin.funnel.history.signup_to_paid'](),
      value: (r) => pct(r.payers, r.signups),
    },
    {
      label: m['admin.funnel.history.rev_per_signup'](),
      value: (r) => (r.signups > 0 ? usd(r.revenue / r.signups) : '—'),
    },
  ];
  const total = rows.reduce(
    (t, r) => ({
      ...t,
      visits: t.visits + r.visits,
      pageViews: t.pageViews + r.pageViews,
      previews: t.previews + r.previews,
      signups: t.signups + r.signups,
      checkoutUsers: t.checkoutUsers + r.checkoutUsers,
      payers: t.payers + r.payers,
      orders: t.orders + r.orders,
      revenue: t.revenue + r.revenue,
    }),
    {
      day: m['admin.funnel.history.total'](),
      visits: 0,
      pageViews: 0,
      previews: 0,
      signups: 0,
      checkoutUsers: 0,
      payers: 0,
      orders: 0,
      revenue: 0,
    } as HistoryRow
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {m['admin.funnel.section.history']()}
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          {syncedTo
            ? m['admin.funnel.history.synced']({ day: syncedTo })
            : m['admin.funnel.history.not_synced']()}
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m['admin.funnel.col.day']()}</TableHead>
              {cols.map((c) => (
                <TableHead key={c.label} className="text-right">
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[total, ...rows].map((r, i) => (
              <TableRow key={r.day} className={cn(i === 0 && 'font-semibold')}>
                <TableCell className="whitespace-nowrap">{r.day}</TableCell>
                {cols.map((c) => (
                  <TableCell key={c.label} className="text-right tabular-nums">
                    {c.value(r)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ShareCard({
  title,
  rows,
  metric,
}: {
  title: string;
  rows: TrafficShare[];
  metric: 'visits' | 'pageViews';
}) {
  const total = rows.reduce((t, r) => t + r[metric], 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {m['admin.funnel.empty']()}
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {rows.map((r) => (
              <li key={r.value} className="flex justify-between gap-3">
                <span className="truncate">
                  {r.value || m['admin.funnel.history.direct']()}
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {num(r[metric])} · {pct(r[metric], total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelPage() {
  const [days, setDays] = useState('7');
  const [excludeCn, setExcludeCn] = useState(false);

  const query = useQuery({
    queryKey: ['admin-funnel', days, excludeCn],
    queryFn: () =>
      apiGet<Dashboard>(
        `/api/admin/funnel?days=${days}${excludeCn ? `&exclude=${CN_TRAFFIC}` : ''}`
      ),
    placeholderData: keepPreviousData,
    refetchInterval: 5 * 60_000,
  });
  const data = query.data;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{m['admin.funnel.title']()}</h1>
          <p className="text-muted-foreground">
            {m['admin.funnel.description']()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="exclude-cn"
              checked={excludeCn}
              onCheckedChange={(v) => setExcludeCn(!!v)}
            />
            <Label htmlFor="exclude-cn">{m['admin.funnel.exclude_cn']()}</Label>
          </div>
          <Select value={days} onValueChange={(v) => v && setDays(v)}>
            <SelectTrigger className="w-36">
              <SelectValue>
                {(v: string) => m['admin.funnel.range']({ days: v })}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r} value={r}>
                  {m['admin.funnel.range']({ days: r })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw
              className={cn('size-4', query.isFetching && 'animate-spin')}
            />
            {m['admin.funnel.refresh']()}
          </Button>
        </div>
      </div>

      {query.error ? (
        <p className="text-destructive text-sm">{query.error.message}</p>
      ) : null}

      {data ? (
        <>
          <p className="text-muted-foreground text-xs">
            {m['admin.funnel.updated']({
              time: formatDateTime(data.generatedAt),
            })}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              title={m['admin.funnel.card.revenue']()}
              value={data.today.revenue}
              previous={data.yesterday.revenue}
              format={usd}
            />
            <StatCard
              title={m['admin.funnel.card.payers']()}
              value={data.today.payers}
              previous={data.yesterday.payers}
            />
            <StatCard
              title={m['admin.funnel.card.visitors']()}
              value={data.today.visitors}
              previous={data.yesterday.visitors}
            />
            <StatCard
              title={m['admin.funnel.card.paywall']()}
              value={data.today.paywall}
              previous={data.yesterday.paywall}
            />
            <StatCard
              title={m['admin.funnel.card.checkout']()}
              value={data.today.checkout}
              previous={data.yesterday.checkout}
            />
            <StatCard
              title={m['admin.funnel.card.unpaid']()}
              value={data.unpaidCheckout24h}
              hint={m['admin.funnel.card.unpaid_hint']()}
            />
          </div>

          <HistoryTable rows={data.history} syncedTo={data.trafficSyncedTo} />
          <div className="grid gap-4 lg:grid-cols-3">
            <ShareCard
              title={m['admin.funnel.history.top_referers']()}
              rows={data.topReferers}
              metric="visits"
            />
            <ShareCard
              title={m['admin.funnel.history.top_countries']()}
              rows={data.topCountries}
              metric="visits"
            />
            <ShareCard
              title={m['admin.funnel.history.top_paths']()}
              rows={data.topPaths}
              metric="pageViews"
            />
          </div>

          <FunnelTable
            title={m['admin.funnel.section.daily']()}
            dimension={m['admin.funnel.col.day']()}
            rows={data.daily}
          />
          <FunnelTable
            title={m['admin.funnel.section.source']()}
            dimension={m['admin.funnel.col.source']()}
            rows={data.bySource}
          />
          <FunnelTable
            title={m['admin.funnel.section.country']()}
            dimension={m['admin.funnel.col.country']()}
            rows={data.byCountry}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {m['admin.funnel.section.provider']()}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{m['admin.funnel.col.provider']()}</TableHead>
                    <TableHead className="text-right">
                      {m['admin.funnel.step.checkout']()}
                    </TableHead>
                    <TableHead className="text-right">
                      {m['admin.funnel.col.orders_created']()}
                    </TableHead>
                    <TableHead className="text-right">
                      {m['admin.funnel.col.orders_paid']()}
                    </TableHead>
                    <TableHead className="text-right">
                      {m['admin.funnel.col.success_rate']()}
                    </TableHead>
                    <TableHead className="text-right">
                      {m['admin.funnel.step.paid']()}
                    </TableHead>
                    <TableHead className="text-right">
                      {m['admin.funnel.col.revenue']()}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byProvider.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-muted-foreground text-center"
                      >
                        {m['admin.funnel.empty']()}
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.byProvider.map((p) => (
                      <TableRow key={p.provider}>
                        <TableCell className="font-medium">
                          {p.provider}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.checkoutVisitors}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.ordersCreated}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.ordersPaid}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(p.ordersPaid, p.ordersCreated)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.payers}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {usd(p.revenue)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <FunnelTable
            title={m['admin.funnel.section.build']()}
            dimension={m['admin.funnel.col.build']()}
            rows={data.byBuild}
          />

          <div className="text-muted-foreground space-y-1 text-xs leading-relaxed">
            <p className="text-foreground font-medium">
              {m['admin.funnel.footnote.title']()}
            </p>
            <p>{m['admin.funnel.footnote.unique']()}</p>
            <p>{m['admin.funnel.footnote.visit']()}</p>
            <p>{m['admin.funnel.footnote.first_touch']()}</p>
            <p>{m['admin.funnel.footnote.checkout']()}</p>
            <p>{m['admin.funnel.footnote.paid']()}</p>
            <p>{m['admin.funnel.footnote.provider']()}</p>
            <p>{m['admin.funnel.footnote.build']()}</p>
            <p>{m['admin.funnel.footnote.compare']()}</p>
            <p>{m['admin.funnel.footnote.history']()}</p>
            <p>{m['admin.funnel.footnote.history_referrer']()}</p>
            <p>
              {m['admin.funnel.footnote.excluded']({
                ids: data.testUserIds.join(', '),
              })}
            </p>
          </div>
        </>
      ) : query.isLoading ? (
        <p className="text-muted-foreground text-sm">…</p>
      ) : null}
    </div>
  );
}

export const Route = createFileRoute('/admin/funnel')({
  component: FunnelPage,
});
