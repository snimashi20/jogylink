'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/products', label: 'Products' },
  { href: '/reports', label: 'Reports' },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1">
      {LINKS.map(({ href, label }) => {
        const current = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={
              current
                ? 'rounded-control bg-white px-3 py-1.5 text-body font-semibold text-brand'
                : 'rounded-control px-3 py-1.5 text-body font-semibold text-white hover:bg-brand-deep'
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
