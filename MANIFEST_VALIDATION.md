# Проверка Farcaster Manifest

## ❌ Обнаруженные проблемы:

### 1. **Неправильная структура JSON**

**Текущий файл** (`public/.well-known/farcaster.json`) имеет структуру обычного web manifest, а не Farcaster manifest.

**Текущая структура (неправильная):**
```json
{
  "name": "...",
  "description": "...",
  "version": "1.0.0",
  "icon": "...",
  "splash": "..."
}
```

**Правильная структура Farcaster manifest:**
```json
{
  "miniapp": {
    "version": "1",
    "name": "...",
    "iconUrl": "...",
    "homeUrl": "...",
    "imageUrl": "...",
    "buttonTitle": "...",
    "splashImageUrl": "...",
    "splashBackgroundColor": "..."
  }
}
```

### 2. **Используется Hosted Manifest**

В `vercel.json` настроен redirect на Hosted Manifest:
```json
{
  "source": "/.well-known/farcaster.json",
  "destination": "https://api.farcaster.xyz/miniapps/hosted-manifest/YOUR_ACTUAL_ID"
}
```

Это значит:
- ✅ Локальный файл **игнорируется** (redirect перехватывает запросы)
- ✅ Используется Hosted Manifest из Developer Tools
- ⚠️ Нужно заменить `YOUR_ACTUAL_ID` на реальный ID

---

## ✅ Правильная структура для локального manifest (если нужен):

```json
{
  "miniapp": {
    "version": "1",
    "name": "TicTacToe Farcaster",
    "iconUrl": "https://tiktaktoe-farcaster-dun.vercel.app/tictactoe-icon-1024.png",
    "homeUrl": "https://tiktaktoe-farcaster-dun.vercel.app/",
    "imageUrl": "https://tiktaktoe-farcaster-dun.vercel.app/tictactoe-icon-1024.png",
    "buttonTitle": "🎮 Играть",
    "splashImageUrl": "https://tiktaktoe-farcaster-dun.vercel.app/splash-screen.svg",
    "splashBackgroundColor": "#111111"
  }
}
```

### Обязательные поля в `miniapp`:
- ✅ `version`: `"1"` (строка, обязательно)
- ✅ `name`: Название приложения
- ✅ `iconUrl`: URL иконки (PNG/JPEG, рекомендуется 1024x1024)
- ✅ `homeUrl`: Главная страница приложения
- ✅ `imageUrl`: Изображение для preview (3:2 aspect ratio)
- ✅ `buttonTitle`: Текст кнопки (макс 32 символа)

### Опциональные поля:
- `splashImageUrl`: Изображение для splash screen
- `splashBackgroundColor`: Цвет фона splash screen (hex)
- `webhookUrl`: URL для получения уведомлений
- `requiredChains`: Массив требуемых блокчейнов
- `requiredCapabilities`: Массив требуемых возможностей SDK

---

## 🔍 Проверка URL ресурсов:

Все URL должны быть:
- ✅ Доступными (200 OK)
- ✅ Возвращать правильный Content-Type (`image/*`)
- ✅ Абсолютными (с `https://`)

Проверьте доступность:
```bash
curl -I https://tiktaktoe-farcaster-dun.vercel.app/tictactoe-icon-1024.png
curl -I https://tiktaktoe-farcaster-dun.vercel.app/splash-screen.svg
```

---

## 💡 Рекомендации:

### Если используете Hosted Manifest (вариант 1):
1. ✅ Удалите локальный файл `public/.well-known/farcaster.json`
2. ✅ Обновите `vercel.json` с реальным Manifest ID
3. ✅ Управляйте manifest через Developer Tools

### Если нужен локальный manifest:
1. ✅ Исправьте структуру на правильную (см. выше)
2. ✅ Добавьте `accountAssociation` (генерируется через Developer Tools)
3. ✅ Удалите redirect из `vercel.json`

---

## 📋 Чек-лист валидации:

- [ ] Структура: объект с полем `miniapp`
- [ ] `version`: строка `"1"`
- [ ] `name`: заполнено
- [ ] `iconUrl`: валидный URL, доступен, PNG/JPEG
- [ ] `homeUrl`: валидный URL, доступен
- [ ] `imageUrl`: валидный URL, доступен, 3:2 aspect ratio
- [ ] `buttonTitle`: заполнено, макс 32 символа
- [ ] `splashImageUrl`: валидный URL, доступен (опционально)
- [ ] `splashBackgroundColor`: валидный hex цвет (опционально)
- [ ] Все URL абсолютные (`https://`)
- [ ] Все URL работают (200 OK)

