import { and, eq } from 'drizzle-orm';

import { AIMediaType } from '@/core/ai';
import { withWriteTransaction } from '@/core/db/transaction';
import { videoEmailProvider } from '@/core/email/video-delivery';
import { envConfigs } from '@/config';
import { videoPurchase, type VideoPurchase } from '@/config/db/schema';
import {
  DEFAULT_DUET_LENGTH,
  resolveDuetCreditsFor,
  type DuetLength,
} from '@/config/hotel-lobby-pricing';
import { DEFAULT_DUET_SIZE, type DuetSize } from '@/config/hotel-lobby-sizes';
import {
  createTask,
  findTask,
  mergeTaskInfo,
} from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { screenPrompt } from '@/modules/content-safety/service';
import { getStorage } from '@/modules/storage/service';
import {
  claimVideoEmail,
  createD1PaidTask,
  createPurchase,
  finishPurchase,
  listPaidPurchases,
  listVideoEmails,
  markVideoEmailSent,
  saveToken,
} from '@/modules/video-purchases/service';
import { getUuid } from '@/lib/hash';

import { DIRECTION_BLOCKED, isBlockedDirection } from './-direction-filter';
import {
  buildPerformancePrompt,
  buildScenePrompt,
  duetProvider,
  failPipelineTask,
  parseSceneInput,
  PIPELINE_MODEL,
  submitScene,
  videoQuality,
  videoSceneQuality,
} from './-pipeline';
import type { ThemeLook } from './-themes';
import type { DeskLook } from './-tiny-desk';

type PurchaseInput = {
  photos: string[];
  direction?: string;
  size: DuetSize;
  length: DuetLength;
  costCredits: number;
  /** Themed look; absent for the rap duet */
  look?: ThemeLook;
  /** Purchases saved before themes were generalized (Tiny Desk only) */
  desk?: DeskLook;
};

/** Bound both streamed and declared sizes before parsing uploaded photos. */
export async function readVideoBody(request: Request) {
  const max = 17 * 1024 * 1024;
  if (Number(request.headers.get('content-length')) > max)
    throw new Error('Photos are too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error('Photos are too large');
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Save photos before leaving for checkout; never inline megabytes into a DB row. */
async function storePhoto(photo: string) {
  const match = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(photo)!;
  const bytes = Uint8Array.from(atob(match[3]), (c) => c.charCodeAt(0));
  const starts = (signature: number[]) =>
    signature.every((n, i) => bytes[i] === n);
  const valid =
    match[2] === 'jpeg'
      ? starts([255, 216, 255])
      : match[2] === 'png'
        ? starts([137, 80, 78, 71, 13, 10, 26, 10])
        : starts([82, 73, 70, 70]) &&
          bytes.length >= 12 &&
          String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
  if (!valid) throw new Error('Invalid photo file');
  const key = `video-inputs/${getUuid()}.${match[2] === 'jpeg' ? 'jpg' : match[2]}`;
  const storage = await getStorage();
  if (storage) {
    const result = await storage.uploadFile({
      key,
      body: bytes,
      contentType: match[1],
    });
    if (!result.success || !result.url)
      throw new Error('Photo upload failed. Please try again.');
    return result.url;
  }
  if (process.env.NODE_ENV === 'production')
    throw new Error('Video storage is not configured');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = path.join(process.cwd(), 'public', 'uploads', 'video-inputs');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, key.split('/')[1]), bytes);
  return `${envConfigs.app_url}/uploads/${key}`;
}

export async function preparePurchase(
  userId: string,
  body: unknown,
  email: string,
  locale: string
) {
  const input = parseSceneInput(body);
  if (!input) throw new Error('Two JPG, PNG or WebP photos are required');
  if (isBlockedDirection(input.direction)) throw new Error(DIRECTION_BLOCKED);
  const configs = await getAllConfigs();
  if (!(await screenPrompt(input.direction, configs)).allowed)
    throw new Error(DIRECTION_BLOCKED);
  if (email && !videoEmailProvider(configs))
    throw new Error(
      'Email delivery is unavailable. Leave email blank to continue.'
    );
  duetProvider(configs); // Validate the provider before collecting payment.
  const length = DEFAULT_DUET_LENGTH;
  const photos = await Promise.all(input.photos.map(storePhoto));
  return createPurchase({
    userId,
    email,
    locale,
    input: JSON.stringify({
      ...input,
      photos,
      length,
      costCredits: resolveDuetCreditsFor(configs, length),
    } satisfies PurchaseInput),
  });
}

const startingPurchases = new Map<string, Promise<void>>();

export async function startPaidPurchases(id?: string) {
  const configs = await getAllConfigs();
  for (const { purchase } of await listPaidPurchases(id ? 1 : 10, id)) {
    let starting = startingPurchases.get(purchase.id);
    if (!starting) {
      starting = startPurchase(purchase, configs).finally(() =>
        startingPurchases.delete(purchase.id)
      );
      startingPurchases.set(purchase.id, starting);
    }
    await starting.catch((error) =>
      console.error('paid video start failed', purchase.id, error)
    );
  }
}

async function startPurchase(
  purchase: VideoPurchase,
  configs: Record<string, string>
) {
  const input: PurchaseInput = {
    ...JSON.parse(purchase.input),
    size: DEFAULT_DUET_SIZE,
    length: DEFAULT_DUET_LENGTH,
  };
  const look: ThemeLook | undefined =
    input.look ??
    (input.desk ? { theme: 'tinydesk', ...input.desk } : undefined);
  const provider = duetProvider(configs);
  const initialInfo = {
    emailProvided: !!purchase.email,
    length: input.length,
    quality: videoQuality(configs),
    videoPrompt: buildPerformancePrompt(input.length, look),
    sceneClaimedAt: Date.now(),
  };
  const task =
    envConfigs.database_provider === 'd1'
      ? await createD1PaidTask(purchase, {
          provider: provider.name,
          model: PIPELINE_MODEL,
          prompt: buildScenePrompt(input.direction, input.size, look),
          costCredits: input.costCredits,
          info: initialInfo,
        })
      : await withWriteTransaction(async (tx: any) => {
          const rows = await tx
            .update(videoPurchase)
            .set({ status: 'starting' })
            .where(
              and(
                eq(videoPurchase.id, purchase.id),
                eq(videoPurchase.status, 'waiting')
              )
            )
            .returning({ id: videoPurchase.id });
          if (!rows.length) return null;
          const task = await createTask({
            userId: purchase.userId,
            mediaType: AIMediaType.VIDEO,
            provider: provider.name,
            model: PIPELINE_MODEL,
            prompt: buildScenePrompt(input.direction, input.size, look),
            costCredits: input.costCredits,
            tx,
          });
          await tx
            .update(videoPurchase)
            .set({ taskId: task.id, status: 'started' })
            .where(eq(videoPurchase.id, purchase.id));
          return task;
        });
  if (!task) return;
  try {
    await mergeTaskInfo(task.id, initialInfo);
    const imageRequestId = await submitScene(
      provider,
      input.photos,
      task.prompt,
      input.size,
      videoSceneQuality(configs)
    );
    await mergeTaskInfo(task.id, { imageRequestId });
    await finishPurchase(purchase.id, { input: '{}' });
  } catch (error: any) {
    await failPipelineTask(task.id, error?.message || 'Generation failed');
    await finishPurchase(purchase.id, {
      error: 'Generation failed',
      input: '{}',
    });
  }
}

export async function deliverVideoEmails() {
  const configs = await getAllConfigs();
  const sender = videoEmailProvider(configs);
  if (!sender) return;
  for (const { purchase } of await listVideoEmails()) {
    if (!purchase.email || !(await claimVideoEmail(purchase.id))) continue;
    try {
      const task = purchase.taskId
        ? await findTask(purchase.taskId)
        : undefined;
      if (!task || task.status !== 'success') continue;
      const token = await saveToken(
        'video-email',
        purchase.email,
        30 * 24 * 60 * 60 * 1000
      );
      const base = configs.app_url || envConfigs.app_url;
      const url = `${base}/api/video-access/open?token=${encodeURIComponent(token)}`;
      const zh = purchase.locale === 'zh';
      const result = await sender.sendEmail({
        to: purchase.email,
        subject: zh
          ? `${envConfigs.app_name}：你的视频已生成`
          : `${envConfigs.app_name}: your video is ready`,
        text: zh
          ? `你的视频已生成，点击查看并下载：\n${url}\n\n链接30天内有效，请及时下载到本地。`
          : `Your video is ready. View and download it here:\n${url}\n\nThis link expires in 30 days. Please download your video to keep a local copy.`,
      });
      if (!result.success) throw new Error('Video email delivery failed');
      await markVideoEmailSent(purchase.id);
    } catch (error) {
      console.error('video email failed', purchase.id, error);
    }
  }
}
