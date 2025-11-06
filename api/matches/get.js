import { getMatch, saveMatch } from "../../lib/matches/kv-helper.js";
import { MATCH_STATUS, TURN_TIMEOUT_MS } from "../../lib/matches/schema.js";

function checkMatchTimeout(match) {
  if (match.status !== MATCH_STATUS.ACTIVE || match.gameState.finished) {
    return match;
  }

  const lastMoveAt = new Date(match.lastMoveAt);
  const now = new Date();
  const timeSinceLastMove = now - lastMoveAt;

  if (timeSinceLastMove >= match.turnTimeout) {
    // Timeout occurred
    const updatedMatch = {
      ...match,
      status: MATCH_STATUS.TIMEOUT,
      gameState: {
        ...match.gameState,
        finished: true,
        winner: match.gameState.next === "X" ? "O" : "X" // Opponent wins by timeout
      },
      updatedAt: new Date().toISOString()
    };
    return updatedMatch;
  }

  return match;
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

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { matchId } = req.query;

    if (!matchId) {
      return res.status(400).json({ error: "matchId is required" });
    }

    let match = await getMatch(matchId);

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    // Check for timeout
    match = checkMatchTimeout(match);

    // Save updated match if timeout occurred
    if (match.status === MATCH_STATUS.TIMEOUT) {
    match = await saveMatch(match);
    }

    return res.status(200).json(match);
  } catch (error) {
    console.error("Error getting match:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

