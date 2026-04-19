import { forwardRef } from 'react';

/**
 * Floating, glassmorphic resource bar per DESIGN.md §5 "Special Component: The
 * Resource HUD". Pill-shaped, 70% surface, 24px blur, ambient shadow.
 *
 * The `supports-[not(backdrop-filter:blur(0))]` fallback gives older Android
 * GPUs (mid-tier chips with no compositor blur path) a solid 96% surface so the
 * control doesn't become invisible-on-invisible over the board background.
 *
 * Uses `fixed` positioning so it floats above the board; the `bottom` inset
 * combines safe-area and a breathing gap so it stays clear of iOS home bar.
 */
export const ResourceHUD = forwardRef(function ResourceHUD(
  { children, className = '', ...rest },
  ref
) {
  const classes = [
    'fixed left-1/2 -translate-x-1/2 z-40',
    'bottom-[calc(env(safe-area-inset-bottom,0px)+88px)]',
    'flex items-center gap-2 px-3 py-2 rounded-full',
    'bg-surface/70 backdrop-blur-xl',
    'supports-[not(backdrop-filter:blur(0))]:bg-surface/96',
    'shadow-ambient ring-1 ring-outline-variant/20',
    'max-w-[calc(100vw-32px)] overflow-x-auto snap-x no-scrollbar',
    className,
  ].join(' ');

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Resources"
      className={classes}
      {...rest}
    >
      {children}
    </div>
  );
});

export default ResourceHUD;
