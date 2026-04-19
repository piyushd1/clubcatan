import { forwardRef } from 'react';

/**
 * Left-edge colored stripe for player cards, per lobby mock.
 * Two ways to color:
 *  - `faction="red"|"blue"|"green"|"gold"` uses the faction palette
 *  - `color="#abcdef"` overrides with an arbitrary hex (for host swatches, etc.)
 *
 * The component is an absolutely-positioned strip; place it inside a relatively
 * positioned, `overflow-hidden` card. The default `w-2` matches the mock.
 */
const FACTIONS = {
  red: 'bg-faction-red',
  blue: 'bg-faction-blue',
  green: 'bg-faction-green',
  gold: 'bg-faction-gold',
};

export const FactionStripe = forwardRef(function FactionStripe(
  { faction, color, className = '', ...rest },
  ref
) {
  const useInline = !!color;
  const classes = [
    'absolute left-0 top-0 bottom-0 w-2',
    useInline ? '' : FACTIONS[faction] ?? 'bg-outline',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={classes}
      style={useInline ? { backgroundColor: color } : undefined}
      {...rest}
    />
  );
});

export default FactionStripe;
