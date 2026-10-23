# Catalyst Radar Data API

Backend foundation for multi-source market discovery, event collection, source health, and historical signal storage. The public GitHub Pages site remains static; this API must be deployed separately to a Python host (or adapted to a serverless runtime) before the browser can use it.

## Run locally

```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs`.

## Endpoints

- `GET /health` — service health.
- `GET /api/v1/sources` — source configuration and last observed health.
- `GET /api/v1/discovery?limit=100` — DEX discovery, new pools, CoinPaprika market data, Binance spot market data and optional CoinGecko.
- `GET /api/v1/news?query=...` — GDELT news, optional CryptoPanic, and optional SEC submissions for configured CIKs.
- `GET /api/v1/history?asset_id=...` — stored scan snapshots.
- `GET /api/v1/events/history` — stored event snapshots.

## Sources and limitations

**Implemented public requests:** DEX Screener profiles/boosts, GeckoTerminal new pools, CoinPaprika tickers, Binance 24-hour spot tickers, GDELT news discovery. CoinGecko and CryptoPanic activate only when server-side keys are configured; SEC EDGAR activates only when `SEC_CIKS` is set and uses `SEC_USER_AGENT`.

**Integration registry prepared for next adapters:** GoPlus, Helius, Birdeye, RugCheck, Finnhub, Massive/Polygon, X, Reddit, Telegram, openFDA and ClinicalTrials.gov. They are listed as configurable sources but are **not yet queried by this version**. This avoids pretending that a source is connected when credentials, terms, and endpoint-specific logic have not been verified.

## Important safeguards

- No API keys belong in `index.html`, `app.js`, or any other public browser asset.
- Public endpoints can change, rate-limit, or block requests. The API reports per-source errors rather than fabricating values.
- Discovery score is a transparent heuristic, not a calibrated probability or forecast of return.
- Promoted/boosted tokens are flagged and penalized; they are not treated as organic demand.
- News from aggregators is marked unverified until corroborated by an official primary source.
- SQLite is suitable for local development only. Use persistent storage/PostgreSQL before production deployment; ephemeral hosting may lose SQLite data.
- This service does not place real trades and does not store exchange trading credentials.

## Next implementation steps

1. Add provider-specific risk checks (GoPlus/RugCheck), token metadata and holder concentration (Helius or Birdeye).
2. Persist normalized observations to PostgreSQL/TimescaleDB and schedule ingestion independently of visitor traffic.
3. Add official exchange announcement feeds and source-aware rumor verification.
4. Add stock quotes/corporate actions from one selected provider (Finnhub or Massive/Polygon) after checking display/redistribution rights.
5. Add event-time and publication-time fields, deduplication by canonical URL/content hash, and independent source counts.
6. Build forward 24/48-hour evaluation and paper-account ledger only after the observation pipeline is reliable.
