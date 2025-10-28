# 🚀 Деплой TicTacToe Farcaster dApp

## 📋 Подготовка завершена

✅ **Приложение собрано** - `dist/` папка готова  
✅ **PWA манифест** - настроен для Farcaster  
✅ **Мета-теги** - добавлены для социальных сетей  
✅ **Конфигурация** - готова для dApp  

## 🌐 Варианты хостинга

### 1. **Vercel (рекомендуется)**

```bash
# Установите Vercel CLI
npm i -g vercel

# Деплой
vercel --prod

# Настройте переменные окружения в Vercel Dashboard
VITE_NEYNAR_API_KEY=ваш_ключ
VITE_NEYNAR_SIGNER_UUID=ваш_uuid
VITE_FARCASTER_MOCK=false
```

### 2. **Netlify**

```bash
# Установите Netlify CLI
npm i -g netlify-cli

# Деплой
netlify deploy --prod --dir=dist

# Настройте переменные в Netlify Dashboard
```

### 3. **Cloudflare Pages**

```bash
# Установите Wrangler
npm i -g wrangler

# Деплой
wrangler pages publish dist

# Настройте переменные в Cloudflare Dashboard
```

### 4. **GitHub Pages**

```bash
# Добавьте в package.json
"homepage": "https://username.github.io/tictactoe-farcaster"

# Деплой
npm run build
npx gh-pages -d dist
```

## 🔧 Настройка переменных окружения

После деплоя настройте переменные:

```env
VITE_NEYNAR_API_KEY=ваш_api_ключ
VITE_NEYNAR_SIGNER_UUID=ваш_signer_uuid
VITE_FARCASTER_MOCK=false
```

## 📱 Регистрация в Farcaster

### 1. **Создайте dApp в Farcaster**

1. Перейдите на https://warpcast.com
2. Войдите в аккаунт
3. Найдите раздел "Apps" или "dApps"
4. Нажмите "Add App" или "Submit App"

### 2. **Заполните информацию**

```json
{
  "name": "TicTacToe Farcaster",
  "description": "Крестики-нолики с интеграцией Farcaster",
  "url": "https://your-domain.com",
  "icon": "https://your-domain.com/assets/hero-BvKjdyUy.jpg",
  "category": "Games"
}
```

### 3. **Добавьте мета-теги**

Убедитесь, что ваш сайт имеет правильные мета-теги для Farcaster:

```html
<meta property="og:title" content="TicTacToe Farcaster · dApp" />
<meta property="og:description" content="Крестики-нолики с интеграцией Farcaster" />
<meta property="og:image" content="https://your-domain.com/assets/hero-BvKjdyUy.jpg" />
<meta property="og:url" content="https://your-domain.com" />
```

## 🎯 Тестирование dApp

### 1. **Локальное тестирование**

```bash
# Запустите локальный сервер
npm run preview

# Откройте http://localhost:4173
# Проверьте все функции
```

### 2. **Тестирование в Warpcast**

1. Откройте Warpcast
2. Найдите ваше приложение
3. Протестируйте все функции
4. Проверьте интеграцию с Farcaster

## 📊 Мониторинг

### 1. **Аналитика**

- Google Analytics
- Vercel Analytics
- Cloudflare Analytics

### 2. **Логи**

- Проверяйте логи сервера
- Мониторьте ошибки API
- Отслеживайте производительность

## 🔄 Обновления

### 1. **Автоматический деплой**

Настройте автоматический деплой при push в main:

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run build
      - uses: vercel/action@v1
```

### 2. **Ручной деплой**

```bash
npm run build
vercel --prod
```

## 🎉 Готово!

Ваше приложение готово к публикации в Farcaster!

**Следующие шаги:**
1. Выберите хостинг
2. Деплойте приложение
3. Зарегистрируйте в Farcaster
4. Протестируйте в Warpcast
