// sliders are drawn in CSS: the track fills up to the thumb, and --p (the filled share) is kept current
// here, whether the slider is dragged, or the page sets its value, min or max itself
(function(){
  const dv = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  document.querySelectorAll('input[type=range]').forEach(r => {
    const fill = () => {
      const lo = +r.min || 0, hi = r.max === '' ? 100 : +r.max, v = +dv.get.call(r);
      r.style.setProperty('--p', (hi > lo ? Math.max(0, Math.min(1, (v - lo)/(hi - lo))) : 0)*100 + '%');
    };
    Object.defineProperty(r, 'value', { configurable: true, get(){ return dv.get.call(this); }, set(v){ dv.set.call(this, v); fill(); } });
    r.addEventListener('input', fill);
    r.addEventListener('change', fill);
    new MutationObserver(fill).observe(r, { attributes: true, attributeFilter: ['min', 'max', 'value'] });
    fill();
  });
})();
