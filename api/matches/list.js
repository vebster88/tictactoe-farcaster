import { getPlayerMatches } from "./kv-helper.js";
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

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { fid } = req.query;

    if (!fid) {
      return res.status(400).json({ error: "fid is required" });
    }

    // Convert fid to number for consistency (FID is always a number)
    const playerFid = typeof fid === 'string' ? parseInt(fid, 10) : fid;
    
    if (isNaN(playerFid)) {
      return res.status(400).json({ error: "fid must be a valid number" });
    }

    console.log(`[list] Getting matches for player FID: ${playerFid}`);
    const allMatches = await getPlayerMatches(playerFid);
    console.log(`[list] Found ${allMatches.length} total matches for player ${playerFid}`);

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

