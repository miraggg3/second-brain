# Второй мозг — Telegram Mini App

Заметки + трекеры жизни внутри Telegram. Все данные хранятся на устройстве пользователя
(Telegram DeviceStorage, в браузере — localStorage).

## Что есть

| Вкладка | Функции |
|---|---|
| **Сегодня** | привычки со стриками 🔥, вода, сон, вес, настроение, свои трекеры (Premium) |
| **Зал** | запись тренировки (упражнения, подходы вес × повторы, таймер), история, серия недель, карта посещений |
| **Заметки** | заметки с #тегами, поиск, экспорт в Obsidian (.zip с Markdown + журнал тренировок + JSON-бэкап) |
| **Прогресс** | графики веса, сна, воды, настроения, привычек; рекорды и 1ПМ по упражнениям (Premium) |

### Premium за Telegram Stars ⭐
- **Месяц — 99 ⭐** (подписка, автопродление каждые 30 дней)
- **Навсегда — 499 ⭐**
- **Поддержать автора — 50 ⭐**

Premium даёт: безлимит привычек (бесплатно 3), свои трекеры, рекорды/графики в зале, цветовые темы.
Цены меняются в `server/server.js` → `PLANS`.

## Структура

```
index.html, style.css      — разметка и стили (цвета берутся из темы Telegram)
storage.js                 — DeviceStorage / localStorage
app.js                     — состояние, навигация, общие UI-штуки
today.js gym.js notes.js progress.js premium.js charts.js
main.js                    — старт
server/server.js           — бот + API + раздача файлов (без зависимостей)
```

## Запуск

Нужен Node.js 20.6+.

1. В @BotFather создай бота и возьми токен.
2. Настрой сервер:
   ```
   cd server
   copy .env.example .env      # заполни BOT_TOKEN и WEBAPP_URL
   npm start
   ```
3. Mini App работает только по **HTTPS**. Для теста на компе — туннель:
   ```
   cloudflared tunnel --url http://localhost:3000
   ```
   Полученный `https://...trycloudflare.com` впиши в `WEBAPP_URL` и перезапусти сервер.
   Бот сам поставит кнопку меню «Открыть».
4. Для продакшена — любой VPS/хостинг с Node (Render, Railway, Fly.io, свой сервер).
   Папку `server/data/` (там `db.json` с оплатами) нужно хранить на постоянном диске.

Без `BOT_TOKEN` сервер просто раздаёт файлы — удобно смотреть интерфейс в браузере.

## Как работает оплата

1. Приложение шлёт `initData` на `/api/invoice`, сервер проверяет подпись Telegram
   и создаёт счёт `createInvoiceLink` в валюте `XTR` (для подписки — `subscription_period`).
2. `Telegram.WebApp.openInvoice` открывает оплату.
3. Бот отвечает на `pre_checkout_query`, получает `successful_payment` и записывает
   статус в `server/data/db.json`. Продления подписки приходят так же.
4. Приложение спрашивает `/api/me` и включает Premium.

Команды бота: `/start`, `/paysupport` (обязательна для Stars), `/terms`,
`/refund <user_id> <charge_id>` — возврат, только для `ADMIN_ID`.
