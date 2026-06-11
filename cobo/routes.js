// COBO module API — outlets + CFO price master (more to come: receive, POS, ledger, dealers).
const express = require('express');
module.exports = function (db, o2s) {
  const r = express.Router();
  const role = (req) => (req.session.user && req.session.user.role) || '';
  const isCOO = (req) => role(req) === 'COO';
  const canOutlet = (req) => isCOO(req) || role(req) === 'COBO Manager';
  const canPrice = (req) => isCOO(req) || role(req) === 'CFO';

  // Seed the 4 outlets once (idempotent).
  async function ensureOutlets() {
    const o = await db.all('outlets');
    if (!o.length) {
      for (const n of ['COBO Faran', 'COBO Mitiari', 'COBO TAY', 'COBO AWT']) await db.put('outlets', { name: n, active: true });
      return db.all('outlets');
    }
    return o;
  }

  // ---- Outlets ----
  r.get('/outlets', async (req, res) => { try { res.json(await ensureOutlets()); } catch (e) { res.status(500).json({ error: String(e) }); } });
  r.post('/outlets', async (req, res) => {
    if (!canOutlet(req)) return res.status(403).json({ error: 'COBO Manager / COO only' });
    const { id, name, active } = req.body || {};
    if (!String(name || '').trim()) return res.status(400).json({ error: 'name required' });
    res.json(await db.put('outlets', { id, name: String(name).trim(), active: active !== false }));
  });
  r.delete('/outlets/:id', async (req, res) => {
    if (!canOutlet(req)) return res.status(403).json({ error: 'COBO Manager / COO only' });
    await db.del('outlets', req.params.id); res.json({ ok: true });
  });

  // ---- CFO price master (Cost to COBO + Sale price + discount range), one row per brand ----
  r.get('/prices', async (_req, res) => { try { res.json(await db.all('prices')); } catch (e) { res.status(500).json({ error: String(e) }); } });
  r.get('/catalogue', async (_req, res) => { try { res.json(await o2s.getCatalogue()); } catch (e) { res.status(502).json({ error: String(e) }); } });
  r.post('/prices', async (req, res) => {
    if (!canPrice(req)) return res.status(403).json({ error: 'CFO / COO only' });
    const b = req.body || {};
    if (!String(b.brand || '').trim()) return res.status(400).json({ error: 'brand required' });
    const id = b.id || 'price_' + String(b.brand).replace(/[^A-Za-z0-9]/g, '_');
    const cost = +b.costToCobo || 0, sale = +b.salePrice || 0;
    res.json(await db.put('prices', { id, brand: String(b.brand).trim(), costToCobo: cost, salePrice: sale, discMin: +b.discMin || 0, discMax: +b.discMax || 0, margin: sale - cost, by: role(req) }));
  });
  r.delete('/prices/:id', async (req, res) => {
    if (!canPrice(req)) return res.status(403).json({ error: 'CFO / COO only' });
    await db.del('prices', req.params.id); res.json({ ok: true });
  });

  return r;
};
