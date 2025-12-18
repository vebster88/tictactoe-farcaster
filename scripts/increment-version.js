#!/usr/bin/env node

/**
 * Скрипт для автоматического увеличения версии приложения
 * Увеличивает patch версию (последняя цифра) на 1
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const versionFile = join(__dirname, '..', 'src', 'version.js');

try {
  // Читаем текущий файл версии
  const content = readFileSync(versionFile, 'utf-8');
  
  // Извлекаем текущую версию
  // Формат версии: 1.096 (major.minor.patch, где minor всегда 0, patch 0-999)
  // Примеры: 1.001 = 1.0.01, 1.010 = 1.0.10, 1.096 = 1.0.96
  const versionMatch = content.match(/export const APP_VERSION = '(\d+)\.(\d+)';/);
  
  if (!versionMatch) {
    console.error('❌ Не удалось найти версию в файле version.js');
    process.exit(1);
  }
  
  const major = parseInt(versionMatch[1], 10);
  const versionStr = versionMatch[2].padStart(3, '0'); // Гарантируем 3 цифры
  
  // Парсим версию: "096" -> minor=0, patch=96
  const minor = parseInt(versionStr[0], 10);
  const patch = parseInt(versionStr.substring(1), 10);
  
  // Увеличиваем patch версию
  const newPatch = patch + 1;
  
  // Проверяем переполнение (patch > 99)
  if (newPatch > 99) {
    console.error('❌ Patch версия превышает 99. Необходимо увеличить minor версию вручную.');
    process.exit(1);
  }
  
  // Форматируем как 1.097 (major.minor.patch с ведущими нулями)
  const newVersion = `${major}.${String(minor * 100 + newPatch).padStart(3, '0')}`;
  
  // Обновляем файл
  const newContent = content.replace(
    /export const APP_VERSION = '\d+\.\d+';/,
    `export const APP_VERSION = '${newVersion}';`
  );
  
  // Обновляем комментарий с текущей версией
  const updatedContent = newContent.replace(
    /\/\/ Current version: \d+\.\d+/,
    `// Current version: ${newVersion}`
  );
  
  writeFileSync(versionFile, updatedContent, 'utf-8');
  
  const oldVersion = versionMatch[0].match(/'([^']+)'/)[1];
  console.log(`✅ Версия обновлена: ${oldVersion} → ${newVersion}`);
  
  // Добавляем файл в staging area
  const { execSync } = await import('child_process');
  try {
    execSync(`git add "${versionFile}"`, { stdio: 'inherit' });
  } catch (error) {
    console.warn('⚠️ Не удалось добавить файл версии в staging area:', error.message);
  }
  
} catch (error) {
  console.error('❌ Ошибка при обновлении версии:', error.message);
  process.exit(1);
}

