# Catalyst Radar Data API

Backend foundation for multi-source market discovery, event collection, source health, and historical signal storage. The public GitHub Pages site remains static. A Vercel serverless deployment is live at https://catalyst-radar-api.vercel.app and is consumed by the frontend API workspace. This is an initial serverless deployment, not yet a durable production data platform.

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
- `GET /api/v1/scanner/extreme-moves?limit=30` — transparent rule-based ranking of observed unusual moves.
- `GET /api/v1/forecast-candidates?horizon_hours=24&limit=20` — experimental directional momentum watchlist; no expected return/probability until backtested.
- `GET /api/v1/news?query=...` — GDELT news, optional CryptoPanic, and optional SEC submissions for configured CIKs.
- `GET /api/v1/history?asset_id=...` — stored scan snapshots.
- `GET /api/v1/events/history` — stored event snapshots.
- `GET /api/v1/security/{chain}/{address}` — GoPlus EVM contract checks or RugCheck Solana risk summary; optional Helius/Birdeye enrichment.
- `GET /api/v1/biotech/events?query=...` — ClinicalTrials.gov and openFDA drug application records.
- `GET /api/v1/equities/quotes?symbols=AAPL,RTX,LMT` — Finnhub quotes when a server-side key is configured.

## Sources and limitations

**Implemented requests:** DEX Screener profiles/boosts, GeckoTerminal new pools, CoinPaprika tickers, Binance 24-hour spot tickers, GDELT news discovery, GoPlus token security for supported EVM chains, RugCheck summaries for Solana, ClinicalTrials.gov, and openFDA drug-application records. CoinGecko and CryptoPanic activate only when server-side keys are configured; SEC EDGAR activates only when `SEC_CIKS` is set and uses `SEC_USER_AGENT`. Finnhub quotes require `FINNHUB_API_KEY`. X, Reddit, Helius and Birdeye integrations activate when their server-side credentials are configured.

**Still prepared, not yet queried:** Massive/Polygon and Telegram channel ingestion. A Telegram bot does not provide universal access to arbitrary public channels; only add channels and collection methods for which access is permitted. Verify provider terms and field availability before production use.

## Important safeguards

- No API keys belong in `index.html`, `app.js`, or any other public browser asset.
- Public endpoints can change, rate-limit, or block requests. The API reports per-source errors rather than fabricating values.
- Discovery score is a transparent heuristic, not a calibrated probability or forecast of return.
- Promoted/boosted tokens are flagged and penalized; they are not treated as organic demand.
- News from aggregators is marked unverified until corroborated by an official primary source.
- SQLite is suitable for local development only. Use persistent storage/PostgreSQL before production deployment; ephemeral hosting may lose SQLite data.
- This service does not place real trades and does not store exchange trading credentials.

## Current deployment status and production gaps

- The frontend and API are deployed, but the API runtime has not been independently smoke-tested from this execution environment because outbound DNS/network access is restricted here. Vercel reports the deployment as `READY`; open `/health` and `/docs` in a browser to verify live routing.
- `DATABASE_PATH=/tmp/catalyst_radar.sqlite3` is intentionally ephemeral on the current serverless deployment. Do not rely on `/api/v1/history` or `/api/v1/events/history` as durable records across cold starts or instances.
- The data collection endpoints currently collect on request. A persistent PostgreSQL/TimescaleDB database and independent scheduled worker are required for trustworthy history and model evaluation.
- The watchlist is not a calibrated forecast. There is no verified 24/48-hour model performance until point-in-time observations, walk-forward evaluation, fees/slippage and benchmark comparisons are implemented.

## Next implementation steps

1. Add provider-specific risk checks (GoPlus/RugCheck), token metadata and holder concentration (Helius or Birdeye).
2. Persist normalized observations to PostgreSQL/TimescaleDB and schedule ingestion independently of visitor traffic.
3. Add official exchange announcement feeds and source-aware rumor verification.
4. Add stock quotes/corporate actions from one selected provider (Finnhub or Massive/Polygon) after checking display/redistribution rights.
5. Add event-time and publication-time fields, deduplication by canonical URL/content hash, and independent source counts.
6. Build forward 24/48-hour evaluation and paper-account ledger only after the observation pipeline is reliable.
