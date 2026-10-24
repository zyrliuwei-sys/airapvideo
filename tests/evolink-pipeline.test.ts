import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, mock, test } from 'node:test';
import { sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';

import {
  EVOLINK_IMAGE_MODEL,
  EVOLINK_VIDEO_MODEL,
  EvolinkProvider,
  EvolinkRequestError,
} from '../src/core/ai/evolink';
import { AIMediaType } from '../src/core/ai/types';

let pipeline: typeof import('../src/routes/api/hotel-lobby/-pipeline');
let tasks: typeof import('../src/modules/ai-tasks/service');
let credits: typeof import('../src/modules/credits/service');
let temp: string;
const provider = new EvolinkProvider({ apiKey: 'test-only-key' });
const json = (body: unknown, status = 200) => Response.json(body, { status });
const photo = (label: string) =>
  `data:image/jpeg;base64,${Buffer.from(label).toString('base64')}`;

before(async () => {
  temp = await mkdtemp(path.join(tmpdir(), 'airap-evolink-'));
  process.env.DATABASE_PROVIDER = 'sqlite';
  process.env.DATABASE_URL = `file:${path.join(temp, 'test.db')}`;
  process.env.CONFIG_ENCRYPTION_KEY = '';
  const { db } = await import('../src/core/db');
  const schema = await import('../src/config/db/schema.sqlite');
  // Generate the isolated test tables from the actual schema definitions.
  for (const table of [
    schema.user,
    schema.aiTask,
    schema.credit,
    schema.config,
  ]) {
    const config = getTableConfig(table);
    const columns = config.columns.map(
      (column) =>
        `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`
    );
    await db().run(
      sql.raw(`CREATE TABLE "${config.name}" (${columns.join(',')})`)
    );
  }
  await db()
    .insert(schema.user)
    .values({ id: 'tester', name: 'Tester', email: 'tester@example.invalid' });
  pipeline = await import('../src/routes/api/hotel-lobby/-pipeline');
  tasks = await import('../src/modules/ai-tasks/service');
  credits = await import('../src/modules/credits/service');
});

after(async () => {
  mock.restoreAll();
  await rm(temp, { recursive: true, force: true });
});

async function paidTask(imageId: string) {
  await credits.grant({ userId: 'tester', credits: 440 });
  const task = await tasks.createTask({
    userId: 'tester',
    mediaType: 'video',
    provider: 'evolink',
    model: pipeline.PIPELINE_MODEL,
    prompt: 'duet',
    costCredits: 440,
  });
  await tasks.mergeTaskInfo(task.id, {
    imageRequestId: imageId,
    length: '15',
    quality: '768p',
    videoPrompt: pipeline.buildPerformancePrompt('15'),
  });
  return task;
}

test('uploads two photos in order and submits Nano Banana with a supported aspect ratio', async () => {
  const uploads: string[] = [];
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        'Bearer test-only-key'
      );
      if (url.includes('/upload/stream')) {
        const file = (init!.body as FormData).get('file') as File;
        const label = await file.text();
        uploads.push(label);
        return json({
          success: true,
          data: { file_url: `https://files.evolink.ai/${label}.jpg` },
        });
      }
      assert.equal(url, 'https://api.evolink.ai/v1/images/generations');
      const body = JSON.parse(init!.body as string);
      assert.equal(body.model, EVOLINK_IMAGE_MODEL);
      assert.equal(body.size, '9:16');
      assert.deepEqual(body.image_urls, [
        'https://files.evolink.ai/left.jpg',
        'https://files.evolink.ai/right.jpg',
      ]);
      assert.match(body.prompt, /removing both original backgrounds/);
      assert.equal(body.quality, undefined);
      return json({ id: 'scene', status: 'pending' });
    }
  );
  assert.equal(
    await pipeline.submitScene(
      provider,
      [photo('left'), photo('right')],
      pipeline.buildScenePrompt('', 'full'),
      'full'
    ),
    'scene'
  );
  assert.deepEqual(uploads.sort(), ['left', 'right']);
  fetchMock.mock.restore();
});

test('concurrent scene polls start exactly one H3 video; completed MP4 has the common result shape', async () => {
  const task = await paidTask('scene-concurrent');
  let submissions = 0;
  let videoDone = false;
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/scene-concurrent'))
        return json({
          id: 'scene-concurrent',
          status: 'completed',
          results: ['https://cdn.example.invalid/scene.jpg'],
        });
      if (url.endsWith('/videos/generations')) {
        submissions++;
        const body = JSON.parse(init!.body as string);
        assert.equal(body.model, EVOLINK_VIDEO_MODEL);
        assert.equal(body.image_start, 'https://cdn.example.invalid/scene.jpg');
        assert.equal(body.duration, 15);
        assert.equal(body.quality, '768p');
        assert.match(body.prompt, /original punchy hip-hop instrumental/);
        assert.match(body.prompt, /mouth to the syllables/);
        for (const field of [
          'aspect_ratio',
          'video_urls',
          'audio_urls',
          'video_url',
          'image_url',
        ])
          assert.equal(body[field], undefined);
        return json({ id: 'video-concurrent', status: 'pending' });
      }
      assert.ok(url.endsWith('/video-concurrent'));
      return json(
        videoDone
          ? {
              id: 'video-concurrent',
              status: 'completed',
              results: ['https://cdn.example.invalid/result.mp4'],
            }
          : { id: 'video-concurrent', status: 'processing' }
      );
    }
  );
  await Promise.all([
    pipeline.advance(task.id, provider),
    pipeline.advance(task.id, provider),
  ]);
  assert.equal(submissions, 1);
  const processing = await pipeline.advance(task.id, provider);
  assert.equal(processing.stage, 'motion');
  assert.equal(
    processing.sceneImageUrl,
    'https://cdn.example.invalid/scene.jpg'
  );
  videoDone = true;
  const done = await pipeline.advance(task.id, provider);
  assert.equal(done.status, 'success');
  assert.equal(done.videoUrl, 'https://cdn.example.invalid/result.mp4');
  assert.equal(done.stage, null);
  assert.ok(JSON.parse((await tasks.findTask(task.id))!.taskInfo!).creditId);
  fetchMock.mock.restore();
});

test('concurrent provider failures refund the paid task once', async () => {
  const balanceBefore = await credits.getBalance('tester');
  const task = await paidTask('scene-failed');
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    json({
      id: 'scene-failed',
      status: 'failed',
      error: { code: 'generation_failed', message: 'Failed' },
    })
  );
  const results = await Promise.all([
    pipeline.advance(task.id, provider),
    pipeline.advance(task.id, provider),
  ]);
  assert.ok(results.every((item) => item.status === 'failed'));
  assert.equal(await credits.getBalance('tester'), balanceBefore + 440);
  await pipeline.advance(task.id, provider);
  assert.equal(await credits.getBalance('tester'), balanceBefore + 440);
  fetchMock.mock.restore();
});

test('rate limits and gateway failures preserve the task for later polling', async () => {
  const task = await paidTask('scene-retry');
  for (const status of [429, 500, 503]) {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
      json({ error: 'temporary' }, status)
    );
    assert.equal((await pipeline.advance(task.id, provider)).status, 'pending');
    fetchMock.mock.restore();
  }
  await pipeline.failPipelineTask(task.id, 'test cleanup');
});

test('rejects invalid duration before a billable request and rejects completed tasks without a result', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    json({ id: 'empty-result', status: 'completed', results: [] })
  );
  await assert.rejects(
    provider.generate({
      params: {
        mediaType: AIMediaType.VIDEO,
        model: EVOLINK_VIDEO_MODEL,
        prompt: 'duet',
        options: {
          duration: '15',
          quality: '768p',
          image_start: 'https://example.invalid/image.jpg',
        },
      },
    }),
    /duration/
  );
  assert.equal(fetchMock.mock.callCount(), 0);
  await assert.rejects(
    provider.query({ taskId: 'empty-result', mediaType: AIMediaType.VIDEO }),
    /without a media URL/
  );
  fetchMock.mock.restore();
});

test('malformed gateway JSON is transient and upstream errors do not expose response bodies', async () => {
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async () => new Response('private gateway information', { status: 502 })
  );
  await assert.rejects(
    provider.query({ taskId: 'anything' }),
    (error: unknown) =>
      error instanceof EvolinkRequestError &&
      error.status === 502 &&
      !error.message.includes('private')
  );
  fetchMock.mock.restore();
});

test('an HTML gateway response with HTTP 200 is retried as a transient error', async () => {
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async () => new Response('<html>gateway error</html>', { status: 200 })
  );
  await assert.rejects(
    provider.query({ taskId: 'bad-gateway' }),
    (error: unknown) =>
      error instanceof EvolinkRequestError && error.status === 502
  );
  fetchMock.mock.restore();
});

test('the default video is fixed at 10 seconds with supported quality', async () => {
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      assert.equal(body.duration, 10);
      assert.equal(body.quality, '480p');
      return json({ id: 'short-video', status: 'pending' });
    }
  );
  const task = await paidTask('short-scene');
  await pipeline.submitMotion(
    task.id,
    provider,
    'https://cdn.example.invalid/short.jpg',
    undefined,
    { quality: '480p' }
  );
  assert.equal(fetchMock.mock.callCount(), 1);
  fetchMock.mock.restore();
  await pipeline.failPipelineTask(task.id, 'test cleanup');
});

test('a rejected video submission fails the task and restores credits', async () => {
  const balanceBefore = await credits.getBalance('tester');
  const task = await paidTask('scene-video-rejected');
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (input: string | URL | Request) => {
      if (String(input).endsWith('/scene-video-rejected'))
        return json({
          id: 'scene-video-rejected',
          status: 'completed',
          results: ['https://cdn.example.invalid/scene.jpg'],
        });
      return json({ error: { message: 'private upstream message' } }, 402);
    }
  );
  assert.equal((await pipeline.advance(task.id, provider)).status, 'failed');
  assert.equal(await credits.getBalance('tester'), balanceBefore + 440);
  const info = JSON.parse((await tasks.findTask(task.id))!.taskInfo!);
  assert.equal(info.videoRequestId, undefined);
  fetchMock.mock.restore();
});

test('a completed image followed by a failed video refunds once', async () => {
  const balanceBefore = await credits.getBalance('tester');
  const task = await paidTask('scene-video-failed');
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (input: string | URL | Request) => {
      if (String(input).endsWith('/scene-video-failed'))
        return json({
          id: 'scene-video-failed',
          status: 'completed',
          results: ['https://cdn.example.invalid/scene.jpg'],
        });
      if (String(input).endsWith('/videos/generations'))
        return json({ id: 'video-failed', status: 'pending' });
      return json({ id: 'video-failed', status: 'failed' });
    }
  );
  assert.equal(
    (await pipeline.advance(task.id, provider)).status,
    'processing'
  );
  const results = await Promise.all([
    pipeline.advance(task.id, provider),
    pipeline.advance(task.id, provider),
  ]);
  assert.ok(results.every((item) => item.status === 'failed'));
  assert.equal(await credits.getBalance('tester'), balanceBefore + 440);
  fetchMock.mock.restore();
});
