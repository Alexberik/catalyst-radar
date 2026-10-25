# CATALYST RADAR — Early Signal Intelligence

## Demo data collection foundation (October 2026)

- Added a public GitHub Actions collector scheduled every 5 minutes. It stores a rolling 24-hour window on the separate [`market-data` branch](https://github.com/Alexberik/catalyst-radar/tree/market-data/data), avoiding a GitHub Pages rebuild for every market-data update. The frontend reads the public JSON directly from raw.githubusercontent.com. DEX/pool snapshots are collected every 5 minutes, news approximately every 30 minutes, and stock quotes approximately hourly.
- The live site includes a demo history panel with 5-minute, 30-minute, 1-hour and 24-hour comparison windows. The first comparison becomes meaningful only after the collector has successfully produced multiple snapshots.
- Workflow: [Demo market data collector](.github/workflows/demo-market-data.yml). A scheduled run can be delayed or skipped by GitHub Actions; check the Actions page for actual run status.
- Only public no-key sources are used in this demo collector. **Do not commit private API keys to this public repository.**

A first server-side API foundation now lives in [`backend/`](backend/README.md). It is separate from GitHub Pages because static pages cannot safely hold API keys or run a persistent collector.

- Implemented public sources: DEX Screener, GeckoTerminal, CoinPaprika, Binance Spot, GDELT, GoPlus Security, RugCheck, ClinicalTrials.gov and openFDA.
- Optional keyed sources: CoinGecko, CryptoPanic, Finnhub, X API, Reddit, Helius and Birdeye.
- SEC EDGAR submissions can be monitored when company CIKs and a descriptive SEC User-Agent are configured.
- API endpoints include discovery, source health, news/events, token risk checks, biotech catalyst discovery, stock quotes and historical scan storage.
- Added Docker support, environment-variable template, SQLite development storage, scoring tests and GitHub Actions CI.
- The FastAPI backend is **committed but not deployed or connected to the live GitHub Pages frontend yet**. The new GitHub Actions demo collector is separate and writes public snapshots to the repository. Never add credentials to browser JavaScript or this repository.
- The current discovery score is a heuristic, not a calibrated probability or 24/48-hour return forecast. Durable production storage, scheduled background collection, licensed stock-data coverage, source corroboration and forward backtests remain next steps.

See [backend setup and provider coverage](backend/README.md).


Live site: https://alexberik.github.io/catalyst-radar/

## Research and architecture

- [Research blueprint and reference audit](docs/RESEARCH_BLUEPRINT.md) — implementation plan inspired by Vibe-Trading, Fincept Terminal and the Slash/Supabase design references. It documents current capabilities, target architecture, data providers, forecast validation, paper trading, licensing cautions and deployment needs.

## Product scope
Discovery-first scanner for newly created crypto assets and meme coins, fresh DEX pools, possible exchange listings, public rumours, and event-driven small-cap equities. Established mega-caps are not the focus.

## Current browser-side public connectors
- **DEX Screener** — latest token profiles and boosted tokens; current browser code consumes public endpoints.
- **GeckoTerminal** — new DEX pools on selected networks.
- **GDELT** — public-news discovery queries.
- Paper account — virtual $100, stored in browser localStorage.

The UI's Discovery Score is a transparent heuristic, not a calibrated probability or expected return. Boosted/promoted assets must be marked as promoted, not treated as organic demand. Feed failure must show unavailable/stale, never invented values.

## API procurement checklist (prioritized)

### Priority 1 — crypto discovery, risk and on-chain
1. **GoPlus Security** — token-security checks where supported (contract permissions, honeypot-like flags, tax and related risk fields). Docs: https://docs.gopluslabs.io/
2. **Helius OR Birdeye** — choose one first for Solana token metadata, wallet activity, transactions and holder/on-chain signals. Helius: https://www.helius.dev/ ; Birdeye: https://docs.birdeye.so/
3. **RugCheck** — supplementary Solana token risk signals. Docs: https://docs.rugcheck.xyz/
4. Keep **DEX Screener** and **GeckoTerminal** for discovery and market/pool data. Check current rate limits and permitted usage.

### Priority 2 — listings, rumours and news
5. **X API** — public posts from a configured list of exchange, project, developer and analyst accounts. API access/tier and historical search availability must be checked: https://developer.x.com/en/docs
6. **Reddit API** — selected public subreddits and posts; comply with Reddit's current API terms: https://www.reddit.com/dev/api/
7. **Telegram Bot API** — only explicitly configured public channels/chats where the bot/access method is permitted; it does not provide universal access to all Telegram content: https://core.telegram.org/bots/api
8. **CryptoPanic API** — crypto news aggregation: https://cryptopanic.com/developers/api/
9. **CoinMarketCal OR CryptoRank** — community/event/listing calendar. Treat future listing claims as unverified until matched to an exchange primary source: https://coinmarketcal.com/en/doc and https://cryptorank.io/
10. **Official exchange announcements** — choose target exchanges (for example Binance, Coinbase, Kraken and regionally relevant venues); ingest official API/RSS if available or use permitted, rate-limited public-page monitoring. Do not treat a calendar or rumour as official confirmation.

### Priority 3 — small-cap equities and corporate catalysts
11. **SEC EDGAR APIs** — filings such as 8-K, S-1/F-1, 13D/G, Form 4; free, with required fair-access behaviour and a descriptive User-Agent: https://www.sec.gov/edgar/sec-api-documentation
12. **openFDA + ClinicalTrials.gov API** — regulatory/clinical-trial events for biotech candidates: https://open.fda.gov/apis/ and https://clinicaltrials.gov/data-api/about-api
13. **Massive (formerly Polygon.io) OR Finnhub** — choose one stock market-data provider for OHLCV, quotes and corporate actions. Verify coverage of OTC/pink-sheet and micro-cap symbols, latency, exchange coverage, redistribution/public display rights and price plan before purchasing: https://massive.com/docs and https://finnhub.io/docs/api
14. IPO calendars and issuer Investor Relations RSS/pages can supplement primary filings; source coverage and API availability need to be verified per provider.

## What each record should retain
- Source/provider and source URL; author/publisher and source-native ID.
- Event/published timestamp AND collector/ingestion timestamp (UTC).
- Raw payload or a lawful retained excerpt, normalized asset/ticker/contract identifier, chain/exchange.
- Evidence class: official primary source, independently corroborated, single-source rumour, promoted/paid, or market-confirmed.
- Parser/model version, deduplication key, last-seen timestamp, source health and error state.

## Metrics and risk signals
For crypto: pool/token age, liquidity, volume, volume/liquidity ratio, buy/sell transaction counts, price changes, holder concentration, deployer/wallet links, token permissions, LP/rug risk, organic-vs-paid mentions and mention velocity.
For equities: symbol mapping, float/shares outstanding where licensed, dollar volume, spread/liquidity, volatility, corporate actions, SEC filings, IPO/clinical/regulatory/contract events and source timestamps.
Keep novelty, evidence quality, potential, and manipulation risk as separate scores. A score is not a prediction probability.

## Important integration/security notes
- This repository currently hosts a **static GitHub Pages** front end. It cannot securely store secret API keys and cannot run a persistent collector or database.
- Do **not** paste secrets into HTML, JavaScript, a public GitHub issue, or commit history. Keys must be added as server-side environment variables/secrets once a backend host is selected.
- A production pipeline needs a server-side worker/scheduler, database (e.g. PostgreSQL), raw event archive, retries/rate-limit handling, health monitoring and immutable forecast snapshots.
- Before using a provider, confirm its latest pricing, rate limits, geography/asset coverage and rights to store/display/redistribute data. These terms can change.
- Public rumours are research leads, not facts. Do not ingest private chats or bypass access controls.

## Suggested first implementation
1. Connect GoPlus + Helius/Birdeye + SEC EDGAR (plus current DEX/GDELT feeds).
2. Add server-side source registry, health status, last-success timestamps, and raw/normalized event storage.
3. Connect X and news aggregation only after API access/price is confirmed.
4. Add one stock-data provider only after confirming small-cap/OTC coverage and display rights.
5. Evaluate discovery alerts against subsequent 24h/48h outcomes, fees, slippage and adverse excursion before claiming predictive performance.

## Disclaimer
Research and simulation only, not investment advice. New tokens and micro-cap securities can be illiquid or manipulated; total loss is possible. The paper account is virtual.


## Visual dashboard (October 2026 redesign)
- Symmetrical responsive layout with a compact market overview and consistent card/grid spacing.
- Live-data visualizations: 24h momentum bars, risk-flag distribution, and liquidity-versus-volume scatter plot. Charts render from the current public DEX responses; missing data is shown as unavailable rather than filled with sample values.
- Color semantics: green = fewer visible risk flags / positive movement, amber = review required or incomplete data, red = elevated risk flags / negative movement. Green is not a security guarantee.
- Signal pipeline diagram explains discovery → verification → risk assessment → observe/stop.
- Equity events remain source discovery only until a licensed stock quote provider is connected; no stock prices are fabricated.


## Core-market dashboard and light theme
- The main navigation now separates **Discovery** (new pools, newly surfaced tokens and boosted profiles) from **Core Market** (large-cap assets and stablecoins).
- The Core Market tab requests public Binance Spot market statistics for BTC, ETH, XRP, BNB, SOL, DOGE, ADA, TRX, LINK, AVAX and the USDC/USDT pair. USDT is explicitly shown as a $1 peg reference, not represented as a live USD quote.
- The BTC candlestick chart loads public OHLCV klines and supports 1h, 4h and 1d intervals. Additional views show 24-hour market breadth, trading-volume comparisons and the asset-type mix.
- The interface uses a high-contrast light palette. Green/red candles represent close above/below open; colors do not imply that an asset is safe or suitable to buy.
- Browser-accessible public endpoints are used without an API key. Availability and cross-origin access depend on the provider and network. If the endpoint is unavailable, the UI should show an unavailable state rather than invent values.
- The page remains static GitHub Pages; this dashboard is a visual front-end and does not yet provide persistent historical storage, server-side collection, licensed exchange-wide data, or investment recommendations.


## Discovery UI improvements
- Discovery filter buttons use high-contrast labels and colored category markers.
- Clicking a discovery row or a major-asset quote opens an asset detail dialog with asset type, current quote, 24-hour change, available pool age/address/source, risk flags, and listing-status caveats.
- The discovery table includes an illustrative "$1 / 24h scenario": it mechanically repeats the previous 24-hour price change once. This is explicitly labeled as a historical-move scenario, not a forecast or expected return. Fees, slippage, taxes, liquidity constraints, and total-loss risk are not included.
- Risk for major assets is marked "not calculated" in the detail dialog unless a dedicated risk model is connected. The app does not infer official exchange listings from DEX discovery alone.


## Geopolitical catalyst watchlist (October 2026)
- Added a dedicated watchlist for defence/aerospace and construction/reconstruction-related equities, with exchange quote-page links and event triggers to monitor.
- Defence watchlist examples: RTX, LMT, NOC, RHM.DE, BA.L and 7011.T. Construction/materials examples: CAT, URI, CRH, HEI.DE, HOLN.SW and MT.
- Added a GDELT public-news query focused on Ukraine, Iran, Israel, political leaders/statements, defence spending/contracts, reconstruction and construction materials.
- The static site does not yet have a licensed stock market-data connector. Ticker cards link to market quote pages rather than fabricating live prices or intraday changes.
- A geopolitical headline is a monitoring prompt, not a price forecast. Confirm contract awards, government budgets, tender funding, company exposure and current valuation; de-escalation, high input costs and already-priced expectations can reverse reactions.
- Visual direction updated from white/light to a midnight graphite + petrol teal + copper/amber palette, keeping red/green reserved for risk and direction.
