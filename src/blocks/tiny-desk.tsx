import { Fragment, useState } from 'react';
import {
  ArrowRight,
  Clapperboard,
  Lamp,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { DESK_STYLES } from '@/config/tiny-desk-styles';
import { m } from '@/paraglide/messages.js';
import { LoopVideo, RapVideoPage } from '@/blocks/rap-video';

import '@/styles/tiny-desk.css';

// Trend examples (public/videos/tiny-desk/). The duet clip is landscape and
// spans two columns.
const desk = (name: string) => ({
  src: `/videos/tiny-desk/${name}.mp4`,
  poster: `/videos/tiny-desk/${name}.jpg`,
});
const EXAMPLES: {
  src: string;
  poster: string;
  label: () => string;
  wide?: boolean;
}[] = [
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

/** Trend clips; at most one plays with sound at a time. */
function Examples() {
  const [voiced, setVoiced] = useState<string | null>(null);
  return (
    <section
      id="examples"
      className="rv-showcase td-examples"
      aria-labelledby="examples-heading"
    >
      <div className="rv-head">
        <p className="rv-eyebrow">{m['tinydesk.examples.eyebrow']()}</p>
        <h2 id="examples-heading">{m['tinydesk.examples.title']()}</h2>
        <p>{m['tinydesk.examples.description']()}</p>
      </div>
      <div className="rv-showcase-grid td-examples-grid">
        {EXAMPLES.map((item) => (
          <figure key={item.src} className={item.wide ? 'td-wide' : undefined}>
            <LoopVideo
              src={item.src}
              poster={item.poster}
              label={item.label()}
              muted={voiced !== item.src}
            />
            <button
              type="button"
              className="rv-showcase-sound"
              aria-pressed={voiced === item.src}
              aria-label={
                voiced === item.src
                  ? m['rap.showcase.sound_off']()
                  : m['rap.showcase.sound_on']()
              }
              onClick={() =>
                setVoiced((v) => (v === item.src ? null : item.src))
              }
            >
              {voiced === item.src ? (
                <Volume2 size={16} />
              ) : (
                <VolumeX size={16} />
              )}
            </button>
            <figcaption>{item.label()}</figcaption>
          </figure>
        ))}
      </div>
      <p className="rv-showcase-note">{m['tinydesk.examples.note']()}</p>
      <div className="rv-actions">
        <a href="#create" className="br-btn">
          {m['tinydesk.examples.cta']()} <ArrowRight size={18} />
        </a>
      </div>
    </section>
  );
}

function Content() {
  return (
    <>
      <Examples />

      <section id="how" className="rv-how">
        <div className="rv-head">
          <h2>{m['tinydesk.how.title']()}</h2>
        </div>
        <ol className="rv-timeline">
          <li>
            <Upload size={22} />
            <h3>{m['tinydesk.how.one.title']()}</h3>
            <p>{m['tinydesk.how.one.text']()}</p>
          </li>
          <li>
            <Lamp size={22} />
            <h3>{m['tinydesk.how.two.title']()}</h3>
            <p>{m['tinydesk.how.two.text']()}</p>
          </li>
          <li>
            <Clapperboard size={22} />
            <h3>{m['tinydesk.how.three.title']()}</h3>
            <p>{m['tinydesk.how.three.text']()}</p>
          </li>
        </ol>
      </section>

      <section id="guide" className="rv-guide">
        <div className="rv-guide-aside">
          <p className="rv-eyebrow">{m['tinydesk.guide.eyebrow']()}</p>
          <h2>{m['tinydesk.guide.title']()}</h2>
          <nav aria-label={m['tinydesk.guide.toc']()}>
            {GUIDE.map((part) => (
              <a key={part.id} href={`#${part.id}`}>
                {part.title()}
              </a>
            ))}
          </nav>
        </div>
        <article className="rv-guide-body">
          {GUIDE.map((part) => (
            <Fragment key={part.id}>
              <h3 id={part.id}>{part.title()}</h3>
              {part.body.map((paragraph, i) => (
                <p key={i}>{paragraph()}</p>
              ))}
            </Fragment>
          ))}
          <p className="rv-guide-more">
            {m['tinydesk.guide.more']()}{' '}
            <Link href="/blog/best-photos-for-ai-rap-video">
              {m['tinydesk.guide.link_photos']()}
            </Link>
            {', '}
            <Link href="/blog/ai-rap-duo-trend-tiktok">
              {m['tinydesk.guide.link_trend']()}
            </Link>
            .
          </p>
        </article>
      </section>
    </>
  );
}

function Faq() {
  return (
    <section id="faq" className="rv-faq" aria-labelledby="faq-heading">
      <div className="rv-head">
        <p className="rv-eyebrow">{m['tinydesk.faq.eyebrow']()}</p>
        <h2 id="faq-heading">{m['tinydesk.faq.title']()}</h2>
      </div>
      <div className="rv-faq-list">
        {TINY_DESK_FAQ.map(([question, answer], item) => (
          <details key={item}>
            <summary>{question()}</summary>
            <p>{answer()}</p>
          </details>
        ))}
      </div>
    </section>
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
            ...desk(DESK_STYLES[id].sample),
            needsTwo: DESK_STYLES[id].needsTwo,
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
