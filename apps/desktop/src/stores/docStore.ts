import { create } from 'zustand'

export type DocStatus = 'pending' | 'parsing' | 'indexed' | 'failed'

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

interface DocStore {
  documents: Document[]
  loading: boolean
  error: string | null
  backendUrl: string | null

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

  setBackendUrl: (url) => set({ backendUrl: url }),

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
