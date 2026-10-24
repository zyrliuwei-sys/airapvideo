import { createFileRoute } from '@tanstack/react-router';

import { getVideoActor } from '@/core/auth/video-actor';
import { AITaskStatus, findTask } from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { canAccessTask } from '@/modules/video-purchases/service';
import { respData, respErr } from '@/lib/resp';

import { advance, duetProvider, PIPELINE_MODEL, taskView } from './-pipeline';
import { deliverVideoEmails } from './-purchase';

// Poll a duet task; each poll advances the pipeline one step if possible.
async function GET({ request }: { request: Request }) {
  try {
    const actor = await getVideoActor(request);

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return respErr('id is required');

    const task = await findTask(id);
    if (
      !task ||
      !(await canAccessTask(task, actor.access)) ||
      task.model !== PIPELINE_MODEL
    ) {
      return respErr('Task not found');
    }

    if (
      task.status === AITaskStatus.SUCCESS ||
      task.status === AITaskStatus.FAILED
    ) {
      await deliverVideoEmails();
      return respData(taskView(task));
    }

    const configs = await getAllConfigs();
    const provider = duetProvider(configs, task.provider);
    const view = await advance(task.id, provider);
    await deliverVideoEmails();
    return respData(view);
  } catch (error: any) {
    return respErr(error?.message || 'Query failed');
  }
}

export const Route = createFileRoute('/api/hotel-lobby/task')({
  server: { handlers: { GET } },
});
