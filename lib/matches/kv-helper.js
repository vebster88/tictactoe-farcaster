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

    const normalizeFid = (fid) => {
      if (fid === null || fid === undefined) return null;
      const normalized = typeof fid === 'string' ? parseInt(fid, 10) : fid;
      return Number.isNaN(normalized) ? null : normalized;
    };
    
    if (useMemoryStore) {
      memoryStore.delete(key);
      
      const removeFromPlayerIndex = (fid) => {
        const normalized = normalizeFid(fid);
        const candidateKeys = new Set();
        if (normalized !== null) {
          candidateKeys.add(normalized);
          candidateKeys.add(String(normalized));
        }
        if (fid !== null && fid !== undefined) {
          candidateKeys.add(fid);
        }

        candidateKeys.forEach((candidateKey) => {
          if (playerMatchesStore.has(candidateKey)) {
            const playerMatches = playerMatchesStore.get(candidateKey);
            playerMatches.delete(matchId);
            if (playerMatches.size === 0) {
              playerMatchesStore.delete(candidateKey);
            }
          }
        });
      };

      // Remove from player indexes
      removeFromPlayerIndex(match.player1Fid);
      removeFromPlayerIndex(match.player2Fid);

      // Remove from pending index if present
      if (playerMatchesStore.has(PENDING_MATCHES_KEY)) {
        const pendingSet = playerMatchesStore.get(PENDING_MATCHES_KEY);
        pendingSet.delete(matchId);
        if (pendingSet.size === 0) {
          playerMatchesStore.delete(PENDING_MATCHES_KEY);
        }
      }
      
      return { ok: true };
    }

    await kv.del(key);
    
    const removeFromPlayerIndexKV = async (fid) => {
      const normalized = normalizeFid(fid);
      const candidateKeys = new Set();
      if (normalized !== null) {
        candidateKeys.add(`${PLAYER_MATCHES_PREFIX}${normalized}`);
      }
      if (fid !== null && fid !== undefined) {
        candidateKeys.add(`${PLAYER_MATCHES_PREFIX}${fid}`);
      }

      for (const candidateKey of candidateKeys) {
        await kv.srem(candidateKey, matchId);
      }
    };

    // Remove from player indexes
    await removeFromPlayerIndexKV(match.player1Fid);
    await removeFromPlayerIndexKV(match.player2Fid);

    // Remove from pending matches index
    await kv.srem(PENDING_MATCHES_KEY, matchId);

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
          // -�-�-+-�-�-�-�-�-+ -�-�-+ -+-�-�-� -+-�-�-�-�-�-�-+ -+ -+-+-�-�-� -+-�-+-+-� -+-�-�-+-�-+-� (PVP)
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
          const key = `${MATCH_PREFIX}${matchId}`;
          const match = memoryStore.get(key);
          
          if (match) {
            // Normalize FIDs for comparison
            const normalizedPlayer1Fid = match.player1Fid ? (typeof match.player1Fid === 'string' ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
            
            // Double-check: match should be pending and have no player2
            if (match.status === MATCH_STATUS.PENDING && !match.player2Fid) {
              // Exclude matches where excludeFid is player1 (user can't accept their own matches)
              if (normalizedExcludeFid === null || normalizedPlayer1Fid !== normalizedExcludeFid) {
                allMatches.push(match);
                console.log(`[getAvailableMatches] Found available match: ${match.matchId}, player1Fid: ${normalizedPlayer1Fid}`);
              } else {
                console.log(`[getAvailableMatches] Excluding own match: ${match.matchId}, player1Fid: ${normalizedPlayer1Fid}`);
              }
            } else {
              console.log(`[getAvailableMatches] Match ${matchId} in pending index but status is ${match.status}, player2Fid: ${match.player2Fid}`);
            }
          } else {
            console.warn(`[getAvailableMatches] Match ${matchId} in pending index but not found in memoryStore`);
          }
        }
        
        console.log(`[getAvailableMatches] Found ${allMatches.length} available matches from index`);
      } else {
        // Fallback: scan all matches if index is empty
        console.log(`[getAvailableMatches] Pending index is empty, scanning all matches`);
        let totalScanned = 0;
        let pendingFound = 0;
        
        for (const [key, match] of memoryStore.entries()) {
          if (key.startsWith(MATCH_PREFIX)) {
            totalScanned++;
            
            // Normalize FIDs for comparison
            const normalizedPlayer1Fid = match.player1Fid ? (typeof match.player1Fid === 'string' ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
            
            if (match.status === MATCH_STATUS.PENDING && !match.player2Fid) {
              pendingFound++;
              
              // Exclude matches where excludeFid is player1 (user can't accept their own matches)
              if (normalizedExcludeFid === null || normalizedPlayer1Fid !== normalizedExcludeFid) {
                allMatches.push(match);
                console.log(`[getAvailableMatches] Found available match (scan): ${match.matchId}, player1Fid: ${normalizedPlayer1Fid}`);
              }
            }
          }
        }
        
        console.log(`[getAvailableMatches] Scanned ${totalScanned} matches, found ${pendingFound} pending, ${allMatches.length} available`);
      }
    } else {
      // For KV store, we need to scan all matches
      // This is less efficient, but necessary to find pending matches
      // We'll use a pattern to get all match keys
      // Note: This requires KV to support pattern matching or we need to maintain a separate index
      // For now, we'll use a workaround: store pending matches in a separate set
      try {
        // Get all match IDs from pending matches index
        const pendingMatchIds = await kv.smembers(PENDING_MATCHES_KEY) || [];
        console.log(`[getAvailableMatches] Found ${pendingMatchIds.length} pending match IDs in index`);
        
        for (const matchId of pendingMatchIds) {
          const match = await getMatch(matchId);
          if (match) {
            // Normalize FIDs for comparison
            const normalizedPlayer1Fid = match.player1Fid ? (typeof match.player1Fid === 'string' ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
            
            if (match.status === MATCH_STATUS.PENDING && 
                !match.player2Fid && 
                (normalizedExcludeFid === null || normalizedPlayer1Fid !== normalizedExcludeFid)) {
              allMatches.push(match);
              console.log(`[getAvailableMatches] Found available match: ${match.matchId}, player1Fid: ${normalizedPlayer1Fid}`);
            }
          }
        }
      } catch (error) {
        // If pending index doesn't exist, return empty array
        console.warn('[getAvailableMatches] Could not use pending index:', error);
      }
    }
    
    console.log(`[getAvailableMatches] Returning ${allMatches.length} available matches`);
    return allMatches;
  } catch (error) {
    console.error('[getAvailableMatches] Error:', error);
    return [];
  }
}
