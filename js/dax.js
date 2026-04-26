// ── DAX AI ADVISOR ────────────────────────────────────────────

let daxProjectId = null;
let daxTyping    = false;
let daxHistory   = []; // in-memory for current API calls

const DAX_SYSTEM = `You are Dax, the built-in AI advisor for Vantage — an entrepreneurial operating system built by Michael D'Asaro. Your job is to have sharp, productive conversations with entrepreneurs about their projects.

Your personality: direct, curious, intellectually honest, a little relentless. You ask one pointed question at a time. You don't flatter or pad responses. You push people toward clarity. Think sharp co-founder meets seasoned mentor.

Your goals:
1. Understand what the project really is and why they're building it
2. Surface blind spots, assumptions, and risks they haven't addressed
3. Help them define what success actually looks like
4. Identify the single most important next action

Rules:
- Ask ONE question at a time. Never list multiple questions.
- Keep responses concise — 2-4 sentences max, then your question.
- Never be a yes-man. Challenge vague answers.
- Reference specific project context when you have it.`;

function getDaxKey() {
  return localStorage.getItem('vantage_dax_key') || '';
}

function promptDaxKey() {
  const key = prompt('Enter your Anthropic API key to enable Dax:');
  if (key && key.trim()) {
    localStorage.setItem('vantage_dax_key', key.trim());
    return key.trim();
  }
  return '';
}

// ── SUPABASE PERSISTENCE ──────────────────────────────────────

async function loadDaxHistory() {
  try {
    const { data, error } = await sb
      .from('dax_messages')
      .select('role, content, created_at')
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('Could not load Dax history:', e.message);
    return [];
  }
}

async function saveDaxMessage(role, content) {
  try {
    await sb.from('dax_messages').insert({ role, content });
  } catch (e) {
    console.warn('Could not save Dax message:', e.message);
  }
}

// ── INIT ──────────────────────────────────────────────────────

async function initDax() {
  // Show panel immediately
  document.getElementById('dax-panel').classList.add('open');

  // Load history from Supabase
  const history = await loadDaxHistory();
  daxHistory = history.map(m => ({ role: m.role, content: m.content }));

  if (history.length === 0) {
    // First time — greet
    const opener = "Hey Michael — I'm Dax, your AI advisor. What project or idea is on your mind right now?";
    daxAddMsg('dax', 'Dax', opener);
    daxHistory.push({ role: 'assistant', content: opener });
    await saveDaxMessage('assistant', opener);
  } else {
    // Render existing history
    history.forEach(m => daxAddMsg(m.role === 'assistant' ? 'dax' : 'user',
      m.role === 'assistant' ? 'Dax' : 'You', m.content));
    // Scroll to bottom
    const msgs = document.getElementById('dax-messages');
    msgs.scrollTop = msgs.scrollHeight;
  }
}

// ── RENDER ────────────────────────────────────────────────────

function daxAddMsg(role, label, text) {
  const msgs = document.getElementById('dax-messages');
  // Remove empty state if present
  const empty = document.getElementById('dax-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = `dax-msg ${role}`;
  div.innerHTML = `<div class="dax-msg-label">${label}</div><div class="dax-bubble">${esc(text).replace(/\n/g, '<br>')}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function daxShowTyping() {
  const msgs = document.getElementById('dax-messages');
  const div = document.createElement('div');
  div.className = 'dax-msg dax';
  div.id = 'dax-typing-indicator';
  div.innerHTML = '<div class="dax-msg-label">Dax</div><div class="dax-typing"><span></span><span></span><span></span></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function daxRemoveTyping() {
  document.getElementById('dax-typing-indicator')?.remove();
}

// ── SEND ──────────────────────────────────────────────────────

async function daxSend() {
  if (daxTyping) return;
  const inp  = document.getElementById('dax-input');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  inp.style.height = 'auto';

  daxAddMsg('user', 'You', text);
  daxHistory.push({ role: 'user', content: text });
  await saveDaxMessage('user', text);

  daxTyping = true;
  daxShowTyping();

  // Build context from current projects
  const contextLines = projects.map(p => {
    const tkTodo = p.tickets.filter(t => t.status === 'todo').length;
    const tkDone = p.tickets.filter(t => t.status === 'done').length;
    return `- ${p.name} (${sf(p.stage).label}): ${p.goal || 'no goal set'} | ${tkTodo} open tickets, ${tkDone} done`;
  }).join('\n');
  const systemWithContext = DAX_SYSTEM + `\n\nCurrent projects:\n${contextLines}`;

  try {
    const key = getDaxKey() || promptDaxKey();
    if (!key) { daxRemoveTyping(); daxTyping = false; return; }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemWithContext,
        messages: daxHistory.slice(-20), // last 20 msgs for context window
      }),
    });

    const data = await res.json();
    daxRemoveTyping();
    daxTyping = false;

    const reply = data.content?.[0]?.text;
    if (reply) {
      daxAddMsg('dax', 'Dax', reply);
      daxHistory.push({ role: 'assistant', content: reply });
      await saveDaxMessage('assistant', reply);
    } else if (data.error) {
      daxAddMsg('dax', 'Dax', `Error: ${data.error.message}`);
    }
  } catch (err) {
    daxRemoveTyping();
    daxTyping = false;
    daxAddMsg('dax', 'Dax', 'Something went wrong. Try again in a moment.');
    console.error('Dax error:', err);
  }
}

// ── SET PROJECT CONTEXT ───────────────────────────────────────

function openDax(pid) {
  daxProjectId = pid;
  if (pid) {
    const p = projects.find(x => x.id === pid);
    if (p) {
      document.getElementById('dax-project-name').textContent = p.name;
      document.getElementById('dax-project-badge').style.display = 'block';
    }
  } else {
    document.getElementById('dax-project-badge').style.display = 'none';
  }
  document.getElementById('dax-input').focus();
}

function closeDax() {
  // Dax doesn't close — it's always open
  // This is kept for compatibility with modal.js calling closeProjModal();openDax()
}

// ── INPUT HANDLING ────────────────────────────────────────────

function daxKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); daxSend(); }
  const inp = e.target;
  inp.style.height = 'auto';
  inp.style.height = Math.min(inp.scrollHeight, 80) + 'px';
}

// Dummy for compatibility
document.getElementById('dax-overlay').addEventListener('click', function() {});
