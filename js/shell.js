// the tools: each one's page is a text/html block in index.html (id "tool-<page>");
// the vernier caliper is the caliper page opened as the vernier
const APPS = [
  { id: 'caliper', name: 'Dial caliper', page: 'caliper' },
  { id: 'vernier', name: 'Vernier caliper', page: 'caliper', inst: 'vern' },
  { id: 'micrometer', name: 'Outside micrometer', page: 'micrometer' },
  { id: 'depth', name: 'Depth micrometer', page: 'depth' },
  { id: 'height', name: 'Height gage', page: 'height' }
];
// links inside a tool that open another tool switch tabs instead
const LINKS = { 'depth-micrometer.html': 'depth', 'depth-micrometer-trainer.html': 'depth', 'height-gage.html': 'height', 'micrometer.html': 'micrometer', 'dial-caliper-trainer.html': 'caliper' };
// a tool's page as text, ready for its frame (relative css/ and js/ paths resolve against this page)
function pageFor(a){
  let html = document.getElementById('tool-' + a.page).textContent.replace(/<\\\/script>/g, '</script>');
  if (a.inst) html = html.replace('<head>', '<head><script>window.__INST=' + JSON.stringify(a.inst) + '</' + 'script>');
  return html;
}
// no right-click menu, and no view-source or developer-tools shortcuts (Ctrl+U, Ctrl+Shift+I/J/C, F12,
// and the Mac Cmd+Option versions), on this page and inside every tool's frame
function lockDown(w){
  if (!w || w.__lockedDown) return;
  w.__lockedDown = true;
  w.addEventListener('contextmenu', e => e.preventDefault(), true);
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
    b.textContent = a.name; b.setAttribute('aria-selected', 'false'); b.setAttribute('aria-controls', 'app-' + a.id);
    b.addEventListener('click', e => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return; e.preventDefault(); show(a.id); });
    tabs.appendChild(b);
  });
  tabs.appendChild(ink);
  // each app gets its own frame the first time it is opened, and keeps its state after that
  function frameFor(a){
    if (frames[a.id]) return frames[a.id];
    const f = document.createElement('iframe');
    f.id = 'app-' + a.id; f.title = a.name; f.setAttribute('role', 'tabpanel');
    f.setAttribute('allow', 'fullscreen; autoplay');
    f.addEventListener('load', () => {
      if (current !== a.id) pause(f, true);
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
  function show(id){
    const a = APPS.find(x => x.id === id) || APPS[0];
    if (current === a.id) return;
    current = a.id;
    const f = frameFor(a);
    Object.values(frames).forEach(x => { x.classList.toggle('on', x === f); pause(x, x !== f); });
    // a hidden frame has no size, so its layout is stale: have it lay itself out again now it shows
    const relayout = () => { try { f.contentWindow.dispatchEvent(new Event('resize')); } catch (err) {} };
    requestAnimationFrame(relayout); setTimeout(relayout, 250);
    tabs.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.id === 'tab-' + a.id)));
    placeInk();
    document.title = 'Shop Tool Sim';
    if (location.hash !== '#' + a.id) history.replaceState(null, '', '#' + a.id);
    try { localStorage.setItem('precision-tools-last', a.id); } catch (e) {}
    setTimeout(() => { try { f.focus(); } catch (e) {} }, 50);
  }
  tabs.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = APPS.findIndex(a => a.id === current), n = APPS.length;
    const next = APPS[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n];
    show(next.id); document.getElementById('tab-' + next.id).focus(); e.preventDefault();
  });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  let start = location.hash.slice(1);
  if (!APPS.some(a => a.id === start)){ try { start = localStorage.getItem('precision-tools-last'); } catch (e) {} }
  show(APPS.some(a => a.id === start) ? start : APPS[0].id);
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
