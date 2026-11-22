#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

echo "=== 启动 智阅 AI 开发环境 ==="

# Check Python venv
if [ ! -d "$DIR/backend/.venv" ]; then
    echo "[!] 后端虚拟环境未找到，正在初始化..."
    cd "$DIR/backend"
    uv venv .venv
    uv pip install -r requirements.txt
fi

# Run desktop dev (Vite + Electron)
cd "$DIR/apps/desktop"
npm run dev
