import { Clapperboard, Lamp, Upload } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { styleNeedsTwo, styleSample } from '@/config/scene-themes';
import { m } from '@/paraglide/messages.js';
import { RapVideoPage } from '@/blocks/rap-video';
import { ThemeContent, ThemeFaq } from '@/blocks/theme-landing';

// Trend examples (public/videos/tiny-desk/). The duet clip is landscape and
// spans two columns.
const desk = (name: string) => ({
  src: `/videos/tiny-desk/${name}.mp4`,
  poster: `/videos/tiny-desk/${name}.jpg`,
});
const EXAMPLES = [
  { ...desk('mini-desk'), label: m['tinydesk.examples.clip.band'] },
  { ...desk('outstanding-solo'), label: m['tinydesk.examples.clip.crew'] },
  { ...desk('band-and-sax'), label: m['tinydesk.examples.clip.laugh'] },
  {
    ...desk('desk-concert'),
    label: m['tinydesk.examples.clip.duet'],
    wide: true,
  },
];

// Static message refs keep the message tree-shaking intact. Also used by
// the route for FAQPage JSON-LD.
export const TINY_DESK_FAQ = [
  [m['tinydesk.faq.one.question'], m['tinydesk.faq.one.answer']],
  [m['tinydesk.faq.two.question'], m['tinydesk.faq.two.answer']],
  [m['tinydesk.faq.three.question'], m['tinydesk.faq.three.answer']],
  [m['tinydesk.faq.four.question'], m['tinydesk.faq.four.answer']],
  [m['tinydesk.faq.five.question'], m['tinydesk.faq.five.answer']],
  [m['tinydesk.faq.six.question'], m['tinydesk.faq.six.answer']],
] as const;

const GUIDE = [
  {
    id: 'what-is',
    title: m['tinydesk.guide.what.title'],
    body: [m['tinydesk.guide.what.one'], m['tinydesk.guide.what.two']],
  },
  {
    id: 'origin',
    title: m['tinydesk.guide.origin.title'],
    body: [m['tinydesk.guide.origin.one'], m['tinydesk.guide.origin.two']],
  },
  {
    id: 'good',
    title: m['tinydesk.guide.good.title'],
    body: [m['tinydesk.guide.good.one'], m['tinydesk.guide.good.two']],
  },
  {
    id: 'photos',
    title: m['tinydesk.guide.photos.title'],
    body: [m['tinydesk.guide.photos.one']],
  },
  {
    id: 'duo',
    title: m['tinydesk.guide.duo.title'],
    body: [m['tinydesk.guide.duo.one']],
  },
  {
    id: 'post',
    title: m['tinydesk.guide.post.title'],
    body: [m['tinydesk.guide.post.one']],
  },
  {
    id: 'rules',
    title: m['tinydesk.guide.rules.title'],
    body: [m['tinydesk.guide.rules.one']],
  },
];

function Content() {
  return (
    <ThemeContent
      examples={{
        eyebrow: m['tinydesk.examples.eyebrow'](),
        title: m['tinydesk.examples.title'](),
        description: m['tinydesk.examples.description'](),
        note: m['tinydesk.examples.note'](),
        cta: m['tinydesk.examples.cta'](),
        clips: EXAMPLES.map(({ label, ...clip }) => ({
          ...clip,
          label: label(),
        })),
      }}
      how={{
        title: m['tinydesk.how.title'](),
        steps: [
          {
            icon: Upload,
            title: m['tinydesk.how.one.title'](),
            text: m['tinydesk.how.one.text'](),
          },
          {
            icon: Lamp,
            title: m['tinydesk.how.two.title'](),
            text: m['tinydesk.how.two.text'](),
          },
          {
            icon: Clapperboard,
            title: m['tinydesk.how.three.title'](),
            text: m['tinydesk.how.three.text'](),
          },
        ],
      }}
      guide={{
        eyebrow: m['tinydesk.guide.eyebrow'](),
        title: m['tinydesk.guide.title'](),
        toc: m['tinydesk.guide.toc'](),
        parts: GUIDE.map((part) => ({
          id: part.id,
          title: part.title(),
          body: part.body.map((paragraph) => paragraph()),
        })),
        more: (
          <>
            {m['tinydesk.guide.more']()}{' '}
            <Link href="/blog/best-photos-for-ai-rap-video">
              {m['tinydesk.guide.link_photos']()}
            </Link>
            {', '}
            <Link href="/blog/ai-rap-duo-trend-tiktok">
              {m['tinydesk.guide.link_trend']()}
            </Link>
            .
          </>
        ),
      }}
    />
  );
}

function Faq() {
  return (
    <ThemeFaq
      eyebrow={m['tinydesk.faq.eyebrow']()}
      title={m['tinydesk.faq.title']()}
      items={[...TINY_DESK_FAQ]}
    />
  );
}

/** Tiny Desk AI landing page: the generator in desk-concert style. */
export function TinyDeskPage() {
  return (
    <RapVideoPage
      style="tinydesk"
      copy={{
        eyebrow: m['tinydesk.hero.eyebrow'](),
        title: m['tinydesk.hero.title'](),
        subtitle: m['tinydesk.hero.subtitle'](),
        secondary: {
          href: '#examples',
          label: m['tinydesk.hero.secondary'](),
        },
        demo: desk('mini-desk'),
        lengthText: m['tinydesk.facts.length'](),
        hint: m['tinydesk.create.hint'](),
        ready: m['tinydesk.create.ready'](),
        done: m['tinydesk.create.done'](),
        exampleNote: m['tinydesk.create.example_note'](),
        styles: {
          title: m['tinydesk.styles.title'](),
          optional: m['tinydesk.create.optional'](),
          options: (
            [
              ['band', m['tinydesk.styles.band']],
              ['session', m['tinydesk.styles.session']],
              ['closeup', m['tinydesk.styles.closeup']],
              ['duet', m['tinydesk.styles.duet']],
            ] as const
          ).map(([id, label]) => ({
            id,
            label: label(),
            ...styleSample('tinydesk', id),
            needsTwo: styleNeedsTwo('tinydesk', id),
          })),
        },
        cta: m['tinydesk.hero.cta'](),
        generate: m['tinydesk.create.generate'](),
        slots: {
          a: m['tinydesk.create.person_a'](),
          b: m['tinydesk.create.person_b'](),
          left: m['tinydesk.create.left'](),
          right: m['tinydesk.create.right'](),
        },
        closing: {
          title: m['tinydesk.bottom.title'](),
          text: m['tinydesk.bottom.text'](),
          cta: m['tinydesk.bottom.cta'](),
        },
      }}
      content={<Content />}
      afterPricing={<Faq />}
    />
  );
}
