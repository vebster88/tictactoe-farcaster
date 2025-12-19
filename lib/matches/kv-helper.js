import { createMatchSchema, validateMatchSchema, MATCH_STATUS } from "./schema.js";
import { normalizeFidToNumber, getFidCacheKeys } from "../../src/utils/normalize.js";

const MATCH_PREFIX = "match:";
const PLAYER_MATCHES_PREFIX = "player_matches:";
const PLAYER_ACTIVE_MATCHES_PREFIX = "player_active_matches:";
const PLAYER_ACTIVE_MATCHES_DATA_PREFIX = "player_active_matches_data:";
const PENDING_MATCHES_KEY = `${MATCH_PREFIX}pending`;

const MATCH_CACHE_TTL_MS = 18000; // Увеличено для снижения KV запросов
const PLAYER_INDEX_CACHE_TTL_MS = 5000;
const PLAYER_ACTIVE_INDEX_CACHE_TTL_MS = 45000;
const ACTIVE_MATCHES_DATA_CACHE_TTL_MS = 20000; // Увеличено для снижения KV запросов
const PENDING_CACHE_TTL_MS = 25000; // Увеличено для снижения KV запросов
const PLAYER_MATCHES_RESULT_CACHE_TTL_MS = 3500;
const AVAILABLE_MATCHES_CACHE_TTL_MS = 20000; // Увеличено для снижения KV запросов

const matchCache = new Map();
const playerMatchesIndexCache = new Map();
const playerActiveMatchesIndexCache = new Map();
const playerActiveMatchesDataCache = new Map();
let pendingMatchesCache = {
  ids: null,
  timestamp: 0
};
const playerMatchesResultCache = new Map();
const availableMatchesCache = new Map();
const leaderboardStatsStore = new Map();
const LEADERBOARD_STATS_KEY = "leaderboard_stats";

const nowMs = () => Date.now();

function getCachedValue(map, key, ttl) {
  if (!key || !map.has(key)) return { hit: false, value: null };
  const entry = map.get(key);
  if (!entry) return { hit: false, value: null };
  if (nowMs() - entry.timestamp > ttl) {
    map.delete(key);
    return { hit: false, value: null };
  }
  return { hit: true, value: entry.value };
}

function setCachedValue(map, key, value) {
  if (!key) return;
  map.set(key, {
    value,
    timestamp: nowMs()
  });
}

function invalidateCacheKey(map, key) {
  if (!key) return;
  map.delete(key);
}

// Use imported utility functions instead of local duplicates
const normalizeFidCacheKeys = getFidCacheKeys;
const normalizeFidValue = normalizeFidToNumber;

function shouldIndexMatchAsActive(match) {
  if (!match) return false;
  // Исключаем завершенные матчи (даже если статус ACTIVE)
  if (match.gameState?.finished || match.status === MATCH_STATUS.FINISHED) {
    return false;
  }
  return match.status === MATCH_STATUS.ACTIVE || match.status === MATCH_STATUS.PENDING;
}

function buildResultCacheKey(key, includeFinished) {
  return `${includeFinished ? "all" : "active"}:${key}`;
}

function invalidatePlayerMatchIndexForFid(fid) {
  const keys = normalizeFidCacheKeys(fid);
  keys.forEach((key) => invalidateCacheKey(playerMatchesIndexCache, `${PLAYER_MATCHES_PREFIX}${key}`));
}

function invalidatePlayerActiveMatchIndexForFid(fid) {
  const keys = normalizeFidCacheKeys(fid);
  keys.forEach((key) => invalidateCacheKey(playerActiveMatchesIndexCache, `${PLAYER_ACTIVE_MATCHES_PREFIX}${key}`));
}

function invalidatePlayerMatchIndexesForMatch(match) {
  if (!match) return;
  invalidatePlayerMatchIndexForFid(match.player1Fid);
  invalidatePlayerMatchIndexForFid(match.player2Fid);
}

function invalidatePlayerActiveMatchIndexesForMatch(match) {
  if (!match) return;
  invalidatePlayerActiveMatchIndexForFid(match.player1Fid);
  invalidatePlayerActiveMatchIndexForFid(match.player2Fid);
}

function invalidatePlayerActiveMatchDataCache(fid) {
  const keys = normalizeFidCacheKeys(fid);
  keys.forEach((key) => invalidateCacheKey(playerActiveMatchesDataCache, key));
}

function invalidatePlayerMatchesResultsForMatch(match) {
  if (!match) return;
  invalidatePlayerMatchesResultCache(match.player1Fid);
  invalidatePlayerMatchesResultCache(match.player2Fid);
}

function getCachedPendingMatchIds() {
  if (!pendingMatchesCache.ids) return null;
  if (nowMs() - pendingMatchesCache.timestamp > PENDING_CACHE_TTL_MS) {
    pendingMatchesCache = { ids: null, timestamp: 0 };
    return null;
  }
  return [...pendingMatchesCache.ids];
}

function setCachedPendingMatchIds(ids) {
  pendingMatchesCache = {
    ids: Array.isArray(ids) ? [...ids] : [],
    timestamp: nowMs()
  };
}

function invalidatePendingMatchIdsCache() {
  pendingMatchesCache = { ids: null, timestamp: 0 };
}

function updateMemoryActiveIndex(fid, matchId, shouldBeActive) {
  const normalized = normalizeFidValue(fid);
  if (normalized === null || !matchId) return;
  const store = playerActiveMatchesStore;
  if (shouldBeActive) {
    if (!store.has(normalized)) {
      store.set(normalized, new Set());
    }
    store.get(normalized).add(matchId);
  } else if (store.has(normalized)) {
    const set = store.get(normalized);
    set.delete(matchId);
    if (set.size === 0) {
      store.set(normalized, set);
    }
  }
}

function replaceMemoryActiveIndex(fid, matchIds) {
  const normalized = normalizeFidValue(fid);
  if (normalized === null) return;
  if (!Array.isArray(matchIds) || matchIds.length === 0) {
    playerActiveMatchesStore.set(normalized, new Set());
    return;
  }
  playerActiveMatchesStore.set(normalized, new Set(matchIds));
}

async function updateActiveIndexEntry(fid, matchId, shouldBeActive) {
  if (!fid || !matchId) return;
  if (useMemoryStore) {
    updateMemoryActiveIndex(fid, matchId, shouldBeActive);
    return;
  }
  const normalized = normalizeFidValue(fid);
  if (normalized === null) return;
  const key = `${PLAYER_ACTIVE_MATCHES_PREFIX}${normalized}`;
  if (shouldBeActive) {
    await kv.sadd(key, matchId);
  } else {
    await kv.srem(key, matchId);
  }
}

async function replaceActiveIndexEntries(fid, matchIds) {
  const normalized = normalizeFidValue(fid);
  if (normalized === null) return;
  if (useMemoryStore) {
    replaceMemoryActiveIndex(fid, matchIds);
    invalidatePlayerActiveMatchIndexForFid(fid);
    return;
  }
  const key = `${PLAYER_ACTIVE_MATCHES_PREFIX}${normalized}`;
  await kv.del(key);
  if (Array.isArray(matchIds) && matchIds.length > 0) {
    await kv.sadd(key, ...matchIds);
  }
  invalidatePlayerActiveMatchIndexForFid(fid);
}

async function updateActiveIndexesForMatch(match) {
  if (!match) return;
  const shouldBeActive = shouldIndexMatchAsActive(match);
  await Promise.all([
    updateActiveIndexEntry(match.player1Fid, match.matchId, shouldBeActive),
    updateActiveIndexEntry(
      match.player2Fid,
      match.matchId,
      shouldBeActive && !!match.player2Fid
    )
  ]);
  invalidatePlayerActiveMatchIndexesForMatch(match);
}

function cloneMatchesArray(matches) {
  if (!Array.isArray(matches)) return [];
  if (typeof structuredClone === "function") {
    return structuredClone(matches);
  }
  return JSON.parse(JSON.stringify(matches));
}

function cloneMatchForSnapshot(match) {
  if (!match) return null;
  try {
    return JSON.parse(JSON.stringify(match));
  } catch {
    return { ...match };
  }
}

async function getActiveMatchesSnapshot(fid) {
  const normalized = normalizeFidValue(fid);
  if (normalized === null) {
    return { exists: false, matches: [] };
  }
  const cacheKey = String(normalized);
  const cached = getCachedValue(
    playerActiveMatchesDataCache,
    cacheKey,
    ACTIVE_MATCHES_DATA_CACHE_TTL_MS
  );
  if (cached.hit) {
    return {
      exists: cached.value.exists === true,
      matches: cloneMatchesArray(cached.value.matches || [])
    };
  }

  let stored = null;
  if (useMemoryStore) {
    stored = playerActiveMatchesDataStore.get(normalized);
  } else {
    const key = `${PLAYER_ACTIVE_MATCHES_DATA_PREFIX}${normalized}`;
    stored = await kv.get(key);
  }

  let exists = true;
  if (stored === null || stored === undefined) {
    exists = false;
    stored = [];
  } else if (typeof stored === "string") {
    try {
      stored = JSON.parse(stored);
    } catch {
      stored = [];
    }
  }

  if (!Array.isArray(stored)) {
    stored = [];
  }

  const payload = { exists, matches: stored };
  setCachedValue(playerActiveMatchesDataCache, cacheKey, payload);
  return {
    exists,
    matches: cloneMatchesArray(stored)
  };
}

async function writeActiveMatchesSnapshot(fid, matches) {
  const normalized = normalizeFidValue(fid);
  if (normalized === null) return;
  const payload = Array.isArray(matches) ? cloneMatchesArray(matches) : [];

  if (useMemoryStore) {
    playerActiveMatchesDataStore.set(normalized, payload);
  } else {
    const key = `${PLAYER_ACTIVE_MATCHES_DATA_PREFIX}${normalized}`;
    await kv.set(key, JSON.stringify(payload));
  }

  const cacheKey = String(normalized);
  setCachedValue(playerActiveMatchesDataCache, cacheKey, { exists: true, matches: payload });
}

async function upsertActiveSnapshotEntry(fid, matchId, snapshotMatch) {
  if (!fid || !matchId) return;
  const normalized = normalizeFidValue(fid);
  if (normalized === null) return;

  const { matches } = await getActiveMatchesSnapshot(normalized);
  let changed = false;
  let found = false;
  const nextMatches = [];

  for (const existing of matches) {
    if (existing.matchId === matchId) {
      found = true;
      if (snapshotMatch) {
        nextMatches.push(cloneMatchForSnapshot(snapshotMatch));
        changed = true;
      } else {
        changed = true;
      }
    } else {
      nextMatches.push(existing);
    }
  }

  if (!found && snapshotMatch) {
    nextMatches.push(cloneMatchForSnapshot(snapshotMatch));
    changed = true;
  }

  if (!changed && !snapshotMatch) {
    return;
  }

  await writeActiveMatchesSnapshot(fid, nextMatches);
}

async function updateActiveMatchSnapshots(match, options = {}) {
  if (!match) return;
  const forceRemove = options.forceRemove === true;
  const shouldInclude = !forceRemove && shouldIndexMatchAsActive(match);
  const snapshotMatch = shouldInclude ? cloneMatchForSnapshot(match) : null;
  const tasks = [];

  if (match.player1Fid) {
    tasks.push(upsertActiveSnapshotEntry(match.player1Fid, match.matchId, snapshotMatch));
  }
  if (match.player2Fid) {
    tasks.push(upsertActiveSnapshotEntry(match.player2Fid, match.matchId, snapshotMatch));
  }

  await Promise.all(tasks);
}

function normalizeLeaderboardFid(fid) {
  const normalized = normalizeFidToNumber(fid);
  return normalized !== null ? String(normalized) : null;
}

function getMemoryLeaderboardEntry(fid) {
  const existing = leaderboardStatsStore.get(fid);
  if (existing) return existing;
  const base = { fid, wins: 0, losses: 0, draws: 0 };
  leaderboardStatsStore.set(fid, base);
  return base;
}

async function incrementLeaderboardStat(fid, metric, delta = 1) {
  if (!fid || !["wins", "losses", "draws"].includes(metric) || delta === 0) {
    return;
  }

  if (useMemoryStore) {
    const entry = getMemoryLeaderboardEntry(fid);
    entry[metric] = (entry[metric] || 0) + delta;
    return;
  }

  const field = `${fid}:${metric}`;
  await kv.hincrby(LEADERBOARD_STATS_KEY, field, delta);
}

function determineLeaderboardDeltas(match) {
  if (!match?.gameState?.finished) {
    return [];
  }

  const player1Fid = normalizeLeaderboardFid(match.player1Fid);
  const player2Fid = normalizeLeaderboardFid(match.player2Fid);

  if (!player1Fid || !player2Fid) {
    return [];
  }

  const winnerSymbol = match.gameState.winner;
  const player1Symbol = match.player1Symbol || "X";
  const player2Symbol = match.player2Symbol || (player1Symbol === "X" ? "O" : "X");

  if (!winnerSymbol) {
    return [
      { fid: player1Fid, metric: "draws", delta: 1 },
      { fid: player2Fid, metric: "draws", delta: 1 }
    ];
  }

  const normalizedWinner = String(winnerSymbol).toUpperCase();
  const p1Won = String(player1Symbol).toUpperCase() === normalizedWinner;

  return p1Won
    ? [
        { fid: player1Fid, metric: "wins", delta: 1 },
        { fid: player2Fid, metric: "losses", delta: 1 }
      ]
    : [
        { fid: player1Fid, metric: "losses", delta: 1 },
        { fid: player2Fid, metric: "wins", delta: 1 }
      ];
}

function getCachedResult(map, key, ttl) {
  if (!key || !map.has(key)) return { hit: false, value: null };
  const entry = map.get(key);
  if (!entry) return { hit: false, value: null };
  if (nowMs() - entry.timestamp > ttl) {
    map.delete(key);
    return { hit: false, value: null };
  }
  return { hit: true, value: entry.value };
}

function setCachedResult(map, key, value) {
  if (!key) return;
  map.set(key, {
    value,
    timestamp: nowMs()
  });
}

function invalidateResultCache(map, key) {
  if (!key) return;
  map.delete(key);
}

function invalidatePlayerMatchesResultCache(fid) {
  const keys = normalizeFidCacheKeys(fid);
  keys.forEach((key) => invalidateResultCache(playerMatchesResultCache, key));
}

// Функция для полной инвалидации всех кэшей активных матчей игрока
// Используется перед проверкой лимита, чтобы получить актуальные данные
function invalidateAllPlayerActiveMatchesCache(fid) {
  const keys = normalizeFidCacheKeys(fid);
  
  // Инвалидируем кэш результатов
  keys.forEach((key) => invalidateResultCache(playerMatchesResultCache, buildResultCacheKey(key, false)));
  keys.forEach((key) => invalidateResultCache(playerMatchesResultCache, buildResultCacheKey(key, true)));
  
  // Инвалидируем индекс активных матчей
  keys.forEach((key) => invalidateCacheKey(playerActiveMatchesIndexCache, `${PLAYER_ACTIVE_MATCHES_PREFIX}${key}`));
  
  // Инвалидируем снапшот активных матчей
  keys.forEach((key) => invalidateCacheKey(playerActiveMatchesDataCache, key));
}

// Экспортируем функции для использования в API endpoints
export { invalidatePlayerMatchesResultCache, invalidateAllPlayerActiveMatchesCache };

function invalidateAvailableMatchesCache() {
  availableMatchesCache.clear();
}

// Check if KV is available
function isKVAvailable() {
  try {
    // Check standard Vercel KV variables
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      return true;
    }
    // Check REDIS_URL for Upstash (format: rediss://default:TOKEN@host:6379)
    if (process.env.REDIS_URL) {
      try {
        const redisUrl = new URL(process.env.REDIS_URL);
        if (redisUrl.hostname && redisUrl.password) {
          return true;
        }
      } catch (e) {
        // Invalid URL format
        return false;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// In-memory store for fallback mode
const memoryStore = new Map();
const playerMatchesStore = new Map();
const playerActiveMatchesStore = new Map();
const playerActiveMatchesDataStore = new Map();

let kv = null;
let useMemoryStore = false;
let kvInitialized = false;

// Initialize KV or fallback to memory (lazy initialization)
async function initKV() {
  if (kvInitialized) return;
  
  try {
    // If REDIS_URL is provided but KV_REST_API_URL is not, convert it
    if (process.env.REDIS_URL && !process.env.KV_REST_API_URL) {
      try {
        const redisUrl = new URL(process.env.REDIS_URL);
        // For Upstash REST API, use HTTPS without port
        process.env.KV_REST_API_URL = `https://${redisUrl.hostname}`;
        // Token is in the password part of URL
        process.env.KV_REST_API_TOKEN = redisUrl.password;
        console.log('[kv-helper] Converted REDIS_URL to KV format:', {
          originalHost: redisUrl.hostname,
          convertedUrl: process.env.KV_REST_API_URL,
          tokenLength: process.env.KV_REST_API_TOKEN?.length || 0
        });
      } catch (error) {
        console.warn('[kv-helper] Failed to parse REDIS_URL:', error?.message || error);
      }
    }
    
    if (isKVAvailable()) {
      // Log which variables are being used (for debugging)
      const hasUrl = !!process.env.KV_REST_API_URL;
      const hasToken = !!process.env.KV_REST_API_TOKEN;
      if (hasUrl && hasToken) {
        console.log('[kv-helper] KV env vars found:', {
          url: process.env.KV_REST_API_URL,
          tokenLength: process.env.KV_REST_API_TOKEN?.length || 0,
          tokenPreview: process.env.KV_REST_API_TOKEN ? 
            process.env.KV_REST_API_TOKEN.substring(0, 10) + '...' : 'missing'
        });
      }
      
      const kvModule = await import("@vercel/kv");
      kv = kvModule.kv;
      kvInitialized = true;
      console.log('[kv-helper] Storage initialized: vercel-kv');
    } else {
      useMemoryStore = true;
      kvInitialized = true;
      console.log('[kv-helper] Storage initialized: memory fallback (env vars missing)');
    }
  } catch (error) {
    useMemoryStore = true;
    kvInitialized = true;
    console.warn('[kv-helper] Storage initialization failed, switching to memory fallback:', error?.message || error);
  }
}

export async function getMatch(matchId) {
  await initKV();
  const key = `${MATCH_PREFIX}${matchId}`;
  
  try {
    if (useMemoryStore) {
      const match = memoryStore.get(key);
      return match || null;
    }
    
    const cached = getCachedValue(matchCache, key, MATCH_CACHE_TTL_MS);
    if (cached.hit) {
      return cached.value;
    }
    
    const match = await kv.get(key);
    setCachedValue(matchCache, key, match || null);
    return match;
  } catch (error) {
    // Fallback to memory store if KV fails
    if (!useMemoryStore) {
      invalidateCacheKey(matchCache, key);
      useMemoryStore = true;
      return memoryStore.get(key) || null;
    }
    throw new Error(`Failed to get match: ${error.message}`);
  }
}

export async function saveMatch(match) {
  await initKV();
  const key = `${MATCH_PREFIX}${match.matchId}`;
  const cacheKey = key;
  
  try {
    const validation = validateMatchSchema(match);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    // Idempotent-проверка: получаем текущий матч для сравнения
    const existingMatch = await getMatch(match.matchId);
    
    // Сравниваем ключевые поля для определения, изменился ли матч реально
    let hasSignificantChanges = false;
    if (!existingMatch) {
      hasSignificantChanges = true; // Новый матч
    } else {
      // Сравниваем статус, gameState, player2Fid
      const statusChanged = existingMatch.status !== match.status;
      const player2Changed = existingMatch.player2Fid !== match.player2Fid;
      const gameStateChanged = JSON.stringify(existingMatch.gameState) !== JSON.stringify(match.gameState);
      hasSignificantChanges = statusChanged || player2Changed || gameStateChanged;
    }

    const matchData = createMatchSchema({
      ...match,
      updatedAt: new Date().toISOString()
    });

    if (useMemoryStore) {
      memoryStore.set(key, matchData);
      console.log(`[saveMatch] Saved match ${match.matchId} to memoryStore (status: ${matchData.status}, player1Fid: ${matchData.player1Fid}, player2Fid: ${matchData.player2Fid})`);
      
      // Also index by players (normalize FID to number) - только если изменилось
      if (hasSignificantChanges || !existingMatch) {
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
      }
      
      // Index pending matches (for finding available matches) - только если статус изменился
      const wasPending = existingMatch?.status === MATCH_STATUS.PENDING && !existingMatch?.player2Fid;
      const isPending = matchData.status === MATCH_STATUS.PENDING && !matchData.player2Fid;
      
      if (isPending && !wasPending) {
        if (!playerMatchesStore.has(PENDING_MATCHES_KEY)) {
          playerMatchesStore.set(PENDING_MATCHES_KEY, new Set());
          console.log(`[saveMatch] Created pending matches index`);
        }
        playerMatchesStore.get(PENDING_MATCHES_KEY).add(match.matchId);
        console.log(`[saveMatch] Added match ${match.matchId} to pending index (player1Fid: ${matchData.player1Fid})`);
      } else if (!isPending && wasPending) {
        // Remove from pending index if no longer pending
        const pendingSet = playerMatchesStore.get(PENDING_MATCHES_KEY);
        if (pendingSet) {
          pendingSet.delete(match.matchId);
          console.log(`[saveMatch] Removed match ${match.matchId} from pending index (status: ${matchData.status}, player2Fid: ${matchData.player2Fid})`);
        }
      }
      
      // Обновляем индексы и снапшоты только если были значимые изменения
      if (hasSignificantChanges) {
        await updateActiveIndexesForMatch(matchData);
        await updateActiveMatchSnapshots(matchData);
        invalidatePlayerMatchIndexesForMatch(matchData);
        invalidatePendingMatchIdsCache();
        invalidatePlayerMatchesResultsForMatch(matchData);
        invalidateAvailableMatchesCache();
      }
      invalidateCacheKey(matchCache, cacheKey);
      return matchData;
    }

    // Для KV: обновляем только если были значимые изменения
    if (hasSignificantChanges) {
      await kv.set(key, matchData);
      setCachedValue(matchCache, cacheKey, matchData);

      // Also index by players (normalize FID to number)
      // Проверяем, нужно ли добавлять в индекс (только если новый матч или изменился player1Fid/player2Fid)
      const player1FidChanged = !existingMatch || existingMatch.player1Fid !== match.player1Fid;
      const player2FidChanged = !existingMatch || existingMatch.player2Fid !== match.player2Fid;
      
      if (match.player1Fid && player1FidChanged) {
        const normalizedFid1 = typeof match.player1Fid === 'string' ? parseInt(match.player1Fid, 10) : match.player1Fid;
        if (!isNaN(normalizedFid1)) {
          await kv.sadd(`${PLAYER_MATCHES_PREFIX}${normalizedFid1}`, match.matchId);
        }
      }
      if (match.player2Fid && player2FidChanged) {
        const normalizedFid2 = typeof match.player2Fid === 'string' ? parseInt(match.player2Fid, 10) : match.player2Fid;
        if (!isNaN(normalizedFid2)) {
          await kv.sadd(`${PLAYER_MATCHES_PREFIX}${normalizedFid2}`, match.matchId);
        }
      }

      // Index pending matches (for finding available matches)
      const wasPending = existingMatch?.status === MATCH_STATUS.PENDING && !existingMatch?.player2Fid;
      const isPending = matchData.status === MATCH_STATUS.PENDING && !matchData.player2Fid;
      
      if (isPending && !wasPending) {
        await kv.sadd(PENDING_MATCHES_KEY, match.matchId);
      } else if (!isPending && wasPending) {
        // Remove from pending index if no longer pending
        await kv.srem(PENDING_MATCHES_KEY, match.matchId);
      }

      await updateActiveIndexesForMatch(matchData);
      await updateActiveMatchSnapshots(matchData);
      invalidatePlayerMatchIndexesForMatch(matchData);
      invalidatePendingMatchIdsCache();
      invalidatePlayerMatchesResultsForMatch(matchData);
      invalidateAvailableMatchesCache();
    } else {
      // Если изменений нет, только обновляем кеш с новым updatedAt
      setCachedValue(matchCache, cacheKey, matchData);
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
      
      await updateActiveIndexesForMatch(matchData);
      await updateActiveMatchSnapshots(matchData);
      invalidatePlayerMatchIndexesForMatch(matchData);
      invalidatePendingMatchIdsCache();
      invalidateCacheKey(matchCache, key);
      invalidatePlayerMatchesResultsForMatch(matchData);
      invalidateAvailableMatchesCache();
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
      
      const removeFromPlayerIndex = (fid) => {
        const normalized = normalizeFidValue(fid);
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
      await updateActiveIndexEntry(match.player1Fid, matchId, false);
      await updateActiveIndexEntry(match.player2Fid, matchId, false);
      await updateActiveMatchSnapshots(match, { forceRemove: true });
      invalidatePlayerActiveMatchIndexesForMatch(match);
      invalidatePlayerMatchIndexesForMatch(match);
      invalidatePendingMatchIdsCache();
      invalidateCacheKey(matchCache, key);
      invalidatePlayerMatchesResultsForMatch(match);
      invalidateAvailableMatchesCache();
      
      return { ok: true };
    }

    await kv.del(key);
    invalidateCacheKey(matchCache, key);
    
    const removeFromPlayerIndexKV = async (fid) => {
      const normalized = normalizeFidValue(fid);
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
    await updateActiveIndexEntry(match.player1Fid, matchId, false);
    await updateActiveIndexEntry(match.player2Fid, matchId, false);
    await updateActiveMatchSnapshots(match, { forceRemove: true });
    invalidatePlayerActiveMatchIndexesForMatch(match);
    invalidatePlayerMatchIndexesForMatch(match);
    invalidatePendingMatchIdsCache();
    invalidatePlayerMatchesResultsForMatch(match);
    invalidateAvailableMatchesCache();

    return { ok: true };
  } catch (error) {
    throw new Error(`Failed to delete match: ${error.message}`);
  }
}

export async function getPlayerMatches(fid, options = {}) {
  await initKV();
  const { includeFinished = true } = options || {};
  
  try {
    // Normalize FID to number for consistency (FID is always a number)
    const normalizedFid = normalizeFidToNumber(fid);
    
    if (normalizedFid === null) {
      console.warn(`[getPlayerMatches] Invalid FID: ${fid}`);
      return [];
    }
    
    const baseCacheKeys = normalizeFidCacheKeys(fid);
    const primaryCacheKey = String(normalizedFid);
    if (!baseCacheKeys.includes(primaryCacheKey)) {
      baseCacheKeys.unshift(primaryCacheKey);
    }
    const resultCacheKeys = baseCacheKeys.map((key) => buildResultCacheKey(key, includeFinished));
    
    for (const cacheKey of resultCacheKeys) {
      const cachedResult = getCachedResult(
        playerMatchesResultCache,
        cacheKey,
        PLAYER_MATCHES_RESULT_CACHE_TTL_MS
      );
      if (cachedResult.hit) {
        return cloneMatchesArray(cachedResult.value);
      }
    }
    
    let activeSnapshotInfo = null;
    if (!includeFinished) {
      activeSnapshotInfo = await getActiveMatchesSnapshot(normalizedFid);
      if (activeSnapshotInfo.exists) {
        const snapshotMatches = cloneMatchesArray(activeSnapshotInfo.matches);
        const matchesForCache = cloneMatchesArray(snapshotMatches);
        resultCacheKeys.forEach((cacheKey) => {
          setCachedResult(playerMatchesResultCache, cacheKey, matchesForCache);
        });
        return snapshotMatches;
      }
    }
    
    let matchIds = [];
    let hydratedFromActiveIndex = includeFinished;
    
    if (useMemoryStore) {
      // Try both string and number keys for backwards compatibility
      const store = includeFinished ? playerMatchesStore : playerActiveMatchesStore;
      const playerMatches =
        store.get(normalizedFid) ||
        store.get(String(normalizedFid)) ||
        store.get(fid);
      if (!playerMatches) {
        if (!includeFinished) {
          const fallbackStore =
            playerMatchesStore.get(normalizedFid) ||
            playerMatchesStore.get(String(normalizedFid)) ||
            playerMatchesStore.get(fid);
          matchIds = fallbackStore ? Array.from(fallbackStore) : [];
          hydratedFromActiveIndex = false;
        } else {
          return [];
        }
      } else {
        matchIds = Array.from(playerMatches);
      }
    } else {
      const indexPrefix = includeFinished ? PLAYER_MATCHES_PREFIX : PLAYER_ACTIVE_MATCHES_PREFIX;
      const indexCache = includeFinished ? playerMatchesIndexCache : playerActiveMatchesIndexCache;
      const cacheKeys = normalizeFidCacheKeys(fid);
      if (!cacheKeys.includes(String(normalizedFid))) {
        cacheKeys.unshift(String(normalizedFid));
      }
      
      const scopedIndexKeys = cacheKeys.map((key) => `${indexPrefix}${key}`);
      let cachedIds = null;
      const indexTtl = includeFinished ? PLAYER_INDEX_CACHE_TTL_MS : PLAYER_ACTIVE_INDEX_CACHE_TTL_MS;
      for (const cacheKey of scopedIndexKeys) {
        const cachedEntry = getCachedValue(indexCache, cacheKey, indexTtl);
        if (cachedEntry.hit) {
          cachedIds = Array.isArray(cachedEntry.value) ? [...cachedEntry.value] : [];
          hydratedFromActiveIndex = true;
          break;
        }
      }
      
      if (cachedIds) {
        matchIds = cachedIds;
      } else {
        const normalizedKey = `${indexPrefix}${normalizedFid}`;
        matchIds = await kv.smembers(normalizedKey);
        if (!matchIds || matchIds.length === 0) {
          hydratedFromActiveIndex = includeFinished;
          if (!includeFinished) {
            matchIds = await kv.smembers(`${PLAYER_MATCHES_PREFIX}${normalizedFid}`);
            if (!matchIds || matchIds.length === 0) {
              matchIds = (await kv.smembers(`${PLAYER_MATCHES_PREFIX}${fid}`)) || [];
            }
          } else {
            matchIds = await kv.smembers(`${PLAYER_MATCHES_PREFIX}${fid}`) || [];
          }
        } else {
          hydratedFromActiveIndex = true;
        }
        const cacheValue = Array.isArray(matchIds) ? [...matchIds] : [];
        scopedIndexKeys.forEach((cacheKey) => {
          setCachedValue(indexCache, cacheKey, cacheValue);
        });
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

    let filteredMatches = matches.filter(match => match !== null);
    if (!includeFinished) {
      filteredMatches = filteredMatches.filter((match) => shouldIndexMatchAsActive(match));
    }
    
    const matchesForCache = cloneMatchesArray(filteredMatches);
    resultCacheKeys.forEach((cacheKey) => {
      setCachedResult(playerMatchesResultCache, cacheKey, matchesForCache);
    });
    
    if (!includeFinished) {
      const shouldPrimeActiveArtifacts =
        !hydratedFromActiveIndex || !(activeSnapshotInfo?.exists);
      if (shouldPrimeActiveArtifacts) {
        const activeMatchIdsForFid = filteredMatches
          .filter(
            (match) =>
              match.player1Fid === normalizedFid ||
              match.player2Fid === normalizedFid
          )
          .map((match) => match.matchId);
        await replaceActiveIndexEntries(normalizedFid, activeMatchIdsForFid);
        await writeActiveMatchesSnapshot(normalizedFid, filteredMatches);
      }
    }

    return filteredMatches;
  } catch (error) {
    // Fallback to memory store if KV fails
    if (!useMemoryStore) {
      useMemoryStore = true;
      // Try both normalized and original FID for backwards compatibility
      const normalizedFid = normalizeFidToNumber(fid);
      const playerMatches = playerMatchesStore.get(normalizedFid) || 
                           playerMatchesStore.get(String(normalizedFid)) || 
                           playerMatchesStore.get(fid);
      if (!playerMatches) {
        return [];
      }
      const matchIds = Array.from(playerMatches);
      let matches = matchIds.map(matchId => memoryStore.get(`${MATCH_PREFIX}${matchId}`)).filter(Boolean);
      if (!includeFinished) {
        matches = matches.filter((match) => shouldIndexMatchAsActive(match));
      }
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
    const rawExcludeFid = excludeFid !== null ? (typeof excludeFid === 'string' ? parseInt(excludeFid, 10) : excludeFid) : null;
    const normalizedExcludeFid = Number.isNaN(rawExcludeFid) ? null : rawExcludeFid;
    const cacheKey = `avail:${normalizedExcludeFid !== null ? normalizedExcludeFid : "all"}`;
    const cachedResult = getCachedResult(availableMatchesCache, cacheKey, AVAILABLE_MATCHES_CACHE_TTL_MS);
    if (cachedResult.hit) {
      return cloneMatchesArray(cachedResult.value);
    }
    
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
        // Get all match IDs from pending matches index (with caching)
        let pendingMatchIds = getCachedPendingMatchIds();
        const pendingFromCache = Array.isArray(pendingMatchIds);
        if (!pendingMatchIds) {
          pendingMatchIds = await kv.smembers(PENDING_MATCHES_KEY) || [];
          setCachedPendingMatchIds(pendingMatchIds);
        }
        console.log(`[getAvailableMatches] Found ${pendingMatchIds.length} pending match IDs in index${pendingFromCache ? " (cache)" : ""}`);
        
        // Батчируем запросы матчей для параллельной загрузки
        const matchPromises = pendingMatchIds.map(matchId => getMatch(matchId));
        const matches = await Promise.all(matchPromises);
        
        for (const match of matches) {
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
    setCachedResult(availableMatchesCache, cacheKey, cloneMatchesArray(allMatches));
    return allMatches;
  } catch (error) {
    console.error('[getAvailableMatches] Error:', error);
    return [];
  }
}

export async function recordLeaderboardOutcomeForMatch(match) {
  const deltas = determineLeaderboardDeltas(match);
  if (!Array.isArray(deltas) || deltas.length === 0) {
    return;
  }

  await Promise.all(
    deltas.map(({ fid, metric, delta }) => incrementLeaderboardStat(fid, metric, delta))
  );
}

export async function getLeaderboardStats() {
  await initKV();

  const sortEntries = (entries) =>
    entries.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.draws - a.draws;
    });

  if (useMemoryStore) {
    const values = Array.from(leaderboardStatsStore.values()).map((entry) => ({
      fid: entry.fid,
      wins: entry.wins || 0,
      losses: entry.losses || 0,
      draws: entry.draws || 0
    }));
    return sortEntries(values);
  }

  const raw = (await kv.hgetall(LEADERBOARD_STATS_KEY)) || {};
  const statsMap = new Map();

  for (const [field, value] of Object.entries(raw)) {
    const [fid, metric] = field.split(":");
    if (!fid || !metric) continue;
    if (!["wins", "losses", "draws"].includes(metric)) continue;

    const entry = statsMap.get(fid) || { fid, wins: 0, losses: 0, draws: 0 };
    entry[metric] = Number(value) || 0;
    statsMap.set(fid, entry);
  }

  return sortEntries(Array.from(statsMap.values()));
}
