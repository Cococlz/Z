# 智阅 AI (Zhiyue AI)

> 本地优先的个人智能文档工作站与外脑知识库 (Local-First AI Knowledge Base & Document Workstation)

## 技术架构

- **桌面端**：Electron 28+ + React 18 + TypeScript + Vite + TailwindCSS
- **后端服务**：Python 3.11+ + FastAPI + Pydantic v2
- **嵌入模型**：FastEmbed (`bge-small-zh-v1.5` 纯本地离线推理)
- **向量存储**：ChromaDB (PersistentClient)
- **关系数据**：SQLite 3 (SQLAlchemy 2.0)
- **大语言模型**：DeepSeek-V3 / DeepSeek-R1 (流式 SSE 输出)

## 快速开始

### 1. 后端环境与依赖
```bash
cd backend
uv venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt
python -m app.main
```

### 2. 前端桌面端环境
```bash
cd apps/desktop
npm install
npm run dev
```

详细架构方案参见：[docs/智阅AI_V1.0_综合设计与开工执行方案.md](./docs/智阅AI_V1.0_综合设计与开工执行方案.md)
