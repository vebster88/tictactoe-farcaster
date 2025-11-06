import { createMatchSchema, validateMatchSchema, MATCH_STATUS } from "./schema.js";

const MATCH_PREFIX = "match:";
const PLAYER_MATCHES_PREFIX = "player_matches:";
const PENDING_MATCHES_KEY = `${MATCH_PREFIX}pending`;

// Check if KV is available
function isKVAvailable() {
  try {
    // @vercel/kv automatically uses environment variables
    // If they're not set, it will throw an error
    return !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
  } catch {
    return false;
  }
}

// In-memory store for fallback mode
const memoryStore = new Map();
const playerMatchesStore = new Map();

let kv = null;
let useMemoryStore = false;
let kvInitialized = false;

// Initialize KV or fallback to memory (lazy initialization)
async function initKV() {
  if (kvInitialized) return;
  
  try {
    if (isKVAvailable()) {
      const kvModule = await import("@vercel/kv");
      kv = kvModule.kv;
      kvInitialized = true;
    } else {
      useMemoryStore = true;
      kvInitialized = true;
    }
  } catch (error) {
    useMemoryStore = true;
    kvInitialized = true;
  }
}

export async function getMatch(matchId) {
  await initKV();
  
  try {
    const key = `${MATCH_PREFIX}${matchId}`;
    
    if (useMemoryStore) {
      const match = memoryStore.get(key);
      return match || null;
    }
    
    const match = await kv.get(key);
    return match;
  } catch (error) {
    // Fallback to memory store if KV fails
    if (!useMemoryStore) {
      useMemoryStore = true;
      const key = `${MATCH_PREFIX}${matchId}`;
      return memoryStore.get(key) || null;
    }
    throw new Error(`Failed to get match: ${error.message}`);
  }
}

export async function saveMatch(match) {
  await initKV();
  
  try {
    const validation = validateMatchSchema(match);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    const key = `${MATCH_PREFIX}${match.matchId}`;
    const matchData = createMatchSchema({
      ...match,
      updatedAt: new Date().toISOString()
    });

    if (useMemoryStore) {
      memoryStore.set(key, matchData);
      console.log(`[saveMatch] Saved match ${match.matchId} to memoryStore (status: ${matchData.status}, player1Fid: ${matchData.player1Fid}, player2Fid: ${matchData.player2Fid})`);
      
      // Also index by players (normalize FID to number)
      if (match.player1Fid) {
        const normalizedFid1 = typeof match.player1Fid === 'string' ? parseInt(match.player1Fid, 10) : match.player1Fid;
        if (!isNaN(normalizedFid1)) {
          if (!playerMatchesStore.has(normalizedFid1)) {
            playerMatchesStore.set(normalizedFid1, new Set());
          }
          playerMatchesStore.get(normalizedFid1).add(match.matchId);
        }
      }
      if (match.player2Fid) {
        const normalizedFid2 = typeof match.player2Fid === 'string' ? parseInt(match.player2Fid, 10) : match.player2Fid;
        if (!isNaN(normalizedFid2)) {
          if (!playerMatchesStore.has(normalizedFid2)) {
            playerMatchesStore.set(normalizedFid2, new Set());
          }
          playerMatchesStore.get(normalizedFid2).add(match.matchId);
        }
      }
      
      // Index pending matches (for finding available matches)
      if (matchData.status === MATCH_STATUS.PENDING && !matchData.player2Fid) {
        if (!playerMatchesStore.has(PENDING_MATCHES_KEY)) {
          playerMatchesStore.set(PENDING_MATCHES_KEY, new Set());
          console.log(`[saveMatch] Created pending matches index`);
        }
        playerMatchesStore.get(PENDING_MATCHES_KEY).add(match.matchId);
        console.log(`[saveMatch] Added match ${match.matchId} to pending index (player1Fid: ${matchData.player1Fid})`);
      } else {
        // Remove from pending index if no longer pending
        const pendingSet = playerMatchesStore.get(PENDING_MATCHES_KEY);
        if (pendingSet) {
          pendingSet.delete(match.matchId);
          console.log(`[saveMatch] Removed match ${match.matchId} from pending index (status: ${matchData.status}, player2Fid: ${matchData.player2Fid})`);
        }
      }
      
      return matchData;
    }

    await kv.set(key, matchData);

    // Also index by players (normalize FID to number)
    if (match.player1Fid) {
      const normalizedFid1 = typeof match.player1Fid === 'string' ? parseInt(match.player1Fid, 10) : match.player1Fid;
      if (!isNaN(normalizedFid1)) {
        await kv.sadd(`${PLAYER_MATCHES_PREFIX}${normalizedFid1}`, match.matchId);
      }
    }
    if (match.player2Fid) {
      const normalizedFid2 = typeof match.player2Fid === 'string' ? parseInt(match.player2Fid, 10) : match.player2Fid;
      if (!isNaN(normalizedFid2)) {
        await kv.sadd(`${PLAYER_MATCHES_PREFIX}${normalizedFid2}`, match.matchId);
      }
    }

    // Index pending matches (for finding available matches)
    if (matchData.status === MATCH_STATUS.PENDING && !matchData.player2Fid) {
      await kv.sadd(PENDING_MATCHES_KEY, match.matchId);
    } else {
      // Remove from pending index if no longer pending
      await kv.srem(PENDING_MATCHES_KEY, match.matchId);
    }

    return matchData;
  } catch (error) {
    // Fallback to memory store if KV fails
    if (!useMemoryStore) {
      useMemoryStore = true;
      const key = `${MATCH_PREFIX}${match.matchId}`;
      const matchData = createMatchSchema({
        ...match,
        updatedAt: new Date().toISOString()
      });
      memoryStore.set(key, matchData);
      
      // Also index by players (normalize FID to number)
      if (match.player1Fid) {
        const normalizedFid1 = typeof match.player1Fid === 'string' ? parseInt(match.player1Fid, 10) : match.player1Fid;
        if (!isNaN(normalizedFid1)) {
          if (!playerMatchesStore.has(normalizedFid1)) {
            playerMatchesStore.set(normalizedFid1, new Set());
          }
          playerMatchesStore.get(normalizedFid1).add(match.matchId);
        }
      }
      if (match.player2Fid) {
        const normalizedFid2 = typeof match.player2Fid === 'string' ? parseInt(match.player2Fid, 10) : match.player2Fid;
        if (!isNaN(normalizedFid2)) {
          if (!playerMatchesStore.has(normalizedFid2)) {
            playerMatchesStore.set(normalizedFid2, new Set());
          }
          playerMatchesStore.get(normalizedFid2).add(match.matchId);
        }
      }
      
      // Index pending matches (for finding available matches)
      if (matchData.status === MATCH_STATUS.PENDING && !matchData.player2Fid) {
        if (!playerMatchesStore.has(PENDING_MATCHES_KEY)) {
          playerMatchesStore.set(PENDING_MATCHES_KEY, new Set());
        }
        playerMatchesStore.get(PENDING_MATCHES_KEY).add(match.matchId);
      } else {
        // Remove from pending index if no longer pending
        const pendingSet = playerMatchesStore.get(PENDING_MATCHES_KEY);
        if (pendingSet) {
          pendingSet.delete(match.matchId);
        }
      }
      
      return matchData;
    }
    throw new Error(`Failed to save match: ${error.message}`);
  }
}

export async function deleteMatch(matchId) {
  await initKV();
  
  try {
    const key = `${MATCH_PREFIX}${matchId}`;
    const match = await getMatch(matchId);
    
    if (!match) {
      return { ok: true };
    }
    
    if (useMemoryStore) {
      memoryStore.delete(key);
      
      // Remove from player indexes
      if (match.player1Fid) {
        const playerMatches = playerMatchesStore.get(match.player1Fid);
        if (playerMatches) {
          playerMatches.delete(matchId);
          if (playerMatches.size === 0) {
            playerMatchesStore.delete(match.player1Fid);
          }
        }
      }
      if (match.player2Fid) {
        const playerMatches = playerMatchesStore.get(match.player2Fid);
        if (playerMatches) {
          playerMatches.delete(matchId);
          if (playerMatches.size === 0) {
            playerMatchesStore.delete(match.player2Fid);
          }
        }
      }
      
      return { ok: true };
    }

    await kv.del(key);
    
    // Remove from player indexes
    if (match.player1Fid) {
      await kv.srem(`${PLAYER_MATCHES_PREFIX}${match.player1Fid}`, matchId);
    }
    if (match.player2Fid) {
      await kv.srem(`${PLAYER_MATCHES_PREFIX}${match.player2Fid}`, matchId);
    }

    return { ok: true };
  } catch (error) {
    throw new Error(`Failed to delete match: ${error.message}`);
  }
}

export async function getPlayerMatches(fid) {
  await initKV();
  
  try {
    // Normalize FID to number for consistency (FID is always a number)
    const normalizedFid = typeof fid === 'string' ? parseInt(fid, 10) : fid;
    
    if (isNaN(normalizedFid)) {
      console.warn(`[getPlayerMatches] Invalid FID: ${fid}`);
      return [];
    }
    
    let matchIds = [];
    
    if (useMemoryStore) {
      // Try both string and number keys for backwards compatibility
      const playerMatches = playerMatchesStore.get(normalizedFid) || playerMatchesStore.get(String(normalizedFid)) || playerMatchesStore.get(fid);
      if (!playerMatches) {
        return [];
      }
      matchIds = Array.from(playerMatches);
    } else {
      // Try both normalized and original FID for backwards compatibility
      matchIds = await kv.smembers(`${PLAYER_MATCHES_PREFIX}${normalizedFid}`);
      if (!matchIds || matchIds.length === 0) {
        matchIds = await kv.smembers(`${PLAYER_MATCHES_PREFIX}${fid}`) || [];
      }
    }
    
    if (!matchIds || matchIds.length === 0) {
      return [];
    }

    const matches = await Promise.all(
      matchIds.map(async (matchId) => {
        try {
          return await getMatch(matchId);
        } catch (error) {
          return null;
        }
      })
    );

    return matches.filter(match => match !== null);
  } catch (error) {
    // Fallback to memory store if KV fails
    if (!useMemoryStore) {
      useMemoryStore = true;
      // Try both normalized and original FID for backwards compatibility
      const normalizedFid = typeof fid === 'string' ? parseInt(fid, 10) : fid;
      const playerMatches = playerMatchesStore.get(normalizedFid) || 
                           playerMatchesStore.get(String(normalizedFid)) || 
                           playerMatchesStore.get(fid);
      if (!playerMatches) {
        return [];
      }
      const matchIds = Array.from(playerMatches);
      const matches = matchIds.map(matchId => memoryStore.get(`${MATCH_PREFIX}${matchId}`)).filter(Boolean);
      return matches;
    }
    throw new Error(`Failed to get player matches: ${error.message}`);
  }
}

// Get all finished matches (for leaderboard)
export async function getAllFinishedMatches() {
  await initKV();
  
  try {
    const allMatches = [];
    
    if (useMemoryStore) {
      // Scan all matches in memory store
      for (const [key, match] of memoryStore.entries()) {
        if (key.startsWith(MATCH_PREFIX)) {
          // Проверяем что матч завершен и имеет обоих игроков (PVP)
          if (match.status === MATCH_STATUS.FINISHED && 
              match.gameState?.finished && 
              match.player1Fid && 
              match.player2Fid) {
            allMatches.push(match);
          }
        }
      }
      console.log(`[getAllFinishedMatches] Found ${allMatches.length} finished PVP matches in memory store`);
    } else {
      // For KV store, we need to scan all matches
      // This is not efficient but works for now
      try {
        // Get all player match keys
        const playerKeys = await kv.keys(`${PLAYER_MATCHES_PREFIX}*`);
        const matchIdsSet = new Set();
        
        // Collect all unique match IDs
        for (const playerKey of playerKeys) {
          const matchIds = await kv.smembers(playerKey) || [];
          matchIds.forEach(id => matchIdsSet.add(id));
        }
        
        // Get all matches and filter finished ones
        for (const matchId of matchIdsSet) {
          const match = await getMatch(matchId);
          if (match && 
              match.status === MATCH_STATUS.FINISHED && 
              match.gameState?.finished && 
              match.player1Fid && 
              match.player2Fid) {
            allMatches.push(match);
          }
        }
        
        console.log(`[getAllFinishedMatches] Found ${allMatches.length} finished PVP matches in KV store`);
      } catch (error) {
        console.warn('[getAllFinishedMatches] Error scanning KV store:', error);
      }
    }
    
    return allMatches;
  } catch (error) {
    console.error('[getAllFinishedMatches] Error:', error);
    return [];
  }
}

// Get all pending matches available for acceptance (where player2Fid is null)
export async function getAvailableMatches(excludeFid = null) {
  await initKV();
  
  try {
    // Normalize excludeFid to number for comparison
    const normalizedExcludeFid = excludeFid !== null ? (typeof excludeFid === 'string' ? parseInt(excludeFid, 10) : excludeFid) : null;
    
    console.log(`[getAvailableMatches] Looking for available matches, excluding FID: ${normalizedExcludeFid}`);
    
    const allMatches = [];
    
    if (useMemoryStore) {
      // Use pending matches index for faster lookup
      const pendingSet = playerMatchesStore.get(PENDING_MATCHES_KEY);
      if (pendingSet && pendingSet.size > 0) {
        console.log(`[getAvailableMatches] Using pending index, found ${pendingSet.size} pending match IDs`);
        
        for (const matchId of pendingSet) {

