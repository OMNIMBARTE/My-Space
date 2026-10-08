'use strict';

const express    = require('express');
const compression= require('compression');
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');
const http       = require('http');

const app  = express();
const PORT = process.env.PORT || 5000;

const DATA_CREDS = path.join(__dirname, 'data', 'user_credentials.json');
const DATA_DB    = path.join(__dirname, 'data', 'db.json');
const SESSIONS_F = path.join(__dirname, 'data', 'sessions.json');
const WP_DIR     = path.join(__dirname, 'data', 'wallpapers');
const SecKey     = "Indra Arrow";

// ── Ensure directories exist ────────────────────────────
fs.mkdirSync(path.dirname(DATA_CREDS), { recursive: true });
fs.mkdirSync(path.dirname(DATA_DB),    { recursive: true });
fs.mkdirSync(WP_DIR,                   { recursive: true });

// ── In-Memory Fast Caches ───────────────────────────────
let credsCache = { users: {} };
let dbCache    = { links: [], todos: [], settings: { theme: 'dark' } };
const sessions = new Map(); // token -> { username, createdAt, expiresAt }
const wpCache  = { day: null, night: null };

// Load Credentials Cache
try {
  if (fs.existsSync(DATA_CREDS)) {
    credsCache = JSON.parse(fs.readFileSync(DATA_CREDS, 'utf8'));
    if (!credsCache.users) credsCache.users = {};
  }
} catch (e) {
  console.warn('[Server] Initializing fresh credentials store');
  credsCache = { users: {} };
}

// Load DB Cache
try {
  if (fs.existsSync(DATA_DB)) {
    dbCache = JSON.parse(fs.readFileSync(DATA_DB, 'utf8'));
    if (!dbCache.links)    dbCache.links = [];
    if (!dbCache.todos)    dbCache.todos = [];
    if (!dbCache.settings) dbCache.settings = { theme: 'dark' };
  }
} catch (e) {
  console.warn('[Server] Initializing fresh database store');
  dbCache = { links: [], todos: [], settings: { theme: 'dark' } };
}

// Load Sessions Cache
try {
  if (fs.existsSync(SESSIONS_F)) {
    const rawSessions = JSON.parse(fs.readFileSync(SESSIONS_F, 'utf8'));
    const now = Date.now();
    for (const [tok, sess] of Object.entries(rawSessions)) {
      if (sess.expiresAt > now) sessions.set(tok, sess);
    }
  }
} catch (e) {
  // Fresh sessions map
}

// Load Wallpapers Cache
function wpPath(slot) { return path.join(WP_DIR, slot + '.txt'); }
try {
  wpCache.day   = fs.existsSync(wpPath('day'))   ? fs.readFileSync(wpPath('day'), 'utf8')   : null;
  wpCache.night = fs.existsSync(wpPath('night')) ? fs.readFileSync(wpPath('night'), 'utf8') : null;
} catch (e) {
  console.warn('[Server] Error preloading wallpapers:', e.message);
}

// ── Async Non-Blocking Disk Persisters ──────────────────
let credsSaveTimer = null;
function persistCreds() {
  clearTimeout(credsSaveTimer);
  credsSaveTimer = setTimeout(() => {
    fs.promises.writeFile(DATA_CREDS, JSON.stringify(credsCache, null, 2), 'utf8')
      .catch(err => console.error('[Server] Error saving credentials:', err));
  }, 50);
}

let dbSaveTimer = null;
function persistDB() {
  clearTimeout(dbSaveTimer);
  dbSaveTimer = setTimeout(() => {
    fs.promises.writeFile(DATA_DB, JSON.stringify(dbCache, null, 2), 'utf8')
      .catch(err => console.error('[Server] Error saving database:', err));
  }, 50);
}

let sessionsSaveTimer = null;
function persistSessions() {
  clearTimeout(sessionsSaveTimer);
  sessionsSaveTimer = setTimeout(() => {
    const obj = {};
    for (const [t, s] of sessions.entries()) obj[t] = s;
    fs.promises.writeFile(SESSIONS_F, JSON.stringify(obj, null, 2), 'utf8')
      .catch(err => console.error('[Server] Error saving sessions:', err));
  }, 100);
}

// ── Session Helpers ─────────────────────────────────────
function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  const session = {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  };
  sessions.set(token, session);
  persistSessions();
  return token;
}

function verifySessionToken(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    persistSessions();
    return null;
  }
  return session;
}

function requireAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  }
  const session = verifySessionToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
  }
  req.user = session.username;
  next();
}

// ── Password Hashing Helpers ────────────────────────────
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(userObj, password) {
  if (!userObj) return false;

  // Salted scrypt hash (modern, secure)
  if (userObj.salt && userObj.hash) {
    try {
      const derived = hashPassword(password, userObj.salt);
      const a = Buffer.from(derived, 'hex');
      const b = Buffer.from(userObj.hash, 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  // Backward compatibility with legacy base64 passwords
  if (userObj.pass) {
    const legacyBase64 = Buffer.from(password).toString('base64');
    if (userObj.pass === legacyBase64) {
      // Auto-upgrade to modern salted scrypt hash
      const salt = crypto.randomBytes(16).toString('hex');
      userObj.salt = salt;
      userObj.hash = hashPassword(password, salt);
      delete userObj.pass;
      persistCreds();
      return true;
    }
  }

  return false;
}

function uid() { return crypto.randomBytes(6).toString('hex'); }

// ── HTTP Agent for Keep-Alive Face API Proxy ────────────
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10, timeout: 15000 });

function callFaceAPI(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const opts = {
      hostname: '127.0.0.1',
      port: 5001,
      path: endpoint,
      method: 'POST',
      agent: httpAgent,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(new Error(`Failed to parse Face API response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => {
      req.destroy(new Error('Face API request timed out'));
    });
    req.write(body);
    req.end();
  });
}

// ── Middleware ──────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '15mb' }));

// Static files with sensible caching headers
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  etag: true,
  lastModified: true,
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// ── Auth Endpoints ──────────────────────────────────────

// Check session validity
app.get('/api/auth/verify', (req, res) => {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  }
  const session = verifySessionToken(token);
  if (!session) return res.status(401).json({ ok: false, error: 'Invalid session' });
  res.json({ ok: true, username: session.username });
});

// Logout
app.post('/api/logout', (req, res) => {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  }
  if (token && sessions.has(token)) {
    sessions.delete(token);
    persistSessions();
  }
  res.json({ ok: true });
});

// Standard Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = credsCache.users[username];
  if (!user || !verifyPassword(user, password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = createSession(username);
  res.json({ ok: true, username, token });
});

// Standard Registration
app.post('/api/register', (req, res) => {
  const { username, password, secreteKey, secretKey } = req.body;
  const key = secretKey || secreteKey;

  if (key !== SecKey) {
    return res.status(403).json({ error: 'Invalid secret key' });
  }
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const trimmedUser = username.trim();
  if (!/^[a-zA-Z0-9_\-\@\.]+$/.test(trimmedUser)) {
    return res.status(400).json({ error: 'Username contains invalid characters' });
  }
  if (['no_persons_found', 'unknown_person'].includes(trimmedUser.toLowerCase())) {
    return res.status(400).json({ error: 'Reserved username' });
  }

  if (credsCache.users[trimmedUser]) {
    return res.status(409).json({ error: 'Username taken' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  credsCache.users[trimmedUser] = { salt, hash };
  persistCreds();

  const token = createSession(trimmedUser);
  res.json({ ok: true, username: trimmedUser, token });
});

// Face Login
app.post('/api/face-login', async (req, res) => {
  if (!req.body.image) {
    return res.status(400).json({ error: 'Image is required' });
  }
  try {
    const result = await callFaceAPI('/face/login', { image: req.body.image });
    if (!result.body.ok) {
      return res.status(result.status || 401).json({
        error: result.body.error || 'Face not recognized'
      });
    }

    const username = result.body.username;
    if (['no_persons_found', 'unknown_person'].includes(username.toLowerCase())) {
      return res.status(401).json({ error: 'Face not recognized' });
    }

    // Ensure user profile in credentials
    if (!credsCache.users[username]) {
      credsCache.users[username] = { faceOnly: true };
      persistCreds();
    }

    const token = createSession(username);
    res.json({
      ok: true,
      username,
      token,
      confidence: result.body.confidence,
      distance: result.body.distance
    });
  } catch (err) {
    res.status(503).json({
      error: 'Face recognition service is unavailable. Please make sure face_api.py is running.'
    });
  }
});

// Face Registration
app.post('/api/face-register', async (req, res) => {
  const { username, secreteKey, secretKey, image } = req.body;
  const key = secretKey || secreteKey;

  if (key !== SecKey) {
    return res.status(403).json({ error: 'Invalid secret key' });
  }
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }
  if (!image) {
    return res.status(400).json({ error: 'Face snapshot is required' });
  }

  const trimmedUser = username.trim();
  if (!/^[a-zA-Z0-9_\-\@\.]+$/.test(trimmedUser)) {
    return res.status(400).json({ error: 'Username contains invalid characters' });
  }
  if (['no_persons_found', 'unknown_person'].includes(trimmedUser.toLowerCase())) {
    return res.status(400).json({ error: 'Reserved username' });
  }

  try {
    const result = await callFaceAPI('/face/register', {
      username: trimmedUser,
      image,
      secretKey: key
    });

    if (!result.body.ok) {
      return res.status(result.status || 400).json({
        error: result.body.error || 'Face registration failed'
      });
    }

    if (!credsCache.users[trimmedUser]) {
      credsCache.users[trimmedUser] = { faceOnly: true };
    } else {
      credsCache.users[trimmedUser].faceRegistered = true;
    }
    persistCreds();

    const token = createSession(trimmedUser);
    res.json({ ok: true, username: trimmedUser, token });
  } catch (err) {
    res.status(503).json({
      error: 'Face recognition service is unavailable. Please make sure face_api.py is running.'
    });
  }
});

// ── Health ──────────────────────────────────────────────
app.get('/api/ping', (_req, res) => res.json({ ok: true }));

// ── Protected Application Endpoints ─────────────────────

// Settings
app.get('/api/settings', requireAuth, (_req, res) => {
  res.json(dbCache.settings || { theme: 'dark' });
});
app.post('/api/settings', requireAuth, (req, res) => {
  dbCache.settings = { ...dbCache.settings, ...req.body };
  persistDB();
  res.json({ ok: true });
});

// Wallpapers
app.get('/api/wallpapers', requireAuth, (_req, res) => {
  res.json({ day: wpCache.day, night: wpCache.night });
});
app.get('/api/wallpapers/:slot', requireAuth, (req, res) => {
  const { slot } = req.params;
  if (!['day','night'].includes(slot)) return res.status(400).json({ error: 'Slot must be day or night' });
  res.json({ slot, dataUrl: wpCache[slot] });
});
app.post('/api/wallpapers/:slot', requireAuth, (req, res) => {
  const { slot } = req.params;
  if (!['day','night'].includes(slot)) return res.status(400).json({ error: 'Slot must be day or night' });
  const { dataUrl } = req.body;
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid dataUrl' });

  wpCache[slot] = dataUrl;
  fs.promises.writeFile(wpPath(slot), dataUrl, 'utf8').catch(err => {
    console.error(`[Server] Error saving wallpaper ${slot}:`, err);
  });
  res.json({ ok: true, slot });
});
app.delete('/api/wallpapers/:slot', requireAuth, (req, res) => {
  const { slot } = req.params;
  if (!['day','night'].includes(slot)) return res.status(400).json({ error: 'Slot must be day or night' });

  wpCache[slot] = null;
  fs.promises.unlink(wpPath(slot)).catch(() => {});
  res.json({ ok: true, slot });
});
app.delete('/api/wallpapers', requireAuth, (_req, res) => {
  wpCache.day = null;
  wpCache.night = null;
  fs.promises.unlink(wpPath('day')).catch(() => {});
  fs.promises.unlink(wpPath('night')).catch(() => {});
  res.json({ ok: true });
});

// Links
app.get('/api/links', requireAuth, (_req, res) => {
  res.json({ links: dbCache.links || [] });
});
app.post('/api/links', requireAuth, (req, res) => {
  const link = { id: uid(), ...req.body, createdAt: new Date().toISOString() };
  dbCache.links = dbCache.links || [];
  dbCache.links.push(link);
  persistDB();
  res.json({ ok: true, id: link.id });
});
app.delete('/api/links/:id', requireAuth, (req, res) => {
  dbCache.links = (dbCache.links || []).filter(l => l.id !== req.params.id);
  persistDB();
  res.json({ ok: true });
});

// Todos
app.get('/api/todos', requireAuth, (_req, res) => {
  res.json({ todos: dbCache.todos || [] });
});
app.post('/api/todos', requireAuth, (req, res) => {
  const todo = { id: uid(), ...req.body, createdAt: new Date().toISOString() };
  dbCache.todos = dbCache.todos || [];
  dbCache.todos.unshift(todo);
  persistDB();
  res.json({ ok: true, id: todo.id });
});
app.post('/api/todos/:id/toggle', requireAuth, (req, res) => {
  const todo = (dbCache.todos || []).find(t => t.id === req.params.id);
  if (!todo) return res.status(404).json({ error: 'Not found' });
  todo.done = !todo.done;
  persistDB();
  res.json({ ok: true, done: todo.done });
});
app.delete('/api/todos/:id', requireAuth, (req, res) => {
  dbCache.todos = (dbCache.todos || []).filter(t => t.id !== req.params.id);
  persistDB();
  res.json({ ok: true });
});

// ── Fallback SPA Routing ────────────────────────────────
app.get('*', (req, res) => {
  const file = req.path === '/index.html' ? 'index.html' : 'auth.html';
  res.sendFile(path.join(__dirname, 'public', file));
});

// ── Start ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✦ My Space is running!`);
  console.log(`  → Open: http://localhost:${PORT}\n`);
  console.log(`  → Face API service runs on: http://localhost:5001\n`);
});
