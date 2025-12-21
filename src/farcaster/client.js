import axios from "axios";

const NEYNAR_API_KEY = import.meta.env.VITE_NEYNAR_API_KEY;
const NEYNAR_SIGNER_UUID = import.meta.env.VITE_NEYNAR_SIGNER_UUID;
const NEYNAR_BASE_URL = "https://api.neynar.com/v2";

// Константы для виртуальных FID (псевдо-FID для пользователей без Farcaster)
const VIRTUAL_FID_MIN = 10000;
const VIRTUAL_FID_MAX = 99999;
const VIRTUAL_FID_RANGE = VIRTUAL_FID_MAX - VIRTUAL_FID_MIN + 1; // 90000

// Проверка, является ли FID виртуальным (псевдо-FID)
export function isVirtualFid(fid) {
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

// Извлечение числового FID из строкового виртуального FID
export function extractNumericFidFromVirtual(fid) {
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

// Генерация виртуального FID на основе адреса кошелька
export function getVirtualFidFromAddress(address) {
  if (!address) return null;
  
  // Используем ту же логику, что и в getUserByAddress для консистентности
  const addressHash = address.toLowerCase().split('').reduce((hash, char) => {
    return ((hash << 5) - hash) + char.charCodeAt(0);
  }, 0);
  
  // Генерируем числовой FID на основе адреса (от 10000 до 99999)
  const numericFid = VIRTUAL_FID_MIN + Math.abs(addressHash % VIRTUAL_FID_RANGE);
  
  // Возвращаем строковый FID с префиксом "V"
  return `V${numericFid}`;
}

// Mock режим для операций ЧТЕНИЯ (лидерборд, поиск пользователей и т.п.)
// Для чтения нам НЕ нужен signer UUID, только рабочий API-ключ
function isMockForRead() {
  const mockMode = import.meta.env.VITE_FARCASTER_MOCK === "true";
  const noApiKey = !NEYNAR_API_KEY || NEYNAR_API_KEY === "your_neynar_api_key_here";
  return mockMode || noApiKey;
}

// Mock режим для операций ЗАПИСИ (публикация кастов и т.п.)
// Для записи требуется и API-ключ, и signer UUID
function isMock() {
  const mockMode = import.meta.env.VITE_FARCASTER_MOCK === "true";
  const noApiKey = !NEYNAR_API_KEY || NEYNAR_API_KEY === "your_neynar_api_key_here";
  const noSigner = !NEYNAR_SIGNER_UUID || NEYNAR_SIGNER_UUID === "your_signer_uuid_here";
  const isMockMode = mockMode || noApiKey || noSigner;
  
  const modeInfo = {
    VITE_FARCASTER_MOCK: import.meta.env.VITE_FARCASTER_MOCK,
    NEYNAR_API_KEY: NEYNAR_API_KEY ? "***" + NEYNAR_API_KEY.slice(-4) : "undefined",
    NEYNAR_SIGNER_UUID: NEYNAR_SIGNER_UUID ? "***" + NEYNAR_SIGNER_UUID.slice(-4) : "undefined",
    mockMode,
    noApiKey,
    noSigner,
    isMockMode
  };
  
  console.log("Farcaster mode check:", modeInfo);
  
  // Логируем в debug панель, если доступна
  if (typeof window !== 'undefined' && window.addDebugLog) {
    if (isMockMode) {
      window.addDebugLog("⚠️ Farcaster работает в MOCK режиме", {
        причина: mockMode ? "VITE_FARCASTER_MOCK=true" : (noApiKey ? "NEYNAR_API_KEY отсутствует" : "NEYNAR_SIGNER_UUID отсутствует"),
        ...modeInfo
      });
    } else {
      window.addDebugLog("✅ Farcaster работает в РЕАЛЬНОМ режиме", modeInfo);
    }
  }
  
  return isMockMode;
}

// Получить профиль пользователя по Ethereum адресу
export async function getUserByAddress(address) {
  // Для чтения профиля по адресу достаточно API-ключа, signer не обязателен
  if (isMockForRead()) {
    // Используем единую функцию для генерации виртуального FID (возвращает строку с префиксом "V")
    const fid = getVirtualFidFromAddress(address);
    
    // Извлекаем числовую часть для генерации username
    const numericFid = extractNumericFidFromVirtual(fid) || 0;
    const usernameSuffix = numericFid % 10000;
    const username = `user${usernameSuffix}`;
    
    // Генерируем display name
    const displayName = `User ${usernameSuffix}`;
    
    // В тестовом режиме используем hero.jpg как аватарку
    const pfpUrl = "/assets/images/hero.jpg";
    
    return {
      schemaVersion: "1.0.0",
      user: {
        fid: fid, // Сохраняем строковый FID с префиксом "V"
        username: username,
        display_name: displayName,
        pfp_url: pfpUrl,
        verified_addresses: { eth_addresses: [address] }
      }
    };
  }

  try {
    const response = await axios.get(`${NEYNAR_BASE_URL}/farcaster/user/bulk-by-address`, {
      params: { addresses: address },
      headers: { 'api_key': NEYNAR_API_KEY }
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching user:", error);
    if (error.response?.status === 401) {
      throw new Error("Неверный API ключ Neynar. Проверьте настройки в .env.local файле.");
    } else if (error.response?.status === 403) {
      throw new Error("API ключ Neynar не имеет доступа к этому эндпоинту.");
    } else if (error.response?.status === 429) {
      throw new Error("Превышен лимит запросов к API Neynar. Попробуйте позже.");
    } else {
      throw new Error(`Не удалось получить профиль пользователя: ${error.message}`);
    }
  }
}

// Получить профили нескольких пользователей по FID (batch-запрос для лидерборда)
export async function getUsersByFids(fids) {
  if (!Array.isArray(fids) || fids.length === 0) {
    return [];
  }
  
  // Для чтения профилей по FID достаточно API-ключа, signer не обязателен
  if (isMockForRead()) {
    // В mock режиме генерируем данные для каждого FID
    return fids.map(fid => {
      const fidHash = Math.abs(fid) % 10000;
      return {
        schemaVersion: "1.0.0",
        user: {
          fid: fid,
          username: `user${fidHash}`,
          display_name: `User ${fidHash}`,
          pfp_url: "/assets/images/hero.jpg"
        }
      };
    });
  }

  // Проверяем наличие API ключа
  if (!NEYNAR_API_KEY || NEYNAR_API_KEY === "your_neynar_api_key_here") {
    console.warn('[getUsersByFids] NEYNAR_API_KEY не установлен или имеет значение по умолчанию');
    return fids.map(() => null);
  }

  try {
    // Разделяем FID на реальные и виртуальные (используем isVirtualFid для проверки)
    // НЕ конвертируем в числа перед проверкой, чтобы сохранить строковые виртуальные FID
    const realFids = [];
    const virtualFids = [];
    
    fids.forEach(fid => {
      if (isVirtualFid(fid)) {
        virtualFids.push(fid);
      } else {
        // Для реальных FID конвертируем в число
        const numFid = Number(fid);
        if (!isNaN(numFid) && numFid > 0) {
          realFids.push(numFid);
        }
      }
    });
    
    // Создаем Map для виртуальных FID (генерируем моковые данные)
    const virtualUsersMap = new Map();
    virtualFids.forEach(fid => {
      // Извлекаем числовую часть для username
      const numericFid = extractNumericFidFromVirtual(fid) || 0;
      const fidHash = numericFid % 10000;
      virtualUsersMap.set(fid, {
        schemaVersion: "1.0.0",
        user: {
          fid: fid, // Сохраняем оригинальный строковый FID
          username: `user${fidHash}`,
          display_name: `User ${fidHash}`,
          pfp_url: "/assets/images/hero.jpg"
        }
      });
    });
    
    // Если есть реальные FID, делаем запрос к Neynar API
    let realUsersMap = new Map();
    if (realFids.length > 0) {
      const url = `${NEYNAR_BASE_URL}/farcaster/user/bulk`;
      const fidsString = realFids.join(',');
      const params = { fids: fidsString };
      
      if (typeof window !== 'undefined' && window.addDebugLog) {
        window.addDebugLog(`🔍 [getUsersByFids] Batch запрос для ${realFids.length} реальных FID`, {
          realFids: realFids,
          virtualFids: virtualFids,
          fidsString: fidsString,
          hasApiKey: !!NEYNAR_API_KEY
        });
      }
      
      console.log('[getUsersByFids] Запрос к Neynar API:', {
        url,
        params,
        realFidsCount: realFids.length,
        virtualFidsCount: virtualFids.length
      });
      
      const response = await axios.get(url, {
        params: params,
        headers: { 'api_key': NEYNAR_API_KEY }
      });
      
      console.log('[getUsersByFids] Ответ от Neynar API:', {
        status: response.status,
        hasData: !!response.data,
        hasUsers: !!response.data?.users,
        usersCount: response.data?.users?.length || 0,
        responseKeys: response.data ? Object.keys(response.data) : []
      });
      
      if (response.data?.users && Array.isArray(response.data.users)) {
        if (typeof window !== 'undefined' && window.addDebugLog) {
          window.addDebugLog(`✅ [getUsersByFids] Получено ${response.data.users.length} пользователей из ${realFids.length} запрошенных`, {
            requestedFids: realFids,
            receivedFids: response.data.users.map(u => u.fid)
          });
        }
        
        // Создаем Map для быстрого поиска по FID
        response.data.users.forEach(user => {
          realUsersMap.set(Number(user.fid), {
            schemaVersion: "1.0.0",
            user: user
          });
        });
      }
    } else {
      // Если только виртуальные FID, просто возвращаем их данные
      if (typeof window !== 'undefined' && window.addDebugLog) {
        window.addDebugLog(`🔷 [getUsersByFids] Только виртуальные FID, пропускаем запрос к API`, {
          virtualFids: virtualFids
        });
      }
    }
    
    // Объединяем карты реальных и виртуальных пользователей
    // Для виртуальных FID используем оригинальный ключ (может быть строкой)
    // Для реальных FID используем числовой ключ
    const allUsersMap = new Map();
    
    // Добавляем реальных пользователей (ключ - число)
    realUsersMap.forEach((value, key) => {
      allUsersMap.set(key, value);
      allUsersMap.set(String(key), value); // Также добавляем строковый ключ для совместимости
    });
    
    // Добавляем виртуальных пользователей (ключ - оригинальный FID, может быть строкой)
    virtualUsersMap.forEach((value, key) => {
      allUsersMap.set(key, value);
      // Также добавляем числовой ключ для совместимости
      const numericKey = extractNumericFidFromVirtual(key);
      if (numericKey !== null) {
        allUsersMap.set(numericKey, value);
        allUsersMap.set(String(numericKey), value);
      }
    });
    
    // Возвращаем данные в том же порядке, что и запрошенные FID
    return fids.map(fid => {
      // Пробуем найти по оригинальному FID
      let result = allUsersMap.get(fid);
      if (result) return result;
      
      // Пробуем найти по числовому ключу
      const numFid = Number(fid);
      if (!isNaN(numFid)) {
        result = allUsersMap.get(numFid);
        if (result) return result;
        result = allUsersMap.get(String(numFid));
        if (result) return result;
      }
      
      // Пробуем найти по извлеченному числовому ключу (для виртуальных)
      if (isVirtualFid(fid)) {
        const numericKey = extractNumericFidFromVirtual(fid);
        if (numericKey !== null) {
          result = allUsersMap.get(numericKey);
          if (result) return result;
          result = allUsersMap.get(String(numericKey));
          if (result) return result;
        }
      }
      
      return null;
    });
    
    if (typeof window !== 'undefined' && window.addDebugLog) {
      window.addDebugLog(`⚠️ [getUsersByFids] API не вернул массив users`, {
        responseData: response.data
      });
    }
    
    return fids.map(() => null);
  } catch (error) {
    console.error('[getUsersByFids] Ошибка при batch-запросе к Neynar API:', error);
    
    // Детальное логирование ошибки
    let errorDetails = {};
    if (error.response) {
      errorDetails = {
        type: 'response_error',
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      };
      
      // Обработка ошибки 429 (Rate Limit)
      if (error.response.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 60;
        if (typeof window !== 'undefined' && window.addDebugLog) {
          window.addDebugLog(`⚠️ [getUsersByFids] Rate limit exceeded, retry after ${retryAfter}s`, {
            fids: fids,
            retryAfter: retryAfter,
            ...errorDetails
          });
        }
      }
    } else if (error.request) {
      errorDetails = {
        type: 'request_error',
        message: 'Запрос был отправлен, но ответа не получено'
      };
    } else {
      errorDetails = {
        type: 'setup_error',
        message: error.message
      };
    }
    
    if (typeof window !== 'undefined' && window.addDebugLog) {
      window.addDebugLog(`❌ [getUsersByFids] Ошибка для ${fids.length} FID`, {
        error: error.message,
        ...errorDetails
      });
    }
    
    return fids.map(() => null);
  }
}

// Получить профиль пользователя по FID (для отображения информации о противнике)
export async function getUserByFid(fid) {
  // Проверяем виртуальные FID ПЕРВЫМ, чтобы не отправлять их в API
  if (isVirtualFid(fid)) {
    // Генерируем моковые данные для виртуального FID
    const numericFid = extractNumericFidFromVirtual(fid) || 0;
    const fidHash = numericFid % 10000;
    if (typeof window !== 'undefined' && window.addDebugLog) {
      window.addDebugLog(`🔷 [getUserByFid] Виртуальный FID ${fid}, генерируем моковые данные`, {
        fid: fid,
        numericFid: numericFid,
        fidHash: fidHash
      });
    }
    return {
      schemaVersion: "1.0.0",
      user: {
        fid: fid, // Сохраняем оригинальный FID (может быть строкой)
        username: `user${fidHash}`,
        display_name: `User ${fidHash}`,
        pfp_url: "/assets/images/hero.jpg"
      }
    };
  }
  
  // Нормализуем FID к числу для реальных FID
  const normalizedFid = Number(fid);
  
  // Проверяем на невалидные FID
  if (isNaN(normalizedFid) || normalizedFid <= 0) {
    return null;
  }
  
  // Логируем начало запроса
  const mockForRead = isMockForRead();
  if (typeof window !== 'undefined' && window.addDebugLog) {
    window.addDebugLog(`🔍 [getUserByFid] Начало запроса для FID ${normalizedFid}`, {
      isMockForRead: mockForRead,
      hasApiKey: !!NEYNAR_API_KEY,
      apiKeyPreview: NEYNAR_API_KEY ? "***" + NEYNAR_API_KEY.slice(-4) : "undefined"
    });
  }
  
  // Для чтения профиля по FID достаточно API-ключа, signer не обязателен
  if (mockForRead) {
    // В mock режиме генерируем данные на основе FID
    // Это не точное соответствие, но для тестирования достаточно
    const fidHash = Math.abs(normalizedFid) % 10000;
    // В тестовом режиме используем hero.jpg как аватарку
    const pfpUrl = "/assets/images/hero.jpg";
    return {
      schemaVersion: "1.0.0",
      user: {
        fid: normalizedFid,
        username: `user${fidHash}`,
        display_name: `User ${fidHash}`,
        pfp_url: pfpUrl
      }
    };
  }

  // Проверяем наличие API ключа
  if (!NEYNAR_API_KEY || NEYNAR_API_KEY === "your_neynar_api_key_here") {
    console.warn('[getUserByFid] NEYNAR_API_KEY не установлен или имеет значение по умолчанию');
    if (typeof window !== 'undefined' && window.addDebugLog) {
      window.addDebugLog(`⚠️ [getUserByFid] API ключ не установлен для FID ${normalizedFid}`, {
        hasApiKey: !!NEYNAR_API_KEY,
        apiKeyValue: NEYNAR_API_KEY || "undefined"
      });
    }
    return null;
  }

  try {
    const url = `${NEYNAR_BASE_URL}/farcaster/user/bulk`;
    const params = { fids: normalizedFid };
    
    console.log('[getUserByFid] Запрос к Neynar API:', {
      url,
      fid: normalizedFid,
      hasApiKey: !!NEYNAR_API_KEY,
      apiKeyPreview: NEYNAR_API_KEY ? NEYNAR_API_KEY.substring(0, 10) + '...' : 'missing'
    });
    
    const response = await axios.get(url, {
      params: params,
      headers: { 'api_key': NEYNAR_API_KEY }
    });
    
    console.log('[getUserByFid] Ответ от Neynar API для FID', normalizedFid, ':', {
      status: response.status,
      hasData: !!response.data,
      hasUsers: !!response.data?.users,
      usersCount: response.data?.users?.length || 0,
      responseKeys: response.data ? Object.keys(response.data) : []
    });
    
    if (response.data?.users && response.data.users.length > 0) {
      const user = response.data.users[0];
      
      // Детальное логирование структуры пользователя
      console.log('[getUserByFid] Данные пользователя для FID', normalizedFid, ':', {
        fid: user.fid,
        username: user.username,
        display_name: user.display_name,
        displayName: user.displayName,
        pfp_url: user.pfp_url,
        pfpUrl: user.pfpUrl,
        pfp: user.pfp,
        allKeys: Object.keys(user),
        // Проверяем вложенные объекты
        pfpObject: user.pfp ? typeof user.pfp : 'not found',
        profile: user.profile ? Object.keys(user.profile || {}) : 'not found'
      });
      
      return {
        schemaVersion: "1.0.0",
        user: user
      };
    }
    
    console.warn('[getUserByFid] Пользователь не найден для FID', normalizedFid);
    return null;
  } catch (error) {
    console.error('[getUserByFid] Ошибка при запросе к Neynar API для FID', normalizedFid, ':', error);
    
    // Детальное логирование ошибки
    let errorDetails = {};
    if (error.response) {
      errorDetails = {
        type: 'response_error',
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers
      };
      console.error('[getUserByFid] Детали ошибки ответа:', errorDetails);
    } else if (error.request) {
      errorDetails = {
        type: 'request_error',
        message: 'Запрос был отправлен, но ответа не получено',
        request: error.request
      };
      console.error('[getUserByFid] Запрос был отправлен, но ответа не получено:', errorDetails);
    } else {
      errorDetails = {
        type: 'setup_error',
        message: error.message
      };
      console.error('[getUserByFid] Ошибка при настройке запроса:', errorDetails);
    }
    
    // Логируем в debug панель, если доступна
    if (typeof window !== 'undefined' && window.addDebugLog) {
      window.addDebugLog(`❌ [getUserByFid] Ошибка для FID ${normalizedFid}`, {
        error: error.message,
        ...errorDetails
      });
    }
    
    return null;
  }
}

// Поиск пользователя по username
export async function searchUserByUsername(username) {
  // Поиск по username — только чтение, signer не требуется
  if (isMockForRead()) {
    // В mock режиме генерируем данные на основе username
    const usernameHash = username.toLowerCase().split('').reduce((hash, char) => {
      return ((hash << 5) - hash) + char.charCodeAt(0);
    }, 0);
    const fid = 10000 + Math.abs(usernameHash % 90000);
    return {
      schemaVersion: "1.0.0",
      user: {
        fid: fid,
        username: username.toLowerCase(),
        display_name: username.charAt(0).toUpperCase() + username.slice(1),
        pfp_url: "/assets/images/hero.jpg"
      }
    };
  }

  try {
    // Neynar API endpoint для поиска пользователя по username
    const response = await axios.get(`${NEYNAR_BASE_URL}/farcaster/user/by_username`, {
      params: { username: username.replace('@', '') }, // Убираем @ если есть
      headers: { 'api_key': NEYNAR_API_KEY }
    });
    
    if (response.data?.result?.user) {
      return {
        schemaVersion: "1.0.0",
        user: response.data.result.user
      };
    }
    
    return null;
  } catch (error) {
    console.error("Error searching user by username:", error);
    if (error.response?.status === 404) {
      return null; // Пользователь не найден
    }
    throw error;
  }
}

// Публикация инвайта
export async function publishInvite(invitePayload) {
  if (isMock()) {
    return {
      schemaVersion: "1.0.0",
      status: "mock_ok",
      castId: "mock-cast-" + Math.random().toString(36).slice(2)
    };
  }

  try {
    // Формируем текст cast
    let castText = `🎮 Приглашение в игру Krestiki Noliki!\n\nMatch ID: ${invitePayload.matchId}\nПравила: ${JSON.stringify(invitePayload.rules)}\nВидимость: ${invitePayload.visibility}`;
    
    // Если есть кастомный текст, используем его
    if (invitePayload.text) {
      castText = invitePayload.text;
    }
    
    const castData = {
      signer_uuid: NEYNAR_SIGNER_UUID,
      text: castText,
      embeds: [{
        url: window.location.origin
      }]
    };
    
    // Если есть упоминания, добавляем их
    if (invitePayload.mentions && Array.isArray(invitePayload.mentions)) {
      castData.mentions = invitePayload.mentions;
    }
    
    const response = await axios.post(`${NEYNAR_BASE_URL}/farcaster/cast`, castData, {
      headers: { 
        'api_key': NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    return {
      schemaVersion: "1.0.0",
      status: "ok",
      castId: response.data.cast.hash
    };
  } catch (error) {
    console.error("Error publishing invite:", error);
    throw new Error("Не удалось опубликовать инвайт");
  }
}

// Чтение ответов по треду
export async function listThreadReplies(castId) {
  if (isMock()) {
    return {
      schemaVersion: "1.0.0",
      replies: []
    };
  }

  try {
    const response = await axios.get(`${NEYNAR_BASE_URL}/farcaster/feed/cast`, {
      params: { 
        identifier: castId,
        type: "cast_id"
      },
      headers: { 'api_key': NEYNAR_API_KEY }
    });
    
    return {
      schemaVersion: "1.0.0",
      replies: response.data.cast.replies || []
    };
  } catch (error) {
    console.error("Error fetching replies:", error);
    throw new Error("Не удалось получить ответы");
  }
}

// Публикация результата матча
export async function publishMatchResult(resultPayload) {
  if (isMock()) {
    return {
      schemaVersion: "1.0.0",
      status: "mock_ok",
      castId: "mock-result-" + Math.random().toString(36).slice(2)
    };
  }

  try {
    const winnerText = resultPayload.winner ? `Победитель: ${resultPayload.winner}` : "Ничья";
    const text = `🏆 Результат матча Krestiki Noliki!\n\n${winnerText}\nХодов: ${resultPayload.movesCount}\nДлительность: ${Math.round(resultPayload.durationMs / 1000)}с\nMatch ID: ${resultPayload.matchId}`;
    
    const response = await axios.post(`${NEYNAR_BASE_URL}/farcaster/cast`, {
      signer_uuid: NEYNAR_SIGNER_UUID,
      text,
      embeds: [{
        url: window.location.origin
      }]
    }, {
      headers: { 
        'api_key': NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    return {
      schemaVersion: "1.0.0",
      status: "ok",
      castId: response.data.cast.hash
    };
  } catch (error) {
    console.error("Error publishing result:", error);
    throw new Error("Не удалось опубликовать результат");
  }
}
