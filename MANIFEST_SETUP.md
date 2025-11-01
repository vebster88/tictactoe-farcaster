# Настройка Farcaster Mini App Manifest

## Шаг 1: Создание Hosted Manifest

### 1. Откройте Developer Tools
Перейдите по ссылке:
**https://farcaster.xyz/~/developers/mini-apps/manifest**

### 2. Заполните форму создания Manifest

**Domain:**
```
tiktaktoe-farcaster-dun.vercel.app
```

**Application Details:**

| Поле | Значение |
|------|----------|
| **Name** | `TicTacToe Farcaster` |
| **Icon URL** | `https://tiktaktoe-farcaster-dun.vercel.app/tictactoe-icon-1024.png` |
| **Home URL** | `https://tiktaktoe-farcaster-dun.vercel.app/` |
| **Image URL** | `https://tiktaktoe-farcaster-dun.vercel.app/tictactoe-icon-1024.png` |
| **Button Title** | `🎮 Играть` или `Play TicTacToe` |
| **Splash Image URL** | `https://tiktaktoe-farcaster-dun.vercel.app/splash-screen.svg` |
| **Splash Background Color** | `#111111` (или ваш цвет темы) |

### 3. Получите Hosted Manifest ID

После создания вы получите **Hosted Manifest ID** (например: `1234567890`)

---

## Шаг 2: Обновление vercel.json

После получения Manifest ID, откройте файл `vercel.json` и замените:

```json
"destination": "https://api.farcaster.xyz/miniapps/hosted-manifest/REPLACE_WITH_YOUR_MANIFEST_ID"
```

на:

```json
"destination": "https://api.farcaster.xyz/miniapps/hosted-manifest/YOUR_ACTUAL_MANIFEST_ID"
```

Где `YOUR_ACTUAL_MANIFEST_ID` - это ID, который вы получили в шаге 1.

---

## Шаг 3: Проверка

### Локальная проверка (после деплоя)

Проверьте доступность manifest:
```bash
curl https://tiktaktoe-farcaster-dun.vercel.app/.well-known/farcaster.json
```

Должен вернуться JSON с вашим manifest или redirect на hosted manifest.

### Проверка через Developer Tools

1. Откройте: https://farcaster.xyz/~/developers/mini-apps/manifest
2. Найдите ваш домен
3. Нажмите "Audit" или "Preview" для проверки

---

## Шаг 4: Тестирование в Farcaster

1. Откройте Warpcast (или другой Farcaster клиент)
2. Найдите ваше приложение в поиске
3. Или используйте прямой URL для тестирования

---

## Важные моменты

- ✅ Manifest будет автоматически кешироваться клиентами
- ✅ Обновления в Developer Tools применяются без передеплоя
- ✅ `accountAssociation` создается автоматически при создании hosted manifest
- ⚠️ Изменения могут занять несколько минут для распространения

---

## Troubleshooting

### Manifest не найден (404)
- Проверьте, что redirect настроен в `vercel.json`
- Убедитесь, что деплой завершен
- Проверьте правильность Manifest ID

### Manifest не валидируется
- Проверьте все URL (должны быть доступны и возвращать правильные типы)
- Icon должен быть PNG/JPEG (SVG не поддерживается для icon)
- Все URL должны быть абсолютными (https://)

---

## Полезные ссылки

- **Developer Tools:** https://farcaster.xyz/~/developers/mini-apps/manifest
- **Документация:** https://miniapps.farcaster.xyz/docs/guides/publishing-your-app
- **Hosted Manifests:** https://farcaster.xyz/~/developers/hosted-manifests

