import {
  AIMediaType,
  AITaskStatus,
  type AIGenerateParams,
  type AIProvider,
  type AITaskResult,
} from './types';

export const EVOLINK_IMAGE_MODEL = 'nano-banana-beta';
export const EVOLINK_VIDEO_MODEL = 'minimax-h3-max-turbo-image-to-video';

interface EvolinkTask {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  results?: string[];
  error?: { code?: string; message?: string };
}

export class EvolinkRequestError extends Error {
  constructor(public readonly status: number) {
    // Do not expose upstream bodies, signed URLs or credentials to clients.
    super(`EvoLink request failed with status: ${status}`);
  }
}

/** Server-side EvoLink image/video adapter. Task results use the common shape. */
export class EvolinkProvider implements AIProvider {
  readonly name = 'evolink';
  private readonly baseUrl: string;

  constructor(public configs: { apiKey: string; baseUrl?: string }) {
    if (!configs.apiKey) throw new Error('EvoLink API key is not configured');
    this.baseUrl = (configs.baseUrl || 'https://api.evolink.ai').replace(
      /\/+$/,
      ''
    );
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.configs.apiKey}`,
        ...init?.headers,
      },
      signal: AbortSignal.timeout(60_000),
      redirect: 'error',
    });
    if (!response.ok) throw new EvolinkRequestError(response.status);
    try {
      return (await response.json()) as T;
    } catch {
      // An HTML gateway error says nothing about an already-running task.
      throw new EvolinkRequestError(502);
    }
  }

  /** Inputs must be public URLs. The file service retains uploads for 72h. */
  async uploadImage(dataUrl: string): Promise<string> {
    const match =
      /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) throw new Error('Invalid photo');
    const bytes = Uint8Array.from(atob(match[3]), (char) => char.charCodeAt(0));
    if (!bytes.length || bytes.length > 10 * 1024 * 1024)
      throw new Error('Invalid photo size');
    const form = new FormData();
    form.append(
      'file',
      new Blob([bytes], { type: match[1] }),
      `portrait.${match[2]}`
    );
    const result = await this.request<{
      data?: { file_url?: string };
      file_url?: string;
    }>('https://files-api.evolink.ai/api/v1/files/upload/stream', {
      method: 'POST',
      body: form,
    });
    return publicMediaUrl(result.data?.file_url ?? result.file_url);
  }

  async generate({
    params,
  }: {
    params: AIGenerateParams;
  }): Promise<AITaskResult> {
    const { mediaType, model, prompt, options = {}, callbackUrl } = params;
    if (!prompt.trim()) throw new Error('Generation prompt is required');
    let payload: Record<string, unknown>;
    let endpoint: string;
    if (mediaType === AIMediaType.IMAGE && model === EVOLINK_IMAGE_MODEL) {
      if (
        !Array.isArray(options.image_urls) ||
        !options.image_urls.length ||
        options.image_urls.length > 5
      ) {
        throw new Error('One to five reference images are required');
      }
      payload = {
        model,
        prompt,
        size: options.size,
        image_urls: options.image_urls.map(publicMediaUrl),
      };
      endpoint = '/v1/images/generations';
    } else if (
      mediaType === AIMediaType.VIDEO &&
      model === EVOLINK_VIDEO_MODEL
    ) {
      const duration = options.duration;
      if (!Number.isInteger(duration) || duration < 5 || duration > 15)
        throw new Error('Invalid video duration');
      if (options.quality !== '480p' && options.quality !== '768p')
        throw new Error('Invalid video quality');
      // Turbo rejects audio/video references and aspect_ratio. Its first frame
      // determines the composition; audio/performance direction is prompt based.
      payload = {
        model,
        prompt,
        image_start: publicMediaUrl(options.image_start),
        duration,
        quality: options.quality,
      };
      endpoint = '/v1/videos/generations';
    } else {
      throw new Error('Unsupported EvoLink model');
    }
    if (callbackUrl) payload.callback_url = callbackUrl;
    const task = await this.request<EvolinkTask>(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return this.normalize(task, mediaType);
  }

  async query({
    taskId,
    mediaType,
  }: {
    taskId: string;
    model?: string;
    mediaType?: string;
  }): Promise<AITaskResult> {
    const task = await this.request<EvolinkTask>(
      `${this.baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`
    );
    return this.normalize(task, mediaType);
  }

  private normalize(task: EvolinkTask, mediaType?: string): AITaskResult {
    if (
      !task.id ||
      !['pending', 'processing', 'completed', 'failed', 'cancelled'].includes(
        task.status
      )
    ) {
      throw new EvolinkRequestError(502);
    }
    const status =
      task.status === 'completed'
        ? AITaskStatus.SUCCESS
        : task.status === 'failed' || task.status === 'cancelled'
          ? AITaskStatus.FAILED
          : task.status === 'processing'
            ? AITaskStatus.PROCESSING
            : AITaskStatus.PENDING;
    const url =
      status === AITaskStatus.SUCCESS && task.results?.[0]
        ? publicMediaUrl(task.results[0])
        : undefined;
    if (status === AITaskStatus.SUCCESS && !url)
      throw new Error('EvoLink completed without a media URL');
    return {
      taskId: task.id,
      taskStatus: status,
      taskInfo: {
        status: task.status,
        errorCode: task.error?.code,
        errorMessage: task.error?.message,
        images:
          mediaType === AIMediaType.IMAGE && url
            ? [{ imageUrl: url }]
            : undefined,
        videos:
          mediaType === AIMediaType.VIDEO && url
            ? [{ videoUrl: url }]
            : undefined,
      },
      taskResult:
        mediaType === AIMediaType.VIDEO && url ? { video: { url } } : task,
    };
  }
}

function publicMediaUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Missing media URL');
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('Invalid media URL');
  return url.href;
}
