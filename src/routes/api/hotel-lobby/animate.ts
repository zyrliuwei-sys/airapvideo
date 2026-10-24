import { createFileRoute } from '@tanstack/react-router';

import { AIMediaType } from '@/core/ai';
import { assertVideoOrigin, getVideoActor } from '@/core/auth/video-actor';
import {
  DEFAULT_DUET_LENGTH,
  resolveDuetCreditsFor,
} from '@/config/hotel-lobby-pricing';
import { OFFERED_DUET_SIZES, type DuetSize } from '@/config/hotel-lobby-sizes';
import {
  AITaskStatus,
  claimTaskStatus,
  createTask,
  findTask,
  mergeTaskInfo,
  updateTask,
} from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { getBalance } from '@/modules/credits/service';
import {
  claimPreview,
  findPreview,
  PreviewStatus,
} from '@/modules/hotel-preview/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

import {
  buildPerformancePrompt,
  duetProvider,
  failPipelineTask,
  PIPELINE_MODEL,
  submitMotion,
  taskView,
  videoQuality,
} from './-pipeline';

// Animate an existing scene through EvoLink; atomically claim the preview
// so repeated clicks cannot charge for it twice.
async function POST({ request }: { request: Request }) {
  try {
    assertVideoOrigin(request);
    const actor = await getVideoActor(request);
    if (!actor.userId) return respErr('Insufficient credits');
    const userId = actor.userId;

    const body = await request.json().catch(() => ({}));
    const previewId = typeof body?.previewId === 'string' ? body.previewId : '';
    const preview = previewId ? await findPreview(previewId) : undefined;
    if (
      !preview ||
      preview.status !== PreviewStatus.SUCCESS ||
      !preview.sceneImageUrl
    ) {
      return respErr('Preview not found');
    }

    // Already animated (double click, or back after a reload): hand back
    // that task instead of charging again.
    if (preview.taskId) {
      const existing = await findTask(preview.taskId);
      if (existing && existing.userId === userId) {
        return respData(taskView(existing));
      }
      return respErr('Preview already used');
    }

    // Framings no longer offered (1:1, 3:4, 16:9) animate badly against the
    // 9:16 reference — ask for a fresh preview instead.
    if (!OFFERED_DUET_SIZES.includes(preview.size as DuetSize)) {
      return respErr('Preview expired, please make a new one');
    }

    const configs = await getAllConfigs();
    const isAdmin = await hasPermission(userId, 'admin.*');
    const length = DEFAULT_DUET_LENGTH;
    const price = resolveDuetCreditsFor(configs, length);
    if (!isAdmin && (await getBalance(userId)) < price) {
      return respErr('Insufficient credits');
    }
    const provider = duetProvider(configs);

    const task = await createTask({
      userId,
      mediaType: AIMediaType.VIDEO,
      provider: 'evolink',
      model: PIPELINE_MODEL,
      prompt: `Animate free preview ${preview.id}`,
      costCredits: isAdmin ? 0 : price,
    });

    if (!(await claimPreview(preview.id, userId, task.id))) {
      // Lost a race with a concurrent click: refund this task.
      await updateTask({
        taskId: task.id,
        status: AITaskStatus.FAILED,
        taskResult: { error: 'Preview already used' },
      });
      return respErr('Preview already used');
    }

    try {
      const performance = {
        length,
        quality: videoQuality(configs),
        prompt: buildPerformancePrompt(length),
      };
      await mergeTaskInfo(task.id, {
        length,
        quality: performance.quality,
        videoPrompt: performance.prompt,
      });
      await claimTaskStatus(
        task.id,
        AITaskStatus.PENDING,
        AITaskStatus.PROCESSING
      );
      await submitMotion(
        task.id,
        provider,
        preview.sceneImageUrl,
        undefined,
        performance
      );
    } catch (error: any) {
      await failPipelineTask(task.id, error?.message || 'Generation failed');
      throw error;
    }

    return respData(taskView((await findTask(task.id))!));
  } catch (error: any) {
    return respErr(error?.message || 'Animate failed');
  }
}

export const Route = createFileRoute('/api/hotel-lobby/animate')({
  server: { handlers: { POST } },
});
