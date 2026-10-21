// When a card pops up (a toast, tour card, warning, changelog, guide card…), the icons on it move once, the way they do when you
// point at them (css/icons.css, .ic-enter). Nothing here changes what a card does: it only adds a class for a moment.
(function(){
  const CARDS = '.toast,.card,.tut-card,.warn-card,.shop-cl,.gd,.gd-card,.howread,.reset-pop,.mn';
  const seen = new WeakMap();
  const shown = el => { if (el.hidden || el.classList.contains('hidden')) return false; const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.05; };
  function check(el, retry) {
    if (!el.querySelector('svg[data-icon]')) return;
    const now = shown(el), was = seen.get(el) === true;
    if (!now && !retry && !el.hidden && !el.classList.contains('hidden')) setTimeout(() => check(el, true), 140);   /* a card that fades in is still see-through on the first frame */
    seen.set(el, now);
    if (now && !was) { el.classList.remove('ic-enter'); void el.offsetWidth; el.classList.add('ic-enter'); setTimeout(() => el.classList.remove('ic-enter'), 1500); }
  }
  let queued = new Set(), raf = 0;
  function flush() { raf = 0; const q = queued; queued = new Set(); q.forEach(x => check(x)); }
  function note(el) { if (!el || el.nodeType !== 1) return; const c = el.matches(CARDS) ? el : el.closest(CARDS); if (c) queued.add(c); el.querySelectorAll && el.querySelectorAll(CARDS).forEach(x => queued.add(x)); if (queued.size && !raf) raf = requestAnimationFrame(flush); }
  try {
    new MutationObserver(ms => { for (const m of ms) { if (m.type === 'childList') m.addedNodes.forEach(note); else note(m.target); } })
      .observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    document.addEventListener('DOMContentLoaded', () => note(document.body));
  } catch (e) { /* no motion, nothing breaks */ }
})();
