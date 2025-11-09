import { getMatch, saveMatch } from "../../lib/matches/kv-helper.js";
import { MATCH_STATUS, TURN_TIMEOUT_MS } from "../../lib/matches/schema.js";

// Game logic (copied from src/game for serverless functions)
function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function validateMove(state, idx) {
  if (state.finished) return { ok: false, reason: "finished" };
  if (idx < 0 || idx > 8) return { ok: false, reason: "out_of_bounds" };
  if (state.board[idx] !== null) return { ok: false, reason: "occupied" };
  return { ok: true };
}

function checkWinner(board) {
  const LINES = [
    [0,1,2],[3,4,5],[6,7,8], // rows
    [0,3,6],[1,4,7],[2,5,8], // cols
    [0,4,8],[2,4,6]          // diagonals
  ];

  for (const [a,b,c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a,b,c] };
    }
  }
  if (board.every(v => v !== null)) return { winner: null, line: null, draw: true };
  return null;
}

function applyMove(state, idx) {
  const result = validateMove(state, idx);
  if (!result.ok) return { ok: false, reason: result.reason, state };

  const nextState = cloneState(state);
  nextState.board[idx] = state.next;
  nextState.turn = state.turn + 1;

  const outcome = checkWinner(nextState.board);
  if (outcome?.winner) {
    nextState.winner = outcome.winner;
    nextState.winLine = outcome.line;
    nextState.finished = true;
  } else if (outcome?.draw) {
    nextState.finished = true;
  } else {
    nextState.next = state.next === "X" ? "O" : "X";
  }
  return { ok: true, state: nextState };
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { matchId, playerFid, cellIndex } = req.body;

    if (!matchId) {
      return res.status(400).json({ error: "matchId is required" });
    }

    if (playerFid === undefined || playerFid === null) {
      return res.status(400).json({ error: "playerFid is required" });
    }

    const normalizedPlayerFid = typeof playerFid === "string" ? parseInt(playerFid, 10) : playerFid;

    if (Number.isNaN(normalizedPlayerFid)) {
      return res.status(400).json({ error: "playerFid must be a valid number" });
    }

    if (cellIndex === undefined || cellIndex === null || cellIndex < 0 || cellIndex > 8) {
      return res.status(400).json({ error: "cellIndex must be between 0 and 8" });
    }

    const match = await getMatch(matchId);

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    if (match.status !== MATCH_STATUS.ACTIVE) {
      return res.status(400).json({ error: `Match is not active (status: ${match.status})` });
    }

    if (match.gameState.finished) {
      return res.status(400).json({ error: "Match is already finished" });
    }

    // Determine which player is making the move
    const normalizedPlayer1Fid = typeof match.player1Fid === "string" ? parseInt(match.player1Fid, 10) : match.player1Fid;
    const normalizedPlayer2Fid = typeof match.player2Fid === "string" ? parseInt(match.player2Fid, 10) : match.player2Fid;
    const isPlayer1 = normalizedPlayer1Fid === normalizedPlayerFid;
    const isPlayer2 = normalizedPlayer2Fid === normalizedPlayerFid;

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ error: "Player is not part of this match" });
    }

    const playerSymbol = isPlayer1 ? match.player1Symbol : match.player2Symbol;

    // Check if it's the player's turn
    if (match.gameState.next !== playerSymbol) {
      return res.status(400).json({ error: "Not your turn" });
    }

    // Check timeout
    const lastMoveAt = new Date(match.lastMoveAt);
    const now = new Date();
    const timeSinceLastMove = now - lastMoveAt;

    if (timeSinceLastMove >= match.turnTimeout) {
      // Timeout occurred - opponent wins
      const timeoutWinner = match.gameState.next === "X" ? "O" : "X";
      const updatedMatch = await saveMatch({
        ...match,
        status: MATCH_STATUS.FINISHED,
        gameState: {
          ...match.gameState,
          finished: true,
          winner: timeoutWinner
        },
        updatedAt: now.toISOString()
      });
      return res.status(400).json({ 
        error: "Turn timeout - opponent wins",
        match: updatedMatch
      });
    }

    // Apply the move
    const moveResult = applyMove(match.gameState, cellIndex);

    if (!moveResult.ok) {
      return res.status(400).json({ 
        error: `Invalid move: ${moveResult.reason}`,
        reason: moveResult.reason
      });
    }

    // Update match state
    const updatedMatch = await saveMatch({
      ...match,
      gameState: moveResult.state,
      lastMoveAt: now.toISOString(),
      status: moveResult.state.finished ? MATCH_STATUS.FINISHED : MATCH_STATUS.ACTIVE,
      updatedAt: now.toISOString()
    });

    return res.status(200).json(updatedMatch);
  } catch (error) {
    console.error("Error making move:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

