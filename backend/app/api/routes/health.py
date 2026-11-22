import os
import sys
import time
from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()

@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "pid": os.getpid(),
        "platform": sys.platform,
        "timestamp": time.time(),
        "data_dir": str(settings.APP_DATA_DIR),
    }
