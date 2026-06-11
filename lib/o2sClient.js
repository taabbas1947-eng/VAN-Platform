// o2sClient — the ONLY link from the platform to O2S.
// Calls the 3 thin endpoints O2S exposes (see README). Until O2S_BASE_URL is set,
// it returns MOCK data so the platform runs standalone during the foundation build.

const BASE = process.env.O2S_BASE_URL || '';
const TOKEN = process.env.O2S_API_TOKEN || '';
const MOCK = !BASE;

async function call(path, opts = {}) {
  if (MOCK) return mock(path, opts);
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Api-Token': TOKEN, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error('O2S API ' + path + ' -> ' + res.status);
  return res.json();
}

// 1. Master/catalogue — VAN brand list (single source of master data, read-only).
function getCatalogue() {
  return call('/api/ext/catalogue');
}
// 2. Supply-in — shipments dispatched on a channel.
function getShipments(channel, since) {
  const q = new URLSearchParams({ channel, ...(since ? { since } : {}) });
  return call('/api/ext/shipments?' + q.toString());
}
// 3. Demand-out — create a PO in O2S in "pending COO review" state.
function postPO(po) {
  return call('/api/ext/po', { method: 'POST', body: JSON.stringify(po) });
}

// ---- MOCK fallback (foundation only; replaced by the real O2S endpoints) ----
function mock(path) {
  if (path.startsWith('/api/ext/catalogue'))
    return Promise.resolve({
      channels: ['White Label', 'Cobo', 'Vgreen', 'Dealer', 'Distributor'],
      brands: [
        { brand: 'Naya S Urea', base: 'Sulfur Coated Urea', form: 'Granular', pack: 25, packs: [25] },
        { brand: 'Enrich', base: 'Potassium Humate', form: 'Granular', pack: 25, packs: [25] },
        { brand: 'V-Boron', base: 'Boron 5%', form: 'Liquid', pack: 1, packs: [1, 20] },
      ],
      _mock: true,
    });
  if (path.startsWith('/api/ext/shipments'))
    return Promise.resolve({ shipments: [], _mock: true });
  return Promise.resolve({ ok: true, _mock: true });
}

module.exports = { getCatalogue, getShipments, postPO, MOCK };
