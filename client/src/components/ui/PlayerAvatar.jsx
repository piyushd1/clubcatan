import { memo } from 'react';

/**
 * Shared avatar primitive used by the Board's player pip and the Lobby's
 * player row, so a single visual reads as "that's Alice" across both surfaces.
 *
 * A faction-tinted circle with the player's first initial centered inside,
 * optionally outlined with a cream ring (for active-turn / you-are-here
 * emphasis) and a status dot at the corner.
 *
 *   <PlayerAvatar seat={0} name="Alice" size={32} active connected />
 *
 * Props:
 *   - seat:       faction seat index (0..5) → picks the color
 *   - name:       used for the initial; falls back to '?'
 *   - size:       outer diameter in px (default 40)
 *   - active:     true when this player owns the turn — shows a cream ring
 *   - connected:  true if they're currently online; shows a primary dot
 *                 when true, an on-surface/30 dot when false; omit to hide
 */
const FACTION_COLORS = [
  '#9c4323', // red
  '#3b5f7a', // blue
  '#a48a2e', // gold
  '#154212', // green
  '#6b3b7a', // purple
  '#2f7a73', // teal
];

export const PlayerAvatar = memo(function PlayerAvatar({
  seat = 0,
  name = '',
  size = 40,
  active = false,
  connected,
  className = '',
}) {
  const color = FACTION_COLORS[seat] ?? FACTION_COLORS[0];
  const initial = (name?.[0] ?? '?').toUpperCase();
  const dotSize = Math.max(8, size * 0.22);
  const ringWidth = active ? Math.max(2, size * 0.08) : 0;

  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full text-on-primary font-extrabold ${className}`}
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: Math.round(size * 0.42),
        // Active-turn cream ring. Implemented as a box-shadow so it sits
        // outside the avatar without bumping sibling layouts.
        boxShadow: active ? `0 0 0 ${ringWidth}px #fafaf3` : undefined,
      }}
      aria-label={name ? `${name}'s avatar` : 'Player avatar'}
    >
      {initial}
      {connected !== undefined ? (
        <span
          className="absolute rounded-full ring-2 ring-surface"
          style={{
            width: dotSize,
            height: dotSize,
            right: -dotSize * 0.1,
            bottom: -dotSize * 0.1,
            background: connected ? '#154212' : '#74796f',
          }}
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
});

export default PlayerAvatar;
