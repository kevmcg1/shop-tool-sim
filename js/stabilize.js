// Frame stabilizer: nothing is shown until the page is loaded and the frames are steady.
// It starts counting frames the moment the page is read (before the opening animation), and a cover of the same colour as that animation
// stays up after it until (1) the first tool is built, (2) the frames have been steady for a moment, and, on a device that is struggling,
// (3) every other tool has finished loading in the background too, so nothing is still loading while the person is using the page.
// A device that keeps stalling sees a short note saying so, and the tools start on a lighter graphics setting that matches what was measured.
// It never holds the page longer than CAP, and a Skip button appears for anyone who would rather not wait.
//
//   window.__perf = { tier, hz, avg, troubled, ready }     tier is 'high' | 'medium' | 'low' (null until measured); the tools read it in autoGfx()
(function(){
  if (window.__perf) return;
  // ---- tuning ----
  var CAP = 60000;            // never hold the page longer than a minute
  var STEADY_MS = 1000;       // frames must stay steady this long before the page is shown (2 s when struggling)
  var TROUBLE_MS = 2500;      // this much time lost in stalled frames (over twice a frame's budget) means the device is struggling
  var NOTE_MIN_MS = 3000;     // once shown, the note stays at least this long so it never flickers
  var SKIP_AFTER = 8000;      // the Skip button appears this long after the note
  var WINDOW = 60;            // frames judged together (about a second)
  var RATES = [60, 75, 90, 120, 144, 165, 240];

  var root = document.documentElement, now = function(){ return performance.now(); };
  var P = window.__perf = { tier: null, hz: 60, budget: 1000/60, avg: 0, troubled: false, ready: false, onReady: function(f){ if (P.ready) f(P); else waiting.push(f); } };
  var waiting = [];
  var reduce = false; try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  var conn = navigator.connection, noWarm = !!(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')));   // (the shell skips its background loading then, so there is nothing to wait for)

  // ---- the cover: same colour as the opening animation, which fades out onto it ----
  var css = document.createElement('style');
  css.textContent =
    '.stab{position:fixed;inset:0;z-index:99998;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#030814 linear-gradient(160deg,#0d2247 0%,#081532 45%,#030814 100%);color:#c3c7ce;font-family:"Inter",system-ui,sans-serif;opacity:1;transition:opacity .45s cubic-bezier(.45,0,.25,1);contain:strict}' +
    '.stab.out{opacity:0;pointer-events:none}' +
    '.stab-in{display:flex;flex-direction:column;align-items:center;gap:14px;width:min(320px,100%);text-align:center;opacity:0;transform:translateY(6px);transition:opacity .4s ease,transform .4s ease;will-change:opacity,transform}' +
    '.stab.show .stab-in{opacity:1;transform:none}' +
    '.stab-i{width:22px;height:22px;fill:#e2e5eb;opacity:.9}' +
    '.stab-t{margin:0;font-size:14px;line-height:1.5;font-weight:500;color:#e2e5eb}' +
    '.stab-s{margin:0;font-size:12px;line-height:1.4;color:#c3c7ce;opacity:.7;font-variant-numeric:tabular-nums}' +
    '.stab-bar{width:100%;height:3px;border-radius:999px;background:rgba(195,199,206,.18);overflow:hidden}' +
    '.stab-bar i{display:block;height:100%;background:#e2e5eb;border-radius:inherit;transform:scaleX(0);transform-origin:left;transition:transform .5s cubic-bezier(.4,0,.2,1);will-change:transform}' +
    '.stab-skip{margin-top:4px;padding:8px 18px;font:inherit;font-size:12.5px;font-weight:500;color:#e2e5eb;background:transparent;border:1px solid rgba(226,229,235,.45);border-radius:8px;cursor:pointer;opacity:0;visibility:hidden;transition:opacity .4s ease,border-color .25s ease,color .25s ease}' +
    '.stab-skip.on{opacity:1;visibility:visible}' +
    '.stab-skip:hover,.stab-skip:focus-visible{border-color:#fff;color:#fff;outline:none}' +
    '@media (prefers-reduced-motion:reduce){.stab,.stab-in,.stab-bar i,.stab-skip{transition:none}}';
  document.head.appendChild(css);
  var cover = document.createElement('div');
  cover.className = 'stab'; cover.setAttribute('role', 'status'); cover.setAttribute('aria-live', 'polite');
  // (the gauge icon from Font Awesome Free 6.5.2, CC BY 4.0, as in js/icons.js)
  cover.innerHTML = '<div class="stab-in"><svg class="stab-i" viewBox="0 0 512 512" aria-hidden="true"><path d="M0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm320 96c0-26.9-16.5-49.9-40-59.3V88c0-13.3-10.7-24-24-24s-24 10.7-24 24V292.7c-23.5 9.5-40 32.5-40 59.3c0 35.3 28.7 64 64 64s64-28.7 64-64zM144 176a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm-16 80a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zm288 32a32 32 0 1 0 0-64 32 32 0 1 0 0 64zM400 144a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>' +
    '<p class="stab-t" id="stabT">Getting everything ready…</p><p class="stab-s" id="stabS"></p>' +
    '<div class="stab-bar" role="progressbar" aria-label="Getting ready" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="stabF"></i></div>' +
    '<button type="button" class="stab-skip" id="stabSkip">Skip</button></div>';
  root.appendChild(cover);
  var elT = cover.querySelector('#stabT'), elS = cover.querySelector('#stabS'), elF = cover.querySelector('#stabF'), bar = cover.querySelector('.stab-bar'), skip = cover.querySelector('#stabSkip');

  // ---- the frame counter ----
  var hist = [], last = 0, startAt = now(), stallMs = 0, steadySince = 0, noteAt = 0, finished = false, introOver = false;
  var BIG = 250;   // a longer gap than this is a tab that was hidden, not a stall
  document.addEventListener('visibilitychange', function(){ last = 0; steadySince = 0; });
  function snap(ms){   // the screen's refresh rate, from the fastest frames seen
    var hz = 1000/Math.max(2, ms), best = 60, bd = 1e9;
    RATES.forEach(function(r){ var d = Math.abs(Math.log(r/hz)); if (d < bd){ bd = d; best = r; } });
    return best;
  }
  function stats(){
    var n = hist.length; if (!n) return null;
    var a = hist.slice().sort(function(x, y){ return x - y; }), sum = 0; for (var i = 0; i < n; i++) sum += a[i];
    return { n: n, avg: sum/n, p95: a[Math.min(n - 1, Math.floor(n*0.95))], worst: a[n - 1], fast: a[Math.floor(n*0.25)] };
  }
  function frame(t){
    if (finished) return;
    requestAnimationFrame(frame);
    if (document.hidden){ last = 0; return; }
    if (last){
      var d = t - last;
      if (d < BIG){
        hist.push(d); if (hist.length > WINDOW) hist.shift();
        if (d > 2*P.budget && t - startAt > 600) stallMs += d;   // (the first fraction of a second is the browser starting up)
      }
    }
    last = t;
    var s = stats(); if (!s || s.n < 20) return;
    P.hz = snap(s.fast); P.budget = 1000/P.hz; P.avg = s.avg;
    var steady = s.n >= WINDOW && s.avg <= P.budget*1.2 && s.p95 <= P.budget*1.6 && s.worst <= Math.max(50, P.budget*3);
    if (steady){ if (!steadySince) steadySince = t; } else steadySince = 0;
    if (!P.troubled && stallMs > TROUBLE_MS){ P.troubled = true; noteAt = now(); showNote(); }
  }
  requestAnimationFrame(frame);

  // ---- what the page is waiting for ----
  function shell(){ return window.__shell; }
  function toolReady(){
    try {
      var sh = shell(); if (!sh) return 0;
      var f = sh.frames[sh.current()]; if (!f) return 0;
      var w = f.contentWindow;
      return (w && w.document && w.document.readyState === 'complete' && !w.document.getElementById('loading') && w.__phase === 'ready') ? 1 : 0;
    } catch (e) { return 0; }
  }
  function warmFraction(){
    try {
      var sh = shell(); if (!sh) return 0;
      var n = sh.APPS.length, ok = 0;
      sh.APPS.forEach(function(a){ var f = sh.frames[a.id]; if (f && !f.dataset.warm) ok++; });
      return ok/n;
    } catch (e) { return 0; }
  }
  function showNote(){
    cover.classList.add('show');
    elT.textContent = 'I notice your device is having a bit of trouble with loading, making things smooth for you!';
    elS.textContent = 'This only takes a moment and means everything runs smoothly after.';
    setTimeout(function(){ skip.classList.add('on'); }, SKIP_AFTER);
  }
  // the cover is first seen once the opening animation has faded onto it (its frame is removed from the page then); until then it is hidden under that
  function watchIntro(){
    var iv = setInterval(function(){
      if (!document.getElementById('intro') && document.body){ introOver = true; clearInterval(iv); if (!finished) cover.classList.add('show'); }
    }, 100);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchIntro); else watchIntro();

  // ---- the tier the measurements point to ----
  function pickTier(){
    var t = 'high';
    if (cores <= 4 || mem <= 4) t = 'medium';
    if (cores <= 2 || mem <= 2) t = 'low';
    if (P.troubled){ t = P.avg > P.budget*2 ? 'low' : (t === 'low' ? 'low' : 'medium'); }
    return t;
  }
  var RANK = { low: 0, medium: 1, high: 2 };
  // lowers (never raises) the graphics setting of tools that are already built
  function pushTier(){
    try {
      var sh = shell(); if (!sh || !P.tier) return;
      Object.keys(sh.frames).forEach(function(id){
        try {
          var s = sh.frames[id].contentWindow.document.getElementById('gfxSel');
          if (s && RANK[P.tier] < RANK[s.value]){ s.value = P.tier; s.dispatchEvent(new Event('change')); }
        } catch (e) {}
      });
    } catch (e) {}
  }

  // ---- when to let go ----
  function finish(){
    if (finished) return; finished = true;
    var tf = pickTier(); if (!P.tier || RANK[tf] < RANK[P.tier]) P.tier = tf;
    P.ready = true; pushTier();
    elF.style.transform = 'scaleX(1)'; bar.setAttribute('aria-valuenow', 100);
    cover.classList.add('out');
    setTimeout(function(){ if (cover.parentNode) cover.remove(); if (css.parentNode) css.remove(); }, 600);
    waiting.splice(0).forEach(function(f){ try { f(P); } catch (e) {} });
    try { window.dispatchEvent(new Event('perfready')); } catch (e) {}
  }
  skip.addEventListener('click', finish);
  // tools that build later (the ones loading in the background) ask for the tier as they start; give it to them as soon as there is a guess
  P.tier = (cores <= 2 || mem <= 2) ? 'low' : null;
  var shown = 0;
  var poll = setInterval(function(){
    if (finished){ clearInterval(poll); return; }
    var el = now() - startAt, ready = toolReady(), warm = noWarm ? 1 : warmFraction();
    // progress: the first tool built, then the frames steady, then (when struggling) the other tools loaded
    var steadyFor = steadySince ? performance.now() - steadySince : 0, need = P.troubled ? 2*STEADY_MS : STEADY_MS;
    var p = 0.05 + 0.45*ready + 0.25*Math.min(1, steadyFor/need) + (P.troubled ? 0.25*warm : 0.25*ready);
    shown = Math.max(shown, Math.min(0.97, p));   // (only ever forward)
    elF.style.transform = 'scaleX(' + shown.toFixed(3) + ')'; bar.setAttribute('aria-valuenow', Math.round(shown*100));
    if (P.troubled){ var tt = pickTier(); if (!P.tier || RANK[tt] < RANK[P.tier]) P.tier = tt; pushTier(); }   // (the setting only ever goes lighter)
    var noteHeld = P.troubled && now() - noteAt < NOTE_MIN_MS;
    var steadyOk = steadyFor >= need && ready && introOver;
    if ((steadyOk && (!P.troubled || warm >= 1) && !noteHeld) || el > CAP) finish();
  }, 100);
})();
