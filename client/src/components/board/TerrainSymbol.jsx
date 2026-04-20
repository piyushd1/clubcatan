/**
 * Terrain silhouettes: one SVG symbol per terrain type.
 *
 * Each symbol is authored in a canonical 24×24 viewBox and drawn in
 * `currentColor` so the parent's text color cascades. Stroke-only paths carry
 * `vector-effect="non-scaling-stroke"` so pinch-zoom (later) doesn't warp
 * their line widths.
 *
 *   <TerrainSymbol terrain="forest" size={28} />
 *
 * Exports:
 *   - TerrainSymbol        — just the silhouette glyph (no hex backdrop)
 *   - TerrainHexBadge      — hex-shaped badge with the symbol inside; used by
 *                            dev card rows so they speak the same visual
 *                            language as board hexes.
 *   - TerrainSymbols       — { terrain: Component } map, mirrors the pattern
 *                            of ResourceIcons in components/ui/icons.jsx.
 *   - TERRAIN_FILL         — re-exported so dev-card badges tint identically
 *                            to the board tiles.
 */
import { memo } from 'react';

// Same palette the board uses (HexBoard.jsx). Re-exported so callers don't
// drift — any tweak to the board's terrain colors updates the badges too.
export const TERRAIN_FILL = {
  forest: '#154212',
  fields: '#a48a2e',
  hills: '#9c4323',
  pasture: '#6d9a4c',
  mountains: '#4b4e44',
  desert: '#d7c8a0',
};

const SYMBOL_PATHS = {
  forest: (
    <>
      {/* Conifer: trunk + 3 layered triangular tiers */}
      <path d="M12 3 L18 10 H14 L19 17 H14 L20 22 H4 L10 17 H5 L10 10 H6 Z" fill="currentColor" />
      <rect x="11" y="21" width="2" height="3" fill="currentColor" />
    </>
  ),
  fields: (
    <>
      {/* Wheat sheaf: central stalk + two pairs of tilted grains */}
      <path d="M12 2 L12 22" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
      <path d="M12 7 C 9 6, 8 4, 8 3.5 C 8 3, 10 3.5, 12 7 Z" fill="currentColor" />
      <path d="M12 7 C 15 6, 16 4, 16 3.5 C 16 3, 14 3.5, 12 7 Z" fill="currentColor" />
      <path d="M12 12 C 9 11, 8 9, 8 8.5 C 8 8, 10 8.5, 12 12 Z" fill="currentColor" />
      <path d="M12 12 C 15 11, 16 9, 16 8.5 C 16 8, 14 8.5, 12 12 Z" fill="currentColor" />
      <path d="M12 17 C 9 16, 8 14, 8 13.5 C 8 13, 10 13.5, 12 17 Z" fill="currentColor" />
      <path d="M12 17 C 15 16, 16 14, 16 13.5 C 16 13, 14 13.5, 12 17 Z" fill="currentColor" />
    </>
  ),
  hills: (
    <>
      {/* Two stacked bricks */}
      <rect x="3" y="8" width="9" height="5" rx="0.5" fill="currentColor" />
      <rect x="12" y="8" width="9" height="5" rx="0.5" fill="currentColor" />
      <rect x="7.5" y="14" width="9" height="5" rx="0.5" fill="currentColor" />
      {/* Small shine tick */}
      <path d="M9 5 L12 3 L15 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
    </>
  ),
  pasture: (
    <>
      {/* Side-view sheep: cloud body + head + legs */}
      <path d="M7 13 C 5 13, 4 14.5, 4.5 16 C 3.5 17, 4 19, 5.5 19 C 6 20, 7.5 20, 8 19 L 15 19 C 15.5 20, 17 20, 17.5 19 C 19 19, 19.5 17, 18.5 16 C 19 14.5, 18 13, 16 13 C 15.5 12, 14 12, 13.5 13 L 9 13 C 8.5 12, 7.5 12, 7 13 Z" fill="currentColor" />
      {/* Head */}
      <ellipse cx="18" cy="14.5" rx="2" ry="1.75" fill="currentColor" />
      {/* Legs */}
      <rect x="7" y="19" width="1.5" height="2.5" fill="currentColor" />
      <rect x="14" y="19" width="1.5" height="2.5" fill="currentColor" />
    </>
  ),
  mountains: (
    <>
      {/* Two jagged peaks with a snow line */}
      <path d="M2 20 L9 8 L13 14 L17 7 L22 20 Z" fill="currentColor" />
      <path d="M7 12 L9 10 L11 12" stroke="#fafaf3" strokeOpacity="0.55" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
      <path d="M15 10 L17 8 L19 10" stroke="#fafaf3" strokeOpacity="0.55" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
    </>
  ),
  desert: (
    <>
      {/* Low sun + horizon */}
      <circle cx="12" cy="13" r="3" fill="currentColor" />
      <path d="M2 17 L22 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
      <path d="M12 5 L12 7 M17 7 L15.5 8.5 M7 7 L8.5 8.5 M4 13 L6 13 M18 13 L20 13" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
    </>
  ),
};

/**
 * Inline SVG path(s) for a terrain type.
 *
 * If `inSVG` is true, renders as a <g> inside an existing SVG (no <svg>
 * wrapper). Otherwise renders a self-contained <svg>.
 */
export const TerrainSymbol = memo(function TerrainSymbol({
  terrain,
  size = 24,
  inSVG = false,
  ...rest
}) {
  const paths = SYMBOL_PATHS[terrain];
  if (!paths) return null;

  if (inSVG) {
    // 24-unit viewBox paths scaled to `size` by the caller's transform.
    // Caller is responsible for positioning (translate, scale).
    return <g {...rest}>{paths}</g>;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...rest}
    >
      {paths}
    </svg>
  );
});

/**
 * Hex-shaped badge with terrain fill + silhouette on top.
 *
 * Used by dev card rows so the visual language matches the board. Pointy-top
 * hex polygon at the given size (outer circumscribing circle diameter).
 */
export const TerrainHexBadge = memo(function TerrainHexBadge({
  terrain,
  size = 56,
  glyph, // optional override — a custom SVG group instead of the terrain symbol
  className = '',
  ...rest
}) {
  const fill = TERRAIN_FILL[terrain] ?? '#888';

  // Pointy-top hex corners for a size-24 canonical viewBox, then scaled.
  // Inscribed into the 24-unit square so the silhouette can share the same
  // coordinate system.
  const r = 11; // circumradius in viewBox units
  const SQRT3 = Math.sqrt(3);
  const points = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${12 + r * Math.cos(a)},${12 + r * Math.sin(a)}`;
  }).join(' ');

  // Tint choice: cream glyph on dark tiles, deep-ink glyph on light tiles.
  const isDarkTile = terrain === 'forest' || terrain === 'hills' || terrain === 'mountains';
  const glyphColor = isDarkTile ? '#fafaf3' : '#1a1c18';

  const paths = SYMBOL_PATHS[terrain];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <polygon
        points={points}
        fill={fill}
        stroke="#fafaf3"
        strokeWidth={0.8}
        strokeLinejoin="round"
      />
      {/* 70% opacity wrap so the terrain color reads through the silhouette */}
      <g style={{ color: glyphColor, opacity: 0.88 }}>
        {glyph ?? paths}
      </g>
    </svg>
  );
});

/** Convenient map for data-driven rendering. */
export const TerrainSymbols = {
  forest: (props) => <TerrainSymbol terrain="forest" {...props} />,
  fields: (props) => <TerrainSymbol terrain="fields" {...props} />,
  hills: (props) => <TerrainSymbol terrain="hills" {...props} />,
  pasture: (props) => <TerrainSymbol terrain="pasture" {...props} />,
  mountains: (props) => <TerrainSymbol terrain="mountains" {...props} />,
  desert: (props) => <TerrainSymbol terrain="desert" {...props} />,
};

export default TerrainSymbol;
