from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

APP_VERSION = "0.1.0"
DB_PATH = os.getenv("DATABASE_PATH", "./data/catalyst_radar.sqlite3")
API_PREFIX = "/api/v1"
NETWORKS = [x.strip() for x in os.getenv("GECKOTERMINAL_NETWORKS", "solana,base,eth,bsc,arbitrum").split(",") if x.strip()]
USER_AGENT = os.getenv("SEC_USER_AGENT", "CatalystRadar research contact@example.com")
TIMEOUT = float(os.getenv("HTTP_TIMEOUT_SECONDS", "12"))
CACHE_TTL = int(os.getenv("CACHE_TTL_SECONDS", "45"))
_cache: dict[str, tuple[float, Any]] = {}
_source_status: dict[str, dict[str, Any]] = {}

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def safe_error(exc: Exception) -> str:
    """Avoid reflecting URLs, query-string credentials, or provider responses to public clients."""
    message = f"{type(exc).__name__}: provider request failed"
    return message[:180]

def db() -> sqlite3.Connection:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db() -> None:
    with db() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scanned_at TEXT NOT NULL,
            asset_id TEXT NOT NULL,
            symbol TEXT,
            name TEXT,
            chain TEXT,
            price_usd REAL,
            change_24h REAL,
            liquidity_usd REAL,
            volume_24h_usd REAL,
            discovery_score REAL,
            source TEXT,
            payload_json TEXT NOT NULL
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_scans_asset_time ON scans(asset_id, scanned_at)")
        conn.execute("""CREATE TABLE IF NOT EXISTS source_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            observed_at TEXT NOT NULL,
            source TEXT NOT NULL,
            event_type TEXT NOT NULL,
            title TEXT,
            url TEXT,
            published_at TEXT,
            verification TEXT NOT NULL DEFAULT 'unverified',
            payload_json TEXT NOT NULL
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_time ON source_events(observed_at)")

async def get_json(client: httpx.AsyncClient, url: str, source: str, headers: dict[str, str] | None = None) -> Any:
    cached = _cache.get(url)
    if cached and time.time() - cached[0] < CACHE_TTL:
        _source_status[source] = {"ok": True, "cached": True, "checked_at": now_iso(), "error": None}
        return cached[1]
    started = time.monotonic()
    try:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        _cache[url] = (time.time(), data)
        _source_status[source] = {"ok": True, "cached": False, "checked_at": now_iso(), "latency_ms": round((time.monotonic()-started)*1000), "error": None}
        return data
    except Exception as exc:
        _source_status[source] = {"ok": False, "cached": False, "checked_at": now_iso(), "error": safe_error(exc)}
        raise

def num(value: Any) -> float | None:
    try:
        out = float(value)
        return out if out == out and abs(out) != float("inf") else None
    except (TypeError, ValueError):
        return None

def score_asset(asset: dict[str, Any]) -> int:
    """Transparent discovery heuristic; NOT a calibrated probability or return forecast."""
    liq = asset.get("liquidity_usd") or 0
    vol = asset.get("volume_24h_usd") or 0
    change = abs(asset.get("change_24h_pct") or 0)
    age_hours = asset.get("pool_age_hours")
    score = 0
    score += 18 if liq >= 100_000 else 13 if liq >= 25_000 else 8 if liq >= 5_000 else 3 if liq >= 1_000 else 0
    score += 20 if vol >= 500_000 else 15 if vol >= 100_000 else 10 if vol >= 25_000 else 5 if vol >= 5_000 else 0
    score += min(20, round(change * 1.5))
    if age_hours is not None:
        score += 12 if age_hours < 24 else 7 if age_hours < 72 else 3 if age_hours < 168 else 0
    if asset.get("promoted"):
        score -= 8
        asset.setdefault("flags", []).append("PROMOTED")
    if liq < 1_000:
        score -= 20
        asset.setdefault("flags", []).append("THIN_LIQUIDITY")
    if liq and vol / liq > 20:
        score -= 12
        asset.setdefault("flags", []).append("EXTREME_VOLUME_LIQUIDITY_RATIO")
    if asset.get("price_usd") is None:
        asset.setdefault("flags", []).append("PRICE_UNAVAILABLE")
    asset["discovery_score"] = max(0, min(100, score))
    asset["score_type"] = "heuristic_not_probability"
    return asset["discovery_score"]

async def dex_data(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    urls = [
        ("https://api.dexscreener.com/token-profiles/latest/v1", "dexscreener_profiles"),
        ("https://api.dexscreener.com/token-boosts/latest/v1", "dexscreener_boosts"),
    ]
    results = await asyncio.gather(*(get_json(client, url, name) for url, name in urls), return_exceptions=True)
    profiles = results[0] if not isinstance(results[0], Exception) and isinstance(results[0], list) else []
    boosts = results[1] if not isinstance(results[1], Exception) and isinstance(results[1], list) else []
    boosted = {(str(x.get("chainId",""))+":"+str(x.get("tokenAddress",""))).lower() for x in boosts}
    out = []
    for p in profiles[:120]:
        chain, address = p.get("chainId"), p.get("tokenAddress")
        if not address:
            continue
        out.append({
            "asset_id": f"dex:{chain}:{address}".lower(), "symbol": None,
            "name": p.get("description") or p.get("tokenAddress"), "chain": chain,
            "contract_address": address, "price_usd": None, "change_24h_pct": None,
            "liquidity_usd": None, "volume_24h_usd": None, "pool_age_hours": None,
            "url": p.get("url") or f"https://dexscreener.com/{chain}/{address}",
            "image_url": p.get("icon"), "source": "DEX Screener",
            "promoted": (f"{chain}:{address}".lower() in boosted),
            "flags": ["DISCOVERY_PROFILE_ONLY"],
        })
    for b in boosts[:120]:
        chain, address = b.get("chainId"), b.get("tokenAddress")
        if not address:
            continue
        out.append({
            "asset_id": f"dex:{chain}:{address}".lower(), "symbol": None,
            "name": "Boosted token", "chain": chain, "contract_address": address,
            "price_usd": None, "change_24h_pct": None, "liquidity_usd": None,
            "volume_24h_usd": None, "pool_age_hours": None,
            "url": f"https://dexscreener.com/{chain}/{address}", "image_url": None,
            "source": "DEX Screener", "promoted": True, "flags": ["PROMOTED"],
        })
    return out

async def gecko_data(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    async def one(network: str) -> list[dict[str, Any]]:
        url = f"https://api.geckoterminal.com/api/v2/networks/{network}/new_pools?page=1"
        data = await get_json(client, url, "geckoterminal")
        rows = []
        for item in data.get("data", []):
            a = item.get("attributes", {})
            rel = item.get("relationships", {})
            token_rel = (rel.get("base_token") or {}).get("data") or {}
            token_id = token_rel.get("id", "")
            address = token_id.split("_", 1)[-1] if "_" in token_id else token_id
            tx = a.get("transactions", {}).get("h24", {})
            created = a.get("pool_created_at")
            age = None
            if created:
                try:
                    age = max(0, (datetime.now(timezone.utc) - datetime.fromisoformat(created.replace("Z","+00:00"))).total_seconds()/3600)
                except ValueError:
                    pass
            name = (a.get("name") or "New pool").split(" / ")[0]
            rows.append({
                "asset_id": f"gecko:{network}:{address or item.get('id')}".lower(),
                "symbol": name[:12].upper(), "name": name, "chain": network,
                "contract_address": address or None, "price_usd": num(a.get("base_token_price_usd")),
                "change_24h_pct": num(a.get("price_change_percentage", {}).get("h24")),
                "change_1h_pct": num(a.get("price_change_percentage", {}).get("h1")),
                "liquidity_usd": num(a.get("reserve_in_usd")),
                "volume_24h_usd": num(a.get("volume_usd", {}).get("h24")),
                "pool_age_hours": age, "buys_24h": int(tx.get("buys") or 0),
                "sells_24h": int(tx.get("sells") or 0), "created_at": created,
                "url": f"https://www.geckoterminal.com/{network}/pools/{item.get('id')}",
                "source": "GeckoTerminal", "promoted": False, "flags": [],
            })
        return rows
    results = await asyncio.gather(*(one(n) for n in NETWORKS), return_exceptions=True)
    return [row for result in results if not isinstance(result, Exception) for row in result]

async def coinpaprika_data(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    data = await get_json(client, "https://api.coinpaprika.com/v1/tickers?quotes=USD", "coinpaprika")
    out = []
    for c in data[:500]:
        q = (c.get("quotes") or {}).get("USD") or {}
        out.append({
            "asset_id": "coinpaprika:"+str(c.get("id")), "symbol": c.get("symbol"),
            "name": c.get("name"), "chain": "centralized-market",
            "price_usd": num(q.get("price")), "change_24h_pct": num(q.get("percent_change_24h")),
            "liquidity_usd": None, "volume_24h_usd": num(q.get("volume_24h")),
            "market_cap_usd": num(q.get("market_cap")), "pool_age_hours": None,
            "url": f"https://coinpaprika.com/coin/{c.get('id')}/", "source": "CoinPaprika",
            "promoted": False, "flags": [],
        })
    return out

async def binance_data(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    data = await get_json(client, "https://api.binance.com/api/v3/ticker/24hr", "binance_spot")
    rows = [x for x in data if str(x.get("symbol","")).endswith("USDT")]
    rows.sort(key=lambda x: num(x.get("quoteVolume")) or 0, reverse=True)
    return [{
        "asset_id": "binance:"+x["symbol"], "symbol": x["symbol"][:-4],
        "name": x["symbol"], "chain": "binance-spot", "price_usd": num(x.get("lastPrice")),
        "change_24h_pct": num(x.get("priceChangePercent")), "liquidity_usd": None,
        "volume_24h_usd": num(x.get("quoteVolume")), "pool_age_hours": None,
        "url": f"https://www.binance.com/en/trade/{x['symbol']}", "source": "Binance",
        "promoted": False, "flags": [],
    } for x in rows[:150]]

async def coingecko_data(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    key = os.getenv("COINGECKO_DEMO_API_KEY") or os.getenv("COINGECKO_API_KEY")
    if not key:
        _source_status["coingecko"] = {"ok": False, "configured": False, "checked_at": now_iso(), "error": "API key not configured"}
        return []
    data = await get_json(client, "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=100&page=1&sparkline=false", "coingecko", {"x-cg-demo-api-key": key})
    return [{
        "asset_id": "coingecko:"+str(c.get("id")), "symbol": c.get("symbol","").upper(),
        "name": c.get("name"), "chain": "aggregated-crypto", "price_usd": num(c.get("current_price")),
        "change_24h_pct": num(c.get("price_change_percentage_24h")), "liquidity_usd": None,
        "volume_24h_usd": num(c.get("total_volume")), "market_cap_usd": num(c.get("market_cap")),
        "pool_age_hours": None, "url": f"https://www.coingecko.com/en/coins/{c.get('id')}",
        "source": "CoinGecko", "promoted": False, "flags": [],
    } for c in data]

async def gdelt_news(client: httpx.AsyncClient, query: str) -> list[dict[str, Any]]:
    params = httpx.QueryParams({"query": query, "mode": "ArtList", "format": "json", "maxrecords": "25", "sort": "DateDesc"})
    data = await get_json(client, "https://api.gdeltproject.org/api/v2/doc/doc?"+str(params), "gdelt_news")
    out = []
    for item in data.get("articles", []):
        out.append({
            "source": "GDELT", "event_type": "news",
            "title": item.get("title"), "url": item.get("url"),
            "published_at": item.get("seendate"), "domain": item.get("domain"),
            "language": item.get("language"), "verification": "unverified",
            "note": "News discovery only; verify claims against primary sources.",
        })
    return out


async def x_news(client: httpx.AsyncClient, query: str) -> list[dict[str, Any]]:
    token = os.getenv("X_BEARER_TOKEN")
    if not token:
        _source_status["x_api"] = {"ok":False,"configured":False,"checked_at":now_iso(),"error":"X_BEARER_TOKEN not configured"}
        return []
    params = httpx.QueryParams({"query":query+" -is:retweet","max_results":"10","tweet.fields":"created_at,public_metrics,author_id"})
    data = await get_json(client, "https://api.x.com/2/tweets/search/recent?"+str(params), "x_api", {"Authorization":"Bearer "+token})
    return [{"source":"X API","event_type":"social_post","title":x.get("text"),"url":"https://x.com/i/web/status/"+str(x.get("id")),"published_at":x.get("created_at"),"metrics":x.get("public_metrics"),"verification":"unverified_social_post"} for x in data.get("data",[])]

async def reddit_news(client: httpx.AsyncClient, query: str) -> list[dict[str, Any]]:
    client_id, secret = os.getenv("REDDIT_CLIENT_ID"), os.getenv("REDDIT_CLIENT_SECRET")
    if not client_id or not secret:
        _source_status["reddit_api"] = {"ok":False,"configured":False,"checked_at":now_iso(),"error":"Reddit OAuth credentials not configured"}
        return []
    try:
        token_response = await client.post("https://www.reddit.com/api/v1/access_token", data={"grant_type":"client_credentials"}, auth=(client_id,secret), headers={"User-Agent":os.getenv("REDDIT_USER_AGENT","CatalystRadar/0.1 by research-user")})
        token_response.raise_for_status()
        token = token_response.json().get("access_token")
        if not token:
            raise RuntimeError("Reddit OAuth returned no access token")
        params = httpx.QueryParams({"q":query,"sort":"new","limit":"15","t":"day"})
        data = await get_json(client, "https://oauth.reddit.com/search.json?"+str(params), "reddit_api", {"Authorization":"Bearer "+token,"User-Agent":os.getenv("REDDIT_USER_AGENT","CatalystRadar/0.1 by research-user")})
        return [{"source":"Reddit","event_type":"social_post","title":x.get("data",{}).get("title"),"url":"https://www.reddit.com"+x.get("data",{}).get("permalink",""),"published_at":datetime.fromtimestamp(x.get("data",{}).get("created_utc",0),timezone.utc).isoformat() if x.get("data",{}).get("created_utc") else None,"score":x.get("data",{}).get("score"),"subreddit":x.get("data",{}).get("subreddit"),"verification":"unverified_social_post"} for x in data.get("data",{}).get("children",[])]
    except Exception as exc:
        _source_status["reddit_api"] = {"ok":False,"configured":True,"checked_at":now_iso(),"error":safe_error(exc)}
        return []

async def optional_news(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    key = os.getenv("CRYPTOPANIC_API_KEY")
    if not key:
        _source_status["cryptopanic"] = {"ok": False, "configured": False, "checked_at": now_iso(), "error": "API key not configured"}
        return []
    try:
        data = await get_json(client, f"https://cryptopanic.com/api/v1/posts/?auth_token={key}&public=true", "cryptopanic")
        return [{"source":"CryptoPanic","event_type":"news","title":x.get("title"),"url":x.get("url"),"published_at":x.get("published_at"),"verification":"unverified"} for x in data.get("results", [])]
    except Exception:
        return []

async def sec_filings(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    ciks = [x.strip().zfill(10) for x in os.getenv("SEC_CIKS", "").split(",") if x.strip()]
    if not ciks:
        _source_status["sec_edgar"] = {"ok": False, "configured": False, "checked_at": now_iso(), "error": "Set SEC_CIKS to company CIKs; never scrape without a fair-access User-Agent"}
        return []
    headers = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate", "Host": "data.sec.gov"}
    async def one(cik: str) -> list[dict[str, Any]]:
        url = f"https://data.sec.gov/submissions/CIK{cik}.json"
        data = await get_json(client, url, "sec_edgar", headers)
        recent = data.get("filings", {}).get("recent", {})
        forms, dates, accession, docs = recent.get("form", []), recent.get("filingDate", []), recent.get("accessionNumber", []), recent.get("primaryDocument", [])
        out = []
        for i, form in enumerate(forms[:80]):
            if form not in {"8-K", "S-1", "F-1", "13D", "13G", "4", "6-K"}:
                continue
            acc = accession[i].replace("-", "")
            out.append({"source":"SEC EDGAR","event_type":"filing","form":form,"title":f"{data.get('name', cik)} — {form}","published_at":dates[i],"url":f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc}/{docs[i]}","verification":"official_primary_source","company":data.get("name")})
        return out
    results = await asyncio.gather(*(one(c) for c in ciks[:10]), return_exceptions=True)
    return [x for r in results if not isinstance(r, Exception) for x in r]


CHAIN_IDS = {"ethereum":"1","eth":"1","bsc":"56","bnb":"56","polygon":"137","arbitrum":"42161","avalanche":"43114","base":"8453","optimism":"10","fantom":"250"}

@app.get(f"{API_PREFIX}/security/{{chain}}/{{address}}")
async def token_security(chain: str, address: str):
    """Return available contract-risk checks. Missing fields mean unknown, not safe."""
    chain_key = chain.lower()
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers={"Accept":"application/json","User-Agent":"CatalystRadar/0.1 security research"}) as client:
        if chain_key in {"solana","sol"}:
            url = f"https://api.rugcheck.xyz/v1/tokens/{address}/report/summary"
            try:
                data = await get_json(client, url, "rugcheck")
                risks = data.get("risks", [])
                enrichment = {}
                helius_key = os.getenv("HELIUS_API_KEY")
                if helius_key:
                    try:
                        response = await client.post("https://mainnet.helius-rpc.com/?api-key="+helius_key, json={"jsonrpc":"2.0","id":"catalyst-radar","method":"getAsset","params":{"id":address}})
                        response.raise_for_status()
                        hdata = response.json().get("result", {})
                        enrichment["helius"] = {"name":hdata.get("content",{}).get("metadata",{}).get("name"),"symbol":hdata.get("content",{}).get("metadata",{}).get("symbol"),"token_info":hdata.get("token_info"),"interface":hdata.get("interface")}
                    except Exception as exc:
                        enrichment["helius"] = {"status":"unavailable","error":safe_error(exc)}
                birdeye_key = os.getenv("BIRDEYE_API_KEY")
                if birdeye_key:
                    try:
                        bdata = await get_json(client, "https://public-api.birdeye.so/defi/token_overview?address="+address, "birdeye", {"X-API-KEY":birdeye_key,"x-chain":"solana"})
                        enrichment["birdeye"] = bdata.get("data", bdata)
                    except Exception as exc:
                        enrichment["birdeye"] = {"status":"unavailable","error":str(exc)[:120]}
                return {"chain":chain_key,"address":address,"source":"RugCheck","checked_at":now_iso(),"status":"available","score_normalised":data.get("score_normalised"),"lp_locked_pct":data.get("lpLockedPct"),"risks":risks,"enrichment":enrichment,"verification":"third_party_risk_signal_not_guarantee"}
            except Exception as exc:
                return {"chain":chain_key,"address":address,"source":"RugCheck","checked_at":now_iso(),"status":"unavailable","error":str(exc)[:180],"risks":[]}
        chain_id = CHAIN_IDS.get(chain_key)
        if not chain_id:
            return {"chain":chain_key,"address":address,"status":"unsupported_chain","message":"No GoPlus chain ID configured for this network."}
        headers = {"Accept":"application/json"}
        if os.getenv("GOPLUS_API_KEY"):
            headers["Authorization"] = "Bearer " + os.getenv("GOPLUS_API_KEY","")
        url = f"https://api.gopluslabs.io/api/v1/token_security/{chain_id}?contract_addresses={address.lower()}"
        try:
            data = await get_json(client, url, "goplus", headers)
            result = data.get("result", {}).get(address.lower())
            if not result and data.get("result"):
                result = next(iter(data["result"].values()))
            return {"chain":chain_key,"address":address,"source":"GoPlus Security","checked_at":now_iso(),"status":"available" if result else "not_found","data":result,"verification":"third_party_risk_signal_not_guarantee"}
        except Exception as exc:
            return {"chain":chain_key,"address":address,"source":"GoPlus Security","checked_at":now_iso(),"status":"unavailable","error":str(exc)[:180],"data":None}

@app.get(f"{API_PREFIX}/biotech/events")
async def biotech_events(query: str = Query(default="cancer", min_length=2, max_length=120), limit: int = Query(default=15, ge=1, le=50)):
    """Discover trial and FDA records; this is event discovery, not medical advice."""
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers={"Accept":"application/json","User-Agent":"CatalystRadar/0.1 research"}) as client:
        trials_url = "https://clinicaltrials.gov/api/v2/studies?" + str(httpx.QueryParams({"query.term":query,"pageSize":str(limit),"format":"json","sort":"LastUpdatePostDate:desc"}))
        fda_url = "https://api.fda.gov/drug/drugsfda.json?" + str(httpx.QueryParams({"search":query,"limit":str(min(limit,25))}))
        trial_task = get_json(client, trials_url, "clinicaltrials")
        fda_task = get_json(client, fda_url, "openfda_drugsfda")
        trials, fda = await asyncio.gather(trial_task, fda_task, return_exceptions=True)
    events = []
    errors = {}
    if isinstance(trials, Exception):
        errors["clinicaltrials"] = str(trials)[:180]
    else:
        for study in trials.get("studies", []):
            p = study.get("protocolSection", {})
            ident = p.get("identificationModule", {})
            status = p.get("statusModule", {})
            events.append({"source":"ClinicalTrials.gov","event_type":"clinical_trial","title":ident.get("briefTitle"),"url":"https://clinicaltrials.gov/study/"+str(ident.get("nctId","")),"published_at":status.get("studyFirstPostDateStruct",{}).get("date"),"last_updated":status.get("studyFirstPostDateStruct",{}).get("date"),"status":status.get("overallStatus"),"verification":"official_primary_source"})
    if isinstance(fda, Exception):
        errors["openfda_drugsfda"] = str(fda)[:180]
    else:
        for item in fda.get("results", []):
            app = item.get("application_number")
            products = item.get("products", [])
            for product in products[:3]:
                events.append({"source":"openFDA","event_type":"drug_application","title":product.get("brand_name") or product.get("active_ingredients"),"application_number":app,"url":"https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo="+str(app or "").replace("NDA","").replace("BLA",""),"status":product.get("marketing_status"),"verification":"official_primary_source"})
    return {"generated_at":now_iso(),"query":query,"count":len(events),"events":events[:limit],"source_errors":errors,"note":"Records may not be price-moving catalysts; verify event dates and issuer relevance."}

@app.get(f"{API_PREFIX}/equities/quotes")
async def equity_quotes(symbols: str = Query(default="AAPL,NVDA,RTX,LMT,CAT,CRH", min_length=1, max_length=500)):
    """Optional real-time quotes from Finnhub; symbols and API key remain server-side."""
    key = os.getenv("FINNHUB_API_KEY")
    requested = list(dict.fromkeys(x.strip().upper() for x in symbols.split(",") if x.strip()))[:20]
    if not key:
        _source_status["finnhub"] = {"ok":False,"configured":False,"checked_at":now_iso(),"error":"FINNHUB_API_KEY not configured"}
        return {"generated_at":now_iso(),"configured":False,"quotes":[],"message":"Configure FINNHUB_API_KEY on the backend host to enable stock quotes."}
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers={"Accept":"application/json"}) as client:
        async def quote(symbol: str) -> dict[str, Any]:
            url = "https://finnhub.io/api/v1/quote?" + str(httpx.QueryParams({"symbol":symbol,"token":key}))
            try:
                d = await get_json(client,url,"finnhub")
                current = num(d.get("c"))
                if current is None or current == 0:
                    return {"symbol":symbol,"status":"unavailable"}
                return {"symbol":symbol,"price":current,"change":num(d.get("d")),"change_pct":num(d.get("dp")),"high":num(d.get("h")),"low":num(d.get("l")),"open":num(d.get("o")),"previous_close":num(d.get("pc")),"timestamp":d.get("t"),"source":"Finnhub","status":"available"}
            except Exception as exc:
                return {"symbol":symbol,"status":"unavailable","error":safe_error(exc)}
        quotes = await asyncio.gather(*(quote(s) for s in requested))
    return {"generated_at":now_iso(),"configured":True,"quotes":quotes}

def persist_scan(assets: list[dict[str, Any]]) -> None:
    timestamp = now_iso()
    with db() as conn:
        conn.executemany("""INSERT INTO scans
            (scanned_at,asset_id,symbol,name,chain,price_usd,change_24h,liquidity_usd,volume_24h_usd,discovery_score,source,payload_json)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""", [
            (timestamp, a.get("asset_id"), a.get("symbol"), a.get("name"), a.get("chain"),
             a.get("price_usd"), a.get("change_24h_pct"), a.get("liquidity_usd"),
             a.get("volume_24h_usd"), a.get("discovery_score"), a.get("source"),
             json.dumps(a, ensure_ascii=False)) for a in assets
        ])

def persist_events(events: list[dict[str, Any]]) -> None:
    with db() as conn:
        for e in events:
            conn.execute("""INSERT INTO source_events
                (observed_at,source,event_type,title,url,published_at,verification,payload_json)
                VALUES (?,?,?,?,?,?,?,?)""",
                (now_iso(),e.get("source","unknown"),e.get("event_type","news"),e.get("title"),
                 e.get("url"),e.get("published_at"),e.get("verification","unverified"),
                 json.dumps(e,ensure_ascii=False)))

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="Catalyst Radar Data API", version=APP_VERSION, description="Multi-source market discovery and event-intelligence API. Discovery scores are heuristics, not probabilities.", lifespan=lifespan)
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "https://alexberik.github.io,http://localhost:8000,http://127.0.0.1:8000").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=["GET"], allow_headers=["*"])

@app.get("/health")
async def health():
    return {"status":"ok","service":"catalyst-radar-data-api","version":APP_VERSION,"time":now_iso()}

@app.get(f"{API_PREFIX}/sources")
async def sources():
    configured = {
        "DEX Screener": True, "GeckoTerminal": True, "CoinPaprika": True,
        "Binance spot public market data": True,
        "CoinGecko": bool(os.getenv("COINGECKO_DEMO_API_KEY") or os.getenv("COINGECKO_API_KEY")),
        "CryptoPanic": bool(os.getenv("CRYPTOPANIC_API_KEY")),
        "SEC EDGAR": bool(os.getenv("SEC_CIKS")),
        "GDELT": True,
        "GoPlus Security": True,
        "Helius": bool(os.getenv("HELIUS_API_KEY")),
        "Birdeye": bool(os.getenv("BIRDEYE_API_KEY")),
        "RugCheck": True,
        "Finnhub": bool(os.getenv("FINNHUB_API_KEY")),
        "Massive/Polygon": bool(os.getenv("MASSIVE_API_KEY")),
        "X API": bool(os.getenv("X_BEARER_TOKEN")),
        "Reddit API": bool(os.getenv("REDDIT_CLIENT_ID") and os.getenv("REDDIT_CLIENT_SECRET")),
        "Telegram Bot API": bool(os.getenv("TELEGRAM_BOT_TOKEN") and os.getenv("TELEGRAM_CHANNELS")),
        "openFDA": True, "ClinicalTrials.gov": True,
    }
    aliases = {
        "DEX Screener":["dexscreener_profiles","dexscreener_boosts"],
        "GeckoTerminal":["geckoterminal"], "CoinPaprika":["coinpaprika"],
        "Binance spot public market data":["binance_spot"], "CoinGecko":["coingecko"],
        "CryptoPanic":["cryptopanic"], "SEC EDGAR":["sec_edgar"], "GDELT":["gdelt_news"],
        "GoPlus Security":["goplus"], "Helius":["helius"], "Birdeye":["birdeye"],
        "RugCheck":["rugcheck"], "Finnhub":["finnhub"], "X API":["x_api"],
        "Reddit API":["reddit_api"], "openFDA":["openfda_drugsfda"],
        "ClinicalTrials.gov":["clinicaltrials"],
    }
    def source_state(name: str):
        states = [_source_status[k]["ok"] for k in aliases.get(name,[]) if k in _source_status and "ok" in _source_status[k]]
        return any(states) if states else None
    return {"checked_at":now_iso(),"sources":[{"name":name,"configured":configured[name],"status":source_state(name)} for name in configured],"last_checks":_source_status}

@app.get(f"{API_PREFIX}/discovery")
async def discovery(limit: int = Query(default=100, ge=1, le=500), ):
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers={"Accept":"application/json","User-Agent":"CatalystRadar/0.1 market research"}) as client:
        jobs = [dex_data(client), gecko_data(client), coinpaprika_data(client), binance_data(client), coingecko_data(client)]
        results = await asyncio.gather(*jobs, return_exceptions=True)
    raw: list[dict[str, Any]] = []
    names = ["dex","gecko","coinpaprika","binance","coingecko"]
    errors = {}
    for name, result in zip(names, results):
        if isinstance(result, Exception):
            errors[name] = safe_error(result)
        else:
            raw.extend(result)
    merged: dict[str, dict[str, Any]] = {}
    for asset in raw:
        key = (asset.get("chain","")+":"+str(asset.get("contract_address") or asset.get("symbol") or asset.get("asset_id"))).lower()
        existing = merged.get(key)
        if existing:
            for field in ("price_usd","change_24h_pct","liquidity_usd","volume_24h_usd","market_cap_usd","contract_address","image_url"):
                if existing.get(field) is None and asset.get(field) is not None:
                    existing[field] = asset[field]
            existing["sources"] = sorted(set(existing.get("sources", [existing.get("source")]) + [asset.get("source")]))
            existing["promoted"] = existing.get("promoted",False) or asset.get("promoted",False)
            existing["flags"] = sorted(set(existing.get("flags",[]) + asset.get("flags",[])))
        else:
            asset["sources"] = [asset.get("source","unknown")]
            merged[key] = asset
    assets = list(merged.values())
    for asset in assets:
        score_asset(asset)
    assets.sort(key=lambda a: (a.get("discovery_score",0), a.get("volume_24h_usd") or 0), reverse=True)
    persist_scan(assets[:500])
    return {"generated_at":now_iso(),"count":len(assets),"score_disclaimer":"Heuristic discovery score only; not a probability, expected return, or investment recommendation.","assets":assets[:limit],"source_errors":errors,"source_health":_source_status}

@app.get(f"{API_PREFIX}/news")
async def news(query: str = Query(default="cryptocurrency OR bitcoin OR ethereum OR token listing OR defense stocks OR reconstruction", min_length=3, max_length=240), limit: int = Query(default=25, ge=1, le=50)):
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers={"Accept":"application/json","User-Agent":"CatalystRadar/0.1 market research"}) as client:
        tasks = [gdelt_news(client, query), optional_news(client), sec_filings(client), x_news(client, query), reddit_news(client, query)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    events = []
    errors = {}
    for name, result in zip(["gdelt","cryptopanic","sec_edgar","x_api","reddit_api"], results):
        if isinstance(result, Exception):
            errors[name] = str(result)[:220]
        else:
            events.extend(result)
    seen = set()
    deduped = []
    for e in sorted(events, key=lambda x: str(x.get("published_at") or ""), reverse=True):
        key = (str(e.get("url") or "") or str(e.get("title") or "")).lower()
        if key and key not in seen:
            seen.add(key)
            deduped.append(e)
    persist_events(deduped[:100])
    return {"generated_at":now_iso(),"count":len(deduped),"events":deduped[:limit],"source_errors":errors,"verification_policy":"GDELT and aggregator stories are unverified until checked against primary sources; SEC filings are primary-source events."}

@app.get(f"{API_PREFIX}/history")
async def history(asset_id: str | None = None, limit: int = Query(default=100, ge=1, le=1000)):
    with db() as conn:
        if asset_id:
            rows = conn.execute("SELECT * FROM scans WHERE asset_id=? ORDER BY id DESC LIMIT ?",(asset_id,limit)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM scans ORDER BY id DESC LIMIT ?",(limit,)).fetchall()
    return {"count":len(rows),"items":[dict(r) for r in rows]}

@app.get(f"{API_PREFIX}/events/history")
async def event_history(limit: int = Query(default=100, ge=1, le=1000)):
    with db() as conn:
        rows = conn.execute("SELECT * FROM source_events ORDER BY id DESC LIMIT ?",(limit,)).fetchall()
    return {"count":len(rows),"items":[dict(r) for r in rows]}
