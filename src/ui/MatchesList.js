// Matches list component
import { listPlayerMatches, acceptMatch } from "../farcaster/match-api.js";
import { loadMatch } from "../game/match-state.js";
import { getUserByFid } from "../farcaster/client.js";

export async function loadMatchesList(container, playerFid, options = {}) {
  if (!container || !playerFid) {
    console.warn('[MatchesList] Missing container or playerFid', { container: !!container, playerFid });
    return;
  }

  console.log('[MatchesList] Loading matches for player FID:', playerFid, typeof playerFid);
  
  const {
    prefetchedMatches = null,
    allowRefresh = false,
    lastUpdated = Date.now(),
    onRefresh
  } = options;

  try {
    let matches = Array.isArray(prefetchedMatches) ? prefetchedMatches : null;
    if (!matches) {
      matches = await listPlayerMatches(playerFid);
    }

    console.log('[MatchesList] Received matches:', matches.length, matches);
    const shouldDispatch = !Array.isArray(prefetchedMatches);
    if (shouldDispatch && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("player-matches-updated", { detail: { matches, playerFid } }));
    }
    await renderMatchesList(container, matches, playerFid, {
      refreshControls: allowRefresh,
      lastUpdated,
      onRefresh
    });
  } catch (error) {
    const lang = localStorage.getItem("language") || "en";
    const errorMsg = lang === "ru" 
      ? `Не удалось загрузить матчи: ${error.message}`
      : `Failed to load matches: ${error.message}`;
    container.innerHTML = `<div style="color: var(--lose); padding: 16px;">${errorMsg}</div>`;
  }
}

async function renderMatchesList(container, matches, playerFid, options = {}) {
  const lang = localStorage.getItem("language") || "en";
  const refreshControls = options.refreshControls === true;
  const lastUpdated = options.lastUpdated || Date.now();
  const onRefresh = typeof options.onRefresh === "function" ? options.onRefresh : null;

  container.innerHTML = "";
  let contentHost = container;

  if (refreshControls) {
    const refreshBar = document.createElement("div");
    refreshBar.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; font-size: 0.9rem; color: var(--muted);";
    const info = document.createElement("span");
    const updatedTime = new Date(lastUpdated).toLocaleTimeString();
    info.textContent = lang === "ru"
      ? `Последнее обновление: ${updatedTime}`
      : `Last update: ${updatedTime}`;
    refreshBar.appendChild(info);

    if (onRefresh) {
      const refreshBtn = document.createElement("button");
      refreshBtn.className = "btn";
      refreshBtn.textContent = lang === "ru" ? "Обновить" : "Refresh";
      refreshBtn.style.minWidth = "120px";
      refreshBtn.addEventListener("click", () => onRefresh());
      refreshBar.appendChild(refreshBtn);
    }

    container.appendChild(refreshBar);
    contentHost = document.createElement("div");
    contentHost.style.display = "flex";
    contentHost.style.flexDirection = "column";
    contentHost.style.gap = "12px";
    container.appendChild(contentHost);
  }

  if (!matches || matches.length === 0) {
    const noMatchesText = lang === "ru" 
      ? "Нет активных матчей"
      : "No active matches";
    contentHost.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--muted);">${noMatchesText}</div>`;
    return;
  }

  // Загружаем информацию о противниках асинхронно
  const opponentInfoMap = new Map();
  const opponentFids = new Set();
  
  matches.forEach(match => {
    const normalizedPlayerFid = typeof playerFid === 'string' ? parseInt(playerFid, 10) : playerFid;
    const normalizedPlayer1Fid = match.player1Fid ? (typeof match.player1Fid === 'string' ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
    const normalizedPlayer2Fid = match.player2Fid ? (typeof match.player2Fid === 'string' ? parseInt(match.player2Fid, 10) : match.player2Fid) : null;
    const isPlayer1 = normalizedPlayer1Fid === normalizedPlayerFid;
    const opponentFid = isPlayer1 ? normalizedPlayer2Fid : normalizedPlayer1Fid;
    if (opponentFid) {
      opponentFids.add(opponentFid);
    }
  });

  // Загружаем информацию о всех противниках параллельно
  await Promise.all(Array.from(opponentFids).map(async (fid) => {
    try {
      const userData = await getUserByFid(fid);
      if (userData?.user) {
        opponentInfoMap.set(fid, userData.user);
      }
    } catch (error) {
      console.warn(`Failed to load user info for FID ${fid}:`, error);
    }
  }));

  const matchCards = matches.map(match => {
    // Normalize FIDs for comparison (handle string vs number)
    const normalizedPlayerFid = typeof playerFid === 'string' ? parseInt(playerFid, 10) : playerFid;
    const normalizedPlayer1Fid = match.player1Fid ? (typeof match.player1Fid === 'string' ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
    const normalizedPlayer2Fid = match.player2Fid ? (typeof match.player2Fid === 'string' ? parseInt(match.player2Fid, 10) : match.player2Fid) : null;
    
    const isPlayer1 = normalizedPlayer1Fid === normalizedPlayerFid;
    const opponentFid = isPlayer1 ? normalizedPlayer2Fid : normalizedPlayer1Fid;
    
    // Получаем информацию о противнике
    const opponentInfo = opponentFid ? opponentInfoMap.get(opponentFid) : null;
    const opponentDisplay = opponentInfo 
      ? (opponentInfo.username ? `@${opponentInfo.username}` : opponentInfo.display_name || `FID: ${opponentFid}`)
      : opponentFid 
        ? `FID: ${opponentFid}` 
        : "Waiting for opponent...";
    const opponentAvatar = opponentInfo?.pfp_url || opponentInfo?.pfpUrl || opponentInfo?.pfp || null;
    
    const statusText = match.status === "pending" 
      ? (lang === "ru" ? "Ожидание противника" : "Waiting for opponent")
      : match.status === "active"
      ? (lang === "ru" ? "Активна" : "Active")
      : match.status;

    const matchCard = document.createElement("div");
    matchCard.className = "match-card";
    matchCard.style.cssText = `
      padding: 16px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: var(--radius);
      border: 1px solid rgba(255, 255, 255, 0.2);
      transition: all 0.2s;
    `;
    matchCard.onmouseover = () => {
      matchCard.style.background = "rgba(255, 255, 255, 0.15)";
      matchCard.style.transform = "translateY(-2px)";
    };
    matchCard.onmouseout = () => {
      matchCard.style.background = "rgba(255, 255, 255, 0.1)";
      matchCard.style.transform = "translateY(0)";
    };
    
    if (match.status === "active") {
      matchCard.style.cursor = "pointer";
      matchCard.onclick = async () => {
        try {
          await loadMatch(match.matchId);
          window.dispatchEvent(new CustomEvent("match-loaded", { detail: { matchId: match.matchId } }));
          // НЕ закрываем модальное окно - пользователь может захотеть переключиться на другой матч
        } catch (error) {
          console.error("Failed to load match:", error);
          const lang = localStorage.getItem("language") || "en";
          alert(lang === "ru" ? `Ошибка загрузки матча: ${error.message}` : `Failed to load match: ${error.message}`);
        }
      };
    }

    // Timer calculation
    const lastMoveAt = match.lastMoveAt ? new Date(match.lastMoveAt) : new Date();
    const now = new Date();
    const elapsed = now - lastMoveAt;
    const remaining = match.turnTimeout - elapsed;
    const isExpired = remaining <= 0;

    let timeDisplay = "";
    if (match.status === "active" && !match.gameState.finished) {
      if (isExpired) {
        timeDisplay = lang === "ru" ? "Истекло" : "Expired";
      } else {
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        timeDisplay = `${hours}h ${minutes}m`;
      }
    }

    // Создаем элемент для ID матча: текст "Match ID:" и ID в одну строку с прокруткой
    const matchIdContainer = document.createElement("div");
    matchIdContainer.style.cssText = "font-size: 0.75rem; color: var(--muted); margin-top: 8px; display: flex; align-items: center; gap: 8px; overflow: hidden;";
    matchIdContainer.innerHTML = `
      <span style="white-space: nowrap; flex-shrink: 0;">${lang === "ru" ? "Match ID" : "Match ID"}:</span>
      <div style="
        font-family: monospace; 
        font-size: 0.7rem; 
        overflow-x: auto; 
        overflow-y: hidden;
        white-space: nowrap;
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
        cursor: grab;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
        flex: 1;
        min-width: 0;
      " 
      class="match-id-scroll" 
      onmousedown="this.style.cursor='grabbing';" 
      onmouseup="this.style.cursor='grab';" 
      onmouseleave="this.style.cursor='grab';"
      title="${lang === "ru" ? "Прокрутите для просмотра полного ID" : "Scroll to view full ID"}">${match.matchId}</div>
    `;
    
    // Добавляем стили для скроллбара
    const style = document.createElement('style');
    style.textContent = `
      .match-id-scroll::-webkit-scrollbar {
        height: 6px;
      }
      .match-id-scroll::-webkit-scrollbar-track {
        background: transparent;
      }
      .match-id-scroll::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 3px;
      }
      .match-id-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.5);
      }
    `;
    if (!document.head.querySelector('#match-id-scroll-styles')) {
      style.id = 'match-id-scroll-styles';
      document.head.appendChild(style);
    }

    // Используем hero.jpg как заглушку для аватара в локальном тестировании
    const avatarSrc = opponentAvatar || "/assets/images/hero.jpg";
    
    matchCard.innerHTML = `
      <div style="margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 4px;">
          <img src="${avatarSrc}" alt="${opponentDisplay}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255, 255, 255, 0.2);" onerror="this.src='/assets/images/hero.jpg';" />
          <span>${lang === "ru" ? "Противник" : "Opponent"}: ${opponentDisplay}</span>
        </div>
        <div style="font-size: 0.875rem; color: var(--muted); display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <span>${lang === "ru" ? "Статус" : "Status"}: ${statusText}</span>
          ${timeDisplay ? `<span style="color: ${isExpired ? 'var(--lose)' : 'var(--fg)'}; margin-top: 4px;">${lang === "ru" ? "Время" : "Time"}: ${timeDisplay}</span>` : ""}
        </div>
      </div>
    `;
    
    // Добавляем контейнер с Match ID сначала (перед Accept Challenge)
    matchCard.appendChild(matchIdContainer);
    
    // Добавляем кнопку Accept Challenge после Match ID
    if (match.status === "pending" && !isPlayer1 && !normalizedPlayer2Fid) {
      const acceptBtn = document.createElement("button");
      acceptBtn.className = "btn accept-match-btn";
      acceptBtn.dataset.matchId = match.matchId;
      acceptBtn.textContent = lang === "ru" ? "Принять вызов" : "Accept Challenge";
      acceptBtn.style.cssText = "margin-top: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-weight: 600; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); animation: pulse 2s infinite;";
      matchCard.appendChild(acceptBtn);
    }

    return matchCard;
  });

  // Render cards
  contentHost.innerHTML = "";
  matchCards.forEach(card => contentHost.appendChild(card));

  // Attach event handlers
  contentHost.querySelectorAll(".accept-match-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const matchId = btn.dataset.matchId;
      const session = getSession();
      const player2Fid = session?.farcaster?.fid || session?.fid;
      if (!player2Fid) {
        alert(lang === "ru" ? "Войдите через Farcaster" : "Sign in with Farcaster");
        return;
      }
      try {
        await acceptMatch(matchId, player2Fid);
        await loadMatch(matchId);
        window.dispatchEvent(new CustomEvent("match-loaded", { detail: { matchId } }));
        const modal = document.getElementById("matches-modal");
        if (modal) modal.setAttribute("aria-hidden", "true");
      } catch (error) {
        let errorMsg = error.message || (lang === "ru" ? "Ошибка принятия матча" : "Error accepting match");
        
        // Показываем понятное сообщение об ошибке
        if (errorMsg.includes("2 active matches")) {
          errorMsg = lang === "ru" 
            ? "У вас уже есть 2 активных матча. Завершите один из них, чтобы принять новый."
            : "You already have 2 active matches. Finish one to accept a new one.";
        }
        
        alert(errorMsg);
      }
    });
  });
}

function getSession() {
  try {
    const sessionStr = localStorage.getItem("fc_session");
    return sessionStr ? JSON.parse(sessionStr) : null;
  } catch {
    return null;
  }
}
