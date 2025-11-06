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
    lastMoveAt: data.lastMoveAt || now,
    updatedAt: data.updatedAt || now,
    createdAt: data.createdAt || now,
    rules: data.rules || { firstMove: "random" },
    turnTimeout: data.turnTimeout || TURN_TIMEOUT_MS,
    visibility: data.visibility || "public"
  };
}

export function validateMatchSchema(match) {
  if (!match) return { ok: false, error: "Match data is required" };
  if (!match.matchId) return { ok: false, error: "matchId is required" };
  if (!match.player1Fid) return { ok: false, error: "player1Fid is required" };
  
  if (!Object.values(MATCH_STATUS).includes(match.status)) {
    return { ok: false, error: `Invalid status: ${match.status}` };
  }
  
  if (!match.gameState || !Array.isArray(match.gameState.board) || match.gameState.board.length !== 9) {
    return { ok: false, error: "Invalid gameState" };
  }
  
  return { ok: true };
}

