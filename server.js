'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 5000;
const DATA = path.join(__dirname, 'data', 'user_credentials.json');
const WP_DIR = path.join(__dirname, 'data', 'wallpapers');

const SecKey = "Indra Arrow";


console.log("Running from:", __dirname);
console.log("Using DB file:", DATA);

// ── Middleware ──────────────────────────────────────────
app.use(express.json({ limit: '20mb' })); 
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ── Ensure dirs exist ───────────────────────────────────
fs.mkdirSync(path.dirname(DATA), { recursive: true });
fs.mkdirSync(WP_DIR,            { recursive: true });

// ── DB helpers (JSON file database) ────────────────────
function readDB() {
  try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); }
  catch { return { links: [], todos: [], settings: { theme: 'dark' } }; }
}
function writeDB(data) {
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
}
function uid() { return crypto.randomBytes(6).toString('hex'); }

// ── Wallpaper file helpers ──────────────────────────────
function wpPath(slot) { return path.join(WP_DIR, slot + '.txt'); }
function readWp(slot) {
  try { return fs.readFileSync(wpPath(slot), 'utf8'); }
  catch { return null; }
}
function writeWp(slot, dataUrl) {
  fs.writeFileSync(wpPath(slot), dataUrl, 'utf8');
}
function deleteWp(slot) {
  try { fs.unlinkSync(wpPath(slot)); } catch {}
}

// ── API: Login/Register ─────────────────────────────────────────

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const db = readDB();
  const users = db.users || {};

  console.log("Login attempt:", username);
  console.log("Users in DB:", Object.keys(users));

  if (
    !users[username] ||
    users[username].pass !== Buffer.from(password).toString('base64')
  ) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  res.json({ ok: true, username });
});

app.post('/api/register', (req, res) => {

  const { username, password, secreteKey } = req.body;
  if(secreteKey != SecKey){
    return res.status(403).json({ error: 'Invalid secret key' });
  }
  const db = readDB();
  db.users = db.users || {};
  if (db.users[username]) return res.status(409).json({ error: 'Username taken' });
  db.users[username] = { pass: Buffer.from(password).toString('base64') };
  writeDB(db);
  res.json({ ok: true });
});

// ── API: Health ─────────────────────────────────────────
app.get('/api/ping', (_req, res) => res.json({ ok: true }));

// ── API: Settings ───────────────────────────────────────
app.get('/api/settings', (_req, res) => {
  const db = readDB();
  res.json(db.settings || { theme: 'dark' });
});

app.post('/api/settings', (req, res) => {
  const db = readDB();
  db.settings = { ...db.settings, ...req.body };
  writeDB(db);
  res.json({ ok: true });
});

// ── API: Wallpapers ─────────────────────────────────────
// GET Wallpapers 
app.get('/api/wallpapers', (_req, res) => {
  res.json({ day: readWp('day'), night: readWp('night') });
});

// GET Wallpapers 
app.get('/api/wallpapers/:slot', (req, res) => {
  const slot = req.params.slot;
  if (!['day','night'].includes(slot))
    return res.status(400).json({ error: 'Slot must be day or night' });
  const dataUrl = readWp(slot);
  res.json({ slot, dataUrl });
});

// POST Wallpapers   
app.post('/api/wallpapers/:slot', (req, res) => {
  const slot = req.params.slot;
  if (!['day','night'].includes(slot))
    return res.status(400).json({ error: 'Slot must be day or night' });
  const { dataUrl } = req.body;
  if (!dataUrl || !dataUrl.startsWith('data:image/'))
    return res.status(400).json({ error: 'Invalid dataUrl' });
  writeWp(slot, dataUrl);
  res.json({ ok: true, slot });
});

// DELETE Wallpapers
app.delete('/api/wallpapers/:slot', (req, res) => {
  const slot = req.params.slot;
  if (!['day','night'].includes(slot))
    return res.status(400).json({ error: 'Slot must be day or night' });
  deleteWp(slot);
  res.json({ ok: true, slot });
});

// DELETE Wallpapers 
app.delete('/api/wallpapers', (_req, res) => {
  deleteWp('day');
  deleteWp('night');
  res.json({ ok: true });
});

// ── API: Links ──────────────────────────────────────────
app.get('/api/links', (_req, res) => {
  const db = readDB();
  res.json({ links: db.links || [] });
});

app.post('/api/links', (req, res) => {
  const db = readDB();
  const link = { id: uid(), ...req.body, createdAt: new Date().toISOString() };
  db.links = db.links || [];
  db.links.push(link);
  writeDB(db);
  res.json({ ok: true, id: link.id });
});

app.delete('/api/links/:id', (req, res) => {
  const db = readDB();
  db.links = (db.links || []).filter(l => l.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ── API: Todos ──────────────────────────────────────────
app.get('/api/todos', (_req, res) => {
  const db = readDB();
  res.json({ todos: db.todos || [] });
});

app.post('/api/todos', (req, res) => {
  const db = readDB();
  const todo = { id: uid(), ...req.body, createdAt: new Date().toISOString() };
  db.todos = db.todos || [];
  db.todos.unshift(todo);
  writeDB(db);
  res.json({ ok: true, id: todo.id });
});

app.post('/api/todos/:id/toggle', (req, res) => {
  const db = readDB();
  const todo = (db.todos || []).find(t => t.id === req.params.id);
  if (!todo) return res.status(404).json({ error: 'Not found' });
  todo.done = !todo.done;
  writeDB(db);
  res.json({ ok: true, done: todo.done });
});

app.delete('/api/todos/:id', (req, res) => {
  const db = readDB();
  db.todos = (db.todos || []).filter(t => t.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ── Fallback: serve index.html ──────────────────────────
app.get('*', (req, res) => {
  const file = req.path === '/index.html' ? 'index.html' : 'auth.html';
  res.sendFile(path.join(__dirname, 'public', file));
});

// ── Start ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✦ My Space is running!`);
  console.log(`  → Open: http://localhost:${PORT}\n`);
});
