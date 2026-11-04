import { useEffect, useId, useRef } from 'react';
import { ArrowUpRight, ChevronDown, Flame, Play } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';

import '@/styles/trending-videos-menu.css';

type TrendingVideo = {
  href: string;
  label: string;
  description: string;
  poster: string;
  badge?: string;
};

/** Native disclosure keeps the page links in the server-rendered HTML. */
export function TrendingVideosMenu({
  label,
  shortLabel,
  heading,
  description,
  items,
  currentPath,
  onOpen,
  onNavigate,
}: {
  label: string;
  shortLabel: string;
  heading: string;
  description: string;
  items: TrendingVideo[];
  currentPath: string;
  onOpen: () => void;
  onNavigate: () => void;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const panelId = useId();

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !disclosure.current?.contains(event.target)
      ) {
        disclosure.current?.removeAttribute('open');
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && disclosure.current?.open) {
        disclosure.current.open = false;
        trigger.current?.focus();
      }
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  useEffect(() => {
    disclosure.current?.removeAttribute('open');
  }, [currentPath]);

  return (
    <details
      ref={disclosure}
      className="br-trending"
      onToggle={(event) => {
        if (event.currentTarget.open) onOpen();
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          event.currentTarget.open = false;
        }
      }}
    >
      <summary
        ref={trigger}
        className="br-trending-trigger"
        aria-label={label}
        aria-controls={panelId}
      >
        <span className="br-trending-flame">
          <Flame size={18} fill="currentColor" aria-hidden="true" />
        </span>
        <span className="br-trending-label">{label}</span>
        <span className="br-trending-short">{shortLabel}</span>
        <span className="br-trending-count" aria-hidden="true">
          {String(items.length).padStart(2, '0')}
        </span>
        <ChevronDown
          size={14}
          className="br-trending-chevron"
          aria-hidden="true"
        />
      </summary>
      <nav id={panelId} className="br-trending-panel" aria-label={label}>
        <div className="br-trending-panel-head">
          <div>
            <span>{heading}</span>
            <p>{description}</p>
          </div>
          <Flame size={22} aria-hidden="true" />
        </div>
        {items.map((item, index) => (
          <Link
            key={item.href}
            href={item.href}
            className="br-trending-item"
            aria-current={currentPath === item.href ? 'page' : undefined}
            onClick={() => {
              disclosure.current?.removeAttribute('open');
              onNavigate();
            }}
          >
            <span className="br-trending-thumb">
              <img
                src={item.poster}
                alt=""
                width={48}
                height={64}
                loading="lazy"
                decoding="async"
              />
              <Play size={12} fill="currentColor" aria-hidden="true" />
            </span>
            <span className="br-trending-copy">
              <span className="br-trending-item-title">{item.label}</span>
              <span className="br-trending-item-description">
                {item.description}
              </span>
              {item.badge && (
                <span className="br-trending-badge">{item.badge}</span>
              )}
            </span>
            <span className="br-trending-index" aria-hidden="true">
              0{index + 1}
              <ArrowUpRight size={16} />
            </span>
          </Link>
        ))}
      </nav>
    </details>
  );
}
