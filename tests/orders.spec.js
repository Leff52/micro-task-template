const axios = require('axios')
const { expect } = require('chai')

const BASE = process.env.BASE_URL || 'http://localhost:4002'

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

describe('Orders Service (Direct)', function () {
	this.timeout(30000) 

	const USERS_URL = process.env.USERS_URL || 'http://localhost:4001'

	let adminToken
	let userToken
	let user2Token
	let userId
	let user2Id
	let order1 = { id: null }
	let order2 = { id: null }

	async function getUsersApi(method, path, data, token) {
		const config = {
			method,
			url: `${USERS_URL}${path}`,
			headers: { 'Content-Type': 'application/json' },
			validateStatus: () => true,
		}
		if (data) config.data = data
		if (token) config.headers.Authorization = `Bearer ${token}`
		return axios(config)
	}

	before('Подготовка: получаем токены от users-сервиса', async function () {
		this.timeout(10000)

		const adminLogin = await getUsersApi('POST', '/login', {
			email: 'admin@example.com',
			password: 'admin123',
		})
		expect(adminLogin.status).to.equal(200)
		adminToken = adminLogin.data.data.token

		const now = Date.now()
		const userEmail = `order_user_${now}@example.com`
		await getUsersApi('POST', '/register', {
			email: userEmail,
			name: 'Order User',
			password: 'pass1234',
		})

		const userLogin = await getUsersApi('POST', '/login', {
			email: userEmail,
			password: 'pass1234',
		})
		expect(userLogin.status).to.equal(200)
		userToken = userLogin.data.data.token
		userId = userLogin.data.data.user.id

		const user2Email = `order_user2_${now}@example.com`
		await getUsersApi('POST', '/register', {
			email: user2Email,
			name: 'Order User 2',
			password: 'pass1234',
		})

		const user2Login = await getUsersApi('POST', '/login', {
			email: user2Email,
			password: 'pass1234',
		})
		expect(user2Login.status).to.equal(200)
		user2Token = user2Login.data.data.token
		user2Id = user2Login.data.data.user.id
	})

	it('00) health check', async () => {
		await waitUntilAlive(`${BASE}/health`)
		const res = await api.get('/health')
		expect(res.status).to.equal(200)
		expect(res.data?.ok).to.equal(true)
	})

	it('1) создание заказа user1', async () => {
		const res = await api.post(
			'/',
			{ title: 'First order', description: 'Test order 1' },
			{
				headers: { Authorization: `Bearer ${userToken}` },
			}
		)
		expect(res.status).to.equal(201)
		expect(res.data?.success).to.equal(true)
		order1.id = res.data.data.id
		expect(order1.id).to.be.a('string')
		expect(res.data.data.status).to.equal('created')
		expect(res.data.data.ownerId).to.equal(userId)
	})

	it('2) user1 видит свой заказ в списке', async () => {
		const res = await api.get('/', {
			headers: { Authorization: `Bearer ${userToken}` },
		})
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		const { items } = res.data.data
		const ids = items.map(o => o.id)
		expect(ids).to.include(order1.id)
	})

	it('3) пагинация работает', async () => {
		const res = await api.get('/?page=1&limit=2', {
			headers: { Authorization: `Bearer ${userToken}` },
		})
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		const { items, page, limit, total, pages } = res.data.data
		expect(page).to.equal(1)
		expect(limit).to.equal(2)
		expect(total).to.be.greaterThan(0)
		expect(pages).to.be.greaterThan(0)
		expect(items).to.be.an('array')
	})

	it('4) user1 получает свой заказ по id', async () => {
		const res = await api.get(`/${order1.id}`, {
			headers: { Authorization: `Bearer ${userToken}` },
		})
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data?.id).to.equal(order1.id)
		expect(res.data?.data?.title).to.equal('First order')
	})

	it('5) user1 НЕ может поставить статус completed (403)', async () => {
		const res = await api.patch(
			`/${order1.id}/status`,
			{ status: 'completed' },
			{
				headers: { Authorization: `Bearer ${userToken}` },
			}
		)
		expect(res.status).to.equal(403)
		expect(res.data?.success).to.equal(false)
	})

	it('6) user1 может отменить свой заказ', async () => {
		const res = await api.patch(
			`/${order1.id}/status`,
			{ status: 'cancelled' },
			{
				headers: { Authorization: `Bearer ${userToken}` },
			}
		)
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data?.status).to.equal('cancelled')
	})

	it('7) admin может выставить processing', async () => {
		const res = await api.patch(
			`/${order1.id}/status`,
			{ status: 'processing' },
			{
				headers: { Authorization: `Bearer ${adminToken}` },
			}
		)
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data?.status).to.equal('processing')
	})

	it('8) admin может выставить completed', async () => {
		const res = await api.patch(
			`/${order1.id}/status`,
			{ status: 'completed' },
			{
				headers: { Authorization: `Bearer ${adminToken}` },
			}
		)
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		expect(res.data?.data?.status).to.equal('completed')
	})

	it('9) completed заказ нельзя изменить (409)', async () => {
		const res = await api.patch(
			`/${order1.id}/status`,
			{ status: 'processing' },
			{
				headers: { Authorization: `Bearer ${adminToken}` },
			}
		)
		expect(res.status).to.equal(409)
	})

	it('10) user2 создаёт свой заказ', async () => {
		const res = await api.post(
			'/',
			{ title: 'Second order', description: 'Test order 2' },
			{
				headers: { Authorization: `Bearer ${user2Token}` },
			}
		)
		expect(res.status).to.equal(201)
		order2.id = res.data.data.id
		expect(res.data.data.ownerId).to.equal(user2Id)
	})

	it('11) user1 НЕ может видеть чужой заказ (403)', async () => {
		const res = await api.get(`/${order2.id}`, {
			headers: { Authorization: `Bearer ${userToken}` },
		})
		expect(res.status).to.equal(403)
	})

	it('12) user1 НЕ может изменить чужой заказ (403)', async () => {
		const res = await api.patch(
			`/${order2.id}/status`,
			{ status: 'cancelled' },
			{
				headers: { Authorization: `Bearer ${userToken}` },
			}
		)
		expect(res.status).to.equal(403)
	})

	it('13) admin видит все заказы с all=1', async () => {
		const res = await api.get('/?all=1&limit=100', {
			headers: { Authorization: `Bearer ${adminToken}` },
		})
		expect(res.status).to.equal(200)
		expect(res.data?.success).to.equal(true)
		const { items } = res.data.data
		expect(items).to.be.an('array')
		// проверяем что оба созданных в этой сессии заказа есть
		const ids = items.map(o => o.id)
		expect(ids).to.include(order1.id)
		expect(ids).to.include(order2.id)
	})

	it('14) обычный user НЕ может использовать all=1 (видит только свои)', async () => {
		const res = await api.get('/?all=1', {
			headers: { Authorization: `Bearer ${userToken}` },
		})
		expect(res.status).to.equal(200)
		const { items } = res.data.data
		// user1 должен видеть только свои заказы
		items.forEach(order => {
			expect(order.ownerId).to.equal(userId)
		})
	})

	it('15) запрос без токена (401)', async () => {
		const res = await api.get('/')
		expect(res.status).to.equal(401)
	})

	it('16) создание заказа без title (400)', async () => {
		const res = await api.post(
			'/',
			{ description: 'No title' },
			{
				headers: { Authorization: `Bearer ${userToken}` },
			}
		)
		expect(res.status).to.equal(400)
	})

	it('17) обновление статуса несуществующего заказа (404)', async () => {
		const res = await api.patch(
			'/00000000-0000-0000-0000-999999999999/status',
			{ status: 'processing' },
			{
				headers: { Authorization: `Bearer ${adminToken}` },
			}
		)
		expect(res.status).to.equal(404)
	})

	it('18) валидация: некорректный статус (400)', async () => {
		const res = await api.patch(
			`/${order2.id}/status`,
			{ status: 'invalid_status' },
			{
				headers: { Authorization: `Bearer ${adminToken}` },
			}
		)
		expect(res.status).to.equal(400)
	})

	it('19) получение несуществующего заказа (404)', async () => {
		const res = await api.get('/00000000-0000-0000-0000-999999999999', {
			headers: { Authorization: `Bearer ${adminToken}` },
		})
		expect(res.status).to.equal(404)
	})

	it('20) пагинация с некорректными параметрами', async () => {
		const res = await api.get('/?page=0&limit=1000', {
			headers: { Authorization: `Bearer ${userToken}` },
		})
		expect(res.status).to.equal(200)
		const { page, limit } = res.data.data
		expect(page).to.equal(1) 
		expect(limit).to.be.at.most(100) 
	})
})
