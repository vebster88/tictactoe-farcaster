/**
 * Utility functions for normalizing values across the application
 */

// ВАЖНО: Дублируем логику проверки виртуальных FID здесь, чтобы избежать циклических зависимостей
// (client.js может импортировать normalize.js через другие модули)
// Эта логика должна совпадать с client.js

function isVirtualFidLocal(fid) {
  if (fid === null || fid === undefined) return false;
  
  // Если это строка с префиксом "V" или "v" - это виртуальный FID
  if (typeof fid === 'string') {
    const trimmed = fid.trim();
    if (trimmed.length > 1 && (trimmed[0] === 'V' || trimmed[0] === 'v')) {
      return true;
    }
  }
  
  // Отрицательные FID - это старые виртуальные FID (для обратной совместимости)
  const numFid = Number(fid);
  if (!isNaN(numFid) && numFid < 0) {
    return true;
  }
  
  return false;
}

function extractNumericFidFromVirtualLocal(fid) {
  if (fid === null || fid === undefined) return null;
  
  // Если это строка с префиксом "V" или "v", извлекаем число
  if (typeof fid === 'string') {
    const trimmed = fid.trim();
    if (trimmed.length > 1 && (trimmed[0] === 'V' || trimmed[0] === 'v')) {
      const numericPart = trimmed.substring(1);
      const num = parseInt(numericPart, 10);
      return isNaN(num) ? null : num;
    }
  }
  
  // Если это число (включая отрицательные для обратной совместимости), возвращаем как есть
  const numFid = Number(fid);
  return isNaN(numFid) ? null : numFid;
}

/**
 * Normalize FID to a number (for database operations)
 * @param {string|number|null|undefined} fid - FID value to normalize
 * @returns {number|null} - Normalized FID as number or null if invalid
 */
export function normalizeFidToNumber(fid) {
  if (fid === null || fid === undefined) {
    return null;
  }
  
  // Если это виртуальный FID (строка с префиксом), извлекаем число
  if (isVirtualFidLocal(fid)) {
    return extractNumericFidFromVirtualLocal(fid);
  }
  
  const normalized = typeof fid === "string" ? parseInt(fid, 10) : fid;
  return Number.isNaN(normalized) ? null : normalized;
}

/**
 * Normalize FID to a string (for UI/display operations)
 * @param {string|number|object|null|undefined} fid - FID value to normalize
 * @returns {string|null} - Normalized FID as string or null if invalid
 */
export function normalizeFidToString(fid) {
  if (fid === null || fid === undefined) return null;
  if (typeof fid === "object") {
    if ("fid" in fid) return normalizeFidToString(fid.fid);
    if ("id" in fid) return normalizeFidToString(fid.id);
  }
  if (typeof fid === "string") {
    const trimmed = fid.trim();
    return trimmed || null;
  }
  if (Number.isFinite(fid)) {
    return String(fid);
  }
  try {
    return String(fid);
  } catch {
    return null;
  }
}

/**
 * Get multiple cache keys for FID (handles both string and number formats)
 * @param {string|number|null|undefined} fid - FID value
 * @returns {string[]} - Array of possible cache keys
 */
export function getFidCacheKeys(fid) {
  if (fid === null || fid === undefined) {
    return [];
  }
  const keys = new Set();
  const rawKey = String(fid);
  if (rawKey !== "undefined" && rawKey !== "null") {
    keys.add(rawKey);
  }
  const normalized = normalizeFidToNumber(fid);
  if (normalized !== null) {
    keys.add(String(normalized));
  }
  return Array.from(keys);
}

/**
 * Normalize match ID to string
 * @param {string|object|null|undefined} value - Match ID value
 * @returns {string|null} - Normalized match ID or null if invalid
 */
export function normalizeMatchId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    if ("matchId" in value && value.matchId !== null && value.matchId !== undefined) {
      return normalizeMatchId(value.matchId);
    }
    if ("id" in value && value.id !== null && value.id !== undefined) {
      return normalizeMatchId(value.id);
    }
    return null;
  }
  try {
    return String(value);
  } catch {
    return null;
  }
}

