"use strict";
/* Gearworks — the side panel, dialogs and everything you click. */
(function(){
const U = GW.U, Types = GW.Types, G = () => GW.Gears;
const { TYPES, PARAMS, LINK_PARAMS, FINISH } = Types;
const $ = U.el, make = U.make;

/* settings that change what other controls show, so the panel is redrawn after them */
const CASCADE = new Set(['type', 'finish', 'chainPreset', 'beltPreset', 'bodyStyle', 'flange', 'hand', 'linkKind']);
/* numeric settings that show / hide other controls: redrawn when you let go, never mid-drag */
const REDRAW_ON_RELEASE = new Set(['holeN', 'keyW', 'chainPitch', 'rollerDia', 'beltPitch', 'pitchLineDiff', 'grooveDepth', 'grooveWidth', 'color']);
const NO_UNIT_RACK = { rpm: 'mm/s' };

const UI = GW.UI = {
  selId: null, tab: 'edit', openGroups: { Identity: true, Teeth: true, Profile: true, Body: true, 'Bore & hub': true, Mesh: true },
  partnerId: null, linkChoice: 'mesh',

  init(){
    UI.tabs = { gears: $('tabGears'), edit: $('tabEdit'), mesh: $('tabMesh'), scene: $('tabScene') };
    document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => UI.showTab(b.dataset.tab));
    $('addBtn').onclick = () => UI.openAdd();
    $('presetBtn').onclick = () => UI.showTab('scene', true);
    $('exportBtn').onclick = () => UI.openExport();
    $('fitBtn').onclick = () => GW.Scene.fit();
    $('spinBtn').onclick = () => { G().spin = !G().spin; UI.syncSpin(); };
    $('grab').onclick = () => $('panel').classList.toggle('closed');
    $('modalBg').onclick = e => { if(e.target === $('modalBg')) UI.closeModal(); };
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape'){ UI.closeModal(); }
      if(e.target.matches('input,select,textarea')) return;
      if((e.key === 'Delete' || e.key === 'Backspace') && UI.selId){ UI.deleteSel(); }
    });
    G().onChange((what, g) => UI.onGearsChanged(what, g));
    UI.refresh();
  },

  syncSpin(){ $('spinBtn').textContent = G().spin ? '⏸ pause' : '▶ play'; },

  /* ------------------------------------------------------------ selection */
  select(id, noTab){
    UI.selId = id;
    G().list.forEach(g => UI.paintGear(g));
    if(id != null && !noTab && UI.tab === 'gears') UI.tab = 'edit';
    if(id != null && !noTab) $('panel').classList.remove('closed');
    GW.Scene.updateHelpers(G().get(id));
    UI.refresh();
  },
  sel(){ return G().get(UI.selId); },

  showTab(t, scrollPresets){
    UI.tab = t;
    $('panel').classList.remove('closed');
    UI.refresh();
    if(scrollPresets){ const el = $('presetList'); if(el) el.scrollIntoView({ block: 'start' }); }
  },

  onGearsChanged(what, g){
    if(what === 'remove' && UI.selId === g.id) UI.selId = null;
    G().list.forEach(x => UI.paintGear(x));
    if(what === 'add' || what === 'remove' || what === 'load' || what === 'link' || what === 'edit') GW.Scene.updateHelpers(UI.sel());
  },

  /* tint gears: selected = warm glow, broken mesh = red */
  paintGear(g){
    const st = UI.linkStatus(g);
    const m = g.mesh.material;
    if(g.id === UI.selId){ m.emissive.setHex(0x2b1d03); m.emissiveIntensity = 1; }
    else if(st && !st.ok){ m.emissive.setHex(0x5a1212); m.emissiveIntensity = 1; }
    else { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; }
  },

  linkStatus(g){
    if(!g.parentId) return null;
    const P = G().get(g.parentId); if(!P) return null;
    return GW.Compat.check(P, g, { kind: g.linkKind === 'same shaft' ? 'shaft' : 'mesh' });
  },

  /* ------------------------------------------------------------ toasts / modal */
  toast(msg, ms){
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(UI._tt); UI._tt = setTimeout(() => t.classList.remove('show'), ms || 3200);
  },
  notes(list){ (list || []).forEach(n => UI.toast(n, 5000)); },
  openModal(html){
    $('modal').innerHTML = html; $('modalBg').classList.add('show');
  },
  closeModal(){ $('modalBg').classList.remove('show'); },

  /* ------------------------------------------------------------ refresh */
  refresh(){
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
    Object.keys(UI.tabs).forEach(k => { UI.tabs[k].style.display = k === UI.tab ? 'block' : 'none'; });
    UI.syncSpin();
    UI.renderGears();
    if(UI.tab === 'edit') UI.renderEdit();
    if(UI.tab === 'mesh') UI.renderMesh();
    if(UI.tab === 'scene') UI.renderScene();
    $('countBadge').textContent = G().list.length;
  },

  /* ------------------------------------------------------------ gears tab */
  renderGears(){
    if(UI.tab !== 'gears') return;
    const box = UI.tabs.gears; box.innerHTML = '';
    const list = G().list;
    if(!list.length){
      box.innerHTML = '<div class="hint pad">Nothing on the table yet.<br>Press <b>+ add gear</b> to pick a type, or open the <b>Scene</b> tab for ready-made assemblies.</div>';
      return;
    }
    const sec = make('div', 'sec'); sec.appendChild(make('h2', null, 'Gears on the table'));
    const chips = make('div', 'chips');
    // tree order: roots first, children indented under their parent
    const roots = list.filter(g => !g.parentId);
    const draw = (g, depth) => {
      const st = UI.linkStatus(g);
      const c = make('button', 'chip' + (g.id === UI.selId ? ' sel' : '') + (st && !st.ok ? ' bad' : ''));
      c.style.marginLeft = depth * 14 + 'px';
      c.innerHTML = `<span class="dot ${st ? (st.ok ? 'ok' : 'bad') : ''}"></span><b>${U.esc(g.name)}</b><span class="sub">${TYPES[g.type].label}${g.type !== 'rack' && g.type !== 'worm' ? ' · ' + g.z + 't' : ''}</span>`;
      c.onclick = () => UI.select(g.id);
      chips.appendChild(c);
      G().children(g.id).forEach(k => draw(k, depth + 1));
    };
    roots.forEach(r => draw(r, 0));
    sec.appendChild(chips);
    box.appendChild(sec);
  },

  /* ------------------------------------------------------------ edit tab */
  visibleIf(g, k){
    switch(k){
      case 'rimW': return g.type === 'internal' || g.type === 'splinehub' || (TYPES[g.type].keys.includes('bodyStyle') && g.bodyStyle !== 'solid');
      case 'webT': case 'webOff': return g.bodyStyle !== 'solid';
      case 'spokes': case 'spokeW': return g.bodyStyle === 'spoked';
      case 'holeD': case 'holePCD': return g.holeN > 0;
      case 'keyD': return g.keyW > 0;
      case 'flangeD': case 'flangeT': return g.flange !== 'none';
      case 'wormDia': case 'hand': case 'starts': return true;
      default: return true;
    }
  },

  renderEdit(){
    const box = UI.tabs.edit; box.innerHTML = '';
    const g = UI.sel();
    if(!g){
      box.innerHTML = '<div class="hint pad">Click a gear in the 3D view (or on the Gears tab) to edit it.<br><br>Every setting is here: tooth shape, body, bore, hub, position, speed and finish.</div>';
      return;
    }
    // stats
    const stats = make('div', 'sec stats');
    UI.fillStats(stats, g);
    box.appendChild(stats);

    // action buttons
    const act = make('div', 'sec btnrow');
    const mk = (label, cls, fn) => { const b = make('button', 'btn small ' + cls, label); b.onclick = fn; act.appendChild(b); };
    mk('duplicate', '', () => { const n = G().duplicate(g.id); UI.select(n.id); GW.Scene.fit(); });
    mk('export this gear', '', () => UI.openExport('selected'));
    mk('delete', 'danger', () => UI.deleteSel());
    box.appendChild(act);

    // groups
    const keys = TYPES[g.type].keys.concat(Types.ALWAYS, ['name', 'type']);
    const byGroup = {};
    const all = Object.assign({}, PARAMS);
    keys.forEach(k => { if(all[k]){ (byGroup[all[k][2]] = byGroup[all[k][2]] || []).push(k); } });
    const order = ['name', 'type'];
    Types.GROUP_ORDER.forEach(grp => {
      if(grp === 'Mesh') return;
      let ks = byGroup[grp]; if(!ks) return;
      // keep the declaration order of PARAMS
      const decl = Object.keys(PARAMS);
      ks = ks.filter((k, i) => ks.indexOf(k) === i).sort((a, b) => decl.indexOf(a) - decl.indexOf(b));
      ks = ks.filter(k => UI.visibleIf(g, k));
      if(grp === 'Placement' && g.parentId) {
        const d = make('details', 'grp'); d.open = !!UI.openGroups[grp];
        d.ontoggle = () => { UI.openGroups[grp] = d.open; };
        d.innerHTML = `<summary>${grp}</summary><div class="gbody"><div class="hint">This gear is placed by its mesh with <b>${U.esc(G().get(g.parentId).name)}</b>. Use the Mesh tab to move it, or un-mesh it to place it freely.</div></div>`;
        box.appendChild(d); return;
      }
      if(grp === 'Motion' && g.parentId){
        const d = make('details', 'grp'); d.open = true;
        d.innerHTML = `<summary>${grp}</summary><div class="gbody"><div class="row"><label>Speed</label><div class="ro" id="roSpeed"></div></div><div class="hint">Driven by <b>${U.esc(G().get(g.parentId).name)}</b>.</div></div>`;
        box.appendChild(d); UI.updateSpeedReadout(g); return;
      }
      const d = make('details', 'grp'); d.open = UI.openGroups[grp] !== false && (UI.openGroups[grp] || grp === 'Identity');
      if(UI.openGroups[grp] === undefined) d.open = ['Identity', 'Teeth', 'Profile', 'Body', 'Bore & hub', 'Worm', 'Chain', 'Belt', 'Cycloid', 'Ellipse'].includes(grp);
      d.ontoggle = () => { UI.openGroups[grp] = d.open; };
      d.appendChild(make('summary', null, grp));
      const body = make('div', 'gbody');
      ks.forEach(k => body.appendChild(UI.control(g, k)));
      d.appendChild(body); box.appendChild(d);
    });
    box.appendChild(make('div', 'spacer-b'));
  },

  fillStats(el, g){
    const rows = GW.Calc.stats(g);
    let html = `<h2>${U.esc(g.name)} <span class="tag">${TYPES[g.type].label}</span></h2><table>`;
    rows.forEach(r => { html += `<tr><td>${r[0]}</td><td>${r[1]} ${r[2]}</td></tr>`; });
    const st = UI.linkStatus(g);
    if(st) html += `<tr><td>Mesh</td><td class="${st.ok ? 'okc' : 'badc'}">${st.ok ? '● compatible' : '● not compatible'} with ${U.esc(G().get(g.parentId).name)}</td></tr>`;
    el.innerHTML = html + '</table>';
  },

  updateSpeedReadout(g){
    const el = $('roSpeed'); if(!el) return;
    const w = g.rt.omega;
    el.textContent = g.type === 'rack' ? U.fmt(Math.abs(w || 0), 2) + ' mm/s' : U.fmt(Math.abs((w || 0) * 30 / Math.PI), 2) + ' rpm' + (w < 0 ? ' (reverse)' : '');
  },

  /* one labelled control for one setting */
  control(g, key){
    const def = PARAMS[key] || LINK_PARAMS[key];
    const [label, kind, , min, max, step, unit, hint] = def;
    const row = make('div', 'row'); if(hint) row.title = hint;
    const lab = make('label', null, label); row.appendChild(lab);
    const apply = v => UI.queueSet(g, key, v);

    if(kind === 'text'){
      const i = make('input', 'txt'); i.type = 'text'; i.value = g[key]; i.oninput = () => apply(i.value); row.appendChild(i);
    } else if(kind === 'type'){
      const s = make('select');
      const groups = {};
      Object.keys(TYPES).forEach(t => { (groups[TYPES[t].group] = groups[TYPES[t].group] || []).push(t); });
      Object.keys(groups).forEach(gr => { const og = make('optgroup'); og.label = gr; groups[gr].forEach(t => { const o = make('option', null, TYPES[t].label); o.value = t; og.appendChild(o); }); s.appendChild(og); });
      s.value = g.type; s.onchange = () => { apply(s.value); UI.flush(); };
      row.appendChild(s);
    } else if(kind === 'sel'){
      const s = make('select'); const opts = unit;
      opts.forEach(o => { const op = make('option', null, FINISH[o] && key === 'finish' ? FINISH[o].label : o); op.value = o; s.appendChild(op); });
      s.value = g[key]; s.onchange = () => { apply(s.value); UI.flush(); };
      row.appendChild(s);
    } else if(kind === 'bool'){
      const c = make('input'); c.type = 'checkbox'; c.checked = !!g[key]; c.onchange = () => { apply(c.checked); UI.flush(); };
      row.appendChild(c);
    } else if(kind === 'color'){
      const c = make('input'); c.type = 'color'; c.value = g.color; c.oninput = () => apply(c.value); c.onchange = () => { UI.flush(); UI.afterEdit(true); };
      row.appendChild(c);
    } else {
      const r = make('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = g[key];
      const n = make('input', 'num'); n.type = 'number'; n.step = step; n.value = U.fmt(g[key], 4);
      n.dataset.key = key; r.dataset.key = key;
      r.oninput = () => { n.value = r.value; apply(+r.value); };
      const release = () => { UI.flush(); if(REDRAW_ON_RELEASE.has(key)) UI.afterEdit(true); };
      r.onchange = release;
      n.oninput = () => { if(n.value === '' || isNaN(+n.value)) return; r.value = n.value; apply(+n.value); };
      n.onchange = release;
      n.onkeydown = e => { if(e.key === 'Enter') n.blur(); };
      row.appendChild(r); row.appendChild(n);
      let u = unit || ''; if(g.type === 'rack' && NO_UNIT_RACK[key]) u = NO_UNIT_RACK[key];
      row.appendChild(make('span', 'unit', u));
      if(key === 'rpm' && g.type === 'rack') lab.textContent = 'Travel speed';
    }
    return row;
  },

  /* coalesce slider drags: one rebuild per animation frame */
  queueSet(g, key, val){
    UI._pending = UI._pending || new Map();
    UI._pending.set(g.id + ':' + key, { g, key, val });
    if(!UI._raf) UI._raf = requestAnimationFrame(() => UI.flush());
  },
  flush(){
    UI._raf = 0;
    const items = UI._pending ? [...UI._pending.values()] : [];
    if(UI._pending) UI._pending.clear();
    if(!items.length) return;
    let cascade = false;
    items.forEach(({ g, key, val }) => { UI.notes(G().set(g, key, val)); if(CASCADE.has(key)) cascade = true; });
    UI.afterEdit(cascade);
  },
  afterEdit(cascade){
    const g = UI.sel();
    G().list.forEach(x => UI.paintGear(x));
    GW.Scene.updateHelpers(g);
    UI.renderGears();
    if(cascade){ if(UI.tab === 'edit') UI.renderEdit(); if(UI.tab === 'mesh') UI.renderMesh(); return; }
    if(g && UI.tab === 'edit'){
      const stats = UI.tabs.edit.querySelector('.stats'); if(stats) UI.fillStats(stats, g);
      // echo clamped values back into the number boxes
      UI.tabs.edit.querySelectorAll('input.num').forEach(n => { if(document.activeElement !== n && g[n.dataset.key] != null) n.value = U.fmt(g[n.dataset.key], 4); });
    }
    if(UI.tab === 'mesh') UI.renderReport();
  },

  deleteSel(){
    const g = UI.sel(); if(!g) return;
    const kids = G().children(g.id).length;
    G().remove(g.id); UI.selId = null;
    UI.toast(`Deleted ${g.name}.` + (kids ? ` Its ${kids} meshed gear${kids > 1 ? 's were' : ' was'} left in place.` : ''));
    GW.Scene.updateHelpers(null); UI.refresh();
  },

  /* ------------------------------------------------------------ add dialog */
  openAdd(){
    const groups = {};
    Object.keys(TYPES).forEach(t => { (groups[TYPES[t].group] = groups[TYPES[t].group] || []).push(t); });
    let html = '<div class="mhead"><h3>Add a gear</h3><button class="btn small ghost" id="mClose">✕</button></div><div class="mbody">';
    Object.keys(groups).forEach(gr => {
      html += `<h4>${gr}</h4><div class="cards">`;
      groups[gr].forEach(t => { html += `<button class="card" data-t="${t}"><b>${TYPES[t].label}</b><span>${TYPES[t].desc}</span></button>`; });
      html += '</div>';
    });
    UI.openModal(html + '</div>');
    $('mClose').onclick = UI.closeModal;
    document.querySelectorAll('#modal .card').forEach(c => c.onclick = () => {
      UI.closeModal();
      const g = G().add(c.dataset.t);
      GW.Scene.fit();
      UI.tab = 'edit'; UI.select(g.id);
    });
  },

  /* ------------------------------------------------------------ mesh tab */
  renderMesh(){
    const box = UI.tabs.mesh; box.innerHTML = '';
    const g = UI.sel();
    if(!g){ box.innerHTML = '<div class="hint pad">Select a gear first, then connect it to another one here.</div>'; return; }
    const P = g.parentId ? G().get(g.parentId) : null;

    /* current connection */
    if(P){
      const sec = make('div', 'sec'); sec.appendChild(make('h2', null, 'Connected to'));
      const st = GW.Compat.check(P, g, { kind: g.linkKind === 'same shaft' ? 'shaft' : 'mesh' });
      sec.appendChild(UI.reportEl(P, g, st, true));
      const br = make('div', 'btnrow');
      const un = make('button', 'btn small', 'un-mesh'); un.onclick = () => { G().unlink(g.id); UI.toast(g.name + ' is free again.'); UI.refresh(); };
      br.appendChild(un);
      if(!st.ok && st.supported){
        const fx = make('button', 'btn small accent', 'fix this gear'); fx.onclick = () => { UI.fixLink(P, g, 'B'); }; br.appendChild(fx);
        if(st.issues.some(i => i.level === 'err' && i.optA)){ const fp = make('button', 'btn small', 'fix ' + P.name + ' instead'); fp.onclick = () => UI.fixLink(P, g, 'A'); br.appendChild(fp); }
      }
      sec.appendChild(br);
      // link settings
      ['linkKind', 'meshAngle', 'meshOffset', 'shaftOffset'].concat(st.kind === 'bevel' ? ['shaftAngle'] : [], g.linkKind === 'same shaft' ? ['shaftPhase'] : []).forEach(k => {
        if(k === 'meshOffset' && (g.linkKind === 'same shaft' || ['bevel', 'spline'].includes(st.kind))) return;
        if(k === 'meshAngle' && g.linkKind === 'same shaft') return;
        const row = UI.control(g, k);
        if(k === 'shaftOffset'){
          const lab = row.querySelector('label');
          if(st.kind === 'crown') lab.textContent = 'Slide along radius'; else if(st.kind === 'worm') lab.textContent = 'Slide along worm'; else if(st.kind === 'bevel') lab.textContent = 'Slide along own axis';
        }
        sec.appendChild(row);
      });
      box.appendChild(sec);
    }

    /* connect to another gear */
    const others = G().list.filter(x => x.id !== g.id && !G().descendants(g.id).some(d => d.id === x.id));
    const sec2 = make('div', 'sec'); sec2.appendChild(make('h2', null, P ? 'Re-connect to a different gear' : 'Mesh with another gear'));
    if(!others.length){
      sec2.appendChild(make('div', 'hint', 'Add a second gear to check whether they can mesh.'));
    } else {
      if(!others.some(o => o.id === UI.partnerId)) UI.partnerId = (P && others.some(o => o.id === P.id)) ? P.id : (others.find(o => GW.Compat.kindOf(o.type, g.type)) || others[0]).id;
      const rowP = make('div', 'row'); rowP.appendChild(make('label', null, 'Partner'));
      const sel = make('select');
      others.forEach(o => { const op = make('option', null, `${o.name} — ${TYPES[o.type].label}${o.type === 'rack' || o.type === 'worm' ? '' : ', ' + o.z + 't'}`); op.value = o.id; sel.appendChild(op); });
      sel.value = UI.partnerId; sel.onchange = () => { UI.partnerId = +sel.value; UI.renderReport(); };
      rowP.appendChild(sel); sec2.appendChild(rowP);
      const rowK = make('div', 'row'); rowK.appendChild(make('label', null, 'Connection'));
      const ks = make('select'); [['mesh', 'Mesh teeth'], ['same shaft', 'Same shaft (compound gear)']].forEach(([v, l]) => { const o = make('option', null, l); o.value = v; ks.appendChild(o); });
      ks.value = UI.linkChoice; ks.onchange = () => { UI.linkChoice = ks.value; UI.renderReport(); };
      rowK.appendChild(ks); sec2.appendChild(rowK);
      UI.reportHost = make('div'); sec2.appendChild(UI.reportHost);
      UI.btnHost = make('div', 'btnrow wrap'); sec2.appendChild(UI.btnHost);
    }
    box.appendChild(sec2);

    /* quick "add a matching partner" */
    const partners = GW.Compat.partnersOf(g.type);
    if(partners.length){
      const sec3 = make('div', 'sec'); sec3.appendChild(make('h2', null, `A ${TYPES[g.type].label} gear can mesh with`));
      sec3.appendChild(make('div', 'hint', 'Add a new gear that is already set up to fit this one:'));
      const row = make('div', 'chips');
      partners.forEach(t => {
        const b = make('button', 'chip', '+ ' + TYPES[t].label);
        b.onclick = () => UI.addMatching(g, t);
        row.appendChild(b);
      });
      sec3.appendChild(row); box.appendChild(sec3);
    }
    UI.renderReport();
  },

  reportEl(A, B, res, connected){
    const el = make('div', 'report ' + (res.ok ? 'ok' : 'bad'));
    let h = `<div class="head">${res.ok ? '● compatible' : (res.supported ? '● not compatible yet' : '● cannot mesh')}</div>`;
    if(res.ok) h += `<div>${U.esc(B.name)} ${connected ? 'meshes with' : 'can mesh with'} ${U.esc(A.name)}.${res.kind === 'shaft' ? '' : ' Same tooth size and pressure angle.'}</div>`;
    else h += `<div>To mesh <b>${U.esc(B.name)}</b> with <b>${U.esc(A.name)}</b> (${TYPES[A.type].label}), change:</div>`;
    const errs = res.issues.filter(i => i.level === 'err'), warns = res.issues.filter(i => i.level !== 'err');
    if(errs.length) h += '<ul>' + errs.map(i => `<li class="err">${i.text}${i.optA && i.optB ? '<div class="alt">or change the partner instead</div>' : ''}</li>`).join('') + '</ul>';
    if(warns.length) h += '<ul class="warns">' + warns.map(i => `<li class="warn">⚠ ${i.text}</li>`).join('') + '</ul>';
    if(res.info.length) h += '<table class="info">' + res.info.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('') + '</table>';
    el.innerHTML = h;
    return el;
  },

  renderReport(){
    if(UI.tab !== 'mesh' || !UI.reportHost) return;
    const g = UI.sel(), A = G().get(UI.partnerId);
    if(!g || !A) return;
    const link = { kind: UI.linkChoice === 'same shaft' ? 'shaft' : 'mesh' };
    const res = GW.Compat.check(A, g, link);
    UI.reportHost.innerHTML = ''; UI.reportHost.appendChild(UI.reportEl(A, g, res, g.parentId === A.id));
    const bh = UI.btnHost; bh.innerHTML = '';
    const mk = (label, cls, fn) => { const b = make('button', 'btn small ' + cls, label); b.onclick = fn; bh.appendChild(b); };
    const already = g.parentId === A.id && g.linkKind === UI.linkChoice;
    if(already){ bh.appendChild(make('div', 'hint', 'Already connected this way.')); return; }
    const kind = UI.linkChoice;
    if(res.ok) mk(kind === 'mesh' ? 'mesh them' : 'put on same shaft', 'accent', () => UI.doLink(A, g, kind, null));
    else if(res.supported){
      mk('fix this gear & mesh', 'accent', () => UI.doLink(A, g, kind, 'B'));
      if(res.issues.some(i => i.level === 'err' && i.optA)) mk(`fix ${A.name} & mesh`, '', () => UI.doLink(A, g, kind, 'A'));
      mk('mesh anyway', 'ghost', () => UI.doLink(A, g, kind, null, true));
    } else {
      const wantB = res.issues.find(i => i.id === 'type' && i.optB);
      if(wantB) mk(`change this gear to ${TYPES[wantB.optB.B.type].label}`, 'accent', () => UI.doLink(A, g, kind, 'B'));
      const wantA = res.issues.find(i => i.id === 'type' && i.optA);
      if(wantA) mk(`change ${A.name} to ${TYPES[wantA.optA.A.type].label}`, '', () => UI.doLink(A, g, kind, 'A'));
    }
  },

  fixLink(P, g, side){
    const plan = GW.Compat.plan(P, g, { kind: g.linkKind === 'same shaft' ? 'shaft' : 'mesh' }, side);
    G().applyPlan(P, g, plan);
    G().list.forEach(x => UI.paintGear(x));
    UI.toast('Settings changed so the teeth fit.'); UI.refresh();
  },

  doLink(A, g, kind, side, force){
    if(side){
      const plan = GW.Compat.plan(A, g, { kind: kind === 'same shaft' ? 'shaft' : 'mesh' }, side);
      G().applyPlan(A, g, plan);
    }
    if(!G().link(g.id, A.id, kind)) { UI.toast('Those two cannot be linked (it would make a loop).'); return; }
    G().list.forEach(x => UI.paintGear(x));
    GW.Scene.updateHelpers(g);
    const st = UI.linkStatus(g);
    UI.toast(st && !st.ok ? 'Linked, but the teeth do not fit — see the red items.' : (kind === 'mesh' ? `${g.name} is now meshed with ${A.name}.` : `${g.name} is keyed to ${A.name}'s shaft.`));
    UI.refresh();
  },

  addMatching(g, type){
    const n = G().add(type, { name: TYPES[type].short + ' for ' + g.name });
    // n becomes the child of g, with the fixes applied to the new gear only
    if(!GW.Compat.kindOf(g.type, type)) return;
    GW.meshAuto(n, g, 'mesh', 'B');
    UI.select(n.id, true); UI.tab = 'mesh';
    GW.Scene.fit();
    UI.toast(`Added a ${TYPES[type].label.toLowerCase()} gear that fits ${g.name}.`);
    UI.refresh();
  },

  /* ------------------------------------------------------------ scene tab */
  renderScene(){
    const box = UI.tabs.scene; box.innerHTML = '';
    const sec = make('div', 'sec'); sec.appendChild(make('h2', null, 'Playback'));
    const sp = make('div', 'row'); sp.appendChild(make('label', null, 'Speed'));
    const r = make('input'); r.type = 'range'; r.min = 0; r.max = 4; r.step = 0.05; r.value = G().speed;
    const v = make('div', 'val', G().speed.toFixed(2) + '×'); r.oninput = () => { G().speed = +r.value; v.textContent = (+r.value).toFixed(2) + '×'; };
    sp.appendChild(r); sp.appendChild(v); sec.appendChild(sp);
    const mkBool = (label, get, set) => { const row = make('div', 'row'); row.appendChild(make('label', null, label)); const c = make('input'); c.type = 'checkbox'; c.checked = get(); c.onchange = () => set(c.checked); row.appendChild(c); sec.appendChild(row); };
    mkBool('Grid', () => GW.Scene.grid.visible, v => { GW.Scene.grid.visible = v; });
    mkBool('Pitch circle & axis', () => GW.Scene.showHelpers, v => { GW.Scene.showHelpers = v; GW.Scene.updateHelpers(UI.sel()); });
    const q = make('div', 'row'); q.appendChild(make('label', null, 'Mesh quality'));
    const qs = make('select'); ['Draft (fast)', 'Normal', 'Fine (smooth export)'].forEach((l, i) => { const o = make('option', null, l); o.value = i; qs.appendChild(o); });
    qs.value = GW.Build.quality; qs.onchange = () => { GW.Build.quality = +qs.value; G().list.forEach(g => G().rebuild(g)); UI.toast('Rebuilt all gears.'); };
    q.appendChild(qs); sec.appendChild(q);
    box.appendChild(sec);

    const sec2 = make('div', 'sec'); sec2.id = 'presetList'; sec2.appendChild(make('h2', null, 'Ready-made assemblies'));
    sec2.appendChild(make('div', 'hint', 'Each is built with the same auto-fix you can use yourself, and is added beside what is already on the table.'));
    GW.Presets.forEach(p => {
      const b = make('button', 'card wide', `<b>${p.name}</b><span>${p.note}</span>`);
      b.onclick = () => { UI.addPreset(p); };
      sec2.appendChild(b);
    });
    const all = make('button', 'btn accent block', 'add one of everything (showcase)');
    all.onclick = () => { if(G().list.length && !confirm('Replace what is on the table with the showcase?')) return; G().clear(); UI.selId = null; GW.Presets.showcase(); GW.Scene.fit(); UI.toast('Showcase built: every kind of pair.'); UI.refresh(); };
    sec2.appendChild(all);
    box.appendChild(sec2);

    const sec3 = make('div', 'sec'); sec3.appendChild(make('h2', null, 'Project'));
    const br = make('div', 'btnrow wrap');
    const mk = (l, cls, fn) => { const b = make('button', 'btn small ' + cls, l); b.onclick = fn; br.appendChild(b); };
    mk('save project', '', () => UI.saveProject());
    mk('open project', '', () => $('openFile').click());
    mk('tidy up', '', () => { UI.tidy(); });
    mk('clear all', 'danger', () => { if(confirm('Remove every gear?')){ G().clear(); UI.selId = null; UI.refresh(); } });
    sec3.appendChild(br); box.appendChild(sec3);
    box.appendChild(make('div', 'spacer-b'));
  },

  addPreset(p){
    // find free ground to the right of everything on the table
    G().list.forEach(g => g.mesh.updateMatrixWorld(true));
    let maxX = -Infinity;
    G().list.forEach(g => { maxX = Math.max(maxX, g.rt.pos.x + G().reach(g)); });
    const x = isFinite(maxX) ? maxX + 70 : 0;
    const made = p.build(x, 0);
    G().list.forEach(g => UI.paintGear(g));
    UI.selId = made[0].id;
    GW.Scene.fit();
    UI.toast(p.name + ' added.');
    UI.tab = 'edit'; UI.refresh();
  },

  tidy(){
    const roots = G().list.filter(g => !g.parentId);
    let x = 0;
    roots.forEach(r => {
      const c = G().assemblyCircle(r);
      x += c.R; r.px = x - 0; r.py = 0;
      // keep the assembly's centre where the root is
      x += c.R + 12;
    });
    G().dirty = true; GW.Layout.solveAll();
    // re-centre
    const shift = x / 2 - 6;
    roots.forEach(r => { r.px -= shift; });
    G().dirty = true; GW.Scene.fit(); UI.refresh();
  },

  saveProject(){
    const blob = new Blob([JSON.stringify(G().toJSON(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'gearworks-project.json';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  },
  loadProject(file){
    const rd = new FileReader();
    rd.onload = () => {
      try { const d = JSON.parse(rd.result); if(d.app !== 'gearworks') throw new Error('not a Gearworks project'); UI.selId = null; G().fromJSON(d); GW.Scene.fit(); UI.toast('Project loaded.'); UI.refresh(); }
      catch(e){ UI.toast('Could not open that file: ' + e.message, 5000); }
    };
    rd.readAsText(file);
  },

  /* ------------------------------------------------------------ export dialog */
  openExport(scope){
    const g = UI.sel();
    const st = UI.exportState = Object.assign({ format: 'stl', scope: g ? 'assembly' : 'all', pose: 'world', split: false, drives: true, name: 'gearworks' }, UI.exportState || {}, scope ? { scope } : {});
    if(!g && st.scope !== 'all') st.scope = 'all';
    const radio = (name, val, label, sub) => `<label class="opt"><input type="radio" name="${name}" value="${val}" ${st[name] === val ? 'checked' : ''}><span><b>${label}</b>${sub ? '<small>' + sub + '</small>' : ''}</span></label>`;
    UI.openModal(`<div class="mhead"><h3>Export 3D files</h3><button class="btn small ghost" id="mClose">✕</button></div>
      <div class="mbody">
        <h4>Format</h4>
        <div class="opts">${radio('format', 'stl', 'STL', 'binary — 3D printing')}${radio('format', 'stla', 'STL (ASCII)', 'text, larger')}${radio('format', 'obj', 'OBJ', 'meshes, Blender')}${radio('format', 'step', 'STEP', 'CAD (faceted solid)')}</div>
        <h4>What to export</h4>
        <div class="opts col">${radio('scope', 'selected', 'Selected gear only', g ? U.esc(g.name) : 'select a gear first')}${radio('scope', 'assembly', 'Selected gear + everything it is connected to', g ? 'its whole assembly' : 'select a gear first')}${radio('scope', 'all', 'Everything on the table', G().list.length + ' gears')}</div>
        <h4>Layout</h4>
        <div class="opts col">${radio('pose', 'world', 'As assembled', 'gears where they are in the 3D view (includes chains and belts)')}${radio('pose', 'flat', 'Flat on the print bed', 'each gear lying on its face, side by side, bores centred on their own axis')}</div>
        <label class="chk"><input type="checkbox" id="xSplit" ${st.split ? 'checked' : ''}> one file per gear (downloads a .zip)</label>
        <div class="row"><label>File name</label><input class="txt" id="xName" value="${U.esc(st.name)}"></div>
        <div class="hint" id="xInfo"></div>
        <div class="btnrow"><button class="btn accent" id="xGo">download</button></div>
        <div class="hint">Units are millimetres, Z is up. STEP files are faceted solids (every tooth surface is made of small flat faces); they open in Fusion, FreeCAD, SolidWorks and Onshape as solid bodies.</div>
      </div>`);
    $('mClose').onclick = UI.closeModal;
    const update = () => {
      document.querySelectorAll('#modal input[type=radio]').forEach(r => { if(r.checked) st[r.name] = r.value; });
      st.split = $('xSplit').checked; st.name = $('xName').value;
      const solids = GW.Export.collect(st.scope, st.pose, UI.selId, st.pose === 'world');
      const s = GW.Export.stats(solids);
      $('xInfo').textContent = solids.length ? `${solids.length} part${solids.length > 1 ? 's' : ''} · ${s.tris.toLocaleString()} triangles · ${s.size.map(v => U.fmt(v, 1)).join(' × ')} mm` : 'Nothing to export.';
      $('xGo').disabled = !solids.length;
    };
    document.querySelectorAll('#modal input').forEach(i => i.oninput = update);
    update();
    $('xGo').onclick = () => {
      update();
      const files = GW.Export.files({ format: st.format, scope: st.scope, pose: st.pose, split: st.split, drives: st.drives, name: st.name }, UI.selId);
      if(!files.length) return;
      GW.Export.download(files, GW.Export.safe(st.name));
      UI.toast('Exported ' + files.map(f => f.name).slice(0, 3).join(', ') + (files.length > 3 ? '…' : ''));
      UI.closeModal();
    };
  }
};
})();
