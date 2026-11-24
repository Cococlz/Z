import os
import sys
from pathlib import Path
from pydantic_settings import BaseSettings


def get_default_app_data_dir() -> Path:
    """获取跨平台规范的本地应用数据持久化目录"""
    if sys.platform == "win32":
        appdata = os.getenv("APPDATA")
        base = Path(appdata) if appdata else Path.home() / "AppData" / "Roaming"
        return base / "ZhiyueAI"
    elif sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "ZhiyueAI"
    else:
        xdg = os.getenv("XDG_DATA_HOME")
        base = Path(xdg) if xdg else Path.home() / ".local" / "share"
        return base / "ZhiyueAI"


class Settings(BaseSettings):
    APP_NAME: str = "Zhiyue AI Backend"
    APP_VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SESSION_TOKEN: str = os.getenv("ZHIYUE_SESSION_TOKEN", "")
    
    # Storage paths
    APP_DATA_DIR: Path = get_default_app_data_dir()
    STORAGE_DIR: Path = APP_DATA_DIR / "storage"
    DATABASE_DIR: Path = APP_DATA_DIR / "database"
    VECTOR_DIR: Path = APP_DATA_DIR / "vector_db"
    LOGS_DIR: Path = APP_DATA_DIR / "logs"

    def ensure_directories(self) -> None:
        """Ensure all required local application data directories exist."""
        for path in [self.APP_DATA_DIR, self.STORAGE_DIR, self.DATABASE_DIR, self.VECTOR_DIR, self.LOGS_DIR]:
            path.mkdir(parents=True, exist_ok=True)

settings = Settings()
