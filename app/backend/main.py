import logging
import os
import traceback
from contextlib import asynccontextmanager
from datetime import datetime

from core.config import settings
from core.environment import get_env_bool
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from utils.logging_utils import cleanup_old_log_files

try:
    from core.telemetry import RequestSummaryMiddleware
except Exception:  # Telemetry must never prevent the app from starting.
    RequestSummaryMiddleware = None


def setup_logging():
    """Configure the logging system."""
    if os.environ.get("IS_LAMBDA") == "true":
        return

    # Store logs in a writable user directory.
    if os.name == "nt":
        base_dir = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        log_dir = os.path.join(base_dir, "ERROR MESSENGER", "logs")
    else:
        log_dir = os.path.join(os.path.expanduser("~"), ".error-messenger", "logs")

    os.makedirs(log_dir, exist_ok=True)

    log_date = datetime.now().strftime("%Y%m%d")
    log_file = os.path.join(log_dir, f"app_{log_date}.log")

    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    logging.basicConfig(
        level=logging.DEBUG,
        format=log_format,
        handlers=[
            logging.FileHandler(log_file, mode="a", encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )

    cleanup_old_log_files(log_dir, current_log_file=log_file)

    logging.getLogger("uvicorn").setLevel(logging.DEBUG)
    logging.getLogger("fastapi").setLevel(logging.DEBUG)
    logging.getLogger("watchfiles").setLevel(logging.WARNING)

    logger = logging.getLogger(__name__)
    logger.info("=== Logging system initialized ===")
    logger.info(f"Log file: {log_file}")
    logger.info("Log level: DEBUG")
    logger.info(f"Log date: {log_date}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger = logging.getLogger(__name__)
    logger.info("=== Application startup initiated ===")

    # Create all tables on startup (does not touch existing tables).
    # Explicit imports so models register on Base.metadata (and so PyInstaller bundles them).
    from core.database import Base, db_manager
    import models.auth  # noqa: F401
    import models.signal_peers  # noqa: F401
    import models.signal_rooms  # noqa: F401
    import models.signal_signals  # noqa: F401

    engine = await db_manager.get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ensured: %s", sorted(Base.metadata.tables))

    if not get_env_bool("MGX_IGNORE_MODULE_INIT", default=True):
        # MODULE_IMPORTS_START
        from services.database import initialize_database, close_database
        # MODULE_IMPORTS_END

        # MODULE_STARTUP_START
        await initialize_database()
        # MODULE_STARTUP_END
        pass

    logger.info("=== Application startup completed successfully ===")
    yield

    if not get_env_bool("MGX_IGNORE_MODULE_INIT", default=True):
        # MODULE_SHUTDOWN_START
        await close_database()
        # MODULE_SHUTDOWN_END
        pass

    await db_manager.close_db()


app = FastAPI(
    title="FastAPI Modular Template",
    description="A best-practice FastAPI template with modular architecture",
    version="1.0.0",
    lifespan=lifespan,
)


# MODULE_MIDDLEWARE_START
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
# MODULE_MIDDLEWARE_END

# Keep request diagnostics outermost so installed module middleware is included.
if RequestSummaryMiddleware is not None:
    app.add_middleware(RequestSummaryMiddleware)


# Setup logging before router registration
setup_logging()

# Explicit router imports for PyInstaller compatibility
from routers.aihub import router as aihub_router
from routers.auth import router as auth_router
from routers.health import router as health_router
from routers.settings import router as settings_router
from routers.signaling import router as signaling_router
from routers.signal_peers import router as signal_peers_router
from routers.signal_rooms import router as signal_rooms_router
from routers.signal_signals import router as signal_signals_router
from routers.storage import router as storage_router
from routers.user import router as user_router


# Register all application routers
for application_router in (
    aihub_router,
    auth_router,
    health_router,
    settings_router,
    signaling_router,
    signal_peers_router,
    signal_rooms_router,
    signal_signals_router,
    storage_router,
    user_router,
):
    app.include_router(application_router)


# Add exception handler for all exceptions except HTTPException
@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle all exceptions except HTTPException

    - Dev environment: Return full stack trace and exception details
    - Prod environment: Return only "Internal server error"
    """
    # Re-raise HTTPException to let FastAPI handle it normally
    if isinstance(exc, HTTPException):
        raise exc

    logger = logging.getLogger(__name__)
    error_message = str(exc)
    error_type = type(exc).__name__

    # Log full error details regardless of environment
    logger.error(f"Exception: {error_type}: {error_message}\n{traceback.format_exc()}")

    is_dev = os.getenv("ENVIRONMENT", "prod").lower() == "dev"

    if is_dev:
        error_detail = f"{error_type}: {error_message}\n{traceback.format_exc()}"
        return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": error_detail})
    else:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": "Internal Server Error"}
        )


@app.get("/")
def root():
    return {"message": "FastAPI Modular Template is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


def run_in_debug_mode(app: FastAPI):
    """Run the FastAPI app in debug mode with proper asyncio handling.

    Handles running under a debugger (PyCharm, VS Code, etc.) where asyncio is
    patched, causing conflicts with uvicorn's asyncio_run. Loads ../.env and
    uses asyncio.run() directly.
    """
    import asyncio
    from pathlib import Path

    import uvicorn
    from dotenv import load_dotenv

    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path, override=True)
        logger = logging.getLogger(__name__)
        logger.info(f"Loaded environment variables from {env_path}")

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=int(settings.port),
        log_level="info",
    )
    server = uvicorn.Server(config)
    asyncio.run(server.serve())


if __name__ == "__main__":
    import sys

    import uvicorn

    # Detect if running in debugger (PyCharm, VS Code, etc.)
    is_debugging = "pydevd" in sys.modules or (hasattr(sys, "gettrace") and sys.gettrace() is not None)

    if is_debugging:
        run_in_debug_mode(app)
    else:
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=int(settings.port),
        )