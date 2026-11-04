import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Camera,
  ChevronRight,
  Route as RoadIcon,
} from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import {
  ROAD_CLIPS,
  ROAD_ORIGIN,
  ROAD_SOURCE,
  roadMedia,
} from '@/config/hit-the-road';
import { m } from '@/paraglide/messages.js';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { TrendPrompt } from '@/components/trend-prompt';
import { TrendVideo } from '@/components/trend-video';

import '@/styles/hit-the-road.css';

export const ROAD_FAQ = [
  [m['road.faq.one.q'], m['road.faq.one.a']],
  [m['road.faq.two.q'], m['road.faq.two.a']],
  [m['road.faq.three.q'], m['road.faq.three.a']],
  [m['road.faq.four.q'], m['road.faq.four.a']],
  [m['road.faq.five.q'], m['road.faq.five.a']],
  [m['road.faq.six.q'], m['road.faq.six.a']],
] as const;

const EXAMPLE_COPY = [
  [m['road.examples.pickup.title'], m['road.examples.pickup.text']],
  [m['road.examples.cat.title'], m['road.examples.cat.text']],
  [m['road.examples.carriage.title'], m['road.examples.carriage.text']],
] as const;

export function HitTheRoadPage() {
  const videoLabels = {
    playLabel: m['road.play'](),
    errorLabel: m['road.video.error'](),
    sourceUrl: ROAD_SOURCE,
  };
  return (
    <div className="rd-page">
      <Header />
      <main>
        <section className="rd-hero rd-wrap">
          <nav className="rd-breadcrumb" aria-label={m['road.breadcrumb']()}>
            <Link href="/">{m['road.home']()}</Link>
            <ChevronRight size={12} aria-hidden="true" />
            <span>{m['road.nav']()}</span>
          </nav>
          <div className="rd-hero-grid">
            <div className="rd-hero-copy">
              <p className="rd-eyebrow">
                <span />
                {m['road.hero.eyebrow']()}
              </p>
              <h1>
                {m['road.hero.title']()}{' '}
                <span>
                  {m['road.hero.suffix']()}
                  <ArrowUpRight aria-hidden="true" />
                </span>
              </h1>
              <p className="rd-lede">{m['road.hero.text']()}</p>
              <div className="rd-actions">
                <a href="#prompt" className="br-btn">
                  {m['road.hero.cta']()}
                  <ArrowRight size={18} />
                </a>
                <a href="#examples" className="rd-text-link">
                  {m['road.hero.secondary']()}
                  <ArrowDown size={16} />
                </a>
              </div>
              <p className="rd-hero-note">
                <Camera size={15} />
                {m['road.hero.note']()}
              </p>
              <div className="rd-road-mark" aria-hidden="true">
                <RoadIcon size={25} />
                <span />
                <span />
                <span />
                <ArrowRight size={25} />
              </div>
            </div>
            <figure className="rd-hero-film">
              <div className="rd-film-top">
                <span>{m['road.reference']()} / 02</span>
                <span>9:16</span>
              </div>
              <TrendVideo
                {...roadMedia('cat')}
                {...videoLabels}
                label={m['road.examples.cat.title']()}
                priority
              />
              <div className="rd-property-stamp" aria-hidden="true">
                {m['road.hero.stamp']()}
                <ArrowUpRight size={18} />
              </div>
              <figcaption>
                <strong>{m['road.hero.caption']()}</strong>
                <a href={ROAD_SOURCE} target="_blank" rel="noopener noreferrer">
                  {m['road.hero.credit']()}
                  <ArrowUpRight size={13} />
                </a>
              </figcaption>
            </figure>
          </div>
        </section>

        <nav className="rd-jump" aria-label={m['road.nav']()}>
          <div className="rd-wrap">
            {(
              [
                ['examples', m['road.nav.examples']],
                ['story', m['road.nav.story']],
                ['prompt', m['road.nav.prompt']],
                ['how', m['road.nav.how']],
                ['faq', m['road.nav.faq']],
              ] as const
            ).map(([id, label], index) => (
              <a key={id} href={`#${id}`}>
                <span>0{index + 1}</span>
                {label()}
              </a>
            ))}
          </div>
        </nav>

        <section id="examples" className="rd-examples rd-wrap rd-section">
          <div className="rd-section-head">
            <div>
              <p className="rd-eyebrow">{m['road.examples.eyebrow']()}</p>
              <h2>{m['road.examples.title']()}</h2>
            </div>
            <p>{m['road.examples.text']()}</p>
          </div>
          <div className="rd-gallery">
            {ROAD_CLIPS.map((clip, index) => (
              <figure key={clip}>
                <div className="rd-example-number">
                  <span>0{index + 1}</span>
                  <span>
                    {index === 0
                      ? m['road.cast.person']()
                      : index === 1
                        ? m['road.cast.cat']()
                        : m['road.cast.carriage']()}
                  </span>
                </div>
                <TrendVideo
                  {...roadMedia(clip)}
                  {...videoLabels}
                  label={EXAMPLE_COPY[index][0]()}
                />
                <figcaption>
                  <h3>{EXAMPLE_COPY[index][0]()}</h3>
                  <p>{EXAMPLE_COPY[index][1]()}</p>
                  <a
                    href={ROAD_SOURCE}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {m['road.examples.source']()}
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="rd-source-note">{m['road.examples.note']()}</p>
        </section>

        <section id="story" className="rd-story">
          <div className="rd-wrap rd-section rd-story-grid">
            <div>
              <p className="rd-eyebrow">{m['road.story.eyebrow']()}</p>
              <h2>{m['road.story.title']()}</h2>
              <p>{m['road.story.one']()}</p>
              <p>{m['road.story.two']()}</p>
              <p>{m['road.story.three']()}</p>
              <a
                href={ROAD_ORIGIN}
                target="_blank"
                rel="noopener noreferrer"
                className="rd-text-link"
              >
                {m['road.story.source']()}
              </a>
            </div>
            <aside className="rd-beats">
              <p className="rd-eyebrow">{m['road.beats.title']()}</p>
              {[
                [m['road.beats.one.title'], m['road.beats.one.text']],
                [m['road.beats.two.title'], m['road.beats.two.text']],
                [m['road.beats.three.title'], m['road.beats.three.text']],
              ].map(([title, text], i) => (
                <div key={i}>
                  <span>0{i + 1}</span>
                  <div>
                    <h3>{title()}</h3>
                    <p>{text()}</p>
                  </div>
                </div>
              ))}
            </aside>
          </div>
        </section>

        <section id="prompt" className="rd-wrap rd-section rd-prompt-grid">
          <div>
            <p className="rd-eyebrow">{m['road.prompt.eyebrow']()}</p>
            <h2>{m['road.prompt.title']()}</h2>
            <p>{m['road.prompt.text']()}</p>
            <a
              className="rd-text-link"
              href={ROAD_SOURCE}
              target="_blank"
              rel="noopener noreferrer"
            >
              {m['road.prompt.external']()}
            </a>
            <p className="rd-fine-print">{m['road.prompt.note']()}</p>
          </div>
          <TrendPrompt
            legend={m['road.prompt.legend']()}
            promptLabel={m['road.prompt.label']()}
            copyLabel={m['road.prompt.copy']()}
            copiedLabel={m['road.prompt.copied']()}
            failedLabel={m['road.prompt.failed']()}
            options={[
              {
                id: 'person',
                label: m['road.prompt.person'](),
                text: m['road.prompt.base']({
                  subject: m['road.prompt.subject.person'](),
                }),
              },
              {
                id: 'cat',
                label: m['road.prompt.cat'](),
                text: m['road.prompt.base']({
                  subject: m['road.prompt.subject.cat'](),
                }),
              },
              {
                id: 'dog',
                label: m['road.prompt.dog'](),
                text: m['road.prompt.base']({
                  subject: m['road.prompt.subject.dog'](),
                }),
              },
            ]}
          />
        </section>

        <section id="how" className="rd-how">
          <div className="rd-wrap rd-section">
            <p className="rd-eyebrow">{m['road.how.eyebrow']()}</p>
            <h2>{m['road.how.title']()}</h2>
            <ol>
              {[
                [m['road.how.one.title'], m['road.how.one.text']],
                [m['road.how.two.title'], m['road.how.two.text']],
                [m['road.how.three.title'], m['road.how.three.text']],
                [m['road.how.four.title'], m['road.how.four.text']],
              ].map(([title, text], i) => (
                <li key={i}>
                  <span>0{i + 1}</span>
                  <h3>{title()}</h3>
                  <p>{text()}</p>
                </li>
              ))}
            </ol>
            <div className="rd-tips">
              <h3>{m['road.tips.title']()}</h3>
              <div>
                {[
                  [m['road.tips.one.title'], m['road.tips.one.text']],
                  [m['road.tips.two.title'], m['road.tips.two.text']],
                  [m['road.tips.three.title'], m['road.tips.three.text']],
                ].map(([title, text], i) => (
                  <details key={i}>
                    <summary>
                      {title()}
                      <span aria-hidden="true">+</span>
                    </summary>
                    <p>{text()}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="rd-wrap rd-section rd-faq">
          <div>
            <p className="rd-eyebrow">{m['road.faq.eyebrow']()}</p>
            <h2>{m['road.faq.title']()}</h2>
          </div>
          <div>
            {ROAD_FAQ.map(([question, answer], i) => (
              <details key={i}>
                <summary>
                  {question()}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>
                  {answer()}
                  {i === 5 && (
                    <>
                      {' '}
                      <Link href="/">
                        {m['road.related.rap']()} <ArrowRight size={14} />
                      </Link>
                    </>
                  )}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="rd-related">
          <div className="rd-wrap rd-section">
            <p className="rd-eyebrow">{m['road.related.eyebrow']()}</p>
            <h2>{m['road.related.title']()}</h2>
            <div className="rd-related-grid">
              {[
                {
                  href: '/',
                  image: '/videos/examples/besties.jpg',
                  title: m['road.related.rap'],
                  text: m['road.related.rap.text'],
                },
                {
                  href: '/tiny-desk-ai',
                  image: '/videos/tiny-desk/mini-desk.jpg',
                  title: m['road.related.desk'],
                  text: m['road.related.desk.text'],
                },
                {
                  href: '/thriller-dance',
                  image: '/videos/thriller/zombie-street.jpg',
                  title: m['road.related.thriller'],
                  text: m['road.related.thriller.text'],
                },
              ].map((item) => (
                <Link href={item.href} key={item.href}>
                  <img
                    src={item.image}
                    alt=""
                    width={480}
                    height={854}
                    loading="lazy"
                  />
                  <div>
                    <h3>{item.title()}</h3>
                    <p>{item.text()}</p>
                    <span>
                      {m['road.related.link']()}
                      <ArrowUpRight size={16} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
        <div className="rd-sources rd-wrap">
          <span>{m['road.sources']()}</span>
          <a href={ROAD_SOURCE} target="_blank" rel="noopener noreferrer">
            Media.io
          </a>
          <a href={ROAD_ORIGIN} target="_blank" rel="noopener noreferrer">
            Know Your Meme
          </a>
          <time dateTime="2026-11-04">{m['road.reviewed']()}</time>
        </div>
      </main>
      <Footer />
    </div>
  );
}
