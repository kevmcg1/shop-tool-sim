// Two small view behaviours shared by the tools:
//  1. the mouse legend (gear, Rotate/Pan/Zoom) and the view buttons are wrapped in one vertical stack, centered at the left of the 3D view
//  2. the outline that runs around the message pill moves at a steady speed, so a long message takes longer to go round instead of rushing
(function(){
  function stack(){
    const legend = document.querySelector('.legend'), views = document.querySelector('.views');
    if (!legend || !views || legend.parentNode !== views.parentNode || document.querySelector('.vstack')) return;
    const box = document.createElement('div');
    box.className = 'vstack';
    legend.parentNode.insertBefore(box, legend);
    box.appendChild(legend); box.appendChild(views);
    // the stack is icons only: each mouse button keeps just its drawing, and its name moves to the tooltip
    legend.querySelectorAll('.mk').forEach(mk => {
      const tn = [...mk.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
      if (!tn) return;
      const name = tn.textContent.trim(), sp = document.createElement('span');
      sp.className = 'mk-t'; sp.textContent = name; mk.replaceChild(sp, tn);
      mk.setAttribute('data-tip', name + '\nMouse button. Change which one in the settings gear.'); mk.setAttribute('aria-label', name);
    });
  }
  function trace(){
    const t = document.getElementById('toast'); if (!t) return;
    const SPEED = 380;   // pixels of outline per second
    let obs = null;
    const run = () => {
      const show = t.classList.contains('show');
      if (!show){ if (t.classList.contains('trace')){ t.classList.remove('trace'); obs.takeRecords(); } return; }
      const p = 2 * (t.offsetWidth + t.offsetHeight);
      t.style.setProperty('--trace-dur', Math.max(1.1, p / SPEED).toFixed(2) + 's');
      t.classList.remove('trace'); void t.offsetWidth; t.classList.add('trace');   // every new message starts a new lap
      obs.takeRecords();   // (our own class change must not trigger another run)
    };
    obs = new MutationObserver(run);
    obs.observe(t, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
  }

  // Pop-ups that open beside or under a control (the mouse settings, dropdown lists, the message pill) are slid back inside the window
  // when they would run past an edge, and the settings panel scrolls inside itself when the window is too short for it.
  function iconsOnly(){
    const st = document.createElement('style');
    st.textContent = '@media (min-width:861px){.vstack .mk-t{display:none}.vstack .mk{padding:5px;gap:0;height:30px;width:30px;justify-content:center}.vstack .ib.shop-gfx{width:30px;padding:0;gap:0}.vstack .ib.shop-gfx span{display:none}}';
    document.head.appendChild(st);
  }
  function guard(){
    const st = document.createElement('style');
    st.textContent = '.ms-panel{max-height:calc(100vh - 16px);overflow-y:auto;overscroll-behavior:contain}';
    document.head.appendChild(st);
    const SEL = '.ms-panel,.dd-list,.toast', M = 8;
    const fit = el => {
      el.style.translate = '';
      const r = el.getBoundingClientRect(); if (!r.width && !r.height) return;
      const W = innerWidth, H = innerHeight; let dx = 0, dy = 0;
      if (r.left < M) dx = M - r.left; else if (r.right > W - M) dx = W - M - r.right;
      if (r.top < M) dy = M - r.top; else if (r.bottom > H - M) dy = H - M - r.bottom;
      if (dx || dy) el.style.translate = dx + 'px ' + dy + 'px';
    };
    let q = 0;
    const run = () => { cancelAnimationFrame(q); q = requestAnimationFrame(() => document.querySelectorAll(SEL).forEach(fit)); };
    new MutationObserver(run).observe(document.body, { attributes: true, attributeFilter: ['class', 'hidden'], subtree: true, childList: true });
    addEventListener('resize', run);
  }
  function go(){ stack(); iconsOnly(); trace(); guard(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
