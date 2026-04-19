/**
 * ============================================================================
 * CLUBCATAN PARTYKIT SERVER
 * ============================================================================
 *
 * One PartyKit room per Catan game. The 6-character room ID is the game code.
 *
 * Client <-> server protocol (JSON over the WebSocket):
 *
 *   Client -> Server:
 *     { type: '<action>', ackId?: '<uuid>', payload?: {...} }
 *
 *   Server -> Client:
 *     Request ack:   { type: '_ack', ackId, ok: true, result }
 *                    { type: '_ack', ackId, ok: false, error }
 *     State update:  { type: 'gameState', state }          (per-player view)
 *     Broadcast:     { type: '<event>', ... }              (public events)
 *     Personal:      { type: '<event>', ... }              (sent to one player)
 *
 * Event and payload names are intentionally kept compatible with the
 * legacy Socket.io contract so existing tests still apply to gameLogic.js.
 */

import * as GameLogic from './gameLogic.js';

export default class ClubCatanServer {
  constructor(room) {
    this.room = room;
    this.game = null;
    this.playerByConn = new Map(); // connectionId -> playerId
    this.connByPlayer = new Map(); // playerId -> connectionId
    // Spectators join once the game is already running. They receive gameState
    // updates but their hands/dev cards aren't rendered (we send the
    // no-player view). Cap at 4 to bound fan-out.
    this.spectatorsByConn = new Map(); // connectionId -> { name }
  }

  // ---------- connection lifecycle ----------

  onConnect(_conn) {
    // No per-connection work until the client sends createGame/joinGame/reconnect.
  }

  onClose(conn) {
    // Spectator disconnect — just drop them; no announcement needed.
    if (this.spectatorsByConn.has(conn.id)) {
      this.spectatorsByConn.delete(conn.id);
      return;
    }
    const playerId = this.playerByConn.get(conn.id);
    this.playerByConn.delete(conn.id);
    if (!playerId) return;
    if (this.connByPlayer.get(playerId) === conn.id) {
      this.connByPlayer.delete(playerId);
    }
    const player = this.game?.players?.find((p) => p.id === playerId);
    if (player) this.broadcast({ type: 'playerDisconnected', playerName: player.name });
  }

  // ---------- message dispatch ----------

  onMessage(message, sender) {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return this.sendTo(sender, { type: 'error', message: 'Invalid JSON' });
    }
    const { type, ackId, payload = {} } = msg || {};
    const handler = HANDLERS[type];
    if (!handler) return this.ack(sender, ackId, false, `Unknown message type: ${type}`);
    try {
      handler.call(this, sender, payload, ackId);
    } catch (err) {
      console.error(`[clubcatan] handler ${type} threw`, err);
      this.ack(sender, ackId, false, err?.message || 'Internal error');
    }
  }

  // ---------- helpers ----------

  sendTo(conn, data) {
    conn.send(JSON.stringify(data));
  }

  ack(conn, ackId, ok, resultOrError) {
    if (!ackId) return;
    const body = ok
      ? { type: '_ack', ackId, ok: true, result: resultOrError }
      : { type: '_ack', ackId, ok: false, error: resultOrError };
    this.sendTo(conn, body);
  }

  broadcast(data) {
    this.room.broadcast(JSON.stringify(data));
  }

  sendToPlayer(playerId, data) {
    const connId = this.connByPlayer.get(playerId);
    if (!connId) return;
    const conn = this.room.getConnection(connId);
    if (conn) this.sendTo(conn, data);
  }

  /**
   * If the longest-road / largest-army holder changed after a GameLogic call,
   * emit a single `achievementChanged` event for all clients. Both `prior` and
   * `next` are player indices (or null). We convert to player IDs so the
   * client doesn't need to know the player array order.
   */
  maybeBroadcastAchievement(kind, prior, next) {
    if (prior === next) return;
    const indexToId = (idx) => (idx == null ? null : this.game.players[idx]?.id ?? null);
    this.broadcast({
      type: 'achievementChanged',
      kind,
      previousHolderId: indexToId(prior),
      newHolderId: indexToId(next),
    });
  }

  broadcastGameState() {
    if (!this.game) return;
    for (const player of this.game.players) {
      this.sendToPlayer(player.id, {
        type: 'gameState',
        state: GameLogic.getPlayerView(this.game, player.id),
      });
    }
    // Spectators get the null-viewer view — all player hands/dev cards
    // appear as counts only, myIndex is -1.
    const spectatorView = GameLogic.getPlayerView(this.game, '__spectator__');
    for (const connId of this.spectatorsByConn.keys()) {
      const conn = this.room.getConnection(connId);
      if (conn) this.sendTo(conn, { type: 'gameState', state: { ...spectatorView, spectator: true } });
    }
  }

  requirePlayer(conn, ackId) {
    const playerId = this.playerByConn.get(conn.id);
    if (!playerId) {
      this.ack(conn, ackId, false, 'Not in a game');
      return null;
    }
    return playerId;
  }

  requireGame(conn, ackId) {
    if (!this.game) {
      this.ack(conn, ackId, false, 'Game not found');
      return null;
    }
    return this.game;
  }
}

// ============================================================================
// HANDLERS — one per legacy Socket.io event
// ============================================================================

const HANDLERS = {
  // --------------------------------------------------------------------------
  // LOBBY
  // --------------------------------------------------------------------------

  createGame(conn, { playerName, isExtended = false, enableSpecialBuild = true }, ackId) {
    if (this.game) return this.ack(conn, ackId, false, 'A game already exists in this room');
    const playerId = crypto.randomUUID();
    this.game = GameLogic.createGame(
      this.room.id,
      { id: playerId, name: playerName },
      isExtended,
      enableSpecialBuild
    );
    this.game.createdAt = Date.now();
    this.playerByConn.set(conn.id, playerId);
    this.connByPlayer.set(playerId, conn.id);
    this.ack(conn, ackId, true, {
      gameCode: this.room.id,
      playerId,
      gameState: GameLogic.getPlayerView(this.game, playerId),
    });
  },

  joinGame(conn, { playerName }, ackId) {
    const game = this.requireGame(conn, ackId);
    if (!game) return;
    const playerId = crypto.randomUUID();
    const result = GameLogic.addPlayer(game, { id: playerId, name: playerName });
    if (!result.success) {
      // Signal to the client that spectating is a possibility when a join is
      // rejected because the game has already started. The client shows a
      // "Spectate instead?" prompt when it sees this code.
      const reason = result.error === 'Game already started' ? 'already_started' : undefined;
      return this.ack(conn, ackId, false, reason ? `already_started: ${result.error}` : result.error);
    }
    this.playerByConn.set(conn.id, playerId);
    this.connByPlayer.set(playerId, conn.id);
    this.ack(conn, ackId, true, {
      gameCode: this.room.id,
      playerId,
      gameState: GameLogic.getPlayerView(game, playerId),
    });
    this.broadcast({ type: 'playerJoined', playerName });
    this.broadcastGameState();
  },

  joinAsSpectator(conn, { playerName }, ackId) {
    const game = this.requireGame(conn, ackId);
    if (!game) return;
    if (game.phase === 'waiting') {
      return this.ack(conn, ackId, false, 'Game has not started yet — join as a player instead');
    }
    const MAX_SPECTATORS = 4;
    if (this.spectatorsByConn.size >= MAX_SPECTATORS) {
      return this.ack(conn, ackId, false, 'Spectator slots are full');
    }
    this.spectatorsByConn.set(conn.id, { name: playerName });
    const view = GameLogic.getPlayerView(game, '__spectator__');
    this.ack(conn, ackId, true, {
      gameCode: this.room.id,
      gameState: { ...view, spectator: true },
    });
    this.broadcast({ type: 'spectatorJoined', name: playerName });
  },

  reconnect(conn, { playerId }, ackId) {
    const game = this.requireGame(conn, ackId);
    if (!game) return;
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return this.ack(conn, ackId, false, 'Player not found in game');
    const oldConnId = this.connByPlayer.get(playerId);
    if (oldConnId && oldConnId !== conn.id) this.playerByConn.delete(oldConnId);
    this.playerByConn.set(conn.id, playerId);
    this.connByPlayer.set(playerId, conn.id);
    this.ack(conn, ackId, true, { gameState: GameLogic.getPlayerView(game, playerId) });
    this.broadcast({ type: 'playerReconnected', playerName: player.name });
  },

  // --------------------------------------------------------------------------
  // GAME FLOW
  // --------------------------------------------------------------------------

  startGame(conn, _payload, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    if (game.players[0].id !== playerId) return this.ack(conn, ackId, false, 'Only host can start the game');
    const result = GameLogic.startGame(game);
    if (result.success) {
      this.broadcast({ type: 'gameStarted', turnOrder: result.turnOrder });
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  shuffleBoard(conn, _payload, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    if (game.players[0].id !== playerId) return this.ack(conn, ackId, false, 'Only host can shuffle the board');
    const result = GameLogic.shuffleBoard(game);
    if (result.success) {
      this.broadcast({ type: 'boardShuffled' });
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  // --------------------------------------------------------------------------
  // TURN ACTIONS
  // --------------------------------------------------------------------------

  rollDice(conn, _payload, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.rollDice(game, playerId);
    if (result.success) {
      this.broadcast({ type: 'diceRolled', roll: result.roll, playerId });

      if (result.resourceGains) {
        const allGains = [];
        game.players.forEach((player, idx) => {
          const gains = result.resourceGains[idx];
          const hasGains = Object.values(gains).some((v) => v > 0);
          if (hasGains) {
            allGains.push({ playerId: player.id, playerName: player.name, playerIndex: idx, gains });
          }
        });
        if (allGains.length > 0) {
          this.broadcast({ type: 'resourcesDistributed', fromRoll: result.roll.total, allGains });
          game.players.forEach((player, idx) => {
            const gains = result.resourceGains[idx];
            if (Object.values(gains).some((v) => v > 0)) {
              this.sendToPlayer(player.id, {
                type: 'resourcesReceived',
                gains,
                fromRoll: result.roll.total,
              });
            }
          });
        }
      }
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  discardCards(conn, { resources }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.discardCards(game, playerId, resources);
    if (result.success) this.broadcastGameState();
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  moveRobber(conn, { hexKey, stealFromPlayerId }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.moveRobber(game, playerId, hexKey, stealFromPlayerId);
    if (result.success) {
      this.broadcast({ type: 'robberMoved', hexKey });
      if (result.stolenInfo) {
        const { resource, thief, thiefName, victim, victimName } = result.stolenInfo;
        this.sendToPlayer(thief, { type: 'stealResult', variant: 'stole', resource, otherPlayer: victimName });
        this.sendToPlayer(victim, { type: 'stealResult', variant: 'stolen', resource, otherPlayer: thiefName });
      }
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  // --------------------------------------------------------------------------
  // BUILDING
  // --------------------------------------------------------------------------

  placeSettlement(conn, { vertexKey }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.placeSettlement(game, playerId, vertexKey);
    if (result.success) {
      this.broadcast({ type: 'settlementPlaced', vertexKey, playerId });
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  placeRoad(conn, { edgeKey, isSetup, lastSettlement }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const priorLongestRoad = game.longestRoadPlayer;
    const result = GameLogic.placeRoad(game, playerId, edgeKey, isSetup, lastSettlement);
    if (result.success) {
      this.broadcast({ type: 'roadPlaced', edgeKey, playerId });
      this.maybeBroadcastAchievement('longestRoad', priorLongestRoad, game.longestRoadPlayer);
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  upgradeToCity(conn, { vertexKey }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.upgradeToCity(game, playerId, vertexKey);
    if (result.success) {
      this.broadcast({ type: 'cityBuilt', vertexKey, playerId });
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  // --------------------------------------------------------------------------
  // DEV CARDS
  // --------------------------------------------------------------------------

  buyDevCard(conn, _payload, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.buyDevCard(game, playerId);
    if (result.success) this.broadcastGameState();
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  playDevCard(conn, { cardType, params }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const priorLargestArmy = game.largestArmyPlayer;
    const result = GameLogic.playDevCard(game, playerId, cardType, params);
    if (result.success) {
      this.broadcast({ type: 'devCardPlayed', cardType, playerId });
      this.maybeBroadcastAchievement('largestArmy', priorLargestArmy, game.largestArmyPlayer);
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  yearOfPlentyPick(conn, { resource }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.yearOfPlentyPick(game, playerId, resource);
    if (result.success) this.broadcastGameState();
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  // --------------------------------------------------------------------------
  // TRADING
  // --------------------------------------------------------------------------

  bankTrade(conn, { giveResource, giveAmount, getResource }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.bankTrade(game, playerId, giveResource, giveAmount, getResource);
    if (result.success) this.broadcastGameState();
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  proposeTrade(conn, { offer, request }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.proposeTrade(game, playerId, offer, request);
    if (result.success) {
      this.broadcast({ type: 'tradeProposed', from: playerId, offer, request });
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  respondToTrade(conn, { accept }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.respondToTrade(game, playerId, accept);
    if (result.success) {
      this.broadcast({
        type: result.traded ? 'tradeAccepted' : 'tradeDeclined',
        by: playerId,
      });
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  cancelTrade(conn, _payload, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.cancelTrade(game, playerId);
    if (result.success) {
      this.broadcast({ type: 'tradeCancelled' });
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  // --------------------------------------------------------------------------
  // TURN MANAGEMENT
  // --------------------------------------------------------------------------

  advanceSetup(conn, _payload, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.advanceSetup(game, playerId);
    if (result.success) this.broadcastGameState();
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  endTurn(conn, _payload, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.endTurn(game, playerId);
    if (result.success) {
      if (result.specialBuildingPhase) {
        this.broadcast({
          type: 'specialBuildingPhaseStarted',
          playerId,
          currentBuilder: game.players[game.specialBuildIndex]?.id,
        });
      } else {
        this.broadcast({ type: 'turnEnded', playerId });
      }
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  endSpecialBuild(conn, _payload, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.endSpecialBuild(game, playerId);
    if (result.success) {
      if (result.specialBuildingPhaseEnded) {
        this.broadcast({ type: 'specialBuildingPhaseEnded' });
        this.broadcast({ type: 'turnEnded', playerId });
      } else {
        this.broadcast({
          type: 'specialBuildNext',
          currentBuilder: game.players[game.specialBuildIndex]?.id,
        });
      }
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  // --------------------------------------------------------------------------
  // QUERIES
  // --------------------------------------------------------------------------

  getPlayersOnHex(conn, { hexKey }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const playerIdx = game.players.findIndex((p) => p.id === playerId);
    const playerIndices = GameLogic.getPlayersOnHex(game, hexKey, playerIdx);
    const players = playerIndices.map((idx) => ({
      id: game.players[idx].id,
      name: game.players[idx].name,
      hasResources: Object.values(game.players[idx].resources).reduce((a, b) => a + b, 0) > 0,
    }));
    this.ack(conn, ackId, true, { players });
  },

  // --------------------------------------------------------------------------
  // CHAT
  // --------------------------------------------------------------------------

  chatMessage(conn, { message }, _ackId) {
    const playerId = this.playerByConn.get(conn.id);
    if (!playerId || !this.game) return;
    const player = this.game.players.find((p) => p.id === playerId);
    if (!player) return;
    this.broadcast({
      type: 'chatMessage',
      playerName: player.name,
      playerColor: player.color,
      message,
      timestamp: Date.now(),
    });
  },
};
