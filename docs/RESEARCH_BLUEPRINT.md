# Catalyst Radar — Research Blueprint & Reference Audit

Updated: 2026-10-25

This document translates ideas observed in Vibe-Trading, Fincept Terminal, Slash and Supabase design references into an implementation plan for Catalyst Radar. It is an independent architecture and product plan, not a claim that all planned features already exist.

## Executive decision

Build Catalyst Radar as a **public, bilingual, web-first market-intelligence platform** with an institutional-style research terminal experience. Do not attempt to clone a desktop terminal wholesale. Prioritize a dependable data foundation, transparent event/signal ranking, a forecast ledger, and a $100 paper account. Expand breadth only after the core loop is measurable.

The core loop is:

1. Collect timestamped observations from independent sources.
2. Normalize symbols, chains, currencies, timestamps and units.
3. Validate freshness, completeness, provenance and cross-source disagreement.
4. Detect unusual price/volume/liquidity/activity and corporate/news catalysts.
5. Generate a transparent signal with evidence, risks and a defined horizon.
6. Store the signal before the outcome is known.
7. Score the forecast after the horizon; publish calibration and paper portfolio outcomes.
8. Improve the system using out-of-sample evidence, not retrospective narratives.

## Reference audit

### 1. HKUDS/Vibe-Trading — research, quant and agent patterns

Repository: https://github.com/HKUDS/Vibe-Trading  
Observed license: MIT. Preserve the copyright/license notice if code is reused; this plan borrows product and engineering ideas, not code.

Patterns worth adapting:
- **Provider adapters and a registry:** isolate each market-data source behind a common interface. Do not scatter provider URLs and parsing logic across UI routes.
- **Market-specific handling:** crypto trades 24/7, equities follow exchange calendars, futures have contract multipliers and session rules. Annualization, bars and fees must be asset-class-aware.
- **Research tools as separate modules:** market data, factor/signal calculation, event research, backtesting, risk checks and paper execution should be independently testable.
- **Backtest validation:** walk-forward splits, bootstrap confidence intervals, permutation tests and benchmark comparisons are useful guardrails. They do not guarantee future performance.
- **Undefined is not zero:** when data is missing, a metric cannot be computed, or sample size is too small, return an explicit unknown/null plus a reason.
- **Run cards and provenance:** save input data versions, configuration, timestamps, warnings and metric definitions for every run.
- **Paper trading:** match against completed/available market bars, apply fees/slippage and keep the paper ledger isolated from any real broker. The account should advance only when new eligible data is available.
- **Factor research:** use a factor registry with definitions and test metadata instead of a single opaque “AI score”.
- **AI agents:** agents can explain and orchestrate approved research tools, but deterministic tools should calculate prices, returns, risk and portfolio accounting.

Do not import its full agent runtime into the current static site. It is a much larger Python/React product; integrate selected capabilities behind a stable API only after the platform needs them. Never enable live order execution as part of the first release.

### 2. FinceptTerminal — breadth of financial data and terminal workflows

Repository: https://github.com/Fincept-Corporation/FinceptTerminal  
**Important licensing note:** its repository states AGPL-3.0 and a commercial-license model. Do not copy or port its code into Catalyst Radar without a deliberate legal/license review. Use public architectural concepts and independently implement our own versions.

Patterns worth adapting:
- **Shared data hub/cache:** one request should feed multiple panels; cache by topic/query with explicit TTL, rate limits, deduplication and force-refresh behavior.
- **Incremental rollout:** migrate one provider and one consumer first; keep compatibility wrappers; measure behavior before migrating the rest.
- **Progressive news loading:** render initial results promptly, then append additional source results without duplicating existing articles.
- **Topic-based data contracts:** e.g. `market:quote:NVDA`, `crypto:pool:solana:<address>`, `news:symbol:NVDA`, `econ:fred:CPIAUCSL`, `event:issuer:<cik>`.
- **Broad research domains:** quotes, historical prices, fundamentals, macroeconomic series, filings, news, geopolitics and portfolio analytics can share provenance and cache infrastructure while retaining their own refresh cadence.
- **MCP/agent access:** expose bounded, schema-validated read tools to an optional research agent. Agents should read from the same normalized data layer as the UI instead of independently refetching inconsistent data.
- **Data connectors inventory:** make provider status, configured/unconfigured state, last successful fetch, latency, freshness and errors visible to users/operators.
- **Testing and release gates:** lint, unit tests, data-contract tests, sanitizers/build checks and explicit migration phases reduce risk in a growing system.

Do not try to replicate the full native C++/Qt terminal, 800+ provider claim, or all its analytics modules. Catalyst Radar's differentiator should be early-event discovery, transparent short-horizon forecasts, and publicly auditable results.

### 3. Design references — Slash + Supabase

Use a **hybrid visual system**:
- Base: near-black/graphite surfaces, hairline borders, minimal shadows and clean, technical spacing (Supabase).
- Editorial identity: restrained copper/bronze for section labels and occasional highlight typography (Slash).
- Functional green: reserve phosphor green for primary action, live/healthy state and positive market movement; never use it as a large background wash.
- Red: losses, negative returns, risk and severe warnings. Amber: caution/stale data. Neutral gray: unknown/unavailable.
- Typography: Inter or Manrope for all UI/data, JetBrains Mono for prices, timestamps and technical IDs. Use serif only for a few marketing/hero headings, not for dense terminal tables.
- Buttons: pill shape for high-level actions; cards ~12–16px radius; inputs ~8px. Dense data panels should prioritize compactness and legibility.
- Readability: body 15–16px, secondary labels generally at least 12–13px, contrast-forward borders, visible keyboard focus, and mobile layouts that retain the most important values.
- No fake “live” indicator, fabricated chart history, invented performance stats or unverified social proof.

Suggested tokens:
- Canvas `#0b0d0f`; surface `#121519`; elevated `#191d22`; border `#30363d`.
- Primary text `#f4f6f8`; secondary `#b5bec8`; muted `#8a949f`.
- Phosphor `#3ecf8e`; copper `#c99762`; positive `#39c98a`; negative `#ff6678`; caution `#e8b66b`.
- Use green as the functional primary accent; copper is a low-frequency brand accent. Price movement colors must remain semantically consistent.

## Current baseline — what exists and what does not

Based on the current repository README and backend source:
- Static GitHub Pages UI with crypto discovery and demo/paper-account concepts.
- Public collector for DEX/pool data, some equity quote data and GDELT news, plus rolling snapshots on the separate `market-data` branch.
- FastAPI backend foundation with discovery, source health, news/events, token-security checks, biotech-event discovery, stock quote hooks and SQLite scan/event history.
- Optional server-side integrations are present for some providers; many are inactive until credentials are configured.
- Existing `score_asset` is explicitly a **heuristic discovery score**, not a calibrated probability or expected-return forecast.
- Backend is not yet deployed/connected to the public frontend according to the repository README. GitHub Pages alone cannot run a persistent backend or securely store private keys.

Do not describe the full platform as production-ready until backend deployment, storage durability, provider health, tests, and forecast validation are verified.

## Target architecture

```
Public providers / licensed APIs
        ↓
Provider adapters (timeouts, retries, quotas, schemas)
        ↓
Ingestion jobs + scheduler + dead-letter/error tracking
        ↓
Normalization & entity resolution
        ↓
Time-series/event store + raw payload archive + provenance
        ↓
Feature pipeline ── Data-quality and freshness gates
        ↓
Deterministic detectors + event/catalyst correlation
        ↓
Candidate ranker → forecast ledger → evaluation/backtest
        ↓
FastAPI read API → public web UI / charts / paper account
        ↓
Optional research agent via bounded, read-only tools
```

Recommended stages:
- **Now:** retain FastAPI, isolate providers and scoring, add schema/quality tests, improve collector observability and publish the architecture.
- **Next:** deploy API to a managed Python host; use managed PostgreSQL for durable data. SQLite remains suitable for local tests/development, not multi-instance production.
- **Then:** add job scheduling/queue, idempotent ingestion, raw response archive, feature snapshots, and immutable forecast records.
- **Later:** add WebSockets/SSE for live updates, event/entity graph, multi-agent research and optional MCP.
- Keep public frontend keys out of browser assets. Secrets belong only in server-side environment variables/secret storage.

## Data source strategy

Start with public/no-key providers, but treat coverage, reliability, redistribution rights and rate limits as separate questions. A public endpoint is not automatically a production SLA or permission to republish all fields.

| Domain | Initial/low-cost sources | Add when justified | Important controls |
|---|---|---|---|
| Crypto market/pools | DEX Screener, GeckoTerminal, CoinPaprika, exchange public APIs (e.g. Binance) | CoinGecko, paid exchange feeds, specialized DEX/on-chain APIs | chain/address identity, pool age, liquidity, spread/slippage, wash-volume caveats, stale-pool detection |
| Token security | GoPlus, RugCheck | Helius/Birdeye or other chain-native providers | missing data = unknown, not safe; separate hard risk flags from ranking |
| Stocks/quotes | Stooq/Yahoo public endpoints for development only; SEC EDGAR for filings | Finnhub, Financial Modeling Prep, Polygon/Massive or another licensed feed | delayed vs real-time labels, exchange calendars, splits/dividends, corporate actions, symbol mapping, redistribution terms |
| Fundamentals/filings | SEC EDGAR, company IR, public exchange filings | licensed fundamentals provider | accession/filing timestamps, point-in-time facts, restatements |
| News/events | GDELT, RSS feeds, official issuer/regulator releases | CryptoPanic and licensed news APIs | deduplicate syndication, store publication and observation time, source credibility, article rights |
| Macro/economics | FRED, World Bank, IMF, ECB/Eurostat/OECD and DBnomics where supported | licensed macro feeds if needed | revisions, release calendar, frequency, vintage/as-of date |
| On-chain/social | public chain explorers and permitted community sources | Helius, Birdeye, Reddit/X or other licensed APIs | no broad scraping assumptions; rate limits, bot/promoted-content detection, platform terms |
| Geopolitics/defense/reconstruction | official government, procurement, aid, sanctions and company releases; GDELT for discovery | specialist licensed datasets if value is demonstrated | distinguish primary sources from commentary; corroborate claims; timestamp events |
| Biotech catalysts | ClinicalTrials.gov, openFDA, SEC/company filings | specialized clinical/financial datasets | trial phase/status, event dates, regulatory uncertainty; avoid interpreting a listing as a positive result |

Never scrape private groups or claim access to arbitrary Telegram channels. Integrate only sources and channels whose access and reuse are permitted.

## Forecasting and Extreme Move Scanner

### Separate three outputs

1. **Discovery priority (0–100):** how interesting an asset/event is to investigate. This is a ranking, not a probability.
2. **Directional forecast:** expected return range/distribution over 24h and 48h, with uncertainty and a calibrated probability of positive return only after enough out-of-sample evidence exists.
3. **Risk/quality status:** liquidity, contract/security, data freshness, source disagreement, market hours, volatility and event uncertainty.

### Feature families

- Price/volume: multi-horizon returns, acceleration, realized volatility, volume z-score, range expansion, gap/mean reversion, trend persistence.
- Liquidity/execution: liquidity depth, turnover, spread where available, volume/liquidity ratio, estimated slippage, concentration and pool age.
- Relative strength: asset vs BTC/ETH, sector, market/benchmark and peer group.
- Derivatives where available: funding, open interest, liquidations, basis; clearly label coverage gaps.
- On-chain: holder/concentration changes, liquidity additions/removals, deployer/owner risks, wallet flows and bridge/exchange flows where reliable.
- Events: listing announcements, filings, earnings, clinical/regulatory milestones, contracts/awards, sanctions, policy announcements, defense spending/procurement and reconstruction contracts.
- News: novelty, source tier, corroboration count, entity match, event time, sentiment/topic and uncertainty. Do not let a single unverified headline dominate.
- Context: broad market regime, session, asset class, event calendar and known macro releases.

### Signal pipeline

- Normalize each feature robustly within asset class and liquidity tier; winsorize outliers and preserve missingness.
- Start with interpretable baselines: momentum/volatility/liquidity/event rules and logistic/regularized models where enough labeled history exists.
- Avoid training complex models on tiny samples. Keep a simple baseline and compare every model against it.
- Rank by expected utility after estimated fees/slippage, with risk penalties and minimum liquidity rules.
- Keep discovery score, forecast probability and execution suitability separate.
- Require multiple independent sources for high-impact event claims where possible.
- Every signal record should include `created_at`, `valid_until`, horizon, asset ID, model/version, feature snapshot/version, inputs/source references, score/probability semantics, risk flags, entry reference price and evaluation status.
- Never rewrite a historical forecast after the outcome is known. Corrections should be appended with audit history.

### Backtest and forecast validation (non-negotiable)

- Chronological train/validation/test split; walk-forward evaluation; no random shuffle across time.
- Purge overlapping 24h/48h labels around split boundaries to prevent leakage.
- Point-in-time features only: data must have been observable at prediction time. Avoid look-ahead in news, listings, filings and fundamentals.
- Include delisted/dead tokens where possible to reduce survivorship bias; report coverage limits.
- Include fees, spread, slippage, liquidity capacity and realistic fill rules. Do not fill at an idealized candle close if it was not observable/executable.
- Report hit rate with sample size, precision/recall for rare extreme moves, Brier score/log loss and calibration when probabilities are used, rank correlation, top-k return, max drawdown, turnover, benchmark and confidence intervals.
- Compare against simple baselines and random/naive ranking; track performance by asset class, liquidity tier and market regime.
- Record all failed/missing data windows. Missing observations are not zero returns.
- Publish both positive and negative results. Never promise returns or imply that past performance guarantees future outcomes.

## Paper trading

- Default initial balance: **$100 virtual funds**.
- Use append-only ledger entries; current balance is derived from ledger, not silently overwritten.
- Separate cash, holdings, realized/unrealized P&L, fees, slippage and trade history.
- No margin/leverage by default; no real broker connectivity in initial scope.
- Simulated order fills must have explicit assumptions (market/limit, spread/slippage, partial fills, market hours, missing candles).
- Prevent duplicate fills on repeated scheduler runs using deterministic order/fill IDs.
- Show forecast source and timestamp at trade time; do not use future data.
- Store a benchmark portfolio and compare paper results to buy-and-hold or a relevant index.
- Browser localStorage is acceptable for a disposable demo; use authenticated server-side accounts and durable database storage before promising persistence across devices.

## UI information architecture

1. **Overview:** market regime, source freshness, leading signals, recent catalysts, benchmark context.
2. **Extreme Move Scanner:** crypto and equities tabs, horizon toggle 24h/48h, liquidity filters, risk flags, new pools/listings, score explanation and evidence links.
3. **Asset detail:** chart, returns/volatility, liquidity, related news/events, risk checks, signal history and forecast outcomes.
4. **News & Catalysts:** deduplicated feed, filters by topic/asset/region/source tier, corroboration and event timeline.
5. **Forecast Track Record:** immutable forecast ledger, due/settled counts, hit rate/calibration, top-k returns and drawdown with sample sizes.
6. **Paper Trading:** $100 account, holdings, trade ledger, fees, P&L and benchmark comparison.
7. **Data Observatory:** provider status, last success, latency, error, quota/coverage notes, stale data warnings.
8. **Methodology:** score definitions, data limitations, model versions, backtest protocol and disclosures.
9. **Settings:** RU/EN, time zone, watchlists and notification preferences.

## Implementation roadmap and acceptance gates

### Phase 0 — Audit and baseline
- Preserve current working site and collectors.
- Inventory endpoints, workflows, tests, and which sources are actually queried.
- Record known limitations and current data freshness.
- Gate: no existing feature removed; all current tests pass.

### Phase 1 — Data reliability
- Provider adapter interface, common normalized schemas, retries/backoff, per-source quotas, TTL cache and structured status.
- Timestamp every source observation; persist source and raw payload references.
- Deduplicate assets/events and validate required fields.
- Gate: contract tests for each adapter, stale-source UI, repeat runs are idempotent.

### Phase 2 — Research and scanner
- Add feature snapshots and transparent feature contributions.
- Add distinct discovery score, forecast schema and risk status.
- Implement 24h/48h labels and immutable forecast ledger.
- Gate: every displayed signal explains why it appears and which sources support it.

### Phase 3 — Validation
- Walk-forward backtest harness with leakage checks, realistic costs and baseline comparisons.
- Daily evaluation job and public performance report.
- Gate: forecast cards show no probability until calibration criteria and minimum sample thresholds are met.

### Phase 4 — Paper account
- $100 ledger, deterministic fills, fees/slippage, risk limits and benchmark.
- Gate: replaying a data window does not duplicate trades; accounting invariants are tested.

### Phase 5 — Production service
- Deploy FastAPI outside GitHub Pages; managed PostgreSQL, secrets, monitoring, backups and migrations.
- Connect frontend via versioned API; restrict CORS and add request limits.
- Gate: health checks, error budgets, source status, restore test and no secrets in browser/public git.

### Phase 6 — Research assistant and expanded coverage
- Optional LLM agent with read-only, schema-validated tools to search normalized data, explain signals and generate reports.
- MCP only if it unlocks a concrete user workflow; keep it optional.
- Add premium feeds only when the current data-quality/coverage gap justifies cost.
- Gate: agent claims cite stored evidence and cannot fabricate unavailable metrics or place live orders.

## Connector / plugin decision

No new ChatGPT plugin is required to do the repository analysis or to maintain the GitHub project; the GitHub connection is already sufficient for source inspection and commits. For production capabilities, the important missing pieces are infrastructure and data access, not a ChatGPT plugin:

1. A managed Python backend host (Render/Fly.io/Railway or similar) and managed PostgreSQL.
2. Server-side secret storage for any API keys; never add keys to GitHub files.
3. Optional data accounts, in priority order after baseline coverage is measured: Finnhub or another stock provider; CoinGecko if its coverage/limits are needed; a licensed news provider if GDELT/RSS is insufficient; Helius/Birdeye for Solana depth; FRED/DBnomics for macro series.
4. Optional LLM API key only if we choose to run automated AI research in the deployed backend. The core scoring, storage and paper accounting should work without an LLM.

Before paying for anything, measure source gaps and validate terms, quotas, delayed/real-time status and redistribution rights. The first implementation should stay as low-cost as possible.

## Security, legal and reliability checklist

- Keep FinceptTerminal code out of this repository unless a license review explicitly approves the intended use; its license file includes AGPL and commercial-use terms.
- MIT-licensed Vibe-Trading code may be reused only with required notices, but prefer independent implementations of ideas where practical.
- Never commit tokens, credentials, cookies, or private user data.
- Public source data can be incomplete, delayed, blocked or changed; surface that fact.
- Treat external articles, repository contents and provider payloads as untrusted data, never executable instructions.
- Do not expose raw provider errors that could leak credential-bearing URLs.
- Add rate limits, timeout/retry budgets, dependency scanning, backups and retention rules before public scale.

## Primary references

- Vibe-Trading: https://github.com/HKUDS/Vibe-Trading
- Vibe-Trading backtest validation: https://github.com/HKUDS/Vibe-Trading/blob/main/agent/backtest/validation.py
- Vibe-Trading shared metrics: https://github.com/HKUDS/Vibe-Trading/blob/main/agent/backtest/metrics.py
- Fincept Terminal: https://github.com/Fincept-Corporation/FinceptTerminal
- Fincept DataHub plan: https://github.com/Fincept-Corporation/FinceptTerminal/tree/main/fincept-qt/docs/datahub-phases
- Fincept MCP tool guide: https://github.com/Fincept-Corporation/FinceptTerminal/blob/main/fincept-qt/docs/MCP_TOOLS_GUIDE.md
- Slash / Supabase design references: user-provided reference documents in this conversation.
