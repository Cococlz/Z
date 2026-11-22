import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Send,
  Sparkles,
  FileText,
  Bookmark,
  ChevronDown,
  Layers,
  Bot,
  User,
  AlertCircle,
  ExternalLink,
  X,
} from 'lucide-react'
import { useDocStore, Document } from '../stores/docStore'

interface Citation {
  doc_id: string
  chunk_index: number
  page_number: number
  section_title: string
  score: number
  text_preview: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  isStreaming?: boolean
}

export const ChatPage: React.FC = () => {
  const { documents, fetchDocuments } = useDocStore()
  const [selectedDocId, setSelectedDocId] = useState<string>('all')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '你好！我是**智阅 AI** 智能知识助手。\n\n你可以随时向我提问，我会基于你已导入的本地文档知识库进行检索并精准回答，每一条回答都会给出具体的可溯源引用段落与页码。',
    },
  ])
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 发送消息与流式响应
  const handleSend = async () => {
    if (!input.trim() || isGenerating) return

    const userText = input.trim()
    setInput('')

    const userMsgId = 'user_' + Date.now()
    const assistantMsgId = 'ai_' + Date.now()

    // 1. 追加用户消息和空的助理消息
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: userText },
      { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true, citations: [] },
    ])
    setIsGenerating(true)

    try {
      const response = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userText,
          doc_id: selectedDocId === 'all' ? undefined : selectedDocId,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('未获取到流式响应体')
      }

      const reader = response.body.getReader()
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

              if (currentEvent === 'citations') {
                // 引用信息
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, citations: data } : m
                  )
                )
              } else if (currentEvent === 'token') {
                // 文本 chunk
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: m.content + data } : m
                  )
                )
              } else if (currentEvent === 'error') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + `\n\n> ⚠️ 回答出错: ${data}` }
                      : m
                  )
                )
              }
            } catch (err) {
              console.warn('解析 SSE 数据异常:', err, dataStr)
            }
          }
        }
      }
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `⚠️ 请求异常：${e.message || '请先在系统设置中配置有效的 API Key'}` }
            : m
        )
      )
    } finally {
      setIsGenerating(false)
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m))
      )
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 根据 doc_id 查找文档名称
  const getDocName = (docId: string) => {
    const doc = documents.find((d) => d.id === docId)
    return doc ? doc.name : '未知文档'
  }

  return (
    <div className="flex-1 flex flex-col bg-[#F2F2F7] h-screen overflow-hidden selection:bg-blue-100 relative">
      
      {/* 顶部毛玻璃导航条 (iOS Frosted Header) */}
      <header className="h-14 bg-white/70 backdrop-blur-xl border-b border-black/[0.04] px-6 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="text-sm font-semibold text-zinc-900">AI 智能知识问答</span>
        </div>

        {/* 范围选择分段胶囊 */}
        <div className="flex items-center bg-zinc-200/60 p-0.5 rounded-full text-xs">
          <div className="flex items-center px-3 py-1 space-x-1.5">
            <Layers className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-600 font-medium">检索范围:</span>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="bg-transparent font-semibold text-zinc-800 focus:outline-none cursor-pointer"
            >
              <option value="all">📚 全部已索引文档 ({documents.filter(d => d.status === 'indexed').length} 篇)</option>
              {documents
                .filter((d) => d.status === 'indexed')
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    📄 {d.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </header>

      {/* 对话流主展示区 (Message List) */}
      <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start space-x-3 ${
                msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'
              }`}
            >
              {/* 头像 */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-[#007AFF] text-white'
                    : 'bg-white text-blue-600 border border-black/[0.04]'
                }`}
              >
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* 气泡内容 */}
              <div className={`max-w-[85%] space-y-2`}>
                <div
                  className={`px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#007AFF] text-white rounded-2xl rounded-tr-sm shadow-sm'
                      : 'bg-white text-zinc-800 rounded-2xl rounded-tl-sm border border-black/[0.04] shadow-sm'
                  }`}
                >
                  <div className="prose prose-sm max-w-none prose-zinc dark:prose-invert">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.isStreaming && (
                    <span className="inline-block w-1.5 h-4 ml-1 bg-blue-500 animate-pulse rounded-full align-middle" />
                  )}
                </div>

                {/* 溯源引用小组件胶囊 (Citations Badges) */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {msg.citations.map((cite, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveCitation(cite)}
                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/80 hover:bg-white text-zinc-600 hover:text-blue-600 border border-black/[0.06] shadow-2xs transition-all active:scale-95"
                      >
                        <Bookmark className="w-3 h-3 text-blue-500" />
                        <span className="truncate max-w-[140px]">{getDocName(cite.doc_id)}</span>
                        <span className="text-zinc-400">· 第{cite.page_number}页</span>
                        <span className="text-emerald-600 font-semibold">{Math.round(cite.score * 100)}%</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* 底部悬浮毛玻璃胶囊输入框 (iOS Floating Pill Input) */}
      <footer className="p-5 max-w-3xl w-full mx-auto shrink-0">
        <div className="bg-white/80 backdrop-blur-xl border border-black/[0.06] rounded-2xl p-2 pl-4 shadow-md flex items-end space-x-2 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              documents.length === 0
                ? '请先在文档库导入文档后再提问...'
                : '向本地知识库提问... (Enter 发送，Shift + Enter 换行)'
            }
            disabled={isGenerating}
            className="flex-1 max-h-32 bg-transparent text-sm text-zinc-800 placeholder:text-zinc-400 resize-none focus:outline-none py-1.5 leading-relaxed"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isGenerating}
            className="w-8 h-8 rounded-xl bg-[#007AFF] text-white flex items-center justify-center hover:bg-blue-600 active:scale-90 transition-all disabled:opacity-40 disabled:pointer-events-none shrink-0 shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </footer>

      {/* 引用来源弹窗详情抽屉 (iOS Modal Card) */}
      {activeCitation && (
        <div className="absolute inset-0 bg-black/25 backdrop-blur-xs flex items-center justify-center z-50 p-6 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-black/[0.04] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 truncate max-w-[320px]">
                    {getDocName(activeCitation.doc_id)}
                  </h3>
                  <div className="text-[11px] text-zinc-400">
                    第 {activeCitation.page_number} 页 · 匹配度 {Math.round(activeCitation.score * 100)}%
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActiveCitation(null)}
                className="w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-500 active:scale-95 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#F2F2F7] rounded-2xl p-4 text-xs text-zinc-700 leading-relaxed font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
              {activeCitation.text_preview}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setActiveCitation(null)}
                className="px-5 py-2 rounded-full text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-800 active:scale-95 transition-all"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
