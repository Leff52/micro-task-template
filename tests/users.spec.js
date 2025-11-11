const axios = require('axios')
const { expect } = require('chai')

const BASE = process.env.BASE_URL || 'http://localhost:4001'

// хелперы
const api = axios.create({
	baseURL: BASE,
	validateStatus: () => true,
	headers: { 'Content-Type': 'application/json' },
})

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitUntilAlive(url, timeoutMs = 15000) {
	const start = Date.now()
	let lastErr = null
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await axios.get(url, { validateStatus: () => true })
			if (res.status >= 200 && res.status < 500) return 
		} catch (e) {
			lastErr = e
		}
		await sleep(500)
	}
	throw new Error(
		`Service ${url} is not responding: ${lastErr?.message || 'timeout'}`
	)
}

describe('Users Service (Direct)', function () {
	this.timeout(30000)

	const now = Date.now()
	const userEmail1 = `user_${now}@example.com`
	const userEmail2 = `user2_${now}@example.com`

	let adminToken
	let user1 = { id: null, token: null }
	let user2 = { id: null, token: null }

	it('00) health check', async () => {
		await waitUntilAlive(`${BASE}/health`)
		const res = await api.get('/health')
		expect(res.status).to.equal(200)
		expect(res.data?.ok).to.equal(true)
	})

	it('1) логин админа', async () => {
		const res = await api.post('/login', {
			email: 'admin@example.com',
			password: 'admin123',
		})

		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data?.token).to.be.a('string')

		adminToken = res.data.data.token
	})

	it('2) регистрация user1', async () => {
		const res = await api.post('/register', {
			email: userEmail1,
			name: 'User One',
			password: 'pass1234',
		})

		expect(res.status).to.equal(201)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data?.id).to.be.a('string')
		expect(res.data?.data?.email).to.equal(userEmail1)
	})

	it('3) логин user1 и /me', async () => {
		const login = await api.post('/login', {
			email: userEmail1,
			password: 'pass1234',
		})
		expect(login.status).to.equal(200)
		user1.token = login.data.data.token

		const me = await api.get('/me', {
			headers: { Authorization: `Bearer ${user1.token}` },
		})
		expect(me.status).to.equal(200)
		expect(me.data?.success).to.equal(true)
		user1.id = me.data.data.id
		expect(user1.id).to.be.a('string')
	})

	it('4) admin получает список пользователей', async () => {
		const res = await api.get('/', {
			headers: { Authorization: `Bearer ${adminToken}` },
		})
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data).to.be.an('array')
		const ids = res.data.data.map(u => u.id)
		expect(ids).to.include(user1.id)
	})

	it('5) admin обновляет роли user1', async () => {
		const res = await api.patch(
			`/${user1.id}/roles`,
			{ roles: ['user', 'manager'] },
			{
				headers: { Authorization: `Bearer ${adminToken}` },
			}
		)
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data?.roles).to.include('manager')
	})

	it('6) регистрация user2', async () => {
		const reg2 = await api.post('/register', {
			email: userEmail2,
			name: 'User Two',
			password: 'pass1234',
		})
		expect(reg2.status).to.equal(201)

		const log2 = await api.post('/login', {
			email: userEmail2,
			password: 'pass1234',
		})
		expect(log2.status).to.equal(200)
		user2.token = log2.data.data.token
		user2.id = log2.data.data.user.id
	})

	it('7) user1 НЕ может получить список пользователей (403)', async () => {
		const res = await api.get('/', {
			headers: { Authorization: `Bearer ${user1.token}` },
		})
		expect(res.status).to.equal(403)
	})

	it('8) user1 НЕ может обновить чужие роли (403)', async () => {
		const res = await api.patch(
			`/${user2.id}/roles`,
			{ roles: ['user', 'admin'] },
			{
				headers: { Authorization: `Bearer ${user1.token}` },
			}
		)
		expect(res.status).to.equal(403)
	})

	it('9) запрос без токена к защищенному эндпоинту (401)', async () => {
		const res = await api.get('/')
		expect(res.status).to.equal(401)
	})

	it('10) регистрация с дублирующимся email (409)', async () => {
		const res = await api.post('/register', {
			email: userEmail1, 
			name: 'Duplicate User',
			password: 'pass1234',
		})
		expect(res.status).to.equal(409)
	})

	it('11) логин с неверным паролем (401)', async () => {
		const res = await api.post('/login', {
			email: userEmail1,
			password: 'wrongpassword',
		})
		expect(res.status).to.equal(401)
	})

	it('12) логин с несуществующим email (401)', async () => {
		const res = await api.post('/login', {
			email: 'nonexistent@example.com',
			password: 'password',
		})
		expect(res.status).to.equal(401)
	})

	it('13) валидация: регистрация без обязательных полей', async () => {
		const res = await api.post('/register', {
			email: 'test@test.com',
			// name отсутствует
			password: 'pass',
		})
		expect(res.status).to.equal(400)
	})

	it('14) валидация: некорректный email', async () => {
		const res = await api.post('/register', {
			email: 'not-an-email',
			name: 'Test',
			password: 'password123',
		})
		expect(res.status).to.equal(400)
	})

	it('15) admin обновляет роли с пустым массивом (400)', async () => {
		const res = await api.patch(
			`/${user1.id}/roles`,
			{ roles: [] },
			{
				headers: { Authorization: `Bearer ${adminToken}` },
			}
		)
		expect(res.status).to.equal(400)
	})

	it('16) обновление ролей несуществующего пользователя (404)', async () => {
		const res = await api.patch(
			'/00000000-0000-0000-0000-999999999999/roles',
			{ roles: ['user'] },
			{
				headers: { Authorization: `Bearer ${adminToken}` },
			}
		)
		expect(res.status).to.equal(404)
	})

	it('17) docs доступен без авторизации', async () => {
		const res = await api.get('/docs/')
		expect(res.status).to.equal(200)
		expect(res.data).to.include('Swagger UI')
	})
})
