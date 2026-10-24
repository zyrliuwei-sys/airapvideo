import { createFileRoute } from '@tanstack/react-router';

import { getVideoActor } from '@/core/auth/video-actor';
import { getBalance, getHistory } from '@/modules/credits/service';
import { respData, respErr } from '@/lib/resp';

async function GET({ request }: { request: Request }) {
  try {
    const actor = await getVideoActor(request);
    if (!actor.userId)
      return respData(
        { balance: 0, history: [] },
        { headers: { 'Cache-Control': 'no-store' } }
      );

    const [balance, history] = await Promise.all([
      getBalance(actor.userId),
      getHistory(actor.userId),
    ]);

    return respData({ balance, history });
  } catch (error: any) {
    return respErr(error.message || 'Failed to get credits');
  }
}

export const Route = createFileRoute('/api/credits')({
  server: {
    handlers: { GET },
  },
});
