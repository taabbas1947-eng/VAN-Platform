// van-platform — landing home + apps (COBO, VGreen…). Separate from the live O2S deploy.
// Foundation build: real Express + sessions; users are a TEMP seed (move to its own DB at provisioning).

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const o2s = require('./lib/o2sClient');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
  })
);

// ---- App catalogue (what tiles exist) ----
const APPS = [
  { id: 'o2s',     name: 'Order-to-Shipment', desc: 'The live operational core.', status: 'live',    href: process.env.O2S_BASE_URL || 'https://van-control-tower.onrender.com' },
  { id: 'cobo',    name: 'VAN COBO',          desc: '4 outlets · POS · ledger.',  status: 'beta',    href: '/cobo' },
  { id: 'vgreen',  name: 'VGreen VC & FM',    desc: 'Contract-farming ledger.',   status: 'planned', href: '' },
  { id: 'costing', name: 'VAN Master Costing',desc: 'Costing & client pricing.',  status: 'planned', href: '' },
];

// ---- TEMP seed users (replace with platform DB at provisioning) ----
const SEED_USERS = [
  { u: 'tahir', name: 'Tahir Abbas',    role: 'COO',          pass: 'van123',  access: 'all' },
  { u: 'irfan', name: 'Muhammad Irfan', role: 'COBO Manager', pass: 'cobo123', access: ['cobo'] },
];
const USERS = {};
for (const s of SEED_USERS) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(s.pass, salt, 64).toString('hex');
  USERS[s.u] = { u: s.u, name: s.name, role: s.role, access: s.access, salt, hash };
}
function verify(u, pass) {
  const rec = USERS[u];
  if (!rec) return false;
  const h = crypto.scryptSync(pass, rec.salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(rec.hash));
}
function canOpen(user, appId) {
  return user && (user.access === 'all' || (Array.isArray(user.access) && user.access.includes(appId)));
}
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'not signed in' });
  return res.redirect('/login');
}

// ---- Auth API ----
app.post('/api/login', (req, res) => {
  const { u, pass } = req.body || {};
  if (!verify((u || '').toLowerCase(), pass || '')) return res.status(401).json({ error: 'Invalid login' });
  const rec = USERS[u.toLowerCase()];
  req.session.user = { u: rec.u, name: rec.name, role: rec.role, access: rec.access };
  res.json({ ok: true, user: req.session.user });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'not signed in' });
  const user = req.session.user;
  res.json({ user, apps: APPS.map((a) => ({ ...a, open: a.status !== 'planned' && canOpen(user, a.id) })) });
});
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'van-platform', o2sMock: o2s.MOCK }));

// ---- O2S read passthrough (used by COBO) ----
app.get('/api/o2s/catalogue', requireAuth, async (_req, res) => {
  try { res.json(await o2s.getCatalogue()); } catch (e) { res.status(502).json({ error: String(e) }); }
});

// ---- Static + page routes ----
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/cobo', requireAuth, (req, res) => {
  if (!canOpen(req.session.user, 'cobo')) return res.status(403).send('No access to COBO.');
  res.sendFile(path.join(__dirname, 'cobo', 'index.html'));
});

app.listen(PORT, () => console.log('van-platform on :' + PORT + (o2s.MOCK ? '  (O2S mock mode)' : '')));
