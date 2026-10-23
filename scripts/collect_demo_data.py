#!/usr/bin/env python3
"""Public-source demo collector for Catalyst Radar. No API keys required."""
from __future__ import annotations
import json, os, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "demo-market.json"
NETWORKS = ["solana", "base", "eth", "bsc", "arbitrum"]
STOCKS = ["AAPL", "NVDA", "TSLA", "RTX", "LMT", "NOC", "CAT", "CRH"]
USER_AGENT = "CatalystRadar-Demo/0.1 (public market research)"

def utcnow():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

def fetch_json(url, timeout=12):
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}")
        return json.loads(resp.read().decode("utf-8"))

def num(value):
    try:
        v = float(value)
        return v if v == v and abs(v) != float("inf") else None
    except (TypeError, ValueError):
        return None

def get_crypto_assets(errors):
    assets = {}
    for network in NETWORKS:
        try:
            url = f"https://api.geckoterminal.com/api/v2/networks/{network}/new_pools?page=1"
            payload = fetch_json(url)
            for row in payload.get("data", []):
                a = row.get("attributes", {})
                rel = row.get("relationships", {})
                token_rel = (rel.get("base_token") or {}).get("data") or {}
                token_id = token_rel.get("id", "")
                address = token_id.split("_", 1)[-1] if "_" in token_id else token_id
                if not address:
                    continue
                changes = a.get("price_change_percentage") or {}
                vol = a.get("volume_usd") or {}
                tx = a.get("transactions") or {}
                h24 = tx.get("h24") or {}
                created = a.get("pool_created_at")
                age_hours = None
                if created:
                    try:
                        age_hours = max(0, (datetime.now(timezone.utc) - datetime.fromisoformat(created.replace("Z", "+00:00"))).total_seconds()/3600)
                    except ValueError:
                        pass
                liquidity = num(a.get("reserve_in_usd"))
                volume = num(vol.get("h24"))
                change = num(changes.get("h24"))
                score = 0
                score += 18 if liquidity and liquidity >= 100000 else 13 if liquidity and liquidity >= 25000 else 8 if liquidity and liquidity >= 5000 else 3 if liquidity and liquidity >= 1000 else 0
                score += 20 if volume and volume >= 500000 else 15 if volume and volume >= 100000 else 10 if volume and volume >= 25000 else 5 if volume and volume >= 5000 else 0
                score += min(20, round(abs(change or 0)*1.5))
                if age_hours is not None:
                    score += 12 if age_hours < 24 else 7 if age_hours < 72 else 3 if age_hours < 168 else 0
                flags = []
                if not liquidity or liquidity < 1000:
                    score -= 20; flags.append("THIN_LIQUIDITY")
                if liquidity and volume and volume/liquidity > 20:
                    score -= 12; flags.append("EXTREME_VOLUME_LIQUIDITY_RATIO")
                asset = {
                    "id": f"{network}:{address}".lower(), "symbol": (a.get("name") or "TOKEN").split(" / ")[0][:18].upper(),
                    "name": a.get("name") or "New pool", "asset_type": "crypto", "chain": network,
                    "address": address, "price": num(a.get("base_token_price_usd")),
                    "change_1h_pct": num(changes.get("h1")), "change_24h_pct": change,
                    "liquidity_usd": liquidity, "volume_24h_usd": volume,
                    "fdv_usd": num(a.get("fdv_usd")), "age_hours": round(age_hours, 2) if age_hours is not None else None,
                    "buys_24h": h24.get("buys"), "sells_24h": h24.get("sells"),
                    "score": max(0, min(100, score)), "score_type": "heuristic_not_probability",
                    "flags": flags, "source": "GeckoTerminal",
                    "url": f"https://www.geckoterminal.com/{network}/pools/{row.get('id','')}",
                    "observed_at": utcnow()
                }
                key = asset["id"]
                if key not in assets or (asset["liquidity_usd"] or 0) > (assets[key]["liquidity_usd"] or 0):
                    assets[key] = asset
        except Exception as exc:
            errors[f"geckoterminal:{network}"] = type(exc).__name__
    try:
        profiles = fetch_json("https://api.dexscreener.com/token-profiles/latest/v1")
        boosts = fetch_json("https://api.dexscreener.com/token-boosts/latest/v1")
        promoted = {(str(x.get("chainId",""))+":"+str(x.get("tokenAddress",""))).lower() for x in boosts if isinstance(x,dict)}
        for p in profiles if isinstance(profiles,list) else []:
            address = p.get("tokenAddress")
            chain = p.get("chainId") or "unknown"
            if not address:
                continue
            key = f"{chain}:{address}".lower()
            if key in assets:
                assets[key]["promoted"] = key in promoted
                if key in promoted:
                    assets[key]["flags"] = sorted(set(assets[key]["flags"] + ["PROMOTED"]))
                    assets[key]["score"] = max(0, assets[key]["score"] - 8)
                assets[key]["image_url"] = p.get("icon")
                assets[key]["dexscreener_url"] = p.get("url")
            else:
                assets[key] = {
                    "id": key, "symbol": "TOKEN", "name": p.get("description") or "Token profile",
                    "asset_type": "crypto", "chain": chain, "address": address, "price": None,
                    "change_1h_pct": None, "change_24h_pct": None, "liquidity_usd": None,
                    "volume_24h_usd": None, "fdv_usd": None, "age_hours": None,
                    "score": 0, "score_type": "heuristic_not_probability",
                    "flags": ["PRICE_UNAVAILABLE"] + (["PROMOTED"] if key in promoted else []),
                    "promoted": key in promoted, "source": "DEX Screener",
                    "url": p.get("url") or f"https://dexscreener.com/{chain}/{address}",
                    "image_url": p.get("icon"), "observed_at": utcnow()
                }
    except Exception as exc:
        errors["dexscreener"] = type(exc).__name__
    return sorted(assets.values(), key=lambda x: (x.get("score", 0), x.get("volume_24h_usd") or 0), reverse=True)[:60]

def get_stocks(errors):
    out = []
    for symbol in STOCKS:
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=5d&interval=5m"
            payload = fetch_json(url)
            result = (payload.get("chart", {}).get("result") or [None])[0]
            if not result:
                continue
            meta = result.get("meta", {})
            q = ((result.get("indicators", {}).get("quote") or [{}])[0])
            closes = [x for x in (q.get("close") or []) if x is not None]
            current = num(meta.get("regularMarketPrice")) or (num(closes[-1]) if closes else None)
            prev = num(meta.get("chartPreviousClose")) or num(meta.get("previousClose"))
            change = ((current/prev)-1)*100 if current and prev else None
            out.append({"id":"equity:"+symbol,"symbol":symbol,"name":symbol,"asset_type":"equity","price":current,
                        "change_24h_pct":change,"currency":meta.get("currency","USD"),"exchange":meta.get("exchangeName"),
                        "score":None,"score_type":"quote_only_no_forecast","flags":[],"source":"Yahoo Finance chart endpoint",
                        "url":f"https://finance.yahoo.com/quote/{symbol}/","observed_at":utcnow()})
        except Exception as exc:
            errors[f"equity:{symbol}"] = type(exc).__name__
    return out

def get_news(errors):
    q = '(cryptocurrency OR bitcoin OR token OR stock OR defense OR reconstruction OR FDA OR listing)'
    url = "https://api.gdeltproject.org/api/v2/doc/doc?" + urlencode({"query":q,"mode":"ArtList","format":"json","maxrecords":20,"sort":"DateDesc"})
    try:
        payload = fetch_json(url)
        out = []
        for item in payload.get("articles", [])[:20]:
            out.append({"title":item.get("title"),"url":item.get("url"),"domain":item.get("domain"),
                        "published_at":item.get("seendate"),"source":"GDELT","verification":"news_index_unverified"})
        return out
    except Exception as exc:
        errors["gdelt"] = type(exc).__name__
        return []

def main():
    now_dt = datetime.now(timezone.utc).replace(microsecond=0)
    now = now_dt.isoformat()
    errors = {}
    try:
        prior = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    except Exception:
        prior = {}
    snapshots = prior.get("snapshots", [])
    latest = snapshots[-1] if snapshots else {}
    def age_minutes(snapshot):
        try:
            stamp = datetime.fromisoformat(snapshot["timestamp"].replace("Z","+00:00"))
            return max(0, (now_dt-stamp).total_seconds()/60)
        except Exception:
            return 10**9
    # Fast-moving DEX/pool data every workflow run (nominally 5 minutes).
    crypto = get_crypto_assets(errors)
    # Stocks refresh hourly; headlines refresh every 30 minutes. Reuse last
    # successful sample between refreshes and retain the original observation time.
    if not latest or age_minutes(latest) >= 60 or not latest.get("equities"):
        stocks = get_stocks(errors)
    else:
        stocks = latest.get("equities", [])
    if not latest or age_minutes(latest) >= 30 or not latest.get("news"):
        news = get_news(errors)
    else:
        news = latest.get("news", [])
    snapshots.append({"timestamp":now,"crypto_count":len(crypto),"equity_count":len(stocks),
                      "crypto":crypto[:35],"equities":stocks,"news":news[:12],
                      "cadence_minutes":{"crypto":5,"news":30,"equities":60}})
    # Keep the rolling 24-hour window (288 snapshots at 5-minute cadence).
    cutoff = time.time() - 24*3600
    kept = []
    for snap in snapshots:
        try:
            ts = datetime.fromisoformat(snap["timestamp"].replace("Z","+00:00")).timestamp()
            if ts >= cutoff:
                kept.append(snap)
        except Exception:
            continue
    snapshots = kept[-288:]
    data = {"schema_version":1,"mode":"DEMO","generated_at":now,"update_interval_minutes":5,
            "retention_hours":24,"snapshot_count":len(snapshots),
            "sources":{"GeckoTerminal":"public API","DEX Screener":"public API","Yahoo Finance":"public chart endpoint","GDELT":"public news index"},
            "source_errors":errors,"snapshots":snapshots,
            "disclaimer":"Demo research data, may be delayed or incomplete. Discovery scores are heuristics, not probabilities or investment advice."}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(data,separators=(",",":"),ensure_ascii=False)+"\n",encoding="utf-8")
    print(f"snapshot={now} crypto={len(crypto)} equities={len(stocks)} news={len(news)} history={len(snapshots)} errors={len(errors)}")

if __name__ == "__main__":
    main()
