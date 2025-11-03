import { saveMatch } from "./kv-helper.js";
import { MATCH_STATUS } from "./schema.js";

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
    const { matchId, player1Fid, rules } = req.body;

    if (!matchId) {
      return res.status(400).json({ error: "matchId is required" });
    }

    if (!player1Fid) {
      return res.status(400).json({ error: "player1Fid is required" });
    }

    // Normalize FID to number for consistency
    const normalizedPlayer1Fid = typeof player1Fid === 'string' ? parseInt(player1Fid, 10) : player1Fid;
    
    if (isNaN(normalizedPlayer1Fid)) {
      return res.status(400).json({ error: "player1Fid must be a valid number" });
    }

    // Check if match already exists
    const { getMatch } = await import("./kv-helper.js");
    const existingMatch = await getMatch(matchId);
    if (existingMatch) {
      return res.status(409).json({ error: "Match already exists" });
    }

    const match = await saveMatch({
      matchId,
      player1Fid: normalizedPlayer1Fid,
      player2Fid: null,
      status: MATCH_STATUS.PENDING,
      rules: rules || { firstMove: "random" },
      gameState: {
        board: Array(9).fill(null),
        next: "X",
        turn: 0,
        winner: null,
        finished: false
      },
      player1Symbol: null,
      player2Symbol: null,
      lastMoveAt: new Date().toISOString()
    });

    return res.status(201).json(match);
  } catch (error) {
    console.error("Error creating match:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

