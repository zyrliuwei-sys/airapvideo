import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowRight, Coins, Film, TrendingUp } from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { apiGet, type PageResult } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { localizeHref } from '@/paraglide/runtime.js';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type Subscription = {
  status: string;
  planName?: string | null;
  productName?: string | null;
};

function DashboardPage() {
  const { data: session } = useSession();

  const { data: creditsData } = useQuery({
    queryKey: ['user-credits'],
    queryFn: () => apiGet<{ balance: number }>('/api/credits'),
  });
  // Only the total is needed: ask for the smallest page.
  const { data: videosData } = useQuery({
    queryKey: ['hotel-lobby-videos-count'],
    queryFn: () =>
      apiGet<PageResult<unknown>>('/api/hotel-lobby/videos?page=1&pageSize=1'),
  });
  const { data: subscriptionData } = useQuery({
    queryKey: ['user-subscription-current'],
    queryFn: () =>
      apiGet<Subscription | null>('/api/user/subscriptions/current'),
  });

  const credits = creditsData?.balance;
  const videos = videosData?.total;
  const subscription = subscriptionData ?? null;

  const planLabel =
    subscription?.planName ||
    subscription?.productName ||
    m['settings.overview.plan_free']();

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {m['settings.title']()}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {m['settings.welcome']({
            name: session?.user?.name || session?.user?.email || '',
          })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {m['settings.credits.title']()}
            </CardTitle>
            <Coins className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {credits?.toLocaleString('en-US') ?? '-'}
            </div>
            <Link
              href="/pricing"
              className="text-primary mt-1 inline-block text-xs font-medium hover:underline"
            >
              {m['hotel.create.buy_credits']()}
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {m['settings.videos.title']()}
            </CardTitle>
            <Film className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {videos?.toLocaleString('en-US') ?? '-'}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {m['settings.overview.videos_description']()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {m['settings.overview.plan']()}
            </CardTitle>
            <TrendingUp className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{planLabel}</div>
            <p className="text-muted-foreground mt-1 text-xs">
              {m['settings.overview.plan_description']()}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {m['settings.overview.create_title']()}
          </CardTitle>
          <CardDescription>
            {m['settings.overview.create_description']()}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <a href={localizeHref('/#create')} className={cn(buttonVariants())}>
            {m['hotel.hero.cta']()} <ArrowRight className="size-4" />
          </a>
          <Link
            href="/settings/videos"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            {m['settings.videos.title']()}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute('/settings/')({
  component: DashboardPage,
});
