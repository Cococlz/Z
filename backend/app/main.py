import argparse
import os
import socket
import sys
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.watchdog import start_watchdog
from app.api.routes import health
from app.api.routes import documents
from app.api.routes import chat
from app.api.routes import settings as settings_route
from app.api.routes import reader
from app.api.routes import convert
from app.api.routes import search
from app.database.session import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure storage folders exist and init DB tables
    settings.ensure_directories()
    init_db()

    # 首次启动：知识库若为空，自动创建出厂实操指南示例文档
    try:
        from app.database.session import SessionLocal
        from app.services.onboarding_service import ensure_onboarding_document
        with SessionLocal() as db:
            ensure_onboarding_document(db)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("初始化新手上手指南失败: %s", e)

    yield
    # Shutdown logic if any

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# Enable CORS for local Electron renderer (allow any origin reflection)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(health.router, prefix=settings.API_V1_STR, tags=["System"])
app.include_router(documents.router, prefix=settings.API_V1_STR)
app.include_router(chat.router)
app.include_router(settings_route.router)
app.include_router(reader.router)
app.include_router(convert.router)
app.include_router(search.router)

def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

def parse_args():
    parser = argparse.ArgumentParser(description="Zhiyue AI Backend Service")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind")
    parser.add_argument("--port", type=int, default=0, help="Port to bind (0 for random free port)")
    parser.add_argument("--parent-pid", type=int, default=None, help="Parent process PID for watchdog")
    parser.add_argument("--token", type=str, default="", help="Session token for communication")
    return parser.parse_args()

def run_server():
    args = parse_args()
    
    port = args.port
    if port == 0:
        port = find_free_port()
        
    token = args.token or os.urandom(16).hex()
    settings.SESSION_TOKEN = token

    # Start parent process watchdog if PID is given
    if args.parent_pid:
        start_watchdog(args.parent_pid)

    # Print handshake line for Electron main process to capture
    sys.stdout.write(f"SERVER_READY:port={port}:token={token}\n")
    sys.stdout.flush()

    # Run Uvicorn
    uvicorn.run(
        app,
        host=args.host,
        port=port,
        log_level="info",
        access_log=False,
    )

if __name__ == "__main__":
    run_server()
