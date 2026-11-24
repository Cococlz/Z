import React, { useState } from 'react'
import { Sparkles, Terminal, Key, ArrowRight, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useDocStore } from '../stores/docStore'

interface NoApiKeyNoticeProps {
  compact?: boolean
  onActionSuccess?: () => void
  contextDesc?: string
}

export const NoApiKeyNotice: React.FC<NoApiKeyNoticeProps> = ({
  compact = false,
  onActionSuccess,
  contextDesc = '生成摘要与深度解读需要大模型引擎驱动',
}) => {
  const { setActivePage, quickSwitchToOllama } = useDocStore()
  const [switching, setSwitching] = useState(false)
  const [switchSuccess, setSwitchSuccess] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)

  const handleSwitchOllama = async () => {
    setSwitching(true)
    setSwitchError(null)
    try {
      const res = await quickSwitchToOllama()
      if (res.ok) {
        setSwitchSuccess(true)
        setTimeout(() => {
          onActionSuccess?.()
        }, 800)
      } else {
        setSwitchError(res.message)
      }
    } catch (e: any) {
      setSwitchError(e.message || '切换失败')
    } finally {
      setSwitching(false)
    }
  }

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent || '')
  const modKeyLabel = isMac ? '⌘K' : 'Ctrl+K'

  if (compact) {
    return (
      <div className="bg-gradient-to-br from-purple-50/90 via-white to-indigo-50/80 border border-purple-200/70 rounded-2xl p-3.5 space-y-2.5 text-xs text-zinc-700 shadow-sm animate-fade-in select-none">
        <div className="flex items-center space-x-2 text-purple-700 font-semibold">
          <Sparkles className="w-4 h-4 shrink-0 text-purple-600" />
          <span>尚未配置 AI 文本生成引擎</span>
        </div>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          双视图精读与 {modKeyLabel} 搜索完全本地可用。{contextDesc}，请选择：
        </p>

        {switchError && (
          <div className="text-[11px] text-rose-500 bg-rose-50/80 px-2 py-1 rounded-lg">
            {switchError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={handleSwitchOllama}
            disabled={switching || switchSuccess}
            className="flex items-center justify-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium text-[11px] shadow-sm transition-all active:scale-95 disabled:opacity-60"
            title="免密钥运行，需本地已安装并运行 Ollama"
          >
            {switching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : switchSuccess ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
            ) : (
              <Terminal className="w-3.5 h-3.5" />
            )}
            <span>{switchSuccess ? '已开启 Ollama' : '切换本地 Ollama'}</span>
          </button>

          <button
            onClick={() => setActivePage('settings')}
            className="flex items-center justify-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-zinc-50 border border-zinc-200/80 text-zinc-700 font-medium text-[11px] transition-all active:scale-95 shadow-2xs"
          >
            <Key className="w-3.5 h-3.5 text-amber-500" />
            <span>配置 DeepSeek</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-b from-purple-50/70 via-white to-zinc-50/50 border border-purple-200/60 rounded-3xl p-5 space-y-4 shadow-sm animate-fade-in text-left select-none">
      {/* 头部标题与本地离线提示 */}
      <div className="flex items-start space-x-3">
        <div className="w-9 h-9 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-600 shrink-0 shadow-2xs">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="space-y-0.5">
          <h4 className="text-sm font-bold text-zinc-900 tracking-tight">
            尚未配置 AI 文本生成引擎
          </h4>
          <p className="text-xs text-zinc-500 leading-relaxed">
            智阅 AI 采用 Local-First 架构，文档解析、双视图精读与 {modKeyLabel} 混合检索已 <span className="font-semibold text-emerald-600">100% 本地离线就绪</span>。
          </p>
        </div>
      </div>

      <div className="text-xs text-zinc-600 leading-relaxed bg-white/80 rounded-2xl p-3 border border-black/[0.04]">
        {contextDesc}，您可以选择以下任一方式无缝启用：
      </div>

      {switchError && (
        <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200/60 px-3 py-2 rounded-xl">
          {switchError}
        </div>
      )}

      {/* 两个核心选项卡片 */}
      <div className="space-y-2.5">
        {/* 选项 1: 本地 Ollama */}
        <div className="bg-white rounded-2xl p-3.5 border border-purple-100 hover:border-purple-200 transition-all shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-zinc-800">🖥️ 本地纯离线模型 (Ollama)</span>
              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-md text-[10px] font-medium">
                免 Key · 0 费用
              </span>
            </div>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <p className="text-[11px] text-zinc-500 leading-normal">
            连接本地运行的 Ollama (如 DeepSeek-R1 / Qwen2.5)，无需互联网，数据绝不离机。
          </p>
          <button
            onClick={handleSwitchOllama}
            disabled={switching || switchSuccess}
            className="w-full flex items-center justify-center space-x-2 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs shadow-sm transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {switching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : switchSuccess ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            ) : (
              <Terminal className="w-4 h-4" />
            )}
            <span>{switchSuccess ? '已成功切换为 Ollama 本地模型！' : '一键切换为本地 Ollama (免密钥)'}</span>
          </button>
        </div>

        {/* 选项 2: DeepSeek 官方 API */}
        <div className="bg-white rounded-2xl p-3.5 border border-zinc-200/70 hover:border-blue-200 transition-all shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-zinc-800">⚡️ DeepSeek 云端大模型</span>
              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200/60 rounded-md text-[10px] font-medium">
                高智力 · 极低成本
              </span>
            </div>
            <Key className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <p className="text-[11px] text-zinc-500 leading-normal">
            注册 DeepSeek 官方获赠免费体验额度，充值 5 元即可深度阅读百本长文档。
          </p>
          <button
            onClick={() => setActivePage('settings')}
            className="w-full flex items-center justify-center space-x-1.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-medium text-xs transition-all active:scale-[0.98]"
          >
            <span>前往系统设置配置 API Key</span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
      </div>
    </div>
  )
}
