import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'

/**
 * 轻量清洗中文文本中的杂乱标点与多余空白（跳过代码块与反引号内代码）
 * 确保标点准确、简洁，消除中英文标点混用与排版拥挤感
 */
export function normalizeChinesePunctuation(raw: string): string {
  if (!raw) return ''
  // 按围栏代码块拆分，仅对非代码文本做标点规整
  const segments = raw.split(/(```[\s\S]*?```)/g)
  return segments
    .map((seg) => {
      if (seg.startsWith('```')) return seg
      return seg
        .split(/(`[^`\n]+`)/g)
        .map((part) => {
          if (part.startsWith('`')) return part
          return part
            // 中文字符之间的半角逗号/冒号/分号转为标准全角
            .replace(/([\u4e00-\u9fa5])[,]\s*([\u4e00-\u9fa5])/g, '$1，$2')
            .replace(/([\u4e00-\u9fa5])[:]\s*([\u4e00-\u9fa5])/g, '$1：$2')
            .replace(/([\u4e00-\u9fa5])[;]\s*([\u4e00-\u9fa5])/g, '$1；$2')
            // 去除中文标点前多余空格
            .replace(/\s+([，。：；？！、》」】])/g, '$1')
            // 合并连续重复标点（如 ！！ -> ！，。。 -> 。，省略号除外）
            .replace(/([，。：；？！])\1+/g, '$1')
            // 压缩 3 个以上空行为 2 个
            .replace(/\n{3,}/g, '\n\n')
        })
        .join('')
    })
    .join('')
}

interface RichMarkdownProps {
  content: string
  variant?: 'chat' | 'compact'
  className?: string
}

/**
 * 全站通用增强型 Markdown 排版组件
 * 解决原生 prose 样式缺失导致的文字密密麻麻、无分区层级问题
 */
export const RichMarkdown: React.FC<RichMarkdownProps> = ({
  content,
  variant = 'chat',
  className = '',
}) => {
  const isCompact = variant === 'compact'
  const textSize = isCompact ? 'text-[12.5px]' : 'text-[13.5px]'

  const normalized = useMemo(() => normalizeChinesePunctuation(content), [content])

  return (
    <div className={`select-text cursor-text space-y-1.5 ${className}`}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <div className="mt-1 mb-3 px-3.5 py-2.5 rounded-xl border border-purple-500/20 bg-purple-500/[0.06] dark:bg-purple-500/[0.1] font-bold text-sm flex items-center space-x-2">
              <span className="w-1.5 h-4 rounded-full bg-purple-500 shrink-0" />
              <span className="flex-1 text-zinc-900 dark:text-zinc-100 tracking-tight">{children}</span>
            </div>
          ),
          h2: ({ children }) => (
            <div className="mt-4 mb-2 pb-1.5 border-b border-black/[0.06] dark:border-white/[0.08] font-bold text-[13px] flex items-center space-x-2 text-zinc-900 dark:text-zinc-100">
              <span className="w-1.5 h-3.5 rounded-full bg-blue-500 shrink-0" />
              <span className="tracking-tight">{children}</span>
            </div>
          ),
          h3: ({ children }) => (
            <div className="mt-3.5 mb-1.5 px-2.5 py-1 rounded-lg bg-zinc-100/80 dark:bg-white/[0.05] font-semibold text-[12.5px] flex items-center space-x-1.5 text-zinc-800 dark:text-zinc-100">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
              <span>{children}</span>
            </div>
          ),
          p: ({ children }) => (
            <p className={`${textSize} leading-[1.75] my-1.5 text-zinc-700 dark:text-zinc-200`}>
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-zinc-950 dark:text-white bg-amber-500/10 dark:bg-amber-400/15 px-1 py-0.5 rounded-xs">
              {children}
            </strong>
          ),
          ul: ({ children }) => (
            <ul className="space-y-1.5 my-2 pl-2.5 border-l-2 border-blue-500/20 dark:border-blue-400/20">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className={`space-y-1.5 my-2 pl-5 list-decimal marker:font-semibold marker:text-blue-500 ${textSize} leading-[1.75] text-zinc-700 dark:text-zinc-200`}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className={`${textSize} leading-[1.75] flex items-start space-x-2 my-0.5 text-zinc-700 dark:text-zinc-200`}>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500/75 shrink-0 mt-2" />
              <div className="flex-1 min-w-0">{children}</div>
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 pl-3 pr-3 py-2 rounded-r-xl border-l-[3px] border-purple-500 bg-purple-500/[0.05] dark:bg-purple-500/[0.08] text-zinc-700 dark:text-zinc-300 text-xs leading-relaxed">
              {children}
            </blockquote>
          ),
          code: ({ className: codeCls, children }) => {
            const isBlock = Boolean(codeCls && codeCls.includes('language-'))
            if (isBlock) {
              return (
                <code className="block font-mono text-[11.5px] leading-relaxed p-3 my-2 rounded-xl bg-zinc-900 text-zinc-100 overflow-x-auto">
                  {children}
                </code>
              )
            }
            return (
              <code className="font-mono text-[11.5px] px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.08] text-purple-600 dark:text-purple-300 font-medium">
                {children}
              </code>
            )
          },
          hr: () => <hr className="my-3 border-black/[0.06] dark:border-white/[0.08]" />,
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  )
}
