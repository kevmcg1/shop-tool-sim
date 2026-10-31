// Settings > Background: the gradient behind the 3D view, the same in every tool. The default is a mix of blue and dark gray.
// Picking one dissolves the old gradient away in small cells, sweeping from one corner to the opposite one, and the new gradient builds in behind it
// (the same dissolve as the tools, but on the background only: the tool itself stays put). Kept in localStorage and shared by every tool, also while they are open.
(function(){
  const KEY = 'shop-tool-sim:bg';
  // each theme is a primary color over the dark gray edge (or black); the gradient runs from the primary, blended into the gray, out to the edge
  const EDGE = '#111214';
  const PRESETS = [
    { id: 'blue',     name: 'Blue',     a: '#3f6bb0', b: EDGE },
    { id: 'teal',     name: 'Teal',     a: '#2f9c95', b: EDGE },
    { id: 'green',    name: 'Green',    a: '#3f9a63', b: EDGE },
    { id: 'amber',    name: 'Amber',    a: '#c58a2c', b: EDGE },
    { id: 'red',      name: 'Red',      a: '#c0463f', b: EDGE },
    { id: 'purple',   name: 'Purple',   a: '#7b52b5', b: EDGE },
    { id: 'pink',     name: 'Pink',     a: '#c24f8f', b: EDGE },
    { id: 'graphite', name: 'Graphite', a: '#6c727a', b: EDGE },
    { id: 'black',    name: 'Black',    a: '#3a3d42', b: '#000000' }
  ];
  const HEX = /^#[0-9a-f]{6}$/i;
  const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, '0')).join('');
  const fromColors = (a, b) => { const c = mix(b, a, .55); return [c, mix(b, c, .5), b]; };
  let state = { id: 'blue', a: '#3f6bb0', b: EDGE };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && HEX.test(s.a) && HEX.test(s.b) && (s.id === 'custom' || PRESETS.some(p => p.id === s.id))) state = { id: s.id, a: s.a, b: s.b };
  } catch (e) {}
  const stops = () => fromColors(state.a, state.b);

  const CSS = `
@property --vg0{syntax:"<color>";inherits:true;initial-value:#2a436a}
@property --vg1{syntax:"<color>";inherits:true;initial-value:#1e2b3f}
@property --vg2{syntax:"<color>";inherits:true;initial-value:#111214}
:root{--vg0:#2a436a;--vg1:#1e2b3f;--vg2:#111214}
#view{isolation:isolate}
.bgfx{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none}
#view,.loading{background:radial-gradient(120% 90% at 50% 38%,var(--vg0) 0%,var(--vg1) 55%,var(--vg2) 100%)!important}
.bg-set{margin:14px 0 0;font-family:"Inter",system-ui,sans-serif}
.bg-set .bg-l{display:block;margin:0 0 8px;font-size:12px;font-weight:600;color:#c9ced4}
.bg-sw{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.bg-sw button{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:transparent;color:#ececee;border:1px solid #3d4147;font:500 12px/1.2 "Inter",system-ui,sans-serif;cursor:pointer;transition:border-color .2s ease,background-color .2s ease,color .2s ease}
.bg-sw button:hover{border-color:#8a8f97}
.bg-sw button[aria-pressed="true"]{border-color:#fff;background:rgba(255,255,255,.06)}
.bg-sw i{flex:none;width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:radial-gradient(circle at 50% 38%,var(--a),var(--b))}
.bg-cu{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.bg-cu label{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;border:1px solid #3d4147;border-radius:8px;font-size:12px;color:#c9ced4}
.bg-cu input{width:32px;height:24px;padding:0;border:1px solid #3d4147;border-radius:5px;background:none;cursor:pointer}
@media (prefers-reduced-motion: reduce){.bg-sw button{transition:none}}`;

  const root = document.documentElement;
  function paintVars(){ const s = stops(); root.style.setProperty('--vg0', s[0]); root.style.setProperty('--vg1', s[1]); root.style.setProperty('--vg2', s[2]); }
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  paintVars();

  let ui = null, busy = false, queued = false;
  function sync(){
    if (!ui) return;
    ui.sw.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === state.id)));
        ui.ca.value = state.a; ui.cb.value = state.b;
  }
  // the old gradient is drawn over the view and breaks away cell by cell from the top-left corner to the bottom-right, a faint blue line along the front,
  // while the new one (already set on the page) shows through and builds in behind it
  let shown = stops(), job = null;
  function endJob(){ if (job){ cancelAnimationFrame(job.raf); job.cv.remove(); job = null; } }
  function sweep(from){
    endJob();
    const view = document.getElementById('view');
    if (!view || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const W = view.clientWidth, H = view.clientHeight; if (!W || !H) return;
    const cv = document.createElement('canvas'); cv.className = 'bgfx'; cv.width = W; cv.height = H;
    view.insertBefore(cv, view.firstChild);
    const g = cv.getContext('2d');
    const N = 44, cw = W/N, ch = cw, rows = Math.ceil(H/ch);
    const rnd = (x, y) => { const v = Math.sin(x*127.1 + y*311.7)*43758.5453; return v - Math.floor(v); };
    const BAND = .1, JIT = .14, MS = 900;
    const old = document.createElement('canvas'); old.width = W; old.height = H;
    const og = old.getContext('2d');
    og.save(); og.translate(W*.5, H*.38); og.scale(W*1.2, H*.9);
    const gr = og.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, from[0]); gr.addColorStop(.55, from[1]); gr.addColorStop(1, from[2]);
    og.fillStyle = gr; og.fillRect(-2, -2, 4, 4); og.restore();
    const t0 = performance.now();
    const j = job = { cv, raf: 0 };
    const frame = now => {
      if (job !== j) return;
      const k = Math.min(1, (now - t0)/MS), e = k*k*(3 - 2*k), front = -BAND - JIT + e*(1 + 2*BAND + 2*JIT);
      g.clearRect(0, 0, W, H);
      g.drawImage(old, 0, 0);
      for (let r = 0; r < rows; r++) for (let c = 0; c < N; c++){
        const t = ((c + .5)*cw/W + (r + .5)*ch/H)/2 + (rnd(c, r) - .5)*JIT;
        if (t < front - 0.0001){ g.clearRect(c*cw - .5, r*ch - .5, cw + 1, ch + 1); }
        else if (t < front + BAND){ const a = 1 - (t - front)/BAND; g.clearRect(c*cw, r*ch, cw, ch); g.fillStyle = 'rgba(80,140,250,' + (.34*a*(1 - k*.5)).toFixed(3) + ')'; g.fillRect(c*cw, r*ch, cw, ch); }
      }
      if (k >= 1){ endJob(); return; }
      j.raf = requestAnimationFrame(frame);
    };
    j.raf = requestAnimationFrame(frame);
  }
  function change(){
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    sync();
    const from = shown; paintVars(); shown = stops();
    sweep(from);
  }
  function build(){
    if (ui) return;
    const host = (document.getElementById('realChk') || document.getElementById('gfxSel') || {}).closest && (document.getElementById('realChk') || document.getElementById('gfxSel')).closest('section');
    if (!host) return;
    const box = document.createElement('div'); box.className = 'bg-set';
    box.innerHTML = '<span class="bg-l">Background</span><div class="bg-sw" role="group" aria-label="Background gradient">' +
      PRESETS.map(p => { const c = fromColors(p.a, p.b); return `<button type="button" data-id="${p.id}" style="--a:${c[0]};--b:${c[2]}"><i></i>${p.name}</button>`; }).join('') + '</div>' +
      '<div class="bg-cu"><label>Primary color<input type="color" class="bg-a"></label><label>Edge<input type="color" class="bg-b"></label></div>';
    host.appendChild(box);
    ui = { sw: box.querySelector('.bg-sw'), cu: box.querySelector('.bg-cu'), ca: box.querySelector('.bg-a'), cb: box.querySelector('.bg-b') };
    ui.sw.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.dataset.id === state.id) return;
      const p = PRESETS.find(x => x.id === b.dataset.id); state = { id: p.id, a: p.a, b: p.b };
            change();
    });
    let t = 0;
    const custom = () => { state.id = 'custom'; state.a = ui.ca.value; state.b = ui.cb.value; sync(); endJob(); paintVars(); shown = stops(); clearTimeout(t); t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }, 200); };
    ui.ca.addEventListener('input', custom); ui.cb.addEventListener('input', custom);
    sync();
  }
  window.addEventListener('storage', e => {
    if (e.key !== KEY || !e.newValue) return;
    try { const n = JSON.parse(e.newValue); if (HEX.test(n.a) && HEX.test(n.b)) state = { id: n.id, a: n.a, b: n.b }; endJob(); paintVars(); shown = stops(); sync(); } catch (err) {}
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
