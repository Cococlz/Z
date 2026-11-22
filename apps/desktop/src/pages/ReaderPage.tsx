import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Sparkles,
  RefreshCw,
  Loader2,
  ListTree,
  FileCheck2,
  Lightbulb,
} from 'lucide-react'
import { useDocStore } from '../stores/docStore'

type SummaryMode = 'overall' | 'outline' | 'keypoints'

interface PageChunk {
  chunk_index: number
  page_number: number
  section_title: string
  content: string
  char_length: number
}

interface DocContent {
  id: string
  name: string
  file_type: string
  page_count: number
  char_count: number
  pages: PageChunk[]
}

const MODE_TABS: { id: SummaryMode; label: string; icon: React.ReactNode }[] = [
  { id: 'overall', label: '全局摘要', icon: <FileCheck2 className="w-3.5 h-3.5" /> },
  { id: 'outline', label: '思维大纲', icon: <ListTree className="w-3.5 h-3.5" /> },
  { id: 'keypoints', label: '核心要点', icon: <Lightbulb className="w-3.5 h-3.5" /> },
]

export const ReaderPage: React.FC<{ backendUrl?: string }> = ({ backendUrl: propUrl }) => {
  const storeUrl = useDocStore((s) => s.backendUrl)
  const backendUrl = propUrl || storeUrl || ''

  const { documents, fetchDocuments } = useDocStore()
  const [selectedDocId, setSelectedDocId] = useState<string>('')
  const [docContent, setDocContent] = useState<DocContent | null>(null)
  const [currentPageIdx, setCurrentPageIdx] = useState<number>(0)
  const [loadingContent, setLoadingContent] = useState(false)

  // AI 伴读分析面板状态
  const [mode, setMode] = useState<SummaryMode>('overall')
  const [summaries, setSummaries] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)

  const leftContentRef = useRef<HTMLDivElement>(null)

  // 1. 初始化拉取文档列表
  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // 2. 默认选中第一篇已索引的文档
  useEffect(() => {
    if (!selectedDocId && documents.length > 0) {
      const readyDoc = documents.find((d) => d.status === 'indexed') || documents[0]
      setSelectedDocId(readyDoc.id)
    }
  }, [documents, selectedDocId])

  // 3. 当选中文档改变时，拉取全文内容与已有摘要缓存
  useEffect(() => {
    if (!selectedDocId || !backendUrl) return

    async function loadData() {
      setLoadingContent(true)
      setCurrentPageIdx(0)
      setSummaries({})
      setStreamError(null)

      try {
        // 加载正文
        const res = await fetch(`${backendUrl}/api/v1/reader/${selectedDocId}/content`)
        if (res.ok) {
          const data: DocContent = await res.json()
          setDocContent(data)
        }

        // 加载已缓存摘要
        const sumRes = await fetch(`${backendUrl}/api/v1/reader/${selectedDocId}/summaries`)
        if (sumRes.ok) {
          const sumData = await sumRes.json()
          const cacheMap: Record<string, string> = {}
          for (const key of Object.keys(sumData)) {
            cacheMap[key] = sumData[key].content
          }
          setSummaries(cacheMap)
        }
      } catch (err) {
        console.error('加载阅读器内容失败', err)
      } finally {
        setLoadingContent(false)
      }
    }

    loadData()
  }, [selectedDocId, backendUrl])

  // 4. 滚动到顶部（换页时）
  useEffect(() => {
    leftContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentPageIdx])

  // 5. 流式生成指定模式的摘要
  const handleGenerate = async (force: boolean = false) => {
    if (!selectedDocId || !backendUrl || generating) return

    setGenerating(true)
    setStreamError(null)
    setSummaries((prev) => ({ ...prev, [mode]: '' }))

    try {
      const resp = await fetch(`${backendUrl}/api/v1/reader/${selectedDocId}/summarize/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary_type: mode,
          force_refresh: force,
        }),
      })

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
      }

      if (!resp.body) throw new Error('未获取到流式响应体')

      const reader = resp.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.replace('event: ', '').trim()
          } else if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim()
            if (!dataStr) continue

            try {
              const data = JSON.parse(dataStr)
              if (currentEvent === 'token') {
                setSummaries((prev) => ({
                  ...prev,
                  [mode]: (prev[mode] || '') + data,
                }))
              } else if (currentEvent === 'error') {
                setStreamError(data)
              }
            } catch (err) {
              console.warn('解析 SSE 异常:', err, dataStr)
            }
          }
        }
      }
    } catch (err: any) {
      setStreamError(err.message || '生成失败，请确认 API Key 配置')
    } finally {
      setGenerating(false)
    }
  }

  const currentPage = docContent?.pages?.[currentPageIdx]
  const totalPages = docContent?.pages?.length || 0

  return (
    <div className="flex-1 flex flex-col bg-[#F2F2F7] h-screen overflow-hidden selection:bg-purple-100">
      
      {/* 顶部毛玻璃导航条 (iOS Frosted Top Bar) */}
      <header className="h-14 bg-white/70 backdrop-blur-xl border-b border-black/[0.04] px-6 flex items-center justify-between shrink-0 z-10">
        
        {/* 文档选择下拉框 */}
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-semibold text-zinc-400">阅读文档:</span>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="px-2.5 py-1 text-xs font-bold text-zinc-800 bg-zinc-100/80 hover:bg-zinc-200/60 rounded-full focus:outline-none cursor-pointer transition-all max-w-[280px] truncate"
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id} disabled={d.status !== 'indexed'}>
                  {d.name} {d.status !== 'indexed' ? `(${d.status})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 翻页控制器 (iOS 药丸控制器) */}
        {totalPages > 0 && (
          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-zinc-100 p-0.5 rounded-full border border-black/[0.04] shadow-2xs">
              <button
                onClick={() => setCurrentPageIdx((p) => Math.max(0, p - 1))}
                disabled={currentPageIdx <= 0}
                className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-600 hover:text-zinc-900 disabled:opacity-30 disabled:pointer-events-none active:scale-90 transition-all"
                title="上一页"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-2.5 text-xs font-mono font-semibold text-zinc-700 select-none">
                {currentPageIdx + 1} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPageIdx((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPageIdx >= totalPages - 1}
                className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-600 hover:text-zinc-900 disabled:opacity-30 disabled:pointer-events-none active:scale-90 transition-all"
                title="下一页"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {docContent && (
              <span className="text-[11px] text-zinc-400 font-mono">
                {docContent.char_count ? `${docContent.char_count} 字` : ''}
              </span>
            )}
          </div>
        )}

      </header>

      {/* 双栏核心工作区 */}
      <div className="flex-1 flex overflow-hidden p-5 gap-5">
        
        {/* 左侧：正文阅读器 (iOS 纯白纸质大圆角卡片) */}
        <section className="flex-1 bg-white rounded-3xl shadow-sm border border-black/[0.04] flex flex-col overflow-hidden">
          
          {/* 页眉元信息 */}
          <div className="px-8 py-4 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-white/50">
            <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-500">
              <FileText className="w-3.5 h-3.5 text-blue-500" />
              <span className="truncate max-w-sm">
                {currentPage?.section_title ? currentPage.section_title : `第 ${currentPage?.page_number || 1} 页`}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 font-mono">
              本页字数：{currentPage?.char_length || 0}
            </div>
          </div>

          {/* 正文滚动区 */}
          <div
            ref={leftContentRef}
            className="flex-1 overflow-y-auto px-10 py-8 selection:bg-purple-100 font-sans"
          >
            {loadingContent ? (
              <div className="h-full flex flex-col items-center justify-center space-y-3 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                <span className="text-xs">正在渲染正文排版...</span>
              </div>
            ) : !currentPage ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 text-zinc-400">
                <div className="w-12 h-12 rounded-3xl bg-zinc-100 flex items-center justify-center text-zinc-400">
                  <BookOpen className="w-6 h-6" />
                </div>
                <p className="text-sm">暂无内容，请选择已完成解析的文档</p>
              </div>
            ) : (
              <article className="prose prose-zinc max-w-none text-zinc-800 leading-relaxed text-[15px] space-y-4 whitespace-pre-wrap font-normal">
                {currentPage.content}
              </article>
            )}
          </div>

        </section>

        {/* 右侧：AI 伴读分析面板 (iOS Inset Card) */}
        <aside className="w-[420px] bg-white rounded-3xl shadow-sm border border-black/[0.04] flex flex-col overflow-hidden shrink-0">
          
          {/* 面板顶栏：模式切换分段器 (iOS Segmented Control) */}
          <div className="p-3 border-b border-zinc-100 bg-[#F2F2F7]/50 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-zinc-800">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>AI 深度速读</span>
              </div>

              {/* 生成 / 重新生成按钮 */}
              <button
                onClick={() => handleGenerate(Boolean(summaries[mode]))}
                disabled={generating || !selectedDocId}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white active:scale-95 transition-all shadow-xs disabled:opacity-50 flex items-center space-x-1"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>分析中...</span>
                  </>
                ) : summaries[mode] ? (
                  <>
                    <RefreshCw className="w-3 h-3" />
                    <span>重新生成</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" />
                    <span>一键生成</span>
                  </>
                )}
              </button>
            </div>

            {/* iOS 分段控制器 */}
            <div className="grid grid-cols-3 bg-zinc-200/70 p-1 rounded-2xl gap-1 text-xs font-semibold">
              {MODE_TABS.map((tab) => {
                const active = mode === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setMode(tab.id)}
                    className={`flex items-center justify-center space-x-1 py-1.5 rounded-xl transition-all ${
                      active
                        ? 'bg-white text-zinc-900 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 摘要正文展示区 */}
          <div className="flex-1 overflow-y-auto p-5 text-sm leading-relaxed text-zinc-800 selection:bg-purple-100">
            {streamError ? (
              <div className="bg-rose-50 border border-rose-200/60 rounded-2xl p-4 text-xs text-rose-600 space-y-1">
                <div className="font-semibold">生成异常</div>
                <div>{streamError}</div>
              </div>
            ) : generating && !summaries[mode] ? (
              <div className="h-full flex flex-col items-center justify-center space-y-3 text-zinc-400">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 animate-pulse">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium">Map-Reduce 正在通读全文提炼中...</span>
              </div>
            ) : !summaries[mode] ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 text-zinc-400">
                <div className="w-10 h-10 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <p className="text-xs max-w-[240px]">
                  点击右上角「一键生成」，AI 将自动提炼本文档的
                  {mode === 'overall' ? '全局综合摘要' : mode === 'outline' ? '思维导图大纲' : '核心关键知识点'}
                </p>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none prose-zinc">
                <ReactMarkdown>{summaries[mode]}</ReactMarkdown>
                {generating && (
                  <span className="inline-block w-1.5 h-4 ml-1 bg-purple-500 animate-pulse rounded-full align-middle" />
                )}
              </div>
            )}
          </div>

        </aside>

      </div>

    </div>
  )
}
