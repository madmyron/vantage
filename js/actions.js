// ── PROJECT ACTIONS ───────────────────────────────────────────

function moveProj(id, stage) {
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const updated = {...p, stage};
    saveProject(updated);
    return updated;
  });
  document.querySelectorAll('.move-dd.open').forEach(m => m.classList.remove('open'));
  render();
}

function toggleMove(e, id) {
  e.stopPropagation();
  const dd = document.getElementById('mv-' + id);
  document.querySelectorAll('.move-dd.open').forEach(m => { if (m !== dd) m.classList.remove('open'); });
  dd.classList.toggle('open');
}

function toggleDetail(id, tab) {
  projects = projects.map(p => p.id === id ? {...p, openTab:p.openTab===tab?null:tab, openSubBoard:false} : p);
  render();
}

function closeDetail(id) {
  projects = projects.map(p => p.id === id ? {...p, openTab:null} : p);
  render();
}

function setTab(id, tab) {
  projects = projects.map(p => p.id === id ? {...p, openTab:tab} : p);
  render();
}

function updateField(id, field, val) {
  const v = field === 'color' ? parseInt(val) : val;
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const updated = {...p, [field]:v};
    saveProject(updated);
    return updated;
  });
  render();
}

function deleteProject(id) {
  const p = projects.find(x => x.id === id);
  if (p && p.dbId) deleteProjectDB(p.dbId);
  projects = projects.filter(x => x.id !== id);
  render();
}

function autoSave(id) {
  const p = projects.find(x => x.id === id);
  if (p) saveProject(p);
}

// ── TICKET ACTIONS ────────────────────────────────────────────

function moveTk(pid, idx, status) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    const tks = [...p.tickets];
    tks[idx] = {...tks[idx], status};
    const updated = {...p, tickets:tks};
    saveProject(updated);
    return updated;
  });
  render();
}

function rmTk(pid, idx) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    const updated = {...p, tickets:p.tickets.filter((_,i) => i !== idx)};
    saveProject(updated);
    return updated;
  });
  render();
}

function addTk(pid) {
  const inp = document.getElementById('tki-' + pid);
  const pri = document.getElementById('tkp-' + pid);
  if (!inp || !inp.value.trim()) return;
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    const updated = {...p, tickets:[...p.tickets, mkTk(inp.value.trim(), 'todo', pri.value)]};
    saveProject(updated);
    return updated;
  });
  render();
}

// ── CONTACT ACTIONS ───────────────────────────────────────────

function addContact(pid) {
  const n  = document.getElementById('cn-'  + pid).value.trim(); if (!n) return;
  const r  = document.getElementById('cr-'  + pid).value.trim();
  const e  = document.getElementById('ce-'  + pid).value.trim();
  const t  = document.getElementById('ct-'  + pid).value;
  const no = document.getElementById('cno-' + pid).value.trim();
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    const updated = {...p, contacts:[...p.contacts, {name:n, role:r, email:e, phone:'', type:t, notes:no}]};
    saveProject(updated);
    return updated;
  });
  render();
}

function rmContact(pid, idx) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    const updated = {...p, contacts:p.contacts.filter((_,i) => i !== idx)};
    saveProject(updated);
    return updated;
  });
  render();
}

// ── FINANCE ACTIONS ───────────────────────────────────────────

function addFin(pid) {
  const d = document.getElementById('fd-' + pid).value.trim(); if (!d) return;
  const t = document.getElementById('ft-' + pid).value;
  const a = parseFloat(document.getElementById('fa-' + pid).value) || 0;
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    const updated = {...p, finances:[...p.finances, {id:'f'+Date.now(), desc:d, type:t, amount:a, status:'entered'}]};
    saveProject(updated);
    return updated;
  });
  render();
}

function rmFin(pid, idx) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    const updated = {...p, finances:p.finances.filter((_,i) => i !== idx)};
    saveProject(updated);
    return updated;
  });
  render();
}

// ── CONVO ACTIONS ─────────────────────────────────────────────

function addItem(id, topic) {
  const key = 'ci-' + id + '-' + topic.replace(/\s/g, '_');
  const inp = document.getElementById(key);
  if (!inp || !inp.value.trim()) return;
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const ex = p.convo[topic] || '';
    const updated = {...p, convo:{...p.convo, [topic]:ex ? ex+'\n'+inp.value.trim() : inp.value.trim()}};
    saveProject(updated);
    return updated;
  });
  render();
}

function removeItem(id, topic, idx) {
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const items = (p.convo[topic]||'').split('\n').filter(x => x.trim());
    items.splice(idx, 1);
    const updated = {...p, convo:{...p.convo, [topic]:items.join('\n')}};
    saveProject(updated);
    return updated;
  });
  render();
}

function toggleItem(id, topic, idx, checked) {
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const items = (p.convo[topic]||'').split('\n').filter(x => x.trim());
    const raw = items[idx].startsWith('[x]') ? items[idx].slice(3).trim() : items[idx];
    items[idx] = checked ? '[x] ' + raw : raw;
    const updated = {...p, convo:{...p.convo, [topic]:items.join('\n')}};
    saveProject(updated);
    return updated;
  });
  render();
}

// ── TEAM ACTIONS ──────────────────────────────────────────────

function setPerm(id, i, val) {
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const pp = [...p.people]; pp[i] = {...pp[i], perm:val};
    const updated = {...p, people:pp};
    saveProject(updated);
    return updated;
  });
  render();
}

function toggleVis(id, i) {
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const pp = [...p.people]; pp[i] = {...pp[i], visible:!pp[i].visible};
    const updated = {...p, people:pp};
    saveProject(updated);
    return updated;
  });
  render();
}

function rmPerson(id, i) {
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const updated = {...p, people:p.people.filter((_,j) => j !== i)};
    saveProject(updated);
    return updated;
  });
  render();
}

function addPerson(id) {
  const inp = document.getElementById('ni-' + id);
  const sel = document.getElementById('np-' + id);
  if (!inp || !inp.value.trim()) return;
  projects = projects.map(p => {
    if (p.id !== id) return p;
    const updated = {...p, people:[...p.people, {name:inp.value.trim(), perm:sel.value, visible:true}]};
    saveProject(updated);
    return updated;
  });
  render();
}

// ── SUB-BOARD ACTIONS ─────────────────────────────────────────

function toggleSubBoard(pid) {
  projects = projects.map(p => p.id === pid ? {...p, openSubBoard:!p.openSubBoard, openTab:null} : p);
  render();
  setTimeout(() => {
    const el = document.getElementById('sub-' + pid);
    if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
  }, 50);
}

function toggleSubNote(pid, spid) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:p.subProjects.map(sp => sp.id === spid ? {...sp, _openNote:!sp._openNote, _openTickets:false} : sp)};
  });
  const p = projects.find(x => x.id === pid);
  const sp = p.subProjects.find(x => x.id === spid);
  renderSubNote(p, sp);
}

function toggleSubTickets(pid, spid) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:p.subProjects.map(sp => sp.id === spid ? {...sp, _openTickets:!sp._openTickets, _openNote:false} : sp)};
  });
  const p = projects.find(x => x.id === pid);
  const sp = p.subProjects.find(x => x.id === spid);
  renderSubTickets(p, sp);
}

function updateSubNote(pid, spid, val) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:p.subProjects.map(sp => sp.id === spid ? {...sp, notes:val} : sp)};
  });
}

function moveSubProj(pid, spid, newStage) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:p.subProjects.map(sp => sp.id === spid ? {...sp, stage:newStage} : sp)};
  });
  document.querySelectorAll('.sub-move-dd.open').forEach(m => m.classList.remove('open'));
  const p = projects.find(x => x.id === pid);
  if (p) saveProject(p);
  renderSubBoard(p);
}

function removeSubProj(pid, spid) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:p.subProjects.filter(sp => sp.id !== spid)};
  });
  const p = projects.find(x => x.id === pid);
  if (p) saveProject(p);
  renderSubBoard(p);
}

function toggleSubMove(e, pid, spid) {
  e.stopPropagation();
  const dd = document.getElementById('smv-' + pid + '-' + spid);
  document.querySelectorAll('.sub-move-dd.open').forEach(m => { if (m !== dd) m.classList.remove('open'); });
  dd.classList.toggle('open');
}

function addSubTk(pid, spid) {
  const inp = document.getElementById('sti-' + pid + '-' + spid);
  if (!inp || !inp.value.trim()) return;
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:p.subProjects.map(sp =>
      sp.id !== spid ? sp : {...sp, tickets:[...sp.tickets, {id:'ST-'+(tkSeq++), title:inp.value.trim(), status:'todo'}]}
    )};
  });
  inp.value = '';
  const updated = projects.find(x => x.id === pid);
  if (updated) saveProject(updated);
  renderSubTickets(updated, updated.subProjects.find(x => x.id === spid));
}

function moveSubTk(pid, spid, idx, status) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:p.subProjects.map(sp => {
      if (sp.id !== spid) return sp;
      const tks = [...sp.tickets]; tks[idx] = {...tks[idx], status};
      return {...sp, tickets:tks};
    })};
  });
  const p = projects.find(x => x.id === pid);
  renderSubTickets(p, p.subProjects.find(x => x.id === spid));
}

function rmSubTk(pid, spid, idx) {
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subProjects:p.subProjects.map(sp =>
      sp.id !== spid ? sp : {...sp, tickets:sp.tickets.filter((_,i) => i !== idx)}
    )};
  });
  const p = projects.find(x => x.id === pid);
  renderSubTickets(p, p.subProjects.find(x => x.id === spid));
}

// ── NEW PROJECT MODAL ─────────────────────────────────────────

function openAdd() {
  const swatches = PC.map((col, i) =>
    `<div class="cswatch" id="ncs-${i}" style="background:${col.bg};outline:1.5px solid ${col.bd}" onclick="selectNC(${i})"></div>`
  ).join('');
  document.getElementById('modal-inner').innerHTML = `<div class="modal-title">New project</div>
    <div class="fl"><span class="fl-lbl">Name</span><input class="fi" id="m-name" placeholder="Project name..."/></div>
    <div class="fl"><span class="fl-lbl">Stage</span><select class="fi" id="m-stage">${STAGES.map(s=>`<option value="${s.id}">${s.label}</option>`).join('')}</select></div>
    <div class="fl"><span class="fl-lbl">Summary</span><input class="fi" id="m-desc" placeholder="One-line description..."/></div>
    <div class="fl"><span class="fl-lbl">Goal</span><input class="fi" id="m-goal" placeholder="What does success look like?"/></div>
    <div class="fl" style="align-items:flex-start"><span class="fl-lbl" style="padding-top:5px">Color</span><div class="color-grid" id="nc-grid">${swatches}</div></div>
    <div class="modal-acts"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-accent" onclick="saveNew()">Add project</button></div>`;
  document.getElementById('modal-overlay').classList.add('open');
  selectNC(colorIdx % PC.length);
  setTimeout(() => document.getElementById('m-name').focus(), 50);
}

function selectNC(i) {
  pendingColor = i;
  document.querySelectorAll('#nc-grid .cswatch').forEach((sw, idx) => {
    sw.style.borderColor = idx === i ? 'rgba(255,255,255,.7)' : 'transparent';
  });
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function saveNew() {
  const name = document.getElementById('m-name').value.trim(); if (!name) return;
  const newP = {
    id: nextId++, name, color:pendingColor,
    stage: document.getElementById('m-stage').value,
    desc:  document.getElementById('m-desc').value.trim() || 'No description',
    goal:  document.getElementById('m-goal').value.trim(),
    subStages:    [{id:'ss1',label:'Idea'},{id:'ss2',label:'In progress'},{id:'ss3',label:'Done'}],
    subProjects:  [], openSubBoard:false,
    convo: {Goal:'',Ideas:'',Financing:'',Marketing:'',Team:'',Timeline:'',Risks:'','Action items':''},
    tickets:[], contacts:[], finances:[], people:[], openTab:null,
  };
  projects.push(newP);
  colorIdx++;
  closeModal();
  render();
  saveProject(newP);
}

// ── SUB-BOARD STAGE / PROJECT MODALS ─────────────────────────

function openAddSubProj(pid) {
  const p = projects.find(x => x.id === pid);
  const stageOpts = p.subStages.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
  document.getElementById('modal-inner').innerHTML = `<div class="modal-title">New sub-project — ${esc(p.name)}</div>
    <div class="fl"><span class="fl-lbl">Name</span><input class="fi" id="sp-name" placeholder="Sub-project name..."/></div>
    <div class="fl"><span class="fl-lbl">Stage</span><select class="fi" id="sp-stage">${stageOpts}</select></div>
    <div class="fl"><span class="fl-lbl">Description</span><input class="fi" id="sp-desc" placeholder="One-liner..."/></div>
    <div class="modal-acts"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-accent" onclick="saveSubProj(${pid})">Add</button></div>`;
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('sp-name').focus(), 50);
}

function saveSubProj(pid) {
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
  renderSubBoard(updated);
}

function openAddSubStage(pid) {
  document.getElementById('modal-inner').innerHTML = `<div class="modal-title">Add stage to sub-board</div>
    <div class="fl"><span class="fl-lbl">Label</span><input class="fi" id="ss-label" placeholder="e.g. In review, Blocked, Testing..."/></div>
    <div class="modal-acts"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-accent" onclick="saveSubStage(${pid})">Add stage</button></div>`;
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('ss-label').focus(), 50);
}

function saveSubStage(pid) {
  const label = document.getElementById('ss-label').value.trim(); if (!label) return;
  projects = projects.map(p => {
    if (p.id !== pid) return p;
    return {...p, subStages:[...p.subStages, {id:'ss'+Date.now(), label}]};
  });
  const p = projects.find(x => x.id === pid);
  if (p) saveProject(p);
  closeModal();
  renderSubBoard(p);
}
