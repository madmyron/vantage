// ── PIPELINE RENDER ───────────────────────────────────────────

function render() {
  const pipe = document.getElementById('pipeline');
  pipe.innerHTML = '';
  STAGES.forEach((st, si) => {
    const cards = projects.filter(p => p.stage === st.id);
    const col = document.createElement('div');
    col.className = 'stage-col';
    col.innerHTML = `<div class="stage-head">
      <span class="stage-pill" style="background:${st.sc};color:${st.sf};border-color:${st.sf}44">${st.label}</span>
      <div class="stage-ct">${cards.length}</div>
    </div>
    <div class="stage-body" id="sb-${st.id}" data-stage="${st.id}"></div>`;
    pipe.appendChild(col);
    if (si < STAGES.length - 1) {
      const d = document.createElement('div');
      d.className = 'sdiv';
      pipe.appendChild(d);
    }
  });

  projects.forEach(p => {
    const body = document.getElementById('sb-' + p.stage);
    if (!body) return;
    const c = pc(p.color), st = sf(p.stage);
    const wrap = document.createElement('div');
    const avatars = p.people.map(per =>
      `<div class="av" style="background:${ac(per.name).bg};color:${ac(per.name).tc};opacity:${per.visible?1:.35}" title="${esc(per.name)}">${ini(per.name)}</div>`
    ).join('');
    const otherStages = STAGES.filter(s => s.id !== p.stage);
    const moveOpts = otherStages.map(s =>
      `<div class="move-opt" onclick="moveProj(${p.id},'${s.id}')"><span class="mdot" style="background:${s.sf}"></span>${s.label}</div>`
    ).join('');
    const tkTodo = p.tickets.filter(t => t.status === 'todo').length;
    const tkIP   = p.tickets.filter(t => t.status === 'inprogress').length;
    const tkDone = p.tickets.filter(t => t.status === 'done').length;
    wrap.innerHTML = `<div class="pcard" id="pc-${p.id}" style="background:${c.bg};border-color:${c.bd}" draggable="true" data-pid="${p.id}">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:${c.bar};border-radius:8px 8px 0 0"></div>
      <div style="margin-top:4px;cursor:pointer" onclick="openProjModal(${p.id})">
        <div class="pcard-name" style="color:${c.tx}">${esc(p.name)}</div>
        ${p.desc ? `<div class="pcard-goal" style="color:${c.tx}">${esc(p.desc.length>40 ? p.desc.slice(0,40)+'\u2026' : p.desc)}</div>` : ''}
        <div style="font-size:11px;color:#222;margin-top:5px;font-family:var(--mono)">
          <span style="font-size:10px;font-family:var(--mono)">${tkTodo} to do · ${tkIP} in prog</span>
        </div>
        <div style="margin-top:5px;position:relative;height:6px;border-radius:3px;background:rgba(0,0,0,.12)">
          <div style="height:100%;border-radius:3px;background:${c.bar};width:${st.pct}%"></div>
          <div style="position:absolute;top:50%;transform:translate(-50%,-50%);left:${Math.min(st.pct,93)}%;background:${c.bar};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);border-radius:10px;padding:1px 5px;font-size:9px;font-weight:700;color:#fff;white-space:nowrap">${st.pct}%</div>
        </div>
      </div>
    </div>
    <div id="sub-${p.id}"></div>`;
    body.appendChild(wrap);
  });

  wireDrag();
  stamp();
}

function wireDrag() {
  document.querySelectorAll('.pcard[draggable]').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragId = parseInt(card.dataset.pid);
      setTimeout(() => card.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.stage-body').forEach(b => b.classList.remove('drag-over'));
      dragId = null;
    });
  });
  document.querySelectorAll('.stage-body').forEach(body => {
    body.addEventListener('dragover', e => {
      e.preventDefault();
      document.querySelectorAll('.stage-body').forEach(b => b.classList.remove('drag-over'));
      body.classList.add('drag-over');
    });
    body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
    body.addEventListener('drop', e => {
      e.preventDefault();
      body.classList.remove('drag-over');
      const ns = body.dataset.stage;
      if (dragId && ns) { moveProj(dragId, ns); dragId = null; }
    });
  });
}

// ── SUB-BOARD RENDER ──────────────────────────────────────────

function renderSubBoard(p) {
  const el = document.getElementById('subboard-overlay');
  if (!el) return;
  const c = pc(p.color);
  const stagesHTML = PIP_STAGES.map((st, si) => {
    const subs = p.subProjects.filter(sp => normalizePipStage(sp.stage, p) === st.id);
    const sc = SUB_COLORS[si % SUB_COLORS.length];
    const cards = subs.map(sp => {
      const otherSS = PIP_STAGES.filter(s => s.id !== st.id);
      const moveOpts = otherSS.map(s =>
        `<div class="move-opt" style="font-size:10px;padding:4px 8px" onclick="moveSubProj(${p.id},'${sp.id}','${s.id}')"><span class="mdot" style="background:${sc.bd}"></span>${esc(s.label)}</div>`
      ).join('');
      return `<div class="sub-card" style="background:${sc.bg};border-color:${sc.bd}">
        <div class="sub-card-name" style="color:${sc.tx}">${esc(sp.name)}</div>
        ${sp.desc ? `<div class="sub-card-desc" style="color:${sc.tx}">${esc(sp.desc.length>46 ? sp.desc.slice(0,46)+'…' : sp.desc)}</div>` : ''}
        <div class="sub-card-meta" style="color:${sc.tx}">
          <span>Assignee: ${esc(sp.assignee || 'Dax')}</span>
          <span>Assigner: ${esc(sp.assigner || 'Dax')}</span>
        </div>
        <div class="sub-card-btns">
          <button class="scbtn" style="color:${sc.tx}" onclick="toggleSubNote(${p.id},'${sp.id}')">Notes</button>
          <div class="sub-move-wrap">
            <button class="scbtn" style="color:${sc.tx}" onclick="toggleSubMove(event,${p.id},'${sp.id}')">Move ▾</button>
            <div class="sub-move-dd" id="smv-${p.id}-${sp.id}">${moveOpts}</div>
          </div>
          <button class="scbtn" style="color:${sc.tx};border-color:rgba(240,96,96,.3)" onclick="removeSubProj(${p.id},'${sp.id}')">×</button>
        </div>
        <div id="snp-${p.id}-${sp.id}"></div>
        <div style="margin-top:8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${sc.tx};opacity:.65">${st.label}</div>
      </div>`;
    }).join('') || `<div style="font-size:11px;color:var(--text3);padding:8px 4px">Empty</div>`;
    return `<div class="sub-stage-col">
      <div class="sub-stage-head">
        <span class="sub-stage-pill" style="background:${sc.bg};color:${sc.tx};border-color:${sc.bd}">${esc(st.label)}</span>
        <div style="font-size:10px;color:var(--text3);margin-top:3px;font-family:var(--mono)">${subs.length}</div>
      </div>
      <div class="sub-stage-body" id="ssb-${p.id}-${st.id}" data-pid="${p.id}" data-stage="${st.id}">${cards}</div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="subboard-wrap" style="border-top:3px solid ${c.bar}">
    <div class="subboard-header">
      <div class="subboard-title">
        <span style="width:10px;height:10px;border-radius:3px;background:${c.bar};display:inline-block;flex-shrink:0"></span>
        ${esc(p.name)} — board
        <span style="font-size:11px;font-weight:400;color:var(--text3)">${p.subProjects.length} pip${p.subProjects.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="subboard-header-btns">
        <button class="btn btn-accent" style="font-size:11px;padding:5px 12px" onclick="openAddSubProj(${p.id})">+ Sub-project</button>
        <button class="btn" style="font-size:11px;padding:5px 12px;color:#3d2fa8;border-color:rgba(91,77,224,.4)" onclick="closeSubBoardOpenDax(${p.id})">✦ Dax</button>
        <button class="btn" style="font-size:11px;padding:5px 12px" onclick="closeSubBoardOpenModal(${p.id})">← Back</button>
        <button class="btn" style="font-size:11px;padding:5px 12px" onclick="toggleSubBoard(${p.id})">✕ Close</button>
      </div>
    </div>
    <div class="sub-pipeline" style="grid-template-columns:repeat(5, minmax(0, 1fr))">${stagesHTML}</div>
  </div>`;
  el.classList.add('open');

  wireSubDrag(p.id);
  p.subProjects.forEach(sp => {
    if (sp._openNote)    renderSubNote(p, sp);
  });
}

function wireSubDrag(pid) {
  document.querySelectorAll(`.sub-stage-body[data-pid="${pid}"]`).forEach(body => {
    body.addEventListener('dragover', e => {
      e.preventDefault();
      document.querySelectorAll(`.sub-stage-body[data-pid="${pid}"]`).forEach(b => b.classList.remove('drag-over'));
      body.classList.add('drag-over');
    });
    body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
    body.addEventListener('drop', e => {
      e.preventDefault();
      body.classList.remove('drag-over');
      const ns = body.dataset.stage;
      if (subDragId && ns) moveSubProj(pid, subDragId, ns);
    });
  });
}

function renderSubNote(p, sp) {
  const el = document.getElementById('snp-' + p.id + '-' + sp.id);
  if (!el) return;
  if (sp._openNote) {
    el.innerHTML = `<div class="sub-note-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.06em">Notes</span>
        <button class="rm" onclick="toggleSubNote(${p.id},'${sp.id}')">✕</button>
      </div>
      <textarea class="sub-notes-area" placeholder="Notes, ideas, links..." onchange="updateSubNote(${p.id},'${sp.id}',this.value)">${esc(sp.notes||'')}</textarea>
    </div>`;
  } else {
    el.innerHTML = '';
  }
}

function renderDetail(p) {
  const el = document.getElementById('det-' + p.id);
  if (!el) return;
  const TABS = ['contacts','finances','convo','info'];
  const tabBar = TABS.map(t =>
    `<button class="ptab${p.openTab===t?' on':''}" onclick="setTab(${p.id},'${t}')">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`
  ).join('');

  if (p.openTab === 'tickets') {
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
            ${canL ? `<button class="tk-mbtn" onclick="moveTk(${p.id},${ri},'${lS}')">← ${cL[lS]}</button>` : ''}
            ${canR ? `<button class="tk-mbtn" onclick="moveTk(${p.id},${ri},'${rS}')">→ ${cL[rS]}</button>` : ''}
            <button class="tk-mbtn" style="color:var(--red)" onclick="rmTk(${p.id},${ri})">×</button>
          </div>
        </div>`;
      }).join('') || `<div style="font-size:10px;color:var(--text3);padding:6px 0">Empty</div>`;
      return `<div class="tk-col">
        <div class="tk-col-head">${cL[status]}<span style="font-weight:400;color:var(--text3);text-transform:none;letter-spacing:0;font-family:var(--mono)">${tks.length}</span></div>
        ${tkHTML}
        ${status === 'todo' ? `<div class="add-tk"><div class="add-tk-row"><input id="tki-${p.id}" placeholder="New ticket..." onkeydown="if(event.key==='Enter')addTk(${p.id})"/><select id="tkp-${p.id}"><option value="high">High</option><option value="med" selected>Med</option><option value="low">Low</option></select></div><button onclick="addTk(${p.id})">+ Add ticket</button></div>` : ''}
      </div>`;
    }).join('');
    el.innerHTML = `<div class="panel"><div class="ptabs">${tabBar}</div><div class="tk-stats">${cols.map((s,i)=>`<div class="tk-stat"><div class="tk-stat-n">${stats[i]}</div><div class="tk-stat-l">${cL[s]}</div></div>`).join('')}</div><div class="tickets-board">${board}</div><div style="display:flex;justify-content:flex-end"><button class="btn" onclick="closeDetail(${p.id})">Close</button></div></div>`;

  } else if (p.openTab === 'contacts') {
    const cards = p.contacts.map((ct, i) => {
      const a = ac(ct.name);
      return `<div class="contact-card"><div class="contact-av" style="background:${a.bg};color:${a.tc}">${ini(ct.name)}</div><div class="contact-info"><div class="contact-name">${esc(ct.name)}</div><div class="contact-role">${esc(ct.role)}</div>${ct.notes?`<div style="font-size:10px;color:var(--text3);margin-top:2px;font-style:italic">${esc(ct.notes)}</div>`:''}<span class="contact-tag tag-${ct.type}">${ct.type}</span></div><button class="rm" onclick="rmContact(${p.id},${i})">×</button></div>`;
    }).join('') || `<div style="font-size:12px;color:var(--text3);margin-bottom:10px">No contacts yet.</div>`;
    el.innerHTML = `<div class="panel"><div class="ptabs">${tabBar}</div>${cards}<div class="add-contact"><input id="cn-${p.id}" class="add-contact-full" placeholder="Name..." onkeydown="if(event.key==='Enter')addContact(${p.id})"/><input id="cr-${p.id}" placeholder="Role / title..."/><input id="ce-${p.id}" placeholder="Email..."/><select id="ct-${p.id}">${CONTACT_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}</select><input id="cno-${p.id}" placeholder="Notes..."/><button class="add-contact-full btn" onclick="addContact(${p.id})" style="padding:6px">+ Add contact</button></div><div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn" onclick="closeDetail(${p.id})">Close</button></div></div>`;

  } else if (p.openTab === 'finances') {
    const revenue  = p.finances.filter(f => f.type==='revenue'||f.type==='investment').reduce((s,f)=>s+Number(f.amount||0),0);
    const expenses = p.finances.filter(f => f.type==='expense').reduce((s,f)=>s+Number(f.amount||0),0);
    const net = revenue - expenses;
    const rows = p.finances.map((f,i)=>
      `<tr><td style="color:var(--text)">${esc(f.desc)}</td><td><span class="fin-type type-${f.type}">${f.type}</span></td><td style="text-align:right;font-family:var(--mono);color:var(--text)">${fmt$(f.amount)}</td><td>${esc(f.status)}</td><td><button class="rm" onclick="rmFin(${p.id},${i})">×</button></td></tr>`
    ).join('') || `<tr><td colspan="5" style="color:var(--text3);padding:10px 0">No entries yet.</td></tr>`;
    el.innerHTML = `<div class="panel"><div class="ptabs">${tabBar}</div><div class="fin-summary"><div class="fin-card"><div class="fin-lbl">Revenue / funding</div><div class="fin-val green">${fmt$(revenue)}</div></div><div class="fin-card"><div class="fin-lbl">Expenses</div><div class="fin-val red">${fmt$(expenses)}</div></div><div class="fin-card"><div class="fin-lbl">Net</div><div class="fin-val ${net>=0?'green':'red'}">${fmt$(net)}</div></div></div><table class="fin-table"><thead><tr><th>Description</th><th>Type</th><th style="text-align:right">Amount</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table><div class="add-fin"><input id="fd-${p.id}" placeholder="Description..."/><select id="ft-${p.id}">${FIN_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}</select><input id="fa-${p.id}" type="number" placeholder="Amount" min="0"/><button onclick="addFin(${p.id})">+ Add</button></div><div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn" onclick="closeDetail(${p.id})">Close</button></div></div>`;

  } else if (p.openTab === 'convo') {
    const goalBox = `<div class="goal-box"><div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Project goal</div><input class="fi" style="font-size:12px" value="${esc(p.goal||'')}" placeholder="Define success clearly..." onchange="updateField(${p.id},'goal',this.value)"/></div>`;
    const sections = CTOPICS.map(topic => {
      const items = (p.convo[topic]||'').split('\n').filter(x=>x.trim());
      const rows = items.map((item, ii) => {
        const done = item.startsWith('[x]');
        const txt = done ? item.slice(3).trim() : item;
        return `<div class="item-row"><input type="checkbox" class="item-cb" ${done?'checked':''} onchange="toggleItem(${p.id},'${topic}',${ii},this.checked)"/><span class="item-txt${done?' done':''}">${esc(txt)}</span><button class="item-rm" onclick="removeItem(${p.id},'${topic}',${ii})">×</button></div>`;
      }).join('');
      return `<div class="convo-sect"><div class="convo-lbl">${topic}</div>${rows||`<div style="font-size:11px;color:var(--text3);margin-bottom:4px">Nothing yet.</div>`}<div class="add-item"><input id="ci-${p.id}-${topic.replace(/\s/g,'_')}" placeholder="Add item..." onkeydown="if(event.key==='Enter')addItem(${p.id},'${topic}')"/><button onclick="addItem(${p.id},'${topic}')">+ Add</button></div></div>`;
    }).join('');
    el.innerHTML = `<div class="panel"><div class="ptabs">${tabBar}</div>${goalBox}${sections}<div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn" onclick="closeDetail(${p.id})">Close</button></div></div>`;

  } else if (p.openTab === 'info') {
    const stOpts = STAGES.map(s=>`<option value="${s.id}"${s.id===p.stage?' selected':''}>${s.label}</option>`).join('');
    const swatches = PC.map((col,i)=>`<div class="cswatch${p.color===i?' sel':''}" style="background:${col.bg};outline:1.5px solid ${col.bd};border-color:${p.color===i?'rgba(255,255,255,.6)':'transparent'}" onclick="updateField(${p.id},'color',${i})"></div>`).join('');
    const prows = p.people.map((per,i)=>
      `<div class="person-row"><div class="av" style="background:${ac(per.name).bg};color:${ac(per.name).tc};width:22px;height:22px;font-size:9px">${ini(per.name)}</div><span class="pname">${esc(per.name)}</span><select class="psel" onchange="setPerm(${p.id},${i},this.value)"><option value="viewer"${per.perm==='viewer'?' selected':''}>Viewer</option><option value="editor"${per.perm==='editor'?' selected':''}>Editor</option></select><span class="ptag ${per.perm==='editor'?'te':'tv'}">${per.perm}</span><button class="tog ${per.visible?'tog-on':'tog-off'}" onclick="toggleVis(${p.id},${i})"></button><span class="ptag ${per.visible?'tvis':'th'}">${per.visible?'vis':'hidden'}</span><button class="rm" onclick="rmPerson(${p.id},${i})">×</button></div>`
    ).join('');
    el.innerHTML = `<div class="panel"><div class="ptabs">${tabBar}</div><div class="fl"><span class="fl-lbl">Name</span><input class="fi" value="${esc(p.name)}" onchange="updateField(${p.id},'name',this.value)"/></div><div class="fl"><span class="fl-lbl">Stage</span><select class="fi" onchange="updateField(${p.id},'stage',this.value)">${stOpts}</select></div><div class="fl"><span class="fl-lbl">Summary</span><input class="fi" value="${esc(p.desc)}" onchange="updateField(${p.id},'desc',this.value)"/></div><div class="fl"><span class="fl-lbl">Goal</span><input class="fi" value="${esc(p.goal||'')}" placeholder="What does success look like?" onchange="updateField(${p.id},'goal',this.value)"/></div><div class="fl" style="align-items:flex-start"><span class="fl-lbl" style="padding-top:4px">Color</span><div class="color-grid">${swatches}</div></div><div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px"><div class="sec-title">Team access</div>${prows||'<div style="font-size:11px;color:var(--text3);margin-bottom:8px">No team members.</div>'}<div class="add-pr"><input id="ni-${p.id}" placeholder="Name or email..." onkeydown="if(event.key==='Enter')addPerson(${p.id})"/><select id="np-${p.id}"><option value="viewer">Viewer</option><option value="editor">Editor</option></select><button onclick="addPerson(${p.id})">+ Invite</button></div></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" style="color:var(--red);border-color:rgba(240,96,96,.3)" onclick="deleteProject(${p.id})">Delete</button><button class="btn" onclick="closeDetail(${p.id})">Close</button></div></div>`;
  }
}


