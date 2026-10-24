import { createFileRoute } from '@tanstack/react-router';

import { getVideoActor } from '@/core/auth/video-actor';
import { AITaskStatus, findTask } from '@/modules/ai-tasks/service';
import { canAccessTask } from '@/modules/video-purchases/service';
import { respErr } from '@/lib/resp';

import { PIPELINE_MODEL, taskView } from './-pipeline';

// Same-origin download of a finished duet video. The file lives on another
// origin (R2 / fal), where the browser ignores <a download>, so it's streamed
// through here with an attachment Content-Disposition.
async function GET({ request }: { request: Request }) {
  const actor = await getVideoActor(request);

  const id = new URL(request.url).searchParams.get('id');
  const task = id ? await findTask(id) : undefined;
  if (
    !task ||
    !(await canAccessTask(task, actor.access)) ||
    task.model !== PIPELINE_MODEL ||
    task.status !== AITaskStatus.SUCCESS
  ) {
    return respErr('Video not found');
  }

  const { videoUrl } = taskView(task);
  if (!videoUrl) return respErr('Video not found');

  const upstream = await fetch(videoUrl);
  if (!upstream.ok || !upstream.body) return respErr('Video is unavailable');

  const date = new Date(task.createdAt).toISOString().slice(0, 10);
  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Content-Disposition': `attachment; filename="hotel-lobby-${date}-${task.id.slice(0, 8)}.mp4"`,
    'Cache-Control': 'private, no-store',
  });
  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);
  return new Response(upstream.body, { headers });
}

export const Route = createFileRoute('/api/hotel-lobby/download')({
  server: { handlers: { GET } },
});
