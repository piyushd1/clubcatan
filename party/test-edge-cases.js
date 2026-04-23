// Party environment wrapper for Edge Case Tests
import * as GameLogic from './gameLogic.js';
import { runEdgeCaseTests } from '../tests/edge-cases.suite.js';

runEdgeCaseTests(GameLogic).then(success => {
  process.exit(success ? 0 : 1);
});
