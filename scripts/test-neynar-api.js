#!/usr/bin/env node
/**
 * Тестовый скрипт для проверки Neynar API
 * Использование: node scripts/test-neynar-api.js <FID>
 * Пример: node scripts/test-neynar-api.js 26081
 */

import axios from "axios";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const NEYNAR_API_KEY = process.env.VITE_NEYNAR_API_KEY;
const NEYNAR_BASE_URL = "https://api.neynar.com/v2";

async function testNeynarAPI(fid) {
  console.log("=".repeat(60));
  console.log("Тест Neynar API");
  console.log("=".repeat(60));
  console.log(`FID для проверки: ${fid}`);
  console.log(`API URL: ${NEYNAR_BASE_URL}/farcaster/user/bulk`);
  console.log(`API Key установлен: ${!!NEYNAR_API_KEY}`);
  if (NEYNAR_API_KEY) {
    console.log(`API Key preview: ${NEYNAR_API_KEY.substring(0, 10)}...${NEYNAR_API_KEY.slice(-4)}`);
  }
  console.log("");

  if (!NEYNAR_API_KEY || NEYNAR_API_KEY === "your_neynar_api_key_here") {
    console.error("❌ ОШИБКА: NEYNAR_API_KEY не установлен или имеет значение по умолчанию");
    console.log("Установите VITE_NEYNAR_API_KEY в файле .env.local");
    process.exit(1);
  }

  try {
    console.log("Отправка запроса к Neynar API...");
    const response = await axios.get(`${NEYNAR_BASE_URL}/farcaster/user/bulk`, {
      params: { fids: fid },
      headers: { 'api_key': NEYNAR_API_KEY }
    });

    console.log("");
    console.log("✅ Успешный ответ от API");
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log("");

    if (response.data?.users && response.data.users.length > 0) {
      const user = response.data.users[0];
      console.log("📋 Данные пользователя:");
      console.log("-".repeat(60));
      console.log(`FID: ${user.fid}`);
      console.log(`Username: ${user.username || "❌ отсутствует"}`);
      console.log(`Display Name: ${user.display_name || user.displayName || "❌ отсутствует"}`);
      console.log(`pfp_url: ${user.pfp_url || "❌ отсутствует"}`);
      console.log(`pfpUrl: ${user.pfpUrl || "❌ отсутствует"}`);
      console.log(`pfp: ${user.pfp || "❌ отсутствует"}`);
      console.log("");

      // Проверяем вложенные объекты
      if (user.profile) {
        console.log("📦 Объект profile найден:");
        console.log(`  pfp_url: ${user.profile.pfp_url || "❌ отсутствует"}`);
        console.log(`  pfpUrl: ${user.profile.pfpUrl || "❌ отсутствует"}`);
        console.log("");
      }

      // Показываем все ключи объекта user
      console.log("🔑 Все ключи объекта user:");
      console.log(Object.keys(user).join(", "));
      console.log("");

      // Показываем полную структуру (первые 500 символов)
      console.log("📄 Полная структура ответа (первые 500 символов):");
      console.log(JSON.stringify(user, null, 2).substring(0, 500));
      console.log("");

      // Проверяем наличие необходимых полей
      const hasUsername = !!user.username;
      const hasPfp = !!(user.pfp_url || user.pfpUrl || user.pfp || (user.profile && (user.profile.pfp_url || user.profile.pfpUrl)));

      console.log("=".repeat(60));
      console.log("РЕЗУЛЬТАТ ПРОВЕРКИ:");
      console.log("=".repeat(60));
      console.log(`Username найден: ${hasUsername ? "✅ ДА" : "❌ НЕТ"}`);
      console.log(`PFP найден: ${hasPfp ? "✅ ДА" : "❌ НЕТ"}`);
      
      if (hasUsername && hasPfp) {
        console.log("");
        console.log("✅ Все необходимые данные доступны!");
      } else {
        console.log("");
        console.log("⚠️  Некоторые данные отсутствуют. Проверьте структуру ответа выше.");
      }
    } else {
      console.log("❌ Пользователь не найден в ответе API");
      console.log("Структура ответа:", JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.error("");
    console.error("❌ ОШИБКА при запросе к API:");
    console.error("-".repeat(60));
    
    if (error.response) {
      console.error(`Status: ${error.response.status} ${error.response.statusText}`);
      console.error(`Data:`, JSON.stringify(error.response.data, null, 2));
      console.error(`Headers:`, error.response.headers);
    } else if (error.request) {
      console.error("Запрос был отправлен, но ответа не получено");
      console.error("Request:", error.request);
    } else {
      console.error("Ошибка при настройке запроса:", error.message);
    }
    
    process.exit(1);
  }
}

// Получаем FID из аргументов командной строки
const fid = process.argv[2];

if (!fid) {
  console.error("❌ Ошибка: Не указан FID");
  console.log("");
  console.log("Использование: node scripts/test-neynar-api.js <FID>");
  console.log("Пример: node scripts/test-neynar-api.js 26081");
  process.exit(1);
}

const fidNumber = parseInt(fid, 10);
if (isNaN(fidNumber)) {
  console.error(`❌ Ошибка: "${fid}" не является валидным числом`);
  process.exit(1);
}

testNeynarAPI(fidNumber)
  .then(() => {
    console.log("");
    console.log("Тест завершен.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Критическая ошибка:", error);
    process.exit(1);
  });

