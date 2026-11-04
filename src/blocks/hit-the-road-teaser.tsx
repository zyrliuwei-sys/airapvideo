import { ArrowUpRight } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { roadMedia } from '@/config/hit-the-road';
import { m } from '@/paraglide/messages.js';

import '@/styles/hit-the-road-teaser.css';

export function HitTheRoadTeaser() {
  return (
    <section className="rd-teaser" aria-labelledby="road-teaser-title">
      <Link href="/hit-the-road-dude-ai">
        <img
          src={roadMedia('cat').poster}
          alt=""
          width={480}
          height={854}
          loading="lazy"
          decoding="async"
        />
        <div>
          <p className="rv-eyebrow">{m['road.teaser.eyebrow']()}</p>
          <h2 id="road-teaser-title">{m['road.teaser.title']()}</h2>
          <p>{m['road.teaser.text']()}</p>
          <span>
            {m['road.teaser.cta']()}
            <ArrowUpRight size={18} />
          </span>
        </div>
        <ArrowUpRight
          className="rd-teaser-arrow"
          size={48}
          aria-hidden="true"
        />
      </Link>
    </section>
  );
}
