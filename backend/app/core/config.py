import os
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "Zhiyue AI Backend"
    APP_VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SESSION_TOKEN: str = os.getenv("ZHIYUE_SESSION_TOKEN", "")
    
    # Storage paths
    APP_DATA_DIR: Path = Path.home() / "Library" / "Application Support" / "ZhiyueAI"
    STORAGE_DIR: Path = APP_DATA_DIR / "storage"
    DATABASE_DIR: Path = APP_DATA_DIR / "database"
    VECTOR_DIR: Path = APP_DATA_DIR / "vector_db"
    LOGS_DIR: Path = APP_DATA_DIR / "logs"

    def ensure_directories(self) -> None:
        """Ensure all required local application data directories exist."""
        for path in [self.APP_DATA_DIR, self.STORAGE_DIR, self.DATABASE_DIR, self.VECTOR_DIR, self.LOGS_DIR]:
            path.mkdir(parents=True, exist_ok=True)

settings = Settings()
