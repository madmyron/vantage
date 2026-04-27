// DAX AI ADVISOR v3

let daxProjectId = null;
let daxTyping = false;
let daxHistory = [];
const DAX_ORCHESTRATION_KEY = 'vantage_dax_orchestration';
const DAX_HISTORY_TABLE = 'dax_history';
const DAX_CHAT_URL = `${SUPABASE_URL}/functions/v1/dax-chat`;
const DAX_CHAT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'x-client-info': 'vantage-web-dax/1.0',
};
let daxOrchestration = loadDaxOrchestration();

function loadDaxOrchestration() {
  try {
    const raw = localStorage.getItem(DAX_ORCHESTRATION_KEY);
    return raw ? JSON.parse(raw) : { pendingReview: null };
  } catch (err) {
    console.warn('Could not load Dax orchestration state:', err);
    return { pendingReview: null };
  }
}

function saveDaxOrchestration() {
  try {
    localStorage.setItem(DAX_ORCHESTRATION_KEY, JSON.stringify(daxOrchestration || { pendingReview: null }));
  } catch (err) {
    console.warn('Could not save Dax orchestration state:', err);
  }
}

function getProjectContextSummary() {
  return projects.map(p => {
    const openPips = (p.subProjects || []).length;
    const financeTotal = (p.finances || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return {
      id: p.id,
      name: p.name,
      stage: sf(p.stage).label,
      goal: p.goal || '',
      openPips,
      financeTotal,
      pips: (p.subProjects || []).map(sp => ({
        id: sp.id,
        name: sp.name,
        stage: pipSf(normalizePipStage(sp.stage, p)).label,
        assignee: sp.assignee || 'Dax',
        assigner: sp.assigner || 'Dax',
        desc: sp.desc || '',
      })),
    };
  });
}

function findProjectByName(name) {
  const query = String(name || '').trim().toLowerCase();
  if (!query) return null;
  return projects.find(p => {
    const projectName = String(p.name || '').toLowerCase();
    return projectName === query || projectName.includes(query) || query.includes(projectName);
  }) || null;
}

function buildDaxContext(project) {
  return {
    activeProject: project ? {
      ...project,
      stageLabel: sf(project.stage).label,
      subProjects: (project.subProjects || []).map(sp => ({
        ...sp,
        stageLabel: pipSf(normalizePipStage(sp.stage, project)).label,
        assignee: sp.assignee || 'Dax',
        assigner: sp.assigner || 'Dax',
      })),
    } : null,
    portfolio: getProjectContextSummary(),
    team: (typeof team !== 'undefined' && Array.isArray(team)) ? team : [],
    pendingReview: daxOrchestration?.pendingReview || null,
  };
}

function buildNormalDaxSystem(project) {
  const projectName = project ? project.name : 'the current portfolio';
  return `You are Dax, the built-in AI advisor for Vantage, an entrepreneurial operating system.

Be direct, curious, and concise. Ask one pointed question at a time. Push the founder toward clarity.
Use the provided context to avoid asking for things already known.

If the user asks you to create PIPs, append one JSON block per PIP at the very end using this exact format:
[PIP:{"projectName":"exact project name","pipName":"pip name","pipDesc":"one-line description"}]

Current focus: ${projectName}`;
}

function buildReviewSystem(project) {
  const fullProjectContext = project ? JSON.stringify({
    ...project,
    stageLabel: sf(project.stage).label,
    subProjects: (project.subProjects || []).map(sp => ({
      ...sp,
      stageLabel: pipSf(normalizePipStage(sp.stage, project)).label,
      assignee: sp.assignee || 'Dax',
      assigner: sp.assigner || 'Dax',
    })),
  }, null, 2) : 'null';

  return `You are Dax acting as a project manager inside Vantage.

The user asked to review the project. Analyze the project's goals, current state, and existing PIPs.
Draft a proposed list of NEW PIPs in recommended execution order.

Project context:
${fullProjectContext}

Return ONLY valid JSON using this shape:
{
  "projectName": "string",
  "summary": "string",
  "recommendation": "string",
  "proposedPips": [
    {
      "pipId": "string",
      "title": "string",
      "description": "string",
      "files": ["string"],
      "reason": "string",
      "order": 1
    }
  ]
}

Rules:
- Include only new PIPs, not existing ones.
- Keep the file lists realistic and non-overlapping where possible.
- If overlap exists, order sequentially and mention that in the recommendation.
- End with a concise approval prompt in the recommendation field: "Should I proceed with these?"`;
}

function formatReviewPlan(plan) {
  const lines = [];
  lines.push(`${plan.projectName || 'Project'} review complete.`);
  if (plan.summary) lines.push(plan.summary);
  if (Array.isArray(plan.proposedPips) && plan.proposedPips.length) {
    lines.push('');
    lines.push('Proposed PIPs:');
    plan.proposedPips
      .slice()
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      .forEach((pip, idx) => {
        const files = Array.isArray(pip.files) && pip.files.length ? pip.files.join(', ') : 'no files listed';
        lines.push(`${idx + 1}. ${pip.title}${pip.description ? ` - ${pip.description}` : ''}`);
        lines.push(`   Files: ${files}`);
        if (pip.reason) lines.push(`   Why: ${pip.reason}`);
      });
  }
  lines.push('');
  lines.push(plan.recommendation || 'Should I proceed with these?');
  return lines.join('\n');
}

function parseReviewPlan(reply) {
  const raw = String(reply || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  try {
    return { kind: 'json', value: JSON.parse(raw) };
  } catch (_) {
    return { kind: 'text', value: raw };
  }
}

function isApprovalReply(text) {
  return /^(yes|y|yep|yeah|proceed|approve|do it|go ahead)\b/i.test(String(text || '').trim());
}

function extractReviewTarget(text) {
  const match = String(text || '').trim().match(/^review\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function isReviewOrchestrationTrigger(text) {
  const trimmed = String(text || '').trim();
  return /^review\s+\S/i.test(trimmed);
}

function stashPendingReview(plan, project) {
  daxOrchestration = {
    pendingReview: {
      ...plan,
      projectId: project ? project.id : null,
      projectName: project ? project.name : plan.projectName,
      status: 'pending-approval',
      createdAt: new Date().toISOString(),
    },
  };
  saveDaxOrchestration();
}

function clearPendingReview() {
  daxOrchestration = { pendingReview: null };
  saveDaxOrchestration();
}

async function loadDaxHistory() {
  try {
    const { data, error } = await sb
      .from(DAX_HISTORY_TABLE)
      .select('role, content, created_at')
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    return data || [];
  } catch (e) {
    if (!isMissingDaxHistoryError(e)) {
      console.warn('Could not load Dax history:', e.message);
    }
    return [];
  }
}

async function saveDaxMessage(role, content) {
  try {
    await sb.from(DAX_HISTORY_TABLE).insert({ role, content });
  } catch (e) {
    if (!isMissingDaxHistoryError(e)) {
      console.warn('Could not save Dax message:', e.message);
    }
  }
}

function isMissingDaxHistoryError(err) {
  const code = err?.code || err?.status || err?.statusCode;
  const message = String(err?.message || err?.details || err || '').toLowerCase();
  return code === '42P01' || code === 404 || code === 400 || message.includes('dax_history') && (
    message.includes('does not exist') ||
    message.includes('not found') ||
    message.includes('relation "public.dax_history" does not exist') ||
    message.includes('relation does not exist')
  );
}

async function callDaxChat(messages, context, system) {
  try {
    if (sb?.functions?.invoke) {
      const { data, error } = await sb.functions.invoke('dax-chat', {
        body: { messages, context, system },
        headers: {
          'x-client-info': 'vantage-web-dax/1.0',
        },
      });

      if (error) {
        const detail = error.message || error.error || JSON.stringify(error);
        throw new Error(`Supabase dax-chat invoke failed: ${detail}`);
      }

      return data?.reply || '';
    }

    const controller = new AbortController();
    const timeoutMs = 30000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(DAX_CHAT_URL, {
        method: 'POST',
        headers: DAX_CHAT_HEADERS,
        body: JSON.stringify({ messages, context, system }),
        signal: controller.signal,
        cache: 'no-store',
      });

      const raw = await res.text();
      let data = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch (_) {
          data = { raw };
        }
      }

      if (!res.ok) {
        const detail = data.error || data.message || data.raw || raw || `HTTP ${res.status}`;
        throw new Error(`Supabase dax-chat returned ${res.status}: ${detail}`);
      }

      return data.reply || '';
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('Supabase dax-chat request timed out after 30000ms.');
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Supabase dax-chat request failed. URL: ${DAX_CHAT_URL}. Details: ${message}`);
  }
}

async function initDax() {
  const history = await loadDaxHistory();
  daxHistory = history.map(m => ({ role: m.role, content: m.content }));

  if (history.length === 0) {
    const opener = "Hey Michael - I'm Dax, your AI advisor. What project or idea is on your mind right now?";
    daxAddMsg('dax', 'Dax', opener);
    daxHistory.push({ role: 'assistant', content: opener });
    await saveDaxMessage('assistant', opener);
  } else {
    history.forEach(m => daxAddMsg(m.role === 'assistant' ? 'dax' : 'user', m.role === 'assistant' ? 'Dax' : 'You', m.content));
    const msgs = document.getElementById('dax-messages');
    msgs.scrollTop = msgs.scrollHeight;
  }

  if (daxOrchestration?.pendingReview?.projectName) {
    daxAddMsg('dax', 'Dax', `I still have a pending review plan for ${daxOrchestration.pendingReview.projectName}. Say "yes" when you're ready to continue.`);
  }
}

function daxAddMsg(role, label, text) {
  const msgs = document.getElementById('dax-messages');
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
  document.getElementById('dax-typing-indicator')?.remove();
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

async function handleReviewCommand(projectName) {
  const project = findProjectByName(projectName) || (daxProjectId ? projects.find(p => p.id === daxProjectId) : null);
  if (!project) {
    daxAddMsg('dax', 'Dax', `I couldn't find a project named "${projectName}".`);
    return;
  }

  const context = buildDaxContext(project);
  const system = buildReviewSystem(project);
  const messages = [
    { role: 'user', content: `Review this project: ${project.name}. Draft the next PIPs, ordered by execution priority.` },
  ];

  daxTyping = true;
  daxShowTyping();

  try {
    const reply = await callDaxChat(messages, context, system);
    daxRemoveTyping();
    daxTyping = false;

    console.log('Dax review raw response:', reply);

    const parsed = parseReviewPlan(reply);
    if (parsed.kind === 'text') {
      const rendered = parsed.value || 'I could not generate a review plan.';
      daxAddMsg('dax', 'Dax', rendered);
      daxHistory.push({ role: 'assistant', content: rendered });
      await saveDaxMessage('assistant', rendered);
      const gateText = 'Should I proceed with these?';
      daxAddMsg('dax', 'Dax', gateText);
      daxHistory.push({ role: 'assistant', content: gateText });
      await saveDaxMessage('assistant', gateText);
      return;
    }

    const plan = parsed.value;
    stashPendingReview(plan, project);
    const rendered = formatReviewPlan(plan);
    daxAddMsg('dax', 'Dax', rendered);
    daxHistory.push({ role: 'assistant', content: rendered });
    await saveDaxMessage('assistant', rendered);

    const gate = 'Should I proceed with these?';
    daxAddMsg('dax', 'Dax', gate);
    daxHistory.push({ role: 'assistant', content: gate });
    await saveDaxMessage('assistant', gate);
  } catch (err) {
    daxRemoveTyping();
    daxTyping = false;
    daxAddMsg('dax', 'Dax', err instanceof Error ? err.message : 'Could not build the review plan.');
  }
}

async function daxSend() {
  if (daxTyping) return;
  const inp = document.getElementById('dax-input');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  inp.style.height = 'auto';

  const reviewTarget = extractReviewTarget(text);
  if (isReviewOrchestrationTrigger(text) && reviewTarget) {
    daxAddMsg('user', 'You', text);
    daxHistory.push({ role: 'user', content: text });
    await saveDaxMessage('user', text);
    await handleReviewCommand(reviewTarget);
    return;
  }

  daxAddMsg('user', 'You', text);
  daxHistory.push({ role: 'user', content: text });
  await saveDaxMessage('user', text);

  if (daxOrchestration?.pendingReview && isApprovalReply(text)) {
    const pending = daxOrchestration.pendingReview;
    pending.status = 'approved';
    pending.approvedAt = new Date().toISOString();
    daxOrchestration.pendingReview = pending;
    saveDaxOrchestration();
    const msg = `Approved. I have locked the review plan for ${pending.projectName}. The execution handoff comes in the next stage.`;
    daxAddMsg('dax', 'Dax', msg);
    daxHistory.push({ role: 'assistant', content: msg });
    await saveDaxMessage('assistant', msg);
    return;
  }

  daxTyping = true;
  daxShowTyping();

  try {
    const activeProject = daxProjectId ? projects.find(p => p.id === daxProjectId) : null;
    const context = buildDaxContext(activeProject);
    const system = buildNormalDaxSystem(activeProject);
    const reply = await callDaxChat(daxHistory.slice(-30), context, system);
    daxRemoveTyping();
    daxTyping = false;

    if (reply) {
      const actionMatches = [...reply.matchAll(/\[PIP:(.*?)\]/gs)];
      const cleanText = reply.replace(/\[PIP:.*?\]/gs, '').trim();
      if (cleanText) {
        daxAddMsg('dax', 'Dax', cleanText);
        daxHistory.push({ role: 'assistant', content: cleanText });
        await saveDaxMessage('assistant', cleanText);
      }

      for (const match of actionMatches) {
        try {
          const action = JSON.parse(match[1]);
          const proj = projects.find(p => p.name.toLowerCase().includes(action.projectName.toLowerCase()));
          if (proj) {
            const firstStage = proj.subStages[0]?.id || 'ss1';
            const newPip = mkSubP(action.pipName, action.pipDesc || '', firstStage);
            projects = projects.map(p => p.id === proj.id ? { ...p, subProjects: [...p.subProjects, newPip] } : p);
            const updated = projects.find(x => x.id === proj.id);
            if (updated) await saveProject(updated);
            render();
            daxAddMsg('dax', 'Dax', `Created pip "${action.pipName}" in ${proj.name}.`);
          } else {
            daxAddMsg('dax', 'Dax', `Couldn't find project "${action.projectName}".`);
          }
        } catch (e) {
          console.warn('Dax pip error:', e, match[1]);
        }
      }

      if (!cleanText && actionMatches.length === 0) {
        daxAddMsg('dax', 'Dax', reply);
        daxHistory.push({ role: 'assistant', content: reply });
        await saveDaxMessage('assistant', reply);
      }
    }
  } catch (err) {
    daxRemoveTyping();
    daxTyping = false;
    daxAddMsg('dax', 'Dax', 'Something went wrong. Try again in a moment.');
    console.error('Dax error:', err);
  }
}

function openDax(pid) {
  daxProjectId = pid;
  const badge = document.getElementById('dax-project-badge');
  if (pid && badge) {
    const p = projects.find(x => x.id === pid);
    if (p) {
      const nameEl = document.getElementById('dax-project-name');
      if (nameEl) nameEl.textContent = p.name;
      badge.style.display = 'block';
    }
  } else if (badge) {
    badge.style.display = 'none';
  }
  const inp = document.getElementById('dax-input');
  if (inp) inp.focus();
}

function closeDax() {
  const badge = document.getElementById('dax-project-badge');
  if (badge) badge.style.display = 'none';
  daxProjectId = null;
}

function daxKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    daxSend();
  }
  const inp = e.target;
  inp.style.height = 'auto';
  inp.style.height = Math.min(inp.scrollHeight, 80) + 'px';
}

const daxOverlay = document.getElementById('dax-overlay');
if (daxOverlay) daxOverlay.addEventListener('click', function() {});
