import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { forwardRef, useId, type ButtonHTMLAttributes, type MouseEvent } from 'react';

/**
 * C1 — Button (UI Design Guide, section 5).
 *
 *   primary    The main action. ONLY ONE PER SCREEN.
 *   secondary  Cancel / Back. Always placed to the left of the primary button.
 *   tertiary   Golden Crumb: offers and "Add to cart" on the website.
 *   text       Minor links inside tables and cards.
 *   danger     Delete / Block / Reject. ALWAYS open a confirmation dialog (see ConfirmDialog).
 *
 * A disabled button must say WHY, so `disabled` cannot be used without `disabledReason`.
 */
const button = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-control text-body font-semibold',
    'outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand',
    'transition-colors',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white hover:bg-brand-deep active:bg-brand-deep',
        secondary: 'border border-charcoal bg-white text-charcoal hover:bg-cream',
        tertiary: 'bg-gold text-charcoal hover:brightness-95',
        text: 'bg-transparent px-1 text-brand-deep hover:underline',
        danger: 'bg-alarm text-white hover:brightness-110',
      },
      // admin: 36px high (precise mouse). web: 48px (accessible touch size on the public site).
      size: { admin: 'h-9 px-4', web: 'h-12 px-5' },
      fullWidth: { true: 'w-full', false: '' },
      locked: { true: 'cursor-not-allowed', false: 'cursor-pointer' },
    },
    defaultVariants: { variant: 'primary', size: 'admin', fullWidth: false, locked: false },
  },
);

type Variant = NonNullable<VariantProps<typeof button>['variant']>;

const DISABLED_STYLE =
  'bg-sand text-stone hover:bg-sand hover:brightness-100 border-0 no-underline';

type DisabledProps =
  { disabled?: false; disabledReason?: never } | { disabled: true; disabledReason: string };

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> & {
  variant?: Variant;
  size?: 'admin' | 'web';
  fullWidth?: boolean;
  /** Shows a spinner and locks the button so a double click cannot submit twice. */
  loading?: boolean;
  /** Label while loading. Default "Saving…". */
  loadingLabel?: string;
} & DisabledProps;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'admin',
    fullWidth = false,
    loading = false,
    loadingLabel = 'Saving…',
    disabled = false,
    disabledReason,
    type = 'button', // never submit a form by accident
    className,
    onClick,
    children,
    ...rest
  },
  ref,
) {
  const reasonId = useId();
  const locked = loading || disabled;

  // aria-disabled (not the disabled attribute) keeps the button focusable and lets the
  // "why is this disabled" tooltip show on hover.
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (locked) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <>
      <button
        ref={ref}
        type={type}
        aria-disabled={locked || undefined}
        aria-busy={loading || undefined}
        aria-describedby={disabled ? reasonId : undefined}
        title={disabled ? disabledReason : undefined}
        onClick={handleClick}
        className={[
          button({ variant, size, fullWidth, locked }),
          disabled ? DISABLED_STYLE : '',
          loading && !disabled ? 'cursor-wait' : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {loading && !disabled ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            {loadingLabel}
          </>
        ) : (
          children
        )}
      </button>
      {/* Outside the button, so it describes the button without becoming part of its name */}
      {disabled && (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </>
  );
});
