// Settings > Background: the gradient behind the 3D view, the same in every tool. The default is a mix of blue and dark gray.
// Picking one dissolves the tool away, fades the background to the new gradient, and builds the tool back in
// (the same dissolve as switching tabs, js/dissolve.js). Kept in localStorage and shared by every tool, also while they are open.
(function(){
  const KEY = 'shop-tool-sim:bg';
  const PRESETS = [
    { id: 'blue',     name: 'Blue gray', c: ['#27426e', '#1b2433', '#111214'] },
    { id: 'graphite', name: 'Graphite',  c: ['#25282d', '#18191c', '#101113'] },
    { id: 'black',    name: 'Black',     c: ['#16171a', '#0b0b0d', '#000000'] },
    { id: 'forest',   name: 'Forest',    c: ['#1f3a2f', '#12251d', '#07100c'] },
    { id: 'plum',     name: 'Plum',      c: ['#38244a', '#221530', '#0e0814'] },
    { id: 'slate',    name: 'Slate',     c: ['#2c3a46', '#1b252d', '#0d1216'] }
  ];
  const HEX = /^#[0-9a-f]{6}$/i;
  const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, '0')).join('');
  const fromCustom = (a, b) => [a, mix(a, b, .6), b];
  let state = { id: 'blue', a: '#27426e', b: '#111214' };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && (PRESETS.some(p => p.id === s.id) || (s.id === 'custom' && HEX.test(s.a) && HEX.test(s.b)))) state = Object.assign(state, s);
  } catch (e) {}
  const stops = () => { const p = PRESETS.find(x => x.id === state.id); return p ? p.c : fromCustom(state.a, state.b); };

  const CSS = `
@property --vg0{syntax:"<color>";inherits:true;initial-value:#27426e}
@property --vg1{syntax:"<color>";inherits:true;initial-value:#1b2433}
@property --vg2{syntax:"<color>";inherits:true;initial-value:#111214}
:root{--vg0:#27426e;--vg1:#1b2433;--vg2:#111214;transition:--vg0 .7s ease,--vg1 .7s ease,--vg2 .7s ease}
#view,.loading{background:radial-gradient(120% 90% at 50% 38%,var(--vg0) 0%,var(--vg1) 55%,var(--vg2) 100%)!important}
.bg-set{margin:14px 0 0;font-family:"Inter",system-ui,sans-serif}
.bg-set .bg-l{display:block;margin:0 0 8px;font-size:12px;font-weight:600;color:#c9ced4}
.bg-sw{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.bg-sw button{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:transparent;color:#ececee;border:1px solid #3d4147;font:500 12px/1.2 "Inter",system-ui,sans-serif;cursor:pointer;transition:border-color .2s ease,background-color .2s ease,color .2s ease}
.bg-sw button:hover{border-color:#8a8f97}
.bg-sw button[aria-pressed="true"]{border-color:#fff;background:rgba(255,255,255,.06)}
.bg-sw i{flex:none;width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:radial-gradient(circle at 50% 38%,var(--a),var(--b))}
.bg-cu{display:none;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.bg-cu.on{display:grid}
.bg-cu label{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;border:1px solid #3d4147;border-radius:8px;font-size:12px;color:#c9ced4}
.bg-cu input{width:28px;height:20px;padding:0;border:1px solid #3d4147;border-radius:5px;background:none;cursor:pointer}
@media (prefers-reduced-motion: reduce){:root{transition:none}.bg-sw button{transition:none}}`;

  const root = document.documentElement;
  function paintVars(){ const s = stops(); root.style.setProperty('--vg0', s[0]); root.style.setProperty('--vg1', s[1]); root.style.setProperty('--vg2', s[2]); }
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  paintVars();

  let ui = null, busy = false, queued = false;
  function sync(){
    if (!ui) return;
    ui.sw.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === state.id)));
    ui.cu.classList.toggle('on', state.id === 'custom');
    ui.ca.value = state.a; ui.cb.value = state.b;
  }
  // dissolve the tool away, change the background while it is gone, build it back in
  function change(){
    const fx = window.__toolFx, still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    sync();
    if (!fx || still){ paintVars(); return; }
    if (busy){ queued = true; return; }
    busy = true;
    const fin = () => { busy = false; if (queued){ queued = false; change(); } };
    const back = () => { paintVars(); Promise.resolve(fx.in({ ms: 600 })).then(fin, fin); };
    Promise.resolve(fx.out({ ms: 380 })).then(back, back);
  }
  function build(){
    if (ui) return;
    const host = (document.getElementById('realChk') || document.getElementById('gfxSel') || {}).closest && (document.getElementById('realChk') || document.getElementById('gfxSel')).closest('section');
    if (!host) return;
    const box = document.createElement('div'); box.className = 'bg-set';
    box.innerHTML = '<span class="bg-l">Background</span><div class="bg-sw" role="group" aria-label="Background gradient">' +
      PRESETS.map(p => `<button type="button" data-id="${p.id}" style="--a:${p.c[0]};--b:${p.c[2]}"><i></i>${p.name}</button>`).join('') +
      '<button type="button" data-id="custom" style="--a:#5b93ea;--b:#101113"><i></i>Custom</button></div>' +
      '<div class="bg-cu"><label>Center<input type="color" class="bg-a"></label><label>Edge<input type="color" class="bg-b"></label></div>';
    host.appendChild(box);
    ui = { sw: box.querySelector('.bg-sw'), cu: box.querySelector('.bg-cu'), ca: box.querySelector('.bg-a'), cb: box.querySelector('.bg-b') };
    ui.sw.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.dataset.id === state.id) return;
      state.id = b.dataset.id;
            change();
    });
    let t = 0;
    const custom = () => { state.id = 'custom'; state.a = ui.ca.value; state.b = ui.cb.value; sync(); paintVars(); clearTimeout(t); t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }, 200); };
    ui.ca.addEventListener('input', custom); ui.cb.addEventListener('input', custom);
    sync();
  }
  window.addEventListener('storage', e => {
    if (e.key !== KEY || !e.newValue) return;
    try { Object.assign(state, JSON.parse(e.newValue)); paintVars(); sync(); } catch (err) {}
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
