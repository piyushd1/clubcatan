import { forwardRef } from 'react';

/**
 * Bottom navigation per mocks — BOARD / TRADE / CARDS / STATUS.
 *
 * Style per DESIGN.md: glassmorphic bar (70% surface, 24px blur), tall rounded
 * top (`rounded-t-[2rem]`), micro caps typography, active tab painted in
 * primary with white label. Non-active tabs use on-surface at 50% for the "rest
 * of the background" feel §2 asks for.
 *
 * `tabs` is a [{ id, label, icon, onClick }] array. Parent owns active state.
 */

export const BottomNav = forwardRef(function BottomNav(
  { tabs = [], active, onSelect, className = '', ...rest },
  ref
) {
  const classes = [
    'fixed bottom-0 left-0 right-0 z-50',
    'pb-[env(safe-area-inset-bottom)]',
    'bg-surface/70 supports-[not(backdrop-filter:blur(0))]:bg-surface/96',
    'backdrop-blur-xl',
    'rounded-t-[2rem]',
    'shadow-[0_-8px_32px_rgba(26,28,24,0.06)]',
    'flex items-stretch justify-around px-4 py-3',
    className,
  ].join(' ');

  return (
    <nav ref={ref} aria-label="Main" className={classes} {...rest}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const btnClasses = [
          'flex flex-col items-center justify-center gap-1',
          'min-w-[64px] min-h-[56px] rounded-2xl',
          'px-5 py-2',
          'text-[10px] font-extrabold uppercase tracking-widest',
          'transition-all duration-200 active:translate-y-0.5',
          isActive
            ? 'bg-primary text-on-primary'
            : 'text-on-surface/50 hover:text-primary',
        ].join(' ');

        return (
          <button
            key={tab.id}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            className={btnClasses}
            onClick={() => {
              tab.onClick?.();
              onSelect?.(tab.id);
            }}
          >
            {tab.icon ? <span aria-hidden="true" className="flex">{tab.icon}</span> : null}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
});

export default BottomNav;
