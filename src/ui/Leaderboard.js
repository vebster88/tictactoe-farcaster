import { getUserByFid, getUsersByFids } from "../farcaster/client.js";
import { normalizeFidToNumber } from "../utils/normalize.js";
import { getAnonIdFromFid } from "../utils/fid-helpers.js";

// Функция для определения iOS устройства
function isIOSDevice() {
  if (typeof window === 'undefined' || !window.navigator) {
    return false;
  }

  const ua = window.navigator.userAgent || '';
  const platform = window.navigator.platform || '';

  // Классическое определение iPhone/iPad/iPod
  const isClassicIOS = /iPad|iPhone|iPod/.test(ua) || /iPad|iPhone|iPod/.test(platform);

  // iPadOS 13+ маскируется под macOS (Macintosh), но имеет touch‑события
  let isIPadOS = false;
  try {
    isIPadOS = /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
  } catch (e) {
    isIPadOS = false;
  }

  return (isClassicIOS || isIPadOS) && !window.MSStream;
}

// Функция для определения, работает ли приложение в Mini-app (Farcaster/Warpcast)
function isMiniApp() {
  if (typeof window === 'undefined') {
    return false;
  }

  const ua = window.navigator.userAgent || '';

  // Признак Warpcast/Farcaster клиента по User-Agent
  const isWarpcast = /Warpcast/i.test(ua);

  // Безопасная проверка, что мы в iframe (может быть cross-origin)
  let isInFrame = false;
  try {
    isInFrame = window.self !== window.top;
  } catch (e) {
    // Если доступ к window.top заблокирован, почти наверняка мы в iframe
    isInFrame = true;
  }

  // Этого достаточно для наших логов, без доступа к window.parent.*
  return isWarpcast || isInFrame;
}

// Функция для добавления логов в debug панель (если доступна)
function addDebugLog(message, data = null) {
  // Проверяем, доступна ли функция addDebugLog через window
  if (typeof window !== 'undefined' && window.addDebugLog) {
    window.addDebugLog(message, data);
  }
  // Также выводим в консоль для отладки
  if (data !== null && data !== undefined) {
    console.log(`[Leaderboard] ${message}`, data);
  } else {
    console.log(`[Leaderboard] ${message}`);
  }
}

// Функция для определения, являются ли данные моковыми (не из реального Farcaster)
function isMockData(userData, fid) {
  if (!userData || !userData.user) {
    return true;
  }
  
  const pfp_url = userData.user.pfpUrl || userData.user.pfp_url || userData.user.pfp || null;
  const username = userData.user.username || null;
  
  // Моковые данные имеют:
  // 1. pfp_url === "/assets/images/hero.jpg"
  // 2. username === `user${fidHash}` где fidHash = Math.abs(fid) % 10000
  const fidHash = Math.abs(fid) % 10000;
  const expectedMockUsername = `user${fidHash}`;
  
  const isMockPfp = pfp_url === "/assets/images/hero.jpg";
  const isMockUsername = username === expectedMockUsername;
  
  // Если оба условия выполнены - это точно моковые данные
  // Если хотя бы одно условие не выполнено - это реальные данные из Neynar API
  const isMock = isMockPfp && isMockUsername;
  
  // ВАЖНО: Проверка на username вида !{fid} должна быть ПЕРВОЙ
  // Это означает, что у пользователя нет нормального username
  // Такие пользователи считаются не-Farcaster (были сгенерированы нами ранее)
  // Нормализуем оба значения к строке для корректного сравнения
  const fidNum = Number(fid);
  const fidStr = String(fidNum);
  const usernameStr = String(username || '');
  // Проверяем оба варианта: !22575 и !{fid} (на случай разных форматов)
  const isFidBasedUsername = usernameStr === `!${fidStr}` || 
                             usernameStr === `!${fidNum}` ||
                             (typeof fid === 'string' && usernameStr === `!${fid}`);
  
  if (isFidBasedUsername) {
    return true; // Это не-Farcaster пользователь с сгенерированным FID (даже если есть реальный CDN URL)
  }
  
  // Дополнительная проверка: если pfp_url содержит "imagedelivery.net" или другие реальные CDN,
  // это точно не моковые данные, даже если username совпадает
  const hasRealCdnUrl = pfp_url && typeof pfp_url === 'string' && 
    (pfp_url.includes('imagedelivery.net') || 
     pfp_url.includes('cloudinary.com') || 
     pfp_url.includes('ipfs.io') ||
     (pfp_url.startsWith('http') && !pfp_url.includes('/assets/images/hero.jpg')));
  
  if (hasRealCdnUrl) {
    return false; // Реальные данные из CDN (только если username не начинается с !)
  }
  
  return isMock;
}

// Функция getAnonIdFromFid импортируется из utils/fid-helpers.js

// Rate limiting для Neynar API (6 запросов в 60 секунд для FREE плана)
let requestTimestamps = [];
const MAX_REQUESTS_PER_WINDOW = 5; // Оставляем запас
const WINDOW_MS = 60000; // 60 секунд

// Кэширование и защита от повторных запросов
let leaderboardCache = null;
let leaderboardCacheTime = 0;
let leaderboardLoading = false;
const LEADERBOARD_CACHE_TTL = 30000; // 30 секунд

async function waitForRateLimit() {
  const now = Date.now();
  // Очищаем старые временные метки (старше 60 секунд)
  requestTimestamps = requestTimestamps.filter(ts => (now - ts) < WINDOW_MS);
  
  // Если достигнут лимит, ждем
  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldestRequest = Math.min(...requestTimestamps);
    const waitTime = WINDOW_MS - (now - oldestRequest) + 1000; // +1 секунда запас
    addDebugLog(`⏳ Rate limit: ждем ${Math.ceil(waitTime / 1000)} секунд перед следующим запросом`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    // Рекурсивно проверяем снова после ожидания
    return waitForRateLimit();
  }
  
  // Регистрируем новый запрос
  requestTimestamps.push(Date.now());
}

export async function loadLeaderboard() {
  // Проверяем кэш
  const now = Date.now();
  if (leaderboardCache && (now - leaderboardCacheTime) < LEADERBOARD_CACHE_TTL) {
    addDebugLog('📦 Используем кэшированные данные лидерборда');
    return leaderboardCache;
  }
  
  // Защита от повторных запросов
  if (leaderboardLoading) {
    addDebugLog('⏳ Лидерборд уже загружается, ждем...');
    // Ждем завершения текущего запроса
    while (leaderboardLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // После завершения проверяем кэш снова
    if (leaderboardCache) {
      return leaderboardCache;
    }
  }
  
  leaderboardLoading = true;
  
  try {
    const lang = localStorage.getItem("language") || "en";
    // Определяем базовый URL для API: используем dev API если указан
    // Проверяем localStorage (для отладки) и переменную окружения
    let apiBase = window.location.origin;
    
    const devApiFromStorage = localStorage.getItem('dev_api_base');
    if (devApiFromStorage && devApiFromStorage.trim()) {
      apiBase = devApiFromStorage.trim();
      console.log('[Leaderboard] Using dev API from localStorage:', apiBase);
    } else if (import.meta?.env?.VITE_DEV_API_BASE && import.meta.env.VITE_DEV_API_BASE.trim()) {
      apiBase = import.meta.env.VITE_DEV_API_BASE.trim();
      console.log('[Leaderboard] Using dev API from env:', apiBase);
    } else {
      console.log('[Leaderboard] Using default origin:', apiBase);
    }

    const url = `${apiBase}/api/matches/leaderboard`;
    console.log(`[Leaderboard] Fetching from: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`[Leaderboard] Response status: ${response.status}, Content-Type: ${response.headers.get('content-type')}`);
    
    // Проверяем Content-Type перед парсингом (не читая response)
    const contentType = response.headers.get("content-type") || "";
    
    // Если ответ не успешный, обрабатываем ошибку
    if (!response.ok) {
      // Читаем ответ только один раз
      if (contentType.includes("application/json")) {
        const errorData = await response.json();
        throw new Error(`Failed to fetch leaderboard: ${response.status} - ${errorData.error || response.statusText}`);
      } else {
        const text = await response.text();
        console.error(`[Leaderboard] Error ${response.status}. Response:`, text.substring(0, 500));
        
        // Если это HTML (404 или другая ошибка), пробуем fallback
        if (contentType.includes("text/html") && apiBase !== window.location.origin) {
          console.log(`[Leaderboard] Dev API returned HTML, trying fallback to ${window.location.origin}`);
          return await loadLeaderboardFallback();
        }
        
        throw new Error(`Failed to fetch leaderboard: ${response.status} - ${response.statusText}`);
      }
    }
    
    // Проверяем Content-Type для успешного ответа
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      console.error(`[Leaderboard] Expected JSON but got ${contentType}. First 500 chars:`, text.substring(0, 500));
      
      // Если это HTML, пробуем fallback
      if (contentType.includes("text/html") && apiBase !== window.location.origin) {
        console.log(`[Leaderboard] Dev API returned HTML, trying fallback to ${window.location.origin}`);
        return await loadLeaderboardFallback();
      }
      
      throw new Error(`Server returned ${contentType} instead of JSON. Status: ${response.status}`);
    }
    
    // Теперь безопасно парсим JSON (response еще не прочитан)
    const data = await response.json();
    const leaderboard = data.leaderboard || [];
    
    console.log(`[Leaderboard] Loaded ${leaderboard.length} entries`);
    
    // Загружаем информацию о пользователях для каждого FID используя batch-запрос
    addDebugLog(`📊 Начинаем загрузку данных пользователей для ${leaderboard.length} записей`);
    
    // Собираем все FID
    const fids = leaderboard.map(entry => entry.fid);
    
    // Используем rate limiting перед batch-запросом
    await waitForRateLimit();
    
    // Делаем один batch-запрос для всех FID
    const allUserData = await getUsersByFids(fids);
    
    // Создаем Map для быстрого поиска данных по FID
    // ВАЖНО: Нормализуем FID к числам для корректного сравнения (работает с виртуальными FID)
    const userDataMap = new Map();
    fids.forEach((fid, index) => {
      if (allUserData[index]) {
        // Используем normalizeFidToNumber для работы с виртуальными FID (V prefix)
        const normalizedFid = normalizeFidToNumber(fid);
        if (normalizedFid !== null) {
          userDataMap.set(normalizedFid, allUserData[index]);
          // Также добавляем оригинальный FID для совместимости
          userDataMap.set(fid, allUserData[index]);
          userDataMap.set(String(fid), allUserData[index]);
        }
      }
    });
    
    // Обрабатываем каждую запись лидерборда
    const leaderboardWithUsers = leaderboard.map((entry) => {
      // Используем normalizeFidToNumber для работы с виртуальными FID
      const normalizedEntryFid = normalizeFidToNumber(entry.fid);
      let userData = normalizedEntryFid !== null ? userDataMap.get(normalizedEntryFid) : null;
      // Если не нашли по нормализованному, пробуем по оригинальному
      if (!userData) {
        userData = userDataMap.get(entry.fid) || userDataMap.get(String(entry.fid));
      }
      
      // Проверяем, что данные получены
      if (!userData || !userData.user) {
        // Если данных нет, считаем не-Farcaster пользователем
        const anonId = getAnonIdFromFid(entry.fid);
        return {
          ...entry,
          username: `user${anonId}`,
          display_name: null,
          pfp_url: "/assets/images/hero.jpg"
        };
      }
      
      // Определяем, являются ли данные моковыми (не-Farcaster пользователь)
      const isMock = isMockData(userData, entry.fid);
      
      if (isMock) {
        // Не-Farcaster пользователь: используем @userXX где XX - стабильный anonId
        const anonId = getAnonIdFromFid(entry.fid);
        const finalUsername = `user${anonId}`;
        
        return {
          ...entry,
          username: finalUsername,
          display_name: null,
          pfp_url: "/assets/images/hero.jpg"
        };
      }
      
      // Farcaster пользователь: используем реальные данные из API
      // Извлекаем username из данных пользователя
      // Проверяем все возможные варианты и убеждаемся, что это не пустая строка
      const username = (userData.user.username && 
                       typeof userData.user.username === 'string' && 
                       userData.user.username.trim().length > 0) 
                       ? userData.user.username.trim() 
                       : null;
      
      // Если username отсутствует, создаем его на основе FID (fallback для Farcaster)
      const finalUsername = username || `user${entry.fid}`;
      
      // Извлекаем pfp_url - проверяем все возможные варианты
      // ВАЖНО: Neynar API возвращает pfpUrl (camelCase), поэтому проверяем его ПЕРВЫМ
      const pfp_url = userData?.user?.pfpUrl || 
                     userData?.user?.pfp_url || 
                     userData?.user?.pfp || 
                     (userData?.user?.profile?.pfpUrl) ||
                     (userData?.user?.profile?.pfp_url) ||
                     null;
      
      // Извлекаем display_name - проверяем оба варианта (camelCase и snake_case)
      const display_name = userData?.user?.displayName || 
                          userData?.user?.display_name || 
                          null;
      
      return {
        ...entry,
        username: finalUsername,
        display_name: display_name,
        pfp_url: pfp_url
      };
    });
    
    addDebugLog(`✅ Загрузка данных пользователей завершена. Загружено: ${leaderboardWithUsers.length} записей`);
    
    // Сохраняем в кэш
    leaderboardCache = leaderboardWithUsers;
    leaderboardCacheTime = Date.now();
    
    return leaderboardWithUsers;
  } catch (error) {
    console.error("Error loading leaderboard:", error);
    
    // В случае ошибки очищаем кэш
    leaderboardCache = null;
    leaderboardCacheTime = 0;
    
    // Fallback на текущий origin если dev API недоступен
    if (error.message?.includes('fetch') || error.message?.includes('CORS') || error.message?.includes('HTML')) {
      console.log(`[Leaderboard] Network error, trying fallback to ${window.location.origin}`);
      const fallbackResult = await loadLeaderboardFallback();
      // Сохраняем fallback результат в кэш
      if (fallbackResult && fallbackResult.length > 0) {
        leaderboardCache = fallbackResult;
        leaderboardCacheTime = Date.now();
      }
      return fallbackResult;
    }
    
    return [];
  } finally {
    // Сбрасываем флаг загрузки
    leaderboardLoading = false;
  }
}

// Функция для очистки кэша (можно вызвать при необходимости)
export function clearLeaderboardCache() {
  leaderboardCache = null;
  leaderboardCacheTime = 0;
  addDebugLog('🗑️ Кэш лидерборда очищен');
}

// Fallback функция для загрузки с текущего origin
async function loadLeaderboardFallback() {
  try {
    const url = `${window.location.origin}/api/matches/leaderboard`;
    console.log(`[Leaderboard] Fallback: Fetching from: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Fallback failed: ${response.status}`);
    }
    
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Fallback returned ${contentType} instead of JSON`);
    }
    
    const data = await response.json();
    const leaderboard = data.leaderboard || [];
    
    // Загружаем информацию о пользователях используя batch-запрос
    addDebugLog(`📊 Fallback: Начинаем загрузку данных пользователей для ${leaderboard.length} записей`);
    
    // Собираем все FID
    const fids = leaderboard.map(entry => entry.fid);
    
    // Используем rate limiting перед batch-запросом
    await waitForRateLimit();
    
    // Делаем один batch-запрос для всех FID
    const allUserData = await getUsersByFids(fids);
    
    // Создаем Map для быстрого поиска данных по FID
    // ВАЖНО: Нормализуем FID к числам для корректного сравнения (работает с виртуальными FID)
    const userDataMap = new Map();
    fids.forEach((fid, index) => {
      if (allUserData[index]) {
        // Используем normalizeFidToNumber для работы с виртуальными FID (V prefix)
        const normalizedFid = normalizeFidToNumber(fid);
        if (normalizedFid !== null) {
          userDataMap.set(normalizedFid, allUserData[index]);
          // Также добавляем оригинальный FID для совместимости
          userDataMap.set(fid, allUserData[index]);
          userDataMap.set(String(fid), allUserData[index]);
        }
      }
    });
    
    // Обрабатываем каждую запись лидерборда
    return leaderboard.map((entry) => {
      // Используем normalizeFidToNumber для работы с виртуальными FID
      const normalizedEntryFid = normalizeFidToNumber(entry.fid);
      let userData = normalizedEntryFid !== null ? userDataMap.get(normalizedEntryFid) : null;
      // Если не нашли по нормализованному, пробуем по оригинальному
      if (!userData) {
        userData = userDataMap.get(entry.fid) || userDataMap.get(String(entry.fid));
      }
      
      // Проверяем, что данные получены
      if (!userData || !userData.user) {
        // Если данных нет, считаем не-Farcaster пользователем
        const anonId = getAnonIdFromFid(entry.fid);
        return {
          ...entry,
          username: `user${anonId}`,
          display_name: null,
          pfp_url: "/assets/images/hero.jpg"
        };
      }
      
      // Определяем, являются ли данные моковыми (не-Farcaster пользователь)
      const isMock = isMockData(userData, entry.fid);
      
      if (isMock) {
        // Не-Farcaster пользователь: используем @userXX где XX - стабильный anonId
        const anonId = getAnonIdFromFid(entry.fid);
        const finalUsername = `user${anonId}`;
        
        return {
          ...entry,
          username: finalUsername,
          display_name: null,
          pfp_url: "/assets/images/hero.jpg"
        };
      }
      
      // Farcaster пользователь: используем реальные данные из API
      // Извлекаем username - проверяем все возможные поля и убеждаемся, что это не пустая строка
      const username = (userData.user.username && 
                       typeof userData.user.username === 'string' && 
                       userData.user.username.trim().length > 0) 
                       ? userData.user.username.trim() 
                       : null;
      
      // Если username отсутствует, создаем его на основе FID (fallback для Farcaster)
      const finalUsername = username || `user${entry.fid}`;
      
      
      // Извлекаем pfp_url - проверяем все возможные варианты
      // ВАЖНО: Neynar API возвращает pfpUrl (camelCase), поэтому проверяем его ПЕРВЫМ
      const pfp_url = userData?.user?.pfpUrl || 
                     userData?.user?.pfp_url || 
                     userData?.user?.pfp || 
                     (userData?.user?.profile?.pfpUrl) ||
                     (userData?.user?.profile?.pfp_url) ||
                     null;
      
      // Извлекаем display_name - проверяем оба варианта (camelCase и snake_case)
      const display_name = userData?.user?.displayName || 
                          userData?.user?.display_name || 
                          null;
      
      return {
        ...entry,
        username: finalUsername,
        display_name: display_name,
        pfp_url: pfp_url
      };
    });
  } catch (error) {
    console.error("[Leaderboard] Fallback also failed:", error);
    return [];
  }
}

export function renderLeaderboard(leaderboard, container) {
  const lang = localStorage.getItem("language") || "en";
  
  if (!container) {
    console.error("Leaderboard container not found");
    return;
  }
  
  container.innerHTML = "";
  
  if (leaderboard.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--muted);">
        ${lang === "ru" ? "Нет данных для отображения" : "No data to display"}
      </div>
    `;
    return;
  }
  
  // Определяем, мобильное ли устройство
  const isMobile = window.innerWidth <= 768;
  
  // Создаем обертку для таблицы с прокруткой
  const tableWrapper = document.createElement("div");
  tableWrapper.style.cssText = `
    width: 100%;
    overflow-x: auto;
    overflow-y: visible;
    -webkit-overflow-scrolling: touch;
  `;
  
  // Создаем таблицу
  const table = document.createElement("table");
  const tableFontSize = isMobile ? '0.8rem' : '0.9rem';
  const tablePadding = isMobile ? '8px 4px' : '12px 8px';
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: ${tableFontSize};
    table-layout: fixed;
    box-sizing: border-box;
  `;
  
  // Заголовок таблицы
  const thead = document.createElement("thead");
  const rankWidth = isMobile ? '35px' : '45px';
  const statsWidth = isMobile ? '55px' : '70px';
  thead.innerHTML = `
    <tr style="border-bottom: 2px solid rgba(255, 255, 255, 0.2);">
      <th style="text-align: center; padding: ${tablePadding}; font-weight: 600; width: ${rankWidth}; box-sizing: border-box;">#</th>
      <th style="text-align: left; padding: ${tablePadding}; font-weight: 600; box-sizing: border-box;">${lang === "ru" ? "Игрок" : "Player"}</th>
      <th style="text-align: center; padding: ${tablePadding}; font-weight: 600; width: ${statsWidth}; box-sizing: border-box;">${lang === "ru" ? "Победы" : "Wins"}</th>
      <th style="text-align: center; padding: ${tablePadding}; font-weight: 600; width: ${statsWidth}; box-sizing: border-box;">${lang === "ru" ? "Ничья" : "Draws"}</th>
      <th style="text-align: center; padding: ${tablePadding}; font-weight: 600; width: ${statsWidth}; box-sizing: border-box;">${lang === "ru" ? "Поражения" : "Losses"}</th>
    </tr>
  `;
  table.appendChild(thead);
  
  // Тело таблицы
  const tbody = document.createElement("tbody");
  leaderboard.forEach((entry, index) => {
    const row = document.createElement("tr");
    row.style.cssText = `
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      transition: background 0.2s;
    `;
    row.addEventListener("mouseenter", () => {
      row.style.background = "rgba(255, 255, 255, 0.1)";
    });
    row.addEventListener("mouseleave", () => {
      row.style.background = "transparent";
    });
    
    // Всегда показываем username в формате @username
    // username уже гарантированно есть (либо из API, либо сгенерирован как user{fid})
    const playerName = `@${entry.username}`;
    
    // Нормализуем URL аватара: если это относительный путь, добавляем origin
    let avatarUrl = entry.pfp_url || null;
    if (avatarUrl && avatarUrl.startsWith('/')) {
      avatarUrl = window.location.origin + avatarUrl;
    }
    
    // Функция для создания Canvas аватара с Retina поддержкой
    // Используется для улучшения качества изображений, особенно Cloudflare Images
    function createCanvasAvatar(img, displaySize, playerName) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const size = displaySize;
      
      // Увеличиваем размер canvas для Retina (x2 для супер-качества)
      canvas.width = size * dpr * 2;
      canvas.height = size * dpr * 2;
      canvas.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.2);
        flex-shrink: 0;
        display: block;
      `;
      
      // Настройки сглаживания для высокого качества
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // Рисуем круг + изображение
      ctx.save();
      ctx.beginPath();
      ctx.arc(size * dpr, size * dpr, size * dpr, 0, Math.PI * 2);
      ctx.clip();
      
      // Масштабируем изображение правильно (квадрат)
      const drawSize = Math.min(img.naturalWidth, img.naturalHeight);
      const sourceX = (img.naturalWidth - drawSize) / 2;
      const sourceY = (img.naturalHeight - drawSize) / 2;
      
      ctx.drawImage(
        img,
        sourceX, sourceY, drawSize, drawSize,
        0, 0, size * dpr * 2, size * dpr * 2
      );
      ctx.restore();
      
      return canvas;
    }
    
    const rank = index + 1; // Номер в списке (начинается с 1)
    
    // Создаем ячейки
    const rankCell = document.createElement("td");
    rankCell.style.cssText = "text-align: center; padding: 12px 8px; color: var(--muted); font-weight: 600;";
    rankCell.textContent = rank;
    
    const playerCell = document.createElement("td");
    playerCell.style.cssText = "padding: 12px 8px;";
    
    const playerDiv = document.createElement("div");
    const avatarGap = isMobile ? '6px' : '8px';
    const avatarSize = isMobile ? '28px' : '32px';
    playerDiv.style.cssText = `display: flex; align-items: center; gap: ${avatarGap}; min-width: 0;`;
    
    // Создаем элемент аватара программно для лучшей обработки ошибок
    if (avatarUrl) {
      // Используем оригинальный URL (Cloudflare Images с /public не работает)
      // Применяем Canvas fallback для улучшения качества
      const displaySize = parseInt(avatarSize);
      const isCloudflareImages = avatarUrl.includes('imagedelivery.net');
      const isMiniAppEnv = isMiniApp();
      const isIOS = isIOSDevice();
      
      const avatarImg = document.createElement("img");
      avatarImg.alt = playerName;
      // CSS для фото: убираем crisp-edges (портит фото при даунскейле)
      // crisp-edges хорош для пиксель-арта, но создает артефакты на фото при сильном масштабировании
      // Используем сглаживание для лучшего качества фото
      avatarImg.style.cssText = `width: ${avatarSize}; height: ${avatarSize}; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255, 255, 255, 0.2); flex-shrink: 0; image-rendering: auto; image-rendering: -webkit-optimize-contrast; image-rendering: high-quality;`;
      
      // Определяем, является ли URL внешним доменом
      const isExternalUrl = avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://');
      const isSameOrigin = isExternalUrl && avatarUrl.startsWith(window.location.origin);
      
      // Устанавливаем crossOrigin только для нашего origin
      // Для внешних доменов явно не устанавливаем crossOrigin (не null, а просто не устанавливаем)
      // Это важно для некоторых CDN, включая Cloudflare Images
      if (isSameOrigin) {
        // Для нашего origin используем crossOrigin для безопасности
        avatarImg.crossOrigin = "anonymous";
      } else {
        // Для внешних доменов явно не устанавливаем crossOrigin
        // Это важно для некоторых CDN
        avatarImg.removeAttribute('crossorigin');
      }
      
      // Устанавливаем loading до добавления в DOM
      avatarImg.loading = "lazy";
      
      // Специальный упрощенный режим для Mini-app (Warpcast/Farcaster) —
      // используем максимально простой <img>, без canvas и сложных обработчиков,
      // чтобы повторить поведение "как раньше", когда все работало в мини‑аппах.
      if (isMiniAppEnv) {
        playerDiv.appendChild(avatarImg);

        const startLogData = {
          platform: isIOS ? 'iOS' : 'other',
          isMiniApp: isMiniAppEnv,
          userAgent: window.navigator?.userAgent || 'unknown',
          playerName: playerName,
          avatarUrl: avatarUrl,
          displaySize: displaySize,
          crossOrigin: avatarImg.crossOrigin || 'not set',
          isExternal: isExternalUrl,
          isSameOrigin: isSameOrigin,
          isCloudflareImages: isCloudflareImages,
          loading: avatarImg.loading || 'not set',
          mode: 'simple-img-mini-app',
          timestamp: new Date().toISOString()
        };
        addDebugLog(`🔄 [Mini-app Avatar Simple] Используем простой <img> для @${playerName}`, startLogData);

        avatarImg.src = avatarUrl;
        // В упрощенном режиме не полагаемся на onload/onerror и canvas —
        // WebView сам отрисует то, что сможет (как это было до наших изменений).
        // НЕ делаем return — продолжаем создавать остальные ячейки таблицы ниже.
      }
      
      // ВАЖНО: Устанавливаем обработчики ДО добавления в DOM и ДО установки src
      // Это гарантирует, что все обработчики будут готовы к моменту начала загрузки
      
      // Обработка успешной загрузки
      avatarImg.onload = () => {
        // Вычисляем коэффициент масштабирования для диагностики качества
        const displaySize = parseInt(avatarSize);
        const scaleFactor = avatarImg.naturalWidth / displaySize;
        const isLowQuality = scaleFactor < 1.5; // Если исходное изображение меньше чем 1.5x от отображаемого размера
        
        // Дополнительная диагностика качества
        const computedStyle = window.getComputedStyle(avatarImg);
        const imageRendering = computedStyle.imageRendering;
        const pixelRatio = window.devicePixelRatio || 1;
        const scaleDownRatio = avatarImg.naturalWidth / displaySize; // Во сколько раз браузер уменьшает изображение
        
        if (isMiniAppEnv) {
          const logData = {
            platform: isIOS ? 'iOS' : 'other',
            isMiniApp: isMiniAppEnv,
            userAgent: window.navigator?.userAgent || 'unknown',
            playerName: playerName,
            avatarUrl: avatarUrl,
            displaySize: displaySize,
            naturalWidth: avatarImg.naturalWidth,
            naturalHeight: avatarImg.naturalHeight,
            scaleFactor: scaleFactor,
            scaleDownRatio: scaleDownRatio,
            pixelRatio: pixelRatio,
            crossOrigin: avatarImg.crossOrigin || 'not set',
            isExternal: isExternalUrl,
            isSameOrigin: isSameOrigin,
            isCloudflareImages: isCloudflareImages,
            complete: avatarImg.complete,
            imageRendering: imageRendering,
            timestamp: new Date().toISOString()
          };
          addDebugLog(`📱 [Mini-app Avatar Load] Успешная загрузка для @${playerName}`, logData);
        }
        
        // Для Cloudflare Images используем Canvas для улучшения качества
        if (isCloudflareImages && scaleDownRatio > 3) {
          try {
            const canvas = createCanvasAvatar(avatarImg, displaySize, playerName);
            // Заменяем img на canvas
            avatarImg.replaceWith(canvas);
            
            return; // Выходим, так как canvas уже заменен
          } catch (e) {
            console.warn('[Leaderboard] Failed to create canvas avatar:', e);
            // Продолжаем с обычным img, если canvas не удался
          }
        }
        
      };
      
      // Обработка ошибки загрузки с детальным логированием
      avatarImg.onerror = (e) => {
        // Детальное логирование для Mini-app окружения (включая iOS)
        if (isMiniAppEnv) {
          // Безопасное получение parent origin (может быть заблокировано политикой безопасности)
          let parentOrigin = 'same-origin';
          try {
            if (window.parent && window.parent !== window.self) {
              parentOrigin = window.parent.location.origin;
            }
          } catch (securityError) {
            parentOrigin = 'cross-origin (blocked)';
          }

          const errorData = {
            platform: isIOS ? 'iOS' : 'other',
            isMiniApp: isMiniAppEnv,
            userAgent: window.navigator?.userAgent || 'unknown',
            playerName: playerName,
            avatarUrl: avatarUrl,
            error: e?.type || 'unknown',
            crossOrigin: avatarImg.crossOrigin || 'not set',
            isExternal: isExternalUrl,
            isSameOrigin: isSameOrigin,
            complete: avatarImg.complete,
            naturalWidth: avatarImg.naturalWidth,
            naturalHeight: avatarImg.naturalHeight,
            isCloudflareImages: isCloudflareImages,
            errorType: avatarImg.complete && avatarImg.naturalWidth === 0 
              ? 'Image load error - zero size' 
              : 'Image load error - network/failed',
            timestamp: new Date().toISOString(),
            // Дополнительная диагностика для iOS
            windowLocation: window.location?.href || 'unknown',
            windowOrigin: window.location?.origin || 'unknown',
            isInFrame: window.self !== window.top,
            parentOrigin: parentOrigin
          };
          addDebugLog(`❌ [Mini-app Avatar Error] Ошибка загрузки для @${playerName}`, errorData);
        }
        
        // Проверяем, действительно ли произошла ошибка или это ложное срабатывание
        if (avatarImg.complete && avatarImg.naturalWidth === 0) {
          // Изображение помечено как загруженное, но имеет нулевой размер - это ошибка
          
          // Пробуем загрузить дефолтную аватарку
          const fallbackUrl = window.location.origin + "/assets/images/hero.jpg";
          avatarImg.onerror = null; // Убираем обработчик, чтобы избежать бесконечного цикла
          avatarImg.crossOrigin = "anonymous"; // Для локального файла можно использовать crossOrigin
          avatarImg.src = fallbackUrl;
        } else {
          // Обычная ошибка загрузки
          
          // Пробуем загрузить дефолтную аватарку
          const fallbackUrl = window.location.origin + "/assets/images/hero.jpg";
          avatarImg.onerror = null; // Убираем обработчик, чтобы избежать бесконечного цикла
          avatarImg.crossOrigin = "anonymous"; // Для локального файла можно использовать crossOrigin
          avatarImg.src = fallbackUrl;
        }
        
        // Общее логирование для всех платформ
        console.warn(`[Leaderboard] Failed to load avatar for ${playerName}:`, avatarUrl, {
          crossOrigin: avatarImg.crossOrigin || 'not set',
          isExternal: isExternalUrl,
          isSameOrigin: isSameOrigin,
          complete: avatarImg.complete,
          naturalWidth: avatarImg.naturalWidth,
          naturalHeight: avatarImg.naturalHeight
        });
      };
      
      // ВАЖНО: Правильный порядок операций для оптимальной загрузки изображения:
      // 1. Все атрибуты установлены (style, crossOrigin, loading)
      // 2. Все обработчики установлены (onload, onerror)
      // 3. Добавляем в DOM
      // 4. Устанавливаем src (это запускает загрузку)
      playerDiv.appendChild(avatarImg);
      
      // Устанавливаем src СРАЗУ после добавления в DOM
      // Не используем requestAnimationFrame, так как элемент уже в DOM и готов к загрузке
      avatarImg.src = avatarUrl;
      
    }
    
    const usernameSpan = document.createElement("span");
    usernameSpan.textContent = playerName;
    usernameSpan.style.cssText = "overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;";
    playerDiv.appendChild(usernameSpan);
    playerCell.appendChild(playerDiv);
    
    const winsCell = document.createElement("td");
    winsCell.style.cssText = `text-align: center; padding: ${tablePadding}; color: var(--win); font-weight: 600; box-sizing: border-box;`;
    winsCell.textContent = entry.wins || 0;
    
    const drawsCell = document.createElement("td");
    drawsCell.style.cssText = `text-align: center; padding: ${tablePadding}; color: var(--muted); box-sizing: border-box;`;
    drawsCell.textContent = entry.draws || 0;
    
    const lossesCell = document.createElement("td");
    lossesCell.style.cssText = `text-align: center; padding: ${tablePadding}; color: var(--lose); box-sizing: border-box;`;
    lossesCell.textContent = entry.losses || 0;
    
    row.appendChild(rankCell);
    row.appendChild(playerCell);
    row.appendChild(winsCell);
    row.appendChild(drawsCell);
    row.appendChild(lossesCell);
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);
}



