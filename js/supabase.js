// ── SUPABASE ──────────────────────────────────────────────────

const SUPABASE_URL = 'https://qkjzanjtneiilsgctvxe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFranphbmp0bmVpaWxzZ2N0dnhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTE3NzcsImV4cCI6MjA5MjUyNzc3N30.Qr2TJrRpbtuSE0gBxzIPe5zbgej9ySDd6TDK8jhGOSw';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let cachedLoggedInUserLabel = '';

function setLoading(msg) {
  const el = document.getElementById('loading-screen');
  const ml = document.getElementById('loading-msg');
  if (el) el.style.display = 'flex';
  if (ml && msg) ml.textContent = msg;
}

function hideLoading() {
  const el = document.getElementById('loading-screen');
  if (el) el.style.display = 'none';
}

function projectToRow(p) {
  const meta = {
    githubRepo: p.githubRepo || null,
    websiteUrl: p.websiteUrl || null,
    techStack: p.techStack || null,
    descriptionLong: p.descriptionLong || null,
    revenueModel: p.revenueModel || null,
    targetAudience: p.targetAudience || null,
    startedAt: p.startedAt || null,
    updatedAt: p.updatedAt || null,
    assignee: p.assignee || null,
    assigner: p.assigner || null,
  };
  const convo = {
    ...(p.convo || {}),
    __meta: meta,
  };
  return {
    id:           p.dbId || undefined,
    name:         p.name,
    color:        p.color,
    stage:        p.stage,
    description:  p.desc || '',
    goal:         p.goal || '',
    convo,
    tickets:      p.tickets || [],
    contacts:     p.contacts || [],
    finances:     p.finances || [],
    people:       p.people || [],
    sub_stages:   p.subStages || [],
    sub_projects: p.subProjects || [],
    sort_order:   p.id || 0,
  };
}

function rowToProject(row) {
  const meta = row.convo && row.convo.__meta ? row.convo.__meta : {};
  return {
    id:           row.sort_order || nextId++,
    dbId:         row.id,
    name:         row.name,
    color:        row.color || 0,
    stage:        row.stage || 'idea',
    desc:         row.description || '',
    goal:         row.goal || '',
    githubRepo:   row.github_repo || meta.githubRepo || knownGithubRepoForName(row.name) || '',
    websiteUrl:   meta.websiteUrl || row.website_url || '',
    techStack:    meta.techStack || row.tech_stack || '',
    descriptionLong: meta.descriptionLong || row.description_long || '',
    revenueModel: meta.revenueModel || row.revenue_model || '',
    targetAudience: meta.targetAudience || row.target_audience || '',
    startedAt:    meta.startedAt || row.started_at || '',
    updatedAt:    meta.updatedAt || row.updated_at || '',
    assignee:     meta.assignee || (row.people && row.people[0] && row.people[0].name) || 'Dax',
    assigner:     meta.assigner || 'Dax',
    convo:        row.convo || {Goal:'',Ideas:'',Financing:'',Marketing:'',Team:'',Timeline:'',Risks:'','Action items':''},
    tickets:      (row.tickets || []).map(t => ({...t})),
    contacts:     row.contacts || [],
    finances:     row.finances || [],
    people:       row.people || [],
    subStages:    (row.sub_stages && row.sub_stages.length > 0) ? row.sub_stages : [{id:'ss1',label:'Idea'},{id:'ss2',label:'In progress'},{id:'ss3',label:'Done'}],
    subProjects:  (row.sub_projects || []).map(sp => ({
      ...sp,
      assignee: sp.assignee || 'Dax',
      assigner: sp.assigner || 'Dax',
      _openNote:false,
    })),
    openSubBoard: false,
    openTab:      null,
  };
}

async function getLoggedInUserLabel() {
  if (cachedLoggedInUserLabel) return cachedLoggedInUserLabel;
  try {
    const { data } = await sb.auth.getUser();
    const user = data?.user;
    const label = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || user?.id || '';
    cachedLoggedInUserLabel = String(label || '').trim() || 'Dax';
    return cachedLoggedInUserLabel;
  } catch (err) {
    console.warn('Could not load logged-in user label:', err);
    cachedLoggedInUserLabel = 'Dax';
    return cachedLoggedInUserLabel;
  }
}

async function loadProjects() {
  setLoading('Loading your projects...');
  const {data, error} = await sb.from('projects').select('*').order('sort_order', {ascending:true});
  if (error) { console.error('Load error:', error); hideLoading(); render(); return; }
  if (data && data.length > 0) {
    projects = data.map(rowToProject).map(applyKnownGithubRepo);
    nextId = Math.max(...projects.map(p => p.id)) + 1;
  }
  hideLoading();
  render();
}

async function saveProject(p) {
  const now = new Date().toISOString();
  const assigner = p.assigner || await getLoggedInUserLabel();
  const project = {
    ...p,
    startedAt: p.startedAt || now,
    updatedAt: now,
    assignee: p.assignee || (p.people && p.people[0] && p.people[0].name) || 'Dax',
    assigner,
  };
  projects = projects.map(x => x.id === p.id ? {...x, startedAt: project.startedAt, updatedAt: project.updatedAt, assignee: project.assignee, assigner: project.assigner, websiteUrl: project.websiteUrl || '', techStack: project.techStack || '', descriptionLong: project.descriptionLong || '', revenueModel: project.revenueModel || '', targetAudience: project.targetAudience || ''} : x);
  const row = projectToRow(project);
  if (p.dbId) {
    const {error} = await sb.from('projects').update(row).eq('id', p.dbId);
    if (error) console.error('Save error:', error);
  } else {
    const {data, error} = await sb.from('projects').insert(row).select().single();
    if (error) { console.error('Insert error:', error); return; }
    if (data) {
      projects = projects.map(x => x.id === p.id ? {...x, dbId:data.id, startedAt: project.startedAt, updatedAt: project.updatedAt, assignee: project.assignee, assigner: project.assigner, websiteUrl: project.websiteUrl || '', techStack: project.techStack || '', descriptionLong: project.descriptionLong || '', revenueModel: project.revenueModel || '', targetAudience: project.targetAudience || ''} : x);
    }
  }
}

async function deleteProjectDB(dbId) {
  if (!dbId) return;
  const {error} = await sb.from('projects').delete().eq('id', dbId);
  if (error) console.error('Delete error:', error);
}
