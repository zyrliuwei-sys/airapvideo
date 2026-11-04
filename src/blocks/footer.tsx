import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';
import { localizeHref } from '@/paraglide/runtime.js';
import { FooterBadgeList } from '@/components/footer-badge-list';

import '@/styles/brand.css';

const SUPPORT_EMAIL = 'support@ai-rap-video.me';

/** Brand footer shared by the homepage and every inner page. */
export function Footer() {
  return (
    <footer className="br-footer">
      <div className="br-footer-inner">
        <div className="br-footer-top">
          <div className="br-footer-brand">
            <Link href="/" className="br-brand">
              <img
                src={envConfigs.app_logo}
                alt={m['hotel.logo_alt']()}
                width={512}
                height={512}
              />
              <span>{envConfigs.app_name}</span>
            </Link>
            <p>{m['hotel.footer.line']()}</p>
          </div>
          <div className="br-footer-col">
            <h2>{m['rap.footer.make']()}</h2>
            <a href={localizeHref('/#create')}>{m['hotel.nav.create']()}</a>
            <a href={localizeHref('/#guide')} className="br-footer-desktop">
              {m['rap.nav.guide']()}
            </a>
            <a href={localizeHref('/#how')} className="br-footer-desktop">
              {m['hotel.nav.how']()}
            </a>
            <Link href="/videos">{m['hotel.create.my_videos']()}</Link>
          </div>
          <div className="br-footer-col">
            <h2>{m['rap.footer.company']()}</h2>
            <Link href="/pricing">{m['hotel.nav.pricing']()}</Link>
            <a href={localizeHref('/#faq')}>{m['hotel.nav.faq']()}</a>
            <Link href="/blog">{m['landing.nav.blog']()}</Link>
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </div>
          <div className="br-footer-col">
            <h2>{m['landing.footer.legal']()}</h2>
            <Link href="/privacy-policy">{m['landing.footer.privacy']()}</Link>
            <Link href="/terms-of-service">{m['landing.footer.terms']()}</Link>
            <Link href="/acceptable-use-policy">
              {m['landing.footer.aup']()}
            </Link>
          </div>
        </div>
        <FooterBadgeList />
        <div className="br-footer-bottom">
          <span>
            © {new Date().getFullYear()} {envConfigs.app_name}.{' '}
            {m['rap.footer.disclaimer']()}
          </span>
        </div>
      </div>
    </footer>
  );
}
