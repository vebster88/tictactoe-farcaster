import { createInitialState } from "./game/state.js";
import { applyMove } from "./game/engine.js";
import { pickRandomMove } from "./ai/random.js";
import { bestMoveMinimax } from "./ai/minimax.js";
import { getSession, signInWithWallet, signOut } from "./farcaster/auth.js";
import { sendInvite } from "./farcaster/matchmaking.js";
import { listThreadReplies, publishMatchResult, getUserByFid, getVirtualFidFromAddress } from "./farcaster/client.js";
import { getMatch, acceptMatch, sendMove, listPlayerMatches } from "./farcaster/match-api.js";
import { setCurrentMatch, loadMatch, clearCurrentMatch, handleMove as handleMatchMove, isMyTurn, getMySymbol, getOpponentFid, startSyncing, stopSyncing, getCurrentMatch } from "./game/match-state.js";
import { TurnTimer } from "./ui/Timer.js";
import { loadMatchesList } from "./ui/MatchesList.js";
import { loadLeaderboard, renderLeaderboard } from "./ui/Leaderboard.js";
import { createSignedKey } from "./farcaster/signer.js";
import { farcasterSDK } from "./farcaster/sdk.js";
import { AUTHORIZED_DEVELOPERS, DEV_SECRET_CODE, DEV_CONFIG, isAuthorizedDeveloper, getDeveloperInfo } from "./config/developers.js";
import { APP_VERSION } from "./version.js";
import { normalizeFidToString, normalizeMatchId, normalizeFidToNumber } from "./utils/normalize.js";
import { getAnonIdFromFid } from "./utils/fid-helpers.js";

// Debug logging - can be controlled via environment variable
const DEBUG_ENABLED = import.meta.env.VITE_DEBUG === "true" || 
                     import.meta.env.DEV || 
                     localStorage.getItem("debug-enabled") === "true" ||
                     window.location.search.includes("debug=true");

// Функция для оптимизации Cloudflare Images URL
// Главная проблема: /rectcrop3 или /rectcontain2 игнорируют query параметры!
// Решение: заменяем variant на /public, чтобы query параметры работали
function optimizeCloudflareImagesUrl(url, displaySize) {
  if (!url || !url.includes('imagedelivery.net')) {
    return url;
  }
  
  try {
    const urlObj = new URL(url);
    
    // Заменяем /rectcrop3 или /rectcontain2 на /public
    // Это позволяет query параметрам работать корректно
    const pathname = urlObj.pathname;
    // Формат: /{accountHash}/{imageId}/{variant}
    // Пример: /BXluQx4ige9GuW0Ia56BHw/b26208f2-e555-440b-9f7a-2495d3ad5c00/rectcrop3
    const pathParts = pathname.split('/').filter(p => p);
    
    if (pathParts.length >= 3) {
      // Убираем последний элемент (variant: rectcrop3, rectcontain2)
      // и заменяем на 'public'
      pathParts[pathParts.length - 1] = 'public';
      urlObj.pathname = '/' + pathParts.join('/');
    }
    
    // Добавляем параметры оптимизации
    const targetSize = Math.min(128, displaySize * 4); // 128px макс, но с запасом под Retina
    urlObj.searchParams.set('width', targetSize.toString());
    urlObj.searchParams.set('height', targetSize.toString());
    urlObj.searchParams.set('fit', 'crop'); // crop для квадратных аватаров
    urlObj.searchParams.set('quality', '85'); // баланс качество/размер
    
    return urlObj.toString();
  } catch (e) {
    console.warn('[app.js] Failed to optimize Cloudflare Images URL:', url, e);
    return url;
  }
}

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
  
  // Получаем язык
  const lang = getLanguage();
  
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
  
  uniqueLogs.sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp) : new Date(0);
    const timeB = b.timestamp ? new Date(b.timestamp) : new Date(0);
    return timeA - timeB;
  });
  
  logsCount.textContent = uniqueLogs.length;
  
  // Показываем информацию о статусе debug режима
  const lang = getLanguage();
  const debugStatus = DEBUG_ENABLED ? 
    (lang === "ru" ? "🟢 Debug включен" : "🟢 Debug enabled") :
    (lang === "ru" ? "🔴 Debug выключен" : "🔴 Debug disabled");
  
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
      ${uniqueLogs.slice(-50).map(log => 
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
    const lang = getLanguage();
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

// Экспортируем addDebugLog в window для использования в других модулях
window.addDebugLog = addDebugLog;

// Now we can safely use addDebugLog
const root = document.body;
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const settingsBtn = document.getElementById("btn-settings");
const devToggleBtn = document.getElementById("btn-dev-toggle");
const newBtn = document.getElementById("btn-new");
const authBtn = document.getElementById("btn-auth");
// userLabel получается внутри refreshUserLabel() для избежания проблем с порядком инициализации
const createSignerBtn = document.getElementById("btn-create-signer");
const checkRepliesBtn = document.getElementById("btn-check-replies");
const inviteBtn = document.getElementById("btn-invite");
const publishBtn = document.getElementById("btn-publish-result");
const matchesBtn = document.getElementById("btn-matches");
const matchesModal = document.getElementById("matches-modal");
const matchesList = document.getElementById("matches-list");
const leaderboardBtn = document.getElementById("btn-leaderboard");
const leaderboardModal = document.getElementById("leaderboard-modal");
const leaderboardList = document.getElementById("leaderboard-list");
const timerContainer = document.getElementById("timer-container");
const cells = [...boardEl.querySelectorAll(".cell")];
const matchSwitcher = document.getElementById("match-switcher");
const matchSwitcherPrev = document.getElementById("match-switcher-prev");
const matchSwitcherNext = document.getElementById("match-switcher-next");

// Settings modal elements
const settingsModal = document.getElementById("settings-modal");
const settingsLang = document.getElementById("settings-lang");
const settingsMode = document.getElementById("settings-mode");
const modalCloseBtns = document.querySelectorAll(".modal-close");

let state = createInitialState();
let sessionStats = { wins: 0, losses: 0, draws: 0 };
const standaloneSessionStats = { wins: 0, losses: 0, draws: 0 };
const matchOutcomeMap = new Map();
let mode = settingsMode?.value || "pve-easy";
let botThinking = false;
const MAX_PENDING_INVITES = 2;
const matchSymbolCache = new Map();
const statsRefreshTimers = new Map();
const activeMatchIdsCache = new Set();

const MATCH_POLL_CONFIG = {
  // Базовые интервалы (до адаптации по состояниям)
  fastIntervalMs: 5000,
  activeIntervalMs: 4500,
  pendingIntervalMs: 8000,
  idleIntervalMs: 17000,
  noMatchIntervalMs: 60000,

  // Как долго после изменения держим "горячий" режим
  changeBoostMs: 12000,

  // Через сколько стабильных циклов переводить polling в более "холодное" состояние
  warmAfterUnchangedCycles: 3,
  coldAfterUnchangedCycles: 9,

  // Ограничения и джиттер для интервалов
  minIntervalMs: 3000,
  maxIntervalMs: 90000,
  jitterRatio: 0.2, // +/-20%

  // За сколько миллисекунд считаем кеш снапшота ещё свежим
  cacheStaleMs: 12000 // Увеличено для снижения KV запросов
};

const matchDataStore = {
  matches: [],
  lastFetchedAt: 0,
  signature: "",
  fetchPromise: null,
  subscribers: new Set(),
  pollTimer: null,
  pollingEnabled: false,
  nextIntervalMs: MATCH_POLL_CONFIG.activeIntervalMs,
  lastChangeAt: 0,
  // Состояние "умного" polling'а
  mode: "hot", // "hot" | "warm" | "cold"
  unchangedCycles: 0
};

// Use imported utility functions instead of local duplicates
const normalizeMatchIdValue = normalizeMatchId;
const normalizeFidValue = normalizeFidToString;


function getNumericPlayerFid() {
  const session = getSession();
  let rawFid = session?.farcaster?.fid ?? session?.fid;
  
  // Если нет FID, но есть адрес кошелька, создаем виртуальный FID
  if ((rawFid === null || rawFid === undefined) && session?.address) {
    rawFid = getVirtualFidFromAddress(session.address);
  }
  
  if (rawFid === null || rawFid === undefined) {
    return null;
  }
  
  // Используем normalizeFidToNumber для правильной обработки виртуальных FID (например, "V22575")
  return normalizeFidToNumber(rawFid);
}

function buildMatchesSignature(matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return "";
  }
  return matches
    .map((match) => {
      const id = normalizeMatchIdValue(match) || "unknown";
      const status = match?.status || "unknown";
      const updatedAt = match?.updatedAt || match?.lastMoveAt || match?.createdAt || "";
      const finished = match?.gameState?.finished ? "1" : "0";
      return `${id}:${status}:${updatedAt}:${finished}`;
    })
    .sort()
    .join("|");
}

function notifyMatchSubscribers(matches, meta = {}) {
  const metaPayload = { ...meta, internal: true };

  matchDataStore.subscribers.forEach((callback) => {
    try {
      callback(matches, metaPayload);
    } catch (error) {
      console.warn("Match subscriber failed:", error);
    }
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("player-matches-updated", { detail: { matches, meta: metaPayload } }));
  }
}

function computeNextMatchPollInterval(matches, changed) {
  const now = Date.now();
  const hasMatches = Array.isArray(matches) && matches.length > 0;

  const hasActive = hasMatches
    ? matches.some((match) => match?.status === "active" && !match?.gameState?.finished)
    : false;
  const hasPending = hasMatches ? matches.some((match) => match?.status === "pending") : false;

  // Обновляем счётчик стабильных циклов и режим
  if (changed) {
    matchDataStore.unchangedCycles = 0;
    matchDataStore.mode = "hot";
  } else {
    matchDataStore.unchangedCycles += 1;

    if (matchDataStore.mode === "hot" &&
        matchDataStore.unchangedCycles >= MATCH_POLL_CONFIG.warmAfterUnchangedCycles) {
      matchDataStore.mode = "warm";
    } else if (matchDataStore.mode !== "cold" &&
               matchDataStore.unchangedCycles >= MATCH_POLL_CONFIG.coldAfterUnchangedCycles) {
      matchDataStore.mode = "cold";
    }
  }

  // Если матчей нет вовсе — переходим в "холодный" режим
  if (!hasMatches) {
    matchDataStore.mode = "cold";
  }

  // Базовый интервал от типа матчей
  let baseInterval;
  if (!hasMatches) {
    baseInterval = MATCH_POLL_CONFIG.noMatchIntervalMs;
  } else if (hasActive) {
    baseInterval = MATCH_POLL_CONFIG.activeIntervalMs;
  } else if (hasPending) {
    baseInterval = MATCH_POLL_CONFIG.pendingIntervalMs;
  } else {
    baseInterval = MATCH_POLL_CONFIG.idleIntervalMs;
  }

  let interval = baseInterval;

  // "Горячий" режим — частые обновления после изменений
  if (
    changed ||
    (hasMatches && now - matchDataStore.lastChangeAt < MATCH_POLL_CONFIG.changeBoostMs)
  ) {
    matchDataStore.mode = "hot";
    matchDataStore.unchangedCycles = 0;
    interval = Math.min(interval, MATCH_POLL_CONFIG.fastIntervalMs);
  } else if (matchDataStore.mode === "warm") {
    // "Тёплый" режим — чуть реже, но всё ещё с матчами
    interval = Math.max(interval, MATCH_POLL_CONFIG.idleIntervalMs);
  } else if (matchDataStore.mode === "cold") {
    // "Холодный" режим — либо нет матчей, либо давно ничего не менялось
    interval = MATCH_POLL_CONFIG.noMatchIntervalMs;
  }

  // Применяем джиттер, чтобы не синхронизировать запросы всех клиентов
  const jitterRatio = MATCH_POLL_CONFIG.jitterRatio ?? 0;
  if (jitterRatio > 0) {
    const delta = interval * jitterRatio;
    const randomOffset = (Math.random() * 2 - 1) * delta; // [-delta, +delta]
    interval = interval + randomOffset;
  }

  // Ограничиваем интервал разумными пределами
  const minInterval = MATCH_POLL_CONFIG.minIntervalMs || 0;
  const maxInterval = MATCH_POLL_CONFIG.maxIntervalMs || Number.MAX_SAFE_INTEGER;
  interval = Math.max(minInterval, Math.min(maxInterval, interval));

  return Math.round(interval);
}

async function fetchMatchesSnapshot(reason = "unknown", { force = false } = {}) {
  const playerFid = getNumericPlayerFid();

  if (!playerFid || mode !== "pvp-farcaster") {
    matchDataStore.matches = [];
    matchDataStore.lastFetchedAt = Date.now();
    return [];
  }

  if (matchDataStore.fetchPromise) {
    if (!force) {
      return matchDataStore.fetchPromise;
    }
    try {
      await matchDataStore.fetchPromise;
    } catch {
      // Ignore previous failure and start a new fetch
    }
  }

  const fetchPromise = (async () => {
    const matches = await listPlayerMatches(playerFid);
    const signature = buildMatchesSignature(matches);
    const changed = signature !== matchDataStore.signature;

    matchDataStore.matches = matches;
    matchDataStore.lastFetchedAt = Date.now();
    matchDataStore.signature = signature;
    if (changed) {
      matchDataStore.lastChangeAt = matchDataStore.lastFetchedAt;
    }

    // Пропускаем обогащение матчей через getMatch() при простом просмотре списка
    // Обогащение нужно только для определения статистики завершенных матчей
    const shouldSkipDetails = reason === "matches_modal_open" || reason === "matches_modal_manual_refresh";
    await syncSessionStatsWithMatches(matches, { 
      source: reason, 
      fromList: true,
      skipDetails: shouldSkipDetails
    });
    notifyMatchSubscribers(matches, { reason, changed, skipDetails: shouldSkipDetails });

    const interval = computeNextMatchPollInterval(matches, changed);
    matchDataStore.nextIntervalMs = interval;

    if (DEBUG_ENABLED) {
      addDebugLog("🔁 Обновлены матчи игрока", {
        reason,
        matches: matches.length,
        nextIntervalMs: interval
      });
    }

    return matches;
  })().finally(() => {
    matchDataStore.fetchPromise = null;
  });

  matchDataStore.fetchPromise = fetchPromise;
  return fetchPromise;
}

async function getMatchesSnapshot(options = {}) {
  const {
    reason = "snapshot_request",
    maxAgeMs = MATCH_POLL_CONFIG.cacheStaleMs,
    forceFetch = false
  } = options;

  const now = Date.now();
  if (
    !forceFetch &&
    matchDataStore.matches.length > 0 &&
    now - matchDataStore.lastFetchedAt <= maxAgeMs
  ) {
    return matchDataStore.matches;
  }

  return fetchMatchesSnapshot(reason, { force: forceFetch });
}

function subscribeToMatchUpdates(callback, { immediate = false } = {}) {
  if (typeof callback !== "function") {
    return () => {};
  }
  matchDataStore.subscribers.add(callback);
  if (immediate && matchDataStore.matches.length > 0) {
    try {
      callback(matchDataStore.matches, { reason: "initial_emit", changed: false });
    } catch (error) {
      console.warn("Match subscriber failed (initial emit):", error);
    }
  }
  return () => {
    matchDataStore.subscribers.delete(callback);
  };
}

async function runMatchPoll(reason = "poll_loop") {
  if (!matchDataStore.pollingEnabled) {
    return;
  }
  try {
    await fetchMatchesSnapshot(reason);
  } catch (error) {
    if (DEBUG_ENABLED) {
      addDebugLog("⚠️ Ошибка при обновлении матчей", {
        reason,
        error: error?.message || String(error)
      });
    }
  } finally {
    scheduleNextMatchPoll();
  }
}

function scheduleNextMatchPoll() {
  if (!matchDataStore.pollingEnabled) {
    return;
  }
  const interval = matchDataStore.nextIntervalMs || MATCH_POLL_CONFIG.noMatchIntervalMs;
  if (matchDataStore.pollTimer) {
    clearTimeout(matchDataStore.pollTimer);
  }
  matchDataStore.pollTimer = setTimeout(() => {
    matchDataStore.pollTimer = null;
    void runMatchPoll("poll_loop");
  }, interval);
}

function startMatchPollingService() {
  if (matchDataStore.pollingEnabled) {
    return;
  }
  matchDataStore.pollingEnabled = true;
  matchDataStore.nextIntervalMs = MATCH_POLL_CONFIG.fastIntervalMs;
  void runMatchPoll("poll_loop_initial");
}

function stopMatchPollingService() {
  matchDataStore.pollingEnabled = false;
  if (matchDataStore.pollTimer) {
    clearTimeout(matchDataStore.pollTimer);
    matchDataStore.pollTimer = null;
  }
}

async function requestImmediateMatchRefresh(reason = "manual_refresh") {
  return fetchMatchesSnapshot(reason, { force: true });
}

function getMatchRoleInfo(match, playerFidInput) {
  const player1FidRaw = match?.player1Fid ?? match?.player1?.fid;
  const player2FidRaw = match?.player2Fid ?? match?.player2?.fid;
  const player1Fid = normalizeFidValue(player1FidRaw);
  const player2Fid = normalizeFidValue(player2FidRaw);
  const playerFidStr = normalizeFidValue(playerFidInput);

  const isPlayer1 = Boolean(playerFidStr && player1Fid && player1Fid === playerFidStr);
  const isPlayer2 = Boolean(playerFidStr && player2Fid && player2Fid === playerFidStr);

  return { player1Fid, player2Fid, isPlayer1, isPlayer2 };
}

function getMatchSymbols(match) {
  let player1Symbol = match?.player1Symbol;
  let player2Symbol = match?.player2Symbol;

  if (player1Symbol) player1Symbol = String(player1Symbol).toUpperCase();
  if (player2Symbol) player2Symbol = String(player2Symbol).toUpperCase();

  if (!player1Symbol || !player2Symbol) {
    const firstMove = match?.rules?.firstMove;
    if (!player1Symbol && !player2Symbol) {
      if (firstMove === "O") {
        player1Symbol = "O";
        player2Symbol = "X";
      } else if (firstMove === "X") {
        player1Symbol = "X";
        player2Symbol = "O";
      } else {
        player1Symbol = "X";
        player2Symbol = "O";
      }
    } else if (!player1Symbol && player2Symbol) {
      player1Symbol = player2Symbol === "X" ? "O" : "X";
    } else if (!player2Symbol && player1Symbol) {
      player2Symbol = player1Symbol === "X" ? "O" : "X";
    } else {
      player1Symbol = player1Symbol || "X";
      player2Symbol = player2Symbol || (player1Symbol === "X" ? "O" : "X");
    }
  }

  if (!player1Symbol) player1Symbol = "X";
  if (!player2Symbol) player2Symbol = player1Symbol === "X" ? "O" : "X";

  return { player1Symbol, player2Symbol };
}

function getTooltipSymbolInfo(match, playerFidInput) {
  const playerFidStr = normalizeFidValue(playerFidInput);
  const { player1Fid, player2Fid, isPlayer1, isPlayer2 } = getMatchRoleInfo(match, playerFidStr);
  const { player1Symbol, player2Symbol } = getMatchSymbols(match);

  if (isPlayer1) {
    return { mySymbol: player1Symbol, opponentFid: player2Fid, player1Fid, player2Fid };
  }
  if (isPlayer2) {
    return { mySymbol: player2Symbol, opponentFid: player1Fid, player1Fid, player2Fid };
  }

  if (DEBUG_ENABLED) {
    addDebugLog("⚠️ Не удалось определить символ игрока для матча (tooltip)", {
      matchId: match?.matchId ?? match?.id ?? null,
      playerFid: playerFidInput,
      player1Fid,
      player2Fid,
      status: match?.status
    });
  }

  return null;
}

function updateMatchSymbolCache(match, infoOverride = null, options = {}) {
  if (!match) return null;
  const matchId = normalizeMatchIdValue(match);
  if (!matchId) return null;

  const session = getSession();
  const playerFid = session?.farcaster?.fid || session?.fid;
  if (!playerFid) return null;

  const playerFidStr = normalizeFidValue(playerFid);
  const info = infoOverride || getTooltipSymbolInfo(match, playerFidStr);
  if (!info || !info.mySymbol) {
    return null;
  }

  const normalizedInfo = {
    ...info,
    mySymbol: String(info.mySymbol).toUpperCase(),
    player1Fid: normalizeFidValue(info.player1Fid),
    player2Fid: normalizeFidValue(info.player2Fid),
    opponentFid: normalizeFidValue(info.opponentFid),
    matchId,
    playerFid: playerFidStr,
    cachedAt: Date.now(),
    source: options?.source || "unknown",
    trace: options?.trace || null
  };

  matchSymbolCache.set(matchId, normalizedInfo);
  return normalizedInfo;
}

function validateSymbolInfo(match, playerFidInput, symbolInfo) {
  const playerFidStr = normalizeFidValue(playerFidInput);
  if (!match) {
    return { ok: false, reason: "NO_MATCH_DATA" };
  }
  if (!playerFidStr) {
    return { ok: false, reason: "NO_PLAYER_FID" };
  }
  if (!symbolInfo || !symbolInfo.mySymbol) {
    return { ok: false, reason: "NO_SYMBOL_INFO" };
  }

  const { player1Fid, player2Fid } = getMatchRoleInfo(match, playerFidStr);
  if (!player1Fid && !player2Fid) {
    return { ok: false, reason: "MATCH_WITHOUT_PLAYERS", meta: { matchId: match?.matchId ?? match?.id ?? null } };
  }

  const { player1Symbol, player2Symbol } = getMatchSymbols(match);
  const expectedSymbol = player1Fid === playerFidStr
    ? player1Symbol
    : player2Fid === playerFidStr
      ? player2Symbol
      : null;

  if (!expectedSymbol) {
    return {
      ok: false,
      reason: "PLAYER_NOT_IN_MATCH",
      meta: {
        matchId: match?.matchId ?? match?.id ?? null,
        playerFid: playerFidStr,
        player1Fid,
        player2Fid
      }
    };
  }

  const actualSymbol = String(symbolInfo.mySymbol).toUpperCase();
  if (actualSymbol !== String(expectedSymbol).toUpperCase()) {
    return {
      ok: false,
      reason: "SYMBOL_MISMATCH",
      meta: {
        matchId: match?.matchId ?? match?.id ?? null,
        expectedSymbol: expectedSymbol,
        actualSymbol,
        playerFid: playerFidStr,
        player1Fid,
        player2Fid
      }
    };
  }

  return { ok: true };
}

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
  // Пытаемся найти контейнер
  let toastsContainer = document.getElementById("toasts");
  
  // Если контейнер не найден, создаем его динамически
  if (!toastsContainer) {
    toastsContainer = document.createElement("div");
    toastsContainer.id = "toasts";
    toastsContainer.className = "toasts";
    toastsContainer.setAttribute("aria-live", "polite");
    toastsContainer.setAttribute("aria-atomic", "true");
    
    // Проверяем, работаем ли мы в iframe (Farcaster desktop)
    const isInIframe = window.parent !== window;
    
    toastsContainer.style.cssText = `
      position: fixed;
      top: ${isInIframe ? '20px' : 'auto'};
      right: 20px;
      bottom: ${isInIframe ? 'auto' : '20px'};
      display: grid;
      gap: 12px;
      z-index: 999999;
      max-width: 400px;
      pointer-events: none;
    `;
    
    document.body.appendChild(toastsContainer);
    
    if (DEBUG_ENABLED) {
      addDebugLog('🔧 [showToast] Контейнер toasts создан динамически', { isInIframe });
    }
  }
  
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    background: ${type === "error" ? "rgba(239, 68, 68, 0.9)" : type === "success" ? "rgba(16, 185, 129, 0.9)" : type === "warning" ? "rgba(245, 158, 11, 0.9)" : type === "draw" ? "rgba(128, 128, 128, 0.9)" : "rgba(59, 130, 246, 0.9)"};
    color: white;
    padding: 12px 16px;
    border-radius: var(--radius);
    margin-bottom: 8px;
    box-shadow: var(--shadow-lg);
    animation: toastSlide 0.3s ease-out;
    pointer-events: auto;
    z-index: 999999;
  `;
  
  toastsContainer.appendChild(toast);
  
  if (DEBUG_ENABLED) {
    addDebugLog(`📢 [showToast] Показано уведомление: ${message}`, { type, isInIframe: window.parent !== window });
  }
  
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

// Кастомная функция alert, которая работает в iframe (Farcaster desktop)
function showAlert(message) {
  // Проверяем, работаем ли мы в iframe
  const isInIframe = window.parent !== window;
  
  // В iframe используем кастомное модальное окно
  if (isInIframe) {
    // Создаем модальное окно
    const modal = document.createElement('div');
    modal.id = 'custom-alert-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;
    
    const lang = getLanguage();
    const okText = lang === "ru" ? "OK" : "OK";
    
    modal.innerHTML = `
      <div style="
        background: rgba(30, 30, 30, 0.95);
        color: white;
        padding: 24px;
        border-radius: 12px;
        max-width: 400px;
        width: 100%;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        border: 2px solid rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(10px);
      ">
        <div style="
          margin-bottom: 20px;
          font-size: 16px;
          line-height: 1.5;
          word-wrap: break-word;
        ">${escapeHtml(message)}</div>
        <button id="custom-alert-ok" style="
          width: 100%;
          padding: 12px 24px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        ">${okText}</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Фокус на кнопке
    const okButton = document.getElementById('custom-alert-ok');
    okButton.focus();
    
    // Обработчик закрытия
    const closeModal = () => {
      modal.remove();
    };
    
    okButton.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
    
    // Закрытие по Escape
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  } else {
    // В обычном браузере используем стандартный alert
    alert(message);
  }
}

// Экспортируем showToast и showAlert глобально для использования в других модулях
if (typeof window !== 'undefined') {
  window.showToast = showToast;
  window.showAlert = showAlert;
}

async function ensurePendingInviteLimit(session) {
  const lang = getLanguage();
  const playerFidRaw = session?.farcaster?.fid ?? session?.fid;
  if (!playerFidRaw) {
    return true;
  }

  const playerFidString = String(playerFidRaw);
  const numericPlayerFid = typeof playerFidRaw === "string" ? parseInt(playerFidRaw, 10) : playerFidRaw;
  const fidForRequest = Number.isFinite(numericPlayerFid) ? numericPlayerFid : playerFidRaw;

  try {
    const matches = await getMatchesSnapshot({
      reason: "ensure_pending_limit",
      maxAgeMs: 6000
    });
    // Проверяем общее количество активных + pending матчей (лимит 2)
    const activeOrPendingMatches = (matches || []).filter((match) => {
      // Исключаем завершенные матчи (статус FINISHED или gameState.finished)
      if (match?.status === "finished" || match?.gameState?.finished) return false;
      
      if (match?.status !== "active" && match?.status !== "pending") return false;
      
      // Проверяем, является ли игрок участником матча (player1 или player2)
      const player1Fid = match.player1Fid ? String(match.player1Fid) : null;
      const player2Fid = match.player2Fid ? String(match.player2Fid) : null;
      return player1Fid === playerFidString || player2Fid === playerFidString;
    });

    if (activeOrPendingMatches.length >= 2) {
      const message =
        lang === "ru"
          ? "У вас уже есть 2 активных матча. Завершите один из них, чтобы создать новый."
          : "You already have 2 active matches. Finish one to create a new one.";
      // Используем showAlert для работы в iframe
      if (typeof window !== 'undefined' && window.showAlert) {
        window.showAlert(message);
      } else {
        alert(message); // Fallback
      }
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to check pending invites:", error);
    const message =
      lang === "ru"
        ? "Не удалось проверить текущие приглашения. Попробуйте снова чуть позже."
        : "Failed to check your current invites. Please try again shortly.";
    alert(message);
    return false;
  }
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
  updateScores();
}

function resetBoard(keepScore = false) {
  state = createInitialState();
  if (!keepScore) {
    sessionStats = { wins: 0, losses: 0, draws: 0 };
    standaloneSessionStats.wins = 0;
    standaloneSessionStats.losses = 0;
    standaloneSessionStats.draws = 0;
    matchOutcomeMap.clear();
    recalculateTotalStats();
  }
  botThinking = false;
  render();
}

function updateScores() {
  const winEl = document.getElementById("score-win");
  const lossEl = document.getElementById("score-loss");
  const drawEl = document.getElementById("score-draw");
  if (winEl) winEl.textContent = String(sessionStats.wins);
  if (lossEl) lossEl.textContent = String(sessionStats.losses);
  if (drawEl) drawEl.textContent = String(sessionStats.draws);
}

function recalculateTotalStats() {
  sessionStats = {
    wins: standaloneSessionStats.wins,
    losses: standaloneSessionStats.losses,
    draws: standaloneSessionStats.draws
  };

  for (const outcome of matchOutcomeMap.values()) {
    if (outcome === "win") {
      sessionStats.wins += 1;
    } else if (outcome === "loss") {
      sessionStats.losses += 1;
    } else if (outcome === "draw") {
      sessionStats.draws += 1;
    }
  }

  updateScores();
}

function recordOutcome(result, matchId = null) {
  if (result !== "win" && result !== "loss" && result !== "draw") {
    return false;
  }

  if (result === "win") {
    if (matchId !== null && matchId !== undefined) {
      const key = String(matchId);
      const previousOutcome = matchOutcomeMap.get(key);
      if (previousOutcome === "win") {
        recalculateTotalStats();
        return false;
      }
      matchOutcomeMap.set(key, "win");
      recalculateTotalStats();
      scheduleStatsSyncAfterOutcome(key, "win", "record_outcome_win");
      return previousOutcome !== "win";
    }
    standaloneSessionStats.wins += 1;
  } else if (result === "loss") {
    if (matchId !== null && matchId !== undefined) {
      const key = String(matchId);
      const previousOutcome = matchOutcomeMap.get(key);
      if (previousOutcome === "loss") {
        recalculateTotalStats();
        return false;
      }
      matchOutcomeMap.set(key, "loss");
      recalculateTotalStats();
      scheduleStatsSyncAfterOutcome(key, "loss", "record_outcome_loss");
      return previousOutcome !== "loss";
    }
    standaloneSessionStats.losses += 1;
  } else {
    if (matchId !== null && matchId !== undefined) {
      const key = String(matchId);
      const previousOutcome = matchOutcomeMap.get(key);
      if (previousOutcome === "draw") {
        recalculateTotalStats();
        return false;
      }
      matchOutcomeMap.set(key, "draw");
      recalculateTotalStats();
      scheduleStatsSyncAfterOutcome(key, "draw", "record_outcome_draw");
      return previousOutcome !== "draw";
    }
    standaloneSessionStats.draws += 1;
  }

  recalculateTotalStats();
  return true;
}

function determineMatchOutcomeForPlayer(match, playerFidInput) {
  if (!match || !match.gameState || !match.gameState.finished) {
    return null;
  }

  const playerFid = normalizeFidValue(playerFidInput);
  if (!playerFid) {
    return null;
  }

  const { isPlayer1, isPlayer2 } = getMatchRoleInfo(match, playerFid);
  if (!isPlayer1 && !isPlayer2) {
    return null;
  }

  const winnerSymbol = match.gameState.winner;
  if (!winnerSymbol) {
    return "draw";
  }

  const { player1Symbol, player2Symbol } = getMatchSymbols(match);
  const mySymbol = isPlayer1 ? player1Symbol : player2Symbol;
  if (!mySymbol) {
    return null;
  }

  return String(mySymbol).toUpperCase() === String(winnerSymbol).toUpperCase() ? "win" : "loss";
}

async function syncSessionStatsWithMatches(matches, options = {}) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return;
  }

  const session = getSession();
  const playerFid = normalizeFidValue(session?.farcaster?.fid || session?.fid);
  if (!playerFid) {
    return;
  }

  const isFromList = options?.fromList === true;

  const matchesById = new Map();
  const matchesToEnrich = [];
  const currentListMatchIds = new Set();

  for (const match of matches) {
    const matchId = normalizeMatchIdValue(match);
    if (!matchId) continue;

    const hasGameState = match?.gameState && typeof match.gameState.finished === "boolean";
    const key = String(matchId);
    const hasRecordedOutcome = matchOutcomeMap.has(key);
    const status = typeof match?.status === "string" ? match.status.toLowerCase() : "active";
    const matchFinished = match?.gameState?.finished === true || (status !== "active" && status !== "pending");

    if (isFromList) {
      currentListMatchIds.add(matchId);
    }

    if ((!hasGameState || (!matchFinished && !hasRecordedOutcome)) &&
        options?.skipDetails !== true) {
      matchesToEnrich.push(matchId);
    }

    const existing = matchesById.get(matchId);
    if (!existing || (!existing.gameState && match.gameState)) {
      matchesById.set(matchId, match);
    }
  }

  if (isFromList && options?.skipDetails !== true) {
    const missingMatchIds = Array.from(activeMatchIdsCache).filter(id => !currentListMatchIds.has(id));
    if (missingMatchIds.length > 0) {
      missingMatchIds.forEach(id => matchesToEnrich.push(id));
    }
  }

  if (matchesToEnrich.length > 0) {
    const uniqueIds = Array.from(new Set(matchesToEnrich));
    const fetchResults = await Promise.allSettled(
      uniqueIds.map(id => getMatch(id).catch(error => {
        if (DEBUG_ENABLED) {
          addDebugLog("⚠️ Не удалось получить детальные данные матча", {
            matchId: id,
            source: options?.source || "sync_session_stats",
            error: error?.message || String(error)
          });
        }
        throw error;
      }))
    );

    fetchResults.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        const match = result.value;
        const matchId = normalizeMatchIdValue(match);
        if (!matchId) return;
        matchesById.set(matchId, match);
      }
    });
  }

  let statsChanged = false;

  for (const [matchId, match] of matchesById.entries()) {
    if (!match) {
      continue;
    }

    const status = typeof match?.status === "string" ? match.status.toLowerCase() : "active";
    const matchFinished = match?.gameState?.finished === true || (status !== "active" && status !== "pending");

    if (!matchFinished) {
      continue;
    }

    if (!match.gameState) {
      if (DEBUG_ENABLED) {
        addDebugLog("⚠️ Нет gameState у завершенного матча", {
          source: options?.source || "unknown",
          matchId,
          status
        });
      }
      continue;
    }

    const outcome = determineMatchOutcomeForPlayer(match, playerFid);
    if (!outcome) {
      if (DEBUG_ENABLED) {
        addDebugLog("⚠️ Не удалось определить исход для игрока", {
          source: options?.source || "unknown",
          matchId,
          playerFid
        });
      }
      continue;
    }

    const key = String(matchId);
    const previousOutcome = matchOutcomeMap.get(key);
    if (previousOutcome !== outcome) {
      matchOutcomeMap.set(key, outcome);
      statsChanged = true;

      if (DEBUG_ENABLED && options?.source) {
        addDebugLog("📊 Синхронизирован результат матча (список)", {
          matchId: key,
          outcome,
          source: options.source,
          delay: options.delay || 0
        });
      }
    } else if (DEBUG_ENABLED) {
      addDebugLog("ℹ️ Исход матча уже зафиксирован", {
        matchId: key,
        outcome,
        source: options?.source || "unknown"
      });
    }
  }

  if (statsChanged) {
    recalculateTotalStats();
    if (DEBUG_ENABLED) {
      addDebugLog("✅ Пересчитана статистика после синхронизации", {
        source: options?.source || "unknown",
        totalWins: sessionStats.wins,
        totalLosses: sessionStats.losses,
        totalDraws: sessionStats.draws
      });
    }
  }

  if (isFromList) {
    activeMatchIdsCache.clear();
    currentListMatchIds.forEach(id => activeMatchIdsCache.add(id));
  }
}

async function refreshSessionStatsFromServer(options = {}) {
  try {
    const matches = await getMatchesSnapshot({
      reason: options.source || "refresh_session_stats",
      forceFetch: true
    });
    if (
      Array.isArray(matches) &&
      matches.length === 0 &&
      typeof options.source === "string" &&
      options.source.startsWith("record_outcome")
    ) {
      cancelStatsRefreshTimersBySource(options.source);
    }
  } catch (error) {
    if (DEBUG_ENABLED) {
      addDebugLog("⚠️ Не удалось обновить статистику с сервера", {
        source: options.source || "refresh_session_stats",
        delay: options.delay || 0,
        error: error?.message || String(error)
      });
    }
  }
}

function scheduleSessionStatsRefresh(delays, source) {
  if (!Array.isArray(delays)) {
    delays = [delays];
  }
  delays
    .map(delay => Number.isFinite(delay) ? Math.max(0, delay) : 0)
    .forEach(delay => {
      const timer = setTimeout(async () => {
        statsRefreshTimers.delete(timer);
        await refreshSessionStatsFromServer({ source, delay });
      }, delay);
      statsRefreshTimers.set(timer, { source });
    });
}

function cancelStatsRefreshTimersBySource(targetSource) {
  if (!targetSource) return;
  for (const [timer, meta] of statsRefreshTimers.entries()) {
    if (meta?.source === targetSource) {
      clearTimeout(timer);
      statsRefreshTimers.delete(timer);
    }
  }
}

function scheduleStatsSyncAfterOutcome(matchId, outcome, source) {
  if (!matchId) return;
  const baseSource = source || `outcome_${outcome}`;
  scheduleSessionStatsRefresh([0, 1200, 3500, 6000, 9000], `${baseSource}_immediate`);
}

function startSessionStatsLoop() {
  startMatchPollingService();
}

function stopSessionStatsLoop() {
  stopMatchPollingService();
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
        if (state.winner) recordOutcome("loss");
        else recordOutcome("draw");
      }
      render();
    }
  }, 120);
}

function handleMove(idx) {
  if (state.finished || botThinking) return;
  const res = applyMove(state, idx);
  if (!res.ok) {
    const lang = getLanguage();
    if (res.reason === "occupied") {
      showToast(lang === "ru" ? "Эта клетка уже занята" : "This cell is already occupied", "error");
    } else if (res.reason === "finished") {
      showToast(lang === "ru" ? "Игра уже завершена" : "Game is already finished", "error");
    } else if (res.reason === "out_of_bounds") {
      showToast(lang === "ru" ? "Неверный ход" : "Invalid move", "error");
    }
    return;
  }
  state = res.state;
  if (state.finished) {
    if (state.winner) recordOutcome("win");
    else recordOutcome("draw");
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
    // Проверяем, не завершен ли матч
    if (currentMatch.matchState.gameState?.finished) {
      const lang = getLanguage();
      showToast(lang === "ru" ? "Матч уже завершен" : "Match is already finished", "warning");
      return;
    }
    
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
      render();
      
      // Показываем сообщение о сделанном ходе
      const lang = getLanguage();
      showToast(
        lang === "ru" ? "Вы сделали ход" : "You made a move",
        "success"
      );
      
      if (state.finished) {
        stopSyncing();
        
        const matchId = currentMatch.matchId;
        
        if (!state.winner) {
          const recorded = recordOutcome("draw", matchId);
          if (recorded) {
            showToast(
              lang === "ru" ? "🤝 Ничья!" : "🤝 Here is a draw!",
              "draw"
            );
          }
        } else {
        const isWinner = (match.player1Symbol === state.winner && match.player1Fid === currentMatch.playerFid) ||
                         (match.player2Symbol === state.winner && match.player2Fid === currentMatch.playerFid);
          const recorded = recordOutcome(isWinner ? "win" : "loss", matchId);
          if (recorded) {
        showToast(
          isWinner 
            ? (lang === "ru" ? "🎉 Вы победили!" : "🎉 You won!")
            : (lang === "ru" ? "😔 Вы проиграли" : "😔 You lost"),
          isWinner ? "success" : "error"
        );
      }
        }
        
        // Автоматически переключаемся на другой активный матч, если он есть
        const storedSwitched = localStorage.getItem(`match_switched_${currentMatch.matchId}`);
        if (!storedSwitched) {
          (async () => {
            try {
              const session = getSession();
              const playerFid = session?.farcaster?.fid || session?.fid;
              if (playerFid && mode === "pvp-farcaster") {
              const matches = await getMatchesSnapshot({
                reason: "auto_switch_after_finish",
                forceFetch: true
              });
                const activeMatches = matches.filter(m => 
                  m.status === "active" && 
                  !m.gameState.finished && 
                  m.matchId !== currentMatch.matchId
                );
                
                if (activeMatches.length > 0) {
                  const nextMatch = activeMatches[0];
                  localStorage.setItem(`match_switched_${currentMatch.matchId}`, "true");
                  
                  setTimeout(async () => {
                    try {
                      await loadMatch(nextMatch.matchId);
                      mode = "pvp-farcaster";
                      if (settingsMode) settingsMode.value = "pvp-farcaster";
                      updateUIForMode();
      updateMatchUI();
                      const nextLang = getLanguage();
                      showToast(
                        nextLang === "ru" ? "Переключено на другой активный матч" : "Switched to another active match",
                        "info"
                      );
                    } catch (error) {
                      console.error("Failed to load next match:", error);
                      localStorage.removeItem(`match_switched_${currentMatch.matchId}`);
                    }
                  }, 500); // Уменьшено с 2000ms до 500ms
                }
              }
            } catch (error) {
              console.warn("Failed to auto-switch to next match:", error);
              localStorage.removeItem(`match_switched_${currentMatch.matchId}`);
            }
          })();
        }
      }
      // НЕ обновляем lastSyncBoard сразу после нашего хода
      // Это позволит следующей синхронизации правильно определить ход противника
      // Обновим только lastSyncTurn, чтобы отслеживать прогресс
      lastSyncTurn = state.turn;
      
      // НЕ вызываем updateMatchUI() сразу после хода
      // Состояние уже обновлено через render(), а updateMatchUI() вызовется через событие match-synced
      // Это предотвращает перезапись локального состояния доски до синхронизации с сервером
    } catch (error) {
      const lang = getLanguage();
      const errorMessage = error?.message || error?.toString() || "";
      
      // Улучшаем сообщения об ошибках для пользователя
      let userMessage = "";
      if (errorMessage.includes("occupied") || errorMessage.includes("Invalid move: occupied")) {
        userMessage = lang === "ru" ? "Эта клетка уже занята" : "This cell is already occupied";
      } else if (errorMessage.includes("finished") || errorMessage.includes("Game is finished")) {
        userMessage = lang === "ru" ? "Игра уже завершена" : "Game is already finished";
      } else if (errorMessage.includes("out_of_bounds") || errorMessage.includes("Invalid move")) {
        userMessage = lang === "ru" ? "Неверный ход" : "Invalid move";
      } else if (errorMessage.includes("Not your turn")) {
        userMessage = lang === "ru" ? "Сейчас не ваш ход" : "Not your turn";
      } else if (errorMessage) {
        // Для других ошибок показываем оригинальное сообщение, но упрощенное
        userMessage = errorMessage.replace(/Failed to make move: /g, "").replace(/Failed to send move: /g, "");
        if (userMessage.includes("Invalid move: occupied")) {
          userMessage = lang === "ru" ? "Эта клетка уже занята" : "This cell is already occupied";
        }
      } else {
        userMessage = lang === "ru" ? "Неизвестная ошибка" : "Unknown error";
      }
      
      showToast(userMessage, "error");
      console.error("Move error:", error);
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
  const isFarcasterUser = !!s?.farcaster?.fid;
  
  const lang = getLanguage();
  const texts = {
    en: { signedIn: "Signed In", signOut: "Sign Out", signIn: "Sign In" },
    ru: { signedIn: "Авторизован", signOut: "Выйти", signIn: "Войти" }
  };
  const t = texts[lang] || texts.en;
  
  // Получаем элементы
  const authBtn = document.getElementById("btn-auth");
  const authWrapper = authBtn?.closest('.auth-wrapper');
  const userLabel = document.getElementById("user-label");
  const userAvatar = document.getElementById("user-avatar");

  // Проверяем, что userLabel существует
  if (!userLabel) {
    console.warn("user-label элемент не найден в DOM");
    return;
  }
  
  if (isAuthorized) {
    let displayText = "";

    if (isFarcasterUser) {
      // Пользователь из Farcaster: показываем username / display_name / FID
    if (s.farcaster?.username) {
        displayText = `@${s.farcaster.username}`;
    } else if (s.farcaster?.display_name) {
        displayText = s.farcaster.display_name;
    } else if (s.farcaster?.fid) {
        displayText = `FID: ${s.farcaster.fid}`;
    } else {
        displayText = t.signedIn;
      }
    } else {
      // Пользователь НЕ из Farcaster: используем ту же логику, что и в лидерборде
      // Получаем FID из сессии (виртуальный FID для пользователей без Farcaster)
      // В signInWithWallet сохраняется как s.fid (может быть строкой "V22575" или числом)
      const fid = s?.fid;
      if (fid) {
        // Вычисляем стабильный anonId на основе FID (такая же логика, как в лидерборде)
        const anonId = getAnonIdFromFid(fid);
        displayText = `@user${anonId}`;
      } else {
        // Fallback: если FID нет, используем старый способ с сохранением в сессии
        let anonId = s?.anonId;
        if (!anonId) {
          // Простой диапазон 1–99, можно расширить при необходимости
          anonId = Math.floor(Math.random() * 99) + 1;
          const updatedSession = {
            ...(s || {}),
            anonId
          };
          try {
            localStorage.setItem("fc_session", JSON.stringify(updatedSession));
          } catch (e) {
            if (DEBUG_ENABLED) {
              addDebugLog('⚠️ Не удалось сохранить anonId в сессию', { error: e?.message || String(e) });
            }
          }
        }
        displayText = `@user${anonId}`;
      }
    }
    
    // Устанавливаем текст и принудительно показываем элемент
    userLabel.textContent = displayText;
    userLabel.style.display = "block";
    userLabel.style.visibility = "visible";
    userLabel.style.opacity = "1";
      
    // Загружаем и отображаем аватарку, если есть
    if (userAvatar) {
      if (isFarcasterUser) {
        // Пользователь из Farcaster: используем pfp из профиля
        // Проверяем все возможные варианты названия поля аватарки
        // В сессии сохраняется как pfp_url (snake_case), но SDK возвращает pfpUrl (camelCase)
        const rawPfpUrl = s.farcaster?.pfp_url || s.farcaster?.pfpUrl || s.farcaster?.pfp || null;

        if (rawPfpUrl && typeof rawPfpUrl === 'string' && rawPfpUrl.trim().length > 0) {
        // Нормализация URL
          let normalizedUrl = rawPfpUrl.trim();
          // Если это относительный путь (начинается с /), используем текущий origin
          if (normalizedUrl.startsWith('/')) {
            normalizedUrl = window.location.origin + normalizedUrl;
          } else if (!/^https?:\/\//i.test(normalizedUrl)) {
            // Если это не относительный путь и не абсолютный URL, добавляем https://
          normalizedUrl = 'https://' + normalizedUrl;
          }

          // Используем оригинальный URL (Cloudflare Images с /public не работает)
          // Качество улучшается через CSS (image-rendering: high-quality)
          const displaySize = 34; // Размер user-avatar из CSS

          // Предзагружаем через Image, чтобы отлавливать успех/ошибку в debug-панели
          const testImg = new Image();
          // Устанавливаем crossOrigin только для нашего origin
          const isExternalUrl = normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://');
          const isSameOrigin = isExternalUrl && normalizedUrl.startsWith(window.location.origin);
          if (isSameOrigin) {
            testImg.crossOrigin = 'anonymous';
          } else {
            testImg.removeAttribute('crossorigin');
          }

          testImg.onload = () => {
            userAvatar.src = normalizedUrl;
            userAvatar.alt = s.farcaster?.display_name || s.farcaster?.username || "User avatar";
            userAvatar.style.display = "block";
            // Устанавливаем crossOrigin только для нашего origin
            if (isSameOrigin) {
              userAvatar.crossOrigin = "anonymous";
            } else {
              userAvatar.removeAttribute('crossorigin');
            }
            userAvatar.loading = "lazy";

          };

          testImg.onerror = () => {
            userAvatar.style.display = "none";
          };

          testImg.src = normalizedUrl;
        } else {
          userAvatar.style.display = "none";
        }
      } else {
        // Не Farcaster-пользователь: всегда ставим дефолтный аватар hero.jpg
        const defaultAvatar = "/assets/images/hero.jpg";
        userAvatar.src = defaultAvatar;
        userAvatar.alt = "User avatar";
        userAvatar.style.display = "block";
        userAvatar.crossOrigin = "anonymous";
        userAvatar.loading = "lazy";

      }
    }
    
    if (authBtn) {
    authBtn.textContent = t.signOut;
    authBtn.dataset.signedIn = "true";
    }
  } else {
    if (userLabel) {
    userLabel.textContent = "";
    }
    if (userAvatar) {
      userAvatar.style.display = "none";
    }
    if (authBtn) {
    authBtn.textContent = t.signIn;
    authBtn.dataset.signedIn = "false";
    }
  }
  
  // Вычисляем центр кнопки для точного выравнивания имени пользователя
  // Делаем это ПОСЛЕ установки текста кнопки и имени пользователя
  if (authBtn && authWrapper && userLabel && userLabel.textContent) {
    // Используем двойной requestAnimationFrame для гарантии полного обновления DOM
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const btnRect = authBtn.getBoundingClientRect();
        const wrapperRect = authWrapper.getBoundingClientRect();
        // Вычисляем смещение: центр кнопки относительно начала wrapper
        const btnCenter = btnRect.left - wrapperRect.left + btnRect.width / 2;
        authWrapper.style.setProperty('--btn-center', `${btnCenter}px`);
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
      const lang = getLanguage();
      const showStatus = (text) => {
        matchesList.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--muted);">${text}</div>`;
      };
      showStatus(lang === "ru" ? "Загрузка..." : "Loading...");

      const renderMatches = async ({ force = false, reason = "matches_modal_open" } = {}) => {
        try {
          if (force) {
            showStatus(lang === "ru" ? "Обновление..." : "Refreshing...");
          }
          const matches = force
            ? await requestImmediateMatchRefresh(reason)
            : await getMatchesSnapshot({
                reason,
                maxAgeMs: 6000
              });
          await loadMatchesList(matchesList, playerFid, {
            prefetchedMatches: matches,
            allowRefresh: true,
            lastUpdated: matchDataStore.lastFetchedAt,
            onRefresh: () => renderMatches({ force: true, reason: "matches_modal_manual_refresh" })
          });
        } catch (error) {
          const errorMsg = error?.message || (lang === "ru" ? "Неизвестная ошибка" : "Unknown error");
          showStatus((lang === "ru" ? "Ошибка загрузки: " : "Load error: ") + errorMsg);
        }
      };

      await renderMatches();
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

// Leaderboard button handler
if (leaderboardBtn) {
  leaderboardBtn.addEventListener("click", async () => {
    if (leaderboardModal) {
      leaderboardModal.setAttribute("aria-hidden", "false");
      
      // Load and render leaderboard
      if (leaderboardList) {
        leaderboardList.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--muted);">${getLanguage() === "ru" ? "Загрузка..." : "Loading..."}</div>`;
        
        try {
          const leaderboard = await loadLeaderboard();
          renderLeaderboard(leaderboard, leaderboardList);
        } catch (error) {
          console.error("Error loading leaderboard:", error);
          const lang = getLanguage();
          leaderboardList.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--lose);">${lang === "ru" ? "Ошибка загрузки таблицы лидеров" : "Error loading leaderboard"}</div>`;
        }
      }
    }
  });
}

// Close leaderboard modal
if (leaderboardModal) {
  leaderboardModal.addEventListener("click", (e) => {
    if (e.target === leaderboardModal) {
      leaderboardModal.setAttribute("aria-hidden", "true");
    }
  });
}

// Match switcher handlers
if (matchSwitcherPrev) {
  matchSwitcherPrev.addEventListener("click", async () => {
    await switchToPreviousMatch();
  });
}

if (matchSwitcherNext) {
  matchSwitcherNext.addEventListener("click", async () => {
    await switchToNextMatch();
  });
}

// Показываем tooltip при наведении на переключатель
if (matchSwitcher) {
  let tooltipTimeout = null;
  let tooltipAutoHideTimeout = null;
  
  // Создаем tooltip в body, если его еще нет
  let tooltipElement = document.getElementById("match-switcher-tooltip");
  if (!tooltipElement) {
    tooltipElement = document.createElement("div");
    tooltipElement.id = "match-switcher-tooltip";
    tooltipElement.style.cssText = "display: none; position: fixed; padding: 6px; background: rgba(0, 0, 0, 0.6); border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5); z-index: 99999; min-width: 100px; max-width: 150px; text-align: center; pointer-events: none; white-space: normal; word-wrap: break-word; backdrop-filter: blur(4px);";
    tooltipElement.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px; justify-content: center; margin-bottom: 3px;">
        <img id="match-switcher-opponent-avatar" src="" alt="Opponent" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255, 255, 255, 0.3);" />
        <div id="match-switcher-opponent-name" style="font-size: 0.5625rem; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></div>
      </div>
      <div id="match-switcher-match-info" style="font-size: 0.5625rem; color: #fff;"></div>
    `;
    document.body.appendChild(tooltipElement);
  }
  
  const showTooltip = async (match, buttonElement = null) => {
    if (match && tooltipElement) {
      // Перемещаем tooltip в body, если он еще не там
      if (tooltipElement.parentElement !== document.body) {
        document.body.appendChild(tooltipElement);
      }
      if (tooltipAutoHideTimeout) {
        clearTimeout(tooltipAutoHideTimeout);
        tooltipAutoHideTimeout = null;
      }
      if (DEBUG_ENABLED) {
        addDebugLog("ℹ️ Запрос tooltip для матча", {
          targetMatchId: normalizeMatchIdValue(match),
          currentMatchId: normalizeMatchIdValue(getCurrentMatch()),
          triggerButton: buttonElement?.id || null
        });
      }

      tooltipElement.style.display = "block";
      const updated = await updateMatchSwitcherTooltip(match);
      if (!updated) {
        tooltipElement.style.display = "none";
        tooltipElement.dataset.matchId = "";
        return;
      }
      // Позиционируем tooltip правее стрелки
      setTimeout(() => {
        if (tooltipElement && buttonElement) {
          const buttonRect = buttonElement.getBoundingClientRect();
          tooltipElement.style.left = `${buttonRect.left}px`;
          tooltipElement.style.top = `${buttonRect.top - tooltipElement.offsetHeight - 8}px`;
          tooltipElement.style.transform = "none";
          tooltipElement.style.right = "auto";
          tooltipElement.style.bottom = "auto";
          
          const tooltipRect = tooltipElement.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          
          if (tooltipRect.right > viewportWidth) {
            tooltipElement.style.left = "auto";
            tooltipElement.style.right = "8px";
          } else if (tooltipRect.left < 0) {
            tooltipElement.style.left = "8px";
          }
          if (tooltipRect.top < 0) {
            tooltipElement.style.top = `${buttonRect.bottom + 8}px`;
          }
          
          if (tooltipAutoHideTimeout) {
            clearTimeout(tooltipAutoHideTimeout);
          }
          tooltipAutoHideTimeout = setTimeout(() => {
            hideTooltip();
          }, 3000);
        }
      }, 100);
    }
  };
  
  const hideTooltip = () => {
    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
      tooltipTimeout = null;
    }
    if (tooltipAutoHideTimeout) {
      clearTimeout(tooltipAutoHideTimeout);
      tooltipAutoHideTimeout = null;
    }
    if (tooltipElement) {
      tooltipElement.style.display = "none";
    }
  };
  
  // Tooltip при наведении на предыдущую стрелку
  if (matchSwitcherPrev) {
    matchSwitcherPrev.addEventListener("mouseenter", async () => {
      if (!window.activeMatchesList || window.activeMatchesList.length < 2) return;
      const currentMatch = getCurrentMatch();
      const currentMatchId = normalizeMatchIdValue(currentMatch);
      const currentIndex = window.activeMatchesList.findIndex(match => normalizeMatchIdValue(match) === currentMatchId);
      if (currentIndex > 0) {
        const prevMatch = window.activeMatchesList[currentIndex - 1];
        if (tooltipTimeout) {
          clearTimeout(tooltipTimeout);
          tooltipTimeout = null;
        }
        tooltipTimeout = setTimeout(() => showTooltip(prevMatch, matchSwitcherPrev), 300);
      }
    });
    matchSwitcherPrev.addEventListener("mouseleave", hideTooltip);
  }
  
  // Tooltip при наведении на следующую стрелку
  if (matchSwitcherNext) {
    matchSwitcherNext.addEventListener("mouseenter", async () => {
      if (!window.activeMatchesList || window.activeMatchesList.length < 2) return;
      const currentMatch = getCurrentMatch();
      const currentMatchId = normalizeMatchIdValue(currentMatch);
      const currentIndex = window.activeMatchesList.findIndex(match => normalizeMatchIdValue(match) === currentMatchId);
      if (currentIndex < window.activeMatchesList.length - 1) {
        const nextMatch = window.activeMatchesList[currentIndex + 1];
        if (tooltipTimeout) {
          clearTimeout(tooltipTimeout);
          tooltipTimeout = null;
        }
        tooltipTimeout = setTimeout(() => showTooltip(nextMatch, matchSwitcherNext), 300);
      }
    });
    matchSwitcherNext.addEventListener("mouseleave", hideTooltip);
  }
  
  // Tooltip при наведении на сам переключатель (показываем текущий матч)
  matchSwitcher.addEventListener("mouseenter", async () => {
    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
      tooltipTimeout = null;
    }
    tooltipTimeout = setTimeout(async () => {
      const currentMatch = getCurrentMatch();
      if (currentMatch.matchState && tooltipElement) {
        await showTooltip(currentMatch.matchState, matchSwitcher);
      }
    }, 500);
  });
  
  matchSwitcher.addEventListener("mouseleave", hideTooltip);
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
    // Обновляем переключатель матчей
    updateMatchSwitcher();
  }
});

// Handle match status changed event (pending -> active) для автоматического переключения
window.addEventListener("match-status-changed", async (e) => {
  const { matchId, status } = e.detail;
  if (status === "active" && matchId) {
    // Проверяем, не загружен ли уже этот матч
    const currentMatch = getCurrentMatch();
    if (!currentMatch.matchState || currentMatch.matchId !== matchId) {
      // Автоматически переключаемся на матч
      await loadMatch(matchId);
      mode = "pvp-farcaster";
      if (settingsMode) settingsMode.value = "pvp-farcaster";
      updateUIForMode();
      updateMatchUI();
      
      const lang = getLanguage();
      showToast(
        lang === "ru" ? "Противник принял матч!" : "Opponent accepted the match!",
        "success"
      );
    }
  }
});

// Также обрабатываем match-synced для случаев, когда статус меняется через синхронизацию
window.addEventListener("match-synced", async () => {
  const currentMatch = getCurrentMatch();
  if (currentMatch.matchState && currentMatch.matchId) {
    const match = currentMatch.matchState;
    const storedStatus = localStorage.getItem(`match_status_${currentMatch.matchId}`);
    
    // Проверяем изменение статуса с pending на active
    if (storedStatus === "pending" && match.status === "active") {
      // Автоматически переключаемся на матч
      await loadMatch(currentMatch.matchId);
      mode = "pvp-farcaster";
      if (settingsMode) settingsMode.value = "pvp-farcaster";
      updateUIForMode();
      updateMatchUI();
      
      const lang = getLanguage();
      showToast(
        lang === "ru" ? "Противник принял матч!" : "Opponent accepted the match!",
        "success"
      );
    } else {
      // Обновляем UI для проверки хода противника
      updateMatchUI();
      
      // Если матч завершился, переключаемся на другой матч
      if (match.gameState.finished) {
        const storedSwitched = localStorage.getItem(`match_switched_${currentMatch.matchId}`);
        if (!storedSwitched) {
          (async () => {
            try {
              const session = getSession();
              const playerFid = session?.farcaster?.fid || session?.fid;
              if (playerFid && mode === "pvp-farcaster") {
              const matches = await getMatchesSnapshot({
                reason: "match_synced_auto_switch",
                forceFetch: true
              });
                const activeMatches = matches.filter(m => 
                  m.status === "active" && 
                  !m.gameState.finished && 
                  m.matchId !== currentMatch.matchId
                );
                
                if (activeMatches.length > 0) {
                  const nextMatch = activeMatches[0];
                  localStorage.setItem(`match_switched_${currentMatch.matchId}`, "true");
                  
                  setTimeout(async () => {
                    try {
                      await loadMatch(nextMatch.matchId);
                      mode = "pvp-farcaster";
                      if (settingsMode) settingsMode.value = "pvp-farcaster";
                      updateUIForMode();
                      updateMatchUI();
                      const lang = getLanguage();
                      showToast(
                        lang === "ru" ? "Переключено на другой активный матч" : "Switched to another active match",
                        "info"
                      );
                    } catch (error) {
                      console.error("Failed to load next match:", error);
                      localStorage.removeItem(`match_switched_${currentMatch.matchId}`);
                    }
                  }, 500); // Уменьшено с 2000ms до 500ms
                }
              }
            } catch (error) {
              console.warn("Failed to auto-switch to next match:", error);
              localStorage.removeItem(`match_switched_${currentMatch.matchId}`);
            }
          })();
        }
      }
    }
    
    // Сохраняем текущий статус
    localStorage.setItem(`match_status_${currentMatch.matchId}`, match.status);
  }
});

window.addEventListener("player-matches-updated", (event) => {
  if (event?.detail?.meta?.internal) {
    return;
  }
  const matches = event?.detail?.matches;
  const meta = event?.detail?.meta || {};
  // Пропускаем обогащение, если это событие от просмотра списка матчей
  // Если метаданных нет (событие от MatchesList.js), тоже пропускаем обогащение
  const shouldSkipDetails = meta.skipDetails === true || 
                            meta.reason === "matches_modal_open" || 
                            meta.reason === "matches_modal_manual_refresh" ||
                            !meta.reason; // Если нет reason, значит событие от MatchesList.js при просмотре
  if (Array.isArray(matches) && matches.length > 0) {
    void syncSessionStatsWithMatches(matches, { 
      source: "matches_list_event", 
      fromList: true,
      skipDetails: shouldSkipDetails
    }).catch(() => {});
  }
});

// Cleanup on mode change
settingsMode?.addEventListener("change", () => {
  if (mode !== "pvp-farcaster") {
    clearCurrentMatch();
    stopPendingMatchesCheck();
    updateMatchUI();
    stopSessionStatsLoop();
  } else {
    // При переключении в pvp-farcaster запускаем проверку pending матчей
    const session = getSession();
    const playerFid = session?.farcaster?.fid || session?.fid;
    if (playerFid) {
      startPendingMatchesCheck(5000);
      startSessionStatsLoop();
    }
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
  // Также показываем во время активной игры для доступа к матчам
  if (matchesBtn) {
    const hasActiveMatch = getCurrentMatch().matchState && mode === "pvp-farcaster";
    matchesBtn.style.display = (isFarcasterMode && isSignedIn) || hasActiveMatch ? "inline-block" : "none";
  }
  
  // Показываем кнопку Leaderboard только в PVP Farcaster режиме
  if (leaderboardBtn) {
    leaderboardBtn.style.display = isFarcasterMode && isSignedIn ? "inline-block" : "none";
  }
  
  if (publishBtn) {
    publishBtn.style.display = isFarcasterMode && isSignedIn ? "inline-block" : "none";
  }
  
  if (isFarcasterMode && isSignedIn) {
    startSessionStatsLoop();
  } else {
    stopSessionStatsLoop();
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
let lastSyncBoard = null; // Сохраняем состояние доски для сравнения
let opponentAvatarCache = null;
let pendingMatchesCheckTimer = null;
let pendingMatchesDefaultInterval = 5000;
let pendingMatchesCheckEnabled = false;
// Состояние "умного" polling'а для pending-проверки
const pendingCheckState = {
  mode: "hot", // "hot" | "warm" | "cold"
  unchangedCycles: 0,
  lastPendingCount: 0
};

// Функция для проверки pending матчей и автоматической загрузки при переходе в active
// Оптимизировано: проверяем только свои pending матчи из снапшота, без сканирования всех чужих
async function checkPendingMatches() {
  const session = getSession();
  const playerFid = session?.farcaster?.fid || session?.fid;
  
  if (!playerFid || mode !== "pvp-farcaster") {
    return MATCH_POLL_CONFIG.noMatchIntervalMs;
  }
  
  const currentMatch = getCurrentMatch();
  
  let matches = [];
  try {
    // Используем снапшот с увеличенным maxAgeMs для снижения KV запросов
    matches = await getMatchesSnapshot({
      reason: "pending_matches_check",
      maxAgeMs: 12000
    });
  } catch (error) {
    console.warn("Error checking pending matches:", error);
    return pendingMatchesDefaultInterval;
  }

  // Нормализуем FID игрока
  const normalizedPlayerFid = typeof playerFid === "string" ? parseInt(playerFid, 10) : playerFid;
  
  // Проверяем наличие pending-матчей, созданных этим игроком
  // Если есть pending-матчи, принудительно обновляем снапшот для обнаружения новых активных матчей
  let myPendingMatches = matches.filter((match) => {
    if (match.status !== "pending") return false;
    const creatorFid = match.player1Fid ? (typeof match.player1Fid === "string" ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
    return creatorFid === normalizedPlayerFid;
  });
  
  // Если есть pending-матчи, созданные этим игроком, принудительно обновляем снапшот
  // чтобы обнаружить, не стал ли какой-то из них активным
  if (myPendingMatches.length > 0) {
    try {
      matches = await getMatchesSnapshot({
        reason: "pending_matches_check_force_refresh",
        forceFetch: true  // Принудительное обновление для обнаружения новых активных матчей
      });
    } catch (error) {
      console.warn("Error refreshing matches snapshot for pending check:", error);
    }
  }
  
  // ВАЖНО: Если текущий матч имеет статус "pending" в локальном состоянии,
  // принудительно обновляем снапшот, чтобы обнаружить, не стал ли он "active" на сервере
  if (currentMatch.matchState && currentMatch.matchId && currentMatch.matchState.status === "pending") {
    try {
      matches = await getMatchesSnapshot({
        reason: "pending_matches_check_current_pending_refresh",
        forceFetch: true  // Принудительное обновление для обнаружения изменения статуса текущего матча
      });
    } catch (error) {
      console.warn("Error refreshing matches snapshot for current pending match:", error);
    }
  }
  
  // Проверяем наличие активных матчей игрока (где игрок является участником)
  // Это может быть матч, который только что был принят
  // ВАЖНО: Проверяем новые активные матчи ПЕРЕД проверкой на остановку,
  // чтобы не пропустить матчи, которые только что стали активными
  
  // Сначала проверяем, не изменился ли статус уже загруженного матча с "pending" на "active"
  const currentMatchStatus = currentMatch.matchState?.status;
  
  // Проверяем сохраненный статус из localStorage (статус при первой загрузке)
  const storedInitialStatus = currentMatch.matchId && typeof window !== 'undefined' 
    ? localStorage.getItem(`match_status_${currentMatch.matchId}`) 
    : null;
  
  const activeMatchThatBecameActive = matches.find(match => {
    if (match.status !== "active" || match.gameState?.finished) return false;
    const matchPlayer1Fid = match.player1Fid ? (typeof match.player1Fid === "string" ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
    const matchPlayer2Fid = match.player2Fid ? (typeof match.player2Fid === "string" ? parseInt(match.player2Fid, 10) : match.player2Fid) : null;
    const isPlayerInMatch = matchPlayer1Fid === normalizedPlayerFid || matchPlayer2Fid === normalizedPlayerFid;
    const isCurrentMatch = currentMatch.matchId === match.matchId;
    // Проверяем, изменился ли статус с "pending" на "active" (используем сохраненный начальный статус)
    const statusChangedToActive = (storedInitialStatus === "pending" || currentMatchStatus === "pending") && match.status === "active";
    return isPlayerInMatch && isCurrentMatch && statusChangedToActive;
  });
  
  const hasNewActiveMatch = matches.some(match => {
    if (match.status !== "active" || match.gameState?.finished) return false;
    // Проверяем, является ли игрок участником матча
    const matchPlayer1Fid = match.player1Fid ? (typeof match.player1Fid === "string" ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
    const matchPlayer2Fid = match.player2Fid ? (typeof match.player2Fid === "string" ? parseInt(match.player2Fid, 10) : match.player2Fid) : null;
    const isPlayerInMatch = matchPlayer1Fid === normalizedPlayerFid || matchPlayer2Fid === normalizedPlayerFid;
    // Проверяем, не загружен ли уже этот матч
    const isNotLoaded = !currentMatch.matchState || currentMatch.matchId !== match.matchId;
    return isPlayerInMatch && isNotLoaded;
  });
  
  // Если найден матч, который уже загружен, но статус изменился с "pending" на "active",
  // считаем это как новый активный матч
  const hasStatusChangedToActive = !!activeMatchThatBecameActive;
  
  // Пересчитываем pending-матчи после возможного обновления matches
  // (если matches был обновлен через forceFetch в блоке выше)
  myPendingMatches = matches.filter((match) => {
    if (match.status !== "pending") return false;
    const creatorFid = match.player1Fid ? (typeof match.player1Fid === "string" ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
    return creatorFid === normalizedPlayerFid;
  });
  
  // Если уже есть активный матч И нет pending-матчей И нет новых активных матчей И статус не изменился, не проверяем дальше
  if (currentMatch.matchState && currentMatch.matchState.status === "active" && myPendingMatches.length === 0 && !hasNewActiveMatch && !hasStatusChangedToActive) {
    stopPendingMatchesCheck();
    return null;
  }
  
  // Если найден новый активный матч игрока ИЛИ статус уже загруженного матча изменился с "pending" на "active",
  // принудительно обновляем снапшот и загружаем/обновляем матч
  if (hasNewActiveMatch || hasStatusChangedToActive) {
    try {
      matches = await getMatchesSnapshot({
        reason: "pending_matches_check_active_found",
        forceFetch: true  // Принудительное обновление для получения актуальных данных
      });
      
      // После обновления снапшота ищем активный матч игрока и загружаем его
      const newActiveMatch = matches.find(match => {
        if (match.status !== "active" || match.gameState?.finished) return false;
        const matchPlayer1Fid = match.player1Fid ? (typeof match.player1Fid === "string" ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
        const matchPlayer2Fid = match.player2Fid ? (typeof match.player2Fid === "string" ? parseInt(match.player2Fid, 10) : match.player2Fid) : null;
        const isPlayerInMatch = matchPlayer1Fid === normalizedPlayerFid || matchPlayer2Fid === normalizedPlayerFid;
        const isNotLoaded = !currentMatch.matchState || currentMatch.matchId !== match.matchId;
        return isPlayerInMatch && isNotLoaded;
      });
      
      // Также проверяем, не изменился ли статус загруженного матча с "pending" на "active"
      // (пересчитываем после обновления снапшота)
      const updatedCurrentMatchStatus = currentMatch.matchState?.status;
      const updatedActiveMatchThatBecameActive = matches.find(match => {
        if (match.status !== "active" || match.gameState?.finished) return false;
        const matchPlayer1Fid = match.player1Fid ? (typeof match.player1Fid === "string" ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
        const matchPlayer2Fid = match.player2Fid ? (typeof match.player2Fid === "string" ? parseInt(match.player2Fid, 10) : match.player2Fid) : null;
        const isPlayerInMatch = matchPlayer1Fid === normalizedPlayerFid || matchPlayer2Fid === normalizedPlayerFid;
        const isCurrentMatch = currentMatch.matchId === match.matchId;
        const statusChangedToActive = updatedCurrentMatchStatus === "pending" && match.status === "active";
        return isPlayerInMatch && isCurrentMatch && statusChangedToActive;
      });
      
      if (newActiveMatch) {
        // Автоматически загружаем матч
        await loadMatch(newActiveMatch.matchId);
        mode = "pvp-farcaster";
        if (settingsMode) settingsMode.value = "pvp-farcaster";
        updateUIForMode();
        updateMatchUI();
      } else if (updatedActiveMatchThatBecameActive) {
        // Матч уже загружен, но статус изменился с "pending" на "active"
        // Обновляем матч и UI
        await loadMatch(updatedActiveMatchThatBecameActive.matchId);
        mode = "pvp-farcaster";
        if (settingsMode) settingsMode.value = "pvp-farcaster";
        updateUIForMode();
        updateMatchUI();
        
        const lang = getLanguage();
        showToast(
          lang === "ru" ? "Противник принял матч!" : "Opponent accepted the match!",
          "success"
        );
        
        // Проверяем, остались ли еще pending-матчи после загрузки нового активного матча
        const remainingPendingMatches = matches.filter((match) => {
          if (match.status !== "pending") return false;
          const creatorFid = match.player1Fid ? (typeof match.player1Fid === "string" ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
          return creatorFid === normalizedPlayerFid;
        });
        
        // Если остались pending-матчи, продолжаем проверку
        if (remainingPendingMatches.length > 0) {
          return pendingMatchesDefaultInterval;
        } else {
          // Останавливаем проверку pending, так как теперь есть активный матч и нет pending-матчей
          stopPendingMatchesCheck();
          return null;
        }
      }
    } catch (error) {
      console.warn("Error refreshing matches snapshot or loading active match:", error);
    }
  }

  // Пересчитываем pending-матчи после возможного обновления matches
  // (если matches был обновлен через forceFetch в блоке выше)
  myPendingMatches = matches.filter((match) => {
    if (match.status !== "pending") return false;
    const creatorFid = match.player1Fid ? (typeof match.player1Fid === "string" ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
    return creatorFid === normalizedPlayerFid;
  });

  const pendingCount = myPendingMatches.length;
  const hasPending = pendingCount > 0;
  const changed = pendingCount !== pendingCheckState.lastPendingCount;
  
  // Проверяем активные матчи игрока (где игрок является участником)
  const hasActiveMatch = matches.some(match => {
    if (match.status !== "active" || match.gameState?.finished) return false;
    const matchPlayer1Fid = match.player1Fid ? (typeof match.player1Fid === "string" ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
    const matchPlayer2Fid = match.player2Fid ? (typeof match.player2Fid === "string" ? parseInt(match.player2Fid, 10) : match.player2Fid) : null;
    return matchPlayer1Fid === normalizedPlayerFid || matchPlayer2Fid === normalizedPlayerFid;
  });
  
  // Обновляем состояние "умного" polling'а
  if (changed || hasNewActiveMatch) {
    pendingCheckState.unchangedCycles = 0;
    pendingCheckState.mode = "hot";
  } else {
    pendingCheckState.unchangedCycles += 1;
    
    if (pendingCheckState.mode === "hot" &&
        pendingCheckState.unchangedCycles >= MATCH_POLL_CONFIG.warmAfterUnchangedCycles) {
      pendingCheckState.mode = "warm";
    } else if (pendingCheckState.mode !== "cold" &&
               pendingCheckState.unchangedCycles >= MATCH_POLL_CONFIG.coldAfterUnchangedCycles) {
      pendingCheckState.mode = "cold";
    }
  }
  
  // Не переходим в cold, если есть активные матчи игрока или pending матчи
  if (!hasPending && !hasActiveMatch) {
    pendingCheckState.mode = "cold";
  } else if (hasActiveMatch) {
    // Если есть активный матч игрока, выходим из cold режима
    pendingCheckState.mode = "hot";
    pendingCheckState.unchangedCycles = 0;
  }
  
  pendingCheckState.lastPendingCount = pendingCount;
  
  // Ищем pending матчи, которые стали active (только матчи игрока)
  for (const match of matches) {
    if (match.status === "active" && !match.gameState.finished) {
      // Проверяем, является ли игрок участником матча
      const matchPlayer1Fid = match.player1Fid ? (typeof match.player1Fid === "string" ? parseInt(match.player1Fid, 10) : match.player1Fid) : null;
      const matchPlayer2Fid = match.player2Fid ? (typeof match.player2Fid === "string" ? parseInt(match.player2Fid, 10) : match.player2Fid) : null;
      const isPlayerInMatch = matchPlayer1Fid === normalizedPlayerFid || matchPlayer2Fid === normalizedPlayerFid;
      
      if (isPlayerInMatch) {
        // Проверяем, не загружен ли уже этот матч
        if (!currentMatch.matchState || currentMatch.matchId !== match.matchId) {
          // Автоматически загружаем матч
          await loadMatch(match.matchId);
          mode = "pvp-farcaster";
          if (settingsMode) settingsMode.value = "pvp-farcaster";
          updateUIForMode();
          updateMatchUI();
          // updateMatchUI уже вызывает updateMatchSwitcher, но для надежности вызываем еще раз
          await updateMatchSwitcher();
          
          const lang = getLanguage();
          showToast(
            lang === "ru" ? "Противник принял матч!" : "Opponent accepted the match!",
            "success"
          );
          
          // Останавливаем проверку pending матчей, так как теперь есть активный
          stopPendingMatchesCheck();
          return null;
        }
      }
    }
  }

  // Вычисляем следующий интервал на основе режима
  let nextInterval;
  if (pendingCheckState.mode === "hot") {
    nextInterval = MATCH_POLL_CONFIG.fastIntervalMs;
  } else if (pendingCheckState.mode === "warm") {
    nextInterval = MATCH_POLL_CONFIG.idleIntervalMs;
  } else {
    // cold режим - редкие проверки
    nextInterval = MATCH_POLL_CONFIG.noMatchIntervalMs;
  }
  
  // Применяем джиттер
  const jitterRatio = MATCH_POLL_CONFIG.jitterRatio ?? 0;
  if (jitterRatio > 0) {
    const delta = nextInterval * jitterRatio;
    const randomOffset = (Math.random() * 2 - 1) * delta;
    nextInterval = nextInterval + randomOffset;
  }
  
  nextInterval = Math.max(
    MATCH_POLL_CONFIG.minIntervalMs || 0,
    Math.min(MATCH_POLL_CONFIG.maxIntervalMs || Number.MAX_SAFE_INTEGER, nextInterval)
  );
  
  return Math.round(nextInterval);
}

// Запуск периодической проверки pending матчей
function startPendingMatchesCheck(intervalMs = 5000) {
  pendingMatchesDefaultInterval = Math.max(1000, intervalMs);
  stopPendingMatchesCheck();
  // Сбрасываем состояние при старте
  pendingCheckState.mode = "hot";
  pendingCheckState.unchangedCycles = 0;
  pendingCheckState.lastPendingCount = 0;
  pendingMatchesCheckEnabled = true;
  scheduleNextPendingMatchesCheck(0);
}

// Остановка проверки pending матчей
function stopPendingMatchesCheck() {
  pendingMatchesCheckEnabled = false;
  if (pendingMatchesCheckTimer) {
    clearTimeout(pendingMatchesCheckTimer);
    pendingMatchesCheckTimer = null;
  }
  // Сбрасываем состояние при остановке
  pendingCheckState.mode = "cold";
  pendingCheckState.unchangedCycles = 0;
  pendingCheckState.lastPendingCount = 0;
}

function scheduleNextPendingMatchesCheck(delay) {
  if (!pendingMatchesCheckEnabled) {
    return;
  }
  const safeDelay = Math.max(0, delay);
  pendingMatchesCheckTimer = setTimeout(async () => {
    pendingMatchesCheckTimer = null;
    let nextDelay = pendingMatchesDefaultInterval;
    try {
      const result = await checkPendingMatches();
      if (typeof result === "number" || result === null) {
        nextDelay = result;
      }
    } catch (error) {
      console.warn("Error during pending matches check:", error);
      nextDelay = pendingMatchesDefaultInterval;
    }
    if (!pendingMatchesCheckEnabled || nextDelay === null) {
      return;
    }
    scheduleNextPendingMatchesCheck(nextDelay);
  }, safeDelay);
}

async function updateOpponentAvatar() {
  const currentMatch = getCurrentMatch();
  if (!currentMatch.matchState || mode !== "pvp-farcaster") {
    const opponentAvatar = document.getElementById("opponent-avatar");
    if (opponentAvatar) opponentAvatar.style.display = "none";
    return;
  }

  const currentOpponentFid = getOpponentFid();
  if (!currentOpponentFid) {
    const opponentAvatar = document.getElementById("opponent-avatar");
    if (opponentAvatar) opponentAvatar.style.display = "none";
    return;
  }

  // Используем кеш если FID не изменился
  
  if (opponentAvatarCache && opponentAvatarCache.fid === currentOpponentFid) {
    const opponentAvatar = document.getElementById("opponent-avatar");
    if (opponentAvatar && opponentAvatarCache.pfp_url) {
      // Устанавливаем crossOrigin только для нашего origin
      const isExternalUrl = opponentAvatarCache.pfp_url.startsWith('http://') || opponentAvatarCache.pfp_url.startsWith('https://');
      const isSameOrigin = isExternalUrl && opponentAvatarCache.pfp_url.startsWith(window.location.origin);
      
      opponentAvatar.style.display = "block";
      if (isSameOrigin) {
        opponentAvatar.crossOrigin = "anonymous";
      } else {
        opponentAvatar.removeAttribute('crossorigin');
      }
      opponentAvatar.src = opponentAvatarCache.pfp_url || "";
      opponentAvatar.alt = opponentAvatarCache.username || opponentAvatarCache.display_name || "Opponent";
    } else if (opponentAvatar) {
      opponentAvatar.style.display = "none";
    }
    return;
  }

  try {
    const userData = await getUserByFid(currentOpponentFid);
    if (userData?.user) {
      let pfpUrl = userData.user.pfp_url || userData.user.pfpUrl || userData.user.pfp || null;
      
      // Используем оригинальный URL (Cloudflare Images с /public не работает)
      // Качество улучшается через CSS (image-rendering: high-quality)
      opponentAvatarCache = {
        fid: currentOpponentFid,
        username: userData.user.username,
        display_name: userData.user.display_name,
        pfp_url: pfpUrl
      };
      
      const opponentAvatar = document.getElementById("opponent-avatar");
      if (opponentAvatar && opponentAvatarCache.pfp_url) {
        // Устанавливаем crossOrigin только для нашего origin
        const isExternalUrl = opponentAvatarCache.pfp_url.startsWith('http://') || opponentAvatarCache.pfp_url.startsWith('https://');
        const isSameOrigin = isExternalUrl && opponentAvatarCache.pfp_url.startsWith(window.location.origin);
        
        opponentAvatar.style.display = "block";
        if (isSameOrigin) {
          opponentAvatar.crossOrigin = "anonymous";
        } else {
          opponentAvatar.removeAttribute('crossorigin');
        }
        opponentAvatar.src = opponentAvatarCache.pfp_url;
        opponentAvatar.alt = opponentAvatarCache.username || opponentAvatarCache.display_name || "Opponent";
        
        opponentAvatar.onload = () => {
          // Аватар оппонента загружен
        };
        
        opponentAvatar.onerror = () => {
          if (opponentAvatar) opponentAvatar.style.display = "none";
        };
      } else if (opponentAvatar) {
        opponentAvatar.style.display = "none";
      }
    }
  } catch (error) {
    console.warn("Failed to load opponent avatar:", error);
  }
}

// Переменная для отслеживания предыдущего статуса матча
let previousMatchStatus = null;
let lastMatchId = null; // Отслеживаем смену матча

function applyMatchSwitcherData(matches) {
  if (!matchSwitcher) return;
  const session = getSession();
  const playerFid = session?.farcaster?.fid || session?.fid;
  if (!playerFid || mode !== "pvp-farcaster") {
    matchSwitcher.style.display = "none";
    window.activeMatchesList = null;
    return;
  }

  const activeMatches = (matches || []).filter((match) => match?.status === "active" && !match?.gameState?.finished);
  const activeMatchIds = new Set(
    activeMatches
      .map((match) => normalizeMatchIdValue(match))
      .filter((id) => id !== null)
  );

  for (const cachedId of Array.from(matchSymbolCache.keys())) {
    if (!activeMatchIds.has(cachedId)) {
      matchSymbolCache.delete(cachedId);
    }
  }

  activeMatches.forEach((match) => updateMatchSymbolCache(match, null, { source: "matches_snapshot" }));

  if (activeMatches.length >= 2) {
    matchSwitcher.style.display = "flex";
    matchSwitcher.style.alignItems = "center";
    matchSwitcher.style.gap = "4px";
    window.activeMatchesList = activeMatches;
    updateMatchSwitcherButtons();
  } else {
    matchSwitcher.style.display = "none";
    window.activeMatchesList = null;
  }
}

// Функция для обновления переключателя матчей
async function updateMatchSwitcher(options = {}) {
  if (!matchSwitcher) return;
  try {
    const matches = await getMatchesSnapshot({
      reason: options.reason || "match_switcher",
      forceFetch: options.force === true,
      maxAgeMs: options.maxAgeMs ?? 5000
    });
    applyMatchSwitcherData(matches);
  } catch (error) {
    console.warn("Failed to update match switcher:", error);
    matchSwitcher.style.display = "none";
  }
}

subscribeToMatchUpdates((matches) => {
  applyMatchSwitcherData(matches);
});

// Обновление состояния кнопок переключателя
function updateMatchSwitcherButtons() {
  if (!window.activeMatchesList || window.activeMatchesList.length < 2) {
    if (matchSwitcherPrev) matchSwitcherPrev.disabled = true;
    if (matchSwitcherNext) matchSwitcherNext.disabled = true;
    return;
  }
  
  const currentMatch = getCurrentMatch();
  const currentMatchId = normalizeMatchIdValue(currentMatch);
  const currentIndex = window.activeMatchesList.findIndex(match => normalizeMatchIdValue(match) === currentMatchId);
  
  if (matchSwitcherPrev) {
    matchSwitcherPrev.disabled = currentIndex <= 0;
  }
  if (matchSwitcherNext) {
    matchSwitcherNext.disabled = currentIndex >= window.activeMatchesList.length - 1;
  }
}

// Переключение на предыдущий матч
async function switchToPreviousMatch() {
  if (!window.activeMatchesList || window.activeMatchesList.length < 2) return;
  
  const currentMatch = getCurrentMatch();
  const currentMatchId = normalizeMatchIdValue(currentMatch);
  const currentIndex = window.activeMatchesList.findIndex(match => normalizeMatchIdValue(match) === currentMatchId);
  
  if (currentIndex > 0) {
    const prevMatch = window.activeMatchesList[currentIndex - 1];
    const prevMatchId = normalizeMatchIdValue(prevMatch);
    if (!prevMatchId) return;
    await loadMatch(prevMatchId);
    mode = "pvp-farcaster";
    if (settingsMode) settingsMode.value = "pvp-farcaster";
    updateUIForMode();
    updateMatchUI();
    // Обновляем tooltip для нового матча
    await updateMatchSwitcherTooltip(prevMatch);
    // Обновляем состояние кнопок
    updateMatchSwitcherButtons();
  }
}

// Переключение на следующий матч
async function switchToNextMatch() {
  if (!window.activeMatchesList || window.activeMatchesList.length < 2) return;
  
  const currentMatch = getCurrentMatch();
  const currentMatchId = normalizeMatchIdValue(currentMatch);
  const currentIndex = window.activeMatchesList.findIndex(match => normalizeMatchIdValue(match) === currentMatchId);
  
  if (currentIndex < window.activeMatchesList.length - 1) {
    const nextMatch = window.activeMatchesList[currentIndex + 1];
    const nextMatchId = normalizeMatchIdValue(nextMatch);
    if (!nextMatchId) return;
    await loadMatch(nextMatchId);
    mode = "pvp-farcaster";
    if (settingsMode) settingsMode.value = "pvp-farcaster";
    updateUIForMode();
    updateMatchUI();
    // Обновляем tooltip для нового матча
    await updateMatchSwitcherTooltip(nextMatch);
    // Обновляем состояние кнопок
    updateMatchSwitcherButtons();
  }
}

// Обновление tooltip с информацией о противнике
async function updateMatchSwitcherTooltip(match) {
  const tooltipEl = document.getElementById("match-switcher-tooltip");
  if (!tooltipEl || !match) return false;
  
  const session = getSession();
  const playerFid = session?.farcaster?.fid || session?.fid;
  if (!playerFid) return false;

  let matchData = match;
  const matchIdStr = normalizeMatchIdValue(match);
  let symbolInfo = null;
  let fetchedFreshData = false;

  if (matchIdStr) {
    try {
      const freshMatch = await getMatch(matchIdStr);
      if (freshMatch) {
        matchData = freshMatch;
        await syncSessionStatsWithMatches([freshMatch], { source: "tooltip_fetch" });
        symbolInfo = updateMatchSymbolCache(
          freshMatch,
          null,
          {
            source: "tooltip_fetch",
            trace: {
              trigger: "hover",
              matchId: matchIdStr
            }
          }
        );
        fetchedFreshData = true;
      }
    } catch (error) {
      console.warn("Failed to refresh match data for tooltip:", error);
      const cached = matchSymbolCache.get(matchIdStr);
      if (cached) {
        symbolInfo = cached;
      } else {
        symbolInfo = updateMatchSymbolCache(
          matchData,
          null,
          {
            source: "tooltip_fallback_after_fetch_error",
            trace: {
              trigger: "hover",
              matchId: matchIdStr,
              reason: "fetch_error"
            }
          }
        );
      }
    }
  } else {
    symbolInfo = updateMatchSymbolCache(
      matchData,
      null,
      {
        source: "tooltip_without_match_id",
        trace: {
          trigger: "hover",
          reason: "no_match_id"
        }
      }
    );
  }

  if (!symbolInfo) {
    return false;
  }

  let validation = validateSymbolInfo(matchData, playerFid, symbolInfo);

  if (!validation.ok) {
    if (DEBUG_ENABLED) {
      addDebugLog("❌ Валидация символа для tooltip не прошла", {
        reason: validation.reason,
        meta: validation.meta || null,
        matchId: matchIdStr,
        playerFid: normalizeFidValue(playerFid),
        symbolInfo
      });
    }
    if (matchIdStr) {
      matchSymbolCache.delete(matchIdStr);
    }
    return false;
  }

  if (!symbolInfo) return false;

  const { mySymbol, opponentFid, player1Fid, player2Fid } = symbolInfo;

  const matchIdentifier =
    normalizeMatchIdValue(matchData) ||
    `${player1Fid || "unknown"}:${player2Fid || "unknown"}`;
  tooltipEl.dataset.matchId = matchIdentifier;

  if (DEBUG_ENABLED) {
    addDebugLog("ℹ️ Данные для tooltip подготовлены", {
      matchIdentifier,
      hoveredMatchId: matchIdStr,
      mySymbol,
      opponentFid,
      playerFid: normalizeFidValue(playerFid),
      player1Fid,
      player2Fid,
      cacheSource: symbolInfo.source,
      fetchedFreshData,
      trace: symbolInfo.trace || null
    });
  }

  if (opponentFid) {
    const opponentFidNumber = Number(opponentFid);
    try {
      const userData = await getUserByFid(Number.isFinite(opponentFidNumber) ? opponentFidNumber : opponentFid);
      if (tooltipEl.dataset.matchId !== matchIdentifier) {
        return;
      }
      if (userData?.user) {
        const opponentName = userData.user.username 
          ? `@${userData.user.username}` 
          : userData.user.display_name || `FID: ${opponentFid}`;
        let opponentAvatar = userData.user.pfp_url || userData.user.pfpUrl || userData.user.pfp || "/assets/images/hero.jpg";
        
        // Используем оригинальный URL (Cloudflare Images с /public не работает)
        // Качество улучшается через CSS (image-rendering: high-quality)
        const avatarEl = tooltipEl.querySelector("#match-switcher-opponent-avatar");
        const nameEl = tooltipEl.querySelector("#match-switcher-opponent-name");
        const infoEl = tooltipEl.querySelector("#match-switcher-match-info");
        
        if (avatarEl) {
          // Устанавливаем crossOrigin только для нашего origin
          const isExternalUrl = opponentAvatar.startsWith('http://') || opponentAvatar.startsWith('https://');
          const isSameOrigin = isExternalUrl && opponentAvatar.startsWith(window.location.origin);
          if (isSameOrigin) {
            avatarEl.crossOrigin = "anonymous";
          } else {
            avatarEl.removeAttribute('crossorigin');
          }
          avatarEl.src = opponentAvatar;
          avatarEl.alt = opponentName;
        }
        if (nameEl) {
          nameEl.textContent = opponentName;
        }
        if (infoEl) {
          const lang = getLanguage();
          infoEl.textContent = lang === "ru" 
            ? `Ваш символ: ${mySymbol}` 
            : `Your symbol: ${mySymbol}`;
        }
      }
    } catch (error) {
      console.warn("Failed to load opponent info for tooltip:", error);
    }
  }

  // Обновляем символ даже если данные противника не загрузились
  const infoEl = tooltipEl.querySelector("#match-switcher-match-info");
  if (infoEl) {
    if (tooltipEl.dataset.matchId !== matchIdentifier) {
      return false;
    }
    const lang = getLanguage();
    infoEl.textContent = lang === "ru"
      ? `Ваш символ: ${mySymbol}`
      : `Your symbol: ${mySymbol}`;
  }

  return true;
}

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
      lastSyncBoard = null;
      lastMatchId = null;
      opponentAvatarCache = null;
    previousMatchStatus = null;
    const opponentAvatar = document.getElementById("opponent-avatar");
    if (opponentAvatar) opponentAvatar.style.display = "none";
    // Обновляем видимость кнопки My Matches и переключателя
    updateUIForMode();
    updateMatchSwitcher();
    return;
  }

  const match = currentMatch.matchState;
  void syncSessionStatsWithMatches([match], { source: "update_match_ui" }).catch(() => {});
  
  // Если матч изменился, сбрасываем состояние синхронизации
  if (lastMatchId !== null && lastMatchId !== currentMatch.matchId) {
    lastSyncTurn = 0;
    lastSyncBoard = null;
  }
  lastMatchId = currentMatch.matchId;
  
  // Проверяем изменение статуса матча (pending -> active)
  // Это обрабатывается через событие match-synced для автоматического переключения
  // Здесь просто обновляем previousMatchStatus
  previousMatchStatus = match.status;
  
  // Обновляем аватарку противника
  updateOpponentAvatar();
  
  // Инициализируем состояние синхронизации при первой загрузке матча
  if (lastSyncBoard === null) {
    lastSyncTurn = match.gameState.turn;
    lastSyncBoard = JSON.parse(JSON.stringify(match.gameState.board));
  }
  
  // Check if opponent made a move (сравниваем состояние доски)
  if (!match.gameState.finished) {
  const currentTurn = match.gameState.turn;
    const currentBoard = match.gameState.board;
    const mySymbol = getMySymbol();
    
    // Проверяем, что мы знаем свой символ (матч полностью загружен)
    if (mySymbol && lastSyncBoard) {
      const opponentSymbol = mySymbol === "X" ? "O" : "X";
      
      // Сравниваем доску: если доска изменилась, проверяем, чей символ появился
      const boardChanged = JSON.stringify(currentBoard) !== JSON.stringify(lastSyncBoard);
      const turnIncreased = currentTurn > lastSyncTurn;
      
      if (boardChanged && turnIncreased) {
        // Находим, какая клетка изменилась и чей символ там появился
        let opponentMadeMove = false;
        let changedCellIndex = -1;
        
        for (let i = 0; i < currentBoard.length; i++) {
          if (currentBoard[i] !== lastSyncBoard[i]) {
            changedCellIndex = i;
            // Если в новой клетке символ противника, значит он сделал ход
            if (currentBoard[i] === opponentSymbol) {
              opponentMadeMove = true;
              break;
            }
          }
        }
        
        if (opponentMadeMove) {
    // New move detected - show notification
    const lang = getLanguage();
    const msg = lang === "ru" ? "Противник сделал ход!" : "Opponent made a move!";
    showToast(msg, "info");
          
          if (DEBUG_ENABLED) {
            addDebugLog('🎯 Ход противника обнаружен', {
              cellIndex: changedCellIndex,
              opponentSymbol,
              mySymbol,
              turn: currentTurn,
              lastTurn: lastSyncTurn
            });
          }
        } else if (DEBUG_ENABLED && boardChanged) {
          // Логируем, если доска изменилась, но это не ход противника
          addDebugLog('⚠️ Доска изменилась, но не ход противника', {
            changedCellIndex,
            cellValue: changedCellIndex >= 0 ? currentBoard[changedCellIndex] : null,
            opponentSymbol,
            mySymbol,
            turn: currentTurn,
            lastTurn: lastSyncTurn
          });
        }
      }
    }
    
    // Обновляем состояние для следующей проверки (всегда, даже если mySymbol еще не определен)
  lastSyncTurn = currentTurn;
    lastSyncBoard = JSON.parse(JSON.stringify(currentBoard)); // Глубокая копия доски
  } else {
    // Игра завершена - сбрасываем состояние
    lastSyncTurn = 0;
    lastSyncBoard = null;
  }
  
  // Update board state from match
  // ВАЖНО: Не перезаписываем состояние доски, если это наш ход, который еще не синхронизирован
  // Проверяем, есть ли расхождение между локальным состоянием и состоянием с сервера
  const serverBoard = match.gameState.board;
  const localBoard = state.board;
  const serverTurn = match.gameState.turn;
  const localTurn = state.turn;
  
  // Если локальный ход опережает серверный (наш ход еще не синхронизирован),
  // не перезаписываем состояние доски полностью
  if (localTurn > serverTurn) {
    // Наш ход еще не синхронизирован - сохраняем локальное состояние доски
    // Но обновляем другие поля из match.gameState
    const preservedBoard = JSON.parse(JSON.stringify(localBoard));
    state = { ...match.gameState, board: preservedBoard };
    
    if (DEBUG_ENABLED) {
      addDebugLog('⏳ Сохраняем локальное состояние доски (ход еще не синхронизирован)', {
        localTurn,
        serverTurn,
        localBoard,
        serverBoard
      });
    }
  } else {
    // Состояние синхронизировано - используем состояние с сервера
  state = match.gameState;
  }
  
  render();
  updateMatchSymbolCache(match, null, { source: "update_match_ui" });
  
  // Обновляем переключатель матчей (асинхронно, чтобы не блокировать рендер)
  updateMatchSwitcher().catch(err => console.warn("Failed to update match switcher:", err));

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
        onTimeout: async () => {
          // Refresh match state when timeout occurs
          const syncResult = await syncMatch();
          if (syncResult) {
            updateMatchUI();
            
            // Обновляем счетчик при победе по таймеру
            const updatedMatch = getCurrentMatch().matchState;
            if (updatedMatch && updatedMatch.gameState.finished) {
              const currentMatch = getCurrentMatch();
              const isWinner = (updatedMatch.player1Symbol === updatedMatch.gameState.winner && updatedMatch.player1Fid === currentMatch.playerFid) ||
                               (updatedMatch.player2Symbol === updatedMatch.gameState.winner && updatedMatch.player2Fid === currentMatch.playerFid);
              if (updatedMatch.gameState.winner) {
                recordOutcome(isWinner ? "win" : "loss", currentMatch.matchId);
              } else {
                recordOutcome("draw", currentMatch.matchId);
              }
            }
            
            // ВАЖНО: Принудительно обновляем список матчей после таймаута,
            // чтобы завершенный матч не считался активным при создании нового
            try {
              await getMatchesSnapshot({
                reason: "timeout_refresh",
                forceFetch: true
              });
              
              if (DEBUG_ENABLED) {
                addDebugLog('🔄 [onTimeout] Обновлен список матчей после таймаута');
              }
            } catch (error) {
              console.warn("Failed to refresh matches after timeout:", error);
            }
          }
        }
      });
    }
    matchTimer.start(match.lastMoveAt);

    // Start syncing if not already
    import("./game/match-state.js").then(({ getSyncInterval }) => {
      const hasSync = getSyncInterval();
      if (!hasSync) {
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
      const recorded = recordOutcome(isWinner ? "win" : "loss", currentMatch.matchId);
      if (recorded) {
        showToast(
          isWinner 
            ? (lang === "ru" ? "🎉 Вы победили!" : "🎉 You won!")
            : (lang === "ru" ? "😔 Вы проиграли" : "😔 You lost"),
          isWinner ? "success" : "error"
        );
      }
      showStatus(isWinner 
        ? (lang === "ru" ? `Победа: ${winnerSymbol}` : `You win: ${winnerSymbol}`)
        : (lang === "ru" ? `Поражение: ${winnerSymbol}` : `You lose: ${winnerSymbol}`));
      // Сбрасываем цвет статуса для победы/поражения
      const statusEl = document.getElementById("status");
      if (statusEl) {
        statusEl.style.color = "";
      }
    } else {
      const recorded = recordOutcome("draw", currentMatch.matchId);
      if (recorded) {
        showToast(
          lang === "ru" ? "🤝 Ничья!" : "🤝 Here is a draw!",
          "draw"
        );
      }
      // Ничья - показываем правильный текст и цвет
      showStatus(lang === "ru" ? "Ничья" : "Here is a draw");
      // Используем серый цвет для ничьей (muted)
      const statusEl = document.getElementById("status");
      if (statusEl) {
        statusEl.style.color = "var(--muted)";
      }
    }
    
  } else {
    const mySymbol = getMySymbol();
    if (isMyTurn()) {
      showStatus(lang === "ru" ? `Ваш ход: ${mySymbol}` : `Your turn: ${mySymbol}`);
    } else {
      showStatus(lang === "ru" ? `Ожидание хода противника...` : `Waiting for opponent...`);
    }
  }

  // Проверяем завершение матча и немедленно переключаемся, если нужно
  // Используем оптимизированный подход: кэш, если свежий, forceFetch только если устарел
  if (match.gameState.finished) {
    const storedSwitched = localStorage.getItem(`match_switched_${currentMatch.matchId}`);
    if (!storedSwitched) {
      // Немедленно проверяем наличие других активных матчей
      (async () => {
        try {
          const session = getSession();
          const playerFid = session?.farcaster?.fid || session?.fid;
          if (playerFid && mode === "pvp-farcaster") {
            // Используем кэш, если он свежий (не старше 12 секунд)
            // forceFetch только если кэш устарел
            const now = Date.now();
            const cacheAge = now - matchDataStore.lastFetchedAt;
            const useForceFetch = cacheAge > MATCH_POLL_CONFIG.cacheStaleMs;
            
            const matches = await getMatchesSnapshot({
              reason: "match_finished_immediate_switch",
              forceFetch: useForceFetch  // Принудительно только если кэш устарел
            });
            
            const activeMatches = matches.filter(m => 
              m.status === "active" && 
              !m.gameState.finished && 
              m.matchId !== currentMatch.matchId
            );
            
            if (activeMatches.length > 0) {
              const nextMatch = activeMatches[0];
              localStorage.setItem(`match_switched_${currentMatch.matchId}`, "true");
              
              // Уменьшаем задержку с 2000ms до 500ms для более быстрого переключения
              setTimeout(async () => {
                try {
                  await loadMatch(nextMatch.matchId);
                  mode = "pvp-farcaster";
                  if (settingsMode) settingsMode.value = "pvp-farcaster";
                  updateUIForMode();
                  updateMatchUI();
                  const nextLang = getLanguage();
                  showToast(
                    nextLang === "ru" ? "Переключено на другой активный матч" : "Switched to another active match",
                    "info"
                  );
                } catch (error) {
                  console.error("Failed to load next match:", error);
                  localStorage.removeItem(`match_switched_${currentMatch.matchId}`);
                }
              }, 500); // Уменьшено с 2000ms до 500ms
            }
          }
        } catch (error) {
          console.warn("Failed to auto-switch to next match:", error);
          localStorage.removeItem(`match_switched_${currentMatch.matchId}`);
        }
      })();
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
    if (!authBtn) {
      alert('Ошибка: кнопка авторизации не найдена');
      return;
    }
    
    if (authBtn.dataset.signedIn === "true") {
      // Выход из системы
    const session = getSession();
    
      // Останавливаем синхронизацию матчей и проверку pending
    try {
      stopSyncing();
        stopPendingMatchesCheck();
      clearCurrentMatch();
    } catch (error) {
        if (DEBUG_ENABLED) {
          addDebugLog('⚠️ Ошибка при очистке состояния матча', { error: error.message });
        }
    }
    
    signOut();
    refreshUserLabel();
    
    if (timerContainer) {
      timerContainer.style.display = "none";
    }
    
    resetBoard(true);
    return;
  }
  
    // Проверка Mini App окружения
    let isMiniAppEnv = false;
    try {
      isMiniAppEnv = farcasterSDK.checkMiniAppEnvironment();
      if (!isMiniAppEnv) {
        try {
          isMiniAppEnv = await farcasterSDK.checkMiniAppEnvironmentAsync();
        } catch (asyncError) {
          // Игнорируем ошибку асинхронной проверки
        }
      }
    } catch (error) {
      isMiniAppEnv = false;
    }
    
    // Дополнительная проверка для надежности
    let additionalMiniAppCheck = false;
    try {
      const isInIframe = window.parent !== window;
      let sameOrigin = true;
      try {
        sameOrigin = window.parent.location.origin === window.location.origin;
      } catch (e) {
        sameOrigin = false;
      }
      
      additionalMiniAppCheck = !!(
        window.farcaster ||
        (isInIframe && !sameOrigin) ||
        document.referrer?.includes('farcaster') ||
        document.referrer?.includes('warpcast') ||
        window.location.search.includes('miniApp=true')
      );
    } catch (error) {
      additionalMiniAppCheck = !!(
        window.farcaster ||
        (window.parent !== window) ||
        document.referrer?.includes('farcaster') ||
        document.referrer?.includes('warpcast') ||
        window.location.search.includes('miniApp=true')
      );
    }
    
    const finalMiniAppCheck = isMiniAppEnv || additionalMiniAppCheck;
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                           (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' ||
                        window.location.hostname === '0.0.0.0';
    const hasRealMiniAppIndicators = !!(
      window.farcaster ||
      (window.parent !== window) ||
      document.referrer?.includes('farcaster') ||
      document.referrer?.includes('warpcast')
    );
    // Улучшенная проверка: используем finalMiniAppCheck, чтобы правильно определять Mini App
    // даже когда window.ethereum доступен (кошелек может быть доступен и в Mini App)
    const shouldUseMiniApp = hasRealMiniAppIndicators || 
                             finalMiniAppCheck ||
                             (isMobileDevice && !window.ethereum && !isLocalhost);
    
    if (DEBUG_ENABLED) {
      addDebugLog('🔍 Авторизация', {
        method: shouldUseMiniApp ? 'Mini App' : 'Wallet',
        hasRealIndicators: hasRealMiniAppIndicators,
        finalMiniAppCheck: finalMiniAppCheck,
        isMiniAppEnv: isMiniAppEnv,
        isMobile: isMobileDevice,
        hasEthereum: !!window.ethereum
    });
    }
    
    if (shouldUseMiniApp) {
    try {
      // Проверяем, действительно ли SDK доступен (не fallback mode)
      // Если SDK в fallback mode, значит мы не в Mini App окружении
      if (farcasterSDK.isFallbackMode && farcasterSDK.isFallbackMode()) {
        // SDK в fallback mode - это не Mini App окружение, используем кошелек
        throw new Error('SDK_NOT_LOADED');
      }
      
      // Если нет реальных индикаторов Mini App, но проверка определила Mini App,
      // это может быть ложное срабатывание - проверяем SDK.context перед попыткой авторизации
      if (!hasRealMiniAppIndicators) {
        // Пробуем проверить, доступен ли SDK.context
        try {
          const context = await farcasterSDK.getContext();
          if (!context || !context.user) {
            // SDK.context недоступен - это не Mini App окружение, используем кошелек
            throw new Error('SDK_NOT_LOADED');
          }
        } catch (contextError) {
          // SDK.context недоступен - это не Mini App окружение, используем кошелек
          throw new Error('SDK_NOT_LOADED');
        }
      }
      
      // Сначала пытаемся получить пользователя через Quick Auth напрямую
      // Это более надежный способ для Mini App
      const backendOrigin = window.location.origin;
      let fullUserData = null;
      
      // Пробуем getUser() - основной метод (SDK возвращает context.user напрямую)
      let user = null;
      try {
        user = await farcasterSDK.getUser();
        if (!user || !user.fid) {
          throw new Error('SDK не вернул данные пользователя (user.fid отсутствует)');
        }
      } catch (getUserError) {
        // Если getUser() не работает, пробуем Quick Auth как fallback
        const isLocalhost = backendOrigin.includes('localhost') || backendOrigin.includes('127.0.0.1');
        if (isLocalhost) {
          throw new Error(`SDK недоступен в локальном окружении. Откройте приложение через Warpcast Mini App или используйте кошелек на production домене.`);
        }
        
        try {
          fullUserData = await farcasterSDK.getUserWithQuickAuth(backendOrigin);
        } catch (quickAuthError) {
          // Если и Quick Auth не работает, и нет реальных индикаторов Mini App,
          // используем кошелек как fallback
          if (!hasRealMiniAppIndicators) {
            throw new Error('SDK_NOT_LOADED');
          }
          // Если ошибка связана с недоступностью SDK.context, и нет реальных индикаторов,
          // используем кошелек как fallback
          if (getUserError.message?.includes('SDK.context вернул null/undefined') || 
              getUserError.message?.includes('SDK.context.user недоступен')) {
            throw new Error('SDK_NOT_LOADED');
          }
          throw new Error(`Не удалось получить данные пользователя через Mini App SDK. Ошибка: ${getUserError.message}`);
        }
      }
      
      // Если получили данные из SDK, используем их напрямую (SDK - основной источник)
      if (user && user.fid) {
        // SDK возвращает: { fid, username, displayName, pfpUrl, ... }
        // Согласно документации: sdk.context.user.pfpUrl (camelCase)
        const pfpUrl = user.pfpUrl || null;
        
        if (DEBUG_ENABLED) {
          addDebugLog('📦 Данные из SDK', { 
            fid: user.fid,
            username: user.username,
            displayName: user.displayName,
            pfpUrl: pfpUrl,
            allKeys: Object.keys(user)
          });
        }
        
        const farcasterProfile = {
          fid: user.fid,
          username: user.username || user.displayName || `user_${user.fid}`,
          display_name: user.displayName || user.username || `User ${user.fid}`,
          pfp_url: pfpUrl  // Сохраняем как pfp_url для единообразия
        };
        
        const session = {
          schemaVersion: "1.0.0",
          farcaster: farcasterProfile,
          miniapp: true,
          issuedAt: new Date().toISOString()
        };
        
        localStorage.setItem("fc_session", JSON.stringify(session));
        
        if (DEBUG_ENABLED) {
          addDebugLog('✅ Сессия сохранена', { 
            fid: farcasterProfile.fid,
            username: farcasterProfile.username,
            pfp_url: farcasterProfile.pfp_url
          });
        }
        
        refreshUserLabel();
        return;
      }
      
      // Fallback: используем Quick Auth данные
      if (!fullUserData || !fullUserData.fid) {
        throw new Error('Не удалось получить данные пользователя');
      }
      
      // Проверяем все возможные поля для аватарки из fullUserData
      // Quick Auth может вернуть pfp_url (snake_case) или pfpUrl (camelCase)
      const pfpUrl = fullUserData.pfpUrl || fullUserData.pfp_url || fullUserData.pfp || fullUserData.profile_picture || null;
      
      
      const farcasterProfile = {
        fid: fullUserData.fid,
        username: fullUserData.username || fullUserData.displayName || `user_${fullUserData.fid}`,
        display_name: fullUserData.displayName || fullUserData.username || `User ${fullUserData.fid}`,
        pfp_url: pfpUrl
      };
      
      if (DEBUG_ENABLED) {
        addDebugLog('✅ Пользователь получен (Quick Auth fallback)', {
          fid: farcasterProfile.fid,
          username: farcasterProfile.username,
          pfp_url: farcasterProfile.pfp_url
        });
      }
      
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
      
      // Авторизация успешна - UI обновлен через refreshUserLabel()
      return;
      
    } catch (error) {
      if (DEBUG_ENABLED) {
        addDebugLog('❌ Ошибка авторизации Mini App', { message: error.message });
      }
      
      // Если SDK не загружен, это не Mini App окружение - используем кошелек как fallback
      if (error.message === 'SDK_NOT_LOADED' || error.message?.includes('fallback mode')) {
        if (DEBUG_ENABLED) {
          addDebugLog('🔄 SDK не загружен, используем кошелек как fallback');
        }
        // Продолжаем выполнение - переходим к авторизации через кошелек
      } else {
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
      
        // Если это реальная ошибка Mini App (не fallback), не используем кошелек
      addDebugLog('🚫 Не используем кошелек как fallback в Mini App');
      refreshUserLabel();
      return;
      }
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
    setTimeout(() => {
      const session = getSession();
      if (!session?.farcaster?.fid && !session?.address) {
        const lang = getLanguage();
        const msg = lang === "ru"
          ? `🔄 Авторизация занимает больше времени...\n\nЕсли авторизация не произошла автоматически, попробуйте обновить страницу.`
          : `🔄 Authentication is taking longer...\n\nIf sign in didn't happen automatically, try refreshing the page.`;
        alert(msg);
        refreshUserLabel();
      }
    }, 3000);
    return;
  }
  
  try { 
    const session = await signInWithWallet();
    
    // Убираем флаг автоматической авторизации (если был)
    localStorage.removeItem('auto_auth_started');
    
    // Обновляем UI
    refreshUserLabel();
    updateUIForMode();
    
    // Авторизация успешна - UI обновлен через refreshUserLabel()
  } catch (e) { 
    if (DEBUG_ENABLED) {
      addDebugLog('❌ Ошибка авторизации через кошелек', { message: e?.message || String(e) });
    } 
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
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА в обработчике Sign In:', error);
    if (DEBUG_ENABLED) {
      addDebugLog('❌ КРИТИЧЕСКАЯ ОШИБКА в обработчике Sign In', { message: error?.message || String(error) });
    }
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
  
  // Показываем контекстное меню выбора типа матча
  const matchTypeContext = document.getElementById("match-type-context");
  const inviteBtnRect = inviteBtn.getBoundingClientRect();
  
  if (matchTypeContext) {
    // Позиционируем контекстное меню рядом с кнопкой
    matchTypeContext.style.display = "block";
    
    // Вычисляем позицию с учетом границ экрана
    const contextWidth = 200; // Примерная ширина контекстного меню
    const contextHeight = 120; // Примерная высота
    const padding = 8;
    
    let leftPos = inviteBtnRect.right + padding;
    let topPos = inviteBtnRect.top;
    
    // Проверяем, не выходит ли за правый край экрана
    if (leftPos + contextWidth > window.innerWidth) {
      // Размещаем слева от кнопки
      leftPos = inviteBtnRect.left - contextWidth - padding;
      
      // Проверяем, не выходит ли за левый край экрана
      if (leftPos < padding) {
        // Прижимаем к левому краю экрана
        leftPos = padding;
      }
    }
    
    // Проверяем, не выходит ли за нижний край экрана
    if (topPos + contextHeight > window.innerHeight) {
      topPos = window.innerHeight - contextHeight - padding;
    }
    
    // Проверяем, не выходит ли за верхний край экрана
    if (topPos < 0) {
      topPos = padding;
    }
    
    matchTypeContext.style.left = `${leftPos}px`;
    matchTypeContext.style.top = `${topPos}px`;
    
    // Обновляем текст на выбранный язык
  const lang = getLanguage();
    const contextTitle = matchTypeContext.querySelector("div");
    if (contextTitle) {
      contextTitle.textContent = lang === "ru" ? "Выбери тип матча" : "Choose match type";
    }
    
    // Ждем выбора пользователя
    return new Promise((resolve) => {
      let resolved = false;
      let publicHandler, privateHandler, clickHandler;
      
      const handleChoice = async (visibility) => {
        if (resolved) return;

        const canCreate = await ensurePendingInviteLimit(session);
        if (!canCreate) {
          cleanup();
          matchTypeContext.style.display = "none";
          resolved = true;
          resolve();
          return;
        }

        resolved = true;
        cleanup();
        matchTypeContext.style.display = "none";
  
  try {
    const { payload, res, matchCreated } = await sendInvite(session, { visibility });
    // Сохраняем статус "pending" при создании матча, чтобы отследить изменение статуса
    if (matchCreated && typeof window !== 'undefined' && payload.matchId) {
      localStorage.setItem(`match_status_${payload.matchId}`, "pending");
    }
    const msg = lang === "ru"
      ? `Инвайт создан!\n\nMatch ID: ${payload.matchId}\nCast ID: ${res.castId || "ok"}\nMatch в API: ${matchCreated ? "да" : "нет"}`
      : `Invite created!\n\nMatch ID: ${payload.matchId}\nCast ID: ${res.castId || "ok"}\nMatch in API: ${matchCreated ? "yes" : "no"}`;
    alert(msg);
          
          // Запускаем проверку pending матчей после создания
          if (mode === "pvp-farcaster") {
            startPendingMatchesCheck(5000);
          }
  } catch (e) {
          let errorMsg = e?.message || e;
          if (errorMsg.includes("2 active matches")) {
            errorMsg = lang === "ru" 
              ? "У вас уже есть 2 активных матча. Завершите один из них, чтобы создать новый."
              : "You already have 2 active matches. Finish one to create a new one.";
          } else {
            errorMsg = lang === "ru" 
              ? `Не удалось создать инвайт: ${errorMsg}`
              : `Failed to create invite: ${errorMsg}`;
          }
    // Для ошибок превышения лимита матчей используем showAlert (работает в iframe)
    if (errorMsg.includes("2 active matches")) {
      if (typeof window !== 'undefined' && window.showAlert) {
        window.showAlert(errorMsg);
      } else {
        alert(errorMsg); // Fallback
      }
    } else {
      // Для других ошибок используем showToast
      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast(errorMsg, "error");
      } else {
        alert(errorMsg); // Fallback для старых браузеров
      }
    }
  }
        resolve();
      };
      
      publicHandler = () => handleChoice("public");
      privateHandler = async () => {
        if (resolved) return;

        const canCreate = await ensurePendingInviteLimit(session);
        if (!canCreate) {
          cleanup();
          matchTypeContext.style.display = "none";
          resolved = true;
          resolve();
          return;
        }

        cleanup();
        matchTypeContext.style.display = "none";
        
        // Показываем модальное окно для поиска пользователя
        const privateMatchModal = document.getElementById("private-match-modal");
        if (privateMatchModal) {
          privateMatchModal.setAttribute("aria-hidden", "false");
          initPrivateMatchSearch(privateMatchModal, session, resolve);
        } else {
          resolve();
        }
      };
      
      // Закрытие контекстного меню при клике вне его
      clickHandler = (e) => {
        if (!matchTypeContext.contains(e.target) && e.target !== inviteBtn) {
          if (resolved) return;
          resolved = true;
          cleanup();
          matchTypeContext.style.display = "none";
          resolve();
        }
      };
      
      const cleanup = () => {
        const btnPublic = document.getElementById("btn-match-public");
        const btnPrivate = document.getElementById("btn-match-private");
        if (btnPublic && publicHandler) btnPublic.removeEventListener("click", publicHandler);
        if (btnPrivate && privateHandler) btnPrivate.removeEventListener("click", privateHandler);
        if (clickHandler) document.removeEventListener("click", clickHandler);
      };
      
      const btnPublic = document.getElementById("btn-match-public");
      const btnPrivate = document.getElementById("btn-match-private");
      
      if (btnPublic) btnPublic.addEventListener("click", publicHandler);
      if (btnPrivate) btnPrivate.addEventListener("click", privateHandler);
      
      // Закрываем при клике вне меню
      setTimeout(() => {
        document.addEventListener("click", clickHandler);
      }, 0);
    });
  }
});

// Инициализация поиска пользователя для приватного матча
let privateMatchSearchTimeout = null;
let selectedPrivateMatchUser = null;

function initPrivateMatchSearch(modal, session, onResolve) {
    const lang = getLanguage();
  const usernameInput = document.getElementById("private-match-username");
  const suggestionsContainer = document.getElementById("private-match-suggestions");
  const userPreview = document.getElementById("private-match-user-preview");
  const userAvatar = document.getElementById("private-match-user-avatar");
  const userName = document.getElementById("private-match-user-name");
  const userFid = document.getElementById("private-match-user-fid");
  const sendBtn = document.getElementById("btn-private-match-send");
  const cancelBtn = document.getElementById("btn-private-match-cancel");
  
  // Обновляем текст на выбранный язык
  const title = modal.querySelector("#private-match-modal-title");
  if (title) {
    title.textContent = lang === "ru" ? "Найти пользователя" : "Find User";
  }
  if (usernameInput) {
    usernameInput.placeholder = lang === "ru" ? "@username" : "@username";
  }
  if (sendBtn) {
    sendBtn.textContent = lang === "ru" ? "Отправить вызов" : "Send Challenge";
  }
  if (cancelBtn) {
    cancelBtn.textContent = lang === "ru" ? "Отмена" : "Cancel";
  }
  
  // Сброс состояния
  selectedPrivateMatchUser = null;
  if (usernameInput) usernameInput.value = "";
  if (suggestionsContainer) suggestionsContainer.style.display = "none";
  if (userPreview) userPreview.style.display = "none";
  if (sendBtn) sendBtn.style.display = "none";
  
  // Удаляем старые обработчики если они есть
  const oldInputHandler = usernameInput?.oninput;
  if (oldInputHandler) usernameInput.removeEventListener("input", oldInputHandler);
  
  // Обработчик ввода username
  if (usernameInput) {
    const inputHandler = async (e) => {
      const input = e.target.value.trim();
      
      // Очищаем предыдущий таймер
      if (privateMatchSearchTimeout) {
        clearTimeout(privateMatchSearchTimeout);
      }
      
      if (!input) {
        if (suggestionsContainer) suggestionsContainer.style.display = "none";
        if (userPreview) userPreview.style.display = "none";
        if (sendBtn) sendBtn.style.display = "none";
        selectedPrivateMatchUser = null;
        return;
      }
      
      // Если начинается с @, убираем его
      const searchUsername = input.startsWith("@") ? input.slice(1) : input;
      
      // Дебаунс поиска (500ms)
      privateMatchSearchTimeout = setTimeout(async () => {
        if (searchUsername.length < 2) {
          if (suggestionsContainer) suggestionsContainer.style.display = "none";
          return;
        }
        
        try {
          const { searchUserByUsername } = await import("./farcaster/client.js");
          const userData = await searchUserByUsername(searchUsername);
          
          if (userData?.user) {
            selectedPrivateMatchUser = userData.user;
            
            // Показываем превью пользователя
            if (userPreview) userPreview.style.display = "block";
            if (userAvatar) {
              userAvatar.src = userData.user.pfp_url || userData.user.pfpUrl || userData.user.pfp || "/assets/images/hero.jpg";
              userAvatar.alt = userData.user.username || userData.user.display_name || "User";
            }
            if (userName) {
              userName.textContent = userData.user.username 
                ? `@${userData.user.username}` 
                : userData.user.display_name || `FID: ${userData.user.fid}`;
            }
            if (userFid) {
              userFid.textContent = `FID: ${userData.user.fid}`;
            }
            if (sendBtn) sendBtn.style.display = "block";
            if (suggestionsContainer) suggestionsContainer.style.display = "none";
          } else {
            // Пользователь не найден
            if (userPreview) userPreview.style.display = "none";
            if (sendBtn) sendBtn.style.display = "none";
            if (suggestionsContainer) {
              suggestionsContainer.style.display = "block";
              suggestionsContainer.innerHTML = `<div style="padding: 8px; color: var(--muted); font-size: 0.875rem;">${lang === "ru" ? "Пользователь не найден" : "User not found"}</div>`;
            }
            selectedPrivateMatchUser = null;
          }
        } catch (error) {
          console.error("Error searching user:", error);
          if (suggestionsContainer) {
            suggestionsContainer.style.display = "block";
            suggestionsContainer.innerHTML = `<div style="padding: 8px; color: var(--lose); font-size: 0.875rem;">${lang === "ru" ? "Ошибка поиска" : "Search error"}</div>`;
          }
          selectedPrivateMatchUser = null;
        }
      }, 500);
    };
    usernameInput.addEventListener("input", inputHandler);
    usernameInput.oninput = inputHandler; // Сохраняем ссылку для очистки
  }
  
  // Удаляем старый обработчик кнопки отправки (если был сохранен)
  if (sendBtn && sendBtn._clickHandler) {
    sendBtn.removeEventListener("click", sendBtn._clickHandler);
  }
  // Удаляем старый обработчик кнопки отмены (если был сохранен)
  if (cancelBtn && cancelBtn._clickHandler) {
    cancelBtn.removeEventListener("click", cancelBtn._clickHandler);
  }
  
  // Обработчик кнопки отправки
  if (sendBtn) {
    const sendHandler = async () => {
      if (!selectedPrivateMatchUser) return;
      
      const canCreate = await ensurePendingInviteLimit(session);
      if (!canCreate) {
        return;
      }

      try {
        // Создаем приватный матч (skipPublish чтобы не публиковать дважды)
        const { payload, matchCreated } = await sendInvite(session, { 
          visibility: "private",
          skipPublish: true // Пропускаем автоматическую публикацию, сделаем вручную
        });
        // Сохраняем статус "pending" при создании матча, чтобы отследить изменение статуса
        if (matchCreated && typeof window !== 'undefined' && payload.matchId) {
          localStorage.setItem(`match_status_${payload.matchId}`, "pending");
        }
        
        // Публикуем cast с упоминанием пользователя (только один раз)
        const { publishInvite } = await import("./farcaster/client.js");
        const mentionText = selectedPrivateMatchUser.username 
          ? `@${selectedPrivateMatchUser.username}` 
          : `FID:${selectedPrivateMatchUser.fid}`;
        
        // Публикуем cast с упоминанием
        const castResult = await publishInvite({
          ...payload,
          text: `🎮 Приватный вызов в Krestiki Noliki! ${mentionText}\n\nMatch ID: ${payload.matchId}\nПримите вызов, чтобы начать игру!`,
          mentions: [selectedPrivateMatchUser.fid]
        });
        
        const msg = lang === "ru"
          ? `Приватный инвайт создан!\n\nMatch ID: ${payload.matchId}\nУпоминание: ${mentionText}\nCast ID: ${castResult.castId || "ok"}\nMatch в API: ${matchCreated ? "да" : "нет"}`
          : `Private invite created!\n\nMatch ID: ${payload.matchId}\nMention: ${mentionText}\nCast ID: ${castResult.castId || "ok"}\nMatch in API: ${matchCreated ? "yes" : "no"}`;
        alert(msg);
        
        // Запускаем проверку pending матчей после создания
        if (mode === "pvp-farcaster") {
          startPendingMatchesCheck(5000);
        }
        
        // Закрываем модальное окно
        if (modal) modal.setAttribute("aria-hidden", "true");
        onResolve();
      } catch (e) {
        let errorMsg = e?.message || e;
        if (errorMsg.includes("2 active matches")) {
          errorMsg = lang === "ru" 
            ? "У вас уже есть 2 активных матча. Завершите один из них, чтобы создать новый."
            : "You already have 2 active matches. Finish one to create a new one.";
        } else {
          errorMsg = lang === "ru" 
            ? `Не удалось создать приватный инвайт: ${errorMsg}`
            : `Failed to create private invite: ${errorMsg}`;
        }
        // Для ошибок превышения лимита матчей используем showAlert (работает в iframe)
        if (errorMsg.includes("2 active matches")) {
          if (typeof window !== 'undefined' && window.showAlert) {
            window.showAlert(errorMsg);
          } else {
            alert(errorMsg); // Fallback
          }
        } else {
          // Для других ошибок используем showToast
          if (typeof window !== 'undefined' && window.showToast) {
            window.showToast(errorMsg, "error");
          } else {
            alert(errorMsg); // Fallback для старых браузеров
  }
        }
      } finally {
        // Включаем кнопку обратно
        if (sendBtn) sendBtn.disabled = false;
      }
    };
    // Сохраняем и навешиваем единичный обработчик клика
    sendBtn._clickHandler = sendHandler;
    sendBtn.addEventListener("click", sendHandler);
  }
  
  // Обработчик кнопки отмены
  if (cancelBtn) {
    const cancelHandler = () => {
      if (modal) modal.setAttribute("aria-hidden", "true");
      onResolve();
    };
    // Сохраняем и навешиваем единичный обработчик клика
    cancelBtn._clickHandler = cancelHandler;
    cancelBtn.addEventListener("click", cancelHandler);
  }
  
  // Удаляем старый обработчик backdrop
  // Удаляем старый обработчик backdrop (если был сохранен)
  if (modal && modal._backdropHandler) {
    modal.removeEventListener("click", modal._backdropHandler);
  }
  
  // Закрытие при клике на backdrop
  const backdropHandler = (e) => {
    if (e.target === modal) {
      modal.setAttribute("aria-hidden", "true");
      onResolve();
    }
  };
  // Сохраняем и навешиваем единичный обработчик клика по backdrop
  modal._backdropHandler = backdropHandler;
  modal.addEventListener("click", backdropHandler);
  
  // Обработчик кнопки закрытия модального окна
  const closeBtn = modal.querySelector(".modal-close");
  if (closeBtn) {
    const closeHandler = () => {
      modal.setAttribute("aria-hidden", "true");
      onResolve();
    };
    closeBtn.addEventListener("click", closeHandler);
  }
  
  // Фокус на поле ввода
  if (usernameInput) {
    setTimeout(() => usernameInput.focus(), 100);
  }
}

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
    inviteBtn.textContent = lang === "ru" ? "Начать PVP" : "Start PVP";
  }
  
  if (matchesBtn) {
    matchesBtn.textContent = lang === "ru" ? "Мои матчи" : "My Matches";
  }
  
  if (leaderboardBtn) {
    leaderboardBtn.textContent = lang === "ru" ? "Таблица лидеров" : "Leaderboard";
  }
  
  if (leaderboardModal) {
    const title = leaderboardModal.querySelector("#leaderboard-modal-title");
    if (title) {
      title.textContent = lang === "ru" ? "Таблица лидеров" : "Leaderboard";
    }
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
      const matches = await getMatchesSnapshot({
        reason: "initial_load",
        forceFetch: true
      });
      const activeMatch = matches.find(m => m.status === "active" && !m.gameState.finished);
      if (activeMatch) {
        await loadMatch(activeMatch.matchId);
        updateMatchUI();
      } else {
        // Если нет активного матча, запускаем проверку pending матчей
        startPendingMatchesCheck(5000);
      }
    } catch (error) {
      // Silent fail - match loading is optional
      // Но все равно запускаем проверку pending матчей
      startPendingMatchesCheck(5000);
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
            if (isMiniAppEnv) {
              try {
                const user = await farcasterSDK.getUser();
                
                if (!user || !user.fid) {
                  return;
                }
                
                // Согласно документации: sdk.context.user содержит { fid, username, displayName, pfpUrl, ... }
                // Используем данные из SDK напрямую - это основной источник данных с аватаром
                // SDK возвращает: { fid, username, displayName, pfpUrl, ... }
                // Согласно документации: pfpUrl (camelCase) - это правильное поле из sdk.context.user
                const pfpUrl = user.pfpUrl || null;
                
                if (DEBUG_ENABLED) {
                  addDebugLog('📦 Авто-авторизация: данные из SDK', { 
                    fid: user.fid,
                    username: user.username,
                    displayName: user.displayName,
                    pfpUrl: pfpUrl,
                    allKeys: Object.keys(user)
                  });
                }
                
                const farcasterProfile = {
                  fid: user.fid,
                  username: user.username || user.displayName || `user_${user.fid}`,
                  display_name: user.displayName || user.username || `User ${user.fid}`,
                  pfp_url: pfpUrl  // Сохраняем pfpUrl из SDK как pfp_url для единообразия
                };
                
                const session = getSession() || {};
                const updatedSession = {
                  ...session,
                  farcaster: farcasterProfile,
                  miniapp: true,
                  issuedAt: new Date().toISOString()
                };
                
                localStorage.setItem("fc_session", JSON.stringify(updatedSession));
                
                if (DEBUG_ENABLED) {
                  addDebugLog('✅ Авто-авторизация: сессия сохранена', { 
                    fid: farcasterProfile.fid,
                    username: farcasterProfile.username,
                    pfp_url: farcasterProfile.pfp_url
                  });
                }
                
                // Убираем флаг автоматической авторизации
                localStorage.removeItem('auto_auth_started');
                
                refreshUserLabel();
                
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
