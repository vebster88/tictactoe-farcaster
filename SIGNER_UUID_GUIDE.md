# Как получить Signer UUID для Neynar API

## 🔍 Что такое Signer UUID?

**Signer UUID** - это уникальный идентификатор, который Neynar использует для подписи кастов от вашего имени. Это не то же самое, что API ключ!

## 📋 Пошаговая инструкция

### Шаг 1: Войдите в Neynar Dashboard

1. Перейдите на https://neynar.com
2. Войдите в свой аккаунт (или создайте новый)
3. Перейдите в **Dashboard** или **API Keys** раздел

### Шаг 2: Найдите раздел Signers

В dashboard найдите один из разделов:
- **"Signers"**
- **"API Keys & Signers"** 
- **"Developer Tools"**
- **"Cast Publishing"**

### Шаг 3: Создайте новый Signer

1. Нажмите **"Create New Signer"** или **"Add Signer"**
2. Введите название (например, "TicTacToe App")
3. Скопируйте **Signer UUID** (выглядит как: `12345678-1234-1234-1234-123456789abc`)

### Шаг 4: Обновите .env.local

Замените `your_signer_uuid_here` на ваш реальный UUID:

```env
VITE_NEYNAR_API_KEY=365FE1BE-F2EF-47B4-891F-7FCABD6F61C5
VITE_NEYNAR_SIGNER_UUID=ваш_реальный_signer_uuid_здесь
VITE_FARCASTER_MOCK=false
```

## 🆘 Если не можете найти Signer раздел

### Альтернативный способ 1: Используйте Mock режим

Если не можете найти Signer UUID, используйте mock режим:

```env
VITE_FARCASTER_MOCK=true
```

Приложение будет работать, но без реальной публикации кастов.

### Альтернативный способ 2: Проверьте документацию

1. Перейдите на https://docs.neynar.com
2. Найдите раздел про **Cast Publishing**
3. Ищите информацию про **Signer UUID** или **Signer Keys**

### Альтернативный способ 3: Обратитесь в поддержку

Если не можете найти Signer UUID:
1. Напишите в поддержку Neynar
2. Спросите про **"Signer UUID for cast publishing"**
3. Или используйте mock режим для тестирования

## 🔍 Как проверить, что работает

После настройки Signer UUID в консоли браузера должно быть:

```
Farcaster mode check: {
  VITE_FARCASTER_MOCK: 'false',
  NEYNAR_API_KEY: '***61C5',
  NEYNAR_SIGNER_UUID: '***9abc',
  mockMode: false,
  noApiKey: false,
  noSigner: false,
  isMockMode: false
}
```

Если `noSigner: false` и `isMockMode: false` - значит все настроено правильно!

## 📝 Важные замечания

- **Signer UUID** отличается от **API Key**
- **API Key** нужен для чтения данных
- **Signer UUID** нужен для публикации кастов
- Без Signer UUID можно только читать, но не публиковать
