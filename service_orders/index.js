import { requestLogger } from './middleware/requestLogger.js'
import { logger } from './utils/logger.js'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'

const express = require('express')
const fs = require('fs')
const { z } = require('zod')
const { v4: uuidv4 } = require('uuid')
const pino = require('pino')
const pinoHttp = require('pino-http')
const jwt = require('jsonwebtoken')

const app = express()
app.use(helmet())
app.use(cors())
app.use(requestLogger)
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const PORT = Number(process.env.PORT_ORDERS || 3002)
const ORDERS_FILE = './data/orders.json'

app.use(express.json())
app.use(pinoHttp({ logger }))

const loadOrders = () => JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'))
const saveOrders = data =>
	fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2))
const nowISO = () => new Date().toISOString()

const getUserCtx = req => {
	const viaGateway = req.header('X-User')
	if (viaGateway) {
		try {
			return JSON.parse(viaGateway)
		} catch {}
	}

	const auth = req.header('Authorization')
	if (auth && auth.startsWith('Bearer ')) {
		try {
			const token = auth.slice(7)
			const payload = jwt.verify(token, process.env.JWT_SECRET || 'change_me')
			return { id: payload.sub, roles: payload.roles || [] }
		} catch {}
	}

	return null
}

const isAdmin = ctx => Array.isArray(ctx?.roles) && ctx.roles.includes('admin')

const itemSchema = z.object({
	sku: z.string().min(1),
	qty: z.number().int().positive(),
	price: z.number().nonnegative(),
})
const createOrderSchema = z.object({
	items: z.array(itemSchema).min(1),
	total: z.number().nonnegative(),
})

const statusSchema = z.enum(['created', 'processing', 'completed', 'cancelled'])

app.get('/health', (_req, res) => res.json({ ok: true, service: 'orders' }))

// создать заказ
app.post('/', (req, res) => {
	const user = getUserCtx(req)
	if (!user?.id)
		return res.status(401).json({
			success: false,
			error: { code: 'UNAUTH', message: 'Missing user context' },
		})

	try {
		const { items, total } = createOrderSchema.parse(req.body)
		const orders = loadOrders()
		const id = uuidv4()
		const order = {
			id,
			userId: user.id,
			items,
			total,
			status: 'created',
			createdAt: nowISO(),
			updatedAt: nowISO(),
		}
		orders.push(order)
		saveOrders(orders)

		// событие-заглушка
		req.log.info({ event: 'order.created', orderId: id, userId: user.id })

		return res.status(201).json({ success: true, data: { id } })
	} catch (err) {
		if (err instanceof z.ZodError) {
			return res.status(400).json({
				success: false,
				error: { code: 'BAD_REQUEST', message: err.errors[0].message },
			})
		}
		return res.status(500).json({
			success: false,
			error: { code: 'INTERNAL', message: 'Server error' },
		})
	}
})

// получить заказ по id
app.get('/:id', (req, res) => {
	const user = getUserCtx(req)
	if (!user?.id)
		return res.status(401).json({
			success: false,
			error: { code: 'UNAUTH', message: 'Missing user context' },
		})

	const orders = loadOrders()
	const order = orders.find(o => o.id === req.params.id)
	if (!order)
		return res.status(404).json({
			success: false,
			error: { code: 'NOT_FOUND', message: 'Order not found' },
		})

	if (order.userId !== user.id && !isAdmin(user))
		return res.status(403).json({
			success: false,
			error: { code: 'FORBIDDEN', message: 'Not allowed' },
		})

	return res.json({ success: true, data: order })
})

// список заказов
app.get('/', (req, res) => {
	const user = getUserCtx(req)
	if (!user?.id)
		return res.status(401).json({
			success: false,
			error: { code: 'UNAUTH', message: 'Missing user context' },
		})

	const page = Math.max(parseInt(req.query.page || '1', 10), 1)
	const limit = Math.max(parseInt(req.query.limit || '10', 10), 1)
	const sort = req.query.sort || 'createdAt:desc'

	let [field, dir] = sort.split(':')
	field = ['createdAt', 'updatedAt', 'total', 'status'].includes(field)
		? field
		: 'createdAt'
	dir = dir === 'asc' ? 'asc' : 'desc'

	const orders = loadOrders().filter(o =>
		isAdmin(user) ? true : o.userId === user.id
	)

	orders.sort((a, b) => {
		if (a[field] === b[field]) return 0
		return (a[field] > b[field] ? 1 : -1) * (dir === 'asc' ? 1 : -1)
	})

	const start = (page - 1) * limit
	const data = orders.slice(start, start + limit)
	res.json({ success: true, data, meta: { page, limit, total: orders.length } })
})

// обновить статус
app.patch('/:id/status', (req, res) => {
	const user = getUserCtx(req)
	if (!user?.id)
		return res.status(401).json({
			success: false,
			error: { code: 'UNAUTH', message: 'Missing user context' },
		})

	const { status } = req.body || {}
	try {
		statusSchema.parse(status)
	} catch {
		return res.status(400).json({
			success: false,
			error: { code: 'BAD_REQUEST', message: 'Invalid status' },
		})
	}

	const orders = loadOrders()
	const idx = orders.findIndex(o => o.id === req.params.id)
	if (idx === -1)
		return res.status(404).json({
			success: false,
			error: { code: 'NOT_FOUND', message: 'Order not found' },
		})

	const order = orders[idx]

	// владелец — только cancel, admin — любые переходы
	const owner = order.userId === user.id
	if (!isAdmin(user)) {
		if (!owner)
			return res.status(403).json({
				success: false,
				error: { code: 'FORBIDDEN', message: 'Not allowed' },
			})
		if (status !== 'cancelled')
			return res.status(403).json({
				success: false,
				error: { code: 'FORBIDDEN', message: 'Owner can only cancel' },
			})
	}

	// примитивные переходы
	const allowed = new Set([
		'created:processing',
		'processing:completed',
		'created:cancelled',
		'processing:cancelled',
	])
	const key = `${order.status}:${status}`
	if (order.status !== status && !isAdmin(user) && !allowed.has(key))
		return res.status(409).json({
			success: false,
			error: {
				code: 'BAD_STATUS_FLOW',
				message: `Illegal transition ${key}`,
			},
		})

	order.status = status
	order.updatedAt = nowISO()
	orders[idx] = order
	saveOrders(orders)

	req.log.info({
		event: 'order.status_updated',
		orderId: order.id,
		to: status,
		by: user.id,
	})
	return res.json({
		success: true,
		data: { id: order.id, status: order.status },
	})
})

// обработчик ошибок
app.use((err, _req, res, _next) => {
	logger.error(err)
	res.status(500).json({
		success: false,
		error: { code: 'INTERNAL', message: 'Server error' },
	})
})

app.listen(PORT, () => logger.info({ port: PORT }, 'Orders service started'))
