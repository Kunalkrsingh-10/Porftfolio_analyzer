"""
MongoDB connection manager (Motor async driver).

Supports both local plain URIs (mongodb://) and remote Atlas SRV strings
(mongodb+srv://).  The SRV scheme automatically enables TLS, which is
required by MongoDB Atlas.  Railway / any plain host also works without
any extra flags.
"""

import logging

from motor.motor_asyncio import AsyncIOMotorClient

from core.config import config

logger = logging.getLogger("MongoDB")


class MongoDB:
    client: AsyncIOMotorClient | None = None
    db = None

    async def connect(self) -> None:
        """Open the Motor client and verify connectivity with an admin ping."""
        uri = config.MONGO_CONNECTION_STRING
        is_atlas = uri.startswith("mongodb+srv://")

        try:
            self.client = AsyncIOMotorClient(
                uri,
                # ── Timeouts ────────────────────────────────────────────────
                # Atlas round-trip can be 1-3 s on cold start; 30 s avoids
                # spurious "server selection timed out" on the first request.
                serverSelectionTimeoutMS=30_000,
                connectTimeoutMS=30_000,
                socketTimeoutMS=30_000,
                # ── TLS ─────────────────────────────────────────────────────
                # mongodb+srv:// enables TLS implicitly; plain URIs do not.
                # Explicitly pass tls=True only for Atlas so we don't break
                # plain local connections.
                **({"tls": True, "retryWrites": True} if is_atlas else {}),
                # ── Misc ─────────────────────────────────────────────────────
                uuidRepresentation="standard",
            )

            self.db = self.client[config.DB_NAME]

            # Verify the connection is live
            await self.client.admin.command("ping")
            logger.info(
                "✅ [MongoDB] Connected to %s  (Atlas=%s)",
                config.DB_NAME, is_atlas,
            )

        except Exception as exc:
            logger.error("❌ [MongoDB] Connection failed: %s", exc)
            raise

    async def close(self) -> None:
        """Close the Motor client cleanly on shutdown."""
        if self.client:
            self.client.close()
            logger.info("🔻 [MongoDB] Connection closed.")


# ── Module-level singleton ─────────────────────────────────────────────────────

mongo_db = MongoDB()


def get_database():
    """
    Return the active Motor database handle.

    Usage::

        db = get_database()
        doc = await db.portfolios.find_one({"session_id": sid})
    """
    if mongo_db.db is None:
        raise RuntimeError(
            "MongoDB is not connected. "
            "Ensure mongo_db.connect() was called during app startup."
        )
    return mongo_db.db
