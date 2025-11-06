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
  try {
    const match = await getMatch(matchId);
    setCurrentMatch(matchId, match);
    // Сохраняем статус для отслеживания изменений
    if (typeof window !== 'undefined' && match) {
      localStorage.setItem(`match_status_${matchId}`, match.status || "unknown");
    }
    return match;
  } catch (error) {
    throw new Error(`Failed to load match: ${error.message}`);
  }
}

export async function syncMatch() {
  if (!currentMatchId) return null;

  try {
    const match = await getMatch(currentMatchId);
    if (!match) {
      // Match was deleted or doesn't exist
      clearCurrentMatch();
      return null;
    }
    
    const wasFinished = currentMatchState?.gameState?.finished;
    const isNowFinished = match.gameState.finished;
    const wasMyTurn = isMyTurn();
    
    setCurrentMatch(currentMatchId, match);
    
    // Return info about what changed
    return {
      match,
      newMove: !wasFinished && match.gameState.turn > (currentMatchState?.gameState?.turn || 0),
      finished: !wasFinished && isNowFinished,
      turnChanged: wasMyTurn !== isMyTurn()
    };
  } catch (error) {
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
  stopSyncing();
  
  // Immediate sync on start
  syncMatch().then(result => {
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

