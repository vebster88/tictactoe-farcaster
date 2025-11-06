// Match data schema for PvP games
export const MATCH_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  FINISHED: "finished",
  TIMEOUT: "timeout"
};

export const TURN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function createMatchSchema(data) {
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.0.0",
    matchId: data.matchId,
    player1Fid: data.player1Fid,
    player2Fid: data.player2Fid || null,
    status: data.status || MATCH_STATUS.PENDING,
    gameState: data.gameState || {
      board: Array(9).fill(null),
      next: "X",
      turn: 0,
      winner: null,
      finished: false
    },
    player1Symbol: data.player1Symbol || null,
    player2Symbol: data.player2Symbol || null,
    rules: data.rules || { firstMove: "random" },
    lastMoveAt: data.lastMoveAt || now,
    turnTimeout: data.turnTimeout || TURN_TIMEOUT_MS,
    createdAt: data.createdAt || now,
    updatedAt: now
  };
}

export function validateMatchSchema(match) {
  if (!match.matchId) return { ok: false, error: "matchId is required" };
  if (!match.player1Fid) return { ok: false, error: "player1Fid is required" };
  if (!match.gameState) return { ok: false, error: "gameState is required" };
  if (!match.status) return { ok: false, error: "status is required" };
  return { ok: true };
}

