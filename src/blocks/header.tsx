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
  const links = [
    { href: '/#guide', label: m['rap.nav.guide']() },
    { href: '/#how', label: m['hotel.nav.how']() },
    { href: '/#pricing', label: m['hotel.nav.pricing']() },
    { href: '/#faq', label: m['hotel.nav.faq']() },
  ];

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
          {links.map((link) => (
            <a
              key={link.href}
              href={localizeHref(link.href)}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="br-header-actions">
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
