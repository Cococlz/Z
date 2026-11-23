import React, { useState, useEffect, useRef } from 'react'
import {
  Search,
  X,
  FileText,
  Sparkles,
  BookOpen,
  MessageSquare,
  ArrowRight,
  Loader2,
  SearchX,
} from 'lucide-react'
import { useDocStore } from '../stores/docStore'

export interface SearchResultItem {
  id: string
  doc_id: string
  doc_name: string
  file_type: string
  chunk_index: number
  page_number: number
  section_title: string
  snippet: string
  score: number
  match_type: 'semantic' | 'keyword' | 'document_title'
}

interface SpotlightModalProps {
  isOpen: boolean
  onClose: () => void
  backendUrl: string
  onNavigateToReader: (docId: string, pageIdx: number) => void
  onNavigateToChat: (docId?: string, query?: string) => void
}

const QUICK_TAGS = ['本地存储原理', 'Map-Reduce', '向量化检索', '格式转换', '隐私安全', '原版图文对照']

export const SpotlightModal: React.FC<SpotlightModalProps> = ({
  isOpen,
  onClose,
  backendUrl,
  onNavigateToReader,
  onNavigateToChat,
}) => {
  const documents = useDocStore((s) => s.documents)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 1. 自动聚焦与初始化
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults([])
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // 2. 防抖实时混合检索 (250ms)
  useEffect(() => {
    if (!isOpen || !backendUrl) return

    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(
          `${backendUrl}/api/v1/search?q=${encodeURIComponent(trimmed)}&limit=12`
        )
        if (resp.ok) {
          const data = await resp.json()
          setResults(data.results || [])
          setSelectedIndex(0)
        }
      } catch (err) {
        console.error('全局聚焦搜索失败', err)
      } finally {
        setLoading(false)
      }
    }, 220)

    return () => clearTimeout(timer)
  }, [query, isOpen, backendUrl])

  // 3. 键盘上下切换与回车直达
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) =>
          results.length > 0 ? (prev - 1 + results.length) % results.length : 0
        )
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (results.length > 0 && results[selectedIndex]) {
          const target = results[selectedIndex]
          handleOpenInReader(target)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, results, selectedIndex])

  // 4. 键盘上下切换时自动滚动可视区域
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedIndex])

  if (!isOpen) return null

  const handleOpenInReader = (item: SearchResultItem) => {
    onClose()
    const pageIdx = Math.max(0, (item.page_number || 1) - 1)
    onNavigateToReader(item.doc_id, pageIdx)
  }

  const handleAskInChat = (item: SearchResultItem) => {
    onClose()
    onNavigateToChat(item.doc_id, query)
  }

  // 高亮搜索词片段
  const renderHighlightedSnippet = (snippet: string, term: string) => {
    if (!term.trim()) return snippet
    const parts = snippet.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === term.toLowerCase() ? (
        <mark key={i} className="bg-amber-200/90 text-amber-950 font-semibold rounded-xs px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    )
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/35 backdrop-blur-md animate-fade-in font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-black/[0.08] overflow-hidden flex flex-col max-h-[75vh] animate-scale-in"
      >
        {/* 顶部搜索输入框 */}
        <div className="flex items-center px-5 py-4 border-b border-zinc-100 space-x-3 bg-white/60">
          <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-purple-600" /> : <Search className="w-4 h-4" />}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索全库文段、核心概念或提问... (↑↓ 选择，↵ 直达)"
            className="flex-1 bg-transparent text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none font-medium"
          />

          {query && (
            <button
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              className="w-6 h-6 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-400 active:scale-90 transition-all mr-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="flex items-center space-x-1">
            <kbd className="px-2 py-1 bg-zinc-100 border border-zinc-200 rounded-lg text-[10px] font-mono font-semibold text-zinc-500 shadow-2xs">
              ESC
            </kbd>
          </div>
        </div>

        {/* 主体结果滚动区 */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-1">
          {/* 状态 1: 输入为空时的推荐标签与文档快速通道 */}
          {!query.trim() && (
            <div className="p-4 space-y-5">
              {/* 常用关键词快捷点击 */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center space-x-1.5">
                  <Sparkles className="w-3 h-3 text-purple-500" />
                  <span>快捷探索标签</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TAGS.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => {
                        setQuery(tag)
                        inputRef.current?.focus()
                      }}
                      className="px-3 py-1.5 rounded-full text-xs bg-zinc-100 hover:bg-purple-50 hover:text-purple-700 text-zinc-700 border border-transparent hover:border-purple-200 transition-all font-medium active:scale-95"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* 现存文档快速切入通道 */}
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center space-x-1.5">
                  <BookOpen className="w-3 h-3 text-blue-500" />
                  <span>已索引知识库文档</span>
                </div>
                <div className="space-y-1">
                  {documents.length === 0 ? (
                    <div className="text-xs text-zinc-400 py-3 text-center">暂未导入任何文档</div>
                  ) : (
                    documents.slice(0, 5).map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => {
                          onClose()
                          onNavigateToReader(doc.id, 0)
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-2xl hover:bg-zinc-100/80 active:scale-[0.99] transition-all text-left group"
                      >
                        <div className="flex items-center space-x-2.5 truncate">
                          <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                            <FileText className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-xs font-semibold text-zinc-800 truncate">{doc.name}</span>
                        </div>
                        <span className="text-[11px] font-mono text-zinc-400 group-hover:text-blue-600 transition-colors flex items-center space-x-1 shrink-0">
                          <span>打开阅读</span>
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 状态 2: 搜索结果为空 */}
          {query.trim() && !loading && results.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2 text-zinc-400">
              <SearchX className="w-8 h-8 text-zinc-300" />
              <div className="text-sm font-semibold text-zinc-700">未检索到与「{query}」相关的内容</div>
              <p className="text-xs max-w-xs">试试换个同义词，或精炼输入 2~4 个字的专业名词进行匹配</p>
            </div>
          )}

          {/* 状态 3: 命中结果列表 */}
          {results.map((item, idx) => {
            const isSelected = selectedIndex === idx
            return (
              <div
                key={item.id}
                data-index={idx}
                onClick={() => handleOpenInReader(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`p-3.5 rounded-2xl transition-all cursor-pointer space-y-1.5 ${
                  isSelected
                    ? 'bg-purple-50/80 border border-purple-200/80 shadow-xs'
                    : 'hover:bg-zinc-100/70 border border-transparent'
                }`}
              >
                {/* 顶栏：所属文档与定位标签 */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 truncate">
                    <span className="font-semibold text-zinc-900 truncate max-w-[280px]">
                      {item.doc_name}
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      第 {item.page_number} 页 · {item.section_title}
                    </span>
                  </div>

                  {/* 匹配度类型指示徽章 */}
                  <div className="flex items-center space-x-1 shrink-0">
                    {item.match_type === 'document_title' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
                        文档标题
                      </span>
                    ) : item.match_type === 'semantic' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">
                        语义相关 {Math.round(item.score * 100)}%
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
                        精准词匹配
                      </span>
                    )}
                  </div>
                </div>

                {/* 正文摘要高亮片段 */}
                <div className="text-xs text-zinc-600 leading-relaxed font-sans line-clamp-2">
                  {renderHighlightedSnippet(item.snippet, query)}
                </div>

                {/* 底部操作快捷入口（仅在选中时高亮呼应） */}
                {isSelected && (
                  <div className="pt-1 flex items-center justify-between text-[11px] text-zinc-400 border-t border-purple-100/60 mt-1">
                    <span className="flex items-center space-x-1 text-purple-700 font-medium">
                      <span>回车键或点击直接跳转至该页</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAskInChat(item)
                      }}
                      className="px-2 py-0.5 rounded-md hover:bg-purple-200/50 text-purple-700 flex items-center space-x-1 transition-all"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>在 AI 问答中探讨此段</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 底部功能提示条 */}
        <div className="px-5 py-2.5 bg-zinc-50/80 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-400 select-none">
          <div className="flex items-center space-x-3">
            <span>↑↓ 切换选择</span>
            <span>↵ 确认打开</span>
            <span>ESC 关闭</span>
          </div>
          <div className="flex items-center space-x-1 text-purple-600 font-medium">
            <Sparkles className="w-3 h-3" />
            <span>Local-First 毫秒级离线检索</span>
          </div>
        </div>
      </div>
    </div>
  )
}
