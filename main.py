import os
import shutil
import uuid
import json
import asyncio
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from docx import Document
from docx.shared import RGBColor
from langchain_ollama import ChatOllama
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
import chromadb

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# ChromaDB Configuration
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(name="document_reviews")

# Session State Storage
sessions: Dict[str, Dict[str, Any]] = {}

PRE_REVIEW_PROMPT = ChatPromptTemplate.from_messages([
    ("system", "你是一位资深期刊主编。请评估以下文档内容是否达到了顶级期刊的发表标准。"
               "关注点包括：1. 研究创新性, 2. 贡献的重要性, 3. 方法论的严谨性, 4. 整体学术规范的符合度。"
               "提供一份综合评估报告。如果是 'Pass'，解释原因。如果是 'Fail'，提供具体的拒稿理由。"
               "必须使用中文回答。格式为 JSON 对象：{{'decision': 'Pass' 或 'Fail', 'summary': '详细分析...', 'recommendations': ['建议点1', '建议点2']}}。"),
    ("user", "{text}")
])

REVIEW_PROMPT = ChatPromptTemplate.from_messages([
    ("system", "你是一位专业的学术编辑。请为以下段落提供详细的、颗粒度细化的修改建议。"
               "关注点：1. 逻辑流与结构, 2. 学术语气与清晰度, 3. 论证深度, 4. 一致性。"
               "同时也指出影响专业质量的小问题（如语法）。"
               "必须使用中文回答。返回 JSON 对象列表，每个对象包含：'target' (原文中需要修改的精确文本), 'suggestion' (修改后的专业版本), 'comment' (修改原因), 'start' (在原文中的起始索引), 'end' (在原文中的结束索引)。"
               "如果段落已经非常优秀，返回空列表 []。只返回有效的 JSON。"),
    ("user", "{text}")
])

INSTRUCTION_PROMPT = ChatPromptTemplate.from_messages([
    ("system", "你正在协助用户审阅文档。用户会就之前的建议或一般编辑规则给你指示。"
               "上下文: {context}。"
               "用户指示: {instruction}。"
               "分析指示并决定是否拒绝、接受之前的建议，或者以不同的方式修改文本。"
               "必须使用中文回答。返回 JSON 响应，包含 'action' ('reject_suggestion', 'accept_suggestion', 'modify_text', 'chat_only'), 'id' (如果涉及特定建议), 'new_text' (如果需要修改), 以及 'reply' (你给用户的中文解释)。"),
    ("user", "{instruction}")
])

def get_llm(model_name: str, api_key: Optional[str] = None):
    """Dynamically initialize LLM based on model name and provider."""
    if model_name.startswith("gemini") or model_name.startswith("gemma-7b") or model_name.startswith("gemma-2") or "gemma-4" in model_name:
        if not api_key:
            raise ValueError("Google API Key is required for cloud-hosted models")
        return ChatGoogleGenerativeAI(model=model_name, google_api_key=api_key, temperature=0)
    else:
        return ChatOllama(model=model_name, temperature=0)

@app.get("/")
async def get_index():
    if os.path.exists("static/index.html"):
        with open("static/index.html") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Index file not found</h1>")

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), client_id: str = Form(...)):
    if not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are supported")
    
    temp_path = f"temp_{uuid.uuid4()}.docx"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    doc = Document(temp_path)
    paragraphs = [{"text": p.text, "index": i} for i, p in enumerate(doc.paragraphs) if p.text.strip()]
    
    if client_id not in sessions:
        sessions[client_id] = {
            "paragraphs": [],
            "suggestions": [],
            "chat_history": [],
            "temp_path": None,
            "original_text": "",
            "model_name": "llama3",
            "api_key": None
        }
    
    sessions[client_id]["temp_path"] = temp_path
    
    return {"paragraphs": paragraphs}

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    
    if client_id not in sessions:
        sessions[client_id] = {
            "paragraphs": [],
            "suggestions": [],
            "chat_history": [],
            "temp_path": None,
            "original_text": "",
            "model_name": "llama3",
            "api_key": None
        }
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "start_review":
                sessions[client_id]["paragraphs"] = message["paragraphs"]
                sessions[client_id]["original_text"] = "\n".join([p["text"] for p in message["paragraphs"]])
                sessions[client_id]["model_name"] = message.get("model", "llama3")
                sessions[client_id]["api_key"] = message.get("api_key")
                
                mode = message.get("mode", "detail_review")
                asyncio.create_task(run_review_process(websocket, client_id, mode))
            
            elif message["type"] == "chat":
                await handle_chat_instruction(websocket, client_id, message["text"])
                
    except WebSocketDisconnect:
        pass

async def run_review_process(websocket: WebSocket, client_id: str, mode: str):
    await websocket.send_json({"type": "status", "active": True})
    session = sessions[client_id]
    paragraphs = session["paragraphs"]
    full_text = session["original_text"]
    model_name = session["model_name"]
    api_key = session["api_key"]
    
    parser = JsonOutputParser()
    
    try:
        try:
            llm = get_llm(model_name, api_key)
        except Exception as e:
            await websocket.send_json({"type": "chat", "text": f"Error initializing model: {str(e)}"})
            return
        
        if mode == "pre_review":
            chain = PRE_REVIEW_PROMPT | llm | parser
            try:
                result = await chain.ainvoke({"text": full_text})
                await websocket.send_json({
                    "type": "pre_review_result",
                    **result
                })
            except Exception as e:
                print(f"Error in pre-review: {e}")
                await websocket.send_json({"type": "chat", "text": f"Error during pre-review analysis: {str(e)}"})
        else:
            chain = REVIEW_PROMPT | llm | parser
            for i, para in enumerate(paragraphs):
                try:
                    result = await chain.ainvoke({"text": para["text"]})
                    if isinstance(result, list):
                        for sug in result:
                            sug_id = str(uuid.uuid4())
                            sug["id"] = sug_id
                            sug["para_index"] = i
                            sug["status"] = "pending"
                            session["suggestions"].append(sug)
                            await websocket.send_json({
                                "type": "suggestion",
                                **sug
                            })
                except Exception as e:
                    print(f"Error reviewing paragraph {i}: {e}")
                    continue
    finally:
        await websocket.send_json({"type": "status", "active": False})

async def handle_chat_instruction(websocket: WebSocket, client_id: str, instruction: str):
    await websocket.send_json({"type": "status", "active": True})
    session = sessions[client_id]
    session["chat_history"].append({"role": "user", "content": instruction})
    
    model_name = session["model_name"]
    api_key = session["api_key"]
    
    try:
        try:
            llm = get_llm(model_name, api_key)
        except Exception as e:
            await websocket.send_json({"type": "chat", "text": f"Error initializing model: {str(e)}"})
            return
        
        context = {
            "recent_suggestions": session["suggestions"][-10:],
            "paragraphs": [p["text"] for p in session["paragraphs"][:5]]
        }
        
        parser = JsonOutputParser()
        chain = INSTRUCTION_PROMPT | llm | parser
        
        try:
            response = await chain.ainvoke({
                "context": json.dumps(context),
                "instruction": instruction
            })
            
            reply = response.get("reply", "I've processed your instruction.")
            action = response.get("action")
            sug_id = response.get("id")
            
            if action == "reject_suggestion" and sug_id:
                for s in session["suggestions"]:
                    if s["id"] == sug_id:
                        s["status"] = "rejected"
                        await notify_update(websocket, client_id, s["para_index"])
                        break
            elif action == "accept_suggestion" and sug_id:
                for s in session["suggestions"]:
                    if s["id"] == sug_id:
                        s["status"] = "accepted"
                        await notify_update(websocket, client_id, s["para_index"])
                        break
                        
            await websocket.send_json({"type": "chat", "text": reply})
            session["chat_history"].append({"role": "ai", "content": reply})
            
        except Exception as e:
            print(f"Error handling chat: {e}")
            error_msg = f"Sorry, I had trouble processing that instruction: {str(e)}"
            await websocket.send_json({"type": "chat", "text": error_msg})
    finally:
        await websocket.send_json({"type": "status", "active": False})

async def notify_update(websocket: WebSocket, client_id: str, para_index: int):
    para = sessions[client_id]["paragraphs"][para_index]
    para_suggestions = [s for s in sessions[client_id]["suggestions"] if s["para_index"] == para_index]
    await websocket.send_json({
        "type": "update",
        "index": para_index,
        "text": para["text"],
        "suggestions": para_suggestions
    })

@app.post("/export/{client_id}")
async def export_document(client_id: str):
    if client_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[client_id]
    
    final_doc = Document()
    for i, para_data in enumerate(session["paragraphs"]):
        p = final_doc.add_paragraph()
        text = para_data["text"]
        
        sugs = [s for s in session["suggestions"] if s["para_index"] == i and s["status"] == "accepted"]
        sugs.sort(key=lambda x: x["start"])
        
        last_idx = 0
        for s in sugs:
            p.add_run(text[last_idx:s["start"]])
            run_orig = p.add_run(text[s["start"]:s["end"]])
            run_orig.font.strike = True
            run_orig.font.color.rgb = RGBColor(128, 128, 128)
            
            run_sug = p.add_run(f" [{s['suggestion']}] ")
            run_sug.font.color.rgb = RGBColor(0, 102, 204)
            run_sug.font.bold = True
            
            last_idx = s["end"]
        p.add_run(text[last_idx:])

    export_path = f"reviewed_{client_id}.docx"
    final_doc.save(export_path)
    
    await save_to_vector_db(client_id)
    
    return FileResponse(export_path, filename="reviewed_document.docx")

async def save_to_vector_db(client_id: str):
    session = sessions[client_id]
    content = {
        "original_document": session["original_text"],
        "final_suggestions": [s for s in session["suggestions"] if s["status"] == "accepted"],
        "chat_history": session["chat_history"]
    }
    
    collection.add(
        documents=[json.dumps(content)],
        metadatas=[{"client_id": client_id, "timestamp": str(uuid.uuid4())}],
        ids=[client_id]
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
