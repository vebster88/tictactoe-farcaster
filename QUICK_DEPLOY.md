# 🚀 Быстрый деплой TicTacToe Farcaster

## ✅ Готово к деплою!

Ваше приложение полностью настроено для публикации в Farcaster.

## 🎯 Выберите хостинг

### 1. **Vercel (самый простой)**

```bash
# 1. Установите Vercel CLI
npm i -g vercel

# 2. Войдите в аккаунт
vercel login

# 3. Деплойте
vercel --prod

# 4. Настройте переменные в Vercel Dashboard
```

### 2. **Netlify**

```bash
# 1. Установите Netlify CLI
npm i -g netlify-cli

# 2. Войдите в аккаунт
netlify login

# 3. Деплойте
netlify deploy --prod --dir=dist

# 4. Настройте переменные в Netlify Dashboard
```

### 3. **GitHub Pages**

```bash
# 1. Добавьте в package.json
"homepage": "https://username.github.io/tictactoe-farcaster"

# 2. Деплойте
npm run build
npx gh-pages -d dist
```

## 🔧 Настройка переменных

После деплоя добавьте переменные окружения:

```env
VITE_NEYNAR_API_KEY=ваш_api_ключ
VITE_NEYNAR_SIGNER_UUID=ваш_signer_uuid
VITE_FARCASTER_MOCK=false
```

## 📱 Регистрация в Farcaster

1. **Откройте Warpcast**
2. **Найдите раздел "Apps"**
3. **Нажмите "Add App"**
4. **Заполните информацию:**
   - Название: TicTacToe Farcaster
   - Описание: Крестики-нолики с интеграцией Farcaster
   - URL: https://your-domain.com
   - Иконка: https://your-domain.com/assets/hero-BvKjdyUy.jpg

## 🎉 Готово!

Ваше приложение теперь доступно в Farcaster!

**Следующие шаги:**
1. Выберите хостинг и деплойте
2. Зарегистрируйте в Farcaster
3. Протестируйте в Warpcast
4. Поделитесь с сообществом!

## 📞 Поддержка

Если возникли вопросы:
- Проверьте `DEPLOY_GUIDE.md` для подробной инструкции
- Посмотрите логи в консоли браузера
- Убедитесь, что переменные окружения настроены

**Удачи с деплоем!** 🚀
