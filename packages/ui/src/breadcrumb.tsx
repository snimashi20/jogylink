import { ChevronRight } from 'lucide-react';

/**
 * C23 — Breadcrumb (public website, M8).
 *
 * Shows where the customer is: Home > Sweets > Kalu Dodol 250g.
 * Every item links back except the LAST one, which is the current page and is not a link.
 * Screen readers hear it as a "Breadcrumb" navigation, with the current page marked.
 */
export type BreadcrumbItem = {
  label: string;
  /** Leave out on the last item (the current page). */
  href?: string;
};

export type BreadcrumbProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-caption text-stone">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${index}-${item.label}`} className="flex items-center gap-1">
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={isLast ? 'font-semibold text-charcoal' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <a href={item.href} className="text-brand-deep hover:underline">
                  {item.label}
                </a>
              )}
              {!isLast && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
