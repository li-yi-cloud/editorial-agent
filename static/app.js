let ws;
// Persist clientId in localStorage
if (!localStorage.getItem('editorial_client_id')) {
    localStorage.setItem('editorial_client_id', Math.random().toString(36).substring(7));
}
window.clientId = localStorage.getItem('editorial_client_id');
window.paragraphs = [];

const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const exportBtn = document.getElementById('exportBtn');
const docContent = document.getElementById('docContent');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const modelSelect = document.getElementById('modelSelect');
const reviewMode = document.getElementById('reviewMode');
const apiKeyInput = document.getElementById('apiKey');
const suggestionsList = document.getElementById('suggestionsList');

// Load persisted settings
window.onload = function() {
    if (localStorage.getItem('editorial_apiKey')) apiKeyInput.value = localStorage.getItem('editorial_apiKey');
    if (localStorage.getItem('editorial_model')) modelSelect.value = localStorage.getItem('editorial_model');
    if (localStorage.getItem('editorial_mode')) reviewMode.value = localStorage.getItem('editorial_mode');
};

// Save settings on change
apiKeyInput.onchange = function() { localStorage.setItem('editorial_apiKey', apiKeyInput.value); };
modelSelect.onchange = function() { localStorage.setItem('editorial_model', modelSelect.value); };
reviewMode.onchange = function() { localStorage.setItem('editorial_mode', reviewMode.value); };

uploadBtn.onclick = async function() {
    const file = fileInput.files[0];
    if (!file) return alert('请选择一个文件');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('client_id', window.clientId);

    uploadBtn.disabled = true;
    docContent.innerHTML = '<p class="placeholder">正在上传并解析文件...</p>';
    suggestionsList.innerHTML = '<p class="placeholder">等待 AI 开始分析...</p>';

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (response.status !== 200) throw new Error(data.detail || '上传失败');
        
        window.paragraphs = data.paragraphs;
        window.renderDocument();
        setupWebSocket();
        
        chatInput.disabled = false;
        sendBtn.disabled = false;
        exportBtn.disabled = false;
    } catch (err) {
        alert('错误: ' + err.message);
        uploadBtn.disabled = false;
        docContent.innerHTML = '<p class="placeholder">上传失败。</p>';
    }
};

window.renderDocument = function() {
    docContent.innerHTML = '';
    suggestionsList.innerHTML = '<p class="placeholder">AI 建议将在此列出...</p>';
    window.paragraphs.forEach(function(p, i) {
        p.suggestions = []; 
        const pElem = document.createElement('div');
        pElem.className = 'paragraph';
        pElem.id = 'para-' + i;
        pElem.textContent = p.text;
        docContent.appendChild(pElem);
    });
};

function setupWebSocket() {
    if (ws) ws.close();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(protocol + '//' + window.location.host + '/ws/' + window.clientId);
    
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        if (data.type === 'suggestion') {
            window.handleSuggestion(data);
        } else if (data.type === 'chat') {
            window.addChatMessage(data.text, 'ai');
        } else if (data.type === 'update') {
            window.updateParagraph(data.index, data.text, data.suggestions);
        } else if (data.type === 'pre_review_result') {
            window.handlePreReviewResult(data);
        } else if (data.type === 'status') {
            const statusIndicator = document.getElementById('aiStatus');
            if (data.active) {
                statusIndicator.classList.remove('status-hidden');
            } else {
                statusIndicator.classList.add('status-hidden');
            }
        }
    };
    
    ws.onopen = function() {
        const mode = reviewMode.value;
        const model = modelSelect.value;
        const apiKey = apiKeyInput.value;
        ws.send(JSON.stringify({ 
            type: 'start_review', 
            paragraphs: window.paragraphs,
            mode: mode,
            model: model,
            api_key: apiKey
        }));
    };
}

window.handlePreReviewResult = function(data) {
    // ROUTE TO SUGGESTIONS LIST (TOP PANEL), NOT CHAT
    const list = document.getElementById('suggestionsList');
    list.innerHTML = ''; // Clear placeholder
    
    const resultDiv = document.createElement('div');
    resultDiv.className = 'pre-review-report ' + data.decision.toLowerCase();
    
    let html = '<div class="card-header">初审结论: ' + data.decision + '</div>';
    html += '<div class="card-content">';
    html += '<strong>总结报告:</strong><p>' + data.summary + '</p>';
    if (data.recommendations && data.recommendations.length > 0) {
        html += '<strong>核心改进建议:</strong><ul>' + data.recommendations.map(function(r) { return '<li>' + r + '</li>'; }).join('') + '</ul>';
    }
    html += '</div>';
    
    resultDiv.innerHTML = html;
    list.appendChild(resultDiv);
    list.scrollTop = 0;
    
    window.addChatMessage("初审已完成，报告已在上方面板生成。", "ai");
};

window.handleSuggestion = function(data) {
    if (!window.paragraphs[data.para_index].suggestions) {
        window.paragraphs[data.para_index].suggestions = [];
    }
    window.paragraphs[data.para_index].suggestions.push(data);
    
    // 1. Update Document UI
    window.renderParagraphWithSuggestions(data.para_index);
    
    // 2. Add to Suggestions List Panel (Top Panel)
    addSuggestionToList(data);
};

function addSuggestionToList(sug) {
    const list = document.getElementById('suggestionsList');
    const placeholder = list.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    const card = document.createElement('div');
    
    let globalNum = 0;
    for (let i = 0; i <= sug.para_index; i++) {
        const parasugs = window.paragraphs[i].suggestions || [];
        if (i < sug.para_index) {
            globalNum += parasugs.length;
        } else {
            const idx = parasugs.indexOf(sug);
            globalNum += (idx >= 0 ? idx + 1 : parasugs.length);
        }
    }

    card.className = 'suggestion-card';
    card.id = 'card-' + sug.id;
    card.innerHTML = 
        '<div class="card-header">精审建议 #' + globalNum + '</div>' +
        '<div class="card-content">' +
        '  <div class="orig-snippet">原文: <em>' + sug.target + '</em></div>' +
        '  <div class="sug-text">建议: <strong>' + sug.suggestion + '</strong></div>' +
        '  <div class="sug-comment">原因: ' + sug.comment + '</div>' +
        '</div>';
    
    list.appendChild(card);
    list.scrollTop = list.scrollHeight;
}

window.renderParagraphWithSuggestions = function(index) {
    const pElem = document.getElementById('para-' + index);
    if (!pElem) return;
    const text = window.paragraphs[index].text;
    const sugs = window.paragraphs[index].suggestions || [];
    
    let globalStartIdx = 0;
    for (let i = 0; i < index; i++) {
        globalStartIdx += (window.paragraphs[i].suggestions || []).length;
    }

    const sorted = [...sugs].sort(function(a, b) { return b.start - a.start; });
    
    let html = text;
    sorted.forEach(function(s) {
        const originalIdx = sugs.indexOf(s);
        const displayNum = globalStartIdx + originalIdx + 1;

        const before = html.substring(0, s.start);
        const target = html.substring(s.start, s.end);
        const after = html.substring(s.end);
        
        const statusClass = s.status === 'rejected' ? 'rejected' : (s.status === 'accepted' ? 'accepted' : '');
        
        html = before + '<span class="suggestion-anchor ' + statusClass + '" data-id="' + s.id + '">' +
               '<span class="original-text">' + target + '</span>' +
               '<sup class="suggestion-num">[' + displayNum + ']</sup>' +
               '<span class="suggestion-inline-sug">[' + s.suggestion + ']</span>' +
               '</span>' + after;
    });
    
    pElem.innerHTML = html;
};

window.addChatMessage = function(text, sender) {
    const msg = document.createElement('div');
    msg.className = 'message ' + sender;
    msg.textContent = text;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
};

sendBtn.onclick = function() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    window.addChatMessage(text, 'user');
    ws.send(JSON.stringify({ type: 'chat', text: text }));
    chatInput.value = '';
};

chatInput.onkeypress = function(e) {
    if (e.key === 'Enter') sendBtn.click();
};

exportBtn.onclick = async function() {
    const response = await fetch('/export/' + window.clientId, { method: 'POST' });
    if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'reviewed_document.docx';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
};

window.updateParagraph = function(index, text, suggestions) {
    window.paragraphs[index].text = text;
    window.paragraphs[index].suggestions = suggestions;
    window.renderParagraphWithSuggestions(index);
    
    // Sync sidebar cards
    suggestions.forEach(function(s) {
        const card = document.getElementById('card-' + s.id);
        if (card) {
            card.className = 'suggestion-card ' + (s.status || '');
        }
    });
};
