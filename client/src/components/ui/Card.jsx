import { forwardRef } from 'react';

/**
 * Card per DESIGN.md §4 (Tonal Layering) + §5 (no dividers, no 1px borders).
 * Boundaries are defined by background shifts, not strokes.
 *
 * `tone` picks the surface step. Compose contrasting pairs — e.g. a `tone="low"`
 * section containing `tone="surface"` inner cards reads as lift without a shadow.
 *
 * `padded={false}` removes default padding for edge-bleed imagery (§6 "Intentional
 * Asymmetry").
 */
const TONES = {
  surface: 'bg-surface',
  low: 'bg-surface-low',
  container: 'bg-surface-container',
  high: 'bg-surface-high',
  highest: 'bg-surface-highest',
};

export const Card = forwardRef(function Card(
  { tone = 'low', padded = true, rounded = 'xl', className = '', as: Tag = 'div', children, ...rest },
  ref
) {
  const classes = [
    TONES[tone] ?? TONES.low,
    rounded === 'xl' ? 'rounded-xl' : rounded === 'md' ? 'rounded-md' : '',
    padded ? 'p-6' : '',
    'text-on-surface',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag ref={ref} className={classes} {...rest}>
      {children}
    </Tag>
  );
});

export default Card;
