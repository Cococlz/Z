#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
echo "============================================="
echo "  智阅 AI (Zhiyue AI) - V1.0 生产级桌面打包构建"
echo "============================================="

# 1. 编译前端与 Electron 主进程
echo "[1/4] 构建前端与 Electron 主进程产物..."
cd "$DIR/apps/desktop"
npm run build

# 2. 使用 PyInstaller 编译独立 Python 后端
echo "[2/4] 编译独立脱机 Python 后端 (PyInstaller)..."
cd "$DIR/backend"
if [ ! -d ".venv" ]; then
    echo "[!] 后端虚拟环境未找到，正在初始化..."
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
fi
.venv/bin/pyinstaller zhiyue_backend.spec --clean --noconfirm

# 3. 同步最新后端二进制至 Electron 资源目录
echo "[3/4] 同步后端独立二进制至桌面工程 resources/backend_dist..."
rm -rf "$DIR/apps/desktop/resources/backend_dist"
mkdir -p "$DIR/apps/desktop/resources"
cp -r "$DIR/backend/dist/zhiyue-backend" "$DIR/apps/desktop/resources/backend_dist"

# 4. 执行 electron-builder 生成 macOS DMG 与 ZIP 分发包
echo "[4/4] 执行 electron-builder 打包 macOS 桌面应用..."
cd "$DIR/apps/desktop"
npx electron-builder --mac --arm64

echo ""
echo "============================================="
echo "  🎉 智阅 AI V1.0 桌面安装包构建完成！"
echo "  产物目录: apps/desktop/release/"
echo "============================================="
ls -lh "$DIR/apps/desktop/release"
