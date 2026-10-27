// Bubbles: when a page loads, and each time a tool is shown, everything on it pops into view one piece at a time, top to bottom and
// left to right, each growing out of nothing like a bubble: every bit of text, every button, slider and list, the cards, the
// minimaps, the logos and icons, and the left sidebar (its panels fade in first, then what is on them pops). The 3D tool itself is
// left out: once everything has popped, the page asks for it (window.__afterBubbles) and it glides in on its own (js/dissolve.js).
//
// Everything starts out hidden (this file loads first thing in each page's <head>), so the bubble is the first time a thing is seen,
// not a replay. Only scale and opacity are borrowed, so nothing moves in the layout and the browser does the work off the main
// thread. Nothing happens for anyone who asks for less motion. Each tool page loads this, and so does the page around the tools,
// which calls window.__bubbles() when a tool is shown.
(function(){
  if (window.__bubbles) return;
  const ACT = 'button,select,input,textarea,a[href],[role="tab"],summary,label';          // things you press or change
  const UNIT = '.cell,.hlcard,.op,.logo,.sub-h,h1,h2,h3,#flat,#loupe,.ms-panel,.hrx-card'; // cards, headings and minimaps that pop as one piece
  const SURF = 'aside,aside > section,#reading';                                            // panels: they fade in, what is on them pops
  const ICON = 'svg,img,i[class*="fa-"]';                                                   // loose icons and logos
  const SKIP = '.intro,.brand,.gd,.gd-card,.cheat-veil,.dev,.toast,.shop-cl,#loading,.tip,.howread,.mn,.coach,[hidden],[aria-hidden="true"]';
  // two ways of arriving, told apart by the phase the page is in: the page loading (everything pops in, a slow cascade) and a tool being
  // changed (the tabs, logo and buttons round the tool stay where they are; only the new tool's page pops in, quicker and gentler)
  const MODES = {
    load:   { STEP: 20, MAX_MS: 1900, DUR: 380, FADE: 220, FROM: '0.35', T0: 0 },
    switch: { STEP: 3, MAX_MS: 260, DUR: 220, FADE: 140, FROM: '0.5',  T0: 10 }
  };
  const root0 = document.documentElement;
  // The phase tracker: window.__phase and <html data-phase> say which it is: loading (waiting to start), load (page-load cascade running),
  // switch (a tool is being changed, up to the moment its picture has arrived), ready. window.__phaseLog keeps the last few changes.
  const setPhase = p => {
    if (window.__phase === p) return;
    window.__phase = p; root0.dataset.phase = p;
    (window.__phaseLog = window.__phaseLog || []).push({ t: Math.round(performance.now()), phase: p }); if (window.__phaseLog.length > 40) window.__phaseLog.shift();
  };
  window.__setPhase = setPhase;
  setPhase('loading');
  // a tool's page reads the phase of the page round it, to know whether it is loading with the page or being opened by a tab
  const parentPhase = () => { try { return window.parent !== window ? window.parent.__phase : undefined; } catch (e) { return undefined; } };
  let nextMode = null;
  const root = document.documentElement;
  let lastAt = 0, token = 0, settled = false, waiting = [];

  const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const can = () => { try { return !!(CSS.supports && CSS.supports('scale', '1') && Element.prototype.animate); } catch (e) { return false; } };
  const on = !calm() && can();

  // the 3D tool waits for everything else (it is let go at once where there are no bubbles)
  const settle = () => {
    settled = true;
    if (window.parent === window && window.__phase !== 'switch') setPhase('ready');   // (the page round the tools has nothing more to wait for)
    waiting.splice(0).forEach(f => { try { f(); } catch (e) {} });
  };
  window.__afterBubbles = cb => { if (settled || !on) cb(); else { waiting.push(cb); setTimeout(() => { if (waiting.includes(cb)){ waiting.splice(waiting.indexOf(cb), 1); cb(); } }, 20000); } };
  if (!on){ window.__bubbles = () => {}; window.__phaseDone = () => {}; setPhase('ready'); return; }

  // hidden until their turn: everything but the 3D picture, the loading screen and any note (the class comes off in the same breath
  // as the bubbles are made, so nothing flashes)
  const st = document.createElement('style');
  st.textContent = 'html.bub-wait body *:not(canvas,iframe,:has(iframe),script,style,#loading,#loading *,.intro,.intro *,.brand,.brand *,.gd,.gd *,.cheat-veil,.cheat-veil *,.dev,.dev *,.toast,.toast *,.shop-cl,.shop-cl *){opacity:0 !important}';
  (document.head || root).appendChild(st);
  const hide = () => root.classList.add('bub-wait');
  const show = () => root.classList.remove('bub-wait');
  hide();
  // never leave a page hidden: if its turn has not come after a good while, and it is on screen, show it
  const guard = () => { if (!root.classList.contains('bub-wait')) return; if (document.hidden || innerWidth < 10){ setTimeout(guard, 5000); return; } show(); };
  setTimeout(guard, 15000);

  const rectOf = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) < 0.05) return null;
    return r;
  };
  const below = (el, sel) => el.closest(sel);

  function gather(){
    const ok = e => !below(e, SKIP) && rectOf(e);
    const surfs = [...document.querySelectorAll(SURF)].filter(ok);
    const units = [...document.querySelectorAll(UNIT)].filter(ok);
    const topUnits = units.filter(u => !units.some(o => o !== u && o.contains(u)));
    const inUnit = e => topUnits.some(u => u !== e && u.contains(e));
    const acts = [...document.querySelectorAll(ACT)].filter(e => ok(e) && !inUnit(e));
    const topActs = acts.filter(a => !acts.some(o => o !== a && o.contains(a)));
    const inside = e => topUnits.some(u => u.contains(e)) || topActs.some(a => a.contains(e));
    const icons = [...document.querySelectorAll(ICON)].filter(e => ok(e) && !inside(e));
    // every bit of text that is not already part of something above: the element that holds it
    const texts = new Set();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => /\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    for (let n = walk.nextNode(); n; n = walk.nextNode()){
      const e = n.parentElement; if (!e || /^(SCRIPT|STYLE|OPTION|CANVAS|TITLE)$/.test(e.tagName)) continue;
      if (ok(e) && !inside(e) && !surfs.includes(e)) texts.add(e);
    }
    const tl = [...texts];
    const topTexts = tl.filter(t => !(getComputedStyle(t).display === 'inline' && tl.some(o => o !== t && o.contains(t))));   // (a bold word pops with its sentence)
    const pieces = [...topUnits, ...topActs, ...icons, ...topTexts];
    const rows = e => { const r = e.getBoundingClientRect(); return [Math.round(r.top/26), r.left]; };
    pieces.sort((a, b) => { const x = rows(a), y = rows(b); return (x[0] - y[0]) || (x[1] - y[1]); });
    return { surfs, pieces };
  }

  function run(){
    show();                                                       // (the animations below take over before anything is painted)
    const now = Date.now(); if (now - lastAt < 1000) return false;
    const { surfs, pieces } = gather();
    if (!pieces.length && !surfs.length){ settle(); return false; }   // (a page that is not showing has nothing to pop)
    const mode = nextMode || (parentPhase() === 'switch' ? 'switch' : 'load'); nextMode = null;
    if (mode === 'switch'){ settle(); return false; }   // (changing tools only dissolves; the bubbles are for the page loading)
    lastAt = now; const mine = ++token;
    const { STEP, MAX_MS, DUR, FADE, FROM, T0 } = MODES[mode];
    setPhase(mode);
    const t0 = T0, step = Math.min(STEP, MAX_MS/Math.max(1, pieces.length));
    const made = [];
    surfs.forEach((e, i) => {
      try { made.push(e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE, delay: i*(mode === 'load' ? 25 : 20), easing: 'ease-out', fill: 'backwards' })); } catch (er) {}
    });
    pieces.forEach((e, i) => {
      try {
        made.push(e.animate(
          [{ opacity: 0, scale: FROM }, { opacity: 1, scale: '1.07', offset: 0.66 }, { opacity: 1, scale: '1' }],
          { duration: DUR, delay: t0 + i*step, easing: 'cubic-bezier(.33,.9,.4,1)', fill: 'backwards' }));
      } catch (er) { /* this one just appears */ }
    });
    made.forEach(a => { a.onfinish = a.oncancel = () => { try { a.cancel(); } catch (e) {} }; });
    const total = t0 + Math.max(0, pieces.length - 1)*step + DUR;
    // the tool glides in once they are all up
    setTimeout(() => { if (token === mine) settle(); }, total + 80);
    setTimeout(() => { if (token === mine && window.parent !== window && window.__phase === mode) window.__phaseDone(); }, total + 6000);   // (a tool whose picture never says it has arrived)
    // whatever happens (a hidden tab pauses animations), nothing is left see-through
    setTimeout(() => { if (token === mine) made.forEach(a => { try { a.finish(); } catch (e) {} }); }, total + 1500);
    return true;
  }

  // called when a tool is shown again: its text and controls go out of sight at once, then pop in a moment later (so a page that has
  // just been shown has its size)
  window.__bubbles = (m) => { settled = false; nextMode = m || 'switch'; lastAt = 0; hide(); setTimeout(run, 40); };
  // the tool's picture has arrived: the page is ready again (and so is the page round it, if this was a tool being changed)
  window.__phaseDone = () => { setPhase('ready'); try { if (window.parent !== window && window.parent.__phase === 'switch' && window.parent.__setPhase) window.parent.__setPhase('ready'); } catch (e) {} };
  // A tool page does not wait for its loading screen (the 3D engine can take a while): its controls and text pop as soon as the page is
  // laid out, round the loading bar, and the 3D picture glides in once the engine is ready. The page around the tools starts as soon as
  // it is read.
  // The page's markup comes before its scripts, so the moment the parser reaches the first script after it (any but this one and the loading
  // bar's) everything to pop is already there: start then, without waiting for the rest of the scripts to download and run.
  let began = false;
  // On the page around the tools, nothing pops until the opening screen has flown its logo to the top-left (index.html: window.__afterIntro).
  const begin = () => { if (began) return; began = true; if (window.parent === window && window.__afterIntro) window.__afterIntro(run); else run(); };
  const whenStyled = () => {
    const ready = () => [...document.querySelectorAll('link[rel="stylesheet"]')].every(l => l.sheet);
    if (ready()) begin(); else { const t = setInterval(() => { if (ready()){ clearInterval(t); begin(); } }, 4); setTimeout(() => { clearInterval(t); begin(); }, 3000); }
  };
  const start = () => whenStyled();
  if (document.readyState === 'loading' && window.MutationObserver){
    const mo = new MutationObserver(ms => {
      for (const m of ms) for (const n of m.addedNodes){
        if (n.nodeType === 1 && n.tagName === 'SCRIPT' && n.getAttribute('src') && !/(^|\/)(bubbles|loading)\.js/.test(n.getAttribute('src')) && document.body && document.body.children.length){ mo.disconnect(); whenStyled(); return; }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
