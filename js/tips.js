// Tooltips that are never cut off, and laid out the same way every time. Every [data-tip] used to draw its tooltip as its own ::after,
// which the side panel, the 3D view and the reading panel clip at their edges, and which can run past the window. Instead one tooltip
// lives on the page itself, above everything: it shows the hovered (or keyboard-focused) control's data-tip, above it when there is room
// and below it when not, slid sideways as needed so every edge stays inside the window, with an arrow that still points at the control.
//
// A data-tip is "Title" or "Title<newline>Description" (more lines make more paragraphs). The card is built from it:
//   header   the title, and for a button that switches something on and off (aria-pressed) a small On / Off tag that follows its state
//   body     the description, under a hairline; the names of keys (Shift, Esc, Ctrl...) are drawn as little keycaps
// It waits a moment before showing the first one, then follows the pointer from control to control with no wait.
(function(){
  const css = document.createElement('style');
  css.textContent = `
body.js-tips [data-tip]::after{content:none!important}
.tipl{position:fixed;left:0;top:0;z-index:2000;width:max-content;max-width:min(264px,calc(100vw - 16px));pointer-events:none;visibility:hidden;transition:visibility 0s linear .14s}
.tipl.on{visibility:visible;transition:visibility 0s}
.tipl-in{position:relative;padding:9px 11px 10px;border-radius:10px;background:#15171d;color:#e6e9ef;border:1px solid rgba(255,255,255,.15);
  box-shadow:0 12px 30px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06);
  font-family:"Inter",system-ui,sans-serif;font-size:12px;font-weight:500;line-height:1.45;text-align:left;
  opacity:0;transform:translateY(var(--dy,4px)) scale(.97);transform-origin:var(--ax,50%) var(--oy,100%);
  transition:opacity .14s ease,transform .16s cubic-bezier(.2,.8,.2,1)}
.tipl.on .tipl-in{opacity:1;transform:none}
.tipl-h{display:flex;align-items:center;gap:10px}
.tipl-t{font-size:12.5px;font-weight:650;letter-spacing:.01em;color:#fff}
.tipl-s{margin-left:auto;flex:none;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.1);color:#a9b1bf;font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.tipl-s.is-on{background:rgba(88,151,255,.22);color:#9cc0ff}
.tipl-b{margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.1);color:#b4bbc8;font-weight:450}
.tipl-b p{margin:0}
.tipl-b p+p{margin-top:5px}
.tipl kbd{display:inline-block;padding:2px 5px 1px;margin:0 1px;border-radius:4px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-bottom-width:2px;
  color:#fff;font:600 10.5px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.tipl-a{position:absolute;left:var(--ax,50%);width:9px;height:9px;margin-left:-4.5px;background:#15171d;border:1px solid rgba(255,255,255,.15);transform:rotate(45deg)}
.tipl[data-side=top] .tipl-a{bottom:-5px;border-top:0;border-left:0}
.tipl[data-side=bottom] .tipl-a{top:-5px;border-bottom:0;border-right:0}
@media (prefers-reduced-motion: reduce){ .tipl,.tipl.on,.tipl-in,.tipl.on .tipl-in{transition:none;transform:none} }`;
  document.head.appendChild(css);
  document.body.classList.add('js-tips');
  const tip = document.createElement('div');
  tip.className = 'tipl'; tip.setAttribute('role', 'tooltip'); tip.setAttribute('aria-hidden', 'true');
  tip.innerHTML = '<div class="tipl-in"><div class="tipl-h"><span class="tipl-t"></span><span class="tipl-s" hidden></span></div><div class="tipl-b" hidden></div><span class="tipl-a"></span></div>';
  document.body.appendChild(tip);
  const inner = tip.firstChild, tTitle = tip.querySelector('.tipl-t'), tState = tip.querySelector('.tipl-s'), tBody = tip.querySelector('.tipl-b');

  // the description, with the names of keys drawn as keycaps (built from nodes, never from markup in the attribute)
  const KEYS = /\b(Shift|Ctrl|Control|Alt|Option|Cmd|Esc|Enter|Return|Tab|Space|Delete|Backspace)\b/g;
  function paragraph(text){
    const p = document.createElement('p'); let last = 0, m;
    KEYS.lastIndex = 0;
    while ((m = KEYS.exec(text))){
      if (m.index > last) p.appendChild(document.createTextNode(text.slice(last, m.index)));
      const k = document.createElement('kbd'); k.textContent = m[0]; p.appendChild(k); last = m.index + m[0].length;
    }
    if (last < text.length) p.appendChild(document.createTextNode(text.slice(last)));
    return p;
  }

  let cur = null, shown = '', timer = 0, lastHide = 0;
  const watch = new MutationObserver(() => { if (cur && tip.classList.contains('on')) fill(cur); });
  function fill(el){
    const raw = el.getAttribute('data-tip') || '', pressed = el.getAttribute('aria-pressed');
    const key = raw + '|' + pressed;
    if (key !== shown){
      shown = key;
      const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
      tTitle.textContent = lines[0] || '';
      tBody.textContent = '';
      lines.slice(1).forEach(l => tBody.appendChild(paragraph(l)));
      tBody.hidden = lines.length < 2;
      const isToggle = pressed === 'true' || pressed === 'false';
      tState.hidden = !isToggle;
      if (isToggle){ tState.textContent = pressed === 'true' ? 'On' : 'Off'; tState.classList.toggle('is-on', pressed === 'true'); }
    }
    place(el);
  }
  function place(el){
    const r = el.getBoundingClientRect(), W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
    const w = tip.offsetWidth, h = tip.offsetHeight, gap = 10, m = 6;
    // above if it fits, else below if that fits, else whichever side has more room
    const above = r.top - gap - h, below = r.bottom + gap;
    const top = above >= m ? true : below + h <= H - m ? false : r.top > H - r.bottom;
    let y = top ? above : below;
    y = Math.max(m, Math.min(H - h - m, y));
    const cx = r.left + r.width / 2, x = Math.max(m, Math.min(W - w - m, cx - w / 2));
    // (the window can narrow between placing the card and the next paint: the min() keeps its right edge inside whatever the width is by then)
    tip.style.transform = `translate(min(${Math.round(x)}px,calc(100vw - 100% - ${m}px)),${Math.round(y)}px)`;
    tip.dataset.side = top ? 'top' : 'bottom';
    const ax = Math.max(16, Math.min(w - 16, cx - x));          // the arrow keeps pointing at the control when the card had to slide
    tip.style.setProperty('--ax', Math.round(ax) + 'px');
    tip.style.setProperty('--dy', top ? '4px' : '-4px');
    tip.style.setProperty('--oy', top ? '100%' : '0%');
  }
  function reveal(el){
    const s = el.getAttribute('data-tip');
    if (!s || !el.isConnected || !el.getClientRects().length){ hide(); return; }
    if (cur !== el){ watch.disconnect(); watch.observe(el, { attributes: true, attributeFilter: ['data-tip', 'aria-pressed'] }); }
    cur = el; fill(el);
    tip.classList.add('on');
  }
  // the first tooltip waits a moment, so crossing the screen doesn't flash them; moving on to the next control shows it at once
  function show(el, now){
    clearTimeout(timer);
    if (now || tip.classList.contains('on') || performance.now() - lastHide < 400) reveal(el);
    else { cur = el; timer = setTimeout(() => { if (cur === el) reveal(el); }, 320); }
  }
  function hide(){
    clearTimeout(timer);
    if (tip.classList.contains('on')) lastHide = performance.now();
    cur = null; shown = ''; watch.disconnect(); tip.classList.remove('on');
  }

  // mouse and pen hover; a tap on a touch screen would leave a tooltip stuck over the content
  document.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el){ if (el !== cur) show(el); } else if (cur) hide();
  }, true);
  document.addEventListener('pointerout', e => {
    if (cur && (!e.relatedTarget || !cur.contains(e.relatedTarget))) hide();
  }, true);
  // keyboard focus shows it too, the same as :focus-visible did (with no wait)
  document.addEventListener('focusin', e => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el && el.matches(':focus-visible')) show(el, true);
  }, true);
  document.addEventListener('focusout', () => { if (cur && !cur.matches(':hover')) hide(); }, true);
  ['pointerdown', 'wheel', 'scroll'].forEach(t => document.addEventListener(t, () => { if (cur) hide(); }, { capture: true, passive: true }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur) hide(); }, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
})();
