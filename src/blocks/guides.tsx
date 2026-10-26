import { ArrowRight } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { m } from '@/paraglide/messages.js';
import { guideCover, GUIDES } from '@/content/posts/guides';

import '@/styles/guides.css';

export function Guides() {
  return (
    <section id="guides" className="rv-guides" aria-labelledby="guides-heading">
      <div className="rv-head">
        <p className="rv-eyebrow">{m['guides.eyebrow']()}</p>
        <h2 id="guides-heading">{m['guides.title']()}</h2>
      </div>
      <div className="rv-guides-grid">
        {GUIDES.map((guide) => (
          <Link
            key={guide.slug}
            href={`/blog/${guide.slug}`}
            className="rv-guide-card"
          >
            <img
              src={guideCover(guide.slug)}
              alt=""
              width={1200}
              height={630}
              loading="lazy"
              decoding="async"
            />
            <span className="rv-guide-card-body">
              <span className="rv-guide-card-title">{guide.label}</span>
              <span className="rv-guide-card-read">
                {m['guides.read']()} <ArrowRight size={16} />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
