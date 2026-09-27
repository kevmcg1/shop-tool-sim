// Tooltips that are never cut off. Every [data-tip] used to draw its tooltip as its own ::after, which
// the side panel, the 3D view and the reading panel clip at their edges, and which can run past the
// window. Instead one tooltip box lives on the page itself, above everything: it shows the hovered (or
// keyboard-focused) control's data-tip, above it when there is room and below it when not, slid
// sideways as needed so every edge stays inside the window.
(function(){
  const css = document.createElement('style');
  css.textContent = `
body.js-tips [data-tip]::after{content:none!important}
.tipl{position:fixed;left:0;top:0;z-index:2000;background:#fff;color:#000;border:1px solid #000;font-family:"Inter",system-ui,sans-serif;font-size:12px;font-weight:500;line-height:1.4;padding:6px 9px;border-radius:6px;width:max-content;max-width:min(240px,calc(100vw - 16px));white-space:pre-line;text-align:left;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.45);opacity:0;visibility:hidden;transition:opacity .12s ease,visibility 0s linear .12s}
.tipl.on{opacity:1;visibility:visible;transition:opacity .12s ease,visibility 0s}
@media (prefers-reduced-motion: reduce){ .tipl,.tipl.on{transition:none} }`;
  document.head.appendChild(css);
  document.body.classList.add('js-tips');
  const tip = document.createElement('div');
  tip.className = 'tipl'; tip.setAttribute('role', 'tooltip'); tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);

  let cur = null;
  const watch = new MutationObserver(() => { if (cur) show(cur); });
  function place(el){
    const r = el.getBoundingClientRect(), W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
    const w = tip.offsetWidth, h = tip.offsetHeight, gap = 8, m = 6;
    // above if it fits, else below if that fits, else whichever side has more room
    const above = r.top - gap - h, below = r.bottom + gap;
    let y = above >= m ? above : below + h <= H - m ? below : (r.top > H - r.bottom ? above : below);
    y = Math.max(m, Math.min(H - h - m, y));
    const x = Math.max(m, Math.min(W - w - m, r.left + r.width / 2 - w / 2));
    tip.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }
  function show(el){
    const s = el.getAttribute('data-tip');
    if (!s || !el.isConnected || !el.getClientRects().length){ hide(); return; }
    if (cur !== el){ watch.disconnect(); watch.observe(el, { attributes: true, attributeFilter: ['data-tip'] }); }
    cur = el;
    if (tip.textContent !== s) tip.textContent = s;
    place(el);
    tip.classList.add('on');
  }
  function hide(){ cur = null; watch.disconnect(); tip.classList.remove('on'); }

  // mouse and pen hover; a tap on a touch screen would leave a tooltip stuck over the content
  document.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el) show(el); else if (cur) hide();
  }, true);
  document.addEventListener('pointerout', e => {
    if (cur && (!e.relatedTarget || !cur.contains(e.relatedTarget))) hide();
  }, true);
  // keyboard focus shows it too, the same as :focus-visible did
  document.addEventListener('focusin', e => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el && el.matches(':focus-visible')) show(el);
  }, true);
  document.addEventListener('focusout', () => { if (cur && !cur.matches(':hover')) hide(); }, true);
  ['pointerdown', 'wheel', 'scroll'].forEach(t => document.addEventListener(t, () => { if (cur) hide(); }, { capture: true, passive: true }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur) hide(); }, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
})();
