import { createMatchSchema, validateMatchSchema } from "./schema.js";

const MATCH_PREFIX = "match:";
const PLAYER_MATCHES_PREFIX = "player_matches:";

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
