#!/usr/bin/env node

// Скрипт для проверки конфигурации Farcaster API
import { config } from 'dotenv';
import axios from 'axios';

// Загружаем переменные окружения из .env.local, затем .env
config({ path: '.env.local' });
config();

const NEYNAR_API_KEY = process.env.VITE_NEYNAR_API_KEY;
const VITE_FARCASTER_MOCK = process.env.VITE_FARCASTER_MOCK;

console.log('🔍 Проверка конфигурации Farcaster API...\n');

console.log('📋 Переменные окружения:');
console.log(`  NEYNAR_API_KEY: ${NEYNAR_API_KEY ? '***' + NEYNAR_API_KEY.slice(-4) : 'НЕ УСТАНОВЛЕН'}`);
console.log(`  VITE_FARCASTER_MOCK: ${VITE_FARCASTER_MOCK || 'НЕ УСТАНОВЛЕН'}`);

if (!NEYNAR_API_KEY || NEYNAR_API_KEY === 'your_neynar_api_key_here') {
  console.log('\n❌ Проблема: API ключ Neynar не настроен!');
  console.log('📝 Инструкции:');
  console.log('  1. Получите API ключ на https://neynar.com');
  console.log('  2. Создайте файл .env.local в корне проекта');
  console.log('  3. Добавьте: VITE_NEYNAR_API_KEY=ваш_ключ_здесь');
  console.log('  4. Перезапустите приложение');
  process.exit(1);
}

if (VITE_FARCASTER_MOCK === 'true') {
  console.log('\n⚠️  Внимание: Включен mock режим');
  console.log('   Для использования реального API установите VITE_FARCASTER_MOCK=false');
}

// Тестируем API
console.log('\n🧪 Тестирование API...');
try {
  const response = await axios.get('https://api.neynar.com/v2/farcaster/user/bulk-by-address', {
    params: { addresses: '0x0000000000000000000000000000000000000000' },
    headers: { 'api_key': NEYNAR_API_KEY }
  });
  
  console.log('✅ API ключ работает корректно');
  console.log(`   Статус: ${response.status}`);
} catch (error) {
  console.log('❌ Ошибка при тестировании API:');
  if (error.response?.status === 401) {
    console.log('   Неверный API ключ');
  } else if (error.response?.status === 403) {
    console.log('   API ключ не имеет доступа к эндпоинту');
  } else {
    console.log(`   ${error.message}`);
  }
  process.exit(1);
}

console.log('\n🎉 Конфигурация корректна!');
