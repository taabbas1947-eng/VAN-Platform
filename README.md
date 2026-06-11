# VAN Platform (`van-platform`)
_The home + new apps, separate from the live O2S deploy. Created 2026-06-10._

## What this is
One repo + one Render web service that hosts:
- **Landing page** (the existing VAN Control Tower portal) — the single home; tiles route into each app.
- **COBO** — first app (4 outlets, POS, lending ledger, dealer book). See `VAN-COBO-Blueprint.md`.
- **VGreen** — later, reuses the same patterns.
- **Login** — its own auth for now; platform-wide SSO later.

**O2S (`VAN-OP`) is NOT in this repo.** It stays its own deploy and the sole writer of its own data. The landing page links to it; the apps talk to it only through the API contract below.

## Deployment shape (locked — arch doc v0.5)
| | O2S (existing) | van-platform (new) |
|---|---|---|
| Repo | `VAN-OP` | `van-platform` |
| Render service | `van-control-tower` | new web service (free tier OK) |
| Database | `van-db` (Postgres) | **its own** Postgres (isolated) |
| Role | live core; sole writer of its data | landing + COBO + VGreen + login |
| Coupling | none — never co-deployed | reads O2S via API; never the DB |

## The O2S ↔ platform API contract (what O2S must expose)
Three thin, additive endpoints on the O2S server. Reads change no O2S behaviour; the one write keeps O2S the sole writer of its blob. All channel-keyed.

1. **GET `/api/ext/catalogue`** → the VAN brand list (brand, base, form, pack/packs) + channels. _Supply: master data. COBO reads this to fill the Product Demand Form and the CFO price master._
2. **GET `/api/ext/shipments?channel=Cobo&since=YYYY-MM-DD`** → shipments dispatched on that channel `[{po, brand, kg, packs, dispatch, outlet}]`. _Supply-in: becomes "expected inventory" in COBO until the outlet user receives it._
3. **POST `/api/ext/po`** → create a PO in O2S in **"pending COO review"** state. Body mirrors New PO Entry (channel, client/outlet, lines[brand, qty, packs, printPrice, invoicePrice], dates). Returns the O2S PO id. _Demand-out: once the COO releases it, it behaves exactly like a New-PO-Entry order._

_Auth on these endpoints: a shared secret/token between the two services (set as an env var on both)._

## COBO's own data (its own Postgres — never O2S's)
`outlets` · `users(role, outletId)` · `customers(type, linkedMillId)` · `dealers` · `priceMaster(brand, costToCobo, salePrice, discMin, discMax)` _(CFO-owned)_ · `sales(outlet, recipientId, payerId, terms, millId, crushingRef)` + `saleLines` · `returns` · `inventory(outlet, brand, onHand)` · `expected(from O2S shipments, received flag)` · `demandPOs(o2sPoId, status)` · `ledger(accountId, debit/credit, ref)` · `crushingSettlements(millId, perFarmerLines[], payment)`.

## Suggested folder structure
```
van-platform/
  server.js            Express: serve static + auth + /cobo API + O2S API client
  package.json
  public/
    index.html         the landing page (home)
  cobo/                COBO module (routes + its UI)
  lib/o2sClient.js     calls the 3 O2S endpoints
  db/                  schema + migrations (own Postgres)
  README.md
```

## Setup steps (when ready to deploy)
1. New **GitHub repo** `van-platform` (free, your existing account).
2. New **Render Web Service** from it (free tier; upgrade to $7/mo for always-on later).
3. New **Render Postgres** for it (its own DB).
4. Env vars: `DATABASE_URL` (its own DB), `SESSION_SECRET` (new), `O2S_BASE_URL` + `O2S_API_TOKEN` (to call the 3 endpoints).
5. On **O2S**: add the 3 `/api/ext/*` endpoints + the matching `O2S_API_TOKEN` env (the only O2S change — small, additive, reviewed & pushed like any O2S change).

## Build order
1. **Foundation** — this repo + landing page as home + login shell. _(no O2S change)_
2. **O2S API** — the 3 endpoints on O2S. _(small additive PR to VAN-OP)_
3. **COBO core** — outlets, CFO price master, catalogue read, receive-from-O2S (expected→on-hand).
4. **COBO sell** — POS sales (cash/credit), returns, stock.
5. **COBO ledger** — receivables, mill-mediated lending, crushing-cycle settlement.
6. **COBO dealers** — dealer book + dealer demand. Then **VGreen** reuses it all.
