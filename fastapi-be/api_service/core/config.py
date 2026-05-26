"""
Application configuration.

All values are read from environment variables so the same image runs
in every environment (Docker, local, CI) without code changes.
"""

import logging
import os

_cfg_logger = logging.getLogger("Config")


class Config:
    PROJECT_NAME: str = "Kalpi AI — Portfolio API"

    # ── MongoDB ──────────────────────────────────────────────────────────────
    # Supports both Atlas SRV strings (mongodb+srv://) and plain mongodb:// URIs.
    # The SRV scheme enables TLS automatically; Motor/PyMongo handle DNS lookup.
    @property
    def MONGO_CONNECTION_STRING(self) -> str:
        url = (
            os.environ.get("MONGO_CONNECTION_STRING")
            or os.environ.get("MONGO_URL")
        )
        if url:
            # Log only the scheme+host, never credentials
            safe = url.split("@")[-1] if "@" in url else url[:40]
            _cfg_logger.info("🔗 [Config] MONGO target: %s", safe)
            return url

        # ── Fallback — no Atlas URL set, using localhost ─────────────────────
        _cfg_logger.warning(
            "⚠️  [Config] MONGO_URL / MONGO_CONNECTION_STRING not set — "
            "falling back to localhost:27017.  "
            "Set MONGO_URL in your Railway/Render/Vercel dashboard."
        )
        host = os.environ.get("MONGO_HOST", "localhost")
        port = os.environ.get("MONGO_PORT", "27017")
        user = os.environ.get("MONGO_USER", "")
        pwd  = os.environ.get("MONGO_PASSWORD", "")
        if user and pwd:
            return f"mongodb://{user}:{pwd}@{host}:{port}"
        return f"mongodb://{host}:{port}"

    # ── Database name ────────────────────────────────────────────────────────
    @property
    def DB_NAME(self) -> str:
        return os.environ.get("DB_NAME", "kalpi_ai_api_db")

    # ── PostgreSQL (Railway) — available for future use ──────────────────────
    @property
    def DATABASE_URL(self) -> str | None:
        return os.environ.get("DATABASE_URL")


config = Config()
