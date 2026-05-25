#!/usr/bin/env python3
"""
kalpi-ai  API Integration Smoke-tester
=======================================
Exercises every open FastAPI endpoint at http://localhost:8000.

  No authentication.  No Nginx.  No mock data.
  Every chat call triggers a live yfinance + LangGraph agent run.

Usage
-----
  # make sure the stack is running first:
  docker compose up --build          # from kalpi-ai/ root
  # OR (backend only):
  cd fastapi-be && docker compose up --build

  # then run this script from the project root:
  python fastapi-be/test_gemini.py

Requirements
------------
  pip install requests
"""

from __future__ import annotations

import io
import sys
import textwrap

import requests

# ── Config ────────────────────────────────────────────────────────────────────

BASE = "http://localhost:8000"
API  = f"{BASE}/v1/portfolio"

# Sample NSE portfolio used across all tests
SAMPLE_PORTFOLIO = [
    {"ticker": "RELIANCE", "weight": 0.40},
    {"ticker": "TCS",      "weight": 0.35},
    {"ticker": "HDFCBANK", "weight": 0.25},
]

SAMPLE_CSV = textwrap.dedent("""\
    Ticker,Quantity,Price,Sector,Purchase_Date
    RELIANCE,10,2400.00,Energy,2023-06-01
    TCS,5,3200.00,Technology,2023-08-15
    HDFCBANK,20,1500.00,Financials,2023-04-10
""")

# ── Helpers ───────────────────────────────────────────────────────────────────

def _ok(label: str) -> None:
    print(f"  ✓  {label}")


def _fail(label: str, detail: str) -> None:
    print(f"  ✗  {label}\n     {detail}", file=sys.stderr)
    sys.exit(1)


def _post(path: str, **kwargs) -> requests.Response:
    """POST to {API}{path}.  No Authorization header attached."""
    return requests.post(f"{API}{path}", timeout=120, **kwargs)


def _get(path: str, **kwargs) -> requests.Response:
    return requests.get(f"{API}{path}", timeout=30, **kwargs)


# ── Test functions ─────────────────────────────────────────────────────────────

def test_server_reachable() -> None:
    """Verify FastAPI is up on port 8000."""
    try:
        r = requests.get(f"{BASE}/docs", timeout=10)
        # /docs returns 200 (Swagger UI); any 2xx/3xx means the server is alive
        if r.status_code >= 500:
            _fail("server reachable", f"HTTP {r.status_code}")
    except requests.ConnectionError as exc:
        _fail("server reachable", f"Connection refused — is the stack running? ({exc})")
    _ok(f"FastAPI reachable at {BASE}")


def test_upload() -> str:
    """Upload a portfolio CSV; verify live yfinance enrichment ran."""
    files = {"file": ("portfolio.csv", io.BytesIO(SAMPLE_CSV.encode()), "text/csv")}
    r = _post("/upload", files=files)
    if not r.ok:
        _fail("POST /upload", f"HTTP {r.status_code} — {r.text[:400]}")

    data = r.json()
    sid = data.get("session_id", "")
    if not sid:
        _fail("POST /upload", "response missing session_id")
    if data.get("portfolio_value", 0) <= 0:
        _fail("POST /upload", "portfolio_value is 0 — yfinance may be unreachable")
    if data.get("total_holdings") != 3:
        _fail("POST /upload", f"expected 3 holdings, got {data.get('total_holdings')}")

    _ok(
        f"POST /upload  session_id={sid!r}  "
        f"portfolio_value={data['portfolio_value']:,.0f}  "
        f"sharpe={data.get('sharpe_ratio', 0):.2f}"
    )
    return sid


def test_get_portfolio(session_id: str) -> None:
    """Retrieve the uploaded portfolio by session_id."""
    r = _get("/get", params={"session_id": session_id})
    if not r.ok:
        _fail("GET /get", f"HTTP {r.status_code} — {r.text[:300]}")

    data = r.json()
    if data.get("session_id") != session_id:
        _fail("GET /get", "returned session_id does not match")

    _ok(
        f"GET  /get   holdings={data['total_holdings']}  "
        f"max_drawdown={data.get('max_drawdown', 0):.2%}"
    )


def test_portfolio_history() -> None:
    """List all portfolio sessions (metadata only)."""
    r = _get("/history")
    if not r.ok:
        _fail("GET /history", f"HTTP {r.status_code} — {r.text[:300]}")

    data   = r.json()
    # history endpoint returns either {sessions, total} or {history: [...]}
    count  = (
        data.get("total")
        or len(data.get("sessions", []))
        or len(data.get("history", []))
    )
    _ok(f"GET  /history  sessions={count}")


def test_chat_with_session(session_id: str) -> str:
    """Send a chat message using a portfolio session_id (no inline portfolio)."""
    payload = {
        "user_message": (
            "What is my portfolio's annualised return and Sharpe ratio? "
            "Show a performance chart."
        ),
        "session_id": session_id,
    }
    r = _post("/chat", json=payload)
    if not r.ok:
        _fail("POST /chat (session_id)", f"HTTP {r.status_code} — {r.text[:400]}")

    data = r.json()
    if not data.get("bot_response"):
        _fail("POST /chat (session_id)", "bot_response is empty")

    csid = data.get("chat_session_id", "")
    _ok(
        f"POST /chat (session)  canvas={data.get('active_canvas_view')!r}  "
        f"suggestions={len(data.get('suggestions', []))}  csid={csid!r}"
    )
    return csid


def test_chat_inline_portfolio() -> str:
    """Send a chat message with the portfolio passed inline (no prior upload)."""
    payload = {
        "user_message": "Show me the risk breakdown and max drawdown for my portfolio.",
        "portfolio":    SAMPLE_PORTFOLIO,
    }
    r = _post("/chat", json=payload)
    if not r.ok:
        _fail("POST /chat (inline)", f"HTTP {r.status_code} — {r.text[:400]}")

    data = r.json()
    if not data.get("bot_response"):
        _fail("POST /chat (inline)", "bot_response is empty")

    csid = data.get("chat_session_id", "")
    _ok(
        f"POST /chat (inline)   canvas={data.get('active_canvas_view')!r}  "
        f"suggestions={len(data.get('suggestions', []))}  csid={csid!r}"
    )
    return csid


def test_chat_session_detail(chat_session_id: str) -> None:
    """Retrieve a full chat session with all stored messages."""
    r = _get(f"/history/{chat_session_id}")
    if not r.ok:
        _fail(f"GET /history/{{csid}}", f"HTTP {r.status_code} — {r.text[:300]}")

    data = r.json()
    msgs = data.get("messages", [])
    _ok(f"GET  /history/{{csid}}  messages={len(msgs)}")


def test_charts() -> None:
    """Fetch cumulative-return, rolling-volatility, and sector-allocation chart data."""
    payload = {
        "portfolio":      SAMPLE_PORTFOLIO,
        "exchange":       "NS",
        "period":         "1y",
        "rolling_window": 21,
    }
    r = _post("/charts", json=payload)
    if not r.ok:
        _fail("POST /charts", f"HTTP {r.status_code} — {r.text[:400]}")

    data  = r.json()
    dates = data.get("cumulative_returns", {}).get("dates", [])
    errs  = data.get("errors", [])
    _ok(f"POST /charts  date_points={len(dates)}  errors={errs or 'none'}")


def test_agent_chat() -> None:
    """Send a message to the one-off LangGraph agent (no session persistence)."""
    payload = {
        "portfolio":    SAMPLE_PORTFOLIO,
        "message":      "Compare my portfolio CAGR against Nifty 50 over the last year.",
        "chat_history": [],
        "exchange":     "NS",
        "period":       "1y",
    }
    r = _post("/agent/chat", json=payload)
    if not r.ok:
        _fail("POST /agent/chat", f"HTTP {r.status_code} — {r.text[:400]}")

    data = r.json()
    if not data.get("message"):
        _fail("POST /agent/chat", "message field is empty")

    _ok(
        f"POST /agent/chat   chart_type={data.get('chart_type')!r}  "
        f"suggestions={len(data.get('suggestions', []))}"
    )


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    sep = "─" * 58
    print(f"\n{sep}")
    print(f"  kalpi-ai  smoke-test  →  {BASE}")
    print(sep)

    print("\n[1] Server health")
    test_server_reachable()

    print("\n[2] Portfolio lifecycle  (upload → get → history)")
    sid = test_upload()
    test_get_portfolio(sid)
    test_portfolio_history()

    print("\n[3] Chat  (session_id path)")
    csid = test_chat_with_session(sid)
    test_chat_session_detail(csid)

    print("\n[4] Chat  (inline portfolio)")
    test_chat_inline_portfolio()

    print("\n[5] Charts")
    test_charts()

    print("\n[6] Agent chat  (one-off, no persistence)")
    test_agent_chat()

    print(f"\n{sep}")
    print("  All checks passed — live yfinance data, zero auth barriers.")
    print(f"{sep}\n")


if __name__ == "__main__":
    main()
