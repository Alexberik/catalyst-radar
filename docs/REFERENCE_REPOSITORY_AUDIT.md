# Catalyst Radar — Market Intelligence — Reference Repository Audit

Updated: 2026-11-03

## Purpose

This document records what was reviewed in the ten supplied public repositories, what can be adopted in Catalyst Radar / MAGIC, and what is intentionally not copied. It is an implementation plan and repository audit, not a claim that every provider or model is already connected.

## Reference review

| Repository | What the source documents | Adopt in Catalyst Radar | Do not assume |
|---|---|---|---|
| [ccxt/ccxt](https://github.com/ccxt/ccxt) | Unified public/private REST and WebSocket APIs for 100+ crypto exchanges and prediction-market venues; normalized market data and trading interfaces; multiple languages. | Optional CEX adapter for OHLCV, tickers, order books and exchange metadata. Keep exchange-specific limits and market identifiers behind adapters. Use public-only credentials-free mode initially. | CCXT does not provide Solana DEX pool firehose or token risk/holder intelligence. Private trading must remain disabled in this project phase. |
| [crypto-analytics-platform](https://github.com/sarfraspc/crypto-analytics-platform) | FastAPI, MCP orchestration, MLflow, Prophet, CNN-LSTM, TFT, SARIMAX, SHAP, sentiment, RAG/Qdrant, on-chain and multi-source ingestion. | Separate data/forecast/sentiment/on-chain services; model registry and experiment tracking; explainability and citations; optional read-only research assistant. | Repository description and README do not establish that its models generalize to new Solana microcaps. Do not import the monolith wholesale. |
| [Awesome-Prediction-Market-Tools](https://github.com/aarora4/Awesome-Prediction-Market-Tools) | Curated prediction-market products, tools and APIs including market data, analytics, news and agent workflows. | Optional Event Probability Monitor: track event contracts, probability changes, liquidity and source links for macro/geopolitical/listing catalysts. Use only documented APIs and distinguish market-implied probability from Catalyst Radar's forecast. | A curated directory is not a guarantee that every listed API is free, active, accurate or licensed for redistribution. |
| [crypto_prediction](https://github.com/baileyarzate/crypto_prediction) | End-to-end BTC next-day close pipeline: CCXT OHLCV, technical/macro/news features, Linear/Ridge/Random Forest/XGBoost ensemble, SHAP and reproducible timestamped artifacts. | Reproducible training runs, timestamped feature datasets, baseline model ensemble, model-spread display and SHAP-based explanation where supported. | BTC-only results cannot be transferred to thin-liquidity microcaps without new training and validation. |
| [crypto-price-predict](https://github.com/gpmikhail/crypto-price-predict) | Binance historical data ingestion, saved CSV, candlestick display and TensorFlow/Keras GPU prediction workflow. | Historical candle ingestion and chart/data pipeline patterns only. | GPU deep learning is not a prerequisite for the MVP; the README does not demonstrate robust out-of-sample accuracy. |
| [market-forecast](https://github.com/kavehbc/market-forecast) | Streamlit forecast app using Prophet/NeuralProphet and Yahoo Finance historical price data. | Add simple statistical baselines as challengers to more complex models; make model limitations visible. | Forecasts based only on historical prices do not incorporate pool health, wallet flows, social events or executable liquidity. |
| [coinpulse](https://github.com/adrianhajdin/coinpulse) | Next.js/TypeScript/Tailwind/shadcn UI, CoinGecko market data, WebSocket updates, token search/details and TradingView Lightweight Charts. | Improve information hierarchy, asset detail views, search, charting and responsive dashboard patterns. Reimplement in current static frontend unless/ until a framework migration is justified. | Do not copy assets/code without confirming repository licensing. CoinGecko WebSocket and API use depend on current plan and terms. |
| [awesome-finance-apis](https://github.com/rahul-ai-studio/awesome-finance-apis) | Curated free/freemium finance APIs for equities, fixed income, FX, crypto, macro, sentiment and reference data; includes caveats and rate-limit notes. | Provider procurement matrix: compare coverage, freshness, rate limits, free tier, history depth, commercial display rights and cost before enabling. Candidate macro sources include FRED, ECB and World Bank; identifier mapping via OpenFIGI. | Its stated quotas/pricing are time-sensitive; verify directly with each vendor before production procurement. |
| [freqtrade/freqtrade](https://github.com/freqtrade/freqtrade) | Python trading bot with strategy interface, backtesting, dry-run/paper trading, performance reports, Telegram control and lookahead/recursive analysis. | Borrow test discipline: dry-run only, fee/slippage modeling, lookahead-bias checks, strategy versioning and detailed paper ledger. | Freqtrade is GPL-3.0. Do not copy or link its code into a closed/proprietary distribution without license review. It is not a Solana microcap discovery engine. |
| [TradingAgents](https://github.com/TauricResearch/TradingAgents) | Multi-agent research roles: fundamentals, sentiment, news and technical analysts; bull/bear researchers; trader; risk manager; portfolio manager; simulated execution; backtesting and point-in-time safeguards. | A read-only analyst workflow that debates evidence, then hands a structured proposal to deterministic risk checks. Save all inputs, citations, timestamps and final decision. | LLM agents are nondeterministic and must not calculate authoritative prices, PnL, risk limits or portfolio accounting. No autonomous live trading. |

## Licensing and reuse policy

- CCXT repository metadata identifies MIT.
- TradingAgents repository metadata identifies Apache-2.0.
- Freqtrade repository metadata identifies GPL-3.0; treat it as a separate copyleft product and do not copy its implementation into Catalyst Radar without legal review.
- For repositories whose license was not verified during this audit, reuse architectural ideas only until their license files are checked.
- The prediction-market tools repository is a directory of third-party resources; each linked product/API has its own terms.
- Keep notices and license texts when any permitted code reuse is approved. Prefer clean-room implementations of ideas.

## Product decisions for Catalyst Radar

1. Preserve the existing Catalyst Radar public frontend and FastAPI service; evolve it incrementally rather than replacing a working deployment with an untested framework migration.
2. Keep **Solana early discovery** as the differentiator. CCXT is a separate centralized-exchange market-data adapter, not a replacement for FluxRPC/Yellowstone, Helius, Birdeye or DEX pool sources.
3. Smart Money / wallet-behavior analysis is an internal scoring input, not a separate navigation module. Detect independent wallets, common funders, historical entry timing, holding duration and accumulation/distribution. Do not call wallet owners insiders.
4. Separate three states: **pre-move candidate**, **move already underway**, and **risk/trap watch**. A token that has already risen sharply must not be presented as an early signal.
5. Every score must expose contributing evidence, missing fields, source timestamps and risk flags. Missing data is UNKNOWN, never zero and never "safe".
6. Prediction-market odds are event-market consensus, not an asset-price prediction. Show them in a separate catalyst context layer.
7. Paper trading must be deterministic and ledger-based. No live order execution or exchange private keys in the public site.

## Target research flow

```text
Public / licensed providers
  ├─ Solana: FluxRPC Yellowstone + WebSocket + HTTP RPC
  ├─ Solana enrichment: RugCheck, Helius, Birdeye, Solscan
  ├─ DEX markets: GeckoTerminal, DEX Screener (terms review)
  ├─ CEX markets: CCXT public adapters
  ├─ Execution feasibility: Jupiter quote API (quote only)
  ├─ Equities: Finnhub OR Massive/Polygon, SEC EDGAR
  ├─ Events: GDELT, CryptoPanic, official exchange feeds, X/Reddit/authorized Telegram
  ├─ Macro: FRED, ECB, World Bank
  └─ Prediction markets: supported CCXT venues / provider-specific APIs
                  ↓
         Adapter registry + cache
                  ↓
       Timestamped raw event archive
                  ↓
       Normalization + entity resolution
                  ↓
     Data-quality / freshness / provenance gate
                  ↓
      Feature store + wallet graph (internal)
                  ↓
   Rule detectors + statistical/ML model ensemble
                  ↓
     Bull / bear research review (optional LLM)
                  ↓
       Risk gate + Jupiter quote checks
                  ↓
      Forecast ledger + paper trading
                  ↓
      Forward evaluation + calibration report
                  ↓
             Catalyst Radar web UI
```

## Forecast model stack

Start with transparent, reproducible baselines, then add complex models only if they beat the baselines out of sample.

- Baselines: persistence/naive return, moving-average momentum, logistic regression and regularized linear models.
- Classical/time-series challengers: SARIMAX/Prophet where the series and cadence are appropriate.
- Tree ensemble: Random Forest / XGBoost for tabular engineered features.
- Sequence models: CNN-LSTM or Temporal Fusion Transformer only after enough clean, point-in-time training history exists.
- Sentiment: cryptocurrency-specific classifier plus source-aware sentiment aggregation; an LLM may summarize cited evidence but should not manufacture sentiment data.
- Explainability: SHAP or feature attribution where mathematically appropriate; display the actual contributing features.
- Ensemble: combine model outputs only after calibration on walk-forward validation. Display model disagreement, not just the average.

Do not publish a numerical "probability of pump" until the system has enough settled forecasts to test calibration. Until then expose heuristic rank, directional watch state, data coverage and model status separately.

## Evaluation and anti-leakage rules

- Save a forecast at decision time before the outcome is known.
- Store both event time and observation/ingestion time.
- Never train or score with information published after the forecast timestamp.
- Use chronological walk-forward splits, not random train/test shuffling.
- Include fees, slippage, spread, priority fees and failed/partial execution assumptions.
- Compare against naive momentum, buy-and-hold and relevant market/sector benchmarks.
- Report precision/recall for early-move alerts, hit rate, average adverse/favorable excursion, Brier score/log loss for calibrated probabilities, and paper PnL after costs.
- Keep a forecast even when it fails; do not silently remove losers.
- Separate model version, feature version, provider set and data-quality warnings for each forecast.

## API procurement priority

### Enable first (public/free or already configured where permitted)
- GeckoTerminal new pools and DEX market metadata.
- FluxRPC HTTP/WebSocket/Yellowstone after its exact auth/filter/limits are verified.
- RugCheck risk summary for Solana.
- Jupiter quote endpoint for read-only buy/sell route simulation.
- CCXT public market data for selected centralized exchanges.
- SEC EDGAR, GDELT, FRED and official exchange announcement sources where applicable.

### Choose one paid enrichment provider first
- Helius **or** Birdeye for Solana enhanced transactions/metadata/market metrics. Avoid paying for both until measured coverage gaps justify it.
- Finnhub **or** Massive/Polygon for equities; verify global coverage, microcap/OTC support, latency and redistribution rights before purchase.
- CoinGecko paid tier only if its coverage/freshness is better than existing sources and terms permit intended use.

### Optional later
- Bitquery for indexed on-chain trade/pool streams.
- Nansen / Bubblemaps for wallet labeling and clustering enrichment.
- CryptoPanic for aggregated crypto news.
- X API, Reddit OAuth, and explicitly authorized Telegram channels.
- Qdrant for semantic event/news retrieval after there is enough curated content.
- MLflow for model registry/experiment tracking once training jobs exist.
- PostgreSQL/TimescaleDB for durable time-series and event storage; object storage for raw payload archive.
- ClickHouse only when query volume and event volume justify an OLAP store.

## Implementation status

This audit does not activate new provider credentials or deploy new infrastructure. The existing backend and frontend are separate deployed components. API keys must be entered as server-side secrets in the hosting provider, never committed to GitHub or exposed in browser JavaScript. A source listed as "planned" is not connected until a real successful request, health timestamp and integration test are recorded.
