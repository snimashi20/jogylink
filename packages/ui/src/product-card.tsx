import { Star } from 'lucide-react';
import { Button } from './button';

/**
 * C18 — Product Card (UI Design Guide, sections 5 and 6.7; public website W1, W2, W9).
 *
 *   +---------------+
 *   | [photo]       |   10 px image radius, alt text always
 *   | Kalu Dodol    |   name (Body strong)
 *   | 250 g         |   weight (Caption, Stone)
 *   | Rs 150.00     |   retail price: Rs, space, thousands separators, 2 decimals, tabular figures
 *   | [Add to cart] |   Golden Crumb (tertiary) button, 48 px high on the website
 *   +---------------+
 *
 *  - The price shown is always the RETAIL price; wholesale prices never appear on the website.
 *  - "★ Offer" badge (Golden Crumb, dark text) for festival and gift packs.
 *  - Out of stock: the button is disabled and says why.
 *  - Lay cards out with `grid grid-cols-2 gap-4 lg:grid-cols-4` (2 columns on mobile, 4 on desktop).
 */
export type ProductCardProps = {
  name: string;
  /** Pack size, e.g. "250 g" or "12 pieces". */
  weight: string;
  /** Retail price in rupees, e.g. 165 or 1250.5. */
  price: number;
  imageUrl: string;
  /** Describes the photo for screen readers and slow connections. Defaults to the name. */
  imageAlt?: string;
  /** Link to the product page (W3). */
  href?: string;
  offer?: boolean;
  outOfStock?: boolean;
  /** Shows a spinner on the button while the item is being added. */
  adding?: boolean;
  onAddToCart?: () => void;
  className?: string;
};

/** Rs 1,250.00 — UI Design Guide C3 Money Display. */
export function formatRupees(amount: number): string {
  return `Rs ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function ProductCard({
  name,
  weight,
  price,
  imageUrl,
  imageAlt,
  href,
  offer = false,
  outOfStock = false,
  adding = false,
  onAddToCart,
  className,
}: ProductCardProps) {
  const title = href ? (
    <a href={href} className="hover:underline">
      {name}
    </a>
  ) : (
    name
  );

  return (
    <article
      className={[
        'flex flex-col overflow-hidden rounded-card border border-sand bg-white p-3 shadow-level-1',
        className ?? '',
      ].join(' ')}
    >
      <div className="relative">
        <img
          src={imageUrl}
          alt={imageAlt ?? name}
          loading="lazy"
          className="aspect-square w-full rounded-card object-cover"
        />
        {offer && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-caption font-semibold text-charcoal">
            <Star className="h-3 w-3 fill-charcoal" aria-hidden="true" />
            Offer
          </span>
        )}
      </div>

      <h3 className="mt-3 text-body font-semibold text-charcoal">{title}</h3>
      <p className="text-caption text-stone">{weight}</p>
      <p className="mt-1 text-h3 font-semibold tabular-nums text-charcoal">{formatRupees(price)}</p>

      <div className="mt-auto pt-3">
        {outOfStock ? (
          <Button
            size="web"
            variant="tertiary"
            fullWidth
            disabled
            disabledReason="Out of stock. Check back soon."
          >
            Out of stock
          </Button>
        ) : (
          <Button
            size="web"
            variant="tertiary"
            fullWidth
            loading={adding}
            loadingLabel="Adding…"
            onClick={onAddToCart}
            aria-label={`Add ${name} to cart`}
          >
            Add to cart
          </Button>
        )}
      </div>
    </article>
  );
}
