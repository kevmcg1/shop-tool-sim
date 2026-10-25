// Bubbles: when a page loads, and each time a tool is shown, its buttons, sliders, lists, cards and headings pop into view one
// after another, top to bottom and left to right, each growing out of nothing like a bubble. They start out hidden (this file loads
// first thing in each page's <head>), so the bubble is the first time they are seen, not a second time after they have shown.
// Only each element's scale and opacity are borrowed, so nothing moves in the layout, and nothing happens for anyone who asks for
// less motion. Each tool page loads this, and so does the page around the tools, which calls window.__bubbles() when a tool is shown.
(function(){
  if (window.__bubbles) return;
  const ACT = 'button,select,input,textarea,a[href],[role="tab"],summary,label';          // things you press or change
  const BLK = '.cell,.hlcard,.op,.logo,.sub-h,h1,h2,h3';                                    // cards and headings that pop as one piece
  const SKIP = '.gd,.gd-card,.cheat-veil,.dev,.toast,.shop-cl,#loading,.tip,.howread,.mn,[hidden],[aria-hidden="true"]';
  const STEP = 26, MAX_MS = 1500, DUR = 560;
  const root = document.documentElement;
  let lastAt = 0, token = 0;

  const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const can = () => { try { return !!(CSS.supports && CSS.supports('scale', '1') && Element.prototype.animate); } catch (e) { return false; } };
  const on = !calm() && can();
  if (!on){ window.__bubbles = () => {}; return; }

  // hidden until their turn (the class comes off the moment the bubbles are made, in the same breath, so nothing flashes)
  const st = document.createElement('style');
  st.textContent = 'html.bub-wait :is(' + ACT + ',' + BLK + '):not(#loading *,.gd *,.gd-card *,.cheat-veil *,.dev *,.toast *,.shop-cl *){opacity:0 !important}';
  (document.head || root).appendChild(st);
  const hide = () => root.classList.add('bub-wait');
  const show = () => root.classList.remove('bub-wait');
  hide();
  // never leave a page hidden: if its turn has not come after a good while, and it is on screen, show it
  const guard = () => { if (!root.classList.contains('bub-wait')) return; if (document.hidden || innerWidth < 10){ setTimeout(guard, 5000); return; } show(); };
  setTimeout(guard, 15000);

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
    show();                                                       // (the animations below take over before anything is painted)
    const now = Date.now(); if (now - lastAt < 1500) return false;
    const list = gather(); if (!list.length) return false;       // (a page that is not showing has nothing to pop)
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

  // called when a tool is shown again: its controls go out of sight at once, then pop in a moment later (so a page that has just
  // been shown has its size)
  window.__bubbles = () => { hide(); setTimeout(run, 60); };
  // a tool page waits for its loading screen to go; the page around the tools has none and starts as soon as it is read
  const start = () => {
    if (!document.getElementById('loading')){ requestAnimationFrame(() => setTimeout(run, 30)); return; }
    const t = setInterval(() => { if (!document.getElementById('loading')){ clearInterval(t); setTimeout(run, 380); } }, 100);
    setTimeout(() => clearInterval(t), 30000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
