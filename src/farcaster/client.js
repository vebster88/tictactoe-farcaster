import axios from "axios";

const NEYNAR_API_KEY = import.meta.env.VITE_NEYNAR_API_KEY;
const NEYNAR_SIGNER_UUID = import.meta.env.VITE_NEYNAR_SIGNER_UUID;
const NEYNAR_BASE_URL = "https://api.neynar.com/v2";

function isMock() {
  const mockMode = import.meta.env.VITE_FARCASTER_MOCK === "true";
  const noApiKey = !NEYNAR_API_KEY || NEYNAR_API_KEY === "your_neynar_api_key_here";
  const noSigner = !NEYNAR_SIGNER_UUID || NEYNAR_SIGNER_UUID === "your_signer_uuid_here";
  const isMockMode = mockMode || noApiKey || noSigner;
  
  console.log("Farcaster mode check:", {
    VITE_FARCASTER_MOCK: import.meta.env.VITE_FARCASTER_MOCK,
    NEYNAR_API_KEY: NEYNAR_API_KEY ? "***" + NEYNAR_API_KEY.slice(-4) : "undefined",
    NEYNAR_SIGNER_UUID: NEYNAR_SIGNER_UUID ? "***" + NEYNAR_SIGNER_UUID.slice(-4) : "undefined",
    mockMode,
    noApiKey,
    noSigner,
    isMockMode
  });
  
  return isMockMode;
}

// Получить профиль пользователя по Ethereum адресу
export async function getUserByAddress(address) {
  if (isMock()) {
    return {
      schemaVersion: "1.0.0",
      user: {
        fid: 12345,
        username: "vebster88",
        display_name: "Vebster88",
        pfp_url: "https://example.com/avatar.jpg",
        verified_addresses: { eth_addresses: [address] }
      }
    };
  }

  try {
    const response = await axios.get(`${NEYNAR_BASE_URL}/farcaster/user/bulk-by-address`, {
      params: { addresses: address },
      headers: { 'api_key': NEYNAR_API_KEY }
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching user:", error);
    if (error.response?.status === 401) {
      throw new Error("Неверный API ключ Neynar. Проверьте настройки в .env.local файле.");
    } else if (error.response?.status === 403) {
      throw new Error("API ключ Neynar не имеет доступа к этому эндпоинту.");
    } else if (error.response?.status === 429) {
      throw new Error("Превышен лимит запросов к API Neynar. Попробуйте позже.");
    } else {
      throw new Error(`Не удалось получить профиль пользователя: ${error.message}`);
    }
  }
}

// Публикация инвайта
export async function publishInvite(invitePayload) {
  if (isMock()) {
    return {
      schemaVersion: "1.0.0",
      status: "mock_ok",
      castId: "mock-cast-" + Math.random().toString(36).slice(2)
    };
  }

  try {
    const response = await axios.post(`${NEYNAR_BASE_URL}/farcaster/cast`, {
      signer_uuid: NEYNAR_SIGNER_UUID,
      text: `🎮 Приглашение в игру Krestiki Noliki!\n\nMatch ID: ${invitePayload.matchId}\nПравила: ${JSON.stringify(invitePayload.rules)}\nВидимость: ${invitePayload.visibility}`,
      embeds: [{
        url: window.location.origin
      }]
    }, {
      headers: { 
        'api_key': NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    return {
      schemaVersion: "1.0.0",
      status: "ok",
      castId: response.data.cast.hash
    };
  } catch (error) {
    console.error("Error publishing invite:", error);
    throw new Error("Не удалось опубликовать инвайт");
  }
}

// Чтение ответов по треду
export async function listThreadReplies(castId) {
  if (isMock()) {
    return {
      schemaVersion: "1.0.0",
      replies: []
    };
  }

  try {
    const response = await axios.get(`${NEYNAR_BASE_URL}/farcaster/feed/cast`, {
      params: { 
        identifier: castId,
        type: "cast_id"
      },
      headers: { 'api_key': NEYNAR_API_KEY }
    });
    
    return {
      schemaVersion: "1.0.0",
      replies: response.data.cast.replies || []
    };
  } catch (error) {
    console.error("Error fetching replies:", error);
    throw new Error("Не удалось получить ответы");
  }
}

// Публикация результата матча
export async function publishMatchResult(resultPayload) {
  if (isMock()) {
    return {
      schemaVersion: "1.0.0",
      status: "mock_ok",
      castId: "mock-result-" + Math.random().toString(36).slice(2)
    };
  }

  try {
    const winnerText = resultPayload.winner ? `Победитель: ${resultPayload.winner}` : "Ничья";
    const text = `🏆 Результат матча Krestiki Noliki!\n\n${winnerText}\nХодов: ${resultPayload.movesCount}\nДлительность: ${Math.round(resultPayload.durationMs / 1000)}с\nMatch ID: ${resultPayload.matchId}`;
    
    const response = await axios.post(`${NEYNAR_BASE_URL}/farcaster/cast`, {
      signer_uuid: NEYNAR_SIGNER_UUID,
      text,
      embeds: [{
        url: window.location.origin
      }]
    }, {
      headers: { 
        'api_key': NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    return {
      schemaVersion: "1.0.0",
      status: "ok",
      castId: response.data.cast.hash
    };
  } catch (error) {
    console.error("Error publishing result:", error);
    throw new Error("Не удалось опубликовать результат");
  }
}
