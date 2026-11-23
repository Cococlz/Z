import { create } from 'zustand'

export type DocStatus = 'pending' | 'parsing' | 'indexed' | 'failed'
export type Page = 'library' | 'chat' | 'reader' | 'convert' | 'settings'

export interface Document {
  id: string
  name: string
  file_type: string
  file_size: number
  page_count: number
  char_count: number
  status: DocStatus
  error_message?: string | null
  created_at: string
  updated_at: string
}

export interface LlmConfigState {
  provider: string
  is_configured: boolean
  masked_api_key?: string
  model: string
  base_url: string
  temperature?: number
}

interface DocStore {
  documents: Document[]
  loading: boolean
  error: string | null
  backendUrl: string | null

  // 全局页面激活状态
  activePage: Page
  setActivePage: (page: Page) => void

  // LLM 模型配置状态与快捷切换
  llmConfig: LlmConfigState | null
  fetchLlmConfig: () => Promise<void>
  quickSwitchToOllama: () => Promise<{ ok: boolean; message: string }>

  // Spotlight 全局搜索直接唤起阅读器定位目标
  targetDocId: string | null
  targetPageIdx: number
  setTargetReaderDoc: (docId: string, pageIdx?: number) => void
  clearTargetReaderDoc: () => void

  setBackendUrl: (url: string) => void
  fetchDocuments: () => Promise<void>
  addDocument: (doc: Document) => void
  updateDocStatus: (id: string, status: DocStatus, error?: string) => void
  removeDocument: (id: string) => void
}

export const useDocStore = create<DocStore>((set, get) => ({
  documents: [],
  loading: false,
  error: null,
  backendUrl: null,

  activePage: 'library',
  setActivePage: (page) => set({ activePage: page }),

  llmConfig: null,
  fetchLlmConfig: async () => {
    const { backendUrl } = get()
    if (!backendUrl) return
    try {
      const res = await fetch(`${backendUrl}/api/v1/settings/overview`)
      if (res.ok) {
        const data = await res.json()
        if (data?.llm) {
          set({ llmConfig: data.llm })
        }
      }
    } catch (e) {
      console.warn('获取 LLM 状态异常', e)
    }
  },

  quickSwitchToOllama: async () => {
    const { backendUrl } = get()
    if (!backendUrl) return { ok: false, message: '后端服务未就绪' }
    try {
      const res = await fetch(`${backendUrl}/api/v1/settings/quick-switch-ollama`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      await get().fetchLlmConfig()
      return { ok: true, message: data.message || '已成功切换为本地 Ollama' }
    } catch (err: any) {
      return { ok: false, message: err.message || '切换失败' }
    }
  },

  targetDocId: null,
  targetPageIdx: 0,
  setTargetReaderDoc: (docId, pageIdx = 0) =>
    set({ targetDocId: docId, targetPageIdx: pageIdx }),
  clearTargetReaderDoc: () =>
    set({ targetDocId: null, targetPageIdx: 0 }),

  setBackendUrl: (url) => {
    set({ backendUrl: url })
    get().fetchLlmConfig()
  },

  fetchDocuments: async () => {
    const { backendUrl } = get()
    if (!backendUrl) return
    set({ loading: true, error: null })
    try {
      const res = await fetch(`${backendUrl}/api/v1/documents`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      set({ documents: data.items, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  addDocument: (doc) =>
    set((s) => ({ documents: [doc, ...s.documents] })),

  updateDocStatus: (id, status, error) =>
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === id ? { ...d, status, error_message: error ?? d.error_message } : d
      ),
    })),

  removeDocument: (id) =>
    set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),
}))
