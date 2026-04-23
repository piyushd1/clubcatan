/**
 * Axial-coordinate hex math for a pointy-top Catan board.
 *
 * Coordinates match the engine in `shared/gameLogic.js`:
 *
 *   Vertices: 0 = top, then clockwise. 1=UR, 2=LR, 3=bottom, 4=LL, 5=UL.
 *   Edges:    0 = upper-right, then clockwise.
 *             0 connects v0-v1, 1 connects v1-v2, …, 5 connects v5-v0.
 *
 * The unit `SIZE` is hex circumradius (center → vertex). Width of a single hex
 * is `sqrt(3) * SIZE`, height is `2 * SIZE`, rows overlap by `SIZE / 2`.
 */
const SQRT3 = Math.sqrt(3);

/** Center of a hex in pixel coords, for a given hex size (circumradius). */
export function hexToPixel(q, r, size) {
  return {
    x: size * (SQRT3 * q + (SQRT3 / 2) * r),
    y: size * (1.5 * r),
  };
}

/** Offset from hex center to one of its 6 vertices. dir 0..5. */
export function vertexOffset(dir, size) {
  const angle = (Math.PI / 3) * dir - Math.PI / 2; // 0 = top (−90°), clockwise
  return { x: size * Math.cos(angle), y: size * Math.sin(angle) };
}

/** Pixel coord of one vertex of a hex. */
export function vertexPixel(q, r, dir, size) {
  const c = hexToPixel(q, r, size);
  const o = vertexOffset(dir, size);
  return { x: c.x + o.x, y: c.y + o.y };
}

/** The 6 vertex pixel coords of a hex, in direction order. */
export function hexCorners(q, r, size) {
  const c = hexToPixel(q, r, size);
  return Array.from({ length: 6 }, (_, dir) => {
    const o = vertexOffset(dir, size);
    return { x: c.x + o.x, y: c.y + o.y };
  });
}

/** Endpoints of an edge (in direction 0..5) as pixel coords. */
export function edgeEndpoints(q, r, dir, size) {
  // Edge `dir` connects vertex `dir` and vertex `(dir + 1) % 6`.
  // dir=0 (upper-right) is v0-v1, dir=5 (upper-left) is v5-v0, etc.
  return {
    a: vertexPixel(q, r, dir, size),
    b: vertexPixel(q, r, (dir + 1) % 6, size),
  };
}

/** Polygon-point string for a single hex, usable as SVG points attribute. */
export function hexPolygonPoints(q, r, size) {
  return hexCorners(q, r, size)
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');
}

/** Axis-aligned bounding box covering every hex in the board + a padding ring. */
export function boardBounds(hexes, size, pad = size) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const h of hexes) {
    const corners = hexCorners(h.q, h.r, size);
    for (const c of corners) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x > maxX) maxX = c.x;
      if (c.y > maxY) maxY = c.y;
    }
  }
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

/** `v_<q>_<r>_<dir>` → { q, r, dir } */
export function parseVertexKey(k) {
  const m = /^v_(-?\d+)_(-?\d+)_(\d)$/.exec(k);
  return m ? { q: +m[1], r: +m[2], dir: +m[3] } : null;
}

/** `e_<q>_<r>_<dir>` → { q, r, dir } */
export function parseEdgeKey(k) {
  const m = /^e_(-?\d+)_(-?\d+)_(\d)$/.exec(k);
  return m ? { q: +m[1], r: +m[2], dir: +m[3] } : null;
}

/**
 * True iff the given edge touches the given vertex physically (either of the
 * edge's two endpoints matches the vertex's pixel position). Handles the
 * "equivalent vertices" problem without porting the engine's equivalence
 * tables: if two vertex keys resolve to the same pixel, they're the same
 * vertex. Same for edge endpoints.
 */
export function isVertexOnEdge(vKey, eKey, size = HEX?.SIZE ?? 56) {
  const v = parseVertexKey(vKey);
  const e = parseEdgeKey(eKey);
  if (!v || !e) return false;
  const vp = vertexPixel(v.q, v.r, v.dir, size);
  const { a, b } = edgeEndpoints(e.q, e.r, e.dir, size);
  const EPS = 0.5;
  return (
    (Math.abs(vp.x - a.x) < EPS && Math.abs(vp.y - a.y) < EPS) ||
    (Math.abs(vp.x - b.x) < EPS && Math.abs(vp.y - b.y) < EPS)
  );
}

export const HEX = {
  SIZE: 56, // circumradius in SVG user units; tune based on target density
  SQRT3,
};
