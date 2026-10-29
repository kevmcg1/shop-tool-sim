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
  function go(){ stack(); trace(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
