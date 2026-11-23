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
  Bookmark,
  Trash2,
  Download,
  Type,
  Search,
} from 'lucide-react'
import { useDocStore } from '../stores/docStore'
import { NoApiKeyNotice } from '../components/NoApiKeyNotice'

type SummaryMode = 'overall' | 'outline' | 'keypoints' | 'notes'
type ReadViewMode = 'extracted' | 'native'
export type HighlightColor = 'yellow' | 'green' | 'purple' | 'blue'

export type ReaderTheme = 'white' | 'sepia' | 'dark'
export type ReaderFontSize = 'sm' | 'base' | 'lg' | 'xl'
export type ReaderLineHeight = 'normal' | 'relaxed' | 'loose'
export type ReaderFontFamily = 'sans' | 'serif'

export interface ReaderAppearance {
  theme: ReaderTheme
  fontSize: ReaderFontSize
  lineHeight: ReaderLineHeight
  fontFamily: ReaderFontFamily
}

export interface TocItem {
  id: string
  title: string
  level: number
  page_index: number
  page_number: number
}

export interface AnnotationItem {
  id: string
  document_id: string
  page_index: number
  selected_text: string
  color: HighlightColor
  note?: string | null
  ai_insight?: string | null
  created_at?: string
}

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
  last_read_page?: number
  last_read_at?: string | null
  toc?: TocItem[]
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
  { id: 'notes', label: '划线笔记', icon: <Bookmark className="w-3.5 h-3.5" /> },
]

export const ReaderPage: React.FC<{ backendUrl?: string }> = ({ backendUrl: propUrl }) => {
  const storeUrl = useDocStore((s) => s.backendUrl)
  const backendUrl = propUrl || storeUrl || ''

  const { documents, fetchDocuments, llmConfig, fetchLlmConfig } = useDocStore()
  const targetDocId = useDocStore((s) => s.targetDocId)
  const targetPageIdx = useDocStore((s) => s.targetPageIdx)
  const targetHighlightText = useDocStore((s) => s.targetHighlightText)
  const clearTargetReaderDoc = useDocStore((s) => s.clearTargetReaderDoc)

  const isLlmUnconfigured = !llmConfig?.is_configured && llmConfig?.provider !== 'ollama'
  const isUnconfiguredError = (errText?: string | null) => {
    if (!errText) return false
    const lower = errText.toLowerCase()
    return (
      lower.includes('未配置') ||
      lower.includes('not configured') ||
      lower.includes('api key') ||
      lower.includes('401') ||
      lower.includes('authentication')
    )
  }

  const [selectedDocId, setSelectedDocId] = useState<string>('')
  const [docContent, setDocContent] = useState<DocContent | null>(null)
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [currentPageIdx, setCurrentPageIdx] = useState<number>(0)
  const [loadingContent, setLoadingContent] = useState(false)

  // 划线与批注笔记状态
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([])
  const [activeAnnotation, setActiveAnnotation] = useState<AnnotationItem | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [savedAiToNote, setSavedAiToNote] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2800)
  }

  // Apple Books 沉浸式排版与阅读主题
  const DEFAULT_APPEARANCE: ReaderAppearance = {
    theme: 'white',
    fontSize: 'base',
    lineHeight: 'relaxed',
    fontFamily: 'sans',
  }

  const [appearance, setAppearance] = useState<ReaderAppearance>(() => {
    try {
      const saved = localStorage.getItem('zhiyue_reader_appearance')
      if (saved) return { ...DEFAULT_APPEARANCE, ...JSON.parse(saved) }
    } catch {}
    return DEFAULT_APPEARANCE
  })
  const [showAppearanceMenu, setShowAppearanceMenu] = useState(false)

  const updateAppearance = (updates: Partial<ReaderAppearance>) => {
    setAppearance((prev) => {
      const next = { ...prev, ...updates }
      try {
        localStorage.setItem('zhiyue_reader_appearance', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // 目录大纲抽屉状态与搜索及层级折叠
  const [showTocDrawer, setShowTocDrawer] = useState(false)
  const [tocSearchQuery, setTocSearchQuery] = useState('')
  const [collapsedChapterIds, setCollapsedChapterIds] = useState<Set<string>>(new Set())

  const toggleChapterCollapse = (chapterId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCollapsedChapterIds((prev) => {
      const next = new Set(prev)
      if (next.has(chapterId)) {
        next.delete(chapterId)
      } else {
        next.add(chapterId)
      }
      return next
    })
  }

  const toggleCollapseAll = () => {
    const l1Items = (docContent?.toc || []).filter((item) => item.level === 1)
    if (collapsedChapterIds.size > 0) {
      setCollapsedChapterIds(new Set())
    } else {
      setCollapsedChapterIds(new Set(l1Items.map((item) => item.id)))
    }
  }

  // 加载当前文档的高亮划线与批注
  const loadAnnotations = async (docId: string) => {
    if (!docId || !backendUrl) return
    try {
      const resp = await fetch(`${backendUrl}/api/v1/reader/${docId}/annotations`)
      if (resp.ok) {
        const data = await resp.json()
        setAnnotations(data)
      }
    } catch (e) {
      console.warn('加载批注失败', e)
    }
  }

  useEffect(() => {
    if (selectedDocId) {
      loadAnnotations(selectedDocId)
    }
  }, [selectedDocId, backendUrl])

  // 监听来自 Spotlight 全局搜索的指定文档与页码跳转
  useEffect(() => {
    if (targetDocId) {
      setSelectedDocId(targetDocId)
      setCurrentPageIdx(targetPageIdx || 0)
      clearTargetReaderDoc()
    }
  }, [targetDocId, targetPageIdx, clearTargetReaderDoc])

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
    fetchLlmConfig()
  }, [fetchDocuments, fetchLlmConfig])

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
      setSummaries({})
      setStreamError(null)
      setTooltip((prev) => ({ ...prev, show: false }))

      try {
        // 1. 获取正文分页、目录大纲与阅读进度
        const res = await fetch(`${backendUrl}/api/v1/reader/${selectedDocId}/content`)
        if (res.ok) {
          const data: DocContent = await res.json()
          setDocContent(data)

          // 自动记忆阅读进度恢复
          if (targetPageIdx > 0) {
            setCurrentPageIdx(targetPageIdx)
          } else if (typeof data.last_read_page === 'number' && data.last_read_page > 0) {
            const total = data.pages?.length || 1
            const restored = Math.min(data.last_read_page, Math.max(0, total - 1))
            setCurrentPageIdx(restored)
            showToast(`📖 已自动恢复上次阅读进度 (第 ${restored + 1} 页)`)
          } else {
            setCurrentPageIdx(0)
          }
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

  // 自动持久化阅读进度（防抖 600ms）
  useEffect(() => {
    if (!selectedDocId || !backendUrl || loadingContent) return
    const timer = setTimeout(() => {
      fetch(`${backendUrl}/api/v1/reader/${selectedDocId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_index: currentPageIdx }),
      }).catch((e) => console.warn('自动保存阅读进度失败', e))
    }, 600)
    return () => clearTimeout(timer)
  }, [selectedDocId, currentPageIdx, backendUrl, loadingContent])

  useEffect(() => {
    leftContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentPageIdx])

  // 点击外部自动收起划词气泡与排版菜单（但点击气泡本身或结果卡片内部时不收起）
  useEffect(() => {
    const handleGlobalPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      // 点击语言下拉菜单外部时自动收起下拉
      if (!target.closest('#zhiyue-lang-selector-container')) {
        setLangDropdownOpen(false)
      }
      // 点击排版与主题设置菜单外部时自动收起
      if (!target.closest('#zhiyue-appearance-menu') && !target.closest('#zhiyue-typography-btn-container')) {
        setShowAppearanceMenu(false)
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

  // 1. 添加高亮划线
  const handleCreateHighlight = async (color: HighlightColor = 'yellow', customText?: string) => {
    const textToHighlight = customText || tooltip.selectedText
    if (!textToHighlight || !selectedDocId || !backendUrl) return

    try {
      const resp = await fetch(`${backendUrl}/api/v1/reader/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: selectedDocId,
          page_index: currentPageIdx,
          selected_text: textToHighlight,
          color,
        }),
      })
      if (resp.ok) {
        const data = await resp.json()
        if (data.annotation) {
          setAnnotations((prev) => [...prev, data.annotation])
          const colorName = color === 'yellow' ? '黄色' : color === 'green' ? '绿色' : color === 'purple' ? '紫色' : '蓝色'
          showToast(`已添加${colorName}高亮划线`)
        }
      }
    } catch (e) {
      console.error('保存高亮失败', e)
    } finally {
      setTooltip((prev) => ({ ...prev, show: false }))
      window.getSelection()?.removeAllRanges()
    }
  }

  // 2. 将 AI 解读/翻译收录至读书笔记
  const handleSaveAiInsightToNotes = async () => {
    if (!inlineResult.selectedText || !inlineResult.content || !selectedDocId || !backendUrl) return
    setSavedAiToNote(true)
    try {
      const resp = await fetch(`${backendUrl}/api/v1/reader/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: selectedDocId,
          page_index: currentPageIdx,
          selected_text: inlineResult.selectedText,
          color: 'purple',
          ai_insight: `【${inlineResult.title}】\n${inlineResult.content}`,
        }),
      })
      if (resp.ok) {
        const data = await resp.json()
        if (data.annotation) {
          setAnnotations((prev) => [...prev, data.annotation])
          showToast('已收录至读书笔记本')
        }
      }
    } catch (e) {
      console.error('收录笔记失败', e)
    }
  }

  // 3. 修改批注笔记
  const handleUpdateAnnotationNote = async () => {
    if (!activeAnnotation || !backendUrl) return
    setSavingNote(true)
    try {
      const resp = await fetch(`${backendUrl}/api/v1/reader/annotations/${activeAnnotation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: editingNoteText,
          color: activeAnnotation.color,
        }),
      })
      if (resp.ok) {
        setAnnotations((prev) =>
          prev.map((a) => (a.id === activeAnnotation.id ? { ...a, note: editingNoteText, color: activeAnnotation.color } : a))
        )
        setActiveAnnotation((prev) => (prev ? { ...prev, note: editingNoteText } : null))
        showToast('批注笔记已保存')
      }
    } catch (e) {
      console.error('更新笔记失败', e)
    } finally {
      setSavingNote(false)
    }
  }

  // 4. 删除高亮划线
  const handleDeleteAnnotation = async (annoId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!backendUrl) return
    try {
      const resp = await fetch(`${backendUrl}/api/v1/reader/annotations/${annoId}`, {
        method: 'DELETE',
      })
      if (resp.ok) {
        setAnnotations((prev) => prev.filter((a) => a.id !== annoId))
        if (activeAnnotation?.id === annoId) {
          setActiveAnnotation(null)
        }
        showToast('已删除高亮')
      }
    } catch (e) {
      console.error('删除高亮失败', e)
    }
  }

  // 5. 导出读书笔记本
  const handleExportAnnotations = async () => {
    if (!selectedDocId || !backendUrl) return
    try {
      const resp = await fetch(`${backendUrl}/api/v1/reader/${selectedDocId}/annotations/export`)
      if (resp.ok) {
        const data = await resp.json()
        const blob = new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${data.name}_读书笔记本.md`
        link.click()
        URL.revokeObjectURL(url)
        showToast('已导出读书笔记本')
      }
    } catch (e) {
      console.error('导出笔记失败', e)
    }
  }

  // 6. 渲染正文划线高亮与跳转闪烁
  const renderArticleText = (content: string) => {
    const pageAnnotations = annotations.filter((a) => a.page_index === currentPageIdx)
    if (pageAnnotations.length === 0 && !targetHighlightText) {
      return content
    }

    const targets: { text: string; anno?: AnnotationItem; isTarget?: boolean }[] = []

    if (targetHighlightText && content.includes(targetHighlightText)) {
      targets.push({ text: targetHighlightText, isTarget: true })
    }

    pageAnnotations.forEach((a) => {
      if (a.selected_text && content.includes(a.selected_text)) {
        targets.push({ text: a.selected_text, anno: a })
      }
    })

    if (targets.length === 0) return content

    targets.sort((a, b) => b.text.length - a.text.length)

    const escapeRegex = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const pattern = new RegExp(`(${targets.map((t) => escapeRegex(t.text)).join('|')})`, 'g')

    const parts = content.split(pattern)
    return parts.map((part, idx) => {
      const matched = targets.find((t) => t.text === part)
      if (matched) {
        if (matched.isTarget) {
          return (
            <mark
              key={`target_${idx}`}
              className="bg-amber-300 text-zinc-900 px-1 py-0.5 rounded-sm font-semibold shadow-xs ring-4 ring-amber-400/60 animate-pulse inline-block"
              title="📌 AI 问答引用来源段落"
            >
              {part}
            </mark>
          )
        }

        if (matched.anno) {
          const colorCls = {
            yellow: 'bg-amber-200/80 border-b-2 border-amber-400 hover:bg-amber-300',
            green: 'bg-emerald-200/80 border-b-2 border-emerald-400 hover:bg-emerald-300',
            purple: 'bg-purple-200/80 border-b-2 border-purple-400 hover:bg-purple-300',
            blue: 'bg-blue-200/80 border-b-2 border-blue-400 hover:bg-blue-300',
          }[matched.anno.color] || 'bg-amber-200/80 border-b-2 border-amber-400'

          return (
            <mark
              key={`anno_${matched.anno.id}_${idx}`}
              onClick={(e) => {
                e.stopPropagation()
                setActiveAnnotation(matched.anno || null)
                setEditingNoteText(matched.anno?.note || '')
              }}
              className={`${colorCls} text-zinc-900 px-0.5 rounded-xs font-normal cursor-pointer transition-colors selection:bg-purple-300`}
              title={matched.anno.note ? `✍️ 批注: ${matched.anno.note}` : '点击查看/编辑此划线'}
            >
              {part}
            </mark>
          )
        }
      }
      return part
    })
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

    if (isLlmUnconfigured) {
      setInlineResult({
        show: true,
        title: titleMap[action],
        action,
        selectedText: textToUse,
        targetLang: targetLangCode,
        content: '未配置大模型 API Key',
        isStreaming: false,
      })
      setTooltip((prev) => ({ ...prev, show: false }))
      return
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

  // 当前正文所处的大纲章节高亮识别
  const activeTocId = (() => {
    const list = docContent?.toc || []
    if (list.length === 0) return ''
    let cur = list[0].id
    for (const item of list) {
      if (item.page_index <= currentPageIdx) {
        cur = item.id
      } else {
        break
      }
    }
    return cur
  })()

  // 构建父子结构化大纲分组（实现主章节与子小节的清晰视觉分离与折叠）
  const chapterGroups = React.useMemo(() => {
    const rawList = docContent?.toc || []
    if (rawList.length === 0) return []

    const hasL1 = rawList.some((item) => item.level === 1)
    if (!hasL1) {
      return [{ chapter: null, children: rawList }]
    }

    const groups: { chapter: TocItem | null; children: TocItem[] }[] = []
    let currentGroup: { chapter: TocItem | null; children: TocItem[] } | null = null

    for (const item of rawList) {
      if (item.level === 1) {
        currentGroup = { chapter: item, children: [] }
        groups.push(currentGroup)
      } else {
        if (currentGroup) {
          currentGroup.children.push(item)
        } else {
          currentGroup = { chapter: null, children: [item] }
          groups.push(currentGroup)
        }
      }
    }
    return groups
  }, [docContent?.toc])

  // 大纲搜索过滤
  const filteredToc = (docContent?.toc || []).filter((item) =>
    tocSearchQuery ? item.title.toLowerCase().includes(tocSearchQuery.toLowerCase()) : true
  )

  // Apple Books 全工作区沉浸式主题与排版样式
  const themeStyles = {
    white: {
      pageBg: 'bg-[#F2F2F7]',
      header: 'bg-white/80 border-black/[0.04]',
      headerSelect: 'bg-zinc-100 hover:bg-zinc-200/60 text-zinc-800',
      headerBtn: 'bg-zinc-100 hover:bg-zinc-200/70 text-zinc-700',
      viewTrack: 'bg-zinc-200/70',
      viewActive: 'bg-white text-zinc-900 shadow-sm',
      viewInactive: 'text-zinc-500 hover:text-zinc-800',
      // 正文阅读卡片
      container: 'bg-white border-black/[0.04]',
      headerSection: 'bg-white/80 border-zinc-100 text-zinc-500',
      headerTitle: 'text-zinc-800',
      article: 'text-zinc-800',
      selection: 'selection:bg-purple-100 selection:text-purple-900',
      footerBorder: 'border-zinc-100',
      prevBtn: 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700',
      nextBtn: 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs',
      pageInfo: 'text-zinc-700',
      subInfo: 'text-zinc-400',
      // 目录大纲抽屉
      tocContainer: 'bg-white border-black/[0.04]',
      tocHeader: 'bg-[#F2F2F7]/50 border-zinc-100 text-zinc-800',
      tocSearchBg: 'bg-zinc-100 hover:bg-zinc-200/50 focus:bg-white text-zinc-800 placeholder-zinc-400',
      tocItemInactive: 'text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-900',
      tocItemActive: 'bg-purple-100/70 text-purple-800',
      tocBadgeInactive: 'text-zinc-400 group-hover:text-zinc-600 bg-zinc-100/70',
      tocBadgeActive: 'bg-purple-200 text-purple-900',
      tocSubText: 'text-zinc-400',
      // AI 伴读分析面板
      asideContainer: 'bg-white border-black/[0.04]',
      asideHeader: 'bg-[#F2F2F7]/50 border-zinc-100',
      asideTitle: 'text-zinc-800',
      asideTabTrack: 'bg-zinc-200/70',
      asideTabActive: 'bg-white text-zinc-900 shadow-sm',
      asideTabInactive: 'text-zinc-500 hover:text-zinc-800',
      asideContent: 'text-zinc-800 selection:bg-purple-200 selection:text-purple-900',
      asideMarkdown: 'prose-zinc text-zinc-800',
      asideDivider: 'border-zinc-100 text-zinc-700',
      asideNoteCard: 'bg-[#F2F2F7]/60 hover:bg-[#F2F2F7] border-black/[0.04]',
      asideNoteText: 'text-zinc-800 hover:text-purple-700',
      asideNoteInner: 'bg-white/80 text-zinc-600 border-black/[0.03]',
      asideEmptyIcon: 'bg-zinc-100 text-zinc-400',
      asideEmptyText: 'text-zinc-400',
      // 浮窗与批注弹窗
      modalContainer: 'bg-white/95 border-black/[0.08] text-zinc-800',
      modalHeader: 'border-zinc-100 text-zinc-800',
      modalInput: 'bg-[#F2F2F7] border-black/[0.04] text-zinc-800 placeholder:text-zinc-400',
      modalQuote: 'bg-[#F2F2F7] text-zinc-700',
      modalBtn: 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600',
      modalCancelBtn: 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100',
    },
    sepia: {
      pageBg: 'bg-[#F3ECE0]',
      header: 'bg-[#FAF4E8]/90 border-[#E8DEC8]',
      headerSelect: 'bg-[#EFE5D3] hover:bg-[#E5DAC6] text-[#3D3024]',
      headerBtn: 'bg-[#EFE5D3] hover:bg-[#E5DAC6] text-[#4F3F30]',
      viewTrack: 'bg-[#EAE0CE]',
      viewActive: 'bg-[#FAF4E8] text-[#3D3024] shadow-sm',
      viewInactive: 'text-[#8C7A6B] hover:text-[#3D3024]',
      // 正文阅读卡片
      container: 'bg-[#FAF4E8] border-[#E8DEC8]',
      headerSection: 'bg-[#FAF4E8]/90 border-[#EBE1D0] text-[#74614E]',
      headerTitle: 'text-[#3D3024]',
      article: 'text-[#3D3024]',
      selection: 'selection:bg-[#E2CEB3] selection:text-[#2D2115]',
      footerBorder: 'border-[#EBE1D0]',
      prevBtn: 'bg-[#EFE5D3] hover:bg-[#E5DAC6] text-[#4F3F30]',
      nextBtn: 'bg-[#965A2C] hover:bg-[#834E25] text-white shadow-xs',
      pageInfo: 'text-[#4F3F30]',
      subInfo: 'text-[#8C7A6B]',
      // 目录大纲抽屉
      tocContainer: 'bg-[#FAF4E8] border-[#E8DEC8]',
      tocHeader: 'bg-[#F3ECE0]/80 border-[#EBE1D0] text-[#3D3024]',
      tocSearchBg: 'bg-[#EFE5D3] hover:bg-[#E5DAC6] focus:bg-[#FAF4E8] text-[#3D3024] placeholder-[#8C7A6B]',
      tocItemInactive: 'text-[#74614E] hover:bg-[#EFE5D3]/80 hover:text-[#3D3024]',
      tocItemActive: 'bg-[#E6D7BF] text-[#7A4518]',
      tocBadgeInactive: 'text-[#8C7A6B] group-hover:text-[#4F3F30] bg-[#EFE5D3]/70',
      tocBadgeActive: 'bg-[#D8C2A0] text-[#5A3110]',
      tocSubText: 'text-[#8C7A6B]',
      // AI 伴读分析面板
      asideContainer: 'bg-[#FAF4E8] border-[#E8DEC8]',
      asideHeader: 'bg-[#F3ECE0]/80 border-[#EBE1D0]',
      asideTitle: 'text-[#3D3024]',
      asideTabTrack: 'bg-[#EAE0CE]',
      asideTabActive: 'bg-[#FAF4E8] text-[#3D3024] shadow-sm',
      asideTabInactive: 'text-[#8C7A6B] hover:text-[#3D3024]',
      asideContent: 'text-[#3D3024] selection:bg-[#E2CEB3] selection:text-[#2D2115]',
      asideMarkdown: 'prose-amber text-[#3D3024]',
      asideDivider: 'border-[#EBE1D0] text-[#4F3F30]',
      asideNoteCard: 'bg-[#F3ECE0]/70 hover:bg-[#F3ECE0] border-[#E8DEC8]',
      asideNoteText: 'text-[#3D3024] hover:text-[#965A2C]',
      asideNoteInner: 'bg-[#FAF4E8]/90 text-[#5B4126] border-[#E8DEC8]',
      asideEmptyIcon: 'bg-[#EFE5D3] text-[#8C7A6B]',
      asideEmptyText: 'text-[#8C7A6B]',
      // 浮窗与批注弹窗
      modalContainer: 'bg-[#FAF4E8]/98 border-[#E8DEC8] text-[#3D3024]',
      modalHeader: 'border-[#EBE1D0] text-[#3D3024]',
      modalInput: 'bg-[#EFE5D3] border-[#E8DEC8] text-[#3D3024] placeholder-[#8C7A6B]',
      modalQuote: 'bg-[#F3ECE0] text-[#5B4126]',
      modalBtn: 'bg-[#EFE5D3] hover:bg-[#E5DAC6] text-[#4F3F30]',
      modalCancelBtn: 'text-[#74614E] hover:text-[#3D3024] hover:bg-[#EFE5D3]',
    },
    dark: {
      pageBg: 'bg-[#121214]',
      header: 'bg-[#1C1C1E]/90 border-white/[0.08]',
      headerSelect: 'bg-[#2C2C2E] hover:bg-[#3A3A3C] text-[#E5E5EA]',
      headerBtn: 'bg-[#2C2C2E] hover:bg-[#3A3A3C] text-[#E5E5EA]',
      viewTrack: 'bg-[#2C2C2E]',
      viewActive: 'bg-[#3A3A3C] text-white shadow-sm',
      viewInactive: 'text-[#8E8E93] hover:text-zinc-200',
      // 正文阅读卡片
      container: 'bg-[#1C1C1E] border-white/[0.08]',
      headerSection: 'bg-[#1C1C1E]/90 border-white/[0.08] text-[#8E8E93]',
      sectionHeaderTitle: 'text-[#E5E5EA]',
      article: 'text-[#E5E5EA]',
      selection: 'selection:bg-[#3A3A3C] selection:text-white',
      footerBorder: 'border-white/[0.08]',
      prevBtn: 'bg-[#2C2C2E] hover:bg-[#3A3A3C] text-[#E5E5EA]',
      nextBtn: 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs',
      pageInfo: 'text-[#E5E5EA]',
      subInfo: 'text-[#8E8E93]',
      // 目录大纲抽屉
      tocContainer: 'bg-[#1C1C1E] border-white/[0.08]',
      tocHeader: 'bg-[#242426]/80 border-white/[0.08] text-[#E5E5EA]',
      tocSearchBg: 'bg-[#2C2C2E] hover:bg-[#3A3A3C] focus:bg-[#1C1C1E] text-[#E5E5EA] placeholder-zinc-500',
      tocItemInactive: 'text-[#8E8E93] hover:bg-[#2C2C2E]/80 hover:text-[#E5E5EA]',
      tocItemActive: 'bg-purple-950/70 text-purple-200',
      tocBadgeInactive: 'text-zinc-500 group-hover:text-zinc-300 bg-[#2C2C2E]/70',
      tocBadgeActive: 'bg-purple-900 text-purple-100',
      tocSubText: 'text-[#8E8E93]',
      // AI 伴读分析面板
      asideContainer: 'bg-[#1C1C1E] border-white/[0.08]',
      asideHeader: 'bg-[#242426]/80 border-white/[0.08]',
      asideTitle: 'text-[#E5E5EA]',
      asideTabTrack: 'bg-[#2C2C2E]',
      asideTabActive: 'bg-[#3A3A3C] text-white shadow-sm',
      asideTabInactive: 'text-[#8E8E93] hover:text-zinc-200',
      asideContent: 'text-[#E5E5EA] selection:bg-[#3A3A3C] selection:text-white',
      asideMarkdown: 'prose-invert text-[#E5E5EA]',
      asideDivider: 'border-white/[0.08] text-[#E5E5EA]',
      asideNoteCard: 'bg-[#242426]/70 hover:bg-[#2C2C2E] border-white/[0.06]',
      asideNoteText: 'text-[#E5E5EA] hover:text-purple-400',
      asideNoteInner: 'bg-[#1C1C1E]/80 text-[#C7C7CC] border-white/[0.04]',
      asideEmptyIcon: 'bg-[#2C2C2E] text-[#8E8E93]',
      asideEmptyText: 'text-[#8E8E93]',
      // 浮窗与批注弹窗
      modalContainer: 'bg-[#1C1C1E]/95 border-white/[0.1] text-[#E5E5EA]',
      modalHeader: 'border-white/[0.08] text-[#E5E5EA]',
      modalInput: 'bg-[#2C2C2E] border-white/[0.08] text-[#E5E5EA] placeholder-zinc-500',
      modalQuote: 'bg-[#242426] text-[#C7C7CC]',
      modalBtn: 'bg-[#2C2C2E] hover:bg-[#3A3A3C] text-[#E5E5EA]',
      modalCancelBtn: 'text-[#8E8E93] hover:text-[#E5E5EA] hover:bg-[#2C2C2E]',
    },
  }[appearance.theme]

  const fontSizeClass = {
    sm: 'text-[14px]',
    base: 'text-[16px]',
    lg: 'text-[18px]',
    xl: 'text-[20px]',
  }[appearance.fontSize]

  const lineHeightClass = {
    normal: 'leading-[1.65]',
    relaxed: 'leading-[1.9]',
    loose: 'leading-[2.2]',
  }[appearance.lineHeight]

  const fontFamilyClass = appearance.fontFamily === 'serif' ? 'font-serif' : 'font-sans'

  return (
    <div className={`flex-1 flex flex-col ${themeStyles.pageBg} h-screen overflow-hidden selection:bg-purple-100 relative transition-colors duration-200`}>
      
      {/* 顶部毛玻璃导航条 */}
      <header className={`h-14 backdrop-blur-xl border-b px-6 flex items-center justify-between shrink-0 z-10 transition-colors duration-200 ${themeStyles.header}`}>
        
        {/* 文档选择下拉框与目录大纲抽屉开关 */}
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-semibold text-zinc-400">阅读文档:</span>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className={`px-2.5 py-1 text-xs font-bold rounded-full focus:outline-none cursor-pointer transition-all max-w-[280px] truncate ${themeStyles.headerSelect}`}
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id} disabled={d.status !== 'indexed'}>
                  {d.name} {d.status !== 'indexed' ? `(${d.status})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 目录大纲抽屉开关按钮 */}
          {readViewMode === 'extracted' && (
            <button
              onClick={() => setShowTocDrawer((prev) => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all shadow-2xs ${
                showTocDrawer
                  ? 'bg-purple-600 text-white shadow-purple-500/20'
                  : themeStyles.headerBtn
              }`}
              title="展开/收起目录大纲树"
            >
              <ListTree className="w-3.5 h-3.5" />
              <span>目录大纲</span>
              {docContent?.toc && docContent.toc.length > 0 && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    showTocDrawer ? 'bg-white/20 text-white' : 'bg-black/10 text-current'
                  }`}
                >
                  {docContent.toc.length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* 核心双重视图切换控制器、Apple Books 排版与翻页 */}
        <div className="flex items-center space-x-3">
          {/* 排版与主题控制按钮 (Apple Books aA 风格) */}
          {readViewMode === 'extracted' && (
            <div className="relative" id="zhiyue-typography-btn-container">
              <button
                onClick={() => setShowAppearanceMenu((prev) => !prev)}
                className={`px-3 py-1.5 rounded-2xl text-xs font-semibold flex items-center space-x-1.5 transition-all border ${
                  showAppearanceMenu
                    ? 'bg-purple-50 border-purple-300 text-purple-700'
                    : themeStyles.headerBtn
                }`}
                title="阅读排版与主题设置"
              >
                <Type className="w-3.5 h-3.5 opacity-70" />
                <span className="font-serif font-bold text-xs tracking-tight">aA</span>
              </button>

              {/* 弹出式排版控制卡片 */}
              {showAppearanceMenu && (
                <div
                  id="zhiyue-appearance-menu"
                  className={`absolute right-0 top-11 w-72 backdrop-blur-2xl rounded-2xl shadow-xl border p-4 z-50 space-y-4 text-xs animate-in fade-in slide-in-from-top-2 select-none ${
                    appearance.theme === 'dark'
                      ? 'bg-[#242426]/95 border-white/[0.08] text-[#E5E5EA]'
                      : appearance.theme === 'sepia'
                      ? 'bg-[#FAF4E8]/95 border-[#E8DEC8] text-[#3D3024]'
                      : 'bg-white/95 border-black/[0.08] text-zinc-800'
                  }`}
                >
                  {/* 主题选择 */}
                  <div>
                    <div className="text-[11px] font-bold opacity-60 mb-2">阅读主题</div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => updateAppearance({ theme: 'white' })}
                        className={`p-2.5 rounded-xl border flex flex-col items-center space-y-1 transition-all ${
                          appearance.theme === 'white'
                            ? 'border-purple-500 bg-zinc-50 shadow-xs ring-1 ring-purple-500'
                            : 'border-zinc-200 hover:border-zinc-300 bg-white'
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full bg-white border border-zinc-200 shadow-2xs flex items-center justify-center">
                          {appearance.theme === 'white' && <Check className="w-3 h-3 text-purple-600" />}
                        </div>
                        <span className="text-[11px] font-semibold text-zinc-800">纯白</span>
                      </button>

                      <button
                        onClick={() => updateAppearance({ theme: 'sepia' })}
                        className={`p-2.5 rounded-xl border flex flex-col items-center space-y-1 transition-all ${
                          appearance.theme === 'sepia'
                            ? 'border-purple-500 bg-[#FAF4E8] shadow-xs ring-1 ring-purple-500'
                            : 'border-[#E8DEC8] hover:border-[#D8C7AA] bg-[#FAF4E8]'
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full bg-[#FAF4E8] border border-[#D8C7AA] shadow-2xs flex items-center justify-center">
                          {appearance.theme === 'sepia' && <Check className="w-3 h-3 text-[#965A2C]" />}
                        </div>
                        <span className="text-[11px] font-semibold text-[#5B4126]">羊皮纸</span>
                      </button>

                      <button
                        onClick={() => updateAppearance({ theme: 'dark' })}
                        className={`p-2.5 rounded-xl border flex flex-col items-center space-y-1 transition-all ${
                          appearance.theme === 'dark'
                            ? 'border-purple-500 bg-[#1C1C1E] shadow-xs ring-1 ring-purple-500'
                            : 'border-zinc-700 hover:border-zinc-600 bg-[#1C1C1E]'
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full bg-[#1C1C1E] border border-zinc-600 shadow-2xs flex items-center justify-center">
                          {appearance.theme === 'dark' && <Check className="w-3 h-3 text-purple-400" />}
                        </div>
                        <span className="text-[11px] font-semibold text-zinc-200">夜间</span>
                      </button>
                    </div>
                  </div>

                  {/* 字号大小 */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold opacity-60 mb-2">
                      <span>正文字号</span>
                      <span className="font-mono">
                        {{ sm: '小 (14px)', base: '标准 (16px)', lg: '大 (18px)', xl: '特大 (20px)' }[appearance.fontSize]}
                      </span>
                    </div>
                    <div className={`grid grid-cols-4 p-1 rounded-xl gap-1 font-semibold text-center ${
                      appearance.theme === 'dark' ? 'bg-[#1C1C1E]' : appearance.theme === 'sepia' ? 'bg-[#EAE0CE]' : 'bg-zinc-100'
                    }`}>
                      {(['sm', 'base', 'lg', 'xl'] as ReaderFontSize[]).map((size) => (
                        <button
                          key={size}
                          onClick={() => updateAppearance({ fontSize: size })}
                          className={`py-1.5 rounded-lg text-xs transition-all ${
                            appearance.fontSize === size
                              ? appearance.theme === 'dark'
                                ? 'bg-[#3A3A3C] text-white shadow-xs font-bold'
                                : appearance.theme === 'sepia'
                                ? 'bg-[#FAF4E8] text-[#3D3024] shadow-xs font-bold'
                                : 'bg-white text-zinc-900 shadow-xs font-bold'
                              : 'opacity-60 hover:opacity-100'
                          }`}
                        >
                          {{ sm: 'A-', base: '标准', lg: '大', xl: 'A+' }[size]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 字体风格 */}
                  <div>
                    <div className="text-[11px] font-bold opacity-60 mb-2">字体系列</div>
                    <div className={`grid grid-cols-2 p-1 rounded-xl gap-1 font-semibold text-center ${
                      appearance.theme === 'dark' ? 'bg-[#1C1C1E]' : appearance.theme === 'sepia' ? 'bg-[#EAE0CE]' : 'bg-zinc-100'
                    }`}>
                      <button
                        onClick={() => updateAppearance({ fontFamily: 'sans' })}
                        className={`py-1.5 rounded-lg text-xs transition-all ${
                          appearance.fontFamily === 'sans'
                            ? appearance.theme === 'dark'
                              ? 'bg-[#3A3A3C] text-white shadow-xs font-bold'
                              : appearance.theme === 'sepia'
                              ? 'bg-[#FAF4E8] text-[#3D3024] shadow-xs font-bold'
                              : 'bg-white text-zinc-900 shadow-xs font-bold'
                            : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        黑体 (无衬线)
                      </button>
                      <button
                        onClick={() => updateAppearance({ fontFamily: 'serif' })}
                        className={`py-1.5 rounded-lg text-xs font-serif transition-all ${
                          appearance.fontFamily === 'serif'
                            ? appearance.theme === 'dark'
                              ? 'bg-[#3A3A3C] text-white shadow-xs font-bold'
                              : appearance.theme === 'sepia'
                              ? 'bg-[#FAF4E8] text-[#3D3024] shadow-xs font-bold'
                              : 'bg-white text-zinc-900 shadow-xs font-bold'
                            : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        宋体 (衬线)
                      </button>
                    </div>
                  </div>

                  {/* 行间距 */}
                  <div>
                    <div className="text-[11px] font-bold opacity-60 mb-2">段落行距</div>
                    <div className={`grid grid-cols-3 p-1 rounded-xl gap-1 font-semibold text-center ${
                      appearance.theme === 'dark' ? 'bg-[#1C1C1E]' : appearance.theme === 'sepia' ? 'bg-[#EAE0CE]' : 'bg-zinc-100'
                    }`}>
                      {(['normal', 'relaxed', 'loose'] as ReaderLineHeight[]).map((lh) => (
                        <button
                          key={lh}
                          onClick={() => updateAppearance({ lineHeight: lh })}
                          className={`py-1.5 rounded-lg text-xs transition-all ${
                            appearance.lineHeight === lh
                              ? appearance.theme === 'dark'
                                ? 'bg-[#3A3A3C] text-white shadow-xs font-bold'
                                : appearance.theme === 'sepia'
                                ? 'bg-[#FAF4E8] text-[#3D3024] shadow-xs font-bold'
                                : 'bg-white text-zinc-900 shadow-xs font-bold'
                              : 'opacity-60 hover:opacity-100'
                          }`}
                        >
                          {{ normal: '紧凑', relaxed: '舒适', loose: '宽松' }[lh]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 核心双重视图切换控制器 (精读排版 vs 原版版式) */}
          <div className={`flex items-center p-1 rounded-2xl gap-1 text-xs font-semibold ${themeStyles.viewTrack}`}>
            <button
              onClick={() => setReadViewMode('extracted')}
              className={`flex items-center space-x-1 px-3 py-1 rounded-xl transition-all ${
                readViewMode === 'extracted'
                  ? themeStyles.viewActive
                  : themeStyles.viewInactive
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              <span>精读排版</span>
            </button>

            <button
              onClick={() => setReadViewMode('native')}
              className={`flex items-center space-x-1 px-3 py-1 rounded-xl transition-all ${
                readViewMode === 'native'
                  ? themeStyles.viewActive
                  : themeStyles.viewInactive
              }`}
            >
              <FileSearch className="w-3.5 h-3.5 text-blue-500" />
              <span>原版图文对照</span>
            </button>
          </div>

          {/* 翻页器（仅在精读排版模式下显示） */}
          {readViewMode === 'extracted' && totalPages > 0 && (
            <div className="flex items-center space-x-2">
              <div className={`flex items-center p-0.5 rounded-full border shadow-2xs ${themeStyles.headerBtn}`}>
                <button
                  onClick={() => setCurrentPageIdx((p) => Math.max(0, p - 1))}
                  disabled={currentPageIdx <= 0}
                  className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none active:scale-90 transition-all opacity-80 hover:opacity-100"
                  title="上一页"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className={`px-2.5 text-xs font-mono font-semibold select-none ${themeStyles.pageInfo}`}>
                  {currentPageIdx + 1} / {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPageIdx((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPageIdx >= totalPages - 1}
                  className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none active:scale-90 transition-all opacity-80 hover:opacity-100"
                  title="下一页"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

      </header>

      {/* 核心工作区 */}
      <div className="flex-1 flex overflow-hidden p-5 gap-5">

        {/* 目录大纲抽屉 (当展开时呈现为优雅的左侧大纲树) */}
        {showTocDrawer && readViewMode === 'extracted' && (
          <aside className={`w-80 ${themeStyles.tocContainer} rounded-3xl shadow-sm border flex flex-col overflow-hidden shrink-0 transition-all duration-300`}>
            {/* 顶栏 */}
            <div className={`p-3.5 border-b flex items-center justify-between ${themeStyles.tocHeader}`}>
              <div className="flex items-center space-x-1.5 text-xs font-bold">
                <ListTree className="w-3.5 h-3.5 text-purple-600" />
                <span>目录大纲</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 opacity-70">
                  {docContent?.toc?.filter((i) => i.level === 1).length
                    ? `${docContent.toc.filter((i) => i.level === 1).length} 章 · ${docContent.toc.length} 节`
                    : `${docContent?.toc?.length || 0} 节`}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                {chapterGroups.some((g) => g.children.length > 0) && (
                  <button
                    onClick={toggleCollapseAll}
                    className="text-[11px] px-2 py-0.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-70 hover:opacity-100"
                    title={collapsedChapterIds.size > 0 ? '展开所有子小节' : '折叠所有子小节'}
                  >
                    {collapsedChapterIds.size > 0 ? '全部展开' : '全部折叠'}
                  </button>
                )}
                <button
                  onClick={() => setShowTocDrawer(false)}
                  className="w-6 h-6 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center opacity-60 hover:opacity-100 transition-all"
                  title="收起大纲"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 搜索框 */}
            {docContent?.toc && docContent.toc.length > 5 && (
              <div className="p-2.5 border-b border-black/[0.04]">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 opacity-40 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={tocSearchQuery}
                    onChange={(e) => setTocSearchQuery(e.target.value)}
                    placeholder="搜索目录标题..."
                    className={`w-full pl-8 pr-3 py-1.5 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-all ${themeStyles.tocSearchBg}`}
                  />
                </div>
              </div>
            )}

            {/* 大纲列表 */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
              {!docContent?.toc || docContent.toc.length === 0 ? (
                <div className={`p-6 text-center text-xs space-y-2 ${themeStyles.tocSubText}`}>
                  <p>该文档未检测到结构化目录</p>
                  <p className="text-[11px] opacity-80">
                    可点击右侧 AI 伴读中的「思维大纲」生成全局结构树
                  </p>
                </div>
              ) : tocSearchQuery ? (
                filteredToc.length === 0 ? (
                  <div className={`p-6 text-center text-xs ${themeStyles.tocSubText}`}>
                    <p>无匹配章节</p>
                  </div>
                ) : (
                  filteredToc.map((item) => {
                    const isActive = item.id === activeTocId
                    const indentPx = Math.max(8, item.level * 12)
                    return (
                      <button
                        key={item.id}
                        onClick={() => setCurrentPageIdx(item.page_index)}
                        style={{ paddingLeft: `${indentPx}px` }}
                        className={`w-full text-left py-2 pr-2.5 rounded-xl text-xs transition-all flex items-center justify-between group ${
                          isActive
                            ? themeStyles.tocItemActive + ' font-bold shadow-2xs'
                            : themeStyles.tocItemInactive + ' font-normal'
                        }`}
                      >
                        <span className="truncate pr-2">{item.title}</span>
                        <span
                          className={`text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded-md ${
                            isActive
                              ? themeStyles.tocBadgeActive + ' font-semibold'
                              : themeStyles.tocBadgeInactive
                          }`}
                        >
                          P.{item.page_number || item.page_index + 1}
                        </span>
                      </button>
                    )
                  })
                )
              ) : (
                <div className="space-y-1">
                  {chapterGroups.map((group, groupIdx) => {
                    const chapter = group.chapter
                    const hasChildren = group.children.length > 0
                    const isCollapsed = chapter ? collapsedChapterIds.has(chapter.id) : false
                    const isChapterActive = chapter?.id === activeTocId
                    const isAnyChildActive = group.children.some((c) => c.id === activeTocId)

                    return (
                      <div
                        key={chapter ? chapter.id : `group-${groupIdx}`}
                        className={`${groupIdx > 0 ? 'pt-2 mt-1.5 border-t border-black/[0.04] dark:border-white/[0.05]' : ''}`}
                      >
                        {chapter && (
                          <div
                            onClick={() => setCurrentPageIdx(chapter.page_index)}
                            className={`w-full group cursor-pointer flex items-center justify-between py-2 px-2 rounded-xl text-xs transition-all ${
                              isChapterActive
                                ? themeStyles.tocItemActive + ' font-bold shadow-2xs'
                                : isAnyChildActive
                                ? 'bg-purple-50/50 dark:bg-purple-950/20 font-semibold text-purple-700 dark:text-purple-300'
                                : themeStyles.tocItemInactive + ' font-semibold'
                            }`}
                          >
                            <div className="flex items-center min-w-0 pr-2 space-x-1.5 flex-1">
                              {hasChildren ? (
                                <button
                                  type="button"
                                  onClick={(e) => toggleChapterCollapse(chapter.id, e)}
                                  className="w-4 h-4 rounded-md flex items-center justify-center opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 shrink-0 transition-all"
                                  title={isCollapsed ? '展开章节' : '折叠章节'}
                                >
                                  {isCollapsed ? (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500/70 shrink-0 ml-1.5 mr-1" />
                              )}
                              <span className="truncate">{chapter.title}</span>
                            </div>

                            <span
                              className={`text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded-md ${
                                isChapterActive
                                  ? themeStyles.tocBadgeActive + ' font-semibold'
                                  : themeStyles.tocBadgeInactive
                              }`}
                            >
                              P.{chapter.page_number || chapter.page_index + 1}
                            </span>
                          </div>
                        )}

                        {/* 子节树形列表 */}
                        {hasChildren && !isCollapsed && (
                          <div
                            className={`${
                              chapter ? 'ml-3 pl-2.5 my-0.5 border-l-2 border-black/[0.06] dark:border-white/[0.08]' : ''
                            } space-y-0.5`}
                          >
                            {group.children.map((child) => {
                              const isChildActive = child.id === activeTocId
                              const levelIndent = Math.max(0, (child.level - 2) * 8)
                              return (
                                <button
                                  key={child.id}
                                  onClick={() => setCurrentPageIdx(child.page_index)}
                                  style={{ paddingLeft: `${6 + levelIndent}px` }}
                                  className={`w-full text-left py-1.5 pr-2 rounded-lg text-[11.5px] transition-all flex items-center justify-between group ${
                                    isChildActive
                                      ? themeStyles.tocItemActive + ' font-bold shadow-2xs'
                                      : themeStyles.tocItemInactive + ' font-normal'
                                  }`}
                                >
                                  <div className="flex items-center min-w-0 pr-2 space-x-1.5 flex-1">
                                    <span
                                      className={`w-1 h-1 rounded-full shrink-0 ${
                                        isChildActive ? 'bg-purple-600' : 'bg-black/30 dark:bg-white/30'
                                      }`}
                                    />
                                    <span className="truncate">{child.title}</span>
                                  </div>
                                  <span
                                    className={`text-[9.5px] font-mono shrink-0 px-1 py-0.2 rounded ${
                                      isChildActive
                                        ? themeStyles.tocBadgeActive + ' font-medium'
                                        : themeStyles.tocBadgeInactive
                                    }`}
                                  >
                                    P.{child.page_number || child.page_index + 1}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </aside>
        )}
        
        {/* 阅读展示区 */}
        <section className={`flex-1 ${themeStyles.container} rounded-3xl shadow-sm border flex flex-col overflow-hidden relative transition-colors duration-200`}>
          
          {readViewMode === 'extracted' ? (
            /* 视图 A: 精读排版视图（支持划词操作与 Apple Books 护眼主题） */
            <>
              {/* 页眉元信息 */}
              <div className={`px-8 py-3.5 border-b flex items-center justify-between shrink-0 ${themeStyles.headerSection}`}>
                <div className="flex items-center space-x-2 text-xs font-semibold">
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  <span className={`truncate max-w-sm ${themeStyles.headerTitle}`}>
                    {currentPage?.section_title ? currentPage.section_title : `第 ${currentPage?.page_number || 1} 页`}
                  </span>
                </div>
                <div className="flex items-center space-x-3 text-[11px] font-mono opacity-80">
                  <span>💡 划选文本即可呼出 AI 悬浮解读</span>
                  <span>本页: {currentPage?.char_length || 0} 字</span>
                </div>
              </div>

              {/* 正文滚动区 */}
              <div
                ref={leftContentRef}
                onMouseUp={handleMouseUp}
                className={`flex-1 overflow-y-auto px-10 py-8 select-text cursor-text ${themeStyles.selection}`}
              >
                {loadingContent ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-3 text-zinc-400">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                    <span className="text-xs">正在渲染正文排版...</span>
                  </div>
                ) : !currentPage ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 text-zinc-400">
                    <div className="w-12 h-12 rounded-3xl bg-zinc-100/50 flex items-center justify-center text-zinc-400">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <p className="text-sm">暂无内容，请选择已完成解析的文档</p>
                  </div>
                ) : (
                  <>
                    <article className={`max-w-none ${themeStyles.article} ${fontFamilyClass} ${fontSizeClass} ${lineHeightClass} space-y-4 whitespace-pre-wrap font-normal select-text cursor-text`}>
                      {renderArticleText(currentPage.content)}
                    </article>

                    {/* 页面底部多章节流转导航（当文档存在多个分页时显著呈现） */}
                    {totalPages > 1 && (
                      <div className={`mt-12 pt-6 border-t ${themeStyles.footerBorder} flex items-center justify-between text-xs select-none`}>
                        <button
                          onClick={() => setCurrentPageIdx((p) => Math.max(0, p - 1))}
                          disabled={currentPageIdx <= 0}
                          className={`px-3.5 py-1.5 rounded-xl disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all flex items-center space-x-1 font-medium ${themeStyles.prevBtn}`}
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          <span>上一章节</span>
                        </button>

                        <div className="text-center space-y-0.5">
                          <span className={`font-mono text-xs font-semibold ${themeStyles.pageInfo}`}>
                            第 {currentPageIdx + 1} 页 / 共 {totalPages} 页 · 进度 {Math.round(((currentPageIdx + 1) / totalPages) * 100)}%
                          </span>
                          {docContent?.pages?.[currentPageIdx + 1] && (
                            <div className={`text-[11px] ${themeStyles.subInfo}`}>
                              下一节：{docContent.pages[currentPageIdx + 1].section_title || `第 ${currentPageIdx + 2} 页`}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => setCurrentPageIdx((p) => Math.min(totalPages - 1, p + 1))}
                          disabled={currentPageIdx >= totalPages - 1}
                          className={`px-4 py-1.5 rounded-xl disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all flex items-center space-x-1 font-medium ${themeStyles.nextBtn}`}
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

        {/* 右侧：AI 伴读与深度分析面板（沉浸式主题自适应） */}
        <aside className={`w-[440px] ${themeStyles.asideContainer} rounded-3xl shadow-sm border flex flex-col overflow-hidden shrink-0 transition-colors duration-200`}>
          
          {/* 面板顶栏 */}
          <div className={`p-3 border-b space-y-2.5 shrink-0 ${themeStyles.asideHeader}`}>
            <div className="flex items-center justify-between px-1">
              <div className={`flex items-center space-x-1.5 text-xs font-bold ${themeStyles.asideTitle}`}>
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>{mode === 'notes' ? '读书笔记与批注' : 'AI 伴读分析'}</span>
              </div>

              {/* 生成 / 重新生成 或 导出笔记按钮 */}
              {mode === 'notes' ? (
                annotations.length > 0 && (
                  <button
                    onClick={handleExportAnnotations}
                    className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white active:scale-95 transition-all shadow-xs flex items-center space-x-1"
                    title="导出为 Markdown 读书笔记"
                  >
                    <Download className="w-3 h-3" />
                    <span>导出笔记</span>
                  </button>
                )
              ) : (
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
              )}
            </div>

            {/* iOS 分段控制器 */}
            <div className={`grid grid-cols-4 ${themeStyles.asideTabTrack} p-1 rounded-2xl gap-1 text-xs font-semibold`}>
              {MODE_TABS.map((tab) => {
                const active = mode === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setMode(tab.id)}
                    className={`flex items-center justify-center space-x-1 py-1.5 rounded-xl transition-all ${
                      active
                        ? themeStyles.asideTabActive
                        : themeStyles.asideTabInactive
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.id === 'notes' ? `笔记 (${annotations.length})` : tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 摘要正文或读书笔记展示区 */}
          <div
            onMouseUp={handleMouseUp}
            className={`flex-1 overflow-y-auto p-5 text-sm leading-relaxed select-text cursor-text ${themeStyles.asideContent}`}
          >
            {mode === 'notes' ? (
              <div className="h-full flex flex-col space-y-3">
                <div className={`flex items-center justify-between pb-2 border-b ${themeStyles.asideDivider}`}>
                  <span className={`text-xs font-bold ${themeStyles.asideTitle}`}>
                    已收录 {annotations.length} 条划线与思考
                  </span>
                  {annotations.length > 0 && (
                    <span className={`text-[11px] opacity-70`}>
                      点击笔记卡片可跳转至正文
                    </span>
                  )}
                </div>

                {annotations.length === 0 ? (
                  <div className={`h-full flex flex-col items-center justify-center text-center p-8 space-y-3 ${themeStyles.asideEmptyText}`}>
                    <div className={`w-12 h-12 rounded-3xl ${themeStyles.asideEmptyIcon} flex items-center justify-center`}>
                      <Bookmark className="w-6 h-6" />
                    </div>
                    <h3 className={`text-sm font-bold ${themeStyles.asideTitle}`}>暂无高亮划线</h3>
                    <p className="text-xs max-w-[220px]">
                      在正文中选中任意文字，点击颜色圆点即可划线；也可以在 AI 解读后点击「📌 存入笔记」。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 overflow-y-auto pr-1">
                    {annotations.map((a) => {
                      const colorBadge = {
                        yellow: 'bg-amber-100 text-amber-800 border-amber-300',
                        green: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                        purple: 'bg-purple-100 text-purple-800 border-purple-300',
                        blue: 'bg-blue-100 text-blue-800 border-blue-300',
                      }[a.color] || 'bg-amber-100 text-amber-800 border-amber-300'

                      return (
                        <div
                          key={a.id}
                          className={`${themeStyles.asideNoteCard} rounded-2xl p-3 border space-y-2 transition-all group`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${colorBadge}`}>
                                第 {a.page_index + 1} 页
                              </span>
                              <span className="text-[10px] opacity-60 font-mono">
                                {a.created_at ? new Date(a.created_at).toLocaleDateString() : ''}
                              </span>
                            </div>

                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setCurrentPageIdx(a.page_index)
                                  showToast(`已跳转到第 ${a.page_index + 1} 页`)
                                }}
                                className="px-2 py-0.5 rounded-lg bg-black/10 hover:bg-black/20 text-[11px] font-medium text-current shadow-2xs"
                                title="跳转到正文所在页"
                              >
                                定位
                              </button>
                              <button
                                onClick={(e) => handleDeleteAnnotation(a.id, e)}
                                className="w-6 h-6 rounded-lg hover:bg-rose-500/20 text-rose-500 flex items-center justify-center shadow-2xs transition-colors"
                                title="删除该条划线"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div
                            onClick={() => {
                              setCurrentPageIdx(a.page_index)
                              setActiveAnnotation(a)
                              setEditingNoteText(a.note || '')
                            }}
                            className={`text-xs font-medium leading-relaxed border-l-2 border-purple-400 pl-2 cursor-pointer transition-colors ${themeStyles.asideNoteText}`}
                          >
                            “{a.selected_text}”
                          </div>

                          {a.note && (
                            <div className={`text-[11px] rounded-xl p-2 border space-y-0.5 ${themeStyles.asideNoteInner}`}>
                              <span className="font-bold text-amber-600">✍️ 批注：</span>
                              <span>{a.note}</span>
                            </div>
                          )}

                          {a.ai_insight && (
                            <div className="text-[11px] text-purple-700 bg-purple-500/10 rounded-xl p-2 border border-purple-500/20 space-y-0.5">
                              <span className="font-bold">💡 AI 沉淀：</span>
                              <p className="line-clamp-3">{a.ai_insight}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : streamError ? (
              isUnconfiguredError(streamError) ? (
                <NoApiKeyNotice
                  contextDesc="生成长文档综合摘要、思维大纲与核心要点需要大模型引擎驱动"
                  onActionSuccess={() => handleGenerate(true)}
                />
              ) : (
                <div className="bg-rose-50 border border-rose-200/60 rounded-2xl p-4 text-xs text-rose-600 space-y-1">
                  <div className="font-semibold">生成异常</div>
                  <div>{streamError}</div>
                </div>
              )
            ) : generating && !summaries[mode] ? (
              <div className="h-full flex flex-col items-center justify-center space-y-3 text-zinc-400">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 animate-pulse">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium">Map-Reduce 正在通读全文提炼中...</span>
              </div>
            ) : !summaries[mode] ? (
              isLlmUnconfigured ? (
                <NoApiKeyNotice
                  contextDesc="生成长文档综合摘要、思维大纲与核心要点需要大模型引擎驱动"
                  onActionSuccess={() => handleGenerate(false)}
                />
              ) : (
                <div className={`h-full flex flex-col items-center justify-center text-center p-6 space-y-3 ${themeStyles.asideEmptyText}`}>
                  <div className={`w-10 h-10 rounded-2xl ${themeStyles.asideEmptyIcon} flex items-center justify-center`}>
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <p className="text-xs max-w-[240px]">
                    点击右上角「一键生成」，AI 将自动提炼本文档的
                    {mode === 'overall' ? '全局综合摘要' : mode === 'outline' ? '思维大纲' : '核心关键知识点'}
                  </p>
                </div>
              )
            ) : (
              <div className={`prose prose-sm max-w-none select-text cursor-text ${themeStyles.asideMarkdown}`}>
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
          className="fixed z-50 flex items-center bg-zinc-900/90 text-white backdrop-blur-md px-2 py-1.5 rounded-full shadow-2xl border border-white/10 space-x-1.5 animate-fade-in select-none"
        >
          {/* 四色高亮划线按钮 */}
          <div className="flex items-center space-x-1.5 px-1.5 py-0.5">
            <button
              onClick={() => handleCreateHighlight('yellow')}
              className="w-3.5 h-3.5 rounded-full bg-amber-400 hover:scale-125 active:scale-95 transition-all shadow-xs border border-white/20"
              title="黄色高亮划线"
            />
            <button
              onClick={() => handleCreateHighlight('green')}
              className="w-3.5 h-3.5 rounded-full bg-emerald-400 hover:scale-125 active:scale-95 transition-all shadow-xs border border-white/20"
              title="绿色高亮划线"
            />
            <button
              onClick={() => handleCreateHighlight('purple')}
              className="w-3.5 h-3.5 rounded-full bg-purple-400 hover:scale-125 active:scale-95 transition-all shadow-xs border border-white/20"
              title="紫色高亮划线"
            />
            <button
              onClick={() => handleCreateHighlight('blue')}
              className="w-3.5 h-3.5 rounded-full bg-blue-400 hover:scale-125 active:scale-95 transition-all shadow-xs border border-white/20"
              title="蓝色高亮划线"
            />
          </div>

          <span className="w-px h-3 bg-white/20" />

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
          className={`fixed z-50 w-[420px] max-w-[calc(100vw-32px)] ${themeStyles.modalContainer} backdrop-blur-2xl rounded-3xl p-5 shadow-2xl border animate-fade-in space-y-3 transition-colors duration-200`}
        >
          {/* 顶部可拖拽操作栏 */}
          <div
            onMouseDown={handleCardDragStart}
            className={`flex items-center justify-between pb-2 border-b ${themeStyles.modalHeader} cursor-grab active:cursor-grabbing select-none`}
            title="按住此处可自由拖拽位置"
          >
            <div className="flex items-center space-x-2 text-xs font-bold">
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
                    className={`absolute left-0 top-full mt-1.5 w-44 ${themeStyles.modalContainer} backdrop-blur-2xl rounded-2xl shadow-xl border p-1.5 z-50 animate-fade-in space-y-0.5`}
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
                              ? 'bg-purple-100/80 text-purple-900 font-bold dark:bg-purple-900/60 dark:text-purple-100'
                              : 'hover:bg-black/5 dark:hover:bg-white/10 font-medium'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <span>{item.flag}</span>
                            <span>{item.label}</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-purple-600 dark:text-purple-300" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 拖拽指示条 */}
            <div className="flex items-center space-x-1 opacity-40 hover:opacity-80 transition-opacity">
              <GripHorizontal className="w-4 h-4" />
            </div>

            {/* 右侧操作按钮组：复制结果 & 关闭 */}
            <div className="flex items-center space-x-1.5">
              <button
                onClick={handleCopyResult}
                className={`w-6 h-6 rounded-full ${themeStyles.modalBtn} flex items-center justify-center active:scale-90 transition-all`}
                title="复制 AI 解答内容"
              >
                {copiedResult ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setInlineResult((prev) => ({ ...prev, show: false }))}
                className={`w-6 h-6 rounded-full ${themeStyles.modalBtn} flex items-center justify-center active:scale-90 transition-all`}
                title="关闭浮窗"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="text-xs leading-relaxed max-h-80 overflow-y-auto font-sans select-text cursor-text">
            {isUnconfiguredError(inlineResult.content) ? (
              <NoApiKeyNotice
                compact={true}
                contextDesc="划词深度解读与互译需要大模型引擎驱动"
                onActionSuccess={() => {
                  triggerInlineAction(
                    inlineResult.action,
                    inlineResult.targetLang,
                    inlineResult.selectedText
                  )
                }}
              />
            ) : inlineResult.content ? (
              <div className={`prose prose-xs ${themeStyles.asideMarkdown}`}>
                <ReactMarkdown>{inlineResult.content}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-zinc-400 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                <span>AI 导师正在深入解读选中文段...</span>
              </div>
            )}
            {inlineResult.isStreaming && !isUnconfiguredError(inlineResult.content) && (
              <span className="inline-block w-1.5 h-3 ml-1 bg-purple-500 animate-pulse rounded-full align-middle" />
            )}
          </div>

          {/* 将此解答收录至读书笔记 */}
          {inlineResult.content && !isUnconfiguredError(inlineResult.content) && (
            <div className={`pt-2 border-t ${themeStyles.modalHeader} flex items-center justify-between`}>
              <button
                onClick={handleSaveAiInsightToNotes}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 rounded-xl text-xs font-semibold active:scale-95 transition-all shadow-2xs"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>{savedAiToNote ? '✓ 已收录至读书笔记' : '📌 保存此解读为我的读书笔记'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 划线与批注笔记详情编辑弹窗 */}
      {activeAnnotation && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in select-none">
          <div className={`rounded-3xl max-w-md w-full p-5 shadow-2xl border space-y-4 ${themeStyles.modalContainer} transition-colors duration-200`}>
            <div className={`flex items-center justify-between pb-2 border-b ${themeStyles.modalHeader}`}>
              <div className="flex items-center space-x-2">
                <Bookmark className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-bold">
                  第 {activeAnnotation.page_index + 1} 页划线批注
                </span>
              </div>
              <button
                onClick={() => setActiveAnnotation(null)}
                className={`w-6 h-6 rounded-full flex items-center justify-center ${themeStyles.modalBtn} active:scale-95 transition-all`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 划选原文 */}
            <div className={`rounded-2xl p-3 text-xs leading-relaxed italic border-l-2 border-purple-500 max-h-32 overflow-y-auto ${themeStyles.modalQuote}`}>
              “{activeAnnotation.selected_text}”
            </div>

            {/* 颜色切换 */}
            <div className="flex items-center space-x-3 text-xs opacity-70">
              <span>高亮颜色:</span>
              <div className="flex items-center space-x-2">
                {(['yellow', 'green', 'purple', 'blue'] as HighlightColor[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setActiveAnnotation((prev) => (prev ? { ...prev, color: c } : null))
                      fetch(`${backendUrl}/api/v1/reader/annotations/${activeAnnotation.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ color: c }),
                      }).then(() => {
                        setAnnotations((prev) => prev.map((a) => (a.id === activeAnnotation.id ? { ...a, color: c } : a)))
                      })
                    }}
                    className={`w-5 h-5 rounded-full transition-all ${
                      c === 'yellow' ? 'bg-amber-400' : c === 'green' ? 'bg-emerald-400' : c === 'purple' ? 'bg-purple-400' : 'bg-blue-400'
                    } ${activeAnnotation.color === c ? 'ring-2 ring-purple-500 scale-110' : 'hover:scale-105'}`}
                  />
                ))}
              </div>
            </div>

            {/* 个人思考输入框 */}
            <div className="space-y-1">
              <label className="text-xs font-semibold opacity-70">✍️ 我的读书批注与思考：</label>
              <textarea
                rows={3}
                value={editingNoteText}
                onChange={(e) => setEditingNoteText(e.target.value)}
                placeholder="记录您对这一段的理解、灵感或疑问..."
                className={`w-full rounded-2xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 resize-none leading-relaxed ${themeStyles.modalInput}`}
              />
            </div>

            {/* AI 解读内容（如有） */}
            {activeAnnotation.ai_insight && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-3 text-xs text-purple-800 dark:text-purple-200 leading-relaxed space-y-1 max-h-32 overflow-y-auto">
                <span className="font-bold text-[11px] text-purple-600 dark:text-purple-400">💡 关联的 AI 伴读解析：</span>
                <p className="whitespace-pre-wrap">{activeAnnotation.ai_insight}</p>
              </div>
            )}

            {/* 底部按钮 */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={(e) => handleDeleteAnnotation(activeAnnotation.id, e)}
                className="flex items-center space-x-1 text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-500/10 px-2.5 py-1.5 rounded-xl transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>删除此划线</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveAnnotation(null)}
                  className={`px-3.5 py-1.5 text-xs rounded-xl transition-colors ${themeStyles.modalCancelBtn}`}
                >
                  取消
                </button>
                <button
                  onClick={handleUpdateAnnotationNote}
                  disabled={savingNote}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-sm active:scale-95 transition-all flex items-center space-x-1"
                >
                  {savingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  <span>保存批注</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 底部轻量提示 Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900/90 backdrop-blur-md text-white text-xs font-medium px-4 py-2 rounded-2xl shadow-xl border border-white/10 animate-fade-in flex items-center space-x-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{toastMsg}</span>
        </div>
      )}

    </div>
  )
}
