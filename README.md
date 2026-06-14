# AI 智能审稿助手 (AI Document Reviewer)

这是一个基于 **LangChain**、**FastAPI** 和 **WebSocket** 构建的专业级 AI 审稿系统。它能够对学术论文、技术文档等进行多维度的深度审阅，并提供实时的交互式修改建议。

## 🌟 核心功能

- **双审稿模式**：
  - **初审模式 (Pre-review)**：模拟期刊主编，对文档的研究创新性、贡献度和严谨性进行全文评估并生成报告。
  - **精审模式 (Detail-review)**：模拟资深编辑，逐段提供详细的润色建议、逻辑优化和学术语气修正。
- **混合模型架构**：
  - **本地运行**：支持 Ollama 驱动的 Llama 3、Gemma 4 31B 等本地大模型，确保数据隐私。
  - **云端接入**：支持 Google Gemini 1.5 Pro/Flash 系列模型，提供超强处理能力。
- **专业三栏 UI**：
  - **左侧文档区**：实时并列显示 `原文` 与 `AI 建议`，并带有清晰的编号标记。
  - **右上建议区**：独立展示每一条修改建议的详细原因和优化方案，卡片式布局。
  - **右下交互区**：专家级交互对话框，支持通过指令（如“接受建议 #1”）实时操控 AI。
- **全格式支持**：兼容 `.docx`、`.doc` (Word 97-2003) 以及 `.pdf` 文件。
- **持久化与安全**：
  - **向量数据库**：使用 ChromaDB 存储所有审稿记录和人机交互，为性能优化提供基础。
  - **状态持久化**：自动记忆模型选型、API Key 等配置，刷新页面无需重输。

## 🛠 技术架构

- **后端**: Python 3.14+, FastAPI, LangChain, ChromaDB, python-docx, pypdf, pypandoc
- **前端**: Vanilla JavaScript, HTML5, CSS3, WebSockets
- **测试**: pytest (后端), Vitest + JSDOM (前端)

## 🚀 快速开始

### 1. 环境准备
确保您的系统已安装：
- Python 3.14+
- [Ollama](https://ollama.com/) (如需本地模型)
- Pandoc (用于 .doc 转换，Mac 用户可通过 `brew install pandoc` 安装)

### 2. 安装依赖
```bash
# 安装核心依赖
./venv/bin/pip install -r requirements.txt

# 安装测试依赖 (可选)
./venv/bin/pip install -r requirements-test.txt
npm install
```

### 3. 运行应用
```bash
./venv/bin/python main.py
```
启动后在浏览器访问：`http://localhost:8001`

## 🧪 运行测试

```bash
# 运行后端 API 测试
./venv/bin/pytest test_main.py

# 运行前端 UI 逻辑测试
npm test
```

## 📜 协作规范
本项目遵循 **Auto-Commit** 工作流规范：每一次代码或文档的修改都会自动生成一条 Git Commit 记录，确保开发过程的可追溯性。

---
*本项目由 Editorial Agent 协作开发，致力于提升学术出版的审稿效率与质量。*
