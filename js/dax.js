// DAX AI ADVISOR v3

let daxProjectId = null;
let daxTyping = false;
let daxHistory = [];
let daxConversationId = null;
let daxConversationTitle = '';
let daxConversationSummaries = [];
const DAX_ORCHESTRATION_KEY = 'vantage_dax_orchestration';
const DAX_ACTIVE_CONVERSATIONS_KEY = 'vantage_dax_active_conversations';
const DAX_HISTORY_TABLE = 'dax_history';
const DAX_CHAT_URL = `${SUPABASE_URL}/functions/v1/dax-chat`;
const CLAUDE_QUEUE_URL = '/api/claude-code-trigger';
const DAX_ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const PROJECT_REPOS = {
  aria: 'madmyron/aria-assistant',
  vantage: 'madmyron/vantage',
  comedy4all: 'madmyron/comedy4all',
};
const GITHUB_CODE_CONTEXT_CACHE = new Map();
const IMPORTANT_CODE_FILES = [
  'index.html',
  'README.md',
  'README',
  'package.json',
  'js/app.js',
  'js/dax.js',
  'js/render.js',
  'js/modal.js',
  'js/actions.js',
  'css/styles.css',
  'sw.js',
  'manifest.json',
  'api/claude-code-trigger.js',
  'supabase/functions/dax-chat/index.ts',
  'src/App.jsx',
  'src/main.jsx',
  'src/index.jsx',
  'server/index.js',
];
const MAX_TREE_PREVIEW = 250;
const MAX_KEY_FILES = 7;
const MAX_FILE_CHARS = 12000;
const DAX_CHAT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'x-client-info': 'vantage-web-dax/1.0',
};
let daxOrchestration = loadDaxOrchestration();

function getDaxAnthropicKey() {
  return localStorage.getItem('vantage_dax_key') || '';
}

function promptDaxAnthropicKey() {
  const key = prompt('Enter your Anthropic API key to enable Dax review mode:');
  if (key && key.trim()) {
    localStorage.setItem('vantage_dax_key', key.trim());
    return key.trim();
  }
  return '';
}

function loadDaxOrchestration() {
  try {
    const raw = localStorage.getItem(DAX_ORCHESTRATION_KEY);
    return raw ? JSON.parse(raw) : { pendingReview: null, pendingQueue: null, pendingStalePipDeletion: false, stalePips: [] };
  } catch (err) {
    console.warn('Could not load Dax orchestration state:', err);
    return { pendingReview: null, pendingQueue: null, pendingStalePipDeletion: false, stalePips: [] };
  }
}

function saveDaxOrchestration() {
  try {
    localStorage.setItem(DAX_ORCHESTRATION_KEY, JSON.stringify(daxOrchestration || { pendingReview: null, pendingQueue: null, pendingStalePipDeletion: false, stalePips: [] }));
  } catch (err) {
    console.warn('Could not save Dax orchestration state:', err);
  }
}

function loadDaxConversationMap() {
  try {
    const raw = localStorage.getItem(DAX_ACTIVE_CONVERSATIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('Could not load Dax conversation map:', err);
    return {};
  }
}

function saveDaxConversationMap(map) {
  try {
    localStorage.setItem(DAX_ACTIVE_CONVERSATIONS_KEY, JSON.stringify(map || {}));
  } catch (err) {
    console.warn('Could not save Dax conversation map:', err);
  }
}

function getDaxScopeKey(projectId = daxProjectId) {
  return projectId == null || projectId === '' ? 'global' : String(projectId);
}

function getStoredDaxConversationId(projectId = daxProjectId) {
  const map = loadDaxConversationMap();
  return map[getDaxScopeKey(projectId)] || null;
}

function setStoredDaxConversationId(projectId, conversationId) {
  const map = loadDaxConversationMap();
  const key = getDaxScopeKey(projectId);
  if (conversationId) map[key] = conversationId;
  else delete map[key];
  saveDaxConversationMap(map);
}

function createDaxConversationId() {
  if (typeof crypto !== 'undefined' && crypto?.randomUUID) return crypto.randomUUID();
  return `dax-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getDaxConversationTitle(projectId, rows = []) {
  const project = projectId ? projects.find(p => String(p.id) === String(projectId)) : null;
  const projectName = project?.name || 'Conversation';
  const firstUser = rows.find(row => row.role === 'user' && String(row.content || '').trim());
  const firstAssistant = rows.find(row => row.role === 'assistant' && String(row.content || '').trim());
  const source = firstUser || firstAssistant;
  if (source?.content) {
    const snippet = String(source.content).replace(/\s+/g, ' ').trim();
    if (snippet) return snippet.slice(0, 72);
  }
  return projectName;
}

function clearDaxConversationMenu() {
  const menu = document.getElementById('dax-history-menu');
  if (menu) menu.remove();
}

function ensureDaxConversationHeaderControls() {
  const header = document.querySelector('.dax-header');
  if (!header || document.getElementById('dax-convo-controls')) return;

  header.style.position = 'relative';

  const controls = document.createElement('div');
  controls.id = 'dax-convo-controls';
  controls.style.display = 'flex';
  controls.style.alignItems = 'center';
  controls.style.gap = '6px';
  controls.style.marginLeft = 'auto';
  controls.style.flexWrap = 'wrap';

  const makeBtn = (label, title, onClick, extraStyle = '') => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.title = title;
    btn.style.cssText = `min-height:28px;padding:6px 10px;border:1px solid var(--border2);border-radius:6px;background:var(--bg3);color:var(--text2);font:inherit;font-size:11px;font-weight:600;cursor:pointer;${extraStyle}`;
    btn.addEventListener('click', onClick);
    return btn;
  };

  const historyBtn = makeBtn('History', 'Open conversation history', async (e) => {
    e.stopPropagation();
    await toggleDaxHistoryMenu();
  });
  const newBtn = makeBtn('New', 'Start a new conversation', async (e) => {
    e.stopPropagation();
    await startFreshDaxConversation({ deleteCurrent: false });
  });
  const clearBtn = makeBtn('Clear', 'Delete the current conversation', async (e) => {
    e.stopPropagation();
    await startFreshDaxConversation({ deleteCurrent: true });
  }, 'color:#ff7f7f;border-color:rgba(255,127,127,.35);');

  controls.appendChild(historyBtn);
  controls.appendChild(newBtn);
  controls.appendChild(clearBtn);
  header.appendChild(controls);

  const panel = document.getElementById('dax-panel');
  if (panel && !document.getElementById('dax-history-menu')) {
    const menu = document.createElement('div');
    menu.id = 'dax-history-menu';
    menu.style.cssText = 'display:none;position:absolute;top:48px;right:12px;z-index:420;width:260px;max-height:320px;overflow:auto;background:var(--bg2);border:1px solid var(--border2);border-radius:10px;box-shadow:0 18px 40px rgba(0,0,0,.25);';
    panel.appendChild(menu);
  }
}

function renderDaxConversationMessages(messages) {
  const msgs = document.getElementById('dax-messages');
  if (!msgs) return;
  msgs.innerHTML = '';
  if (!messages.length) {
    scrollDaxToBottomDelayed();
    return;
  }
  messages.forEach(msg => {
    daxAddMsg(msg.role === 'assistant' ? 'dax' : 'user', msg.role === 'assistant' ? 'Dax' : 'You', msg.content, { silent: true });
  });
  scrollDaxToBottomDelayed();
}

function renderDaxHistoryMenu() {
  const menu = document.getElementById('dax-history-menu');
  if (!menu) return;
  const summaries = (daxConversationSummaries || []).filter(s => !looksLikeJson(s.title));
  menu.innerHTML = '';

  if (!summaries.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:10px 12px;font-size:12px;color:var(--text3);';
    empty.textContent = 'No previous conversations yet.';
    menu.appendChild(empty);
    return;
  }

  summaries.forEach(summary => {
    const item = document.createElement('button');
    item.type = 'button';
    item.style.cssText = 'display:block;width:100%;text-align:left;padding:10px 12px;border:none;border-bottom:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;font:inherit;';
    item.innerHTML = `<div style="font-size:12px;font-weight:600;line-height:1.3">${esc(summary.title || 'Conversation')}</div><div style="font-size:10px;color:var(--text3);margin-top:3px">${esc(summary.updatedAtLabel || '')}</div>`;
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      await loadDaxConversationById(summary.projectId, summary.conversationId);
      menu.style.display = 'none';
    });
    menu.appendChild(item);
  });
}

async function refreshDaxConversationSummaries(projectId = daxProjectId) {
  const scopeKey = getDaxScopeKey(projectId);
  try {
    let query = sb
      .from(DAX_HISTORY_TABLE)
      .select('role, content, created_at, project_id, conversation_id, conversation_title')
      .order('created_at', { ascending: true })
      .limit(1000);
    if (scopeKey === 'global') query = query.is('project_id', null);
    else query = query.eq('project_id', scopeKey);
    const { data, error } = await query;
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const grouped = new Map();
    rows.forEach(row => {
      const key = row.conversation_id || row.created_at || 'legacy';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });
    daxConversationSummaries = Array.from(grouped.entries()).map(([conversationId, items]) => {
      const last = items[items.length - 1] || {};
      const title = last.conversation_title || getDaxConversationTitle(projectId, items);
      const updatedAt = last.created_at || '';
      return {
        projectId: scopeKey === 'global' ? null : scopeKey,
        conversationId: last.conversation_id || conversationId,
        title,
        updatedAt,
        updatedAtLabel: updatedAt ? new Date(updatedAt).toLocaleString() : '',
        itemCount: items.length,
      };
    }).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  } catch (err) {
    console.warn('Could not refresh Dax conversation summaries:', err);
    daxConversationSummaries = [];
  }
  renderDaxHistoryMenu();
}

async function loadDaxConversationById(projectId, conversationId) {
  daxProjectId = projectId == null ? null : projectId;
  daxConversationId = conversationId || createDaxConversationId();
  setStoredDaxConversationId(projectId, daxConversationId);
  daxConversationTitle = null;
  try {
    const scopeKey = getDaxScopeKey(projectId);
    let query = sb
      .from(DAX_HISTORY_TABLE)
      .select('role, content, created_at, project_id, conversation_id, conversation_title')
      .order('created_at', { ascending: true })
      .limit(1000);
    if (scopeKey === 'global') query = query.is('project_id', null);
    else query = query.eq('project_id', scopeKey);
    query = query.eq('conversation_id', daxConversationId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    daxHistory = rows
      .filter(row => row.content && !looksLikeJson(row.content))
      .map(row => ({ role: row.role, content: row.content }));
    daxConversationTitle = rows[0]?.conversation_title || getDaxConversationTitle(projectId, rows);
    renderDaxConversationMessages(daxHistory);
    await refreshDaxConversationSummaries(projectId);
    return daxHistory;
  } catch (err) {
    console.warn('Could not load Dax conversation:', err);
    daxHistory = [];
    renderDaxConversationMessages([]);
    await refreshDaxConversationSummaries(projectId);
    return daxHistory;
  }
}

async function loadLatestOrNewDaxConversation(projectId, { forceNew = false } = {}) {
  const scopeKey = getDaxScopeKey(projectId);
  let conversationId = forceNew ? createDaxConversationId() : getStoredDaxConversationId(projectId);
  if (!conversationId) {
    try {
      let query = sb
        .from(DAX_HISTORY_TABLE)
        .select('conversation_id, conversation_title, created_at, project_id')
        .order('created_at', { ascending: false })
        .limit(500);
      if (scopeKey === 'global') query = query.is('project_id', null);
      else query = query.eq('project_id', scopeKey);
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        conversationId = data[0]?.conversation_id || null;
      }
    } catch (err) {
      console.warn('Could not locate latest Dax conversation:', err);
    }
  }
  if (!conversationId) conversationId = createDaxConversationId();
  return loadDaxConversationById(projectId, conversationId);
}

async function startFreshDaxConversation({ deleteCurrent = false } = {}) {
  const projectId = daxProjectId;
  const currentConversationId = daxConversationId || getStoredDaxConversationId(projectId);
  if (deleteCurrent && currentConversationId) {
    try {
      let query = sb.from(DAX_HISTORY_TABLE).delete();
      if (projectId == null) query = query.is('project_id', null);
      else query = query.eq('project_id', String(projectId));
      query = query.eq('conversation_id', currentConversationId);
      await query;
    } catch (err) {
      console.warn('Could not delete current Dax conversation:', err);
    }
  }
  daxConversationId = createDaxConversationId();
  daxConversationTitle = projectId ? (projects.find(p => String(p.id) === String(projectId))?.name || 'Conversation') : 'Conversation';
  setStoredDaxConversationId(projectId, daxConversationId);
  daxHistory = [];
  renderDaxConversationMessages([]);
  await refreshDaxConversationSummaries(projectId);
}

async function toggleDaxHistoryMenu() {
  ensureDaxConversationHeaderControls();
  const menu = document.getElementById('dax-history-menu');
  if (!menu) return;
  if (menu.style.display === 'block') {
    menu.style.display = 'none';
    return;
  }
  await refreshDaxConversationSummaries(daxProjectId);
  const summaries = daxConversationSummaries || [];
  menu.style.display = summaries.length ? 'block' : 'none';
  renderDaxHistoryMenu();
}

function scrollDaxToBottom() {
  const chat = document.getElementById('dax-messages');
  if (chat) {
    chat.scrollTop = chat.scrollHeight;
  }
}

console.log('dax chat container:', document.getElementById('dax-messages'), document.querySelector('.dax-chat'), document.querySelector('.dax-messages'), document.querySelector('#dax-chat'));

function scrollDaxToBottomDelayed() {
  scrollDaxToBottom();
  setTimeout(scrollDaxToBottom, 100);
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

function normalizeProjectKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getProjectRepo(project) {
  const directRepo = String(project?.githubRepo || project?.repo || project?.github || '').trim();
  if (directRepo) return directRepo;

  const knownRepo = knownGithubRepoForName(project?.name || '');
  if (knownRepo) return knownRepo;

  const projectKey = normalizeProjectKey(project?.name || project?.slug || project?.id || '');
  if (!projectKey) return null;

  if (PROJECT_REPOS[projectKey]) {
    return PROJECT_REPOS[projectKey];
  }

  const matchedEntry = Object.entries(PROJECT_REPOS).find(([key]) => projectKey.includes(key) || key.includes(projectKey));
  return matchedEntry ? matchedEntry[1] : null;
}

function findProjectMentionInText(text) {
  const lower = String(text || '').toLowerCase();
  if (!lower) return null;
  return projects.find(project => lower.includes(String(project.name || '').toLowerCase())) || null;
}

function shouldFetchCodeContext(text, project) {
  const query = String(text || '').toLowerCase();
  if (!query) return false;
  if (/^(review|analy[sz]e|look at|inspect|audit)\b/.test(query)) return true;
  if (/\b(how complete|what does|what is built|what's built|what is missing|what's missing|stubbed|implemented|auth system|code base|codebase|architecture|repo|tree|read the code|read.*code|where.*development|development.*where|progress|how far|how much.*done|what.*done)\b/.test(query)) {
    return true;
  }
  if (project && /\b(code|implementation|auth|frontend|backend|ui|api|login|signup|supabase)\b/.test(query)) {
    return true;
  }
  return false;
}

async function fetchGitHubCodeContext(project, query = '') {
  const repo = getProjectRepo(project);
  if (!repo) return null;

  const cacheKey = `${normalizeProjectKey(repo)}::${normalizeProjectKey(query) || 'default'}`;
  if (GITHUB_CODE_CONTEXT_CACHE.has(cacheKey)) {
    return GITHUB_CODE_CONTEXT_CACHE.get(cacheKey);
  }

  const promise = (async () => {
    const { tree, defaultBranch, truncated } = await fetchGitHubRepoTree(repo);
    const treePreview = tree.slice(0, MAX_TREE_PREVIEW).map(entry => ({
      path: entry.path,
      type: entry.type,
      size: entry.size || 0,
    }));
    const keyPaths = selectImportantCodeFiles(tree, query);
    const keyFiles = [];
    for (const path of keyPaths.slice(0, MAX_KEY_FILES)) {
      const content = await fetchGitHubFileContent(repo, defaultBranch, path);
      if (content) {
        keyFiles.push({
          path,
          content: content.slice(0, MAX_FILE_CHARS),
        });
      }
    }

    return {
      projectName: project?.name || null,
      repoFullName: repo,
      defaultBranch,
      treeTotalCount: tree.length,
      treeTruncated: truncated || tree.length > MAX_TREE_PREVIEW,
      fileTree: treePreview,
      keyFiles,
      summary: buildCodeContextSummary(tree, keyFiles, query, repo),
    };
  })();

  GITHUB_CODE_CONTEXT_CACHE.set(cacheKey, promise);
  try {
    return await promise;
  } catch (err) {
    GITHUB_CODE_CONTEXT_CACHE.delete(cacheKey);
    console.warn('Could not fetch GitHub code context:', err);
    return {
      projectName: project?.name || null,
      repoFullName: repo,
      error: err instanceof Error ? err.message : String(err),
      fileTree: [],
      keyFiles: [],
      summary: {
        completionEstimate: 0,
        built: [],
        missing: IMPORTANT_CODE_FILES.slice(),
        stubbed: [],
        note: 'Could not fetch code context from GitHub.',
      },
    };
  }
}

async function fetchProjectCode(repo) {
  const repoFullName = String(repo || '').trim();
  if (!repoFullName) return null;

  const cacheKey = `project-code::${normalizeProjectKey(repoFullName)}`;
  if (GITHUB_CODE_CONTEXT_CACHE.has(cacheKey)) {
    return GITHUB_CODE_CONTEXT_CACHE.get(cacheKey);
  }

  const promise = (async () => {
    const treeResult = await fetchProjectCodeTree(repoFullName);
    if (!treeResult) return null;

    const { tree, branch } = treeResult;
    const keyPaths = selectProjectCodePaths(tree).slice(0, 5);
    const keyFiles = [];

    for (const path of keyPaths) {
      const content = await fetchProjectCodeFile(repoFullName, branch, path);
      if (content) {
        keyFiles.push({
          path,
          content: content.slice(0, 3000),
        });
      }
    }

    const fileList = keyFiles.map(file => file.path);
    const built = keyFiles.filter(file => !/todo|fixme|stub|placeholder|not implemented|temp/i.test(file.content)).map(file => file.path);
    const stubbed = keyFiles.filter(file => /todo|fixme|stub|placeholder|not implemented|temp/i.test(file.content)).map(file => file.path);
    const completionEstimate = Math.max(5, Math.min(98, Math.round((built.length / Math.max(1, keyPaths.length)) * 100)));

    return {
      repoFullName,
      branch,
      fileTree: tree.map(entry => ({ path: entry.path, type: entry.type, size: entry.size || 0 })),
      keyFiles,
      summary: {
        fileList,
        keyFileContents: keyFiles,
        built,
        missing: keyPaths.filter(path => !fileList.includes(path)),
        stubbed,
        completionEstimate,
        note: 'Read-only GitHub code context.',
      },
    };
  })();

  GITHUB_CODE_CONTEXT_CACHE.set(cacheKey, promise);
  try {
    return await promise;
  } catch (err) {
    GITHUB_CODE_CONTEXT_CACHE.delete(cacheKey);
    console.warn('Could not fetch project code:', err);
    return null;
  }
}

async function fetchProjectCodeTree(repo) {
  const branches = ['main', 'master'];
  for (const branch of branches) {
    const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (res.ok) {
      const data = await res.json();
      return {
        branch,
        tree: Array.isArray(data.tree) ? data.tree.filter(entry => entry && entry.type === 'blob' && entry.path) : [],
      };
    }
    if (res.status !== 404) {
      throw new Error(`GitHub tree fetch failed for ${repo} (${res.status})`);
    }
  }
  return null;
}

function selectProjectCodePaths(tree) {
  const paths = tree.map(entry => String(entry.path || '')).filter(Boolean);
  const selected = [];
  const push = path => {
    if (path && paths.includes(path) && !selected.includes(path)) {
      selected.push(path);
    }
  };

  const priority = [
    'index.html',
    'README.md',
    'README',
    'package.json',
    'js/app.js',
    'js/dax.js',
    'js/render.js',
    'js/modal.js',
    'js/actions.js',
    'js/constants.js',
    'js/state.js',
    'css/styles.css',
    'api/claude-code-trigger.js',
    'supabase/functions/dax-chat/index.ts',
    'src/main.jsx',
    'src/App.jsx',
    'src/index.jsx',
    'server/index.js',
  ];

  priority.forEach(push);

  paths
    .filter(path => /^(index\.html|README(\.md)?|package\.json|js\/|css\/|api\/|src\/|supabase\/functions\/|server\/)/i.test(path))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .forEach(push);

  return selected;
}

async function fetchProjectCodeFile(repo, branch, filepath) {
  const branches = branch === 'master' ? ['master'] : ['main', 'master'];
  for (const currentBranch of branches) {
    const url = `https://raw.githubusercontent.com/${repo}/${currentBranch}/${filepath.split('/').map(segment => encodeURIComponent(segment)).join('/')}`;
    const res = await fetch(url, { headers: { Accept: 'text/plain' } });
    if (res.ok) {
      return await res.text();
    }
    if (res.status !== 404) {
      continue;
    }
  }
  return '';
}

async function fetchGitHubRepoTree(repo) {
  let defaultBranch = 'main';
  let res = await fetch(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`, {
    headers: { Accept: 'application/vnd.github+json' },
  });

  if (!res.ok) {
    const repoInfo = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: 'application/vnd.github+json' },
    }).then(r => r.ok ? r.json() : null).catch(() => null);
    defaultBranch = String(repoInfo?.default_branch || 'main').trim() || 'main';
    res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
  }

  if (!res.ok) {
    throw new Error(`GitHub tree fetch failed for ${repo} (${res.status})`);
  }

  const data = await res.json();
  return {
    defaultBranch,
    truncated: Boolean(data.truncated),
    tree: Array.isArray(data.tree) ? data.tree.filter(entry => entry && entry.type === 'blob' && entry.path) : [],
  };
}

async function fetchGitHubFileContent(repo, branch, path) {
  const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });

  if (!res.ok) {
    return '';
  }

  const data = await res.json().catch(() => null);
  if (!data || Array.isArray(data) || data.type === 'dir') {
    return '';
  }

  if (typeof data.content === 'string' && data.content.trim()) {
    return decodeGitHubBase64(data.content);
  }

  return String(data.download_url || '');
}

function decodeGitHubBase64(value) {
  const cleaned = String(value || '').replace(/\s+/g, '');
  if (!cleaned) return '';
  try {
    return decodeURIComponent(escape(atob(cleaned)));
  } catch (_) {
    try {
      return atob(cleaned);
    } catch (err) {
      return '';
    }
  }
}

function selectImportantCodeFiles(tree, query = '') {
  const paths = tree.map(entry => String(entry.path || '')).filter(Boolean);
  const selected = [];
  const push = path => {
    if (path && paths.includes(path) && !selected.includes(path)) {
      selected.push(path);
    }
  };
  const lowerQuery = String(query || '').toLowerCase();

  IMPORTANT_CODE_FILES.forEach(push);

  const priorityPatterns = [];
  if (/\b(auth|login|signup|signin|password|oauth|session)\b/.test(lowerQuery)) {
    priorityPatterns.push(/auth/i, /login/i, /signup/i, /signin/i, /session/i, /supabase/i);
  }
  if (/\b(api|backend|server|function|route|endpoint)\b/.test(lowerQuery)) {
    priorityPatterns.push(/api/i, /server/i, /function/i, /route/i);
  }
  if (/\b(ui|frontend|layout|board|modal|chat|dashboard)\b/.test(lowerQuery)) {
    priorityPatterns.push(/index\.html$/i, /styles\.css$/i, /modal/i, /render/i, /app/i);
  }

  for (const pattern of priorityPatterns) {
    paths.filter(path => pattern.test(path)).forEach(push);
  }

  paths
    .filter(path => /^(index\.html|README(\.md)?|package\.json|js\/|css\/|api\/|src\/|supabase\/functions\/)/i.test(path))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .forEach(push);

  return selected.slice(0, MAX_KEY_FILES);
}

function buildCodeContextSummary(tree, keyFiles, query = '', repo = '') {
  const filePaths = new Set(tree.map(entry => String(entry.path || '')));
  const built = IMPORTANT_CODE_FILES.filter(path => filePaths.has(path));
  const missing = IMPORTANT_CODE_FILES.filter(path => !filePaths.has(path));
  const stubbed = keyFiles
    .filter(file => /todo|fixme|stub|placeholder|not implemented|temp/i.test(String(file.content || '')))
    .map(file => file.path);
  const completionEstimate = Math.max(5, Math.min(98, Math.round((built.length / IMPORTANT_CODE_FILES.length) * 100)));

  return {
    repoFullName: repo || null,
    query: String(query || '').trim(),
    completionEstimate,
    built,
    missing,
    stubbed,
    note: `GitHub-aware code context for ${repo || 'unknown repo'}.`,
  };
}

function buildDaxContext(project, codeContext) {
  return {
    activeProject: project ? { name: project.name } : null,
    portfolio: getProjectContextSummary(),
    team: (typeof team !== 'undefined' && Array.isArray(team)) ? team : [],
    codeContext: codeContext || null,
  };
}

function buildNormalDaxSystem(project, codeContext) {
  const projectName = project ? project.name : 'the current portfolio';

  let pipBlock = '';
  if (project) {
    const projectData = projects.find(p => p.id === project.id || p.name === project.name);
    if (projectData?.plan) {
      pipBlock += `\n\nProject plan:\n${projectData.plan}`;
    }
    const pips = (projectData?.subProjects || []);
    if (pips.length) {
      const pipList = pips.map(sp => `- ${sp.name}${sp.desc ? ': ' + sp.desc : ''} [${sp.stage || 'unknown stage'}]`).join('\n');
      pipBlock = `\n\nExisting PIPs in ${projectName}:\n${pipList}`;
    } else {
      pipBlock = `\n\nExisting PIPs in ${projectName}: none yet.`;
    }
  } else if (Array.isArray(projects) && projects.length) {
    const portfolioLines = projects.map(p => {
      const pips = (p.subProjects || []);
      const pipLines = pips.length
        ? pips.map(sp => `  - ${sp.name} [${sp.stage || 'unknown'}]`).join('\n')
        : '  (no PIPs yet)';
      return `${p.name} (${(p.stage || 'unknown stage')}):\n${pipLines}`;
    }).join('\n\n');
    pipBlock = `\n\nAll projects and their PIPs:\n${portfolioLines}`;
  }

  const codeContextBlock = codeContext ? (() => {
    const slim = {
      repo: codeContext.repoFullName,
      branch: codeContext.branch,
      files: (codeContext.fileTree || []).map(f => f.path).slice(0, 80),
      keyFiles: (codeContext.keyFiles || []).map(f => ({ path: f.path, content: f.content?.slice(0, 1500) })),
      summary: codeContext.summary,
    };
    return `\n\nGitHub code context:\n${JSON.stringify(slim, null, 2)}\n\nWhen code context is provided, use it to give an honest technical assessment. Identify what is actually implemented vs stubbed. Be direct and specific about what works and what doesn't.`;
  })() : '';

  return `You are Dax, the AI orchestrator inside Vantage. Your job is to understand the project, figure out what needs to be built, and send jobs to Claude to actually write the code. You are the decision-maker and quality checker — Claude is the one who writes code.

Your role in order:
1. Read the project code and understand where things stand.
2. Tell the user in plain English what's done, what's missing, and what should happen next.
3. When you know what to build, propose it clearly and ask the user to approve.
4. When approved, you trigger Claude to write the code by outputting an EXECUTE block (see format below).
5. After Claude runs, you verify the result and report back.

Rules:
- Never say "Claude Code, do X" — you trigger execution by outputting EXECUTE blocks, not by talking to Claude.
- Never pretend to do something you haven't actually triggered.
- Keep responses short and plain — one sentence per point, max 4 bullets.
- You can see the project's existing PIPs below. Do not duplicate them.
- Ask one question at a time. Push toward a decision.

To propose a code change for Claude to execute, add ONE EXECUTE block per change at the very end of your message (after your explanation):
[EXECUTE:{"projectName":"exact project name","title":"short title","description":"plain English explanation for the user","technicalDescription":"precise instruction for Claude: what to create, modify, or fix and exactly how","files":["path/to/file.js"]}]

Only output EXECUTE blocks when you have a clear, specific code change ready. Do not output them speculatively.

If you hit a technical problem you can't solve on your own (e.g. a file is too large to edit in one shot, execution keeps failing, you're unsure how to split a task), ask Claude for help by outputting a THINK block:
[THINK:{"problem":"describe the specific technical challenge","context":"what you've already tried or what failed"}]
Claude will respond with a concrete solution and you can continue. Use this instead of giving up or asking the user.

To create a new PIP card in a project, output at the end of your message:
[PIP:{"projectName":"exact project name","pipName":"short pip title","pipDesc":"one sentence description"}]

Use PIP any time you are creating a new PIP that does not yet exist.

To move a PIP to a different stage, output at the end of your message:
[MOVE_PIP:{"projectName":"exact project name","pipName":"exact pip name","stage":"idea|todo|inprogress|done"}]

Use MOVE_PIP any time you say you are moving, updating, or changing the status of a PIP. Never say you moved something without outputting this block.

To save a plan for the project (visible in the Info tab), output at the end of your message:
[WRITE_PLAN:{"projectName":"exact project name","plan":"the full plan text"}]

Current focus: ${projectName}${pipBlock}${codeContextBlock}`;
}

function buildReviewSystem(project, codeContext) {
  const fullProjectContext = project ? project.name : 'null';
  const codeContextBlock = codeContext ? (() => {
    const slim = {
      repo: codeContext.repoFullName,
      files: (codeContext.fileTree || []).map(f => f.path).slice(0, 80),
      keyFiles: (codeContext.keyFiles || []).map(f => ({ path: f.path, content: f.content?.slice(0, 1500) })),
      summary: codeContext.summary,
    };
    return `\n\nGitHub code context:\n${JSON.stringify(slim, null, 2)}\n\nUse this code context to judge what is actually built, what looks stubbed, what is missing, and to estimate completion percentage honestly.`;
  })() : '';

  return `You are Dax acting as a project manager inside Vantage.

The user asked to review the project. Analyze the project's goals, current state, and existing PIPs.
Draft a proposed list of NEW PIPs in recommended execution order.
Keep it concise and non-technical.
Use the code context to be honest about completion percentage, what is actually built, what is stubbed, and what is missing before proposing new PIPs.
Each proposed PIP must include two descriptions:
- displayDescription: one plain sentence for the founder
- technicalDescription: the full build details for Claude Code later
The response should stay concise. In chat, the founder-facing description is the only one that should be shown.
No file names in the founder-facing line, no technical jargon there, no long explanations. Write like you're talking to a busy founder, not a developer.

Project context:
${fullProjectContext}${codeContextBlock}

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

function buildReviewAnthropicPayload(project, messages, codeContext) {
  return {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: buildReviewSystem(project, codeContext),
    messages,
    tools: [proposeReviewPlanTool()],
    tool_choice: { type: 'tool', name: 'propose_review_plan' },
  };
}

function proposeReviewPlanTool() {
  return {
    name: 'propose_review_plan',
    description: 'Return a structured review plan for the current project.',
    input_schema: {
      type: 'object',
      properties: {
        projectName: { type: 'string' },
        recommendation: { type: 'string' },
        proposedPips: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pipId: { type: 'string' },
              title: { type: 'string' },
              displayDescription: { type: 'string' },
              technicalDescription: { type: 'string' },
              files: {
                type: 'array',
                items: { type: 'string' },
              },
              order: { type: 'number' },
            },
            required: ['pipId', 'title', 'displayDescription', 'technicalDescription', 'files', 'order'],
            additionalProperties: false,
          },
        },
      },
      required: ['projectName', 'recommendation', 'proposedPips'],
      additionalProperties: false,
    },
  };
}

function formatReviewPlan(plan) {
  const title = `${plan?.projectName || 'Project'} Review Plan`;
  const pips = getReviewPips(plan);

  if (!pips.length) {
    return "I couldn't generate a plan — please try again";
  }

  const lines = [title, "Here's what I recommend:"];
  pips.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  pips.forEach((pip, idx) => {
    const description = pip.displayDescription || 'No description provided.';
    lines.push(`${idx + 1}. ${pip.title || 'Untitled PIP'} — ${description}`);
  });
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

function extractReviewPlanFromToolUseBlocks(content) {
  const toolUse = Array.isArray(content)
    ? content.find(block => block && block.type === 'tool_use' && block.name === 'propose_review_plan')
    : null;

  if (!toolUse) {
    throw new Error('Review mode did not return a propose_review_plan tool call.');
  }

  return toolUse.input || {};
}

function normalizeReviewPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const queue = [parsed];
  const seen = new Set();
  const preferredKeys = ['proposedPips', 'pips', 'proposed_pips'];
  const wrapperKeys = ['data', 'result', 'response', 'reviewPlan', 'plan', 'payload', 'review_plan'];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);

    if (preferredKeys.some(key => Array.isArray(current[key]))) {
      return current;
    }

    for (const key of wrapperKeys) {
      if (current[key] && typeof current[key] === 'object') {
        queue.push(current[key]);
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        queue.push(value);
      }
    }
  }

  return parsed;
}

function extractProposedPipsArray(raw) {
  const match = String(raw || '').match(/"proposedPips"\s*:\s*(\[[\s\S]*?\])(?=\s*,\s*"(?:projectName|summary|recommendation|pips|proposed_pips)"|\s*}\s*$|\s*$)/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (_) {
    return null;
  }
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

function normalizePipTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(a, b) {
  const left = normalizePipTitle(a);
  const right = normalizePipTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.95;

  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? shared / union : 0;
}

function getProjectPipTitle(sp) {
  return String(sp?.title || sp?.name || sp?.desc || sp?.displayDescription || '').trim();
}

function getProjectSimilarPips(project, title, threshold = 0.6, excludeIds = new Set()) {
  const existingPips = Array.isArray(project?.subProjects) ? project.subProjects : [];
  return existingPips.filter(sp => {
    const spId = String(sp?.id || sp?.pipId || sp?.name || '');
    if (excludeIds.has(spId)) return false;
    return titleSimilarity(title, getProjectPipTitle(sp)) > threshold;
  });
}

function getReviewPlanDuplicates(project, jobs) {
  const existingPips = Array.isArray(project?.subProjects) ? project.subProjects : [];
  const duplicateJobs = [];
  const keptJobs = [];

  jobs.forEach(job => {
    const jobTitle = String(job?.title || '').trim();
    const isDuplicate = existingPips.some(sp => titleSimilarity(jobTitle, getProjectPipTitle(sp)) > 0.6);
    if (isDuplicate) {
      duplicateJobs.push(job);
    } else {
      keptJobs.push(job);
    }
  });

  return { duplicateJobs, keptJobs };
}

function getExtraneousExistingPips(project, jobs) {
  const existingPips = Array.isArray(project?.subProjects) ? project.subProjects : [];
  if (!existingPips.length || !jobs.length) return [];

  return existingPips.filter(sp => {
    const title = getProjectPipTitle(sp);
    if (!title) return false;
    return !jobs.some(job => titleSimilarity(title, job?.title) >= 0.7);
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

async function callDaxThink(problem, context, repo) {
  const { data, error } = await sb.functions.invoke('dax-think', {
    body: { problem, context: context || '', repo: repo || '' },
  });
  if (error) {
    let msg = error.message || 'dax-think failed';
    try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch (_) {}
    throw new Error(msg);
  }
  return data?.solution || '';
}

async function executePip(repo, pip) {
  const { data, error } = await sb.functions.invoke('dax-execute', {
    body: { repo, pip },
  });
  if (error) {
    let msg = error.message || 'dax-execute failed';
    try {
      const body = await error.context?.json?.();
      if (body?.error) msg = body.error;
    } catch (_) {}
    throw new Error(msg);
  }
  return data;
}

async function verifyPip(repo, pip, vercelUrl) {
  const { data, error } = await sb.functions.invoke('dax-verify', {
    body: { repo, pip, vercelUrl: vercelUrl || null },
  });
  if (error) throw new Error(error.message || 'dax-verify failed');
  return data;
}

async function createGithubRepoForProject(proj) {
  const slug = String(proj.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const fullName = `madmyron/${slug}`;
  const desc = String(proj.description || proj.name || '').replace(/"/g, '');
  const job = {
    pipId: `create-repo-${Date.now()}`,
    title: `Create GitHub repo for ${proj.name}`,
    technicalDescription: `Run this exact command and nothing else:\ngh repo create ${fullName} --public --description "${desc}"\nIf the repo already exists, that is fine — just confirm it exists.`,
    files: [],
    tools: 'Bash',
  };
  const res = await fetch('/api/claude-code-trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobs: [job], projectName: proj.name }),
  });
  if (!res.ok) throw new Error(`Repo creation failed: ${res.status}`);
  return fullName;
}

async function startClaudeCodeQueue(plan, project) {
  const jobs = Array.isArray(plan?.jobs) && plan.jobs.length ? plan.jobs.map(job => ({ ...job })) : buildClaudeQueueJobs(plan);
  if (!jobs.length) throw new Error('No proposed PIPs were returned to queue.');
  const repo = getProjectRepo(project);
  if (!repo) throw new Error(`No GitHub repo found for ${project.name}. Add it to the project's Info tab.`);
  const vercelUrl = project?.metadata?.websiteUrl || null;

  const resultJobs = [];
  for (const job of jobs) {
    const execResult = await executePip(repo, job);
    if (!execResult?.success) {
      const failedFiles = (execResult?.results || []).filter(r => !r.success).map(r => r.file).join(', ');
      resultJobs.push({ ...job, status: 'failed', error: failedFiles || 'execution failed' });
      continue;
    }

    // Wait briefly for GitHub to settle before verifying
    await new Promise(r => setTimeout(r, 2000));

    const verifyResult = await verifyPip(repo, job, vercelUrl);
    if (verifyResult?.passed) {
      resultJobs.push({ ...job, status: 'done' });
    } else {
      resultJobs.push({ ...job, status: 'failed', verifyIssues: verifyResult?.issues || [] });
    }
  }

  const done = resultJobs.filter(j => j.status === 'done');
  const failed = resultJobs.filter(j => j.status === 'failed');
  return { jobs: resultJobs, done, failed, status: failed.length ? 'partial' : 'complete' };
}

function parseReviewPlan(reply, project) {
  if (reply && typeof reply === 'object' && !Array.isArray(reply)) {
    const parsed = normalizeReviewPayload(reply);
    const pips = getReviewPips(parsed).map(pip => ({
      ...pip,
      displayDescription: pip.displayDescription || pip.description || pip.reason || '',
      technicalDescription: pip.technicalDescription || pip.description || pip.reason || '',
    }));
    return {
      projectName: parsed?.projectName || project?.name || 'Project',
      summary: parsed?.summary || '',
      recommendation: parsed?.recommendation || '',
      proposedPips: pips,
    };
  }

  let raw = String(reply || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    raw = raw.slice(firstBrace, lastBrace + 1);
  }
  try {
    const parsed = normalizeReviewPayload(JSON.parse(raw));
    const pips = getReviewPips(parsed).map(pip => ({
      ...pip,
      displayDescription: pip.displayDescription || pip.description || pip.reason || '',
      technicalDescription: pip.technicalDescription || pip.description || pip.reason || '',
    }));
    return {
      projectName: parsed?.projectName || project?.name || 'Project',
      summary: parsed?.summary || '',
      recommendation: parsed?.recommendation || '',
      proposedPips: pips,
    };
  } catch (_) {
    const extractedPips = extractProposedPipsArray(raw);
    if (Array.isArray(extractedPips)) {
      return {
        projectName: project?.name || 'Project',
        summary: '',
        recommendation: '',
        proposedPips: extractedPips.map(pip => ({
          ...pip,
          displayDescription: pip.displayDescription || pip.description || pip.reason || '',
          technicalDescription: pip.technicalDescription || pip.description || pip.reason || '',
        })),
      };
    }

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
  daxOrchestration = { pendingReview: null, pendingQueue: null, pendingStalePipDeletion: false, stalePips: [] };
  saveDaxOrchestration();
}

function clearPendingQueue() {
  daxOrchestration = { ...daxOrchestration, pendingQueue: null, pendingStalePipDeletion: false, stalePips: [] };
  saveDaxOrchestration();
}

function stashPendingQueue(queue) {
  daxOrchestration = {
    ...daxOrchestration,
    pendingQueue: queue,
  };
  saveDaxOrchestration();
}

function shouldDeleteStalePipsReply(text) {
  return /^(yes|y|no|n|delete|keep)\b/i.test(String(text || '').trim());
}

function isStaleDeletionReply(text) {
  return shouldDeleteStalePipsReply(text);
}

async function startQueuedClaudeExecution(queuedPlan, project, jobs, startMsgOverride) {
  const projectWithQueuedPips = addQueuedPipsToProject(project, jobs);
  const projectWithRunningPip = jobs.length
    ? applyQueueJobStatuses(projectWithQueuedPips, [{ pipId: jobs[0].pipId, status: 'in progress' }])
    : projectWithQueuedPips;
  projects = projects.map(p => p.id === projectWithRunningPip.id ? projectWithRunningPip : p);
  await saveProject(projectWithRunningPip);
  render();

  const startMsg = startMsgOverride || `Queued ${jobs.length} PIP${jobs.length === 1 ? '' : 's'} for ${project.name}. Starting PIP 1...`;
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

    const done = Array.isArray(result.done) ? result.done : [];
    const failed = Array.isArray(result.failed) ? result.failed : [];

    if (done.length) {
      const doneMsg = `Done: ${done.map(j => j.title).join(', ')} — changes committed to GitHub and verified.`;
      daxAddMsg('dax', 'Dax', doneMsg);
      daxHistory.push({ role: 'assistant', content: doneMsg });
      await saveDaxMessage('assistant', doneMsg);
    }

    if (failed.length) {
      for (const job of failed) {
        const issues = (job.verifyIssues || []).join('; ') || job.error || 'unknown error';
        const failMsg = `"${job.title}" didn't land correctly — ${issues}. Want me to try again?`;
        daxAddMsg('dax', 'Dax', failMsg);
        daxHistory.push({ role: 'assistant', content: failMsg });
        await saveDaxMessage('assistant', failMsg);
      }
      daxOrchestration.pendingReview = { ...queuedPlan, status: 'partial', jobs: finalJobs };
      saveDaxOrchestration();
    } else {
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
}

async function loadDaxHistory() {
  return loadLatestOrNewDaxConversation(daxProjectId, { forceNew: false });
}

async function loadDaxHistoryRowsForScope(projectId = daxProjectId, conversationId = null) {
  try {
    const scopeKey = getDaxScopeKey(projectId);
    let query = sb
      .from(DAX_HISTORY_TABLE)
      .select('role, content, created_at, project_id, conversation_id, conversation_title')
      .order('created_at', { ascending: true })
      .limit(500);
    if (scopeKey === 'global') query = query.is('project_id', null);
    else query = query.eq('project_id', scopeKey);
    if (conversationId) query = query.eq('conversation_id', conversationId);
    const { data, error } = await query;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (e) {
    if (!isMissingDaxHistoryError(e)) {
      console.warn('Could not load Dax history:', e.message);
    }
    return [];
  }
}

async function saveDaxMessage(role, content) {
  try {
    if (!daxConversationId) {
      daxConversationId = createDaxConversationId();
      setStoredDaxConversationId(daxProjectId, daxConversationId);
    }

    if (!daxConversationTitle) {
      daxConversationTitle = getDaxConversationTitle(daxProjectId, daxHistory.concat([{ role, content }]));
    }

    await sb.from(DAX_HISTORY_TABLE).insert({
      role,
      content,
      project_id: daxProjectId == null ? null : String(daxProjectId),
      conversation_id: daxConversationId,
      conversation_title: daxConversationTitle,
    });
    await refreshDaxConversationSummaries(daxProjectId);
  } catch (e) {
    if (!isMissingDaxHistoryError(e)) {
      console.warn('Could not save Dax message:', e.message);
    }
  }
}

function extractDaxBlocks(text, prefix) {
  const results = [];
  const marker = `[${prefix}:`;
  let pos = 0;
  while (pos < text.length) {
    const start = text.indexOf(marker, pos);
    if (start === -1) break;
    const jsonStart = start + marker.length;
    let depth = 0;
    let i = jsonStart;
    let found = false;
    while (i < text.length) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) { found = true; break; }
      }
      i++;
    }
    if (found && text[i + 1] === ']') {
      const jsonStr = text.slice(jsonStart, i + 1);
      try {
        // Sanitize literal newlines/tabs inside JSON string values before parsing
        const sanitized = jsonStr.replace(/[\r\n\t]/g, ' ');
        results.push({ raw: text.slice(start, i + 2), parsed: JSON.parse(sanitized) });
      } catch (_) {}
      pos = i + 2;
    } else {
      pos = start + 1;
    }
  }
  return results;
}

function looksLikeJson(text) {
  const t = (text || '').trim();
  return (t.startsWith('{') || t.startsWith('[')) && (t.includes('"pipId"') || t.includes('"files"') || t.includes('"technicalDescription"'));
}

function isMissingDaxHistoryError(err) {
  const code = err?.code || err?.status || err?.statusCode;
  const message = String(err?.message || err?.details || err || '').toLowerCase();
  return code === '42P01' || (message.includes('dax_history') && (
    message.includes('does not exist') ||
    message.includes('not found') ||
    message.includes('relation "public.dax_history" does not exist') ||
    message.includes('relation does not exist')
  ));
}

function sanitizeDaxMessages(messages) {
  // Anthropic requires strictly alternating user/assistant, starting with user
  const merged = [];
  for (const msg of messages) {
    if (merged.length && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1] = { role: msg.role, content: merged[merged.length - 1].content + '\n' + msg.content };
    } else {
      merged.push({ ...msg });
    }
  }
  // Must start with user
  while (merged.length && merged[0].role !== 'user') merged.shift();
  return merged;
}

async function callDaxChat(messages, context, system) {
  try {
    // Only send what dax-chat actually uses — system is already built with all context baked in
    const payload = {
      messages,
      context: { activeProject: context?.activeProject || null },
      system,
    };
    console.log('dax request payload:', {
      hasActiveProject: !!context?.activeProject,
      activeProjectName: typeof context?.activeProject === 'string' ? context.activeProject : context?.activeProject?.name || null,
      hasPendingReview: !!context?.pendingReview,
      hasCodeContext: !!context?.codeContext,
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
  ensureDaxConversationHeaderControls();
  const history = await loadDaxHistory();
  daxHistory = Array.isArray(history) ? history.filter(m => !looksLikeJson(m.content)).map(m => ({ role: m.role, content: m.content })) : [];

  // Clear the visual box — history is loaded into daxHistory for context but not displayed
  const msgs = document.getElementById('dax-messages');
  if (msgs) msgs.innerHTML = '';

  if (daxHistory.length === 0) {
    const opener = "Hey Michael — I'm Dax. What project or idea is on your mind?";
    daxAddMsg('dax', 'Dax', opener);
    daxHistory.push({ role: 'assistant', content: opener });
    await saveDaxMessage('assistant', opener);
  } else {
    daxAddMsg('dax', 'Dax', "I'm back — I remember where we left off. What do you need?");
  }

  // Auto-clear stale pending reviews — the new EXECUTE flow replaces the old queue system
  if (daxOrchestration?.pendingReview) {
    clearPendingReview();
  }

  // Check for tasks Claude has queued for Dax
  checkDaxInbox();
}

async function checkDaxInbox() {
  try {
    const { data, error } = await sb.from('dax_inbox').select('*').eq('status', 'pending').order('created_at').limit(1);
    if (error || !data || !data.length) return;
    const item = data[0];
    // Mark as processing immediately to prevent double-fire
    await sb.from('dax_inbox').update({ status: 'done' }).eq('id', item.id);
    // Show the task as a user message and send it to Dax
    daxAddMsg('user', 'You', item.task);
    daxHistory.push({ role: 'user', content: item.task });
    await saveDaxMessage('user', item.task);
    await daxSend(item.task);
  } catch (e) {
    console.error('dax inbox check failed:', e);
  }
}

function daxShowExecuteApproval(items) {
  const msgs = document.getElementById('dax-messages');
  if (!msgs) return;

  const listHtml = items.map(({ action, repo }) => `
    <div style="padding:6px 0;border-bottom:1px solid var(--border2,#eee)">
      <div style="font-weight:600;font-size:13px">${esc(action.title || 'Code Change')}</div>
      <div style="font-size:12px;color:var(--text2,#666);margin-top:2px">${esc(action.description || action.technicalDescription || '')}</div>
      ${!repo ? '<div style="color:#b06a10;font-size:11px;margin-top:3px">⚠ No GitHub repo linked — I\'ll create one automatically.</div>' : ''}
    </div>`).join('');

  const card = document.createElement('div');
  card.className = 'dax-msg dax';
  card.innerHTML = `
    <div class="dax-msg-label">Dax — Proposed Changes</div>
    <div class="dax-bubble" style="border:1px solid var(--accent,#6c63ff);padding:12px;border-radius:10px;">
      ${listHtml}
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="dax-approve-btn" style="background:var(--accent,#6c63ff);color:#fff;border:none;border-radius:6px;padding:6px 16px;cursor:pointer;font-size:13px">Approve${items.length > 1 ? ` All (${items.length})` : ''}</button>
        <button class="dax-skip-btn" style="background:transparent;border:1px solid var(--border2,#ccc);border-radius:6px;padding:6px 16px;cursor:pointer;font-size:13px">Skip</button>
      </div>
    </div>`;
  msgs.appendChild(card);
  scrollDaxToBottomDelayed();

  card.querySelector('.dax-skip-btn').addEventListener('click', () => {
    card.remove();
    daxAddMsg('dax', 'Dax', 'Skipped.');
  });

  card.querySelector('.dax-approve-btn').addEventListener('click', async () => {
    card.remove();

    for (const { action, proj } of items) {
      let repo = proj ? getProjectRepo(proj) : null;
      if (!repo && proj) {
        const createMsg = `No GitHub repo linked for ${proj.name} — creating one now...`;
        daxAddMsg('dax', 'Dax', createMsg);
        daxHistory.push({ role: 'assistant', content: createMsg });
        await saveDaxMessage('assistant', createMsg);
        try {
          repo = await createGithubRepoForProject(proj);
          const updatedProj = { ...proj, githubRepo: repo };
          projects = projects.map(p => p.id === proj.id ? updatedProj : p);
          await saveProject(updatedProj);
          const createdMsg = `Created ${repo}. Running: ${action.title}...`;
          daxAddMsg('dax', 'Dax', createdMsg);
          daxHistory.push({ role: 'assistant', content: createdMsg });
          await saveDaxMessage('assistant', createdMsg);
        } catch (repoErr) {
          const errMsg = `Couldn't create repo for ${proj.name}: ${repoErr.message}`;
          daxAddMsg('dax', 'Dax', errMsg);
          daxHistory.push({ role: 'assistant', content: errMsg });
          await saveDaxMessage('assistant', errMsg);
          continue;
        }
      } else if (!repo) {
        const msg = `Can't run "${action.title}" — no project found for ${action.projectName}.`;
        daxAddMsg('dax', 'Dax', msg);
        daxHistory.push({ role: 'assistant', content: msg });
        await saveDaxMessage('assistant', msg);
        continue;
      }

      const runMsg = `Running: ${action.title}...`;
      daxAddMsg('dax', 'Dax', runMsg);
      daxHistory.push({ role: 'assistant', content: runMsg });
      await saveDaxMessage('assistant', runMsg);

      try {
        const pip = {
          pipId: `dax-${Date.now()}`,
          title: action.title,
          displayDescription: action.description || action.title,
          technicalDescription: action.technicalDescription || action.description || action.title,
          files: Array.isArray(action.files) ? action.files : [],
        };
        const execResult = await executePip(repo, pip);
        if (!execResult?.success) {
          const failed = (execResult?.results || []).filter(r => !r.success).map(r => r.error || r.file).join(', ');
          throw new Error(failed || 'execution failed');
        }

        await new Promise(r => setTimeout(r, 2000));
        const vercelUrl = proj?.websiteUrl || null;
        const verifyResult = await verifyPip(repo, pip, vercelUrl);

        const resultMsg = verifyResult?.passed
          ? `Done — "${action.title}" is in and verified.`
          : `"${action.title}" was committed but verification found issues: ${(verifyResult?.issues || []).join('; ')}. Want me to try again?`;
        daxAddMsg('dax', 'Dax', resultMsg);
        daxHistory.push({ role: 'assistant', content: resultMsg });
        await saveDaxMessage('assistant', resultMsg);
      } catch (err) {
        const rawErr = err instanceof Error ? err.message : String(err);
        const cleanErr = rawErr.startsWith('<') || rawErr.length > 200 ? rawErr.slice(0, 120).replace(/<[^>]+>/g, '').trim() + '...' : rawErr;
        const errMsg = `Failed to run "${action.title}": ${cleanErr}`;
        daxAddMsg('dax', 'Dax', errMsg);
        daxHistory.push({ role: 'assistant', content: errMsg });
        await saveDaxMessage('assistant', errMsg);
      }
    }
  });
}

function daxAddMsg(role, label, text, opts = {}) {
  const msgs = document.getElementById('dax-messages');
  const empty = document.getElementById('dax-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = `dax-msg ${role}`;
  const copyBtn = role === 'dax'
    ? `<button class="dax-copy-btn" title="Copy" onclick="navigator.clipboard.writeText(this.closest('.dax-msg').querySelector('.dax-bubble').innerText).then(()=>{this.textContent='✓';setTimeout(()=>this.textContent='⎘',1200)})">⎘</button>`
    : '';
  div.innerHTML = `<div class="dax-msg-label">${label}${copyBtn}</div><div class="dax-bubble">${esc(text).replace(/\n/g, '<br>')}</div>`;
  msgs.appendChild(div);
  if (!opts.silent) scrollDaxToBottomDelayed();
}

function daxShowTyping() {
  const msgs = document.getElementById('dax-messages');
  document.getElementById('dax-typing-indicator')?.remove();
  const div = document.createElement('div');
  div.className = 'dax-msg dax';
  div.id = 'dax-typing-indicator';
  div.innerHTML = '<div class="dax-msg-label">Dax</div><div class="dax-typing"><span></span><span></span><span></span></div>';
  msgs.appendChild(div);
  scrollDaxToBottomDelayed();
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

  const reviewProject = { name: project.name };
  console.log('review project data:', reviewProject);
  const repo = getProjectRepo(project);
  const codeContext = repo ? await fetchProjectCode(repo) : null;
  const context = buildDaxContext(reviewProject, codeContext);
  const system = buildReviewSystem(reviewProject, codeContext);
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
    const apiKey = getDaxAnthropicKey() || promptDaxAnthropicKey();
    if (!apiKey) {
      daxRemoveTyping();
      daxTyping = false;
      const msg = 'Anthropic API key is required for review mode.';
      daxAddMsg('dax', 'Dax', msg);
      daxHistory.push({ role: 'assistant', content: msg });
      await saveDaxMessage('assistant', msg);
      return;
    }

    const reviewPayload = buildReviewAnthropicPayload(reviewProject, messages, codeContext);
    console.log('review anthropic payload:', reviewPayload);

    const res = await fetch(DAX_ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(reviewPayload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Anthropic review request failed (${res.status})`);
    }

    console.log('raw anthropic review response:', data);
    const reply = extractReviewPlanFromToolUseBlocks(data.content);
    daxRemoveTyping();
    daxTyping = false;

    console.log('Dax review raw response:', data);

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

    const { duplicateJobs, keptJobs } = getReviewPlanDuplicates(project, jobs);

    // Auto-remove done PIPs and extraneous PIPs silently — no asking
    const donePipStages = ['done', 'complete', 'completed'];
    const donePips = (project.subProjects || []).filter(sp => donePipStages.includes(String(sp.stage || '').toLowerCase()));
    const extraneousExisting = getExtraneousExistingPips(project, jobs).filter(sp => !donePipStages.includes(String(sp.stage || '').toLowerCase()));

    if (donePips.length || extraneousExisting.length) {
      const toRemoveIds = new Set([...donePips, ...extraneousExisting].map(sp => sp.id || sp.pipId));
      const updatedProject = { ...project, subProjects: (project.subProjects || []).filter(sp => !toRemoveIds.has(sp.id || sp.pipId)) };
      projects = projects.map(p => p.id === project.id ? updatedProject : p);
      await saveProject(updatedProject);
      render();
      const removed = [...donePips, ...extraneousExisting].map(sp => getProjectPipTitle(sp)).filter(Boolean);
      const cleanMsg = `Cleaned up ${removed.length} PIP${removed.length === 1 ? '' : 's'} (${removed.join(', ')}).`;
      daxAddMsg('dax', 'Dax', cleanMsg);
      daxHistory.push({ role: 'assistant', content: cleanMsg });
      await saveDaxMessage('assistant', cleanMsg);
    }

    if (duplicateJobs.length) {
      const msg = `Skipped ${duplicateJobs.length} duplicate${duplicateJobs.length === 1 ? '' : 's'}: ${duplicateJobs.map(j => j.title).join(', ')}.`;
      daxAddMsg('dax', 'Dax', msg);
      daxHistory.push({ role: 'assistant', content: msg });
      await saveDaxMessage('assistant', msg);
    }

    if (!keptJobs.length) {
      const msg = duplicateJobs.length
        ? `I skipped the duplicate PIPs, and there aren't any new ones left to run for ${project.name}.`
        : `There aren't any queued PIPs to run for ${project.name}.`;
      daxAddMsg('dax', 'Dax', msg);
      daxHistory.push({ role: 'assistant', content: msg });
      await saveDaxMessage('assistant', msg);
      return;
    }

    const queuedPlan = {
      ...pending,
      status: 'queued',
      approvedAt: new Date().toISOString(),
      jobs: keptJobs,
    };
    daxOrchestration.pendingReview = queuedPlan;
    saveDaxOrchestration();
    await startQueuedClaudeExecution(
      queuedPlan,
      project,
      keptJobs,
      `Queued ${keptJobs.length} PIP${keptJobs.length === 1 ? '' : 's'} for ${project.name}. Starting PIP 1...`
    );
    return;
  }

  daxTyping = true;
  daxShowTyping();

  try {
    const activeProject = daxProjectId ? projects.find(p => p.id === daxProjectId) : null;
    const mentionProject = findProjectMentionInText(text);
    const codeProject = mentionProject || activeProject;
    const repo = codeProject ? getProjectRepo(codeProject) : null;
    const codeContext = (repo && shouldFetchCodeContext(text, codeProject)) ? await fetchProjectCode(repo) : null;
    const context = buildDaxContext(activeProject, codeContext);
    const system = buildNormalDaxSystem(activeProject, codeContext);
    const reply = await callDaxChat(sanitizeDaxMessages(daxHistory.slice(-30)), context, system);
    daxRemoveTyping();
    daxTyping = false;

    if (reply) {
      const executeMatches = extractDaxBlocks(reply, 'EXECUTE');
      const pipMatches = extractDaxBlocks(reply, 'PIP');
      const movePipMatches = extractDaxBlocks(reply, 'MOVE_PIP');
      const writePlanMatches = extractDaxBlocks(reply, 'WRITE_PLAN');
      const thinkMatches = extractDaxBlocks(reply, 'THINK');
      let cleanText = reply;
      [...executeMatches, ...pipMatches, ...movePipMatches, ...writePlanMatches, ...thinkMatches].forEach(m => { cleanText = cleanText.replace(m.raw, ''); });
      cleanText = cleanText.trim();

      // Handle THINK blocks — Dax is asking me for technical guidance, resolve silently then re-send
      if (thinkMatches.length > 0) {
        for (const match of thinkMatches) {
          const { problem, context: thinkCtx } = match.parsed;
          try {
            daxShowTyping();
            const solution = await callDaxThink(problem, thinkCtx, repo);
            daxRemoveTyping();
            const injected = `Claude's guidance: ${solution}`;
            daxHistory.push({ role: 'user', content: injected });
            // Re-call Dax with the guidance injected — it will continue from here
            const followUp = await callDaxChat(sanitizeDaxMessages(daxHistory.slice(-30)), context, system);
            daxRemoveTyping();
            if (followUp) {
              const cleanFollowUp = followUp
                .replace(/\[THINK:[^\]]*\]/g, '')
                .trim();
              if (cleanFollowUp) {
                daxAddMsg('dax', 'Dax', cleanFollowUp);
                daxHistory.push({ role: 'assistant', content: cleanFollowUp });
                await saveDaxMessage('assistant', cleanFollowUp);
              }
              // Process any EXECUTE blocks in the follow-up
              const followExec = extractDaxBlocks(followUp, 'EXECUTE');
              if (followExec.length > 0) {
                const actions = followExec.map(m => {
                  const action = m.parsed;
                  const proj = projects.find(p => String(p.name).toLowerCase().includes(String(action.projectName || '').toLowerCase()));
                  return { action, proj, repo: proj ? getProjectRepo(proj) : null };
                });
                daxShowExecuteApproval(actions);
              }
            }
          } catch (err) {
            daxRemoveTyping();
            console.warn('dax-think error:', err);
          }
        }
        return; // THINK blocks handled above, skip normal flow
      }

      if (cleanText) {
        daxAddMsg('dax', 'Dax', cleanText);
        daxHistory.push({ role: 'assistant', content: cleanText });
        await saveDaxMessage('assistant', cleanText);
      }

      // Handle EXECUTE blocks — single approval card for the whole batch
      if (executeMatches.length > 0) {
        const actions = executeMatches.map(m => {
          const action = m.parsed;
          const proj = projects.find(p => String(p.name).toLowerCase().includes(String(action.projectName || '').toLowerCase()));
          const repo = proj ? getProjectRepo(proj) : null;
          return { action, proj, repo };
        });
        daxShowExecuteApproval(actions);
      }

      // Handle PIP card creation blocks
      let createdPipCount = 0;
      for (const match of pipMatches) {
        try {
          const action = match.parsed;
          const proj = projects.find(p => p.name.toLowerCase().includes((action.projectName || '').toLowerCase()));
          if (proj) {
            const firstStage = proj.subStages[0]?.id || 'ss1';
            const newPip = mkSubP(action.pipName, action.pipDesc || '', firstStage);
            projects = projects.map(p => p.id === proj.id ? { ...p, subProjects: [...p.subProjects, newPip] } : p);
            const updated = projects.find(x => x.id === proj.id);
            if (updated) await saveProject(updated);
            render();
            createdPipCount += 1;
            daxAddMsg('dax', 'Dax', `PIP created: ${action.pipName} in ${proj.name}`);
          }
        } catch (e) {
          console.warn('Dax pip error:', e);
        }
      }

      // Handle MOVE_PIP blocks — actually update the PIP stage
      for (const match of movePipMatches) {
        try {
          const action = match.parsed;
          const proj = projects.find(p => String(p.name).toLowerCase().includes(String(action.projectName || '').toLowerCase()));
          if (!proj) { daxAddMsg('dax', 'Dax', `Couldn't find project "${action.projectName}" to move PIP.`); continue; }
          const pipNameLower = String(action.pipName || '').toLowerCase();
          let pip = (proj.subProjects || []).find(sp => String(sp.name || '').toLowerCase().includes(pipNameLower));
          const validStages = ['idea', 'todo', 'inprogress', 'done'];
          const newStage = validStages.includes(action.stage) ? action.stage : 'inprogress';
          let updatedProj;
          if (!pip) {
            pip = mkSubP(action.pipName, '', newStage);
            updatedProj = { ...proj, subProjects: [...(proj.subProjects || []), pip] };
          } else {
            const updatedPip = { ...pip, stage: newStage };
            updatedProj = { ...proj, subProjects: proj.subProjects.map(sp => sp.id === pip.id ? updatedPip : sp) };
          }
          projects = projects.map(p => p.id === proj.id ? updatedProj : p);
          await saveProject(updatedProj);
          render();
          const stageLabel = pipSf(newStage).label;
          const moveMsg = `Moved "${pip.name}" to ${stageLabel} in ${proj.name}.`;
          daxAddMsg('dax', 'Dax', moveMsg);
          daxHistory.push({ role: 'assistant', content: moveMsg });
          await saveDaxMessage('assistant', moveMsg);
        } catch (e) {
          console.warn('Dax MOVE_PIP error:', e, match[1]);
        }
      }

      // Handle WRITE_PLAN blocks
      for (const match of writePlanMatches) {
        try {
          const action = match.parsed;
          const proj = projects.find(p => String(p.name).toLowerCase().includes(String(action.projectName || '').toLowerCase()));
          if (!proj) { daxAddMsg('dax', 'Dax', `Couldn't find project "${action.projectName}" to save plan.`); continue; }
          const updatedProj = { ...proj, plan: String(action.plan || '') };
          projects = projects.map(p => p.id === proj.id ? updatedProj : p);
          await saveProject(updatedProj);
          daxAddMsg('dax', 'Dax', `Plan saved to ${proj.name}.`);
        } catch (e) {
          console.warn('Dax WRITE_PLAN error:', e);
        }
      }

      if (!cleanText && !executeMatches.length && !pipMatches.length && !movePipMatches.length && !writePlanMatches.length) {
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

async function openDax(pid, starterMessage = '') {
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
  const panel = document.getElementById('dax-panel');
  if (panel && typeof panel.scrollIntoView === 'function') {
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
  const inp = document.getElementById('dax-input');
  if (inp) inp.focus();
  ensureDaxConversationHeaderControls();
  await loadLatestOrNewDaxConversation(pid, { forceNew: false });

  // Clear the visual box — history is in daxHistory for context, not displayed
  const msgBox = document.getElementById('dax-messages');
  if (msgBox) msgBox.innerHTML = '';
  daxHistory = daxHistory.filter(m => !looksLikeJson(m.content));
  if (daxHistory.length > 0) {
    const proj = pid ? projects.find(p => p.id === pid) : null;
    daxAddMsg('dax', 'Dax', `I remember our ${proj ? proj.name : ''} conversation — pick up where we left off or ask me something new.`);
  }

  scrollDaxToBottomDelayed();
  const msg = String(starterMessage || '').trim();
  if (msg) {
    console.log('Dax starter message:', msg);
    if (inp) inp.value = msg;
    setTimeout(() => {
      const current = document.getElementById('dax-input');
      if (current) {
        current.value = msg;
        daxSend();
      }
    }, 50);
  }
}

function closeDax() {
  const badge = document.getElementById('dax-project-badge');
  if (badge) badge.style.display = 'none';
  daxProjectId = null;
  daxConversationId = null;
  daxConversationTitle = '';
}

function daxResize(inp) {
  inp.style.height = 'auto';
  inp.style.height = Math.min(inp.scrollHeight, 80) + 'px';
}

function daxKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    daxSend();
  }
  daxResize(e.target);
}

const daxOverlay = document.getElementById('dax-overlay');
if (daxOverlay) daxOverlay.addEventListener('click', function() {});

window.addEventListener('focus', scrollDaxToBottomDelayed);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scrollDaxToBottomDelayed();
});

document.addEventListener('DOMContentLoaded', scrollDaxToBottomDelayed);


