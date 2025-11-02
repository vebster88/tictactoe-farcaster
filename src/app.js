import { createInitialState } from "./game/state.js";
import { applyMove } from "./game/engine.js";
import { pickRandomMove } from "./ai/random.js";
import { bestMoveMinimax } from "./ai/minimax.js";
import { getSession, signInWithWallet, signOut } from "./farcaster/auth.js";
import { sendInvite } from "./farcaster/matchmaking.js";
import { listThreadReplies, publishMatchResult } from "./farcaster/client.js";
import { createSignedKey } from "./farcaster/signer.js";
import { farcasterSDK } from "./farcaster/sdk.js";
import { AUTHORIZED_DEVELOPERS, DEV_SECRET_CODE, DEV_CONFIG, isAuthorizedDeveloper, getDeveloperInfo } from "./config/developers.js";
import { APP_VERSION } from "./version.js";

// Debug logging disabled - use browser console for debugging
function addDebugLog(message, data = null) {
  // Silent - no logging
}

// Now we can safely use addDebugLog
const root = document.body;
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const themeBtn = document.getElementById("btn-theme");
const devToggleBtn = document.getElementById("btn-dev-toggle");
const newBtn = document.getElementById("btn-new");
const modeSel = document.getElementById("mode");
const langSel = document.getElementById("lang");
const authBtn = document.getElementById("btn-auth");
const userLabel = document.getElementById("user-label");
const createSignerBtn = document.getElementById("btn-create-signer");
const checkRepliesBtn = document.getElementById("btn-check-replies");
const inviteBtn = document.getElementById("btn-invite");
const publishBtn = document.getElementById("btn-publish-result");
const cells = [...boardEl.querySelectorAll(".cell")];

let state = createInitialState();
let scores = { X: 0, O: 0, draw: 0 };
let mode = modeSel?.value || "pve-easy";
let botThinking = false;

function setTheme(next) {
  root.setAttribute("data-theme", next);
  themeBtn?.setAttribute("aria-pressed", String(next === "dark"));
  localStorage.setItem("theme", next);
}
function toggleTheme() {
  const current = root.getAttribute("data-theme") || "light";
  setTheme(current === "light" ? "dark" : "light");
}
function t(_key, dict) {
  return langSel?.value === "ru" ? dict.ru : dict.en;
}
function showStatus(msg) { statusEl.textContent = msg; }

function render() {
  cells.forEach((btn, i) => {
    const v = state.board[i];
    btn.textContent = v ? v : "";
    btn.setAttribute("aria-label", v ? v : (langSel?.value === "ru" ? "Пусто" : "Empty"));
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

themeBtn?.addEventListener("click", toggleTheme);
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
modeSel?.addEventListener("change", () => { 
  mode = modeSel.value; 
  resetBoard(true); 
  updateUIForMode();
});
langSel?.addEventListener("change", () => render());

boardEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".cell");
  if (!btn) return;
  const idx = Number(btn.dataset.cell);
  handleMove(idx);
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
      userLabel.textContent = "Авторизован";
    }
    
    authBtn.textContent = "Выйти";
    authBtn.dataset.signedIn = "true";
  } else {
    userLabel.textContent = "";
    authBtn.textContent = "Войти";
    authBtn.dataset.signedIn = "false";
  }
  
  updateUIForMode();
}

function updateUIForMode() {
  const isFarcasterMode = mode === "pvp-farcaster";
  const isSignedIn = authBtn?.dataset.signedIn === "true";
  const devMode = localStorage.getItem("dev-mode") === "true";
  const isAuthorizedDev = checkDevAccess();
  
  // Показываем Farcaster кнопки только в Farcaster режиме
  if (inviteBtn) {
    inviteBtn.style.display = isFarcasterMode && isSignedIn ? "inline-block" : "none";
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
  addDebugLog('🖱️ Кнопка "Войти" нажата');
  addDebugLog('📋 Состояние кнопки', {
    signedIn: authBtn.dataset.signedIn,
    text: authBtn.textContent,
    exists: !!authBtn
  });
  
  if (authBtn.dataset.signedIn === "true") {
    addDebugLog('🚪 Выход из системы...');
    
    const session = getSession();
    const username = session?.farcaster?.username || session?.address?.slice(0, 6) || 'пользователь';
    
    signOut();
    refreshUserLabel();
    
    addDebugLog('✅ Выход выполнен', { username });
    alert(`👋 Вы вышли из аккаунта\n\n${username}`);
    return;
  }
  
  addDebugLog('🔍 Начинаем процесс авторизации...');
  
  // В Mini App используем SDK, а не кошелек
  // Проверяем окружение сначала (не зависит от загрузки SDK)
  const isMiniAppEnv = farcasterSDK.checkMiniAppEnvironment();
  addDebugLog('🌍 Проверка Mini App окружения', { result: isMiniAppEnv });
  
  if (isMiniAppEnv) {
    addDebugLog('🔍 Пытаемся авторизоваться через Farcaster Mini App...');
    addDebugLog('📊 Проверка окружения', {
      windowFarcaster: !!window.farcaster,
      parentWindow: window.parent !== window,
      referrer: document.referrer,
      location: window.location.href
    });
    
    try {
      addDebugLog('👤 Запрос пользователя через SDK...');
      // Пытаемся получить пользователя через SDK
      const user = await farcasterSDK.getUser();
      addDebugLog('👤 SDK.getUser() результат', user);
      
      if (!user || !user.fid) {
        throw new Error('SDK не вернул данные пользователя (user.fid отсутствует)');
      }
      
      const backendOrigin = window.location.origin;
      addDebugLog('🌐 Backend origin', backendOrigin);
      
      // Пытаемся получить полные данные через Quick Auth
      addDebugLog('🔐 Начинаем Quick Auth...');
      let fullUserData = null;
      try {
        fullUserData = await farcasterSDK.getUserWithQuickAuth(backendOrigin);
        addDebugLog('✅ Quick Auth успешен!', fullUserData);
      } catch (error) {
        addDebugLog('❌ Quick Auth ошибка', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        // Не используем fallback - если Quick Auth не работает, это проблема
        throw new Error(`Quick Auth недоступен: ${error.message}`);
      }
      
      if (!fullUserData || !fullUserData.fid) {
        throw new Error('Quick Auth не вернул данные пользователя');
      }
      
      // Quick Auth возвращает: { fid, username, displayName, pfp, ... }
      // Маппим в наш формат: { fid, username, display_name, pfp_url }
      const farcasterProfile = {
        fid: fullUserData.fid,
        username: fullUserData.username || fullUserData.displayName || `user_${fullUserData.fid}`,
        display_name: fullUserData.displayName || fullUserData.username || `User ${fullUserData.fid}`,
        pfp_url: fullUserData.pfp || fullUserData.pfpUrl || fullUserData.pfp_url || null
      };
      
      addDebugLog('🔍 Quick Auth данные до маппинга', fullUserData);
      
      addDebugLog('👤 Создаём профиль пользователя', farcasterProfile);
      
      const session = {
        schemaVersion: "1.0.0",
        farcaster: farcasterProfile,
        miniapp: true,
        issuedAt: new Date().toISOString()
      };
      
      localStorage.setItem("fc_session", JSON.stringify(session));
      
      // Обновляем UI перед показом alert
      refreshUserLabel();
      
      addDebugLog('✅ Farcaster Mini App пользователь авторизован!', farcasterProfile);
      addDebugLog('👤 Имя пользователя должно отображаться', { 
        username: farcasterProfile.username,
        display_name: farcasterProfile.display_name,
        fid: farcasterProfile.fid
      });
      
      // Показываем успех
      alert(`✅ Успешная авторизация!\n\n@${farcasterProfile.username}\nFID: ${farcasterProfile.fid}`);
      return;
      
    } catch (error) {
      addDebugLog('❌ Ошибка авторизации Mini App', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        cause: error.cause
      });
      
      // Показываем пользователю детальную ошибку
      const errorMsg = `Не удалось подключиться к Farcaster:\n\n${error.message}\n\nПроверьте debug panel внизу справа.`;
      alert(errorMsg);
      
      // НЕ используем кошелек как fallback в Mini App - это ошибка конфигурации
      addDebugLog('🚫 Не используем кошелек как fallback в Mini App');
      return;
    }
  }
  
  // Для обычного браузера используем кошелек
  addDebugLog('💼 Не Mini App окружение, пробуем авторизацию через кошелек...');
  try { 
    await signInWithWallet(); 
    addDebugLog('✅ Авторизация через кошелек успешна');
  } catch (e) { 
    addDebugLog('❌ Ошибка авторизации через кошелек', {
      message: e?.message || String(e),
      stack: e?.stack
    }); 
    alert("Не удалось войти: " + (e?.message || e)); 
  } finally { 
    refreshUserLabel(); 
  }
});

inviteBtn?.addEventListener("click", async () => {
  if (mode !== "pvp-farcaster") {
    alert("Выберите режим: PvP — Farcaster");
    return;
  }
  const session = getSession();
  if (!session?.address) {
    alert("Сначала войдите через кошелёк.");
    return;
  }
  const visibility = confirm("Публиковать публично? OK — public, Cancel — private") ? "public" : "private";
  try {
    const { payload, res } = await sendInvite(session, { visibility });
    console.log("invite payload:", payload, "result:", res);
    alert("Инвайт создан (мок): " + (res.castId || "ok") + "\nmatchId: " + payload.matchId);
  } catch (e) {
    console.error(e);
    alert("Не удалось создать инвайт: " + (e?.message || e));
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

setTheme(localStorage.getItem("theme") || "light");

// Инициализируем dev режим
const devMode = localStorage.getItem("dev-mode") === "true";
if (devToggleBtn) {
  devToggleBtn.setAttribute("aria-pressed", devMode.toString());
  devToggleBtn.title = devMode ? "Выключить режим разработчика" : "Включить режим разработчика";
}

// Display app version
const versionEl = document.getElementById('app-version');
if (versionEl) {
  versionEl.textContent = `v${APP_VERSION}`;
  versionEl.title = `Версия приложения: v${APP_VERSION}`;
}

render();
refreshUserLabel();

// Инициализация Farcaster Mini App SDK
// Following official documentation: https://miniapps.farcaster.xyz/docs/getting-started
// After your app is fully loaded and ready to display: await sdk.actions.ready()
// Pattern from working React example: call ready() after UI initialization (like useEffect)
// CRITICAL: ready() MUST be called to hide splash screen, even if there are errors

        (async () => {
          try {
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
