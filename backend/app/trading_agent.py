"""Approval-gated trading intent API.

This module deliberately DOES NOT submit exchange orders. It stores normalized
trade plans and records an explicit human approval. A separately reviewed
execution adapter must be added before any real order can be sent.
"""
from __future__ import annotations

import hmac
import json
import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field, model_validator

router = APIRouter(prefix="/api/v1/trading", tags=["AI Trading Agent"])

SYMBOL_RE = re.compile(r"^[A-Z0-9]{2,15}/[A-Z0-9]{2,15}$")
ALLOWED_MARKETS = {"spot", "futures"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db_path() -> str:
    return os.getenv("TRADING_DB_PATH") or os.getenv("DATABASE_PATH", "./data/catalyst_radar.sqlite3")


def _connect() -> sqlite3.Connection:
    path = _db_path()
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _connect() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS trade_intents (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            status TEXT NOT NULL,
            market_type TEXT NOT NULL,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            quote_amount REAL,
            quantity REAL,
            order_type TEXT NOT NULL,
            limit_price REAL,
            leverage INTEGER NOT NULL,
            reduce_only INTEGER NOT NULL,
            stop_loss_pct REAL,
            take_profit_pct REAL,
            trailing_stop_pct REAL,
            activation_profit_pct REAL,
            command TEXT NOT NULL,
            approval_note TEXT,
            payload_json TEXT NOT NULL
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_trade_intents_created ON trade_intents(created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_trade_intents_status ON trade_intents(status)")


def _authorize(token: str | None) -> None:
    expected = os.getenv("TRADING_CONTROL_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="Trading control is not configured. No trading actions are available.")
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Unauthorized trading control request.")


class TradeIntentRequest(BaseModel):
    command: str = Field(min_length=8, max_length=1200)
    market_type: Literal["spot", "futures"]
    symbol: str = Field(min_length=5, max_length=31)
    side: Literal["buy", "sell"]
    quote_amount: float | None = Field(default=None, gt=0, le=1_000_000)
    quantity: float | None = Field(default=None, gt=0)
    order_type: Literal["market", "limit"] = "market"
    limit_price: float | None = Field(default=None, gt=0)
    leverage: int = Field(default=1, ge=1, le=1)
    reduce_only: bool = False
    stop_loss_pct: float | None = Field(default=None, gt=0, le=50)
    take_profit_pct: float | None = Field(default=None, gt=0, le=500)
    trailing_stop_pct: float | None = Field(default=None, gt=0, le=50)
    activation_profit_pct: float | None = Field(default=None, gt=0, le=500)

    @model_validator(mode="after")
    def validate_intent(self):
        self.symbol = self.symbol.upper()
        if not SYMBOL_RE.fullmatch(self.symbol):
            raise ValueError("symbol must use BASE/QUOTE format, for example BTC/USDT")
        if (self.quote_amount is None) == (self.quantity is None):
            raise ValueError("provide exactly one of quote_amount or quantity")
        if self.order_type == "limit" and self.limit_price is None:
            raise ValueError("limit_price is required for limit orders")
        if self.order_type == "market" and self.limit_price is not None:
            raise ValueError("limit_price is only valid for limit orders")
        if self.market_type == "futures" and self.stop_loss_pct is None:
            raise ValueError("futures intents require a stop_loss_pct")
        if self.market_type == "spot" and self.reduce_only:
            raise ValueError("reduce_only is only valid for futures")
        return self


class ApprovalRequest(BaseModel):
    approval_note: str | None = Field(default=None, max_length=500)


def _row(row: sqlite3.Row) -> dict:
    item = dict(row)
    item["reduce_only"] = bool(item["reduce_only"])
    item["plan"] = json.loads(item.pop("payload_json"))
    item.pop("approval_note", None) if item.get("approval_note") is None else None
    return item


@router.get("/status")
async def trading_status():
    configured = bool(os.getenv("TRADING_CONTROL_TOKEN"))
    return {
        "status": "approval_workflow_configured" if configured else "locked_not_configured",
        "markets_supported_by_intent_schema": sorted(ALLOWED_MARKETS),
        "execution_enabled": False,
        "human_approval_required": True,
        "default_leverage": 1,
        "max_leverage": 1,
        "withdrawal_permission_required": False,
        "message": "This release stores and approves plans only. It does not connect to Binance private endpoints or place orders.",
    }


@router.post("/intents", status_code=201)
async def create_trade_intent(
    request: TradeIntentRequest,
    x_trading_control_token: str | None = Header(default=None),
):
    _authorize(x_trading_control_token)
    _init_db()
    intent_id = str(uuid.uuid4())
    created = now_iso()
    payload = request.model_dump()
    with _connect() as conn:
        conn.execute(
            """INSERT INTO trade_intents (
                id,created_at,updated_at,status,market_type,symbol,side,quote_amount,quantity,
                order_type,limit_price,leverage,reduce_only,stop_loss_pct,take_profit_pct,
                trailing_stop_pct,activation_profit_pct,command,payload_json
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                intent_id, created, created, "pending_approval", request.market_type,
                request.symbol, request.side, request.quote_amount, request.quantity,
                request.order_type, request.limit_price, request.leverage, int(request.reduce_only),
                request.stop_loss_pct, request.take_profit_pct, request.trailing_stop_pct,
                request.activation_profit_pct, request.command, json.dumps(payload),
            ),
        )
        row = conn.execute("SELECT * FROM trade_intents WHERE id=?", (intent_id,)).fetchone()
    return {
        "intent": _row(row),
        "execution": {"submitted": False, "status": "not_submitted"},
        "next_step": "Review the normalized plan and explicitly approve it. Approval still does not submit an exchange order in this release.",
    }


@router.get("/intents")
async def list_trade_intents(
    limit: int = Query(default=50, ge=1, le=200),
    x_trading_control_token: str | None = Header(default=None),
):
    _authorize(x_trading_control_token)
    _init_db()
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM trade_intents ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return {"count": len(rows), "intents": [_row(row) for row in rows]}


@router.post("/intents/{intent_id}/approve")
async def approve_trade_intent(
    intent_id: str,
    request: ApprovalRequest,
    x_trading_control_token: str | None = Header(default=None),
):
    _authorize(x_trading_control_token)
    _init_db()
    with _connect() as conn:
        row = conn.execute("SELECT * FROM trade_intents WHERE id=?", (intent_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Trade intent not found.")
        if row["status"] != "pending_approval":
            raise HTTPException(status_code=409, detail=f"Intent cannot be approved from status {row['status']}.")
        updated = now_iso()
        conn.execute(
            "UPDATE trade_intents SET status='approved_pending_execution',updated_at=?,approval_note=? WHERE id=?",
            (updated, request.approval_note, intent_id),
        )
        row = conn.execute("SELECT * FROM trade_intents WHERE id=?", (intent_id,)).fetchone()
    return {
        "intent": _row(row),
        "execution": {"submitted": False, "status": "execution_adapter_not_implemented"},
        "message": "Human approval recorded. No Binance order was sent.",
    }


@router.post("/intents/{intent_id}/cancel")
async def cancel_trade_intent(
    intent_id: str,
    x_trading_control_token: str | None = Header(default=None),
):
    _authorize(x_trading_control_token)
    _init_db()
    with _connect() as conn:
        row = conn.execute("SELECT * FROM trade_intents WHERE id=?", (intent_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Trade intent not found.")
        if row["status"] not in {"pending_approval", "approved_pending_execution"}:
            raise HTTPException(status_code=409, detail=f"Intent cannot be cancelled from status {row['status']}.")
        updated = now_iso()
        conn.execute("UPDATE trade_intents SET status='cancelled',updated_at=? WHERE id=?", (updated, intent_id))
        row = conn.execute("SELECT * FROM trade_intents WHERE id=?", (intent_id,)).fetchone()
    return {"intent": _row(row), "execution": {"submitted": False}, "message": "Intent cancelled; no exchange order was sent."}
