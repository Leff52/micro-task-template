const express = require('express')
const { createProxyMiddleware } = require('http-proxy-middleware')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const jwt = require('jsonwebtoken')
const pino = require('pino')
const pinoHttp = require('pino-http')
const { v4: uuidv4 } = require('uuid')
const http = require('http')
const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')
const path = require('path')

const app = express()
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const PORT = Number(process.env.PORT_GATEWAY || 3000)
const USERS_URL = process.env.USERS_URL
const ORDERS_URL = process.env.ORDERS_URL
const JWT_SECRET = process.env.JWT_SECRET || 'yandex'

// базовая безопасность и CORS
app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				styleSrc: ["'self'", "'unsafe-inline'"],
				scriptSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", 'data:', 'https:'],
			},
		},
	})
)
app.use(cors({ origin: true, credentials: true }))

app.use((req, res, next) => {
	const rid = req.header('X-Request-ID') || uuidv4()
	req.id = rid
	res.setHeader('X-Request-ID', rid)
	next()
})
app.use(pinoHttp({ logger, customProps: req => ({ requestId: req.id }) }))

// rate limit
const limiter = rateLimit({
	windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
	max: Number(process.env.RATE_LIMIT_MAX || 100),
	standardHeaders: true,
	legacyHeaders: false,
})
app.use(limiter)

// авторизация
const authRequired = (req, res, next) => {
	const fullPath = req.originalUrl || req.url
	const open = new Set(['/v1/users/register', '/v1/users/login'])
	// пропускает открытые маршруты
	if (open.has(fullPath)) return next()

	const auth = req.header('Authorization')
	if (!auth || !auth.startsWith('Bearer '))
		return res.status(401).json({
			success: false,
			error: { code: 'UNAUTH', message: 'Token required' },
		})

	try {
		req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'change_me')
		next()
	} catch {
		res.status(401).json({
			success: false,
			error: { code: 'BAD_TOKEN', message: 'Invalid token' },
		})
	}
}
const usersProxy = createProxyMiddleware({
	target: process.env.USERS_URL,
	changeOrigin: true,
	proxyTimeout: 10000,
	timeout: 10000,
	pathRewrite: path => path.replace(/^\/v1\/users/, ''),
	onProxyReq: (proxyReq, req) => {
		proxyReq.setHeader('X-Request-ID', req.id)
		if (req.user)
			proxyReq.setHeader(
				'X-User',
				JSON.stringify({ id: req.user.sub, roles: req.user.roles || [] })
			)
	},
	onError: (_err, _req, res) => {
		res.status(502).json({
			success: false,
			error: { code: 'UPSTREAM', message: 'Upstream error' },
		})
	},
})
const ordersProxy = createProxyMiddleware({
	target: process.env.ORDERS_URL,
	changeOrigin: true,
	proxyTimeout: 10000,
	timeout: 10000,
	pathRewrite: p => p.replace(/^\/v1\/orders/, ''),
	onProxyReq: (proxyReq, req) => {
		proxyReq.setHeader('X-Request-ID', req.id)
		if (req.user)
			proxyReq.setHeader(
				'X-User',
				JSON.stringify({ id: req.user.sub, roles: req.user.roles || [] })
			)
		if (req.rawBody && req.rawBody.length > 0) {
			proxyReq.setHeader('Content-Length', Buffer.byteLength(req.rawBody))
			proxyReq.write(req.rawBody)
		}
	},
	onError: (_e, _req, res) =>
		res.status(502).json({
			success: false,
			error: { code: 'UPSTREAM', message: 'Upstream error' },
		}),
})
// общие опции прокси
const proxyOpts = target => ({
	target,
	changeOrigin: true,
	proxyTimeout: 10000,
	timeout: 10000,
	onProxyReq: (proxyReq, req) => {
		proxyReq.setHeader('X-Request-ID', req.id)
		if (req.user)
			proxyReq.setHeader(
				'X-User',
				JSON.stringify({ id: req.user.sub, roles: req.user.roles || [] })
			)
	},
	onError: (_err, _req, res) => {
		res.status(502).json({
			success: false,
			error: { code: 'UPSTREAM', message: 'Upstream error' },
		})
	},
})

// Swagger UI для документации API
const swaggerDocument = YAML.load(path.join(__dirname, 'openapi.yaml'))
app.use(
	'/api-docs',
	swaggerUi.serve,
	swaggerUi.setup(swaggerDocument, {
		customCss: '.swagger-ui .topbar { display: none }',
		customSiteTitle: 'Micro Task Template API',
	})
)

// Отдаем OpenAPI спецификацию в JSON формате
app.get('/openapi.json', (_req, res) => {
	res.json(swaggerDocument)
})

// маршруты
app.use('/v1/users', authRequired, usersProxy)
app.use('/v1/orders', authRequired, ordersProxy)

app.get('/health', (_req, res) => res.json({ ok: true }))

// единая обработка ошибок
app.use((err, _req, res, _next) => {
	logger.error({ err }, 'Gateway error')
	res.status(500).json({
		success: false,
		error: { code: 'GATEWAY_ERR', message: 'Internal error' },
	})
})

const server = http.createServer(app)

server.on('checkContinue', (req, res) => {
	res.writeContinue()
	app(req, res)
})

server.listen(PORT, () => logger.info({ port: PORT }, 'API Gateway started'))
