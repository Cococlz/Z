import { contextBridge, ipcRenderer } from 'electron'

export interface BackendConfig {
  port: number
  token: string
  baseUrl: string
  ready?: boolean
}

const api = {
  platform: process.platform,
  getBackendConfig: (): Promise<BackendConfig> => ipcRenderer.invoke('get-backend-config'),
  selectFile: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke('dialog:select-file', options),
  onBackendStatus: (callback: (status: { ready: boolean; baseUrl?: string; token?: string; error?: string }) => void) => {
    ipcRenderer.on('backend-status', (_, data) => callback(data))
  },
}

contextBridge.exposeInMainWorld('zhiyue', api)

export type ZhiYueApi = typeof api
