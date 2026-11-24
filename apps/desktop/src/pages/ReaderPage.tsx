import React, { useState, useEffect, useRef, useMemo } from 'react'
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
  Tag,
  MessageSquare,
  Send,
  Brain,
  Maximize2,
  Compass,
} from 'lucide-react'
import { useDocStore } from '../stores/docStore'
import { NoApiKeyNotice } from '../components/NoApiKeyNotice'
import { MindmapModal } from '../components/MindmapModal'

type SummaryMode = 'overall' | 'outline' | 'keypoints' | 'notes' | 'chat'
type ReadViewMode = 'extracted' | 'native'
export type HighlightColor = 'yellow' | 'green' | 'purple' | 'blue'

export interface HighlightSemanticsMeta {
  label: string
  emoji: string
  desc: string
  chip: string
  border: string
  bgTint: string
  ring: string
  dot: string
}

export const HIGHLIGHT_SEMANTICS: Record<HighlightColor, HighlightSemanticsMeta> = {
  yellow: {
    label: '重点',
    emoji: '🟡',
    desc: '核心考点 / 关键定义',
    chip: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50',
    border: 'border-l-4 border-amber-400 dark:border-amber-500',
    bgTint: 'bg-amber-500/[0.04] dark:bg-amber-400/[0.04]',
    ring: 'ring-amber-400/80',
    dot: 'bg-amber-400',
  },
  green: {
    label: '理解',
    emoji: '🟢',
    desc: '原理解析 / 要点拆解',
    chip: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50',
    border: 'border-l-4 border-emerald-400 dark:border-emerald-500',
    bgTint: 'bg-emerald-500/[0.04] dark:bg-emerald-400/[0.04]',
    ring: 'ring-emerald-400/80',
    dot: 'bg-emerald-400',
  },
  purple: {
    label: '思考',
    emoji: '🟣',
    desc: '个人见解 / 拓展联想',
    chip: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/50',
    border: 'border-l-4 border-purple-400 dark:border-purple-500',
    bgTint: 'bg-purple-500/[0.04] dark:bg-purple-400/[0.04]',
    ring: 'ring-purple-400/80',
    dot: 'bg-purple-400',
  },
  blue: {
    label: '疑问',
    emoji: '🔵',
    desc: '认知困惑 / 待解疑难',
    chip: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50',
    border: 'border-l-4 border-blue-400 dark:border-blue-500',
    bgTint: 'bg-blue-500/[0.04] dark:bg-blue-400/[0.04]',
    ring: 'ring-blue-400/80',
    dot: 'bg-blue-400',
  },
}

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
  tags?: string[]
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
  { id: 'notes', label: '笔记', icon: <Bookmark className="w-3.5 h-3.5" /> },
  { id: 'chat', label: '即时追问', icon: <MessageSquare className="w-3.5 h-3.5" /> },
]

// 智能增强型 Markdown 渲染引擎：解决原生 prose 样式缺失导致的大纲平铺无层级与重点淹没问题，并深度支持全景划线高亮
const CustomMarkdownRenderer: React.FC<{
  content: string
  themeStyles: any
  annotations?: AnnotationItem[]
  onAnnoClick?: (anno: AnnotationItem) => void
  pulsingAnnoId?: string | null
}> = ({ content, themeStyles, annotations = [], onAnnoClick, pulsingAnnoId }) => {
  // 语法预处理：确保不论模型输出是否带有 Markdown # 标记，都能呈现鲜明的思维导图层级
  const processed = useMemo(() => {
    if (!content) return ''
    const lines = content.split('\n')
    const result: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      // 已有规范 Markdown 标记，直接保留
      if (/^(#+|\*+|-+|\d+\.)\s/.test(trimmed)) {
        result.push(line)
        continue
      }
      // 1. 全局大纲大标题 (如 Python 列表操作核心知识结构大纲)
      if (i === 0 && (trimmed.includes('大纲') || trimmed.includes('摘要') || trimmed.includes('要点'))) {
        result.push(`# ${trimmed}`)
        continue
      }
      // 2. 一级章 (如 一、创建列表 / 任务一：...)
      if (/^[一二三四五六七八九十\d]+[、\.]\s*|^任务[一二三四五六七八九十\d]+/.test(trimmed)) {
        result.push(`\n## ${trimmed}\n`)
        continue
      }
      // 3. 二级模块 (短行且不含标点符号，如 直接创建 / 索引访问 / 类型转换创建)
      if (trimmed.length > 0 && trimmed.length <= 16 && !/[，。！？；]/.test(trimmed)) {
        result.push(`### 📌 ${trimmed}`)
        continue
      }
      // 4. 普通叶子条目 (转为带圆点的无序列表)
      if (trimmed.length > 0) {
        result.push(`- ${trimmed}`)
        continue
      }
      result.push(line)
    }
    return result.join('\n')
  }, [content])

  // 划线高亮文本解析渲染器
  const renderHighlightedText = (text: string) => {
    if (!text || !annotations || annotations.length === 0) return text

    const targets: { text: string; anno: AnnotationItem }[] = []
    annotations.forEach((a) => {
      if (a.selected_text && text.includes(a.selected_text)) {
        targets.push({ text: a.selected_text, anno: a })
      }
    })

    if (targets.length === 0) return text
    targets.sort((a, b) => b.text.length - a.text.length)

    const escapeRegex = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const pattern = new RegExp(`(${targets.map((t) => escapeRegex(t.text)).join('|')})`, 'g')

    const parts = text.split(pattern)
    return parts.map((part, idx) => {
      const matched = targets.find((t) => t.text === part)
      if (matched) {
        const meta = HIGHLIGHT_SEMANTICS[matched.anno.color] || HIGHLIGHT_SEMANTICS.yellow
        const isPulsing = pulsingAnnoId === matched.anno.id
        const colorCls = {
          yellow: 'bg-amber-200/90 text-amber-950 border-b-2 border-amber-400 dark:bg-amber-400/35 dark:text-amber-100 dark:border-amber-400',
          green: 'bg-emerald-200/90 text-emerald-950 border-b-2 border-emerald-400 dark:bg-emerald-400/35 dark:text-emerald-100 dark:border-emerald-400',
          purple: 'bg-purple-200/90 text-purple-950 border-b-2 border-purple-400 dark:bg-purple-400/35 dark:text-purple-100 dark:border-purple-400',
          blue: 'bg-blue-200/90 text-blue-950 border-b-2 border-blue-400 dark:bg-blue-400/35 dark:text-blue-100 dark:border-blue-400',
        }[matched.anno.color] || 'bg-amber-200/90 border-b-2 border-amber-400'

        return (
          <mark
            key={`aside_anno_${matched.anno.id}_${idx}`}
            id={`zhiyue-aside-anno-${matched.anno.id}`}
            onClick={(e) => {
              e.stopPropagation()
              onAnnoClick?.(matched.anno)
            }}
            className={`${colorCls} px-1 py-0.5 rounded-xs font-normal cursor-pointer transition-all duration-300 shadow-2xs select-text ${
              isPulsing
                ? `ring-4 ${meta.ring} ring-offset-2 ring-offset-black shadow-2xl scale-[1.03] animate-pulse inline-block z-10 font-medium`
                : ''
            }`}
            title={matched.anno.note ? `✍️ [${meta.label}] 批注: ${matched.anno.note}` : `[${meta.label}] 点击编辑/查看批注`}
          >
            {part}
          </mark>
        )
      }
      return part
    })
  }

  const highlightNode = (node: React.ReactNode): React.ReactNode => {
    if (typeof node === 'string') {
      return renderHighlightedText(node)
    }
    if (Array.isArray(node)) {
      return React.Children.map(node, (c) => highlightNode(c))
    }
    if (React.isValidElement(node) && (node.props as any)?.children) {
      return React.cloneElement(node, {}, highlightNode((node.props as any).children))
    }
    return node
  }

  return (
    <div className={`select-text cursor-text ${themeStyles.selection || ''}`}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <div className={`mt-2 mb-4 p-3 rounded-2xl border font-bold text-sm sm:text-base flex items-center space-x-2.5 shadow-2xs ${themeStyles.mdH1 || ''}`}>
              <span className="w-2.5 h-4.5 rounded-full bg-purple-500 shrink-0" />
              <span className="flex-1 tracking-tight">{highlightNode(children)}</span>
            </div>
          ),
          h2: ({ children }) => {
            const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : String(children || '')
            const match = text.match(/^([一二三四五六七八九十\d]+[、\.]|第[一二三四五六七八九十\d]+[章节条]|任务[一二三四五六七八九十\d]+[:：]?)\s*(.*)$/)
            const badge = match ? match[1].replace(/[:：]$/, '') : '章节'
            const title = match && match[2] ? match[2] : text
            return (
              <div className={`mt-5 mb-2.5 pb-2 font-bold text-xs sm:text-sm flex items-center space-x-2 ${themeStyles.mdH2 || ''}`}>
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0 shadow-2xs ${themeStyles.mdH2Badge || ''}`}>
                  {badge}
                </span>
                <span className="tracking-tight flex-1">{highlightNode(title)}</span>
              </div>
            )
          },
          h3: ({ children }) => (
            <div className={`mt-3.5 mb-1.5 font-bold text-xs flex items-center space-x-1.5 ${themeStyles.mdH3 || ''}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
              <span>{highlightNode(children)}</span>
            </div>
          ),
          strong: ({ children }) => (
            <strong className={`font-bold px-1.5 py-0.5 rounded-md inline-block shadow-2xs ${themeStyles.mdStrong || ''}`}>
              {highlightNode(children)}
            </strong>
          ),
          code: ({ children }) => (
            <code className={`font-mono text-[11px] px-1.5 py-0.5 rounded-md font-semibold ${themeStyles.mdCode || ''}`}>
              {children}
            </code>
          ),
          ul: ({ children }) => (
            <ul className="space-y-1.5 my-2 pl-2.5 border-l-2 border-black/[0.06] dark:border-white/[0.08]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="space-y-1.5 my-2 pl-4 list-decimal">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className={`text-xs leading-relaxed flex items-start space-x-2 my-1 ${themeStyles.mdLi || ''}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 shadow-2xs ${themeStyles.mdBullet || 'bg-purple-500'}`} />
              <div className="flex-1 min-w-0">{highlightNode(children)}</div>
            </li>
          ),
          p: ({ children }) => (
            <p className="text-xs leading-relaxed my-1.5">
              {highlightNode(children)}
            </p>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-purple-400 pl-3 py-1 my-2 text-xs italic opacity-85">
              {highlightNode(children)}
            </blockquote>
          ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}

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

  const totalPages = docContent?.pages?.length || 0
  const isPdf = docContent?.file_type?.toLowerCase() === 'pdf'

  // 划线与批注笔记状态
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([])
  const [activeAnnotation, setActiveAnnotation] = useState<AnnotationItem | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')
  const [editingTags, setEditingTags] = useState<string[]>([])
  const [tagInputText, setTagInputText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [savedAiToNote, setSavedAiToNote] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // 四色分类与自定义标签过滤及划线平滑滚动脉冲聚焦
  const [noteFilterColor, setNoteFilterColor] = useState<HighlightColor | 'all'>('all')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [pulsingAnnoId, setPulsingAnnoId] = useState<string | null>(null)

  // 当打开弹窗时同步标签与批注内容
  useEffect(() => {
    if (activeAnnotation) {
      setEditingNoteText(activeAnnotation.note || '')
      setEditingTags(activeAnnotation.tags || [])
      setTagInputText('')
    }
  }, [activeAnnotation?.id])

  // AI 深度串联解读全景报告状态
  const [synthesizing, setSynthesizing] = useState(false)
  const [synthesisContent, setSynthesisContent] = useState<string | null>(null)
  const [synthesisModalOpen, setSynthesisModalOpen] = useState(false)
  const [synthesisError, setSynthesisError] = useState<string | null>(null)
  const [copiedSynthesis, setCopiedSynthesis] = useState(false)

  // 知识思维导图画布状态
  const [mindmapModalOpen, setMindmapModalOpen] = useState(false)
  const [outlineSubView, setOutlineSubView] = useState<'list' | 'tree'>('list')

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2800)
  }

  const appTheme = useDocStore((s) => s.appTheme)
  const setAppTheme = useDocStore((s) => s.setAppTheme)

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
    if (updates.theme) {
      setAppTheme(updates.theme)
    }
    setAppearance((prev) => {
      const next = { ...prev, ...updates }
      try {
        localStorage.setItem('zhiyue_reader_appearance', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // 伴读侧边栏收起/展开状态（默认为展开，可一键收起进入全屏纯净阅读）
  const [showAiCompanion, setShowAiCompanion] = useState(true)

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

  // 计算四色标注与自定义标签数量统计与多维过滤
  const yellowCount = useMemo(() => annotations.filter((a) => a.color === 'yellow').length, [annotations])
  const greenCount = useMemo(() => annotations.filter((a) => a.color === 'green').length, [annotations])
  const purpleCount = useMemo(() => annotations.filter((a) => a.color === 'purple').length, [annotations])
  const blueCount = useMemo(() => annotations.filter((a) => a.color === 'blue').length, [annotations])

  const docTags = useMemo(() => {
    const set = new Set<string>()
    annotations.forEach((a) => {
      (a.tags || []).forEach((t) => {
        const clean = t.trim()
        if (clean) set.add(clean)
      })
    })
    return Array.from(set)
  }, [annotations])

  const tagCounts = useMemo(() => {
    const map: Record<string, number> = {}
    annotations.forEach((a) => {
      (a.tags || []).forEach((t) => {
        const clean = t.trim()
        if (clean) map[clean] = (map[clean] || 0) + 1
      })
    })
    return map
  }, [annotations])

  const filteredAnnotations = useMemo(() => {
    return annotations.filter((a) => {
      const matchColor = noteFilterColor === 'all' || a.color === noteFilterColor
      const matchTag = !selectedTag || (a.tags && a.tags.includes(selectedTag))
      return matchColor && matchTag
    })
  }, [annotations, noteFilterColor, selectedTag])

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

  // 伴读即时追问状态、溯源微胶囊与文档本地记忆
  interface CompanionCitation {
    doc_id: string
    chunk_index: number
    page_number: number
    section_title: string
    score: number
    text_preview: string
  }

  interface CompanionChatMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    isStreaming?: boolean
    citations?: CompanionCitation[]
  }

  const DEFAULT_COMPANION_MSG: CompanionChatMessage = {
    id: 'init',
    role: 'assistant',
    content: '你好！我是您的**专属伴读 AI 助手**。\n\n针对当前正在阅读的文档，您有任何疑问、想深入探究原理或查看实际代码实现，欢迎在此随时向我追问。',
  }

  const [companionMessages, setCompanionMessages] = useState<CompanionChatMessage[]>([DEFAULT_COMPANION_MSG])
  const [companionInput, setCompanionInput] = useState('')
  const [companionGenerating, setCompanionGenerating] = useState(false)
  const [companionConvId, setCompanionConvId] = useState<string | null>(null)
  const [savedCompanionNoteIds, setSavedCompanionNoteIds] = useState<Set<string>>(new Set())
  const companionEndRef = useRef<HTMLDivElement>(null)

  // 溯源与导图跳转的呼吸柔光高亮状态
  const [pulsingTarget, setPulsingTarget] = useState<{ page: number; sectionTitle?: string } | null>(null)
  const pulsingTimerRef = useRef<NodeJS.Timeout | null>(null)

  const triggerPulsingGlow = (page: number, sectionTitle?: string) => {
    if (pulsingTimerRef.current) {
      clearTimeout(pulsingTimerRef.current)
    }
    setPulsingTarget({ page, sectionTitle })
    pulsingTimerRef.current = setTimeout(() => {
      setPulsingTarget(null)
    }, 2200)
  }

  const handleJumpToCitation = (c: CompanionCitation) => {
    const targetPage = Math.max(0, (c.page_number || 1) - 1)
    setCurrentPageIdx(targetPage)
    leftContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    triggerPulsingGlow(targetPage, c.section_title)
    showToast(`已定位至 P.${c.page_number || 1} 原文位置`)
  }

  // 按文档本地持久化读取伴读对话历史
  useEffect(() => {
    if (!selectedDocId) return
    try {
      const saved = localStorage.getItem(`zhiyue_companion_chat_${selectedDocId}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCompanionMessages(parsed.map((m: any) => ({ ...m, isStreaming: false })))
          return
        }
      }
    } catch (e) {
      console.warn('Failed to load companion chat history:', e)
    }
    setCompanionMessages([DEFAULT_COMPANION_MSG])
    setCompanionConvId(null)
  }, [selectedDocId])

  // 当对话更新且非生成状态时，持久化保存至 localStorage
  useEffect(() => {
    if (!selectedDocId || companionGenerating) return
    try {
      if (
        companionMessages.length > 1 ||
        (companionMessages.length === 1 && companionMessages[0].id !== 'init')
      ) {
        localStorage.setItem(
          `zhiyue_companion_chat_${selectedDocId}`,
          JSON.stringify(companionMessages)
        )
      }
    } catch (e) {
      console.warn('Failed to save companion chat history:', e)
    }
  }, [companionMessages, selectedDocId, companionGenerating])

  useEffect(() => {
    if (mode === 'chat') {
      companionEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [companionMessages, mode])

  const handleSendCompanionChat = async (presetText?: string) => {
    const text = (presetText || companionInput).trim()
    if (!text || companionGenerating || !selectedDocId || !backendUrl) return
    if (!presetText) setCompanionInput('')

    const userMsgId = 'user_' + Date.now()
    const assistantMsgId = 'asst_' + Date.now()

    setCompanionMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: text },
      { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true },
    ])
    setCompanionGenerating(true)
    setMode('chat')
    setShowAiCompanion(true)

    try {
      const resp = await fetch(`${backendUrl}/api/v1/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          doc_id: selectedDocId,
          conversation_id: companionConvId,
        }),
      })

      if (!resp.ok) throw new Error('网络请求异常')
      const reader = resp.body?.getReader()
      if (!reader) throw new Error('流式读取器不可用')

      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const rawData = line.slice(6).trim()
            if (!rawData) continue
            try {
              const data = JSON.parse(rawData)
              if (currentEvent === 'citations') {
                const citationsList = Array.isArray(data) ? data : []
                setCompanionMessages((prev) =>
                  prev.map((m) => (m.id === assistantMsgId ? { ...m, citations: citationsList } : m))
                )
              } else if (currentEvent === 'token') {
                fullContent += data
                setCompanionMessages((prev) =>
                  prev.map((m) => (m.id === assistantMsgId ? { ...m, content: fullContent } : m))
                )
              } else if (currentEvent === 'done') {
                if (data && data.conversation_id) {
                  setCompanionConvId(data.conversation_id)
                }
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      console.error('伴读追问异常', e)
      setCompanionMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: '⚠️ 伴读生成遇到网络或模型错误，请确认已在设置中配置有效 API Key。' }
            : m
        )
      )
    } finally {
      setCompanionGenerating(false)
      setCompanionMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m))
      )
    }
  }

  const handleSaveCompanionNote = async (msg: CompanionChatMessage, idx: number) => {
    if (!selectedDocId || !backendUrl) return
    const prevUser = companionMessages[idx - 1]?.role === 'user' ? companionMessages[idx - 1].content : '伴读提问'
    try {
      const resp = await fetch(`${backendUrl}/api/v1/reader/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: selectedDocId,
          page_index: currentPageIdx,
          selected_text: prevUser.slice(0, 100),
          color: 'purple',
          tags: ['伴读追问'],
          ai_insight: msg.content,
        }),
      })
      if (resp.ok) {
        const data = await resp.json()
        if (data.annotation) {
          setAnnotations((prev) => [...prev, data.annotation])
          setSavedCompanionNoteIds((prev) => new Set([...prev, msg.id]))
          showToast('已将该追问洞察存入读书笔记')
        }
      }
    } catch (e) {
      console.error('保存笔记失败', e)
    }
  }

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

  // 极客沉浸键盘流快捷键监听 (1/2/3/4 四色划线、J/K 翻页、Esc 快捷退出)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. 若当前正在文本输入框内编辑，则跳过快捷键
      const activeEl = document.activeElement
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl?.getAttribute('contenteditable') === 'true'
      if (isInput) return

      // 2. Escape: 快捷关闭浮层、弹窗、抽屉与气泡
      if (e.key === 'Escape') {
        if (tooltip.show) {
          setTooltip((prev) => ({ ...prev, show: false }))
          window.getSelection()?.removeAllRanges()
          return
        }
        if (inlineResult.show) {
          setInlineResult((prev) => ({ ...prev, show: false }))
          return
        }
        if (activeAnnotation) {
          setActiveAnnotation(null)
          return
        }
        if (showAppearanceMenu) {
          setShowAppearanceMenu(false)
          return
        }
        if (showTocDrawer) {
          setShowTocDrawer(false)
          return
        }
        if (synthesisModalOpen) {
          setSynthesisModalOpen(false)
          return
        }
        if (mindmapModalOpen) {
          setMindmapModalOpen(false)
          return
        }
        return
      }

      // 3. 数字键 1/2/3/4 四色划线 (当用户选中文本时即刻生效)
      const currentSelection = window.getSelection()?.toString().trim() || tooltip.selectedText
      if (currentSelection && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        const colorMap: Record<string, HighlightColor> = {
          '1': 'yellow',
          '2': 'green',
          '3': 'purple',
          '4': 'blue',
        }
        const color = colorMap[e.key]
        if (color) {
          handleCreateHighlight(color, currentSelection)
        }
        return
      }

      // 4. 左右方向键 / J / K 沉浸翻页 (在精读排版多页模式下)
      if (readViewMode === 'extracted' && totalPages > 1) {
        if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
          e.preventDefault()
          setCurrentPageIdx((p) => Math.max(0, p - 1))
          return
        }
        if (e.key === 'ArrowRight' || e.key === 'k' || e.key === 'K') {
          e.preventDefault()
          setCurrentPageIdx((p) => Math.min(totalPages - 1, p + 1))
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    tooltip.show,
    tooltip.selectedText,
    inlineResult.show,
    activeAnnotation,
    showAppearanceMenu,
    showTocDrawer,
    synthesisModalOpen,
    mindmapModalOpen,
    readViewMode,
    totalPages,
    selectedDocId,
    backendUrl,
    currentPageIdx,
  ])

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

  // 3. 修改批注笔记与自定义标签
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
          tags: editingTags,
        }),
      })
      if (resp.ok) {
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === activeAnnotation.id
              ? { ...a, note: editingNoteText, color: activeAnnotation.color, tags: editingTags }
              : a
          )
        )
        setActiveAnnotation(null)
        showToast('批注与标签已保存')
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

  // 6. 正文与伴读划线精准定位跳转与脉冲高亮动画
  const handleJumpToAnnotation = (a: AnnotationItem) => {
    // 优先检查伴读面板或当前正文视口中是否已存在该划线元素
    const asideEl = document.getElementById(`zhiyue-aside-anno-${a.id}`)
    const articleEl = document.getElementById(`zhiyue-anno-${a.id}`)

    if (asideEl) {
      asideEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setPulsingAnnoId(a.id)
      setTimeout(() => setPulsingAnnoId(null), 2200)
      const meta = HIGHLIGHT_SEMANTICS[a.color] || HIGHLIGHT_SEMANTICS.yellow
      showToast(`🎯 已定位至伴读分析「${meta.label}」划线处`)
      return
    }

    if (articleEl) {
      articleEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setPulsingAnnoId(a.id)
      setTimeout(() => setPulsingAnnoId(null), 2200)
      const meta = HIGHLIGHT_SEMANTICS[a.color] || HIGHLIGHT_SEMANTICS.yellow
      showToast(`🎯 已定位至第 ${a.page_index + 1} 页「${meta.label}」划线处`)
      return
    }

    if (a.page_index !== currentPageIdx) {
      setCurrentPageIdx(a.page_index)
    }
    setPulsingAnnoId(a.id)
    setTimeout(() => {
      const el = document.getElementById(`zhiyue-anno-${a.id}`) || document.getElementById(`zhiyue-aside-anno-${a.id}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 150)
    setTimeout(() => {
      setPulsingAnnoId(null)
    }, 2200)
    const meta = HIGHLIGHT_SEMANTICS[a.color] || HIGHLIGHT_SEMANTICS.yellow
    showToast(`🎯 已定位至第 ${a.page_index + 1} 页「${meta.label}」划线处`)
  }

  // 7. 发起 AI 划线深度串联与攻坚解读报告
  const handleSynthesizeNotes = async () => {
    if (annotations.length === 0) {
      showToast('该文档暂无划线，请在正文中划选重点或疑问后再串联')
      return
    }
    setSynthesisModalOpen(true)
    setSynthesizing(true)
    setSynthesisContent('')
    setSynthesisError(null)

    try {
      const res = await fetch(`${backendUrl}/api/v1/reader/${selectedDocId}/synthesize-notes/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => null)
        throw new Error(errJson?.detail || '无法生成划线串联报告')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('流式读取不可用')
      const decoder = new TextDecoder()
      let buffer = ''
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          const eventMatch = line.match(/^event:\s*(\w+)/)
          const dataMatch = line.match(/^data:\s*(.*)$/m)
          const event = eventMatch ? eventMatch[1] : 'token'
          const rawData = dataMatch ? dataMatch[1] : ''

          if (event === 'token') {
            try {
              const token = JSON.parse(rawData)
              full += token
              setSynthesisContent(full)
            } catch {
              full += rawData
              setSynthesisContent(full)
            }
          } else if (event === 'error') {
            try {
              const err = JSON.parse(rawData)
              setSynthesisError(err)
            } catch {
              setSynthesisError(rawData)
            }
          } else if (event === 'done') {
            setSynthesizing(false)
          }
        }
      }
    } catch (err: any) {
      console.error('AI 划线串联解读失败', err)
      setSynthesisError(err.message || '生成失败，请检查模型配置')
    } finally {
      setSynthesizing(false)
    }
  }

  // 8. 导出 AI 深度串联解读报告
  const handleExportSynthesis = () => {
    if (!synthesisContent) return
    const currentDocName = docContent?.name || '读书笔记串联报告'
    const blob = new Blob([synthesisContent], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentDocName}_AI深度串联解读.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('已导出 AI 深度串联解读报告 (.md)')
  }

  // 9. 渲染正文划线高亮与跳转闪烁
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
          const meta = HIGHLIGHT_SEMANTICS[matched.anno.color] || HIGHLIGHT_SEMANTICS.yellow
          const isPulsing = pulsingAnnoId === matched.anno.id

          const colorCls = {
            yellow: 'bg-amber-200/80 border-b-2 border-amber-400 hover:bg-amber-300 dark:bg-amber-400/25 dark:text-amber-100 dark:border-amber-400',
            green: 'bg-emerald-200/80 border-b-2 border-emerald-400 hover:bg-emerald-300 dark:bg-emerald-400/25 dark:text-emerald-100 dark:border-emerald-400',
            purple: 'bg-purple-200/80 border-b-2 border-purple-400 hover:bg-purple-300 dark:bg-purple-400/25 dark:text-purple-100 dark:border-purple-400',
            blue: 'bg-blue-200/80 border-b-2 border-blue-400 hover:bg-blue-300 dark:bg-blue-400/25 dark:text-blue-100 dark:border-blue-400',
          }[matched.anno.color] || 'bg-amber-200/80 border-b-2 border-amber-400'

          return (
            <mark
              key={`anno_${matched.anno.id}_${idx}`}
              id={`zhiyue-anno-${matched.anno.id}`}
              onClick={(e) => {
                e.stopPropagation()
                setActiveAnnotation(matched.anno || null)
                setEditingNoteText(matched.anno?.note || '')
              }}
              className={`${colorCls} text-zinc-900 px-0.5 rounded-xs font-normal cursor-pointer transition-all duration-300 selection:bg-purple-300 ${
                isPulsing
                  ? `ring-4 ${meta.ring} ring-offset-2 ring-offset-black shadow-2xl scale-[1.03] animate-pulse inline-block z-10 font-medium`
                  : ''
              }`}
              title={matched.anno.note ? `✍️ [${meta.label}] 批注: ${matched.anno.note}` : `[${meta.label}] 点击查看/编辑此划线`}
            >
              {part}
            </mark>
          )
        }
      }
      return part
    })
  }

  // 智能结构化排版引擎：将正文切分为标题、代码块、列表项与自然段落（彻底解决排版杂乱、代码混排与换行挤压）
  const renderStructuredContent = (content: string) => {
    if (!content) return null

    const rawLines = content.split('\n')
    const blocks: {
      type: 'task' | 'code' | 'list' | 'text'
      lines: string[]
      meta?: string
    }[] = []

    let currentCodeLines: string[] = []
    let inCodeBlock = false

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i]
      const trimmed = line.trim()

      if (!trimmed) {
        if (inCodeBlock && currentCodeLines.length > 0) {
          const nextLine = rawLines[i + 1]?.trim() || ''
          const isNextCode =
            nextLine.includes('=') ||
            nextLine.startsWith('print') ||
            nextLine.startsWith('for ') ||
            nextLine.startsWith('if ') ||
            nextLine.startsWith('def ') ||
            nextLine.startsWith('return ') ||
            nextLine.startsWith('list.') ||
            nextLine.startsWith('a.')
          if (isNextCode) {
            currentCodeLines.push(line)
            continue
          } else {
            blocks.push({ type: 'code', lines: currentCodeLines })
            currentCodeLines = []
            inCodeBlock = false
          }
        }
        continue
      }

      // 1. 代码块起始标志 (如 【代码示例】 或 ```)
      if (
        trimmed.startsWith('【代码示例】') ||
        trimmed.startsWith('```') ||
        trimmed.startsWith('代码示例：') ||
        trimmed.startsWith('示例代码：')
      ) {
        if (inCodeBlock && currentCodeLines.length > 0) {
          blocks.push({ type: 'code', lines: currentCodeLines })
          currentCodeLines = []
        }
        inCodeBlock = true
        const rest = trimmed.replace(/^(【代码示例】|```\w*|代码示例：|示例代码：)\s*/, '')
        if (rest) currentCodeLines.push(rest)
        continue
      }

      // 若处于代码示例收集状态
      if (inCodeBlock) {
        const isNewSection =
          /^(任务[一二三四五六七八九十\d]+|第[一二三四五六七八九十\d]+[章节条]|#+\s+|\d+[\.、])/.test(
            trimmed
          )
        if (isNewSection) {
          if (currentCodeLines.length > 0) {
            blocks.push({ type: 'code', lines: currentCodeLines })
            currentCodeLines = []
          }
          inCodeBlock = false
        } else {
          currentCodeLines.push(line)
          continue
        }
      }

      // 2. 章节/核心任务标题 (如 任务一：创建列表 / 第一章 / # 标题)
      if (/^(任务[一二三四五六七八九十\d]+[:：]?|第[一二三四五六七八九十\d]+[章节条]|#+\s+)/.test(trimmed)) {
        blocks.push({ type: 'task', lines: [trimmed] })
        continue
      }

      // 3. 数字编号有序条目 (如 1. 创建一个列表... / 2. 创建一个空列表...)
      const listMatch = trimmed.match(/^(\d+)[\.、]\s*(.*)$/)
      if (listMatch) {
        blocks.push({ type: 'list', lines: [listMatch[2]], meta: listMatch[1] })
        continue
      }

      // 4. 普通段落正文
      blocks.push({ type: 'text', lines: [line] })
    }

    if (inCodeBlock && currentCodeLines.length > 0) {
      blocks.push({ type: 'code', lines: currentCodeLines })
    }

    return (
      <div className="space-y-4 min-w-0">
        {blocks.map((block, bIdx) => {
          if (block.type === 'task') {
            const raw = block.lines[0]
            const match = raw.match(/^(任务[一二三四五六七八九十\d]+|第[一二三四五六七八九十\d]+[章节条]|#+\s+)([:：\s]*)(.*)$/)
            const badge = match ? match[1].replace(/#+\s*/, '章节') : '任务'
            const title = match && match[3] ? match[3] : raw.replace(/^#+\s*/, '')

            return (
              <div
                key={`task-${bIdx}`}
                className={`mt-8 mb-4 pt-4 pb-3 border-b flex items-center space-x-3 ${themeStyles.taskHeaderBorder}`}
              >
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold tracking-wide shrink-0 ${themeStyles.taskBadge}`}>
                  {badge}
                </span>
                <h2 className={`text-base sm:text-lg font-bold tracking-tight ${themeStyles.taskTitle}`}>
                  {renderArticleText(title)}
                </h2>
              </div>
            )
          }

          if (block.type === 'code') {
            return (
              <div
                key={`code-${bIdx}`}
                className={`my-3.5 rounded-2xl border overflow-hidden shadow-2xs ${themeStyles.codeCardBg}`}
              >
                <div className={`px-3.5 py-1.5 border-b flex items-center justify-between text-[11px] font-mono font-semibold select-none ${themeStyles.codeCardHeader}`}>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500/90 inline-block" />
                    <span>代码示例</span>
                  </div>
                  <span className="text-[10px] opacity-70">Python</span>
                </div>
                <pre className={`p-3.5 font-mono text-xs leading-relaxed overflow-x-auto select-text font-normal ${themeStyles.codeCardText}`}>
                  {block.lines.join('\n')}
                </pre>
              </div>
            )
          }

          if (block.type === 'list') {
            const text = block.lines[0]
            // 将条目首句动作（如 "创建一个列表，存三个成绩，打印出来。" 中的 "创建一个列表"）提取并加粗着色，使要求和动作一目了然
            const commaIdx = text.search(/[，,：:]/)
            const hasLead = commaIdx > 0 && commaIdx <= 22
            const leadText = hasLead ? text.slice(0, commaIdx) : ''
            const restText = hasLead ? text.slice(commaIdx) : text

            return (
              <div
                key={`list-${bIdx}`}
                className="flex items-start space-x-3 text-xs sm:text-sm leading-relaxed my-2.5"
              >
                <span className={`w-5 h-5 rounded-lg text-[11px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5 ${themeStyles.listBadge}`}>
                  {block.meta}
                </span>
                <div className="flex-1 min-w-0 select-text break-words">
                  {hasLead ? (
                    <>
                      <strong className={`font-bold mr-0.5 ${themeStyles.listLeadBold}`}>
                        {renderArticleText(leadText)}
                      </strong>
                      <span className={themeStyles.listRestText}>
                        {renderArticleText(restText)}
                      </span>
                    </>
                  ) : (
                    <span className={themeStyles.listRestText}>
                      {renderArticleText(text)}
                    </span>
                  )}
                </div>
              </div>
            )
          }

          return (
            <p key={`text-${bIdx}`} className="leading-relaxed select-text my-1.5 break-words">
              {renderArticleText(block.lines.join('\n'))}
            </p>
          )
        })}
      </div>
    )
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
          doc_title: docContent?.name || undefined,
          section_title: currentPage?.section_title || undefined,
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
      selection: 'selection:bg-purple-200 selection:text-purple-950',
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
      asideContent: 'text-zinc-800 selection:bg-purple-200 selection:text-purple-950',
      asideMarkdown: 'prose-zinc text-zinc-800',
      asideDivider: 'border-zinc-100 text-zinc-700',
      asideNoteCard: 'bg-[#F2F2F7]/60 hover:bg-[#F2F2F7] border-black/[0.04]',
      asideNoteText: 'text-zinc-800 hover:text-purple-700',
      asideNoteInner: 'bg-white/80 text-zinc-600 border-black/[0.03]',
      asideEmptyIcon: 'bg-zinc-100 text-zinc-400',
      asideEmptyText: 'text-zinc-400',
      // 正文排版与重点强调 (亮白主题)
      taskBadge: 'bg-purple-50 text-purple-700 border border-purple-200/60 shadow-2xs',
      taskTitle: 'text-purple-950 font-bold',
      taskHeaderBorder: 'border-black/[0.06]',
      listBadge: 'bg-purple-50 text-purple-700 font-bold border border-purple-200/50 shadow-2xs',
      listLeadBold: 'text-purple-900 font-bold',
      listRestText: 'text-zinc-700',
      codeCardBg: 'bg-[#F8F9FB] border-black/[0.08]',
      codeCardHeader: 'bg-[#EEF1F6] text-zinc-700 border-black/[0.05]',
      codeCardText: 'text-zinc-900',
      // AI 伴读结构化 Markdown 样式 (亮白主题 - 典雅清爽)
      mdH1: 'text-zinc-900 bg-purple-50/50 border-purple-200/50',
      mdH2: 'text-zinc-900 border-b border-black/[0.06]',
      mdH2Badge: 'bg-purple-100 text-purple-700',
      mdH3: 'text-zinc-800',
      mdStrong: 'text-purple-950 font-bold bg-purple-50 px-1 py-0.5 rounded border border-purple-100/70',
      mdCode: 'text-purple-800 bg-purple-50/80 border border-purple-200/50',
      mdLi: 'text-zinc-700',
      mdBullet: 'bg-purple-500/80',
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
      // 正文排版与重点强调 (羊皮纸暖黄主题)
      taskBadge: 'bg-[#EAE0CE] text-[#5A3110] border border-[#D8C2A0] shadow-2xs',
      taskTitle: 'text-[#3D2514] font-bold',
      taskHeaderBorder: 'border-[#E8DEC8]',
      listBadge: 'bg-[#EAE0CE] text-[#5A3110] font-bold border border-[#D8C2A0] shadow-2xs',
      listLeadBold: 'text-[#5A3110] font-bold',
      listRestText: 'text-[#5B4734]',
      codeCardBg: 'bg-[#F3ECE0] border-[#E2D5C3]',
      codeCardHeader: 'bg-[#EAE0CE] text-[#7A4518] border-[#DFCFC0]',
      codeCardText: 'text-[#3D3024]',
      // AI 伴读结构化 Markdown 样式 (羊皮纸暖黄主题)
      mdH1: 'text-[#3D2514] bg-[#EFE5D3] border-[#DFCFC0]',
      mdH2: 'text-[#5A3110] border-b border-[#E8DEC8]',
      mdH2Badge: 'bg-[#EAE0CE] text-[#5A3110]',
      mdH3: 'text-[#7A4518]',
      mdStrong: 'text-[#5A3110] bg-[#EAE0CE]/90',
      mdCode: 'text-[#8B2500] bg-[#E8DDD0] border-[#D9CDBF]',
      mdLi: 'text-[#4F3F30]',
      mdBullet: 'bg-[#965A2C]',
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
      selection: 'selection:bg-purple-600/50 selection:text-white',
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
      asideContent: 'text-[#E5E5EA] selection:bg-purple-600/50 selection:text-white',
      asideMarkdown: 'prose-invert text-[#E5E5EA]',
      asideDivider: 'border-white/[0.08] text-[#E5E5EA]',
      asideNoteCard: 'bg-[#242426]/70 hover:bg-[#2C2C2E] border-white/[0.06]',
      asideNoteText: 'text-[#E5E5EA] hover:text-purple-400',
      asideNoteInner: 'bg-[#1C1C1E]/80 text-[#C7C7CC] border-white/[0.04]',
      asideEmptyIcon: 'bg-[#2C2C2E] text-[#8E8E93]',
      asideEmptyText: 'text-[#8E8E93]',
      // 正文排版与重点强调 (深邃暗黑主题 - 克制柔和学术级色系)
      taskBadge: 'bg-white/[0.08] text-purple-200 border border-purple-500/25 shadow-2xs',
      taskTitle: 'text-zinc-100 font-bold',
      taskHeaderBorder: 'border-white/[0.08]',
      listBadge: 'bg-white/[0.06] text-purple-200/90 font-bold border border-white/[0.08] shadow-2xs',
      listLeadBold: 'text-purple-200/95 font-bold',
      listRestText: 'text-zinc-300',
      codeCardBg: 'bg-[#18181A] border-white/[0.08]',
      codeCardHeader: 'bg-[#222225] text-zinc-300 border-white/[0.06]',
      codeCardText: 'text-zinc-200',
      // AI 伴读结构化 Markdown 样式 (深邃暗黑主题 - 优雅护眼，绝无刺眼荧光粉)
      mdH1: 'text-zinc-100 bg-white/[0.03] border-white/[0.08]',
      mdH2: 'text-zinc-100 border-b border-white/[0.08]',
      mdH2Badge: 'bg-white/[0.08] text-purple-300 border border-white/[0.08]',
      mdH3: 'text-zinc-300',
      mdStrong: 'text-white font-bold bg-white/[0.08] px-1.5 py-0.5 rounded border border-white/[0.06]',
      mdCode: 'text-purple-200/95 bg-white/[0.06] border border-white/[0.08]',
      mdLi: 'text-[#D1D1D6]',
      mdBullet: 'bg-purple-400/60',
      // 浮窗与批注弹窗
      modalContainer: 'bg-[#1C1C1E]/95 border-white/[0.1] text-[#E5E5EA]',
      modalHeader: 'border-white/[0.08] text-[#E5E5EA]',
      modalInput: 'bg-[#2C2C2E] border-white/[0.08] text-[#E5E5EA] placeholder-zinc-500',
      modalQuote: 'bg-[#242426] text-[#C7C7CC]',
      modalBtn: 'bg-[#2C2C2E] hover:bg-[#3A3A3C] text-[#E5E5EA]',
      modalCancelBtn: 'text-[#8E8E93] hover:text-[#E5E5EA] hover:bg-[#2C2C2E]',
    },
  }[appTheme]

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
    <div className={`flex-1 flex flex-col ${themeStyles.pageBg} h-screen overflow-hidden ${themeStyles.selection} relative transition-colors duration-200`}>
      
      {/* 顶部毛玻璃导航条：Apple HIG 三段式极简架构 */}
      <header className={`h-14 backdrop-blur-xl border-b px-6 flex items-center justify-between shrink-0 z-10 transition-colors duration-200 ${themeStyles.header}`}>
        
        {/* 左区：文档选择与目录侧栏切换 */}
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center space-x-1.5">
            <BookOpen className="w-4 h-4 text-purple-500 shrink-0" />
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className={`px-3 py-1.5 text-xs font-bold rounded-full focus:outline-none cursor-pointer transition-all max-w-[260px] truncate border border-black/[0.04] dark:border-white/[0.08] shadow-2xs ${themeStyles.headerSelect}`}
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id} disabled={d.status !== 'indexed'}>
                  {d.name} {d.status !== 'indexed' ? `(${d.status})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 目录开关按钮 */}
          {readViewMode === 'extracted' && (
            <button
              onClick={() => setShowTocDrawer((prev) => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border border-black/[0.04] dark:border-white/[0.08] shadow-2xs ${
                showTocDrawer
                  ? appTheme === 'dark'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-purple-100 text-purple-800 border-purple-200'
                  : themeStyles.headerBtn
              }`}
              title="展开/收起目录大纲树"
            >
              <ListTree className="w-3.5 h-3.5 opacity-80" />
              <span>目录</span>
              {docContent?.toc && docContent.toc.length > 0 && (
                <span className="text-[10px] font-mono opacity-60">
                  {docContent.toc.length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* 中区：视图模式、排版与翻页整合工具条 */}
        <div className="flex items-center space-x-2.5">
          {/* 视图模式与 aA 排版聚合分段槽 */}
          <div className={`flex items-center p-1 rounded-full border border-black/[0.04] dark:border-white/[0.08] shadow-2xs ${themeStyles.viewTrack}`}>
            <button
              onClick={() => setReadViewMode('extracted')}
              className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                readViewMode === 'extracted'
                  ? themeStyles.viewActive
                  : themeStyles.viewInactive
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>精读排版</span>
            </button>

            <button
              onClick={() => setReadViewMode('native')}
              className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                readViewMode === 'native'
                  ? themeStyles.viewActive
                  : themeStyles.viewInactive
              }`}
            >
              <FileSearch className="w-3.5 h-3.5 text-blue-400" />
              <span>原版对照</span>
            </button>

            {/* 排版 aA 触发器（仅精读可用） */}
            {readViewMode === 'extracted' && (
              <>
                <span className="w-px h-3.5 bg-black/10 dark:bg-white/10 mx-1" />
                <div className="relative" id="zhiyue-typography-btn-container">
                  <button
                    onClick={() => setShowAppearanceMenu((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-full text-xs font-serif font-bold tracking-tight transition-all flex items-center space-x-1 ${
                      showAppearanceMenu ? themeStyles.viewActive : themeStyles.viewInactive
                    }`}
                    title="排版与主题设置"
                  >
                    <Type className="w-3 h-3 opacity-70" />
                    <span>aA</span>
                  </button>

                  {/* 弹出式排版控制卡片 */}
                  {showAppearanceMenu && (
                    <div
                      id="zhiyue-appearance-menu"
                      className={`absolute left-1/2 -translate-x-1/2 top-10 w-72 backdrop-blur-2xl rounded-2xl shadow-xl border p-4 z-50 space-y-4 text-xs animate-in fade-in slide-in-from-top-2 select-none ${
                        appTheme === 'dark'
                          ? 'bg-[#242426]/95 border-white/[0.08] text-[#E5E5EA]'
                          : appTheme === 'sepia'
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
                              appTheme === 'white'
                                ? 'border-purple-500 bg-zinc-50 shadow-xs ring-1 ring-purple-500'
                                : 'border-zinc-200 hover:border-zinc-300 bg-white'
                            }`}
                          >
                            <div className="w-5 h-5 rounded-full bg-white border border-zinc-200 shadow-2xs flex items-center justify-center">
                              {appTheme === 'white' && <Check className="w-3 h-3 text-purple-600" />}
                            </div>
                            <span className="text-[11px] font-semibold text-zinc-800">纯白</span>
                          </button>

                          <button
                            onClick={() => updateAppearance({ theme: 'sepia' })}
                            className={`p-2.5 rounded-xl border flex flex-col items-center space-y-1 transition-all ${
                              appTheme === 'sepia'
                                ? 'border-purple-500 bg-[#FAF4E8] shadow-xs ring-1 ring-purple-500'
                                : 'border-[#E8DEC8] hover:border-[#D8C7AA] bg-[#FAF4E8]'
                            }`}
                          >
                            <div className="w-5 h-5 rounded-full bg-[#FAF4E8] border border-[#D8C7AA] shadow-2xs flex items-center justify-center">
                              {appTheme === 'sepia' && <Check className="w-3 h-3 text-[#965A2C]" />}
                            </div>
                            <span className="text-[11px] font-semibold text-[#5B4126]">羊皮纸</span>
                          </button>

                          <button
                            onClick={() => updateAppearance({ theme: 'dark' })}
                            className={`p-2.5 rounded-xl border flex flex-col items-center space-y-1 transition-all ${
                              appTheme === 'dark'
                                ? 'border-purple-500 bg-[#1C1C1E] shadow-xs ring-1 ring-purple-500'
                                : 'border-zinc-700 hover:border-zinc-600 bg-[#1C1C1E]'
                            }`}
                          >
                            <div className="w-5 h-5 rounded-full bg-[#1C1C1E] border border-zinc-600 shadow-2xs flex items-center justify-center">
                              {appTheme === 'dark' && <Check className="w-3 h-3 text-purple-400" />}
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
                          appTheme === 'dark' ? 'bg-[#1C1C1E]' : appTheme === 'sepia' ? 'bg-[#EAE0CE]' : 'bg-zinc-100'
                        }`}>
                          {(['sm', 'base', 'lg', 'xl'] as ReaderFontSize[]).map((size) => (
                            <button
                              key={size}
                              onClick={() => updateAppearance({ fontSize: size })}
                              className={`py-1.5 rounded-lg text-xs transition-all ${
                                appearance.fontSize === size
                                  ? appTheme === 'dark'
                                    ? 'bg-[#3A3A3C] text-white shadow-xs font-bold'
                                    : appTheme === 'sepia'
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
                          appTheme === 'dark' ? 'bg-[#1C1C1E]' : appTheme === 'sepia' ? 'bg-[#EAE0CE]' : 'bg-zinc-100'
                        }`}>
                          <button
                            onClick={() => updateAppearance({ fontFamily: 'sans' })}
                            className={`py-1.5 rounded-lg text-xs transition-all ${
                              appearance.fontFamily === 'sans'
                                ? appTheme === 'dark'
                                : appTheme === 'sepia'
                                ? 'bg-[#FAF4E8] text-[#3D3024] shadow-xs font-bold'
                                : 'bg-white text-zinc-900 shadow-xs font-bold'
                            }`}
                          >
                            黑体 (无衬线)
                          </button>
                          <button
                            onClick={() => updateAppearance({ fontFamily: 'serif' })}
                            className={`py-1.5 rounded-lg text-xs font-serif transition-all ${
                              appearance.fontFamily === 'serif'
                                ? appTheme === 'dark'
                                  ? 'bg-[#3A3A3C] text-white shadow-xs font-bold'
                                  : appTheme === 'sepia'
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
                          appTheme === 'dark' ? 'bg-[#1C1C1E]' : appTheme === 'sepia' ? 'bg-[#EAE0CE]' : 'bg-zinc-100'
                        }`}>
                          {(['normal', 'relaxed', 'loose'] as ReaderLineHeight[]).map((lh) => (
                            <button
                              key={lh}
                              onClick={() => updateAppearance({ lineHeight: lh })}
                              className={`py-1.5 rounded-lg text-xs transition-all ${
                                appearance.lineHeight === lh
                                  ? appTheme === 'dark'
                                    ? 'bg-[#3A3A3C] text-white shadow-xs font-bold'
                                    : appTheme === 'sepia'
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
              </>
            )}
          </div>

          {/* 翻页控制器 */}
          {readViewMode === 'extracted' && totalPages > 0 && (
            <div className={`flex items-center p-0.5 rounded-full border border-black/[0.04] dark:border-white/[0.08] shadow-2xs ${themeStyles.viewTrack}`}>
              <button
                onClick={() => setCurrentPageIdx((p) => Math.max(0, p - 1))}
                disabled={currentPageIdx <= 0}
                className="w-6 h-6 rounded-full flex items-center justify-center disabled:opacity-20 active:scale-90 transition-all opacity-70 hover:opacity-100"
                title="上一页"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <span className={`px-2 text-xs font-mono font-medium select-none ${themeStyles.pageInfo}`}>
                {currentPageIdx + 1} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPageIdx((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPageIdx >= totalPages - 1}
                className="w-6 h-6 rounded-full flex items-center justify-center disabled:opacity-20 active:scale-90 transition-all opacity-70 hover:opacity-100"
                title="下一页"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* 右区：AI 伴读折叠/展开开关（低调雅致玻璃态设计） */}
        <div>
          <button
            onClick={() => setShowAiCompanion((prev) => !prev)}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-2xs transition-all active:scale-95 border ${
              showAiCompanion
                ? appTheme === 'dark'
                  ? 'bg-purple-500/15 text-purple-200 border-purple-500/30'
                  : appTheme === 'sepia'
                  ? 'bg-[#EAE0CE] text-[#5A3110] border-[#D8C2A0]'
                  : 'bg-purple-50 text-purple-700 border-purple-200'
                : `${themeStyles.headerBtn} border-black/[0.04] dark:border-white/[0.08]`
            }`}
            title={showAiCompanion ? '收起右侧伴读，进入全屏纯净阅读' : '展开右侧 AI 伴读分析面板'}
          >
            <Sparkles className={`w-3.5 h-3.5 ${showAiCompanion ? 'text-purple-400' : 'opacity-60'}`} />
            <span>{showAiCompanion ? 'AI 伴读' : '展开伴读'}</span>
          </button>
        </div>

      </header>

      {/* 核心工作区 */}
      <div className="flex-1 flex overflow-hidden p-5 gap-5 relative">

        {/* 目录大纲抽屉 (当展开时呈现为优雅的浮动大纲树，避免挤压正文阅读排版) */}
        {showTocDrawer && readViewMode === 'extracted' && (
          <aside className={`absolute left-5 top-5 bottom-5 z-20 w-80 ${themeStyles.tocContainer} rounded-3xl shadow-2xl border flex flex-col overflow-hidden backdrop-blur-xl transition-all duration-300`}>
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
        <section className={`flex-1 min-w-0 ${themeStyles.container} rounded-3xl shadow-sm border flex flex-col overflow-hidden relative transition-colors duration-200`}>
          
          {readViewMode === 'extracted' ? (
            /* 视图 A: 精读排版视图（支持划词操作与 Apple Books 护眼主题） */
            <>
              {/* 页眉元信息 */}
              <div className={`px-8 py-3.5 border-b flex items-center justify-between shrink-0 transition-all duration-700 ${themeStyles.headerSection} ${
                pulsingTarget && pulsingTarget.page === currentPageIdx
                  ? 'bg-blue-500/15 border-blue-500/40 shadow-[0_4px_20px_rgba(59,130,246,0.15)]'
                  : ''
              }`}>
                <div className="flex items-center space-x-2 text-xs font-semibold">
                  <FileText className={`w-3.5 h-3.5 ${pulsingTarget && pulsingTarget.page === currentPageIdx ? 'text-blue-500 animate-bounce' : 'text-blue-500'}`} />
                  <span className={`truncate max-w-sm ${themeStyles.headerTitle} ${pulsingTarget && pulsingTarget.page === currentPageIdx ? 'text-blue-600 dark:text-blue-400 font-bold' : ''}`}>
                    {currentPage?.section_title ? currentPage.section_title : `第 ${currentPage?.page_number || 1} 页`}
                  </span>
                  {pulsingTarget && pulsingTarget.page === currentPageIdx && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500 text-white font-medium shadow-xs animate-pulse">
                      📍 溯源已定位
                    </span>
                  )}
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
                className={`flex-1 overflow-y-auto px-6 py-8 md:px-12 select-text cursor-text ${themeStyles.selection}`}
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
                  <div className="max-w-3xl mx-auto w-full">
                    <article className={`max-w-none ${themeStyles.article} ${fontFamilyClass} ${fontSizeClass} ${lineHeightClass} select-text cursor-text transition-all duration-700 ${
                      pulsingTarget && pulsingTarget.page === currentPageIdx
                        ? 'ring-2 ring-blue-500/40 rounded-2xl p-5 bg-blue-500/[0.02] shadow-[0_0_35px_rgba(59,130,246,0.16)]'
                        : ''
                    }`}>
                      {renderStructuredContent(currentPage.content)}
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
                  </div>
                )}
              </div>
            </>
          ) : (
            /* 视图 B: 原版 PDF 高清视觉版面对照 */
            <div className="flex-1 h-full w-full bg-zinc-100 dark:bg-[#151516] flex flex-col transition-colors">
              {fileInfo && isPdf ? (
                <iframe
                  src={`${fileInfo.file_url}#toolbar=1&navpanes=0`}
                  title="PDF 原版视图"
                  className="w-full h-full border-none rounded-3xl"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 text-zinc-400">
                  <div className="w-14 h-14 rounded-3xl bg-white dark:bg-white/10 shadow-sm flex items-center justify-center text-blue-500 dark:text-blue-400">
                    <FileSearch className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">当前文档非 PDF 原版格式</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm">
                      原版图文对照优先针对 PDF 提供高保真版面渲染，Word 与文本格式建议使用「精读排版」进行舒适沉浸阅读。
                    </p>
                  </div>
                  <button
                    onClick={() => setReadViewMode('extracted')}
                    className="px-4 py-2 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition active:scale-95 flex items-center space-x-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>返回精读排版</span>
                  </button>
                </div>
              )}
            </div>
          )}

        </section>

        {/* 右侧：AI 伴读与深度分析面板（支持一键收起/展开） */}
        {showAiCompanion && (
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
              ) : mode === 'chat' ? (
                <button
                  onClick={() => {
                    setCompanionMessages([
                      {
                        id: 'init_' + Date.now(),
                        role: 'assistant',
                        content: '对话已重置。您可以随时针对当前文档继续深入追问。',
                      },
                    ])
                    setCompanionConvId(null)
                    if (selectedDocId) {
                      localStorage.removeItem(`zhiyue_companion_chat_${selectedDocId}`)
                    }
                    showToast('已开启新一轮伴读对话')
                  }}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-200 hover:bg-purple-500/25 active:scale-95 transition-all flex items-center space-x-1.5 border border-purple-500/20 dark:border-purple-400/30 shadow-2xs"
                  title="清空当前伴读对话历史"
                >
                  <RefreshCw className="w-3 h-3 text-purple-600 dark:text-purple-300" />
                  <span>新对话</span>
                </button>
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
            <div className={`grid grid-cols-5 ${themeStyles.asideTabTrack} p-1 rounded-2xl gap-0.5 text-xs font-semibold`}>
              {MODE_TABS.map((tab) => {
                const active = mode === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setMode(tab.id)}
                    className={`flex items-center justify-center space-x-0.5 py-1.5 rounded-xl transition-all ${
                      active
                        ? themeStyles.asideTabActive
                        : themeStyles.asideTabInactive
                    }`}
                  >
                    {tab.icon}
                    <span className="text-[10px] truncate">{tab.id === 'notes' ? `笔记 (${annotations.length})` : tab.label}</span>
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
                {/* 顶栏控制：划线统计、四色过滤条与 AI 串联解读入口 */}
                <div className={`pb-3 border-b space-y-2.5 shrink-0 ${themeStyles.asideDivider}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <span className={`text-xs font-bold ${themeStyles.asideTitle}`}>
                        已收录 {annotations.length} 条划线
                      </span>
                      {annotations.length > 0 && (
                        <span className="text-[10px] opacity-60 font-mono">
                          (🟡{yellowCount} 🟢{greenCount} 🟣{purpleCount} 🔵{blueCount})
                        </span>
                      )}
                    </div>

                    {annotations.length > 0 && (
                      <button
                        onClick={handleSynthesizeNotes}
                        disabled={synthesizing}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-xs shadow-purple-500/25 active:scale-95 transition-all flex items-center space-x-1"
                        title="将全书的重点、理解、思考与疑问交由 AI 深度串联与攻坚答疑"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>AI 深度串联</span>
                      </button>
                    )}
                  </div>

                  {/* 四色语义化分段过滤控制器 */}
                  {annotations.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-1 overflow-x-auto pb-0.5 text-[11px] font-medium no-scrollbar">
                        <button
                          onClick={() => setNoteFilterColor('all')}
                          className={`px-2.5 py-1 rounded-xl transition-all shrink-0 ${
                            noteFilterColor === 'all'
                              ? 'bg-purple-600 text-white font-bold shadow-2xs'
                              : 'bg-black/5 dark:bg-white/5 opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10'
                          }`}
                        >
                          全部 ({annotations.length})
                        </button>

                        {(['yellow', 'green', 'purple', 'blue'] as HighlightColor[]).map((c) => {
                          const meta = HIGHLIGHT_SEMANTICS[c]
                          const count = annotations.filter((a) => a.color === c).length
                          const active = noteFilterColor === c
                          return (
                            <button
                              key={c}
                              onClick={() => setNoteFilterColor(c)}
                              className={`px-2 py-1 rounded-xl transition-all shrink-0 flex items-center space-x-1 ${
                                active
                                  ? `${meta.chip} font-bold shadow-2xs ring-1 ring-current`
                                  : 'bg-black/5 dark:bg-white/5 opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10'
                              }`}
                              title={meta.desc}
                            >
                              <span>{meta.emoji}</span>
                              <span>{meta.label}</span>
                              <span className="opacity-70 font-mono text-[10px]">({count})</span>
                            </button>
                          )
                        })}
                      </div>

                      {/* 仅当存在自定义标签时，渲染轻量级标签过滤栏（精简而实用，绝无多余冗余） */}
                      {docTags.length > 0 && (
                        <div className="flex items-center space-x-1.5 overflow-x-auto pb-0.5 text-[10px] font-medium no-scrollbar pt-0.5 border-t border-black/[0.04] dark:border-white/[0.04]">
                          <span className="text-[10px] opacity-40 shrink-0 font-medium">标签:</span>
                          <button
                            onClick={() => setSelectedTag(null)}
                            className={`px-2 py-0.5 rounded-lg transition-all shrink-0 ${
                              selectedTag === null
                                ? 'bg-purple-600/15 text-purple-700 dark:text-purple-300 font-bold border border-purple-500/30'
                                : 'bg-black/5 dark:bg-white/5 opacity-60 hover:opacity-100'
                            }`}
                          >
                            全部
                          </button>
                          {docTags.map((tag) => {
                            const isSelected = selectedTag === tag
                            return (
                              <button
                                key={tag}
                                onClick={() => setSelectedTag(isSelected ? null : tag)}
                                className={`px-2 py-0.5 rounded-lg transition-all shrink-0 flex items-center space-x-0.5 ${
                                  isSelected
                                    ? 'bg-purple-600 text-white font-bold shadow-2xs'
                                    : 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 hover:bg-purple-500/20'
                                }`}
                              >
                                <span>#{tag}</span>
                                <span className="opacity-70 font-mono text-[9px]">({tagCounts[tag] || 0})</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 列表渲染 */}
                {filteredAnnotations.length === 0 ? (
                  annotations.length === 0 ? (
                    <div className={`h-full flex flex-col items-center justify-center text-center p-8 space-y-3 ${themeStyles.asideEmptyText}`}>
                      <div className={`w-12 h-12 rounded-3xl ${themeStyles.asideEmptyIcon} flex items-center justify-center`}>
                        <Bookmark className="w-6 h-6" />
                      </div>
                      <h3 className={`text-sm font-bold ${themeStyles.asideTitle}`}>暂无高亮划线</h3>
                      <p className="text-xs max-w-[220px]">
                        在正文中选中任意文字，点击 🟡重点、🟢理解、🟣思考、🔵疑问 即可划线；也可以在 AI 解读后点击「📌 存入笔记」。
                      </p>
                    </div>
                  ) : (
                    <div className={`h-48 flex flex-col items-center justify-center text-center p-6 space-y-2 ${themeStyles.asideEmptyText}`}>
                      <div className="w-8 h-8 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center opacity-60">
                        <Bookmark className="w-4 h-4" />
                      </div>
                      <p className="text-xs">
                        {selectedTag ? `标签 #${selectedTag} 下暂无对应划线` : '该分类下暂无划线标注'}
                      </p>
                      <button
                        onClick={() => {
                          setNoteFilterColor('all')
                          setSelectedTag(null)
                        }}
                        className="text-[11px] text-purple-600 dark:text-purple-400 underline font-medium"
                      >
                        重置所有筛选
                      </button>
                    </div>
                  )
                ) : (
                  <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                    {filteredAnnotations.map((a) => {
                      const meta = HIGHLIGHT_SEMANTICS[a.color] || HIGHLIGHT_SEMANTICS.yellow

                      return (
                        <div
                          key={a.id}
                          className={`${themeStyles.asideNoteCard} ${meta.border} ${meta.bgTint} rounded-2xl p-3 border space-y-2.5 transition-all group hover:shadow-xs`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center space-x-1 ${meta.chip}`}>
                                <span>{meta.emoji}</span>
                                <span>{meta.label} · P.{a.page_index + 1}</span>
                              </span>
                              {a.tags && a.tags.length > 0 && (
                                <div className="flex items-center space-x-1">
                                  {a.tags.map((tag) => (
                                    <button
                                      key={tag}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSelectedTag(selectedTag === tag ? null : tag)
                                      }}
                                      className={`text-[9px] px-1.5 py-0.2 rounded-md transition-colors ${
                                        selectedTag === tag
                                          ? 'bg-purple-600 text-white font-bold'
                                          : 'bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 border border-purple-500/20'
                                      }`}
                                      title={`点击筛选 #${tag}`}
                                    >
                                      #{tag}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <span className="text-[10px] opacity-60 font-mono">
                                {a.created_at ? new Date(a.created_at).toLocaleDateString() : ''}
                              </span>
                            </div>

                            <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleJumpToAnnotation(a)}
                                className="px-2 py-0.5 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-[11px] font-semibold text-current shadow-2xs active:scale-95 transition-all flex items-center space-x-0.5"
                                title="平滑定位并闪烁高亮正文"
                              >
                                <span>🎯 定位</span>
                              </button>
                              <button
                                onClick={() => {
                                  setActiveAnnotation(a)
                                  setEditingNoteText(a.note || '')
                                }}
                                className="w-6 h-6 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center shadow-2xs transition-colors"
                                title="编写/修改批注"
                              >
                                <Type className="w-3 h-3 opacity-70 hover:opacity-100" />
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
                            onClick={() => handleJumpToAnnotation(a)}
                            className={`text-xs font-medium leading-relaxed pl-1 cursor-pointer transition-colors ${themeStyles.asideNoteText}`}
                            title="点击可直接定位至正文"
                          >
                            “{a.selected_text}”
                          </div>

                          {a.note && (
                            <div className={`text-[11px] rounded-xl p-2.5 border space-y-1 ${themeStyles.asideNoteInner}`}>
                              <div className="flex items-center justify-between font-bold text-amber-600 dark:text-amber-400">
                                <span className="flex items-center space-x-1">
                                  <span>✍️ 我的思考与批注</span>
                                </span>
                                <button
                                  onClick={() => {
                                    setActiveAnnotation(a)
                                    setEditingNoteText(a.note || '')
                                  }}
                                  className="text-[10px] opacity-70 hover:opacity-100 underline"
                                >
                                  修改
                                </button>
                              </div>
                              <p className="leading-relaxed whitespace-pre-line">{a.note}</p>
                            </div>
                          )}

                          {a.ai_insight && (
                            <div className="text-[11px] text-purple-700 dark:text-purple-300 bg-purple-500/10 dark:bg-purple-950/30 rounded-xl p-2.5 border border-purple-500/20 space-y-1">
                              <span className="font-bold">💡 沉淀的 AI 深度解析：</span>
                              <p className="line-clamp-4 leading-relaxed opacity-90 whitespace-pre-line">
                                {a.ai_insight}
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : mode === 'chat' ? (
              <div className="h-full flex flex-col justify-between -m-3">
                {/* 伴读追问多轮消息流 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {companionMessages.map((msg, idx) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-purple-600 text-white rounded-tr-xs shadow-2xs'
                            : `${themeStyles.asideNoteCard} rounded-tl-xs border space-y-2`
                        }`}
                      >
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-xs max-w-none dark:prose-invert">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}

                        {msg.isStreaming && (
                          <span className="inline-block w-1.5 h-3 ml-1 bg-purple-500 animate-pulse rounded-full align-middle" />
                        )}

                        {/* 溯源定位微胶囊 (Citations) */}
                        {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                          <div className="pt-2 border-t border-black/[0.05] dark:border-white/[0.06] flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium mr-0.5 select-none">
                              溯源原文:
                            </span>
                            {msg.citations.map((c, cIdx) => (
                              <button
                                key={cIdx}
                                onClick={() => handleJumpToCitation(c)}
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-blue-500/10 hover:bg-blue-500/20 active:scale-95 text-blue-600 dark:text-blue-300 border border-blue-500/20 transition-all group"
                                title={c.text_preview ? `P.${c.page_number || 1} 预览：\n${c.text_preview.slice(0, 100)}...` : undefined}
                              >
                                <Compass className="w-2.5 h-2.5 text-blue-500 group-hover:rotate-45 transition-transform" />
                                <span>P.{c.page_number || 1}{c.section_title ? ` · ${c.section_title.slice(0, 10)}` : ''}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {msg.role === 'assistant' && !msg.isStreaming && msg.id !== 'init' && (
                          <div className="flex items-center justify-end pt-1.5 border-t border-black/[0.04] dark:border-white/[0.06]">
                            <button
                              onClick={() => handleSaveCompanionNote(msg, idx)}
                              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                                savedCompanionNoteIds.has(msg.id)
                                  ? 'bg-purple-600/20 text-purple-700 dark:text-purple-300 font-bold'
                                  : 'bg-black/5 dark:bg-white/5 hover:bg-purple-500/15 text-purple-600 dark:text-purple-400'
                              }`}
                              title="将本条解析保存为读书笔记"
                            >
                              <Bookmark className="w-3 h-3 text-purple-500" />
                              <span>{savedCompanionNoteIds.has(msg.id) ? '✓ 已存入笔记' : '📌 存入读书笔记'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={companionEndRef} />
                </div>

                {/* 底部即时追问输入框 */}
                <div className="p-3 border-t border-black/[0.06] dark:border-white/[0.08] shrink-0">
                  <div className={`flex items-center space-x-2 rounded-2xl p-1.5 pl-3 border focus-within:ring-2 focus-within:ring-purple-500/20 ${themeStyles.modalInput}`}>
                    <input
                      type="text"
                      value={companionInput}
                      onChange={(e) => setCompanionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendCompanionChat()
                        }
                      }}
                      placeholder="针对本文即时深入追问... (Enter 发送)"
                      disabled={companionGenerating}
                      className="flex-1 bg-transparent text-xs focus:outline-none placeholder:opacity-40"
                    />
                    <button
                      type="button"
                      onClick={() => handleSendCompanionChat()}
                      disabled={!companionInput.trim() || companionGenerating}
                      className="w-7 h-7 rounded-xl bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center disabled:opacity-40 transition-all shrink-0 active:scale-95 shadow-2xs"
                    >
                      {companionGenerating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
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
                  {mode === 'outline' && (docContent?.toc?.length || 0) > 0 && (
                    <button
                      onClick={() => setMindmapModalOpen(true)}
                      className="mt-2 px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/20 text-xs font-semibold flex items-center space-x-1.5 active:scale-95 transition"
                    >
                      <Brain className="w-3.5 h-3.5" />
                      <span>查看原生目录思维脑图</span>
                    </button>
                  )}
                </div>
              )
            ) : (
              <div className="select-text cursor-text">
                {/* 思维大纲专享：脑图视图切换与全屏画布触发栏 */}
                {mode === 'outline' && (
                  <div className="mb-3 p-2.5 rounded-2xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-transparent dark:from-purple-950/30 dark:via-indigo-950/20 dark:to-transparent border border-purple-500/20 flex items-center justify-between select-none">
                    <div className="flex items-center space-x-2 text-xs font-bold text-purple-700 dark:text-purple-300">
                      <Brain className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span>思维脑图视图</span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <div className="flex items-center bg-black/5 dark:bg-white/10 p-0.5 rounded-xl border border-black/5 dark:border-white/10">
                        <button
                          onClick={() => setOutlineSubView('list')}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition ${
                            outlineSubView === 'list'
                              ? 'bg-white dark:bg-zinc-800 text-purple-600 dark:text-purple-300 shadow-2xs'
                              : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400'
                          }`}
                        >
                          列表
                        </button>
                        <button
                          onClick={() => setOutlineSubView('tree')}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition ${
                            outlineSubView === 'tree'
                              ? 'bg-white dark:bg-zinc-800 text-purple-600 dark:text-purple-300 shadow-2xs'
                              : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400'
                          }`}
                        >
                          脑图
                        </button>
                      </div>

                      <button
                        onClick={() => setMindmapModalOpen(true)}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-purple-600 hover:bg-purple-700 active:scale-95 text-white transition shadow-xs"
                        title="开启全屏交互式思维脑图画布"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>全屏脑图</span>
                      </button>
                    </div>
                  </div>
                )}

                {annotations.length > 0 && (
                  <div
                    onClick={() => setMode('notes')}
                    className="mb-3.5 px-3 py-2 rounded-2xl bg-purple-500/[0.08] dark:bg-purple-950/30 border border-purple-500/20 flex items-center justify-between cursor-pointer hover:bg-purple-500/[0.12] transition-colors group select-none text-xs"
                    title="点击前往读书笔记本，查看四色划线或一键 AI 串联解读"
                  >
                    <div className="flex items-center space-x-1.5 text-purple-700 dark:text-purple-300 font-medium">
                      <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                      <span>已在本文档标记 {annotations.length} 处四色划线</span>
                      <span className="text-[10px] opacity-70 font-mono">
                        (🟡{yellowCount} 🟢{greenCount} 🟣{purpleCount} 🔵{blueCount})
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 group-hover:translate-x-0.5 transition-transform flex items-center">
                      <span>前往串联</span>
                      <ChevronRight className="w-3 h-3 ml-0.5" />
                    </span>
                  </div>
                )}
                {mode === 'outline' && outlineSubView === 'tree' ? (
                  <div className="h-[460px] w-full rounded-2xl overflow-hidden my-2 shadow-xs">
                    <MindmapModal
                      isOpen={true}
                      isInline={true}
                      docTitle={docContent?.name || ''}
                      markdownOutline={summaries['outline']}
                      toc={docContent?.toc}
                      pages={docContent?.pages}
                      onNavigateToPage={(p) => {
                        setCurrentPageIdx(p)
                        leftContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
                        triggerPulsingGlow(p)
                      }}
                      onClose={() => {}}
                    />
                  </div>
                ) : (
                  <CustomMarkdownRenderer
                    content={summaries[mode]}
                    themeStyles={themeStyles}
                    annotations={annotations}
                    onAnnoClick={(a) => {
                      setActiveAnnotation(a)
                      setEditingNoteText(a.note || '')
                    }}
                    pulsingAnnoId={pulsingAnnoId}
                  />
                )}
                {generating && (
                  <span className="inline-block w-1.5 h-4 ml-1 bg-purple-500 animate-pulse rounded-full align-middle" />
                )}
              </div>
            )}
          </div>

        </aside>
        )}

      </div>

      {/* 划词悬浮 iOS 胶囊工具栏 (Highlight Floating Action Tooltip) */}
      {tooltip.show && (
        <div
          id="zhiyue-highlight-tooltip"
          style={{ top: tooltip.y, left: tooltip.x }}
          className="fixed z-50 flex items-center bg-zinc-900/90 text-white backdrop-blur-md px-2 py-1.5 rounded-full shadow-2xl border border-white/10 space-x-1.5 animate-fade-in select-none"
        >
          {/* 四色高亮划线按钮 (支持全局快捷键 1/2/3/4) */}
          <div className="flex items-center space-x-1.5 px-1.5 py-0.5">
            <button
              onClick={() => handleCreateHighlight('yellow')}
              className="group/btn relative w-4 h-4 rounded-full bg-amber-400 hover:scale-125 active:scale-95 transition-all shadow-xs border border-white/20 flex items-center justify-center"
              title="🟡 标记重点 (快捷键 1)"
            >
              <span className="text-[8px] font-black text-amber-950 opacity-0 group-hover/btn:opacity-100 select-none">1</span>
            </button>
            <button
              onClick={() => handleCreateHighlight('green')}
              className="group/btn relative w-4 h-4 rounded-full bg-emerald-400 hover:scale-125 active:scale-95 transition-all shadow-xs border border-white/20 flex items-center justify-center"
              title="🟢 标记理解 (快捷键 2)"
            >
              <span className="text-[8px] font-black text-emerald-950 opacity-0 group-hover/btn:opacity-100 select-none">2</span>
            </button>
            <button
              onClick={() => handleCreateHighlight('purple')}
              className="group/btn relative w-4 h-4 rounded-full bg-purple-400 hover:scale-125 active:scale-95 transition-all shadow-xs border border-white/20 flex items-center justify-center"
              title="🟣 记录思考 (快捷键 3)"
            >
              <span className="text-[8px] font-black text-purple-950 opacity-0 group-hover/btn:opacity-100 select-none">3</span>
            </button>
            <button
              onClick={() => handleCreateHighlight('blue')}
              className="group/btn relative w-4 h-4 rounded-full bg-blue-400 hover:scale-125 active:scale-95 transition-all shadow-xs border border-white/20 flex items-center justify-center"
              title="🔵 记录疑问 (快捷键 4)"
            >
              <span className="text-[8px] font-black text-blue-950 opacity-0 group-hover/btn:opacity-100 select-none">4</span>
            </button>
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
            onClick={() => {
              const text = tooltip.selectedText
              setTooltip((prev) => ({ ...prev, show: false }))
              handleSendCompanionChat(`请结合当前文档，帮我深入解析这一段重点内容与代码含义：「${text}」`)
            }}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs hover:bg-white/15 active:scale-95 transition-all text-purple-300 font-medium"
            title="在右侧伴读面板向 AI 发起即时追问"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>问伴读</span>
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
              <div className="select-text cursor-text">
                <CustomMarkdownRenderer content={inlineResult.content} themeStyles={themeStyles} />
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

            {/* 自定义知识标签（精炼实用，回车即加） */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs opacity-75">
                <label className="font-semibold flex items-center space-x-1">
                  <Tag className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>知识标签：</span>
                </label>
                <span className="text-[10px] opacity-60">输入标签后按回车添加</span>
              </div>

              {/* 标签小药丸与内联输入框 */}
              <div className={`p-2 rounded-2xl border flex flex-wrap gap-1.5 items-center min-h-[38px] ${themeStyles.modalInput}`}>
                {editingTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                  >
                    <span>#{tag}</span>
                    <button
                      type="button"
                      onClick={() => setEditingTags((prev) => prev.filter((t) => t !== tag))}
                      className="hover:text-rose-500 ml-0.5 transition-colors"
                      title="移除标签"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagInputText}
                  onChange={(e) => setTagInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault()
                      const val = tagInputText.trim().replace(/^#/, '')
                      if (val && !editingTags.includes(val)) {
                        setEditingTags((prev) => [...prev, val])
                      }
                      setTagInputText('')
                    }
                  }}
                  placeholder={editingTags.length === 0 ? "输入标签名按回车，如: 考点、面试..." : "添加更多..."}
                  className="flex-1 min-w-[120px] bg-transparent text-xs px-1 py-0.5 focus:outline-none placeholder:opacity-50"
                />
              </div>

              {/* 常用建议药丸（一键点击追加） */}
              <div className="flex items-center space-x-1.5 text-[10px] opacity-70">
                <span className="shrink-0 opacity-60">常用建议:</span>
                {['考点', '面试', '实操', '概念'].filter((p) => !editingTags.includes(p)).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setEditingTags((prev) => [...prev, preset])}
                    className="px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/5 hover:bg-purple-500/15 hover:text-purple-600 dark:hover:text-purple-300 transition-colors"
                  >
                    +{preset}
                  </button>
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

      {/* AI 深度串联解读全屏弹窗 */}
      {synthesisModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-md animate-fade-in select-none">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white dark:bg-[#1C1C1E] rounded-3xl shadow-2xl border border-black/[0.08] dark:border-white/[0.12] overflow-hidden flex flex-col max-h-[82vh] animate-scale-in"
          >
            {/* 弹窗头部 */}
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-white/[0.08] flex items-center justify-between bg-zinc-50/50 dark:bg-white/[0.02]">
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-2xs">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    AI 划线深度串联与攻坚解读
                  </h3>
                </div>
                <div className="flex items-center space-x-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                  <span>《{docContent?.name || '当前文档'}》</span>
                  <span>·</span>
                  <span>共串联 {annotations.length} 处四色划线 (🟡{yellowCount} 🟢{greenCount} 🟣{purpleCount} 🔵{blueCount})</span>
                </div>
              </div>

              <button
                onClick={() => setSynthesisModalOpen(false)}
                className="w-7 h-7 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 flex items-center justify-center text-zinc-500 dark:text-zinc-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 弹窗内容展示区 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 select-text cursor-text text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {synthesisError ? (
                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-xs text-rose-600 dark:text-rose-400 space-y-2">
                  <div className="font-bold">生成异常</div>
                  <p>{synthesisError}</p>
                  <button
                    onClick={handleSynthesizeNotes}
                    className="px-3 py-1 bg-rose-600 text-white rounded-lg font-semibold active:scale-95 transition-all"
                  >
                    重新发起串联
                  </button>
                </div>
              ) : !synthesisContent && synthesizing ? (
                <div className="h-64 flex flex-col items-center justify-center space-y-3 text-zinc-400">
                  <div className="w-12 h-12 rounded-3xl bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400 animate-pulse">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-semibold">
                    正在深度串联 🟡重点、🟢理解、🟣思考、🔵疑问 形成全景知识网...
                  </span>
                </div>
              ) : (
                <div>
                  <CustomMarkdownRenderer content={synthesisContent || ''} themeStyles={themeStyles} />
                  {synthesizing && (
                    <span className="inline-block w-1.5 h-4 ml-1 bg-purple-500 animate-pulse rounded-full align-middle" />
                  )}
                </div>
              )}
            </div>

            {/* 弹窗底部操作条 */}
            <div className="px-6 py-3 border-t border-zinc-100 dark:border-white/[0.08] flex items-center justify-between bg-zinc-50/50 dark:bg-white/[0.02] text-xs">
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-400">
                  Local-First AI 知识合成
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {synthesisContent && (
                  <>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(synthesisContent)
                        setCopiedSynthesis(true)
                        setTimeout(() => setCopiedSynthesis(false), 2000)
                      }}
                      className="px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-zinc-700 dark:text-zinc-200 font-semibold active:scale-95 transition-all flex items-center space-x-1 shadow-2xs"
                    >
                      {copiedSynthesis ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSynthesis ? '已复制' : '复制全文'}</span>
                    </button>

                    <button
                      onClick={handleExportSynthesis}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold active:scale-95 transition-all flex items-center space-x-1 shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>导出 Markdown</span>
                    </button>
                  </>
                )}

                <button
                  onClick={handleSynthesizeNotes}
                  disabled={synthesizing}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-300 font-medium active:scale-95 transition-all flex items-center space-x-1 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${synthesizing ? 'animate-spin' : ''}`} />
                  <span>重新解读</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. 全屏沉浸思维脑图画布模态窗 */}
      <MindmapModal
        isOpen={mindmapModalOpen}
        onClose={() => setMindmapModalOpen(false)}
        docTitle={docContent?.name || ''}
        markdownOutline={summaries['outline']}
        toc={docContent?.toc}
        pages={docContent?.pages}
        onNavigateToPage={(p) => {
          setCurrentPageIdx(p)
          leftContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
          triggerPulsingGlow(p)
        }}
      />

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
