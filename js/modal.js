// ── PROJECT MODAL ─────────────────────────────────────────────

let modalProjectId = null;
let modalTab = 'tickets';

function openProjModal(pid) {
  modalProjectId = pid;
  modalTab = 'tickets';
  document.getElementById('proj-modal-overlay').classList.add('open');
  renderProjModal();
}

function closeProjModal() {
  document.getElementById('proj-modal-overlay').classList.remove('open');
  modalProjectId = null;
}

document.getElementById('proj-modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeProjModal();
});

function renderProjModal() {
  const p = projects.find(x => x.id === modalProjectId);
  if (!p) return;
  const c = pc(p.color);
  const st = sf(p.stage);
  const TABS = ['tickets','convo','contacts','finances','info'];
  const tabHTML = TABS.map(t =>
    `<button class="proj-modal-tab${modalTab===t?' on':''}" onclick="switchModalTab('${t}')">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`
  ).join('');

  document.getElementById('proj-modal-header').innerHTML = `
    <div class="proj-modal-top">
      <div>
        <div class="proj-modal-title" style="color:${c.tx}">${esc(p.name)}</div>
        <div class="proj-modal-desc">${esc(p.desc||'')}</div>
      </div>
      <button class="proj-modal-close" onclick="closeProjModal()">×</button>
    </div>
    <div class="proj-modal-tabs">${tabHTML}</div>`;

  document.getElementById('proj-modal-footer').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <span class="stage-badge" style="background:${st.sc};color:${st.sf};border:1px solid ${st.sf}44">${st.label}</span>
      <div class="move-wrap">
        <button class="btn" style="font-size:11px;padding:4px 10px" onclick="toggleMove(event,${p.id})">Move ▾</button>
        <div class="move-dd" id="mv-${p.id}">
          ${STAGES.filter(s => s.id !== p.stage).map(s =>
            `<div class="move-opt" onclick="moveProjFromModal(${p.id},'${s.id}')"><span class="mdot" style="background:${s.sf}"></span>${s.label}</div>`
          ).join('')}
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn" style="color:#3d2fa8;border-color:rgba(91,77,224,.4);font-weight:600" onclick="openDax(${p.id})">✦ Dax</button>
      <button class="btn" onclick="closeProjModal();toggleSubBoard(${p.id})">⊞ Board</button>
      <button class="btn" style="color:var(--red);border-color:rgba(192,48,48,.3)" onclick="deleteProject(${p.id});closeProjModal()">Delete</button>
    </div>`;

  renderModalBody(p);
}

function moveProjFromModal(id, stage) {
  moveProj(id, stage);
  setTimeout(() => {
    const p = projects.find(x => x.id === id);
    if (p) renderProjModal();
  }, 50);
}

function switchModalTab(tab) {
  modalTab = tab;
  renderProjModal();
}

// ── MODAL BODY TABS ───────────────────────────────────────────

function renderModalBody(p) {
  const body = document.getElementById('proj-modal-body');

  if (modalTab === 'tickets') {
    const cols = ['todo','inprogress','done'];
    const cL = {todo:'To do', inprogress:'In progress', done:'Done'};
    const stats = cols.map(s => p.tickets.filter(t => t.status === s).length);
    const board = cols.map(status => {
      const tks = p.tickets.filter(t => t.status === status);
      const tkHTML = tks.map(t => {
        const ri = p.tickets.indexOf(t);
        const canL = status !== 'todo', canR = status !== 'done';
        const lS = status === 'inprogress' ? 'todo' : 'inprogress';
        const rS = status === 'todo' ? 'inprogress' : 'done';
        return `<div class="ticket">
          <div class="tk-id">${esc(t.id)}</div>
          <div class="tk-title">${esc(t.title)}</div>
          <div class="tk-meta"><span class="tk-pri pri-${t.priority}">${t.priority}</span></div>
          <div class="tk-move-btns">
            ${canL ? `<button class="tk-mbtn" onclick="moveTkModal(${p.id},${ri},'${lS}')">← ${cL[lS]}</button>` : ''}
            ${canR ? `<button class="tk-mbtn" onclick="moveTkModal(${p.id},${ri},'${rS}')">→ ${cL[rS]}</button>` : ''}
            <button class="tk-mbtn" style="color:var(--red)" onclick="rmTkModal(${p.id},${ri})">×</button>
          </div>
        </div>`;
      }).join('') || `<div style="font-size:11px;color:var(--text3);padding:6px 0">Empty</div>`;
      return `<div class="tk-col">
        <div class="tk-col-head">${cL[status]}<span style="font-weight:400;color:var(--text3);font-family:var(--mono);text-transform:none;letter-spacing:0">${tks.length}</span></div>
        ${tkHTML}
        ${status === 'todo' ? `<div class="add-tk"><div class="add-tk-row"><input id="mtki-${p.id}" placeholder="New ticket..." onkeydown="if(event.key==='Enter')addTkModal(${p.id})"/><select id="mtkp-${p.id}"><option value="high">High</option><option value="med" selected>Med</option><option value="low">Low</option></select></div><button onclick="addTkModal(${p.id})">+ Add</button></div>` : ''}
      </div>`;
    }).join('');
    body.innerHTML = `<div class="tk-stats">${cols.map((s,i)=>`<div class="tk-stat"><div class="tk-stat-n">${stats[i]}</div><div class="tk-stat-l">${cL[s]}</div></div>`).join('')}</div><div class="tk-board-modal">${board}</div>`;

  } else if (modalTab === 'convo') {
    const goalBox = `<div class="pm-goal-box">
      <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Project goal</div>
      <input class="fi" style="font-size:13px;font-weight:500" value="${esc(p.goal||'')}" placeholder="What does success look like?" onchange="updateFieldModal(${p.id},'goal',this.value)"/>
    </div>`;
    const sections = Object.keys(p.convo || {}).map(topic => {
      const items = (p.convo[topic]||'').split('\n').filter(x => x.trim());
      const rows = items.map((item, ii) => {
        const done = item.startsWith('[x]');
        const txt = done ? item.slice(3).trim() : item;
        return `<div class="item-row"><input type="checkbox" class="item-cb" ${done?'checked':''} onchange="toggleItemModal(${p.id},'${topic}',${ii},this.checked)"/><span class="item-txt${done?' done':''}">${esc(txt)}</span><button class="item-rm" onclick="removeItemModal(${p.id},'${topic}',${ii})">×</button></div>`;
      }).join('');
      return `<div class="pm-section">
        <div class="pm-section-title">${topic}</div>
        ${rows || `<div style="font-size:11px;color:var(--text3);margin-bottom:4px">Nothing yet.</div>`}
        <div class="add-item"><input id="mci-${p.id}-${topic.replace(/\s/g,'_')}" placeholder="Add item..." onkeydown="if(event.key==='Enter')addItemModal(${p.id},'${topic}')"/><button onclick="addItemModal(${p.id},'${topic}')">+ Add</button></div>
      </div>`;
    }).join('');
    body.innerHTML = goalBox + sections;

  } else if (modalTab === 'contacts') {
    const cards = p.contacts.map((ct, i) => {
      const a = ac(ct.name);
      return `<div class="proj-modal-sticker">
        <div class="proj-modal-sticker-av" style="background:${a.bg};color:${a.tc}">${ini(ct.name)}</div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:var(--text)">${esc(ct.name)}</div>
          <div style="font-size:11px;color:var(--text3)">${esc(ct.role)}</div>
          ${ct.notes ? `<div style="font-size:10px;color:var(--text3);font-style:italic">${esc(ct.notes)}</div>` : ''}
          <span class="contact-tag tag-${ct.type}">${ct.type}</span>
        </div>
        <button class="rm" onclick="rmContactModal(${p.id},${i})">×</button>
      </div>`;
    }).join('') || `<div style="font-size:12px;color:var(--text3);margin-bottom:12px">No contacts yet.</div>`;
    body.innerHTML = `${cards}
      <div class="add-contact" style="margin-top:10px">
        <input id="mcn-${p.id}" class="add-contact-full" placeholder="Name..."/>
        <input id="mcr-${p.id}" placeholder="Role..."/>
        <input id="mce-${p.id}" placeholder="Email..."/>
        <select id="mct-${p.id}">${CONTACT_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}</select>
        <input id="mcno-${p.id}" placeholder="Notes..."/>
        <button class="add-contact-full btn" onclick="addContactModal(${p.id})" style="padding:7px">+ Add contact</button>
      </div>`;

  } else if (modalTab === 'finances') {
    const revenue  = p.finances.filter(f => f.type==='revenue'||f.type==='investment').reduce((s,f)=>s+Number(f.amount||0),0);
    const expenses = p.finances.filter(f => f.type==='expense').reduce((s,f)=>s+Number(f.amount||0),0);
    const net = revenue - expenses;
    const rows = p.finances.map((f,i) =>
      `<tr><td style="color:var(--text)">${esc(f.desc)}</td><td><span class="fin-type type-${f.type}">${f.type}</span></td><td style="text-align:right;font-family:var(--mono);color:var(--text)">${fmt$(f.amount)}</td><td style="color:var(--text3)">${esc(f.status)}</td><td><button class="rm" onclick="rmFinModal(${p.id},${i})">×</button></td></tr>`
    ).join('') || `<tr><td colspan="5" style="color:var(--text3);padding:10px 0">No entries yet.</td></tr>`;
    body.innerHTML = `<div class="fin-summary">
      <div class="fin-card"><div class="fin-lbl">Revenue / funding</div><div class="fin-val green">${fmt$(revenue)}</div></div>
      <div class="fin-card"><div class="fin-lbl">Expenses</div><div class="fin-val red">${fmt$(expenses)}</div></div>
      <div class="fin-card"><div class="fin-lbl">Net</div><div class="fin-val ${net>=0?'green':'red'}">${fmt$(net)}</div></div>
    </div>
    <table class="fin-table">
      <thead><tr><th>Description</th><th>Type</th><th style="text-align:right">Amount</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="add-fin">
      <input id="mfd-${p.id}" placeholder="Description..."/>
      <select id="mft-${p.id}">${FIN_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}</select>
      <input id="mfa-${p.id}" type="number" placeholder="Amount" min="0"/>
      <button onclick="addFinModal(${p.id})">+ Add</button>
    </div>`;

  } else if (modalTab === 'info') {
    const stOpts = STAGES.map(s => `<option value="${s.id}"${s.id===p.stage?' selected':''}>${s.label}</option>`).join('');
    const swatches = PC.map((col,i) =>
      `<div class="cswatch${p.color===i?' sel':''}" style="background:${col.bg};outline:1.5px solid ${col.bd};border-color:${p.color===i?'rgba(0,0,0,.5)':'transparent'}" onclick="updateFieldModal(${p.id},'color',${i})"></div>`
    ).join('');
    const prows = p.people.map((per,i) =>
      `<div class="person-row"><div class="av" style="background:${ac(per.name).bg};color:${ac(per.name).tc};width:22px;height:22px;font-size:9px">${ini(per.name)}</div><span class="pname">${esc(per.name)}</span><select class="psel" onchange="setPermModal(${p.id},${i},this.value)"><option value="viewer"${per.perm==='viewer'?' selected':''}>Viewer</option><option value="editor"${per.perm==='editor'?' selected':''}>Editor</option></select><span class="ptag ${per.perm==='editor'?'te':'tv'}">${per.perm}</span><button class="tog ${per.visible?'tog-on':'tog-off'}" onclick="toggleVisModal(${p.id},${i})"></button><span class="ptag ${per.visible?'tvis':'th'}">${per.visible?'vis':'hidden'}</span><button class="rm" onclick="rmPersonModal(${p.id},${i})">×</button></div>`
    ).join('');
    body.innerHTML = `
      <div class="pm-field"><span class="pm-field-label">Name</span><input class="fi" value="${esc(p.name)}" onchange="updateFieldModal(${p.id},'name',this.value)"/></div>
      <div class="pm-field"><span class="pm-field-label">Stage</span><select class="fi" onchange="updateFieldModal(${p.id},'stage',this.value)">${stOpts}</select></div>
      <div class="pm-field"><span class="pm-field-label">Summary</span><input class="fi" value="${esc(p.desc)}" onchange="updateFieldModal(${p.id},'desc',this.value)"/></div>
      <div class="pm-field"><span class="pm-field-label">Goal</span><input class="fi" value="${esc(p.goal||'')}" placeholder="What does success look like?" onchange="updateFieldModal(${p.id},'goal',this.value)"/></div>
      <div class="pm-field" style="align-items:flex-start"><span class="pm-field-label" style="padding-top:4px">Color</span><div class="color-grid">${swatches}</div></div>
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
        <div class="pm-section-title">Team access</div>
        ${prows || '<div style="font-size:11px;color:var(--text3);margin-bottom:8px">No team members.</div>'}
        <div class="add-pr">
          <input id="mni-${p.id}" placeholder="Name or email..."/>
          <select id="mnp-${p.id}"><option value="viewer">Viewer</option><option value="editor">Editor</option></select>
          <button onclick="addPersonModal(${p.id})">+ Invite</button>
        </div>
      </div>`;
  }
}

// ── MODAL-SPECIFIC ACTION WRAPPERS ────────────────────────────
// These call the shared action functions then re-render the modal.

function updateFieldModal(id, field, val) {
  const v = field === 'color' ? parseInt(val) : val;
  projects = projects.map(p => p.id === id ? {...p, [field]:v} : p);
  const p = projects.find(x => x.id === id);
  if (p) saveProject(p);
  render();
  renderProjModal();
}

function moveTkModal(pid, idx, status) { moveTk(pid, idx, status); renderProjModal(); }
function rmTkModal(pid, idx)           { rmTk(pid, idx);           renderProjModal(); }

function addTkModal(pid) {
  const inp = document.getElementById('mtki-' + pid);
  const pri = document.getElementById('mtkp-' + pid);
  if (!inp || !inp.value.trim()) return;
  const p0 = projects.find(x => x.id === pid);
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, tickets:[...p.tickets, mkTk(inp.value.trim(), 'todo', pri.value, projPrefix(p.name))]};
  });
  const p = projects.find(x => x.id === pid); if (p) saveProject(p);
  render(); renderProjModal();
}

function addItemModal(id, topic) {
  const key = 'mci-' + id + '-' + topic.replace(/\s/g, '_');
  const inp = document.getElementById(key);
  if (!inp || !inp.value.trim()) return;
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const ex = p.convo[topic] || '';
    return {...p, convo:{...p.convo, [topic]:ex ? ex+'\n'+inp.value.trim() : inp.value.trim()}};
  });
  const p = projects.find(x => x.id === id); if (p) saveProject(p);
  renderProjModal();
}

function removeItemModal(id, topic, idx) {
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const items = (p.convo[topic]||'').split('\n').filter(x => x.trim());
    items.splice(idx, 1);
    return {...p, convo:{...p.convo, [topic]:items.join('\n')}};
  });
  const p = projects.find(x => x.id === id); if (p) saveProject(p);
  renderProjModal();
}

function toggleItemModal(id, topic, idx, checked) {
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const items = (p.convo[topic]||'').split('\n').filter(x => x.trim());
    const raw = items[idx].startsWith('[x]') ? items[idx].slice(3).trim() : items[idx];
    items[idx] = checked ? '[x] ' + raw : raw;
    return {...p, convo:{...p.convo, [topic]:items.join('\n')}};
  });
  const p = projects.find(x => x.id === id); if (p) saveProject(p);
  renderProjModal();
}

function addContactModal(pid) {
  const n  = document.getElementById('mcn-'  + pid).value.trim(); if (!n) return;
  const r  = document.getElementById('mcr-'  + pid).value.trim();
  const e  = document.getElementById('mce-'  + pid).value.trim();
  const t  = document.getElementById('mct-'  + pid).value;
  const no = document.getElementById('mcno-' + pid).value.trim();
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, contacts:[...p.contacts, {name:n, role:r, email:e, phone:'', type:t, notes:no}]};
  });
  const p = projects.find(x => x.id === pid); if (p) saveProject(p);
  renderProjModal();
}

function rmContactModal(pid, idx) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, contacts:p.contacts.filter((_,i) => i !== idx)};
  });
  const p = projects.find(x => x.id === pid); if (p) saveProject(p);
  renderProjModal();
}

function addFinModal(pid) {
  const d = document.getElementById('mfd-' + pid).value.trim(); if (!d) return;
  const t = document.getElementById('mft-' + pid).value;
  const a = parseFloat(document.getElementById('mfa-' + pid).value) || 0;
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, finances:[...p.finances, {id:'f'+Date.now(), desc:d, type:t, amount:a, status:'entered'}]};
  });
  const p = projects.find(x => x.id === pid); if (p) saveProject(p);
  renderProjModal();
}

function rmFinModal(pid, idx) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, finances:p.finances.filter((_,i) => i !== idx)};
  });
  const p = projects.find(x => x.id === pid); if (p) saveProject(p);
  renderProjModal();
}

function setPermModal(id, i, val) {
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const pp = [...p.people]; pp[i] = {...pp[i], perm:val};
    return {...p, people:pp};
  });
  const p = projects.find(x => x.id === id); if (p) saveProject(p);
  renderProjModal();
}

function toggleVisModal(id, i) {
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const pp = [...p.people]; pp[i] = {...pp[i], visible:!pp[i].visible};
    return {...p, people:pp};
  });
  const p = projects.find(x => x.id === id); if (p) saveProject(p);
  renderProjModal();
}

function rmPersonModal(id, i) {
  projects = projects.map(p => {
    if (p.id !== id) return p;
    return {...p, people:p.people.filter((_,j) => j !== i)};
  });
  const p = projects.find(x => x.id === id); if (p) saveProject(p);
  renderProjModal();
}

function addPersonModal(id) {
  const inp = document.getElementById('mni-' + id);
  const sel = document.getElementById('mnp-' + id);
  if (!inp || !inp.value.trim()) return;
  projects = projects.map(p => {
    if (p.id !== id) return p;
    return {...p, people:[...p.people, {name:inp.value.trim(), perm:sel.value, visible:true}]};
  });
  const p = projects.find(x => x.id === id); if (p) saveProject(p);
  renderProjModal();
}
