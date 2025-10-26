const express = require('express')
const { createProxyMiddleware } = require('http-proxy-middleware')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const jwt = require('jsonwebtoken')
const pino = require('pino')
const pinoHttp = require('pino-http')
const { v4: uuidv4 } = require('uuid')

const app = express()
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

const PORT = Number(process.env.PORT_GATEWAY || 3000)
const USERS_URL = process.env.USERS_URL
const ORDERS_URL = process.env.ORDERS_URL
const JWT_SECRET = process.env.JWT_SECRET || 'change_me'

// базовая безопасность и CORS
app.use(helmet())
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

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

// Авторизация
const authRequired = (req, res, next) => {
	const open = ['/v1/users/register', '/v1/users/login']
	if (open.includes(req.path)) return next()

	const auth = req.header('Authorization')
	if (!auth || !auth.startsWith('Bearer '))
		return res
			.status(401)
			.json({
				success: false,
				error: { code: 'UNAUTH', message: 'Token required' },
			})

	try {
		const token = auth.slice('Bearer '.length)
		req.user = jwt.verify(token, JWT_SECRET)
		return next()
	} catch {
		return res
			.status(401)
			.json({
				success: false,
				error: { code: 'BAD_TOKEN', message: 'Invalid token' },
			})
	}
}

// общие опции прокси
const proxyOpts = target => ({
	target,
	changeOrigin: true,
	onProxyReq: (proxyReq, req) => {
		proxyReq.setHeader('X-Request-ID', req.id)
		if (req.user)
			proxyReq.setHeader(
				'X-User',
				JSON.stringify({ id: req.user.sub, roles: req.user.roles || [] })
			)
	},
	onError: (_err, _req, res) => {
		res
			.status(502)
			.json({
				success: false,
				error: { code: 'UPSTREAM', message: 'Upstream error' },
			})
	},
})

// маршруты 
app.use('/v1/users', authRequired, createProxyMiddleware(proxyOpts(USERS_URL)))
app.use(
	'/v1/orders',
	authRequired,
	createProxyMiddleware(proxyOpts(ORDERS_URL))
)

app.get('/health', (_req, res) => res.json({ ok: true }))

// единая обработка ошибок
app.use((err, _req, res, _next) => {
	logger.error({ err }, 'Gateway error')
	res
		.status(500)
		.json({
			success: false,
			error: { code: 'GATEWAY_ERR', message: 'Internal error' },
		})
})

app.listen(PORT, () => logger.info({ port: PORT }, 'API Gateway started'))
