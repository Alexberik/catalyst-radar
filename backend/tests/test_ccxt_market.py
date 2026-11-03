from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import main


class FakeExchange:
    def __init__(self, config=None):
        self.config = config or {}
        self.markets = {"BTC/USDT": {"base": "BTC", "quote": "USDT"}}
        self.closed = False

    async def load_markets(self):
        return self.markets

    async def fetch_tickers(self, symbols=None):
        return {
            "BTC/USDT": {
                "last": 65000, "percentage": 2.5, "bid": 64990, "ask": 65010,
                "baseVolume": 100, "quoteVolume": 6500000, "high": 66000,
                "low": 63000, "timestamp": 1700000000000, "datetime": "2023-11-14T22:13:20Z",
            }
        }

    async def fetch_ohlcv(self, symbol, timeframe="1h", limit=200):
        return [[1700000000000, 64000, 66000, 63000, 65000, 123.4]]

    async def close(self):
        self.closed = True


@pytest.mark.asyncio
async def test_ccxt_public_ticker_is_normalized_and_closes_client(monkeypatch):
    instance = FakeExchange()
    monkeypatch.setattr(main.ccxt, "binance", lambda config: instance)
    result = await main.ccxt_exchange_data("binance", ["BTC/USDT"])
    assert result["status"] == "available"
    assert result["tickers"][0]["symbol"] == "BTC/USDT"
    assert result["tickers"][0]["price"] == 65000
    assert result["tickers"][0]["change_24h_pct"] == 2.5
    assert instance.closed is True
    assert "apiKey" not in instance.config


@pytest.mark.asyncio
async def test_ccxt_rejects_exchange_outside_allowlist():
    result = await main.ccxt_exchange_data("untrusted-host", ["BTC/USDT"])
    assert result["status"] == "unsupported_exchange"
    assert result["tickers"] == []


@pytest.mark.asyncio
async def test_ccxt_ohlcv_returns_candles_and_closes_client(monkeypatch):
    instance = FakeExchange()
    monkeypatch.setattr(main.ccxt, "binance", lambda config: instance)
    result = await main.ccxt_ohlcv(exchange_id="binance", symbol="BTC/USDT", timeframe="1h", limit=50)
    assert result["status"] == "available"
    assert result["candles"][0]["close"] == 65000
    assert result["timeframe"] == "1h"
    assert instance.closed is True


@pytest.mark.asyncio
async def test_ccxt_ohlcv_rejects_unsupported_exchange():
    result = await main.ccxt_ohlcv(exchange_id="unknown", symbol="BTC/USDT", timeframe="1h", limit=50)
    assert result["status"] == "unsupported_exchange"
