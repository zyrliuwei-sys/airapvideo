/** Curated reference clips from the Media.io collection, checked 2026-11-04.
 * These are third-party examples, not output from our rap-video generator.
 * Local copies avoid expiring signed preview URLs. See SOURCES.md beside them.
 */
export const ROAD_SOURCE =
  'https://www.media.io/ai/zh/explore/zone/hit-the-road-dude-ai-video';
export const ROAD_ORIGIN =
  'https://knowyourmeme.com/memes/lock-em-up-state-property';
export const ROAD_CLIPS = ['pickup', 'cat', 'carriage'] as const;
export function roadMedia(clip: (typeof ROAD_CLIPS)[number]) {
  return {
    src: `/videos/hit-the-road-dude/${clip}.mp4`,
    poster: `/videos/hit-the-road-dude/${clip}.jpg`,
  };
}
