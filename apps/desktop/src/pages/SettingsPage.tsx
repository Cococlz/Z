import React, { useState, useEffect } from 'react'
import { Key, Server, Cpu, CheckCircle2, XCircle, Loader2, Sparkles, Database, ShieldCheck } from 'lucide-react'
import { useDocStore } from '../stores/docStore'

interface ModelSettings {
  is_configured: boolean
  masked_api_key: string
  model: string
  base_url: string
}

export const SettingsPage: React.FC<{ backendUrl?: string }> = ({ backendUrl: propUrl }) => {
  const storeUrl = useDocStore((s) => s.backendUrl)
  const backendUrl = propUrl || storeUrl || ''

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('deepseek-chat')
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com')
  const [isConfigured, setIsConfigured] = useState(false)
  const [maskedKey, setMaskedKey] = useState('')

  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms?: number; error?: string } | null>(null)
  const [saveToast, setSaveToast] = useState(false)

  // 1. 加载配置
  const loadSettings = async () => {
    if (!backendUrl) return
    try {
      const resp = await fetch(`${backendUrl}/api/v1/settings/model`)
      if (resp.ok) {
        const data: ModelSettings = await resp.json()
        setIsConfigured(data.is_configured)
        setMaskedKey(data.masked_api_key)
        setModel(data.model || 'deepseek-chat')
        setBaseUrl(data.base_url || 'https://api.deepseek.com')
      }
    } catch (e) {
      console.error('加载设置失败', e)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [backendUrl])

  // 2. 保存配置
  const handleSave = async () => {
    if (!backendUrl) return
    setLoading(true)
    try {
      const resp = await fetch(`${backendUrl}/api/v1/settings/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          model,
          base_url: baseUrl,
        }),
      })
      if (resp.ok) {
        setSaveToast(true)
        setTimeout(() => setSaveToast(false), 2500)
        setApiKey('')
        await loadSettings()
      }
    } catch (e) {
      alert('保存失败：' + e)
    } finally {
      setLoading(false)
    }
  }

  // 3. 测试连通性
  const handleTest = async () => {
    if (!backendUrl) return
    setTesting(true)
    setTestResult(null)
    try {
      const resp = await fetch(`${backendUrl}/api/v1/settings/model/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey.trim() ? apiKey.trim() : undefined,
          model,
          base_url: baseUrl,
        }),
      })
      const data = await resp.json()
      setTestResult(data)
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message || '网络请求错误' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex-1 bg-[#F2F2F7] overflow-y-auto px-8 py-7 selection:bg-blue-100">
      <div className="max-w-2xl mx-auto space-y-7">
        
        {/* 顶部标题区 - iOS 风格大标题 */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">系统设置</h1>
            <p className="text-xs text-zinc-500 mt-1">管理你的大模型引擎、本地知识库参数与隐私偏好</p>
          </div>
          {saveToast && (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500 text-white text-xs font-medium rounded-full shadow-sm animate-fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>设置已保存</span>
            </div>
          )}
        </div>

        {/* Section 1: 模型引擎 (iOS Inset Grouped Card) */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            AI 引擎配置
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-black/[0.04] overflow-hidden divide-y divide-zinc-100">
            
            {/* 配置项 1: API Key */}
            <div className="p-4 flex items-start space-x-3.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                <Key className="w-4 h-4" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-800">DeepSeek API Key</span>
                  {isConfigured && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                      已配置 · {maskedKey}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">密钥仅加密保存在本地 SQLite 中，绝不上传至任何第三方服务器</p>
                <div className="pt-2">
                  <input
                    type="password"
                    placeholder={isConfigured ? "输入新 Key 以替换现存密钥..." : "sk-..."}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 border border-zinc-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-zinc-400"
                  />
                </div>
              </div>
            </div>

            {/* 配置项 2: 模型代号 */}
            <div className="p-4 flex items-center space-x-3.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="flex-1 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-800">模型选择</div>
                  <div className="text-xs text-zinc-400">默认推荐 DeepSeek-V3 高速推理</div>
                </div>
                <div className="w-48">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-medium bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-zinc-700"
                  >
                    <option value="deepseek-chat">deepseek-chat (V3)</option>
                    <option value="deepseek-reasoner">deepseek-reasoner (R1 深度思考)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 配置项 3: API Base URL */}
            <div className="p-4 flex items-center space-x-3.5">
              <div className="w-8 h-8 rounded-xl bg-purple-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                <Server className="w-4 h-4" />
              </div>
              <div className="flex-1 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-800">接口 Base URL</div>
                  <div className="text-xs text-zinc-400">官方默认 https://api.deepseek.com</div>
                </div>
                <div className="w-56">
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-zinc-700 font-mono"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* 按钮操作栏：测试 & 保存 */}
          <div className="mt-3 flex items-center justify-between px-1">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || (!isConfigured && !apiKey)}
                className="px-4 py-2 rounded-full text-xs font-semibold bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:pointer-events-none flex items-center space-x-1.5"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-blue-500" />}
                <span>测试连通性</span>
              </button>

              {testResult && (
                <div className={`flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${
                  testResult.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {testResult.ok ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>连接成功 ({testResult.latency_ms} ms)</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" />
                      <span className="truncate max-w-[200px]" title={testResult.error}>
                        失败: {testResult.error}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="px-6 py-2 rounded-full text-xs font-semibold bg-[#007AFF] text-white hover:bg-blue-600 active:scale-95 transition-all shadow-sm shadow-blue-500/20 disabled:opacity-50"
            >
              {loading ? '保存中...' : '保存更改'}
            </button>
          </div>
        </div>

        {/* Section 2: 存储与隐私说明 (iOS Inset Grouped Card) */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            本地存储与隐私
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-black/[0.04] overflow-hidden divide-y divide-zinc-100">
            
            <div className="p-4 flex items-center space-x-3.5">
              <div className="w-8 h-8 rounded-xl bg-teal-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                <Database className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-zinc-800">本地离线向量化</div>
                <div className="text-xs text-zinc-400 mt-0.5">采用 FastEmbed (BAAI/bge-small-zh-v1.5) 本地离线计算向量，无需消耗联网 Token</div>
              </div>
            </div>

            <div className="p-4 flex items-center space-x-3.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-zinc-800">Local-First 隐私防线</div>
                <div className="text-xs text-zinc-400 mt-0.5">所有原始文档与向量库持久化在本地 ~/Library/Application Support/ZhiyueAI，仅在提问时向 API 传输 Top-K 相关上下文</div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
