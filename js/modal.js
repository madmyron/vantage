// ── PROJECT MODAL ─────────────────────────────────────────────

let modalProjectId = null;
let modalTab = 'info';
let modalScrollTop = 0;

function getModalScrollContainer() {
  return document.querySelector('.proj-modal-body') || document.getElementById('proj-modal-body');
}

function captureModalScrollTop() {
  const container = getModalScrollContainer();
  return container ? container.scrollTop || 0 : 0;
}

function restoreModalScrollTop(scrollTop) {
  const container = getModalScrollContainer();
  if (!container) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const target = getModalScrollContainer();
      if (target) target.scrollTop = scrollTop || 0;
    });
  });
}

function openProjModal(pid) {
  modalProjectId = pid;
  modalTab = 'info';
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
  const TABS = ['info','pips','convo','contacts','finances'];
  const tabHTML = TABS.map(t =>
    `<button class="proj-modal-tab${modalTab===t?' on':''}" onclick="switchModalTab('${t}')">${t === 'pips' ? 'PIPs' : t.charAt(0).toUpperCase()+t.slice(1)}</button>`
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
      <button class="btn" style="color:#3d2fa8;border-color:rgba(91,77,224,.4);font-weight:600" onclick='openDax(${p.id}, ${JSON.stringify(`I want to talk about ${p.name}.`)})'>✦ Dax</button>
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

  if (modalTab === 'pips') {
    const stagesHTML = PIP_STAGES.map((st, si) => {
      const subs = p.subProjects.filter(sp => normalizePipStage(sp.stage, p) === st.id);
      const sc = SUB_COLORS[si % SUB_COLORS.length];
      const cards = subs.map(sp => {
        const otherSS = PIP_STAGES.filter(s => s.id !== st.id);
        const moveOpts = otherSS.map(s =>
          `<div class="move-opt" style="font-size:10px;padding:4px 8px" onclick="moveSubProjModal(${p.id},'${sp.id}','${s.id}')"><span class="mdot" style="background:${sc.bd}"></span>${esc(s.label)}</div>`
        ).join('');
        return `<div class="sub-card" draggable="true" data-spid="${sp.id}" data-pid="${p.id}" style="background:${sc.bg};border-color:${sc.bd};margin-bottom:8px;border-radius:10px;padding:10px 12px;border:1.5px solid ${sc.bd};cursor:pointer" onclick="togglePipExpand(event,${p.id},'${sp.id}')">
          <div style="font-size:12px;font-weight:700;color:${sc.tx};margin-bottom:3px">${esc(sp.name)}</div>
          ${sp.desc ? `<div class="sub-card-desc" style="color:${sc.tx}">${esc(sp.desc)}</div>` : ''}
          <div style="font-size:10px;color:${sc.tx};opacity:.75;margin-bottom:7px;line-height:1.4;font-family:var(--mono)">
            Assignee: ${esc(sp.assignee || 'Dax')} · Assigner: ${esc(sp.assigner || 'Dax')}
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap" onclick="event.stopPropagation()">
            <div style="position:relative;display:inline-block">
              <button class="scbtn" style="color:${sc.tx}" onclick="event.stopPropagation();toggleSubMove(event,${p.id},'${sp.id}')">Move ▾</button>
              <div class="sub-move-dd" id="smv-${p.id}-${sp.id}">${moveOpts}</div>
            </div>
            <button class="scbtn" style="color:${sc.tx};border-color:rgba(240,96,96,.3)" onclick="event.stopPropagation();removeSubProjModal(${p.id},'${sp.id}')">Delete</button>
          </div>
          <div id="pip-expand-${p.id}-${sp.id}" style="display:none;margin-top:10px;border-top:1px solid rgba(0,0,0,.1);padding-top:10px" onclick="event.stopPropagation()">
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:8px">
              <div>
                <div style="font-size:9px;font-weight:600;color:${sc.tx};opacity:.6;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Assignee</div>
                <select style="width:100%;font-size:11px;padding:4px 7px;border:1px solid rgba(0,0,0,.15);border-radius:5px;background:rgba(255,255,255,.4);color:${sc.tx};font-family:var(--font);outline:none" onchange="updatePipField(${p.id},'${sp.id}','assignee',this.value)">
                  ${PIP_USERS.map(u => `<option value="${u}"${(sp.assignee||'Dax')===u?' selected':''}>${u}</option>`).join('')}
                </select>
              </div>
              <div>
                <div style="font-size:9px;font-weight:600;color:${sc.tx};opacity:.6;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Assigner</div>
                <select style="width:100%;font-size:11px;padding:4px 7px;border:1px solid rgba(0,0,0,.15);border-radius:5px;background:rgba(255,255,255,.4);color:${sc.tx};font-family:var(--font);outline:none" onchange="updatePipField(${p.id},'${sp.id}','assigner',this.value)">
                  ${PIP_USERS.map(u => `<option value="${u}"${(sp.assigner||'Dax')===u?' selected':''}>${u}</option>`).join('')}
                </select>
              </div>
              <div>
                <div style="font-size:9px;font-weight:600;color:${sc.tx};opacity:.6;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Due date</div>
                <input type="date" style="width:100%;font-size:11px;padding:4px 7px;border:1px solid rgba(0,0,0,.15);border-radius:5px;background:rgba(255,255,255,.4);color:${sc.tx};font-family:var(--font);outline:none" value="${esc(sp.dueDate||'')}" onchange="updatePipField(${p.id},'${sp.id}','dueDate',this.value)"/>
              </div>
            </div>
          <div style="margin-bottom:8px">
              <div style="font-size:9px;font-weight:600;color:${sc.tx};opacity:.6;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Notes</div>
              <textarea style="width:100%;font-size:11px;padding:6px 8px;border:1px solid rgba(0,0,0,.15);border-radius:5px;background:rgba(255,255,255,.4);color:${sc.tx};font-family:var(--font);resize:vertical;min-height:50px;outline:none" placeholder="Notes, links, ideas..." onchange="updatePipField(${p.id},'${sp.id}','notes',this.value)">${esc(sp.notes||'')}</textarea>
            </div>
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${sc.tx};opacity:.65">${st.label}</div>
          </div>
        </div>`;
      }).join('') || `<div style="font-size:11px;color:var(--text3);padding:8px 4px">Empty</div>`;
      return `<div class="modal-pip-col" data-pid="${p.id}" data-stage="${st.id}" style="min-width:0;flex:1;flex-shrink:0;max-height:calc(90vh - 200px);overflow-y:auto;overflow-x:hidden;padding-right:2px">
        <div style="position:sticky;top:0;z-index:3;text-align:center;padding:4px 6px 10px;background:var(--bg2)">
          <span style="font-size:10px;font-weight:600;padding:3px 12px;border-radius:20px;display:inline-block;text-transform:uppercase;letter-spacing:.06em;border:1px solid ${sc.bd};background:${sc.bg};color:${sc.tx}">${esc(st.label)}</span>
          <div style="font-size:10px;color:var(--text3);margin-top:3px;font-family:var(--mono)">${subs.length}</div>
        </div>
        <div class="modal-pip-body" data-pid="${p.id}" data-stage="${st.id}">${cards}</div>
      </div>`;
    }).join('');
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:12px;color:var(--text3)">${p.subProjects.length} pip${p.subProjects.length!==1?'s':''}</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-accent" style="font-size:11px" onclick="openAddSubProjModal(${p.id})">+ Sub-project</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5, minmax(0, 1fr));gap:8px">${stagesHTML}</div>`;
    wirePipDrag(p.id);

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
    const fmtDate = value => {
      const raw = String(value || '').trim();
      if (!raw) return '—';
      const dt = new Date(raw);
      return Number.isNaN(dt.getTime()) ? raw : dt.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    const prows = p.people.map((per,i) =>
      `<div class="person-row"><div class="av" style="background:${ac(per.name).bg};color:${ac(per.name).tc};width:22px;height:22px;font-size:9px">${ini(per.name)}</div><span class="pname">${esc(per.name)}</span><select class="psel" onchange="setPermModal(${p.id},${i},this.value)"><option value="viewer"${per.perm==='viewer'?' selected':''}>Viewer</option><option value="editor"${per.perm==='editor'?' selected':''}>Editor</option></select><span class="ptag ${per.perm==='editor'?'te':'tv'}">${per.perm}</span><button class="tog ${per.visible?'tog-on':'tog-off'}" onclick="toggleVisModal(${p.id},${i})"></button><span class="ptag ${per.visible?'tvis':'th'}">${per.visible?'vis':'hidden'}</span><button class="rm" onclick="rmPersonModal(${p.id},${i})">×</button></div>`
    ).join('');
    body.innerHTML = `
      <div class="pm-field"><span class="pm-field-label">Name</span><input class="fi" value="${esc(p.name)}" onchange="updateFieldModal(${p.id},'name',this.value)"/></div>
      <div class="pm-field"><span class="pm-field-label">Stage</span><select class="fi" onchange="updateFieldModal(${p.id},'stage',this.value)">${stOpts}</select></div>
      <div class="pm-field"><span class="pm-field-label">Summary</span><input class="fi" value="${esc(p.desc)}" onchange="updateFieldModal(${p.id},'desc',this.value)"/></div>
      <div class="pm-field"><span class="pm-field-label">Goal</span><input class="fi" value="${esc(p.goal||'')}" placeholder="What does success look like?" onchange="updateFieldModal(${p.id},'goal',this.value)"/></div>
      <div class="pm-field"><span class="pm-field-label">GitHub repo</span><input class="fi" value="${esc(p.githubRepo||'')}" placeholder="owner/repo" onchange="updateFieldModal(${p.id},'githubRepo',this.value)"/></div>
      <div class="pm-field"><span class="pm-field-label">Date started</span><input class="fi" value="${esc(fmtDate(p.startedAt))}" readonly/></div>
      <div class="pm-field"><span class="pm-field-label">Date updated</span><input class="fi" value="${esc(fmtDate(p.updatedAt))}" readonly/></div>
      <div class="pm-field"><span class="pm-field-label">Assignee</span><input class="fi" value="${esc(p.assignee||'Dax')}" onchange="updateFieldModal(${p.id},'assignee',this.value)"/></div>
      <div class="pm-field"><span class="pm-field-label">Assigner</span><input class="fi" value="${esc(p.assigner||'Dax')}" onchange="updateFieldModal(${p.id},'assigner',this.value)"/></div>
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

function openAddSubProjModal(pid) {
  const p = projects.find(x => x.id === pid);
  const stageOpts = PIP_STAGES.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
  document.getElementById('modal-inner').innerHTML = `<div class="modal-title">New sub-project — ${esc(p.name)}</div>
    <div class="fl"><span class="fl-lbl">Name</span><input class="fi" id="sp-name" placeholder="Sub-project name..."/></div>
    <div class="fl"><span class="fl-lbl">Stage</span><select class="fi" id="sp-stage">${stageOpts}</select></div>
    <div class="fl"><span class="fl-lbl">Description</span><input class="fi" id="sp-desc" placeholder="One-liner..."/></div>
    <div class="modal-acts"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-accent" onclick="saveSubProjModal(${pid})">Add</button></div>`;
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('sp-name').focus(), 50);
}

function saveSubProjModal(pid) {
  const name = document.getElementById('sp-name').value.trim(); if (!name) return;
  const stage = document.getElementById('sp-stage').value;
  const desc  = document.getElementById('sp-desc').value.trim();
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:[...p.subProjects, mkSubP(name, desc, stage)]};
  });
  const updated = projects.find(x => x.id === pid);
  if (updated) saveProject(updated);
  closeModal();
  render();
  renderProjModal();
}

function moveSubProjModal(pid, spid, newStage) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:p.subProjects.map(sp => sp.id === spid ? {...sp, stage:newStage} : sp)};
  });
  document.querySelectorAll('.sub-move-dd.open').forEach(m => m.classList.remove('open'));
  const updated = projects.find(x => x.id === pid);
  if (updated) saveProject(updated);
  render();
  renderProjModal();
}

function removeSubProjModal(pid, spid) {
  modalScrollTop = captureModalScrollTop();
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:p.subProjects.filter(sp => sp.id !== spid)};
  });
  const updated = projects.find(x => x.id === pid);
  if (updated) saveProject(updated);
  render();
  renderProjModal();
  restoreModalScrollTop(modalScrollTop);
}

function updatePipField(pid, spid, field, val) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:p.subProjects.map(sp =>
      sp.id !== spid ? sp : {...sp, [field]:val}
    )};
  });
  const updated = projects.find(x => x.id === pid);
  if (updated) saveProject(updated);
}

function togglePipExpand(e, pid, spid) {
  const el = document.getElementById('pip-expand-' + pid + '-' + spid);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function addPipTask(pid, spid) {
  const inp = document.getElementById('pip-tk-' + pid + '-' + spid);
  if (!inp || !inp.value.trim()) return;
  const proj = projects.find(x => x.id === pid);
  const pfx = proj ? projPrefix(proj.name) : 'TK';
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:p.subProjects.map(sp =>
      sp.id !== spid ? sp : {...sp, tickets:[...sp.tickets, {id:pfx+'-'+(tkSeq++), title:inp.value.trim(), status:'todo'}]}
    )};
  });
  inp.value = '';
  const updated = projects.find(x => x.id === pid);
  if (updated) saveProject(updated);
  renderProjModal();
  setTimeout(() => {
    const el = document.getElementById('pip-expand-' + pid + '-' + spid);
    if (el) el.style.display = 'block';
  }, 50);
}

function togglePipTask(pid, spid, idx, checked) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:p.subProjects.map(sp => {
      if (sp.id !== spid) return sp;
      const tks = [...sp.tickets];
      tks[idx] = {...tks[idx], status: checked ? 'done' : 'todo'};
      return {...sp, tickets:tks};
    })};
  });
  const updated = projects.find(x => x.id === pid);
  if (updated) saveProject(updated);
}

function rmPipTask(pid, spid, idx) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:p.subProjects.map(sp =>
      sp.id !== spid ? sp : {...sp, tickets:sp.tickets.filter((_,i)=>i!==idx)}
    )};
  });
  const updated = projects.find(x => x.id === pid);
  if (updated) saveProject(updated);
  renderProjModal();
}

function wirePipDrag(pid) {
  let dragSpid = null;
  document.querySelectorAll(`.sub-card[data-pid="${pid}"]`).forEach(card => {
    card.addEventListener('dragstart', e => {
      dragSpid = card.dataset.spid;
      setTimeout(() => card.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.modal-pip-body').forEach(b => b.style.outline = '');
      dragSpid = null;
    });
  });
  document.querySelectorAll(`.modal-pip-body[data-pid="${pid}"]`).forEach(body => {
    body.addEventListener('dragover', e => {
      e.preventDefault();
      document.querySelectorAll('.modal-pip-body').forEach(b => b.style.outline = '');
      body.style.outline = '1.5px dashed var(--green)';
    });
    body.addEventListener('dragleave', () => body.style.outline = '');
    body.addEventListener('drop', e => {
      e.preventDefault();
      body.style.outline = '';
      const newStage = body.dataset.stage;
      if (dragSpid && newStage) moveSubProjModal(pid, dragSpid, newStage);
    });
  });
}
