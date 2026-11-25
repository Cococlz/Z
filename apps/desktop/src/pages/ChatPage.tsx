import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Send,
  Sparkles,
  FileText,
  Bookmark,
  Layers,
  Bot,
  User,
  Plus,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  BookOpen,
} from 'lucide-react'
import { useDocStore } from '../stores/docStore'
import { NoApiKeyNotice } from '../components/NoApiKeyNotice'

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

interface ConversationItem {
  id: string
  title: string
  doc_id?: string
  created_at: string
}

export const ChatPage: React.FC<{ backendUrl?: string }> = ({ backendUrl: propUrl }) => {
  const storeUrl = useDocStore((s) => s.backendUrl)
  const backendUrl = propUrl || storeUrl || ''

  const { documents, fetchDocuments, llmConfig, fetchLlmConfig } = useDocStore()
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

  const [selectedDocId, setSelectedDocId] = useState<string>('all')

  // 会话管理状态
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState<boolean>(true)

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '你好！我是**光笺 (Lumen)** 智能知识助手。\n\n你可以随时向我提问，我会基于你已导入的本地文档知识库进行检索并精准回答，每一条回答都会给出具体的可溯源引用段落与页码。',
    },
  ])
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null)
  const [savedNoteMsgIds, setSavedNoteMsgIds] = useState<Set<string>>(new Set())

  // 一键反向收录为读书笔记
  const handleSaveToNotes = async (msg: ChatMessage, msgIdx: number) => {
    const targetDocId = selectedDocId || (msg.citations && msg.citations[0]?.doc_id)
    if (!targetDocId || !backendUrl) {
      alert('请先在顶部指定关联文档，或确保回答中包含文档溯源引用')
      return
    }
    const prevUserMsg = messages[msgIdx - 1]?.role === 'user' ? messages[msgIdx - 1].content : 'AI 对话深度洞察'
    const pageIdx = msg.citations && msg.citations[0] ? Math.max(0, msg.citations[0].page_number - 1) : 0
    try {
      const resp = await fetch(`${backendUrl}/api/v1/reader/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: targetDocId,
          page_index: pageIdx,
          selected_text: prevUserMsg.slice(0, 100),
          color: 'purple',
          tags: ['AI问答'],
          ai_insight: msg.content,
        }),
      })
      if (resp.ok) {
        setSavedNoteMsgIds((prev) => new Set([...prev, msg.id]))
      }
    } catch (e) {
      console.error('收录笔记失败', e)
    }
  }

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchDocuments()
    loadConversations()
    fetchLlmConfig()
  }, [backendUrl, fetchLlmConfig])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 1. 加载历史会话列表
  const loadConversations = async () => {
    if (!backendUrl) return
    try {
      const resp = await fetch(`${backendUrl}/api/v1/chat/conversations`)
      if (resp.ok) {
        const data = await resp.json()
        setConversations(data)
      }
    } catch (e) {
      console.error('加载会话列表失败', e)
    }
  }

  // 2. 切换选中的会话
  const handleSelectConversation = async (conv: ConversationItem) => {
    if (isGenerating) return
    setActiveConvId(conv.id)
    try {
      const resp = await fetch(`${backendUrl}/api/v1/chat/conversations/${conv.id}/messages`)
      if (resp.ok) {
        const msgs = await resp.json()
        setMessages(
          msgs.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            citations: m.source_chunks || [],
          }))
        )
      }
    } catch (e) {
      console.error('加载会话消息失败', e)
    }
  }

  // 3. 新建对话
  const handleNewChat = () => {
    if (isGenerating) return
    setActiveConvId(null)
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: '已开启新对话。请问有什么可以帮你的？',
      },
    ])
  }

  // 4. 删除会话
  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!backendUrl) return
    if (!window.confirm('确认删除该对话记录？')) return

    try {
      const resp = await fetch(`${backendUrl}/api/v1/chat/conversations/${convId}`, {
        method: 'DELETE',
      })
      if (resp.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convId))
        if (activeConvId === convId) {
          handleNewChat()
        }
      }
    } catch (err) {
      console.error('删除会话失败', err)
    }
  }

  // 5. 发送消息与流式响应
  const handleSend = async () => {
    if (!input.trim() || isGenerating || !backendUrl) return

    const userText = input.trim()
    setInput('')

    const userMsgId = 'user_' + Date.now()
    const assistantMsgId = 'ai_' + Date.now()

    if (isLlmUnconfigured) {
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', content: userText },
        {
          id: assistantMsgId,
          role: 'assistant',
          content: '未配置大模型 API Key',
          isStreaming: false,
        },
      ])
      return
    }

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: userText },
      { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true, citations: [] },
    ])
    setIsGenerating(true)

    try {
      const response = await fetch(`${backendUrl}/api/v1/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userText,
          doc_id: selectedDocId === 'all' ? undefined : selectedDocId,
          conversation_id: activeConvId || undefined,
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
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, citations: data } : m
                  )
                )
              } else if (currentEvent === 'token') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: m.content + data } : m
                  )
                )
              } else if (currentEvent === 'done') {
                if (data.conversation_id) {
                  setActiveConvId(data.conversation_id)
                  loadConversations()
                }
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

  const getDocName = (docId: string) => {
    const doc = documents.find((d) => d.id === docId)
    return doc ? doc.name : '未知文档'
  }

  return (
    <div className="flex-1 flex h-screen overflow-hidden selection:bg-blue-100 relative transition-colors duration-200">
      
      {/* 左侧：历史会话抽屉 (iOS Inset List) */}
      <aside
        className={`${
          showHistory ? 'w-64' : 'w-0'
        } transition-all duration-200 border-r border-black/[0.05] dark:border-white/[0.08] bg-white/60 dark:bg-[#18181A]/70 backdrop-blur-xl flex flex-col justify-between shrink-0 overflow-hidden z-20`}
      >
        <div className="p-3.5 space-y-3 flex-1 flex flex-col min-h-0">
          
          {/* 顶栏：新建对话按钮 */}
          <button
            onClick={handleNewChat}
            disabled={isGenerating}
            className="w-full py-2.5 px-3.5 rounded-2xl bg-white dark:bg-[#242426] border border-black/[0.06] dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-[#2C2C2E] active:scale-95 transition-all text-xs font-bold text-zinc-800 dark:text-zinc-200 shadow-2xs flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 rounded-lg bg-blue-500 text-white flex items-center justify-center">
                <Plus className="w-3.5 h-3.5" />
              </div>
              <span>新建问答对话</span>
            </div>
          </button>

          {/* 会话列表 */}
          <div className="text-[11px] font-semibold text-zinc-400 px-2 pt-1 uppercase tracking-wider">
            历史对话 ({conversations.length})
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {conversations.length === 0 ? (
              <div className="text-center py-8 text-xs text-zinc-400">
                暂无历史记录
              </div>
            ) : (
              conversations.map((c) => {
                const isActive = activeConvId === c.id
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectConversation(c)}
                    className={`group w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-between cursor-pointer ${
                      isActive
                        ? 'bg-blue-500 text-white shadow-xs'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                      <span className="truncate max-w-[150px]">{c.title || '新对话'}</span>
                    </div>

                    <button
                      onClick={(e) => handleDeleteConversation(c.id, e)}
                      className={`opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-black/10 transition-opacity ${
                        isActive ? 'text-white/80 hover:text-white' : 'text-zinc-400 hover:text-rose-600'
                      }`}
                      title="删除对话"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })
            )}
          </div>

        </div>
      </aside>

      {/* 右侧主对话区 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* 顶部毛玻璃导航条 */}
        <header className="h-14 bg-white/70 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border-b border-black/[0.04] dark:border-white/[0.08] px-6 flex items-center justify-between shrink-0 z-10 transition-colors">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200/80 dark:hover:bg-white/20 flex items-center justify-center text-zinc-600 dark:text-zinc-300 active:scale-95 transition-all shadow-2xs"
              title={showHistory ? '收起历史列表' : '展开历史列表'}
            >
              {showHistory ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>

            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {activeConvId
                  ? conversations.find((c) => c.id === activeConvId)?.title || 'AI 智能知识问答'
                  : 'AI 智能知识问答'}
              </span>
            </div>
          </div>

          {/* 范围选择分段胶囊 */}
          <div className="flex items-center bg-zinc-200/60 dark:bg-white/10 p-0.5 rounded-full text-xs">
            <div className="flex items-center px-3 py-1 space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-zinc-600 font-medium">检索范围:</span>
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className="bg-transparent font-semibold text-zinc-800 focus:outline-none cursor-pointer"
              >
                <option value="all">📚 全部已索引文档 ({documents.filter((d) => d.status === 'indexed').length} 篇)</option>
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

        {/* 对话消息流 */}
        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {isLlmUnconfigured && (
              <div className="mb-4">
                <NoApiKeyNotice
                  contextDesc="与本地文档知识库深度对话问答需要大模型引擎驱动"
                  onActionSuccess={() => fetchLlmConfig()}
                />
              </div>
            )}
            {messages.map((msg, idx) => (
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
                <div className="max-w-[85%] space-y-2">
                  <div
                    className={`px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#007AFF] text-white rounded-2xl rounded-tr-sm shadow-sm'
                        : 'bg-white dark:bg-[#1C1C1E] text-zinc-800 dark:text-zinc-100 rounded-2xl rounded-tl-sm border border-black/[0.04] dark:border-white/[0.08] shadow-sm'
                    }`}
                  >
                    {isUnconfiguredError(msg.content) ? (
                      <NoApiKeyNotice
                        compact={true}
                        contextDesc="回答您的问题需要大模型引擎驱动"
                        onActionSuccess={() => fetchLlmConfig()}
                      />
                    ) : (
                      <div className="prose prose-sm max-w-none prose-zinc dark:prose-invert text-zinc-800 dark:text-zinc-100">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                    {msg.isStreaming && (
                      <span className="inline-block w-1.5 h-4 ml-1 bg-blue-500 animate-pulse rounded-full align-middle" />
                    )}
                  </div>

                  {/* 溯源引用小组件胶囊 */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {msg.citations.map((cite, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveCitation(cite)}
                          className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/80 dark:bg-[#1C1C1E] hover:bg-white dark:hover:bg-[#28282B] text-zinc-600 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 border border-black/[0.06] dark:border-white/[0.08] shadow-2xs transition-all active:scale-95"
                        >
                          <Bookmark className="w-3 h-3 text-blue-500" />
                          <span className="truncate max-w-[140px]">{getDocName(cite.doc_id)}</span>
                          <span className="text-zinc-400">· 第{cite.page_number}页</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{Math.round(cite.score * 100)}%</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 助手消息操作栏：一键反向沉淀为读书笔记 */}
                  {msg.role === 'assistant' && !msg.isStreaming && msg.id !== 'welcome' && (
                    <div className="flex items-center space-x-2 pt-1 opacity-80 hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleSaveToNotes(msg, idx)}
                        className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-lg text-[11px] font-medium border transition-colors ${
                          savedNoteMsgIds.has(msg.id)
                            ? 'bg-purple-600/15 text-purple-700 dark:text-purple-300 border-purple-500/30 font-bold'
                            : 'bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-purple-500/15 hover:text-purple-600 dark:hover:text-purple-400 border-black/[0.04] dark:border-white/[0.06]'
                        }`}
                        title="将本条问答与解析存入对应文档的读书笔记"
                      >
                        <Bookmark className="w-3 h-3 text-purple-500" />
                        <span>{savedNoteMsgIds.has(msg.id) ? '✓ 已存入读书笔记' : '📌 存入读书笔记'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* 底部悬浮毛玻璃胶囊输入框 */}
        <footer className="p-5 max-w-3xl w-full mx-auto shrink-0">
          <div className="bg-white/80 dark:bg-[#1C1C1E]/90 backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-2 pl-4 shadow-md flex items-end space-x-2 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                documents.length === 0
                  ? '请先在文档库导入文档后再提问...'
                  : '向知识库提问... (Enter 发送，Shift + Enter 换行)'
              }
              disabled={isGenerating}
              className="flex-1 max-h-32 bg-transparent text-sm text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder-zinc-500 resize-none focus:outline-none py-1.5 leading-relaxed"
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

      </div>

      {/* 引用来源弹窗详情抽屉 */}
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

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  const docId = activeCitation.doc_id
                  const pageIdx = activeCitation.page_number ? Math.max(0, activeCitation.page_number - 1) : 0
                  const snippet = activeCitation.text_preview.slice(0, 40)
                  setActiveCitation(null)
                  useDocStore.getState().setTargetReaderDoc(docId, pageIdx, snippet)
                  useDocStore.getState().setActivePage('reader')
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white active:scale-95 transition-all flex items-center space-x-1.5 shadow-sm"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>📖 在深度阅读器中定位原著</span>
              </button>

              <button
                onClick={() => setActiveCitation(null)}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-700 active:scale-95 transition-all"
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
