import { forwardRef } from 'react';

/**
 * Button primitive per DESIGN.md §5.
 *
 * Variants:
 *  - primary:   gradient primary → primary-container, white label, xl corners.
 *               The signature "weighted" feel from §5.
 *  - secondary: clay/brick tile. Secondary-container bg, on-secondary text.
 *  - tertiary:  no background, primary underline at 30% opacity.
 *
 * Sizes map to comfortable mobile hit targets (≥44px outer height on md+).
 */
const BASE = 'inline-flex items-center justify-center gap-2 font-bold tracking-wider uppercase transition-all duration-200 select-none active:translate-y-[1px] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

const VARIANTS = {
  primary:
    'bg-gradient-to-b from-primary to-primary-container text-on-primary shadow-ambient hover:brightness-105',
  secondary:
    'bg-secondary/15 text-secondary hover:bg-secondary/25',
  tertiary:
    'text-primary underline decoration-primary/30 underline-offset-4 decoration-2 hover:decoration-primary/60',
};

const SIZES = {
  sm: 'text-xs px-3 py-1.5 rounded-md min-h-[36px]',
  md: 'text-sm px-5 py-3 rounded-xl min-h-[44px]',
  lg: 'text-base px-6 py-4 rounded-xl min-h-[52px]',
};

export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon,
    iconEnd,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref
) {
  const classes = [
    BASE,
    VARIANTS[variant] ?? VARIANTS.primary,
    SIZES[size] ?? SIZES.md,
    className,
  ].join(' ');

  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {icon ? <span aria-hidden="true" className="shrink-0 -ml-0.5">{icon}</span> : null}
      <span>{children}</span>
      {iconEnd ? <span aria-hidden="true" className="shrink-0 -mr-0.5">{iconEnd}</span> : null}
    </button>
  );
});

export default Button;
