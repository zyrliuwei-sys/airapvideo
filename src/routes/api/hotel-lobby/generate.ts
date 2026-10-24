import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { AIMediaType } from '@/core/ai';
import { assertVideoOrigin, getVideoActor } from '@/core/auth/video-actor';
import {
  DEFAULT_DUET_LENGTH,
  resolveDuetCreditsFor,
} from '@/config/hotel-lobby-pricing';
import {
  AITaskStatus,
  createTask,
  mergeTaskInfo,
} from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { screenPrompt } from '@/modules/content-safety/service';
import { getBalance } from '@/modules/credits/service';
import { hasPermission } from '@/modules/rbac/service';
import { createPurchase, lastContact } from '@/modules/video-purchases/service';
import { respData, respErr } from '@/lib/resp';
import { getLocale } from '@/paraglide/runtime.js';

import { DIRECTION_BLOCKED, isBlockedDirection } from './-direction-filter';
import {
  buildPerformancePrompt,
  buildScenePrompt,
  duetProvider,
  failPipelineTask,
  parseSceneInput,
  PIPELINE_MODEL,
  submitScene,
  taskView,
  videoQuality,
  videoSceneQuality,
} from './-pipeline';
import { readVideoBody } from './-purchase';

async function POST({ request }: { request: Request }) {
  try {
    assertVideoOrigin(request);
    const actor = await getVideoActor(request);
    if (!actor.userId) return respErr('Insufficient credits');

    const body = await readVideoBody(request);
    const email = z
      .union([z.literal(''), z.email().max(191)])
      .parse(
        typeof body.email === 'string'
          ? body.email.trim().toLowerCase()
          : await lastContact(actor.userId)
      );
    const input = parseSceneInput(body);
    if (!input) return respErr('Two JPG, PNG or WebP photos are required');
    if (isBlockedDirection(input.direction)) {
      return respErr(DIRECTION_BLOCKED);
    }
    const { photos, direction, size } = input;

    const configs = await getAllConfigs();
    if (!(await screenPrompt(direction, configs)).allowed) {
      return respErr(DIRECTION_BLOCKED);
    }

    // Admins generate free; everyone else uses the configured credit price.
    // Checked first so an unpaid user always lands on the paywall.
    const isAdmin = await hasPermission(actor.userId, 'admin.*');
    const length = DEFAULT_DUET_LENGTH;
    const price = resolveDuetCreditsFor(configs, length);
    if (!isAdmin && (await getBalance(actor.userId)) < price) {
      return respErr('Insufficient credits');
    }

    const provider = duetProvider(configs);

    const prompt = buildScenePrompt(direction, size);
    const task = await createTask({
      userId: actor.userId,
      mediaType: AIMediaType.VIDEO,
      provider: 'evolink',
      model: PIPELINE_MODEL,
      prompt,
      costCredits: isAdmin ? 0 : price,
    });

    try {
      await createPurchase({
        userId: actor.userId,
        email,
        locale: getLocale(),
        input: '{}',
        taskId: task.id,
      });
      await mergeTaskInfo(task.id, {
        emailProvided: !!email,
        sceneClaimedAt: Date.now(),
        length,
        quality: videoQuality(configs),
        videoPrompt: buildPerformancePrompt(length),
      });
      const imageRequestId = await submitScene(
        provider,
        photos,
        prompt,
        size,
        videoSceneQuality(configs)
      );
      await mergeTaskInfo(task.id, { imageRequestId });
    } catch (error: any) {
      await failPipelineTask(task.id, error?.message || 'Generation failed');
      throw error;
    }

    return respData(taskView({ ...task, status: AITaskStatus.PENDING }));
  } catch (error: any) {
    return respErr(error?.message || 'Generate failed');
  }
}

export const Route = createFileRoute('/api/hotel-lobby/generate')({
  server: { handlers: { POST } },
});
