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
    if (!file) return alert('Please select a file');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('client_id', window.clientId);

    uploadBtn.disabled = true;
    docContent.innerHTML = '<p class="placeholder">Uploading and parsing...</p>';

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        window.paragraphs = data.paragraphs;
        window.renderDocument();
        setupWebSocket();
        
        chatInput.disabled = false;
        sendBtn.disabled = false;
        exportBtn.disabled = false;
    } catch (err) {
        console.error(err);
        alert('Upload failed');
        uploadBtn.disabled = false;
    }
};

window.renderDocument = function() {
    docContent.innerHTML = '';
    window.paragraphs.forEach(function(p, i) {
        p.suggestions = []; // Initialize suggestions array for tracking
        const pElem = document.createElement('div');
        pElem.className = 'paragraph';
        pElem.id = 'para-' + i;
        pElem.textContent = p.text;
        docContent.appendChild(pElem);
    });
};

function setupWebSocket() {
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
        const mode = document.getElementById('reviewMode').value;
        const model = document.getElementById('modelSelect').value;
        const apiKey = document.getElementById('apiKey').value;
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
    const chatContainer = document.getElementById('chatMessages');
    const resultDiv = document.createElement('div');
    resultDiv.className = 'message ai pre-review-report ' + data.decision.toLowerCase();
    
    let html = '<strong>Pre-review Decision: ' + data.decision + '</strong><br><br>';
    html += '<p>' + data.summary + '</p>';
    if (data.recommendations && data.recommendations.length > 0) {
        html += '<ul>' + data.recommendations.map(function(r) { return '<li>' + r + '</li>'; }).join('') + '</ul>';
    }
    
    resultDiv.innerHTML = html;
    chatContainer.appendChild(resultDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    if (data.decision === 'Pass') {
        window.addChatMessage("Content passed initial screening. You can now switch to 'Detail-review' mode for granular edits.", 'ai');
    } else {
        window.addChatMessage("Content does not meet publication standards. Please address the critical issues above.", 'ai');
    }
};

window.handleSuggestion = function(data) {
    const pElem = document.getElementById('para-' + data.para_index);
    if (!pElem) return;
    
    if (!window.paragraphs[data.para_index].suggestions) {
        window.paragraphs[data.para_index].suggestions = [];
    }
    window.paragraphs[data.para_index].suggestions.push(data);
    
    // Update Document UI (markers only)
    window.renderParagraphWithSuggestions(data.para_index);
    
    // Add Suggestion Card to Chat Sidebar
    addSuggestionCard(data);
};

function addSuggestionCard(sug) {
    const chatMessages = document.getElementById('chatMessages');
    const card = document.createElement('div');
    
    // Calculate global number
    let globalNum = 0;
    for (let i = 0; i <= sug.para_index; i++) {
        const parasugs = window.paragraphs[i].suggestions || [];
        if (i < sug.para_index) {
            globalNum += parasugs.length;
        } else {
            globalNum += parasugs.indexOf(sug) + 1;
        }
    }

    card.className = 'message ai suggestion-card';
    card.id = 'card-' + sug.id;
    card.innerHTML = 
        '<div class="card-header">建议 #' + globalNum + '</div>' +
        '<div class="card-content">' +
        '  <div class="orig-snippet">原文: <em>' + sug.target + '</em></div>' +
        '  <div class="sug-text">建议: <strong>' + sug.suggestion + '</strong></div>' +
        '  <div class="sug-comment">原因: ' + sug.comment + '</div>' +
        '</div>';
    
    chatMessages.appendChild(card);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

window.renderParagraphWithSuggestions = function(index) {
    const pElem = document.getElementById('para-' + index);
    const text = window.paragraphs[index].text;
    const sugs = window.paragraphs[index].suggestions || [];
    
    const sorted = [...sugs].sort(function(a, b) { return b.start - a.start; });
    
    let html = text;
    sorted.forEach(function(s) {
        const before = html.substring(0, s.start);
        const target = html.substring(s.start, s.end);
        const after = html.substring(s.end);
        
        const statusClass = s.status === 'rejected' ? 'rejected' : (s.status === 'accepted' ? 'accepted' : '');
        
        html = before + '<span class="suggestion-wrapper ' + statusClass + '" data-id="' + s.id + '">' +
               '<span class="original-text" title="Original">' + target + '</span>' +
               '<span class="suggestion-text" title="Suggestion: ' + s.comment + '"> [AI: ' + s.suggestion + ']</span>' +
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
};
