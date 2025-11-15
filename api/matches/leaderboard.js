import { getLeaderboardStats } from "../../lib/matches/kv-helper.js";

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log(`[leaderboard] Getting leaderboard data`);
    const leaderboard = await getLeaderboardStats();
    console.log(`[leaderboard] Found ${leaderboard.length} players with stats`);
    return res.status(200).json({ leaderboard });
  } catch (error) {
    console.error("Error getting leaderboard:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

