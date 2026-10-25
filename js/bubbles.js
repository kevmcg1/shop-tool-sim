// Bubbles: when a page has loaded, and again each time a tool is shown, its buttons, sliders, lists, cards and headings pop into
// view one after another, top to bottom and left to right, each growing out of nothing like a bubble. It only borrows a moment of
// each element's scale and opacity, so nothing moves in the layout, and it does nothing for anyone who asks for less motion.
// Each tool page loads this (and the page around the tools); the page around them calls window.__bubbles() when a tool is shown.
(function(){
  if (window.__bubbles) return;
  const ACT = 'button,select,input,textarea,a[href],[role="tab"],summary,label';          // things you press or change
  const BLK = '.cell,.hlcard,.op,.logo,.sub-h,h1,h2,h3';                                    // cards and headings that pop as one piece
  const SKIP = '.gd,.gd-card,.cheat-veil,.dev,.toast,.shop-cl,#loading,.tip,.howread,.mn,[hidden],[aria-hidden="true"]';
  const STEP = 26, MAX_MS = 1500, DUR = 560;
  let lastAt = 0, token = 0;

  const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const can = () => { try { return !!(CSS.supports && CSS.supports('scale', '1') && Element.prototype.animate); } catch (e) { return false; } };
  const onScreen = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) < 0.05) return null;
    return r;
  };

  function gather(){
    const blocks = [...document.querySelectorAll(BLK)].filter(e => !e.closest(SKIP) && onScreen(e));
    const inBlock = e => blocks.some(b => b !== e && b.contains(e));
    const acts = [...document.querySelectorAll(ACT)].filter(e => !e.closest(SKIP) && !inBlock(e) && onScreen(e));
    const outer = e => !acts.some(a => a !== e && a.contains(e));                          // a label's own box, not the box inside it
    const all = [...blocks.filter(b => !blocks.some(o => o !== b && o.contains(b))), ...acts.filter(outer)];
    return all.map(e => ({ e, r: e.getBoundingClientRect() }))
      .sort((a, b) => (Math.round(a.r.top/28) - Math.round(b.r.top/28)) || (a.r.left - b.r.left));
  }

  function run(){
    if (calm() || !can()) return false;
    const now = Date.now(); if (now - lastAt < 1500) return false;
    const list = gather(); if (!list.length) return false;   // (a page that is not showing has nothing to pop)
    lastAt = now; const mine = ++token;
    const step = Math.min(STEP, MAX_MS/list.length);
    list.forEach((it, i) => {
      try {
        const a = it.e.animate(
          [{ opacity: 0, scale: '0.25' }, { opacity: 1, scale: '1.12', offset: 0.62 }, { opacity: 1, scale: '1' }],
          { duration: DUR, delay: i*step, easing: 'cubic-bezier(.25,.8,.35,1)', fill: 'backwards' });
        a.onfinish = a.oncancel = () => { try { a.cancel(); } catch (e) {} };
      } catch (e) { /* this one just appears */ }
    });
    // whatever happens (a hidden tab pauses animations), nothing is left see-through
    setTimeout(() => { if (token === mine) list.forEach(it => { try { it.e.getAnimations().forEach(a => { if (a.effect && a.effect.getTiming().duration === DUR) a.finish(); }); } catch (e) {} }); }, MAX_MS + DUR + 1500);
    return true;
  }

  // a moment after being called, so a page that has only just been shown has its size
  window.__bubbles = () => { setTimeout(run, 120); };
  // a tool page waits for its loading screen to go; the page around the tools has none and starts at once
  const start = () => {
    if (!document.getElementById('loading')){ window.__bubbles(); return; }
    const t = setInterval(() => { if (!document.getElementById('loading')){ clearInterval(t); setTimeout(run, 380); } }, 100);
    setTimeout(() => clearInterval(t), 30000);
  };
  if (document.readyState === 'complete') start(); else addEventListener('load', start);
})();
