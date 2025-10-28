import axios from "axios";

const NEYNAR_API_KEY = import.meta.env.VITE_NEYNAR_API_KEY;
const NEYNAR_BASE_URL = "https://api.neynar.com/v2";

// Генерация Ed25519 ключевой пары
export function generateKeyPair() {
  // В реальном приложении используйте криптографическую библиотеку
  // Для демонстрации генерируем случайные ключи
  const publicKey = "0x" + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const privateKey = "0x" + Array.from({length: 128}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  
  return { publicKey, privateKey };
}

// Создание mock signed key для тестирования
export function createMockSignedKey(appFid, redirectUrl = null) {
  const { publicKey, privateKey } = generateKeyPair();
  const signerUuid = "mock-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  
  console.log("Создание mock signed key:", {
    appFid,
    signerUuid,
    publicKey: publicKey.slice(0, 10) + "..."
  });
  
  return {
    success: true,
    data: {
      signer_uuid: signerUuid,
      public_key: publicKey,
      status: "approved", // В mock режиме сразу одобрен
      signer_approval_url: redirectUrl || "http://localhost:5173",
      fid: appFid,
      permissions: ["WRITE_ALL"]
    },
    publicKey,
    privateKey
  };
}

// Создание подписи (упрощенная версия)
export function createSignature(data, privateKey) {
  // В реальном приложении используйте правильную криптографию
  // Для демонстрации создаем "подпись"
  const signature = "0x" + Array.from({length: 128}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return signature;
}

// Создание signed key через Neynar API
export async function createSignedKey(appFid, redirectUrl = null) {
  // Проверяем, включен ли mock режим
  if (import.meta.env.VITE_FARCASTER_MOCK === "true") {
    return createMockSignedKey(appFid, redirectUrl);
  }
  
  if (!NEYNAR_API_KEY) {
    throw new Error("API ключ Neynar не настроен");
  }

  try {
    // Генерируем ключевую пару
    const { publicKey, privateKey } = generateKeyPair();
    
    // Создаем данные для подписи
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 час
    const dataToSign = {
      app_fid: appFid,
      deadline: deadline,
      public_key: publicKey
    };
    
    // Создаем подпись (упрощенная версия)
    const signature = createSignature(dataToSign, privateKey);
    
    // Формируем запрос согласно документации Neynar
    const requestBody = {
      signer_uuid: "temp-" + Date.now(), // Временный UUID, будет заменен в ответе
      signature: signature,
      app_fid: appFid,
      deadline: deadline
    };
    
    if (redirectUrl) {
      requestBody.redirect_url = redirectUrl;
    }
    
    console.log("Создание signed key:", {
      appFid,
      publicKey: publicKey.slice(0, 10) + "...",
      deadline
    });
    
    // Отправляем запрос
    const response = await axios.post(
      `${NEYNAR_BASE_URL}/farcaster/signer/signed_key/`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': NEYNAR_API_KEY
        }
      }
    );
    
    return {
      success: true,
      data: response.data,
      publicKey,
      privateKey // В реальном приложении не возвращайте приватный ключ!
    };
    
  } catch (error) {
    console.error("Ошибка создания signed key:", error);
    throw new Error(`Не удалось создать signed key: ${error.message}`);
  }
}

// Получение информации о signer'е
export async function getSignerInfo(signerUuid) {
  if (!NEYNAR_API_KEY) {
    throw new Error("API ключ Neynar не настроен");
  }

  try {
    const response = await axios.get(
      `${NEYNAR_BASE_URL}/farcaster/signer/${signerUuid}`,
      {
        headers: {
          'x-api-key': NEYNAR_API_KEY
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error("Ошибка получения информации о signer:", error);
    throw new Error(`Не удалось получить информацию о signer: ${error.message}`);
  }
}

// Список всех signer'ов приложения
export async function listSigners(appFid) {
  if (!NEYNAR_API_KEY) {
    throw new Error("API ключ Neynar не настроен");
  }

  try {
    const response = await axios.get(
      `${NEYNAR_BASE_URL}/farcaster/signer/app/${appFid}`,
      {
        headers: {
          'x-api-key': NEYNAR_API_KEY
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error("Ошибка получения списка signer'ов:", error);
    throw new Error(`Не удалось получить список signer'ов: ${error.message}`);
  }
}
