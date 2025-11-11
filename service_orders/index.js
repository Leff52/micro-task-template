const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const pinoHttp = require('pino-http');

const { logger } = require('./utils/logger');
const { requestLogger } = require('./middleware/requestLogger');

const PORT = process.env.PORT || 4002;
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

async function readOrders() {
  try {
    const raw = await fs.readFile(ORDERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function writeOrders(orders) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = ORDERS_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(orders, null, 2), 'utf8');
  await fs.rename(tmp, ORDERS_FILE);
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const [, token] = header.split(' ');
  if (!token) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token' } });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, roles }
    next();
  } catch {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }
}

function isAdmin(req) {
  return Array.isArray(req.user?.roles) && req.user.roles.includes('admin');
}

const OrderCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().max(1000).optional(),
});

const StatusSchema = z.object({
  status: z.enum(['created', 'processing', 'completed', 'cancelled']),
});

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '10', 10) || 10));
  return { page, limit, offset: (page - 1) * limit };
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));
app.use(requestLogger);

app.get('/health', (_req, res) => res.json({ ok: true, service: 'orders' }));

app.post('/', authRequired, async (req, res) => {
  const parse = OrderCreateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parse.error.message } });
  }

  const now = new Date().toISOString();
  const order = {
    id: uuidv4(),
    title: parse.data.title,
    description: parse.data.description || '',
    ownerId: req.user.id,
    status: 'created',
    createdAt: now,
    updatedAt: now,
  };

  const orders = await readOrders();
  orders.push(order);
  await writeOrders(orders);

  return res.status(201).json({ success: true, data: order });
});

app.get('/', authRequired, async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const wantAll = req.query.all === '1' || req.query.all === 'true';

  const orders = await readOrders();
  const visible = isAdmin(req) && wantAll ? orders : orders.filter(o => o.ownerId === req.user.id);

  const total = visible.length;
  const items = visible.slice(offset, offset + limit);
  const pages = Math.max(1, Math.ceil(total / limit));

  return res.json({ success: true, data: { items, page, limit, total, pages } });
});

app.get('/:id', authRequired, async (req, res) => {
  const orders = await readOrders();
  const order = orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
  }
  if (order.ownerId !== req.user.id && !isAdmin(req)) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
  }
  return res.json({ success: true, data: order });
});

// владелец может только 'cancelled',а админ admin  'processing'|'completed'|'cancelled'
app.patch('/:id/status', authRequired, async (req, res) => {
  const parse = StatusSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parse.error.message } });
  }
  const newStatus = parse.data.status;

  const orders = await readOrders();
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
  }

  const order = orders[idx];

  // правила доступа
  if (isAdmin(req)) {
    // admin  любые из перечисленных, без доп ограничений
  } else {
    if (order.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not your order' } });
    }
    if (newStatus !== 'cancelled') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Owner can only set status to cancelled' },
      });
    }
  }

  // completed заказ нельзя изменить никому
  if (order.status === 'completed') {
    return res.status(409).json({
      success: false,
      error: { code: 'STATUS_LOCKED', message: 'Completed order cannot be changed' },
    });
  }

  order.status = newStatus;
  order.updatedAt = new Date().toISOString();
  orders[idx] = order;
  await writeOrders(orders);

  return res.json({ success: true, data: order });
});

app.use((err, _req, res, _next) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Server error' } });
});

app.listen(PORT, () => logger.info({ port: PORT }, 'Orders service started'));
