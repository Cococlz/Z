import React, { useEffect, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  FolderOpen,
  Server,
  ShieldCheck,
  Zap,
  RefreshCw,
  Layers,
  Sparkles,
} from 'lucide-react'

interface BackendHealth {
  status: string
  app_name: string
  version: string
  pid: number
  platform: string
  timestamp: number
  data_dir: string
}

export default function App() {
  const [config, setConfig] = useState<{ port: number; token: string; baseUrl: string } | null>(null)
  const [health, setHealth] = useState<BackendHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)

  const checkConnection = async () => {
    setLoading(true)
    setError(null)
    const startTime = performance.now()

    try {
      if (!window.zhiyue) {
        // Fallback for regular browser preview
        setError('正在浏览器环境中运行 (未检测到 Electron 上下文)')
        setLoading(false)
        return
      }

      const cfg = await window.zhiyue.getBackendConfig()
      setConfig(cfg)

      if (!cfg.baseUrl) {
        setError('正在等待 Python 后端初始化完成...')
        setLoading(false)
        return
      }

      const res = await fetch(`${cfg.baseUrl}/api/v1/health`)
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`)

      const data: BackendHealth = await res.json()
      setHealth(data)
      setLatency(Math.round(performance.now() - startTime))
    } catch (err: any) {
      console.error(err)
      setError(err.message || '连接后端服务失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkConnection()

    if (window.zhiyue?.onBackendStatus) {
      window.zhiyue.onBackendStatus(() => {
        checkConnection()
      })
    }
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-50">
      {/* Draggable Titlebar Area for macOS */}
      <div
        className="h-10 w-full flex-none flex items-center justify-between px-20 border-b border-slate-200/80 bg-white/70 backdrop-blur"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <span className="text-xs font-semibold text-slate-500 tracking-wide">
          智阅 AI · 本地优先智能文档工作站 (v1.0-dev)
        </span>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={checkConnection}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            重试连接
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
        {/* Welcome Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-sky-400 flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">智阅 AI 系统就绪状态</h1>
              <p className="text-sm text-slate-500">
                Phase 1 基础工程框架与主子进程双向握手验证面板
              </p>
            </div>
          </div>
        </div>

        {/* Backend Status Card */}
        <div className="mb-8 p-6 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-3.5 h-3.5 rounded-full ${
                  health ? 'bg-emerald-500 shadow-lg shadow-emerald-200 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {health ? 'Python FastAPI 后端运行正常' : '后端服务连接中...'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {health
                    ? `已成功通过动态分配端口 ${config?.port} 完成 IPC / HTTP 握手`
                    : error || '正在等待子进程响应...'}
                </p>
              </div>
            </div>

            {latency !== null && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                <Zap className="w-3 h-3" />
                {latency} ms 延迟
              </span>
            )}
          </div>

          {health && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block mb-1">后端进程 PID</span>
                <span className="font-mono font-semibold text-slate-700 text-sm">{health.pid}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block mb-1">动态通信端口</span>
                <span className="font-mono font-semibold text-slate-700 text-sm">
                  127.0.0.1:{config?.port}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block mb-1">会话令牌 (Token)</span>
                <span className="font-mono font-semibold text-slate-700 text-sm truncate block">
                  {config?.token ? `${config.token.slice(0, 10)}...` : 'N/A'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block mb-1">看门狗守护状态</span>
                <span className="font-semibold text-emerald-600 flex items-center gap-1 mt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> 正常守护中
                </span>
              </div>
            </div>
          )}
        </div>

        {/* System Capabilities / Phase 1 Milestones */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-500" />
            阶段一交付进度看板 (Milestones)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 bg-white rounded-xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-slate-900 mb-1">Monorepo 与环境工程</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Electron 28+、React 18、Vite、TypeScript 与 Python 3.12 虚拟环境已全部打通。
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-emerald-600 font-medium">
                ✓ 100% 已就绪
              </div>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                  <Server className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-slate-900 mb-1">动态端口与防孤儿守护</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  FastAPI 监听随机端口 0，Electron 捕获握手指令；内置 Watchdog 监听 Electron 退出自动自杀。
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-emerald-600 font-medium">
                ✓ 100% 已验证
              </div>
            </div>

            <div className="p-5 bg-indigo-50/50 rounded-xl border border-indigo-100/80 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3">
                  <FolderOpen className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-indigo-950 mb-1">下一阶段：受管文档库与解析</h4>
                <p className="text-xs text-indigo-700/80 leading-relaxed">
                  即将接入 SQLite 数据库 DDL、SHA256 哈希去重及 PyMuPDF / python-docx 纯文本抽取器。
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-indigo-100 text-[11px] text-indigo-600 font-semibold flex items-center gap-1">
                <span>准备开始 Phase 2 →</span>
              </div>
            </div>
          </div>
        </div>

        {/* Local Storage Information Footer */}
        {health && (
          <div className="mt-8 p-4 bg-slate-100/60 rounded-xl border border-slate-200/60 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-slate-400" />
              本地数据存储根目录：
              <code className="text-slate-700 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
                {health.data_dir}
              </code>
            </span>
            <span className="text-[11px] text-slate-400">本地优先 · 隐私无忧</span>
          </div>
        )}
      </div>
    </div>
  )
}
