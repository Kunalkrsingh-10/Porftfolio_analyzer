"""
Application configuration.

All values are read from environment variables so the same image runs
in every environment (Docker, local, CI) without code changes.
"""

import os


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
            return url

        # Plain local fallback (used only when neither env var is set)
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
