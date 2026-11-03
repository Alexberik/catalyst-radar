# MAGIC EXTREME MOVE data worker

Read-only market-data aggregation for Catalyst Radar. It never connects to wallets or submits transactions.

## Sources
- DexScreener public token profile/boost feeds and pair snapshots.
- GeckoTerminal public Solana new/trending pools.
- RugCheck token report summary per candidate.
- Birdeye token overview when BIRDEYE_API_KEY is configured.
- Solscan token metadata when SOLSCAN_API_KEY is configured.
- Reddit public search results as unverified social chatter (not proof and not a buy signal).

X/Twitter and Telegram are not queried by default: reliable access requires authorized API credentials or explicit public feeds/channels. Do not scrape private groups or bypass platform access controls.

## Deploy
Install Node.js LTS, then:
```powershell
npm install -g wrangler
npx wrangler login
cd catalyst-radar/cloudflare/magic-extreme-move
npx wrangler deploy
```
Optional API secrets (add only through Wrangler; never commit them):
```powershell
npx wrangler secret put BIRDEYE_API_KEY
npx wrangler secret put SOLSCAN_API_KEY
```
Then configure the deployed Worker URL in extreme-move.html. Endpoint:
- GET /health
- GET /scan?confirm=read-only

## Important limitations
This first integration is a multi-source candidate feed, not a complete on-chain new-pool firehose. DexScreener profiles/boosts are curated metadata feeds, not every new pool. GeckoTerminal public API is rate-limited. For sub-minute all-pool discovery, add a dedicated Solana RPC/indexer subscription (e.g. Helius/Bitquery) and persist seen pool IDs. Birdeye WebSocket discovery requires a paid/authorized key and subscription support.
RugCheck schema/availability can change; each source is isolated so one failure does not stop others. Verify source health and timestamps.
Reddit chatter is explicitly unverified. No sentiment item should ever independently trigger an entry.
No executable trade sizing is supplied here. To estimate actual buy and sell capacity, query Jupiter quote routes for both directions at the exact proposed input size, compare output/minimum received, price impact, route, fees and token transfer restrictions. Repeat at several sizes (e.g. $5/$10/$25/$50); this is still a quote, not a fill guarantee.
