@echo off
setlocal enabledelayedexpansion

echo =============================================
echo   智阅 AI (Zhiyue AI) - Windows 桌面打包构建
echo =============================================

set "DIR=%~dp0.."

echo [1/4] 构建前端与 Electron 主进程产物...
cd /d "%DIR%\apps\desktop"
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%

echo [2/4] 编译独立脱机 Python 后端 (PyInstaller)...
cd /d "%DIR%\backend"
if not exist ".venv" (
    echo [!] 后端虚拟环境未找到，正在初始化...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    pip install -r requirements.txt
)
call .venv\Scripts\pyinstaller.exe zhiyue_backend.spec --clean --noconfirm
if %errorlevel% neq 0 exit /b %errorlevel%

echo [3/4] 同步后端独立二进制至桌面工程 resources/backend_dist...
if exist "%DIR%\apps\desktop\resources\backend_dist" rmdir /s /q "%DIR%\apps\desktop\resources\backend_dist"
mkdir "%DIR%\apps\desktop\resources" 2>nul
xcopy /e /i /y "%DIR%\backend\dist\zhiyue-backend" "%DIR%\apps\desktop\resources\backend_dist"

echo [4/4] 执行 electron-builder 生成 Windows 安装包 (NSIS)...
cd /d "%DIR%\apps\desktop"
call npx electron-builder --win --x64
if %errorlevel% neq 0 exit /b %errorlevel%

echo =============================================
echo   🎉 智阅 AI Windows 安装包构建完成！
echo   产物目录: apps\desktop\release\
echo =============================================
dir /b "%DIR%\apps\desktop\release\*.exe" 2>nul
