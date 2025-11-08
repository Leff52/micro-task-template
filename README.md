#  Micro-Task Template

Микросервисная архитектура на Node.js с API Gateway, сервисами пользователей и заказов.

## Содержание

- Архитектура
- Технологии
- Быстрый старт
- Запуск проекта
- Тестирование
- API Documentation
- Структура проекта
- Endpoints

---

**Компоненты:**

- **API Gateway** (порт 3000) - точка входа, проксирование, безопасность
- **service_users** (порт 4001) - управление пользователями, аутентификация
- **service_orders** (порт 4002) - управление заказами, бизнес-логика

---

## Технологии

- **Runtime:** Node.js 20 (Alpine)
- **Framework:** Express 5
- **Logging:** Pino + Pino-HTTP
- **Validation:** Zod
- **Auth:** JWT 
- **Security:** Helmet, CORS, Rate Limiting
- **Documentation:** Swagger UI, OpenAPI 3.0
- **Testing:** Mocha + Chai 
- **Containerization:** Docker Compose

---

## старт

### Предварительные требования

- **Docker** и **Docker Compose** установлены

### Клонирование репозитория

```bash
git clone <repository-url>
cd micro-task-template
```

### Создание `.env` файла

Создайте файл `.env` в корне проекта:

```env
JWT_SECRET=your_super_secret_key_change_me_in_production

USERS_URL=http://service_users:4001
ORDERS_URL=http://service_orders:4002

PORT_GATEWAY=3000

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

LOG_LEVEL=info
```

### Запуск контейнеров

```bash
docker compose up -d --build
```

###  Проверка работоспособности

Откройте в браузере:

- **API Gateway Health:** http://localhost:3000/health
- **Swagger UI:** http://localhost:3000/v1/users/docs/

---

## Запуск проекта

### Основные команды

```bash
# Запуск всех сервисов
docker compose up -d

# Запуск с пересборкой
docker compose up -d --build

# Остановка всех сервисов
docker compose down

# Просмотр логов
docker compose logs -f

# Удаление контейнеров
docker compose down -v
```

---
##  Тестирование

### E2E тесты

Тесты выполняются на хосте и обращаются к запущенным контейнерам.

#### Установка зависимостей для тестов

```bash
npm install
```

#### Запуск тестов

** Через API Gateway (основной сценарий):**

```bash
npm run test:e2e
```

Тестирует полный flow через Gateway на `http://localhost:3000`


**Тестирование отдельных сервисов:**

```powershell
#  (будут падать тесты с Orders)
$env:BASE_URL='http://localhost:4001'; npm run test:e2e

# (будут падать тесты с Users)
$env:BASE_URL='http://localhost:4002'; npm run test:e2e
```

>  При прямом обращении к сервисам тесты вернут 404, тк сервисы работают на путях без префикса (`/login`, `/orders`).

---

##  API Documentation

### Swagger UI

После запуска проекта документация доступна по адресу:

**http://localhost:3000/v1/users/docs/**

Swagger UI доступен без авторизации

#### Логин

```bash
curl -X POST http://localhost:3000/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'
```


#### Создание заказа

```bash
TOKEN="<your-jwt-token>"

curl -X POST http://localhost:3000/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "My Order",
    "description": "Order description"
  }'
```

---


## Безопасность

### JWT 

- **Алгоритм:** HS256
- **Срок действия:** 12 часов (43200 секунд)
- **Secret:** Задаётся в `.env` через `JWT_SECRET`

### Rate Limiting

- **Окно:** 60 секунд (настраивается через `RATE_LIMIT_WINDOW_MS`)
- **Лимит:** 100 запросов (настраивается через `RATE_LIMIT_MAX`)

### Защита

- **Helmet** - защита HTTP заголовков
- **CORS** - настроенный CORS
- **Bearer Token** - обязателен для `/v1/orders/*` (кроме health)
- **Path Rewrite** - скрытие внутренней структуры

---

## Встроенные пользователи

После первого запуска создаётся администратор:

```json
{
  "email": "admin@example.com",
  "password": "admin123",
  "roles": ["admin", "user"]
}
```

Используйте эти данные для первого входа и тестирования.


---

##  Лицензии нет и не будет)))))))




## Автор этого шедевра

Я Лев Станиславович или же LeFF52

