# 🎮 TicTacToe Farcaster dApp

Классическая игра в крестики-нолики с интеграцией Farcaster. Играйте против ИИ или других игроков прямо в Warpcast!

## ✨ Особенности

- 🤖 **ИИ противники** - легкий и сложный режимы
- 👥 **Локальная игра** - играйте с друзьями
- 🌐 **Farcaster интеграция** - социальные функции
- 📱 **PWA поддержка** - работает как приложение
- 🎨 **Современный UI** - темная и светлая темы
- 🌍 **Многоязычность** - русский и английский

## 🚀 Быстрый старт

### Локальная разработка

```bash
# Клонируйте репозиторий
git clone https://github.com/your-username/tictactoe-farcaster.git
cd tictactoe-farcaster

# Установите зависимости
npm install

# Запустите dev сервер
npm run dev

# Откройте http://localhost:5173
```

### Переменные окружения

Создайте файл `.env.local`:

```env
VITE_NEYNAR_API_KEY=ваш_api_ключ
VITE_NEYNAR_SIGNER_UUID=ваш_signer_uuid
VITE_FARCASTER_MOCK=false
```

## 🎯 Игровые режимы

### 1. **PvE — Лёгкий**
- Игра против случайного ИИ
- Подходит для новичков

### 2. **PvE — Хард**
- Игра против умного ИИ (Minimax)
- Сложный противник

### 3. **PvP — Локально**
- Игра с другом на одном устройстве
- По очереди делаете ходы

### 4. **PvP — Farcaster**
- Создание матчей в Farcaster
- Публикация результатов
- Социальные функции

## 🔧 Технологии

- **Frontend**: Vite + Vanilla JavaScript
- **Стили**: CSS3 + CSS Grid
- **ИИ**: Minimax алгоритм
- **Farcaster**: Neynar API
- **PWA**: Service Worker + Manifest
- **Деплой**: Vercel/Netlify/Cloudflare

## 📱 PWA функции

- Установка как приложение
- Офлайн работа
- Push уведомления
- Адаптивный дизайн

## 🌐 Farcaster интеграция

- Авторизация через кошелек
- Публикация инвайтов на игру
- Публикация результатов
- Социальные функции

## 🚀 Деплой

### Vercel (рекомендуется)

```bash
# Установите Vercel CLI
npm i -g vercel

# Деплой
vercel --prod
```

### Netlify

```bash
# Установите Netlify CLI
npm i -g netlify-cli

# Деплой
netlify deploy --prod --dir=dist
```

### Cloudflare Pages

```bash
# Установите Wrangler
npm i -g wrangler

# Деплой
wrangler pages publish dist
```

## 📊 Скрипты

```bash
npm run dev          # Запуск dev сервера
npm run build        # Сборка для продакшена
npm run preview      # Предварительный просмотр
npm run test         # Запуск тестов
npm run check-config # Проверка конфигурации
```

## 🎨 Кастомизация

### Темы
- Светлая тема (по умолчанию)
- Темная тема
- Автоматическое переключение

### Языки
- Русский (по умолчанию)
- Английский

### Стили
- CSS переменные для цветов
- Адаптивный дизайн
- Анимации и переходы

## 🤝 Вклад в проект

1. Форкните репозиторий
2. Создайте ветку для функции
3. Внесите изменения
4. Создайте Pull Request

## 📄 Лицензия

MIT License - см. файл [LICENSE](LICENSE)

## 👨‍💻 Автор

**vebster88** - [GitHub](https://github.com/vebster88)

## 🙏 Благодарности

- Farcaster за отличную платформу
- Neynar за API
- Сообщество за идеи и поддержку

---

**Играйте в крестики-нолики прямо в Farcaster!** 🎮✨
