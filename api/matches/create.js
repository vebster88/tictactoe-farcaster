import { saveMatch, getMatch, getPlayerMatches, invalidateAllPlayerActiveMatchesCache } from "../../lib/matches/kv-helper.js";
import { MATCH_STATUS } from "../../lib/matches/schema.js";

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
    const existingMatch = await getMatch(matchId);
    if (existingMatch) {
      return res.status(409).json({ error: "Match already exists" });
    }

    // ВАЖНО: Инвалидируем все кэши перед проверкой лимита, чтобы получить актуальные данные
    // Это предотвращает race condition при одновременных запросах
    invalidateAllPlayerActiveMatchesCache(normalizedPlayer1Fid);

    // Check if player already has 2 active or pending matches (total limit is 2)
    const playerMatches = await getPlayerMatches(normalizedPlayer1Fid, { includeFinished: false });
    const activeOrPendingMatches = playerMatches.filter(m => 
      m.status === MATCH_STATUS.ACTIVE || m.status === MATCH_STATUS.PENDING
    );
    if (activeOrPendingMatches.length >= 2) {
      return res.status(400).json({ error: "You can only have 2 active matches at a time" });
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

