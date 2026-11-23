import React, { useEffect, useRef, useState } from 'react'
import {
  FileText, FileImage, FileCode, Upload, Trash2,
  RefreshCw, CheckCircle2, Clock, XCircle, Loader2,
  FolderOpen, FileType2,
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
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
      <Clock className="w-3 h-3" /> 等待处理
    </span>
  ),
  parsing: (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-600 border border-amber-200">
      <Loader2 className="w-3 h-3 animate-spin" /> 解析中…
    </span>
  ),
  indexed: (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="w-3 h-3" /> 已就绪
    </span>
  ),
  failed: (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-600 border border-red-200">
      <XCircle className="w-3 h-3" /> 解析失败
    </span>
  ),
}

// ── DocRow component ──────────────────────────────────────────────────────────

function DocRow({
  doc,
  backendUrl,
  onDelete,
}: {
  doc: Document
  backendUrl: string
  onDelete: (id: string) => void
}) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!window.confirm(`确认删除「${doc.name}」及其所有解析数据？`)) return
    setDeleting(true)
    try {
      await fetch(`${backendUrl}/api/v1/documents/${doc.id}`, { method: 'DELETE' })
      onDelete(doc.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <tr className="group border-b border-slate-100 dark:border-white/[0.06] hover:bg-slate-50/70 dark:hover:bg-white/[0.03] transition-colors">
      {/* File icon + name */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center flex-none">
            {FILE_ICON[doc.file_type] ?? <FileText className="w-5 h-5 text-slate-400" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-zinc-200 truncate max-w-xs">{doc.name}</p>
            {doc.error_message && (
              <p className="text-[11px] text-red-500 truncate max-w-xs">{doc.error_message}</p>
            )}
          </div>
        </div>
      </td>

      {/* Type */}
      <td className="py-3 px-4">
        <span className="text-xs font-mono uppercase text-slate-500 dark:text-zinc-300 bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
          .{doc.file_type}
        </span>
      </td>

      {/* Size */}
      <td className="py-3 px-4 text-xs text-slate-500 dark:text-zinc-400 tabular-nums">{fmtSize(doc.file_size)}</td>

      {/* Pages / chars */}
      <td className="py-3 px-4 text-xs text-slate-500 dark:text-zinc-400 tabular-nums">
        {doc.page_count > 0 ? `${doc.page_count} 页` : '—'}
        {doc.char_count > 0 && <span className="ml-1 text-slate-400 dark:text-zinc-500">· {fmtChars(doc.char_count)}</span>}
      </td>

      {/* Status */}
      <td className="py-3 px-4">{STATUS_BADGE[doc.status]}</td>

      {/* Date */}
      <td className="py-3 px-4 text-xs text-slate-400 dark:text-zinc-500 tabular-nums whitespace-nowrap">
        {fmtDate(doc.created_at)}
      </td>

      {/* Actions */}
      <td className="py-3 px-4">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 rounded-lg text-slate-300 dark:text-zinc-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition opacity-0 group-hover:opacity-100"
          title="删除文档"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </td>
    </tr>
  )
}

// ── Main Library Page ─────────────────────────────────────────────────────────

export default function LibraryPage({ backendUrl }: { backendUrl: string }) {
  const { documents, loading, error, fetchDocuments, removeDocument } =
    useDocStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (backendUrl) {
      fetchDocuments()
    }
    // Poll for status updates of pending/parsing docs
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
    setUploadError(null)

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch(`${backendUrl}/api/v1/documents/import`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) {
        setUploadError(data?.detail?.message ?? `上传失败：HTTP ${res.status}`)
        return
      }
      // Immediately refresh to show the new document
      await fetchDocuments()
    } catch (err: any) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const filtered = documents.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none flex items-center justify-between p-6 pb-4 border-b border-slate-200/60 dark:border-white/[0.08]">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-indigo-500" />
            我的文档库
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            共 {documents.length} 份文档 · 本地受管存储 · SHA-256 去重
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchDocuments}
            disabled={loading}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/10 transition"
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm shadow-indigo-100 transition disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploading ? '导入中…' : '导入文档'}
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

      {/* Upload error */}
      {uploadError && (
        <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-none" />
          {uploadError}
        </div>
      )}

      {/* Search */}
      <div className="flex-none px-6 pt-4">
        <input
          type="text"
          placeholder="搜索文档名称…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm px-3 py-2 text-sm bg-white dark:bg-[#1C1C1E] border border-slate-200 dark:border-white/[0.08] text-slate-800 dark:text-zinc-100 rounded-lg shadow-sm placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-800 focus:border-indigo-400 transition"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 pt-4">
        {error && (
          <div className="p-4 text-sm text-red-500 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-100 dark:border-red-900/30">
            加载失败：{error}
          </div>
        )}

        {!error && filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-zinc-500">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {search ? '没有找到匹配的文档' : '还没有导入任何文档'}
            </p>
            {!search && (
              <p className="text-xs mt-1">点击右上角「导入文档」按钮开始</p>
            )}
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/[0.08] text-xs text-slate-400 dark:text-zinc-500 uppercase tracking-wide">
                <th className="pb-3 px-4 font-medium">文档名称</th>
                <th className="pb-3 px-4 font-medium">格式</th>
                <th className="pb-3 px-4 font-medium">大小</th>
                <th className="pb-3 px-4 font-medium">篇幅</th>
                <th className="pb-3 px-4 font-medium">状态</th>
                <th className="pb-3 px-4 font-medium">导入时间</th>
                <th className="pb-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  backendUrl={backendUrl}
                  onDelete={removeDocument}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
