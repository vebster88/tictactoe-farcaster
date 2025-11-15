import { getMatch, saveMatch, getPlayerMatches } from "../../lib/matches/kv-helper.js";
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

    // Normalize FID to number for consistency
    const normalizedPlayer2Fid = typeof player2Fid === 'string' ? parseInt(player2Fid, 10) : player2Fid;
    
    if (isNaN(normalizedPlayer2Fid)) {
      return res.status(400).json({ error: "player2Fid must be a valid number" });
    }

    if (match.player1Fid === normalizedPlayer2Fid) {
      return res.status(400).json({ error: "Cannot accept your own match" });
    }

    // Check if player already has 2 active matches
    const playerMatches = await getPlayerMatches(normalizedPlayer2Fid, { includeFinished: false });
    const activeMatches = playerMatches.filter(m => m.status === MATCH_STATUS.ACTIVE);
    if (activeMatches.length >= 2) {
      return res.status(400).json({ error: "You can only have 2 active matches at a time" });
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
      player2Fid: normalizedPlayer2Fid,
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

    // TODO: Send push notification to player1 (match creator) that their match was accepted
    // This requires:
    // 1. Webhook endpoint configured in farcaster.json
    // 2. Notification tokens stored in database (from webhook events)
    // 3. API call to Farcaster notification URL
    // Example implementation would be:
    // await sendNotification(player1Fid, {
    //   title: "Match Accepted!",
    //   body: "Your match has been accepted. Start playing!",
    //   targetUrl: `${process.env.NEXT_PUBLIC_APP_URL}?matchId=${matchId}`
    // });
    
    console.log(`[accept] Match ${matchId} accepted by player ${normalizedPlayer2Fid}, notification should be sent to player ${match.player1Fid}`);

    return res.status(200).json(updatedMatch);
  } catch (error) {
    console.error("Error accepting match:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

