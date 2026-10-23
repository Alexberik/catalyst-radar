from app.main import score_asset

def test_score_is_bounded_and_explicitly_not_probability():
    asset = {"liquidity_usd": 200_000, "volume_24h_usd": 1_000_000, "change_24h_pct": 10, "pool_age_hours": 2, "promoted": False, "flags": []}
    score = score_asset(asset)
    assert 0 <= score <= 100
    assert asset["score_type"] == "heuristic_not_probability"

def test_promoted_low_liquidity_is_flagged_and_penalized():
    organic = {"liquidity_usd": 50_000, "volume_24h_usd": 50_000, "change_24h_pct": 2, "pool_age_hours": 30, "promoted": False, "flags": []}
    promoted = {**organic, "promoted": True, "flags": []}
    assert score_asset(promoted) < score_asset(organic)
    assert "PROMOTED" in promoted["flags"]
