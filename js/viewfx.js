// Two small view behaviours shared by the tools:
//  1. the mouse legend (gear, Rotate/Pan/Zoom) and the view buttons are wrapped in one vertical stack, centered at the left of the 3D view
//  2. the outline that runs around the message pill moves at a steady speed, so a long message takes longer to go round instead of rushing
(function(){
  function stack(){
    const legend = document.querySelector('.legend'), views = document.querySelector('.views'), quick = document.querySelector('.quick'), go = quick && quick.querySelector('.goto');
    if (!legend || !views || document.querySelector('.vstack')) return;
    // the view buttons make a vertical stack, centered at the left of the 3D view
    const box = document.createElement('div');
    box.className = 'vstack';
    views.parentNode.insertBefore(box, views);
    box.appendChild(views);
    // the mouse controls (settings gear and the three mouse buttons) sit in the bottom row, just right of the Go button
    if (go) go.after(legend); else if (quick) quick.appendChild(legend);
    // a clean mouse drawing in each .mouse (its class l / m / r says which button is lit; js/mouse-settings.js keeps that class up to date)
    const MS = '<svg viewBox="0 0 24 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="1.5" width="18" height="29" rx="9"/><path d="M3 12.5h18M12 1.5v11" stroke-width="1.5"/>' +
      '<path class="hl hl-l" d="M3 12.5v-2A9 9 0 0 1 12 1.5v11z" fill="currentColor" stroke="none"/><path class="hl hl-r" d="M21 12.5v-2A9 9 0 0 0 12 1.5v11z" fill="currentColor" stroke="none"/><rect class="hl hl-m" x="10" y="4.5" width="4" height="6.5" rx="2" fill="currentColor" stroke="none"/></svg>';
    legend.querySelectorAll('.mouse').forEach(m => { m.innerHTML = MS; });
    // each mouse button is a small white tile with its name written beside it, plain and without a box (the name is also its tooltip)
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
    st.textContent = '@media (min-width:861px){' +
      '.quick .legend{position:relative!important;right:auto!important;top:auto!important;left:auto!important;display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:12px;margin-left:8px}' +
            '.quick .legend .mk{position:relative;background:none;padding:0;gap:10px;height:36px;color:#e6e9ef;font-size:12.5px;font-weight:600;letter-spacing:.03em;text-shadow:0 1px 5px rgba(0,0,0,.75);transition:color .2s ease}' +
      '.quick .legend .mk:hover{color:#fff}' +
      '.quick .legend .mk .mouse{position:relative;display:grid;place-items:center;width:36px;height:36px;margin:0;padding:0;box-sizing:border-box;flex:none;color:#fff;background:rgba(10,11,13,.55);border:1px solid rgba(255,255,255,.34);border-radius:8px;transition:border-color .2s ease}' +
      '.quick .legend .mk:hover .mouse{border-color:#fff}' +
      '.quick .legend .mk .mouse svg{display:block;width:21px!important;height:28px!important;color:#fff}' +
      '.quick .legend .mk .mouse b,.quick .legend .mk .mouse i{display:none}' +
      '.quick .legend .mouse .hl{opacity:0;transition:opacity .2s ease}.quick .legend .mouse.l .hl-l,.quick .legend .mouse.r .hl-r,.quick .legend .mouse.m .hl-m{opacity:1}' +
      '.quick .legend .ms-cog{width:36px;height:36px;border-radius:8px;background:rgba(10,11,13,.55)!important;color:#fff!important;border:1px solid rgba(255,255,255,.34)!important}' +
      '.quick .legend .ms-cog:hover,.quick .legend .ms-cog[aria-expanded="true"]{border-color:#fff!important}' +
      '.quick .legend .ms-cog svg{width:21px;height:21px}' +
      '.quick .legend .ms-panel{left:0;top:auto;bottom:calc(100% + 10px)}' +
      '.vstack .ib.shop-gfx{width:36px;height:36px;padding:0;gap:0}.vstack .ib.shop-gfx span{display:none}}';
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
