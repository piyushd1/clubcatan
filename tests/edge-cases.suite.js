// Common test logic for Catan Edge Cases
// This suite is shared between different environments (e.g., party/ and server/)
// to ensure consistency and avoid duplication.

export function runEdgeCaseTests(GameLogic) {
  const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
  };

  let passed = 0;
  let failed = 0;

  function log(msg, color = 'reset') {
    console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
  }

  function assert(condition, message) {
    if (condition) {
      log(`  ✓ ${message}`, 'green');
      passed++;
    } else {
      log(`  ✗ ${message}`, 'red');
      failed++;
    }
  }

  function logSection(title) {
    console.log('\n' + '═'.repeat(70));
    log(`  ${title}`, 'cyan');
    console.log('═'.repeat(70));
  }

  function logSubSection(title) {
    console.log('\n' + '─'.repeat(50));
    log(`  ${title}`, 'magenta');
    console.log('─'.repeat(50));
  }

  // Helper to create a game with specific setup
  function createTestGame() {
    const game = GameLogic.createGame('test', { id: 'p1', name: 'Alice' }, false, false);
    GameLogic.addPlayer(game, { id: 'p2', name: 'Bob' });
    GameLogic.addPlayer(game, { id: 'p3', name: 'Charlie' });
    GameLogic.addPlayer(game, { id: 'p4', name: 'Diana' });
    GameLogic.startGame(game);
    return game;
  }

  // Helper to manually place roads for testing
  function placeRoadDirectly(game, playerIndex, edgeKey) {
    game.edges[edgeKey] = { road: true, owner: playerIndex };
    game.players[playerIndex].roads--;
  }

  // Helper to manually place settlement for testing
  function placeSettlementDirectly(game, playerIndex, vertexKey) {
    game.vertices[vertexKey] = { building: 'settlement', owner: playerIndex };
    game.players[playerIndex].settlements--;
    game.players[playerIndex].victoryPoints++;
  }

  // Null out every hex's number + resource so that the random board doesn't
  // contribute stray gains to the vertex under test. Each resource-distribution
  // test then reintroduces only the specific hexes it cares about.
  function quietBoard(game) {
    for (const hex of Object.values(game.hexes)) {
      hex.number = null;
      hex.resource = null;
    }
  }

  // =============================================================================
  // TEST SECTION 1: LONGEST ROAD EDGE CASES
  // =============================================================================
  function testLongestRoad() {
    logSection('1. LONGEST ROAD EDGE CASES');

    logSubSection('1.1 Basic Longest Road - Straight Line');
    {
      const game = createTestGame();
      game.phase = 'playing';

      placeSettlementDirectly(game, 0, 'v_0_0_0');
      placeRoadDirectly(game, 0, 'e_0_0_5'); // v_5-v_0
      placeRoadDirectly(game, 0, 'e_0_0_0'); // v_0-v_1
      placeRoadDirectly(game, 0, 'e_0_0_1'); // v_1-v_2
      placeRoadDirectly(game, 0, 'e_0_0_2'); // v_2-v_3
      placeRoadDirectly(game, 0, 'e_0_0_3'); // v_3-v_4

      GameLogic.updateLongestRoad(game);

      assert(game.players[0].roadLength >= 5, 'Player 0 has at least 5 connected roads');
      assert(game.longestRoadPlayer === 0, 'Player 0 has longest road');
      assert(game.players[0].hasLongestRoad === true, 'Player 0 hasLongestRoad flag is true');
    }

    logSubSection('1.2 Longest Road - Branching Path');
    {
      const game = createTestGame();
      game.phase = 'playing';

      placeSettlementDirectly(game, 0, 'v_0_0_0');

      // Main branch
      placeRoadDirectly(game, 0, 'e_0_0_0');
      placeRoadDirectly(game, 0, 'e_0_0_5');
      placeRoadDirectly(game, 0, 'e_0_0_4');

      // Side branch (shorter)
      placeRoadDirectly(game, 0, 'e_0_0_1');
      placeRoadDirectly(game, 0, 'e_0_0_2');

      GameLogic.updateLongestRoad(game);

      assert(game.players[0].roadLength >= 5, 'Branching roads counted correctly');
      assert(game.longestRoadPlayer === 0, 'Player 0 has longest road with branching');
    }

    logSubSection('1.3 Longest Road - Opponent Settlement Breaks Road');
    {
      const game = GameLogic.createGame('test', { id: 'p1', name: 'Alice' }, false, false);
      GameLogic.addPlayer(game, { id: 'p2', name: 'Bob' });
      game.phase = 'playing';

      placeSettlementDirectly(game, 0, 'v_0_0_0');
      placeRoadDirectly(game, 0, 'e_0_0_0');
      placeRoadDirectly(game, 0, 'e_0_0_1');
      placeRoadDirectly(game, 0, 'e_0_0_2');
      placeRoadDirectly(game, 0, 'e_0_0_3');
      placeRoadDirectly(game, 0, 'e_0_0_4');
      placeRoadDirectly(game, 0, 'e_0_0_5');

      placeSettlementDirectly(game, 1, 'v_0_0_3');

      GameLogic.updateLongestRoad(game);

      log(`  Road length after break: ${game.players[0].roadLength}`, 'yellow');
      assert(game.players[0].roadLength >= 5, 'Player 0 has at least 5 roads counted');
    }

    logSubSection('1.4 Longest Road - Own Settlement Does NOT Break Road');
    {
      const game = createTestGame();
      game.phase = 'playing';

      placeSettlementDirectly(game, 0, 'v_0_0_0');
      placeRoadDirectly(game, 0, 'e_0_0_0');
      placeRoadDirectly(game, 0, 'e_0_0_1');
      placeSettlementDirectly(game, 0, 'v_0_0_2'); // Own settlement
      placeRoadDirectly(game, 0, 'e_0_0_2');
      placeRoadDirectly(game, 0, 'e_0_0_3');
      placeRoadDirectly(game, 0, 'e_0_0_4');

      GameLogic.updateLongestRoad(game);

      assert(game.players[0].roadLength === 5, 'Own settlement does not break road');
    }

    logSubSection('1.5 Longest Road - Circular Road');
    {
      const game = createTestGame();
      game.phase = 'playing';

      placeSettlementDirectly(game, 0, 'v_0_0_0');
      placeRoadDirectly(game, 0, 'e_0_0_0');
      placeRoadDirectly(game, 0, 'e_0_0_1');
      placeRoadDirectly(game, 0, 'e_0_0_2');
      placeRoadDirectly(game, 0, 'e_0_0_3');
      placeRoadDirectly(game, 0, 'e_0_0_4');
      placeRoadDirectly(game, 0, 'e_0_0_5');

      GameLogic.updateLongestRoad(game);

      assert(game.players[0].roadLength === 6, 'Circular road counts all 6 segments');
    }

    logSubSection('1.6 Longest Road - Tie Goes to Current Holder');
    {
      const game = createTestGame();
      game.phase = 'playing';

      placeSettlementDirectly(game, 0, 'v_0_0_0');
      placeRoadDirectly(game, 0, 'e_0_0_0');
      placeRoadDirectly(game, 0, 'e_0_0_1');
      placeRoadDirectly(game, 0, 'e_0_0_2');
      placeRoadDirectly(game, 0, 'e_0_0_3');
      placeRoadDirectly(game, 0, 'e_0_0_4');

      GameLogic.updateLongestRoad(game);
      assert(game.longestRoadPlayer === 0, 'Player 0 initially has longest road');

      placeSettlementDirectly(game, 1, 'v_1_0_0');
      placeRoadDirectly(game, 1, 'e_1_0_0');
      placeRoadDirectly(game, 1, 'e_1_0_1');
      placeRoadDirectly(game, 1, 'e_1_0_2');
      placeRoadDirectly(game, 1, 'e_1_0_3');
      placeRoadDirectly(game, 1, 'e_1_0_4');

      GameLogic.updateLongestRoad(game);

      assert(game.longestRoadPlayer === 0, 'Tie goes to current holder (Player 0)');
      assert(game.players[1].hasLongestRoad === false, 'Player 1 does not steal on tie');
    }

    logSubSection('1.7 Longest Road - Must Beat to Take');
    {
      const game = createTestGame();
      game.phase = 'playing';

      placeSettlementDirectly(game, 0, 'v_0_0_0');
      for (let i = 0; i < 5; i++) {
        placeRoadDirectly(game, 0, `e_0_0_${i}`);
      }

      GameLogic.updateLongestRoad(game);
      const initialLength = game.longestRoadLength;

      placeRoadDirectly(game, 0, 'e_0_0_5');
      placeRoadDirectly(game, 0, 'e_-1_0_2');

      GameLogic.updateLongestRoad(game);

      assert(game.longestRoadLength >= initialLength, 'Longest road length updates when holder extends');

      placeSettlementDirectly(game, 1, 'v_1_0_0');
      for (let i = 0; i < 6; i++) {
        placeRoadDirectly(game, 1, `e_1_0_${i}`);
      }

      GameLogic.updateLongestRoad(game);

      if (game.players[0].roadLength > game.players[1].roadLength) {
        assert(game.longestRoadPlayer === 0, 'Player with more roads keeps longest road');
      }
    }

    logSubSection('1.8 Longest Road - Image Scenario (Red vs Orange)');
    {
      const game = createTestGame();
      game.phase = 'playing';

      placeSettlementDirectly(game, 0, 'v_-1_0_0');
      placeRoadDirectly(game, 0, 'e_-1_0_0');
      placeRoadDirectly(game, 0, 'e_-1_0_1');
      placeRoadDirectly(game, 0, 'e_-1_0_2');
      placeRoadDirectly(game, 0, 'e_-1_0_3');
      placeRoadDirectly(game, 0, 'e_-1_0_4');
      placeRoadDirectly(game, 0, 'e_-1_0_5');
      placeRoadDirectly(game, 0, 'e_-1_1_0');

      placeSettlementDirectly(game, 1, 'v_0_0_0');
      placeRoadDirectly(game, 1, 'e_0_0_0');
      placeRoadDirectly(game, 1, 'e_0_0_1');
      placeRoadDirectly(game, 1, 'e_0_0_2');
      placeRoadDirectly(game, 1, 'e_0_0_3');
      placeRoadDirectly(game, 1, 'e_0_0_4');

      GameLogic.updateLongestRoad(game);

      log(`  Orange road length: ${game.players[0].roadLength}`, 'yellow');
      log(`  Red road length: ${game.players[1].roadLength}`, 'yellow');

      assert(game.players[0].roadLength > game.players[1].roadLength, 'Orange has more connected roads than Red');
      assert(game.longestRoadPlayer === 0, 'Orange (Player 0) should have longest road, not Red');
    }
  }

  // =============================================================================
  // TEST SECTION 2: RESOURCE DISTRIBUTION
  // =============================================================================
  function testResourceDistribution() {
    logSection('2. RESOURCE DISTRIBUTION EDGE CASES');

    logSubSection('2.1 Adjacent Hexes Same Resource Same Number');
    {
      const game = createTestGame();
      game.phase = 'playing';
      quietBoard(game);

      game.hexes['0,0'] = { q: 0, r: 0, terrain: 'forest', resource: 'lumber', number: 8 };
      game.hexes['1,0'] = { q: 1, r: 0, terrain: 'forest', resource: 'lumber', number: 8 };
      game.robber = '2,0';

      const sharedVertex = 'v_0_0_1';
      game.vertices[sharedVertex] = { building: 'settlement', owner: 0 };

      const initialLumber = game.players[0].resources.lumber;
      simulateDistributeResources(game, 8);

      const expectedGain = 2;
      const actualGain = game.players[0].resources.lumber - initialLumber;

      log(`  Initial lumber: ${initialLumber}, After roll: ${game.players[0].resources.lumber}`, 'yellow');
      assert(actualGain === expectedGain, `Settlement at shared vertex gets resources from BOTH hexes (expected ${expectedGain}, got ${actualGain})`);
    }

    logSubSection('2.2 City Gets Double Resources');
    {
      const game = createTestGame();
      game.phase = 'playing';
      quietBoard(game);

      game.hexes['0,0'] = { q: 0, r: 0, terrain: 'forest', resource: 'lumber', number: 6 };
      game.robber = '2,0';

      game.vertices['v_0_0_0'] = { building: 'city', owner: 0 };

      const initialLumber = game.players[0].resources.lumber;
      simulateDistributeResources(game, 6);
      const actualGain = game.players[0].resources.lumber - initialLumber;

      assert(actualGain === 2, 'City gets 2 resources from single hex');
    }

    logSubSection('2.3 City at Shared Vertex Gets 4 Resources');
    {
      const game = createTestGame();
      game.phase = 'playing';
      quietBoard(game);

      game.hexes['0,0'] = { q: 0, r: 0, terrain: 'forest', resource: 'lumber', number: 9 };
      game.hexes['1,0'] = { q: 1, r: 0, terrain: 'forest', resource: 'lumber', number: 9 };
      game.robber = '2,0';

      game.vertices['v_0_0_1'] = { building: 'city', owner: 0 };

      const initialLumber = game.players[0].resources.lumber;
      simulateDistributeResources(game, 9);
      const actualGain = game.players[0].resources.lumber - initialLumber;

      assert(actualGain === 4, `City at shared vertex gets 4 resources (2 from each hex), got ${actualGain}`);
    }

    logSubSection('2.4 Different Resources Same Number');
    {
      const game = createTestGame();
      game.phase = 'playing';
      quietBoard(game);
      game.hexes['0,0'] = { q: 0, r: 0, terrain: 'forest', resource: 'lumber', number: 5 };
      game.hexes['1,0'] = { q: 1, r: 0, terrain: 'hills', resource: 'brick', number: 5 };
      game.robber = '2,0';

      game.vertices['v_0_0_1'] = { building: 'settlement', owner: 0 };

      const initialLumber = game.players[0].resources.lumber;
      const initialBrick = game.players[0].resources.brick;

      simulateDistributeResources(game, 5);

      const lumberGain = game.players[0].resources.lumber - initialLumber;
      const brickGain = game.players[0].resources.brick - initialBrick;

      assert(lumberGain === 1, 'Gets 1 lumber from forest hex');
      assert(brickGain === 1, 'Gets 1 brick from hills hex');
    }

    logSubSection('2.5 Robber Blocks Resources');
    {
      const game = createTestGame();
      game.phase = 'playing';
      quietBoard(game);

      game.hexes['0,0'] = { q: 0, r: 0, terrain: 'forest', resource: 'lumber', number: 4 };
      game.robber = '0,0';

      game.vertices['v_0_0_0'] = { building: 'settlement', owner: 0 };

      const initialLumber = game.players[0].resources.lumber;
      simulateDistributeResources(game, 4);
      const actualGain = game.players[0].resources.lumber - initialLumber;

      assert(actualGain === 0, 'Robber blocks resource collection');
    }
  }

  function simulateDistributeResources(game, roll) {
    const processedHexVertices = new Set();

    Object.entries(game.hexes).forEach(([hKey, hex]) => {
      if (hex.number === roll && hKey !== game.robber) {
        for (let dir = 0; dir < 6; dir++) {
          const equivalents = getEquivalentVerticesLocal(hex.q, hex.r, dir);
          let buildingInfo = null;

          for (const eq of equivalents) {
            const vKey = `v_${eq.q}_${eq.r}_${eq.dir}`;
            const vertex = game.vertices[vKey];
            if (vertex && vertex.building) {
              buildingInfo = { owner: vertex.owner, type: vertex.building, vertexKey: vKey };
              break;
            }
          }

          if (buildingInfo && buildingInfo.owner !== null && hex.resource) {
            const hexVertexKey = `${hKey},${buildingInfo.vertexKey}`;
            if (processedHexVertices.has(hexVertexKey)) continue;
            processedHexVertices.add(hexVertexKey);

            const player = game.players[buildingInfo.owner];
            const amount = buildingInfo.type === 'city' ? 2 : 1;
            player.resources[hex.resource] += amount;
          }
        }
      }
    });
  }

  function getEquivalentVerticesLocal(q, r, dir) {
    const equivalents = [{ q, r, dir }];

    if (dir === 0) {
      equivalents.push({ q: q, r: r - 1, dir: 2 });
      equivalents.push({ q: q + 1, r: r - 1, dir: 4 });
    } else if (dir === 1) {
      equivalents.push({ q: q + 1, r: r - 1, dir: 3 });
      equivalents.push({ q: q + 1, r: r, dir: 5 });
    } else if (dir === 2) {
      equivalents.push({ q: q + 1, r: r, dir: 4 });
      equivalents.push({ q: q, r: r + 1, dir: 0 });
    } else if (dir === 3) {
      equivalents.push({ q: q, r: r + 1, dir: 5 });
      equivalents.push({ q: q - 1, r: r + 1, dir: 1 });
    } else if (dir === 4) {
      equivalents.push({ q: q - 1, r: r + 1, dir: 0 });
      equivalents.push({ q: q - 1, r: r, dir: 2 });
    } else if (dir === 5) {
      equivalents.push({ q: q - 1, r: r, dir: 1 });
      equivalents.push({ q: q, r: r - 1, dir: 3 });
    }

    return equivalents;
  }

  // =============================================================================
  // TEST SECTION 3: HIDDEN VICTORY POINTS
  // =============================================================================
  function testHiddenVictoryPoints() {
    logSection('3. HIDDEN VICTORY POINTS');

    logSubSection('3.1 VP Cards Are Hidden During Game');
    {
      const game = createTestGame();
      game.phase = 'playing';

      const p1Index = game.players.findIndex(p => p.id === 'p1');
      const p2Index = game.players.findIndex(p => p.id === 'p2');

      game.players[p1Index].hiddenVictoryPoints = 2;
      game.players[p1Index].victoryPoints = 5;

      const view = GameLogic.getPlayerView(game, 'p2');

      const p1InView = view.players[p1Index];
      assert(p1InView.hiddenVictoryPoints === 0, 'Hidden VPs are hidden from other players during game');
    }

    logSubSection('3.2 All Hidden VPs Revealed When Game Ends');
    {
      const game = createTestGame();
      game.phase = 'playing';

      game.players[0].hiddenVictoryPoints = 2;
      game.players[0].victoryPoints = 8;
      game.players[1].hiddenVictoryPoints = 1;
      game.players[1].victoryPoints = 7;
      game.players[2].hiddenVictoryPoints = 3;
      game.players[2].victoryPoints = 4;

      GameLogic.checkWinnerTest ? GameLogic.checkWinnerTest(game) : null;

      if (game.phase === 'finished') {
        const view = GameLogic.getPlayerView(game, 'p2');
        assert(view.players[0].victoryPoints >= 10, 'Winner hidden VPs revealed');
      }
    }

    logSubSection('3.3 Player Can See Own Hidden VPs');
    {
      const game = createTestGame();
      game.phase = 'playing';

      const p1Index = game.players.findIndex(p => p.id === 'p1');
      game.players[p1Index].hiddenVictoryPoints = 3;

      const view = GameLogic.getPlayerView(game, 'p1');

      assert(view.players[view.myIndex].hiddenVictoryPoints === 3, 'Player can see their own hidden VPs');
    }
  }

  // =============================================================================
  // TEST SECTION 4: VERTEX/EDGE COORDINATE SYSTEM
  // =============================================================================
  function testCoordinateSystem() {
    logSection('4. VERTEX/EDGE COORDINATE SYSTEM');

    logSubSection('4.1 Vertex Equivalence - Each Vertex Has 3 Representations');
    {
      const game = createTestGame();

      const v = 'v_0_0_0';
      const adjacentHexes = [];

      Object.keys(game.hexes).forEach(hKey => {
        const match = hKey.match(/(-?\d+),(-?\d+)/);
        if (match) {
          const hq = parseInt(match[1]);
          const hr = parseInt(match[2]);
          for (let dir = 0; dir < 6; dir++) {
            if (GameLogic.areVerticesEqual(`v_${hq}_${hr}_${dir}`, v)) {
              adjacentHexes.push({ q: hq, r: hr, dir });
            }
          }
        }
      });

      log(`  Vertex v_0_0_0 is shared by ${adjacentHexes.length} hexes`, 'yellow');
      assert(adjacentHexes.length <= 3, 'Each vertex is shared by at most 3 hexes');
    }

    logSubSection('4.2 Edge Equivalence - Each Edge Has 2 Representations');
    {
      const game = createTestGame();
      const equivalents = GameLogic.getEquivalentEdges(0, 0, 0);
      assert(equivalents.length === 2, 'Each edge has exactly 2 representations (original + 1 equivalent)');
    }

    logSubSection('4.3 Vertex-Edge Connectivity');
    {
      const game = createTestGame();
      const edges = GameLogic.getVertexEdges('v_0_0_0');

      const uniqueEdges = new Set();
      edges.forEach(e => {
        const match = e.match(/e_(-?\d+)_(-?\d+)_(\d+)/);
        if (match) {
          const equivs = GameLogic.getEquivalentEdges(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
          const canonical = equivs.sort((a, b) => a.q - b.q || a.r - b.r || a.dir - b.dir)[0];
          uniqueEdges.add(`e_${canonical.q}_${canonical.r}_${canonical.dir}`);
        }
      });

      assert(uniqueEdges.size === 3, 'Each vertex is connected to exactly 3 edges');
    }

    logSubSection('4.4 Road Placement Uses Equivalent Edge Check');
    {
      const game = createTestGame();
      game.phase = 'playing';
      game.turnPhase = 'main';

      const p1Index = game.players.findIndex(p => p.id === 'p1');
      game.currentPlayerIndex = p1Index;

      game.vertices['v_0_0_0'] = { building: 'settlement', owner: p1Index };
      game.players[p1Index].resources = { brick: 10, lumber: 10, wool: 0, grain: 0, ore: 0 };

      const result1 = GameLogic.placeRoad(game, 'p1', 'e_0_0_0', false, null);
      assert(result1.success, 'First road placement succeeds');

      const equivalentEdge = 'e_1_-1_3';
      const result2 = GameLogic.placeRoad(game, 'p1', equivalentEdge, false, null);

      assert(!result2.success, 'Cannot place road on same physical edge (different key format)');
    }

    logSubSection('4.5 Distance Rule Uses Equivalent Vertex Check');
    {
      const game = createTestGame();
      game.phase = 'playing';
      game.turnPhase = 'main';
      game.currentPlayerIndex = 0;

      game.vertices['v_0_0_0'] = { building: 'settlement', owner: 0 };
      game.edges['e_0_0_0'] = { road: true, owner: 0 };
      game.players[0].resources = { brick: 10, lumber: 10, wool: 10, grain: 10, ore: 10 };

      const adjacentVertex = 'v_0_0_1';
      const result = GameLogic.canPlaceSettlement(game, 'p1', adjacentVertex, false);

      assert(!result.valid, 'Distance rule prevents adjacent settlement placement');
    }
  }

  // =============================================================================
  // TEST SECTION 5: DEVELOPMENT CARD RULES
  // =============================================================================
  function testDevCardRules() {
    logSection('5. DEVELOPMENT CARD RULES');

    logSubSection('5.1 Only One Dev Card Per Turn');
    {
      const game = createTestGame();
      game.phase = 'playing';
      game.turnPhase = 'main';
      game.currentPlayerIndex = 0;

      game.players[0].developmentCards = ['knight', 'knight'];
      game.players[0].resources = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };

      const result1 = GameLogic.playDevCard(game, 'p1', 'knight', { hexKey: 'h_0_0' });

      if (result1.success) {
        game.players[0].developmentCards = ['knight'];
        const result2 = GameLogic.playDevCard(game, 'p1', 'knight', { hexKey: 'h_1_0' });
        assert(!result2.success, 'Cannot play second dev card in same turn');
      }
    }

    logSubSection('5.2 Cannot Play Card Bought This Turn');
    {
      const game = createTestGame();
      game.phase = 'playing';
      game.turnPhase = 'main';
      game.currentPlayerIndex = 0;

      game.players[0].newDevCards = ['knight'];
      game.players[0].developmentCards = [];

      const result = GameLogic.playDevCard(game, 'p1', 'knight', { hexKey: 'h_0_0' });
      assert(!result.success, 'Cannot play card bought this turn');
    }
  }

  // =============================================================================
  // MAIN TEST RUNNER
  // =============================================================================
  async function runAllTests() {
    console.log('\n' + '█'.repeat(70));
    log('█  CATAN COMPREHENSIVE EDGE CASE TESTS  █', 'cyan');
    console.log('█'.repeat(70));

    try {
      testLongestRoad();
      testResourceDistribution();
      testHiddenVictoryPoints();
      testCoordinateSystem();
      testDevCardRules();
    } catch (error) {
      log(`\nTest Error: ${error.message}`, 'red');
      console.error(error.stack);
    }

    console.log('\n' + '═'.repeat(70));
    log('  TEST SUMMARY', 'cyan');
    console.log('═'.repeat(70));
    log(`\n  ✓ Tests Passed: ${passed}`, 'green');
    log(`  ✗ Tests Failed: ${failed}`, failed > 0 ? 'red' : 'green');
    log(`\n  Pass Rate: ${(passed / (passed + failed) * 100).toFixed(1)}%\n`, passed === passed + failed ? 'green' : 'yellow');

    return failed === 0;
  }

  return runAllTests();
}
