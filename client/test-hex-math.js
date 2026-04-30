import {
  hexToPixel,
  vertexOffset,
  vertexPixel,
  hexCorners,
  edgeEndpoints,
  hexPolygonPoints,
  boardBounds,
  parseVertexKey,
  parseEdgeKey,
  isVertexOnEdge,
  HEX
} from './src/lib/hex-math.js';

function logSuccess(msg) { console.log(`\x1b[32m✅ ${msg}\x1b[0m`); }
function logError(msg) { console.error(`\x1b[31m❌ ${msg}\x1b[0m`); }
function logSection(msg) { console.log(`\n\x1b[35m=== ${msg} ===\x1b[0m`); }

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    logSuccess(message);
    passed++;
  } else {
    logError(message);
    failed++;
  }
}

function assertNear(a, b, message, eps = 0.001) {
  const diff = Math.abs(a - b);
  if (diff < eps) {
    logSuccess(`${message} (${a.toFixed(3)} ≈ ${b.toFixed(3)})`);
    passed++;
  } else {
    logError(`${message} (${a.toFixed(3)} !≈ ${b.toFixed(3)}, diff=${diff.toFixed(3)})`);
    failed++;
  }
}

async function runTests() {
  const SIZE = 56;

  logSection('1. hexToPixel');
  const origin = hexToPixel(0, 0, SIZE);
  assert(origin.x === 0 && origin.y === 0, 'Origin hex should be at (0,0)');

  const h1 = hexToPixel(1, 0, SIZE);
  assertNear(h1.x, SIZE * Math.sqrt(3), 'Hex (1,0) x-coord');
  assert(h1.y === 0, 'Hex (1,0) y-coord should be 0');

  const h2 = hexToPixel(0, 1, SIZE);
  assertNear(h2.x, SIZE * Math.sqrt(3) / 2, 'Hex (0,1) x-coord');
  assertNear(h2.y, SIZE * 1.5, 'Hex (0,1) y-coord');

  logSection('2. vertexOffset');
  // 0 = top (-90 deg)
  const v0 = vertexOffset(0, SIZE);
  assertNear(v0.x, 0, 'Vertex 0 x-offset (top)');
  assertNear(v0.y, -SIZE, 'Vertex 0 y-offset (top)');

  // 3 = bottom (90 deg)
  const v3 = vertexOffset(3, SIZE);
  assertNear(v3.x, 0, 'Vertex 3 x-offset (bottom)');
  assertNear(v3.y, SIZE, 'Vertex 3 y-offset (bottom)');

  logSection('3. vertexPixel');
  const vp0 = vertexPixel(0, 0, 0, SIZE);
  assertNear(vp0.x, 0, 'Origin hex vertex 0 x');
  assertNear(vp0.y, -SIZE, 'Origin hex vertex 0 y');

  logSection('4. hexCorners');
  const corners = hexCorners(0, 0, SIZE);
  assert(Array.isArray(corners) && corners.length === 6, 'Should return 6 corners');
  assertNear(corners[0].y, -SIZE, 'Corner 0 y should be -SIZE');
  assertNear(corners[3].y, SIZE, 'Corner 3 y should be SIZE');

  logSection('5. edgeEndpoints');
  const edge0 = edgeEndpoints(0, 0, 0, SIZE); // edge 0 connects v0 and v1
  assertNear(edge0.a.x, 0, 'Edge 0 endpoint A x');
  assertNear(edge0.a.y, -SIZE, 'Edge 0 endpoint A y');
  // v1 is at 30 deg: x = cos(-30) * SIZE = sqrt(3)/2 * SIZE, y = sin(-30) * SIZE = -0.5 * SIZE
  assertNear(edge0.b.x, SIZE * Math.sqrt(3) / 2, 'Edge 0 endpoint B x');
  assertNear(edge0.b.y, -SIZE * 0.5, 'Edge 0 endpoint B y');

  logSection('6. hexPolygonPoints');
  const points = hexPolygonPoints(0, 0, SIZE);
  assert(typeof points === 'string', 'Should return a string');
  assert(points.split(' ').length === 6, 'Should have 6 points');
  assert(points.includes('0.00,-56.00'), 'Should contain vertex 0');

  logSection('7. boardBounds');
  const hexes = [{ q: 0, r: 0 }];
  const bounds = boardBounds(hexes, SIZE, 0);
  // Width should be sqrt(3) * SIZE, Height should be 2 * SIZE
  assertNear(bounds.width, SIZE * Math.sqrt(3), 'Bounding box width');
  assertNear(bounds.height, SIZE * 2, 'Bounding box height');
  assertNear(bounds.x, -SIZE * Math.sqrt(3) / 2, 'Bounding box minX');
  assertNear(bounds.y, -SIZE, 'Bounding box minY');

  logSection('8. parseVertexKey & parseEdgeKey');
  const vk = parseVertexKey('v_1_-2_3');
  assert(vk.q === 1 && vk.r === -2 && vk.dir === 3, 'Valid vertex key parsing');
  assert(parseVertexKey('invalid') === null, 'Invalid vertex key parsing');

  const ek = parseEdgeKey('e_-1_0_5');
  assert(ek.q === -1 && ek.r === 0 && ek.dir === 5, 'Valid edge key parsing');
  assert(parseEdgeKey('v_0_0_0') === null, 'Edge key parser shouldn\'t parse vertex keys');

  logSection('9. isVertexOnEdge');
  // In origin hex, vertex 0 (v_0_0_0) is part of edge 0 (e_0_0_0) and edge 5 (e_0_0_5)
  assert(isVertexOnEdge('v_0_0_0', 'e_0_0_0', SIZE), 'Vertex 0 should be on edge 0');
  assert(isVertexOnEdge('v_0_0_0', 'e_0_0_5', SIZE), 'Vertex 0 should be on edge 5');
  assert(!isVertexOnEdge('v_0_0_0', 'e_0_0_1', SIZE), 'Vertex 0 should NOT be on edge 1');

  logSection('TEST SUMMARY');
  console.log(`\nTests Passed: ${passed}`);
  if (failed > 0) {
    console.log(`Tests Failed: ${failed}`);
    process.exit(1);
  } else {
    console.log('All tests passed!');
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
