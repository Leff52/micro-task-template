const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const pinoHttp = require('pino-http');

const { logger } = require('./utils/logger');
const { requestLogger } = require('./middleware/requestLogger');

const PORT = process.env.PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SEED_FILE = path.join(__dirname, 'docs', 'users.json');

async function readUsers() {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function writeUsers(users) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = USERS_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(users, null, 2), 'utf8');
  await fs.rename(tmp, USERS_FILE);
}

async function ensureSeed() {
  const users = await readUsers();
  if (users.length > 0) return;

  try {
    const seedRaw = await fs.readFile(SEED_FILE, 'utf8');
    const seed = JSON.parse(seedRaw);
    if (Array.isArray(seed) && seed.length > 0) {
      await writeUsers(seed);
      logger.info({ count: seed.length }, 'Seeded users from docs/users.json');
    }
  } catch (e) {
    logger.warn({ err: e }, 'No seed file found or failed to seed');
  }
}

function signToken(user) {
  const payload = { id: user.id, email: user.email, roles: user.roles || [] };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const [, token] = header.split(' ');
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token' },
    });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    });
  }
}

function adminOnly(req, res, next) {
  const roles = (req.user && req.user.roles) || [];
  if (roles.includes('admin')) return next();
  return res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message: 'Admin role required' },
  });
}

const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RolesSchema = z.object({
  roles: z.array(z.string().min(1)).min(1),
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));
app.use(requestLogger);

app.get('/health', (_req, res) =>
  res.json({ ok: true, service: 'users' })
);

app.post('/register', async (req, res) => {
  const parse = RegisterSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parse.error.message },
    });
  }

  const { email, name, password } = parse.data;
  const users = await readUsers();
  const exists = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return res.status(409).json({
      success: false,
      error: { code: 'EMAIL_EXISTS', message: 'User with this email already exists' },
    });
  }

  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(),
    email,
    name,
    password: hash,
    roles: ['user'],
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeUsers(users);

  const { password: _, ...safe } = user;
  return res.status(201).json({ success: true, data: safe });
});

app.post('/login', async (req, res) => {
  const parse = LoginSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parse.error.message },
    });
  }

  const { email, password } = parse.data;
  const users = await readUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });
  }

  const token = signToken(user);
  const { password: _, ...safe } = user;
  return res.json({ success: true, data: { token, user: safe } });
});

app.get('/me', authRequired, async (req, res) => {
  const users = await readUsers();
  const user = users.find((u) => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' },
    });
  }
  const { password: _, ...safe } = user;
  return res.json({ success: true, data: safe });
});

app.get('/', authRequired, adminOnly, async (_req, res) => {
  const users = await readUsers();
  const safe = users.map(({ password, ...rest }) => rest);
  return res.json({ success: true, data: safe });
});

app.patch('/:id/roles', authRequired, adminOnly, async (req, res) => {
  const parse = RolesSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parse.error.message },
    });
  }
  const { roles } = parse.data;

  const users = await readUsers();
  const idx = users.findIndex((u) => u.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' },
    });
  }

  users[idx].roles = roles;
  await writeUsers(users);
  const { password: _, ...safe } = users[idx];
  return res.json({ success: true, data: safe });
});

app.use((err, _req, res, _next) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL', message: 'Server error' },
  });
});

(async () => {
  await ensureSeed();
  app.listen(PORT, () => logger.info({ port: PORT }, 'Users service started'));
})();
