import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  FileText,
  Image as ImageIcon,
  Copy,
  Check,
  Download,
  Loader2,
  Sparkles,
  Eye,
  Code2,
  FolderOpen,
  Upload,
  ArrowRight,
  Shuffle,
  Presentation,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react'
import { useDocStore } from '../stores/docStore'

type SourceMode = 'library' | 'upload'
type TargetFormat = 'txt' | 'docx' | 'markdown' | 'images'

const FORMAT_OPTIONS: { id: TargetFormat; label: string; ext: string; icon: any; title: string }[] = [
  { id: 'txt', label: '纯文本', ext: '.txt', icon: FileText, title: '纯净分段文本，适合听书、TTS 与轻量笔记' },
  { id: 'docx', label: 'Word 讲义', ext: '.docx', icon: Presentation, title: 'PPTX 自动提炼每页标题和演讲者备注生成讲义；Markdown/PDF 生成多级大纲' },
  { id: 'markdown', label: 'Markdown', ext: '.md', icon: Sparkles, title: '标准语法结构，适合导入知识库或二次深度研读' },
  { id: 'images', label: '抽取图片', ext: '', icon: ImageIcon, title: '批量抽取文档中所有内嵌高清配图与图表' },
]

interface ImageItem {
  filename: string
  path: string
  size: number
}

interface ConvertResult {
  ok: boolean
  source_name: string
  source_type: string
  target_format: TargetFormat
  content?: string
  char_count?: number
  output_file?: string
  download_filename?: string
  file_size?: number
  images?: ImageItem[]
  total_images?: number
}

export const ConvertPage: React.FC<{ backendUrl?: string }> = ({ backendUrl: propUrl }) => {
  const storeUrl = useDocStore((s) => s.backendUrl)
  const backendUrl = propUrl || storeUrl || ''

  const { documents, fetchDocuments } = useDocStore()
  
  // 来源模式：从知识库已有文档选取 vs 拖拽本地任意文件
  const [sourceMode, setSourceMode] = useState<SourceMode>('library')
  const [selectedDocId, setSelectedDocId] = useState<string>('')
  const selectedDoc = documents.find((d) => d.id === selectedDocId)

  // 本地外部上传文件状态
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 目标转换格式
  const [targetFormat, setTargetFormat] = useState<TargetFormat>('txt')

  // 转换执行中状态
  const [converting, setConverting] = useState(false)
  const [result, setResult] = useState<ConvertResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // 文本结果预览模式（渲染预览 vs 纯代码/源码）
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview')
  const [copied, setCopied] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2400)
  }

  useEffect(() => {
    fetchDocuments()
  }, [backendUrl])

  useEffect(() => {
    if (!selectedDocId && documents.length > 0) {
      setSelectedDocId(documents[0].id)
    }
  }, [documents, selectedDocId])

  // 当前选中的源文件类型推断
  const currentFileType = (): string => {
    if (sourceMode === 'library') {
      const doc = documents.find((d) => d.id === selectedDocId)
      return (doc?.file_type || '').toLowerCase()
    } else {
      if (!uploadedFile) return ''
      const ext = uploadedFile.name.split('.').pop() || ''
      return ext.toLowerCase()
    }
  }

  // 目标格式自适应推荐：若源文件是 PPTX，默认推荐转为 docx 讲义
  useEffect(() => {
    const ext = currentFileType()
    if (ext === 'pptx' || ext === 'ppt') {
      setTargetFormat('docx')
    } else if (ext === 'md' || ext === 'markdown') {
      setTargetFormat('docx')
    } else if (ext === 'pdf') {
      setTargetFormat('txt')
    }
  }, [selectedDocId, uploadedFile, sourceMode])

  // 执行转换逻辑
  const handleStartConvert = async () => {
    if (!backendUrl || converting) return
    setErrorMsg(null)
    setResult(null)
    setConverting(true)

    try {
      if (sourceMode === 'library') {
        if (!selectedDocId) {
          setErrorMsg('请先选择知识库中的文档')
          setConverting(false)
          return
        }

        const resp = await fetch(`${backendUrl}/api/v1/convert/transform`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doc_id: selectedDocId,
            target_format: targetFormat,
          }),
        })

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          throw new Error(err.detail || `HTTP ${resp.status}`)
        }

        const data: ConvertResult = await resp.json()
        setResult(data)
        showToast('🎉 转换完成！')
      } else {
        // 本地外部文件上传转换
        if (!uploadedFile) {
          setErrorMsg('请先拖入或选择本地文件')
          setConverting(false)
          return
        }

        const formData = new FormData()
        formData.append('file', uploadedFile)
        formData.append('target_format', targetFormat)

        const resp = await fetch(`${backendUrl}/api/v1/convert/upload-and-transform`, {
          method: 'POST',
          body: formData,
        })

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          throw new Error(err.detail || `HTTP ${resp.status}`)
        }

        const data: ConvertResult = await resp.json()
        setResult(data)
        showToast('🎉 转换完成！')
      }
    } catch (e: any) {
      setErrorMsg(e.message || '转换请求异常，请检查文件格式')
    } finally {
      setConverting(false)
    }
  }

  // 复制文本内容
  const handleCopyText = () => {
    if (!result?.content) return
    navigator.clipboard.writeText(result.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showToast('已复制内容至剪贴板')
  }

  // 触发本地文件下载保存
  const handleDownloadFile = () => {
    if (!result) return

    // 如果是文本类且有 content，可直接前端导出
    if (result.content) {
      const ext = result.target_format === 'markdown' ? '.md' : '.txt'
      const mime = result.target_format === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8'
      const baseName = result.source_name.replace(/\.[^/.]+$/, '')
      const fileName = `${baseName}_converted${ext}`

      const blob = new Blob([result.content], { type: mime })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      URL.revokeObjectURL(url)
      showToast(`已下载 ${fileName}`)
      return
    }

    // 如果是 Word 文档或二进制文件，通过后端下载流
    if (result.download_filename) {
      const url = `${backendUrl}/api/v1/convert/download/${encodeURIComponent(result.download_filename)}`
      const link = document.createElement('a')
      link.href = url
      link.download = result.download_filename
      link.click()
      showToast(`正在保存 ${result.download_filename}`)
    }
  }

  // 在 macOS Finder 中定位高亮文件
  const handleRevealInFinder = async (filePath?: string) => {
    const p = filePath || result?.output_file
    if (!p || !backendUrl) return
    try {
      const resp = await fetch(`${backendUrl}/api/v1/convert/reveal-in-finder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: p }),
      })
      if (resp.ok) {
        showToast('已在 Finder 中定位文件')
      }
    } catch {
      showToast('定位失败')
    }
  }

  // 文件拖拽处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const f = e.dataTransfer.files[0]
      setUploadedFile(f)
      setSourceMode('upload')
      setResult(null)
      setErrorMsg(null)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploadedFile(e.target.files[0])
      setResult(null)
      setErrorMsg(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-transparent h-screen overflow-hidden selection:bg-amber-100 transition-colors duration-200">
      
      {/* 顶部毛玻璃导航条 */}
      <header className="h-14 bg-white/70 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border-b border-black/[0.04] dark:border-white/[0.08] px-6 flex items-center justify-between shrink-0 z-10 select-none transition-colors">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 shadow-2xs">
            <Shuffle className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100 leading-none">
              本地格式转换工坊
            </div>
            <div className="text-[10px] text-zinc-400 mt-1 font-mono">
              纯本地离线处理 · 100% 数据私密 · 零网络消耗
            </div>
          </div>
        </div>

        {/* 顶部操作：来源模式切换胶囊 */}
        <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.06] p-1 rounded-2xl border border-black/[0.04] dark:border-white/[0.06] text-xs font-semibold">
          <button
            onClick={() => {
              setSourceMode('library')
              setResult(null)
            }}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl transition-all ${
              sourceMode === 'library'
                ? 'bg-white dark:bg-[#2C2C2E] text-zinc-900 dark:text-white shadow-2xs font-semibold'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>知识库文档 ({documents.length})</span>
          </button>
          <button
            onClick={() => {
              setSourceMode('upload')
              setResult(null)
            }}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl transition-all ${
              sourceMode === 'upload'
                ? 'bg-white dark:bg-[#2C2C2E] text-zinc-900 dark:text-white shadow-2xs font-semibold'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>本地任意文件拖拽</span>
          </button>
        </div>
      </header>

      {/* 主体工作区 */}
      <main className="flex-1 overflow-hidden p-6 flex flex-col space-y-4 max-w-7xl w-full mx-auto">
        
        {/* 顶部控制面板：源文件与目标格式选择器 (Apple HIG 一体化工作流管线) */}
        <div className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-3.5 border border-black/[0.04] dark:border-white/[0.08] shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-3 shrink-0 select-none transition-colors">
          
          {/* 左侧：源文档选择器 / 拖拽区 */}
          <div className="flex-1 flex items-center space-x-3 min-w-0">
            {sourceMode === 'library' ? (
              <div className="relative flex-1 max-w-md">
                <div className="w-full flex items-center justify-between px-3.5 py-2 rounded-2xl bg-[#F2F2F7] dark:bg-white/[0.05] hover:bg-zinc-200/60 dark:hover:bg-white/[0.09] border border-black/[0.04] dark:border-white/[0.06] transition-all cursor-pointer group">
                  <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                      {(selectedDoc?.file_type || currentFileType() || 'DOC').toUpperCase()}
                    </span>
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                      {selectedDoc?.name || (documents.length === 0 ? '知识库暂无文档' : '请选择文档')}
                    </span>
                    {selectedDoc && (
                      <span className="text-[10px] font-mono text-zinc-400 shrink-0 hidden sm:inline">
                        ({Math.round(selectedDoc.file_size / 1024)} KB)
                      </span>
                    )}
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200 transition-colors shrink-0" />
                  <select
                    value={selectedDocId}
                    onChange={(e) => {
                      setSelectedDocId(e.target.value)
                      setResult(null)
                    }}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  >
                    {documents.map((d) => (
                      <option key={d.id} value={d.id} className="dark:bg-[#2C2C2E] dark:text-white">
                        [{d.file_type.toUpperCase()}] {d.name} ({Math.round(d.file_size / 1024)} KB)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex-1 max-w-md border border-dashed rounded-2xl px-3.5 py-2 flex items-center justify-between cursor-pointer transition-all ${
                  isDragOver
                    ? 'border-amber-400 bg-amber-50/80 dark:bg-amber-950/40 scale-[1.01]'
                    : uploadedFile
                    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/30 hover:bg-emerald-50/70'
                    : 'border-zinc-200 dark:border-white/10 bg-[#F2F2F7]/60 dark:bg-white/[0.04] hover:bg-[#F2F2F7] dark:hover:bg-white/[0.08]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.pptx,.ppt,.docx,.doc,.txt,.md"
                  className="hidden"
                />
                <div className="flex items-center space-x-2 truncate">
                  <Upload className={`w-3.5 h-3.5 ${uploadedFile ? 'text-emerald-500' : 'text-zinc-400'}`} />
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200 truncate">
                    {uploadedFile ? uploadedFile.name : '点击选取或将 PDF / PPTX / Word 拖拽至此处'}
                  </span>
                </div>
                {uploadedFile && (
                  <span className="text-[10px] font-mono text-zinc-400 shrink-0 pl-2">
                    {Math.round(uploadedFile.size / 1024)} KB
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 中间转换指示流水线箭头 */}
          <div className="hidden xl:flex items-center justify-center w-7 h-7 rounded-full bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.06] text-zinc-400 dark:text-zinc-500 shrink-0">
            <ArrowRight className="w-3.5 h-3.5" />
          </div>

          {/* 右侧：一体化分段格式选择器与转换动作 */}
          <div className="flex items-center space-x-2.5 flex-wrap gap-y-2">
            
            {/* 目标格式分段控制器 */}
            <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.05] p-1 rounded-2xl border border-black/[0.04] dark:border-white/[0.06] shrink-0">
              {FORMAT_OPTIONS.map((fmt) => {
                const active = targetFormat === fmt.id
                const Icon = fmt.icon
                return (
                  <button
                    key={fmt.id}
                    onClick={() => {
                      setTargetFormat(fmt.id)
                      setResult(null)
                    }}
                    title={fmt.title}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs transition-all active:scale-95 ${
                      active
                        ? 'bg-white dark:bg-[#2C2C2E] text-zinc-900 dark:text-white font-semibold shadow-xs border border-black/[0.04] dark:border-white/[0.08]'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 font-medium hover:bg-black/[0.02] dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${active ? 'text-amber-500 dark:text-amber-400' : 'opacity-60'}`} />
                    <span>{fmt.label}</span>
                    {fmt.ext && (
                      <span className={`text-[10px] font-mono ${active ? 'opacity-60' : 'opacity-40'}`}>
                        {fmt.ext}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* 一键转换操作按钮 */}
            <button
              onClick={handleStartConvert}
              disabled={converting || (sourceMode === 'upload' && !uploadedFile)}
              className="px-4 py-2 rounded-2xl text-xs font-bold bg-amber-500 hover:bg-amber-600 dark:bg-amber-600/90 dark:hover:bg-amber-500 text-white active:scale-95 transition-all shadow-xs dark:shadow-none flex items-center space-x-1.5 disabled:opacity-40 disabled:pointer-events-none shrink-0"
            >
              {converting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shuffle className="w-3.5 h-3.5" />}
              <span>{converting ? '正在转换...' : '一键转换'}</span>
            </button>
          </div>

        </div>

        {/* 错误提示条 */}
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200/60 rounded-2xl px-4 py-2.5 text-xs text-rose-600 font-medium">
            ⚠️ 转换失败: {errorMsg}
          </div>
        )}

        {/* 结果呈现主卡片 */}
        <div className="flex-1 bg-white dark:bg-[#1C1C1E] rounded-3xl shadow-sm border border-black/[0.04] dark:border-white/[0.08] flex flex-col overflow-hidden transition-colors">
          
          {/* 顶栏控制（仅在有文本结果时展示） */}
          <div className="px-6 py-3 border-b border-zinc-100 dark:border-white/[0.06] flex items-center justify-between shrink-0 bg-[#F2F2F7]/30 dark:bg-white/[0.02] select-none">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">
                {result ? `转换结果: ${result.source_name}` : '转换输出工作台'}
              </span>
              {result?.char_count !== undefined && (
                <span className="text-[11px] text-zinc-400 font-mono">
                  ({result.char_count.toLocaleString()} 字符)
                </span>
              )}
              {result?.file_size !== undefined && (
                <span className="text-[11px] text-zinc-400 font-mono">
                  ({Math.round(result.file_size / 1024)} KB)
                </span>
              )}
            </div>

            {/* 右侧动作按钮组 */}
            {result && result.target_format !== 'images' && (
              <div className="flex items-center space-x-2">
                {result.content && (
                  <div className="flex items-center bg-[#F2F2F7] dark:bg-white/10 p-0.5 rounded-lg text-xs font-medium">
                    <button
                      onClick={() => setViewMode('preview')}
                      className={`px-2 py-0.5 rounded-md transition-all flex items-center space-x-1 ${
                        viewMode === 'preview' ? 'bg-white dark:bg-[#2C2C2E] shadow-2xs text-zinc-900 dark:text-white font-bold' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>预览</span>
                    </button>
                    <button
                      onClick={() => setViewMode('code')}
                      className={`px-2 py-0.5 rounded-md transition-all flex items-center space-x-1 ${
                        viewMode === 'code' ? 'bg-white dark:bg-[#2C2C2E] shadow-2xs text-zinc-900 dark:text-white font-bold' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200'
                      }`}
                    >
                      <Code2 className="w-3 h-3" />
                      <span>源码</span>
                    </button>
                  </div>
                )}

                {result.content && (
                  <button
                    onClick={handleCopyText}
                    className="px-3 py-1 bg-[#F2F2F7] dark:bg-white/10 hover:bg-zinc-200/80 dark:hover:bg-white/15 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 active:scale-95 transition-all flex items-center space-x-1"
                    title="复制内容到剪贴板"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? '已复制' : '复制文本'}</span>
                  </button>
                )}

                <button
                  onClick={handleDownloadFile}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold active:scale-95 transition-all flex items-center space-x-1 shadow-2xs"
                  title="下载保存到本地"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>保存导出文件</span>
                </button>

                {result.output_file && (
                  <button
                    onClick={() => handleRevealInFinder()}
                    className="px-3 py-1 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 active:scale-95 transition-all flex items-center space-x-1"
                    title="在 macOS Finder 中定位"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>在 Finder 中定位</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 转换内容滚动渲染区 */}
          <div className="flex-1 overflow-y-auto p-6">
            {converting ? (
              <div className="h-full flex flex-col items-center justify-center space-y-3 text-zinc-400">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                <span className="text-xs font-medium">正在进行纯本地格式转换与结构提炼...</span>
                <span className="text-[11px] text-zinc-400">绝无任何网络请求，保护您的私密数据</span>
              </div>
            ) : !result ? (
              /* 空状态 */
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 text-zinc-400 select-none">
                <div className="w-14 h-14 rounded-3xl bg-amber-500/10 flex items-center justify-center text-amber-500 shadow-2xs">
                  <Shuffle className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200">开箱即用的本地文档格式工坊</h3>
                  <p className="text-xs max-w-md text-zinc-400 leading-relaxed">
                    支持 <span className="font-semibold text-zinc-600 dark:text-zinc-300">PDF / PPTX / Word / Markdown</span> 互相转换。
                    在上方选择文档并点击「一键转换」，即可毫秒级得到结构化讲义、纯净文本或高清配图素材。
                  </p>
                </div>
                
                {/* 场景亮点推荐卡片 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 max-w-2xl text-left">
                  <div className="bg-[#F2F2F7]/60 dark:bg-white/[0.04] rounded-2xl p-3 border border-black/[0.03] dark:border-white/[0.06] space-y-1">
                    <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center space-x-1.5">
                      <Presentation className="w-3.5 h-3.5 text-blue-500" />
                      <span>PPTX → Word 讲义</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      自动抽取幻灯片每页要点与演讲者备注，生成清晰条理的 Word 讲义。
                    </p>
                  </div>

                  <div className="bg-[#F2F2F7]/60 dark:bg-white/[0.04] rounded-2xl p-3 border border-black/[0.03] dark:border-white/[0.06] space-y-1">
                    <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center space-x-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-500" />
                      <span>PDF → 纯文本 TXT</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      秒速清洗复杂排版，保留清晰分页标记，适合 TTS 朗读与电子书。
                    </p>
                  </div>

                  <div className="bg-[#F2F2F7]/60 dark:bg-white/[0.04] rounded-2xl p-3 border border-black/[0.03] dark:border-white/[0.06] space-y-1">
                    <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center space-x-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
                      <span>内嵌素材批量提取</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      无损抽取文档中嵌入的所有图表与高清配图，免去手动截图烦恼。
                    </p>
                  </div>
                </div>
              </div>
            ) : result.target_format === 'docx' ? (
              /* Word 成功卡片 */
              <div className="h-full flex flex-col items-center justify-center p-8 space-y-5 text-center">
                <div className="w-16 h-16 rounded-3xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-sm">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-zinc-800">
                    Word 讲义文档已生成完毕！
                  </h3>
                  <p className="text-xs text-zinc-500">
                    文件名称：<span className="font-mono font-semibold text-zinc-700">{result.download_filename}</span> ({Math.round((result.file_size || 0) / 1024)} KB)
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    已完整保留大纲多级标题、列表结构及演讲者备注。
                  </p>
                </div>

                <div className="flex items-center space-x-3 pt-2">
                  <button
                    onClick={handleDownloadFile}
                    className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-md transition-all flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>立即保存 Word 文档</span>
                  </button>

                  {result.output_file && (
                    <button
                      onClick={() => handleRevealInFinder()}
                      className="px-5 py-2.5 rounded-2xl bg-[#F2F2F7] hover:bg-zinc-200 active:scale-95 text-zinc-800 text-xs font-semibold transition-all flex items-center space-x-2 border border-black/[0.04]"
                    >
                      <FolderOpen className="w-4 h-4 text-zinc-500" />
                      <span>在 macOS Finder 中打开定位</span>
                    </button>
                  )}
                </div>
              </div>
            ) : result.target_format === 'images' ? (
              /* 图片画廊呈现 */
              result.images && result.images.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>共提取出 {result.images.length} 张高清图片素材</span>
                    <button
                      onClick={() => {
                        if (result.images && result.images.length > 0) {
                          handleRevealInFinder(result.images[0].path)
                        }
                      }}
                      className="text-amber-600 hover:underline flex items-center space-x-1"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>在 Finder 中查看素材目录</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {result.images.map((img, idx) => (
                      <div
                        key={idx}
                        className="group bg-[#F2F2F7] rounded-2xl p-2.5 border border-black/[0.04] space-y-2 hover:shadow-md transition-all cursor-pointer"
                        onClick={() => handleRevealInFinder(img.path)}
                        title="点击在 Finder 中定位"
                      >
                        <div className="h-36 bg-white rounded-xl overflow-hidden flex items-center justify-center border border-black/[0.04]">
                          <img
                            src={`file://${img.path}`}
                            alt={img.filename}
                            className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <div className="flex items-center justify-between px-1">
                          <div className="truncate max-w-[140px] text-xs font-medium text-zinc-700" title={img.filename}>
                            {img.filename}
                          </div>
                          <div className="text-[10px] text-zinc-400 font-mono">
                            {Math.round(img.size / 1024)} KB
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 text-zinc-400">
                  <ImageIcon className="w-8 h-8 text-zinc-300" />
                  <p className="text-xs">该文档中未检测到内嵌图片素材</p>
                </div>
              )
            ) : viewMode === 'preview' ? (
              /* 渲染预览 (Markdown) */
              <article className="prose prose-zinc max-w-none text-zinc-800 leading-relaxed text-[15px] select-text">
                <ReactMarkdown>{result.content || ''}</ReactMarkdown>
              </article>
            ) : (
              /* 源码查看 (TXT / MD) */
              <pre className="font-mono text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed bg-[#F2F2F7] p-5 rounded-2xl border border-black/[0.04] overflow-x-auto select-text">
                {result.content}
              </pre>
            )}
          </div>

        </div>

      </main>

      {/* 底部浮动轻提示 (Toast) */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900/90 backdrop-blur-md text-white text-xs font-medium px-4 py-2 rounded-2xl shadow-xl border border-white/10 animate-fade-in flex items-center space-x-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{toastMsg}</span>
        </div>
      )}

    </div>
  )
}
