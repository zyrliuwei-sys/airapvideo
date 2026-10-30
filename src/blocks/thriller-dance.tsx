import { Clapperboard, Moon, Upload } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { styleNeedsTwo, styleSample } from '@/config/scene-themes';
import { m } from '@/paraglide/messages.js';
import { RapVideoPage } from '@/blocks/rap-video';
import { ThemeContent, ThemeFaq } from '@/blocks/theme-landing';

// Trend examples (public/videos/thriller/); the first four are also the
// style samples.
const clip = (name: string) => ({
  src: `/videos/thriller/${name}.mp4`,
  poster: `/videos/thriller/${name}.jpg`,
});
const EXAMPLES = [
  { ...clip('zombie-street'), label: m['thriller.examples.clip.street'] },
  { ...clip('close-up-reveal'), label: m['thriller.examples.clip.reveal'] },
  { ...clip('red-jacket'), label: m['thriller.examples.clip.jacket'] },
  { ...clip('pumpkin-yard'), label: m['thriller.examples.clip.yard'] },
  { ...clip('zombie-makeup'), label: m['thriller.examples.clip.makeup'] },
];

// Static message refs keep the message tree-shaking intact. Also used by
// the route for FAQPage JSON-LD.
export const THRILLER_FAQ = [
  [m['thriller.faq.one.question'], m['thriller.faq.one.answer']],
  [m['thriller.faq.two.question'], m['thriller.faq.two.answer']],
  [m['thriller.faq.three.question'], m['thriller.faq.three.answer']],
  [m['thriller.faq.four.question'], m['thriller.faq.four.answer']],
  [m['thriller.faq.five.question'], m['thriller.faq.five.answer']],
  [m['thriller.faq.six.question'], m['thriller.faq.six.answer']],
] as const;

const GUIDE = [
  {
    id: 'what-is',
    title: m['thriller.guide.what.title'],
    body: [m['thriller.guide.what.one'], m['thriller.guide.what.two']],
  },
  {
    id: 'origin',
    title: m['thriller.guide.origin.title'],
    body: [m['thriller.guide.origin.one'], m['thriller.guide.origin.two']],
  },
  {
    id: 'moves',
    title: m['thriller.guide.moves.title'],
    body: [m['thriller.guide.moves.one'], m['thriller.guide.moves.two']],
  },
  {
    id: 'styles',
    title: m['thriller.guide.styles.title'],
    body: [m['thriller.guide.styles.one']],
  },
  {
    id: 'photos',
    title: m['thriller.guide.photos.title'],
    body: [m['thriller.guide.photos.one']],
  },
  {
    id: 'post',
    title: m['thriller.guide.post.title'],
    body: [m['thriller.guide.post.one']],
  },
  {
    id: 'rules',
    title: m['thriller.guide.rules.title'],
    body: [m['thriller.guide.rules.one']],
  },
];

function Content() {
  return (
    <ThemeContent
      examples={{
        eyebrow: m['thriller.examples.eyebrow'](),
        title: m['thriller.examples.title'](),
        description: m['thriller.examples.description'](),
        note: m['thriller.examples.note'](),
        cta: m['thriller.examples.cta'](),
        clips: EXAMPLES.map(({ label, ...item }) => ({
          ...item,
          label: label(),
        })),
      }}
      how={{
        title: m['thriller.how.title'](),
        steps: [
          {
            icon: Upload,
            title: m['thriller.how.one.title'](),
            text: m['thriller.how.one.text'](),
          },
          {
            icon: Moon,
            title: m['thriller.how.two.title'](),
            text: m['thriller.how.two.text'](),
          },
          {
            icon: Clapperboard,
            title: m['thriller.how.three.title'](),
            text: m['thriller.how.three.text'](),
          },
        ],
      }}
      guide={{
        eyebrow: m['thriller.guide.eyebrow'](),
        title: m['thriller.guide.title'](),
        toc: m['thriller.guide.toc'](),
        parts: GUIDE.map((part) => ({
          id: part.id,
          title: part.title(),
          body: part.body.map((paragraph) => paragraph()),
        })),
        more: (
          <>
            {m['thriller.guide.more']()}{' '}
            <Link href="/blog/best-photos-for-ai-rap-video">
              {m['thriller.guide.link_photos']()}
            </Link>
            {', '}
            <Link href="/blog/pet-rap-video">
              {m['thriller.guide.link_pets']()}
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
      eyebrow={m['thriller.faq.eyebrow']()}
      title={m['thriller.faq.title']()}
      items={[...THRILLER_FAQ]}
    />
  );
}

/** Thriller dance landing page: the generator as a zombie dance. */
export function ThrillerDancePage() {
  return (
    <RapVideoPage
      style="thriller"
      copy={{
        eyebrow: m['thriller.hero.eyebrow'](),
        title: m['thriller.hero.title'](),
        subtitle: m['thriller.hero.subtitle'](),
        secondary: {
          href: '#examples',
          label: m['thriller.hero.secondary'](),
        },
        demo: clip('zombie-street'),
        lengthText: m['thriller.facts.length'](),
        hint: m['thriller.create.hint'](),
        ready: m['thriller.create.ready'](),
        done: m['thriller.create.done'](),
        exampleNote: m['thriller.create.example_note'](),
        styles: {
          title: m['thriller.styles.title'](),
          optional: m['thriller.create.optional'](),
          options: (
            [
              ['street', m['thriller.styles.street']],
              ['reveal', m['thriller.styles.reveal']],
              ['jacket', m['thriller.styles.jacket']],
              ['yard', m['thriller.styles.yard']],
            ] as const
          ).map(([id, label]) => ({
            id,
            label: label(),
            ...styleSample('thriller', id),
            needsTwo: styleNeedsTwo('thriller', id),
          })),
        },
        cta: m['thriller.hero.cta'](),
        generate: m['thriller.create.generate'](),
        slots: {
          a: m['thriller.create.person_a'](),
          b: m['thriller.create.person_b'](),
          left: m['thriller.create.left'](),
          right: m['thriller.create.right'](),
        },
        closing: {
          title: m['thriller.bottom.title'](),
          text: m['thriller.bottom.text'](),
          cta: m['thriller.bottom.cta'](),
        },
      }}
      content={<Content />}
      afterPricing={<Faq />}
    />
  );
}
