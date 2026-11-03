# Catalyst Radar — implementation batch 2026-11-03

## Product and design reference lock

- Brand: Catalyst Radar (never MAGIC / Fractyco).
- Dominant user reference: the existing `fractyco.html` dashboard layout.
- Adapted traits: fixed left navigation rail, compact dark-navy canvas, clear three/four KPI row, dashboard cards, dense but readable data tables, two-column information panels, compact metadata and mobile collapse.
- Product-specific corrections: remove fictitious portfolio value, player rankings, fictional assets, made-up PnL and ungrounded performance claims. Use actual API responses or explicit unavailable/experimental states only.
- Color semantics: teal = navigation/active data accent; green = positive/healthy; red = negative/risk; amber = caution/unverified; neutral = unknown.
- Typography: Inter for interface, JetBrains Mono for prices, timestamps and technical values.
- Responsive behavior: desktop sidebar; tablet narrower rail; mobile horizontal navigation and stacked panels.

Refero's live style search was unavailable because its connected subscription returned NO_SUBSCRIPTION. The user's in-repository Fractyco page was therefore used as the primary and explicit visual reference; no claim is made that external Refero references were consulted.

## This batch — implemented in branch

1. Rebuilt the public homepage around the Fractyco dashboard composition, but with Catalyst Radar identity and live API sections.
2. Added a dedicated browser client that calls the deployed FastAPI endpoints for discovery, experimental forecast candidates, extreme moves, news, provider health and equity quotes.
3. All values are rendered from API payloads. Missing endpoints/data render explicit unavailable/empty states; no demo portfolio or fabricated return values are used.
4. Paper Trading is labeled as not connected. The $100 amount is identified as the planned initial paper balance, not a live account balance or PnL.
5. Added public-only CCXT endpoints:
   - normalized tickers for an allowlist of Binance, Bybit, OKX, KuCoin, Kraken and Gate.io;
   - OHLCV for 5m, 30m, 1h and 1d intervals;
   - strict exchange allowlist, symbol limits, rate limiting and guaranteed client close;
   - no API keys, account access, private endpoints or order placement.
6. Added CCXT dependency and backend API documentation.

## Reference repository adoption policy

- CCXT: a working public market-data adapter is added in this batch. Next: tests against exchange fixtures, provider-specific rate-limit behavior, symbol canonicalization and candle persistence.
- Vibe-Trading / crypto_prediction / market-forecast: adopt modular feature pipelines, reproducible training runs and simple baselines first. Do not deploy deep learning until enough point-in-time observations exist.
- Freqtrade: borrow dry-run, fee/slippage, lookahead-bias and ledger discipline; do not copy GPL-3.0 implementation into this codebase without a license decision.
- TradingAgents: use read-only bull/bear research roles as an optional evidence synthesis layer; deterministic code remains authoritative for prices, risk, PnL and execution.
- FinceptTerminal: borrow provider registry, cache, topic-based data contracts and terminal information hierarchy; do not copy AGPL-3.0 code.
- Coinpulse: borrow asset-detail, chart and responsive component patterns; do not migrate framework or copy code/assets without license review.
- Awesome finance APIs: use as provider procurement matrix; verify price, quotas, coverage and redistribution rights directly before enabling paid feeds.
- Prediction market tools: optional catalyst context only; market-implied event odds must never be presented as Catalyst Radar's asset-price forecast.
- FluxRPC / Yellowstone: still a separate P1 integration. The docs were reviewed, but no persistent stream consumer is claimed in this batch.
- Helius / Birdeye: optional server-side enrichment paths exist; active use depends on keys and successful integration checks.
- Jupiter: quote-only route simulation remains planned; no swap or wallet signing.
- PostgreSQL / TimescaleDB: required before durable history, immutable forecasts and paper ledger can be considered production-ready.

## Release gates still open

- Run Python syntax/import checks and backend tests with CCXT installed.
- Smoke-test deployed `/health`, `/api/v1/discovery`, `/api/v1/markets/ccxt` and `/api/v1/markets/ccxt/ohlcv`.
- Confirm Vercel Python dependency build and cold-start behavior.
- Replace ephemeral SQLite with managed PostgreSQL and independent collector worker.
- Add immutable point-in-time forecast snapshots and chronological walk-forward evaluation.
- Add deterministic paper ledger with fees, spread, slippage, partial/failed fills and audit trail.
- Add FluxRPC/Yelllowstone persistent ingestion, wallet graph signals and Jupiter quote checks.
- Validate all visual breakpoints against browser screenshots before merge.
