"""
core/security.py

Auth has been removed from this service.  These stubs are kept so existing
import sites compile without changes.  Every caller gets a constant open
identity — no token is required, no 401 is ever raised.
"""

from __future__ import annotations

from fastapi import Request

# Constant identity used for all requests now that auth is removed.
_OPEN_USER_ID = "open"


def extract_user_id(request: Request) -> str:
    """Return the open user ID (auth removed — always succeeds)."""
    return _OPEN_USER_ID


def require_user_id(request: Request) -> str:
    """Return the open user ID (auth removed — never raises 401)."""
    return _OPEN_USER_ID
