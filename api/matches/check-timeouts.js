import { getPlayerMatches, saveMatch, recordLeaderboardOutcomeForMatch } from "../../lib/matches/kv-helper.js";
import { MATCH_STATUS, TURN_TIMEOUT_MS } from "../../lib/matches/schema.js";

async function checkMatchTimeout(match) {
  if (match.status !== MATCH_STATUS.ACTIVE || match.gameState.finished) {
    return null;
  }

  const lastMoveAt = new Date(match.lastMoveAt);
  const now = new Date();
  const timeSinceLastMove = now - lastMoveAt;

  if (timeSinceLastMove >= match.turnTimeout) {
    // Timeout occurred - player who didn't make a move loses
    // The winner is the opponent (the one whose turn it is NOT)
    // Determine winner: if it's X's turn and timeout, then O wins (and vice versa)
    const currentTurnSymbol = match.gameState.next;
    const winnerSymbol = currentTurnSymbol === "X" ? "O" : "X";
    
    const updatedMatch = await saveMatch({
      ...match,
      status: MATCH_STATUS.FINISHED, // Use FINISHED instead of TIMEOUT for consistency
      gameState: {
        ...match.gameState,
        finished: true,
        winner: winnerSymbol // Opponent wins by timeout
      },
      updatedAt: now.toISOString()
    });
    await recordLeaderboardOutcomeForMatch(updatedMatch);
    return updatedMatch;
  }

  return null;
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
    const fidValue = req.body?.fid ?? null;

    if (fidValue === null || fidValue === undefined) {
      return res.status(400).json({ error: "fid is required" });
    }

    const normalizedFid = typeof fidValue === "string" ? parseInt(fidValue, 10) : fidValue;

    if (Number.isNaN(normalizedFid)) {
      return res.status(400).json({ error: "fid must be a valid number" });
    }

    // Get all matches for this player
    const matches = await getPlayerMatches(normalizedFid, { includeFinished: false });
    const activeMatches = matches.filter(m => m.status === MATCH_STATUS.ACTIVE);

    const timeoutMatches = [];
    
    // Check each active match for timeout
    for (const match of activeMatches) {
      const timeoutMatch = await checkMatchTimeout(match);
      if (timeoutMatch) {
        timeoutMatches.push(timeoutMatch);
      }
    }

    return res.status(200).json({
      checked: activeMatches.length,
      timeouts: timeoutMatches.length,
      matches: timeoutMatches
    });
  } catch (error) {
    console.error("Error checking match timeouts:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

