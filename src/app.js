import { createInitialState } from "./game/state.js";
import { applyMove } from "./game/engine.js";
import { pickRandomMove } from "./ai/random.js";
import { bestMoveMinimax } from "./ai/minimax.js";
import { getSession, signInWithWallet, signOut } from "./farcaster/auth.js";
import { sendInvite } from "./farcaster/matchmaking.js";
import { listThreadReplies, publishMatchResult } from "./farcaster/client.js";
import { getMatch, acceptMatch, sendMove, listPlayerMatches } from "./farcaster/match-api.js";
import { setCurrentMatch, loadMatch, clearCurrentMatch, handleMove as handleMatchMove, isMyTurn, getMySymbol, getOpponentFid, startSyncing, stopSyncing, getCurrentMatch } from "./game/match-state.js";
import { TurnTimer } from "./ui/Timer.js";
import { loadMatchesList } from "./ui/MatchesList.js";
import { createSignedKey } from "./farcaster/signer.js";
import { farcasterSDK } from "./farcaster/sdk.js";
import { AUTHORIZED_DEVELOPERS, DEV_SECRET_CODE, DEV_CONFIG, isAuthorizedDeveloper, getDeveloperInfo } from "./config/developers.js";
import { APP_VERSION } from "./version.js";

// Debug logging - can be controlled via environment variable
const DEBUG_ENABLED = import.meta.env.VITE_DEBUG === "true" || 
                     import.meta.env.DEV || 
                     localStorage.getItem("debug-enabled") === "true" ||
                     window.location.search.includes("debug=true");

// Debug logs storage
let debugLogs = [];
const MAX_DEBUG_LOGS = 50;
const MAX_STORED_LOGS = 100;

function addDebugLog(message, data = null) {
  // Всегда записываем логи для debug панели (независимо от DEBUG_ENABLED)
  // Но в консоль выводим только если DEBUG_ENABLED включен
  
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = {
    time: timestamp,
    message,
    data: data ? JSON.stringify(data, null, 2) : null,
    timestamp: new Date().toISOString()
  };
  
  // Добавляем в массив
  debugLogs.push(logEntry);
  if (debugLogs.length > MAX_DEBUG_LOGS) {
    debugLogs.shift();
  }
  
  // Сохраняем в localStorage (только последние N записей)
  try {
    const storedLogs = JSON.parse(localStorage.getItem('debug-logs') || '[]');
    storedLogs.push(logEntry);
    if (storedLogs.length > MAX_STORED_LOGS) {
      storedLogs.shift();
    }
    localStorage.setItem('debug-logs', JSON.stringify(storedLogs));
  } catch (e) {
    // Если localStorage переполнен, очищаем старые логи
    try {
      localStorage.removeItem('debug-logs');
      localStorage.setItem('debug-logs', JSON.stringify([logEntry]));
    } catch (e2) {
      // Если и это не помогло, просто пропускаем сохранение
    }
  }
  
  // Выводим в консоль только если DEBUG_ENABLED включен
  if (DEBUG_ENABLED) {
    const logMessage = `[DEBUG ${timestamp}] ${message}`;
    if (data !== null && data !== undefined) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }
  }
  
  // Обновляем визуальный debug panel, если он создан
  if (window.updateDebugModal) {
    window.updateDebugModal();
  }
}

// Initialize: enable debug if in dev mode or URL has debug=true
if (DEBUG_ENABLED) {
  console.log("🔍 Debug logging enabled");
  console.log("Debug enabled by:", {
    env: import.meta.env.VITE_DEBUG === "true",
    dev: import.meta.env.DEV,
    localStorage: localStorage.getItem("debug-enabled") === "true",
    urlParam: window.location.search.includes("debug=true")
  });
}

// Загружаем сохраненные логи из localStorage (даже если debug выключен)
try {
  const savedLogs = JSON.parse(localStorage.getItem('debug-logs') || '[]');
  debugLogs = savedLogs.slice(-MAX_DEBUG_LOGS);
} catch (e) {
  debugLogs = [];
}

// Инициализируем debug UI (всегда, не только когда debug включен)
initDebugUI();

// Debug UI - модальное окно для просмотра логов
function createDebugModal() {
  const modal = document.createElement('div');
  modal.id = 'debug-modal';
  modal.style.cssText = `
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    z-index: 10001;
    overflow-y: auto;
    padding: 20px;
    font-family: monospace;
  `;
  
  // Получаем язык безопасно
  const lang = (typeof getLanguage === 'function' ? getLanguage() : (localStorage.getItem("language") || "en"));
  
  modal.innerHTML = `
    <div style="background: #1a1a1a; color: #0f0; padding: 20px; border-radius: 8px; max-width: 700px; margin: 0 auto; border: 2px solid #0f0; box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 10px;">
        <h2 style="margin: 0; color: #0f0; font-size: 1.5rem;">🐛 Debug Logs</h2>
        <button id="debug-modal-close" style="background: #333; color: #0f0; border: 1px solid #0f0; padding: 8px 16px; cursor: pointer; border-radius: 4px; font-size: 14px;">${lang === "ru" ? "Закрыть" : "Close"}</button>
      </div>
      <div style="margin-bottom: 15px; display: flex; gap: 10px;">
        <button id="debug-clear-logs" style="background: #333; color: #f00; border: 1px solid #f00; padding: 8px 16px; cursor: pointer; border-radius: 4px; font-size: 12px;">${lang === "ru" ? "Очистить логи" : "Clear Logs"}</button>
        <button id="debug-export-logs" style="background: #333; color: #0ff; border: 1px solid #0ff; padding: 8px 16px; cursor: pointer; border-radius: 4px; font-size: 12px;">${lang === "ru" ? "Экспорт" : "Export"}</button>
        <span style="color: #888; font-size: 12px; line-height: 32px;">${lang === "ru" ? "Всего логов:" : "Total logs:"} <span id="debug-logs-count">0</span></span>
      </div>
      <div id="debug-logs-content" style="max-height: 500px; overflow-y: auto; background: #000; padding: 15px; border-radius: 4px; border: 1px solid #333;"></div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Обработчики событий
  document.getElementById('debug-modal-close')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });
  
  document.getElementById('debug-clear-logs')?.addEventListener('click', () => {
    if (confirm(lang === "ru" ? "Очистить все логи?" : "Clear all logs?")) {
      debugLogs = [];
      localStorage.removeItem('debug-logs');
      updateDebugModal();
      addDebugLog('🧹 Логи очищены');
    }
  });
  
  document.getElementById('debug-export-logs')?.addEventListener('click', () => {
    try {
      const allLogs = JSON.parse(localStorage.getItem('debug-logs') || '[]');
      const logText = allLogs.map(log => 
        `[${log.time}] ${log.message}\n${log.data ? log.data + '\n' : ''}`
      ).join('\n---\n');
      
      const blob = new Blob([logText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `debug-logs-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(lang === "ru" ? `Ошибка экспорта: ${e.message}` : `Export error: ${e.message}`);
    }
  });
  
  return modal;
}

// Глобальная функция для обновления модального окна (вызывается из addDebugLog)
window.updateDebugModal = function() {
  const modal = document.getElementById('debug-modal');
  if (!modal) return;
  
  const logsContent = document.getElementById('debug-logs-content');
  const logsCount = document.getElementById('debug-logs-count');
  
  if (!logsContent || !logsCount) return;
  
  // Объединяем сохраненные и текущие логи
  let allLogs = [];
  try {
    const storedLogs = JSON.parse(localStorage.getItem('debug-logs') || '[]');
    allLogs = [...storedLogs, ...debugLogs].slice(-MAX_STORED_LOGS);
  } catch (e) {
    allLogs = [...debugLogs];
  }
  
  // Убираем дубликаты по timestamp
  const uniqueLogs = [];
  const seen = new Set();
  for (const log of allLogs) {
    const key = log.timestamp + log.message;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueLogs.push(log);
    }
  }
  
  logsCount.textContent = uniqueLogs.length;
  
  // Показываем информацию о статусе debug режима
  const debugStatus = DEBUG_ENABLED ? 
    (typeof getLanguage === 'function' ? getLanguage() : (localStorage.getItem("language") || "en")) === "ru" ? 
      "🟢 Debug включен" : "🟢 Debug enabled" :
    (typeof getLanguage === 'function' ? getLanguage() : (localStorage.getItem("language") || "en")) === "ru" ? 
      "🔴 Debug выключен" : "🔴 Debug disabled";
  
  const lang = (typeof getLanguage === 'function' ? getLanguage() : (localStorage.getItem("language") || "en"));
  
  if (uniqueLogs.length === 0) {
    logsContent.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #888;">
        <div style="font-size: 48px; margin-bottom: 20px;">📋</div>
        <div>${lang === "ru" ? "Логов пока нет" : "No logs yet"}</div>
        <div style="margin-top: 10px; font-size: 12px; color: #666;">
          ${debugStatus}<br/>
          ${lang === "ru" ? "Логи появятся здесь при включенном debug режиме" : "Logs will appear here when debug mode is enabled"}
        </div>
      </div>
    `;
  } else {
    logsContent.innerHTML = `
      <div style="margin-bottom: 10px; padding: 8px; background: #111; border-radius: 4px; font-size: 11px; color: #888;">
        ${debugStatus}
      </div>
      ${uniqueLogs.slice(-50).reverse().map(log => 
        `<div style="margin: 8px 0; padding: 8px; border-bottom: 1px solid #222; border-left: 3px solid #0f0;">
          <div style="display: flex; gap: 10px; margin-bottom: 4px;">
            <span style="color: #888; font-size: 10px;">[${log.time}]</span>
            <span style="color: #0f0; font-weight: 600;">${escapeHtml(log.message)}</span>
          </div>
          ${log.data ? `<pre style="color: #aaa; margin: 5px 0; font-size: 10px; background: #111; padding: 8px; border-radius: 4px; overflow-x: auto; max-width: 100%;">${escapeHtml(log.data)}</pre>` : ''}
        </div>`
      ).join('')}
    `;
  }
  
  // Автоскролл вниз
  logsContent.scrollTop = logsContent.scrollHeight;
};

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Инициализация debug UI
function initDebugUI() {
  // Кнопка всегда доступна, но логи пишутся только если DEBUG_ENABLED
  // Создаем debug-кнопку
  const btn = document.createElement('button');
  btn.id = 'debug-btn';
  btn.textContent = '🐛';
  btn.title = 'Debug Logs';
  btn.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    z-index: 10000;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: rgba(0, 255, 0, 0.2);
    border: 2px solid #0f0;
    color: #0f0;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 0 15px rgba(0, 255, 0, 0.5);
    transition: all 0.3s;
  `;
  
  btn.addEventListener('mouseenter', () => {
    btn.style.background = isDebugEnabled ? 'rgba(0, 255, 0, 0.4)' : 'rgba(255, 255, 255, 0.2)';
    btn.style.transform = 'scale(1.1)';
  });
  
  btn.addEventListener('mouseleave', () => {
    btn.style.background = isDebugEnabled ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)';
    btn.style.transform = 'scale(1)';
  });
  
  // Создаем модальное окно
  const modal = createDebugModal();
  
  // Открываем модальное окно при клике на кнопку
  btn.addEventListener('click', () => {
    modal.style.display = 'block';
    updateDebugModal();
  });
  
  // Добавляем кнопку в DOM после загрузки (с задержкой для надежности)
  function addDebugButton() {
    if (document.body) {
      // Проверяем, не добавлена ли уже кнопка
      if (!document.getElementById('debug-btn')) {
        document.body.appendChild(btn);
      }
    } else {
      setTimeout(addDebugButton, 100);
    }
  }
  
  // Пробуем добавить сразу, если body готов
  if (document.body) {
    addDebugButton();
  } else {
    // Ждем загрузки DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', addDebugButton);
    } else {
      setTimeout(addDebugButton, 100);
    }
  }
  
  if (DEBUG_ENABLED) {
    addDebugLog('🐛 Debug UI инициализирован (debug режим включен)');
  } else {
    // Добавляем начальный лог даже если debug выключен
    const lang = (typeof getLanguage === 'function' ? getLanguage() : (localStorage.getItem("language") || "en"));
    const initialLog = {
      time: new Date().toLocaleTimeString(),
      message: lang === "ru" ? "🐛 Debug UI инициализирован (debug режим выключен)" : "🐛 Debug UI initialized (debug mode disabled)",
      data: null,
      timestamp: new Date().toISOString()
    };
    debugLogs.push(initialLog);
    try {
      const storedLogs = JSON.parse(localStorage.getItem('debug-logs') || '[]');
      storedLogs.push(initialLog);
      if (storedLogs.length > MAX_STORED_LOGS) {
        storedLogs.shift();
      }
      localStorage.setItem('debug-logs', JSON.stringify(storedLogs));
    } catch (e) {}
  }
}

// Now we can safely use addDebugLog
const root = document.body;
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const settingsBtn = document.getElementById("btn-settings");
const devToggleBtn = document.getElementById("btn-dev-toggle");
const newBtn = document.getElementById("btn-new");
const authBtn = document.getElementById("btn-auth");
const userLabel = document.getElementById("user-label");
const createSignerBtn = document.getElementById("btn-create-signer");
const checkRepliesBtn = document.getElementById("btn-check-replies");
const inviteBtn = document.getElementById("btn-invite");
const publishBtn = document.getElementById("btn-publish-result");
const matchesBtn = document.getElementById("btn-matches");
const matchesModal = document.getElementById("matches-modal");
const matchesList = document.getElementById("matches-list");
const timerContainer = document.getElementById("timer-container");
const cells = [...boardEl.querySelectorAll(".cell")];

// Settings modal elements
const settingsModal = document.getElementById("settings-modal");
const settingsLang = document.getElementById("settings-lang");
const settingsMode = document.getElementById("settings-mode");
const modalCloseBtns = document.querySelectorAll(".modal-close");

let state = createInitialState();
let scores = { X: 0, O: 0, draw: 0 };
let mode = settingsMode?.value || "pve-easy";
let botThinking = false;

function getLanguage() {
  return localStorage.getItem("language") || "en"; // Default to English
}

function setLanguage(lang) {
  localStorage.setItem("language", lang);
  // Update HTML lang attribute for accessibility and SEO
  document.documentElement.lang = lang;
}

function setTheme(theme) {
  // Theme is fixed to 'light' - no changes allowed
  root.setAttribute("data-theme", "light");
}

function t(_key, dict) {
  const lang = getLanguage();
  return lang === "ru" ? dict.ru : dict.en;
}
function showStatus(msg) { statusEl.textContent = msg; }

function showToast(message, type = "info") {
  const toastsContainer = document.getElementById("toasts");
  if (!toastsContainer) return;
  
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    background: ${type === "error" ? "rgba(239, 68, 68, 0.9)" : type === "success" ? "rgba(16, 185, 129, 0.9)" : type === "warning" ? "rgba(245, 158, 11, 0.9)" : "rgba(59, 130, 246, 0.9)"};
    color: white;
    padding: 12px 16px;
    border-radius: var(--radius);
    margin-bottom: 8px;
    box-shadow: var(--shadow-lg);
    animation: toastSlide 0.3s ease-out;
  `;
  
  toastsContainer.appendChild(toast);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = "toastSlideOut 0.3s ease-out";
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

function render() {
  cells.forEach((btn, i) => {
    const v = state.board[i];
    btn.textContent = v ? v : "";
    btn.setAttribute("aria-label", v ? v : (getLanguage() === "ru" ? "Пусто" : "Empty"));
    btn.setAttribute("aria-pressed", String(!!v));
    btn.classList.remove("win");
  });
  if (state.winLine) { for (const i of state.winLine) cells[i].classList.add("win"); }
  if (state.finished) {
    if (state.winner) showStatus(t("winner", { ru: `Победа: ${state.winner}`, en: `Winner: ${state.winner}` }));
    else showStatus(t("draw", { ru: "Ничья", en: "Draw" }));
    publishBtn?.removeAttribute("disabled");
  } else {
    showStatus(t("turn", { ru: `Ход: ${state.next}`, en: `Turn: ${state.next}` }));
    publishBtn?.setAttribute("disabled", "true");
  }
  document.getElementById("score-x").textContent = String(scores.X);
  document.getElementById("score-o").textContent = String(scores.O);
  document.getElementById("score-draw").textContent = String(scores.draw);
}

function resetBoard(keepScore = false) {
  state = createInitialState();
  if (!keepScore) scores = { X: 0, O: 0, draw: 0 };
  botThinking = false;
  render();
}

function maybeBotMove() {
  if (!(mode === "pve-easy" || mode === "pve-hard")) return;
  if (state.finished) return;
  if (state.next !== "O") return;
  if (botThinking) return;
  botThinking = true;
  setTimeout(() => {
    let idx = null;
    if (mode === "pve-easy") idx = pickRandomMove(state.board);
    else idx = bestMoveMinimax(state.board, "O", true, state.next);
    botThinking = false;
    if (idx === null || idx === undefined) return;
    const res = applyMove(state, idx);
    if (res.ok) {
      state = res.state;
      if (state.finished) {
        if (state.winner) scores[state.winner] += 1; else scores.draw += 1;
      }
      render();
    }
  }, 120);
}

function handleMove(idx) {
  if (state.finished || botThinking) return;
  const res = applyMove(state, idx);
  if (!res.ok) return;
  state = res.state;
  if (state.finished) {
    if (state.winner) scores[state.winner] += 1; else scores.draw += 1;
    render();
    return;
  }
  render();
  maybeBotMove();
}

// Settings modal handlers
settingsBtn?.addEventListener("click", () => {
  if (settingsModal) {
    settingsModal.setAttribute("aria-hidden", "false");
    // Load current values
    if (settingsLang) {
      settingsLang.value = getLanguage();
    }
    if (settingsMode) {
      settingsMode.value = mode;
    }
  }
});

// Close modal handlers
modalCloseBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const modal = btn.closest(".modal");
    if (modal) {
      modal.setAttribute("aria-hidden", "true");
    }
  });
});

// Close modal on backdrop click
settingsModal?.addEventListener("click", (e) => {
  if (e.target === settingsModal) {
    settingsModal.setAttribute("aria-hidden", "true");
  }
});

// Settings change handlers
settingsLang?.addEventListener("change", (e) => {
  setLanguage(e.target.value);
  initializeUITexts(); // Update all UI texts
  render(); // Update game UI text
  refreshUserLabel(); // Update user label and button text
});

devToggleBtn?.addEventListener("click", () => {
  if (!checkDevAccess()) {
    // Секретный способ активации для экстренных случаев
    const secretCode = prompt("Введите код разработчика:");
    if (secretCode !== DEV_SECRET_CODE) {
      alert("Доступ запрещен. Только для разработчиков.");
      return;
    }
  }
  
  const currentDevMode = localStorage.getItem("dev-mode") === "true";
  const newDevMode = !currentDevMode;
  localStorage.setItem("dev-mode", newDevMode.toString());
  updateUIForMode();
  
  // Обновляем внешний вид кнопки
  devToggleBtn.setAttribute("aria-pressed", newDevMode.toString());
  devToggleBtn.title = newDevMode ? "Выключить режим разработчика" : "Включить режим разработчика";
});
newBtn?.addEventListener("click", () => resetBoard(true));
settingsMode?.addEventListener("change", () => { 
  mode = settingsMode.value; 
  resetBoard(true); 
  updateUIForMode();
});

let isMakingMove = false;

boardEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".cell");
  if (!btn) return;
  
  // Prevent clicks during move processing
  if (isMakingMove) return;
  
  const idx = Number(btn.dataset.cell);
  
  // Check if we're in PvP Farcaster mode with active match
  const currentMatch = getCurrentMatch();
  if (mode === "pvp-farcaster" && currentMatch.matchState) {
    // PvP match - use API
    if (!isMyTurn()) {
      const lang = getLanguage();
      showToast(lang === "ru" ? "Не ваш ход" : "Not your turn", "warning");
      return;
    }
    
    isMakingMove = true;
    btn.disabled = true;
    btn.style.opacity = "0.5";
    
    try {
      const match = await handleMatchMove(idx);
      state = match.gameState;
      if (state.finished) {
        if (state.winner) scores[state.winner] += 1; else scores.draw += 1;
        stopSyncing();
        const lang = getLanguage();
        const isWinner = (match.player1Symbol === state.winner && match.player1Fid === currentMatch.playerFid) ||
                         (match.player2Symbol === state.winner && match.player2Fid === currentMatch.playerFid);
        showToast(
          isWinner 
            ? (lang === "ru" ? "🎉 Вы победили!" : "🎉 You won!")
            : (lang === "ru" ? "😔 Вы проиграли" : "😔 You lost"),
          isWinner ? "success" : "error"
        );
      }
      render();
      updateMatchUI();
    } catch (error) {
      const lang = getLanguage();
      showToast(lang === "ru" ? `Ошибка хода: ${error.message}` : `Move error: ${error.message}`, "error");
    } finally {
      isMakingMove = false;
      btn.disabled = false;
      btn.style.opacity = "1";
    }
  } else {
    // Local game or PvE
    handleMove(idx);
  }
});
boardEl.addEventListener("keydown", (e) => {
  const index = cells.indexOf(document.activeElement);
  if (index >= 0) {
    if (e.key === "ArrowRight") cells[Math.min(index + 1, 8)].focus();
    if (e.key === "ArrowLeft") cells[Math.max(index - 1, 0)].focus();
    if (e.key === "ArrowDown") cells[Math.min(index + 3, 8)].focus();
    if (e.key === "ArrowUp") cells[Math.max(index - 3, 0)].focus();
    if (e.key === "Enter" || e.key === " ") handleMove(index);
  }
});

function refreshUserLabel() {
  const s = getSession();
  
  // Проверяем авторизацию: либо через кошелек (address), либо через Farcaster (farcaster)
  const isAuthorized = !!(s?.address || s?.farcaster);
  
  const lang = getLanguage();
  const texts = {
    en: { signedIn: "Signed In", signOut: "Sign Out", signIn: "Sign In" },
    ru: { signedIn: "Авторизован", signOut: "Выйти", signIn: "Войти" }
  };
  const t = texts[lang] || texts.en;
  
  // Получаем элементы
  const userAvatar = document.getElementById("user-avatar");
  const authBtn = document.getElementById("btn-auth");
  const authWrapper = authBtn?.closest('.auth-wrapper');
  
  if (isAuthorized) {
    // Приоритет: отображаем Farcaster username, если есть
    if (s.farcaster?.username) {
      userLabel.textContent = `@${s.farcaster.username}`;
    } else if (s.farcaster?.display_name) {
      userLabel.textContent = s.farcaster.display_name;
    } else if (s.farcaster?.fid) {
      userLabel.textContent = `FID: ${s.farcaster.fid}`;
    } else if (s.address) {
      // Fallback на адрес кошелька
      userLabel.textContent = s.address.slice(0, 6) + "…" + s.address.slice(-4);
    } else {
      userLabel.textContent = t.signedIn;
    }
    
    // Отображаем аватарку, если есть
    if (userAvatar) {
      addDebugLog('🔍 ШАГ 1: Начало загрузки аватарки', {
        userAvatarExists: !!userAvatar,
        sessionExists: !!s,
        farcasterExists: !!s?.farcaster
      });
      
      const sfc = s.farcaster || {};
      
      addDebugLog('🔍 ШАГ 2: Проверка сессии Farcaster', {
        farcasterObject: sfc,
        farcasterKeys: sfc ? Object.keys(sfc) : [],
        hasPfp: !!sfc.pfp,
        hasPfpUrl: !!sfc.pfpUrl,
        hasPfp_url: !!sfc.pfp_url
      });
      
      // Проверяем все возможные поля для аватарки
      const possiblePfpFields = [
        sfc.pfp, sfc.pfpUrl, sfc.pfp_url, sfc.pfpURL,
        sfc.avatar, sfc.avatarUrl, sfc.avatar_url,
        sfc.profilePicture, sfc.profile_picture
      ];
      
      addDebugLog('🔍 ШАГ 3: Проверка всех полей аватарки', {
        possiblePfpFields: possiblePfpFields.map((field, index) => ({
          index,
          fieldName: ['pfp', 'pfpUrl', 'pfp_url', 'pfpURL', 'avatar', 'avatarUrl', 'avatar_url', 'profilePicture', 'profile_picture'][index],
          value: field,
          type: typeof field,
          isEmpty: field === null || field === undefined || (typeof field === 'string' && field.trim().length === 0)
        }))
      });
      
      const pfpUrlRaw = possiblePfpFields.find(u => typeof u === 'string' && u.trim().length > 0) || null;
      
      addDebugLog('🔍 ШАГ 4: Найденный URL аватарки', {
        pfpUrlRaw: pfpUrlRaw,
        found: !!pfpUrlRaw,
        length: pfpUrlRaw ? pfpUrlRaw.length : 0
      });
      
      if (!pfpUrlRaw) {
        userAvatar.style.display = "none";
        addDebugLog('❌ ШАГ 5: Нет URL аватарки в сессии', { 
          farcaster: !!s.farcaster,
          session: s,
          fullSession: JSON.stringify(s, null, 2)
        });
      } else {
        addDebugLog('✅ ШАГ 5: URL найден, начинаем нормализацию', { pfpUrlRaw });
        
        // Нормализация URL
        let normalizedUrl = pfpUrlRaw.trim();
        const originalUrl = normalizedUrl;
        
        if (!/^https?:\/\//i.test(normalizedUrl)) {
          normalizedUrl = 'https://' + normalizedUrl;
          addDebugLog('🔧 Добавлен протокол https://', { 
            original: originalUrl,
            normalized: normalizedUrl
          });
        }
        
        addDebugLog('🔧 ШАГ 6: Нормализация URL завершена', {
          original: pfpUrlRaw,
          normalized: normalizedUrl,
          changed: normalizedUrl !== pfpUrlRaw
        });
        
        // Функция для установки атрибутов изображения
        const setupImageAttributes = (img) => {
          if (!img) {
            addDebugLog('⚠️ setupImageAttributes: элемент не найден');
            return;
          }
          
          addDebugLog('🔧 Настройка атрибутов изображения', { elementId: img.id });
          
          // CORS для Cloudflare Images
          if (normalizedUrl.includes('imagedelivery.net')) {
            img.crossOrigin = null;
            img.referrerPolicy = null;
            addDebugLog('🔓 Убраны CORS ограничения для Cloudflare Images', { elementId: img.id });
          } else {
            img.crossOrigin = "anonymous";
            img.referrerPolicy = "no-referrer";
            addDebugLog('🔐 Установлены CORS атрибуты для обычного домена', { elementId: img.id });
          }
          
          img.loading = "lazy";
          img.alt = sfc.display_name || sfc.username || "User avatar";
          
          addDebugLog('✅ Атрибуты установлены', {
            elementId: img.id,
            crossOrigin: img.crossOrigin,
            referrerPolicy: img.referrerPolicy,
            loading: img.loading,
            alt: img.alt
          });
        };
        
        setupImageAttributes(userAvatar);
        
        // Расширенная retry логика для Cloudflare Images
        let attempts = 0;
        const MAX_RETRIES = 6;
        
        // Функция для генерации вариантов URL
        const generateVariants = (url) => {
          const variants = [];
          
          if (url.match(/\/rectcrop\d+\/?$/)) {
            variants.push(url.replace(/\/rectcrop(\d+)\/?$/, '/rectcrop$1/public'));
            variants.push(url.replace(/\/rectcrop\d+\/?$/, '/public'));
            variants.push(url.replace(/\/rectcrop\d+\/?$/, '/avatar'));
            variants.push(url.replace(/\/rectcrop\d+\/?$/, ''));
            variants.push(url.replace(/\/rectcrop\d+\/?$/, '/rectcrop3/public'));
          } else if (url.match(/\/rectcrop\d+\/public\/?$/)) {
            variants.push(url.replace(/\/rectcrop\d+\/public\/?$/, '/avatar'));
            variants.push(url.replace(/\/rectcrop\d+\/public\/?$/, '/public'));
            variants.push(url.replace(/\/rectcrop(\d+)\/public\/?$/, '/rectcrop$1'));
            variants.push(url.replace(/\/rectcrop\d+\/public\/?$/, ''));
          } else if (url.match(/\/avatar\/?$/)) {
            variants.push(url.replace(/\/avatar\/?$/, '/public'));
            variants.push(url.replace(/\/avatar\/?$/, ''));
          } else if (url.match(/\/public\/?$/)) {
            variants.push(url.replace(/\/public\/?$/, '/avatar'));
            variants.push(url.replace(/\/public\/?$/, ''));
          }
          
          return [...new Set(variants)].filter(v => v && v !== url);
        };
        
        const triedUrls = new Set([normalizedUrl]);
        
        // Функция для установки обработчиков событий
        const setupImageHandlers = (img) => {
          if (!img) {
            addDebugLog('⚠️ setupImageHandlers: элемент не найден');
            return;
          }
          
          addDebugLog('🔧 Установка обработчиков событий', { elementId: img.id });
          
          img.onerror = () => {
            attempts++;
            const currentUrl = img.src;
            
            addDebugLog(`⚠️ ШАГ 7: Ошибка загрузки аватарки (попытка ${attempts}/${MAX_RETRIES})`, { 
              url: currentUrl,
              attempts: attempts,
              isCloudflare: currentUrl.includes('imagedelivery.net'),
              element: img.id,
              imgNaturalWidth: img.naturalWidth,
              imgNaturalHeight: img.naturalHeight,
              imgComplete: img.complete,
              imgWidth: img.width,
              imgHeight: img.height
            });
            
            // Проверяем Network API для получения статуса ошибки
            fetch(currentUrl, { method: 'HEAD', mode: 'no-cors' })
              .then(() => {
                addDebugLog('ℹ️ HEAD запрос прошел (но может быть CORS)', { url: currentUrl });
              })
              .catch(err => {
                addDebugLog('❌ HEAD запрос не прошел', { url: currentUrl, error: err.message });
              });
            
            if (attempts < MAX_RETRIES && normalizedUrl.includes('imagedelivery.net')) {
              const variants = generateVariants(normalizedUrl).filter(v => !triedUrls.has(v));
              
              if (variants.length > 0) {
                const next = variants[0];
                triedUrls.add(next);
                addDebugLog('🔄 ШАГ 8: Пробуем вариант Cloudflare Images', { 
                  attempt: attempts,
                  newUrl: next,
                  totalVariants: variants.length,
                  allVariants: variants
                });
                
                setTimeout(() => {
                  addDebugLog('🔄 Устанавливаем новый URL', { url: next, elementId: img.id });
                  userAvatar.src = next;
                }, 300 * attempts);
                return;
              }
            }
            
            // Финальный fallback
            img.style.display = "none";
            addDebugLog('❌ ШАГ 9: Все попытки загрузки аватарки исчерпаны', {
              totalAttempts: attempts,
              triedUrls: Array.from(triedUrls),
              element: img.id,
              finalUrl: currentUrl,
              suggestion: 'Проверьте в Cloudflare Dashboard валидность variant и публичность изображения'
            });
          };
          
          img.onload = () => {
            addDebugLog('✅ ШАГ 10: Аватарка успешно загружена!', { 
              url: img.src,
              attempts: attempts + 1,
              element: img.id,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              width: img.width,
              height: img.height,
              complete: img.complete
            });
            img.style.display = "block";
            attempts = 0;
            triedUrls.clear();
          };
        };
        
        setupImageHandlers(userAvatar);
        
        addDebugLog('🔧 ШАГ 11: Устанавливаем src для изображения', {
          normalizedUrl: normalizedUrl,
          userAvatarExists: !!userAvatar
        });
        
        // Устанавливаем src
        userAvatar.style.display = "block";
        addDebugLog('🖼️ Устанавливаем src для аватарки', { 
          url: normalizedUrl,
          beforeSrc: userAvatar.src,
          display: userAvatar.style.display
        });
        userAvatar.src = normalizedUrl;
        addDebugLog('🖼️ src установлен для аватарки', { 
          afterSrc: userAvatar.src,
          complete: userAvatar.complete
        });
        
        // Дополнительная проверка через небольшую задержку
        setTimeout(() => {
          addDebugLog('🔍 ШАГ 12: Проверка состояния через 500ms', {
            userAvatar: {
              src: userAvatar?.src,
              complete: userAvatar?.complete,
              naturalWidth: userAvatar?.naturalWidth,
              naturalHeight: userAvatar?.naturalHeight,
              display: userAvatar?.style.display,
              computedDisplay: userAvatar ? window.getComputedStyle(userAvatar).display : null
            }
          });
        }, 500);
      }
    } else {
      addDebugLog('⚠️ Элемент user-avatar не найден в DOM', {
        userAvatarExists: !!userAvatar
      });
    }
    
    authBtn.textContent = t.signOut;
    authBtn.dataset.signedIn = "true";
  } else {
    userLabel.textContent = "";
    if (userAvatar) {
      userAvatar.style.display = "none";
    }
    authBtn.textContent = t.signIn;
    authBtn.dataset.signedIn = "false";
  }
  
  // Вычисляем центр кнопки для точного выравнивания имени пользователя
  // Делаем это ПОСЛЕ установки текста кнопки и имени пользователя
  if (authBtn && authWrapper && userLabel.textContent) {
    // Используем двойной requestAnimationFrame для гарантии полного обновления DOM
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const btnRect = authBtn.getBoundingClientRect();
        const wrapperRect = authWrapper.getBoundingClientRect();
        // Вычисляем смещение: центр кнопки относительно начала wrapper
        const btnCenter = btnRect.left - wrapperRect.left + btnRect.width / 2;
        // Устанавливаем CSS переменную для точного позиционирования
        authWrapper.style.setProperty('--btn-center', `${btnCenter}px`);
        addDebugLog('🎯 Центрирование имени пользователя', {
          btnCenter: btnCenter,
          btnWidth: btnRect.width,
          btnLeft: btnRect.left - wrapperRect.left,
          wrapperLeft: wrapperRect.left
        });
      });
    });
  }
  
  updateUIForMode();
}

// Matches button handler
matchesBtn?.addEventListener("click", async () => {
  if (matchesModal && matchesList) {
    matchesModal.setAttribute("aria-hidden", "false");
    const session = getSession();
    const playerFid = session?.farcaster?.fid || session?.fid;
    if (playerFid) {
      await loadMatchesList(matchesList, playerFid);
    } else {
      const lang = getLanguage();
      matchesList.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--muted);">${lang === "ru" ? "Войдите через Farcaster" : "Sign in with Farcaster"}</div>`;
    }
  }
});

// Close matches modal
if (matchesModal) {
  matchesModal.addEventListener("click", (e) => {
    if (e.target === matchesModal) {
      matchesModal.setAttribute("aria-hidden", "true");
    }
  });
}

// Handle match loaded event
window.addEventListener("match-loaded", async (e) => {
  const { matchId } = e.detail;
  if (matchId) {
    await loadMatch(matchId);
    mode = "pvp-farcaster";
    if (settingsMode) settingsMode.value = "pvp-farcaster";
    updateUIForMode();
    updateMatchUI();
  }
});

// Cleanup on mode change
settingsMode?.addEventListener("change", () => {
  if (mode !== "pvp-farcaster") {
    clearCurrentMatch();
    updateMatchUI();
  }
});

function updateUIForMode() {
  const isFarcasterMode = mode === "pvp-farcaster";
  const isSignedIn = authBtn?.dataset.signedIn === "true";
  const devMode = localStorage.getItem("dev-mode") === "true";
  const isAuthorizedDev = checkDevAccess();
  
  // Показываем Farcaster кнопки только в Farcaster режиме
  if (inviteBtn) {
    inviteBtn.style.display = isFarcasterMode && isSignedIn ? "inline-block" : "none";
  }
  
  // Показываем кнопку списка матчей в Farcaster режиме для авторизованных пользователей
  if (matchesBtn) {
    matchesBtn.style.display = isFarcasterMode && isSignedIn ? "inline-block" : "none";
  }
  
  if (publishBtn) {
    publishBtn.style.display = isFarcasterMode && isSignedIn ? "inline-block" : "none";
  }
  
  // Dev кнопка видна только для авторизованных разработчиков
  if (devToggleBtn) {
    devToggleBtn.style.display = isAuthorizedDev ? "inline-block" : "none";
  }
  
  // Технические кнопки показываем только в dev режиме И для авторизованных
  const devControls = document.getElementById("dev-controls");
  if (devControls) {
    devControls.style.display = (devMode && isAuthorizedDev) ? "block" : "none";
  }
}

let matchTimer = null;
let lastSyncTurn = 0;

function updateMatchUI() {
  const currentMatch = getCurrentMatch();
  if (!currentMatch.matchState) {
    if (timerContainer) timerContainer.style.display = "none";
    if (matchTimer) {
      matchTimer.destroy();
      matchTimer = null;
    }
    stopSyncing();
    lastSyncTurn = 0;
    return;
  }

  const match = currentMatch.matchState;
  
  // Check if opponent made a move
  const currentTurn = match.gameState.turn;
  if (currentTurn > lastSyncTurn && lastSyncTurn > 0) {
    // New move detected - show notification
    const lang = getLanguage();
    const msg = lang === "ru" ? "Противник сделал ход!" : "Opponent made a move!";
    showToast(msg, "info");
  }
  lastSyncTurn = currentTurn;
  
  // Update board state from match
  state = match.gameState;
  render();

  // Show timer if match is active
  if (match.status === "active" && !match.gameState.finished && timerContainer) {
    timerContainer.style.display = "block";
    
    if (!matchTimer || matchTimer.lastMoveAt !== match.lastMoveAt) {
      if (matchTimer) {
        matchTimer.destroy();
      }
      matchTimer = new TurnTimer(timerContainer, {
        timeoutMs: match.turnTimeout,
        lastMoveAt: match.lastMoveAt,
        onTimeout: () => {
          // Refresh match state when timeout occurs
          syncMatch().then(result => {
            if (result) updateMatchUI();
          });
        }
      });
    }
    matchTimer.start(match.lastMoveAt);

    // Start syncing if not already
    import("./game/match-state.js").then(({ getSyncInterval }) => {
      if (!getSyncInterval()) {
        startSyncing(5000, (syncResult) => {
          updateMatchUI();
        });
      }
    });
  } else {
    if (timerContainer) timerContainer.style.display = "none";
    if (match.gameState.finished) {
      stopSyncing();
    }
  }

  // Update status message
  const lang = getLanguage();
  if (match.gameState.finished) {
    if (match.gameState.winner) {
      const winnerSymbol = match.gameState.winner;
      const isWinner = (match.player1Symbol === winnerSymbol && match.player1Fid === currentMatch.playerFid) ||
                       (match.player2Symbol === winnerSymbol && match.player2Fid === currentMatch.playerFid);
      showStatus(isWinner 
        ? (lang === "ru" ? `Победа: ${winnerSymbol}` : `You win: ${winnerSymbol}`)
        : (lang === "ru" ? `Поражение: ${winnerSymbol}` : `You lose: ${winnerSymbol}`));
    } else {
      showStatus(lang === "ru" ? "Ничья" : "Draw");
    }
  } else {
    const mySymbol = getMySymbol();
    if (isMyTurn()) {
      showStatus(lang === "ru" ? `Ваш ход: ${mySymbol}` : `Your turn: ${mySymbol}`);
    } else {
      showStatus(lang === "ru" ? `Ожидание хода противника...` : `Waiting for opponent...`);
    }
  }
}

function checkDevAccess() {
  const session = getSession();
  
  let isAuthorized = false;
  let accessMethod = "none";
  
  // Проверяем авторизацию через конфигурацию
  if (session?.farcaster?.username || session?.address) {
    isAuthorized = isAuthorizedDeveloper(session?.farcaster?.username, session?.address);
    
    if (isAuthorized) {
      const devInfo = getDeveloperInfo(session?.farcaster?.username, session?.address);
      accessMethod = `${devInfo.type}:${devInfo.displayName}`;
    }
  }
  
  // Локальная разработка (если разрешено в конфиге)
  if (!isAuthorized && DEV_CONFIG.allowLocalhost && 
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    isAuthorized = true;
    accessMethod = "localhost";
  }
  
  // Логируем попытки доступа (если включено в конфиге)
  if (DEV_CONFIG.logAccess) {
    if (isAuthorized) {
      console.log(`✅ Dev access granted via ${accessMethod}`);
    } else {
      console.log(`❌ Dev access denied for ${session?.farcaster?.username || session?.address || 'anonymous'}`);
    }
  }
  
  return isAuthorized;
}
authBtn?.addEventListener("click", async () => {
  try {
    // Логируем начало обработки
    addDebugLog('🖱️ Кнопка "Войти" нажата');
    addDebugLog('📋 Состояние кнопки', {
      signedIn: authBtn?.dataset?.signedIn,
      text: authBtn?.textContent,
      exists: !!authBtn,
      id: authBtn?.id
    });
    
    // Проверяем, что кнопка существует
    if (!authBtn) {
      addDebugLog('❌ Кнопка authBtn не найдена!');
      alert('Ошибка: кнопка авторизации не найдена');
      return;
    }
    
    addDebugLog('✅ Кнопка найдена, проверяем статус авторизации...');
    
    if (authBtn.dataset.signedIn === "true") {
    addDebugLog('🚪 Выход из системы...');
    
    const session = getSession();
    const lang = getLanguage();
    const username = session?.farcaster?.username || session?.address?.slice(0, 6) || (lang === "ru" ? 'пользователь' : 'user');
    
    // Останавливаем синхронизацию матчей
    try {
      stopSyncing();
      clearCurrentMatch();
    } catch (error) {
      addDebugLog('⚠️ Ошибка при очистке состояния матча:', error);
    }
    
    // Выходим из системы
    signOut();
    
    // Обновляем UI
    refreshUserLabel();
    
    // Очищаем таймер и скрываем UI матча
    if (timerContainer) {
      timerContainer.style.display = "none";
    }
    
    // Сбрасываем игровое состояние
    resetBoard(true);
    
    const msg = lang === "ru" 
      ? `👋 Вы вышли из аккаунта\n\n${username}`
      : `👋 Signed out\n\n${username}`;
    alert(msg);
    return;
  }
  
    addDebugLog('✅ Пользователь не авторизован, начинаем процесс авторизации...');
    
    // В Mini App используем SDK, а не кошелек
    // Проверяем окружение сначала (не зависит от загрузки SDK)
    addDebugLog('🔍 Вызываем checkMiniAppEnvironment()...');
    let isMiniAppEnv = false;
    try {
      isMiniAppEnv = farcasterSDK.checkMiniAppEnvironment();
      addDebugLog('✅ checkMiniAppEnvironment() завершен (синхронная проверка)', { result: isMiniAppEnv });
      
      // Если синхронная проверка не прошла, пробуем асинхронную (проверка через SDK)
      if (!isMiniAppEnv) {
        addDebugLog('🔍 Синхронная проверка не прошла, пробуем асинхронную проверку через SDK...');
        try {
          isMiniAppEnv = await farcasterSDK.checkMiniAppEnvironmentAsync();
          addDebugLog('✅ checkMiniAppEnvironmentAsync() завершен', { result: isMiniAppEnv });
        } catch (asyncError) {
          addDebugLog('⚠️ Ошибка в асинхронной проверке (но это может быть нормально)', {
            message: asyncError?.message || String(asyncError)
          });
        }
      }
    } catch (error) {
      addDebugLog('❌ Ошибка в checkMiniAppEnvironment()', {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name
      });
      // Продолжаем с false, если ошибка
      isMiniAppEnv = false;
    }
    
    // Дополнительная проверка для надежности
    addDebugLog('🔍 Выполняем дополнительные проверки Mini App...');
    let additionalMiniAppCheck = false;
    try {
      // Безопасная проверка для кросс-доменных iframe
      const isInIframe = window.parent !== window;
      let sameOrigin = true;
      try {
        sameOrigin = window.parent.location.origin === window.location.origin;
      } catch (e) {
        // SecurityError при кросс-доменном доступе - это нормально для Mini App
        sameOrigin = false;
      }
      
      additionalMiniAppCheck = !!(
        window.farcaster ||
        (isInIframe && !sameOrigin) ||
        document.referrer?.includes('farcaster') ||
        document.referrer?.includes('warpcast') ||
        window.location.search.includes('miniApp=true')
      );
      addDebugLog('✅ Дополнительные проверки завершены', { result: additionalMiniAppCheck });
    } catch (error) {
      addDebugLog('❌ Ошибка в дополнительных проверках', {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name
      });
      // Безопасный fallback без проверки origin
      additionalMiniAppCheck = !!(
        window.farcaster ||
        (window.parent !== window) ||
        document.referrer?.includes('farcaster') ||
        document.referrer?.includes('warpcast') ||
        window.location.search.includes('miniApp=true')
      );
    }
    
    const finalMiniAppCheck = isMiniAppEnv || additionalMiniAppCheck;
    addDebugLog('🌍 Проверка Mini App окружения', { 
      result: finalMiniAppCheck,
      isMiniAppEnv,
      additionalMiniAppCheck,
      windowFarcaster: !!window.farcaster,
      isInIframe: window.parent !== window,
      referrer: document.referrer
    });
    
    // Для мобильных устройств: если все проверки false, но это мобильное устройство,
    // всё равно попробуем Mini App авторизацию (мобильное приложение может не показывать признаки)
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                           (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
    
    // Определяем, является ли это localhost (локальная разработка)
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' ||
                        window.location.hostname === '0.0.0.0';
    
    // КРИТИЧНО: Проверяем реальные признаки Mini App окружения
    // checkMiniAppEnvironmentAsync() может давать ложные срабатывания, так как SDK может быть в сборке
    // Реальные признаки: window.farcaster, iframe, referrer, или мобильное устройство без кошелька
    const hasRealMiniAppIndicators = !!(
      window.farcaster ||
      (window.parent !== window) ||
      document.referrer?.includes('farcaster') ||
      document.referrer?.includes('warpcast')
    );
    
    // Используем Mini App авторизацию только если:
    // 1. Есть РЕАЛЬНЫЕ признаки Mini App (window.farcaster, iframe, referrer) ИЛИ
    // 2. Это мобильное устройство БЕЗ window.ethereum (кошелек недоступен)
    // КРИТИЧНО: Если есть window.ethereum и это НЕ мобильное - ВСЕГДА используем кошелек!
    // НЕ используем Mini App только на основе checkMiniAppEnvironmentAsync() - это может быть ложное срабатывание
    const shouldUseMiniApp = hasRealMiniAppIndicators || 
                             (isMobileDevice && !window.ethereum && !isLocalhost);
    
    // Дополнительная проверка: если есть window.ethereum и нет реальных признаков Mini App - используем кошелек
    if (window.ethereum && !hasRealMiniAppIndicators && !isMobileDevice) {
      addDebugLog('💼 Обнаружен кошелек на десктопе без признаков Mini App - используем кошелек');
    }
    
    addDebugLog('🔍 Решение о методе авторизации', {
      finalMiniAppCheck,
      isMiniAppEnv,
      additionalMiniAppCheck,
      hasRealMiniAppIndicators,
      isMobileDevice,
      isLocalhost,
      hasEthereum: !!window.ethereum,
      hasWindowFarcaster: !!window.farcaster,
      isInIframe: window.parent !== window,
      referrer: document.referrer,
      shouldUseMiniApp
    });
    
    if (shouldUseMiniApp) {
      // Если на мобильном и нет кошелька, предполагаем Mini App
      if (isMobileDevice && !window.ethereum && !finalMiniAppCheck) {
        addDebugLog('📱 Мобильное устройство без кошелька - предполагаем Mini App окружение');
      }
      
      addDebugLog('🔍 Пытаемся авторизоваться через Farcaster Mini App...');
    addDebugLog('📊 Проверка окружения', {
      windowFarcaster: !!window.farcaster,
      parentWindow: window.parent !== window,
      referrer: document.referrer,
      location: window.location.href
    });
    
    try {
      // Сначала пытаемся получить пользователя через Quick Auth напрямую
      // Это более надежный способ для Mini App
      const backendOrigin = window.location.origin;
      addDebugLog('🌐 Backend origin', backendOrigin);
      
      // Пробуем сначала getUser() - это более надежный способ для Mini App
      // Quick Auth может не работать в локальной разработке или если SDK внутренне падает
      let fullUserData = null;
      let usedQuickAuth = false;
      
      // Сначала пробуем getUser() - основной метод
      try {
        addDebugLog('👤 Пробуем получить пользователя через SDK.getUser()...');
        const user = await farcasterSDK.getUser();
        addDebugLog('👤 SDK.getUser() результат', user);
        
        if (user && user.fid) {
          // Преобразуем user в формат fullUserData
          // Проверяем все возможные поля для аватарки из ответа SDK
          const userPfpFields = [
            user.pfp,
            user.pfpUrl,
            user.pfp_url,
            user.pfpURL,
            user.avatar,
            user.avatarUrl,
            user.avatar_url,
            user.profilePicture,
            user.profile_picture
          ];
          const userPfpValue = userPfpFields.find(url => url && typeof url === 'string' && url.trim().length > 0) || null;
          
          fullUserData = {
            fid: user.fid,
            username: user.username,
            displayName: user.display_name || user.displayName,
            pfp: userPfpValue,
            // Сохраняем все возможные варианты для дальнейшего маппинга
            pfpUrl: user.pfpUrl,
            pfp_url: user.pfp_url,
            avatar: user.avatar,
            avatarUrl: user.avatarUrl,
            avatar_url: user.avatar_url,
            profilePicture: user.profilePicture,
            profile_picture: user.profile_picture
          };
          addDebugLog('✅ getUser() успешен!', {
            fid: fullUserData.fid,
            username: fullUserData.username,
            displayName: fullUserData.displayName,
            foundPfp: fullUserData.pfp,
            allUserPfpFields: {
              pfp: user.pfp,
              pfpUrl: user.pfpUrl,
              pfp_url: user.pfp_url,
              avatar: user.avatar,
              avatarUrl: user.avatarUrl,
              avatar_url: user.avatar_url,
              profilePicture: user.profilePicture,
              profile_picture: user.profile_picture
            }
          });
        } else {
          throw new Error('SDK не вернул данные пользователя (user.fid отсутствует)');
        }
      } catch (getUserError) {
        console.error('❌ getUser() ошибка:', getUserError);
        addDebugLog('❌ getUser() ошибка', {
          message: getUserError.message,
          stack: getUserError.stack,
          name: getUserError.name
        });
        
        // Если getUser() не работает, пробуем Quick Auth как fallback
        // НО только если это не localhost (Quick Auth может не работать локально)
        const isLocalhost = backendOrigin.includes('localhost') || backendOrigin.includes('127.0.0.1');
        
        if (isLocalhost) {
          addDebugLog('⚠️ Localhost обнаружен - Quick Auth может не работать. Пропускаем.');
          throw new Error(`SDK недоступен в локальном окружении. Откройте приложение через Warpcast Mini App или используйте кошелек на production домене.`);
        }
        
        try {
          addDebugLog('🔐 Пробуем Quick Auth как fallback...');
          fullUserData = await farcasterSDK.getUserWithQuickAuth(backendOrigin);
          usedQuickAuth = true;
          addDebugLog('✅ Quick Auth успешен!', fullUserData);
        } catch (quickAuthError) {
          console.error('❌ Quick Auth тоже не сработал:', quickAuthError);
          addDebugLog('❌ Quick Auth ошибка', {
            message: quickAuthError.message,
            stack: quickAuthError.stack,
            name: quickAuthError.name
          });
          
          // Если оба метода не работают, выбрасываем понятную ошибку
          throw new Error(`Не удалось получить данные пользователя через Mini App SDK. Ошибка: ${getUserError.message}`);
        }
      }
      
      if (!fullUserData || !fullUserData.fid) {
        throw new Error('Quick Auth не вернул данные пользователя');
      }
      
      // Quick Auth возвращает: { fid, username, displayName, pfp, ... }
      // Маппим в наш формат: { fid, username, display_name, pfp_url }
      // Проверяем все возможные поля для аватарки
      const possiblePfpFields = [
        fullUserData.pfp,
        fullUserData.pfpUrl,
        fullUserData.pfp_url,
        fullUserData.pfpURL,
        fullUserData.avatar,
        fullUserData.avatarUrl,
        fullUserData.avatar_url,
        fullUserData.profilePicture,
        fullUserData.profile_picture
      ];
      
      const pfpUrlValue = possiblePfpFields.find(url => url && typeof url === 'string' && url.trim().length > 0) || null;
      
      const farcasterProfile = {
        fid: fullUserData.fid,
        username: fullUserData.username || fullUserData.displayName || `user_${fullUserData.fid}`,
        display_name: fullUserData.displayName || fullUserData.username || `User ${fullUserData.fid}`,
        // Сохраняем ВСЕ варианты полей для аватарки (для мобильных устройств)
        pfp_url: pfpUrlValue,
        // Дополнительные поля на случай, если основной не работает
        pfp: fullUserData.pfp,
        pfpUrl: fullUserData.pfpUrl,
        pfpURL: fullUserData.pfpURL,
        avatar: fullUserData.avatar,
        avatarUrl: fullUserData.avatarUrl,
        avatar_url: fullUserData.avatar_url,
        profilePicture: fullUserData.profilePicture,
        profile_picture: fullUserData.profile_picture
      };
      
      addDebugLog('🔍 Quick Auth данные до маппинга', {
        fid: fullUserData.fid,
        username: fullUserData.username,
        displayName: fullUserData.displayName,
        allPfpFields: {
          pfp: fullUserData.pfp,
          pfpUrl: fullUserData.pfpUrl,
          pfp_url: fullUserData.pfp_url,
          pfpURL: fullUserData.pfpURL,
          avatar: fullUserData.avatar,
          avatarUrl: fullUserData.avatarUrl,
          avatar_url: fullUserData.avatar_url,
          profilePicture: fullUserData.profilePicture,
          profile_picture: fullUserData.profile_picture
        },
        foundPfpUrl: pfpUrlValue
      });
      
      addDebugLog('👤 Создаём профиль пользователя', farcasterProfile);
      
      const session = {
        schemaVersion: "1.0.0",
        farcaster: farcasterProfile,
        miniapp: true,
        issuedAt: new Date().toISOString()
      };
      
      localStorage.setItem("fc_session", JSON.stringify(session));
      
      // Убираем флаг автоматической авторизации (если был)
      localStorage.removeItem('auto_auth_started');
      
      // Обновляем UI перед показом alert
      refreshUserLabel();
      updateUIForMode();
      
      addDebugLog('✅ Farcaster Mini App пользователь авторизован!', farcasterProfile);
      addDebugLog('👤 Имя пользователя должно отображаться', { 
        username: farcasterProfile.username,
        display_name: farcasterProfile.display_name,
        fid: farcasterProfile.fid
      });
      
      // Показываем успех
      const lang = getLanguage();
      const msg = lang === "ru"
        ? `✅ Успешная авторизация!\n\n@${farcasterProfile.username}\nFID: ${farcasterProfile.fid}`
        : `✅ Signed in successfully!\n\n@${farcasterProfile.username}\nFID: ${farcasterProfile.fid}`;
      alert(msg);
      return;
      
    } catch (error) {
      console.error('❌ Ошибка авторизации Mini App:', error);
      addDebugLog('❌ Ошибка авторизации Mini App', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        cause: error.cause
      });
      
      // Показываем пользователю детальную ошибку с инструкциями
      const lang = getLanguage();
      let errorMsg;
      
      if (error.message?.includes('SDK недоступен') || error.message?.includes('fallback')) {
        errorMsg = lang === "ru"
          ? `❌ Farcaster SDK недоступен\n\nЭто означает, что вы не находитесь в Mini App окружении.\n\nДля авторизации:\n1. Откройте приложение через Warpcast\n2. Или используйте кошелек на компьютере`
          : `❌ Farcaster SDK unavailable\n\nThis means you're not in a Mini App environment.\n\nTo sign in:\n1. Open the app through Warpcast\n2. Or use wallet on desktop`;
      } else if (error.message?.includes('Quick Auth')) {
        errorMsg = lang === "ru"
          ? `❌ Ошибка Quick Auth\n\n${error.message}\n\nПроверьте, что API сервер запущен и доступен.`
          : `❌ Quick Auth error\n\n${error.message}\n\nMake sure API server is running and accessible.`;
      } else {
        errorMsg = lang === "ru"
          ? `Не удалось подключиться к Farcaster:\n\n${error.message}\n\nПопробуйте обновить страницу или проверить консоль браузера для деталей.`
          : `Failed to connect to Farcaster:\n\n${error.message}\n\nTry refreshing the page or check browser console for details.`;
      }
      
      alert(errorMsg);
      
      // НЕ используем кошелек как fallback в Mini App - это ошибка конфигурации
      addDebugLog('🚫 Не используем кошелек как fallback в Mini App');
      refreshUserLabel();
      return;
    }
  }
  
  // Для обычного браузера используем кошелек
  addDebugLog('💼 Не Mini App окружение, пробуем авторизацию через кошелек...');
  
  // Проверяем, мобильное ли это устройство (используем уже определенную переменную выше)
  // isMobileDevice уже определено выше, используем её
  
  // Проверяем, не происходит ли уже автоматическая авторизация
  // (автоматическая авторизация запускается при загрузке страницы)
  const autoAuthInProgress = localStorage.getItem('auto_auth_started') === 'true';
  
  if (isMobileDevice && !window.ethereum && !finalMiniAppCheck && !autoAuthInProgress) {
    const lang = getLanguage();
    const msg = lang === "ru"
      ? `📱 Мобильное устройство обнаружено\n\nДля авторизации откройте игру через Warpcast Mini App.\n\nВ обычном мобильном браузере авторизация через кошелек недоступна.`
      : `📱 Mobile device detected\n\nTo sign in, please open the game through Warpcast Mini App.\n\nWallet authentication is not available in regular mobile browsers.`;
    alert(msg);
    refreshUserLabel();
    return;
  }
  
  // Если это Mini App, но SDK еще не загрузился, ждем немного
  if (isMobileDevice && finalMiniAppCheck && !window.ethereum) {
    addDebugLog('📱 Mini App окружение обнаружено, но SDK еще не загружен. Ждем...');
    
    // Не показываем ошибку сразу - даем время для автоматической авторизации
    // Автоматическая авторизация обычно происходит в течение 1-2 секунд
    setTimeout(() => {
      const session = getSession();
      if (!session?.farcaster?.fid && !session?.address) {
        const lang = getLanguage();
        const msg = lang === "ru"
          ? `🔄 Авторизация занимает больше времени...\n\nЕсли авторизация не произошла автоматически, попробуйте обновить страницу.`
          : `🔄 Authentication is taking longer...\n\nIf sign in didn't happen automatically, try refreshing the page.`;
        addDebugLog('⏱️ Автоматическая авторизация не завершилась, показываем сообщение');
        alert(msg);
        refreshUserLabel();
      } else {
        addDebugLog('✅ Автоматическая авторизация завершилась успешно');
      }
    }, 3000);
    return;
  }
  
  try { 
    const session = await signInWithWallet();
    addDebugLog('✅ Авторизация через кошелек успешна', session);
    
    // Убираем флаг автоматической авторизации (если был)
    localStorage.removeItem('auto_auth_started');
    
    // Обновляем UI
    refreshUserLabel();
    updateUIForMode();
    
    const lang = getLanguage();
    const username = session?.farcaster?.username || session?.address?.slice(0, 6) + "…" + session?.address?.slice(-4) || 'user';
    const msg = lang === "ru"
      ? `✅ Успешная авторизация!\n\n${session?.farcaster?.username ? '@' + session.farcaster.username : username}`
      : `✅ Signed in successfully!\n\n${session?.farcaster?.username ? '@' + session.farcaster.username : username}`;
    alert(msg);
  } catch (e) { 
    addDebugLog('❌ Ошибка авторизации через кошелек', {
      message: e?.message || String(e),
      stack: e?.stack
    }); 
    const lang = getLanguage();
    
    // Улучшенное сообщение об ошибке для мобильных устройств
    let msg;
    if (isMobileDevice && (!window.ethereum || e?.message?.includes('window.ethereum'))) {
      msg = lang === "ru"
        ? `📱 Кошелек недоступен на мобильном устройстве\n\nДля игры на мобильном устройстве:\n1. Откройте Warpcast\n2. Найдите эту игру в Mini Apps\n3. Авторизация произойдет автоматически\n\nИли используйте приложение на компьютере.`
        : `📱 Wallet not available on mobile device\n\nTo play on mobile:\n1. Open Warpcast\n2. Find this game in Mini Apps\n3. Sign in will happen automatically\n\nOr use the app on your computer.`;
    } else if (e?.message?.includes('rejected') || e?.message?.includes('denied')) {
      msg = lang === "ru"
        ? "Авторизация отменена пользователем"
        : "Authentication cancelled by user";
    } else {
      msg = lang === "ru"
        ? "Не удалось войти: " + (e?.message || e)
        : "Failed to sign in: " + (e?.message || e);
    }
    alert(msg);
    refreshUserLabel();
  } 
  } catch (error) {
    // Критическая ошибка в обработчике - логируем все детали
    addDebugLog('❌ КРИТИЧЕСКАЯ ОШИБКА в обработчике Sign In', {
      message: error?.message || String(error),
      stack: error?.stack,
      name: error?.name,
      cause: error?.cause,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
    });
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА в обработчике Sign In:', error);
    const lang = getLanguage();
    alert(lang === "ru" 
      ? `Критическая ошибка при авторизации: ${error?.message || String(error)}\n\nПроверьте debug логи для деталей.`
      : `Critical authentication error: ${error?.message || String(error)}\n\nCheck debug logs for details.`
    );
  }
});

inviteBtn?.addEventListener("click", async () => {
  if (mode !== "pvp-farcaster") {
    const lang = getLanguage();
    alert(lang === "ru" ? "Выберите режим: PvP — Farcaster" : "Select mode: PvP — Farcaster");
    return;
  }
  const session = getSession();
  if (!session?.farcaster?.fid && !session?.address) {
    const lang = getLanguage();
    alert(lang === "ru" ? "Сначала войдите через Farcaster." : "Please sign in with Farcaster first.");
    return;
  }
  
  const lang = getLanguage();
  const visibility = confirm(
    lang === "ru" 
      ? "Публиковать публично? OK — public, Cancel — private"
      : "Publish publicly? OK — public, Cancel — private"
  ) ? "public" : "private";
  
  try {
    const { payload, res, matchCreated } = await sendInvite(session, { visibility });
    const msg = lang === "ru"
      ? `Инвайт создан!\n\nMatch ID: ${payload.matchId}\nCast ID: ${res.castId || "ok"}\nMatch в API: ${matchCreated ? "да" : "нет"}`
      : `Invite created!\n\nMatch ID: ${payload.matchId}\nCast ID: ${res.castId || "ok"}\nMatch in API: ${matchCreated ? "yes" : "no"}`;
    alert(msg);
  } catch (e) {
    const lang = getLanguage();
    const errorMsg = lang === "ru" 
      ? `Не удалось создать инвайт: ${e?.message || e}`
      : `Failed to create invite: ${e?.message || e}`;
    alert(errorMsg);
  }
});

checkRepliesBtn?.addEventListener("click", async () => {
  try {
    const res = await listThreadReplies("mock-cast-id");
    const count = res?.replies?.length ?? 0;
    alert("Ответов найдено: " + count + (count ? " (см. консоль)" : ""));
    if (count) console.log("Replies:", res.replies);
  } catch (e) {
    console.error(e);
    alert("Не удалось получить ответы: " + (e?.message || e));
  }
});

function buildMatchResultPayload() {
  return {
    schemaVersion: "1.0.0",
    matchId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    startedAt: new Date(Date.now() - state.turn * 1500).toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: Math.max(1, state.turn * 1500),
    winner: state.winner,
    reason: state.winner ? "win" : "draw",
    movesCount: state.turn,
    players: [{ fid: null, address: getSession()?.address || "" }],
    publishedToFarcaster: false
  };
}
publishBtn?.addEventListener("click", async () => {
  if (!state.finished) {
    alert("Матч ещё не завершён.");
    return;
  }
  const session = getSession();
  if (!session?.address) {
    alert("Сначала войдите через кошелёк.");
    return;
  }
  const visibility = confirm("Публиковать публично? OK — public, Cancel — private") ? "public" : "private";
  const payload = buildMatchResultPayload();
  try {
    const res = await publishMatchResult({ ...payload, visibility });
    alert("Результат опубликован (мок): " + (res.castId || "ok"));
  } catch (e) {
    console.error(e);
    alert("Не удалось опубликовать результат: " + (e?.message || e));
  }
});

createSignerBtn?.addEventListener("click", async () => {
  try {
    // Замените на ваш App FID или получите его из сессии
    const appFid = 12345; // Временное значение - замените на ваш FID
    const redirectUrl = window.location.origin;
    
    console.log("Создание signer'а...", { appFid, redirectUrl });
    
    const result = await createSignedKey(appFid, redirectUrl);
    
    if (result.success) {
      const signerUuid = result.data.signer_uuid;
      const approvalUrl = result.data.signer_approval_url || result.data.approval_url;
      const status = result.data.status;
      
      let message = `Signer создан!\n\nUUID: ${signerUuid}\nСтатус: ${status}\n\n`;
      
      if (status === "approved") {
        message += "✅ Signer уже одобрен! Можете использовать его для публикации кастов.\n\n";
        message += "Обновите .env.local файл:\n";
        message += `VITE_NEYNAR_SIGNER_UUID=${signerUuid}`;
      } else {
        message += "⏳ Signer требует одобрения.\n\n";
        message += "Для одобрения перейдите по ссылке:\n";
        message += approvalUrl || "Ссылка не предоставлена";
      }
      
      alert(message);
      
      // Копируем UUID в буфер обмена (если поддерживается)
      if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(signerUuid);
          console.log("Signer UUID скопирован в буфер обмена");
        } catch (err) {
          console.log("Не удалось скопировать в буфер обмена");
        }
      }
    }
  } catch (e) {
    console.error("Ошибка создания signer'а:", e);
    
    let errorMessage = "Не удалось создать signer: " + (e?.message || e);
    
    // Добавляем специфичные советы по ошибкам
    if (e?.message?.includes("402")) {
      errorMessage += "\n\n💡 Ошибка 402: Payment Required\n";
      errorMessage += "Возможные причины:\n";
      errorMessage += "• Нужен платный тарифный план Neynar\n";
      errorMessage += "• API ключ не имеет прав на создание signer'ов\n";
      errorMessage += "• Попробуйте использовать mock режим для тестирования";
    } else if (e?.message?.includes("401")) {
      errorMessage += "\n\n💡 Ошибка 401: Unauthorized\n";
      errorMessage += "Проверьте API ключ в .env.local файле";
    }
    
    alert(errorMessage);
  }
});

// Function to initialize all UI texts based on current language
function initializeUITexts() {
  const lang = getLanguage();
  
  // Update button texts
  if (newBtn) {
    newBtn.textContent = lang === "ru" ? "Новая игра" : "New Game";
  }
  
  // Update Farcaster buttons
  if (inviteBtn) {
    inviteBtn.textContent = lang === "ru" ? "Пригласить игрока" : "Invite Player";
  }
  
  if (matchesBtn) {
    matchesBtn.textContent = lang === "ru" ? "Мои матчи" : "My Matches";
  }
  
  // Update mode select options (now in settings)
  if (settingsMode) {
    const options = settingsMode.querySelectorAll("option");
    if (options.length >= 4) {
      if (lang === "ru") {
        options[0].textContent = "PvE — Легко";
        options[1].textContent = "PvE — Сложно";
        options[2].textContent = "PvP — Локально";
        options[3].textContent = "PvP — Farcaster";
      } else {
        options[0].textContent = "PvE — Easy";
        options[1].textContent = "PvE — Hard";
        options[2].textContent = "PvP — Local";
        options[3].textContent = "PvP — Farcaster";
      }
    }
  }
  
  // Update modal title
  const modalTitle = document.getElementById("settings-modal-title");
  if (modalTitle) {
    modalTitle.textContent = lang === "ru" ? "Настройки" : "Settings";
  }
  
  // Update language label
  const langLabel = document.querySelector('label[for="settings-lang"]');
  if (langLabel) {
    langLabel.textContent = lang === "ru" ? "Язык" : "Language";
  }
  
  // Update game mode label
  const modeLabel = document.querySelector('label[for="settings-mode"]');
  if (modeLabel) {
    modeLabel.textContent = lang === "ru" ? "Режим игры" : "Game Mode";
  }
}

// Initialize theme (fixed to light) and language from localStorage
setTheme("light");
// Default to English if no language is set
const savedLang = localStorage.getItem("language");
if (!savedLang) {
  setLanguage("en");
} else {
  setLanguage(savedLang);
}
if (settingsLang) {
  settingsLang.value = getLanguage();
}
initializeUITexts();

// Инициализируем dev режим
const devMode = localStorage.getItem("dev-mode") === "true";
if (devToggleBtn) {
  devToggleBtn.setAttribute("aria-pressed", devMode.toString());
  const lang = getLanguage();
  const title = lang === "ru"
    ? (devMode ? "Выключить режим разработчика" : "Включить режим разработчика")
    : (devMode ? "Disable developer mode" : "Enable developer mode");
  devToggleBtn.title = title;
}

// Display app version
const versionEl = document.getElementById('app-version');
if (versionEl) {
  versionEl.textContent = `v${APP_VERSION}`;
  versionEl.title = `Версия приложения: v${APP_VERSION}`;
}

render();
refreshUserLabel();

// Check for active match on load
(async () => {
  const session = getSession();
  const playerFid = session?.farcaster?.fid || session?.fid;
  if (playerFid && mode === "pvp-farcaster") {
    try {
      const matches = await listPlayerMatches(playerFid);
      const activeMatch = matches.find(m => m.status === "active" && !m.gameState.finished);
      if (activeMatch) {
        await loadMatch(activeMatch.matchId);
        updateMatchUI();
      }
    } catch (error) {
      // Silent fail - match loading is optional
    }
  }
})();

// Инициализация Farcaster Mini App SDK
// Following official documentation: https://miniapps.farcaster.xyz/docs/getting-started
// After your app is fully loaded and ready to display: await sdk.actions.ready()
// Pattern from working React example: call ready() after UI initialization (like useEffect)
// CRITICAL: ready() MUST be called to hide splash screen, even if there are errors

        (async () => {
          try {
            // Mark that auto-auth has started if we're in Mini App environment
            const isMiniAppEnv = farcasterSDK.checkMiniAppEnvironment();
            if (isMiniAppEnv) {
              localStorage.setItem('auto_auth_started', 'true');
            }
            
            // Call ready() FIRST to hide splash screen, even if auto-load fails
            await farcasterSDK.ready();
            
            // Автоматически загружаем пользователя из Mini App, если доступен
            if (farcasterSDK.checkMiniAppEnvironment()) {
              try {
                const user = await farcasterSDK.getUser();
                
                if (!user || !user.fid) {
                  return;
                }
                
                const backendOrigin = window.location.origin;
                
                // Пытаемся получить полные данные через Quick Auth
                let fullUserData = null;
                try {
                  fullUserData = await farcasterSDK.getUserWithQuickAuth(backendOrigin);
                } catch (error) {
                  return;
                }
                
                if (!fullUserData || !fullUserData.fid) {
                  return;
                }
                
                // Quick Auth возвращает: { fid, username, displayName, pfp, ... }
                // Маппим в наш формат: { fid, username, display_name, pfp_url }
                const farcasterProfile = {
                  fid: fullUserData.fid,
                  username: fullUserData.username || fullUserData.displayName || `user_${fullUserData.fid}`,
                  display_name: fullUserData.displayName || fullUserData.username || `User ${fullUserData.fid}`,
                  pfp_url: fullUserData.pfp || fullUserData.pfpUrl || fullUserData.pfp_url || null
                };
                
                const session = getSession() || {};
                const updatedSession = {
                  ...session,
                  farcaster: farcasterProfile,
                  miniapp: true,
                  issuedAt: new Date().toISOString()
                };
                
                localStorage.setItem("fc_session", JSON.stringify(updatedSession));
                
                // Убираем флаг автоматической авторизации
                localStorage.removeItem('auto_auth_started');
                
                // Обновляем UI для отображения имени пользователя
                refreshUserLabel();
              } catch (error) {
                // Silent fail
              }
            }
          } catch (error) {
            // CRITICAL: Still try to call ready() even on error to hide splash screen
            try {
              await farcasterSDK.ready();
            } catch (readyError) {
              // Silent fail
            }
            
            // App will still work in browser, but Mini App features won't be available
          }
        })();
