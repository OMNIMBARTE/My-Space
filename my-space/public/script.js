'use strict';

/* ══════════════════════════════════════════════════
   CURSOR GLOW
══════════════════════════════════════════════════ */
const cursorGlow = document.getElementById('cursor-glow');
let mouseX = 0, mouseY = 0, glowX = 0, glowY = 0;
document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
function animateGlow() {
  glowX += (mouseX - glowX) * 0.10;
  glowY += (mouseY - glowY) * 0.10;
  cursorGlow.style.left = glowX + 'px';
  cursorGlow.style.top  = glowY + 'px';
  requestAnimationFrame(animateGlow);
}
animateGlow();

/* ══════════════════════════════════════════════════
   STAR / PARTICLE CANVAS
══════════════════════════════════════════════════ */
(function() {
  const canvas = document.getElementById('star-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H, stars = [];
  const COUNT = 120;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  function mkStar() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.4 + 0.3,
      a: Math.random(),
      speed: Math.random() * 0.004 + 0.002,
      phase: Math.random() * Math.PI * 2
    };
  }
  function init() {
    resize();
    stars = Array.from({ length: COUNT }, mkStar);
  }
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    stars.forEach(s => {
      const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.speed * 1000 + s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,185,255,${alpha * s.a})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize', resize);
  init();
  requestAnimationFrame(draw);
})();

/* ══════════════════════════════════════════════════
   PARALLAX WALLPAPER
══════════════════════════════════════════════════ */
const wpDayEl   = document.getElementById('wp-day');
const wpNightEl = document.getElementById('wp-night');
document.addEventListener('mousemove', e => {
  const xPct = (e.clientX / window.innerWidth  - 0.5) * 12;
  const yPct = (e.clientY / window.innerHeight - 0.5) * 8;
  const t = `translate(${xPct}px, ${yPct}px) scale(1.04)`;
  wpDayEl.style.transform   = t;
  wpNightEl.style.transform = t;
});

/* ══════════════════════════════════════════════════
   API
══════════════════════════════════════════════════ */
const API = {
  async get(path) {
    const r = await fetch('/api/' + path);
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch('/api/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  },
  async del(path) {
    const r = await fetch('/api/' + path, { method: 'DELETE' });
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  }
};

/* ══════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════ */
let links = [], todos = [], isDark = true;
let dayUrl = null, nightUrl = null, wpPreview = null;
let backendOk = false;

/* ══════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════ */
async function boot() {
  setDbStatus('connecting');
  try {
    const settings = await API.get('settings');
    isDark = settings.theme !== 'light';
    backendOk = true;
    setDbStatus('online');
    links = (await API.get('links')).links || [];
    todos = (await API.get('todos')).todos || [];
    const wps = await API.get('wallpapers');
    dayUrl   = wps.day   || null;
    nightUrl = wps.night || null;
  } catch(e) {
    console.warn('Backend offline, using localStorage:', e);
    setDbStatus('offline');
    isDark = localStorage.getItem('ms_theme') !== 'light';
    try { links = JSON.parse(localStorage.getItem('ms_links') || '[]'); } catch{}
    try { todos = JSON.parse(localStorage.getItem('ms_todos') || '[]'); } catch{}
  }
  applyThemeDOM(isDark);
  renderLinks();
  renderTodos();
  applyWallpaperByContext();
  updateWpSlots();
  tick();
  setInterval(tick, 30000);
  setInterval(tick, 1000); // update seconds for focus timer
  focusRender();
  showQuote();
}

function setDbStatus(state) {
  const badge = document.getElementById('db-badge');
  const text  = document.getElementById('db-status-text');
  badge.classList.toggle('offline', state === 'offline');
  text.textContent = state === 'online' ? 'DB ONLINE' : state === 'offline' ? 'OFFLINE MODE' : 'CONNECTING…';
}

/* ══════════════════════════════════════════════════
   CLOCK & GREETING
══════════════════════════════════════════════════ */
const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const GREET_SUBS = {
  night:     ['Perfect night for deep focus.', 'The quiet hours belong to you.', 'Stars are out. So is your potential.'],
  morning:   ['Morning energy. Let\'s build something great.', 'Fresh day, clear mind.', 'Rise and make it count.'],
  afternoon: ['Afternoon momentum. Keep the streak alive.', 'Halfway through — push further.', 'Focused afternoons lead to great evenings.'],
  evening:   ['Evening mode. Wind down or go deep.', 'The best ideas come at dusk.', 'One last push before the night.']
};

function getPeriod(hr) {
  if (hr < 5)  return 'night';
  if (hr < 12) return 'morning';
  if (hr < 17) return 'afternoon';
  return 'evening';
}

function tick() {
  const now = new Date();
  document.getElementById('clock-time').textContent =
    String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  document.getElementById('clock-date').textContent =
    DAYS[now.getDay()] + '   ·   ' + now.getDate() + ' ' + MONTHS[now.getMonth()] + ' ' + now.getFullYear();

  const hr = now.getHours();
  const period = getPeriod(hr);
  const greetWord = { night:'Good night', morning:'Good morning', afternoon:'Good afternoon', evening:'Good evening' }[period];
  document.getElementById('greeting').innerHTML = greetWord + ', <strong>Om ✦</strong>';

  // Sub-greeting: change daily based on day-of-year
  const subs = GREET_SUBS[period];
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(),0,0)) / 86400000);
  document.getElementById('greeting-sub').textContent = subs[dayOfYear % subs.length];

  if (!wpPreview) applyWallpaperByContext();
}

/* ══════════════════════════════════════════════════
   THEME
══════════════════════════════════════════════════ */
function applyThemeDOM(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.getElementById('tt-dark').classList.toggle('active', dark);
  document.getElementById('tt-light').classList.toggle('active', !dark);
}

async function setTheme(dark) {
  isDark = dark;
  applyThemeDOM(dark);
  try { await API.post('settings', { theme: dark ? 'dark' : 'light' }); }
  catch { localStorage.setItem('ms_theme', dark ? 'dark' : 'light'); }
  if (dark) {
    if (nightUrl)    { wpPreview = 'night'; updateThemeHint('🌙 Night wallpaper'); }
    else if (dayUrl) { wpPreview = 'day';   updateThemeHint('☀️ Day wallpaper (fallback)'); }
    else             { wpPreview = null;    updateThemeHint('no wallpaper set'); }
  } else {
    if (dayUrl)       { wpPreview = 'day';   updateThemeHint('☀️ Day wallpaper'); }
    else if (nightUrl){ wpPreview = 'night'; updateThemeHint('🌙 Night wallpaper (fallback)'); }
    else              { wpPreview = null;    updateThemeHint('no wallpaper set'); }
  }
  applyWallpaperByContext();
  toast((dark ? '🌙 Dark' : '☀️ Light') + ' mode activated');
}
function updateThemeHint(msg) {
  const el = document.getElementById('theme-wp-hint');
  el.textContent = msg;
  setTimeout(() => { el.textContent = 'auto-matches theme'; }, 2800);
}

/* ══════════════════════════════════════════════════
   WALLPAPER
══════════════════════════════════════════════════ */
const wpDimEl    = document.getElementById('wp-dim');
const wpStatusEl = document.getElementById('wp-status');
const wpStatusLb = document.getElementById('wp-status-label');

function applyWallpaperByContext() {
  if (dayUrl)   wpDayEl.style.backgroundImage   = `url(${dayUrl})`;
  if (nightUrl) wpNightEl.style.backgroundImage = `url(${nightUrl})`;
  const mode = wpPreview !== null ? wpPreview : (isDark ? 'night' : 'day');
  let showDay = false, showNight = false, label = '';
  if (mode === 'day') {
    if (dayUrl)        { showDay   = true; label = '☀️ Day'; }
    else if (nightUrl) { showNight = true; label = '🌙 Fallback'; }
  } else {
    if (nightUrl)      { showNight = true; label = '🌙 Night'; }
    else if (dayUrl)   { showDay   = true; label = '☀️ Fallback'; }
  }
  wpDayEl.classList.toggle('on',   showDay);
  wpNightEl.classList.toggle('on', showNight);
  const hasWp = showDay || showNight;
  wpDimEl.classList.toggle('on', hasWp);
  wpStatusEl.style.display = hasWp ? 'inline-flex' : 'none';
  if (hasWp) wpStatusLb.textContent = label;
}

function updateWpSlots() {
  const d = !!dayUrl, n = !!nightUrl;
  document.getElementById('day-status-slot').textContent   = d ? '✓ Saved' : 'Tap to set';
  document.getElementById('night-status-slot').textContent = n ? '✓ Saved' : 'Tap to set';
  document.getElementById('slot-day').classList.toggle('has-wp', d);
  document.getElementById('slot-night').classList.toggle('has-wp', n);
  document.getElementById('slot-day-preview').style.backgroundImage   = d ? `url(${dayUrl})`   : '';
  document.getElementById('slot-night-preview').style.backgroundImage = n ? `url(${nightUrl})` : '';
}

function handleDaySlotClick() {
  if (dayUrl) { wpPreview = 'day'; applyWallpaperByContext(); toast('☀️ Day wallpaper active'); }
  else        { document.getElementById('inp-day').click(); }
}
function handleNightSlotClick() {
  if (nightUrl) { wpPreview = 'night'; applyWallpaperByContext(); toast('🌙 Night wallpaper active'); }
  else          { document.getElementById('inp-night').click(); }
}
function setSlotSaving(slot, saving) {
  document.getElementById('slot-' + slot).classList.toggle('saving', saving);
  document.getElementById(slot + '-status-slot').textContent = saving ? '⏳ Saving…' : '✓ Saved';
}
function setupFileInput(inputId, slot) {
  document.getElementById(inputId).addEventListener('change', async function() {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
      const dataUrl = e.target.result;
      setSlotSaving(slot, true);
      try {
        await API.post('wallpapers/' + slot, { dataUrl });
        if (slot === 'day') dayUrl = dataUrl; else nightUrl = dataUrl;
        wpPreview = slot;
        applyWallpaperByContext(); updateWpSlots();
        toast((slot === 'day' ? '☀️ Day' : '🌙 Night') + ' wallpaper saved!');
      } catch(err) {
        if (slot === 'day') dayUrl = dataUrl; else nightUrl = dataUrl;
        wpPreview = slot;
        applyWallpaperByContext(); updateWpSlots();
        toast('⚠️ Saved locally (server offline)');
      } finally {
        setSlotSaving(slot, false);
      }
    };
    reader.readAsDataURL(file);
    this.value = '';
  });
}
setupFileInput('inp-day',   'day');
setupFileInput('inp-night', 'night');

document.getElementById('btn-clear').addEventListener('click', async function() {
  try { await API.del('wallpapers'); } catch {}
  dayUrl = null; nightUrl = null;
  wpDayEl.style.backgroundImage = wpNightEl.style.backgroundImage = '';
  wpPreview = null;
  applyWallpaperByContext(); updateWpSlots();
  toast('🗑 Wallpapers cleared');
});

/* ══════════════════════════════════════════════════
   SEARCH
══════════════════════════════════════════════════ */
let searchEng = { name: 'google', url: 'https://google.com/search?q=' };
function setEng(name, url) {
  searchEng = { name, url };
  document.querySelectorAll('.eng').forEach(e => e.classList.remove('on'));
  document.getElementById('eng-' + name).classList.add('on');
}
function doSearch() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return;
  window.open(q.startsWith('http') ? q : searchEng.url + encodeURIComponent(q), '_blank');
}

/* ══════════════════════════════════════════════════
   LINKS
══════════════════════════════════════════════════ */
function renderLinks() {
  const grid  = document.getElementById('links-grid');
  const empty = document.getElementById('link-empty');
  grid.innerHTML = '';
  if (!links.length) { empty.classList.add('show'); return; }
  empty.classList.remove('show');
  links.forEach(function(lk, i) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.style.animationDelay = (i * 0.045) + 's';
    chip.innerHTML = `<div class="chip-icon">${lk.emoji}</div><span class="chip-name">${lk.name}</span><button class="chip-del" type="button">✕</button>`;
    chip.querySelector('.chip-del').addEventListener('click', e => { e.stopPropagation(); removeLink(i); });
    chip.addEventListener('click', () => window.open(lk.url, '_blank'));
    grid.appendChild(chip);
  });
}
async function removeLink(i) {
  const id = links[i].id;
  links.splice(i, 1); renderLinks(); renderManageList();
  try { await API.del('links/' + id); }
  catch { localStorage.setItem('ms_links', JSON.stringify(links)); }
  toast('Link removed');
}
const EMOJIS = ['🔗','💼','🧩','🐙','📝','🎵','📚','🎬','💡','🛠️','📊','🌐','⚡','🎯','🔥','💎','🚀','🎮','📷','🏆','🌸','🎨','🍕','☕','🌿','🎓','💻','🔑','🎪'];
let selEmoji = '🔗';
function openAdd() {
  selEmoji = '🔗';
  ['sc-name','sc-url','sc-emoji'].forEach(id => document.getElementById(id).value = '');
  const grid = document.getElementById('emoji-grid');
  grid.innerHTML = '';
  EMOJIS.forEach(em => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'e-btn' + (em === selEmoji ? ' sel' : '');
    btn.textContent = em;
    btn.addEventListener('click', () => {
      selEmoji = em;
      grid.querySelectorAll('.e-btn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
    });
    grid.appendChild(btn);
  });
  document.getElementById('add-modal').classList.add('open');
  setTimeout(() => document.getElementById('sc-name').focus(), 80);
}
function closeAdd()    { document.getElementById('add-modal').classList.remove('open'); }
function openManage()  { renderManageList(); document.getElementById('manage-modal').classList.add('open'); }
function closeManage() { document.getElementById('manage-modal').classList.remove('open'); }
async function saveLink() {
  const name   = document.getElementById('sc-name').value.trim();
  let   url    = document.getElementById('sc-url').value.trim();
  const custom = document.getElementById('sc-emoji').value.trim();
  if (!name || !url) { toast('⚠️ Fill in name & URL'); return; }
  if (!url.startsWith('http')) url = 'https://' + url;
  const link = { name, url, emoji: custom || selEmoji };
  try { const res = await API.post('links', link); link.id = res.id; }
  catch { link.id = Date.now().toString(); const s = JSON.parse(localStorage.getItem('ms_links')||'[]'); s.push(link); localStorage.setItem('ms_links', JSON.stringify(s)); }
  links.push(link); renderLinks(); closeAdd(); toast('✦ Link saved!');
}
function renderManageList() {
  const list = document.getElementById('manage-list');
  list.innerHTML = '';
  if (!links.length) { list.innerHTML = '<div class="manage-empty">No links yet</div>'; return; }
  links.forEach((lk, i) => {
    const row = document.createElement('div');
    row.className = 'manage-row';
    row.innerHTML = `<div class="manage-emoji">${lk.emoji}</div><div class="manage-info"><div class="manage-name">${lk.name}</div><div class="manage-url">${lk.url}</div></div>`;
    const del = document.createElement('button');
    del.className = 'manage-del'; del.type = 'button'; del.textContent = 'Remove';
    del.addEventListener('click', () => removeLink(i));
    row.appendChild(del); list.appendChild(row);
  });
}
document.getElementById('add-modal').addEventListener('click',    e => { if (e.target === e.currentTarget) closeAdd(); });
document.getElementById('manage-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeManage(); });

/* ══════════════════════════════════════════════════
   TO-DO
══════════════════════════════════════════════════ */
function renderTodos() {
  const list = document.getElementById('todo-list');
  list.innerHTML = '';
  const done = todos.filter(t => t.done).length;
  document.getElementById('todo-count').textContent = done + ' / ' + todos.length;
  todos.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'todo-item' + (t.done ? ' done' : '');
    el.innerHTML = `<div class="t-circle${t.done?' checked':''}"></div><span class="t-text">${t.text}</span><button class="t-del" type="button">✕</button>`;
    el.querySelector('.t-circle').addEventListener('click', async () => {
      todos[i].done = !todos[i].done; renderTodos();
      try { await API.post('todos/' + todos[i].id + '/toggle', {}); }
      catch { localStorage.setItem('ms_todos', JSON.stringify(todos)); }
    });
    el.querySelector('.t-del').addEventListener('click', async () => {
      const id = todos[i].id; todos.splice(i,1); renderTodos();
      try { await API.del('todos/' + id); }
      catch { localStorage.setItem('ms_todos', JSON.stringify(todos)); }
    });
    list.appendChild(el);
  });
}
async function addTodo() {
  const inp  = document.getElementById('todo-inp');
  const text = inp.value.trim(); if (!text) return;
  const todo = { text, done: false };
  try { const res = await API.post('todos', todo); todo.id = res.id; }
  catch { todo.id = Date.now().toString(); const s = JSON.parse(localStorage.getItem('ms_todos')||'[]'); s.unshift(todo); localStorage.setItem('ms_todos', JSON.stringify(s)); }
  todos.unshift(todo); renderTodos(); inp.value = '';
}

/* ══════════════════════════════════════════════════
   QUOTES
══════════════════════════════════════════════════ */
const QUOTES = [
  {text:"The only way to do great work is to love what you do.", author:"Steve Jobs"},
  {text:"In the middle of difficulty lies opportunity.", author:"Albert Einstein"},
  {text:"It does not matter how slowly you go as long as you do not stop.", author:"Confucius"},
  {text:"Life is what happens when you're busy making other plans.", author:"John Lennon"},
  {text:"The future belongs to those who believe in the beauty of their dreams.", author:"Eleanor Roosevelt"},
  {text:"Strive not to be a success, but rather to be of value.", author:"Albert Einstein"},
  {text:"You miss 100% of the shots you don't take.", author:"Wayne Gretzky"},
  {text:"Simplicity is the ultimate sophistication.", author:"Leonardo da Vinci"},
  {text:"Do what you can, with what you have, where you are.", author:"Theodore Roosevelt"},
  {text:"Be yourself; everyone else is already taken.", author:"Oscar Wilde"},
  {text:"Build something you're proud of.", author:"Unknown"},
  {text:"Stay curious. Stay hungry. Stay humble.", author:"Unknown"},
];
let quoteIdx = Math.floor(Math.random() * QUOTES.length);
function showQuote() {
  const q = QUOTES[quoteIdx];
  document.getElementById('quote-text').textContent   = '"' + q.text + '"';
  document.getElementById('quote-author').textContent = '— ' + q.author;
}
function nextQuote() { quoteIdx = (quoteIdx + 1) % QUOTES.length; showQuote(); }

/* ══════════════════════════════════════════════════
   FOCUS TIMER (Pomodoro)
══════════════════════════════════════════════════ */
const FOCUS_TOTAL = 25 * 60;
let focusSecs = FOCUS_TOTAL, focusRunning = false, focusInterval = null;

function focusRender() {
  const m = Math.floor(focusSecs / 60), s = focusSecs % 60;
  document.getElementById('focus-display').textContent =
    String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  const pct = Math.round(((FOCUS_TOTAL - focusSecs) / FOCUS_TOTAL) * 100);
  document.getElementById('focus-label').textContent =
    focusRunning ? 'Focus — ' + pct + '% done' : (focusSecs === FOCUS_TOTAL ? 'Pomodoro' : 'Paused');
}
function focusToggle() {
  if (focusRunning) {
    clearInterval(focusInterval); focusRunning = false;
    document.getElementById('focus-start-btn').textContent = 'Resume';
  } else {
    if (focusSecs === 0) { focusReset(); return; }
    focusRunning = true;
    document.getElementById('focus-start-btn').textContent = 'Pause';
    focusInterval = setInterval(() => {
      if (focusSecs > 0) { focusSecs--; focusRender(); }
      else {
        clearInterval(focusInterval); focusRunning = false;
        document.getElementById('focus-start-btn').textContent = 'Start';
        document.getElementById('focus-label').textContent = '🎉 Done!';
        toast('🎯 Focus session complete! Time for a break.');
      }
    }, 1000);
  }
  focusRender();
}
function focusReset() {
  clearInterval(focusInterval); focusRunning = false; focusSecs = FOCUS_TOTAL;
  document.getElementById('focus-start-btn').textContent = 'Start';
  focusRender();
}

/* ══════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════ */
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ══════════════════════════════════════════════════
   LogOut
══════════════════════════════════════════════════ */

function logout() {
    localStorage.removeItem('loggedIn');
    localStorage.removeItem('username');
    window.location.href = '/auth.html';
}

/* ══════════════════════════════════════════════════
   START
══════════════════════════════════════════════════ */
boot();