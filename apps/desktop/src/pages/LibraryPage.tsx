import React, { useEffect, useRef, useState } from 'react'
import {
  FileText, FileImage, FileCode, Upload, Trash2,
  RefreshCw, CheckCircle2, Clock, XCircle, Loader2,
  FolderOpen, FileType2, Star, Tag, BookOpen, Download,
  Plus, Search, MessageSquare, Sparkles, X,
} from 'lucide-react'
import { useDocStore, DocStatus, Document } from '../stores/docStore'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtRelativeTime(iso?: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}天前`
  return fmtDate(iso)
}

function fmtChars(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万字`
  return `${n} 字`
}

const FILE_ICON: Record<string, React.ReactNode> = {
  pdf: <FileImage className="w-5 h-5 text-red-500" />,
  docx: <FileType2 className="w-5 h-5 text-blue-500" />,
  txt: <FileText className="w-5 h-5 text-slate-500" />,
  md: <FileCode className="w-5 h-5 text-purple-500" />,
  markdown: <FileCode className="w-5 h-5 text-purple-500" />,
}

const STATUS_BADGE: Record<DocStatus, React.ReactNode> = {
  pending: (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-white/10">
      <Clock className="w-3 h-3" /> 等待处理
    </span>
  ),
  parsing: (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40">
      <Loader2 className="w-3 h-3 animate-spin" /> 解析中…
    </span>
  ),
  indexed: (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
      <CheckCircle2 className="w-3 h-3" /> 已就绪
    </span>
  ),
  failed: (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40">
      <XCircle className="w-3 h-3" /> 解析失败
    </span>
  ),
}

// ── DocRow component ──────────────────────────────────────────────────────────

function DocRow({
  doc,
  backendUrl,
  onDelete,
  onEditTags,
  onOpenReader,
  onOpenChat,
}: {
  doc: Document
  backendUrl: string
  onDelete: (id: string) => void
  onEditTags: (doc: Document) => void
  onOpenReader: (doc: Document) => void
  onOpenChat: (doc: Document) => void
}) {
  const [deleting, setDeleting] = useState(false)
  const toggleFavorite = useDocStore((s) => s.toggleFavorite)

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm(`确认删除「${doc.name}」及其所有解析数据？`)) return
    setDeleting(true)
    try {
      await fetch(`${backendUrl}/api/v1/documents/${doc.id}`, { method: 'DELETE' })
      onDelete(doc.id)
    } finally {
      setDeleting(false)
    }
  }

  const tags = doc.tags || []
  const readPage = doc.last_read_page || 0
  const progressPct = doc.page_count > 0 ? Math.min(100, Math.round(((readPage + 1) / doc.page_count) * 100)) : 0

  return (
    <tr className="group border-b border-slate-100 dark:border-white/[0.06] hover:bg-slate-50/70 dark:hover:bg-white/[0.03] transition-colors">
      {/* 收藏星标 */}
      <td className="py-3 px-3 w-10 text-center">
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleFavorite(doc.id)
          }}
          className={`p-1 rounded-lg transition-transform active:scale-90 ${
            doc.is_favorite
              ? 'text-amber-500 hover:text-amber-600'
              : 'text-zinc-300 dark:text-zinc-600 hover:text-amber-400 opacity-60 group-hover:opacity-100'
          }`}
          title={doc.is_favorite ? '取消收藏' : '加入星标收藏'}
        >
          <Star className={`w-4 h-4 ${doc.is_favorite ? 'fill-amber-500' : ''}`} />
        </button>
      </td>

      {/* File icon + name */}
      <td className="py-3 px-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/10 flex items-center justify-center flex-none">
            {FILE_ICON[doc.file_type] ?? <FileText className="w-5 h-5 text-slate-400" />}
          </div>
          <div className="min-w-0">
            <p
              onClick={() => onOpenReader(doc)}
              className="text-sm font-semibold text-slate-800 dark:text-zinc-100 truncate max-w-sm hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer transition-colors"
              title="点击打开精读"
            >
              {doc.name}
            </p>
            {doc.error_message && (
              <p className="text-[11px] text-red-500 truncate max-w-xs">{doc.error_message}</p>
            )}
          </div>
        </div>
      </td>

      {/* Format & Size */}
      <td className="py-3 px-3">
        <span className="text-xs font-mono uppercase text-slate-500 dark:text-zinc-300 bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded-md font-semibold">
          .{doc.file_type}
        </span>
      </td>

      <td className="py-3 px-3 text-xs text-slate-500 dark:text-zinc-400 tabular-nums font-mono">
        {fmtSize(doc.file_size)}
        {doc.char_count > 0 && <span className="ml-1 text-[11px] opacity-70">({fmtChars(doc.char_count)})</span>}
      </td>

      {/* 标签列表 */}
      <td className="py-3 px-3 min-w-[140px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          {tags.map((t) => (
            <span
              key={t}
              onClick={(e) => {
                e.stopPropagation()
                useDocStore.getState().setSelectedTag(t)
              }}
              className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 hover:bg-purple-500/20 cursor-pointer transition-all"
            >
              #{t}
            </span>
          ))}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEditTags(doc)
            }}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] text-zinc-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-black/5 dark:hover:bg-white/10 transition opacity-60 group-hover:opacity-100"
            title="管理标签"
          >
            <Plus className="w-3 h-3" />
            {tags.length === 0 && <span className="text-[10px]">标签</span>}
          </button>
        </div>
      </td>

      {/* 阅读进度 */}
      <td className="py-3 px-3">
        {doc.page_count > 0 ? (
          <div className="space-y-1 w-28">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              <span>P.{readPage + 1}/{doc.page_count}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="w-full h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="text-xs text-zinc-400">—</span>
        )}
      </td>

      {/* Status */}
      <td className="py-3 px-3">{STATUS_BADGE[doc.status]}</td>

      {/* Date */}
      <td className="py-3 px-3 text-xs text-slate-400 dark:text-zinc-500 tabular-nums whitespace-nowrap">
        {fmtDate(doc.created_at)}
      </td>

      {/* Actions */}
      <td className="py-3 px-3 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onOpenReader(doc)}
            className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition"
            title="进入精读排版"
          >
            <BookOpen className="w-4 h-4" />
          </button>
          <button
            onClick={() => onOpenChat(doc)}
            className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition"
            title="针对此文档提问"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
            title="删除文档"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Main Library Page ─────────────────────────────────────────────────────────

export default function LibraryPage({ backendUrl: propUrl }: { backendUrl?: string }) {
  const storeUrl = useDocStore((s) => s.backendUrl)
  const backendUrl = propUrl || storeUrl || ''
  const {
    documents, loading, error, fetchDocuments, removeDocument,
    selectedTag, setSelectedTag, onlyFavorites, setOnlyFavorites,
    updateDocTags, exportAllNotes, setActivePage, setTargetReaderDoc,
  } = useDocStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [tagModalDoc, setTagModalDoc] = useState<Document | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [exportingNotes, setExportingNotes] = useState(false)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2500)
  }

  useEffect(() => {
    if (backendUrl) {
      fetchDocuments()
    }
    const interval = setInterval(() => {
      const hasInProgress = useDocStore
        .getState()
        .documents.some((d) => d.status === 'pending' || d.status === 'parsing')
      if (hasInProgress) fetchDocuments()
    }, 2000)
    return () => clearInterval(interval)
  }, [backendUrl])

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    const file = files[0]
    setUploading(true)

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch(`${backendUrl}/api/v1/documents/import`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(`⚠️ ${data?.detail?.message ?? `上传失败：HTTP ${res.status}`}`)
        return
      }
      await fetchDocuments()
      showToast(`已成功导入文档：${file.name}`)
    } catch (err: any) {
      showToast(`⚠️ 上传异常: ${err.message}`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // 导出全知识库笔记为 Markdown
  const handleExportAllNotes = async () => {
    if (exportingNotes) return
    setExportingNotes(true)
    try {
      const res = await exportAllNotes()
      const blob = new Blob([res.content], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename || '智阅AI_全库读书笔记.md'
      a.click()
      URL.revokeObjectURL(url)
      showToast(`已导出 ${res.total_docs} 篇文档共 ${res.total_notes} 条划线批注！`)
    } catch (e: any) {
      showToast(`导出失败: ${e.message}`)
    } finally {
      setExportingNotes(false)
    }
  }

  const handleOpenReader = (doc: Document) => {
    setTargetReaderDoc(doc.id, doc.last_read_page || 0)
    setActivePage('reader')
  }

  const handleOpenChat = (_doc: Document) => {
    setActivePage('chat')
  }

  // 计算标签集合
  const tagCounts: Record<string, number> = {}
  documents.forEach((d) => {
    (d.tags || []).forEach((t) => {
      tagCounts[t] = (tagCounts[t] || 0) + 1
    })
  })
  const allTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a])
  const favoriteCount = documents.filter((d) => d.is_favorite).length

  // 最近阅读文档（筛选出有阅读记录的文档，按最后阅读时间排序，最多展示 3 篇）
  const recentDocs = documents
    .filter((d) => (d.last_read_page !== undefined && d.last_read_page > 0) || d.last_read_at)
    .sort((a, b) => {
      const timeA = a.last_read_at ? new Date(a.last_read_at).getTime() : 0
      const timeB = b.last_read_at ? new Date(b.last_read_at).getTime() : 0
      return timeB - timeA
    })
    .slice(0, 3)

  // 过滤后的文档
  const filtered = documents.filter((d) => {
    if (onlyFavorites && !d.is_favorite) return false
    if (selectedTag && !(d.tags || []).includes(selectedTag)) return false
    if (search) {
      const q = search.toLowerCase()
      const matchName = d.name.toLowerCase().includes(q)
      const matchTag = (d.tags || []).some((t) => t.toLowerCase().includes(q))
      if (!matchName && !matchTag) return false
    }
    return true
  })

  // 标签编辑逻辑
  const handleAddTag = (tagToAdd: string) => {
    if (!tagModalDoc) return
    const clean = tagToAdd.trim().replace(/^#+/, '')
    if (!clean) return
    const current = tagModalDoc.tags || []
    if (current.includes(clean)) return
    const updated = [...current, clean]
    updateDocTags(tagModalDoc.id, updated)
    setTagModalDoc({ ...tagModalDoc, tags: updated })
    setTagInput('')
  }

  const handleRemoveTag = (tagToRemove: string) => {
    if (!tagModalDoc) return
    const updated = (tagModalDoc.tags || []).filter((t) => t !== tagToRemove)
    updateDocTags(tagModalDoc.id, updated)
    setTagModalDoc({ ...tagModalDoc, tags: updated })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      
      {/* Toast 提示 */}
      {toastMsg && (
        <div className="fixed top-6 right-8 z-50 px-4 py-2 rounded-2xl bg-zinc-900/90 dark:bg-white/90 text-white dark:text-zinc-900 text-xs font-semibold shadow-2xl backdrop-blur-md animate-fade-in flex items-center space-x-2">
          <Sparkles className="w-3.5 h-3.5 text-purple-400 dark:text-purple-600" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 顶部 Header */}
      <div className="flex-none flex items-center justify-between p-6 pb-4 border-b border-black/[0.04] dark:border-white/[0.08] bg-white/50 dark:bg-[#1C1C1E]/50 backdrop-blur-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            我的文档知识库
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 font-mono">
            共 {documents.length} 份文档 · {favoriteCount} 份星标 · 本地加密受管存储 · SHA-256 去重
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* 导出全库笔记按钮 */}
          <button
            onClick={handleExportAllNotes}
            disabled={exportingNotes || documents.length === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-zinc-700 dark:text-zinc-200 border border-black/[0.04] dark:border-white/[0.08] transition active:scale-95 disabled:opacity-40"
            title="将全知识库所有划线摘录与思考批注打包导出为 Markdown 知识库"
          >
            {exportingNotes ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 text-purple-500" />
            )}
            <span>导出全库笔记</span>
          </button>

          <button
            onClick={fetchDocuments}
            disabled={loading}
            className="p-2 rounded-2xl text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-black/[0.04] dark:hover:bg-white/10 transition"
            title="刷新文档列表"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-2xl shadow-sm transition active:scale-95 disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>{uploading ? '导入中…' : '导入文档'}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.markdown"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
        </div>
      </div>

      {/* 滚动主体区域 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* 1. 「最近阅读」看板（若有阅读记录则呈现，横向高保真流转） */}
        {recentDocs.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-purple-500" />
                最近阅读进度
              </span>
              <span className="text-[11px] font-mono opacity-60">点击即可无缝续读</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {recentDocs.map((doc) => {
                const readPage = doc.last_read_page || 0
                const progressPct = doc.page_count > 0 ? Math.min(100, Math.round(((readPage + 1) / doc.page_count) * 100)) : 0
                return (
                  <div
                    key={doc.id}
                    onClick={() => handleOpenReader(doc)}
                    className="group bg-white dark:bg-[#1C1C1E] p-4 rounded-3xl border border-black/[0.04] dark:border-white/[0.08] shadow-sm hover:shadow-md hover:border-purple-500/30 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 uppercase">
                          .{doc.file_type}
                        </span>
                        {doc.last_read_at && (
                          <span className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {fmtRelativeTime(doc.last_read_at)}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                        {doc.name}
                      </h4>
                    </div>

                    <div className="mt-4 pt-3 border-t border-black/[0.03] dark:border-white/[0.05] space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                        <span>读至第 {readPage + 1} 页</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 2. 搜索与标签分类过滤器 */}
        <section className="bg-white dark:bg-[#1C1C1E] p-4 rounded-3xl border border-black/[0.04] dark:border-white/[0.08] shadow-sm space-y-3.5">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* 搜索框 */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="搜索文档名称、标签分类..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F2F2F7] dark:bg-white/[0.05] border border-black/[0.04] dark:border-white/[0.06] text-zinc-800 dark:text-zinc-100 rounded-2xl placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-purple-500/40 transition"
              />
            </div>

            {/* 基础分类视图切换（全部 vs 收藏） */}
            <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.05] p-1 rounded-2xl border border-black/[0.04] dark:border-white/[0.06] shrink-0 text-xs font-semibold">
              <button
                onClick={() => {
                  setOnlyFavorites(false)
                  setSelectedTag(null)
                }}
                className={`px-3 py-1 rounded-xl transition-all ${
                  !onlyFavorites && !selectedTag
                    ? 'bg-white dark:bg-[#2C2C2E] text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                全部文档 ({documents.length})
              </button>
              <button
                onClick={() => {
                  setOnlyFavorites(true)
                  setSelectedTag(null)
                }}
                className={`flex items-center space-x-1 px-3 py-1 rounded-xl transition-all ${
                  onlyFavorites
                    ? 'bg-white dark:bg-[#2C2C2E] text-amber-500 dark:text-amber-400 shadow-xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-amber-500'
                }`}
              >
                <Star className={`w-3 h-3 ${onlyFavorites ? 'fill-amber-400' : ''}`} />
                <span>星标收藏 ({favoriteCount})</span>
              </button>
            </div>
          </div>

          {/* 标签流动栏 */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-black/[0.03] dark:border-white/[0.04]">
              <span className="text-[11px] font-semibold text-zinc-400 pr-1 flex items-center gap-1">
                <Tag className="w-3 h-3" />
                标签专栏:
              </span>
              {allTags.map((t) => {
                const active = selectedTag === t
                return (
                  <button
                    key={t}
                    onClick={() => {
                      if (active) setSelectedTag(null)
                      else {
                        setSelectedTag(t)
                        setOnlyFavorites(false)
                      }
                    }}
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs transition-all active:scale-95 ${
                      active
                        ? 'bg-purple-600 text-white font-semibold shadow-xs'
                        : 'bg-black/[0.03] dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.06] dark:hover:bg-white/[0.08]'
                    }`}
                  >
                    <span>#{t}</span>
                    <span className={`text-[10px] font-mono px-1 rounded-md ${active ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'}`}>
                      {tagCounts[t]}
                    </span>
                  </button>
                )
              })}
              {selectedTag && (
                <button
                  onClick={() => setSelectedTag(null)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 ml-1 underline"
                >
                  清除标签筛选
                </button>
              )}
            </div>
          )}

        </section>

        {/* 3. 文档主体资产表格 */}
        <section className="bg-white dark:bg-[#1C1C1E] rounded-3xl border border-black/[0.04] dark:border-white/[0.08] shadow-sm overflow-hidden">
          {error && (
            <div className="p-4 text-xs text-red-500 bg-red-50 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900/30">
              加载失败：{error}
            </div>
          )}

          {!error && filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-zinc-500 space-y-2">
              <FileText className="w-10 h-10 opacity-30" />
              <p className="text-xs font-semibold">
                {search || selectedTag || onlyFavorites ? '没有找到符合条件的文档' : '还没有导入任何文档'}
              </p>
              {(search || selectedTag || onlyFavorites) && (
                <button
                  onClick={() => {
                    setSearch('')
                    setSelectedTag(null)
                    setOnlyFavorites(false)
                  }}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                >
                  重置所有筛选条件
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/[0.08] text-[11px] text-slate-400 dark:text-zinc-500 uppercase tracking-wide bg-[#F2F2F7]/30 dark:bg-white/[0.02]">
                  <th className="py-3 px-3 text-center w-10 whitespace-nowrap">收藏</th>
                  <th className="py-3 px-3 font-semibold whitespace-nowrap">文档名称</th>
                  <th className="py-3 px-3 font-semibold whitespace-nowrap">格式</th>
                  <th className="py-3 px-3 font-semibold whitespace-nowrap">大小</th>
                  <th className="py-3 px-3 font-semibold whitespace-nowrap">标签专栏</th>
                  <th className="py-3 px-3 font-semibold whitespace-nowrap">阅读进度</th>
                  <th className="py-3 px-3 font-semibold whitespace-nowrap">状态</th>
                  <th className="py-3 px-3 font-semibold whitespace-nowrap">导入时间</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    backendUrl={backendUrl}
                    onDelete={removeDocument}
                    onEditTags={(d) => setTagModalDoc(d)}
                    onOpenReader={handleOpenReader}
                    onOpenChat={handleOpenChat}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>

      </div>

      {/* 4. 标签管理对话框 (Modal) */}
      {tagModalDoc && (
        <div className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.1] rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            
            <div className="flex items-center justify-between pb-2 border-b border-black/[0.04] dark:border-white/[0.06]">
              <div className="flex items-center space-x-2">
                <Tag className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">管理文档分类标签</h3>
              </div>
              <button
                onClick={() => setTagModalDoc(null)}
                className="w-6 h-6 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate font-semibold">
                文档: {tagModalDoc.name}
              </p>
            </div>

            {/* 当前已有标签 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400">已添加标签:</label>
              <div className="flex items-center gap-1.5 flex-wrap min-h-8 p-2 rounded-2xl bg-[#F2F2F7] dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.06]">
                {(tagModalDoc.tags || []).length === 0 ? (
                  <span className="text-[11px] text-zinc-400 italic">暂无标签，可输入新标签或点击推荐标签</span>
                ) : (
                  tagModalDoc.tags?.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl text-xs font-medium bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/25"
                    >
                      #{t}
                      <button
                        onClick={() => handleRemoveTag(t)}
                        className="hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* 输入新标签 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400">新增自定义标签:</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="输入标签名 (如 Python、技术报告)，回车添加..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddTag(tagInput)
                    }
                  }}
                  className="flex-1 px-3 py-1.5 text-xs bg-[#F2F2F7] dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.08] text-zinc-900 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <button
                  onClick={() => handleAddTag(tagInput)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition active:scale-95"
                >
                  添加
                </button>
              </div>
            </div>

            {/* 推荐已有标签 */}
            {allTags.filter((t) => !(tagModalDoc.tags || []).includes(t)).length > 0 && (
              <div className="space-y-1.5 pt-2">
                <label className="text-[11px] font-semibold text-zinc-400">其他文档用过的标签 (点击直接添加):</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {allTags
                    .filter((t) => !(tagModalDoc.tags || []).includes(t))
                    .map((t) => (
                      <button
                        key={t}
                        onClick={() => handleAddTag(t)}
                        className="px-2 py-0.5 rounded-lg text-[11px] bg-black/[0.03] dark:bg-white/[0.05] hover:bg-purple-500/10 text-zinc-600 dark:text-zinc-300 hover:text-purple-600 dark:hover:text-purple-300 border border-black/[0.04] dark:border-white/[0.06] transition"
                      >
                        + #{t}
                      </button>
                    ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setTagModalDoc(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.08] text-zinc-700 dark:text-zinc-200 transition"
              >
                完成
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
