# Microservices

Микросервисная архитектура на Node.js с API Gateway, сервисами пользователей и заказов.

<<<<<<< HEAD
Компоненты:
- API Gateway (порт 3000) - точка входа, проксирование, безопасность
- service_users (порт 4001) - управление пользователями, аутентификация
- service_orders (порт 4002) - управление заказами, бизнес-логика
=======
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
>>>>>>> 4b0a2a44f49152200a38d4d47313ec00e089824d

## Технологии

- Node.js 20 (Alpine)
- Express 5
- Pino (logging)
- Zod (validation)
- JWT (authentication)
- Helmet, CORS, Rate Limiting (security)
- Swagger UI, OpenAPI 3.0 (documentation)
- Mocha, Chai (testing)
- Docker Compose

## Как запустить программу

<<<<<<< HEAD
### Требования
=======
## старт
>>>>>>> 4b0a2a44f49152200a38d4d47313ec00e089824d

- Docker и Docker Compose
- Порты 3000, 4001, 4002 должны быть свободны

<<<<<<< HEAD
### Шаги
=======
- **Docker** и **Docker Compose** установлены

### Клонирование репозитория
>>>>>>> 4b0a2a44f49152200a38d4d47313ec00e089824d

1. Клонировать репозиторий:
```bash
git clone <repository-url>
cd micro-task-template
```

<<<<<<< HEAD
2. Создать файл `.env` в корне проекта:
```env
JWT_SECRET=your_super_secret_key_change_me_in_production
USERS_URL=http://service_users:4001
ORDERS_URL=http://service_orders:4002
PORT_GATEWAY=3000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
LOG_LEVEL=info
```

3. Запустить контейнеры:
=======
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

>>>>>>> 4b0a2a44f49152200a38d4d47313ec00e089824d
```bash
docker compose up -d --build
```

<<<<<<< HEAD
4. Проверить работоспособность:
- API Gateway: http://localhost:3000/health
- Swagger UI: http://localhost:3000/v1/users/docs/
=======
###  Проверка работоспособности

Откройте в браузере:

- **API Gateway Health:** http://localhost:3000/health
- **Swagger UI:** http://localhost:3000/v1/users/docs/

---

## Запуск проекта
>>>>>>> 4b0a2a44f49152200a38d4d47313ec00e089824d

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

## Тестирование

### Установка зависимостей

```bash
npm install
```

<<<<<<< HEAD
### Запуск тестов

Все тесты:
```bash
npm test
```
=======
#### Запуск тестов

** Через API Gateway (основной сценарий):**
>>>>>>> 4b0a2a44f49152200a38d4d47313ec00e089824d

E2E тесты через API Gateway:
```bash
npm run test:e2e
```

<<<<<<< HEAD
Тесты для users service:
=======
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

>>>>>>> 4b0a2a44f49152200a38d4d47313ec00e089824d
```bash
npm run test:users
```

<<<<<<< HEAD
Тесты для orders service:
=======

#### Создание заказа

>>>>>>> 4b0a2a44f49152200a38d4d47313ec00e089824d
```bash
npm run test:orders
```

## API Documentation

<<<<<<< HEAD
Swagger UI доступен по адресу: http://localhost:3000/v1/users/docs/
=======
>>>>>>> 4b0a2a44f49152200a38d4d47313ec00e089824d

## Безопасность

### JWT
- Алгоритм: HS256
- Срок действия: 12 часов
- Secret: задается в `.env` через `JWT_SECRET`

### Rate Limiting
- Окно: 60 секунд
- Лимит: 100 запросов

### Защита
- Helmet - защита HTTP заголовков
- CORS - настроенный CORS
- Bearer Token - обязателен для защищенных endpoint'ов

### Встроенный администратор

Email: admin@example.com
Password: admin123

## Автор

<<<<<<< HEAD
Лев Станиславович (LeFF52)
=======
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
>>>>>>> 4b0a2a44f49152200a38d4d47313ec00e089824d

