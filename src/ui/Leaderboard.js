import { getUserByFid, getUsersByFids } from "../farcaster/client.js";

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
  
  // Дополнительная проверка: если pfp_url содержит "imagedelivery.net" или другие реальные CDN,
  // это точно не моковые данные, даже если username совпадает
  const hasRealCdnUrl = pfp_url && typeof pfp_url === 'string' && 
    (pfp_url.includes('imagedelivery.net') || 
     pfp_url.includes('cloudinary.com') || 
     pfp_url.includes('ipfs.io') ||
     (pfp_url.startsWith('http') && !pfp_url.includes('/assets/images/hero.jpg')));
  
  if (hasRealCdnUrl) {
    return false; // Реальные данные из CDN
  }
  
  // Проверка на username вида !{fid} - это означает, что у пользователя нет нормального username
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
    return true; // Это не-Farcaster пользователь с сгенерированным FID
  }
  
  return isMock;
}

// Функция для генерации стабильного anonId на основе FID (для не-Farcaster пользователей)
// Возвращает число от 1 до 99, которое будет одинаковым для одного и того же FID
function getAnonIdFromFid(fid) {
  // Используем простой хеш для генерации стабильного числа от 1 до 99
  const hash = Math.abs(fid) % 99;
  return hash + 1; // От 1 до 99
}

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
    addDebugLog(`🔍 Batch запрос для ${fids.length} FID: ${fids.join(', ')}`);
    const allUserData = await getUsersByFids(fids);
    
    // Создаем Map для быстрого поиска данных по FID
    const userDataMap = new Map();
    fids.forEach((fid, index) => {
      if (allUserData[index]) {
        userDataMap.set(fid, allUserData[index]);
      }
    });
    
    // Обрабатываем каждую запись лидерборда
    const leaderboardWithUsers = leaderboard.map((entry) => {
      const userData = userDataMap.get(entry.fid);
      
      // Проверяем, что данные получены
      if (!userData || !userData.user) {
        addDebugLog(`⚠️ Данные пользователя не получены для FID ${entry.fid}`, { userData });
        // Если данных нет, считаем не-Farcaster пользователем
        const anonId = getAnonIdFromFid(entry.fid);
        return {
          ...entry,
          username: `user${anonId}`,
          display_name: null,
          pfp_url: "/assets/images/hero.jpg"
        };
      }
      
      addDebugLog(`✅ Получены данные для FID ${entry.fid}`, {
        hasUserData: !!userData,
        hasUser: !!userData?.user,
        userKeys: userData?.user ? Object.keys(userData.user) : [],
        username: userData?.user?.username,
        usernameType: typeof userData?.user?.username,
        usernameValue: userData?.user?.username,
        display_name: userData?.user?.display_name,
        displayName: userData?.user?.displayName,
        pfp_url: userData?.user?.pfp_url,
        pfpUrl: userData?.user?.pfpUrl,
        pfp: userData?.user?.pfp
      });
      
      // Определяем, являются ли данные моковыми (не-Farcaster пользователь)
      const isMock = isMockData(userData, entry.fid);
      
      addDebugLog(`🔍 Проверка моковых данных для FID ${entry.fid}`, {
        isMock,
        pfp_url: userData.user.pfpUrl || userData.user.pfp_url || userData.user.pfp || null,
        username: userData.user.username || null,
        fid: entry.fid
      });
      
      if (isMock) {
        // Не-Farcaster пользователь: используем @userXX где XX - стабильный anonId
        const anonId = getAnonIdFromFid(entry.fid);
        const finalUsername = `user${anonId}`;
        
        addDebugLog(`🔷 Не-Farcaster пользователь FID ${entry.fid} - используем ${finalUsername}`, {
          anonId,
          fid: entry.fid,
          reason: 'Моковые данные определены'
        });
        
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
      
      if (!username) {
        addDebugLog(`⚠️ Username не найден для Farcaster FID ${entry.fid} - будет использован ${finalUsername}`, {
          rawUsername: userData.user.username,
          usernameType: typeof userData.user.username
        });
      } else {
        addDebugLog(`✅ Username найден для Farcaster FID ${entry.fid}: ${username}`);
      }
      
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
      
      addDebugLog(`📋 Итоговые данные для Farcaster FID ${entry.fid}`, {
        finalUsername,
        pfp_url,
        display_name
      });
      
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
    addDebugLog(`🔍 Fallback: Batch запрос для ${fids.length} FID: ${fids.join(', ')}`);
    const allUserData = await getUsersByFids(fids);
    
    // Создаем Map для быстрого поиска данных по FID
    const userDataMap = new Map();
    fids.forEach((fid, index) => {
      if (allUserData[index]) {
        userDataMap.set(fid, allUserData[index]);
      }
    });
    
    // Обрабатываем каждую запись лидерборда
    return leaderboard.map((entry) => {
      const userData = userDataMap.get(entry.fid);
      
      // Проверяем, что данные получены
      if (!userData || !userData.user) {
        addDebugLog(`⚠️ Fallback: Данные пользователя не получены для FID ${entry.fid}`, { userData });
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
      
      addDebugLog(`🔍 Fallback: Проверка моковых данных для FID ${entry.fid}`, {
        isMock,
        pfp_url: userData.user.pfpUrl || userData.user.pfp_url || userData.user.pfp || null,
        username: userData.user.username || null,
        fid: entry.fid
      });
      
      if (isMock) {
        // Не-Farcaster пользователь: используем @userXX где XX - стабильный anonId
        const anonId = getAnonIdFromFid(entry.fid);
        const finalUsername = `user${anonId}`;
        
        addDebugLog(`🔷 Fallback: Не-Farcaster пользователь FID ${entry.fid} - используем ${finalUsername}`, {
          anonId,
          fid: entry.fid,
          reason: 'Моковые данные определены'
        });
        
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
      
      if (!username) {
        addDebugLog(`⚠️ Fallback: Username не найден для Farcaster FID ${entry.fid} - будет использован ${finalUsername}`, {
          rawUsername: userData.user.username,
          usernameType: typeof userData.user.username
        });
      } else {
        addDebugLog(`✅ Fallback: Username найден для Farcaster FID ${entry.fid}: ${username}`);
      }
      
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
  
  // Создаем таблицу
  const table = document.createElement("table");
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  `;
  
  // Заголовок таблицы
  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr style="border-bottom: 2px solid rgba(255, 255, 255, 0.2);">
      <th style="text-align: center; padding: 12px 8px; font-weight: 600; width: 50px;">#</th>
      <th style="text-align: left; padding: 12px 8px; font-weight: 600;">${lang === "ru" ? "Игрок" : "Player"}</th>
      <th style="text-align: center; padding: 12px 8px; font-weight: 600;">${lang === "ru" ? "Победы" : "Wins"}</th>
      <th style="text-align: center; padding: 12px 8px; font-weight: 600;">${lang === "ru" ? "Ничья" : "Draws"}</th>
      <th style="text-align: center; padding: 12px 8px; font-weight: 600;">${lang === "ru" ? "Поражения" : "Losses"}</th>
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
    
    const rank = index + 1; // Номер в списке (начинается с 1)
    
    // Создаем ячейки
    const rankCell = document.createElement("td");
    rankCell.style.cssText = "text-align: center; padding: 12px 8px; color: var(--muted); font-weight: 600;";
    rankCell.textContent = rank;
    
    const playerCell = document.createElement("td");
    playerCell.style.cssText = "padding: 12px 8px;";
    
    const playerDiv = document.createElement("div");
    playerDiv.style.cssText = "display: flex; align-items: center; gap: 8px;";
    
    // Создаем элемент аватара программно для лучшей обработки ошибок
    if (avatarUrl) {
      const avatarImg = document.createElement("img");
      avatarImg.src = avatarUrl;
      avatarImg.alt = playerName;
      avatarImg.style.cssText = "width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255, 255, 255, 0.2);";
      avatarImg.crossOrigin = "anonymous";
      avatarImg.loading = "lazy";
      
      // Обработка успешной загрузки
      avatarImg.onload = () => {
        if (typeof window !== 'undefined' && window.addDebugLog) {
          window.addDebugLog(`✅ Аватар загружен для ${playerName}`, { url: avatarUrl });
        }
      };
      
      // Обработка ошибки загрузки с логированием
      avatarImg.onerror = (e) => {
        avatarImg.style.display = 'none';
        if (typeof window !== 'undefined' && window.addDebugLog) {
          window.addDebugLog(`❌ Ошибка загрузки аватара для ${playerName}`, { 
            url: avatarUrl,
            fid: entry.fid || 'unknown',
            username: entry.username
          });
        }
        console.warn(`[Leaderboard] Failed to load avatar for ${playerName}:`, avatarUrl);
      };
      
      playerDiv.appendChild(avatarImg);
    }
    
    const usernameSpan = document.createElement("span");
    usernameSpan.textContent = playerName;
    playerDiv.appendChild(usernameSpan);
    playerCell.appendChild(playerDiv);
    
    const winsCell = document.createElement("td");
    winsCell.style.cssText = "text-align: center; padding: 12px 8px; color: var(--win); font-weight: 600;";
    winsCell.textContent = entry.wins || 0;
    
    const drawsCell = document.createElement("td");
    drawsCell.style.cssText = "text-align: center; padding: 12px 8px; color: var(--muted);";
    drawsCell.textContent = entry.draws || 0;
    
    const lossesCell = document.createElement("td");
    lossesCell.style.cssText = "text-align: center; padding: 12px 8px; color: var(--lose);";
    lossesCell.textContent = entry.losses || 0;
    
    row.appendChild(rankCell);
    row.appendChild(playerCell);
    row.appendChild(winsCell);
    row.appendChild(drawsCell);
    row.appendChild(lossesCell);
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  container.appendChild(table);
}



