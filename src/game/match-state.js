// Match state management for PvP games
import { getMatch, sendMove } from "../farcaster/match-api.js";

function getSession() {
  try {
    const sessionStr = localStorage.getItem("fc_session");
    return sessionStr ? JSON.parse(sessionStr) : null;
  } catch {
    return null;
  }
}

let currentMatchId = null;
let currentMatchState = null;
let playerFid = null;
let syncInterval = null;

// Export syncInterval getter for checking if syncing is active
export function getSyncInterval() {
  return syncInterval;
}

export function setCurrentMatch(matchId, matchState) {
  currentMatchId = matchId;
  currentMatchState = matchState;
  const session = getSession();
  playerFid = session?.farcaster?.fid || session?.fid;
}

export function getCurrentMatch() {
  return {
    matchId: currentMatchId,
    matchState: currentMatchState,
    playerFid
  };
}

export function clearCurrentMatch() {
  currentMatchId = null;
  currentMatchState = null;
  stopSyncing();
}

export async function loadMatch(matchId) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-state.js:44',message:'loadMatch ENTRY',data:{matchId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  try {
    const match = await getMatch(matchId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-state.js:46',message:'loadMatch - match loaded',data:{matchId,matchStatus:match?.status,player1Fid:match?.player1Fid,player2Fid:match?.player2Fid,finished:match?.gameState?.finished},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    setCurrentMatch(matchId, match);
    // Сохраняем статус для отслеживания изменений
    if (typeof window !== 'undefined' && match) {
      localStorage.setItem(`match_status_${matchId}`, match.status || "unknown");
    }
    return match;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-state.js:54',message:'loadMatch ERROR',data:{matchId,error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    throw new Error(`Failed to load match: ${error.message}`);
  }
}

export async function syncMatch() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-state.js:58',message:'syncMatch ENTRY',data:{currentMatchId,hasCurrentState:!!currentMatchState},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  if (!currentMatchId) return null;

  try {
    const match = await getMatch(currentMatchId);
    if (!match) {
      // Match was deleted or doesn't exist
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-state.js:64',message:'syncMatch - match not found',data:{currentMatchId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      clearCurrentMatch();
      return null;
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-state.js:85',message:'syncMatch - match from server',data:{matchId:match.matchId||match.id||currentMatchId,status:match.status,oldStatus:currentMatchState?.status,finished:match.gameState?.finished,hasMatchId:!!match.matchId,hasId:!!match.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    const wasFinished = currentMatchState?.gameState?.finished;
    const isNowFinished = match.gameState.finished;
    const wasMyTurn = isMyTurn();
    const oldTurn = currentMatchState?.gameState?.turn || 0;
    const newTurn = match.gameState.turn;
    
    setCurrentMatch(currentMatchId, match);
    
    // Return info about what changed
    const result = {
      match,
      newMove: !wasFinished && newTurn > oldTurn,
      finished: !wasFinished && isNowFinished,
      turnChanged: wasMyTurn !== isMyTurn()
    };
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-state.js:78',message:'syncMatch - result',data:{matchId:currentMatchId,newMove:result.newMove,finished:result.finished,turnChanged:result.turnChanged,oldTurn,newTurn},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    return result;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-state.js:83',message:'syncMatch ERROR',data:{currentMatchId,error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    console.error("Failed to sync match:", error);
    return null;
  }
}

export async function handleMove(cellIndex) {
  if (!currentMatchId || !playerFid) {
    throw new Error("No active match");
  }

  try {
    const match = await sendMove(currentMatchId, playerFid, cellIndex);
    setCurrentMatch(currentMatchId, match);
    return match;
  } catch (error) {
    throw new Error(`Failed to make move: ${error.message}`);
  }
}

export function startSyncing(intervalMs = 5000, onUpdate = null) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-state.js:102',message:'startSyncing ENTRY',data:{intervalMs,currentMatchId,hasOnUpdate:!!onUpdate},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  stopSyncing();
  
  // Immediate sync on start
  syncMatch().then(result => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-state.js:106',message:'startSyncing - immediate sync result',data:{hasResult:!!result,newMove:result?.newMove,finished:result?.finished,turnChanged:result?.turnChanged},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (result && onUpdate) {
      onUpdate(result);
    }
    // Dispatch event for UI updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent("match-synced"));
    }
  });
  
  syncInterval = setInterval(async () => {
    const syncResult = await syncMatch();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-state.js:116',message:'startSyncing - periodic sync',data:{hasResult:!!syncResult,newMove:syncResult?.newMove,finished:syncResult?.finished,turnChanged:syncResult?.turnChanged},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (syncResult) {
      // Dispatch event for UI updates
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent("match-synced"));
      }
      
      // If there was a new move or game finished, call callback
      if (syncResult.newMove || syncResult.finished || syncResult.turnChanged) {
        if (onUpdate) {
          onUpdate(syncResult);
        }
      }
    }
  }, intervalMs);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-state.js:131',message:'startSyncing - interval set',data:{intervalMs,hasInterval:!!syncInterval},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
}

export function stopSyncing() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export function isMyTurn() {
  if (!currentMatchState || !playerFid) return false;
  
  const isPlayer1 = currentMatchState.player1Fid === playerFid;
  const mySymbol = isPlayer1 ? currentMatchState.player1Symbol : currentMatchState.player2Symbol;
  
  return currentMatchState.gameState.next === mySymbol && !currentMatchState.gameState.finished;
}

export function getMySymbol() {
  if (!currentMatchState || !playerFid) return null;
  
  const isPlayer1 = currentMatchState.player1Fid === playerFid;
  return isPlayer1 ? currentMatchState.player1Symbol : currentMatchState.player2Symbol;
}

export function getOpponentFid() {
  if (!currentMatchState || !playerFid) return null;
  return currentMatchState.player1Fid === playerFid 
    ? currentMatchState.player2Fid 
    : currentMatchState.player1Fid;
}

