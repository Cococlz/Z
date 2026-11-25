import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  Brain,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  ExternalLink,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MindmapNode {
  id: string
  title: string
  level: number
  page_index?: number
  branchIndex?: number
  children: MindmapNode[]
}

interface LayoutNode extends MindmapNode {
  x: number
  y: number
  width: number
  height: number
  children: LayoutNode[]
}

const BRANCH_COLORS = [
  { stroke: '#8B5CF6', bg: 'bg-purple-500/10 dark:bg-purple-500/15', border: 'border-purple-500/30', text: 'text-purple-600 dark:text-purple-300', dot: 'bg-purple-500' },
  { stroke: '#10B981', bg: 'bg-emerald-500/10 dark:bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-300', dot: 'bg-emerald-500' },
  { stroke: '#3B82F6', bg: 'bg-blue-500/10 dark:bg-blue-500/15', border: 'border-blue-500/30', text: 'text-blue-600 dark:text-blue-300', dot: 'bg-blue-500' },
  { stroke: '#F59E0B', bg: 'bg-amber-500/10 dark:bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-600 dark:text-amber-300', dot: 'bg-amber-500' },
  { stroke: '#EC4899', bg: 'bg-pink-500/10 dark:bg-pink-500/15', border: 'border-pink-500/30', text: 'text-pink-600 dark:text-pink-300', dot: 'bg-pink-500' },
  { stroke: '#06B6D4', bg: 'bg-cyan-500/10 dark:bg-cyan-500/15', border: 'border-cyan-500/30', text: 'text-cyan-600 dark:text-cyan-300', dot: 'bg-cyan-500' },
]

// ── Parser: Convert Outline / TOC to Mindmap Tree ────────────────────────────

export function parseToMindmapTree(
  docTitle: string,
  markdownOutline?: string,
  toc?: { id: string; title: string; level: number; page_index: number }[],
  pages?: { page_number: number; section_title?: string; content: string }[]
): MindmapNode {
  const root: MindmapNode = {
    id: 'root',
    title: docTitle.replace(/\.[a-zA-Z0-9]+$/, '') || '文档思维脑图',
    level: 0,
    children: [],
  }

  // 1. 优先解析 AI 生成的结构化思维大纲
  if (markdownOutline && markdownOutline.trim().length > 20) {
    const lines = markdownOutline.split('\n')
    const stack: { node: MindmapNode; level: number }[] = [{ node: root, level: 0 }]
    let autoId = 1
    let titlePromoted = false

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue

      // 检测层级
      let level = 1
      let title = line

      const mdMatch = line.match(/^(#{1,6})\s+(.*)/)
      const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)/)

      if (mdMatch) {
        const hashes = mdMatch[1].length
        title = mdMatch[2].trim()

        // 如果第一行是 # 标题且类似文档总大纲标题，则提升为 root.title
        if (hashes === 1 && !titlePromoted && root.children.length === 0) {
          root.title = title.replace(/\*\*/g, '').trim()
          titlePromoted = true
          continue
        }

        level = titlePromoted ? Math.max(1, hashes - 1) : hashes
      } else if (listMatch) {
        const indent = rawLine.search(/\S/)
        level = 2 + Math.floor(indent / 2)
        title = listMatch[3].trim()
      } else if (/^[一二三四五六七八九十]+[、. ]/.test(line)) {
        level = 1
        title = line
      } else if (/^\d+[.、 ]/.test(line)) {
        level = 2
        title = line
      } else {
        continue
      }

      // 清理常见前缀与加粗符号
      title = title.replace(/\*\*/g, '').replace(/^[#\-*+\d.、\s]+/, '').trim()
      if (!title || title.length > 80) continue

      // 尝试匹配原文页码
      let pageIndex: number | undefined
      if (toc && toc.length > 0) {
        const matchedToc = toc.find((t) => t.title && (title.includes(t.title) || t.title.includes(title)))
        if (matchedToc) pageIndex = matchedToc.page_index
      }
      if (pageIndex === undefined && pages && pages.length > 0) {
        const matchedPage = pages.find((p) => p.section_title && (title.includes(p.section_title) || p.section_title.includes(title)))
        if (matchedPage) pageIndex = matchedPage.page_number - 1
      }

      const node: MindmapNode = {
        id: `node_${autoId++}`,
        title,
        level,
        page_index: pageIndex,
        children: [],
      }

      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop()
      }

      const parent = stack[stack.length - 1].node
      node.branchIndex = parent === root ? parent.children.length % BRANCH_COLORS.length : parent.branchIndex
      parent.children.push(node)
      stack.push({ node, level })
    }

    if (root.children.length > 0) {
      return root
    }
  }

  // 2. 次选：从文档原生结构化目录 (TOC) 解析
  if (toc && toc.length > 0) {
    const stack: { node: MindmapNode; level: number }[] = [{ node: root, level: 0 }]
    for (const item of toc) {
      const node: MindmapNode = {
        id: item.id || `toc_${Math.random()}`,
        title: item.title,
        level: item.level || 1,
        page_index: item.page_index,
        children: [],
      }

      while (stack.length > 1 && stack[stack.length - 1].level >= (item.level || 1)) {
        stack.pop()
      }

      const parent = stack[stack.length - 1].node
      node.branchIndex = parent === root ? parent.children.length % BRANCH_COLORS.length : parent.branchIndex
      parent.children.push(node)
      stack.push({ node, level: item.level || 1 })
    }
    if (root.children.length > 0) {
      return root
    }
  }

  // 3. 保底：按页面章节段落生成基础脑图
  if (pages && pages.length > 0) {
    pages.forEach((p, idx) => {
      root.children.push({
        id: `page_${idx}`,
        title: p.section_title || `第 ${p.page_number} 章节`,
        level: 1,
        page_index: idx,
        branchIndex: idx % BRANCH_COLORS.length,
        children: [],
      })
    })
  }

  return root
}

// ── Tree Layout Calculation ──────────────────────────────────────────────────

function computeTreeLayout(
  node: MindmapNode,
  collapsedSet: Set<string>,
  startX: number,
  startY: number
): { layout: LayoutNode; height: number; width: number } {
  const isRoot = node.level === 0
  const width = isRoot
    ? Math.max(160, Math.min(280, node.title.length * 14 + 50))
    : Math.max(140, Math.min(240, node.title.length * 12 + 40))
  const height = isRoot ? 48 : 38

  const isCollapsed = collapsedSet.has(node.id)
  const effectiveChildren = isCollapsed ? [] : node.children

  if (effectiveChildren.length === 0) {
    const layout: LayoutNode = {
      ...node,
      x: startX,
      y: startY,
      width,
      height,
      children: [],
    }
    return { layout, height, width }
  }

  const childX = startX + width + 80
  let currentY = startY
  const childrenLayouts: LayoutNode[] = []
  let totalChildHeight = 0
  let maxChildWidth = 0

  effectiveChildren.forEach((child, idx) => {
    const res = computeTreeLayout(child, collapsedSet, childX, currentY)
    childrenLayouts.push(res.layout)
    currentY += res.height + 20
    totalChildHeight += res.height + (idx > 0 ? 20 : 0)
    maxChildWidth = Math.max(maxChildWidth, res.width)
  })

  // 根节点垂直居中对其所有子节点
  const firstChild = childrenLayouts[0]
  const lastChild = childrenLayouts[childrenLayouts.length - 1]
  const centerY = (firstChild.y + lastChild.y + lastChild.height) / 2 - height / 2

  const layout: LayoutNode = {
    ...node,
    x: startX,
    y: centerY,
    width,
    height,
    children: childrenLayouts,
  }

  return {
    layout,
    height: Math.max(height, totalChildHeight),
    width: width + 80 + maxChildWidth,
  }
}

// ── Main Mindmap Component ───────────────────────────────────────────────────

export const MindmapModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  docTitle: string
  markdownOutline?: string
  toc?: { id: string; title: string; level: number; page_index: number }[]
  pages?: { page_number: number; section_title?: string; content: string }[]
  onNavigateToPage?: (pageIndex: number) => void
  isInline?: boolean
}> = ({
  isOpen,
  onClose,
  docTitle,
  markdownOutline,
  toc,
  pages,
  onNavigateToPage,
  isInline = false,
}) => {
  // 构建树形数据
  const rootTree = useMemo(() => {
    return parseToMindmapTree(docTitle, markdownOutline, toc, pages)
  }, [docTitle, markdownOutline, toc, pages])

  // 默认折叠二级以下子节点，保证初始全景清晰整洁
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    const collect = (n: MindmapNode) => {
      if (n.level >= 2 && n.children.length > 0) {
        initial.add(n.id)
      }
      n.children.forEach(collect)
    }
    const tree = parseToMindmapTree(docTitle, markdownOutline, toc, pages)
    collect(tree)
    return initial
  })

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 40, y: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [selectedNode, setSelectedNode] = useState<LayoutNode | null>(null)
  const [exporting, setExporting] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  // 计算节点布局
  const { layout: rootLayout, height: totalTreeHeight, width: totalTreeWidth } = useMemo(() => {
    return computeTreeLayout(rootTree, collapsedSet, 80, 80)
  }, [rootTree, collapsedSet])

  // 重置视角居中：无论多大层级，始终将根节点垂直居中在视野中央
  const handleResetView = () => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const targetZoom = isInline
      ? 0.72
      : Math.min(1.15, Math.max(0.65, (rect.width - 160) / Math.max(totalTreeWidth, 800)))
    setZoom(targetZoom)
    setPan({
      x: isInline ? 20 : 60,
      y: rect.height / 2 - (rootLayout.y + rootLayout.height / 2) * targetZoom,
    })
  }

  useEffect(() => {
    if (isOpen) {
      handleResetView()
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isInline) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, rootTree, onClose, isInline])

  // 鼠标拖拽画布平移
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.mindmap-interactive-node')) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // 滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setZoom((z) => Math.min(2.0, Math.max(0.4, z + delta)))
    } else {
      setPan((p) => ({ x: p.x - e.deltaX * 0.8, y: p.y - e.deltaY * 0.8 }))
    }
  }

  // 折叠 / 展开分支
  const toggleCollapse = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCollapsedSet((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  // 展开全部 / 收起全部
  const handleExpandAll = () => setCollapsedSet(new Set())
  const handleCollapseAll = () => {
    const next = new Set<string>()
    const collect = (n: MindmapNode) => {
      if (n.children.length > 0 && n.level > 0) next.add(n.id)
      n.children.forEach(collect)
    }
    collect(rootTree)
    setCollapsedSet(next)
  }

  // 点击节点穿透到原文
  const handleNodeClick = (node: LayoutNode) => {
    setSelectedNode(node)
    if (node.page_index !== undefined && onNavigateToPage) {
      onNavigateToPage(node.page_index)
      if (!isInline) {
        onClose()
      }
    }
  }

  // 导出高清 PNG 图片
  const handleExportPng = () => {
    if (exporting) return
    setExporting(true)
    try {
      const canvas = document.createElement('canvas')
      const padding = 120
      const dpr = 2 // 视网膜清晰度
      const canvasWidth = totalTreeWidth + padding * 2
      const canvasHeight = totalTreeHeight + padding * 2
      canvas.width = canvasWidth * dpr
      canvas.height = canvasHeight * dpr
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.scale(dpr, dpr)

      // 背景 (优雅深灰 / 纯净纸白)
      const isDark = document.documentElement.classList.contains('dark')
      ctx.fillStyle = isDark ? '#18181B' : '#FAFAFA'
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)

      // 绘制水印与标题
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.85)' : '#18181B'
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      ctx.fillText(`《${docTitle}》· 光笺思维导图`, padding, 60)

      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : '#71717A'
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      ctx.fillText(`生成于 ${new Date().toLocaleDateString('zh-CN')} · 光笺 (Lumen) 本地优先知识工作站`, padding, 85)

      // 递归绘制连接线与卡片
      const offsetX = padding - 40
      const offsetY = padding + 40

      const drawConnections = (node: LayoutNode) => {
        const x1 = node.x + node.width + offsetX
        const y1 = node.y + node.height / 2 + offsetY

        node.children.forEach((child) => {
          const x2 = child.x + offsetX
          const y2 = child.y + child.height / 2 + offsetY
          const dx = (x2 - x1) * 0.5

          const branchColor = BRANCH_COLORS[child.branchIndex ?? 0]?.stroke || '#8B5CF6'
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2)
          ctx.strokeStyle = branchColor
          ctx.lineWidth = child.level === 1 ? 2.5 : 1.8
          ctx.stroke()

          drawConnections(child)
        })
      }

      const drawNodes = (node: LayoutNode) => {
        const x = node.x + offsetX
        const y = node.y + offsetY
        const r = 12

        // 圆角矩形卡片
        ctx.beginPath()
        ctx.roundRect(x, y, node.width, node.height, r)

        if (node.level === 0) {
          ctx.fillStyle = '#7C3AED'
          ctx.fill()
          ctx.fillStyle = '#FFFFFF'
          ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif'
        } else {
          ctx.fillStyle = isDark ? '#27272A' : '#FFFFFF'
          ctx.fill()
          ctx.lineWidth = 1.5
          ctx.strokeStyle = BRANCH_COLORS[node.branchIndex ?? 0]?.stroke || '#8B5CF6'
          ctx.stroke()
          ctx.fillStyle = isDark ? '#F4F4F5' : '#18181B'
          ctx.font = node.level === 1 ? '600 12px -apple-system, sans-serif' : '11px -apple-system, sans-serif'
        }

        // 文字
        ctx.fillText(node.title.slice(0, 18), x + 14, y + node.height / 2 + 4)

        node.children.forEach(drawNodes)
      }

      drawConnections(rootLayout)
      drawNodes(rootLayout)

      // 触发下载 (通过 Blob URL 兼容 Electron 运行环境)
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `光笺_思维脑图_${docTitle.replace(/\.[^/.]+$/, '')}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 2000)
      }, 'image/png')
    } finally {
      setExporting(false)
    }
  }

  // 递归收集所有连线与节点
  const renderTreeElements = () => {
    const lines: React.ReactNode[] = []
    const nodes: React.ReactNode[] = []

    const traverse = (node: LayoutNode) => {
      const isRoot = node.level === 0
      const branchStyle = BRANCH_COLORS[node.branchIndex ?? 0] || BRANCH_COLORS[0]
      const isSelected = selectedNode?.id === node.id
      const hasChildren = node.children.length > 0 || (node as MindmapNode).children?.length > 0
      const isCollapsed = collapsedSet.has(node.id)

      // 1. 连线
      node.children.forEach((child) => {
        const x1 = node.x + node.width
        const y1 = node.y + node.height / 2
        const x2 = child.x
        const y2 = child.y + child.height / 2
        const dx = (x2 - x1) * 0.5
        const childBranch = BRANCH_COLORS[child.branchIndex ?? 0] || BRANCH_COLORS[0]

        lines.push(
          <path
            key={`line_${node.id}_${child.id}`}
            d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke={childBranch.stroke}
            strokeWidth={child.level === 1 ? 2.5 : 1.8}
            className="transition-all duration-300 opacity-70 hover:opacity-100"
          />
        )
      })

      // 2. 节点卡片
      nodes.push(
        <div
          key={`node_${node.id}`}
          onClick={() => handleNodeClick(node)}
          style={{
            left: node.x,
            top: node.y,
            width: node.width,
            height: node.height,
          }}
          className={`mindmap-interactive-node absolute flex items-center justify-between px-3 py-1.5 rounded-2xl cursor-pointer select-none transition-all duration-200 ${
            isRoot
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold shadow-lg ring-2 ring-purple-400/30'
              : `bg-white dark:bg-[#1E1E20] border ${branchStyle.border} ${
                  isSelected
                    ? 'ring-2 ring-purple-500 shadow-md scale-105'
                    : 'hover:shadow-md hover:border-purple-400'
                }`
          }`}
          title={`${node.title}${node.page_index !== undefined ? ` (点击直达第 ${node.page_index + 1} 页)` : ''}`}
        >
          {/* 左侧分支圆点 */}
          {!isRoot && (
            <span className={`w-2 h-2 rounded-full shrink-0 mr-2 ${branchStyle.dot}`} />
          )}

          {/* 节点文本 */}
          <span
            className={`truncate text-xs ${
              isRoot
                ? 'text-white'
                : node.level === 1
                ? 'font-bold text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-700 dark:text-zinc-300'
            }`}
          >
            {node.title}
          </span>

          <div className="flex items-center space-x-1 shrink-0 ml-2">
            {/* 页码徽标 */}
            {node.page_index !== undefined && (
              <span
                className={`text-[9px] font-mono px-1 py-0.2 rounded-md ${
                  isRoot ? 'bg-white/20 text-white' : 'bg-black/5 dark:bg-white/10 text-zinc-500 dark:text-zinc-400'
                }`}
              >
                P.{node.page_index + 1}
              </span>
            )}

            {/* 折叠/展开控制按钮 */}
            {hasChildren && !isRoot && (
              <button
                onClick={(e) => toggleCollapse(node.id, e)}
                className="w-4 h-4 rounded-full bg-black/5 dark:bg-white/10 hover:bg-purple-500 hover:text-white flex items-center justify-center text-[10px] text-zinc-400 transition"
                title={isCollapsed ? '展开子分支' : '收起子分支'}
              >
                {isCollapsed ? '+' : '−'}
              </button>
            )}
          </div>
        </div>
      )

      node.children.forEach(traverse)
    }

    traverse(rootLayout)
    return { lines, nodes }
  }

  if (!isOpen) return null

  const { lines, nodes } = renderTreeElements()

  // 内部画布内容
  const canvasContent = (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      className={`relative w-full h-full overflow-hidden select-none cursor-grab active:cursor-grabbing bg-slate-50/50 dark:bg-[#121214]`}
    >
      {/* 坐标网格底纹 */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: `radial-gradient(circle, #8B5CF6 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      {/* 变换层 */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: totalTreeWidth + 200,
          height: totalTreeHeight + 200,
        }}
        className="absolute left-0 top-0 transition-transform duration-75"
      >
        <svg
          className="absolute left-0 top-0 pointer-events-none overflow-visible"
          style={{ width: totalTreeWidth + 200, height: totalTreeHeight + 200 }}
        >
          {lines}
        </svg>

        <div className="absolute left-0 top-0">{nodes}</div>
      </div>

      {/* 浮动画布控制器 */}
      <div className="absolute bottom-5 right-5 z-20 flex items-center space-x-1.5 p-1.5 rounded-2xl bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md shadow-lg border border-black/[0.05] dark:border-white/[0.1] text-xs">
        <button
          onClick={() => setZoom((z) => Math.min(2.0, z + 0.15))}
          className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 transition"
          title="放大画布"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-mono font-semibold px-1 text-zinc-500">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
          className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 transition"
          title="缩小画布"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-3.5 bg-black/10 dark:bg-white/10" />
        <button
          onClick={handleResetView}
          className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 transition"
          title="适屏居中"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-3.5 bg-black/10 dark:bg-white/10" />
        <button
          onClick={handleExpandAll}
          className="px-2 py-1 rounded-xl text-[10px] font-medium hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 transition"
        >
          展开全部
        </button>
        <button
          onClick={handleCollapseAll}
          className="px-2 py-1 rounded-xl text-[10px] font-medium hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 transition"
        >
          收拢
        </button>
      </div>

      {/* 底部点击穿透提示 */}
      {selectedNode && selectedNode.page_index !== undefined && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-3 px-4 py-2 rounded-2xl bg-zinc-900/90 dark:bg-white/95 text-white dark:text-zinc-900 shadow-xl backdrop-blur-md text-xs font-semibold animate-slide-up">
          <span>选中: 《{selectedNode.title}》</span>
          <button
            onClick={() => {
              if (onNavigateToPage && selectedNode.page_index !== undefined) {
                onNavigateToPage(selectedNode.page_index)
                if (!isInline) onClose()
              }
            }}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-purple-600 text-white hover:bg-purple-700 active:scale-95 transition"
          >
            <ExternalLink className="w-3 h-3" />
            <span>直达原文 P.{selectedNode.page_index + 1}</span>
          </button>
        </div>
      )}
    </div>
  )

  // 1. 若为内联嵌入模式
  if (isInline) {
    return (
      <div className="w-full h-full flex flex-col rounded-2xl overflow-hidden border border-black/[0.06] dark:border-white/[0.08]">
        {canvasContent}
      </div>
    )
  }

  // 2. 独立全屏沉浸模态画布
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full h-full max-w-7xl bg-white dark:bg-[#18181A] rounded-3xl shadow-2xl border border-black/[0.08] dark:border-white/[0.1] flex flex-col overflow-hidden animate-scale-up">
        {/* 顶部标题栏 */}
        <div className="flex-none h-14 px-6 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between bg-white/70 dark:bg-[#1E1E20]/70 backdrop-blur-md z-10">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <span>思维脑图画布</span>
                <span className="text-[11px] font-normal text-zinc-400 font-mono">· 点击节点即刻穿透原文</span>
              </h2>
              <p className="text-[10px] text-zinc-400 truncate max-w-md">{docTitle}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* 一键导出高清 PNG */}
            <button
              onClick={handleExportPng}
              disabled={exporting}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 active:scale-95 text-white transition shadow-xs"
              title="导出高清思维导图图片"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exporting ? '导出中…' : '导出 PNG 脑图'}</span>
            </button>

            {/* 关闭 */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition"
              title="关闭脑图 (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 画布主体 */}
        <div className="flex-1 w-full h-full relative overflow-hidden">
          {canvasContent}
        </div>
      </div>
    </div>
  )
}
