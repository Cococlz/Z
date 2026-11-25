"""
Onboarding Service — 管理出厂内置的「光笺 (Lumen) 3 分钟新手上手指南」示范文档
"""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from sqlalchemy.orm import Session

from app.database.models import Document
from app.services.document_service import import_document

logger = logging.getLogger(__name__)

ONBOARDING_FILENAME = "光笺 (Lumen) 3分钟新手上手指南.md"
OLD_ONBOARDING_FILENAME = "智阅 AI 快速上手与功能示范.md"

ONBOARDING_CONTENT = """# 光笺 (Lumen) · 3 分钟新手上手指南

欢迎使用 **光笺 (Lumen)** —— 一款把你的电脑变成**私人 AI 图书馆**的智能阅读软件（支持 Mac 与 Windows）。

**为什么大家喜欢用光笺？**
- **绝对保密**：你的电子书、论文、工作文档全部只存在你自己的电脑里，**绝不会上传到任何公网平台**；
- **读得更快**：再厚的文档，点一下就能生成**思维导图**，不懂的句子随手一划就能让 AI 给你讲明白；
- **绝不瞎编**：AI 回答的每一句话下面都有**页码标签**，点一下直接跳回原文并呼吸发光定位，有据可查！

---

## ⚙️ 第 0 步：给光笺装上“AI 大脑”（只需 1 分钟）

刚打开软件时，先点左侧最下面的 **「偏好设置」**，选一种适合你的大脑：

### 方式一：使用 DeepSeek（🌟 最推荐 · 充 5~10 块钱能用半年）
1. 打开 DeepSeek 开放平台官网：[https://platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)（支持微信/手机号一键登录）；
2. 在左侧菜单点击 **「充值」**，先充 **¥5 ~ ¥10 元**（读完一本 20 万字的书只需约 3 毛钱，极度划算）；
3. 再点击左侧 **「API keys」** $\rightarrow$ **「创建 API key」**，复制生成的那串以 `sk-` 开头的密钥（只显示一次，请立即复制）；
4. 回到光笺 **「偏好设置」**，厂商保持 **DeepSeek 官方**，把密钥粘贴进去；
5. 点击 **「测试连通性」**（看到绿色延迟提示就成功啦），最后点右边蓝色 **「保存模型配置」**！

> 🎁 **想先白嫖免费额度试用？**  
> 在光笺「偏好设置」里把厂商选为 **「硅基流动 SiliconFlow」**，前往 [https://cloud.siliconflow.cn/account/ak](https://cloud.siliconflow.cn/account/ak) 注册即可免费获赠体验额度，新建密钥粘贴进来就能直接用！

### 方式二：纯离线免费模型（适合完全断网 / 绝密文档）
1. 如果你懂一点电脑操作，可以在电脑上安装免费的 **Ollama** 软件（`ollama.com`），并下载一个模型（比如在终端运行 `ollama run qwen2.5:7b`）；
2. 在光笺「偏好设置」里把厂商切到 **Ollama 本地大模型**，系统会自动识别你电脑里的模型，点保存即可 **0 元断网使用**。

---

## 📚 第 1 步：把你的书或文档拖进来

1. 点击左侧栏的 **「文档知识库」**；
2. 直接把电脑桌面上的 **PDF、EPUB 电子书、Word 或 PPT** 拖进软件窗口里；
3. 1 秒钟就能导入完成，软件会自动在本地为你建好目录和索引，不需要任何等待。

---

## ✨ 第 2 步：边读边划，不懂就问 AI

现在就可以用下面这段话**直接试一试**！用鼠标选中下方这句英文或中文：

> **“Attention Is All You Need: Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions.”**

选中文字后，鼠标上方会弹出一个精致的小工具栏：
- 点 **「💡 解读」**：AI 会结合上下文，用大白话给你解释这句话是什么意思；
- 点 **「🌐 翻译」**：一键翻译成通顺流利的中文；
- 点 **「📝 要点」**：帮你提炼出一句话核心总结。

**键盘党快捷划线**：选中文字后，直接按键盘上的数字键 **`1`（重点黄）、`2`（理解绿）、`3`（思考紫）、`4`（疑问蓝）**，一秒就能做好彩色高亮笔记！

---

## 🧠 第 3 步：一键生成思维导图，点哪跳哪

想在 1 分钟内看透整本书的结构？
1. 看向阅读界面右侧面板，点击 **「思维大纲」** $\rightarrow$ 切换到 **「脑图」**（或者点 **「全屏脑图」**）；
2. 整本书的脉络会像树枝一样展开；
3. **点击脑图上的任何一个小卡片**，阅读页面就会直接带你跳到对应的那一页正文！还可以一键把脑图保存成高清图片。

---

## 🧭 第 4 步：向 AI 提问，点击页码直接发光找原文

1. 在右侧切换到 **「即时追问」**，像聊天一样向 AI 提问（例如：*“光笺有什么特点？”*）；
2. AI 回答完后，下面会出现一个蓝色的页码小胶囊（例如 **`[ 🧭 P.1 · 核心特点 ]`**）；
3. **用鼠标点一下这个蓝色胶囊** —— 左边书页会瞬间翻到那一页，并且那段话还会**亮起呼吸光框**提示你“证据就在这里”！

---

## 💡 小白常用快捷键备忘
- **`Ctrl + K`（Mac 为 `⌘ + K`）**：不管在哪个页面，按一下就能全局搜你库里的所有书；
- **`←` / `→` 方向键**：轻松翻上一页 / 下一页；
- 找不到文档时，随时在 **「偏好设置」** 最下方点击 **「重置/导入新手实操指南」** 就能把这份文档找回来。

祝你阅读愉快，在光笺里收获属于自己的知识宇宙！✨
"""


def ensure_onboarding_document(db: Session) -> Document | None:
    """如果知识库为空，自动创建并索引出厂示范文档"""
    existing_count = db.query(Document).count()
    if existing_count > 0:
        return None

    return restore_onboarding_document(db)


def restore_onboarding_document(db: Session) -> Document:
    """创建或重新导入新手示范文档（支持用户在设置中主动恢复）"""
    from app.services.document_service import delete_document

    # 清除旧版或同名示范文档以便更新为最新版
    for old_name in (ONBOARDING_FILENAME, OLD_ONBOARDING_FILENAME):
        existing = db.query(Document).filter(Document.name == old_name).first()
        if existing:
            delete_document(db, existing.id)

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
