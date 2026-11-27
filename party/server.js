/**
 * ============================================================================
 * CLUBCATAN SERVER (PartyServer on Cloudflare Workers + Durable Objects)
 * ============================================================================
 *
 * One Durable Object ("room") per Catan game. The 6-character room ID is the
 * game code. Clients connect to `/parties/main/<ROOM>`; `routePartykitRequest`
 * maps the `main` segment to the `Main` Durable Object binding in
 * wrangler.jsonc. Everything that is not a `/parties/*` request is served from
 * the static client bundle (`client/dist`) by the Workers assets layer.
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

import { Server, routePartykitRequest } from 'partyserver';
import * as GameLogic from '../shared/gameLogic.js';
import { validate } from './validate.js';

export class ClubCatanServer extends Server {
  // Let the Durable Object hibernate between messages. Idle rooms cost nothing
  // and wake on the next WebSocket message. Nothing below relies on in-memory
  // state surviving: the game lives in `ctx.storage` and each connection's role
  // lives in `connection.state`, which Cloudflare keeps across hibernation.
  static options = { hibernate: true };

  /** Authoritative game object. Loaded in onStart, written by persist(). */
  game = null;

  // Spectators join once the game is already running. They receive gameState
  // updates but their hands/dev cards aren't rendered (we send the
  // no-player view). Cap at 4 to bound fan-out.
  static MAX_SPECTATORS = 4;

  // Rooms with no activity for this long are wiped so the code can be reused.
  static ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  static TTL_CHECK_MS = 24 * 60 * 60 * 1000;

  // ---------- lifecycle ----------

  /** Runs on first start and after every hibernation wake / eviction. */
  async onStart() {
    this.game = (await this.ctx.storage.get('game')) ?? null;
  }

  /**
   * Write the game after every successful mutation so eviction, hibernation,
   * or a `wrangler deploy` mid-game loses nothing. One row write per call.
   * Also (re)arms the idle-cleanup alarm.
   */
  async persist() {
    await this.ctx.storage.put({ game: this.game, lastActivity: Date.now() });
    await this.ctx.storage.setAlarm(Date.now() + ClubCatanServer.TTL_CHECK_MS);
  }

  /** Idle-room cleanup. Fires ~24 h after the last mutation. */
  async onAlarm() {
    const last = (await this.ctx.storage.get('lastActivity')) ?? 0;
    if (Date.now() - last > ClubCatanServer.ROOM_TTL_MS) {
      // Room is abandoned: forget the game so the code can be reused.
      for (const conn of this.getConnections()) conn.close(1000, 'Room expired');
      await this.ctx.storage.deleteAll();
      this.game = null;
      return;
    }
    await this.ctx.storage.setAlarm(Date.now() + ClubCatanServer.TTL_CHECK_MS);
  }

  onConnect(_conn) {
    // No per-connection work until the client sends createGame/joinGame/
    // joinAsSpectator/reconnect. Those bind a role via connection.setState.
  }

  onClose(conn) {
    const role = conn.state?.role;
    if (role !== 'player') return; // spectators and unbound sockets: nothing to announce
    const playerId = conn.state.playerId;
    // Only announce if no other live socket still represents this player
    // (e.g. a reconnect landed before the old socket's close event).
    const stillConnected = this.connectionForPlayer(playerId, conn.id);
    if (stillConnected) return;
    const player = this.game?.players?.find((p) => p.id === playerId);
    if (player) this.broadcast({ type: 'playerDisconnected', playerName: player.name });
  }

  // ---------- message dispatch ----------

  // PartyServer passes (connection, message); PartyKit passed (message, sender).
  async onMessage(sender, message) {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return this.sendTo(sender, { type: 'error', message: 'Invalid JSON' });
    }
    const { type, ackId, payload } = msg || {};
    const handler = HANDLERS[type];
    if (!handler) return this.ack(sender, ackId, false, `Unknown message type: ${type}`);
    // Shape-check and sanitise the payload before any game code sees it.
    const checked = validate(type, payload);
    if (!checked.ok) return this.ack(sender, ackId, false, checked.error);
    try {
      await handler.call(this, sender, checked.payload, ackId);
    } catch (err) {
      console.error(`[clubcatan] handler ${type} threw`, err);
      this.ack(sender, ackId, false, err?.message || 'Internal error');
    }
  }

  // ---------- connection roles (hibernation-safe) ----------

  bindPlayer(conn, playerId) {
    conn.setState({ role: 'player', playerId });
  }

  bindSpectator(conn, name) {
    conn.setState({ role: 'spectator', name });
  }

  playerIdOf(conn) {
    return conn.state?.role === 'player' ? conn.state.playerId : null;
  }

  /** Live connection for a player, optionally ignoring one connection id. */
  connectionForPlayer(playerId, exceptConnId = null) {
    for (const conn of this.getConnections()) {
      if (conn.id === exceptConnId) continue;
      if (conn.state?.role === 'player' && conn.state.playerId === playerId) return conn;
    }
    return null;
  }

  spectatorCount() {
    let n = 0;
    for (const conn of this.getConnections()) if (conn.state?.role === 'spectator') n++;
    return n;
  }

  // ---------- helpers ----------

  sendTo(conn, data) {
    try {
      conn.send(JSON.stringify(data));
    } catch (err) {
      // Socket closed between getConnections() and send(); harmless.
      console.warn('[clubcatan] send failed', err?.message);
    }
  }

  ack(conn, ackId, ok, resultOrError) {
    if (!ackId) return;
    const body = ok
      ? { type: '_ack', ackId, ok: true, result: resultOrError }
      : { type: '_ack', ackId, ok: false, error: resultOrError };
    this.sendTo(conn, body);
  }

  // Object-taking wrapper over PartyServer's string `broadcast(message, exclude)`.
  broadcast(data) {
    super.broadcast(JSON.stringify(data));
  }

  sendToPlayer(playerId, data) {
    const conn = this.connectionForPlayer(playerId);
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

  /** Send every connected socket the view its role is entitled to. */
  broadcastGameState() {
    if (!this.game) return;
    // Spectators get the null-viewer view — all player hands/dev cards
    // appear as counts only, myIndex is -1. Computed once, shared.
    let spectatorView = null;
    for (const conn of this.getConnections()) {
      const role = conn.state?.role;
      if (role === 'player') {
        this.sendTo(conn, { type: 'gameState', state: GameLogic.getPlayerView(this.game, conn.state.playerId) });
      } else if (role === 'spectator') {
        spectatorView ??= { ...GameLogic.getPlayerView(this.game, '__spectator__'), spectator: true };
        this.sendTo(conn, { type: 'gameState', state: spectatorView });
      }
    }
  }

  requirePlayer(conn, ackId) {
    const playerId = this.playerIdOf(conn);
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

  /**
   * The host is whoever created the room. `hostId` is stable; `players[0]`
   * is not, because startGame shuffles seat order. Games persisted before
   * hostId existed fall back to the first seat.
   */
  isHost(game, playerId) {
    return (game.hostId ?? game.players[0]?.id) === playerId;
  }
}

// ============================================================================
// HANDLERS — one per legacy Socket.io event
// ============================================================================

const HANDLERS = {
  // --------------------------------------------------------------------------
  // LOBBY
  // --------------------------------------------------------------------------

  async createGame(conn, { playerName, isExtended = false, enableSpecialBuild = true }, ackId) {
    if (this.game) return this.ack(conn, ackId, false, 'A game already exists in this room');
    const playerId = crypto.randomUUID();
    this.game = GameLogic.createGame(
      this.name,
      { id: playerId, name: playerName },
      isExtended,
      enableSpecialBuild
    );
    this.game.createdAt = Date.now();
    this.bindPlayer(conn, playerId);
    await this.persist();
    this.ack(conn, ackId, true, {
      gameCode: this.name,
      playerId,
      gameState: GameLogic.getPlayerView(this.game, playerId),
    });
  },

  async joinGame(conn, { playerName }, ackId) {
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
    this.bindPlayer(conn, playerId);
    await this.persist();
    this.ack(conn, ackId, true, {
      gameCode: this.name,
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
    // Idempotent for a reloading spectator: re-binding the same socket does not
    // consume another slot or re-announce.
    const alreadySpectating = conn.state?.role === 'spectator';
    if (!alreadySpectating && this.spectatorCount() >= ClubCatanServer.MAX_SPECTATORS) {
      return this.ack(conn, ackId, false, 'Spectator slots are full');
    }
    this.bindSpectator(conn, playerName);
    const view = GameLogic.getPlayerView(game, '__spectator__');
    this.ack(conn, ackId, true, {
      gameCode: this.name,
      gameState: { ...view, spectator: true },
    });
    if (!alreadySpectating) this.broadcast({ type: 'spectatorJoined', name: playerName });
  },

  reconnect(conn, { playerId }, ackId) {
    const game = this.requireGame(conn, ackId);
    if (!game) return;
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return this.ack(conn, ackId, false, 'Player not found in game');
    // A stale socket for the same player (phone woke up, old socket not yet
    // closed) loses its binding so it can no longer act for this player.
    for (const other of this.getConnections()) {
      if (other.id !== conn.id && other.state?.role === 'player' && other.state.playerId === playerId) {
        other.setState(null);
      }
    }
    this.bindPlayer(conn, playerId);
    this.ack(conn, ackId, true, { gameState: GameLogic.getPlayerView(game, playerId) });
    this.broadcast({ type: 'playerReconnected', playerName: player.name });
  },

  // --------------------------------------------------------------------------
  // GAME FLOW
  // --------------------------------------------------------------------------

  async startGame(conn, _payload, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    if (!this.isHost(game, playerId)) return this.ack(conn, ackId, false, 'Only host can start the game');
    const result = GameLogic.startGame(game);
    if (result.success) {
      this.broadcast({ type: 'gameStarted', turnOrder: result.turnOrder });
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  async shuffleBoard(conn, _payload, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    if (!this.isHost(game, playerId)) return this.ack(conn, ackId, false, 'Only host can shuffle the board');
    const result = GameLogic.shuffleBoard(game);
    if (result.success) {
      this.broadcast({ type: 'boardShuffled' });
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  // --------------------------------------------------------------------------
  // TURN ACTIONS
  // --------------------------------------------------------------------------

  async rollDice(conn, _payload, ackId) {
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
          allGains.forEach((gain) => {
            this.sendToPlayer(gain.playerId, {
              type: 'resourcesReceived',
              gains: gain.gains,
              fromRoll: result.roll.total,
            });
          });
        }
      }
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  async discardCards(conn, { resources }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.discardCards(game, playerId, resources);
    if (result.success) {
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  async moveRobber(conn, { hexKey, stealFromPlayerId }, ackId) {
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
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  // --------------------------------------------------------------------------
  // BUILDING
  // --------------------------------------------------------------------------

  async placeSettlement(conn, { vertexKey }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.placeSettlement(game, playerId, vertexKey);
    if (result.success) {
      this.broadcast({ type: 'settlementPlaced', vertexKey, playerId });
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  async placeRoad(conn, { edgeKey }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const priorLongestRoad = game.longestRoadPlayer;
    // Setup vs. main-game placement is derived from game.phase on the server.
    const result = GameLogic.placeRoad(game, playerId, edgeKey);
    if (result.success) {
      this.broadcast({ type: 'roadPlaced', edgeKey, playerId });
      this.maybeBroadcastAchievement('longestRoad', priorLongestRoad, game.longestRoadPlayer);
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  async upgradeToCity(conn, { vertexKey }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.upgradeToCity(game, playerId, vertexKey);
    if (result.success) {
      this.broadcast({ type: 'cityBuilt', vertexKey, playerId });
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  // --------------------------------------------------------------------------
  // DEV CARDS
  // --------------------------------------------------------------------------

  async buyDevCard(conn, _payload, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.buyDevCard(game, playerId);
    if (result.success) {
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  async playDevCard(conn, { cardType, params }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const priorLargestArmy = game.largestArmyPlayer;
    const result = GameLogic.playDevCard(game, playerId, cardType, params);
    if (result.success) {
      this.broadcast({ type: 'devCardPlayed', cardType, playerId });
      this.maybeBroadcastAchievement('largestArmy', priorLargestArmy, game.largestArmyPlayer);
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  async yearOfPlentyPick(conn, { resource }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.yearOfPlentyPick(game, playerId, resource);
    if (result.success) {
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  // --------------------------------------------------------------------------
  // TRADING
  // --------------------------------------------------------------------------

  async bankTrade(conn, { giveResource, giveAmount, getResource }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.bankTrade(game, playerId, giveResource, giveAmount, getResource);
    if (result.success) {
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  async proposeTrade(conn, { offer, request }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.proposeTrade(game, playerId, offer, request);
    if (result.success) {
      this.broadcast({ type: 'tradeProposed', from: playerId, offer, request });
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  async respondToTrade(conn, { accept }, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.respondToTrade(game, playerId, accept);
    if (result.success) {
      this.broadcast({
        type: result.traded ? 'tradeAccepted' : 'tradeDeclined',
        by: playerId,
      });
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  async cancelTrade(conn, _payload, ackId) {
    const playerId = this.requirePlayer(conn, ackId);
    const game = this.requireGame(conn, ackId);
    if (!playerId || !game) return;
    const result = GameLogic.cancelTrade(game, playerId);
    if (result.success) {
      this.broadcast({ type: 'tradeCancelled' });
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  // --------------------------------------------------------------------------
  // TURN MANAGEMENT
  // --------------------------------------------------------------------------
  // (Setup turns advance automatically inside GameLogic.placeRoad; there is no
  // client-callable advanceSetup any more.)

  async endTurn(conn, _payload, ackId) {
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
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  async endSpecialBuild(conn, _payload, ackId) {
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
      await this.persist();
      this.broadcastGameState();
    }
    this.ack(conn, ackId, result.success, result.success ? result : result.error);
  },

  // --------------------------------------------------------------------------
  // QUERIES
  // --------------------------------------------------------------------------

  async getPlayersOnHex(conn, { hexKey }, ackId) {
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

  async chatMessage(conn, { message }, _ackId) {
    const playerId = this.playerIdOf(conn);
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

// ============================================================================
// WORKER ENTRYPOINT
// ============================================================================

/**
 * `/parties/main/<ROOM>` → the room's Durable Object (WebSocket upgrade or HTTP).
 * Everything else → static client assets (wrangler.jsonc `assets`, SPA fallback).
 * `run_worker_first: ["/parties/*"]` in wrangler.jsonc guarantees the socket
 * path reaches this handler instead of the asset router.
 */
export default {
  async fetch(request, env) {
    return (await routePartykitRequest(request, env)) || env.ASSETS.fetch(request);
  },
};
