# CATALYST RADAR — Early Signal Intelligence

Live site: https://alexberik.github.io/catalyst-radar/

## Product direction
A discovery-first market intelligence terminal focused on new tokens, meme coins, fresh DEX pools, potential listings, public rumours/news, and event-driven small-cap equity research — not a leaderboard of established large caps.

## Current live public data connections
- **DEX Screener** public API: latest token profiles and boosted-token list.
- **GeckoTerminal** public API: new pools across Solana, Base, Ethereum, BNB Chain and Arbitrum.
- **GDELT** public news index: headlines for public event discovery queries.
- Paper trading is virtual and stored in browser localStorage.

The UI does not synthesize prices or news when feeds fail. Assets without an available quote are visible for research but cannot be traded in the paper account. Discovery Score is a transparent heuristic, not a calibrated probability or expected return.

## Important limits of the static GitHub Pages version
- This is a browser-only front end. API availability and CORS/rate limits can vary.
- Exchange listing pages, X, Reddit, Telegram, SEC/FDA filings and equity prices are linked as research channels but are **not yet ingested** as automated feeds.
- A full always-on source pipeline needs a backend scheduler, persistent database, raw-event archive, source health monitoring, social/news provider integrations, and a licensed equities market-data provider.
- Public or unofficial rumours are not evidence. The UI labels them for verification; official primary sources must be stored separately.
- No real trading or brokerage execution is included.

## Planned ingestion architecture
1. Collect source-native payloads and preserve original URL, publisher, event timestamp, ingestion timestamp and raw content.
2. Normalize assets and events across chain/ticker identifiers; deduplicate copied headlines and syndicated posts.
3. Score source credibility, novelty, mention velocity, liquidity, volume, holder concentration and manipulation risk separately.
4. Store immutable candidate snapshots before the outcome window; measure 24h/48h outcomes, drawdown and net returns after fees/slippage.
5. Never represent a discovery score as a probability of price increase without out-of-sample calibration.

## Stack
Static HTML/CSS/JavaScript for GitHub Pages. Public provider endpoints are called directly from the browser; no API secrets are embedded.

## Disclaimer
Research and simulation only, not investment advice. New tokens and small-cap securities can be illiquid or manipulated; loss of all invested capital is possible. Demo cash is virtual.
