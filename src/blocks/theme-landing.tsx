import { Fragment, useState, type ReactNode } from 'react';
import { ArrowRight, Volume2, VolumeX, type LucideIcon } from 'lucide-react';

import { m } from '@/paraglide/messages.js';
import { LoopVideo } from '@/blocks/rap-video';

import '@/styles/theme-landing.css';

/**
 * Sections shared by the themed generator pages (Tiny Desk, Thriller …):
 * trend examples, how-to steps, the long-form guide and the FAQ. Each page
 * passes its own copy; these only lay it out.
 */
export type ThemeContentProps = {
  examples: {
    eyebrow: string;
    title: string;
    description: string;
    note: string;
    cta: string;
    clips: { src: string; poster: string; label: string; wide?: boolean }[];
  };
  how: {
    title: string;
    steps: { icon: LucideIcon; title: string; text: string }[];
  };
  guide: {
    eyebrow: string;
    title: string;
    toc: string;
    parts: { id: string; title: string; body: string[] }[];
    /** Closing line with related links */
    more: ReactNode;
  };
};

/** Trend clips; at most one plays with sound at a time. */
function Examples({ examples }: Pick<ThemeContentProps, 'examples'>) {
  const [voiced, setVoiced] = useState<string | null>(null);
  return (
    <section
      id="examples"
      className="rv-showcase"
      aria-labelledby="examples-heading"
    >
      <div className="rv-head">
        <p className="rv-eyebrow">{examples.eyebrow}</p>
        <h2 id="examples-heading">{examples.title}</h2>
        <p>{examples.description}</p>
      </div>
      <div className="rv-showcase-grid tl-examples-grid">
        {examples.clips.map((item) => (
          <figure key={item.src} className={item.wide ? 'tl-wide' : undefined}>
            <LoopVideo
              src={item.src}
              poster={item.poster}
              label={item.label}
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
            <figcaption>{item.label}</figcaption>
          </figure>
        ))}
      </div>
      <p className="rv-showcase-note">{examples.note}</p>
      <div className="rv-actions">
        <a href="#create" className="br-btn">
          {examples.cta} <ArrowRight size={18} />
        </a>
      </div>
    </section>
  );
}

/** Examples, how-to steps and the guide, above the pricing section. */
export function ThemeContent({ examples, how, guide }: ThemeContentProps) {
  return (
    <>
      <Examples examples={examples} />

      <section id="how" className="rv-how">
        <div className="rv-head">
          <h2>{how.title}</h2>
        </div>
        <ol className="rv-timeline">
          {how.steps.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Icon size={22} />
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="guide" className="rv-guide">
        <div className="rv-guide-aside">
          <p className="rv-eyebrow">{guide.eyebrow}</p>
          <h2>{guide.title}</h2>
          <nav aria-label={guide.toc}>
            {guide.parts.map((part) => (
              <a key={part.id} href={`#${part.id}`}>
                {part.title}
              </a>
            ))}
          </nav>
        </div>
        <article className="rv-guide-body">
          {guide.parts.map((part) => (
            <Fragment key={part.id}>
              <h3 id={part.id}>{part.title}</h3>
              {part.body.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </Fragment>
          ))}
          <p className="rv-guide-more">{guide.more}</p>
        </article>
      </section>
    </>
  );
}

/** FAQ below the pricing section. */
export function ThemeFaq({
  eyebrow,
  title,
  items,
}: {
  eyebrow: string;
  title: string;
  items: (readonly [() => string, () => string])[];
}) {
  return (
    <section id="faq" className="rv-faq" aria-labelledby="faq-heading">
      <div className="rv-head">
        <p className="rv-eyebrow">{eyebrow}</p>
        <h2 id="faq-heading">{title}</h2>
      </div>
      <div className="rv-faq-list">
        {items.map(([question, answer], item) => (
          <details key={item}>
            <summary>{question()}</summary>
            <p>{answer()}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
