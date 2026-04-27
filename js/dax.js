// DAX AI ADVISOR v3

let daxProjectId = null;
let daxTyping = false;
let daxHistory = [];
const DAX_ORCHESTRATION_KEY = 'vantage_dax_orchestration';
const DAX_HISTORY_TABLE = 'dax_history';
const DAX_CHAT_URL = `${SUPABASE_URL}/functions/v1/dax-chat`;
const CLAUDE_QUEUE_URL = '/.netlify/functions/claude-code-trigger';
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
Keep it concise and non-technical.
Each proposed PIP must include two descriptions:
- displayDescription: one plain sentence for the founder
- technicalDescription: the full build details for Claude Code later
The response should stay concise. In chat, the founder-facing description is the only one that should be shown.
No file names in the founder-facing line, no technical jargon there, no long explanations. Write like you're talking to a busy founder, not a developer.

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
      "displayDescription": "string",
      "technicalDescription": "string",
      "files": ["string"],
      "order": 1
    }
  ]
}

Rules:
- Include only new PIPs, not existing ones.
- Keep the file lists realistic and non-overlapping where possible.
- If overlap exists, order sequentially and mention that in the recommendation.
`;
}

function formatReviewPlan(plan) {
  const title = `${plan.projectName || 'Project'} Review Plan`;
  const lines = [title];
  lines.push("Here's what I recommend:");
  lines.push('');

  const pips = getReviewPips(plan);
  pips.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  if (pips.length) {
    pips.forEach((pip, idx) => {
      const description = pip.displayDescription || pip.description || pip.reason || 'No description provided.';
      lines.push(`${idx + 1}. ${pip.title || 'Untitled PIP'} — ${description}`);
    });
  } else if (plan.summary) {
    lines.push(plan.summary);
  } else {
    lines.push('No proposed PIPs were returned.');
  }

  lines.push('');
  lines.push('Should I proceed with these?');
  return lines.join('\n');
}

function getReviewPips(plan) {
  const candidates = [plan?.proposedPips, plan?.pips, plan?.proposed_pips];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.slice();
  }
  return [];
}

function buildClaudeQueueJobs(plan) {
  const pips = getReviewPips(plan);
  return pips.map((pip, index) => {
    const pipId = String(pip?.pipId || pip?.id || `PIP-${Date.now()}-${index + 1}`);
    const title = String(pip?.title || `PIP ${index + 1}`).trim();
    const displayDescription = String(pip?.displayDescription || pip?.description || pip?.reason || '').trim();
    const technicalDescription = String(pip?.technicalDescription || pip?.description || pip?.reason || displayDescription || '').trim();
    const files = Array.isArray(pip?.files) ? pip.files.map(f => String(f).trim()).filter(Boolean) : [];
    return {
      pipId,
      title,
      displayDescription,
      technicalDescription,
      files,
      status: 'queued',
      order: Number(pip?.order || index + 1),
    };
  });
}

function addQueuedPipsToProject(project, jobs) {
  if (!project || !Array.isArray(jobs) || !jobs.length) return project;
  const existing = Array.isArray(project.subProjects) ? project.subProjects : [];
  const byId = new Map(existing.map(sp => [String(sp.id || sp.pipId || sp.name || ''), sp]));
  jobs.forEach(job => {
    const subProject = {
      id: job.pipId,
      pipId: job.pipId,
      name: job.title,
      title: job.title,
      desc: job.displayDescription,
      displayDescription: job.displayDescription,
      technicalDescription: job.technicalDescription,
      files: job.files,
      status: 'queued',
      stage: 'idea',
      assignee: 'Dax',
      assigner: 'Dax',
      notes: '',
      _openNote: false,
    };
    byId.set(String(subProject.id), subProject);
  });
  return { ...project, subProjects: Array.from(byId.values()) };
}

function applyQueueJobStatuses(project, jobs) {
  if (!project || !Array.isArray(jobs) || !jobs.length) return project;
  const statusById = new Map(jobs.map(job => [String(job.pipId), job.status]));
  const updatedSubProjects = (project.subProjects || []).map(sp => {
    const key = String(sp.id || sp.pipId || '');
    if (!statusById.has(key)) return sp;
    const status = statusById.get(key);
    return { ...sp, status: status === 'running' ? 'in progress' : status };
  });
  return { ...project, subProjects: updatedSubProjects };
}

async function startClaudeCodeQueue(plan, project) {
  const jobs = Array.isArray(plan?.jobs) && plan.jobs.length ? plan.jobs.map(job => ({ ...job })) : buildClaudeQueueJobs(plan);
  if (!jobs.length) {
    throw new Error('No proposed PIPs were returned to queue.');
  }

  const response = await fetch(CLAUDE_QUEUE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: project?.id || null,
      projectName: project?.name || plan?.projectName || '',
      jobs,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || `Claude queue request failed (${response.status})`);
  }

  return {
    ...data,
    jobs: Array.isArray(data.jobs) ? data.jobs : jobs,
  };
}

function parseReviewPlan(reply, project) {
  let raw = String(reply || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    raw = raw.slice(firstBrace, lastBrace + 1);
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      projectName: parsed.projectName || project?.name || 'Project',
      summary: parsed.summary || '',
      recommendation: parsed.recommendation || '',
      proposedPips: Array.isArray(parsed.proposedPips)
        ? parsed.proposedPips.map(pip => ({
            ...pip,
            displayDescription: pip.displayDescription || pip.description || pip.reason || '',
            technicalDescription: pip.technicalDescription || pip.description || pip.reason || '',
          }))
        : [],
    };
  } catch (_) {
    const text = raw || 'I could not generate a review plan.';
    return {
      projectName: project?.name || 'Project',
      summary: text,
      recommendation: '',
      proposedPips: [],
    };
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
    const payload = { messages, context, system };
    console.log('dax request payload:', {
      hasActiveProject: !!context?.activeProject,
      activeProjectName: context?.activeProject?.name || null,
      hasPendingReview: !!context?.pendingReview,
      payload,
    });

    if (sb?.functions?.invoke) {
      const { data, error } = await sb.functions.invoke('dax-chat', {
        body: payload,
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
        body: JSON.stringify(payload),
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

  console.log('review project data:', project);
  const context = buildDaxContext(project);
  const system = buildReviewSystem(project);
  const messages = [
    { role: 'user', content: `Review this project: ${project.name}. Draft the next PIPs, ordered by execution priority.` },
  ];
  console.log('review request body:', {
    messages,
    context,
    system,
  });

  daxTyping = true;
  daxShowTyping();

  try {
    const reply = await callDaxChat(messages, context, system);
    daxRemoveTyping();
    daxTyping = false;

    console.log('Dax review raw response:', reply);

    const plan = parseReviewPlan(reply, project);
    console.log('parsed plan:', plan, 'proposedPips:', plan?.proposedPips);
    stashPendingReview(plan, project);
    const rendered = formatReviewPlan(plan);
    daxAddMsg('dax', 'Dax', rendered);
    daxHistory.push({ role: 'assistant', content: rendered });
    await saveDaxMessage('assistant', rendered);
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
    const project = projects.find(p => p.id === pending.projectId) || findProjectByName(pending.projectName);
    const jobs = buildClaudeQueueJobs(pending);

    if (!project) {
      const msg = `I couldn't find the project for the pending review plan.`;
      daxAddMsg('dax', 'Dax', msg);
      daxHistory.push({ role: 'assistant', content: msg });
      await saveDaxMessage('assistant', msg);
      return;
    }

    if (!jobs.length) {
      const msg = `There aren't any queued PIPs to run for ${project.name}.`;
      daxAddMsg('dax', 'Dax', msg);
      daxHistory.push({ role: 'assistant', content: msg });
      await saveDaxMessage('assistant', msg);
      return;
    }

    const queuedPlan = {
      ...pending,
      status: 'queued',
      approvedAt: new Date().toISOString(),
      jobs,
    };
    daxOrchestration.pendingReview = queuedPlan;
    saveDaxOrchestration();

    const projectWithQueuedPips = addQueuedPipsToProject(project, jobs);
    const projectWithRunningPip = jobs.length
      ? applyQueueJobStatuses(projectWithQueuedPips, [{ pipId: jobs[0].pipId, status: 'in progress' }])
      : projectWithQueuedPips;
    projects = projects.map(p => p.id === projectWithRunningPip.id ? projectWithRunningPip : p);
    await saveProject(projectWithRunningPip);
    render();

    const startMsg = `Queued ${jobs.length} PIP${jobs.length === 1 ? '' : 's'} for ${project.name}. Starting PIP 1...`;
    daxAddMsg('dax', 'Dax', startMsg);
    daxHistory.push({ role: 'assistant', content: startMsg });
    await saveDaxMessage('assistant', startMsg);

    daxTyping = true;
    daxShowTyping();

    try {
      const result = await startClaudeCodeQueue(queuedPlan, projectWithRunningPip);
      daxRemoveTyping();
      daxTyping = false;

      const finalJobs = Array.isArray(result.jobs) ? result.jobs : jobs;
      const finalProject = applyQueueJobStatuses(projectWithRunningPip, finalJobs);
      projects = projects.map(p => p.id === finalProject.id ? finalProject : p);
      await saveProject(finalProject);
      render();

      const events = Array.isArray(result.events) ? result.events : [];
      const displayEvents = events.filter((event, idx) => !(idx === 0 && event === startMsg));
      if (displayEvents.length) {
        for (const event of displayEvents) {
          daxAddMsg('dax', 'Dax', event);
          daxHistory.push({ role: 'assistant', content: event });
          await saveDaxMessage('assistant', event);
        }
      }

      if (result.status === 'paused' && result.message) {
        daxOrchestration.pendingReview = {
          ...queuedPlan,
          status: 'paused',
          message: result.message,
          jobs: finalJobs,
        };
        saveDaxOrchestration();
        daxAddMsg('dax', 'Dax', result.message);
        daxHistory.push({ role: 'assistant', content: result.message });
        await saveDaxMessage('assistant', result.message);
      } else if (result.status === 'failed' && result.message) {
        daxOrchestration.pendingReview = {
          ...queuedPlan,
          status: 'failed',
          message: result.message,
          jobs: finalJobs,
        };
        saveDaxOrchestration();
        daxAddMsg('dax', 'Dax', result.message);
        daxHistory.push({ role: 'assistant', content: result.message });
        await saveDaxMessage('assistant', result.message);
      } else {
        const doneMsg = `Claude Code queue finished for ${project.name}.`;
        daxAddMsg('dax', 'Dax', doneMsg);
        daxHistory.push({ role: 'assistant', content: doneMsg });
        await saveDaxMessage('assistant', doneMsg);
        clearPendingReview();
      }
    } catch (err) {
      daxRemoveTyping();
      daxTyping = false;
      projects = projects.map(p => p.id === projectWithQueuedPips.id ? projectWithQueuedPips : p);
      await saveProject(projectWithQueuedPips);
      render();
      const msg = err instanceof Error ? err.message : 'Claude Code queue failed.';
      daxAddMsg('dax', 'Dax', msg);
      daxHistory.push({ role: 'assistant', content: msg });
      await saveDaxMessage('assistant', msg);
    }
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
