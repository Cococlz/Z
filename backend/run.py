"""
PyInstaller entrypoint for Zhiyue AI Backend
"""
import sys
import os

# 确保 backend 根目录在 sys.path 中
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from app.main import run_server

if __name__ == "__main__":
    run_server()
