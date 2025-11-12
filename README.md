# Microservices

Микросервисная архитектура на Node.js с API Gateway, сервисами пользователей и заказов.

Компоненты:
- API Gateway (порт 3000) - точка входа, проксирование, безопасность
- service_users (порт 4001) - управление пользователями, аутентификация
- service_orders (порт 4002) - управление заказами, бизнес-логика

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
### Требования

### Шаги

1. Клонировать репозиторий:
```bash
git clone <repository-url>
cd micro-task-template
```
2. Создать файл `.env` в корне проекта:
```env
JWT_SECRET=your_super_secret_key
USERS_URL=http://service_users:4001
ORDERS_URL=http://service_orders:4002
PORT_GATEWAY=3000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
LOG_LEVEL=info
```
3. Запустить контейнеры:
```bash
docker compose up -d --build
```
4. Проверить работоспособность:
- API Gateway: http://localhost:3000/health
- Swagger UI: http://localhost:3000/v1/users/docs/

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


# Удаление контейнеров и volumes
docker compose down -v
```
## Тестирование
### Установка зависимостей
```bash
npm install
```
### Запуск тестов

Все тесты:
```bash
npm test
```

E2E тесты через API Gateway:
```bash
npm run test:e2e
```

Тесты для users service:
```bash
npm run test:users
```

Тесты для orders service:
```bash
npm run test:orders
```

## API Documentation

Swagger UI доступен по адресу: http://localhost:3000/v1/users/docs/

## Безопасность

### JWT
- Алгоритм: HS256
- Срок действия: 12 часов
- Secret: задается в `.env` через `JWT_SECRET`

### Rate Limiting
- Окно: 60 секунд
- Лимит: 100 запросов
- Helmet - защита HTTP заголовков
- CORS - настроенный CORS
- Bearer Token - обязателен для защищенных endpoint'ов

### Встроенный администратор

Email: admin@example.com
Password: admin123

## Автор

Лев Станиславович (LeFF52)