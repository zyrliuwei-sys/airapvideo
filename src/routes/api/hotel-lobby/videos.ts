import { createFileRoute } from '@tanstack/react-router';

import { getVideoActor } from '@/core/auth/video-actor';
import { listVideos } from '@/modules/video-purchases/service';
import { respData, respErr } from '@/lib/resp';

import { PIPELINE_MODEL, taskView } from './-pipeline';

// The signed-in user's duet videos, newest first (settings → My videos).
async function GET({ request }: { request: Request }) {
  try {
    const actor = await getVideoActor(request);

    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get('page')) || 1);
    const pageSize = Math.min(
      48,
      Math.max(1, Number(params.get('pageSize')) || 12)
    );

    const { items, total } = await listVideos(
      actor.access,
      PIPELINE_MODEL,
      page,
      pageSize
    );
    return respData({
      items: items.map((task) => ({
        ...taskView(task),
        createdAt: new Date(task.createdAt).toISOString(),
      })),
      total,
    });
  } catch (error: any) {
    return respErr(error?.message || 'Query failed');
  }
}

export const Route = createFileRoute('/api/hotel-lobby/videos')({
  server: { handlers: { GET } },
});
