import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  Sparkles,
  RefreshCw,
  Loader2,
  ListTree,
  FileCheck2,
  Lightbulb,
  Copy,
  Check,
  Languages,
  X,
  FileSearch,
  GripHorizontal,
} from 'lucide-react'
import { useDocStore } from '../stores/docStore'

type SummaryMode = 'overall' | 'outline' | 'keypoints'
type ReadViewMode = 'extracted' | 'native'

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

interface FileInfo {
  storage_path: string
  file_url: string
}

interface HighlightTooltipState {
  show: boolean
  x: number
  y: number
  selectedText: string
}

interface InlineActionResult {
  show: boolean
  title: string
  action: 'explain' | 'translate' | 'summarize'
  selectedText: string
  targetLang?: string
  content: string
  isStreaming: boolean
}

const TRANSLATE_LANGUAGES: { code: string; label: string; flag: string }[] = [
  { code: 'zh-CN', label: '现代中文', flag: '🇨🇳' },
  { code: 'en', label: '英语', flag: '🇬🇧' },
  { code: 'ja', label: '日语', flag: '🇯🇵' },
  { code: 'ko', label: '韩语', flag: '🇰🇷' },
  { code: 'fr', label: '法语', flag: '🇫🇷' },
  { code: 'de', label: '德语', flag: '🇩🇪' },
  { code: 'es', label: '西班牙语', flag: '🇪🇸' },
  { code: 'ru', label: '俄语', flag: '🇷🇺' },
]

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
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [currentPageIdx, setCurrentPageIdx] = useState<number>(0)
  const [loadingContent, setLoadingContent] = useState(false)

  // 阅读视图切换（精读文本 vs 原版 PDF）
  const [readViewMode, setReadViewMode] = useState<ReadViewMode>('extracted')

  // AI 伴读分析面板状态
  const [mode, setMode] = useState<SummaryMode>('overall')
  const [summaries, setSummaries] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)

  // 划词悬浮菜单与结果弹窗状态
  const [tooltip, setTooltip] = useState<HighlightTooltipState>({
    show: false,
    x: 0,
    y: 0,
    selectedText: '',
  })
  const [inlineResult, setInlineResult] = useState<InlineActionResult>({
    show: false,
    title: '',
    action: 'explain',
    selectedText: '',
    content: '',
    isStreaming: false,
  })
  const [translateLang, setTranslateLang] = useState('en')
  const [langDropdownOpen, setLangDropdownOpen] = useState(false)
  const [copiedHighlight, setCopiedHighlight] = useState(false)
  const [copiedResult, setCopiedResult] = useState(false)

  // 同步设置中的默认翻译偏好语言
  useEffect(() => {
    if (!backendUrl) return
    fetch(`${backendUrl}/api/v1/settings/overview`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.preferences?.reader_target_lang) {
          setTranslateLang(data.preferences.reader_target_lang)
        }
      })
      .catch(() => {})
  }, [backendUrl])

  // 划词 AI 弹窗拖拽定位与状态
  const [cardPos, setCardPos] = useState<{ x: number; y: number }>(() => ({
    x: 40,
    y: typeof window !== 'undefined' ? Math.max(80, window.innerHeight - 440) : 320,
  }))
  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const leftContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  useEffect(() => {
    if (!selectedDocId && documents.length > 0) {
      const readyDoc = documents.find((d) => d.status === 'indexed') || documents[0]
      setSelectedDocId(readyDoc.id)
    }
  }, [documents, selectedDocId])

  // 加载文档内容与物理文件信息
  useEffect(() => {
    if (!selectedDocId || !backendUrl) return

    async function loadData() {
      setLoadingContent(true)
      setCurrentPageIdx(0)
      setSummaries({})
      setStreamError(null)
      setTooltip((prev) => ({ ...prev, show: false }))

      try {
        // 1. 获取正文分页
        const res = await fetch(`${backendUrl}/api/v1/reader/${selectedDocId}/content`)
        if (res.ok) {
          const data: DocContent = await res.json()
          setDocContent(data)
        }

        // 2. 获取物理文件路径（用于原版 PDF 预览）
        const fileRes = await fetch(`${backendUrl}/api/v1/reader/${selectedDocId}/file-info`)
        if (fileRes.ok) {
          const fData: FileInfo = await fileRes.json()
          setFileInfo(fData)
        }

        // 3. 获取已缓存摘要
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

  useEffect(() => {
    leftContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentPageIdx])

  // 点击外部自动收起划词气泡（但点击气泡本身或结果卡片内部时不收起）
  useEffect(() => {
    const handleGlobalPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      // 点击语言下拉菜单外部时自动收起下拉
      if (!target.closest('#zhiyue-lang-selector-container')) {
        setLangDropdownOpen(false)
      }
      if (target.closest('#zhiyue-highlight-tooltip') || target.closest('#zhiyue-inline-card')) {
        return
      }
      setTooltip((prev) => (prev.show ? { ...prev, show: false } : prev))
    }

    window.addEventListener('mousedown', handleGlobalPointerDown)
    return () => {
      window.removeEventListener('mousedown', handleGlobalPointerDown)
    }
  }, [])

  // 鼠标拖拽 AI 结果卡片全局监听（边界保护）
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return
      const cardEl = document.getElementById('zhiyue-inline-card')
      const cardWidth = cardEl ? cardEl.offsetWidth : 440
      const cardHeight = cardEl ? cardEl.offsetHeight : 340

      const newX = Math.max(12, Math.min(window.innerWidth - cardWidth - 12, e.clientX - dragOffsetRef.current.x))
      const newY = Math.max(12, Math.min(window.innerHeight - cardHeight - 12, e.clientY - dragOffsetRef.current.y))
      setCardPos({ x: newX, y: newY })
    }

    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false
    }

    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [])

  // 开始拖拽 AI 结果卡片（排除按钮、选择器与下拉气泡区域）
  const handleCardDragStart = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (
      target.closest('button') ||
      target.closest('select') ||
      target.closest('input') ||
      target.closest('#zhiyue-lang-selector-container')
    ) {
      return
    }
    e.preventDefault()
    isDraggingRef.current = true
    const cardEl = document.getElementById('zhiyue-inline-card')
    if (cardEl) {
      const rect = cardEl.getBoundingClientRect()
      dragOffsetRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }
  }

  // 复制 AI 结果卡片内容
  const handleCopyResult = () => {
    if (!inlineResult.content) return
    navigator.clipboard.writeText(inlineResult.content)
    setCopiedResult(true)
    setTimeout(() => setCopiedResult(false), 1500)
  }

  // 划词监听处理（延时 20ms 以确保浏览器选区 Rect 就绪）
  const handleMouseUp = () => {
    setTimeout(() => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) {
        setTooltip((prev) => ({ ...prev, show: false }))
        return
      }

      const text = selection.toString().trim()
      if (text.length > 0) {
        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        // 浮在选中文本的正上方，并做严密屏幕边界保护
        const targetX = Math.max(16, Math.min(window.innerWidth - 250, rect.left + rect.width / 2 - 110))
        const targetY = rect.top < 60 ? rect.bottom + 8 : rect.top - 46
        setTooltip({
          show: true,
          x: targetX,
          y: targetY,
          selectedText: text,
        })
      } else {
        setTooltip((prev) => ({ ...prev, show: false }))
      }
    }, 20)
  }

  // 触发划词 AI 动作 (explain / translate / summarize)
  const triggerInlineAction = async (
    action: 'explain' | 'translate' | 'summarize',
    overrideLang?: string,
    overrideText?: string
  ) => {
    const textToUse = overrideText || tooltip.selectedText
    if (!textToUse || !backendUrl) return

    const targetLangCode = overrideLang || translateLang
    const titleMap = {
      explain: '💡 深度原理解读',
      translate: '🌐 语境互译',
      summarize: '📝 核心速览',
    }

    setInlineResult({
      show: true,
      title: titleMap[action],
      action,
      selectedText: textToUse,
      targetLang: targetLangCode,
      content: '',
      isStreaming: true,
    })
    setTooltip((prev) => ({ ...prev, show: false }))

    try {
      const resp = await fetch(`${backendUrl}/api/v1/reader/inline-action/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToUse,
          action,
          target_lang: action === 'translate' ? targetLangCode : undefined,
          context: currentPage?.content ? currentPage.content.slice(0, 300) : undefined,
        }),
      })

      if (!resp.ok || !resp.body) throw new Error('流式响应中断')

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
                setInlineResult((prev) => ({ ...prev, content: prev.content + data }))
              }
            } catch (e) {
              console.warn(e)
            }
          }
        }
      }
    } catch (err: any) {
      setInlineResult((prev) => ({
        ...prev,
        content: `⚠️ 请求异常: ${err.message || '请检查 API 密钥设置'}`,
      }))
    } finally {
      setInlineResult((prev) => ({ ...prev, isStreaming: false }))
    }
  }

  // 复制划词文本
  const handleCopySelection = () => {
    if (!tooltip.selectedText) return
    navigator.clipboard.writeText(tooltip.selectedText)
    setCopiedHighlight(true)
    setTimeout(() => {
      setCopiedHighlight(false)
      setTooltip((prev) => ({ ...prev, show: false }))
    }, 1200)
  }

  // 生成大纲/摘要
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

      if (!resp.ok || !resp.body) throw new Error('未获取到流式响应体')

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
  const isPdf = docContent?.file_type?.toLowerCase() === 'pdf'

  return (
    <div className="flex-1 flex flex-col bg-[#F2F2F7] h-screen overflow-hidden selection:bg-purple-100 relative">
      
      {/* 顶部毛玻璃导航条 */}
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
              className="px-2.5 py-1 text-xs font-bold text-zinc-800 bg-zinc-100 hover:bg-zinc-200/60 rounded-full focus:outline-none cursor-pointer transition-all max-w-[280px] truncate"
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id} disabled={d.status !== 'indexed'}>
                  {d.name} {d.status !== 'indexed' ? `(${d.status})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 核心双重视图切换控制器 (精读排版 vs 原版版式) */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-zinc-200/70 p-1 rounded-2xl gap-1 text-xs font-semibold">
            <button
              onClick={() => setReadViewMode('extracted')}
              className={`flex items-center space-x-1 px-3 py-1 rounded-xl transition-all ${
                readViewMode === 'extracted'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              <span>精读排版</span>
            </button>

            <button
              onClick={() => setReadViewMode('native')}
              className={`flex items-center space-x-1 px-3 py-1 rounded-xl transition-all ${
                readViewMode === 'native'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <FileSearch className="w-3.5 h-3.5 text-blue-500" />
              <span>原版图文对照</span>
            </button>
          </div>

          {/* 翻页器（仅在精读排版模式下显示） */}
          {readViewMode === 'extracted' && totalPages > 0 && (
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
            </div>
          )}
        </div>

      </header>

      {/* 双栏核心工作区 */}
      <div className="flex-1 flex overflow-hidden p-5 gap-5">
        
        {/* 左侧：阅读展示区 */}
        <section className="flex-1 bg-white rounded-3xl shadow-sm border border-black/[0.04] flex flex-col overflow-hidden relative">
          
          {readViewMode === 'extracted' ? (
            /* 视图 A: 精读排版视图（支持划词操作） */
            <>
              {/* 页眉元信息 */}
              <div className="px-8 py-3.5 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-white/50">
                <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-500">
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  <span className="truncate max-w-sm">
                    {currentPage?.section_title ? currentPage.section_title : `第 ${currentPage?.page_number || 1} 页`}
                  </span>
                </div>
                <div className="flex items-center space-x-3 text-[11px] text-zinc-400 font-mono">
                  <span>💡 提示：划选任意文本即可呼出 AI 悬浮解读</span>
                  <span>本页: {currentPage?.char_length || 0} 字</span>
                </div>
              </div>

              {/* 正文滚动区 */}
              <div
                ref={leftContentRef}
                onMouseUp={handleMouseUp}
                className="flex-1 overflow-y-auto px-10 py-8 font-sans select-text cursor-text selection:bg-purple-200 selection:text-purple-900"
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
                  <>
                    <article className="prose prose-zinc max-w-none text-zinc-800 leading-relaxed text-[15px] space-y-4 whitespace-pre-wrap font-normal select-text cursor-text">
                      {currentPage.content}
                    </article>

                    {/* 页面底部多章节流转导航（当文档存在多个分页时显著呈现） */}
                    {totalPages > 1 && (
                      <div className="mt-12 pt-6 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500 select-none">
                        <button
                          onClick={() => setCurrentPageIdx((p) => Math.max(0, p - 1))}
                          disabled={currentPageIdx <= 0}
                          className="px-3.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all flex items-center space-x-1 font-medium"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          <span>上一章节</span>
                        </button>

                        <div className="text-center space-y-0.5">
                          <span className="font-mono text-xs font-semibold text-zinc-700">
                            第 {currentPageIdx + 1} 页 / 共 {totalPages} 页
                          </span>
                          {docContent?.pages?.[currentPageIdx + 1] && (
                            <div className="text-[11px] text-zinc-400">
                              下一节：{docContent.pages[currentPageIdx + 1].section_title || `第 ${currentPageIdx + 2} 页`}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => setCurrentPageIdx((p) => Math.min(totalPages - 1, p + 1))}
                          disabled={currentPageIdx >= totalPages - 1}
                          className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all flex items-center space-x-1 shadow-xs font-medium"
                        >
                          <span>下一章节</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            /* 视图 B: 原版 PDF 高清视觉版面对照 */
            <div className="flex-1 h-full w-full bg-zinc-100 flex flex-col">
              {fileInfo && isPdf ? (
                <iframe
                  src={`${fileInfo.file_url}#toolbar=1&navpanes=0`}
                  title="PDF 原版视图"
                  className="w-full h-full border-none rounded-3xl"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 text-zinc-400">
                  <div className="w-12 h-12 rounded-3xl bg-white shadow-2xs flex items-center justify-center text-blue-500">
                    <FileSearch className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-zinc-700">当前文档非 PDF 原版格式</h3>
                  <p className="text-xs max-w-sm">
                    原版图文对照优先针对 PDF 提供高保真版面渲染，Word 或 TXT 文档建议使用「精读排版」进行阅读。
                  </p>
                </div>
              )}
            </div>
          )}

        </section>

        {/* 右侧：AI 伴读与深度分析面板 */}
        <aside className="w-[440px] bg-white rounded-3xl shadow-sm border border-black/[0.04] flex flex-col overflow-hidden shrink-0">
          
          {/* 面板顶栏 */}
          <div className="p-3 border-b border-zinc-100 bg-[#F2F2F7]/50 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-zinc-800">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>AI 伴读分析</span>
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

          {/* 摘要正文展示区（支持划选 AI 伴读内容进行二次解读/翻译） */}
          <div
            onMouseUp={handleMouseUp}
            className="flex-1 overflow-y-auto p-5 text-sm leading-relaxed text-zinc-800 select-text cursor-text selection:bg-purple-200 selection:text-purple-900"
          >
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
                  {mode === 'overall' ? '全局综合摘要' : mode === 'outline' ? '思维大纲' : '核心关键知识点'}
                </p>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none prose-zinc select-text cursor-text">
                <ReactMarkdown>{summaries[mode]}</ReactMarkdown>
                {generating && (
                  <span className="inline-block w-1.5 h-4 ml-1 bg-purple-500 animate-pulse rounded-full align-middle" />
                )}
              </div>
            )}
          </div>

        </aside>

      </div>

      {/* 划词悬浮 iOS 胶囊工具栏 (Highlight Floating Action Tooltip) */}
      {tooltip.show && (
        <div
          id="zhiyue-highlight-tooltip"
          style={{ top: tooltip.y, left: tooltip.x }}
          className="fixed z-50 flex items-center bg-zinc-900/90 text-white backdrop-blur-md px-2 py-1.5 rounded-full shadow-2xl border border-white/10 space-x-1 animate-fade-in"
        >
          <button
            onClick={() => triggerInlineAction('explain')}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs hover:bg-white/15 active:scale-95 transition-all text-amber-300 font-medium"
            title="深度解读通俗化"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span>解读</span>
          </button>

          <span className="w-px h-3 bg-white/20" />

          <button
            onClick={() => triggerInlineAction('translate')}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs hover:bg-white/15 active:scale-95 transition-all text-blue-300 font-medium"
            title={`点击翻译选中文本 (默认 ${TRANSLATE_LANGUAGES.find((l) => l.code === translateLang)?.label || '目标语言'})`}
          >
            <Languages className="w-3.5 h-3.5" />
            <span>翻译</span>
            <span className="text-[10px] text-blue-200/80 font-normal">
              ({TRANSLATE_LANGUAGES.find((l) => l.code === translateLang)?.flag || '🇬🇧'})
            </span>
          </button>

          <span className="w-px h-3 bg-white/20" />

          <button
            onClick={() => triggerInlineAction('summarize')}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs hover:bg-white/15 active:scale-95 transition-all text-emerald-300 font-medium"
            title="一句话核心提要"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>要点</span>
          </button>

          <span className="w-px h-3 bg-white/20" />

          <button
            onClick={handleCopySelection}
            className="p-1 rounded-full hover:bg-white/15 active:scale-90 transition-all text-zinc-300"
            title="复制选中文本"
          >
            {copiedHighlight ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* 划词 AI 解答浮窗抽屉 (iOS Modal / Floating Card - 支持自由拖拽移动) */}
      {inlineResult.show && (
        <div
          id="zhiyue-inline-card"
          style={{ left: `${cardPos.x}px`, top: `${cardPos.y}px` }}
          className="fixed z-50 w-[420px] max-w-[calc(100vw-32px)] bg-white/95 backdrop-blur-2xl rounded-3xl p-5 shadow-2xl border border-black/[0.08] animate-fade-in space-y-3"
        >
          {/* 顶部可拖拽操作栏 */}
          <div
            onMouseDown={handleCardDragStart}
            className="flex items-center justify-between pb-2 border-b border-zinc-100 cursor-grab active:cursor-grabbing select-none"
            title="按住此处可自由拖拽位置"
          >
            <div className="flex items-center space-x-2 text-xs font-bold text-zinc-800">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span>{inlineResult.title}</span>
            </div>

            {/* 若当前为翻译动作，在顶栏提供极速切换目标语言的 iOS 气泡下拉菜单 */}
            {inlineResult.action === 'translate' && (
              <div id="zhiyue-lang-selector-container" className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setLangDropdownOpen((prev) => !prev)
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="flex items-center space-x-1.5 bg-blue-50/90 hover:bg-blue-100/90 border border-blue-200/80 px-2.5 py-1 rounded-full text-xs font-semibold text-blue-700 shadow-2xs active:scale-95 transition-all cursor-pointer"
                  title="点击切换翻译目标语言"
                >
                  <Languages className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-[11px] text-blue-500 font-normal">译为:</span>
                  <span className="text-xs font-bold text-blue-900">
                    {TRANSLATE_LANGUAGES.find((l) => l.code === (inlineResult.targetLang || translateLang))?.flag}{' '}
                    {TRANSLATE_LANGUAGES.find((l) => l.code === (inlineResult.targetLang || translateLang))?.label}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-blue-500 transition-transform duration-200 ${langDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* iOS 风格语言下拉选择气泡菜单 */}
                {langDropdownOpen && (
                  <div
                    id="zhiyue-lang-menu"
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute left-0 top-full mt-1.5 w-44 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-xl border border-black/[0.08] p-1.5 z-50 animate-fade-in space-y-0.5"
                  >
                    {TRANSLATE_LANGUAGES.map((item) => {
                      const isSelected = item.code === (inlineResult.targetLang || translateLang)
                      return (
                        <button
                          key={item.code}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setTranslateLang(item.code)
                            setLangDropdownOpen(false)
                            triggerInlineAction('translate', item.code, inlineResult.selectedText)
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-all ${
                            isSelected
                              ? 'bg-blue-50 text-blue-700 font-bold'
                              : 'text-zinc-700 hover:bg-zinc-100 font-medium'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <span>{item.flag}</span>
                            <span>{item.label}</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 拖拽指示条 */}
            <div className="flex items-center space-x-1 text-zinc-300 hover:text-zinc-500 transition-colors">
              <GripHorizontal className="w-4 h-4" />
            </div>

            {/* 右侧操作按钮组：复制结果 & 关闭 */}
            <div className="flex items-center space-x-1.5">
              <button
                onClick={handleCopyResult}
                className="w-6 h-6 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-500 active:scale-90 transition-all"
                title="复制 AI 解答内容"
              >
                {copiedResult ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setInlineResult((prev) => ({ ...prev, show: false }))}
                className="w-6 h-6 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-500 active:scale-90 transition-all"
                title="关闭浮窗"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="text-xs text-zinc-700 leading-relaxed max-h-80 overflow-y-auto font-sans prose prose-xs select-text cursor-text">
            {inlineResult.content ? (
              <ReactMarkdown>{inlineResult.content}</ReactMarkdown>
            ) : (
              <div className="flex items-center space-x-2 text-zinc-400 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                <span>AI 导师正在深入解读选中文段...</span>
              </div>
            )}
            {inlineResult.isStreaming && (
              <span className="inline-block w-1.5 h-3 ml-1 bg-purple-500 animate-pulse rounded-full align-middle" />
            )}
          </div>
        </div>
      )}

    </div>
  )
}
