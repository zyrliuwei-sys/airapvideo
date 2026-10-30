import { lazy, Suspense, useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';
import { localizeHref } from '@/paraglide/runtime.js';

import '@/styles/brand.css';

// The user menu only exists for signed-in visitors — keep its dropdown code
// out of the initial JS.
const SiteUserMenu = lazy(() =>
  import('@/components/site-user-menu').then((mod) => ({
    default: mod.SiteUserMenu,
  }))
);

/** Brand header shared by the homepage and every inner page. */
export function Header() {
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  // The session is only known in the browser: render the signed-out state
  // for SSR and the first client render, then switch, so hydration matches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const user = mounted ? session?.user : undefined;

  // Section links point at the homepage so they also work from inner pages.
  // The guide is desktop-only (hidden on phones), so is its link.
  const links = [
    { href: '/videos', label: m['hotel.create.my_videos']() },
    {
      href: '/#guide',
      label: m['rap.nav.guide'](),
      className: 'br-nav-desktop',
    },
    {
      href: '/#how',
      label: m['hotel.nav.how'](),
      className: 'br-nav-wide',
    },
    { href: '/#pricing', label: m['hotel.nav.pricing']() },
    {
      href: '/#faq',
      label: m['hotel.nav.faq'](),
      className: 'br-nav-narrow',
    },
  ];

  // Featured landing pages, shown as highlighted pills: all of them in the
  // nav, the first one also in the phone header bar (short label, no badge,
  // so it fits beside the logo, avatar and menu button).
  const features = [
    {
      href: '/thriller-dance',
      label: m['thriller.nav'](),
      short: m['thriller.nav_short'](),
      badge: m['thriller.nav_badge'](),
    },
    {
      href: '/tiny-desk-ai',
      label: m['tinydesk.nav'](),
      short: m['tinydesk.nav'](),
    },
  ];
  const feature = (item: (typeof features)[number], bar = false) => (
    <Link
      key={item.href}
      href={item.href}
      className={`br-feature ${bar ? 'br-feature-bar' : 'br-feature-nav'}`}
      onClick={() => setOpen(false)}
    >
      {bar ? item.short : item.label}
      {!bar && item.badge && (
        <span className="br-feature-badge">{item.badge}</span>
      )}
    </Link>
  );

  return (
    <header className="br-header">
      <div className="br-header-inner">
        <Link href="/" className="br-brand">
          <img
            src={envConfigs.app_logo}
            alt={m['hotel.logo_alt']()}
            width={512}
            height={512}
          />
          <span>{envConfigs.app_name}</span>
        </Link>
        <nav
          className={open ? 'br-nav br-nav-open' : 'br-nav'}
          aria-label={m['hotel.nav_label']()}
        >
          {features.map((item) => feature(item))}
          {links.map((link) => (
            <a
              key={link.href}
              href={localizeHref(link.href)}
              className={link.className}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
          {!user && (
            <Link
              className="br-nav-login"
              href="/sign-in"
              onClick={() => setOpen(false)}
            >
              {m['common.sign.sign_in_title']()}
            </Link>
          )}
        </nav>
        <div className="br-header-actions">
          {/* Phones: the menu is collapsed, so the pill sits in the bar. */}
          {feature(features[0], true)}
          {user ? (
            <Suspense fallback={<span className="block size-9" />}>
              <SiteUserMenu
                name={user.name || user.email}
                email={user.email}
                image={user.image}
              />
            </Suspense>
          ) : (
            <>
              <Link className="br-link-quiet" href="/sign-in">
                {m['common.sign.sign_in_title']()}
              </Link>
              <a className="br-btn br-btn-sm" href={localizeHref('/#create')}>
                {m['hotel.hero.cta']()}
              </a>
            </>
          )}
          <button
            type="button"
            className="br-menu"
            onClick={() => setOpen(!open)}
            aria-label={m['hotel.nav_label']()}
            aria-expanded={open}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
    </header>
  );
}
