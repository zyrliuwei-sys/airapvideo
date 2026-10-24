import { createFileRoute } from '@tanstack/react-router';

import {
  DEFAULT_DUET_LENGTH,
  resolveDuetCredits,
  resolveDuetCreditsFor,
} from '@/config/hotel-lobby-pricing';
import { getAllConfigs } from '@/modules/config/service';
import { respData, respErr } from '@/lib/resp';

// Public: credits one duet video costs, per length (generator + pricing).
async function GET() {
  try {
    const configs = await getAllConfigs();
    const lengths = {
      [DEFAULT_DUET_LENGTH]: resolveDuetCreditsFor(
        configs,
        DEFAULT_DUET_LENGTH
      ),
    };
    return respData({ credits: resolveDuetCredits(configs), lengths });
  } catch (error: any) {
    return respErr(error?.message || 'Internal error');
  }
}

export const Route = createFileRoute('/api/hotel-lobby/price')({
  server: { handlers: { GET } },
});
