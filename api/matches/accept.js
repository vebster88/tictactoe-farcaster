import { getMatch, saveMatch } from "./kv-helper.js";
import { MATCH_STATUS, TURN_TIMEOUT_MS } from "./schema.js";

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
    const { matchId, player2Fid } = req.body;

    if (!matchId) {
      return res.status(400).json({ error: "matchId is required" });
    }

    if (!player2Fid) {
      return res.status(400).json({ error: "player2Fid is required" });
    }

    const match = await getMatch(matchId);

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    if (match.status !== MATCH_STATUS.PENDING) {
      return res.status(400).json({ error: `Match is not pending (status: ${match.status})` });
    }

    if (match.player1Fid === player2Fid) {
      return res.status(400).json({ error: "Cannot accept your own match" });
    }

    // Determine symbols based on rules
    let player1Symbol, player2Symbol;
    if (match.rules?.firstMove === "X") {
      player1Symbol = "X";
      player2Symbol = "O";
    } else if (match.rules?.firstMove === "O") {
      player1Symbol = "O";
      player2Symbol = "X";
    } else {
      // Random: player1 gets X
      player1Symbol = "X";
      player2Symbol = "O";
    }

    const now = new Date().toISOString();
    const updatedMatch = await saveMatch({
      ...match,
      player2Fid,
      status: MATCH_STATUS.ACTIVE,
      player1Symbol,
      player2Symbol,
      gameState: {
        ...match.gameState,
        next: player1Symbol // First player starts
      },
      lastMoveAt: now,
      updatedAt: now
    });

    return res.status(200).json(updatedMatch);
  } catch (error) {
    console.error("Error accepting match:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

