"""
Onboarding Service — 管理出厂内置的「快速上手与功能示范」示例文档
"""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from sqlalchemy.orm import Session

from app.database.models import Document
from app.services.document_service import import_document

logger = logging.getLogger(__name__)

ONBOARDING_FILENAME = "智阅 AI 快速上手与功能示范.md"

ONBOARDING_CONTENT = """# 智阅 AI 快速上手与功能示范

欢迎来到 **智阅 AI（Zhiyue AI）** —— 专为 macOS 打造的 Local-First 个人智能文档工作站与深度阅读器。

本指南不仅是一份产品介绍，更是一个**可以直接用于实操的沙盒互动文档**。请跟随下方的实操步骤，逐一体验智阅 AI 的核心特色能力。

---

## 🚀 实操第一步：划词 AI 悬浮工具栏与自由拖拽

> 💡 **操作指引**：请用鼠标按住并划选下方这段文字中的任意句子。

**“Local-First 软件架构将用户的数据主权与本地优先作为核心原则。通过在设备本地持久化存储结构化数据库与离线向量索引，用户不仅能享受零延迟、无网络依赖的计算体验，还能彻底消除云端隐私泄露的顾虑。”**

划选后，您会看到一个精致的 iOS 胶囊工具栏浮现：
1. **💡 解读**：点击让 AI 导师通俗化剖析专业概念与深层逻辑；
2. **🌐 翻译**：针对英文原著、学术术语一键精准多语言语境翻译；
3. **📝 要点**：提炼所选文段的一句话精髓；
4. **📋 复制**：快速将选中文字复制至剪贴板。

> ✨ **亮点体验（自由拖拽与记忆）**：  
> 尝试用鼠标按住弹出的解答卡片顶部的**灰色拖拽指示条**，随心将卡片拖动到屏幕任意位置。浮窗会自动避让正文，拖动到合适位置后松开，后续划词将自动记住您的专属阅读摆放习惯！

---

## ⌨️ 实操第二步：四色极客键盘流沉浸批注

阅读过程中频繁挪动鼠标容易打断心流。智阅 AI 深度整合了键盘流操作：

1. **一键极速划线**：
   - 鼠标划选任意文本后，无需移动鼠标，直接在键盘上敲击数字键：
     - 按 **`1`** 键：标记为 🟡 **核心重点 (Yellow)**；
     - 按 **`2`** 键：标记为 🟢 **认知理解 (Green)**；
     - 按 **`3`** 键：标记为 🟣 **个人思考 (Purple)** 并支持追加思考批注；
     - 按 **`4`** 键：标记为 🔵 **疑难困惑 (Blue)**。
2. **键盘翻页流**：
   - 键盘按下 **`J`** 或 **`←`**：瞬间翻至上一章节/上一页；
   - 键盘按下 **`K`** 或 **`→`**：瞬间翻至下一章节/下一页；
   - 键盘按下 **`Esc`**：快速退出任何弹窗或菜单。

---

## 🌟 实操第三步：四色高亮与 AI 全篇划线串联解读

1. 在右侧面板切换至 **「笔记」** 标签页，您会看到刚才所做的高亮已经按照色彩与标签规整陈列；
2. 点击笔记顶部的 **「🌟 全篇划线 AI 串联解读」** 按钮：
   - AI 将自动读取散落在全书各处的四色划线；
   - 将 🟡重点 与 🟢理解 融会贯通为一条完整的知识脉络；
   - 针对您标记的 🔵疑问 开展定制攻坚剖析，并对 🟣思考 给出导师级指导；
   - 生成全景 Markdown 研读报告，支持一键复制与本地导出！

---

## 🧠 实操第四步：交互式思维脑图画布 (Mindmap Canvas)

1. 点击右侧面板的 **「思维大纲」** 标签，切换至 **「脑图」** 视图，或点击 **「⛶ 全屏脑图」**；
2. 体验无限画布交互：
   - **平移与缩放**：按住鼠标左键自由拖动画布，使用鼠标滚轮在 40% ~ 200% 之间丝滑缩放；
   - **分支折叠**：点击节点圆点可折叠或展开下级分支，保持思维视野井井有条；
   - **🎯 直达原文**：点击脑图上的任意节点，下方弹出「直达原文 P.X」，一键穿透回正文位置；
   - **📥 导出高清 PNG**：点击左上角导出按钮，一键生成基于 2x Retina 离线渲染的透明高清脑图图片！

---

## 💬 实操第五步：即时伴读追问、RRF 混合检索与原文溯源胶囊

1. 点击右侧面板的 **「即时追问」** 标签，输入您的疑问（例如：“Local-First 的三大核心优势是什么？”）；
2. 观察 AI 伴读的深度回复：
   - 底层采用 **ChromaDB 稠密向量 + SQLite 稀疏关键词精确分词的 RRF 混合检索**，保证代码、专有名词 100% 准确命中；
   - 每条回答底部均附带 **可点击溯源微胶囊（如 `[ 🧭 P.1 · 核心原则 ]`）**；
   - 点击微胶囊，阅读器不仅瞬间跳转至该页，页眉还会闪烁 **`📍 溯源已定位`**，同时整个段落伴随 2.2 秒科技感呼吸柔光脉冲，精准指引阅读视线！
3. **按文档独立记忆**：切换至其他文档，伴读对话自动隔离保存；切回本文档完整还原，点击「新对话」可一键重置。

---

## 📚 实操第六步：知识库卡片网格与批量多选管理

点击左侧导航栏的 **「文档知识库」**：
1. **双视图自由切换**：点击右上角视图切换按钮，体验 Apple Books 风格封面网格与紧凑文献列表；
2. **即时重命名**：双击任意文档标题或点击铅笔按钮，原地输入新文件名按 Enter 即可保存；
3. **批量管理胶囊栏**：勾选多份文档，底部浮出毛玻璃工具栏，一键批量打标、批量导出笔记或批量安全删除；
4. **Spotlight 聚焦搜索**：在任意界面随时按下 **`⌘ + K`**，毫秒级跨文档全文检索直达。

---

## 🛡️ 数据隐私与系统安全承诺

智阅 AI 坚定践行 Local-First 理念：
- **数据存储**：所有原始文档与 SQLite 数据库均保存在您 Mac 的 `~/Library/Application Support/ZhiyueAI` 目录中；
- **向量化模型**：内置 `BAAI/bge-small-zh-v1.5` 向量模型，100% 离线计算，无需消耗任何 API Token；
- **API 密钥**：仅在本地加密保存，仅在您主动发起提问、划词解读或全文提炼时向大模型发送必要上下文。

祝您阅读愉快，开启高效专属的个人知识沉淀之旅！
"""


def ensure_onboarding_document(db: Session) -> Document | None:
    """如果知识库为空，自动创建并索引出厂示范文档"""
    existing_count = db.query(Document).count()
    if existing_count > 0:
        return None

    return restore_onboarding_document(db)


def restore_onboarding_document(db: Session) -> Document:
    """创建或重新导入新手示范文档（支持用户在设置中主动恢复）"""
    # 检查是否已存在同名旧示范文档，若存在先安全清除旧记录以便重新解析完整版
    existing = db.query(Document).filter(Document.name == ONBOARDING_FILENAME).first()
    if existing:
        from app.services.document_service import delete_document
        delete_document(db, existing.id)

    # 写入临时文件并通过标准流程导入
    with tempfile.NamedTemporaryFile("w", suffix=".md", encoding="utf-8", delete=False) as f:
        f.write(ONBOARDING_CONTENT)
        tmp_path = Path(f.name)

    try:
        doc, _ = import_document(db, tmp_path, ONBOARDING_FILENAME)
        logger.info("成功创建出厂新手指南文档: %s (ID: %s)", ONBOARDING_FILENAME, doc.id)
        return doc
    finally:
        if tmp_path.exists():
            tmp_path.unlink()
