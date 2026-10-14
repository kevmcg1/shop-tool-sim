// sliders are drawn in CSS: the track fills up to the thumb, and --p (the filled share) is kept current
// here, whether the slider is dragged, or the page sets its value, min or max itself.
// Every slider also gets a "Reset to default" button beside it (and a double-click on the slider does the same): its default is the
// value it had once the tool had finished loading, and the button is dimmed while the slider is already there.
(function(){
  const css = document.createElement('style');
  css.textContent = `
.rng{display:flex;align-items:center;gap:8px;margin:0 0 10px}
.rng>input[type=range]{flex:1 1 auto;min-width:0;margin:0!important}
.rst{flex:none;width:28px;height:28px;padding:0;display:inline-grid;place-items:center;border-radius:8px;font-size:12px;line-height:1;color:var(--muted,#8a8f97);cursor:pointer;transition:opacity .2s ease,color .2s ease,border-color .2s ease}
.rst:hover:not(:disabled),.rst:focus-visible{color:#fff}
.rst:disabled{opacity:.3;cursor:default}
@media (prefers-reduced-motion: reduce){.rst{transition:none}}`;
  document.head.appendChild(css);
  const dv = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const sliders = [];
  document.querySelectorAll('input[type=range]').forEach(r => {
    let def = null;
    const wrap = document.createElement('span'); wrap.className = 'rng';
    r.parentNode.insertBefore(wrap, r); wrap.appendChild(r);
    const rst = document.createElement('button');
    rst.type = 'button'; rst.className = 'rst'; rst.setAttribute('aria-label', 'Reset to default');
    rst.setAttribute('data-tip', 'Reset to default\nPuts this back to where it started.');
    rst.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
    wrap.appendChild(rst);
    const fill = () => {
      const lo = +r.min || 0, hi = r.max === '' ? 100 : +r.max, v = +dv.get.call(r);
      r.style.setProperty('--p', (hi > lo ? Math.max(0, Math.min(1, (v - lo)/(hi - lo))) : 0)*100 + '%');
      rst.disabled = r.disabled || def === null || Math.abs(v - def) < 1e-9;
    };
    Object.defineProperty(r, 'value', { configurable: true, get(){ return dv.get.call(this); }, set(v){ dv.set.call(this, v); fill(); } });
    const reset = () => {
      if (def === null || r.disabled) return;
      r.value = def;
      r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true }));
      fill();
    };
    rst.addEventListener('click', reset);
    r.addEventListener('dblclick', reset);
    r.addEventListener('input', fill);
    r.addEventListener('change', fill);
    new MutationObserver(fill).observe(r, { attributes: true, attributeFilter: ['min', 'max', 'value', 'disabled'] });
    sliders.push({ r, take(){ def = +dv.get.call(r); fill(); } });
    fill();
  });
  // the default is where each slider stands once the tool has loaded (the loading screen is gone), a moment after
  const t0 = Date.now(), wait = setInterval(() => {
    if (document.getElementById('loading') && Date.now() - t0 < 20000) return;
    clearInterval(wait); setTimeout(() => sliders.forEach(s => s.take()), 700);
  }, 250);
})();
