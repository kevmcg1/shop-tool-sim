// A phone or tablet gets a one-time heads-up that the simulator is built for a laptop or desktop; "Continue anyway" dismisses it.
// It only asks once per visit (sessionStorage), and it works without storage too.
(function(){
  var ua = navigator.userAgent || '', uad = navigator.userAgentData;
  var mobile = (uad && uad.mobile === true)
    || /Android|iPhone|iPad|iPod|Mobile|Windows Phone|webOS|BlackBerry|Opera Mini/i.test(ua)
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)   // iPadOS says it is a Mac
    || (window.matchMedia && matchMedia('(pointer:coarse)').matches && !matchMedia('(hover:hover)').matches);
  if (!mobile) return;
  try { if (sessionStorage.getItem('shop-mobile-ok') === '1') return; } catch (e) {}

  var css = document.createElement('style');
  css.textContent =
    '.mn{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:20px;background:rgba(5,6,8,.82);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;animation:mn-in .22s ease}' +
    '.mn-card{box-sizing:border-box;width:min(380px,100%);padding:24px 22px 20px;border-radius:14px;background:#15171d;color:#ececee;border:1px solid rgba(255,255,255,.18);box-shadow:0 18px 50px rgba(0,0,0,.6);text-align:center}' +
    '.mn-ic{display:block;margin:0 auto 12px;width:44px;height:44px;color:#5b93ea}' +
    '.mn-card h2{margin:0 0 8px;font-size:18px;line-height:1.3;font-weight:700}' +
    '.mn-card p{margin:0 0 18px;font-size:13.5px;line-height:1.5;color:#8a8f97}' +
    '.mn-card button{width:100%;min-height:44px;padding:0 16px;font:600 14px "Inter",system-ui,sans-serif;color:#0b1320;background:#5b93ea;border:0;border-radius:10px;cursor:pointer}' +
    '.mn-card button:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
    '@keyframes mn-in{from{opacity:0}to{opacity:1}}' +
    '@media (prefers-reduced-motion:reduce){.mn{animation:none}}';
  document.head.appendChild(css);

  var box = document.createElement('div');
  box.className = 'mn';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'mnT');
  box.innerHTML =
    '<div class="mn-card">' +
      '<svg class="mn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="19" height="12" rx="1.6"/><path d="M1.5 20h21M9.5 16v4M14.5 16v4"/></svg>' +
      '<h2 id="mnT">This simulator is best for laptop / desktop only</h2>' +
      '<p>The 3D tools need a big screen and a mouse. You can still look around on your phone, but some things may be hard to use.</p>' +
      '<button type="button" id="mnGo">Continue anyway</button>' +
    '</div>';
  document.body.appendChild(box);

  var go = box.querySelector('#mnGo');
  go.addEventListener('click', function(){
    try { sessionStorage.setItem('shop-mobile-ok', '1'); } catch (e) {}
    box.remove(); css.remove();
  });
  go.focus();
})();
