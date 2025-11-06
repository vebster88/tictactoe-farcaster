import { getUserByFid } from "../farcaster/client.js";

export async function loadLeaderboard() {
  const lang = localStorage.getItem("language") || "en";
  
  try {
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
    
    // Загружаем информацию о пользователях для каждого FID
    const leaderboardWithUsers = await Promise.all(
      leaderboard.map(async (entry) => {
        try {
          const userData = await getUserByFid(entry.fid);
          return {
            ...entry,
            username: userData?.user?.username || null,
            display_name: userData?.user?.display_name || null,
            pfp_url: userData?.user?.pfp_url || userData?.user?.pfpUrl || userData?.user?.pfp || null
          };
        } catch (error) {
          console.warn(`Failed to load user data for FID ${entry.fid}:`, error);
          return {
            ...entry,
            username: null,
            display_name: null,
            pfp_url: null
          };
        }
      })
    );
    
    return leaderboardWithUsers;
  } catch (error) {
    console.error("Error loading leaderboard:", error);
    
    // Fallback на текущий origin если dev API недоступен
    if (error.message?.includes('fetch') || error.message?.includes('CORS') || error.message?.includes('HTML')) {
      console.log(`[Leaderboard] Network error, trying fallback to ${window.location.origin}`);
      return await loadLeaderboardFallback();
    }
    
    return [];
  }
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
    
    // Загружаем информацию о пользователях
    return await Promise.all(
      leaderboard.map(async (entry) => {
        try {
          const userData = await getUserByFid(entry.fid);
          return {
            ...entry,
            username: userData?.user?.username || null,
            display_name: userData?.user?.display_name || null,
            pfp_url: userData?.user?.pfp_url || userData?.user?.pfpUrl || userData?.user?.pfp || null
          };
        } catch (error) {
          return {
            ...entry,
            username: null,
            display_name: null,
            pfp_url: null
          };
        }
      })
    );
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
    
    const playerName = entry.username 
      ? `@${entry.username}` 
      : entry.display_name 
        ? entry.display_name 
        : `FID: ${entry.fid}`;
    
    const rank = index + 1; // Номер в списке (начинается с 1)
    row.innerHTML = `
      <td style="text-align: center; padding: 12px 8px; color: var(--muted); font-weight: 600;">${rank}</td>
      <td style="padding: 12px 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${entry.pfp_url ? `<img src="${entry.pfp_url}" alt="${playerName}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255, 255, 255, 0.2);" onerror="this.style.display='none';" />` : ""}
          <span>${playerName}</span>
        </div>
      </td>
      <td style="text-align: center; padding: 12px 8px; color: var(--win); font-weight: 600;">${entry.wins || 0}</td>
      <td style="text-align: center; padding: 12px 8px; color: var(--muted);">${entry.draws || 0}</td>
      <td style="text-align: center; padding: 12px 8px; color: var(--lose);">${entry.losses || 0}</td>
    `;
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  container.appendChild(table);
}



