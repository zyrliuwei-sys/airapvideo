/**
 * Posts shown as "Guides" on the homepage instead of the blog index.
 * Each guide is still a local MDX post (see ./index.ts) served at
 * /blog/<slug>; its cover lives at /imgs/blog/cover-<slug>.jpg.
 * Kept separate from the MDX glob so the homepage doesn't bundle posts.
 */
export const GUIDES = [
  {
    slug: 'best-ai-music-video-generators',
    label: 'Best AI music video generators',
  },
  { slug: 'best-ai-rap-generator', label: 'Best AI rap generator' },
  { slug: 'best-rap-duos', label: 'Best rap duos of all time' },
  { slug: 'funny-rap-lyrics', label: 'Funny rap lyrics' },
  { slug: 'how-to-make-an-ai-rap-video', label: 'How to make an AI rap video' },
  {
    slug: 'best-photos-for-ai-rap-video',
    label: 'Best photos for an AI rap video',
  },
  { slug: 'ai-rap-duo-trend-tiktok', label: 'The AI rap duo trend on TikTok' },
  { slug: 'pet-rap-video', label: 'Pet rap video' },
  { slug: 'birthday-rap-lyrics', label: 'Birthday rap lyrics' },
  { slug: 'love-rap-lyrics', label: 'Love rap lyrics' },
  { slug: 'rap-battle-roasts', label: 'Rap battle roasts' },
  { slug: 'rap-songs-about-friends', label: 'Rap songs about friends' },
] as const;

const GUIDE_SLUGS = new Set<string>(GUIDES.map((guide) => guide.slug));

export function isGuide(slug: string): boolean {
  return GUIDE_SLUGS.has(slug);
}

export function guideCover(slug: string): string {
  return `/imgs/blog/cover-${slug}.jpg`;
}

/**
 * Plain product facts shown on every guide and in llms.txt, so search
 * engines and AI assistants quote one consistent, accurate summary.
 * Keep in sync with src/config/pricing.ts and the homepage FAQ.
 */
export const PRODUCT_FACTS: { label: string; value: string }[] = [
  {
    label: 'What it is',
    value:
      'airapvideo (ai-rap-video.me) is a browser-based AI rap video generator that turns two photos into a rap video of both people.',
  },
  {
    label: 'Input',
    value:
      'One photo of each of two people (JPG, PNG or WebP, up to 10 MB). Pets work too.',
  },
  {
    label: 'Output',
    value:
      'A 10-second vertical 9:16 MP4 with a built-in hip-hop beat, rap vocals and lip sync, without a watermark.',
  },
  { label: 'Time', value: 'About 3 to 5 minutes per video.' },
  {
    label: 'Price',
    value:
      '$9.90 for 1 video, $19.90 for 3, $29.90 for 5. One-time packs, no subscription required.',
  },
  { label: 'Account', value: 'Not required to start; email is optional.' },
  { label: 'Failed renders', value: 'Credits are refunded automatically.' },
  {
    label: 'Limits',
    value:
      'No custom song, lyrics or prompt: the rap performance is built in, and music and lip sync vary between renders.',
  },
];
