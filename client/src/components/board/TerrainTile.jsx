/**
 * Painted terrain tiles — ported from the Wilderbound hex-tiles reference:
 * earthy tonal fills + hand-drawn motifs. One <TerrainTile> replaces the
 * previous solid polygon + silhouette combo inside HexTile.
 *
 * The reference art is authored in a flat-top 200×173 viewBox. Our board
 * uses pointy-top hexes at HEX.SIZE circumradius. We render the motif
 * scaled to fit the hex's height (2 * HEX.SIZE = 112) and rely on the
 * outer clip path (pointy-top hex at origin) to crop the left/right
 * overflow. The motifs live near the tile's center and survive clipping
 * cleanly.
 *
 * Shared defs (grain filter + vignette gradient + clip path) are emitted
 * once per board via <TerrainTileDefs />. The per-hex grain polygon is
 * omitted — 19 feTurbulence filters are a lot for mobile; one board-level
 * grain overlay covers the full board at low opacity.
 */
import { memo } from 'react';
import { HEX } from '../../lib/hex-math';

// Source viewBox dimensions (flat-top hex inscribed in 200×173).
const TILE_W = 200;
const TILE_H = 173;

/**
 * <defs> block shared by every tile. Include this ONCE inside the board SVG.
 * The id prefix `tt-` (terrain-tile) keeps it distinct from other filters.
 */
export function TerrainTileDefs() {
  // Pointy-top hex at origin, circumradius = HEX.SIZE (board coord space).
  const SQRT3_2 = Math.sqrt(3) / 2;
  const r = HEX.SIZE;
  const hexPts = [
    [0, -r],
    [SQRT3_2 * r, -r / 2],
    [SQRT3_2 * r, r / 2],
    [0, r],
    [-SQRT3_2 * r, r / 2],
    [-SQRT3_2 * r, -r / 2],
  ]
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');

  return (
    <defs>
      <clipPath id="tt-hex-clip" clipPathUnits="userSpaceOnUse">
        <polygon points={hexPts} />
      </clipPath>
      <radialGradient id="tt-vignette" cx="50%" cy="45%" r="65%">
        <stop offset="60%" stopColor="#000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.18" />
      </radialGradient>
      {/* Single grain filter, shared by a board-level overlay (not per-hex). */}
      <filter id="tt-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="1.8" numOctaves="2" seed="7" result="n" />
        <feColorMatrix
          in="n"
          type="matrix"
          values="0 0 0 0 0.15
                  0 0 0 0 0.12
                  0 0 0 0 0.08
                  0 0 0 0.12 0"
        />
        <feComposite in2="SourceGraphic" operator="in" />
      </filter>
    </defs>
  );
}

// ---------- Individual tile motifs ---------------------------------------
// Each function returns a <g> containing the full tile artwork in the
// 200×173 flat-top source coordinate system. The caller positions it.

function TileWood() {
  return (
    <g>
      <rect width={TILE_W} height={TILE_H} fill="#2d5a2a" />
      <rect width={TILE_W} height={TILE_H} fill="url(#tt-vignette)" />
      <ellipse cx="100" cy="150" rx="90" ry="30" fill="#3d6d3a" opacity="0.55" />
      {/* back tree (smaller, darker) */}
      <g transform="translate(60,38)" fill="#1e3f1c">
        <path d="M15 0 L30 22 L24 22 L32 42 L22 42 L30 62 L0 62 L8 42 L-2 42 L6 22 L0 22 Z" />
        <rect x="12" y="62" width="6" height="8" fill="#3a2a1a" />
      </g>
      {/* middle tree */}
      <g transform="translate(120,30)" fill="#2a5428">
        <path d="M18 0 L36 26 L28 26 L38 50 L26 50 L36 72 L0 72 L10 50 L-2 50 L8 26 L0 26 Z" />
        <rect x="15" y="72" width="6" height="10" fill="#3a2a1a" />
      </g>
      {/* front tree (tallest) */}
      <g transform="translate(82,46)" fill="#154212">
        <path d="M22 0 L44 32 L34 32 L46 60 L32 60 L46 88 L0 88 L14 60 L-2 60 L10 32 L0 32 Z" />
        <rect x="18" y="88" width="8" height="12" fill="#2a1a0e" />
      </g>
    </g>
  );
}

function TileHay() {
  const stripes = [];
  for (let i = 0; i < 18; i++) {
    const y = 20 + i * 9;
    stripes.push(<line key={`s-${i}`} x1="20" y1={y} x2="180" y2={y - 2} />);
  }
  const Sheaf = ({ x, y }) => (
    <g transform={`translate(${x},${y})`}>
      <g stroke="#7a5e1c" strokeWidth="2.2" strokeLinecap="round" fill="none">
        <line x1="0" y1="30" x2="0" y2="0" />
        <line x1="-6" y1="30" x2="-8" y2="4" />
        <line x1="6" y1="30" x2="8" y2="4" />
      </g>
      <g fill="#c6a14a" stroke="#7a5e1c" strokeWidth="1">
        <ellipse cx="-8" cy="6" rx="3" ry="6" transform="rotate(-12 -8 6)" />
        <ellipse cx="0" cy="2" rx="3" ry="7" />
        <ellipse cx="8" cy="6" rx="3" ry="6" transform="rotate(12 8 6)" />
      </g>
    </g>
  );
  return (
    <g>
      <rect width={TILE_W} height={TILE_H} fill="#d9c479" />
      <rect width={TILE_W} height={TILE_H} fill="url(#tt-vignette)" />
      <rect y="95" width={TILE_W} height="78" fill="#c9b265" opacity="0.55" />
      <g stroke="#a8904a" strokeWidth="1" opacity="0.5">
        {stripes}
      </g>
      <Sheaf x={50} y={118} />
      <Sheaf x={100} y={128} />
      <Sheaf x={150} y={118} />
    </g>
  );
}

function TileBrick() {
  const bricks = [];
  for (let row = 0; row < 9; row++) {
    const y = 6 + row * 18;
    const offset = row % 2 === 0 ? 0 : 16;
    for (let col = 0; col < 8; col++) {
      const x = -12 + col * 32 + offset;
      bricks.push(
        <g key={`b-${row}-${col}`}>
          <rect x={x} y={y} width="28" height="14" rx="1.5" fill="#b55935" stroke="#7a341b" strokeWidth="1.2" />
          <rect x={x + 2} y={y + 2} width="12" height="2" fill="#c76640" opacity="0.6" />
        </g>
      );
    }
  }
  return (
    <g>
      <rect width={TILE_W} height={TILE_H} fill="#a14927" />
      <rect width={TILE_W} height={TILE_H} fill="url(#tt-vignette)" />
      <g fill="none">{bricks}</g>
      {/* darker mortar wash */}
      <rect width={TILE_W} height={TILE_H} fill="#4b1f0c" opacity="0.08" />
    </g>
  );
}

function TileOre() {
  return (
    <g>
      <rect width={TILE_W} height={TILE_H} fill="#6f7382" />
      <rect width={TILE_W} height={TILE_H} fill="url(#tt-vignette)" />
      {/* back peak */}
      <polygon points="40,130 90,55 140,130" fill="#4f5460" />
      {/* middle peak (tallest, with snow) */}
      <polygon points="70,135 120,25 170,135" fill="#3c4150" />
      {/* snowcap */}
      <polygon points="112,40 120,25 128,40 124,44 120,36 116,44" fill="#e8ecf2" />
      <polygon points="105,52 120,25 135,52 128,52 124,46 120,52 116,46 112,52" fill="#e8ecf2" opacity="0.85" />
      {/* front peak */}
      <polygon points="10,140 50,75 90,140" fill="#5a5f6d" />
      {/* facet shadows */}
      <polygon points="90,55 120,25 120,25 90,130" fill="#3a3f4d" opacity="0.5" />
      <polygon points="120,25 170,135 120,130" fill="#4a4f5d" opacity="0.35" />
      <rect y="135" width={TILE_W} height="38" fill="#5a5f6d" />
    </g>
  );
}

function TileSheep() {
  const tufts = [];
  for (let i = 0; i < 16; i++) {
    const x = 12 + i * 12;
    const y = 150 + ((i * 7) % 12);
    tufts.push(
      <path key={`t-${i}`} d={`M${x} ${y} l-2 -6 l2 2 l2 -6 l1 6 l2 -3 z`} />
    );
  }
  return (
    <g>
      <rect width={TILE_W} height={TILE_H} fill="#6d8a4a" />
      <rect width={TILE_W} height={TILE_H} fill="url(#tt-vignette)" />
      {/* rolling hill */}
      <path d={`M0 95 Q 60 70 100 85 T 200 90 L${TILE_W} ${TILE_H} L0 ${TILE_H} Z`} fill="#5a7a3c" />
      <g fill="#4a6a2e" opacity="0.7">{tufts}</g>
      {/* Sheep 1 */}
      <g transform="translate(58,108)">
        <ellipse cx="0" cy="0" rx="22" ry="14" fill="#f2ede0" />
        <ellipse cx="-6" cy="-4" rx="6" ry="5" fill="#f8f4ea" />
        <ellipse cx="6" cy="-4" rx="6" ry="5" fill="#f8f4ea" />
        <ellipse cx="-4" cy="4" rx="7" ry="5" fill="#f8f4ea" />
        <ellipse cx="8" cy="3" rx="6" ry="5" fill="#f8f4ea" />
        <ellipse cx="20" cy="-2" rx="7" ry="6" fill="#3a3028" />
        <circle cx="23" cy="-4" r="1.2" fill="#fafaf3" />
        <ellipse cx="16" cy="-7" rx="2" ry="3" fill="#2a2018" />
        <rect x="-12" y="12" width="3" height="8" fill="#3a3028" />
        <rect x="10" y="12" width="3" height="8" fill="#3a3028" />
      </g>
      {/* Sheep 2 (right, smaller) */}
      <g transform="translate(138,128)">
        <ellipse cx="0" cy="0" rx="18" ry="11" fill="#f2ede0" />
        <ellipse cx="-4" cy="-3" rx="5" ry="4" fill="#f8f4ea" />
        <ellipse cx="5" cy="-3" rx="5" ry="4" fill="#f8f4ea" />
        <ellipse cx="0" cy="3" rx="6" ry="4" fill="#f8f4ea" />
        <ellipse cx="-14" cy="-1" rx="5" ry="4.5" fill="#3a3028" />
        <circle cx="-17" cy="-3" r="1" fill="#fafaf3" />
        <ellipse cx="-10" cy="-5" rx="1.6" ry="2.4" fill="#2a2018" />
        <rect x="-8" y="10" width="2.4" height="6" fill="#3a3028" />
        <rect x="8" y="10" width="2.4" height="6" fill="#3a3028" />
      </g>
    </g>
  );
}

function TileDesert() {
  // Not in the reference; we synthesize a matching warm-sand tile so
  // desert hexes don't drop out of the visual language.
  return (
    <g>
      <rect width={TILE_W} height={TILE_H} fill="#d7c8a0" />
      <rect width={TILE_W} height={TILE_H} fill="url(#tt-vignette)" />
      {/* Dune silhouette */}
      <path d={`M0 125 Q 55 100 100 115 T 200 120 L${TILE_W} ${TILE_H} L0 ${TILE_H} Z`} fill="#c9b883" />
      <path d={`M0 145 Q 60 128 120 140 T 200 150 L${TILE_W} ${TILE_H} L0 ${TILE_H} Z`} fill="#b8a570" opacity="0.75" />
      {/* Sun */}
      <circle cx="150" cy="55" r="16" fill="#e8d88c" />
      <circle cx="150" cy="55" r="22" fill="#e8d88c" opacity="0.35" />
    </g>
  );
}

const RENDERERS = {
  forest: TileWood,
  lumber: TileWood,
  wood: TileWood,
  fields: TileHay,
  grain: TileHay,
  hay: TileHay,
  hills: TileBrick,
  brick: TileBrick,
  mountains: TileOre,
  ore: TileOre,
  pasture: TileSheep,
  wool: TileSheep,
  sheep: TileSheep,
  desert: TileDesert,
};

/**
 * Renders one painted terrain tile, centered at (cx, cy) in board SVG
 * coordinates, clipped to the pointy-top hex defined in TerrainTileDefs.
 *
 * Scale picks the smaller of width-fit vs. height-fit so the motif (living
 * in the tile's center) survives with minimum clipping. Source art is
 * 200×173 flat-top, the game's hex is ~97×112 pointy-top, so we fit to
 * height (scale = 2 * HEX.SIZE / 173) and let the ±16 horizontal overflow
 * get cropped by the pointy-top clip. Motifs stay well inside.
 */
export const TerrainTile = memo(function TerrainTile({ terrain, cx, cy }) {
  const Render = RENDERERS[terrain];
  if (!Render) return null;
  const scale = (2 * HEX.SIZE) / TILE_H;
  // Shift so the 200×173 tile's center sits at (0,0) before scaling, then
  // translate into the hex center.
  const tx = cx - (TILE_W / 2) * scale;
  const ty = cy - (TILE_H / 2) * scale;
  return (
    <g transform={`translate(${cx} ${cy})`} clipPath="url(#tt-hex-clip)">
      <g transform={`translate(${tx - cx} ${ty - cy}) scale(${scale})`}>
        <Render />
      </g>
    </g>
  );
});

export default TerrainTile;
