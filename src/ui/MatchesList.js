// Matches list component
import { listPlayerMatches, acceptMatch } from "../farcaster/match-api.js";
import { loadMatch } from "../game/match-state.js";

export async function loadMatchesList(container, playerFid) {
  if (!container || !playerFid) return;

  try {
    const matches = await listPlayerMatches(playerFid);
    renderMatchesList(container, matches, playerFid);
  } catch (error) {
    const lang = localStorage.getItem("language") || "en";
    const errorMsg = lang === "ru" 
      ? `Не удалось загрузить матчи: ${error.message}`
      : `Failed to load matches: ${error.message}`;
    container.innerHTML = `<div style="color: var(--lose); padding: 16px;">${errorMsg}</div>`;
  }
}

function renderMatchesList(container, matches, playerFid) {
  const lang = localStorage.getItem("language") || "en";

  if (!matches || matches.length === 0) {
    const noMatchesText = lang === "ru" 
      ? "Нет активных матчей"
      : "No active matches";
    container.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--muted);">${noMatchesText}</div>`;
    return;
  }

  const matchCards = matches.map(match => {
    const isPlayer1 = match.player1Fid === playerFid;
    const opponentFid = isPlayer1 ? match.player2Fid : match.player1Fid;
    const opponentDisplay = opponentFid ? `FID: ${opponentFid}` : "Waiting for opponent...";
    
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
      matchCard.onclick = () => {
        window.dispatchEvent(new CustomEvent("match-loaded", { detail: { matchId: match.matchId } }));
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

    matchCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
        <div>
          <div style="font-weight: 600; margin-bottom: 4px;">${lang === "ru" ? "Противник" : "Opponent"}: ${opponentDisplay}</div>
          <div style="font-size: 0.875rem; color: var(--muted);">${lang === "ru" ? "Статус" : "Status"}: ${statusText}</div>
          ${timeDisplay ? `<div style="font-size: 0.875rem; color: ${isExpired ? 'var(--lose)' : 'var(--fg)'}; margin-top: 4px;">${lang === "ru" ? "Время" : "Time"}: ${timeDisplay}</div>` : ""}
        </div>
        <div style="font-size: 0.75rem; color: var(--muted);">Match: ${match.matchId.slice(0, 8)}...</div>
      </div>
      ${match.status === "pending" && !isPlayer1 ? `<button class="btn accept-match-btn" data-match-id="${match.matchId}" style="margin-top: 8px;">${lang === "ru" ? "Принять вызов" : "Accept Challenge"}</button>` : ""}
      ${match.status === "active" ? `<button class="btn continue-match-btn" data-match-id="${match.matchId}" style="margin-top: 8px;">${lang === "ru" ? "Продолжить" : "Continue"}</button>` : ""}
    `;

    return matchCard;
  });

  // Render cards
  container.innerHTML = "";
  matchCards.forEach(card => container.appendChild(card));

  // Attach event handlers
  container.querySelectorAll(".accept-match-btn").forEach(btn => {
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
        alert(lang === "ru" ? `Ошибка: ${error.message}` : `Error: ${error.message}`);
      }
    });
  });

  container.querySelectorAll(".continue-match-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const matchId = btn.dataset.matchId;
      await loadMatch(matchId);
      window.dispatchEvent(new CustomEvent("match-loaded", { detail: { matchId } }));
      const modal = document.getElementById("matches-modal");
      if (modal) modal.setAttribute("aria-hidden", "true");
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
