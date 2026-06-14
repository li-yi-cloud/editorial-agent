# Project Development History: AI Document Reviewer

This document tracks the evolution and key milestones of the Editorial Agent project.

## 1. Project Origins (2026-06-10)
- **Initial State**: A basic FastAPI service for audio-to-text transcription using `faster-whisper`.
- **Pivot**: Decision to switch from voice interaction to an interactive Word document review system using LangChain for better efficiency and professional utility.

## 2. Core Implementation (LangChain & Word)
- **Backend Architecture**: Rebuilt with FastAPI, WebSocket support, and LangChain orchestration.
- **Model Support**: Initial support for local Ollama (Llama 3) and later expanded to Google Gemini (Cloud) and Gemma 4 (31B).
- **Document Processing**: Integrated `python-docx` for reading and marking up documents.
- **Vector Database**: Integrated ChromaDB for persistent storage of original documents, AI suggestions, and human-AI chat history.

## 3. UI/UX Evolution
- **Phase 1**: Simple side-by-side view (Document vs. Chat).
- **Phase 2**: Real-time inline markers (e.g., `[n]` tags) linked to detailed suggestions.
- **Phase 3 (Current)**: Three-panel professional layout:
    1. **Document Preview**: Shows text with inline numbered markers and blue bold suggestions side-by-side.
    2. **Review Suggestions**: High-visibility panel for detailed suggestion cards (Numbered).
    3. **Expert Chat**: Bottom-anchored panel for human-AI interaction and instructions.
- **Persistence**: Implemented `localStorage` for API Keys, model preferences, and session stability across refreshes.

## 4. Stability & Reliability
- **Unit Testing**: Developed comprehensive test suites for both Backend (Pytest) and Frontend (Vitest/JSDOM).
- **File Compatibility**: Added support for `.doc` (via Pandoc/textutil) and `.pdf` (via pypdf).
- **Processing Feedback**: Added a pulsing AI status indicator in the UI to signal background tasks.

## 5. Current Workflow Mandates
- **Auto-Commit**: All file changes are automatically committed to Git for continuous state preservation.
- **Professional Academic Focus**: Prompting strategy refined for senior journal editor-level feedback.
- **Language**: Full Chinese support for all reports and interactions.
