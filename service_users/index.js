import { requestLogger } from './middleware/requestLogger.js'
import { logger } from './utils/logger.js'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'

const express = require('express')
const fs = require('fs')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { z } = require('zod')
const pino = require('pino')
const pinoHttp = require('pino-http')
const { v4: uuidv4 } = require('uuid')

const app = express()
app.use(helmet())
app.use(cors())
app.use(requestLogger)

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const JWT_SECRET = process.env.JWT_SECRET || 'change_me'
const PORT = Number(process.env.PORT_USERS || 3001)
const USERS_FILE = './data/users.json'

app.use(express.json())
app.use(pinoHttp({ logger }))

const loadUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
const saveUsers = data =>
	fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2))

const userSchema = z.object({
	email: z.string().email(),
	password: z.string().min(6),
	name: z.string().min(1),
})

app.post('/register', (req, res) => {
	try {
		const { email, password, name } = userSchema.parse(req.body)
		const users = loadUsers()
		if (users.find(u => u.email === email)) {
			return res.status(409).json({
				success: false,
				error: { code: 'EMAIL_EXISTS', message: 'Email already registered' },
			})
		}
		const id = uuidv4()
		const hash = bcrypt.hashSync(password, 10)
		const newUser = { id, email, name, password: hash, roles: ['user'] }
		users.push(newUser)
		saveUsers(users)
		res.status(201).json({ success: true, data: { id } })
	} catch (err) {
		if (err instanceof z.ZodError)
			return res.status(400).json({
				success: false,
				error: { code: 'BAD_REQUEST', message: err.errors[0].message },
			})
		res.status(500).json({
			success: false,
			error: { code: 'INTERNAL', message: 'Server error' },
		})
	}
})

app.post('/login', (req, res) => {
	const { email, password } = req.body
	const users = loadUsers()
	const user = users.find(u => u.email === email)
	if (!user)
		return res.status(401).json({
			success: false,
			error: { code: 'BAD_CREDENTIALS', message: 'Invalid email' },
		})

	const valid = bcrypt.compareSync(password, user.password)
	if (!valid)
		return res.status(401).json({
			success: false,
			error: { code: 'BAD_CREDENTIALS', message: 'Invalid password' },
		})

	const token = jwt.sign(
		{ sub: user.id, roles: user.roles, name: user.name },
		JWT_SECRET,
		{ expiresIn: '1h' }
	)
	res.json({ success: true, data: { token } })
})

const auth = (req, res, next) => {
	const authHeader = req.header('Authorization')
	if (!authHeader?.startsWith('Bearer '))
		return res.status(401).json({
			success: false,
			error: { code: 'UNAUTH', message: 'Missing token' },
		})

	try {
		const token = authHeader.slice(7)
		req.user = jwt.verify(token, JWT_SECRET)
		next()
	} catch {
		res.status(401).json({
			success: false,
			error: { code: 'BAD_TOKEN', message: 'Invalid token' },
		})
	}
}

app.get('/me', auth, (req, res) => {
	const users = loadUsers()
	const user = users.find(u => u.id === req.user.sub)
	if (!user)
		return res.status(404).json({
			success: false,
			error: { code: 'NOT_FOUND', message: 'User not found' },
		})
	res.json({
		success: true,
		data: {
			id: user.id,
			email: user.email,
			name: user.name,
			roles: user.roles,
		},
	})
})

app.patch('/me', auth, (req, res) => {
	const users = loadUsers()
	const user = users.find(u => u.id === req.user.sub)
	if (!user)
		return res.status(404).json({
			success: false,
			error: { code: 'NOT_FOUND', message: 'User not found' },
		})
	if (req.body.name) user.name = req.body.name
	saveUsers(users)
	res.json({ success: true, data: { id: user.id, name: user.name } })
})

app.get('/', auth, (req, res) => {
	if (!req.user.roles.includes('admin')) {
		return res.status(403).json({
			success: false,
			error: { code: 'FORBIDDEN', message: 'Admin only' },
		})
	}
	const users = loadUsers().map(u => ({
		id: u.id,
		email: u.email,
		name: u.name,
		roles: u.roles,
	}))
	res.json({ success: true, data: users })
})

app.get('/health', (_req, res) => res.json({ ok: true, service: 'users' }))

app.use((err, _req, res, _next) => {
	logger.error(err)
	res.status(500).json({
		success: false,
		error: { code: 'INTERNAL', message: 'Server error' },
	})
})

app.listen(PORT, () => logger.info({ port: PORT }, 'Users service started'))
