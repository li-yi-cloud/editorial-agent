# Project Instructions

## Workflow Mandates
- **Auto-Commit**: Every tool call that modifies a file (e.g., `write_file`, `replace`) MUST be followed by a `git add` and `git commit` with a concise, descriptive message in the same or immediately following turn.

## Architecture
- **Backend**: FastAPI with LangChain and local/cloud LLM support.
- **Frontend**: Vanilla JS/HTML/CSS with WebSocket for real-time updates.
- **UI Layout**: Three-panel design (Document, Suggestions, Chat).
