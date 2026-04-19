import { memo, useMemo } from 'react';
import {
  HEX,
  boardBounds,
  edgeEndpoints,
  hexPolygonPoints,
  hexToPixel,
  vertexPixel,
} from '../../lib/hex-math';

/**
 * Static pointy-top Catan board, driven by the server `gameState`.
 *
 * Phase 1.10a — this is the pure render path (no clicks, no gestures). Vertex
 * and edge interactivity lands in 1.10b; pinch/pan in 1.10c.
 *
 * All strokes carry `vector-effect="non-scaling-stroke"` so when the outer
 * `<g transform=…>` is scaled by the gesture layer, strokes stay crisp.
 */

// DESIGN.md-aligned override of the engine's default terrain palette. The
// engine's colors are bright/video-game; this palette is "Tactile Naturalist".
const TERRAIN_FILL = {
  forest: '#154212',     // primary forest
  fields: '#a48a2e',     // faction gold (wheat)
  hills: '#9c4323',      // secondary brick
  pasture: '#6d9a4c',    // sage, distinct from forest
  mountains: '#4b4e44',  // slate
  desert: '#d7c8a0',     // warm tan paper
};

const TERRAIN_LABEL_FILL = {
  forest: '#fafaf3',
  fields: '#1a1c18',
  hills: '#fafaf3',
  pasture: '#1a1c18',
  mountains: '#fafaf3',
  desert: '#1a1c18',
};

// Six faction colors — mapped by seat index. Matches the Lobby's FACTIONS list.
const FACTION_COLORS = ['#9c4323', '#3b5f7a', '#a48a2e', '#154212', '#6b3b7a', '#2f7a73'];

export function HexBoard({ game, playerId, highlights, onVertexClick, onEdgeClick, onHexClick }) {
  if (!game?.hexes) return null;

  const hexes = useMemo(() => Object.values(game.hexes), [game.hexes]);
  const bounds = useMemo(() => boardBounds(hexes, HEX.SIZE, HEX.SIZE * 0.9), [hexes]);

  // Vertices that have buildings and edges that have roads — iterate engine
  // state rather than recomputing neighbors.
  const settlements = useMemo(
    () => Object.entries(game.vertices ?? {}).filter(([, v]) => v.building),
    [game.vertices]
  );
  const roads = useMemo(
    () => Object.entries(game.edges ?? {}).filter(([, e]) => e.road),
    [game.edges]
  );

  const allVertices = useMemo(() => Object.entries(game.vertices ?? {}), [game.vertices]);
  const allEdges = useMemo(() => Object.entries(game.edges ?? {}), [game.edges]);

  const robberHex = game.robber ? game.hexes[game.robber] : null;
  const myIndex = game.players?.findIndex((p) => p.id === playerId) ?? -1;

  return (
    <svg
      role="img"
      aria-label="Catan board"
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="block w-full h-auto max-h-[min(70dvh,720px)] select-none"
      style={{ touchAction: 'none' }}
    >
      {/* GROUP-A: hex tiles + number tokens */}
      <g>
        {hexes.map((h) => {
          const hKey = `h_${h.q}_${h.r}`;
          const isRobber = game.robber === hKey;
          const highlighted = !!highlights?.hexes?.[hKey];
          return (
            <HexTile
              key={hKey}
              hex={h}
              hKey={hKey}
              highlighted={highlighted}
              isRobber={isRobber}
              onClick={onHexClick}
            />
          );
        })}
      </g>

      {/* GROUP-B: roads (rendered below vertices so settlement icons overlap road ends cleanly) */}
      <g>
        {roads.map(([eKey, e]) => (
          <Road key={eKey} eKey={eKey} ownerIndex={e.owner} />
        ))}
      </g>

      {/* GROUP-C: number tokens above tiles but below buildings */}
      <g>
        {hexes.map((h) => (h.number ? <NumberToken key={`n_${h.q}_${h.r}`} hex={h} /> : null))}
      </g>

      {/* GROUP-D: robber */}
      {robberHex ? <Robber hex={robberHex} /> : null}

      {/* GROUP-E: settlements + cities */}
      <g>
        {settlements.map(([vKey, v]) => (
          <Building key={vKey} vKey={vKey} v={v} />
        ))}
      </g>

      {/* GROUP-F: interactive overlay (edges first so vertex hit-discs win on overlap) */}
      {onEdgeClick ? (
        <g>
          {allEdges.map(([eKey, e]) => (
            <EdgeHit
              key={`hit_${eKey}`}
              eKey={eKey}
              occupied={!!e.road}
              highlighted={!!highlights?.edges?.[eKey]}
              onClick={onEdgeClick}
            />
          ))}
        </g>
      ) : null}

      {onVertexClick ? (
        <g>
          {allVertices.map(([vKey, v]) => (
            <VertexHit
              key={`hit_${vKey}`}
              vKey={vKey}
              v={v}
              myIndex={myIndex}
              highlighted={!!highlights?.vertices?.[vKey]}
              onClick={onVertexClick}
            />
          ))}
        </g>
      ) : null}
    </svg>
  );
}

// ---------- Interactive overlays --------------------------------------------

/**
 * Invisible hit disc over every vertex. Touch-friendly (~44px at default scale)
 * and rendered above buildings so tap-to-upgrade works on existing settlements.
 * Shows a subtle ring when `highlighted` (parent decides what's placeable).
 */
const VertexHit = memo(function VertexHit({ vKey, v, myIndex, highlighted, onClick }) {
  const parsed = parseVertexKey(vKey);
  if (!parsed) return null;
  const { x, y } = vertexPixel(parsed.q, parsed.r, parsed.dir, HEX.SIZE);
  const isMine = v.owner === myIndex;
  const r = HEX.SIZE * 0.32;
  return (
    <g transform={`translate(${x} ${y})`} onClick={() => onClick(vKey, v)} style={{ cursor: 'pointer' }}>
      {highlighted ? (
        <circle r={HEX.SIZE * 0.22} fill="#154212" fillOpacity={0.18} stroke="#154212" strokeWidth={2} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      ) : null}
      {isMine && v.building === 'settlement' ? (
        <circle r={HEX.SIZE * 0.24} fill="none" stroke="#fafaf3" strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      ) : null}
      {/* Transparent, enlarged hit target — always on top for reliable tap */}
      <circle r={r} fill="transparent" />
    </g>
  );
});

const EdgeHit = memo(function EdgeHit({ eKey, occupied, highlighted, onClick }) {
  const parsed = parseEdgeKey(eKey);
  if (!parsed) return null;
  const { a, b } = edgeEndpoints(parsed.q, parsed.r, parsed.dir, HEX.SIZE);
  return (
    <g onClick={() => onClick(eKey)} style={{ cursor: occupied ? 'default' : 'pointer' }}>
      {highlighted ? (
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="#154212"
          strokeWidth={5}
          strokeOpacity={0.35}
          strokeLinecap="round"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="transparent"
        strokeWidth={HEX.SIZE * 0.28}
        strokeLinecap="round"
      />
    </g>
  );
});

// ---------- Hex tile ---------------------------------------------------------

const HexTile = memo(function HexTile({ hex, hKey, highlighted, isRobber, onClick }) {
  const points = hexPolygonPoints(hex.q, hex.r, HEX.SIZE);
  const fill = TERRAIN_FILL[hex.terrain] ?? '#888';
  const handleClick = onClick ? () => onClick(hKey, hex) : undefined;
  return (
    <g onClick={handleClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <polygon
        points={points}
        fill={fill}
        stroke={highlighted ? '#fafaf3' : '#fafaf3'}
        strokeWidth={highlighted ? 4 : 2}
        strokeOpacity={highlighted ? 1 : 1}
        vectorEffect="non-scaling-stroke"
      />
      {highlighted ? (
        <polygon
          points={points}
          fill="none"
          stroke="#154212"
          strokeWidth={3}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ) : null}
    </g>
  );
});

// ---------- Number token ----------------------------------------------------

const NumberToken = memo(function NumberToken({ hex }) {
  const c = hexToPixel(hex.q, hex.r, HEX.SIZE);
  const n = hex.number;
  const isHot = n === 6 || n === 8;
  const dots = dotsForNumber(n);
  return (
    <g transform={`translate(${c.x} ${c.y})`}>
      <circle r={HEX.SIZE * 0.34} fill="#fafaf3" stroke="#1a1c18" strokeOpacity="0.12" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily='"Manrope Variable", Manrope, system-ui, sans-serif'
        fontWeight={800}
        fontSize={HEX.SIZE * 0.36}
        fill={isHot ? '#9c4323' : '#1a1c18'}
        y={-HEX.SIZE * 0.06}
      >
        {n}
      </text>
      <g transform={`translate(0 ${HEX.SIZE * 0.2})`}>
        {Array.from({ length: dots }, (_, i) => (
          <circle
            key={i}
            cx={(i - (dots - 1) / 2) * HEX.SIZE * 0.07}
            cy={0}
            r={HEX.SIZE * 0.025}
            fill={isHot ? '#9c4323' : '#1a1c18'}
          />
        ))}
      </g>
    </g>
  );
});

/**
 * Standard Catan probability dot count:
 *   2,12 → 1  |  3,11 → 2  |  4,10 → 3  |  5,9 → 4  |  6,8 → 5
 */
function dotsForNumber(n) {
  const map = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  return map[n] ?? 0;
}

// ---------- Robber ----------------------------------------------------------

const Robber = memo(function Robber({ hex }) {
  const c = hexToPixel(hex.q, hex.r, HEX.SIZE);
  const s = HEX.SIZE * 0.22;
  return (
    <g transform={`translate(${c.x + HEX.SIZE * 0.32} ${c.y + HEX.SIZE * 0.2})`}>
      <ellipse cx={0} cy={s * 0.95} rx={s * 0.85} ry={s * 0.2} fill="#1a1c18" opacity="0.25" />
      <path
        d={`M ${-s * 0.55} ${s} L ${-s * 0.55} ${-s * 0.05} A ${s * 0.55} ${s * 0.55} 0 0 1 ${s * 0.55} ${-s * 0.05} L ${s * 0.55} ${s} Z`}
        fill="#1a1c18"
        stroke="#fafaf3"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
});

// ---------- Road ------------------------------------------------------------

const Road = memo(function Road({ eKey, ownerIndex }) {
  const parsed = parseEdgeKey(eKey);
  if (!parsed) return null;
  const { a, b } = edgeEndpoints(parsed.q, parsed.r, parsed.dir, HEX.SIZE);
  const color = FACTION_COLORS[ownerIndex ?? 0];
  // Two-stroke trick: a fat cream "halo" behind a slightly thinner colored
  // line. Roads always pop off the tile, even when faction color == terrain.
  return (
    <g>
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="#fafaf3"
        strokeWidth={11}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
});

// ---------- Building (settlement or city) -----------------------------------

const Building = memo(function Building({ vKey, v }) {
  const parsed = parseVertexKey(vKey);
  if (!parsed) return null;
  const { x, y } = vertexPixel(parsed.q, parsed.r, parsed.dir, HEX.SIZE);
  const color = FACTION_COLORS[v.owner ?? 0];
  const isCity = v.building === 'city';
  const s = HEX.SIZE * (isCity ? 0.22 : 0.18);

  // Cream halo + dark outline so the faction-colored body is readable even
  // when faction == terrain (red on hills, green on forest, gold on fields).
  if (isCity) {
    return (
      <g transform={`translate(${x} ${y})`}>
        <rect x={-s * 1.25} y={-s * 0.35} width={s * 2.5} height={s * 1.1} fill="#fafaf3" vectorEffect="non-scaling-stroke" />
        <polygon points={`${-s * 1.25},${-s * 0.3} ${s * 1.25},${-s * 0.3} 0,${-s * 1.15}`} fill="#fafaf3" vectorEffect="non-scaling-stroke" />
        <rect x={s * 0.22} y={-s * 0.95} width={s * 0.76} height={s * 0.75} fill="#fafaf3" vectorEffect="non-scaling-stroke" />
        <rect x={-s * 1.1} y={-s * 0.2} width={s * 2.2} height={s * 0.9} fill={color} stroke="#1a1c18" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <polygon points={`${-s * 1.1},${-s * 0.2} ${s * 1.1},${-s * 0.2} 0,${-s * 1.0}`} fill={color} stroke="#1a1c18" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <rect x={s * 0.3} y={-s * 0.8} width={s * 0.6} height={s * 0.6} fill={color} stroke="#1a1c18" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </g>
    );
  }
  const housePoints = `${-s},${s * 0.55} ${-s},${-s * 0.35} 0,${-s * 0.95} ${s},${-s * 0.35} ${s},${s * 0.55}`;
  const haloPoints = `${-s * 1.18},${s * 0.68} ${-s * 1.18},${-s * 0.45} 0,${-s * 1.15} ${s * 1.18},${-s * 0.45} ${s * 1.18},${s * 0.68}`;
  return (
    <g transform={`translate(${x} ${y})`}>
      <polygon points={haloPoints} fill="#fafaf3" vectorEffect="non-scaling-stroke" />
      <polygon
        points={housePoints}
        fill={color}
        stroke="#1a1c18"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
});

// ---------- Key parsing -----------------------------------------------------

/** `v_<q>_<r>_<dir>` → { q, r, dir } */
function parseVertexKey(k) {
  const m = /^v_(-?\d+)_(-?\d+)_(\d)$/.exec(k);
  if (!m) return null;
  return { q: +m[1], r: +m[2], dir: +m[3] };
}

/** `e_<q>_<r>_<dir>` → { q, r, dir } */
function parseEdgeKey(k) {
  const m = /^e_(-?\d+)_(-?\d+)_(\d)$/.exec(k);
  if (!m) return null;
  return { q: +m[1], r: +m[2], dir: +m[3] };
}

export default HexBoard;
