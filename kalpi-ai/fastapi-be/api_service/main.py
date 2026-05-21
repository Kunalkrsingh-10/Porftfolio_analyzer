import time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from core.database.mongo import mongo_db
from core.magic import register_magic_routes
from core.config import config

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("fastapi_app")


# --- 1. LIFESPAN (Database Connection Manager) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    await mongo_db.connect()
    app.state.portfolio_sessions = {}

    # Ensure chat_sessions indexes exist (idempotent)
    from core.database.mongo import get_database
    db = get_database()
    await db.chat_sessions.create_index(
        [("session_id", 1)], unique=True, name="session_unique"
    )
    await db.chat_sessions.create_index([("updated_at", -1)], name="updated_at_desc")

    print("✅ [FastAPI] Startup complete")
    yield
    await mongo_db.close()
    print("🛑 [FastAPI] Shutdown complete")


# --- 2. APP INITIALIZATION ---
app = FastAPI(
    title="Kalpi AI — Portfolio API",
    version="1.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)


# --- 3. CORS — fully open, no Nginx proxy required ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# --- 4. LOGGING MIDDLEWARE ---
class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        logger.info("➡️  %s %s", request.method, request.url)
        try:
            response = await call_next(request)
            elapsed = time.time() - start
            log = logger.error if response.status_code >= 400 else logger.info
            log(
                "%s %s %s | %.3fs",
                "❌" if response.status_code >= 400 else "✅",
                request.method,
                request.url.path,
                elapsed,
            )
            return response
        except Exception as exc:
            elapsed = time.time() - start
            logger.exception(
                "💥 %s %s | %.3fs | %s",
                request.method, request.url.path, elapsed, exc,
            )
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal Server Error", "error": str(exc)},
            )


app.add_middleware(LoggingMiddleware)


# --- 5. ROUTES ---
register_magic_routes(app, routes_dir="app/v1", api_prefix="/v1")


# --- 6. HEALTH CHECK ---
@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "Running 🚀",
        "service": "Kalpi AI Portfolio API",
        "database": config.DB_NAME,
    }
