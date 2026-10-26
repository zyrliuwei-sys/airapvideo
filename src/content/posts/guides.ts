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
