'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const http    = require('http');

const app    = express();
const PORT   = process.env.PORT || 5000;
const DATA   = path.join(__dirname, 'data', 'user_credentials.json');
const DATA_db
const WP_DIR = path.join(__dirname, 'data', 'wallpapers');
const SecKey = "Indra Arrow";

// ── Middleware ──────────────────────────────────────────
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ── Ensure dirs exist ───────────────────────────────────
fs.mkdirSync(path.dirname(DATA), { recursive: true });
fs.mkdirSync(WP_DIR,             { recursive: true });

fs.mkdirSync(path.dirname(DATA_db), { recursive: true });

// ── DB helpers ──────────────────────────────────────────
function readDB() {
  try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); }
  catch { return { links: [], todos: [], settings: { theme: 'dark' } }; }
}
function writeDB(data) {
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
}
//////////////    DB.JSON    //////////////
function readDB_db() {
  try { return JSON.parse(fs.readFileSync(DATA_db, 'utf8')); }
  catch { return { links: [], todos: [], settings: { theme: 'dark' } }; }
}
function writeDB_db(data) {
  fs.writeFileSync(DATA_db, JSON.stringify(data, null, 2));
}

function uid() { return crypto.randomBytes(6).toString('hex'); }

// ── Wallpaper helpers ───────────────────────────────────
function wpPath(slot)         { return path.join(WP_DIR, slot + '.txt'); }
function readWp(slot)         { try { return fs.readFileSync(wpPath(slot), 'utf8'); } catch { return null; } }
function writeWp(slot, url)   { fs.writeFileSync(wpPath(slot), url, 'utf8'); }
function deleteWp(slot)       { try { fs.unlinkSync(wpPath(slot)); } catch {} }

// ── Face API proxy helper ───────────────────────────────
function callFaceAPI(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const opts = {
      hostname: 'localhost', port: 5001,
      path: endpoint, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Auth: Username/Password ─────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db    = readDB();
  const users = db.users || {};
  if (!users[username] || users[username].pass !== Buffer.from(password).toString('base64'))
    return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ ok: true, username });
});

app.post('/api/register', (req, res) => {
  const { username, password, secreteKey } = req.body;
  if (secreteKey !== SecKey)
    return res.status(403).json({ error: 'Invalid secret key' });
  const db = readDB();
  db.users = db.users || {};
  if (db.users[username]) return res.status(409).json({ error: 'Username taken' });
  db.users[username] = { pass: Buffer.from(password).toString('base64') };
  writeDB(db);
  res.json({ ok: true });
});

// ── Auth: Face Recognition ──────────────────────────────
app.post('/api/face-login', async (req, res) => {
  try {
    const result = await callFaceAPI('/face/login', { image: req.body.image });
    if (!result.body.ok) return res.status(401).json({ error: 'Face not recognized' });
    const username = result.body.username;
    const db = readDB();
    db.users = db.users || {};
    if (!db.users[username]) { db.users[username] = { faceOnly: true }; writeDB(db); }
    res.json({ ok: true, username });
  } catch {
    res.status(503).json({ error: 'Face service unavailable. Is face_api.py running?' });
  }
});

app.post('/api/face-register', async (req, res) => {
  const { username, secreteKey, image } = req.body;
  if (secreteKey !== SecKey) return res.status(403).json({ error: 'Invalid secret key' });
  try {
    const result = await callFaceAPI('/face/register', { username, image, secreteKey });
    if (!result.body.ok) return res.status(500).json({ error: 'Face registration failed' });
    const db = readDB();
    db.users = db.users || {};
    if (!db.users[username]) { db.users[username] = { faceOnly: true }; writeDB(db); }
    writeDB(db);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: 'Face service unavailable. Is face_api.py running?' });
  }
});

// ── Health ──────────────────────────────────────────────
app.get('/api/ping', (_req, res) => res.json({ ok: true }));

// ── Settings ────────────────────────────────────────────
app.get('/api/settings', (_req, res) => {
  const db = readDB_db();
  res.json(db.settings || { theme: 'dark' });
});
app.post('/api/settings', (req, res) => {
  const db = readDB_db();
  db.settings = { ...db.settings, ...req.body };
  writeDB_db(db);
  res.json({ ok: true });
});

// ── Wallpapers ──────────────────────────────────────────
app.get('/api/wallpapers', (_req, res) =>
  res.json({ day: readWp('day'), night: readWp('night') })
);
app.get('/api/wallpapers/:slot', (req, res) => {
  const { slot } = req.params;
  if (!['day','night'].includes(slot)) return res.status(400).json({ error: 'Slot must be day or night' });
  res.json({ slot, dataUrl: readWp(slot) });
});
app.post('/api/wallpapers/:slot', (req, res) => {
  const { slot } = req.params;
  if (!['day','night'].includes(slot)) return res.status(400).json({ error: 'Slot must be day or night' });
  const { dataUrl } = req.body;
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid dataUrl' });
  writeWp(slot, dataUrl);
  res.json({ ok: true, slot });
});
app.delete('/api/wallpapers/:slot', (req, res) => {
  const { slot } = req.params;
  if (!['day','night'].includes(slot)) return res.status(400).json({ error: 'Slot must be day or night' });
  deleteWp(slot);
  res.json({ ok: true, slot });
});
app.delete('/api/wallpapers', (_req, res) => {
  deleteWp('day'); deleteWp('night');
  res.json({ ok: true });
});

// ── Links ───────────────────────────────────────────────
app.get('/api/links', (_req, res) => {
  const db = readDB_db();
  res.json({ links: db.links || [] });
});
app.post('/api/links', (req, res) => {
  const db   = readDB_db();
  const link = { id: uid(), ...req.body, createdAt: new Date().toISOString() };
  db.links   = db.links || [];
  db.links.push(link);
  writeDB_db(db);
  res.json({ ok: true, id: link.id });
});
app.delete('/api/links/:id', (req, res) => {
  const db = readDB_db();
  db.links = (db.links || []).filter(l => l.id !== req.params.id);
  writeDB_db(db);
  res.json({ ok: true });
});

// ── Todos ───────────────────────────────────────────────
app.get('/api/todos', (_req, res) => {
  const db = readDB_db();
  res.json({ todos: db.todos || [] });
});
app.post('/api/todos', (req, res) => {
  const db   = readDB_db();
  const todo = { id: uid(), ...req.body, createdAt: new Date().toISOString() };
  db.todos   = db.todos || [];
  db.todos.unshift(todo);
  writeDB_db(db);
  res.json({ ok: true, id: todo.id });
});
app.post('/api/todos/:id/toggle', (req, res) => {
  const db   = readDB_db();
  const todo = (db.todos || []).find(t => t.id === req.params.id);
  if (!todo) return res.status(404).json({ error: 'Not found' });
  todo.done = !todo.done;
  writeDB_db(db);
  res.json({ ok: true, done: todo.done });
});
app.delete('/api/todos/:id', (req, res) => {
  const db = readDB_db();
  db.todos = (db.todos || []).filter(t => t.id !== req.params.id);
  writeDB_db(db);
  res.json({ ok: true });
});

// ── Fallback ────────────────────────────────────────────
app.get('*', (req, res) => {
  const file = req.path === '/index.html' ? 'index.html' : 'auth.html';
  res.sendFile(path.join(__dirname, 'public', file));
});

// ── Start ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✦ My Space is running!`);
  console.log(`  → Open: http://localhost:${PORT}\n`);
  console.log(`  → Face API should run separately: python Face_Recognition/face_api.py\n`);
});
