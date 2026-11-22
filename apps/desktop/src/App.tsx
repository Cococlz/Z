import React, { useEffect, useState } from 'react'
import {
  FolderOpen,
  BookOpen,
  MessageSquare,
  Settings,
  Sparkles,
  Circle,
  Cpu,
} from 'lucide-react'
import LibraryPage from './pages/LibraryPage'
import { ChatPage } from './pages/ChatPage'
import { SettingsPage } from './pages/SettingsPage'

type Page = 'library' | 'chat' | 'reader' | 'settings'

interface NavItem {
  id: Page
  label: string
  icon: React.ReactNode
  color: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'library', label: '文档知识库', icon: <FolderOpen className="w-4 h-4" />, color: 'bg-blue-500' },
  { id: 'chat', label: 'AI 问答', icon: <MessageSquare className="w-4 h-4" />, color: 'bg-emerald-500' },
  { id: 'reader', label: '深度阅读', icon: <BookOpen className="w-4 h-4" />, color: 'bg-purple-500' },
  { id: 'settings', label: '偏好设置', icon: <Settings className="w-4 h-4" />, color: 'bg-zinc-600' },
]

export default function App() {
  const [page, setPage] = useState<Page>('library')
  const [backendUrl, setBackendUrl] = useState<string | null>(null)
  const [backendReady, setBackendReady] = useState(false)

  useEffect(() => {
    async function init() {
      if (!window.zhiyue) {
        // Dev fallback
        setBackendUrl('http://127.0.0.1:8000')
        setBackendReady(true)
        return
      }
      const cfg = await window.zhiyue.getBackendConfig()
      if (cfg?.baseUrl) {
        setBackendUrl(cfg.baseUrl)
        setBackendReady(true)
      }
      window.zhiyue.onBackendStatus((s: any) => {
        if (s.ready) setBackendReady(true)
      })
    }
    init()
  }, [])

  function renderPage() {
    if (!backendUrl) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#F2F2F7] space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center animate-spin">
            <Cpu className="w-5 h-5 text-blue-500" />
          </div>
          <span className="text-xs font-medium text-zinc-400">正在与本地 AI 核心握手...</span>
        </div>
      )
    }

    switch (page) {
      case 'library':
        return <LibraryPage backendUrl={backendUrl} />
      case 'chat':
        return <ChatPage />
      case 'settings':
        return <SettingsPage />
      case 'reader':
        return (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#F2F2F7] text-center p-8 space-y-3">
            <div className="w-12 h-12 rounded-3xl bg-white shadow-sm border border-black/[0.04] flex items-center justify-center text-purple-500">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-zinc-800">深度长文阅读器 (Phase 5)</h3>
            <p className="text-xs text-zinc-400 max-w-sm">
              双栏阅读视图与 Map-Reduce 全文大纲速读功能将在下一阶段开启。
            </p>
          </div>
        )
      default:
        return <LibraryPage backendUrl={backendUrl} />
    }
  }

  return (
    <div className="flex h-screen bg-[#F2F2F7] font-sans overflow-hidden select-none">
      
      {/* iOS 风格侧边栏 (Sidebar) */}
      <aside className="w-60 bg-white/70 backdrop-blur-2xl border-r border-black/[0.05] flex flex-col justify-between shrink-0 p-4">
        <div className="space-y-6">
          
          {/* Logo 标题区 */}
          <div className="flex items-center space-x-2.5 px-2 pt-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/25">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-zinc-900 leading-none">智阅 AI</div>
              <div className="text-[10px] text-zinc-400 mt-1 font-mono">v1.0 Local-First</div>
            </div>
          </div>

          {/* 导航菜单组 */}
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = page === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setPage(item.id)}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all duration-150 active:scale-[0.98] ${
                    active
                      ? 'bg-white text-zinc-900 shadow-sm border border-black/[0.04]'
                      : 'text-zinc-500 hover:text-zinc-800 hover:bg-black/[0.03]'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-white shadow-2xs ${
                      active ? item.color : 'bg-zinc-400/80'
                    }`}
                  >
                    {item.icon}
                  </div>
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>

        </div>

        {/* 底部服务运行状态 (iOS 呼吸小药丸) */}
        <div className="bg-white/80 rounded-2xl p-3 border border-black/[0.04] shadow-2xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  backendReady ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  backendReady ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
            </span>
            <span className="text-[11px] font-medium text-zinc-600">
              {backendReady ? '本地引擎就绪' : '连接后端中'}
            </span>
          </div>

          <div className="text-[10px] font-mono text-zinc-400">ChromaDB</div>
        </div>

      </aside>

      {/* 主视图渲染区 */}
      <main className="flex-1 flex overflow-hidden">{renderPage()}</main>

    </div>
  )
}
