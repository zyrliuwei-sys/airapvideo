import { ChevronRight, House } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';

import '@/styles/site-breadcrumb.css';

export function SiteBreadcrumb({
  label,
  homeLabel,
  currentPage,
}: {
  label: string;
  homeLabel: string;
  currentPage: string;
}) {
  return (
    <nav className="site-breadcrumb" aria-label={label}>
      <ol>
        <li>
          <Link href="/">
            <House size={15} aria-hidden="true" />
            {homeLabel}
          </Link>
        </li>
        <li>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current="page">{currentPage}</span>
        </li>
      </ol>
    </nav>
  );
}
