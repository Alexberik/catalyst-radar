# Catalyst Radar Provider Registry & Integration Plan

Updated: 2026-11-03

This is the canonical provider selection checklist for Catalyst Radar. Status labels describe repository code, not a guarantee that an external service is currently responding.

## Provider matrix

| Domain | Provider | Intended role | Current repository status | Priority / decision |
|---|---|---|---|---|
| Solana RPC | FluxRPC HTTP | Account, token, program and recent transaction reads | Read-only HTTP snapshot endpoint implemented for token supply, largest token accounts and recent signatures; key required, live smoke test pending | P1; implement after auth, regional endpoint and limits are confirmed |
| Solana stream | FluxRPC WebSocket | Account/log/slot/transaction subscriptions | Documentation reviewed; persistent consumer not deployed | P1; worker process required |
| Solana stream | FluxRPC Yellowstone gRPC | High-volume transaction/account stream | Documentation reviewed; filter schema/auth/quotas still to verify | P1; preferred stream once validated |
| Solana risk | RugCheck | Token risk report and holder-related context | Existing backend has a read-only summary request | P1; keep source timestamp and risk details |
| Solana enhanced data | Helius | Asset metadata/enhanced transactions/wallet context | Optional server-side key path exists in backend | P1; choose Helius or Birdeye first |
| Solana market data | Birdeye | Token overview/OHLCV and market metrics | Optional server-side key path exists in backend | P1; verify current endpoint schema and plan |
| Solana token metadata | Solscan | Token metadata and account enrichment | Not integrated in current FastAPI backend | P2; optional cross-check, verify API plan |
| DEX discovery | GeckoTerminal | New pools and pool metrics | Public request implemented | P1 |
| DEX discovery | DEX Screener | Profiles/boosts/pair snapshots | Public requests implemented | P1; legal/terms review before commercial product |
| Swap feasibility | Jupiter | Read-only buy/sell quote route and price impact | Not yet integrated | P1; required before showing executable size estimates |
| CEX market data | CCXT | Unified exchange tickers/OHLCV/order books | Public-only ticker and OHLCV endpoints implemented for allowlisted exchanges; tests added, live smoke test pending | P2; public endpoints only, select venues |
| CEX market data | Binance Spot | 24h tickers | Public request implemented | P1 |
| Broad crypto | CoinPaprika | Market ticker metadata | Public request implemented | P1 |
| Broad crypto | CoinGecko | Market metadata | Optional server-side key path exists | P2 |
| News | GDELT | Global news discovery | Public request implemented | P1; discovery only, unverified until primary source |
| Crypto news | CryptoPanic | Aggregated crypto news | Optional server-side key path exists | P2 |
| Social | X API | Public post search / configured accounts | Optional key path exists | P2; plan-dependent |
| Social | Reddit | Public post search | Optional OAuth path exists | P2; respect current API terms |
| Social | Telegram Bot API | Authorized configured channels only | Environment placeholders only | P3; no universal public/private group access |
| Equities | Finnhub | Quotes | Optional server-side key path exists | P1; verify subscription and display rights |
| Equities | Massive/Polygon | Quotes, aggregates, trades | Not integrated | P2 alternative to Finnhub, not a default duplicate |
| Filings | SEC EDGAR | Official company filings | Configurable CIK ingestion exists | P1; descriptive User-Agent and fair-access policy |
| Macro | FRED | Rates, macro time series | Not integrated | P2 |
| Macro | ECB / World Bank | FX/economic series | Not integrated | P3 |
| Biotech catalysts | ClinicalTrials.gov / openFDA | Trial and regulatory event discovery | Public requests implemented | Existing niche feature; preserve only if product scope warrants |
| Prediction markets | CCXT supported venues / native APIs | Event probabilities, order-book/liquidity context | Not integrated | P3; separate from asset-price forecasts |

## Secret names

Set only in Vercel/Cloudflare/worker secret stores. Never commit values.

| Secret | Used for |
|---|---|
| FLUXRPC_API_KEY | FluxRPC HTTP JSON-RPC authentication via the documented `?key=` query parameter; never expose to browser. WebSocket auth still requires a separate verified configuration |
| FLUXRPC_SHIELD_KEY | Only for the documented Shield use case; do not assume it replaces a server API key |
| HELIUS_API_KEY | Helius enhanced RPC |
| BIRDEYE_API_KEY | Birdeye API |
| SOLSCAN_API_KEY | Solscan Pro API |
| FINNHUB_API_KEY | Finnhub |
| MASSIVE_API_KEY | Massive/Polygon if selected |
| COINGECKO_API_KEY / COINGECKO_DEMO_API_KEY | CoinGecko |
| CRYPTOPANIC_API_KEY | CryptoPanic |
| X_BEARER_TOKEN | X API |
| REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET | Reddit OAuth |
| TELEGRAM_BOT_TOKEN | Authorized Telegram bot |
| SEC_USER_AGENT | Descriptive SEC fair-access User-Agent, including contact |
| SEC_CIKS | Comma-separated issuer CIK list |

Previously disclosed FluxRPC credentials must be rotated/revoked. Do not reuse exposed values.

## Required normalized event envelope

Every provider adapter should map records to a common shape:

```json
{
  "event_id": "provider-native-id-or-content-hash",
  "provider": "fluxrpc",
  "event_type": "pool_created|swap|account_change|news|filing|quote",
  "asset_id": "chain:network:mint-or-symbol",
  "chain": "solana",
  "observed_at": "UTC ISO-8601",
  "event_at": "UTC ISO-8601 or null",
  "published_at": "UTC ISO-8601 or null",
  "ingested_at": "UTC ISO-8601",
  "source_url": "https://...",
  "confidence": "primary|aggregated|unverified",
  "payload": {},
  "data_quality": {
    "fresh": true,
    "complete": false,
    "warnings": ["holder distribution unavailable"]
  }
}
```

Never merge two assets only because their ticker symbols match. Use chain + mint/contract or a canonical security identifier.

## Solana wallet intelligence (internal scoring service)

Current FluxRPC HTTP snapshot exposes largest token-account balances and parsed token-account authorities where returned. It does **not** yet classify buys/sells, identify beneficial owners, cluster wallets or establish Smart Money behavior. Those require persistent transaction ingestion and enrichment.

Track wallet behavior without creating a standalone UI tab:
- first-buy timing relative to pool creation and first public volume;
- realized/unrealized PnL when a complete trade history is available;
- holding duration and exit timing;
- repeated early entries across independent tokens;
- current accumulation vs distribution;
- shared funders, rapid transfers and address clusters;
- independence-adjusted count of wallets accumulating the same mint.

A wallet cluster counts as one signal group, not multiple independent confirmations. Label this "wallet behavior / Smart Money signal", never "insider wallet". Historical coverage is incomplete until Catalyst Radar has continuously collected its own Solana events.

## Jupiter route checks

For each candidate, request both buy and reverse sell quotes at several notional sizes. Store:
- input/output amount and route plan;
- price impact and minimum received;
- slippage setting;
- estimated fees and priority fee assumptions;
- token transfer restrictions / quote failure;
- quote timestamp and expiry/staleness.

A quote is not an executed fill. Do not infer an executable exit amount from pool TVL alone. If no quote is available, show UNKNOWN.

## Data storage

Recommended production target:
- PostgreSQL for users, paper ledger, forecasts and relational metadata.
- TimescaleDB extension or partitioned tables for bars and observations.
- Object storage for immutable raw event payloads.
- Redis only for short-lived cache/locks if required.
- Background collector/queue independent of page visits.
- Dead-letter table and per-provider health/freshness metrics.

Current serverless SQLite is ephemeral and is not an acceptable durable forecast ledger.

## Release gates

1. Provider adapter has timeout, retry/backoff, quota handling, schema validation and safe error handling.
2. Integration test records a real response and source timestamp.
3. Secrets remain server-side.
4. Duplicate events are idempotently ignored.
5. Data freshness and missing fields are surfaced to UI.
6. Forecast snapshots are immutable and timestamped before outcome.
7. Walk-forward evaluation passes a documented baseline comparison.
8. Paper trades include fees, spread, slippage and failed-quote handling.
9. No live trading keys or live order endpoints are enabled by default.
