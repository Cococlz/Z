import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null = null
let pyProcess: ChildProcess | null = null
let isQuitting = false
let isRestarting = false

let backendConfig = {
  port: 0,
  token: '',
  baseUrl: '',
  ready: false,
  error: '',
}

const isDev = !app.isPackaged
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function getPythonPath(): string {
  const isWin = process.platform === 'win32'
  if (isDev) {
    const venvPython = isWin
      ? path.resolve(__dirname, '../../../backend/.venv/Scripts/python.exe')
      : path.resolve(__dirname, '../../../backend/.venv/bin/python')
    if (fs.existsSync(venvPython)) {
      return venvPython
    }
    return isWin ? 'python.exe' : 'python3'
  }
  // In production, packaged standalone binary
  const binaryName = isWin ? 'zhiyue-backend.exe' : 'zhiyue-backend'
  return path.join(process.resourcesPath, 'backend_dist', binaryName)
}

function startBackendService(): Promise<void> {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath()
    const backendCwd = isDev
      ? path.resolve(__dirname, '../../../backend')
      : path.join(process.resourcesPath, 'backend_dist')

    const parentPid = process.pid

    console.log(`[Electron] Starting Python Backend: ${pythonPath} in ${backendCwd}`)

    const args = isDev
      ? ['-m', 'app.main', '--parent-pid', parentPid.toString(), '--port', '0']
      : ['--parent-pid', parentPid.toString(), '--port', '0']

    pyProcess = spawn(pythonPath, args, {
      cwd: backendCwd,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    })

    let isHandshakeComplete = false

    pyProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      console.log(`[Python stdout] ${output.trim()}`)

      const match = output.match(/SERVER_READY:port=(\d+):token=([a-zA-Z0-9]+)/)
      if (match && !isHandshakeComplete) {
        isHandshakeComplete = true
        backendConfig.port = parseInt(match[1], 10)
        backendConfig.token = match[2]
        backendConfig.baseUrl = `http://127.0.0.1:${backendConfig.port}`
        backendConfig.ready = true

        console.log(`[Electron] Backend connected at ${backendConfig.baseUrl}`)
        win?.webContents.send('backend-status', {
          ready: true,
          baseUrl: backendConfig.baseUrl,
          token: backendConfig.token,
          port: backendConfig.port,
        })
        resolve()
      }
    })

    pyProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[Python stderr] ${data.toString().trim()}`)
    })

    pyProcess.on('error', (err) => {
      console.error('[Electron] Failed to start Python process:', err)
      backendConfig.error = err.message
      reject(err)
    })

    pyProcess.on('exit', (code, signal) => {
      console.log(`[Electron] Python process exited with code=${code}, signal=${signal}`)
      backendConfig.ready = false
      if (!isHandshakeComplete) {
        reject(new Error(`Python process exited before ready, code: ${code}`))
      } else if (!isQuitting && !isRestarting) {
        // 自愈保活：如果应用仍在运行，1秒内自动拉起后端引擎并静默重连
        isRestarting = true
        console.log('[Electron] 后端服务异常离线，正在触发自愈机制重新拉起引擎...')
        setTimeout(async () => {
          if (isQuitting) return
          try {
            await startBackendService()
            console.log(`[Electron] 后端自愈成功！新端口: ${backendConfig.port}`)
            isRestarting = false
            loadApp()
          } catch (err) {
            console.error('[Electron] 后端自动恢复失败:', err)
            isRestarting = false
          }
        }, 1200)
      }
    })

    // Timeout fallback (15s)
    setTimeout(() => {
      if (!isHandshakeComplete) {
        reject(new Error('Backend connection timed out (15s)'))
      }
    }, 15000)
  })
}

function stopBackendService() {
  if (pyProcess) {
    console.log('[Electron] Terminating Python Backend process...')
    try {
      if (process.platform === 'win32' && pyProcess.pid) {
        spawn('taskkill', ['/pid', pyProcess.pid.toString(), '/T', '/F'])
      } else {
        pyProcess.kill('SIGTERM')
      }
    } catch (e) {
      console.error('[Electron] Error killing Python process:', e)
    }
    pyProcess = null
  }
}

function loadApp() {
  if (!win) return
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(`${VITE_DEV_SERVER_URL}?backendUrl=${encodeURIComponent(backendConfig.baseUrl)}&token=${encodeURIComponent(backendConfig.token)}`)
  } else {
    const indexPath = path.join(process.env.DIST as string, 'index.html')
    const fileUrl = `file://${indexPath}?backendUrl=${encodeURIComponent(backendConfig.baseUrl)}&token=${encodeURIComponent(backendConfig.token)}`
    win.loadURL(fileUrl)
  }
}

function getSavedBounds(): { width: number; height: number; x?: number; y?: number } {
  try {
    const file = path.join(app.getPath('userData'), 'window-bounds.json')
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
      if (typeof data.width === 'number' && typeof data.height === 'number') {
        return data
      }
    }
  } catch (e) {
    // ignore
  }
  return { width: 1280, height: 860 }
}

let saveBoundsTimer: NodeJS.Timeout | null = null
function queueSaveBounds() {
  if (!win) return
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(() => {
    try {
      if (win && !win.isDestroyed() && !win.isMinimized() && !win.isFullScreen()) {
        const bounds = win.getBounds()
        const file = path.join(app.getPath('userData'), 'window-bounds.json')
        fs.writeFileSync(file, JSON.stringify(bounds), 'utf-8')
      }
    } catch (e) {
      // ignore
    }
  }, 500)
}

function setupAppMenu() {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: '智阅 AI',
            submenu: [
              { role: 'about' as const, label: '关于 智阅 AI' },
              { type: 'separator' as const },
              { role: 'services' as const, label: '服务' },
              { type: 'separator' as const },
              { role: 'hide' as const, label: '隐藏 智阅 AI' },
              { role: 'hideOthers' as const, label: '隐藏其他' },
              { role: 'unhide' as const, label: '显示全部' },
              { type: 'separator' as const },
              { role: 'quit' as const, label: '退出 智阅 AI' },
            ],
          },
        ]
      : []),
    {
      label: '文件',
      submenu: [
        {
          label: '导入文档...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            win?.webContents.send('menu-import-document')
          },
        },
        { type: 'separator' as const },
        isMac ? { role: 'close' as const, label: '关闭窗口' } : { role: 'quit' as const, label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' as const, label: '撤销' },
        { role: 'redo' as const, label: '重做' },
        { type: 'separator' as const },
        { role: 'cut' as const, label: '剪切' },
        { role: 'copy' as const, label: '复制' },
        { role: 'paste' as const, label: '粘贴' },
        { role: 'selectAll' as const, label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' as const, label: '重新加载' },
        { role: 'forceReload' as const, label: '强制重新加载' },
        { role: 'toggleDevTools' as const, label: '切换开发者工具' },
        { type: 'separator' as const },
        { role: 'resetZoom' as const, label: '实际大小' },
        { role: 'zoomIn' as const, label: '放大' },
        { role: 'zoomOut' as const, label: '缩小' },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const, label: '切换全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' as const, label: '最小化' },
        { role: 'zoom' as const, label: '缩放' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const, label: '前置全部窗口' },
              { type: 'separator' as const },
              { role: 'window' as const, label: '窗口' },
            ]
          : [{ role: 'close' as const, label: '关闭' }]),
      ],
    },
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindow() {
  const isMac = process.platform === 'darwin'
  const savedBounds = getSavedBounds()
  win = new BrowserWindow({
    title: '智阅 AI',
    width: savedBounds.width,
    height: savedBounds.height,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 960,
    minHeight: 640,
    icon: path.join(__dirname, '../build/icon.png'),
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 18, y: 18 } }
      : {
          titleBarOverlay: {
            color: '#1C1C1E',
            symbolColor: '#A1A1AA',
            height: 36,
          },
        }),
    backgroundColor: '#1C1C1E',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload IPC
      webSecurity: false, // 允许本地 file:// 协议自由请求本地 127.0.0.1 端口
    },
  })

  win.on('resize', queueSaveBounds)
  win.on('move', queueSaveBounds)
}

// IPC Handlers
ipcMain.handle('get-backend-config', async () => {
  if (backendConfig.ready) {
    return backendConfig
  }
  // 若后端仍在握手，挂起等待直至就绪
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (backendConfig.ready) {
        clearInterval(timer)
        resolve(backendConfig)
      }
    }, 100)
    setTimeout(() => {
      clearInterval(timer)
      resolve(backendConfig)
    }, 15000)
  })
})

ipcMain.handle('dialog:select-file', async (_, options) => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: options?.filters || [
      { name: 'All Supported Documents', extensions: ['pdf', 'docx', 'txt', 'md'] },
      { name: 'PDF Document', extensions: ['pdf'] },
      { name: 'Word Document', extensions: ['docx'] },
      { name: 'Markdown Document', extensions: ['md'] },
      { name: 'Text Document', extensions: ['txt'] },
    ],
  })
  return result.filePaths[0] || null
})

// App Lifecycle
app.whenReady().then(async () => {
  setupAppMenu()
  createWindow()
  try {
    await startBackendService()
  } catch (err) {
    console.error('[Electron] Error starting backend:', err)
  }
  // 后端就绪后加载前端页面，并注入 query 参数
  loadApp()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      loadApp()
    }
  })
})

app.on('before-quit', () => {
  isQuitting = true
  stopBackendService()
})

app.on('window-all-closed', () => {
  isQuitting = true
  stopBackendService()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
