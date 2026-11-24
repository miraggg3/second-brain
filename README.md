# Второй мозг — Telegram Mini App

Заметки, привычки, зал и показатели тела внутри Telegram.
Профиль с аватаром из Telegram, достижения, 9 тем и 3 стиля карточек.

## Данные: только на устройстве

- Все записи лежат в **Telegram DeviceStorage** (в браузере — localStorage).
  Удалил Telegram — записи удалились вместе с ним. Сервер записей не хранит.
- Телефон и ПК — разные хранилища. Перенос: **Профиль → Перенос данных**.
  Приложение показывает только способы, которые работают на этом устройстве:
  - **Отправить в чат с ботом** — бот присылает `.json` тебе в Telegram (нужен сервер);
  - **Скачать файл** — системное окно загрузки Telegram (нужен сервер, Telegram 8.0+);
  - **Поделиться файлом** — «Сохранить в Файлы», Диск, Избранное (iPhone и многие Android);
  - **Скопировать как текст** — работает везде, даже без интернета.
- Импорт: выбрать файл или вставить текст → **Объединить** или **Заменить всё**.

## Вкладки

| | |
|---|---|
| **Сегодня** | приветствие, кольца дня, привычки с сериями, плитки воды/сна/веса/настроения, свои трекеры |
| **Зал** | тренировка с кнопками −/+ для веса и повторов, подсказки упражнений, история, карта посещений |
| **Заметки** | поиск, цветные теги, карточки, редактор |
| **Прогресс** | Тело / Привычки / Зал: графики, проценты, рекорды и 1ПМ |
| **Профиль** | аватар и имя из Telegram, статистика, достижения, оформление, перенос данных, Premium |

**Premium (Telegram Stars):** месяц 99 ⭐ · навсегда 499 ⭐ · донат 50 ⭐.
Открывает темы Океан/Лес/Сакура/Мята/Неон, стиль «Стекло», свои трекеры,
безлимит привычек (бесплатно 3) и рекорды в зале.

## Стек

- **TypeScript**, **Preact** + signals, **Vite**. Шрифт Onest вшит в сборку.
- Сервер бота — **Cloudflare Worker** (`worker/`), бесплатного тарифа хватает.

```
src/            приложение (screens/ — экраны, styles.css — дизайн, themes.ts — темы)
worker/         бот + API: Stars, отправка файлов в чат, скачивание
.github/        сборка и публикация на GitHub Pages
```

## Разработка

```
npm install
npm run dev        # http://localhost:5173
npm run build
```

Push в `main` → GitHub Actions собирает и публикует на https://miraggg3.github.io/second-brain/

## Сервер бота (Cloudflare Workers) — нужен для оплаты, «в чат» и «скачать»

Один раз, из папки `worker`:

```
cd worker
npm install
npx wrangler login                       # вход в Cloudflare в браузере (бесплатный аккаунт)
npx wrangler kv namespace create DB      # скопируй id в wrangler.jsonc → kv_namespaces
npx wrangler secret put BOT_TOKEN        # токен от @BotFather
npx wrangler secret put WEBHOOK_SECRET   # любая длинная случайная строка
npx wrangler deploy                      # выдаст адрес https://second-brain-bot.<ты>.workers.dev
```

Потом:

1. Открой в браузере `https://second-brain-bot.<ты>.workers.dev/setup?secret=<WEBHOOK_SECRET>` —
   бот подключит webhook, команды и кнопку меню.
2. На GitHub: **Settings → Secrets and variables → Actions → Variables → New variable**:
   `API_BASE` = адрес воркера. Перезапусти workflow «Deploy to GitHub Pages» (или сделай push).

Команды бота: `/start`, `/paysupport`, `/terms`, `/refund <user_id> <charge_id>` (для `ADMIN_ID` из `wrangler.jsonc`).
