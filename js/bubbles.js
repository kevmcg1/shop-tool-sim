// The page-load "bubbles" are gone; this file only keeps the small hooks the other scripts call, so nothing waits for anything:
// window.__afterBubbles(cb) runs the callback at once (the 3D tool builds in as soon as it is ready, js/dissolve.js), window.__bubbles
// does nothing, and the phase tracker (window.__phase, <html data-phase>) says whether a tool is being changed ('switch') or not ('ready').
(function(){
  if (window.__bubbles) return;
  const root = document.documentElement;
  const setPhase = p => {
    if (window.__phase === p) return;
    window.__phase = p; root.dataset.phase = p;
    (window.__phaseLog = window.__phaseLog || []).push({ t: Math.round(performance.now()), phase: p }); if (window.__phaseLog.length > 40) window.__phaseLog.shift();
  };
  window.__setPhase = setPhase;
  window.__bubbles = () => {};
  window.__afterBubbles = cb => { try { cb(); } catch (e) {} };
  // a tool's picture has arrived: the page is ready again (and so is the page round it, if this was a tool being changed)
  window.__phaseDone = () => { setPhase('ready'); try { if (window.parent !== window && window.parent.__phase === 'switch' && window.parent.__setPhase) window.parent.__setPhase('ready'); } catch (e) {} };
  setPhase('ready');
})();
