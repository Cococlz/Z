import React, { useEffect, useState } from 'react'
import {
  Home, FolderOpen, BookOpen, MessageSquare,
  Shuffle, Settings, Sparkles, Circle
} from 'lucide-react'
import LibraryPage from './pages/LibraryPage'

type Page = 'home' | 'library' | 'reader' | 'chat' | 'convert' | 'settings'

interface NavItem {
  id: Page
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home',    label: '首页',    icon: <Home className="w-4 h-4" /> },
  { id: 'library', label: '我的文档', icon: <FolderOpen className="w-4 h-4" /> },
  { id: 'reader',  label: 'AI 阅读', icon: <BookOpen className="w-4 h-4" /> },
  { id: 'chat',    label: 'AI 问答', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'convert', label: '格式转换', icon: <Shuffle className="w-4 h-4" /> },
  { id: 'settings',label: '设置',    icon: <Settings className="w-4 h-4" /> },
]

export default function App() {
  const [page, setPage] = useState<Page>('library')
  const [backendUrl, setBackendUrl] = useState<string | null>(null)
  const [backendReady, setBackendReady] = useState(false)

  useEffect(() => {
    async function init() {
      if (!window.zhiyue) {
        // Dev browser fallback
        setBackendUrl('http://127.0.0.1:8000')
        setBackendReady(true)
        return
      }
      const cfg = await window.zhiyue.getBackendConfig()
      if (cfg?.baseUrl) {
        setBackendUrl(cfg.baseUrl)
        setBackendReady(true)
      }
      window.zhiyue.onBackendStatus((s) => {
        if (s.ready) setBackendReady(true)
      })
    }
    init()
  }, [])

  function renderPage() {
    if (!backendUrl) {
      return (
        <div className="flex items-center justify-center h-full text-slate-400 text-sm">
          正在连接后端服务…
        </div>
      )
    }
    switch (page) {
      case 'library':
        return <LibraryPage backendUrl={backendUrl} />
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Sparkles className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">此功能正在开发中，敬请期待</p>
          </div>
        )
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className="w-52 flex-none flex flex-col bg-white border-r border-slate-200/80 shadow-sm">
        {/* Logo area — also acts as drag region on macOS */}
        <div
          className="h-10 flex items-end pb-2 px-4"
          style={{ WebkitAppRegion: 'drag' } as any}
        />

        <div className="px-4 pb-4 pt-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-sky-400 flex items-center justify-center text-white shadow">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-bold text-slate-800 tracking-tight">智阅 AI</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                page === item.id
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Backend status dot */}
        <div className="p-4 border-t border-slate-100 flex items-center gap-2">
          <Circle
            className={`w-2 h-2 fill-current ${
              backendReady ? 'text-emerald-500' : 'text-amber-400'
            }`}
          />
          <span className="text-[11px] text-slate-400">
            {backendReady ? 'AI 引擎就绪' : '连接中…'}
          </span>
        </div>
      </aside>

      {/* Main content */}
      <main
        className="flex-1 flex flex-col overflow-hidden"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        {/* Titlebar spacer (macOS traffic lights) */}
        <div
          className="h-10 flex-none border-b border-slate-200/60 bg-white/60 backdrop-blur"
          style={{ WebkitAppRegion: 'drag' } as any}
        />
        <div className="flex-1 overflow-hidden">
          {renderPage()}
        </div>
      </main>
    </div>
  )
}
