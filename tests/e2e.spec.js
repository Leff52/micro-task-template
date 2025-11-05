const axios = require('axios')
const { expect } = require('chai')

const BASE = process.env.BASE_URL || 'http://localhost:3000'

// хелперы
const api = axios.create({
	baseURL: BASE,
	validateStatus: () => true, // сами статусы
	headers: { 'Content-Type': 'application/json' },
})

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitUntilAlive(url, timeoutMs = 15000) {
	const start = Date.now()
	let lastErr = null
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await axios.get(url, { validateStatus: () => true })
			if (res.status >= 200 && res.status < 500) return // сервис отвечает
		} catch (e) {
			lastErr = e
		}
		await sleep(500)
	}
	throw new Error(
		`Service ${url} is not responding: ${lastErr?.message || 'timeout'}`
	)
}

describe('E2E: Users + Orders', function () {
	this.timeout(200000) // 200s на весь набор тестов

	// сущности во время прогонов
	const now = Date.now()
	const userEmail1 = `user_${now}@example.com`
	const userEmail2 = `user2_${now}@example.com`

	let adminToken
	let user1 = { id: null, token: null }
	let user2 = { id: null, token: null }
	let order1 = { id: null }

	it('00) users-сервис отвечает (через gateway)', async () => {
		const res = await api.post('/v1/users/login', {})
		expect(res.status).to.be.oneOf([200, 400, 401])
	})

	it('01) логин админа', async () => {
		await waitUntilAlive(`${BASE}/v1/users/login`)
		const res = await api.post('/v1/users/login', {
			email: 'admin@example.com',
			password: 'admin123',
		})

		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data?.token).to.be.a('string')

		adminToken = res.data.data.token
	})

	it('02) регистрация user1', async () => {
		const res = await api.post('/v1/users/register', {
			email: userEmail1,
			name: 'User One',
			password: 'pass1234',
		})

		expect(res.status).to.equal(201)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data?.id).to.be.a('string')
		expect(res.data?.data?.email).to.equal(userEmail1)
	})

	it('03) логин user1 и /me', async () => {
		const login = await api.post('/v1/users/login', {
			email: userEmail1,
			password: 'pass1234',
		})
		expect(login.status).to.equal(200)
		user1.token = login.data.data.token
		const me = await api.get('/v1/users/me', {
			headers: { Authorization: `Bearer ${user1.token}` },
		})
		expect(me.status).to.equal(200)
		expect(me.data?.success).to.equal(true)
		user1.id = me.data.data.id
		expect(user1.id).to.be.a('string')
	})

	it('04) admin получает список пользователей', async () => {
		const res = await api.get('/v1/users/', {
			headers: { Authorization: `Bearer ${adminToken}` },
		})
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data).to.be.an('array')
		const ids = res.data.data.map(u => u.id)
		expect(ids).to.include(user1.id)
	})

	it('05) admin обновляет роли user1', async () => {
		const res = await api.patch(
			`/v1/users/${user1.id}/roles`,
			{ roles: ['user', 'manager'] },
			{
				headers: { Authorization: `Bearer ${adminToken}` },
			}
		)
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data?.roles).to.include('manager')
	})

	it('06) user1 создаёт заказ', async () => {
		const res = await api.post(
			'/v1/orders',
			{ title: 'First order', description: 'via tests' },
			{
				headers: { Authorization: `Bearer ${user1.token}` },
			}
		)
		expect(res.status).to.equal(201)
		expect(res.data?.success).to.equal(true)
		order1.id = res.data.data.id
		expect(order1.id).to.be.a('string')
	})

	it('07) user1 видит свой заказ в списке + пагинация', async () => {
		const res = await api.get('/v1/orders?page=1&limit=2', {
			headers: { Authorization: `Bearer ${user1.token}` },
		})
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		const { items, page, limit, total, pages } = res.data.data
		expect(page).to.equal(1)
		expect(limit).to.equal(2)
		expect(total).to.be.greaterThan(0)
		expect(pages).to.be.greaterThan(0)
		const ids = items.map(o => o.id)
		expect(ids).to.include(order1.id)
	})

	it('08) user1 получает свой заказ по id', async () => {
		const res = await api.get(`/v1/orders/${order1.id}`, {
			headers: { Authorization: `Bearer ${user1.token}` },
		})
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data?.id).to.equal(order1.id)
	})

	it('09) user1 НЕ может поставить статус completed (ожидаем 403)', async () => {
		const res = await api.patch(
			`/v1/orders/${order1.id}/status`,
			{ status: 'completed' },
			{
				headers: { Authorization: `Bearer ${user1.token}` },
			}
		)
		expect(res.status).to.equal(403)
		expect(res.data?.success).to.equal(false)
	})

	it('10) user1 может отменить свой заказ', async () => {
		const res = await api.patch(
			`/v1/orders/${order1.id}/status`,
			{ status: 'cancelled' },
			{
				headers: { Authorization: `Bearer ${user1.token}` },
			}
		)
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data?.status).to.equal('cancelled')
	})

	it('11) admin может выставить processing', async () => {
		const res = await api.patch(
			`/v1/orders/${order1.id}/status`,
			{ status: 'processing' },
			{
				headers: { Authorization: `Bearer ${adminToken}` },
			}
		)
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data?.status).to.equal('processing')
	})

	it('12) проверяем доступ к чужому заказу (создадим user2 и его заказ)', async () => {
		const reg2 = await api.post('/v1/users/register', {
			email: userEmail2,
			name: 'User Two',
			password: 'pass1234',
		})
		expect(reg2.status).to.equal(201)

		const log2 = await api.post('/v1/users/login', {
			email: userEmail2,
			password: 'pass1234',
		})
		expect(log2.status).to.equal(200)
		user2.token = log2.data.data.token

		// user2 создаёт свой заказ
		const ord2 = await api.post(
			'/v1/orders',
			{ title: 'Second order' },
			{
				headers: { Authorization: `Bearer ${user2.token}` },
			}
		)
		expect(ord2.status).to.equal(201)
		const otherOrderId = ord2.data.data.id

		// user1 пытается читать чужой заказ
		const forbidden = await api.get(`/v1/orders/${otherOrderId}`, {
			headers: { Authorization: `Bearer ${user1.token}` },
		})
		expect(forbidden.status).to.be.oneOf([403, 404])
	})

	it('13) admin видит все заказы с all=1', async () => {
		const res = await api.get('/v1/orders?all=1', {
			headers: { Authorization: `Bearer ${adminToken}` },
		})
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		const { items } = res.data.data
		expect(items).to.be.an('array')
		// вероятнее всего есть как минимум 2 заказа
		expect(items.length).to.be.greaterThan(0)
	})
})
