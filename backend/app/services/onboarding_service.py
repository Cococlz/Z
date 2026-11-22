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

本指南不仅是一份产品介绍，更是一个**可以直接用于实操的沙盒互动文档**。请跟随下方的步骤，逐一体验智阅 AI 的核心特色能力。

---

## 🚀 实操第一步：划词 AI 悬浮工具栏与自由拖拽

> 💡 **操作指引**：请用鼠标按住并划选下方这段文字中的任意句子。

**“Local-First 软件架构将用户的数据主权与本地优先作为核心原则。通过在设备本地持久化存储结构化数据库与离线向量索引，用户不仅能享受零延迟、无网络依赖的计算体验，还能彻底消除云端隐私泄露的顾虑。”**

划选后，您会看到一个精致的 iOS 胶囊工具栏浮现：
1. **💡 解读**：点击让 AI 导师通俗化剖析专业概念与深层逻辑；
2. **🌐 翻译**：针对英文原著、学术术语一键中英精准语境翻译；
3. **📝 要点**：提炼所选文段的一句话精髓；
4. **📋 复制**：快速将选中文字复制至剪贴板。

> ✨ **亮点体验（自由拖拽）**：
> 尝试用鼠标按住弹出的解答卡片顶部的**灰色拖拽指示条**，随心将卡片拖动到屏幕任意位置。浮窗会自动避让正文，拖动到合适位置后松开，后续划词将自动记住您的专属阅读摆放习惯！

---

## 🧠 实操第二步：AI 伴读与 Map-Reduce 提炼引擎

请将视线移至窗口**右侧的「AI 伴读分析」面板**：

1. 点击面板顶部的 **「一键生成」** 按钮；
2. 观察 AI 如何基于 Map-Reduce 分块流水线，实时提炼全文核心：
   - **全局摘要**：宏观俯瞰本文档的立意、价值与全景结论；
   - **思维大纲**：层级化拆解核心结构，如同书籍目录般清晰；
   - **关键知识点**：凝练提炼 3~5 条最具价值的实操精髓。
3. **伴读区同样支持划词**：右侧 AI 生成的总结文字，用鼠标划选也同样可以呼出二次解读与翻译，实现“双向知识互助”！

---

## 📖 实操第三步：双视图精读排版与 PDF 原版对照

在顶部工具栏的右上方，智阅 AI 提供了双视图切换开关：
* **✨ 精读排版**：针对各类文档提取纯净文字，过滤杂乱排版，提供极佳的沉浸式阅读字距与行距；
* **📄 原版图文对照**：当您导入 PDF 格式书籍、论文或合同扫描件时，可随时切换到原版视图，查看高保真矢量排版、图表与原始插图。

---

## 💬 实操第四步：智阅对话与精准证据链溯源

点击左侧导航栏的 **「智阅对话」**：
* 您可以发起跨文档全库提问（例如：“智阅 AI 的本地存储原理是什么？”）；
* 智阅 AI 会调用本地离线向量索引（FastEmbed BGE 模型），毫秒级检索最相关的内容切片；
* 每一条回答底部均附带 **带角标的引用来源（Citations）**，点击即可溯源到具体文档与段落，彻底告别大模型“幻觉”。

---

## 🛠️ 实操第五步：本地格式转换工坊

点击左侧导航栏的 **「格式工坊」**：
* 本地纯离线将 PDF / Word（.docx）高保真转为干净的 Markdown 格式；
* 一键抽取提取 PDF 中的全部原始高分辨率图像资源；
* 零数据上传，全程在您的 Mac 芯片上安全本地完成。

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
