import { app, BrowserWindow, ipcMain, dialog } from 'electron'
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
  if (isDev) {
    const venvPython = path.resolve(__dirname, '../../../backend/.venv/bin/python')
    if (fs.existsSync(venvPython)) {
      return venvPython
    }
    return 'python3'
  }
  // In production, packaged python binary
  return path.join(process.resourcesPath, 'backend_dist', 'main')
}

function startBackendService(): Promise<void> {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath()
    const backendCwd = isDev
      ? path.resolve(__dirname, '../../../backend')
      : path.join(process.resourcesPath, 'backend')

    const parentPid = process.pid

    console.log(`[Electron] Starting Python Backend: ${pythonPath} in ${backendCwd}`)

    pyProcess = spawn(
      pythonPath,
      ['-m', 'app.main', '--parent-pid', parentPid.toString(), '--port', '0'],
      {
        cwd: backendCwd,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
        },
      }
    )

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
      pyProcess.kill('SIGTERM')
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
    win.loadFile(path.join(process.env.DIST as string, 'index.html'), {
      query: {
        backendUrl: backendConfig.baseUrl,
        token: backendConfig.token,
      },
    })
  }
}

function createWindow() {
  win = new BrowserWindow({
    title: '智阅 AI',
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#F2F2F7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload IPC
      webSecurity: false, // 允许本地 file:// 协议自由请求本地 127.0.0.1 端口
    },
  })
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
  stopBackendService()
})

app.on('window-all-closed', () => {
  stopBackendService()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
