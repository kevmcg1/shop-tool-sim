// Dev mode: tests the sim by itself, measures how smoothly it runs, and says what glitches and how everything did.
//
// Press the backtick key (`) to open or close the panel; there is no button for it. It opens each tool in turn, finds every control that is on screen (buttons,
// checkboxes, sliders, lists, text and number fields, and drags and scrolls on the 3D view, and the keys the tool answers to), and uses them:
//
//   one by one      each control on its own
//   pairs           every control followed by every other control (Thorough), or a random share of them
//   combinations    every on/off combination of the checkboxes (each one a single flip from the last), and after each,
//                   a handful of other controls on top of it (lists, sliders, buttons, the 3D view)
//   random runs     random runs of 3 to 10 controls in a row (the same seed gives the same runs, so a bug can be replayed)
//   flows           whole journeys with checks along the way (every tool: the mouse is smooth, a wheel notch spreads over several frames and a drag moves evenly): the split-screen Measure (flight, landing, reading, swapping
//                   tools, closing), "Where did the sidebar go?", the tools inside the panel, Show me step by step, the page
//                   around the tools (tabs, changelog, Reset all)
//
// After every step it looks for: a script error or unhandled promise, a console error, a lost 3D context, a frame that
// stalled, "NaN" / "undefined" / "Infinity" showing in the page, and numbers in the lab that stopped being numbers. It also
// times every frame to rate how smoothly each tool ran, and notes whether each control did anything. The report gives
// feedback on all of it: a smoothness grade per tool, the slowest controls, the controls that did nothing, every control's
// own numbers, and how each flow went, with the exact steps that led to anything that went wrong. It cannot test every
// possible order of every control (that is billions); Thorough covers every pair, every checkbox combination and a large
// random share of longer runs, and the report says what it covered.
(function(){
  const qs = new URLSearchParams(location.search);
  // the backtick key (`) opens and closes the panel; there is no button for it. (js/shell.js passes the key on from inside the tools' frames.)
  window.__devToggle = () => { const p = document.querySelector('.dev'); if (p) p.hidden = !p.hidden; };
  document.addEventListener('keydown', e => {
    if (e.key !== '`' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, typing = t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && /^(text|number|search|email|password|tel|url)$/.test(t.type || 'text')));
    if (typing) return;
    e.preventDefault(); window.__devToggle();
  }, true);

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await sleep(100); return !!fn(); };
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
  const SH = () => window.__shell;
  const TOOLS = [['caliper', 'Dial caliper'], ['vernier', 'Vernier caliper'], ['micrometer', 'Outside micrometer'], ['depth', 'Depth micrometer'], ['height', 'Height gage'], ['telescopic', 'Telescopic gauge'], ['page', 'Page & panel (flows)']];
  const NAME = Object.fromEntries(TOOLS);
  const RATE = 10;   // steps a second
  const MODES = {
    thorough:   { label: 'Thorough: every control, every pair, every checkbox combination, 800 random runs, all flows', pairs: Infinity, seqs: 800, combos: 256, probe: 6 },
    standard:   { label: 'Standard: every control, 400 pairs, 64 combinations, 250 random runs, all flows',             pairs: 400,      seqs: 250, combos: 64,  probe: 4 },
    quick:      { label: 'Quick: every control, 60 pairs, 12 combinations, 40 random runs, all flows',                 pairs: 60,       seqs: 40,  combos: 12,  probe: 3 }
  };
  const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape', 'Enter', 'l', 'i', 'm', 'r', 'a', 'f', 'z', 'b', 'x', '1', '2'];
  const BAD_TEXT = /\b(NaN|undefined|Infinity)\b|\[object |function\s*\(/;
  // frame times (ms between two painted frames): 60 fps is 16.7; past 34 is under 30 fps; past 50 the eye sees a hitch; past 100 it is a jank
  const FR = { fine: 34, slow: 50, jank: 100, stall: 700 };
  const WARN = { jank: 1, stall: 1, 'slow control': 1 };

  const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p*s.length))]; };
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0)/a.length : 0;
  const r1 = n => Math.round(n*10)/10;
  function frameStats(g){ return { n: g.length, avg: r1(avg(g)), p95: r1(pct(g, .95)), max: Math.round(g.length ? Math.max(...g) : 0), over50: g.filter(x => x > FR.slow).length, over100: g.filter(x => x > FR.jank).length }; }
  function grade(f){
    if (f.n < 30) return { word: 'not enough frames', cls: 'warn' };
    const bad = f.over50/f.n, jank = f.over100/f.n;
    if (jank < .002 && bad < .01 && f.p95 <= FR.fine) return { word: 'smooth', cls: 'ok' };
    if (jank < .01 && bad < .04 && f.p95 <= FR.slow) return { word: 'mostly smooth', cls: 'ok' };
    if (jank < .03) return { word: 'a little rough', cls: 'warn' };
    return { word: 'rough', cls: 'bad' };
  }

  /* ---------------- watching a tool's page ---------------- */
  function instrument(w){
    if (w.__devMon) return w.__devMon;
    const mon = w.__devMon = { errors: [], warns: [], gaps: [], last: 0, dirty: true, cache: null, muts: 0, longs: 0, idle: 0 };
    // the test's pointer events are made up, so there is no real pointer to capture; a real browser always has one. Without this, the
    // browser throws on every capture a page asks for, which says nothing about the page.
    try { const P = w.Element.prototype; ['setPointerCapture', 'releasePointerCapture'].forEach(n => { const o = P[n]; P[n] = function(id){ try { return o.call(this, id); } catch (e) { if (e && e.name === 'NotFoundError') return; throw e; } }; }); } catch (e) {}
    try { new w.MutationObserver(recs => { mon.dirty = true; mon.muts += recs.length; }).observe(w.document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled', 'hidden', 'aria-pressed', 'style', 'open'] }); } catch (e) {}
    try { new w.PerformanceObserver(l => { l.getEntries().forEach(e => { if (e.duration > FR.jank) mon.longs++; }); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
    w.addEventListener('error', e => mon.errors.push({ type: 'script error', msg: (e.message || 'error') + ' (' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || '?') + ')' }));
    w.addEventListener('unhandledrejection', e => mon.errors.push({ type: 'unhandled promise', msg: String((e.reason && e.reason.message) || e.reason).slice(0, 240) }));
    const ce = w.console.error.bind(w.console), cw = w.console.warn.bind(w.console);
    w.console.error = (...a) => { mon.errors.push({ type: 'console error', msg: a.map(x => (x && x.message) || String(x)).join(' ').slice(0, 260) }); ce(...a); };
    w.console.warn = (...a) => { mon.warns.push({ type: 'console warning', msg: a.map(String).join(' ').slice(0, 200) }); cw(...a); };
    w.document.addEventListener('webglcontextlost', e => mon.errors.push({ type: '3D context lost', msg: '#' + (e.target.id || e.target.className || 'canvas') }), true);
    const loop = t => { if (mon.last && !w.document.hidden) mon.gaps.push(t - mon.last); mon.last = w.document.hidden ? 0 : t; w.requestAnimationFrame(loop); };
    w.requestAnimationFrame(loop);
    return mon;
  }
  const ready = f => { try { const w = f.contentWindow; return !!(w && w.document && w.document.readyState === 'complete' && !w.document.getElementById('loading') && w.document.body); } catch (e) { return false; } };

  /* ---------------- finding the controls on screen ---------------- */
  const visible = el => { if (!el || !el.getClientRects().length) return false; const w = el.ownerDocument.defaultView, cs = w.getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.02; };
  const labelOf = el => {
    const t = (el.id ? '#' + el.id : '') || el.getAttribute('aria-label') || (el.dataset && (el.dataset.send ? 'send ' + el.dataset.send : el.dataset.view ? 'view ' + el.dataset.view : el.dataset.v ? 'show ' + el.dataset.v : el.dataset.u ? 'units ' + el.dataset.u : el.dataset.i ? 'chip ' + el.dataset.i : el.dataset.ask ? 'ask ' + el.dataset.ask : el.dataset.tool ? 'tool ' + el.dataset.tool : el.dataset.t ? 'dock ' + el.dataset.t : '')) || (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) || el.className.toString().slice(0, 24) || el.tagName.toLowerCase();
    return t;
  };
  function discover(w){
    const d = w.document, list = [], count = {};
    const key = (base, kind) => { const k = kind + ':' + base; count[k] = (count[k] || 0) + 1; return count[k] > 1 ? k + '#' + count[k] : k; };
    const skip = el => el.closest('.holo, .gd, .dev') || (el.matches('a[href]') && !el.classList.contains('tab')) ||   // (the page's own tabs are in; links that leave the site are not)
      el.disabled || !visible(el) || (el.id && /^(logoMark)$/.test(el.id));
    d.querySelectorAll('button, [role=tab], a.tab, input[type=checkbox], input[type=radio]').forEach(el => {
      if (skip(el)) return; if (el.closest('.dd-list')) return;
      const kind = el.tagName === 'INPUT' ? 'toggle' : 'click', base = labelOf(el);
      list.push({ key: key(base, kind), label: base, kind, get: () => el });
    });
    d.querySelectorAll('input[type=range]').forEach(el => {
      if (skip(el)) return; const base = labelOf(el);
      [['min', 0], ['mid', .5], ['max', 1], ['quarter', .25], ['three-quarters', .75]].forEach(([n, f]) => list.push({ key: key(base + '=' + n, 'slide'), label: base + ' ' + n, kind: 'slide', frac: f, get: () => el }));
    });
    d.querySelectorAll('select').forEach(el => {
      const box = el.closest('.dd'); if (!(visible(el) || (box && visible(box)))) return; const base = labelOf(el), n = el.options.length;
      for (let i = 0; i < Math.min(n, 9); i++){ const idx = n <= 9 ? i : Math.round(i/8*(n - 1)); list.push({ key: key(base + '[' + idx + ']', 'pick'), label: base + ' → ' + (el.options[idx] ? el.options[idx].text.slice(0, 22) : idx), kind: 'pick', idx, get: () => el }); }
    });
    // text and number fields: a good value, the edges of the range, an empty field, and things that are not numbers at all
    d.querySelectorAll('input[type=text], input[type=number], input[type=search], input:not([type]), textarea').forEach(el => {
      if (skip(el) || el.readOnly) return;
      const base = labelOf(el), num = el.type === 'number', lo = el.min === '' ? 0 : +el.min, hi = el.max === '' ? 100 : +el.max;
      const vals = num ? [['mid', String((lo + hi)/2)], ['min', String(lo)], ['max', String(hi)], ['empty', ''], ['too low', String(lo - 1)], ['too high', String(hi + 1)]]
        : [['number', '0.5'], ['precise', '1.2345'], ['negative', '-3'], ['empty', ''], ['letters', 'abc'], ['huge', '99999'], ['tiny', '0.0000001']];
      vals.forEach(([n, v]) => list.push({ key: key(base + '=' + n, 'type'), label: base + ' ← ' + n, kind: 'type', v, get: () => el }));
    });
    // everything else a hand can operate: ARIA buttons / switches / menu items, disclosure summaries, colour pickers, the draggable dividers
    // between panels (arrow keys and a drag), and every tooltip (hover over it, and the tooltip must stay inside the window)
    d.querySelectorAll('[role=button]:not(button), [role=switch], [role=menuitem], [role=checkbox]:not(input), [role=radio]:not(input), summary').forEach(el => {
      if (skip(el) || el.closest('.dd-list')) return; const base = labelOf(el);
      list.push({ key: key(base, 'click'), label: base, kind: 'click', get: () => el });
    });
    d.querySelectorAll('input[type=color]').forEach(el => {
      if (skip(el)) return; const base = labelOf(el);
      [['white', '#ffffff'], ['black', '#000000'], ['blue', '#5b93ea']].forEach(([n, v]) => list.push({ key: key(base + '=' + n, 'type'), label: base + ' ← ' + n, kind: 'type', v, get: () => el }));
    });
    d.querySelectorAll('[role=separator][tabindex]').forEach(el => {
      if (skip(el)) return; const base = labelOf(el);
      ['key up', 'key down', 'key home', 'key end', 'drag up', 'drag down'].forEach(n => list.push({ key: key(base + ':' + n, 'divider'), label: base + ' ' + n, kind: 'divider', how: n, get: () => el }));
    });
    d.querySelectorAll('[data-tip]').forEach(el => {
      if (skip(el)) return; const base = labelOf(el);
      list.push({ key: key(base, 'hover'), label: 'tooltip: ' + base, kind: 'hover', get: () => el });
    });
    // the 3D view: drags, scroll and a click, like a hand would
    const cv = d.querySelector('#cv, #view canvas, canvas.gl');
    if (cv && visible(cv)) ['orbit drag', 'pan drag', 'zoom in', 'zoom out', 'click middle', 'small drag'].forEach(n => list.push({ key: 'view:' + n, label: '3D view: ' + n, kind: 'view', how: n, get: () => cv }));
    KEYS.forEach(k => list.push({ key: 'key:' + k, label: 'key ' + k, kind: 'key', k, get: () => d.body }));
    return list;
  }
  window.__devDiscover = discover;   // (for checking that nothing on a page is left out)
  const actionsOf = w => { const m = w.__devMon; if (!m) return discover(w); if (m.dirty || !m.cache){ m.cache = discover(w); m.dirty = false; } return m.cache; };
  function perform(w, a, rand){
    const el = a.get(); if (!el) return;
    // a tooltip left showing by the last hover goes when the pointer moves on
    if (w.__devHover && w.__devHover !== el){ try { w.__devHover.dispatchEvent(new w.PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: w.document.body })); } catch (e) {} w.__devHover = null; }
    if (a.kind === 'click'){ el.click(); }
    else if (a.kind === 'hover'){ el.scrollIntoView && el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); el.dispatchEvent(new w.PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })); w.__devHover = el; }
    else if (a.kind === 'divider'){
      const r = el.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height/2, h = a.how;
      if (h.startsWith('key')){ const k = { 'key up': 'ArrowUp', 'key down': 'ArrowDown', 'key home': 'Home', 'key end': 'End' }[h]; el.focus(); el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); el.dispatchEvent(new w.KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true })); }
      else {
        const dy = h === 'drag up' ? -70 : 70, P = (t, y, bs) => el.dispatchEvent(new w.PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: true, clientX: cx, clientY: y, button: 0, buttons: bs }));
        P('pointerdown', cy, 1); for (let i = 1; i <= 6; i++) P('pointermove', cy + dy*i/6, 1); P('pointerup', cy + dy, 0);
      }
    }
    else if (a.kind === 'toggle'){ el.click(); }
    else if (a.kind === 'slide'){
      const lo = +el.min || 0, hi = el.max === '' ? 100 : +el.max, st = +el.step || 1; let v = lo + (hi - lo)*a.frac; v = Math.round(v/st)*st; el.value = v;
      el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true }));
    }
    else if (a.kind === 'pick'){ el.selectedIndex = a.idx; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); }
    else if (a.kind === 'type'){
      el.focus(); el.value = a.v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true }));
      const o = { key: 'Enter', bubbles: true, cancelable: true }; el.dispatchEvent(new w.KeyboardEvent('keydown', o)); el.dispatchEvent(new w.KeyboardEvent('keyup', o)); el.blur();
    }
    else if (a.kind === 'key'){ const o = { key: a.k, bubbles: true, cancelable: true }; w.document.dispatchEvent(new w.KeyboardEvent('keydown', o)); w.document.dispatchEvent(new w.KeyboardEvent('keyup', o)); }
    else if (a.kind === 'view'){
      const r = el.getBoundingClientRect(), cx = r.left + r.width*.5, cy = r.top + r.height*.5; el.setPointerCapture = () => {};
      const P = (t, x, y, b, bs) => el.dispatchEvent(new w.PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: b, buttons: bs }));
      const drag = (dx, dy, b) => { P('pointerdown', cx, cy, b, 1 << b); for (let i = 1; i <= 6; i++) P('pointermove', cx + dx*i/6, cy + dy*i/6, b, 1 << b); P('pointerup', cx + dx, cy + dy, b, 0); };
      if (a.how === 'orbit drag') drag(80, -40, 0); else if (a.how === 'pan drag') drag(-60, 30, 2); else if (a.how === 'small drag') drag(8, 6, 0);
      else if (a.how === 'click middle'){ P('pointerdown', cx, cy, 0, 1); P('pointerup', cx, cy, 0, 0); }
      else el.dispatchEvent(new w.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: a.how === 'zoom in' ? -240 : 240, clientX: cx, clientY: cy }));
    }
  }
  // did a control change anything you could see or hear? Its own value, the camera, or the page (more than the page changes by itself)
  const valueSig = a => { try { const el = a.get(); return a.kind === 'toggle' ? String(el.checked) : (a.kind === 'slide' || a.kind === 'pick' || a.kind === 'type') ? String(el.value) : el.getAttribute && el.getAttribute('aria-pressed') + '|' + (el.className && el.className.toString().length); } catch (e) { return ''; } };
  const camSig = w => { try { const L = w.__lab; if (L && L.cam) return [L.cam.r, L.cam.th, L.cam.ph, L.cam.dth, L.cam.dph, L.cam.zoom, L.cam.off.x, L.cam.off.y].map(v => v.toFixed(3)).join(); const c = w.__caliper && w.__caliper.camera; if (c) return c.position.toArray().map(v => v.toFixed(3)).join() + c.zoom; } catch (e) {} return ''; };

  /* ---------------- looking for glitches after a step ---------------- */
  function inspect(w, mon, mark){
    const found = [];
    mon.errors.slice(mark.e).forEach(e => found.push({ type: e.type, detail: e.msg }));
    const gaps = mon.gaps.slice(mark.g), worst = gaps.length ? Math.max(...gaps) : 0;
    if (worst > FR.stall && !w.document.hidden) found.push({ type: 'stall', detail: 'a frame took ' + Math.round(worst) + ' ms' });
    else if (worst > FR.jank && !w.document.hidden) found.push({ type: 'jank', detail: 'a frame took ' + Math.round(worst) + ' ms' });
    try {   // a tooltip that is showing must lie wholly inside the window (js/tips.js)
      const tp = w.document.querySelector('.tipl.on');
      if (tp){ const r = tp.getBoundingClientRect(), W = w.document.documentElement.clientWidth, H = w.document.documentElement.clientHeight;
        if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) found.push({ type: 'tooltip cut off', detail: '“' + (tp.textContent || '').slice(0, 40) + '” at ' + Math.round(r.left) + ',' + Math.round(r.top) + ' to ' + Math.round(r.right) + ',' + Math.round(r.bottom) + ' in ' + W + '×' + H }); }
    } catch (e) {}
    try {
      // (on the page itself, everything but this panel: its own report quotes the words it is looking for)
      const t = w === window ? [...w.document.body.children].filter(e => e !== panel).map(e => e.innerText || '').join(' ') : (w.document.body.innerText || ''), m = BAD_TEXT.exec(t);
      if (m){ const i = m.index; found.push({ type: 'bad text on screen', detail: '“' + t.slice(Math.max(0, i - 24), i + 24).replace(/\s+/g, ' ') + '”' }); }
    } catch (e) {}
    try {
      const L = w.__lab; if (L && L.S){
        ['tilt', 'tiltCmd', 'curL', 'depth', 'insertT', 'lockedL', 'knob'].forEach(k => { if (!Number.isFinite(L.S[k])) found.push({ type: 'number gone bad', detail: 'lab state ' + k + ' = ' + L.S[k] }); });
        const c = L.cam; if (c && ![c.r, c.th, c.ph, c.t.x, c.t.y, c.t.z].every(Number.isFinite)) found.push({ type: 'number gone bad', detail: 'the camera has a non-number' });
      }
    } catch (e) {}
    return { found, worst, gaps };
  }

  /* ---------------- the panel ---------------- */
  const css = document.createElement('style');
  css.textContent = `
.dev{position:fixed;left:14px;bottom:14px;width:min(520px,calc(100vw - 28px));max-height:calc(100vh - 120px);z-index:3000;display:flex;flex-direction:column;background:#131416;color:#ececee;border:1px solid #3d4147;border-radius:12px;font:13px/1.45 "Inter",system-ui,sans-serif;box-shadow:0 18px 44px rgba(0,0,0,.55);opacity:1;transform:none;transition:opacity .25s ease,transform .3s cubic-bezier(.22,.8,.25,1),visibility 0s}
.dev[hidden]{display:flex;opacity:0;visibility:hidden;transform:translateY(14px);pointer-events:none;transition:opacity .2s ease,transform .25s ease,visibility 0s linear .25s}
.dev h3{margin:0;font-size:14px;font-weight:600;padding:12px 14px 4px;display:flex;justify-content:space-between;align-items:center}
.dev h3 small{font-weight:400;color:#8a8f97;font-size:11.5px}
.dev .body{padding:6px 14px 12px;overflow-y:auto}
.dev label{display:flex;gap:6px;align-items:center;margin:3px 0;font-size:12.5px;cursor:pointer}
.dev .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}
.dev select,.dev input[type=text],.dev input[type=number]{background:#1b1d20;color:#ececee;border:1px solid #3d4147;border-radius:6px;padding:5px 7px;font:inherit;width:100%}
.dev button{font:600 12.5px "Inter",system-ui,sans-serif;color:#ececee;background:transparent;border:1px solid #3d4147;border-radius:7px;padding:6px 11px;cursor:pointer;transition:border-color .2s,background-color .2s,color .2s}
.dev button:hover{border-color:#8a8f97;background:rgba(255,255,255,.06)}
.dev button.go{border-color:#5b93ea;color:#5b93ea}
.dev .row{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.dev .bar{display:block;height:6px;min-height:0;padding:0;gap:0;border:0;background:#24272b;border-radius:99px;overflow:hidden;margin:10px 0 4px}
.dev .bar i{display:block;height:100%;width:0;background:#5b93ea;transition:width .3s ease}
.dev .now{color:#8a8f97;font-size:12px;min-height:18px}
.dev .sum{margin:8px 0;font-size:12px;border-collapse:collapse;width:100%}
.dev .sum td,.dev .sum th{padding:3px 6px;border-bottom:1px solid #222428;text-align:left;font-weight:500}
.dev .sum th{color:#8a8f97;font-weight:600}
.dev .ok{color:#5fcf8a}.dev .bad{color:#ff7a6e}.dev .warn{color:#e8c547}
.dev .find{border:1px solid #3d4147;border-radius:8px;padding:7px 9px;margin:6px 0;font-size:12px}
.dev .find b{display:block;font-size:12.5px}.dev .find code{display:block;color:#8a8f97;font:11px/1.45 ui-monospace,Consolas,monospace;margin-top:3px;white-space:pre-wrap;word-break:break-word}
.dev .find.bad{border-color:#ff7a6e}.dev .find.warn{border-color:#e8c547}
.dev details{border:1px solid #2a2d31;border-radius:8px;margin:6px 0;padding:0 9px}
.dev details[open]{padding-bottom:8px}
.dev summary{cursor:pointer;padding:6px 0;font-weight:600;font-size:12.5px;list-style:none;display:flex;justify-content:space-between;gap:8px}
.dev summary::-webkit-details-marker{display:none}
.dev summary small{font-weight:400;color:#8a8f97;font-size:11.5px}
.dev .fb{font-size:12px;margin:3px 0;color:#c9ccd1}.dev .fb b{color:#ececee}
.dev .sc{margin:4px 0;font-size:12px}.dev .sc b{display:flex;gap:6px}.dev .sc ul{margin:2px 0 0;padding-left:16px;color:#aeb2b9;font-size:11.5px}
.dev .ctl{width:100%;border-collapse:collapse;font-size:11px}.dev .ctl td,.dev .ctl th{padding:2px 5px;border-bottom:1px solid #1f2125;text-align:left;font-weight:400}.dev .ctl th{color:#8a8f97}
.dev .ctl td:nth-child(n+3){text-align:right;font-variant-numeric:tabular-nums}
.dev .chk{display:inline-flex;gap:5px;align-items:center;margin-right:10px}
@media (prefers-reduced-motion: reduce){.dev,.dev[hidden],.dev .bar i{transition:none}}`;
  document.head.appendChild(css);

  const panel = document.createElement('div');
  panel.className = 'dev'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Dev mode');
  panel.innerHTML = '<h3>Dev mode · auto test <small id="devSub">idle</small></h3><div class="body">' +
    '<div class="grid">' + TOOLS.map(t => '<label><input type="checkbox" data-t="' + t[0] + '" checked> ' + t[1] + '</label>').join('') + '</div>' +
    '<div class="row" style="margin-top:4px"><label class="chk"><input type="checkbox" id="devCtl" checked> Controls</label><label class="chk"><input type="checkbox" id="devCombo" checked> Combinations</label><label class="chk"><input type="checkbox" id="devFlow" checked> Flows</label></div>' +
    '<div class="row"><select id="devMode">' + Object.keys(MODES).map(k => '<option value="' + k + '"' + (k === 'thorough' ? ' selected' : '') + '>' + MODES[k].label + '</option>').join('') + '</select><input type="number" id="devSeed" value="' + (qs.get('seed') || 20261012) + '" style="max-width:110px" aria-label="Seed"></div>' +
    '<div class="row"><button class="go" id="devGo">Start</button><button id="devStop" disabled>Stop</button><button id="devSummary">Copy summary</button><button id="devCopy">Copy report</button><button id="devSave">Download</button></div>' +
    '<div class="now" id="devEst"></div><div class="bar"><i id="devBar"></i></div><div class="now" id="devNow"></div><table class="sum" id="devSum"></table><div id="devFeed"></div><div id="devFinds"></div></div>';
  document.body.appendChild(panel);
  const $d = id => panel.querySelector('#' + id);

  /* ---------------- the run ---------------- */
  const run = { on: false, stop: false, report: null, steps: 0, t0: 0 };
  const fmtMs = ms => ms < 90000 ? Math.round(ms/1000) + ' s' : Math.round(ms/60000) + ' min';
  function newTool(id){ return { id, name: NAME[id] || id, controls: 0, singles: { run: 0, withFindings: 0 }, pairs: { run: 0, possible: 0 }, combos: { run: 0, possible: 0, toggles: 0 }, sequences: { run: 0 }, worstFrameMs: 0, findings: [], ms: 0, ctl: {}, fr: { n: 0, over34: 0, over50: 0, over100: 0, max: 0, sample: [] }, scenarios: [] }; }
  function addFinding(T, f, seq){
    const k = f.type + '|' + f.detail.replace(/\d+/g, '#');
    let x = T.findings.find(y => y.k === k);
    if (!x){ x = { k, type: f.type, detail: f.detail, count: 0, example: seq.slice(-8), by: {} }; T.findings.push(x); }
    x.count++;
    const last = seq[seq.length - 1] || '?'; x.by[last] = (x.by[last] || 0) + 1;
  }
  function addFrames(T, gaps){
    const f = T.fr;
    gaps.forEach(g => {
      f.n++; if (g > FR.fine) f.over34++; if (g > FR.slow) f.over50++; if (g > FR.jank) f.over100++; if (g > f.max) f.max = g;
      if (f.sample.length < 4000) f.sample.push(g); else f.sample[Math.floor(Math.random()*4000)] = g;
    });
  }
  const ctlOf = (T, a) => T.ctl[a.key] || (T.ctl[a.key] = { label: a.label, kind: a.kind, runs: 0, effects: 0, gaps: [], worst: 0, jank: 0, issues: 0 });
  async function reload(id){
    const sh = SH(), a = sh.APPS.find(q => q.id === id), f = sh.frameFor(a);
    await closePanel();
    f.srcdoc = f.srcdoc; await sleep(400);
    await until(() => ready(f), 60000); await sleep(1400);
    return f;
  }
  async function openTool(id){
    const sh = SH(), a = sh.APPS.find(q => q.id === id);
    sh.show(id);
    const f = sh.frameFor(a);
    await until(() => sh.current() === id && ready(f) && f.classList.contains('on'), 60000);
    await sleep(2200);
    return f;
  }
  // the panel on the right (the Telescopic gauge's split screen) can be left open by a control: close it, and wait for the gauge to be home
  async function closePanel(){
    const d = document.getElementById('dock'); if (!d || d.hidden) return;
    const x = d.querySelector('.dock-x'); if (x) x.click();
    await until(() => d.hidden, 9000); await sleep(1800);
  }
  async function testTool(id, mode, seed, T, opt){
    const t0 = Date.now(), rand = rng(seed + id.length*131);
    let f = await openTool(id), w = f.contentWindow, mon = instrument(w);
    // how much the page changes by itself, so that a control's effect can be told from that
    { const m0 = mon.muts; await sleep(600); mon.idle = (mon.muts - m0)/600; }
    const step = async (a, seq) => {
      const mark = { e: mon.errors.length, g: mon.gaps.length, m: mon.muts }, v0 = valueSig(a), c0 = camSig(w);
      // a steady beat: each step has its own slot of 1000/RATE ms, and the time spent looking over the page and checking for glitches
      // comes out of that slot, so the pace holds at RATE steps a second however busy the page is
      let thrown = null; const now0 = performance.now();
      if (!run.at || now0 - run.at > 250) run.at = now0;
      const slot = run.at; run.at = slot + 1000/RATE + (a.kind === 'hover' ? 420 : 0);   // (a tooltip waits a moment before it shows)
      try { perform(w, a, rand); } catch (e) { thrown = e; }
      await sleep(Math.max(4, run.at - performance.now() - 6));
      run.steps++; run.active += Math.min(400, performance.now() - now0);
      const r = inspect(w, mon, mark);
      if (thrown) r.found.push({ type: 'control threw', detail: String(thrown.message || thrown).slice(0, 200) });
      T.worstFrameMs = Math.max(T.worstFrameMs, Math.round(r.worst));
      addFrames(T, r.gaps);
      const c = ctlOf(T, a); c.runs++;
      if (valueSig(a) !== v0 || camSig(w) !== c0 || (mon.muts - mark.m) > mon.idle*(performance.now() - now0)*1.5 + 3) c.effects++;
      r.gaps.forEach(g => { if (c.gaps.length < 120) c.gaps.push(g); if (g > c.worst) c.worst = g; if (g > FR.jank) c.jank++; });
      if (r.found.length) c.issues++;
      r.found.forEach(x => addFinding(T, x, seq));
      return r.found.filter(x => !WARN[x.type]).length;
    };
    let actions = actionsOf(w);
    T.controls = actions.length;
    if (opt.controls){
      // 1. every control on its own, and then every control that a click brings into view (the practice answer box and its buttons, the
      // Examine bar, dialogs, the quick-read card...): each of those is used once as well, and the page is put back the way it was. Nothing
      // that a hand could press, drag, type into or pick from is left out, whatever state the page has to be in to show it.
      const seen = new Set(actions.map(a => a.key)); T.revealed = 0;
      const stillThere = () => { const now = actionsOf(w); return actions.every(o => now.some(x => x.key === o.key)); };
      const reveal = async (from, depth) => {
        const fresh = actionsOf(w).filter(a => !seen.has(a.key));
        if (!fresh.length || depth > 2) return;
        for (const a of fresh){
          if (run.stop || T.revealed >= 300) break;
          seen.add(a.key); T.revealed++;
          progress(T, 'revealed: ' + a.label, .2);
          const n = await step(a, [from.label, 'then ' + a.label]); T.singles.run++; if (n) T.singles.withFindings++;
          if (depth < 2) await reveal(a, depth + 1);
        }
        // if that hid controls that were on the page (a mode switched on), press the same control again to switch it off
        if (from.kind === 'click' && !stillThere()) await step(from, [from.label, 'back']);
      };
      for (let i = 0; i < actions.length && !run.stop; i++){
        progress(T, 'one by one: ' + actions[i].label, i/actions.length*.2);
        const live = actionsOf(w).find(x => x.key === actions[i].key); if (!live) continue;
        const n = await step(live, [live.label]); T.singles.run++; if (n) T.singles.withFindings++;
        await reveal(live, 0);
      }
      T.controls = seen.size;
      // 2. pairs
      actions = actionsOf(w);
      const keys = actions.map(a => a.key), pairs = [];
      for (let i = 0; i < keys.length; i++) for (let j = 0; j < keys.length; j++) if (i !== j) pairs.push([keys[i], keys[j]]);
      T.pairs.possible = pairs.length;
      const want = mode.pairs === Infinity ? pairs.length : Math.min(mode.pairs, pairs.length);
      for (let i = pairs.length - 1; i > 0; i--){ const j = Math.floor(rand()*(i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
      for (let p = 0; p < want && !run.stop; p++){
        progress(T, 'pairs ' + (p + 1) + ' / ' + want, .2 + p/want*.3);
        const seq = [];
        for (const k of pairs[p]){ const a = actionsOf(w).find(x => x.key === k); if (!a) continue; seq.push(a.label); await step(a, seq); }
        T.pairs.run++;
        if (p % 40 === 39){ f = await reload(id); w = f.contentWindow; mon = instrument(w); }
      }
    }
    // 3. every on/off combination of the checkboxes (each one a single flip from the last), and some of the other controls on top of each
    if (opt.combos && !run.stop){
      const togs = actionsOf(w).filter(a => a.kind === 'toggle').map(a => a.key), k = Math.min(togs.length, 10);
      T.combos.toggles = togs.length;
      if (k){
        const total = 1 << k, n = Math.min(total, mode.combos); T.combos.possible = total;
        let idx = [...Array(total).keys()];
        if (n < total){ for (let i = idx.length - 1; i > 0; i--){ const j = Math.floor(rand()*(i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } idx = idx.slice(0, n).sort((a, b) => a - b); }
        for (let c = 0; c < idx.length && !run.stop; c++){
          progress(T, 'checkbox combinations ' + (c + 1) + ' / ' + idx.length, .5 + c/idx.length*.2);
          const gray = idx[c] ^ (idx[c] >> 1), seq = ['combination ' + gray.toString(2).padStart(k, '0')];
          for (let b = 0; b < k; b++){
            const a = actionsOf(w).find(x => x.key === togs[b]); if (!a) continue;
            const want1 = !!((gray >> b) & 1); if (a.get().checked !== want1){ seq.push(a.label); await step(a, seq); }
          }
          for (let q = 0; q < mode.probe && !run.stop; q++){
            const cur = actionsOf(w).filter(a => a.kind !== 'toggle'); if (!cur.length) break;
            const a = cur[Math.floor(rand()*cur.length)]; seq.push(a.label); await step(a, seq);
          }
          T.combos.run++;
          if (c % 25 === 24){ f = await reload(id); w = f.contentWindow; mon = instrument(w); }
        }
      }
    }
    // 4. random runs of 3 to 10
    if (opt.controls){
      for (let s = 0; s < mode.seqs && !run.stop; s++){
        progress(T, 'random runs ' + (s + 1) + ' / ' + mode.seqs, .7 + s/mode.seqs*.25);
        const len = 3 + Math.floor(rand()*8), seq = [];
        for (let k = 0; k < len && !run.stop; k++){
          const cur = actionsOf(w); if (!cur.length) break;
          const a = cur[Math.floor(rand()*cur.length)]; seq.push(a.label); await step(a, seq);
        }
        T.sequences.run++;
        if (s % 15 === 14){ f = await reload(id); w = f.contentWindow; mon = instrument(w); }
      }
    }
    // 5. whole journeys, with checks along the way
    if (opt.flows && FLOWS[id] && !run.stop){
      f = await reload(id); w = f.contentWindow; mon = instrument(w);
      await runFlows(id, T, mode, rand);
    }
    T.ms = Date.now() - t0;
  }

  /* ---------------- flows: whole journeys with checks ---------------- */
  const IN = 25.4;
  const labWin = () => { const sh = SH(); return sh.frameFor(sh.APPS.find(a => a.id === 'telescopic')).contentWindow; };
  const dockWin = tab => { const f = document.getElementById('dock-' + tab); try { return f && f.contentWindow; } catch (e) { return null; } };
  const nums = s => (String(s).match(/\d+\.\d+|\d+/g) || []).map(Number);
  // does the tool's page show the length (mm or inches)? The reading is somewhere in its text
  const showsLength = (w, mm) => { try { const t = w.document.body.innerText; return nums(t).some(n => Math.abs(n - mm) < 0.02 || Math.abs(n - mm/IN) < 0.0008); } catch (e) { return false; } };
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;

  // get the gauge on a tool in the panel (fresh unless it is already there), timing the stages
  async function attach(c, tab){
    const { L, mon } = c, d = document.getElementById('dock');
    const sel = () => { const b = d && d.querySelector('[aria-selected=true]'); return b ? b.textContent : ''; };
    if (d && !d.hidden && L.fly().attached && sel() === NAME[tab] && !L.fly().swapping) return { already: true };
    await closePanel(); L.selectSample(L.S.si); await sleep(1500);
    const mm = L.S.lockedL, t0 = performance.now(), g0 = mon.gaps.length; let tFly = 0, g1 = 0, tAtt = 0, g2 = 0;
    if (!L.send(tab)){ c.fail('Measure would not start'); return null; }
    const got = await until(() => { const f = L.fly(); if (!tFly && f.dir > 0){ tFly = performance.now(); g1 = mon.gaps.length; } if (f.attached){ tAtt = performance.now(); g2 = mon.gaps.length; return true; } return false; }, 120000);
    if (!got){ c.fail('the gauge never landed on the ' + NAME[tab] + ' (waited 2 minutes)'); return null; }
    return { mm, loadS: r1(((tFly || tAtt) - t0)/1000), flightS: r1((tAtt - (tFly || tAtt))/1000), flight: frameStats(mon.gaps.slice(g1, g2)), wait: frameStats(mon.gaps.slice(g0, g1)) };
  }
  const FLOWS = {
    telescopic: [
      { name: 'Show me: every step', async run(c){
        const { w, L } = c; L.guideStart(); await sleep(700);
        const n = +((/of (\d+)/.exec(w.document.querySelector('.gd-count').textContent) || [0, 0])[1]); c.metric('steps', n);
        let tinyHoles = 0, offscreen = 0, empty = 0, overlaps = 0;
        for (let i = 0; i < n; i++){
          L.guideGo(i); await sleep(800);
          const card = w.document.querySelector('.gd-card'), title = card.querySelector('h4').textContent, lines = card.querySelectorAll('.gd-l').length;
          const hole = w.document.querySelector('.gd-hole'), none = hole.classList.contains('none'), hw = parseFloat(hole.style.width) || 0, hh = parseFloat(hole.style.height) || 0;
          const cr = card.getBoundingClientRect();
          if (!lines){ empty++; c.fail('step ' + (i + 1) + ' “' + title + '” has no text'); }
          if (cr.left < -1 || cr.top < -1 || cr.right > w.innerWidth + 1 || cr.bottom > w.innerHeight + 1){ offscreen++; c.fail('step ' + (i + 1) + ' “' + title + '”: the card runs off the window'); }
          if (!none && (hw < 40 || hh < 24)){ tinyHoles++; c.fail('step ' + (i + 1) + ' “' + title + '”: the lit window is only ' + Math.round(hw) + '×' + Math.round(hh) + ' px, so it lights nothing'); }
          // the names on the gauge: none on top of another, all inside the view
          const tags = [...w.document.querySelectorAll('.lab.show span')];
          if (tags.length){
            const rs = tags.map(t => ({ t: t.textContent, ...t.getBoundingClientRect().toJSON() })), vr = w.document.getElementById('view').getBoundingClientRect();
            for (let a = 0; a < rs.length; a++){
              if (rs[a].left < vr.left - 2 || rs[a].right > vr.right + 2 || rs[a].top < vr.top - 2 || rs[a].bottom > vr.bottom + 2) c.fail('step ' + (i + 1) + ': the name “' + rs[a].t + '” is outside the view');
              for (let b = a + 1; b < rs.length; b++) if (overlap(rs[a], rs[b])){ overlaps++; c.fail('step ' + (i + 1) + ': the names “' + rs[a].t + '” and “' + rs[b].t + '” overlap'); }
            }
            c.ok('step ' + (i + 1) + ': ' + tags.length + ' names, clear of each other');
          }
        }
        c.metric('lit windows too small', tinyHoles); c.metric('cards off the window', offscreen); c.metric('steps with no text', empty); c.metric('overlapping names', overlaps);
        if (!tinyHoles && !offscreen && !empty && !overlaps) c.ok('all ' + n + ' steps show text, a card inside the window and a proper lit window');
        w.document.querySelector('.gd-x').click(); await sleep(400);
      } },
      { name: 'Show me: “Pick a part” completes', async run(c){
        const { w, L } = c; L.guideStart(); await sleep(500); L.guideGo(L.guideIndex('Pick a part')); await sleep(900);
        const dd = w.document.getElementById('sampleSel').closest('.dd'), btn = dd.querySelector('.dd-btn');
        btn.click(); await sleep(800);
        // (the window's final place is in its style; its live rectangle is still gliding there while a page is being painted)
        const hs = w.document.querySelector('.gd-hole').style, hl = parseFloat(hs.left) || 0, ht = parseFloat(hs.top) || 0, hw = parseFloat(hs.width) || 0, hh = parseFloat(hs.height) || 0;
        const hole = { left: hl, top: ht, right: hl + hw, bottom: ht + hh, width: hw, height: hh }, list = dd.querySelector('.dd-list').getBoundingClientRect();
        if (hole.width < 100 || hole.height < 40) c.fail('the lit window (' + Math.round(hole.width) + '×' + Math.round(hole.height) + ' px) does not take in the Part list'); else c.ok('the lit window takes in the Part list');
        if (list.left < hole.left - 3 || list.right > hole.right + 3 || list.bottom > hole.bottom + 3 || list.top < hole.top - 3) c.fail('the open list sticks out of the lit window'); else c.ok('the open list is lit');
        const before = w.document.querySelector('.gd-count').textContent;
        dd.querySelectorAll('.dd-opt')[2].click();
        const moved = await until(() => w.document.querySelector('.gd-count').textContent !== before, 4000);
        if (moved) c.ok('picking a part moves on to “' + w.document.querySelector('.gd-card h4').textContent + '”'); else c.fail('picking a part did not move on');
        w.document.querySelector('.gd-x').click(); await sleep(400);
      } },
      { name: 'Show me: the lock step waits for a straight handle', async run(c){
        const { w, L } = c, D = Math.PI/180; L.selectSample(0); await sleep(1500);
        L.guideStart(); await sleep(500); L.guideGo(L.guideIndex('Snug and lock')); await sleep(500);
        const doEl = () => w.document.querySelector('.gd-do');
        L.setTiltCmd(10*D); L.toggleInsert();   // going in: the heads are pushed in and the knob locks
        if (!await until(() => L.S.insertT > .95, 8000)){ c.fail('the gauge never got into the hole'); return; }
        if (L.S.unlocked) c.fail('it went in unlocked'); else c.ok('it goes in locked');
        L.toggleLock(); await sleep(900);   // unlock inside the bore
        if (!L.S.unlocked) c.fail('it did not unlock in the bore'); else c.ok('it unlocks in the bore');
        L.setTiltCmd(6*D); await sleep(900); L.toggleLock(); await sleep(1800);
        if (doEl().classList.contains('ok')) c.fail('locking 6° off square counted as done'); else c.ok('locked 6° off square: the step waits (“' + doEl().textContent.slice(0, 60) + '”)');
        L.toggleLock(); await sleep(600); L.setTiltCmd(.3*D); await sleep(900);
        if (Math.abs(L.S.tiltCmd) > 1e-9) c.fail('0.3° did not pull into 0.0°'); else c.ok('0.3° pulls into 0.0°');
        L.toggleLock();
        if (await until(() => doEl().classList.contains('ok'), 5000)) c.ok('locked straight: the step is done'); else c.fail('locked straight but the step did not finish');
        w.document.querySelector('.gd-x').click(); await sleep(400);
      } },
      { name: 'Measure into the micrometer: load, flight, landing, reading', async run(c){
        const r = await attach(c, 'micrometer'); if (!r) return;
        c.metric('tool loaded in (s)', r.loadS); c.metric('flight (s)', r.flightS); c.metric('flight p95 frame (ms)', r.flight.p95); c.metric('flight worst frame (ms)', r.flight.max);
        if (r.flightS < 1.2 || r.flightS > 2.2) c.warn('the flight took ' + r.flightS + ' s (expected about 1.6)'); else c.ok('flight took ' + r.flightS + ' s');
        smoothNote(c, 'flight', r.flight);
        await sleep(3800); await landed(c, 'micrometer', r.mm);
      } },
      { name: 'Swap tools in the panel: the same gauge glides over', async run(c){
        const { L, mon } = c;
        if (!(await attach(c, 'micrometer'))) return;
        for (const tab of ['caliper', 'vernier', 'micrometer']){
          const g0 = mon.gaps.length, t0 = performance.now();
          const btn = [...document.querySelectorAll('#dock .dock-tabs button')].find(b => b.dataset.t === tab); btn.click();
          await sleep(500);
          const ok = await until(() => { const f = L.fly(); return !f.swapping && f.attached && (document.querySelector('#dock [aria-selected=true]') || {}).textContent === NAME[tab]; }, 120000);
          if (!ok){ c.fail('swapping to the ' + NAME[tab] + ' never finished'); return; }
          await sleep(3500);
          const fs = frameStats(mon.gaps.slice(g0)); c.metric(NAME[tab] + ' swap took (s)', r1((performance.now() - t0)/1000));
          smoothNote(c, 'swap to the ' + NAME[tab], fs);
          await landed(c, tab, L.S.lockedL);
        }
      } },
      { name: '“Where did the sidebar go?”: Show me where, Got it, Close it for me', async run(c){
        const { w, L } = c; if (!(await attach(c, 'caliper'))) return;
        const hint = w.document.getElementById('dockHint'); if (!hint || !w.document.body.classList.contains('dock-open')) c.fail('the “Where did the sidebar go?” card is not showing while the panel is open'); else c.ok('the card is showing');
        w.document.getElementById('seeWhere').click();
        if (!await until(() => document.querySelector('.where.on'), 3000)){ c.fail('Show me where did not open'); return; }
        await sleep(1500);
        const ov = document.querySelector('.where'), ring = ov.querySelector('.where-ring').getBoundingClientRect(), cap = ov.querySelector('.where-cap').getBoundingClientRect();
        const inside = r => r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
        if (!inside(ring) || !inside(cap)) c.fail('the ring or the note is off the screen'); else c.ok('the ring on the X and the note are on screen');
        if (!ov.querySelector('.where-ghost') || !ov.querySelector('.where-arrow')) c.fail('the sidebar outline or the arrow is missing'); else c.ok('the sidebar outline and the arrow are drawn');
        ov.querySelector('[data-act=ok]').click();
        if (!await until(() => !document.querySelector('.where'), 2500)) c.fail('Got it did not close it'); else c.ok('Got it closes it');
        w.document.getElementById('seeWhere').click(); await until(() => document.querySelector('.where.on'), 3000); await sleep(1500);
        const g0 = c.mon.gaps.length; document.querySelector('.where [data-act=close]').click();
        if (!await until(() => document.getElementById('dock').hidden, 6000)) c.fail('Close it for me did not close the panel'); else c.ok('Close it for me closes the panel');
        if (!await until(() => { const f = L.fly(); return f.t <= 0 && !f.attached; }, 9000)) c.fail('the gauge did not get home'); else c.ok('the gauge is home');
        smoothNote(c, 'the flight home', frameStats(c.mon.gaps.slice(g0)));
        await sleep(600);
        if (document.querySelector('.where')) c.fail('the dimmed overlay is still up');
      } },
      { name: 'Controls inside the panel (the tool beside the gauge)', async run(c){
        const { L } = c; if (!(await attach(c, 'micrometer'))) return; await sleep(3500);
        const dw = dockWin('micrometer'); if (!dw){ c.fail('the micrometer frame in the panel is missing'); return; }
        const dm = instrument(dw), acts = actionsOf(dw).filter(a => a.kind !== 'key' || a.k !== 'Escape'), rand = rng(7), mark = { e: dm.errors.length, g: dm.gaps.length };
        c.metric('controls found in the panel', acts.length); let done = 0;
        for (let i = 0; i < 40 && !run.stop; i++){ const a = acts[Math.floor(rand()*acts.length)]; try { perform(dw, a, rand); done++; } catch (e) { c.fail('“' + a.label + '” threw: ' + e.message); } await sleep(110); }
        const r = inspect(dw, dm, mark); r.found.forEach(x => (WARN[x.type] ? c.warn : c.fail)(x.type + ': ' + x.detail));
        c.metric('actions used', done); smoothNote(c, 'the panel under use', frameStats(r.gaps));
        // however it ended, the gauge must be somewhere sensible: still on the tool, or cleanly handed back to it
        await sleep(1500); const f = L.fly(); c.ok('afterwards the gauge is ' + (f.attached ? 'still drawn on the tool' : 'handed back to the tool (its own copy shows)'));
        if (!dm.errors.slice(mark.e).length) c.ok('no errors in the panel');
      } },
      { name: 'Close the panel with its X: the gauge flies home', async run(c){
        const { L, mon } = c; if (!(await attach(c, 'micrometer'))) return; await sleep(2500);
        const g0 = mon.gaps.length, d = document.getElementById('dock'); d.querySelector('.dock-x').click();
        if (!await until(() => d.hidden, 6000)) c.fail('the panel did not close');
        const home = await until(() => { const f = L.fly(); return f.t <= 0 && !f.attached && !f.waiting; }, 9000);
        if (!home) c.fail('the gauge did not get home'); else c.ok('the gauge is home');
        smoothNote(c, 'the flight home', frameStats(mon.gaps.slice(g0)));
        await sleep(700); const f = L.fly();
        if (!f.pivotVisible) c.fail('the gauge is not visible at home'); else c.ok('the gauge is back in the lab, visible');
        if (f.on) c.fail('the flight canvas is still drawing'); else c.ok('the flight canvas is off');
      } },
      { name: 'Measure into the dial caliper, then “Bring it back”', async run(c){
        const { w, L } = c; const r = await attach(c, 'caliper'); if (!r) return;
        c.metric('tool loaded in (s)', r.loadS); c.metric('flight p95 frame (ms)', r.flight.p95); smoothNote(c, 'flight', r.flight);
        await sleep(3800); await landed(c, 'caliper', r.mm);
        w.document.getElementById('bringBack').click();
        if (!await until(() => { const f = L.fly(); return document.getElementById('dock').hidden && f.t <= 0; }, 12000)) c.fail('Bring it back did not bring it back'); else c.ok('Bring it back closes the panel and the gauge is home');
      } },
      { name: 'Measure into the vernier caliper', async run(c){
        const r = await attach(c, 'vernier'); if (!r) return;
        c.metric('tool loaded in (s)', r.loadS); c.metric('flight p95 frame (ms)', r.flight.p95); smoothNote(c, 'flight', r.flight);
        await sleep(3800); await landed(c, 'vernier', r.mm);
      } },
      { name: 'Auto measure into the micrometer: the whole job, and how close it gets', async run(c){
        const { L, mon } = c; await closePanel(); L.selectSample(L.S.si); await sleep(1500);
        const g0 = mon.gaps.length, t0 = performance.now(); L.runAuto('micrometer');
        if (!await until(() => L.fly().attached, 240000)){ c.fail('Auto measure never got the gauge onto the micrometer'); return; }
        c.metric('whole job (s)', r1((performance.now() - t0)/1000)); smoothNote(c, 'the whole job', frameStats(mon.gaps.slice(g0)));
        await sleep(4500);
        const truth = L.S.lockInfo && L.S.lockInfo.inHole ? L.S.lockInfo.D : null, mm = L.S.lockedL;
        if (truth == null){ c.fail('it locked outside the hole'); return; }
        const err = mm - truth; c.metric('error (mm)', +err.toFixed(3)); c.metric('locked at (° off square)', +Math.abs(L.S.lockInfo.tilt*180/Math.PI).toFixed(2));
        if (Math.abs(err) <= .02) c.ok('locked within 0.02 mm of the hole (' + err.toFixed(3) + ' mm)'); else if (Math.abs(err) <= .05) c.warn('locked ' + err.toFixed(3) + ' mm from the hole'); else c.fail('locked ' + err.toFixed(3) + ' mm from the hole');
        await landed(c, 'micrometer', mm);
        await closePanel();
      } }
    ],
    page: [
      { name: 'Open every tab', win: 'top', async run(c){
        const sh = SH();
        for (const a of sh.APPS){
          const t0 = performance.now(); sh.show(a.id);
          const f = sh.frameFor(a);
          const ok = await until(() => sh.current() === a.id && ready(f) && f.classList.contains('on'), 60000);
          if (!ok){ c.fail(a.name + ' did not open'); continue; }
          const tab = document.getElementById('tab-' + a.id);
          if (tab.getAttribute('aria-selected') !== 'true') c.fail(a.name + ': the tab is not lit'); else if (location.hash !== '#' + a.id) c.fail(a.name + ': the address did not follow'); else c.ok(a.name + ' opened in ' + r1((performance.now() - t0)/1000) + ' s');
          await sleep(900);
        }
      } },
      { name: 'Changelog button', win: 'top', async run(c){
        // the top bar has no changelog button; the one under each tool's logo opens it
        if (document.querySelector('.reset-wrap .shop-vchip')) c.fail('there is still a changelog button in the top bar'); else c.ok('no changelog button in the top bar');
        const fr = document.querySelector('#stage iframe.on') || document.getElementById('app-caliper'), d = fr && fr.contentDocument;
        const chip = d && d.querySelector('.shop-vchip'); if (!chip){ c.fail('the version button under the logo is missing'); return; }
        chip.click(); await sleep(500);
        const m = d.querySelector('.shop-cl');
        if (!m || m.hidden) c.fail('it did not open'); else { c.ok('it opens'); if (!m.textContent.includes((window.__SHOP || {}).version)) c.fail('it does not show the current version'); else c.ok('it shows v' + window.__SHOP.version); }
        // one entry per day, and each says what changed in one short sentence
        const cl = ((window.__SHOP || {}).changelog || []), long = cl.filter(e => e.items.length !== 1 || e.items[0].replace(/How do I (use|read) (it|this)\?/g, 'How do I $1 $2').split(/[.!?](?:\s|$)/).filter(s => s.trim()).length > 1 || e.items[0].length > 120).map(e => 'v' + e.v);
        const days = cl.map(e => e.date).filter(Boolean), twice = days.filter((x, i) => days.indexOf(x) !== i);
        if (long.length) c.fail('not one short sentence: ' + long.join(', ')); else c.ok('every version is one short sentence');
        if (twice.length) c.fail('more than one entry on a day: ' + [...new Set(twice)].join(', ')); else c.ok('one entry per day');
        d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await sleep(500);
        if (m && !m.hidden) c.fail('Escape did not close it'); else c.ok('Escape closes it');
        chip.click(); await sleep(400); m.querySelector('.shop-cl-x').click(); await sleep(400);
        if (!m.hidden) c.fail('its X did not close it'); else c.ok('its X closes it');
      } },
      { name: 'Reset all needs a long hold (a quick press does nothing)', win: 'top', async run(c){
        const b = document.getElementById('resetAll'); if (!b){ c.fail('the button is missing'); return; }
        window.__devMarker = 1; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 3 })); await sleep(350);
        b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 3 })); await sleep(3300);
        if (b.classList.contains('done') || window.__devMarker !== 1) c.fail('a quick press reset everything'); else c.ok('a quick press does nothing');
      } },
      { name: 'Arrow keys move between tabs', win: 'top', async run(c){
        const sh = SH(), tabs = document.getElementById('tabs'); sh.show('caliper'); await sleep(2500);
        const before = sh.current(); tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); await sleep(2500);
        if (sh.current() === before) c.fail('Right arrow did not change tab'); else c.ok('Right arrow goes from ' + before + ' to ' + sh.current());
        tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })); await sleep(2500);
        if (sh.current() !== before) c.fail('Left arrow did not come back'); else c.ok('Left arrow comes back');
      } }
    ]
  };

  /* ---------------- the mouse: zoom, rotate and pan ---------------- */
  // For every tool: one wheel notch, a burst of ten, a rotate drag and a pan drag, with the camera read on every frame. Smooth means:
  // a notch is spread over several frames instead of landing in one jump, nothing overshoots or runs backwards, and a steady drag moves the
  // camera by an even amount each frame (no stalls, no lurches).
  function viewOf(w){
    const V = w.__view, L = w.__lab;
    if (V) return { el: V.el, cam: V.camera, target: () => V.controls.target, ortho: V.ortho };
    if (L && L.cam && L.camera) return { el: w.document.getElementById('cv'), cam: L.camera, target: () => L.cam.t, ortho: false };
    return null;
  }
  const readView = V => {
    const cam = V.cam, t = V.target(), dx = cam.position.x - t.x, dy = cam.position.y - t.y, dz = cam.position.z - t.z, r = Math.hypot(dx, dy, dz) || 1;
    return { z: V.ortho ? Math.log(cam.zoom) : -Math.log(r), az: Math.atan2(dx, dz), po: Math.acos(Math.max(-1, Math.min(1, dy/r))), tx: t.x, ty: t.y, tz: t.z };
  };
  // the camera, read on every frame of the page's own animation clock, for ms milliseconds
  const watchFrames = (w, ms, read) => new Promise(res => {
    const out = [], t0 = performance.now();
    (function f(){ out.push({ t: performance.now() - t0, s: read() }); if (performance.now() - t0 < ms) w.requestAnimationFrame(f); else res(out); })();
  });
  const eachFrame = (w, n, fn) => new Promise(res => { let i = 0; (function f(){ if (i < n){ fn(i++); w.requestAnimationFrame(f); } else res(); })(); });
  const median = a => { const x = a.slice().sort((p, q) => p - q); return x.length ? x[x.length >> 1] : 0; };
  // how much of a zoom move (0 to 1) had happened by time t, from the frames recorded
  const progressAt = (fr, total, z0, t) => { let p = 0; for (let i = 0; i < fr.length; i++){ if (fr[i].t > t) break; p = (fr[i].s.z - z0)/total; } return p; };
  async function zoomJourney(c, V, notches, gapMs, label){
    const w = c.w, el = V.el, r = el.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height/2;
    await sleep(500);
    const s0 = readView(V), rec = watchFrames(w, notches*gapMs + 1100, () => readView(V));
    for (let i = 0; i < notches; i++){ el.dispatchEvent(new w.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: cx, clientY: cy })); if (i < notches - 1) await sleep(gapMs); }
    const fr = await rec, zs = fr.map(f => f.s.z), total = zs[zs.length - 1] - s0.z;
    if (Math.abs(total) < 0.01){ c.fail(label + ': the wheel did not zoom'); return; }
    const backwards = zs.filter((z, i) => i && (z - zs[i - 1])*total < -1e-6).length;
    // the most of the move that lands inside any single 60 Hz frame (16.7 ms): a jump is most of a notch at once, a glide is a small part of it
    let worst = 0; for (let i = 0; i < fr.length; i++){ const p0 = progressAt(fr, total, s0.z, fr[i].t - 1e-6), p1 = progressAt(fr, total, s0.z, fr[i].t + 16.7); worst = Math.max(worst, Math.abs(p1 - p0)); }
    // per notch (each one is 1/notches of the whole move): the share of ONE notch that lands in a frame
    const perNotch = worst*notches;
    let t90 = fr[fr.length - 1].t; for (let i = 0; i < fr.length; i++){ if (Math.abs(zs[i] - s0.z) >= 0.9*Math.abs(total)){ t90 = fr[i].t; break; } }
    const lastNotchAt = (notches - 1)*gapMs, settle = Math.max(0, t90 - lastNotchAt);
    c.metric(label + ': most of one notch in a single frame (%)', Math.round(perNotch*100)); c.metric(label + ': ms to settle after the last notch', Math.round(settle));
    if (perNotch > 0.45) c.fail(label + ': it jumps (' + Math.round(perNotch*100) + '% of a notch lands in one frame)'); else c.ok(label + ': glides (at most ' + Math.round(perNotch*100) + '% of a notch in any one frame)');
    if (settle < 100) c.fail(label + ': it is over ' + Math.round(settle) + ' ms after the last notch, too abrupt'); else c.ok(label + ': eases to a stop over ' + Math.round(settle) + ' ms');
    if (backwards) c.fail(label + ': the zoom turned back on itself ' + backwards + ' times'); else c.ok(label + ': it only ever moves one way');
  }
  async function dragJourney(c, V, kind){
    const w = c.w, el = V.el, r = el.getBoundingClientRect(), pan = kind === 'pan', b = pan ? 2 : 0, bs = pan ? 2 : 1, N = 50;
    const P = (t, x, y, down) => el.dispatchEvent(new w.PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: down ? b : (t === 'pointerup' ? b : -1), buttons: down ? bs : 0 }));
    // a drag that starts on a part (the gauge, a slider, a knob) moves that part instead of the camera: so try a few empty-looking spots
    let fr = null, mag = null, mean = 0;
    for (const [fx, fy] of [[0.15, 0.8], [0.5, 0.55], [0.85, 0.2], [0.1, 0.15], [0.9, 0.85]]){
      const cx = r.left + r.width*fx, cy = r.top + r.height*fy;
      await sleep(500);
      const rec = watchFrames(w, N*17 + 900, () => readView(V));
      P('pointerdown', cx, cy, true);
      // one move every frame, like a steady mouse: any unevenness in the camera is the camera's, not the input's
      await eachFrame(w, N, i => P('pointermove', cx + (i + 1)*4, cy + (i + 1)*1.2, true));
      P('pointerup', cx + N*4, cy + N*1.2, false);
      fr = await rec;
      mag = fr.map((f, i) => { if (!i) return 0; const q = f.s, p = fr[i - 1].s; return pan ? Math.hypot(q.tx - p.tx, q.ty - p.ty, q.tz - p.tz) : Math.hypot(q.az - p.az, q.po - p.po); });
      const mid0 = mag.slice(8, N - 4); mean = mid0.reduce((x, y) => x + y, 0)/Math.max(1, mid0.length);
      if (mean >= 1e-4) break;
    }
    const lab = pan ? 'pan drag' : 'rotate drag';
    if (mean < 1e-4){ c.fail(lab + ': the camera did not move'); return; }
    const mid = mag.slice(8, N - 4), sd = Math.sqrt(mid.reduce((x, y) => x + (y - mean)*(y - mean), 0)/mid.length), cv = sd/mean, stalls = mid.filter(x => x < 0.15*mean).length;
    const tEnd = fr[Math.min(fr.length - 1, N)].t; let lastMove = tEnd; fr.forEach((f, i) => { if (f.t > tEnd && mag[i] > mean*0.03) lastMove = f.t; }); const glide = Math.round(lastMove - tEnd);
    c.metric(lab + ': unevenness (std ÷ mean)', +cv.toFixed(2)); c.metric(lab + ': stalled frames', stalls); c.metric(lab + ': ms it glides on after letting go', glide);
    if (cv > 0.5) c.fail(lab + ': uneven (' + cv.toFixed(2) + ' std ÷ mean per-frame step)'); else c.ok(lab + ': even (' + cv.toFixed(2) + ')');
    if (stalls > 2) c.fail(lab + ': stalls on ' + stalls + ' frames'); else c.ok(lab + ': no stalls');
    if (glide < 60) c.warn(lab + ': stops dead when let go (a little glide feels smoother)'); else c.ok(lab + ': glides to a stop over ' + glide + ' ms');
  }
  const MOUSE_FLOW = { name: 'Mouse controls: zoom, rotate and pan are smooth', win: 'tool', async run(c){
    const V = viewOf(c.w); if (!V || !V.el){ c.warn('no camera to watch in this tool'); return; }
    const g0 = c.mon.gaps.length;
    await zoomJourney(c, V, 1, 0, 'one wheel notch');
    await zoomJourney(c, V, 6, 110, 'six notches, a click at a time');
    await dragJourney(c, V, 'rotate');
    await dragJourney(c, V, 'pan');
    smoothNote(c, 'the frames while the mouse is used', frameStats(c.mon.gaps.slice(g0)));
  } };
  ['caliper', 'vernier', 'micrometer', 'depth', 'height'].forEach(id => { FLOWS[id] = [MOUSE_FLOW]; });
  FLOWS.telescopic.push(MOUSE_FLOW);

  /* ---------------- practice, the walkthrough and the embeds, in every tool that has them ---------------- */
  const pressKey = (w, k, o) => { const e = new w.KeyboardEvent('keydown', Object.assign({ key: k, code: k, bubbles: true, cancelable: true }, o || {})); (w.document.activeElement || w.document.body).dispatchEvent(e); };
  const num = t => { const m = /(\d+\.\d+)/.exec(String(t || '')); return m ? parseFloat(m[1]) : NaN; };
  const hasNote = w => !!w.document.querySelector('.cheat-veil');
  const gdText = w => { const k = w.document.querySelector('.gd-card'); return k ? k.innerText.replace(/\s+/g, ' ') : ''; };
  const gdTitle = w => { const h = w.document.querySelector('.gd-card h4'); return h ? (h.dataset.step || h.textContent) : ''; };
  const gdNext = w => { const n = w.document.querySelector('.gd-next'); if (!n || n.hidden) return false; const last = /Finish/.test(n.textContent); n.click(); return !last; };
  const pickPart = async w => { const l = w.document.getElementById('sampleSel') || w.document.getElementById('partSel'); if (!l) return; const o = [...l.options].find(x => x.value !== 'none'); if (o){ l.value = o.value; l.dispatchEvent(new w.Event('change')); await sleep(1800); } };
  // walks the whole walkthrough, calling `look` on every step
  async function walkGuide(c, look){
    const w = c.w, b = w.document.getElementById('guideBtn'); if (!b){ c.fail('the How do I use it? button is missing'); return false; }
    b.click(); await sleep(900);
    const ch = w.document.querySelector('.gd-choose button'); if (ch){ ch.click(); await sleep(700); }
    for (let k = 0; k < 70; k++){
      const t = gdTitle(w); w.__devTitles = (w.__devTitles || []).concat(t);
      if (t === 'Pick a part'){ await pickPart(w); await sleep(900); if (gdTitle(w) !== t) continue; } else await look(t, k);   // (picking a part moves the card on by itself)
      const pick = w.document.querySelector('.gd-choose:not([hidden]) button'); if (pick){ pick.click(); await sleep(500); }
      await sleep(250); if (!gdNext(w)) break; await sleep(650);
    }
    const x = w.document.querySelector('.gd-x'); if (x) x.click(); await sleep(400); return true;
  }
  const practiceFlows = [
    { name: 'The “Hey, no cheating!” note comes up for the inspector shortcuts, in every mode', win: 'tool', async run(c){
      const w = c.w, ps = w.document.getElementById('practiceBtn');
      pressKey(w, 'F12'); await sleep(400); if (!hasNote(w)) c.fail('F12 did not bring up the note outside practice'); else c.ok('the note comes up outside practice too'); pressKey(w, 'Escape'); await sleep(1700);
      if (!ps){ c.fail('there is no Practice button'); return; }
      if (!w.__inPractice()) ps.click(); await sleep(900);
      if (!w.__inPractice()){ c.fail('Practice did not start'); return; }
      for (const [label, k, o] of [['F12', 'F12'], ['Ctrl+Shift+I', 'KeyI', { ctrlKey: true, shiftKey: true }], ['Ctrl+Shift+J', 'KeyJ', { ctrlKey: true, shiftKey: true }], ['Ctrl+Shift+C', 'KeyC', { ctrlKey: true, shiftKey: true }], ['Ctrl+U', 'KeyU', { ctrlKey: true }], ['Cmd+Option+I', 'KeyI', { metaKey: true, altKey: true }]]){
        pressKey(w, k === 'F12' ? 'F12' : k, o); await sleep(450);
        const card = w.document.querySelector('.cheat-card');
        if (!card) c.fail(label + ' did not bring up the note'); else if (!/Hey, no cheating!/.test(card.textContent) || !/Please don.t cheat, I know you can get it right!/.test(card.textContent)) c.fail(label + ': the note has the wrong words'); else c.ok(label + ' brings up the note');
        pressKey(w, 'Escape'); await sleep(450); if (hasNote(w)) c.fail('Escape did not close the note'); await sleep(1300);
      }
      pressKey(w, 'KeyI'); await sleep(300); if (hasNote(w)) c.fail('a plain I key brought up the note'); else c.ok('a plain key does not');
      ps.click(); await sleep(700);
    } },
    { name: 'Practice: the feedback counts every section, tracks the slips and never hands over the answer', win: 'tool', async run(c){
      const w = c.w, d = w.document, ps = d.getElementById('practiceBtn'); if (!ps){ c.fail('there is no Practice button'); return; }
      if (!w.__inPractice()) ps.click(); await sleep(900);
      let sawTracker = 0;
      for (let k = 0; k < 3; k++){
        const g = d.getElementById('guess'); g.value = ['0', '0', '0.5'][k]; g.dispatchEvent(new w.Event('input', { bubbles: true }));
        d.getElementById('checkBtn').click(); await sleep(900);
        const fbx = d.getElementById('feedback') || d.getElementById('pfb') || d.body, hero = fbx.querySelector('.fx-hero'), trk = fbx.querySelector('.fx-track');
        if (!hero){ c.fail('no feedback after a wrong answer'); continue; }
        const head = hero.querySelector('h4').textContent, sub = hero.querySelector('p').textContent;
        const m = /(\d+) of (\d+) section/.exec(sub);
        if (!m && !/Just one/.test(head) && !/One|only one|1 of/.test(sub)) c.fail('the feedback does not say how many sections were right: “' + sub + '”');
        if (trk){ sawTracker++; const bad = trk.querySelectorAll('.fx-tk.bad').length, good = trk.querySelectorAll('.fx-tk.good').length;
          if (/Just one (piece|extra)/.test(head) && bad !== 1) c.fail('“' + head + '” although ' + bad + ' sections were wrong');
          if (m && (+m[1] !== good)) c.fail('says ' + m[1] + ' right but the tracker shows ' + good);
          if (/left out/.test(fbx.innerText) && /You did everything else right/.test(fbx.innerText) && bad > 1) c.fail('“You did everything else right” although ' + bad + ' sections were wrong'); }
        // the example in the Go to box stays well away from the answer
        const ans = num((fbx.querySelector('.fx-num.ans b') || {}).textContent), ph = num((d.getElementById('setTo') || {}).placeholder);
        if (!isNaN(ans) && !isNaN(ph) && Math.abs(ans - ph) < 0.05 * (/mm/.test((d.getElementById('setTo') || {}).placeholder) ? 25.4 : 1)) c.fail('the Go to example (' + ph + ') is almost the answer (' + ans + ')');
        const nx = [...d.querySelectorAll('button')].find(x => /^\s*Next/.test(x.textContent) && x.offsetParent); if (nx){ nx.click(); await sleep(700); }
      }
      if (sawTracker) c.ok('the section tracker showed on ' + sawTracker + ' of 3 wrong answers'); else c.fail('the section tracker never showed');
      ps.click(); await sleep(600);
    } },
    { name: 'Walkthrough: part cleaning names IPA and Scotch-Brite for the material, and the minimap labels never overlap', win: 'tool', async run(c){
      const w = c.w; let cleaned = false, steps = 0, overlaps = 0, withBoxes = 0;
      await walkGuide(c, async t => {
        steps++;
        const bx = (w.__flatBoxes || []).map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h })); if (bx.length) withBoxes++;
        for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++){ const a = bx[i], b = bx[j]; if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1) overlaps++; }
        if (t === 'Clean the part too'){ cleaned = true; await sleep(600); const tx = gdText(w); if (!/IPA/.test(tx)) c.fail('the part-cleaning step does not mention IPA'); else if (!/Scotch-Brite/.test(tx)) c.fail('it does not mention Scotch-Brite'); else if (!/Search the web/.test(tx)) c.fail('it does not say to search the web just in case'); else c.ok('the part-cleaning step suggests IPA and Scotch-Brite, and a search'); }
        const tip = w.document.querySelector('.gd-card .gd-l.tip, .gd-card .gd-l.ok, .gd-card .gd-l.key, .gd-card .gd-l.act');
        if (tip && !tip.__dev){ tip.__dev = 1; const cs = w.getComputedStyle(tip); if (parseFloat(cs.borderLeftWidth) > 0 || !/gradient/.test(cs.backgroundImage)) c.fail('an embed is not drawn as brackets'); }
      });
      if (!cleaned) c.fail('never reached the part-cleaning step'); if (overlaps) c.fail(overlaps + ' minimap labels overlapped over ' + steps + ' steps'); else c.ok('no minimap labels overlapped (' + withBoxes + ' steps had labels)');
    } }
  ];
  ['caliper', 'vernier', 'micrometer', 'depth', 'height'].forEach(id => FLOWS[id].push(...practiceFlows));
  FLOWS.caliper.push({ name: 'Walkthrough: turn the bezel to zero, with a Zero the bezel button; dial reads say marks past the last number', win: 'tool', async run(c){
    const w = c.w; let bez = false, marks = false;
    const b = w.document.getElementById('guideBtn'); b.click(); await sleep(900);
    for (let k = 0; k < 40; k++){
      const t = gdTitle(w);
      if (t === 'Turn the bezel to zero'){
        bez = true; await until(() => /drifted|isn.t quite on 0/.test(gdText(w)) && +w.document.getElementById('bezelRange').value !== 0, 120000);
        const how = w.document.querySelector('.gd-how'); if (!how || how.hidden || !/Zero the bezel/.test(how.textContent)) c.fail('there is no Zero the bezel button'); else c.ok('there is a Zero the bezel button');
        if (!/drifted|isn.t quite on 0/.test(gdText(w))) c.fail('the bezel was not turned off a little for the person to put right'); else c.ok('the bezel is a little off for the person to put right');
        const slider = w.document.getElementById('bezelRange'); if (+slider.value === 0) c.fail('the slider reads 0 while the needle is off'); how.click();
        await until(() => gdTitle(w) !== 'Turn the bezel to zero', 8000); if (+slider.value !== 0) c.fail('Zero the bezel did not bring the slider to 0'); else c.ok('Zero the bezel puts it on 0 and moves on'); }
      if (t === 'Read the dial'){ await sleep(500); const tx = gdText(w); if (/\d+ marks? past the \d+|right on the \d+/.test(tx)) { marks = true; c.ok('the dial step says how many marks past the last number'); } else c.fail('the dial step does not say how many marks past the last number: ' + tx.slice(0, 160)); }
      if (t === 'Pick a part') await pickPart(w);
      if (!gdNext(w)) break; await sleep(800);
    }
    if (!bez) c.fail('the walkthrough has no Turn the bezel to zero step'); if (!marks) c.fail('never saw the dial reading step'); const x = w.document.querySelector('.gd-x'); if (x) x.click();
  } });
  FLOWS.height.push({ name: 'Walkthrough: it explains why the number below is the one to take', win: 'tool', async run(c){
    const w = c.w; let seen = false; await walkGuide(c, async t => { if (/Find the (inch|centimeter) mark/.test(t)){ seen = true; await sleep(400); const tx = gdText(w); if (!/Why \d+/.test(tx) || !/at or below/.test(tx)) c.fail('“' + t + '” does not explain why the lower number'); else c.ok('“' + t + '” explains why the lower number'); } });
    if (!seen) c.fail('never saw the Find the inch mark step');
  } });
  FLOWS.micrometer.push({ name: 'Every frame size is its own U, and every part measures at every size', win: 'tool', async run(c){
    const w = c.w, C = w.eval('typeof CORE === "undefined" ? null : CORE'); if (!C){ c.fail('the micrometer physics could not be reached'); return; }   // (CORE is a top-level const in the tool's page, so it is not on window)
    const paints = new Set(); let bad = 0, n = 0;
    for (let B = 0; B < 6; B++){
      const D = C.dims(B); paints.add(C.STYLE[B].paint);
      if (Math.abs(D.rxi - D.ryi) > 1e-9 || Math.abs(D.rxo - D.ryo) > 1e-9) c.fail('size ' + B + '–' + (B + 1) + ' is not a perfect U');
      // a U: the throat's walls are straight (the same x all the way down to the half circle), then it curves in round the bottom
      const wall = C.xl(D, D.cy/2), wallR = C.xr(D, D.cy/2), curve = C.xl(D, D.cy - D.rxi*0.6);
      if (Math.abs(wall - D.armR) > 1e-9 || Math.abs(wallR - D.hx) > 1e-9 || !(curve > D.armR + 0.05) || Math.abs(D.bottom - (D.cy - D.rxo)) > 1e-9) c.fail('size ' + B + '–' + (B + 1) + ' is not a U: straight walls, then a half circle');
      for (const key of C.available(B)){
        for (let t = 0; t < 25; t++){
          const S = C.makeSample(key, B, Math.random);
          for (const fid of Object.keys(S.targets || {})){
            n++; const tg = S.targets[fid], truth = S.vals[fid]; let way = false;
            for (const sd of [-1, 1]){ const pi = C.pathInfo(S, tg.s, C.restZ(S, tg.s, B, sd), tg.z, B); if (pi.ok){ way = true; break; } }
            const e = C.evalAt(S, tg.s, tg.z, null, B), outside = truth < B - 1e-9 || truth > B + 1 + 1e-9;
            if (!way || (outside ? !(e.tooSmall || e.tooBig || e.blocked) : (!e.eff || e.gap || Math.abs(e.measured - truth) > 1.5e-4))) bad++;
          }
        }
      }
    }
    if (paints.size !== 6) c.fail('the six frames do not all have their own paint'); else c.ok('six different frames');
    if (bad) c.fail(bad + ' of ' + n + ' measurements went wrong across the six sizes'); else c.ok('all ' + n + ' measurements across the six sizes were right');
  } });
  FLOWS.micrometer.push({ name: 'Every frame: the pads sit upright on the straight walls, the thimble and ratchet turn, and it closes to the frame size', win: 'tool', async run(c){
    const w = c.w, C = w.eval('typeof CORE === "undefined" ? null : CORE'); if (!C){ c.fail('the micrometer physics could not be reached'); return; }
    const lcd = () => parseFloat(w.document.getElementById('lcd').textContent), click = id => w.document.getElementById(id).click();
    const fire = (type, pt) => (w.document.elementFromPoint(pt.x, pt.y) || w.document.querySelector('canvas')).dispatchEvent(new w.PointerEvent(type, { clientX: pt.x, clientY: pt.y, pointerId: 9, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true }));
    const drag = async (pt, dy) => { fire('pointerdown', pt); for (let k = 1; k <= 12; k++){ fire('pointermove', { x: pt.x, y: pt.y + dy*k*5 }); await sleep(30); } fire('pointerup', { x: pt.x, y: pt.y + dy*60 }); await sleep(400); };
    for (let B = 0; B < 6 && !run.stop; B++){
      const D = C.dims(B), name = B + '–' + (B + 1) + '″ frame';
      const btn = w.document.querySelector('[data-range="' + B + '"]'); if (!btn){ c.fail('there is no ' + name + ' button'); continue; }
      btn.click(); await sleep(9000);
      const want = C.STYLE[B].pads, pads = w.__micPads ? w.__micPads() : null;
      if (!pads) c.fail(name + ': the pads cannot be read');
      else {
        if (pads.length !== want) c.fail(name + ': ' + pads.length + ' pads, should be ' + want);
        const bad = pads.filter(q => !(Math.abs(Math.abs(q.a) - Math.PI) < 1e-9 || Math.abs(q.a) < 1e-9) || q.y + q.h/2 > 0.08 || q.y - q.h/2 < D.cy);
        if (bad.length) c.fail(name + ': a pad is tilted or runs off the straight wall'); else if (want) c.ok(name + ': the ' + want + ' pad' + (want > 1 ? 's sit' : ' sits') + ' upright on the straight wall' + (want > 1 ? 's' : ''));
      }
      const fv = w.document.querySelector('[data-view="front"]'); if (fv){ fv.click(); await sleep(3500); }   // (a straight-on view: a drag along the barrel moves the knob in a line, the same on every frame)
      click('openQuick'); await sleep(1500);
      for (const kind of ['ratchet', 'thimble']){
        const pt = w.__micGrab && w.__micGrab(kind); if (!pt){ c.fail(name + ': the ' + kind + ' cannot be found on screen'); continue; }
        const r0 = lcd(); await drag(pt, 1); const r1 = lcd(); await drag(pt, -1); const r2 = lcd();
        if (r0 === r1 && r1 === r2) c.fail(name + ': dragging the ' + kind + ' did not change the reading'); else c.ok(name + ': the ' + kind + ' turns the spindle');
      }
      click('closeQuick'); const closed = await until(() => Math.abs(lcd() - B) < 5e-5, 25000);
      if (closed) c.ok(name + ': closes to ' + B + '.0000'); else c.fail(name + ': closed to ' + lcd().toFixed(4) + ', not ' + B + '.0000');
    }
  } });
  FLOWS.telescopic.push({ name: 'Lock knob: red when locked, plain when unlocked, on every gauge', async run(c){
    const L = c.L;
    for (let i = 0; i < L.GAUGES.length; i++){
      L.selectGauge(i); await sleep(3500);
      if (L.S.unlocked) L.toggleLock(); await sleep(1500);
      const col = () => { const out = []; L.gp().knobG.traverse(o => { if (o.isMesh && o.material && o.material.userData && o.material.userData.tgLook) out.push(o.material.color); }); return out; };
      const red = col().some(x => x.r > 0.6 && x.g < 0.25 && x.b < 0.25);
      L.toggleLock(); await sleep(1500); const plain = !col().some(x => x.r > 0.6 && x.g < 0.25 && x.b < 0.25); L.toggleLock(); await sleep(400);
      if (red && plain) c.ok('gauge ' + L.GAUGES[i].name + ': red locked, plain unlocked'); else c.fail('gauge ' + L.GAUGES[i].name + ': locked ' + (red ? 'red' : 'NOT red') + ', unlocked ' + (plain ? 'plain' : 'STILL red'));
    }
  } });

  // what to say about a stretch of frames
  function smoothNote(c, what, f){
    if (f.n < 6){ c.warn(what + ': too few frames to rate (' + f.n + ')'); return; }
    const g = grade(f), line = what + ': ' + g.word + ' (average ' + f.avg + ' ms a frame, p95 ' + f.p95 + ' ms, worst ' + f.max + ' ms)';
    if (g.cls === 'bad') c.fail(line); else if (g.cls === 'warn') c.warn(line); else c.ok(line);
  }
  // the gauge is on a tool: drawn there, in the tool's own spot, and the tool read it
  async function landed(c, tab, mm){
    const { L } = c, p = SH().pose();
    // once it has landed the tool draws its own copy of the gauge and the flight canvas fades out over it (about 1.5 s): wait for that,
    // then check the tool's own drawing. A tool that cannot draw one keeps the flight canvas, which must then sit on the tool's gauge.
    await until(() => { const q = L.fly(); return q.attached && (!q.native || !q.on); }, 6000);
    const f = L.fly(), dw0 = dockWin(tab);
    if (!f.attached) c.fail('the gauge is not drawn on the tool'); else c.ok('the gauge is drawn on the tool');
    if (!p) c.fail('the tool reports no gauge pose');
    else if (f.native){
      let own = null; try { own = dw0 && dw0.__tgObj && dw0.__tgObj(); } catch (e) {}
      if (!own || own.visible === false) c.fail('the tool took over the gauge but is not drawing one'); else c.ok('the tool draws its own gauge on its own faces');
      if (f.on) c.fail('the flight canvas is still up over the tool’s own gauge');
    } else {
      if (f.sx != null && (Math.abs(f.sx - p.x) > 3 || Math.abs(f.sy - p.y) > 3)) c.fail('the drawn gauge is ' + Math.round(Math.hypot(f.sx - p.x, f.sy - p.y)) + ' px off the tool’s gauge'); else c.ok('it sits on the tool’s own gauge');
      if (!f.on) c.fail('the flight canvas is off while the gauge should be drawn');
    }
    const dw = dockWin(tab);
    if (!dw) c.fail('the tool frame is missing'); else if (showsLength(dw, mm)) c.ok('the ' + NAME[tab] + ' reads the gauge: ' + mm.toFixed(2) + ' mm'); else c.fail('the ' + NAME[tab] + ' does not show ' + mm.toFixed(2) + ' mm (' + (mm/IN).toFixed(4) + ' in) anywhere');
  }
  async function runFlows(id, T, mode, rand){
    const list = FLOWS[id];
    for (let i = 0; i < list.length && !run.stop; i++){
      const sc = list[i], top = sc.win === 'top';
      progress(T, 'flow: ' + sc.name, .96);
      const w = top ? window : (sc.win === 'tool' ? (SH().frames[id] || {}).contentWindow : labWin()), mon = instrument(w), t0 = Date.now();
      const out = { name: sc.name, pass: true, notes: [], metrics: {}, ms: 0 };
      const mark = { e: mon.errors.length, g: mon.gaps.length };
      const c = { w, L: top ? null : w.__lab, mon, ok: m => out.notes.push('✓ ' + m), warn: m => out.notes.push('• ' + m), fail: m => { out.pass = false; out.notes.push('✗ ' + m); }, metric: (k, v) => { out.metrics[k] = v; } };
      try { await sc.run(c); } catch (e) { out.pass = false; out.notes.push('✗ stopped: ' + String((e && e.message) || e).slice(0, 200)); }
      const r = inspect(w, mon, mark);
      r.found.filter(x => !WARN[x.type]).forEach(x => { out.pass = false; out.notes.push('✗ ' + x.type + ': ' + x.detail); addFinding(T, x, [sc.name]); });
      addFrames(T, r.gaps); out.ms = Date.now() - t0;
      T.scenarios.push(out); render();
      if (!top) try { w.document.querySelector('.gd-x') && w.document.querySelector('.gd-x').click(); } catch (e) {}
    }
    if (id === 'telescopic') await closePanel();
  }

  /* ---------------- feedback ---------------- */
  function controlRows(T){
    return Object.values(T.ctl).map(c => ({ label: c.label, kind: c.kind, uses: c.runs, didSomething: c.runs ? Math.round(c.effects/c.runs*100) : 0, avgFrameMs: r1(avg(c.gaps)), p95FrameMs: r1(pct(c.gaps, .95)), worstFrameMs: Math.round(c.worst), janks: c.jank, issues: c.issues }));
  }
  function feedback(T){
    const rows = controlRows(T), f = frameStats(T.fr.sample), g = grade({ ...f, n: T.fr.n, over50: T.fr.over50, over100: T.fr.over100 });
    const slow = rows.filter(r => r.uses >= 2).sort((a, b) => b.p95FrameMs - a.p95FrameMs).slice(0, 6);
    const inert = rows.filter(r => r.uses >= 3 && r.didSomething === 0 && r.kind !== 'key' && r.kind !== 'hover');
    const never = rows.filter(r => r.uses === 0);
    return { rows, frames: { ...f, n: T.fr.n, over34: T.fr.over34, over50: T.fr.over50, over100: T.fr.over100, max: Math.round(T.fr.max) }, grade: g, slow, inert, never };
  }
  let lastRender = 0;
  function progress(T, what, frac){
    const rate = run.steps > 5 && run.active ? (run.steps/(run.active/1000)).toFixed(1) : '–';
    $d('devNow').textContent = (T ? T.id + ': ' : '') + what + ' · ' + rate + ' tests/s · ' + run.steps + ' done';
    $d('devBar').style.width = Math.round(run.base + frac*run.span) + '%';
    if (Date.now() - lastRender > 700){ lastRender = Date.now(); render(); }
  }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function render(){
    const R = run.report; if (!R) return;
    const rows = Object.values(R.tools).map(T => {
      const errs = T.findings.filter(x => !WARN[x.type]).length, warns = T.findings.filter(x => WARN[x.type]).length, fl = T.scenarios, flBad = fl.filter(s => !s.pass).length;
      const fb = feedback(T), bad = errs + flBad;
      return '<tr><td>' + T.name + '</td><td>' + T.controls + '</td><td>' + T.singles.run + '</td><td>' + T.pairs.run + '<span style="color:#8a8f97"> / ' + T.pairs.possible + '</span></td><td>' + T.combos.run + '</td><td>' + T.sequences.run + '</td><td>' + (fl.length ? (fl.length - flBad) + '/' + fl.length : '–') + '</td><td class="' + fb.grade.cls + '">' + (T.fr.n ? fb.grade.word : '–') + '</td><td class="' + (bad ? 'bad' : warns ? 'warn' : 'ok') + '">' + (bad ? bad + ' issue' + (bad > 1 ? 's' : '') : warns ? warns + ' warning' + (warns > 1 ? 's' : '') : 'clean') + '</td></tr>';
    }).join('');
    $d('devSum').innerHTML = '<tr><th>tool</th><th>controls</th><th>single</th><th>pairs</th><th>combos</th><th>runs</th><th>flows</th><th>smoothness</th><th>result</th></tr>' + rows;
    // feedback on everything, per tool
    const opened = new Set([...panel.querySelectorAll('#devFeed > details[open]')].map(x => x.dataset.t));
    $d('devFeed').innerHTML = Object.values(R.tools).map(T => {
      const fb = feedback(T); let h = '<details data-t="' + T.id + '"' + (opened.has(T.id) || (!run.on && !opened.size) ? ' open' : '') + '><summary><span>' + T.name + '</span><small class="' + fb.grade.cls + '">' + (T.fr.n ? fb.grade.word : 'no frames timed') + '</small></summary>';
      if (T.fr.n) h += '<div class="fb"><b>Smoothness.</b> ' + T.fr.n + ' frames timed: average ' + fb.frames.avg + ' ms, p95 ' + fb.frames.p95 + ' ms, worst ' + fb.frames.max + ' ms. ' + fb.frames.over50 + ' hitches over ' + FR.slow + ' ms, ' + fb.frames.over100 + ' janks over ' + FR.jank + ' ms.</div>';
      if (fb.slow.length && fb.slow[0].p95FrameMs > FR.fine) h += '<div class="fb"><b>Slowest controls.</b> ' + fb.slow.filter(r => r.p95FrameMs > FR.fine).map(r => esc(r.label) + ' (p95 ' + r.p95FrameMs + ' ms, worst ' + r.worstFrameMs + ' ms)').join('; ') + '</div>';
      if (fb.inert.length) h += '<div class="fb"><b>Did nothing you could see (' + fb.inert.length + ').</b> ' + fb.inert.slice(0, 14).map(r => esc(r.label)).join(', ') + (fb.inert.length > 14 ? '…' : '') + ' (some are meant to, when they are at a limit)</div>';
      if (T.scenarios.length) h += T.scenarios.map(s => '<div class="sc"><b><span class="' + (s.pass ? 'ok' : 'bad') + '">' + (s.pass ? '✓' : '✗') + '</span> ' + esc(s.name) + ' <small style="color:#8a8f97;font-weight:400">' + Math.round(s.ms/1000) + ' s' + Object.entries(s.metrics).map(e => ' · ' + e[0] + ' ' + e[1]).join('') + '</small></b><ul>' + s.notes.slice(0, 40).map(n => '<li class="' + (n[0] === '✗' ? 'bad' : n[0] === '•' ? 'warn' : '') + '">' + esc(n) + '</li>').join('') + '</ul></div>').join('');
      if (fb.rows.length) h += '<details><summary><span>Every control (' + fb.rows.length + ')</span><small>uses · did something · frame ms</small></summary><table class="ctl"><tr><th>control</th><th>kind</th><th>uses</th><th>did something</th><th>p95</th><th>worst</th></tr>' + fb.rows.map(r => '<tr><td>' + esc(r.label) + '</td><td>' + r.kind + '</td><td>' + r.uses + '</td><td>' + r.didSomething + '%</td><td class="' + (r.p95FrameMs > FR.slow ? 'bad' : r.p95FrameMs > FR.fine ? 'warn' : '') + '">' + r.p95FrameMs + '</td><td class="' + (r.worstFrameMs > FR.jank ? 'warn' : '') + '">' + r.worstFrameMs + '</td></tr>').join('') + '</table></details>';
      return h + '</details>';
    }).join('');
    const all = [];
    Object.values(R.tools).forEach(T => T.findings.forEach(x => all.push({ tool: T.name, x })));
    all.sort((p, q) => (WARN[p.x.type] ? 1 : 0) - (WARN[q.x.type] ? 1 : 0));
    $d('devFinds').innerHTML = all.length ? all.slice(0, 60).map(({ tool, x }) => '<div class="find ' + (WARN[x.type] ? 'warn' : 'bad') + '"><b>' + tool + ' · ' + x.type + (x.count > 1 ? ' (×' + x.count + ')' : '') + '</b>' + esc(x.detail) + '<code>' + esc(x.example.map((s, i) => (i + 1) + '. ' + s).join('\n') + (Object.keys(x.by || {}).length > 1 ? '\nset off most by: ' + Object.entries(x.by).sort((p, q) => q[1] - p[1]).slice(0, 4).map(e => e[0] + ' ×' + e[1]).join(', ') : '')) + '</code></div>').join('') : (run.on ? '' : '<div class="ok">Nothing glitched.</div>');
  }
  // the whole report as plain words: what ran, how smooth it was, and what to look at
  function summaryText(){
    const R = run.report; if (!R) return 'No run yet.';
    const L = ['Shop Tool Sim dev run · ' + R.mode + ' · seed ' + R.seed + ' · ' + R.startedAt + (R.totalMs ? ' · ' + fmtMs(R.totalMs) : ''), ''];
    Object.values(R.tools).forEach(T => {
      const fb = feedback(T), errs = T.findings.filter(x => !WARN[x.type]), warns = T.findings.filter(x => WARN[x.type]);
      L.push(T.name.toUpperCase() + ' — ' + (errs.length || T.scenarios.some(s => !s.pass) ? 'ISSUES' : 'clean') + (T.fr.n ? ' · ' + fb.grade.word : ''));
      L.push('  controls ' + T.controls + ' · single ' + T.singles.run + ' · pairs ' + T.pairs.run + '/' + T.pairs.possible + ' · checkbox combinations ' + T.combos.run + '/' + T.combos.possible + ' (' + T.combos.toggles + ' checkboxes) · random runs ' + T.sequences.run + ' · flows ' + T.scenarios.filter(s => s.pass).length + '/' + T.scenarios.length);
      if (T.fr.n) L.push('  smoothness: ' + T.fr.n + ' frames, average ' + fb.frames.avg + ' ms, p95 ' + fb.frames.p95 + ' ms, worst ' + fb.frames.max + ' ms, ' + fb.frames.over50 + ' hitches, ' + fb.frames.over100 + ' janks');
      fb.slow.filter(r => r.p95FrameMs > FR.fine).forEach(r => L.push('  slow: ' + r.label + ' — p95 ' + r.p95FrameMs + ' ms, worst ' + r.worstFrameMs + ' ms'));
      if (fb.inert.length) L.push('  did nothing visible: ' + fb.inert.map(r => r.label).join(', '));
      T.scenarios.forEach(s => { L.push('  ' + (s.pass ? '✓' : '✗') + ' ' + s.name + ' (' + Math.round(s.ms/1000) + ' s)'); s.notes.filter(n => n[0] !== '✓' || !s.pass).forEach(n => L.push('      ' + n)); });
      errs.forEach(x => L.push('  ✗ ' + x.type + ' ×' + x.count + ': ' + x.detail + ' (after: ' + x.example.join(' › ') + ')'));
      warns.forEach(x => L.push('  • ' + x.type + ' ×' + x.count + ': ' + x.detail));
      L.push('');
    });
    return L.join('\n');
  }
  async function start(){
    if (run.on) return;
    const mode = MODES[$d('devMode').value], seed = +$d('devSeed').value || 1;
    const ids = [...panel.querySelectorAll('input[data-t]:checked')].map(x => x.dataset.t);
    const opt = { controls: $d('devCtl').checked, combos: $d('devCombo').checked, flows: $d('devFlow').checked };
    if (!ids.length) return;
    run.on = true; run.stop = false; run.steps = 0; run.active = 0; run.t0 = Date.now();
    run.report = { startedAt: new Date().toISOString(), mode: $d('devMode').value, seed, options: opt, userAgent: navigator.userAgent, tools: {}, note: 'Pairs, combinations and runs are sampled unless the mode is Thorough; the counts say what was covered. Frame times are the gaps between painted frames.' };
    $d('devGo').disabled = true; $d('devStop').disabled = false; $d('devSub').textContent = 'running';
    const t0 = Date.now();
    for (let n = 0; n < ids.length && !run.stop; n++){
      run.base = n/ids.length*100; run.span = 100/ids.length;
      const T = run.report.tools[ids[n]] = newTool(ids[n]);
      try {
        if (ids[n] === 'page'){ await openTool('caliper'); await runFlows('page', T, mode, rng(seed)); }
        else await testTool(ids[n], mode, seed, T, opt);
      } catch (e) { T.findings.push({ k: 'harness', type: 'test harness stopped', detail: String(e && e.message || e) + (e && e.stack ? ' @ ' + String(e.stack).split('\n').slice(1, 3).concat(String(e.stack).split('\n').slice(-4)).map(x => x.trim().replace(/^at /, '')).join(' < ') : ''), count: 1, example: [] }); }
      render();
    }
    run.report.totalMs = Date.now() - t0;
    // the report carries the feedback with it
    Object.values(run.report.tools).forEach(T => { const fb = feedback(T); T.feedback = { smoothness: fb.grade.word, frames: fb.frames, slowestControls: fb.slow, didNothingVisible: fb.inert.map(r => r.label), controls: fb.rows }; });
    run.on = false; $d('devGo').disabled = false; $d('devStop').disabled = true; $d('devBar').style.width = '100%';
    const bad = Object.values(run.report.tools).reduce((s, T) => s + T.findings.filter(x => !WARN[x.type]).length + T.scenarios.filter(q => !q.pass).length, 0);
    $d('devSub').textContent = (run.stop ? 'stopped · ' : 'done · ') + fmtMs(run.report.totalMs) + ' · ' + (bad ? bad + ' issue' + (bad > 1 ? 's' : '') : 'clean');
    $d('devNow').textContent = '';
    render();
    window.__devReport = run.report;
  }
  // how long a run will take: about 10 steps a second; a pair is two steps, a random run about 6, a combination about a dozen; flows take minutes
  const estimate = () => {
    const mode = MODES[$d('devMode').value], real = [...panel.querySelectorAll('input[data-t]:checked')].map(x => x.dataset.t).filter(x => x !== 'page'), n = real.length, c = 70;
    const ctl = $d('devCtl').checked, combos = $d('devCombo').checked, flows = $d('devFlow').checked;
    let steps = n*((ctl ? c + (mode.pairs === Infinity ? c*(c - 1) : mode.pairs)*2 + mode.seqs*6.5 : 0) + (combos ? mode.combos*(4 + mode.probe) : 0));
    let ms = steps/RATE*1000;
    if (flows){ ms += n*15000; if (real.includes('telescopic')) ms += 6*60000; if ([...panel.querySelectorAll('input[data-t]:checked')].some(x => x.dataset.t === 'page')) ms += 60000; }
    $d('devEst').textContent = 'About ' + fmtMs(ms) + ' for ' + n + ' tool' + (n === 1 ? '' : 's') + ' at ' + RATE + ' steps a second' + (flows ? ', with the flows' : '') + '.';
  };
  panel.addEventListener('change', estimate); estimate();
  $d('devGo').addEventListener('click', start);
  $d('devStop').addEventListener('click', () => { run.stop = true; $d('devSub').textContent = 'stopping…'; });
  const text = () => JSON.stringify(run.report || {}, (k, v) => (k === 'k' || k === 'sample') ? undefined : v, 2);
  const copy = (s, ok) => { try { navigator.clipboard.writeText(s); $d('devNow').textContent = ok; } catch (e) { $d('devNow').textContent = 'Could not copy. Use Download.'; } };
  $d('devCopy').addEventListener('click', () => copy(text(), 'Report copied.'));
  $d('devSummary').addEventListener('click', () => copy(summaryText(), 'Summary copied.'));
  $d('devSave').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text()], { type: 'application/json' })); a.download = 'shop-tool-sim-dev-report.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
  window.__dev = { start, run, MODES, discover, instrument, inspect, openTool, summaryText, frameStats, grade };
  if (qs.get('dev') === 'run') setTimeout(() => { panel.hidden = false; start(); }, 2500);
})();
