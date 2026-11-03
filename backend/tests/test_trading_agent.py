from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRADING_CONTROL_TOKEN", "test-control-token")
    monkeypatch.setenv("TRADING_DB_PATH", str(tmp_path / "trading.sqlite3"))
    with TestClient(app) as test_client:
        yield test_client


def test_trading_status_is_explicitly_non_executing(client):
    response = client.get("/api/v1/trading/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["execution_enabled"] is False
    assert payload["human_approval_required"] is True
    assert payload["max_leverage"] == 1


def test_create_intent_requires_authentication(client):
    payload = {
        "command": "Buy BTC with a protected stop",
        "market_type": "spot",
        "symbol": "BTC/USDT",
        "side": "buy",
        "quote_amount": 25,
        "stop_loss_pct": 2,
    }
    response = client.post("/api/v1/trading/intents", json=payload)
    assert response.status_code == 401


def test_create_and_approve_intent_never_submits_order(client):
    headers = {"X-Trading-Control-Token": "test-control-token"}
    payload = {
        "command": "Open a small BTC futures position with a protective stop",
        "market_type": "futures",
        "symbol": "BTC/USDT",
        "side": "buy",
        "quote_amount": 20,
        "leverage": 1,
        "stop_loss_pct": 1.5,
        "take_profit_pct": 3,
        "trailing_stop_pct": 1,
        "activation_profit_pct": 1.5,
    }
    created = client.post("/api/v1/trading/intents", json=payload, headers=headers)
    assert created.status_code == 201
    body = created.json()
    intent_id = body["intent"]["id"]
    assert body["intent"]["status"] == "pending_approval"
    assert body["execution"]["submitted"] is False

    approved = client.post(
        f"/api/v1/trading/intents/{intent_id}/approve",
        json={"approval_note": "Reviewed manually"},
        headers=headers,
    )
    assert approved.status_code == 200
    result = approved.json()
    assert result["intent"]["status"] == "approved_pending_execution"
    assert result["execution"]["submitted"] is False
    assert result["message"] == "Human approval recorded. No Binance order was sent."


def test_futures_intent_requires_stop_loss(client):
    headers = {"X-Trading-Control-Token": "test-control-token"}
    payload = {
        "command": "Open BTC futures",
        "market_type": "futures",
        "symbol": "BTC/USDT",
        "side": "buy",
        "quote_amount": 20,
    }
    response = client.post("/api/v1/trading/intents", json=payload, headers=headers)
    assert response.status_code == 422


def test_cancel_intent(client):
    headers = {"X-Trading-Control-Token": "test-control-token"}
    payload = {
        "command": "Buy ETH with a stop",
        "market_type": "spot",
        "symbol": "ETH/USDT",
        "side": "buy",
        "quote_amount": 15,
        "stop_loss_pct": 2,
    }
    created = client.post("/api/v1/trading/intents", json=payload, headers=headers)
    intent_id = created.json()["intent"]["id"]
    cancelled = client.post(f"/api/v1/trading/intents/{intent_id}/cancel", headers=headers)
    assert cancelled.status_code == 200
    assert cancelled.json()["intent"]["status"] == "cancelled"
