// DAX AI ADVISOR v3

let daxProjectId = null;
let daxTyping = false;
let daxHistory = [];
const DAX_ORCHESTRATION_KEY = 'vantage_dax_orchestration';
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
  if (/\b(how complete|what does|what is built|what's built|what is missing|what's missing|stubbed|implemented|auth system|code base|codebase|architecture|repo|tree)\b/.test(query)) {
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
    pendingReview: daxOrchestration?.pendingReview || null,
    pendingQueue: daxOrchestration?.pendingQueue || null,
    pendingStalePipDeletion: Boolean(daxOrchestration?.pendingStalePipDeletion),
    stalePips: Array.isArray(daxOrchestration?.stalePips) ? daxOrchestration.stalePips : [],
    codeContext: codeContext || null,
  };
}

function buildNormalDaxSystem(project, codeContext) {
  const projectName = project ? project.name : 'the current portfolio';
  const codeContextBlock = codeContext ? `\n\nGitHub code context:\n${JSON.stringify(codeContext, null, 2)}\n\nWhen code context is provided, use it to give an honest technical assessment. Identify what is actually implemented vs stubbed. Estimate real completion percentage based on the code itself, not what the user says. Be direct and specific about what works and what doesn't.` : '';
  return `You are Dax, the built-in AI advisor for Vantage, an entrepreneurial operating system.

Be direct, curious, and concise. Ask one pointed question at a time. Push the founder toward clarity.
Use the provided context to avoid asking for things already known.
Do not guess about code if code context is available. Use it to answer honestly about completion percentage, built vs stubbed, and what is missing.

If the user asks you to create PIPs, append one JSON block per PIP at the very end using this exact format:
[PIP:{"projectName":"exact project name","pipName":"pip name","pipDesc":"one-line description"}]

Current focus: ${projectName}${codeContextBlock}`;
}

function buildReviewSystem(project, codeContext) {
  const fullProjectContext = project ? project.name : 'null';
  const codeContextBlock = codeContext ? `\n\nGitHub code context:\n${JSON.stringify(codeContext, null, 2)}\n\nUse this code context to judge what is actually built, what looks stubbed, what is missing, and to estimate completion percentage honestly.` : '';

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
    const payload = { messages, context, codeContext: context?.codeContext || null, system };
    console.log('dax request payload:', {
      hasActiveProject: !!context?.activeProject,
      activeProjectName: context?.activeProject?.name || null,
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
  const history = await loadDaxHistory();
  daxHistory = history.map(m => ({ role: m.role, content: m.content }));

  if (history.length === 0) {
    const opener = "Hey Michael - I'm Dax, your AI advisor. What project or idea is on your mind right now?";
    daxAddMsg('dax', 'Dax', opener);
    daxHistory.push({ role: 'assistant', content: opener });
    await saveDaxMessage('assistant', opener);
  } else {
    history.forEach(m => daxAddMsg(m.role === 'assistant' ? 'dax' : 'user', m.role === 'assistant' ? 'Dax' : 'You', m.content));
    scrollDaxToBottomDelayed();
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
  scrollDaxToBottomDelayed();
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

  console.log('review project data:', project);
  const repo = getProjectRepo(project);
  const codeContext = repo ? await fetchProjectCode(repo) : null;
  const context = buildDaxContext(project, codeContext);
  const system = buildReviewSystem(project, codeContext);
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

    const reviewPayload = buildReviewAnthropicPayload(project, messages, codeContext);
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

  if (daxOrchestration?.pendingQueue) {
    if (daxOrchestration?.pendingStalePipDeletion) {
      if (isStaleDeletionReply(text)) {
        const pendingQueue = daxOrchestration.pendingQueue;
        const project = projects.find(p => p.id === pendingQueue.projectId) || findProjectByName(pendingQueue.projectName);
        if (!project) {
          const msg = `I couldn't find the project for the queued review plan.`;
          daxAddMsg('dax', 'Dax', msg);
          daxHistory.push({ role: 'assistant', content: msg });
          await saveDaxMessage('assistant', msg);
          clearPendingQueue();
          return;
        }

        const queuedPlan = {
          ...pendingQueue.pending,
          status: 'queued',
          approvedAt: new Date().toISOString(),
          jobs: pendingQueue.jobs,
        };
        daxOrchestration.pendingReview = queuedPlan;
        daxOrchestration.pendingStalePipDeletion = false;
        daxOrchestration.stalePips = [];
        saveDaxOrchestration();
        await startQueuedClaudeExecution(
          queuedPlan,
          project,
          pendingQueue.jobs,
          `Queued ${pendingQueue.jobs.length} PIP${pendingQueue.jobs.length === 1 ? '' : 's'} for ${project.name}. Starting PIP 1...`
        );
        return;
      }

      const msg = 'Please answer yes or no so I can continue the review plan.';
      daxAddMsg('dax', 'Dax', msg);
      daxHistory.push({ role: 'assistant', content: msg });
      await saveDaxMessage('assistant', msg);
      return;
    }

    if (shouldDeleteStalePipsReply(text)) {
      const pendingQueue = daxOrchestration.pendingQueue;
      const project = projects.find(p => p.id === pendingQueue.projectId) || findProjectByName(pendingQueue.projectName);
      if (!project) {
        const msg = `I couldn't find the project for the queued review plan.`;
        daxAddMsg('dax', 'Dax', msg);
        daxHistory.push({ role: 'assistant', content: msg });
        await saveDaxMessage('assistant', msg);
        clearPendingQueue();
        return;
      }

    }
  }

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
    const extraneousExisting = getExtraneousExistingPips(project, jobs);

    for (const duplicate of duplicateJobs) {
      const msg = `Skipped duplicate: ${duplicate.title}`;
      daxAddMsg('dax', 'Dax', msg);
      daxHistory.push({ role: 'assistant', content: msg });
      await saveDaxMessage('assistant', msg);
    }

    if (extraneousExisting.length) {
      const names = extraneousExisting
        .map(sp => getProjectPipTitle(sp))
        .filter(Boolean)
        .join(', ');
      const msg = `These existing PIPs may no longer be needed: ${names}. Should I delete them?`;
      daxAddMsg('dax', 'Dax', msg);
      daxHistory.push({ role: 'assistant', content: msg });
      await saveDaxMessage('assistant', msg);
      daxOrchestration = {
        ...daxOrchestration,
        pendingStalePipDeletion: true,
        stalePips: extraneousExisting.map(sp => ({
          id: sp.id || sp.pipId || sp.name || '',
          title: getProjectPipTitle(sp),
        })),
        pendingQueue: {
          pending,
          projectId: project.id,
          projectName: project.name,
          jobs: keptJobs,
          duplicateJobs,
          extraneousExisting: extraneousExisting.map(sp => ({
            id: sp.id || sp.pipId || sp.name || '',
            title: getProjectPipTitle(sp),
          })),
          status: 'waiting-on-deletion',
        },
      };
      saveDaxOrchestration();
      return;
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
    const reply = await callDaxChat(daxHistory.slice(-30), context, system);
    daxRemoveTyping();
    daxTyping = false;

    if (reply) {
      const actionMatches = [...reply.matchAll(/\[PIP:(.*?)\]/gs)];
      const cleanText = reply.replace(/\[PIP:.*?\]/gs, '').trim();
      let createdPipCount = 0;
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
            createdPipCount += 1;
            daxAddMsg('dax', 'Dax', `✓ ${createdPipCount}. ${action.pipName} created in ${proj.name}`);
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

function openDax(pid, starterMessage = '') {
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

window.addEventListener('focus', scrollDaxToBottomDelayed);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scrollDaxToBottomDelayed();
});

document.addEventListener('DOMContentLoaded', scrollDaxToBottomDelayed);


