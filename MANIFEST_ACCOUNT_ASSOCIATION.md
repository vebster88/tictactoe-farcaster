# Получение accountAssociation для Farcaster Manifest

## Что такое accountAssociation?

`accountAssociation` - это подписанное доказательство того, что вы владеете доменом и вашим Farcaster аккаунтом. Это **обязательное** поле в manifest.

## Как получить accountAssociation?

### Вариант 1: Через Developer Tools (рекомендуется)

1. Откройте: https://farcaster.xyz/~/developers/mini-apps/manifest
2. Введите ваш домен: `tiktaktoe-farcaster-dun.vercel.app`
3. Система автоматически:
   - Сгенерирует `accountAssociation` с вашим FID
   - Подпишет домен вашим custody адресом
   - Вернет готовый объект с `header`, `payload`, `signature`

### Вариант 2: Hosted Manifest (уже настроен)

Если вы используете **Hosted Manifest** (redirect в `vercel.json`):
- ✅ `accountAssociation` создается **автоматически** при создании hosted manifest
- ✅ Не нужно вручную добавлять в локальный файл
- ✅ Управляется через Developer Tools

## Структура accountAssociation:

```json
{
  "accountAssociation": {
    "header": "eyJmaWQiOjEyMTUyLCJ0eXBlIjoiY3VzdG9keSIsImtleSI6IjB4MEJGNDVGOTY3RTkwZmZENjA2MzVkMUFDMTk1MDYyYTNBOUZjQzYyQiJ9",
    "payload": "eyJkb21haW4iOiJ3d3cuYm91bnR5Y2FzdGVyLnh5eiJ9",
    "signature": "MHhmMTUwMWRjZjRhM2U1NWE1ZjViNGQ5M2JlNGIxYjZiOGE0ZjcwYWQ5YTE1OTNmNDk1NzllNTA2YjJkZGZjYTBlMzI4ZmRiNDZmNmVjZmFhZTU4NjYwYzBiZDc4YjgzMzc2MDAzYTkxNzhkZGIyZGIyZmM5ZDYwYjU2YTlmYzdmMDFj"
  }
}
```

Где:
- `header` - base64url закодированный JSON с FID, типом и ключом
- `payload` - base64url закодированный JSON с доменом
- `signature` - криптографическая подпись

## Проверка accountAssociation:

Декодируйте `payload` для проверки домена:

```javascript
const payload = JSON.parse(atob("eyJkb21haW4iOiJ3d3cuYm91bnR5Y2FzdGVyLnh5eiJ9"));
console.log(payload.domain); // Должен совпадать с вашим доменом
```

**Важно:** Домен в подписи должен **точно** совпадать с доменом, где размещен manifest (включая поддомены).

## Текущая ситуация:

✅ Структура manifest исправлена согласно официальной схеме  
⚠️ `accountAssociation` содержит плейсхолдеры - нужно заменить на реальные значения

## Следующие шаги:

1. **Если используете Hosted Manifest:**
   - Создайте hosted manifest через Developer Tools
   - Получите Manifest ID
   - Обновите redirect в `vercel.json`
   - `accountAssociation` создастся автоматически

2. **Если используете локальный manifest:**
   - Откройте Developer Tools
   - Создайте или обновите manifest для вашего домена
   - Скопируйте `accountAssociation` из результата
   - Вставьте в `public/.well-known/farcaster.json`

---

## Ссылки:

- **Developer Tools:** https://farcaster.xyz/~/developers/mini-apps/manifest
- **Agents Checklist:** https://miniapps.farcaster.xyz/docs/guides/agents-checklist
- **Hosted Manifests:** https://farcaster.xyz/~/developers/hosted-manifests

