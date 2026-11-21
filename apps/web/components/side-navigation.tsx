'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement } from 'react';

export interface SideNavigationItem {
  href: string;
  label: string;
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

/** C22 — accessible vertical navigation for admin sections such as Shops and Routes. */
export function SideNavigation({ items, label, heading }: SideNavigationProps): ReactElement {
  const pathname = usePathname();

  return (
    <aside className="w-full shrink-0 md:w-56">
      {heading ? (
        <h2 className="mb-2 px-3 text-body font-semibold text-charcoal">{heading}</h2>
      ) : null}
      <nav aria-label={label}>
        <ul className="flex flex-col gap-1">
          {items.map(({ href, label: itemLabel }) => {
            const current = isCurrentPath(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={current ? 'page' : undefined}
                  className={[
                    'flex min-h-11 items-center rounded-control px-3 text-body font-semibold',
                    'outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand',
                    current
                      ? 'bg-white text-brand-deep'
                      : 'text-charcoal hover:bg-cream hover:text-brand-deep',
                  ].join(' ')}
                >
                  {itemLabel}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
