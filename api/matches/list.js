import { getPlayerMatches, getAvailableMatches } from "./kv-helper.js";
import { MATCH_STATUS } from "./schema.js";

export default async function handler(req, res) {
  console.log(`[list] Request received: ${req.method} ${req.url}`);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    console.log(`[list] OPTIONS request, returning 200`);
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    console.log(`[list] Wrong method: ${req.method}`);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { fid } = req.query;
    console.log(`[list] Query params:`, req.query);

    if (!fid) {
      return res.status(400).json({ error: "fid is required" });
    }

    // Convert fid to number for consistency (FID is always a number)
    const playerFid = typeof fid === 'string' ? parseInt(fid, 10) : fid;
    
    if (isNaN(playerFid)) {
      return res.status(400).json({ error: "fid must be a valid number" });
    }

    console.log(`[list] Getting matches for player FID: ${playerFid}`);
    
    // Get player's own matches
    const playerMatches = await getPlayerMatches(playerFid);
    console.log(`[list] Found ${playerMatches.length} player matches`);
    
    // Get available matches (pending matches that can be accepted)
    const availableMatches = await getAvailableMatches(playerFid);
    console.log(`[list] Found ${availableMatches.length} available matches`);
    
    // Combine and deduplicate (a match might be in both lists)
    const allMatchesMap = new Map();
    [...playerMatches, ...availableMatches].forEach(match => {
      if (match && match.matchId) {
        allMatchesMap.set(match.matchId, match);
      }
    });
    
    const allMatches = Array.from(allMatchesMap.values());
    console.log(`[list] Total unique matches: ${allMatches.length}`);

    // Filter to only pending and active matches
    const activeMatches = allMatches.filter(
      match => match && (match.status === MATCH_STATUS.PENDING || match.status === MATCH_STATUS.ACTIVE)
    );
    console.log(`[list] Filtered to ${activeMatches.length} active/pending matches`);

    // Sort by updatedAt descending (most recent first)
    activeMatches.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt);
      const dateB = new Date(b.updatedAt || b.createdAt);
      return dateB - dateA;
    });

    return res.status(200).json(activeMatches);
  } catch (error) {
    console.error("Error listing player matches:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

