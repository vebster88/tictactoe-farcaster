/**
 * Utility functions for working with FIDs
 */

/**
 * Генерация стабильного anonId на основе FID (для не-Farcaster пользователей)
 * Используется для создания стабильных username вида @userXX
 * 
 * @param {string|number} fid - FID (может быть строкой "V22575" или числом)
 * @returns {number} - anonId от 1 до 99
 */
export function getAnonIdFromFid(fid) {
  // Нормализуем FID: если это строка с префиксом "V", извлекаем число
  let numericFid = fid;
  if (typeof fid === 'string' && fid.length > 1 && (fid[0] === 'V' || fid[0] === 'v')) {
    numericFid = parseInt(fid.substring(1), 10);
  } else {
    numericFid = typeof fid === 'string' ? parseInt(fid, 10) : fid;
  }
  
  // Используем простой хеш для генерации стабильного числа от 1 до 99
  const hash = Math.abs(numericFid) % 99;
  return hash + 1; // От 1 до 99
}

