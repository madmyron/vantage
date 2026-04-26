// ── SUPABASE ──────────────────────────────────────────────────

const SUPABASE_URL = 'https://qkjzanjtneiilsgctvxe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFranphbmp0bmVpaWxzZ2N0dnhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTE3NzcsImV4cCI6MjA5MjUyNzc3N30.Qr2TJrRpbtuSE0gBxzIPe5zbgej9ySDd6TDK8jhGOSw';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
  return {
    id:           p.dbId || undefined,
    name:         p.name,
    color:        p.color,
    stage:        p.stage,
    description:  p.desc || '',
    goal:         p.goal || '',
    convo:        p.convo || {},
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
  return {
    id:           row.sort_order || nextId++,
    dbId:         row.id,
    name:         row.name,
    color:        row.color || 0,
    stage:        row.stage || 'idea',
    desc:         row.description || '',
    goal:         row.goal || '',
    convo:        row.convo || {Goal:'',Ideas:'',Financing:'',Marketing:'',Team:'',Timeline:'',Risks:'','Action items':''},
    tickets:      (row.tickets || []).map(t => ({...t})),
    contacts:     row.contacts || [],
    finances:     row.finances || [],
    people:       row.people || [],
    subStages:    (row.sub_stages && row.sub_stages.length > 0) ? row.sub_stages : [{id:'ss1',label:'Idea'},{id:'ss2',label:'In progress'},{id:'ss3',label:'Done'}],
    subProjects:  (row.sub_projects || []).map(sp => ({...sp, _openNote:false, _openTickets:false})),
    openSubBoard: false,
    openTab:      null,
  };
}

async function loadProjects() {
  setLoading('Loading your projects...');
  const {data, error} = await sb.from('projects').select('*').order('sort_order', {ascending:true});
  if (error) { console.error('Load error:', error); hideLoading(); render(); return; }
  if (data && data.length > 0) {
    projects = data.map(rowToProject);
    nextId = Math.max(...projects.map(p => p.id)) + 1;
  }
  hideLoading();
  render();
}

async function saveProject(p) {
  const row = projectToRow(p);
  if (p.dbId) {
    const {error} = await sb.from('projects').update(row).eq('id', p.dbId);
    if (error) console.error('Save error:', error);
  } else {
    const {data, error} = await sb.from('projects').insert(row).select().single();
    if (error) { console.error('Insert error:', error); return; }
    if (data) {
      projects = projects.map(x => x.id === p.id ? {...x, dbId:data.id} : x);
    }
  }
}

async function deleteProjectDB(dbId) {
  if (!dbId) return;
  const {error} = await sb.from('projects').delete().eq('id', dbId);
  if (error) console.error('Delete error:', error);
}
