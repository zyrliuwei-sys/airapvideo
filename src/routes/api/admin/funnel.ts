import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { getFunnelDashboard } from '@/modules/events/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

async function GET({ request }: { request: Request }) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return respErr('Unauthorized');

    const isAdmin = await hasPermission(session.user.id, 'admin.*');
    if (!isAdmin) return respErr('Forbidden');

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7') || 7;
    const excludeCountries = (searchParams.get('exclude') || '')
      .split(',')
      .map((c) => c.trim())
      .filter((c) => /^[A-Za-z]{2}$/.test(c));

    return respData(await getFunnelDashboard({ days, excludeCountries }));
  } catch (error: any) {
    console.error('funnel dashboard error:', error);
    return respErr(error.message || 'Failed to load funnel');
  }
}

export const Route = createFileRoute('/api/admin/funnel')({
  server: { handlers: { GET } },
});
