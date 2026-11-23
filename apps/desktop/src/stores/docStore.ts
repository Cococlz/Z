import { create } from 'zustand'

export type DocStatus = 'pending' | 'parsing' | 'indexed' | 'failed'
export type Page = 'library' | 'chat' | 'reader' | 'convert' | 'settings'
export type AppTheme = 'white' | 'sepia' | 'dark'

function applyThemeToHtml(theme: AppTheme) {
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.classList.remove('dark', 'sepia')
    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'sepia') {
      root.classList.add('sepia')
    }
  }
}

const initialTheme: AppTheme =
  typeof localStorage !== 'undefined'
    ? ((localStorage.getItem('zhiyue_theme') as AppTheme) ||
        (localStorage.getItem('zhiyue_reader_appearance')
          ? (JSON.parse(localStorage.getItem('zhiyue_reader_appearance') || '{}').theme as AppTheme)
          : null) ||
        'white')
    : 'white'

applyThemeToHtml(initialTheme)

export interface Document {
  id: string
  name: string
  file_type: string
  file_size: number
  page_count: number
  char_count: number
  status: DocStatus
  error_message?: string | null
  last_read_page?: number
  last_read_at?: string | null
  is_favorite?: boolean
  tags?: string[]
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

  // 全局外观主题 (white / sepia / dark)
  appTheme: AppTheme
  setAppTheme: (theme: AppTheme) => void

  // LLM 模型配置状态与快捷切换
  llmConfig: LlmConfigState | null
  fetchLlmConfig: () => Promise<void>
  quickSwitchToOllama: () => Promise<{ ok: boolean; message: string }>

  // Spotlight / Chat 跨页面阅读器穿梭定位目标
  targetDocId: string | null
  targetPageIdx: number
  targetHighlightText: string | null
  setTargetReaderDoc: (docId: string, pageIdx?: number, highlightText?: string) => void
  clearTargetReaderDoc: () => void

  setBackendUrl: (url: string) => void
  fetchDocuments: () => Promise<void>
  addDocument: (doc: Document) => void
  updateDocStatus: (id: string, status: DocStatus, error?: string) => void
  removeDocument: (id: string) => void

  // 知识资产管理：收藏、标签与全库笔记导出
  selectedTag: string | null
  setSelectedTag: (tag: string | null) => void
  onlyFavorites: boolean
  setOnlyFavorites: (only: boolean) => void
  toggleFavorite: (docId: string) => Promise<boolean>
  updateDocTags: (docId: string, tags: string[]) => Promise<string[]>
  exportAllNotes: () => Promise<{ filename: string; content: string; total_notes: number; total_docs: number }>
}

export const useDocStore = create<DocStore>((set, get) => ({
  documents: [],
  loading: false,
  error: null,
  backendUrl: null,

  activePage: 'library',
  setActivePage: (page) => set({ activePage: page }),

  appTheme: initialTheme,
  setAppTheme: (theme) => {
    localStorage.setItem('zhiyue_theme', theme)
    applyThemeToHtml(theme)
    set({ appTheme: theme })
  },

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
  targetHighlightText: null,
  setTargetReaderDoc: (docId, pageIdx = 0, highlightText?: string) =>
    set({ targetDocId: docId, targetPageIdx: pageIdx, targetHighlightText: highlightText || null }),
  clearTargetReaderDoc: () =>
    set({ targetDocId: null, targetPageIdx: 0, targetHighlightText: null }),

  setBackendUrl: (url) => {
    set({ backendUrl: url })
    get().fetchLlmConfig()
    get().fetchDocuments()
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

  selectedTag: null,
  setSelectedTag: (tag) => set({ selectedTag: tag }),
  onlyFavorites: false,
  setOnlyFavorites: (only) => set({ onlyFavorites: only }),

  toggleFavorite: async (docId) => {
    const { backendUrl, documents } = get()
    const currentDoc = documents.find((d) => d.id === docId)
    const nextFav = !currentDoc?.is_favorite
    set({
      documents: documents.map((d) => (d.id === docId ? { ...d, is_favorite: nextFav } : d)),
    })
    if (!backendUrl) return nextFav
    try {
      const res = await fetch(`${backendUrl}/api/v1/documents/${docId}/favorite`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      set({
        documents: get().documents.map((d) => (d.id === docId ? { ...d, is_favorite: data.is_favorite } : d)),
      })
      return data.is_favorite
    } catch (e) {
      console.error('切换收藏状态失败', e)
      set({
        documents: get().documents.map((d) => (d.id === docId ? { ...d, is_favorite: !nextFav } : d)),
      })
      return !nextFav
    }
  },

  updateDocTags: async (docId, tags) => {
    const { backendUrl } = get()
    set({
      documents: get().documents.map((d) => (d.id === docId ? { ...d, tags } : d)),
    })
    if (!backendUrl) return tags
    try {
      const res = await fetch(`${backendUrl}/api/v1/documents/${docId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      set({
        documents: get().documents.map((d) => (d.id === docId ? { ...d, tags: data.tags } : d)),
      })
      return data.tags
    } catch (e) {
      console.error('更新标签失败', e)
      return tags
    }
  },

  exportAllNotes: async () => {
    const { backendUrl } = get()
    if (!backendUrl) throw new Error('后端未就绪')
    const res = await fetch(`${backendUrl}/api/v1/documents/notes/export-all`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  },
}))
