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
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
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

