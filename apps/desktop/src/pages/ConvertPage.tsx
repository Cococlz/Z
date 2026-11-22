import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  FileCode,
  Image as ImageIcon,
  Copy,
  Check,
  Download,
  Loader2,
  Sparkles,
  Eye,
  Code2,
} from 'lucide-react'
import { useDocStore } from '../stores/docStore'

type ConvertTab = 'markdown' | 'images'

export const ConvertPage: React.FC<{ backendUrl?: string }> = ({ backendUrl: propUrl }) => {
  const storeUrl = useDocStore((s) => s.backendUrl)
  const backendUrl = propUrl || storeUrl || ''

  const { documents, fetchDocuments } = useDocStore()
  const [selectedDocId, setSelectedDocId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<ConvertTab>('markdown')

  // Markdown 转换状态
  const [markdownContent, setMarkdownContent] = useState<string>('')
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview')
  const [converting, setConverting] = useState(false)
  const [copied, setCopied] = useState(false)

  // 图片提取状态
  const [images, setImages] = useState<Array<{ filename: string; path: string; size: number }>>([])
  const [extracting, setExtracting] = useState(false)

  useEffect(() => {
    fetchDocuments()
  }, [backendUrl])

  useEffect(() => {
    if (!selectedDocId && documents.length > 0) {
      setSelectedDocId(documents[0].id)
    }
  }, [documents, selectedDocId])

  // 执行 Markdown 转换
  const handleConvertToMarkdown = async () => {
    if (!selectedDocId || !backendUrl || converting) return
    setConverting(true)
    setMarkdownContent('')
    try {
      const resp = await fetch(`${backendUrl}/api/v1/convert/doc-to-markdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_id: selectedDocId }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setMarkdownContent(data.markdown || '')
      } else {
        const err = await resp.json()
        alert('转换失败: ' + (err.detail || resp.statusText))
      }
    } catch (e: any) {
      alert('转换请求异常: ' + e.message)
    } finally {
      setConverting(false)
    }
  }

  // 执行图片提取
  const handleExtractImages = async () => {
    if (!selectedDocId || !backendUrl || extracting) return
    setExtracting(true)
    setImages([])
    try {
      const resp = await fetch(`${backendUrl}/api/v1/convert/extract-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_id: selectedDocId }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setImages(data.images || [])
      } else {
        const err = await resp.json()
        alert('提取失败: ' + (err.detail || resp.statusText))
      }
    } catch (e: any) {
      alert('提取请求异常: ' + e.message)
    } finally {
      setExtracting(false)
    }
  }

  // 复制 Markdown
  const handleCopy = () => {
    if (!markdownContent) return
    navigator.clipboard.writeText(markdownContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 下载 Markdown 文件
  const handleDownload = () => {
    if (!markdownContent) return
    const doc = documents.find((d) => d.id === selectedDocId)
    const fileName = (doc ? doc.name.replace(/\.[^/.]+$/, '') : 'document') + '.md'
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  const selectedDoc = documents.find((d) => d.id === selectedDocId)

  return (
    <div className="flex-1 flex flex-col bg-[#F2F2F7] h-screen overflow-hidden selection:bg-amber-100">
      
      {/* 顶部毛玻璃导航条 */}
      <header className="h-14 bg-white/70 backdrop-blur-xl border-b border-black/[0.04] px-6 flex items-center justify-between shrink-0 z-10">
        
        {/* 选择文档 */}
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
            <FileCode className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-semibold text-zinc-400">选择文档:</span>
            <select
              value={selectedDocId}
              onChange={(e) => {
                setSelectedDocId(e.target.value)
                setMarkdownContent('')
                setImages([])
              }}
              className="px-2.5 py-1 text-xs font-bold text-zinc-800 bg-zinc-100 hover:bg-zinc-200/60 rounded-full focus:outline-none cursor-pointer transition-all max-w-[280px] truncate"
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.file_type.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 顶部功能分段控制器 (iOS Segmented Control) */}
        <div className="flex items-center bg-zinc-200/70 p-1 rounded-2xl gap-1 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('markdown')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl transition-all ${
              activeTab === 'markdown' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-amber-500" />
            <span>转换为 Markdown</span>
          </button>

          <button
            onClick={() => setActiveTab('images')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl transition-all ${
              activeTab === 'images' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 text-teal-500" />
            <span>提取配图素材</span>
          </button>
        </div>

      </header>

      {/* 主体工作区 */}
      <main className="flex-1 p-5 overflow-hidden flex flex-col">
        {activeTab === 'markdown' ? (
          /* Tab 1: Markdown 转换区 */
          <div className="flex-1 bg-white rounded-3xl shadow-sm border border-black/[0.04] flex flex-col overflow-hidden">
            
            {/* 操作子栏 */}
            <div className="px-6 py-3 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-[#F2F2F7]/40">
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleConvertToMarkdown}
                  disabled={converting || !selectedDocId}
                  className="px-4 py-1.5 rounded-full text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white active:scale-95 transition-all shadow-xs disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {converting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{markdownContent ? '重新转换' : '一键转为 Markdown'}</span>
                </button>

                {markdownContent && (
                  <span className="text-xs text-zinc-400 font-mono pl-2">
                    字数: {markdownContent.length}
                  </span>
                )}
              </div>

              {markdownContent && (
                <div className="flex items-center space-x-2">
                  {/* 视图切换 */}
                  <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl text-xs font-medium">
                    <button
                      onClick={() => setViewMode('preview')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center space-x-1 ${
                        viewMode === 'preview' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>效果预览</span>
                    </button>
                    <button
                      onClick={() => setViewMode('code')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center space-x-1 ${
                        viewMode === 'code' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500'
                      }`}
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Markdown 源码</span>
                    </button>
                  </div>

                  {/* 复制 */}
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 active:scale-90 transition-all"
                    title="复制 Markdown"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>

                  {/* 下载 */}
                  <button
                    onClick={handleDownload}
                    className="p-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 active:scale-90 transition-all"
                    title="下载 .md 文件"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* 内容预览 / 源码区 */}
            <div className="flex-1 overflow-y-auto p-8">
              {converting ? (
                <div className="h-full flex flex-col items-center justify-center space-y-3 text-zinc-400">
                  <Loader2 className="w-7 h-7 animate-spin text-amber-500" />
                  <span className="text-xs">本地格式引擎正在解析重构 Markdown 结构...</span>
                </div>
              ) : !markdownContent ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 text-zinc-400">
                  <div className="w-12 h-12 rounded-3xl bg-zinc-100 flex items-center justify-center text-zinc-400">
                    <FileCode className="w-6 h-6 text-amber-500" />
                  </div>
                  <h3 className="text-sm font-bold text-zinc-700">纯本地文档格式转换</h3>
                  <p className="text-xs max-w-sm">
                    点击左上角「一键转为 Markdown」，将当前 {selectedDoc?.file_type.toUpperCase()} 文档自动提炼转换为结构化 Markdown 文本，绝不向网络发送文件。
                  </p>
                </div>
              ) : viewMode === 'preview' ? (
                <article className="prose prose-zinc max-w-none text-zinc-800 leading-relaxed text-[15px]">
                  <ReactMarkdown>{markdownContent}</ReactMarkdown>
                </article>
              ) : (
                <pre className="font-mono text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed bg-[#F2F2F7] p-5 rounded-2xl border border-black/[0.04] overflow-x-auto">
                  {markdownContent}
                </pre>
              )}
            </div>

          </div>
        ) : (
          /* Tab 2: 图片素材提取区 */
          <div className="flex-1 bg-white rounded-3xl shadow-sm border border-black/[0.04] flex flex-col overflow-hidden">
            
            {/* 操作子栏 */}
            <div className="px-6 py-3 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-[#F2F2F7]/40">
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleExtractImages}
                  disabled={extracting || !selectedDocId}
                  className="px-4 py-1.5 rounded-full text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white active:scale-95 transition-all shadow-xs disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{images.length > 0 ? '重新扫描提取' : '扫描并提取全部配图'}</span>
                </button>

                {images.length > 0 && (
                  <span className="text-xs text-zinc-500 font-medium pl-2">
                    已成功抽取 {images.length} 张高清图片
                  </span>
                )}
              </div>
            </div>

            {/* 图片画廊网格 */}
            <div className="flex-1 overflow-y-auto p-6">
              {extracting ? (
                <div className="h-full flex flex-col items-center justify-center space-y-3 text-zinc-400">
                  <Loader2 className="w-7 h-7 animate-spin text-teal-500" />
                  <span className="text-xs">正在深入文档二进制流抽取内嵌配图...</span>
                </div>
              ) : images.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 text-zinc-400">
                  <div className="w-12 h-12 rounded-3xl bg-zinc-100 flex items-center justify-center text-zinc-400">
                    <ImageIcon className="w-6 h-6 text-teal-500" />
                  </div>
                  <h3 className="text-sm font-bold text-zinc-700">文档内嵌素材批量提取</h3>
                  <p className="text-xs max-w-sm">
                    一键提取 PDF 或 Word 内部嵌入的所有图表、配图素材，保持原始高清分辨率，免去手动截图烦恼。
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {images.map((img, idx) => (
                    <div
                      key={idx}
                      className="group bg-[#F2F2F7] rounded-2xl p-3 border border-black/[0.04] space-y-2 hover:shadow-sm transition-all"
                    >
                      <div className="h-40 bg-white rounded-xl overflow-hidden flex items-center justify-center border border-black/[0.04]">
                        <img
                          src={`file://${img.path}`}
                          alt={img.filename}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <div className="truncate max-w-[180px] text-xs font-medium text-zinc-700" title={img.filename}>
                          {img.filename}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {Math.round(img.size / 1024)} KB
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </main>

    </div>
  )
}
