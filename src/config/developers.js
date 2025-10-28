// Конфигурация авторизованных разработчиков
// Только эти пользователи имеют доступ к dev режиму

export const AUTHORIZED_DEVELOPERS = [
  // Farcaster usernames
  "vebster88",
  
  // Ethereum addresses (если нужно)
  "0x742d35Cc6634C0532925a3b8D404d3aAB4c4F8b4",
  
  // Добавьте других разработчиков здесь при необходимости
];

export const DEV_SECRET_CODE = "vebster88-dev-2024";

export const DEV_CONFIG = {
  // Разрешить dev режим на localhost
  allowLocalhost: true,
  
  // Логировать попытки доступа
  logAccess: true,
  
  // Показывать предупреждения о безопасности
  showSecurityWarnings: true,
  
  // Автоматически скрывать dev панель через N минут бездействия
  autoHideAfterMinutes: 30
};

// Функция для проверки, является ли пользователь разработчиком
export function isAuthorizedDeveloper(username, address) {
  return AUTHORIZED_DEVELOPERS.includes(username) || 
         AUTHORIZED_DEVELOPERS.includes(address);
}

// Функция для получения информации о разработчике
export function getDeveloperInfo(username, address) {
  if (AUTHORIZED_DEVELOPERS.includes(username)) {
    return {
      type: "farcaster",
      identifier: username,
      displayName: `@${username}`
    };
  }
  
  if (AUTHORIZED_DEVELOPERS.includes(address)) {
    return {
      type: "ethereum",
      identifier: address,
      displayName: `${address.slice(0, 8)}...${address.slice(-6)}`
    };
  }
  
  return null;
}
