import { createFileRoute } from '@tanstack/react-router';

import { FalProvider } from '@/core/ai';
import { envConfigs } from '@/config';
import { AITaskStatus, listTasksByStatus } from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import {
  listPendingPreviews,
  PreviewStatus,
  updatePreview,
} from '@/modules/hotel-preview/service';
import { respData, respErr } from '@/lib/resp';

import {
  advance,
  advancePreview,
  duetProvider,
  failPipelineTask,
  PIPELINE_MODEL,
  repersistTask,
} from './-pipeline';
import { deliverVideoEmails, startPaidPurchases } from './-purchase';

const CRON_KEY_HEADER = 'x-cron-key';

const TASK_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const PREVIEW_TIMEOUT_MS = 60 * 60 * 1000;

// Background sweep, called every minute by the Workers cron trigger (see
// src/nitro/cron.ts): finishes duet tasks and previews whose page was closed,
// times out stuck ones (failing a task refunds its credits), and retries the
// R2 copy of finished videos.
async function POST({ request }: { request: Request }) {
  const secret = envConfigs.auth_secret;
  if (!secret || request.headers.get(CRON_KEY_HEADER) !== secret) {
    return respErr('Unauthorized');
  }

  await startPaidPurchases();
  const configs = await getAllConfigs();

  const now = Date.now();
  const stats = { advanced: 0, timedOut: 0, persisted: 0, previews: 0 };

  const active = await listTasksByStatus({
    model: PIPELINE_MODEL,
    statuses: [AITaskStatus.PENDING, AITaskStatus.PROCESSING],
    limit: 25,
  });
  for (const task of active) {
    try {
      if (now - new Date(task.createdAt).getTime() > TASK_TIMEOUT_MS) {
        await failPipelineTask(task.id, 'Generation timed out');
        stats.timedOut++;
      } else {
        await advance(task.id, duetProvider(configs, task.provider));
        stats.advanced++;
      }
    } catch (error) {
      console.error('cron: task sweep failed', task.id, error);
    }
  }

  const unsaved = await listTasksByStatus({
    model: PIPELINE_MODEL,
    statuses: [AITaskStatus.SUCCESS],
    resultLike: '%"video"%',
    infoNotLike: ['%"videoPersisted":true%', '%"persistAttempts":3%'],
    limit: 3,
  });
  for (const task of unsaved) {
    if (await repersistTask(task)) stats.persisted++;
  }

  const previews = await listPendingPreviews(25);
  for (const row of previews) {
    try {
      if (now - new Date(row.createdAt).getTime() > PREVIEW_TIMEOUT_MS) {
        await updatePreview(row.id, {
          status: PreviewStatus.FAILED,
          error: 'Preview timed out',
        });
      } else {
        if (configs.fal_api_key)
          await advancePreview(
            row,
            new FalProvider({ apiKey: configs.fal_api_key })
          );
      }
      stats.previews++;
    } catch (error) {
      console.error('cron: preview sweep failed', row.id, error);
    }
  }

  await deliverVideoEmails();
  return respData(stats);
}

export const Route = createFileRoute('/api/hotel-lobby/cron')({
  server: { handlers: { POST } },
});
