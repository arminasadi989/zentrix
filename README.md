# Zentrix

AI-powered financial market analysis assistant covering five markets: **crypto**, **global forex**, **Iranian free-market currency**, **gold & coins** (global ounce + Iranian coin market), and the **Tehran Stock Exchange**.

Zentrix is not a general chatbot with a finance skin. Each market has an explicit, multi-layer analytical framework, every answer is grounded in data that was genuinely fetched for that request, and the app is built to refuse rather than to invent: if a feed is down or a setup does not meet its own criteria, it says so.

---

## Quick start

```bash
# 1. install (npm workspaces: installs client + server together)
npm install

# 2. configure secrets
cp .env.example .env
#    then fill in the three keys (see "API keys" below)

# 3. run both processes (API on :8787, UI on :5173)
npm run dev
```

Open http://localhost:5173.

Other scripts:

| command | what it does |
| --- | --- |
| `npm run dev` | Express API + Vite dev server together |
| `npm run dev:server` / `npm run dev:client` | just one side |
| `npm run typecheck` | type-checks both workspaces |
| `npm run build` | production client bundle into `client/dist` |
| `npm start` | runs the API server only |

Requires Node 20.11+ (uses the built-in `fetch` and modern `AbortController` behaviour).

---

## API keys (all free tier)

Copy `.env.example` to `.env` in the repo root and fill in:

| variable | where to get it | used for |
| --- | --- | --- |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey | analysis (`gemini-3.5-flash`) and read-aloud TTS |
| `TWELVE_DATA_API_KEY` | https://twelvedata.com/pricing → free "Basic" plan, 800 req/day | forex spot prices + daily time series |
| `BRSAPI_KEY` | https://brsapi.ir → register, free tier ~1,500 req/day | Iranian currency, gold ounce/coin, TSE data |

Two data sources need no key at all: **Binance** public REST (crypto prices and klines) and **alternative.me** (Fear & Greed Index).

The app runs without any key configured; every feature that needs a missing key reports itself unavailable in the UI instead of failing silently or showing invented numbers. `GET /api/market/status` is what the UI uses to know which providers are configured.

CryptoCompare is deliberately not used anywhere: its free tier was discontinued in 2026.

---

## Architecture

```
shared/            module registry + wire types, imported by BOTH sides
server/            Express API - the only place secrets exist
  ai/              Gemini client, model ids
  providers/       Binance, alternative.me, Twelve Data, BrsApi
  lib/             TTL cache, timeout-guarded HTTP, indicator maths, provenance
  prompts/         one analytical framework per module + shared closing sections
  services/        per-module live-context builder, dashboard builder
  routes/          /api/chat, /api/market/*, /api/tts
client/            React + TypeScript + Vite UI (Farsi, RTL, dark)
  lib/storage.ts   storage abstraction (get/set/list/delete)
  lib/sessions.ts  session repository built on that abstraction
```

### Server-side AI proxy

Every call that carries a secret happens in the Express process. The browser only ever talks to our own `/api/*` routes, so `GEMINI_API_KEY`, `TWELVE_DATA_API_KEY` and `BRSAPI_KEY` never appear in the client bundle, in the network tab, or in any log (query strings are redacted before logging).

For each chat request the server:
1. fetches the live market data for the active module **immediately before** calling the model,
2. composes the system instruction = module framework + live-data block + response-length directive,
3. calls `ai.models.generateContent(...)` with the conversation history as `contents`.

### Data provenance is a first-class type

Every number that crosses the wire is a `DataPoint` carrying its own provenance: `live`, `cached`, `stale-fallback`, `unavailable`, or `model-knowledge`. Provenance is assigned by the fetch layer based on what actually happened, so no caller can hand-label something "live". The UI badge and the wording injected into the model's prompt are both derived from that single value.

Consequences worth knowing:
- A dashboard row whose price is live but whose change percentage the provider did not supply shows **two different badges**, and the change cell shows an em dash. Nothing is padded with a plausible number.
- Fields with no free live feed (policy rates, inflation, dominance, per-symbol TSE technicals) are tagged `model-knowledge`: the model is told to use its own knowledge *and to say so*.
- The dashboard footer is generated from the rows that were actually returned, so it cannot claim a category is fully live after that category's fetch failed.

### Storage abstraction

`client/src/lib/storage.ts` exposes `get` / `set` / `list` / `delete` over a namespaced `localStorage` (with an in-memory fallback for private-browsing modes). It is async on purpose: swapping in IndexedDB or a real backend is a one-line change of the exported instance, with no change to components or the session repository. No component imports `localStorage` directly.

### Indicator labels cannot drift

Indicator functions take their period as a parameter and derive the label from that same parameter (`EMA${period}`), so a reading labelled `EMA50` is mathematically guaranteed to have used 50. There is no literal `'EMA50'` string anywhere for a constant to drift away from.

### Single source of truth for module metadata

`shared/modules.ts` defines the module union, and `MODULE_LIST` is derived from it. Names, descriptions, accent colours, icons, availability flags and suggested prompts exist exactly once and are imported by both sides. Adding a module without its metadata is a compile error rather than a silently missing sidebar entry.

---

## What the app will not do

- It will not produce a fixed number of trading signals. If the confluence criteria for a risk category are not met, it says no valid setup exists.
- It will not give buy/sell signals for the Iranian currency market (it is not a directly tradeable instrument for most users); it gives bullish/bearish/neutral scenarios instead.
- It will not apply RSI/MACD-style analysis to the Iranian free market as if it were a deep exchange-traded instrument.
- It will not state a number for a feed that failed.
- It will not present a forecast as a certainty; every trading-relevant answer includes an invalidation point, a structural risk boundary, and an explicit risk-to-reward framing.
