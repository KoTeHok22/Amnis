# Amnis — Полная документация проекта

> **Amnis** — веб-сервис толкования снов на основе юнгианской психологии с AI-диалогом.
> Прод: https://amnis.jdh-team.ru/

---

## 1. Общая архитектура

```
                    ┌──────────────────────────────────────────┐
                    │              Пользователь                │
                    │         (браузер / Telegram)             │
                    └──────────────┬───────────┬───────────────┘
                                   │           │
                    ┌──────────────▼────┐  ┌───▼────────────┐
                    │   Caddy (TLS)     │  │   Telegram     │
                    │  amnis.jdh-team.ru│  │   Bot (планир.)│
                    │  api.jdh-team.ru  │  └────────────────┘
                    └──┬───────────┬────┘
                       │:3891      │:8000
              ┌────────▼───┐  ┌───▼──────────┐
              │  Frontend   │  │   Backend     │
              │  React/Vite │  │   FastAPI     │
              │  + Nginx    │  │   + Celery    │
              └─────────────┘  └───┬───┬───────┘
                                   │   │
                    ┌──────────────▼───▼──────┐
                    │        PostgreSQL        │
                    │   users / chats / paym.  │
                    └──────────────────────────┘
                    ┌──────────────▼───────────┐
                    │         Redis             │
                    │   Celery broker + SSE     │
                    └──────────────────────────┘
                    ┌──────────────▼───────────┐
                    │   freeLLM (Node.js)       │
                    │  OpenAI-compatible proxy  │
                    │  → chat.qwen.ai (Round-   │
                    │    Robin по ~120 акк.)    │
                    └──────────────────────────┘
```

### Слои:

1. **Frontend** — React 18 SPA, отдаётся через Nginx. Управляет UX, чатами, лендингом.
2. **Backend** — FastAPI (Python 3.11). Авторизация, профили, чаты, платежи, TTS.
3. **AI Proxy (freeLLM)** — Node.js-адаптер, конвертирует OpenAI API → Qwen API.
4. **PostgreSQL** — пользователи, чаты (метаданные), платежи.
5. **Redis** — брокер Celery + SSE-стриминг.
6. **Файловая система** — `BACK/user_chats/`: JSON-файлы с полной историей сообщений.

---

## 2. Фронтенд (UI/)

### 2.1 Стек

| Компонент | Версия | Назначение |
|-----------|--------|------------|
| React | ^18.3.1 | UI-библиотека |
| Vite | 6.3.5 | Сборщик, дев-сервер :3000, прокси на :18080 |
| TypeScript | — | Типизация (SWC) |
| Tailwind CSS | 4.1.17 | Utility-first, собирается на лету через `@tailwindcss/vite` |
| Radix UI | 22+ пакетов | Доступные примитивы (dialog, select, tooltip, accordion...) |
| shadcn/ui | 48 компонентов | Обёртки над Radix (button, card, form, dialog...) |
| motion | (framer-motion) | Анимации, `whileInView`, `AnimatePresence` |
| axios | ^1.13.2 | HTTP-клиент (2 инстанса: api, chatApi) |
| sonner | ^2.0.3 | Тосты (уведомления) |
| lucide-react | ^0.487.0 | Иконки |
| react-markdown + remark-gfm | — | Рендер markdown в чате |
| recharts | ^2.15.2 | Графики |
| react-hook-form | ^7.55.0 | Формы |
| clsx + tailwind-merge | — | `cn()`-утилита |

### 2.2 Архитектура

**Нет React Router.** Навигация — стейт-машина в `App.tsx`:

```
currentView: 'landing' | 'chat' | 'profile'
isAuthenticated ? 'chat' : 'landing'
```

**Ключевые компоненты:**

| Файл | Назначение |
|------|-----------|
| `LandingView.tsx` | Лендинг (hero, преимущества, тарифы, CTA) |
| `ChatWindow.tsx` | Основной чат (ленивая загрузка через `React.lazy`) |
| `AuthModal.tsx` | Вход/регистрация |
| `ProfileModal.tsx` | Профиль + тарифы + смена пароля |
| `MessageBubble.tsx` | Сообщение (markdown + TTS) |
| `PricingCard.tsx` | Карточка тарифа (3D-наклон) |
| `StarField.tsx` | Canvas-анимация звёзд |

**Контексты** (React Context, без Zustand/Redux):

| Контекст | Хранит |
|----------|--------|
| `AuthContext` | `isAuthenticated`, `token` (localStorage), `user` |
| `PaymentContext` | `paymentStatus` (pending/paid/cancelled) |

### 2.3 Дизайн-система

**Тёмная «ночная» тема:**

| Переменная | Значение | Использование |
|------------|----------|--------------|
| `--color-primary-bg` | `#0D0B24` | Основной фон |
| `--color-secondary-bg` | `#1A1640` | Карточки, сайдбар |
| `--color-accent-gold` | `#F4E0A7` | Золотой акцент (заголовки, CTA) |
| `--color-accent-lavender` | `#A998FF` | Лавандовый акцент |
| `--color-text-primary` | `#E8E6F5` | Основной текст |
| `--color-text-secondary` | `#B8B5D1` | Вторичный текст |
| `--color-chat-user` | `rgba(77,74,168,0.35)` | Фон пользователя |
| `--color-chat-amnis` | `rgba(244,224,167,0.08)` | Фон Amnis |

**Шрифты (из `UI/src/fonts/`):**

| Класс | Шрифт | Назначение |
|-------|-------|-----------|
| `.brand` | Bainsley | Слово «Amnis» (читаемый, НЕ Pulstar) |
| `.font-display`, `.number-symbol` | Bainsley | Заголовки h1, цифры |
| `.font-accent` | WildRune italic | Заголовки h2 |
| `.font-mystical` | Bainsley | Консистентный h2 fallback |
| `.font-tech`, `.tech-text` | Pulstar | Крупные кириллические акценты |
| `.font-symbolic` | Novem → WildRune | Символьный текст |

**Эффекты:**
- Glassmorphism (`backdrop-blur-*`)
- Canvas StarField (110 звёзд + 140 искр)
- CSS bg-animation (3 слоя градиентов)
- 3D-наклон карточек тарифов (`mousemove` + `requestAnimationFrame`)
- Glow-подсветки (`box-shadow` золото/лаванда)
- `prefers-reduced-motion: reduce`

### 2.4 API-клиенты

**`services/api.ts`** — `apiClient` (base URL: прокси Vite):
- `POST /register`, `POST /login`, `GET /verify-token`
- `GET /profile`, `PUT /profile`, `POST /change-password`
- `GET /subscription`, `POST /payment/success`, `POST /payment/nicepay/create`
- `POST /tts` (озвучка)

**`services/chatApi.ts`** — `chatApiClient`:
- `POST /chat/create`, `POST /chat/send`, `POST /chat/send-stream`
- `GET /chats`, `POST /chat/switch`, `GET /chat/{id}/messages`
- `DELETE /chat/{id}`, `PUT /chat/{id}/title`, `POST /chat/clear`
- `GET /chat/stream-status`, `GET /chat/stream/listen` (SSE reconnect)

**Стриминг:** нативный `fetch` + SSE (парсинг `data: {...}`), поддержка reconnect.

### 2.5 Особенности

- **Служебные триггеры в ответе AI** — вырезаются перед показом:
  - `[ACTION: TRIGGER_PAYMENT_ROBOKASSA]` — апсейл
  - `[ACTION: TRIGGER_USE_ANALYSIS_CREDIT]` — кредит анализа
  - `[NAME_CHANGE="..."]` — переименование чата
  - `[SYMBOLS="..."]` — сводка символов сна
- **TTS**: серверный `POST /tts` (edge-tts) → MP3, fallback на Web Speech API
- **Голосовой ввод**: Web Speech API (`webkitSpeechRecognition`), русский язык

---

## 3. Бэкенд (BACK/)

### 3.1 Стек

| Компонент | Версия | Назначение |
|-----------|--------|-----------|
| Python | 3.11+ | Язык |
| FastAPI | 0.115.0 | Web-фреймворк |
| uvicorn | 0.30.6 | ASGI-сервер |
| SQLAlchemy | 2.0.35 | ORM |
| Alembic | 1.13.3 | Миграции (6 версий) |
| Celery | 5.3.6 | Фоновая очередь |
| Redis (redis-py) | — | Брокер + SSE |
| python-jose | — | JWT |
| passlib[bcrypt] | — | Хэширование паролей |
| edge-tts | — | Озвучка текста |
| httpx | — | HTTP-клиент к AI API |

### 3.2 Файловая структура

```
BACK/
├── main.py                    # FastAPI приложение (1619 строк), все endpoints
├── auth.py                    # JWT, bcrypt, хэширование (89 строк)
├── models.py                  # SQLAlchemy модели (User, Chat, Payment, TelegramUser)
├── database.py                # Подключение к БД, SessionLocal, get_db()
├── ai_service.py              # AIChatService — управление чатами, системный промпт
├── openai_api.py              # OpenAIChatClient — клиент к OpenAI-совместимому API
├── qwen_api.py                # QwenAPIClient (НЕ ИСПОЛЬЗУЕТСЯ) — scraper Qwen
├── nicepay.py                 # Интеграция с NicePay
├── celery_app.py              # Celery задачи (process_message_stream_task и др.)
├── run_server.py              # Точка входа uvicorn
├── startup_with_retry.py      # Запуск с ретраями инициализации
├── ensure_migrations.py       # Применение Alembic миграций
├── .env                       # Все секреты (git-коммитится!)
├── requirements.txt           # Зависимости
├── Dockerfile                 # multi-stage (Python 3.11-slim)
├── entrypoint.sh              # Ожидание БД → миграции → uvicorn
├── start.sh                   # Bash-скрипт запуска
├── accounts.json              # 135 аккаунтов Qwen (email + password)
├── cookies.json               # Cookies для Qwen
├── alembic.ini                # Конфиг Alembic (пароль БД открытым текстом)
├── prompts/
│   └── initial_prompt.txt     # Системный промпт (юнгианский психолог, 91 строка)
├── user_chats/                # JSON-файлы чатов по номерам телефонов
└── alembic/
    ├── env.py
    └── versions/
        ├── 000_initial_users_table.py
        ├── 001_add_chat_model.py
        ├── 002_add_name_and_birth_date_to_users.py
        ├── 003_add_subscription_data_field.py
        ├── 004_add_dream_summary_to_chats.py
        └── 005_add_available_analyses_to_users.py
```

### 3.3 Все Endpoints

#### Аутентификация
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/register` | Регистрация (phone, name, birth_date, password) → JWT |
| POST | `/login` | Вход (phone, password) → JWT |
| GET | `/verify-token` | Проверка JWT |
| POST | `/change-password` | Смена пароля |

#### Профиль
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/profile` | Получить профиль |
| PUT | `/profile` | Обновить профиль (name, birth_date) |

#### Чаты
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/chat/create` | Создать чат |
| POST | `/chat/send` | Поставить в очередь Celery |
| POST | `/chat/send-stream` | Запустить генерацию + SSE-стрим |
| GET | `/chat/stream-status` | Статус текущей генерации |
| GET | `/chat/stream/listen` | SSE-стрим с reconnect |
| GET | `/chat/task/{task_id}` | Результат Celery-задачи |
| POST | `/chat/clear` | Очистить текущий чат |
| POST | `/chat/switch` | Переключить чат |
| GET | `/chats` | Список чатов |
| GET | `/chat/{chat_id}/messages` | История сообщений |
| DELETE | `/chat/{chat_id}` | Удалить чат |
| PUT | `/chat/{chat_id}/title` | Переименовать чат |
| GET | `/initial-prompt` | Системный промпт |

#### Платежи
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/payment/success` | Зачислить анализы |
| GET | `/subscription` | Данные подписки |
| POST | `/payment/nicepay/create` | Создать платёж NicePay |
| GET | `/payment/nicepay/callback` | Webhook от NicePay |

#### TTS
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/tts` | Озвучить текст → MP3 |

#### Telegram (планируется)
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/register` | Альтернативная регистрация |
| POST | `/auth/register/telegram` | Регистрация из Telegram |
| POST | `/telegram/auth` | Вход через Telegram |

#### Сервисные
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Healthcheck |

### 3.4 Модели данных

#### `users`
| Поле | Тип | Описание |
|------|-----|----------|
| id | Integer, PK | |
| phone_number | String, unique, indexed | Номер телефона |
| name | String, nullable | Имя |
| birth_date | DateTime, nullable | Дата рождения |
| password_hash | String | bcrypt хэш |
| is_active | Boolean, default=True | Активен |
| available_analyses | Integer, default=0 | Доступно анализов |
| subscription_expiry | DateTime, nullable | Истечение подписки |
| created_at, updated_at | DateTime | |

#### `chats`
| Поле | Тип | Описание |
|------|-----|----------|
| id | Integer, PK | |
| user_id | Integer, FK→users | |
| chat_id | String, unique, indexed | UUID чата |
| title | String(255) | Название |
| dream_summary | Text, nullable | Сводка сна |
| is_active | Boolean, default=True | Soft delete |
| created_at, updated_at | DateTime | |

#### `payments`
| Поле | Тип | Описание |
|------|-----|----------|
| id | Integer, PK | |
| order_id | String, unique | ID заказа |
| nicepay_payment_id | String, nullable | ID в NicePay |
| user_id | Integer, FK→users | |
| amount | Integer | Сумма (копейки) |
| currency | String, default="RUB" | |
| plan | String, nullable | Тариф |
| analyses_count | Integer | Кол-во анализов |
| validity_days | Integer | Дней действия |
| status | String, default="pending" | pending/success/error |

---

## 4. AI-интеграция

### 4.1 Основной путь (через OpenAI-compatible API)

```
Frontend → Backend (FastAPI) → OpenAI-compatible API (flick-api.gleeze.com)
                                                              ↓
                                                      Модель: qwen-3.5
```

**Параметры:**
- `OPENAI_BASE_URL=https://flick-api.gleeze.com/v1`
- `OPENAI_API_KEY=sk-6f83f6bbe97b4335ba11ab652dcsnttt`
- `OPENAI_MODEL=qwen-3.5`
- Таймаут: 300 сек
- Формат: Streaming POST `/chat/completions`, SSE-ответ

**Процесс:**
1. Backend хранит системный промпт + историю в JSON-файлах
2. При отправке — весь контекст диалога отправляется в API
3. Ответ стримится через SSE → Redis → клиент
4. Backend извлекает `[NAME_CHANGE]` и `[SYMBOLS]` из ответа через regex
5. Сохраняет: название чата в `chat.title`, сводку в `chat.dream_summary`

### 4.2 Резервный путь (через freeLLM)

**freeLLM** — Node.js-адаптер, который проксирует OpenAI API → Qwen (chat.qwen.ai).

```
docker-compose → freellm:11434
                ↓
         Node.js HTTP-сервер
                ↓
    Round-Robin по 120+ аккаунтам Qwen
                ↓
         chat.qwen.ai (бесплатно)
```

**Стек freeLLM:**
- Node.js 22 (Alpine)
- Playwright (для регистрации аккаунтов)
- Аутентификация через `POST /api/v1/auths/signin` на Qwen
- Единственная модель: `qwen3.6-plus`

**Механизм аккаунтов:**
- `accounts.json` — ~120+ email/password (зарегистрированы через guerrillamail)
- Round-robin выбор следующего аккаунта
- `registrator.js` — Playwright-бот для авторегистрации
- `capmonster.js` — решение Alibaba CAPTCHA через CapMonster.cloud

### 4.3 Системный промпт (юнгианский анализ)

Файл: `BACK/prompts/initial_prompt.txt` (91 строка)
- Правила: не гадать будущее, требовать эмоциональный контекст
- Изоляция: 1 сон = 1 чат
- Upsell-механика: предложение deep analysis за кредит или покупку
- Интеграция даты рождения для астрологического контекста

---

## 5. Безопасность и шифрование

### 5.1 Хранение паролей

**Алгоритм: bcrypt**
- `passlib.context.CryptContext(schemes=["bcrypt"], bcrypt__ident="2b", bcrypt__rounds=12)`
- Идентификатор хэша: `$2b$` (12 раундов)
- Ограничение: пароль >72 байт обрезается до 72 байт
- Функции: `get_password_hash()`, `verify_password()`, `authenticate_user()`

### 5.2 JWT-токены

**Параметры:**
| Параметр | Значение |
|----------|----------|
| Алгоритм | HS256 (HMAC-SHA256) |
| Секретный ключ | `455a28131b7e0745f90ee673b8dacda24ee76dec913de207` (из `.env`) |
| Fallback в коде | `"your-secret-key-change-this-in-production"` (`auth.py:7`) |
| TTL | 30 минут |
| Payload | `{"sub": phone_number, "exp": timestamp}` |

**Поток:**
1. `create_access_token(data)` → `jwt.encode(payload, SECRET_KEY, HS256)`
2. `verify_token(token)` → `jwt.decode(token, SECRET_KEY, HS256)` → `TokenData(phone_number)`
3. Bearer token в заголовке `Authorization`

### 5.3 NicePay Webhook

**Проверка подписи (`verify_webhook_hash`):**
1. Сортировка параметров по алфавиту (кроме `hash`)
2. Склейка с разделителем `{np}`
3. Добавление `secret_key` в конец
4. SHA256 → сравнение с переданным `hash`

### 5.4 Ключи и секреты (все в `.env`, коммитится в git)

| Секрет | Значение | Назначение |
|--------|----------|-----------|
| `SECRET_KEY` | `455a28131b7e0745f90ee673b8dacda24ee76dec913de207` | JWT подпись |
| `DATABASE_URL` | `postgresql://Amnis:Amnis0987@db:5432/dream_interpreter` | Подключение к БД |
| `OPENAI_API_KEY` | `sk-6f83f6bbe97b4335ba11ab652dcsnttt` | AI API |
| `NICEPAY_MERCHANT_ID` | `6a0dd9a514218b01086193bb` | Платежи |
| `NICEPAY_SECRET_KEY` | `0nuds-Te1tn-zM3fw-lb95S-FAa3T` | Подпись webhook |

### 5.5 Проблемы безопасности

| Проблема | Описание |
|----------|----------|
| **JWT секрет hardcoded** | `auth.py:7` содержит fallback `"your-secret-key-change-this-in-production"` |
| **Слабый JWT ключ** | `455a28131b7e0745f90ee673b8dacda24ee76dec913de207` — 32 hex = 128 бит |
| **Пароль БД открытым текстом** | В `.env`, `alembic.ini`, `entrypoint.sh` — `Amnis:Amnis0987` |
| **Все секреты в git** | `.env`, `accounts.json`, `cookies.json` коммитятся в репозиторий |
| **Qwen аккаунты** | 135 пар email/password в открытом виде в `accounts.json` |
| **Нет rate limiting** | Любой endpoint можно ддосить |
| **Нет HTTPS на сервисах** | Только Caddy TLS-termination, внутри — HTTP |
| **JWT в localStorage** | XSS-уязвимость (токен доступен JS) |
| **Пароли в POST /login** | Передаются открытым текстом (хотя хэшируются bcrypt) |
| **Дублирование чатов** | И в БД, и в JSON-файлах на диске |

---

## 6. Платежная система (NicePay)

### 6.1 Тарифы

| План | Цена | Анализов | Срок |
|------|------|----------|------|
| plan-1 / single | 199₽ | 1 | 30 дней |
| plan-5 / starter | 799₽ | 5 | 90 дней |
| plan-10 / standard | 1 399₽ | 10 | 180 дней |
| plan-15 / premium | 1 899₽ | 15 | 365 дней |

Источник тарифов: `UI/src/data/pricingPlans.ts` (единый источник для всех компонентов).

### 6.2 Поток оплаты

1. Пользователь выбирает тариф → фронтенд
2. `POST /payment/nicepay/create` → создаёт `order_id = amnis_{user.id}_{uuid}`
3. Backend отправляет POST на `https://nicepay.io/public/api/payment`
4. NicePay возвращает `payment_id` + `link` (ссылка на оплату)
5. Пользователь оплачивает на сайте NicePay
6. NicePay шлёт GET на `/payment/nicepay/callback` с параметрами
7. Backend верифицирует подпись (SHA256)
8. Обновляет `Payment.status` → `success`, добавляет `available_analyses`

---

## 7. TTS (Озвучка)

**POST `/tts`** — server-side TTS:
- Библиотека: `edge-tts` (Azure Cognitive Services / Edge TTS)
- Автоопределение языка по Unicode-диапазонам
- 27 голосов (ru-RU-SvetlanaNeural, en-US-AriaNeural и др.)
- Лимит: 5000 символов
- Формат ответа: `audio/mpeg`
- Fallback: Web Speech API (браузерный) при ошибке сервера

---

## 8. Хранение данных

### 8.1 PostgreSQL
- Пользователи, метаданные чатов, платежи, Telegram-связки
- Пул: `pool_pre_ping=True`, `pool_recycle=300`
- Хост: `db:5432`

### 8.2 Redis
- Брокер Celery: `redis://redis:6379/0`
- SSE-стриминг: списки `stream:{chat_id}` и ключи `stream_status:{chat_id}`
- TTL ключей: 1 час

### 8.3 Файловая система
```
BACK/user_chats/{phone_number}/
├── current_chat.json     # Указание на активный chat_id
└── {chat_id}.json        # Полная история сообщений (массив messages)
```

### 8.4 Alembic миграции
6 версий в `BACK/alembic/versions/`:
1. `000` — начальная таблица users
2. `001` — модель чатов
3. `002` — name + birth_date
4. `003` — subscription_data
5. `004` — dream_summary
6. `005` — available_analyses

---

## 9. Инфраструктура

### 9.1 Docker Compose (5 сервисов)

| Сервис | Образ | Порт | Volumes |
|--------|-------|------|---------|
| freellm | node:22-alpine | 11434:11434 | — |
| db | postgres:15 | 15432:5432 | `postgres_data` (named) + `./db-init` |
| redis | redis:7 | 16379:6379 | — |
| backend | python:3.11-slim | 8000:8000 | `./BACK:/app` (bind) |
| frontend | nginx (multi-stage) | 3891:80 | — |

**Лимиты:** backend — memory 1G max / 512M reserved.
**Сеть:** bridge-default (все контейнеры в одной сети).

### 9.2 Caddy (Reverse Proxy)

Файл: `Caddyfile`

| Домен | Прокси | Назначение |
|-------|--------|-----------|
| `amnis.jdh-team.ru` | `127.0.0.1:3891` | Фронтенд |
| `api.jdh-team.ru` | `127.0.0.1:8000` | Backend API |
| `redis.jdh-team.ru` | `127.0.0.1:6379` | Redis |
| `lampa.verux.ru` | `:12672` | Другой проект |
| `mail.verux.ru` | `:8088` | Другой проект |
| `dns.verux.ru` | `:8085` | Другой проект |
| `shutdown-team.ru` | `:3501` | Другой проект |
| `api.shutdown-team.ru` | `:8501` | Другой проект |

**TLS:** Автоматические сертификаты Let's Encrypt (Caddy по умолчанию).

### 9.3 Сборка и деплой

**Frontend:**
- Dev: `cd UI && npm install && npm run dev` (Vite :3000)
- Prod: Docker multi-stage → npm run build → Nginx :80 → host :3891

**Backend:**
- `entrypoint.sh`: ожидание PostgreSQL → миграции Alembic → uvicorn
- Celery worker запускается в том же контейнере (фоном)

**Команда запуска контейнера backend:**
```sh
sh -c "celery -A celery_app worker --loglevel=info --concurrency=2 &
       python startup_with_retry.py"
```

---

## 10. Celery + Стриминг

### Процесс стриминга:

1. Клиент отправляет `POST /chat/send-stream`
2. FastAPI запускает Celery-задачу `process_message_stream_task`
3. Celery вызывает `ai_chat_service.send_message()`, стримит чанки
4. Каждый чанк пишется в Redis: `RPUSH stream:{chat_id}` + `SET stream_status:{chat_id}`
5. SSE-эндпоинт читает из Redis: `BLPOP` или прямое чтение списка
6. Клиент парсит SSE и дорисовывает сообщение
7. Поддержка reconnect: `GET /chat/stream/listen?position=N`
8. Таймаут генерации: 600 секунд
9. Ключи Redis истекают через 1 час

### Celery-задачи:
- `process_message_stream_task` — основная (со стримингом)
- `process_message_task` — простая (без стрима, опрос через task_id)

---

## 11. Голосовой ввод (Frontend)

- Web Speech API: `webkitSpeechRecognition`
- Язык: русский (`ru-RU`)
- Режим: непрерывный (`continuous: true`), промежуточные результаты (`interimResults: true`)
- Кнопка микрофона в интерфейсе чата

---

## 12. Особенности и «интересные места»

### 12.1 Служебные триггеры модели
AI может вернуть встроенные команды, которые обрабатываются на бэкенде и фронтенде:
- `[NAME_CHANGE = "Новое название"]` — авто-переименование чата
- `[SYMBOLS = "символы сна"]` — сводка символики
- `[ACTION: TRIGGER_PAYMENT_ROBOKASSA]` — показать апсейл
- `[ACTION: TRIGGER_USE_ANALYSIS_CREDIT]` — использовать кредит

### 12.2 3D-наклон карточек тарифов
- Обработчик `mousemove` + `requestAnimationFrame`
- `perspective(400px) rotate3d(x, y, 0deg)`
- Отключается на touch-устройствах

### 12.3 Анимация фона (CSS)
- 3 слоя `linear-gradient` с циклической сменой `opacity`
- `will-change: opacity` для аппаратного ускорения
- CSS классы: `bg-animation`, `bg-fade-1`, `bg-fade-2`

### 12.4 Canvas StarField
- 110 мерцающих звёзд + 140 иcкр
- requestAnimationFrame, Canvas 2D
- Учёт `prefers-reduced-motion`
- Автопауза при `visibilitychange`

### 12.5 Telegram-интеграция (планируется)
- Модель TelegramUser в БД
- Эндпоинты `/auth/register/telegram`, `/telegram/auth`
- В docker-compose описан сервис `telebot`, но каталога `TELEGRAM/` в репозитории нет

---

## 13. Известные проблемы

| # | Проблема | Важность |
|---|----------|----------|
| 1 | JWT секрет захардкожен в `auth.py:7` | P0 |
| 2 | Все секреты коммитятся в git (`.env`, `accounts.json`) | P0 |
| 3 | Пароль БД открытым текстом в 4 местах | P0 |
| 4 | Qwen аккаунты (135 шт.) с паролями в `accounts.json` | P0 |
| 5 | Нет rate limiting | P1 |
| 6 | Дублирование чатов (БД + JSON) | P1 |
| 7 | `process.env.REACT_APP_API_URL` (CRA-стиль) в Vite-проекте | P1 |
| 8 | Нет HTTPS внутри сети Docker | P1 |
| 9 | JWT в localStorage (XSS-риск) | P2 |
| 10 | `freeLLM/OLD/accounts.json` — утечка паролей | P0 |
| 11 | `db-init/` пустой (смонтирован, но не используется) | P2 |
| 12 | `TELEGRAM/` каталог отсутствует (ломaет compose) | P1 |
| 13 | `auth.py` не читает SECRET_KEY из env-переменных | P0 |
| 14 | Нет регистрации/логирования — только `print()` | P2 |

---

## 14. AUDIT.md (фронтенд) — статус

Все пункты аудита фронтенда **исправлены** (✅):

| # | Пункт | Приоритет |
|---|-------|-----------|
| 1.3 | Tailwind v4 + globals.css, удалён index.css | P0 |
| 1.1 | Бренд «Amnis» читаем (`.brand`) | P0 |
| 2.1 | Декоративные шрифты на смысловом тексте | P1 |
| 1.2 | Баг `setShowPasswordChange` → `setShowPasswordChangeModal` | P0 |
| 2.2 | Унификация h2 (`font-mystical`) | P1 |
| 2.5 | SEO/мета: lang=ru, OG, title | P1 |
| 1.4 | reduced-motion, visibilitychange, частицы | P0/P1 |
| 2.3 | Sticky-хедер | P1 |
| 2.4 | alert/confirm → sonner + dialog | P1 |
| 3.1 | Единый источник тарифов | P2 |
| 2.6 | Двойной отступ сайдбара | P1 |
| 3.x | Чистка console.*, мёртвый код, .gitignore | P2/P3 |

---

## 15. Разработка

### Локальный запуск

```bash
# Frontend
cd UI
npm install
npm run dev          # :3000 (прокси API на :18080)

# Backend (требуются PostgreSQL + Redis)
cd BACK
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python run_server.py

# Celery worker
celery -A celery_app worker --loglevel=info --concurrency=2

# Docker (полный стек)
docker compose up --build
```

### Переменные окружения (backed)

| Переменная | Значение по умолчанию | Описание |
|-----------|----------------------|----------|
| `DATABASE_URL` | `postgresql://Amnis:Amnis0987@db:5432/dream_interpreter` | PostgreSQL |
| `SECRET_KEY` | `455a28131b7e0745f90ee673b8dacda24ee76dec913de207` | JWT |
| `ALGORITHM` | `HS256` | JWT алгоритм |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | TTL токена |
| `OPENAI_BASE_URL` | `https://flick-api.gleeze.com/v1` | AI API |
| `OPENAI_API_KEY` | `sk-6f83f6bbe97b4335ba11ab652dcsnttt` | AI ключ |
| `OPENAI_MODEL` | `qwen-3.5` | Модель |
| `NICEPAY_MERCHANT_ID` | `6a0dd9a514218b01086193bb` | NicePay |
| `NICEPAY_SECRET_KEY` | `0nuds-Te1tn-zM3fw-lb95S-FAa3T` | NicePay |
| `FRONTEND_URL` | `https://amnis.jdh-team.ru` | CORS |
| `USER_DATA_DIR` | `./user_chats` | JSON-чаты |

---

## 16. Полезные ссылки

| Ресурс | URL |
|--------|-----|
| Продакшн | https://amnis.jdh-team.ru |
| API | https://api.jdh-team.ru |
| Docker Hub (образы) | https://hub.docker.com/r/anomalyco/amnis |
| NicePay | https://nicepay.io |
| Qwen AI | https://chat.qwen.ai |
| Caddy | https://caddyserver.com |
| Tailwind v4 | https://tailwindcss.com/docs/v4-beta |
| shadcn/ui | https://ui.shadcn.com |
