// ── DAX AI ADVISOR ────────────────────────────────────────────

let daxProjectId = null;
let daxHistory   = [];
let daxTyping    = false;

const DAX_SYSTEM = `You are Dax, the built-in AI advisor for Vantage — an entrepreneurial operating system. Your job is to have sharp, productive conversations with entrepreneurs about their projects.

Your personality: direct, curious, intellectually honest, a little relentless. You ask one pointed question at a time. You don't flatter or pad responses. You push people toward clarity. Think sharp co-founder meets seasoned mentor.

Your goals in every conversation:
1. Understand what the project really is and why this person is building it
2. Surface blind spots, assumptions, and risks they haven't addressed
3. Help them define what success actually looks like
4. Identify the single most important next action

Rules:
- Ask ONE question at a time. Never list multiple questions.
- Keep responses concise — 2-4 sentences max, then your question.
- Use the project context provided to avoid asking things they've already answered.
- When you have enough context, offer to summarize key insights back to them.
- Never be a yes-man. Challenge vague answers with follow-up.
- Adapt your tone to the project stage — early stage gets more exploratory questions, later stages get more tactical ones.

You can also CREATE PIPS (sub-projects) for any project. When the user asks you to create a pip/sub-project, respond with your normal text AND append a JSON action block at the very end:
<action>{"type":"create_pip","projectName":"exact project name","pipName":"pip name","pipDesc":"one-line description"}</action>`;

function openDax(pid) {
  daxProjectId = pid;
  const p = projects.find(x => x.id === pid);
  if (!p) return;
  document.getElementById('dax-project-name').textContent = p.name;
  document.getElementById('dax-overlay').classList.add('open');
  document.getElementById('dax-messages').innerHTML = '';
  daxHistory = [];

  const stage = sf(p.stage).label;
  const goal  = p.goal || 'not defined yet';
  const convoSummary = Object.entries(p.convo || {})
    .filter(([k,v]) => v && v.trim())
    .map(([k,v]) => `${k}: ${v.replace(/\[x\] /g,'').replace(/\n/g,', ')}`)
    .join(' | ') || 'none yet';
  const tickets = p.tickets.filter(t => t.status === 'todo').map(t => t.title).join(', ') || 'none';

  const context = `Project: "${p.name}" | Stage: ${stage} | Goal: ${goal} | Notes: ${convoSummary} | Open tickets: ${tickets}`;
  const opener  = getOpener(p, stage);

  daxAddMsg('dax', 'Dax', opener);
  daxHistory.push({role:'user',      content:`[Project context: ${context}]`});
  daxHistory.push({role:'assistant', content:opener});

  setTimeout(() => document.getElementById('dax-input').focus(), 100);
}

function getOpener(p, stage) {
  const openers = {
    'Idea':        `"${p.name}" — I like it. Before we go anywhere, tell me this: what made you think of this idea, and why now?`,
    'Conversation':`Good, you've moved "${p.name}" into conversation. Let's make this count. What's the single thing you're most uncertain about with this project?`,
    'Plan':        `You're planning "${p.name}" — that means the idea is solid enough to start structuring. What's the biggest assumption baked into your plan that you haven't validated yet?`,
    'Evaluate':    `You're evaluating "${p.name}". That tells me you're weighing whether to commit. What would have to be true for this to be a clear yes?`,
    'Initiate':    `"${p.name}" is about to kick off. Before you start spending time and money — what does success look like in 90 days, specifically?`,
    'In progress': `"${p.name}" is in motion. What's the thing right now that's slowing you down the most?`,
    'Complete':    `"${p.name}" is done — or close to it. Honest question: did it turn out the way you expected? What surprised you?`,
    'Goal ★':      `You've put "${p.name}" at the goal stage. Walk me through what you've actually achieved versus what you originally set out to do.`,
  };
  return openers[stage] || `Let's talk about "${p.name}". What's on your mind with this project right now?`;
}

function daxAddMsg(role, label, text) {
  const msgs = document.getElementById('dax-messages');
  const div  = document.createElement('div');
  div.className = `dax-msg ${role}`;
  div.innerHTML = `<div class="dax-msg-label">${label}</div><div class="dax-bubble">${esc(text).replace(/\n/g,'<br>')}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function daxShowTyping() {
  const msgs = document.getElementById('dax-messages');
  const div  = document.createElement('div');
  div.className = 'dax-msg dax';
  div.id = 'dax-typing-indicator';
  div.innerHTML = '<div class="dax-msg-label">Dax</div><div class="dax-typing"><span></span><span></span><span></span></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function daxRemoveTyping() {
  const el = document.getElementById('dax-typing-indicator');
  if (el) el.remove();
}

async function daxSend() {
  if (daxTyping) return;
  const inp  = document.getElementById('dax-input');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  inp.style.height = 'auto';

  daxAddMsg('user', 'You', text);
  daxHistory.push({role:'user', content:text});
  daxTyping = true;
  daxShowTyping();

  try {
    const res = await fetch('/api/dax', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system:     DAX_SYSTEM,
        messages:   daxHistory,
      }),
    });
    const data = await res.json();
    daxRemoveTyping();
    daxTyping = false;
    const reply = data.content && data.content[0] && data.content[0].text;
    if (reply) {
      const actionMatches = [...reply.matchAll(/<action>(.*?)<\/action>/gs)];
      const cleanText = reply.replace(/<action>.*?<\/action>/gs, '').trim();
      daxAddMsg('dax', 'Dax', cleanText || reply);
      daxHistory.push({role:'assistant', content:cleanText || reply});
      for (const match of actionMatches) {
        try {
          const action = JSON.parse(match[1]);
          if (action.type === 'create_pip') {
            const proj = projects.find(p => p.name.toLowerCase().includes(action.projectName.toLowerCase()));
            if (proj) {
              const firstStage = proj.subStages[0]?.id || 'ss1';
              const newPip = mkSubP(action.pipName, action.pipDesc || '', firstStage);
              projects = projects.map(p => p.id === proj.id ? {...p, subProjects:[...p.subProjects, newPip]} : p);
              const updated = projects.find(x => x.id === proj.id);
              if (updated) saveProject(updated);
              render();
              daxAddMsg('dax', 'Dax', `✓ Created pip "${action.pipName}" in ${proj.name}.`);
            } else {
              daxAddMsg('dax', 'Dax', `Couldn't find a project matching "${action.projectName}".`);
            }
          }
        } catch(e) { console.warn('Dax action parse error:', e); }
      }
      if (daxHistory.filter(m => m.role === 'user').length >= 4) daxOfferSync();
    }
  } catch (err) {
    daxRemoveTyping();
    daxTyping = false;
    daxAddMsg('dax', 'Dax', 'Something went wrong on my end. Try again in a moment.');
    console.error('Dax error:', err);
  }
}

function daxOfferSync() {
  const msgs = document.getElementById('dax-messages');
  if (document.getElementById('dax-sync-offer')) return;
  const div = document.createElement('div');
  div.id = 'dax-sync-offer';
  div.style.padding = '0 0 4px';
  div.innerHTML = `<button class="dax-sync-btn" onclick="daxSyncToConvo()">↓ Save this conversation to project notes</button>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

async function daxSyncToConvo() {
  const p = projects.find(x => x.id === daxProjectId);
  if (!p) return;
  const btn = document.querySelector('.dax-sync-btn');
  if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

  const lines = daxHistory.filter(m => m.role !== 'system' && !m.content.startsWith('[Project context'));
  const transcript = lines.map(m => (m.role === 'user' ? 'Michael' : 'Dax') + ': ' + m.content).join('\n\n');

  try {
    const res = await fetch('/api/dax', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system:     'You extract structured insights from a conversation between an entrepreneur and an AI advisor. Return ONLY a JSON object with these keys: Goal, Ideas, Financing, Marketing, Team, Timeline, Risks, "Action items". Each value is a short string summary of what was discussed on that topic. If a topic was not discussed, return an empty string for that key. No markdown, no preamble, just raw JSON.',
        messages:   [{role:'user', content:'Extract insights from this conversation:\n\n' + transcript}],
      }),
    });
    const data = await res.json();
    const raw  = data.content && data.content[0] && data.content[0].text;
    if (raw) {
      let insights;
      try { insights = JSON.parse(raw.replace(/```json|```/g,'').trim()); } catch(e) { insights = null; }
      if (insights) {
        const newConvo = {...p.convo};
        Object.keys(insights).forEach(k => { if (insights[k] && insights[k].trim()) newConvo[k] = insights[k]; });
        const updated = {...p, convo:newConvo};
        projects = projects.map(x => x.id === p.id ? updated : x);
        saveProject(updated);
        if (btn) { btn.textContent = 'Saved to project notes'; btn.style.background = 'var(--green-bg)'; btn.style.borderColor = 'var(--green)'; }
        return;
      }
    }
  } catch (err) { console.error('Sync error:', err); }
  if (btn) { btn.textContent = 'Save failed - try again'; btn.disabled = false; }
}

function daxKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); daxSend(); }
  const inp = e.target;
  inp.style.height = 'auto';
  inp.style.height = Math.min(inp.scrollHeight, 80) + 'px';
}

function closeDax() {
  document.getElementById('dax-overlay').classList.remove('open');
  daxProjectId = null;
}

document.getElementById('dax-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeDax();
});

// ── DAX DRAG ──────────────────────────────────────────────────
(function() {
  let dragging = false, ox = 0, oy = 0;
  document.addEventListener('DOMContentLoaded', function() {
    const panel  = document.getElementById('dax-panel');
    const header = document.querySelector('.dax-header');
    if (!header || !panel) return;
    header.addEventListener('mousedown', function(e) {
      if (e.target.closest('.dax-close')) return;
      dragging = true;
      const r = panel.getBoundingClientRect();
      panel.style.position = 'fixed';
      panel.style.left = r.left + 'px';
      panel.style.top  = r.top  + 'px';
      document.getElementById('dax-overlay').style.alignItems   = 'flex-start';
      document.getElementById('dax-overlay').style.justifyContent = 'flex-start';
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      panel.style.left = (e.clientX - ox) + 'px';
      panel.style.top  = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', function() { dragging = false; });
  });
})();
