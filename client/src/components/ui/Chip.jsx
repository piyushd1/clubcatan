import { forwardRef } from 'react';

/**
 * Resource/status chip per DESIGN.md §5 (Chips).
 *
 *   [ icon ] label   [ count? ]
 *
 * - Base: surface-highest (the "highest" step — the only one brighter than surface).
 * - Icon is the only colorful element; `tint` picks primary/secondary/tertiary per §5.
 * - `count` is optional — used for resource counts in the HUD.
 * - `active` lifts it slightly (for the current-resource highlight during trades).
 */
const TINTS = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  tertiary: 'text-tertiary',
  neutral: 'text-on-surface-variant',
};

export const Chip = forwardRef(function Chip(
  { icon, children, count, tint = 'neutral', active = false, className = '', ...rest },
  ref
) {
  const classes = [
    'inline-flex items-center gap-2 rounded-full px-3 py-1.5',
    'text-sm font-bold uppercase tracking-wider',
    'transition-transform duration-200',
    active ? 'bg-surface-highest shadow-ambient -translate-y-0.5' : 'bg-surface-high',
    className,
  ].join(' ');

  const tintClass = TINTS[tint] ?? TINTS.neutral;

  return (
    <span ref={ref} className={classes} {...rest}>
      {icon ? <span aria-hidden="true" className={`${tintClass} flex shrink-0`}>{icon}</span> : null}
      <span className="text-on-surface">{children}</span>
      {count !== undefined ? (
        <span className={`ml-1 font-extrabold ${tintClass}`}>{count}</span>
      ) : null}
    </span>
  );
});

export default Chip;
