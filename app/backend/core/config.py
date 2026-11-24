import logging
import os
import sys
from pathlib import Path
from typing import Any

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


def get_data_dir() -> Path:
    """Writable, persistent per-user data directory (same base as the log directory)."""
    if sys.platform.startswith("win"):
        base = os.environ.get("LOCALAPPDATA")
        root = Path(base) / "ERROR MESSENGER" if base else Path.home() / "AppData" / "Local" / "ERROR MESSENGER"
    else:
        root = Path.home() / ".error-messenger"
    data_dir = root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


class Settings(BaseSettings):
    # Application
    app_name: str = "FastAPI Modular Template"
    debug: bool = False
    version: str = "1.0.0"

    # Server
    host: str = "0.0.0.0"
    port: int = 3001

    # Database
    # Read from the DATABASE_URL environment variable if set; otherwise a local
    # SQLite file in the per-user data directory is used (see validator below).
    database_url: str = ""

    # AWS Lambda Configuration
    is_lambda: bool = False
    lambda_function_name: str = "fastapi-backend"
    aws_region: str = "us-east-1"

    @model_validator(mode="after")
    def _default_database_url(self) -> "Settings":
        if not self.database_url:
            db_path = get_data_dir() / "error_messenger.db"
            self.database_url = f"sqlite+aiosqlite:///{db_path.as_posix()}"
            logger.info("DATABASE_URL not set; using local SQLite database: %s", db_path)
        return self

    @property
    def backend_url(self) -> str:
        if self.is_lambda:
            return os.environ.get(
                "PYTHON_BACKEND_URL",
                f"https://{self.lambda_function_name}.execute-api.{self.aws_region}.amazonaws.com"
            )
        else:
            display_host = "127.0.0.1" if self.host == "0.0.0.0" else self.host
            return os.environ.get(
                "PYTHON_BACKEND_URL",
                f"http://{display_host}:{self.port}"
            )

    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    def __getattr__(self, name: str) -> Any:
        env_var_name = name.upper()

        if env_var_name in os.environ:
            value = os.environ[env_var_name]
            self.__dict__[name] = value
            logger.debug(f"Read dynamic attribute {name} from environment variable {env_var_name}")
            return value

        raise AttributeError(
            f"'{self.__class__.__name__}' object has no attribute '{name}'"
        )


settings = Settings()