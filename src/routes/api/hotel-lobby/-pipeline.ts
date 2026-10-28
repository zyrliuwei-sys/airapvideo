/**
 * Two-stage duet pipeline. New jobs use EvoLink Nano Banana → MiniMax H3
 * Max Turbo. Existing Fal jobs retain their original models and inputs.
 * Browser polls and the cron sweep advance stages; an atomic claim prevents
 * duplicate video submissions. Failed jobs refund their consumed credits.
 */

import {
  AIMediaType,
  EVOLINK_IMAGE_MODEL,
  EVOLINK_VIDEO_MODEL,
  EvolinkProvider,
  EvolinkRequestError,
  FalProvider,
  AITaskStatus as FalStatus,
} from '@/core/ai';
import { envConfigs } from '@/config';
import {
  DEFAULT_DUET_LENGTH,
  DUET_LENGTHS,
  type DuetLength,
} from '@/config/hotel-lobby-pricing';
import {
  DEFAULT_DUET_SIZE,
  DUET_SIZES,
  type DuetSize,
} from '@/config/hotel-lobby-sizes';
import {
  DEFAULT_DESK_STYLE,
  DESK_STYLES,
  isDeskStyle,
  type DeskStyle,
} from '@/config/tiny-desk-styles';
import {
  AITaskStatus,
  claimTaskStatus,
  findTask,
  mergeTaskInfo,
  updateTask,
} from '@/modules/ai-tasks/service';
import {
  PreviewStatus,
  updatePreview,
  type findPreview,
} from '@/modules/hotel-preview/service';
import { getStorage } from '@/modules/storage/service';

import {
  buildDeskPerformancePrompt,
  buildDeskScenePrompt,
  type DeskLook,
} from './-tiny-desk';

export const IMAGE_MODEL = 'openai/gpt-image-2/edit';
export const VIDEO_MODEL = 'fal-ai/bytedance/dreamactor/v2';
export const PIPELINE_MODEL = 'hotel-lobby-duet';

export type DuetProvider = FalProvider | EvolinkProvider;

/** New jobs always use EvoLink; the provider persisted on old jobs is honored. */
export function duetProvider(
  configs: Record<string, string>,
  name = 'evolink'
): DuetProvider {
  if (name === 'fal') {
    if (!configs.fal_api_key) throw new Error('Fal API key is not configured');
    return new FalProvider({ apiKey: configs.fal_api_key });
  }
  if (name !== 'evolink') throw new Error('Unsupported duet provider');
  return new EvolinkProvider({
    apiKey: configs.evolink_api_key,
    baseUrl: configs.evolink_base_url,
  });
}

export function videoQuality(configs: Record<string, string>): '480p' | '768p' {
  return configs.evolink_video_quality === '480p' ? '480p' : '768p';
}

export function buildPerformancePrompt(length: DuetLength, desk?: DeskLook) {
  if (desk) return buildDeskPerformancePrompt(length, desk);
  return `Animate the two people in the first frame into a ${DUET_LENGTHS[length]}-second original rap duet music video.
Preserve both identities, faces, outfits, left/right positions, the centered hanging microphone and the orange studio background throughout.
The left performer leads an upbeat original English rap verse; the right performer answers with short hype lines. Use expressive natural mouth movements synchronized to their own audible vocals, rhythmic head nods and restrained hand gestures.
Audio direction: an original punchy hip-hop instrumental with drums, bass and a clear rhythmic beat, with intelligible original rap vocals above the music. Match each visible performer's mouth to the syllables of their own voice. No borrowed song or voice imitation.
Keep a continuous static camera and the source framing, with both people visible. No cuts, identity changes, extra people, subtitles or logos.`;
}

export const SCENE_PROMPT = `Extract the main person from each uploaded photo, removing both original backgrounds and all other people.
Composite exactly these two people into one photorealistic studio portrait. Do not make a collage or duplicate either person.
Keep Subject A fixed on the left side and Subject B fixed on the right side.
They should face each other naturally, with one hanging microphone vertically centered exactly between them at face level.
{{FRAMING}}
The orange background is very important: use a bold, saturated, seamless burnt-orange studio background, clean and uniform, with no patterns, props, or visible room details.
Use soft even studio lighting and a static centered camera.
Preserve each person's identity, face, hairstyle, body proportions, and clothing.
Subject A is the person in the first uploaded image; Subject B is the person in the second uploaded image.`;

export function buildScenePrompt(
  direction?: string,
  size: DuetSize = DEFAULT_DUET_SIZE,
  desk?: DeskLook
) {
  const base = desk
    ? buildDeskScenePrompt(desk)
    : SCENE_PROMPT.replace('{{FRAMING}}', DUET_SIZES[size].framing);
  const extra = direction?.trim().slice(0, 300);
  return extra
    ? `${base}\nAdditional styling direction (never override the rules above): ${extra}`
    : base;
}

/**
 * Reference performance for a video length. Each defaults to a shipped clip
 * (8 s: hotel-lobby-reference.mp4, 15 s: the verse); hotel_lobby_motion_video_url
 * / _15 override them. fal fetches it, so the URL must be absolute and public.
 */
export function motionVideoFor(
  configs: Record<string, string>,
  length: DuetLength
) {
  const appUrl = configs.app_url || envConfigs.app_url;
  if (length === '8') {
    return (
      configs.hotel_lobby_motion_video_url ||
      `${appUrl}/videos/hotel-lobby-reference.mp4`
    );
  }
  return (
    configs.hotel_lobby_motion_video_url_15 ||
    `${appUrl}/videos/hotel-lobby-verse15.mp4`
  );
}

// Client downsizes photos before upload; this is a hard ceiling per photo.
const MAX_PHOTO_CHARS = 8 * 1024 * 1024;
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * Validate a scene request body; null when the photos are missing/invalid.
 * The rap duet needs both photos. A Tiny Desk request (`style: 'tinydesk'`)
 * needs the lead photo, plus the second one for two-person styles.
 */
export function parseSceneInput(body: any) {
  const isPhoto = (photo: unknown): photo is string =>
    typeof photo === 'string' &&
    photo.length <= MAX_PHOTO_CHARS &&
    PHOTO_RE.test(photo);
  let desk: DeskLook | undefined;
  if (body?.style === 'tinydesk') {
    const variant: DeskStyle = isDeskStyle(body.variant)
      ? body.variant
      : DEFAULT_DESK_STYLE;
    const solo = body.photoB === undefined || body.photoB === null;
    if (solo && DESK_STYLES[variant].needsTwo) return null;
    desk = { variant, solo };
  }
  const photos = desk?.solo ? [body?.photoA] : [body?.photoA, body?.photoB];
  if (!photos.every(isPhoto)) return null;
  return {
    photos,
    // All creative instructions are supplied by the system prompt.
    direction: undefined,
    // New requests always use the fixed vertical composition.
    size: DEFAULT_DUET_SIZE,
    desk,
  };
}

export function sceneSize(size: DuetSize = DEFAULT_DUET_SIZE) {
  const { width, height } = DUET_SIZES[size];
  return { width, height };
}

export type SceneQuality = 'low' | 'medium' | 'high';

export function isSceneQuality(value: unknown): value is SceneQuality {
  return value === 'low' || value === 'medium' || value === 'high';
}

const QUALITY_RANK: Record<SceneQuality, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * Quality of the frame the video is made from. Medium by default: side by
 * side with high it's indistinguishable at the 694×1230 video size, but
 * renders in ~38 s instead of 65–90 s and costs ~$0.05 instead of ~$0.13
 * (measured 2026-10-03). Admin can set hotel_lobby_scene_quality to high.
 */
export function videoSceneQuality(configs: Record<string, string>) {
  return isSceneQuality(configs.hotel_lobby_scene_quality)
    ? configs.hotel_lobby_scene_quality
    : 'medium';
}

/** Is a preview still already good enough to animate without re-rendering? */
export function meetsQuality(have: string, want: SceneQuality) {
  return isSceneQuality(have) && QUALITY_RANK[have] >= QUALITY_RANK[want];
}

// Turns a cheap free-preview still into the full-quality frame the video is
// made from, without re-composing it — the buyer gets the scene they saw.
export const REFINE_PROMPT = `Re-render this exact image at high quality.
Keep the same two people with the same faces, hairstyles, clothing, poses and left/right positions, the same hanging microphone, framing and burnt-orange background.
Only increase detail, sharpness and lighting quality. Do not add, remove or move anything.`;

/** Step 1: two portraits → one orange-booth scene. Returns the provider task id. */
export async function submitScene(
  provider: DuetProvider,
  photos: string[],
  prompt: string,
  size: DuetSize,
  quality: SceneQuality = 'medium'
) {
  // EvoLink requires public reference URLs, not browser data URIs. Keep them
  // out of task rows and logs; its file service expires input uploads after 72h.
  const references =
    provider instanceof EvolinkProvider
      ? await Promise.all(
          photos.map((photo) =>
            photo.startsWith('data:') ? provider.uploadImage(photo) : photo
          )
        )
      : photos;
  const image = await provider.generate({
    params: {
      mediaType: AIMediaType.IMAGE,
      model: provider.name === 'evolink' ? EVOLINK_IMAGE_MODEL : IMAGE_MODEL,
      prompt,
      options:
        provider.name === 'evolink'
          ? {
              image_urls: references,
              size: size === 'full' ? '9:16' : size,
            }
          : {
              image_urls: references,
              image_size: sceneSize(size),
              quality,
              output_format: 'jpeg',
            },
    },
  });
  return image.taskId;
}

/** Poll step 1. Resolves the scene URL once ready, null while running. */
export async function queryScene(provider: DuetProvider, requestId: string) {
  const res = await provider.query({
    taskId: requestId,
    model: provider.name === 'evolink' ? EVOLINK_IMAGE_MODEL : IMAGE_MODEL,
    mediaType: AIMediaType.IMAGE,
  });
  if (res.taskStatus === FalStatus.FAILED) {
    throw new Error('Scene image generation failed');
  }
  if (res.taskStatus !== FalStatus.SUCCESS) return null;
  const url = res.taskInfo?.images?.[0]?.imageUrl;
  if (!url) throw new Error('Scene image generation returned no image');
  return url as string;
}

/**
 * Step 2: scene + reference performance → video. The caller must already
 * have moved the task to `processing`.
 */
export async function submitMotion(
  taskId: string,
  provider: DuetProvider,
  sceneImageUrl: string,
  motionVideoUrl?: string,
  performance: {
    length?: DuetLength;
    quality?: '480p' | '768p';
    prompt?: string;
  } = {}
) {
  await mergeTaskInfo(taskId, {
    sceneImageUrl,
    motionVideoUrl,
    motionClaimedAt: Date.now(),
  });
  const video = await provider.generate({
    params: {
      mediaType: AIMediaType.VIDEO,
      model: provider.name === 'evolink' ? EVOLINK_VIDEO_MODEL : VIDEO_MODEL,
      prompt:
        provider.name === 'evolink'
          ? performance.prompt ||
            buildPerformancePrompt(performance.length || DEFAULT_DUET_LENGTH)
          : '',
      options:
        provider.name === 'evolink'
          ? {
              image_start: sceneImageUrl,
              duration: DUET_LENGTHS[performance.length || DEFAULT_DUET_LENGTH],
              quality: performance.quality || '768p',
            }
          : {
              image_url: sceneImageUrl,
              video_url: motionVideoUrl,
              trim_first_second: true,
            },
    },
  });
  await mergeTaskInfo(taskId, { videoRequestId: video.taskId });
}

type Info = {
  emailProvided?: boolean;
  imageRequestId?: string;
  sceneClaimedAt?: number;
  videoRequestId?: string;
  sceneImageUrl?: string;
  motionVideoUrl?: string;
  error?: string;
  persistAttempts?: number;
  motionClaimedAt?: number;
  length?: DuetLength;
  quality?: '480p' | '768p';
  videoPrompt?: string;
  videoPersisted?: boolean;
};

function parseJson<T>(value: unknown): T {
  try {
    return value ? JSON.parse(value as string) : ({} as T);
  } catch {
    return {} as T;
  }
}

export function taskView(task: any) {
  const info = parseJson<Info>(task.taskInfo);
  const result = parseJson<{ video?: { url?: string }; error?: string }>(
    task.taskResult
  );
  return {
    id: task.id as string,
    emailProvided: info.emailProvided ?? false,
    status: task.status as AITaskStatus,
    stage:
      task.status === AITaskStatus.PENDING
        ? ('scene' as const)
        : task.status === AITaskStatus.PROCESSING
          ? ('motion' as const)
          : null,
    sceneImageUrl: info.sceneImageUrl ?? null,
    videoUrl: result.video?.url ?? null,
    error: result.error ?? info.error ?? null,
  };
}

/**
 * Copy provider videos to R2 before their temporary URLs expire. A marker
 * excludes durable results from the retry sweep. Storage outages leave the
 * provider URL playable while the cron retries the copy.
 */
export async function persistVideo(taskId: string, taskResult: any) {
  const url: string | undefined = taskResult?.video?.url;
  if (!url || taskResult.video.persisted) return taskResult;
  try {
    const storage = await getStorage();
    if (!storage) return taskResult;
    if (
      storage.getPublicUrl({ key: `hotel-lobby/videos/${taskId}.mp4` }) === url
    ) {
      return { ...taskResult, video: { ...taskResult.video, persisted: true } };
    }
    const uploaded = await storage.downloadAndUpload({
      url,
      key: `hotel-lobby/videos/${taskId}.mp4`,
      contentType: 'video/mp4',
      disposition: 'inline',
    });
    if (!uploaded.success || !uploaded.url) {
      console.error('persistVideo failed', taskId, uploaded.error);
      return taskResult;
    }
    return {
      ...taskResult,
      video: { ...taskResult.video, url: uploaded.url, persisted: true },
    };
  } catch (error) {
    console.error('persistVideo failed', taskId, error);
    return taskResult;
  }
}

/**
 * Retry the R2 copy for an already-finished task (backfill / earlier copy
 * failed). Gives up after a few tries so an expired provider URL isn't retried
 * forever.
 */
export async function repersistTask(task: {
  id: string;
  taskInfo: unknown;
  taskResult: unknown;
}) {
  const info = parseJson<Info>(task.taskInfo);
  const attempts = info.persistAttempts ?? 0;
  // No storage (e.g. local dev without the R2 key) isn't a failed try.
  if (attempts >= 3 || !(await getStorage())) return false;
  await mergeTaskInfo(task.id, { persistAttempts: attempts + 1 });
  const result = parseJson<any>(task.taskResult);
  const stored = await persistVideo(task.id, result);
  if (stored === result) return false;
  await mergeTaskInfo(task.id, { videoPersisted: true });
  await updateTask({
    taskId: task.id,
    status: AITaskStatus.SUCCESS,
    taskResult: stored,
  });
  return true;
}

/**
 * A poll that hit a provider rate limit, a 5xx or the network says nothing about
 * the run itself — it is usually still going, so check again on the next poll
 * instead of failing a job that's already being paid for. Tasks still stuck
 * get failed (and refunded) by the cron timeout.
 */
function isTransient(error: any) {
  if (error instanceof EvolinkRequestError)
    return error.status === 429 || error.status >= 500;
  const message = String(error?.message || '');
  const status = /request failed with status: (\d{3})/.exec(message)?.[1];
  if (status) return status === '429' || Number(status) >= 500;
  return (
    error instanceof TypeError ||
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    /network|fetch failed|timed? ?out|ECONN|socket/i.test(message)
  );
}

// Stage 2 claimed but its request id never saved (the worker died mid-submit):
// nothing will ever finish it, so fail and refund instead of a 3 h wait.
const MOTION_SUBMIT_TIMEOUT_MS = 10 * 60 * 1000;

export async function failPipelineTask(taskId: string, message: string) {
  // Only one poll/cron may fail and refund an active task. A late response
  // cannot turn a completed task into a failure or trigger a second refund.
  const claimed =
    (await claimTaskStatus(
      taskId,
      AITaskStatus.PENDING,
      AITaskStatus.FAILED
    )) ||
    (await claimTaskStatus(
      taskId,
      AITaskStatus.PROCESSING,
      AITaskStatus.FAILED
    ));
  if (!claimed) return;
  await updateTask({
    taskId,
    status: AITaskStatus.FAILED,
    taskResult: { error: message },
  });
}

/**
 * Advance a pipeline task by one poll. Safe to call repeatedly/concurrently.
 */
export async function advance(taskId: string, provider: DuetProvider) {
  let task = await findTask(taskId);
  if (!task) throw new Error('Task not found');
  const info = parseJson<Info>(task.taskInfo);

  try {
    if (
      (task.status === AITaskStatus.PENDING ||
        task.status === AITaskStatus.PROCESSING) &&
      Date.now() - new Date(task.createdAt).getTime() > 3 * 60 * 60 * 1000
    ) {
      await failPipelineTask(taskId, 'Generation timed out');
      return taskView((await findTask(taskId))!);
    }
    if (
      task.status === AITaskStatus.PENDING &&
      !info.imageRequestId &&
      Date.now() - (info.sceneClaimedAt || new Date(task.createdAt).getTime()) >
        MOTION_SUBMIT_TIMEOUT_MS
    ) {
      await failPipelineTask(taskId, 'Scene generation was never started');
      return taskView((await findTask(taskId))!);
    }
    // Stage 1: scene image
    if (task.status === AITaskStatus.PENDING && info.imageRequestId) {
      const res = await provider.query({
        taskId: info.imageRequestId,
        model: provider.name === 'evolink' ? EVOLINK_IMAGE_MODEL : IMAGE_MODEL,
        mediaType: AIMediaType.IMAGE,
      });
      if (res.taskStatus === FalStatus.FAILED) {
        await failPipelineTask(taskId, 'Scene image generation failed');
      } else if (res.taskStatus === FalStatus.SUCCESS) {
        const sceneImageUrl = res.taskInfo?.images?.[0]?.imageUrl;
        if (!sceneImageUrl) {
          await failPipelineTask(
            taskId,
            'Scene image generation returned no image'
          );
        } else if (
          await claimTaskStatus(
            taskId,
            AITaskStatus.PENDING,
            AITaskStatus.PROCESSING
          )
        ) {
          // A failed submit is final, network error or not: no provider job was
          // (knowingly) started, so refund now rather than wait it out.
          await submitMotion(
            taskId,
            provider,
            sceneImageUrl,
            info.motionVideoUrl,
            {
              length: info.length,
              quality: info.quality,
              prompt: info.videoPrompt,
            }
          ).catch((error) =>
            failPipelineTask(taskId, error?.message || 'Motion transfer failed')
          );
        }
      }
    }
    // Stage 2: motion transfer (videoRequestId absent = another poll is
    // still submitting it; just report processing)
    else if (task.status === AITaskStatus.PROCESSING && info.videoRequestId) {
      const res = await provider.query({
        taskId: info.videoRequestId,
        model: provider.name === 'evolink' ? EVOLINK_VIDEO_MODEL : VIDEO_MODEL,
        mediaType: AIMediaType.VIDEO,
      });
      if (res.taskStatus === FalStatus.FAILED) {
        await failPipelineTask(taskId, 'Motion transfer failed');
      } else if (res.taskStatus === FalStatus.SUCCESS) {
        const result = await persistVideo(taskId, res.taskResult);
        if (result?.video?.persisted)
          await mergeTaskInfo(taskId, { videoPersisted: true });
        await updateTask({
          taskId,
          status: AITaskStatus.SUCCESS,
          taskResult: result,
        });
      }
    } else if (
      task.status === AITaskStatus.PROCESSING &&
      info.motionClaimedAt &&
      Date.now() - info.motionClaimedAt > MOTION_SUBMIT_TIMEOUT_MS
    ) {
      await failPipelineTask(taskId, 'Motion transfer was never started');
    }
  } catch (error: any) {
    // fal reports a failed run as COMPLETED + an error on the result fetch;
    // a rate limit / outage / network blip is retried on the next poll.
    if (!isTransient(error)) {
      await failPipelineTask(taskId, error?.message || 'Generation failed');
    }
  }

  task = await findTask(taskId);
  return taskView(task);
}

type PreviewRow = NonNullable<Awaited<ReturnType<typeof findPreview>>>;

/** Advance a pending free preview by one poll (browser or cron sweep). */
export async function advancePreview(row: PreviewRow, provider: DuetProvider) {
  if (row.status !== PreviewStatus.PENDING || !row.requestId) return;
  try {
    const url = await queryScene(provider, row.requestId);
    if (url) {
      await updatePreview(row.id, {
        status: PreviewStatus.SUCCESS,
        sceneImageUrl: url,
      });
    }
  } catch (error: any) {
    if (isTransient(error)) return;
    await updatePreview(row.id, {
      status: PreviewStatus.FAILED,
      error: error?.message || 'Preview failed',
    });
  }
}
