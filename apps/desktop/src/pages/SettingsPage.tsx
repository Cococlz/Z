import React, { useState, useEffect } from 'react'
import {
  Key,
  Server,
  Cpu,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  FolderOpen,
  Trash2,
  RefreshCw,
  BookOpen,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Sliders,
  Globe,
  HardDrive,
} from 'lucide-react'
import { useDocStore } from '../stores/docStore'

interface OverviewData {
  llm: {
    provider: string
    is_configured: boolean
    masked_api_key: string
    model: string
    base_url: string
    temperature: number
  }
  storage: {
    app_data_dir: string
    docs_count: number
    docs_size_mb: number
    database_size_mb: number
    vector_size_mb: number
    total_size_mb: number
  }
  preferences: {
    reader_target_lang: string
    reader_font_size: string
  }
  system: {
    version: string
    arch: string
    python_version: string
    fastembed_model: string
    is_macos: boolean
  }
}

// 预设厂商模板
const PROVIDER_PRESETS: Record<
  string,
  { name: string; baseUrl: string; defaultModel: string; models: string[]; requiresKey: boolean }
> = {
  deepseek: {
    name: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    requiresKey: true,
  },
  siliconflow: {
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: [
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'Qwen/Qwen2.5-72B-Instruct',
    ],
    requiresKey: true,
  },
  ollama: {
    name: 'Ollama 本地大模型 (纯离线)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'deepseek-r1:1.5b',
    models: ['deepseek-r1:1.5b', 'deepseek-r1:7b', 'llama3.2', 'qwen2.5:7b'],
    requiresKey: false,
  },
  custom: {
    name: '自定义 OpenAI 兼容接口',
    baseUrl: 'https://api.example.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: [],
    requiresKey: true,
  },
}

export const SettingsPage: React.FC<{ backendUrl?: string }> = ({ backendUrl: propUrl }) => {
  const storeUrl = useDocStore((s) => s.backendUrl)
  const backendUrl = propUrl || storeUrl || ''
  const fetchDocuments = useDocStore((s) => s.fetchDocuments)

  // 1. 全局配置状态
  const [provider, setProvider] = useState('deepseek')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('deepseek-chat')
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com')
  const [temperature, setTemperature] = useState(0.3)
  const [targetLang, setTargetLang] = useState('zh-CN')
  const [fontSize, setFontSize] = useState('normal')

  const [maskedKey, setMaskedKey] = useState('')
  const [isConfigured, setIsConfigured] = useState(false)
  const [storageStats, setStorageStats] = useState<OverviewData['storage'] | null>(null)
  const [systemInfo, setSystemInfo] = useState<OverviewData['system'] | null>(null)

  // 2. 交互状态
  const [savingLlm, setSavingLlm] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms?: number; error?: string } | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // 3. FAQ 折叠状态
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2500)
  }

  // 加载全景设置
  const loadOverview = async () => {
    if (!backendUrl) return
    try {
      const resp = await fetch(`${backendUrl}/api/v1/settings/overview`)
      if (resp.ok) {
        const data: OverviewData = await resp.json()
        setProvider(data.llm.provider || 'deepseek')
        setIsConfigured(data.llm.is_configured)
        setMaskedKey(data.llm.masked_api_key)
        setModel(data.llm.model || 'deepseek-chat')
        setBaseUrl(data.llm.base_url || 'https://api.deepseek.com')
        setTemperature(data.llm.temperature ?? 0.3)

        setTargetLang(data.preferences.reader_target_lang || 'zh-CN')
        setFontSize(data.preferences.reader_font_size || 'normal')

        setStorageStats(data.storage)
        setSystemInfo(data.system)
      }
    } catch (e) {
      console.error('加载系统全景设置失败', e)
    }
  }

  useEffect(() => {
    loadOverview()
  }, [backendUrl])

  // 切换厂商预设时自动同步默认参数
  const handleSelectProvider = (newProv: string) => {
    setProvider(newProv)
    const preset = PROVIDER_PRESETS[newProv]
    if (preset) {
      setBaseUrl(preset.baseUrl)
      setModel(preset.defaultModel)
    }
  }

  // 保存模型配置
  const handleSaveLlm = async () => {
    if (!backendUrl) return
    setSavingLlm(true)
    try {
      const resp = await fetch(`${backendUrl}/api/v1/settings/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          api_key: apiKey,
          model,
          base_url: baseUrl,
          temperature,
        }),
      })
      if (resp.ok) {
        showToast('模型配置已成功更新')
        setApiKey('')
        await loadOverview()
        useDocStore.getState().fetchLlmConfig()
      } else {
        alert(`保存失败：HTTP ${resp.status}`)
      }
    } catch (e: any) {
      alert(`保存失败: ${e.message || e}`)
    } finally {
      setSavingLlm(false)
    }
  }

  // 保存阅读偏好
  const handleSavePreferences = async (newLang: string, newSize: string) => {
    if (!backendUrl) return
    try {
      const resp = await fetch(`${backendUrl}/api/v1/settings/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reader_target_lang: newLang,
          reader_font_size: newSize,
        }),
      })
      if (resp.ok) {
        setTargetLang(newLang)
        setFontSize(newSize)
        showToast('阅读偏好已保存')
      }
    } catch (e: any) {
      console.error(e)
    }
  }

  // 测试连通性
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
      setTestResult({ ok: false, error: `网络请求失败: ${e.message || e}` })
    } finally {
      setTesting(false)
    }
  }

  // 在 Finder 中打开数据目录
  const handleOpenInFinder = async () => {
    if (!backendUrl) return
    setActionLoading('finder')
    try {
      const resp = await fetch(`${backendUrl}/api/v1/settings/storage/open-in-finder`, {
        method: 'POST',
      })
      if (resp.ok) {
        showToast('已在 Finder 中打开数据目录')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  // 一键清理临时缓存
  const handleClearCache = async () => {
    if (!backendUrl) return
    setActionLoading('cache')
    try {
      const resp = await fetch(`${backendUrl}/api/v1/settings/storage/clear-cache`, {
        method: 'POST',
      })
      if (resp.ok) {
        const data = await resp.json()
        showToast(`清理完成，释放 ${data.freed_mb || 0} MB 空间`)
        await loadOverview()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  // 全量重建向量索引
  const handleReindex = async () => {
    if (!backendUrl) return
    if (!confirm('重建向量索引将重新计算所有文档的特征嵌入，确定开始吗？')) return
    setActionLoading('reindex')
    try {
      const resp = await fetch(`${backendUrl}/api/v1/settings/storage/reindex`, {
        method: 'POST',
      })
      if (resp.ok) {
        const data = await resp.json()
        showToast(`重建完成，已重新索引 ${data.indexed_count} 篇文档`)
        await loadOverview()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  // 恢复出厂示范文档
  const handleRestoreOnboarding = async () => {
    if (!backendUrl) return
    setActionLoading('onboarding')
    try {
      const resp = await fetch(`${backendUrl}/api/v1/settings/onboarding/restore`, {
        method: 'POST',
      })
      if (resp.ok) {
        showToast('已将《快速上手与功能示范》恢复至知识库！')
        await fetchDocuments()
        await loadOverview()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="flex-1 bg-transparent overflow-y-auto px-8 py-7 selection:bg-blue-100 font-sans transition-colors duration-200">
      <div className="max-w-2xl mx-auto space-y-7 pb-12">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">系统设置</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">管理你的本地知识库资产、大模型引擎与个性化阅读偏好</p>
          </div>
          {toastMessage && (
            <div className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-full shadow-lg animate-fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{toastMessage}</span>
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            Section 1: 大模型与厂商配置
        ───────────────────────────────────────────────────────────────── */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase flex items-center justify-between">
            <span>AI 模型引擎与厂商预设</span>
            <span className="text-[10px] text-zinc-400 font-normal">支持 DeepSeek · 硅基流动 · Ollama</span>
          </div>

          <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-sm border border-black/[0.04] dark:border-white/[0.08] overflow-hidden divide-y divide-zinc-100 dark:divide-white/[0.06] transition-colors">
            {/* 1.1 厂商选择 */}
            <div className="p-4 flex items-center space-x-3.5">
              <div className="w-8 h-8 rounded-xl bg-purple-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                <Server className="w-4 h-4" />
              </div>
              <div className="flex-1 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">服务厂商</div>
                  <div className="text-xs text-zinc-400">选择推荐服务商或接入本地离线大模型</div>
                </div>
                <div className="w-56">
                  <select
                    value={provider}
                    onChange={(e) => handleSelectProvider(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-medium bg-zinc-50 dark:bg-[#2C2C2E] border border-zinc-200 dark:border-white/[0.08] rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-zinc-700 dark:text-zinc-100"
                  >
                    {Object.entries(PROVIDER_PRESETS).map(([k, p]) => (
                      <option key={k} value={k} className="dark:bg-[#2C2C2E]">
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 1.2 API Key */}
            <div className="p-4 flex items-start space-x-3.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                <Key className="w-4 h-4" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">API Key 密钥</span>
                  {provider === 'ollama' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/40">
                      Ollama 本地免密钥
                    </span>
                  ) : isConfigured ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                      已配置 · {maskedKey}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-zinc-400">
                  {provider === 'ollama'
                    ? 'Ollama 本地无需 API Key，只要本地安装并运行即可'
                    : '密钥仅保存在本地 SQLite 中，绝不上传到任何三方云端'}
                </p>
                {provider !== 'ollama' && (
                  <div className="pt-2">
                    <input
                      type="password"
                      placeholder={isConfigured ? '输入新 Key 覆盖现存密钥...' : 'sk-...'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-[#2C2C2E] border border-zinc-200/80 dark:border-white/[0.08] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-zinc-400 text-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 1.3 模型代号 */}
            <div className="p-4 flex items-center space-x-3.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="flex-1 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">模型名称 (Model)</div>
                  <div className="text-xs text-zinc-400">
                    {provider === 'deepseek'
                      ? '推荐 deepseek-chat 或 deepseek-reasoner'
                      : provider === 'ollama'
                      ? '与本地 `ollama list` 中的模型名称一致'
                      : '模型代号识别码'}
                  </div>
                </div>
                <div className="w-56">
                  {PROVIDER_PRESETS[provider]?.models.length > 0 ? (
                    <div className="space-y-1">
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs font-medium bg-zinc-50 dark:bg-[#2C2C2E] border border-zinc-200 dark:border-white/[0.08] rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-zinc-700 dark:text-zinc-100"
                      >
                        {PROVIDER_PRESETS[provider].models.map((m) => (
                          <option key={m} value={m} className="dark:bg-[#2C2C2E]">
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-[#2C2C2E] border border-zinc-200 dark:border-white/[0.08] rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-zinc-700 dark:text-zinc-100 font-mono"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* 1.4 API Base URL */}
            <div className="p-4 flex items-center space-x-3.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                <Globe className="w-4 h-4" />
              </div>
              <div className="flex-1 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Base URL 端点</div>
                  <div className="text-xs text-zinc-400">接口请求根路径</div>
                </div>
                <div className="w-60">
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-[#2C2C2E] border border-zinc-200 dark:border-white/[0.08] rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-zinc-700 dark:text-zinc-100 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* 1.5 温度调节滑块 */}
            <div className="p-4 flex items-center space-x-3.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                <Sliders className="w-4 h-4" />
              </div>
              <div className="flex-1 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">生成温度 (Temperature)</span>
                    <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                      {temperature}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    {temperature <= 0.3 ? '严谨精准，忠于知识库事实' : temperature >= 0.7 ? '发散创造，语言更富有联想' : '适中平衡，推荐通用场景'}
                  </div>
                </div>
                <div className="w-48 flex items-center space-x-2">
                  <span className="text-[11px] text-zinc-400">0.0</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <span className="text-[11px] text-zinc-400">1.0</span>
                </div>
              </div>
            </div>
          </div>

          {/* 按钮栏：测试连通性 & 保存模型 */}
          <div className="mt-3 flex items-center justify-between px-1">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || (provider !== 'ollama' && !isConfigured && !apiKey)}
                className="px-4 py-2 rounded-full text-xs font-semibold bg-white dark:bg-white/10 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/15 active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:pointer-events-none flex items-center space-x-1.5"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-blue-500" />}
                <span>测试连通性</span>
              </button>

              {testResult && (
                <div
                  className={`flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${
                    testResult.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  }`}
                >
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
              onClick={handleSaveLlm}
              disabled={savingLlm}
              className="px-6 py-2 rounded-full text-xs font-semibold bg-[#007AFF] text-white hover:bg-blue-600 active:scale-95 transition-all shadow-sm shadow-blue-500/20 disabled:opacity-50"
            >
              {savingLlm ? '保存中...' : '保存模型配置'}
            </button>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            Section 2: 本地存储与资产管理 (Local-First 核心)
        ───────────────────────────────────────────────────────────────── */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase flex items-center justify-between">
            <span>本地存储与数据管理</span>
            <span className="text-[10px] text-zinc-400 font-normal">Local-First 纯本地私有化</span>
          </div>

          <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-sm border border-black/[0.04] dark:border-white/[0.08] p-5 space-y-4 transition-colors">
            {/* 存储容量指标卡片网格 */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-[#F2F2F7]/70 dark:bg-white/[0.04] rounded-xl p-3 space-y-1">
                <div className="text-[11px] text-zinc-400 font-medium">原始文档</div>
                <div className="text-base font-bold text-zinc-800 dark:text-zinc-100">
                  {storageStats?.docs_size_mb || 0} <span className="text-[11px] font-normal text-zinc-400">MB</span>
                </div>
                <div className="text-[10px] text-zinc-500 font-medium">{storageStats?.docs_count || 0} 篇文件</div>
              </div>

              <div className="bg-[#F2F2F7]/70 dark:bg-white/[0.04] rounded-xl p-3 space-y-1">
                <div className="text-[11px] text-zinc-400 font-medium">向量索引库</div>
                <div className="text-base font-bold text-purple-600 dark:text-purple-400">
                  {storageStats?.vector_size_mb || 0} <span className="text-[11px] font-normal text-zinc-400">MB</span>
                </div>
                <div className="text-[10px] text-zinc-500 font-medium">ChromaDB 稠密</div>
              </div>

              <div className="bg-[#F2F2F7]/70 dark:bg-white/[0.04] rounded-xl p-3 space-y-1">
                <div className="text-[11px] text-zinc-400 font-medium">关系数据库</div>
                <div className="text-base font-bold text-blue-600 dark:text-blue-400">
                  {storageStats?.database_size_mb || 0} <span className="text-[11px] font-normal text-zinc-400">MB</span>
                </div>
                <div className="text-[10px] text-zinc-500 font-medium">SQLite WAL</div>
              </div>

              <div className="bg-[#F2F2F7]/70 dark:bg-white/[0.04] rounded-xl p-3 space-y-1">
                <div className="text-[11px] text-zinc-400 font-medium">磁盘总占用</div>
                <div className="text-base font-bold text-zinc-900 dark:text-white">
                  {storageStats?.total_size_mb || 0} <span className="text-[11px] font-normal text-zinc-400">MB</span>
                </div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">100% 本地持有</div>
              </div>
            </div>

            {/* 本地目录路径说明 */}
            <div className="flex items-center justify-between text-xs bg-zinc-50 dark:bg-white/[0.03] border border-zinc-100 dark:border-white/[0.08] px-3.5 py-2.5 rounded-xl font-mono text-zinc-600 dark:text-zinc-300">
              <div className="flex items-center space-x-2 truncate mr-3">
                <HardDrive className="w-4 h-4 text-zinc-400 shrink-0" />
                <span className="truncate" title={storageStats?.app_data_dir}>
                  {storageStats?.app_data_dir || '~/Library/Application Support/ZhiyueAI'}
                </span>
              </div>
              <button
                onClick={handleOpenInFinder}
                disabled={actionLoading === 'finder'}
                className="px-3 py-1 bg-white dark:bg-white/10 border border-zinc-200 dark:border-white/10 rounded-lg font-sans font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-white/15 active:scale-95 transition-all text-xs shrink-0 flex items-center space-x-1 shadow-2xs"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>在 Finder 中打开</span>
              </button>
            </div>

            {/* 存储维护操作按钮组 */}
            <div className="pt-1 flex items-center space-x-3 text-xs">
              <button
                onClick={handleClearCache}
                disabled={actionLoading === 'cache'}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/15 active:scale-95 transition-all font-medium text-zinc-700 dark:text-zinc-200 flex items-center space-x-1.5"
              >
                {actionLoading === 'cache' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-zinc-500" />}
                <span>清理临时缓存</span>
              </button>

              <button
                onClick={handleReindex}
                disabled={actionLoading === 'reindex'}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/15 active:scale-95 transition-all font-medium text-zinc-700 dark:text-zinc-200 flex items-center space-x-1.5"
              >
                {actionLoading === 'reindex' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-purple-600" />}
                <span>全量重建向量索引</span>
              </button>

              <button
                onClick={handleRestoreOnboarding}
                disabled={actionLoading === 'onboarding'}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/15 active:scale-95 transition-all font-medium text-zinc-700 dark:text-zinc-200 flex items-center space-x-1.5"
              >
                {actionLoading === 'onboarding' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5 text-blue-600" />}
                <span>重置/导入新手实操指南</span>
              </button>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            Section 3: 阅读与伴读偏好
        ───────────────────────────────────────────────────────────────── */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            阅读与划词偏好
          </div>

          <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-sm border border-black/[0.04] dark:border-white/[0.08] overflow-hidden divide-y divide-zinc-100 dark:divide-white/[0.06] transition-colors">
            {/* 3.1 划词翻译默认目标语言 */}
            <div className="p-4 flex items-center space-x-3.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                <Globe className="w-4 h-4" />
              </div>
              <div className="flex-1 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">划词翻译目标语言</div>
                  <div className="text-xs text-zinc-400">在正文或伴读区划词点击「翻译」时的优先目标语种</div>
                </div>
                <div className="w-48">
                  <select
                    value={targetLang}
                    onChange={(e) => handleSavePreferences(e.target.value, fontSize)}
                    className="w-full px-3 py-1.5 text-xs font-medium bg-zinc-50 dark:bg-[#2C2C2E] border border-zinc-200 dark:border-white/[0.08] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-zinc-700 dark:text-zinc-100"
                  >
                    <option value="zh-CN" className="dark:bg-[#2C2C2E]">简体中文 (Chinese)</option>
                    <option value="en" className="dark:bg-[#2C2C2E]">现代英文 (English)</option>
                    <option value="ja" className="dark:bg-[#2C2C2E]">自然日文 (Japanese)</option>
                    <option value="fr" className="dark:bg-[#2C2C2E]">优美法文 (French)</option>
                    <option value="de" className="dark:bg-[#2C2C2E]">严谨德文 (German)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 3.2 划词浮窗操作提示 */}
            <div className="p-4 flex items-center space-x-3.5 bg-purple-50/40 dark:bg-purple-950/20">
              <div className="w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">浮窗自由拖拽特性</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  划词呼出的 AI 解答卡片支持按住顶栏随心拖动到屏幕任意位置，防止遮挡原文，并自动记忆摆放位置。
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            Section 4: 使用小贴士与常见解答 (FAQ)
        ───────────────────────────────────────────────────────────────── */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase flex items-center space-x-1">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>使用小贴士与常见解答 (FAQ)</span>
          </div>

          <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-sm border border-black/[0.04] dark:border-white/[0.08] overflow-hidden divide-y divide-zinc-100 dark:divide-white/[0.06] transition-colors">
            {[
              {
                q: '如何获取并配置 DeepSeek API Key？',
                a: '访问 DeepSeek 开放平台（platform.deepseek.com）注册账号，在「API Keys」页面点击创建密钥即可复制。新注册用户通常有免费额度。光笺将密钥存放在本地 SQLite 中，绝不回传任何第三方。',
              },
              {
                q: '什么是离线向量计算？会泄露我的私人文档吗？',
                a: '绝不会。光笺内置了 BAAI/bge-small-zh-v1.5 离线嵌入模型，当您导入文档时，分块与特征向量计算 100% 在您本地 Mac 芯片上完成，不消耗网络 Token。只有在主动发起提问时，系统才将检索出的最相关片段送至大模型。',
              },
              {
                q: '如何实现无网络环境下的 100% 纯离线对话？',
                a: '您可在本地运行 Ollama（如运行 `ollama run deepseek-r1:1.5b`），然后在「服务厂商」下拉菜单选择「Ollama 本地大模型」，无需配置任何 API Key，即可在无网环境下完全私密离线运行！',
              },
              {
                q: '阅读器有哪些好用的快捷技巧？',
                a: '1. 用鼠标在左侧正文或右侧 AI 伴读中划选任意文字，均可秒出「解读 / 翻译 / 要点」胶囊；\n2. 弹出的卡片支持按住顶栏自由拖拽与避让；\n3. 右上角随时可切换「精读排版」与「PDF 原版图文对照」。',
              },
            ].map((faq, idx) => {
              const isOpen = expandedFaq === idx
              return (
                <div key={idx} className="transition-colors hover:bg-zinc-50/50 dark:hover:bg-white/[0.02]">
                  <button
                    onClick={() => setExpandedFaq(isOpen ? null : idx)}
                    className="w-full p-4 flex items-center justify-between text-left text-xs font-semibold text-zinc-800 dark:text-zinc-100"
                  >
                    <span>{faq.q}</span>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-line border-t border-zinc-50 dark:border-white/[0.04] pt-2 animate-fade-in bg-zinc-50/30 dark:bg-white/[0.02]">
                      {faq.a}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            Section 5: 系统诊断与关于
        ───────────────────────────────────────────────────────────────── */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            关于光笺 (Lumen) 与运行环境
          </div>

          <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-sm border border-black/[0.04] dark:border-white/[0.08] p-5 space-y-3 text-xs text-zinc-600 dark:text-zinc-300 transition-colors">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">应用版本</span>
              <span className="font-mono text-zinc-500">v{systemInfo?.version || '1.0.0'} (Desktop Edition)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">系统架构</span>
              <span className="font-mono text-zinc-500">{systemInfo?.arch || 'macOS (arm64)'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">本地离线向量引擎</span>
              <span className="font-mono text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md">
                {systemInfo?.fastembed_model || 'BAAI/bge-small-zh-v1.5 (已就绪)'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">内核通信</span>
              <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                <span>Python IPC 守护线程在线</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
