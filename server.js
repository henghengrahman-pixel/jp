const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bukti.json');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '12345';

// pastikan folder & file ada (aman untuk redeploy)
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');

const app = express();
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false
}));

// sajikan admin & publik
app.use('/admin', express.static(path.join(__dirname, 'admin'), { cacheControl: false, etag: false, maxAge: 0 }));
app.use(express.static(path.join(__dirname, 'public')));

// helper I/O yang lebih aman
function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error('[readData] gagal parse, fallback []:', e);
    return [];
  }
}
function writeData(data) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
  
}

// auth
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.user = username;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'invalid' });
});
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// siapa saya (dipakai admin)
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'unauth' });
  res.json({ username: req.session.user });
});

// list bukti
app.get('/api/bukti', (req, res) => {
  let { q } = req.query;
  let data = readData();
  if (q) data = data.filter(p => (p.title || '').toLowerCase().includes(String(q).toLowerCase()));
  res.json(data);
});
app.get('/api/bukti/:id', (req, res) => {
  let data = readData();
  let item = data.find(p => p.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

// admin protected
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'unauthorized' });
  next();
}

app.post('/api/bukti', requireLogin, (req, res) => {
  let data = readData();
  let { id, title, thumb, contentHtml } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  if (!id) id = String(title).toLowerCase().trim().replace(/\s+/g, '-');
  const post = {
    id,
    title,
    thumb,
    image: thumb,
    excerpt: String(title).substring(0, 50),
    contentHtml,
    date: new Date().toISOString(),
    published: true
  };
  data.unshift(post);
  writeData(data);
  res.json(post);
});

// update
app.put('/api/bukti/:id', requireLogin, (req, res) => {
  let data = readData();
  const idx = data.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  data[idx] = {
    ...data[idx],
    title: b.title ?? data[idx].title,
    thumb: b.thumb ?? data[idx].thumb,
    image: b.thumb ?? b.image ?? data[idx].image,
    excerpt: b.excerpt ?? data[idx].excerpt,
    contentHtml: b.contentHtml ?? data[idx].contentHtml,
    date: new Date().toISOString()
  };
  writeData(data);
  res.json(data[idx]);
});

// toggle publish
app.patch('/api/bukti/:id/publish', requireLogin, (req, res) => {
  let data = readData();
  const idx = data.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  const { published } = req.body || {};
  data[idx].published = !!published;
  writeData(data);
  res.json({ ok: true });
});

// delete
app.delete('/api/bukti/:id', requireLogin, (req, res) => {
  let data = readData();
  const idx = data.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  const removed = data.splice(idx, 1);
  writeData(data);
  res.json({ ok: true, removed: removed[0]?.id });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on', PORT));
