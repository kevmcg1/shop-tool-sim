// the tools: each one's page is a text/html block in index.html (id "tool-<page>");
// the vernier caliper is the caliper page opened as the vernier
const APPS = [
  { id: 'caliper', ic: '<rect x="3" y="14" width="34" height="5" rx="1"/><path d="M3 14V8h3v6M3 19v4h3v-4"/><path d="M10 14V8h3v6M10 19v4h3v-4"/><circle cx="24" cy="9" r="6.5"/><path d="M24 9l3-3.2"/><circle cx="24" cy="9" r=".8"/>', name: 'Dial caliper', page: 'caliper' },
  { id: 'vernier', ic: '<rect x="3" y="14" width="34" height="5" rx="1"/><path d="M3 14V8h3v6M3 19v4h3v-4"/><path d="M10 14V8h3v6M10 19v4h3v-4"/><rect x="10" y="9" width="12" height="5"/><path d="M16 14v2M20 14v2M24 14v2M28 14v2M32 14v2" stroke-width="1"/>', name: 'Vernier caliper', page: 'caliper', inst: 'vern' },
  { id: 'micrometer', ic: '<path d="M6 10v10h16v-9"/><rect x="6" y="6" width="4" height="4"/><path d="M12 8h4"/><rect x="16" y="5" width="12" height="6"/><rect x="26" y="3" width="10" height="10" rx="1"/><path d="M29 3v10M32 3v10" stroke-width="1"/>', name: 'Outside micrometer', page: 'micrometer' },
  { id: 'depth', ic: '<rect x="3" y="15" width="24" height="3" rx="1"/><rect x="9" y="1.5" width="12" height="5" rx="1"/><rect x="11" y="6.5" width="8" height="8.5"/><path d="M15 18v5"/><path d="M13 9h4M13 12h4" stroke-width="1"/>', name: 'Depth micrometer', page: 'depth' },
  { id: 'height', ic: '<rect x="3" y="19" width="16" height="4" rx="1"/><rect x="8" y="2" width="5" height="17"/><rect x="6" y="7" width="9" height="6"/><path d="M15 9.5h18v5"/><path d="M8 5h2M8 8h2M8 11h2M8 14h2" stroke-width="1"/>', name: 'Height gage', page: 'height' },
  { id: 'telescopic', ic: '<circle cx="7" cy="7" r="2.8"/><circle cx="33" cy="7" r="2.8"/><path d="M9.8 7h20.4"/><rect x="18" y="7" width="4" height="11"/><rect x="16" y="18" width="8" height="5" rx="1"/>', name: 'Telescopic gauge', page: 'telescopic' }
];
// links inside a tool that open another tool switch tabs instead
const LINKS = { 'depth-micrometer.html': 'depth', 'depth-micrometer-trainer.html': 'depth', 'height-gage.html': 'height', 'micrometer.html': 'micrometer', 'dial-caliper-trainer.html': 'caliper' };
// a tool's page as text, ready for its frame (relative css/ and js/ paths resolve against this page)
// every file a tool's page needs: its scripts, styles and fonts (and, for the pages built on three.js modules, those modules), so the
// loading screen can say how many of them have arrived ("12 / 31 assets")
const FROM_DISK = location.protocol === 'file:';
const CDN3 = 'https://cdn.jsdelivr.net/npm/three@0.170.0/';
// A page opened straight from disk (file://) has no origin, so the browser refuses the local ES modules and fonts that a hosted page loads
// without trouble. From disk they come from the CDN instead, as they always did.
function forDisk(html){
  return html
    .replace('./vendor/three/three.module.min.js?v=1', CDN3 + 'build/three.module.js')
    .replace('./vendor/three/addons/', CDN3 + 'examples/jsm/')
    .replace(/<link rel="preload" href="fonts\/inter[^>]*>\s*<style>@font-face[\s\S]*?<\/style>/, '<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">');
}
function assetsOf(html){
  const out = [], add = u => { if (u && !/^(data:|#|javascript:)/.test(u) && out.indexOf(u) < 0) out.push(u); };
  html.replace(/<script\b[^>]*\ssrc="([^"]+)"/g, (m, u) => { add(u); return m; });
  html.replace(/<link\b[^>]*>/g, tag => { if (/rel="(stylesheet|preload|modulepreload)"/.test(tag)){ const h = /\shref="([^"]+)"/.exec(tag); if (h) add(h[1]); } return tag; });
  if (/type="importmap"/.test(html)) (FROM_DISK ? [CDN3 + 'build/three.module.js', CDN3 + 'examples/jsm/controls/OrbitControls.js', CDN3 + 'examples/jsm/environments/RoomEnvironment.js', CDN3 + 'examples/jsm/utils/BufferGeometryUtils.js']
    : ['vendor/three/three.module.min.js?v=1', 'vendor/three/addons/controls/OrbitControls.js', 'vendor/three/addons/environments/RoomEnvironment.js', 'vendor/three/addons/utils/BufferGeometryUtils.js']).forEach(add);
  if (!FROM_DISK) add('fonts/bebas-neue-latin-400-normal.woff2?v=1');
  return out;
}
function pageFor(a){
  let html = document.getElementById('tool-' + a.page).textContent.replace(/<\\\/script>/g, '</script>');
  if (FROM_DISK) html = forDisk(html);
  html = html.replace('<head>', '<head><script>window.__ASSETS=' + JSON.stringify(assetsOf(html)) + '</' + 'script>');
  if (a.inst) html = html.replace('<head>', '<head><script>window.__INST=' + JSON.stringify(a.inst) + '</' + 'script>');
  return html;
}
// no right-click menu, and no view-source or developer-tools shortcuts (Ctrl+U, Ctrl+Shift+I/J/C, F12,
// and the Mac Cmd+Option versions), on this page and inside every tool's frame
function lockDown(w){
  if (!w || w.__lockedDown) return;
  w.__lockedDown = true;
  w.addEventListener('contextmenu', e => e.preventDefault(), true);
  // the backtick key opens the dev panel (js/devmode.js), also while a tool's frame has the keyboard (the page itself hears it directly)
  if (w !== window) w.addEventListener('keydown', e => {
    if (e.key !== '`' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && /^(text|number|search|email|password|tel|url)$/.test(t.type || 'text')))) return;
    e.preventDefault(); if (window.__devToggle) window.__devToggle();
  }, true);
  w.addEventListener('keydown', e => {
    const k = (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (k === 'f12' || (mod && k === 'u') || (mod && (e.shiftKey || e.altKey) && ['i', 'j', 'c', 'u'].includes(k))){
      e.preventDefault(); e.stopPropagation();
    }
  }, true);
}
lockDown(window);
(function(){
  const tabs = document.getElementById('tabs'), stage = document.getElementById('stage');
  const frames = {};
  // the glowing line under the open tab, which slides to whichever tab opens
  const ink = document.createElement('span'); ink.className = 'tab-ink'; ink.setAttribute('aria-hidden', 'true');
  // it slides when you switch tabs, and simply appears in place on load and on resize
  const placeInk = (instant) => {
    const t = tabs.querySelector('.tab[aria-selected="true"]'); if (!t) return;
    if (instant === true || !ink.dataset.placed) ink.style.transition = 'none';
    ink.style.width = t.offsetWidth - 24 + 'px';
    ink.style.transform = 'translate(' + (t.offsetLeft + 12) + 'px,' + (t.offsetTop + t.offsetHeight + 7) + 'px)';
    ink.style.opacity = '1';
    if (ink.style.transition){ void ink.offsetWidth; ink.style.transition = ''; }
    ink.dataset.placed = '1';
  };
  window.addEventListener('resize', () => placeInk(true));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeInk(true));
  let current = null;
  APPS.forEach(a => {
    const b = document.createElement('a');
    b.className = 'tab'; b.href = '#' + a.id; b.setAttribute('role', 'tab'); b.id = 'tab-' + a.id;
    b.setAttribute('aria-label', a.name);
    if (a.badge){ const n = document.createElement('span'); n.className = 'tab-new'; n.textContent = a.badge; n.setAttribute('aria-hidden', 'true'); b.appendChild(n); }   // (a small label on the left of the name)
    if (a.ic){ const ic = document.createElement('span'); ic.className = 'tab-ic'; ic.setAttribute('aria-hidden', 'true'); ic.innerHTML = '<svg viewBox="0 0 40 25" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + a.ic + '</svg>'; b.appendChild(ic); }   // (a small line drawing of the tool above its name)
    const tx = document.createElement('span'); tx.textContent = a.name; b.appendChild(tx); b.setAttribute('aria-selected', 'false'); b.setAttribute('aria-controls', 'app-' + a.id);
    b.addEventListener('click', e => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return; e.preventDefault(); show(a.id); });
    tabs.appendChild(b);
  });
  tabs.appendChild(ink);
  // each app gets its own frame the first time it is opened, and keeps its state after that
  function frameFor(a, warm){
    if (frames[a.id]) return frames[a.id];
    const f = document.createElement('iframe');
    if (warm){ f.dataset.warm = '1'; f.classList.add('warm'); }
    f.id = 'app-' + a.id; f.title = a.name; f.setAttribute('role', 'tabpanel');
    f.setAttribute('allow', 'fullscreen; autoplay');
    f.addEventListener('load', () => {
      if (current !== a.id && !f.dataset.warm) pause(f, true);
      try { lockDown(f.contentWindow); } catch (err) {}
      try {
        f.contentDocument.addEventListener('click', e => {
          const link = e.target.closest && e.target.closest('a[href]');
          if (!link) return;
          const file = decodeURIComponent(link.getAttribute('href').split('#')[0].split('?')[0].split('/').pop());
          if (LINKS[file]){ e.preventDefault(); show(LINKS[file]); }
        }, true);
      } catch (err) {}
    });
    f.srcdoc = pageFor(a);
    stage.appendChild(f);
    return frames[a.id] = f;
  }
  // Every frame request goes through a gate: a callback that comes due while the tool is hidden is
  // held instead of run, and held ones run once when it shows again. Holding at run time (not at
  // request time) keeps exactly one callback in flight per loop, so a quick hide-and-show can never
  // start a second copy of a tool's animation loop.
  function pause(f, off){
    let w; try { w = f.contentWindow; } catch (e) { return; }
    if (!w) return;
    if (!w.__rafGate){
      const real = w.requestAnimationFrame.bind(w);
      w.__rafGate = true; w.__rafHeld = []; w.__rafPaused = false;
      w.requestAnimationFrame = cb => real(t => { if (w.__rafPaused) w.__rafHeld.push(cb); else cb(t); });
    }
    w.__rafPaused = off;
    if (!off) w.__rafHeld.splice(0).forEach(cb => w.requestAnimationFrame(cb));
  }
  // Switching tools: the open tool dissolves away first (js/dissolve.js), then the new tab's tool shows and builds
  // in. The tab lights up at once; clicking on meanwhile just changes which tool comes next.
  const toolFx = f => { try { return f && f.contentWindow && f.contentWindow.__toolFx; } catch (e) { return null; } };
  const QUICK_OUT = { ms: 320 }, QUICK_IN = { ms: 480 };   // (a tool changed by its tab dissolves out and in quickly, with no wait for anything to load)
  let pend = null;
  function show(id){
    const a = APPS.find(x => x.id === id) || APPS[0];
    if (pend){ pend.id = a.id; mark(a); return; }
    if (current === a.id) return;
    // the phase tracker (js/bubbles.js): a tool is being changed, which the tool's page reads to arrive gently rather than as the page loading
    if (current && window.__setPhase){ window.__setPhase('switch'); setTimeout(() => { if (window.__phase === 'switch') window.__setPhase('ready'); }, 20000); }
    const fx = current && toolFx(frames[current]);
    if (fx && !matchMedia('(prefers-reduced-motion: reduce)').matches){
      pend = { id: a.id }; mark(a);
      const go = () => { if (!pend) return; const n = pend.id; pend = null; swap(n); };
      Promise.resolve(fx.out(QUICK_OUT)).then(go, go);
      setTimeout(go, 1000);   // never stuck on a tool that doesn't answer
      return;
    }
    swap(a.id);
  }
  // the tab, the address and the remembered tool follow the choice straight away
  function mark(a){
    tabs.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.id === 'tab-' + a.id)));
    placeInk();
    document.title = 'Shop Tool Sim';
    if (location.hash !== '#' + a.id) history.replaceState(null, '', '#' + a.id);
    try { localStorage.setItem('precision-tools-last', a.id); } catch (e) {}
  }
  function swap(id){
    const a = APPS.find(x => x.id === id) || APPS[0];
    mark(a);
    // back to the tool that was going: it builds in again where it is
    if (current === a.id){ const fx = toolFx(frames[a.id]); if (fx) fx.in(); return; }
    current = a.id;
    const f = frameFor(a);
    Object.values(frames).forEach(x => { x.classList.toggle('on', x === f); pause(x, x !== f); });
    // a hidden frame has no size, so its layout is stale: have it lay itself out again now it shows
    const relayout = () => { try { f.contentWindow.dispatchEvent(new Event('resize')); } catch (err) {} };
    requestAnimationFrame(relayout); setTimeout(relayout, 250);
    // The tools are all loaded in the background (warmUp, below), so changing tabs never loads or pops anything: the tool that is
    // there dissolves back in (a tool opened before its warm-up got to it builds in by itself as it finishes loading). The bubbles
    // are only for the page loading.
    const fx = toolFx(f);
    if (f.dataset.warm){ delete f.dataset.warm; f.classList.remove('warm'); pause(f, false); }
    const settled = () => { if (window.__phase === 'switch' && window.__setPhase) window.__setPhase('ready'); };
    if (fx) Promise.resolve(fx.in(QUICK_IN)).then(settled, settled); else settled();
    setTimeout(() => { try { f.focus(); } catch (e) {} }, 50);
    dockSync();
  }
  // The Telescopic gauge tab can also measure its gauge on a tool's own, full simulator, in a panel on the right: the gauge flies
  // across the screen (the lab animates that), the tool opens in the panel, puts the gauge on and measures it. The lab folds its
  // side panel away to make room, and says where to click to bring it back (the card with "See where"). The tabs along the top
  // of the panel swap between the three tools; the X closes it, and the gauge flies home.
  const DOCK_TOOLS = ['micrometer', 'caliper', 'vernier'];
  const dock = { open: false, tool: null, payload: null, frames: {}, el: null, labWas: null };
  const labWin = () => { try { return frames.telescopic && frames.telescopic.contentWindow; } catch (err) { return null; } };
  function dockBuild(){
    if (dock.el) return;
    const d = document.createElement('div');
    d.className = 'dock'; d.id = 'dock'; d.hidden = true;
    d.innerHTML = '<div class="dock-bar"><div class="dock-tabs" role="tablist" aria-label="Measure the gauge with"></div><span class="dock-note"></span><button type="button" class="dock-x" aria-label="Close the panel" title="Close the panel and bring the sidebar back">✕</button></div><div class="dock-body"></div>';
    stage.appendChild(d);
    dock.el = d; dock.tabs = d.querySelector('.dock-tabs'); dock.note = d.querySelector('.dock-note'); dock.body = d.querySelector('.dock-body');
    DOCK_TOOLS.forEach(id => {
      const a = APPS.find(x => x.id === id), b = document.createElement('button');
      b.type = 'button'; b.dataset.t = id; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', 'false'); b.textContent = a.name;
      b.addEventListener('click', () => openDock(id, dock.payload, { fly: labPending() }));
      dock.tabs.appendChild(b);
    });
    d.querySelector('.dock-x').addEventListener('click', closeDock);
  }
  function dockFrame(a){
    const f = document.createElement('iframe');
    f.id = 'dock-' + a.id; f.title = a.name + ' (beside the gauge)';
    f.setAttribute('allow', 'fullscreen; autoplay');
    f.addEventListener('load', () => {
      try { lockDown(f.contentWindow); } catch (err) {}
      // the tool's own side panel folds away: half a screen is for the 3D view and the reading
      try { const w = f.contentWindow; w.document.body.classList.add('side-off'); const sb = w.document.getElementById('sideBtn'); if (sb) sb.setAttribute('aria-pressed', 'true'); w.dispatchEvent(new Event('resize')); } catch (err) {}
      dockPause();
    });
    f.srcdoc = pageFor(a);
    dock.body.appendChild(f);
    return f;
  }
  const dockShowing = () => dock.open && current === 'telescopic';
  function dockPause(){ Object.keys(dock.frames).forEach(id => pause(dock.frames[id], !(dockShowing() && id === dock.tool))); }
  // show or hide the panel to match: only on the gauge tab, and only while it is open
  function dockSync(){
    if (!dock.el) return;
    const on = dockShowing(), lab = frames.telescopic;
    dock.el.hidden = !on;
    stage.classList.toggle('docked', on);
    if (lab){
      lab.classList.toggle('docked', on);
      try {
        const b = lab.contentDocument.body;
        if (on){ if (dock.labWas === null) dock.labWas = b.classList.contains('side-off'); b.classList.add('side-off'); }
        else if (dock.labWas !== null){ b.classList.toggle('side-off', dock.labWas); dock.labWas = null; }
        b.classList.toggle('dock-open', on);
        const sb = lab.contentDocument.getElementById('sideBtn'); if (sb) sb.setAttribute('aria-pressed', String(b.classList.contains('side-off')));
      } catch (err) {}
    }
    if (!on) hideWhere();
    dockPause();
    try { const L = labWin(); if (L && L.__lab && L.__lab.overlay) L.__lab.overlay(on); } catch (err) {}   // the gauge drawn over the panel goes when the panel does
    // the frames change width while the panel slides: lay them out again once it has settled
    setTimeout(() => { [lab, dock.frames[dock.tool]].forEach(f => { try { f && f.contentWindow.dispatchEvent(new Event('resize')); } catch (err) {} }); }, 460);
  }
  const labPending = () => { try { const L = labWin().__lab; return !!(L && L.pending && L.pending()); } catch (err) { return false; } };
  function openDock(id, p, opts){
    if (opts && opts.fly){ try { labWin().__lab.swapping(); } catch (err) {} }   // (already over on a tool: its gauge waits for the next one)
    const a = APPS.find(x => x.id === id); if (!a || !DOCK_TOOLS.includes(id)) return;
    dockBuild();
    const prev = dock.frames[dock.tool], same = dock.tool === id;
    dock.open = true; dock.tool = id; dock.payload = p || dock.payload;
    const fresh = !dock.frames[id];
    const f = dock.frames[id] || (dock.frames[id] = dockFrame(a));
    let went = false;   // (it is asked twice on purpose, as a backup, and must only happen once)
    const go = () => {
      if (went) return; went = true;
      [...dock.body.children].forEach(x => x.classList.toggle('on', x === f));
      [...dock.tabs.children].forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === id)));
      if (dock.payload) dock.note.textContent = 'Gauge ' + dock.payload.gauge + ' · ' + (dock.payload.mm/25.4).toFixed(4) + ' in (' + dock.payload.mm.toFixed(2) + ' mm)';
      dockSync();
      // a tool that was already built dissolves back in (a new one builds in by itself as it loads)
      if (!fresh && !same){ const fx = toolFx(f); if (fx) fx.in(); }
      give(f, dock.payload, !!(opts && opts.fly));
    };
    // the tool that was showing dissolves away first, then the new one
    const pfx = prev && !same && dock.el && !dock.el.hidden ? toolFx(prev) : null;
    if (pfx && !matchMedia('(prefers-reduced-motion: reduce)').matches){ Promise.resolve(pfx.out()).then(go, go); setTimeout(go, 2000); } else go();
  }
  function closeDock(){
    dock.open = false; dockSync();
    const w = labWin(); try { w && w.__lab && w.__lab.gaugeBack(); } catch (err) {}   // the gauge flies home
  }
  // "See where": the screen dims and an arrow runs from the lab's hint card to the panel's X
  let where = null;
  function hideWhere(){
    if (!where) return;
    const w = where; where = null; w.classList.remove('on'); setTimeout(() => w.remove(), 320);
  }
  // The screen dims with two lit windows: the panel's X, with a pulsing ring, and a dashed ghost of the sidebar where it comes back to.
  // An arrow draws itself from one to the other, and the note beside the X says what happens when it is clicked (or does it for you).
  function showWhere(){
    const x = dock.el && !dock.el.hidden && dock.el.querySelector('.dock-x'); if (!x || where) return;
    const W = innerWidth, H = innerHeight, xr = x.getBoundingClientRect();
    let lr = { left: 0, top: 0, width: Math.min(320, W*0.4), height: H };
    try { const r = frames.telescopic.getBoundingClientRect(); if (r.width > 40) lr = r; } catch (err) {}
    const gw = Math.min(310, lr.width*0.42), gx = lr.left + 6, gy = lr.top + 6, gh = Math.max(80, lr.height - 12);   // the sidebar's spot on the lab's left edge
    const cx = xr.left + xr.width/2, cy = xr.top + xr.height/2, R = xr.width/2 + 8;
    // the arrow: from the ghost's right edge, in a smooth S, to the left of the X; the head points along the last stretch
    const sx = gx + gw + 4, sy = gy + Math.min(gh*0.46, 220), ex = cx - R - 6, ey = cy, d = Math.max(60, ex - sx);
    const c1x = sx + d*0.5, c1y = sy, c2x = ex - d*0.45, c2y = ey, hx = ex, hy = ey, L = 17, ang = Math.atan2(ey - c2y, ex - c2x) || 0;
    const p1 = (hx - L*Math.cos(ang - 0.45)) + ',' + (hy - L*Math.sin(ang - 0.45)), p2 = (hx - L*Math.cos(ang + 0.45)) + ',' + (hy - L*Math.sin(ang + 0.45));
    const ov = document.createElement('div');
    ov.className = 'where'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Where the sidebar went');
    const capW = Math.min(300, W - 24), capL = Math.max(12, Math.min(W - capW - 12, xr.right - capW)), below = xr.bottom + 150 < H;
    ov.innerHTML =
      '<svg aria-hidden="true" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><defs><mask id="whereMask"><rect width="' + W + '" height="' + H + '" fill="#fff"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="#000"/><rect x="' + gx + '" y="' + gy + '" width="' + gw + '" height="' + gh + '" rx="12" fill="#000"/></mask></defs>' +
      '<rect width="' + W + '" height="' + H + '" fill="rgba(4,5,7,.8)" mask="url(#whereMask)"/>' +
      '<rect class="where-ghost" x="' + gx + '" y="' + gy + '" width="' + gw + '" height="' + gh + '" rx="12"/>' +
      '<circle class="where-pulse" cx="' + cx + '" cy="' + cy + '" r="' + R + '"/><circle class="where-ring" cx="' + cx + '" cy="' + cy + '" r="' + R + '"/>' +
      '<path class="where-arrow" d="M' + sx + ',' + sy + ' C' + c1x + ',' + c1y + ' ' + c2x + ',' + c2y + ' ' + (ex - L*0.5*Math.cos(ang)) + ',' + (ey - L*0.5*Math.sin(ang)) + '"/>' +
      '<polygon class="where-head" points="' + hx + ',' + hy + ' ' + p1 + ' ' + p2 + '"/></svg>' +
      '<div class="where-tag" style="left:' + (gx + 14) + 'px;top:' + (gy + 14) + 'px"><b>Your sidebar</b><span>comes back right here</span></div>' +
      '<div class="where-cap" style="left:' + capL + 'px;width:' + capW + 'px;' + (below ? 'top:' + (xr.bottom + 22) + 'px' : 'bottom:' + (H - xr.top + 22) + 'px') + '"><b>Click the X</b>' +
      '<span>It closes this tool, the gauge flies home and the sidebar slides back in.</span>' +
      '<div class="where-btns"><button type="button" data-act="close">Close it for me</button><button type="button" data-act="ok">Got it</button></div></div>';
    ov.addEventListener('click', e => {
      const btn = e.target.closest && e.target.closest('button');
      if (btn && btn.dataset.act === 'close'){ hideWhere(); closeDock(); return; }
      hideWhere();
    });
    document.body.appendChild(ov); void ov.offsetWidth; ov.classList.add('on'); where = ov;
    const first = ov.querySelector('button'); if (first) try { first.focus({ preventScroll: true }); } catch (err) {}
  }
  document.addEventListener('keydown', e => { if (where && e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); hideWhere(); } }, true);
  // Once the tool has completely loaded, put the gauge on it. With `fly` the gauge from the lab is flying over: the tool builds its own gauge
  // out of sight and, once that has settled, says where it sits on screen; the lab flies its gauge to that spot, and the moment it lands
  // the tool shows its gauge there (reveal) and measures it. Without `fly` (swapping tools with the gauge already over), it just goes on.
  function give(f, p, fly){
    if (!p) return;
    const t0 = Date.now(), key = (give.n = (give.n || 0) + 1);
    const lab = () => { try { return labWin().__lab; } catch (err) { return null; } };
    const settle = w => {
      let last = null, still = 0; const s0 = Date.now();
      const poll = () => {
        if (give.n !== key) return;
        let sp = null; try { sp = w.__tgSpot && w.__tgSpot(); } catch (err) {}
        still = sp && last && Math.abs(sp.x - last.x) < 1 && Math.abs(sp.y - last.y) < 1 && Math.abs(sp.ppm - last.ppm) < 0.01*sp.ppm ? still + 1 : 0;
        last = sp;
        if ((sp && still >= 4) || Date.now() - s0 > 45000){   // (a slow machine takes a long while to build the caliper's gauge: wait for it to settle rather than give up early)
          const fr = f.getBoundingClientRect(), L = lab();
          if (!sp){ try { w.__tgShow && w.__tgShow(); } catch (err) {} }   // no pose to fly to: let the tool show its own gauge
          if (L && L.toolReady) L.toolReady(sp ? { x: fr.left + sp.x, y: fr.top + sp.y, ppm: sp.ppm, ax: sp.ax, hd: sp.hd, sl: sp.sl, lk: sp.lk, fp: sp.fp } : null);
          return;
        }
        setTimeout(poll, 120);
      };
      poll();
    };
    const tryIt = () => {
      if (give.n !== key) return;   // a newer gauge was handed over meanwhile
      let w; try { w = f.contentWindow; } catch (err) { return; }
      const ready = w && typeof w.__tgLoad === 'function' && w.document && w.document.readyState === 'complete' && !w.document.getElementById('loading');
      if (!ready){ if (Date.now() - t0 < 300000) setTimeout(tryIt, 250); return; }   // (a slow machine can take minutes to load a tool for the first time)
      setTimeout(() => {
        if (give.n !== key) return;
        const g = { mm: p.mm, truth: p.truth, gauge: p.gauge, practice: !!p.practice };
        if (!fly){ w.__tgLoad(g); const L = lab(); if (L && L.landed) L.landed(); return; }
        w.__tgLoad(g, { hold: true });
        settle(w);
      }, fly ? 600 : 900);
    };
    tryIt();
  }
  // ("Hey, no cheating!" (js/seeyou.js) is shown by whichever page has the focus: this one, or the tool's own page. Only that one, so Escape and Okay close it.)
  window.addEventListener('message', e => {
    const m = e.data && e.data.tgauge;
    if (!m || !frames.telescopic || e.source !== frames.telescopic.contentWindow) return;   // only our own tab sends these
    if (m.seeWhere){ showWhere(); return; }
    if (m.closeDock){ closeDock(); return; }
    if (!m.full || !(m.mm > 0)) return;
    const a = APPS.find(x => x.id === m.tool);
    if (!a || !DOCK_TOOLS.includes(a.id)) return;
    openDock(a.id, m, { fly: !!m.fly });
  });
  tabs.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = APPS.findIndex(a => a.id === current), n = APPS.length;
    const next = APPS[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n];
    show(next.id); document.getElementById('tab-' + next.id).focus(); e.preventDefault();
  });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  // The tool's own buttons that sit over its drawing (they hide a gauge the tool draws itself, so a gauge drawn over it must not cover them either).
  // Their rectangles in this window, a few times a second.
  let holeAt = 0, holeOf = null, holeList = [];
  function uiHoles(f){
    const now = performance.now();
    if (holeOf === f && now - holeAt < 200) return holeList;
    holeOf = f; holeAt = now; holeList = [];
    try {
      const fr = f.getBoundingClientRect(), out = [];
      f.contentDocument.querySelectorAll('button, input, select').forEach(el => {
        if (!el.offsetParent) return;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.width > 520 || r.height > 120) return;
        const h = [fr.left + r.left, fr.top + r.top, fr.left + r.right, fr.top + r.bottom];
        if (out.some(o => o[0] <= h[0] + .5 && o[1] <= h[1] + .5 && o[2] >= h[2] - .5 && o[3] >= h[3] - .5)) return;
        out.push(h);
      });
      holeList = out.slice(0, 60);
    } catch (err) { holeList = []; }
    return holeList;
  }
  // Loading in the background: once the first tool is up and the page is quiet, every other tool loads in its own frame, out of
  // sight (laid out at full size but invisible, one at a time). Each one builds in, dissolves out again and is put to sleep, so a tab
  // switch just dissolves it back in.
  function warmUp(){
    const c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;   // (a data-saving connection loads a tool when it is opened)
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = () => {
      const a = APPS.find(x => !frames[x.id]);
      if (!a) return;
      const f = frameFor(a, true), t0 = Date.now();
      const done = () => {
        if (f.dataset.warm){ delete f.dataset.warm; f.classList.remove('warm'); if (current !== a.id) pause(f, true); }
        setTimeout(next, 50);
      };
      const poll = () => {
        if (!f.dataset.warm) return done();   // (opened by its tab meanwhile: it carries on as the tool on show)
        let w; try { w = f.contentWindow; } catch (e) { return done(); }
        const fx = w && w.__toolFx;
        if (w && w.document && w.document.readyState === 'complete' && !w.document.getElementById('loading') && w.__phase === 'ready' && fx){
          if (calm) return done();
          const go = () => { if (f.dataset.warm) Promise.resolve(fx.out()).then(done, done); else done(); };
          return setTimeout(go, 50);
        }
        if (Date.now() - t0 > 90000) return done();
        setTimeout(poll, 60);
      };
      poll();
    };
    next();
  }
  (function arm(){
    const t0 = Date.now();
    const tick = () => {
      let w; try { w = frames[current] && frames[current].contentWindow; } catch (e) {}
      const ready = w && w.document && w.document.readyState === 'complete' && !w.document.getElementById('loading');
      if (ready || Date.now() - t0 > 60000) warmUp();
      else setTimeout(tick, 100);
    };
    tick();
  })();
  // dev mode (js/devmode.js) drives the tabs through this
  window.__shell = { APPS, show, frameFor, frames, current: () => current,
  // where the tool's gauge is on screen right now (the lab's gauge is drawn over it), or null
  pose: () => { try { const f = dock.frames[dock.tool]; if (!f || !dockShowing() || (dock.el && dock.el.hidden)) return null; const sp = f.contentWindow.__tgSpot && f.contentWindow.__tgSpot(); if (!sp) return null; const fr = f.getBoundingClientRect(); return { x: fr.left + sp.x, y: fr.top + sp.y, ppm: sp.ppm, ax: sp.ax, hd: sp.hd, sl: sp.sl, lk: sp.lk, fp: sp.fp, clip: sp.box && [fr.left + sp.box[0], fr.top + sp.box[1], fr.left + sp.box[2], fr.top + sp.box[3]], holes: uiHoles(f) }; } catch (err) { return null; } },
  unghost: () => { try { const f = dock.frames[dock.tool]; if (f && f.contentWindow.__tgShow) f.contentWindow.__tgShow(); } catch (err) {} },
  // Next, in the practice the lab handed to the tool on the right: the lab takes the gauge home, picks a new hole and asks which tool again
  // (true when the lab took it; false leaves the tool to do its own Next)
  nextHole: () => { try { const w = labWin(); return !!(dock.open && w && w.__tgNextHole && w.__tgNextHole()); } catch (err) { return false; } },
  // the lab's gauge has landed: the tool draws it itself from here on, in its own scene (true when it can; the lab then lets its own copy go)
  nativeShown: () => { try { frames.telescopic.contentWindow.__lab.nativeShown(); } catch (err) {} },
  native: () => { try { const f = dock.frames[dock.tool]; return !!(f && f.contentWindow.__tgNative && f.contentWindow.__tgNative()); } catch (err) { return false; } },
  // the lab's gauge has landed on the tool's: the tool starts measuring it
  reveal: () => { try { const f = dock.frames[dock.tool]; if (f && f.contentWindow.__tgReveal) f.contentWindow.__tgReveal(); } catch (err) {} } };
  let start = location.hash.slice(1);
  if (!APPS.some(a => a.id === start)){ try { start = localStorage.getItem('precision-tools-last'); } catch (e) {} }
  // the first tool's heavy start-up (its 3D scene) waits for the opening animation to finish, so nothing busy shares the page with it and it stays at 60 fps
  const first = () => show(APPS.some(a => a.id === start) ? start : APPS[0].id);
  if (window.__afterIntro) window.__afterIntro(first); else first();
})();
// "Reset all", for when someone is stuck with no way out. It has to be held for 3 seconds, so it never happens by
// accident, and a note under it says what it does while it is hovered or held. It clears everything the tools
// remember in this browser (units, panels, the flat view, the table, tutorials seen, the last tool open) and
// starts the page over on the same tool. Only this app's own saved settings are cleared, nothing else on the site.
(function(){
  const b = document.getElementById('resetAll'), pop = document.getElementById('resetPop');
  if (!b || !pop) return;
  const HOLD = 3000, KEYS = /^(pt-|precision-tools-|caliper-|depthmic-|height-|mic-)/;
  let t0 = 0, raf = 0, timer = 0;
  const show = on => pop.classList.toggle('on', on);
  const fill = k => b.style.setProperty('--p', String(k));
  function start(e){
    if (t0 || b.classList.contains('done')) return;
    if (e) e.preventDefault();
    t0 = performance.now(); show(true);
    const tick = () => { if (!t0) return; const k = Math.min(1, (performance.now() - t0)/HOLD); fill(k); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    timer = setTimeout(reset, HOLD);
  }
  function cancel(){
    if (!t0) return;
    t0 = 0; cancelAnimationFrame(raf); clearTimeout(timer); fill(0);
    if (!b.matches(':hover') && document.activeElement !== b) show(false);
  }
  function reset(){
    t0 = 0; cancelAnimationFrame(raf); fill(1);
    b.classList.add('done'); b.querySelector('.ra-t').textContent = 'Resetting…';
    try { Object.keys(localStorage).filter(k => KEYS.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    setTimeout(() => location.reload(), 250);
  }
  b.addEventListener('pointerdown', e => { if (e.button !== 0) return; try { b.setPointerCapture(e.pointerId); } catch (err) {} start(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => b.addEventListener(t, cancel));
  b.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); });
  b.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') cancel(); });
  b.addEventListener('click', e => e.preventDefault());
  b.addEventListener('blur', () => { cancel(); show(false); });
  b.addEventListener('mouseenter', () => show(true));
  b.addEventListener('mouseleave', () => { if (!t0) show(false); });
  b.addEventListener('focus', () => { if (b.matches(':focus-visible')) show(true); });
})();

// Loading ahead: once the first tool is up and the page is quiet, the libraries the other tools need are fetched in the background,
// so opening them is quick. (sw.js then keeps them for next time.) Skipped on a data-saving connection.
(function(){
  const c = navigator.connection;
  if (FROM_DISK || (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')))) return;   // (from disk there is nothing to fetch ahead)
  // the libraries live on this site (vendor/): the ones the other tools need are fetched while this one is idle
  const JS = ['vendor/three.r128.min.js?v=1', 'vendor/OrbitControls.r128.js?v=1', 'vendor/BufferGeometryUtils.r128.js?v=1', 'vendor/clipper.js?v=1'];
  const MOD = ['vendor/three/three.module.min.js?v=1', 'vendor/three/addons/controls/OrbitControls.js', 'vendor/three/addons/environments/RoomEnvironment.js', 'vendor/three/addons/utils/BufferGeometryUtils.js'];
  const go = () => {
    JS.forEach(u => { const l = document.createElement('link'); l.rel = 'prefetch'; l.as = 'script'; l.href = u; document.head.appendChild(l); });
    MOD.forEach(u => { const l = document.createElement('link'); l.rel = 'modulepreload'; l.href = u; document.head.appendChild(l); });
  };
  window.addEventListener('load', () => setTimeout(() => (window.requestIdleCallback || (f => setTimeout(f, 50)))(go, { timeout: 500 }), 0));
  // repeat visits: keep the libraries and files on the device (not while developing on localhost, unless asked with ?sw=1)
  if ('serviceWorker' in navigator && /^https:$/.test(location.protocol) || (/[?&]sw=1/.test(location.search) && 'serviceWorker' in navigator)){
    window.addEventListener('load', () => { try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {} });
  }
})();
