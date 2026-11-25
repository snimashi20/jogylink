'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';

export interface SideNavigationItem {
  href: string;
  label: string;
  icon: ReactNode;
}

export interface SideNavigationProps {
  items: readonly SideNavigationItem[];
  label: string;
  heading?: string;
}

function isCurrentPath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  const normalizedHref = href.endsWith('/') ? href.slice(0, -1) : href;
  return pathname === normalizedHref || pathname.startsWith(`${normalizedHref}/`);
}

/** C22 — charcoal M4 navigation with a compact icon-only tablet layout. */
export function SideNavigation({ items, label, heading }: SideNavigationProps): ReactElement {
  const pathname = usePathname();

  return (
    <aside className="w-full shrink-0 rounded-card bg-charcoal p-3 text-white md:w-16 md:p-2 lg:w-56 lg:p-3">
      {heading ? (
        <h2 className="mb-2 hidden px-3 text-body font-semibold text-white lg:block">{heading}</h2>
      ) : null}
      <nav aria-label={label}>
        <ul className="flex flex-row gap-1 md:flex-col">
          {items.map(({ href, label: itemLabel, icon }) => {
            const current = isCurrentPath(pathname, href);
            return (
              <li key={href} className="min-w-0 flex-1 md:flex-none">
                <Link
                  href={href}
                  aria-current={current ? 'page' : undefined}
                  aria-label={itemLabel}
                  title={itemLabel}
                  className={[
                    'flex min-h-11 items-center gap-3 rounded-control border-l-[3px] px-2 text-body font-semibold',
                    'outline-offset-2 focus-visible:outline-2 focus-visible:outline-white',
                    'justify-center md:justify-center lg:justify-start lg:px-3',
                    current
                      ? 'border-brand bg-brand/15 text-white'
                      : 'border-transparent text-white hover:bg-white/10',
                  ].join(' ')}
                >
                  <span className="shrink-0" aria-hidden="true">
                    {icon}
                  </span>
                  <span className="md:sr-only lg:not-sr-only">{itemLabel}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
