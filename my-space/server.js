'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 5500;
const DATA = path.join(__dirname, 'data', 'db.json');
const WP_DIR = path.join(__dirname, 'data', 'wallpapers');

// ── Middleware ──────────────────────────────────────────
app.use(express.json({ limit: '20mb' }));   // wallpapers can be large base64
app.use(express.static(path.join(__dirname, 'public')));

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
// Stored as raw base64 data-URLs in data/wallpapers/{slot}.txt
// (simple, no extra deps)
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
// GET /api/wallpapers          → { day: dataUrl|null, night: dataUrl|null }
app.get('/api/wallpapers', (_req, res) => {
  res.json({ day: readWp('day'), night: readWp('night') });
});

// GET /api/wallpapers/:slot    → { slot, dataUrl: … }
app.get('/api/wallpapers/:slot', (req, res) => {
  const slot = req.params.slot;
  if (!['day','night'].includes(slot))
    return res.status(400).json({ error: 'Slot must be day or night' });
  const dataUrl = readWp(slot);
  res.json({ slot, dataUrl });
});

// POST /api/wallpapers/:slot   body: { dataUrl: "data:image/…;base64,…" }
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

// DELETE /api/wallpapers/:slot
app.delete('/api/wallpapers/:slot', (req, res) => {
  const slot = req.params.slot;
  if (!['day','night'].includes(slot))
    return res.status(400).json({ error: 'Slot must be day or night' });
  deleteWp(slot);
  res.json({ ok: true, slot });
});

// DELETE /api/wallpapers  → clear both
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
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✦ My Space is running!`);
  console.log(`  → Open: http://localhost:${PORT}\n`);
});
