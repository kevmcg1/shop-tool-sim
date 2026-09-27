// The HUD tilt on a tool's page (css/hud.css): on unless the settings cog in the top bar has it off, which is
// remembered as pt-hud = "flat". The top bar tells every tool straight away (window.__hudTilt), and a tool opened
// later reads it as it loads. Cards whose side of the screen can change (the reading bar's, as it lays itself out)
// are marked with the side they are on, so each leans toward the middle.
(function(){
  const root = document.documentElement;
  const read = () => { try { return localStorage.getItem('pt-hud') !== 'flat'; } catch (e) { return true; } };
  window.__hudTilt = on => root.classList.toggle('hud-flat', !on);
  window.__hudTilt(read());
  window.addEventListener('storage', e => { if (e.key === 'pt-hud' || e.key === null) window.__hudTilt(read()); });
  const SEL = '.reading .value, .reading .cell, .reading .meta';
  let timer = 0;
  function sides(){
    timer = 0;
    const mid = innerWidth/2;
    document.querySelectorAll(SEL).forEach(e => {
      if (e.offsetParent === null) return;
      const s = e.offsetLeft + e.offsetWidth/2 + (e.offsetParent.getBoundingClientRect().left || 0) < mid ? 'l' : 'r';
      if (e.dataset.hud !== s) e.dataset.hud = s;
    });
  }
  const queue = () => { if (!timer) timer = setTimeout(sides, 100); };
  window.addEventListener('resize', queue);
  if (window.ResizeObserver) new ResizeObserver(queue).observe(document.body);
  setInterval(sides, 1500);   // cards shown and hidden as the reading changes
  sides();
})();
