// Frieren Chatbot UI Logic (vanilla JS)
// All interactivity for index.html

// === THEME TOGGLE ===
const themeToggle = document.getElementById('themeToggle');
function setTheme(dark) {
    document.documentElement.classList.toggle('dark', dark);
    themeToggle.textContent = dark ? '☀️ Light' : '🌙 Dark';
    localStorage.setItem('frieren_theme', dark ? 'dark' : 'light');
}
themeToggle.onclick = () => setTheme(!document.documentElement.classList.contains('dark'));
(function () {
    const saved = localStorage.getItem('frieren_theme');
    if (saved === 'dark' || (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) setTheme(true);
})();

// === SIDEBAR HISTORY (backend integration & guest mode) ===
let sessions = [];
let activeSession = null;
let chatData = {};
let userId = localStorage.getItem('frieren_user_id');
const isGuest = !userId;
if (isGuest) userId = null;

async function loadSessions() {
    if (isGuest) {
        // Guest: single session in-memory
        if (!sessions.length) {
            sessions = [{ id: 'guest', title: 'Chat (Guest)' }];
            activeSession = 'guest';
            chatData['guest'] = chatData['guest'] || [];
        }
        return;
    }
    try {
        const res = await fetch(`auth.php?action=chat-history&user_id=${userId}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
            sessions = data.data;
            if (sessions.length > 0) {
                activeSession = sessions[0].id;
            } else {
                activeSession = null;
            }
        } else {
            sessions = [];
            activeSession = null;
        }
    } catch {
        sessions = [];
        activeSession = null;
    }
}

async function loadMessages(sessionId) {
    if (!sessionId) return;
    if (isGuest) {
        chatData[sessionId] = chatData[sessionId] || [];
        return;
    }
    try {
        const res = await fetch(`auth.php?action=chat-history&user_id=${userId}&session_id=${sessionId}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
            chatData[sessionId] = data.data.map(m => ({
                role: m.role,
                content: m.content,
                time: m.created_at ? new Date(m.created_at).toLocaleTimeString() : '',
                file: m.file || null
            }));
        } else {
            chatData[sessionId] = [];
        }
    } catch {
        chatData[sessionId] = [];
    }
}

async function renderHistory() {
    await loadSessions();
    const list = document.getElementById('historyList');
    list.innerHTML = '';
    sessions.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'w-full text-left px-3 py-2 rounded-lg text-sm truncate hover:bg-teal-50 dark:hover:bg-gray-700 ' + (s.id === activeSession ? 'bg-teal-100 dark:bg-gray-800 font-semibold' : '');
        btn.textContent = s.title || 'Chat';
        btn.onclick = async () => {
            activeSession = s.id;
            await loadMessages(activeSession);
            renderHistory();
            renderChat();
        };
        list.appendChild(btn);
    });
}
document.getElementById('newChatBtn').onclick = async () => {
    if (isGuest) {
        // Guest: just clear in-memory chat
        chatData['guest'] = [];
        activeSession = 'guest';
        renderHistory();
        renderChat();
        return;
    }
    const fd = new FormData();
    fd.append('user_id', userId);
    const res = await fetch('auth.php?action=new-chat', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success && data.data && data.data.id) {
        await renderHistory();
        activeSession = data.data.id;
        chatData[activeSession] = [];
        await loadMessages(activeSession);
        renderChat();
    }
};
document.getElementById('clearHistoryBtn').onclick = async () => {
    if (isGuest) {
        chatData['guest'] = [];
        renderChat();
        return;
    }
    await fetch(`auth.php?action=clear-history&user_id=${userId}`, { method: 'DELETE' });
    await renderHistory();
    renderChat();
};

// === PROMPT SUGGESTIONS ===
const promptSuggestions = [
    'Apa itu Frieren?',
    'Tulis kode JS sederhana',
    'Buatkan puisi'
];
function renderPromptSuggestions() {
    const el = document.getElementById('promptSuggestions');
    el.innerHTML = '';
    promptSuggestions.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'px-3 py-1 rounded-full border border-gray-300 dark:border-gray-700 hover:bg-teal-50 dark:hover:bg-gray-800 transition';
        btn.textContent = s;
        btn.onclick = () => {
            document.getElementById('chatInput').value = s;
            document.getElementById('chatInput').focus();
        };
        el.appendChild(btn);
    });
}

// === CHAT RENDER (Markdown, streaming, file preview) ===
function renderMarkdown(text) {
    // Simple markdown: bold, italic, code, link
    return text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="underline text-blue-600" target="_blank">$1</a>')
        .replace(/\n/g, '<br>');
}

function renderChat() {
    const chatArea = document.getElementById('chatArea');
    chatArea.innerHTML = '';
    const msgs = chatData[activeSession] || [];
    msgs.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'flex ' + (msg.role === 'user' ? 'justify-end' : 'justify-start') + ' animate-fadeIn';
        let bubble = `<div class="max-w-[80%] px-4 py-2 rounded-xl shadow text-base ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}">`;
        bubble += renderMarkdown(msg.content);
        if (msg.file) {
            bubble += `<div class='mt-2'><a href='${msg.file}' class='underline text-blue-300' download>📎 ${msg.file.split('/').pop()}</a></div>`;
        }
        bubble += `<span class="block text-xs text-gray-400 mt-1">${msg.role === 'user' ? 'Anda' : 'Frieren'} • ${msg.time || ''}</span></div>`;
        div.innerHTML = bubble;
        chatArea.appendChild(div);
    });
    if (isLoading) {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'flex justify-start animate-fadeIn';
        typingDiv.innerHTML = `<div class="max-w-[80%] px-4 py-2 rounded-xl shadow text-base bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center gap-1"><span class='dot'></span><span class='dot'></span><span class='dot'></span></div>`;
        chatArea.appendChild(typingDiv);
    }
    chatArea.scrollTop = chatArea.scrollHeight;
}

// === FILE UPLOAD ===
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
let selectedFile = null;
fileInput.onchange = function () {
    selectedFile = fileInput.files[0];
    fileName.textContent = selectedFile ? selectedFile.name : '';
};

// === SEND MESSAGE (streaming, file upload, guest mode) ===
let isLoading = false;
let guestFirstReminderShown = false;
document.getElementById('chatForm').onsubmit = async e => {
    e.preventDefault();
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text && !selectedFile) return;
    // Show user bubble instantly
    chatData[activeSession] = chatData[activeSession] || [];
    chatData[activeSession].push({ role: 'user', content: text, time: new Date().toLocaleTimeString(), file: selectedFile ? selectedFile.name : null });
    renderChat();
    input.value = '';
    fileInput.value = '';
    fileName.textContent = '';
    isLoading = true;
    renderChat();
    let botMsg = { role: 'assistant', content: '', time: new Date().toLocaleTimeString() };
    chatData[activeSession].push(botMsg);
    if (isGuest) {
        let full = '';
        if (!guestFirstReminderShown) {
            full = 'Halo! Ini mode tamu. Riwayat chat tidak disimpan.';
            guestFirstReminderShown = true;
        } else {
            full = 'Ini balasan AI simulasi (mode tamu): ' + text.split('').reverse().join('');
        }
        let i = 0;
        function stream() {
            if (i <= full.length) {
                botMsg.content = full.slice(0, i);
                renderChat();
                i += Math.max(1, Math.floor(Math.random() * 3));
                setTimeout(stream, 18 + Math.random() * 30);
            } else {
                isLoading = false;
                renderChat();
            }
        }
        stream();
        selectedFile = null;
        return;
    }
    // Send to backend
    const fd = new FormData();
    fd.append('user_id', userId);
    fd.append('message', text);
    if (selectedFile) fd.append('file', selectedFile);
    selectedFile = null;
    // Streaming simulation (replace with real streaming if backend supports)
    try {
        const res = await fetch('auth.php?action=send-message', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success && data.data && data.data.response) {
            // Streaming effect
            let i = 0, full = data.data.response;
            function stream() {
                if (i <= full.length) {
                    botMsg.content = full.slice(0, i);
                    renderChat();
                    i += Math.max(1, Math.floor(Math.random() * 3));
                    setTimeout(stream, 18 + Math.random() * 30);
                } else {
                    isLoading = false;
                    renderChat();
                }
            }
            stream();
            // If ada file
            if (data.data.file_url) botMsg.file = data.data.file_url;
        } else {
            botMsg.content = '[AI Error] ' + (data.message || 'Gagal mendapatkan respons AI');
            isLoading = false;
            renderChat();
        }
    } catch {
        botMsg.content = '[Network Error]';
        isLoading = false;
        renderChat();
    }
};

// === INIT ===
(async function () {
    await renderHistory();
    if (activeSession) {
        await loadMessages(activeSession);
        renderChat();
    }
    renderPromptSuggestions();
})();
