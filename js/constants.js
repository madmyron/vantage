// ── STAGE & COLOR PALETTES ────────────────────────────────────

const STAGES = [
  {id:'idea',       label:'Idea',        pct:0,   sf:'#777770', sc:'rgba(120,120,110,.12)'},
  {id:'convo',      label:'Conversation',pct:14,  sf:'#5b4de0', sc:'rgba(91,77,224,.12)'},
  {id:'plan',       label:'Plan',        pct:28,  sf:'#1a6abf', sc:'rgba(26,106,191,.12)'},
  {id:'evaluate',   label:'Evaluate',    pct:43,  sf:'#b06a10', sc:'rgba(176,106,16,.12)'},
  {id:'initiate',   label:'Initiate',    pct:57,  sf:'#c04420', sc:'rgba(192,68,32,.12)'},
  {id:'inprogress', label:'In progress', pct:71,  sf:'#a01860', sc:'rgba(160,24,96,.12)'},
  {id:'complete',   label:'Complete',    pct:86,  sf:'#1a7a30', sc:'rgba(26,122,48,.12)'},
  {id:'goal',       label:'Goal ★',      pct:100, sf:'#0a6040', sc:'rgba(10,96,64,.12)'},
];

const PC = [
  {bg:'#c8c0f8', bd:'#8070e0', tx:'#1e1060', bar:'#4830c0'},
  {bg:'#f8b8b0', bd:'#e06050', tx:'#6a1008', bar:'#c03020'},
  {bg:'#a8d4f8', bd:'#3a80d0', tx:'#08306a', bar:'#1a60b8'},
  {bg:'#f8b0d8', bd:'#d040a0', tx:'#6a0838', bar:'#b02080'},
  {bg:'#f8d898', bd:'#d08020', tx:'#6a3800', bar:'#b06010'},
  {bg:'#98e8b8', bd:'#20a850', tx:'#004820', bar:'#108040'},
  {bg:'#88e8d0', bd:'#10a880', tx:'#003828', bar:'#088060'},
  {bg:'#e8e068', bd:'#a8a010', tx:'#484800', bar:'#888000'},
];

const SUB_COLORS = [
  {bg:'#c8c0f8', bd:'#8070e0', tx:'#1e1060'},
  {bg:'#a8d4f8', bd:'#3a80d0', tx:'#08306a'},
  {bg:'#f8d898', bd:'#d08020', tx:'#6a3800'},
  {bg:'#88e8d0', bd:'#10a880', tx:'#003828'},
  {bg:'#f8b8b0', bd:'#e06050', tx:'#6a1008'},
  {bg:'#f8b0d8', bd:'#d040a0', tx:'#6a0838'},
  {bg:'#98e8b8', bd:'#20a850', tx:'#004820'},
  {bg:'#e8e068', bd:'#a8a010', tx:'#484800'},
];

const AC = [
  {bg:'#c8c0f8', tc:'#1e1060'}, {bg:'#a8d4f8', tc:'#08306a'},
  {bg:'#88e8d0', tc:'#003828'}, {bg:'#f8d898', tc:'#6a3800'},
  {bg:'#f8b0d8', tc:'#6a0838'}, {bg:'#f8b8b0', tc:'#6a1008'},
];

const CTOPICS       = ['Goal','Ideas','Financing','Marketing','Team','Timeline','Risks','Action items'];
const CONTACT_TYPES = ['team','investor','partner','client','vendor','press'];
const FIN_TYPES     = ['revenue','expense','investment','grant'];
const PIP_USERS     = ['Dax'];

let amap = {}, aidx = 0;

function ac(n) {
  if (!amap[n]) { amap[n] = AC[aidx % AC.length]; aidx++; }
  return amap[n];
}

function ini(n) {
  return String(n || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function sf(id)  { return STAGES.find(s => s.id === id) || STAGES[0]; }
function pc(c)   { return PC[c % PC.length]; }

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt$(n) { return '$' + Number(n || 0).toLocaleString(); }

function stamp() {
  const el = document.getElementById('ts');
  if (el) el.textContent = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}

function mkTk(title, status, pri, prefix) {
  const pfx = prefix || 'TK';
  return {id:pfx+'-'+(tkSeq++), title, status:status||'todo', priority:pri||'med', assignee:''};
}

function projPrefix(name) {
  return String(name || '').replace(/[^a-zA-Z0-9 ]/g,'').split(' ').filter(Boolean).map(w => w[0].toUpperCase()).join('').slice(0,3) || 'TK';
}

function mkSubP(name, desc, stageId) {
  return {
    id:'SP-'+(spSeq++),
    name,
    desc:desc||'',
    stage:stageId,
    notes:'',
    assignee:'Dax',
    assigner:'Dax',
    tickets:[],
    _openNote:false,
  };
}
