# Создание Signer UUID через Neynar API

## 🔍 Что такое Signed Key?

**Signed Key** - это подписанный ключ, который позволяет вашему приложению публиковать касты от имени пользователя в Farcaster.

## 📋 Пошаговая инструкция

### Шаг 1: Получите App FID

1. Перейдите на https://neynar.com
2. Войдите в аккаунт
3. Найдите ваш **App FID** в dashboard
4. Или используйте ваш личный FID

### Шаг 2: Используйте API для создания Signed Key

#### Вариант A: Через код (рекомендуется)

```javascript
import { createSignedKey } from './src/farcaster/signer.js';

// Замените на ваш App FID
const appFid = 12345; // Ваш App FID
const redirectUrl = 'http://localhost:5173'; // URL для перенаправления

try {
  const result = await createSignedKey(appFid, redirectUrl);
  console.log('Signed Key создан:', result);
  console.log('Signer UUID:', result.data.signer_uuid);
} catch (error) {
  console.error('Ошибка:', error.message);
}
```

#### Вариант B: Через cURL

```bash
curl --request POST \
  --url https://api.neynar.com/v2/farcaster/signer/developer_managed/signed_key/ \
  --header 'Content-Type: application/json' \
  --header 'x-api-key: ВАШ_API_КЛЮЧ' \
  --data '{
    "public_key": "0x3daa8f99c5f760688a3c9f95716ed93dee5ed5d7722d776b7c4deac957755f22",
    "signature": "0x7867e84cb6a64bf6e1954e52884133f1114eb3fd97f63ff55fa76c77c80beb6434eea9d3736b59caa3130d63121177acc752dc8a2561e9edf700642f390f92d11b",
    "app_fid": 12345,
    "deadline": 1234567890,
    "redirect_url": "http://localhost:5173"
  }'
```

### Шаг 3: Получите Signer UUID

После успешного создания signed key, вы получите ответ:

```json
{
  "signer_uuid": "12345678-1234-1234-1234-123456789abc",
  "status": "pending_approval",
  "public_key": "0x3daa8f99c5f760688a3c9f95716ed93dee5ed5d7722d776b7c4deac957755f22",
  "approval_url": "https://warpcast.com/~/add-cast-action?url=..."
}
```

### Шаг 4: Одобрите Signer

1. Перейдите по **approval_url** из ответа
2. Войдите в Warpcast
3. Одобрите создание signer'а
4. Скопируйте **signer_uuid** из ответа

### Шаг 5: Обновите .env.local

```env
VITE_NEYNAR_API_KEY=ваш_api_ключ
VITE_NEYNAR_SIGNER_UUID=12345678-1234-1234-1234-123456789abc
VITE_FARCASTER_MOCK=false
```

## 🧪 Тестирование

### Создайте тестовую страницу

Добавьте в `index.html` кнопку для создания signed key:

```html
<button id="btn-create-signer" class="btn" type="button">Создать Signer</button>
```

И в `src/app.js`:

```javascript
import { createSignedKey } from './farcaster/signer.js';

document.getElementById('btn-create-signer')?.addEventListener('click', async () => {
  try {
    const appFid = 12345; // Замените на ваш FID
    const result = await createSignedKey(appFid);
    alert(`Signer создан! UUID: ${result.data.signer_uuid}`);
  } catch (error) {
    alert(`Ошибка: ${error.message}`);
  }
});
```

## ⚠️ Важные замечания

1. **App FID** - это идентификатор вашего приложения в Farcaster
2. **Public Key** - должен быть уникальным Ed25519 ключом
3. **Signature** - должна быть создана с помощью вашего приватного ключа
4. **Deadline** - время истечения запроса (обычно 1 час)
5. **Approval** - пользователь должен одобрить создание signer'а

## 🔧 Отладка

### Если получаете ошибку 400:
- Проверьте формат public_key (должен начинаться с 0x)
- Проверьте signature (должна быть правильной)
- Проверьте deadline (должен быть в будущем)

### Если получаете ошибку 401:
- Проверьте API ключ
- Убедитесь, что ключ активен

### Если получаете ошибку 403:
- Проверьте права API ключа
- Убедитесь, что App FID правильный
