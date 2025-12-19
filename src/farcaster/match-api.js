// Match API client for PvP games
const API_BASE = window.location.origin;

export async function createMatch(matchData) {
  try {
    const response = await fetch(`${API_BASE}/api/matches/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(matchData),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to create match: ${error.message}`);
  }
}

export async function getMatch(matchId) {
  try {
    const response = await fetch(`${API_BASE}/api/matches/get?matchId=${encodeURIComponent(matchId)}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to get match: ${error.message}`);
  }
}

export async function acceptMatch(matchId, player2Fid) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-api.js:40',message:'acceptMatch ENTRY',data:{matchId,player2Fid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  try {
    const response = await fetch(`${API_BASE}/api/matches/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ matchId, player2Fid }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-api.js:51',message:'acceptMatch ERROR',data:{status:response.status,error:error.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-api.js:55',message:'acceptMatch SUCCESS',data:{matchId:result.matchId,status:result.status,player2Fid:result.player2Fid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    return result;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aa195bad-e175-4436-bb06-face0b1b4e27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'match-api.js:57',message:'acceptMatch EXCEPTION',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    throw new Error(`Failed to accept match: ${error.message}`);
  }
}

export async function sendMove(matchId, playerFid, cellIndex) {
  try {
    const response = await fetch(`${API_BASE}/api/matches/move`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ matchId, playerFid, cellIndex }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to send move: ${error.message}`);
  }
}

export async function listPlayerMatches(fid) {
  try {
    const response = await fetch(`${API_BASE}/api/matches/list?fid=${encodeURIComponent(fid)}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to list player matches: ${error.message}`);
  }
}

export async function checkMatchTimeouts(fid) {
  if (fid === undefined || fid === null) {
    throw new Error("fid is required to check match timeouts");
  }

  try {
    const response = await fetch(`${API_BASE}/api/matches/check-timeouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fid }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to check match timeouts: ${error.message}`);
  }
}

