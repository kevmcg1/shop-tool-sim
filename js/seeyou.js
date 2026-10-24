// "I see you!": in practice mode, a friendly note when someone reaches for the browser's inspector (F12, Ctrl+Shift+I / J / C / K / E,
// Cmd+Option+I / J / C, Ctrl+U to view the source). It never blocks anything: it just says hello, kindly. Each tool page (and the page
// around them, when it has the focus) loads this; a tool says whether it is practising with window.__inPractice().
(function(){
  if (window.__seeYou) return;
  const css = document.createElement('style');
  css.textContent = `
.cheat-veil{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(4,5,7,.62);font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;opacity:0;transition:opacity .2s ease}
.cheat-veil.on{opacity:1}
.cheat-card{width:min(360px,100%);box-sizing:border-box;padding:26px 24px 22px;text-align:center;background:var(--panel,#131416);color:var(--ink,#ececee);border:1px solid var(--line,#2a2d31);border-radius:16px;box-shadow:0 22px 60px rgba(0,0,0,.6);transform:translateY(10px) scale(.97);transition:transform .25s cubic-bezier(.22,.8,.25,1)}
.cheat-veil.on .cheat-card{transform:none}
.cheat-eye{width:54px;height:54px;margin:0 auto 10px;display:grid;place-items:center;border-radius:50%;background:color-mix(in srgb,var(--accent,#5b93ea) 20%,transparent);color:var(--accent,#5b93ea)}
.cheat-eye svg{width:30px;height:30px}
.cheat-card h3{margin:0 0 8px;font-size:22px;font-weight:700;letter-spacing:-.01em}
.cheat-card p{margin:0 0 18px;font-size:14.5px;line-height:1.55;color:var(--muted,#a9afb8)}
.cheat-card button{padding:9px 22px;border-radius:999px;border:1px solid color-mix(in srgb,var(--accent,#5b93ea) 70%,#fff);background:var(--accent,#5b93ea);color:var(--accent-ink,#0b1320);font:600 14px/1 inherit;font-family:inherit;cursor:pointer}
.cheat-card button:hover,.cheat-card button:focus-visible{filter:brightness(1.1);outline:none}
@media (prefers-reduced-motion: reduce){.cheat-veil,.cheat-card{transition:none}}`;
  document.head.appendChild(css);
  let veil = null, lastAt = 0;
  function hide(){ if (!veil) return; const v = veil; veil = null; v.classList.remove('on'); setTimeout(() => v.remove(), 200); }
  function show(){
    if (veil) return; lastAt = Date.now();
    veil = document.createElement('div'); veil.className = 'cheat-veil'; veil.setAttribute('role', 'alertdialog'); veil.setAttribute('aria-modal', 'true'); veil.setAttribute('aria-labelledby', 'cheatT');
    veil.innerHTML = '<div class="cheat-card"><div class="cheat-eye" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3.2"/></svg></div>' +
      '<h3 id="cheatT">I see you!</h3><p>Please don’t cheat, I know you can get it right!</p><button type="button">Okay!</button></div>';
    veil.addEventListener('click', e => { if (e.target === veil || e.target.closest('button')) hide(); });
    document.body.appendChild(veil); requestAnimationFrame(() => { if (veil) veil.classList.add('on'); });
    const b = veil.querySelector('button'); if (b) b.focus({ preventScroll: true });
  }
  // is this key press a way to open the inspector, the console or the page source?
  function isInspectKey(e){
    const c = e.code || '', k = e.key || '';
    if (k === 'F12' || c === 'F12') return true;
    const ctrl = e.ctrlKey && !e.metaKey, cmd = e.metaKey && !e.ctrlKey;
    if ((ctrl || cmd) && e.shiftKey && !e.altKey && ['KeyI', 'KeyJ', 'KeyC', 'KeyK', 'KeyE'].includes(c)) return true;   // Ctrl+Shift+I / J / C / K / E, Cmd+Shift+C
    if (cmd && e.altKey && ['KeyI', 'KeyJ', 'KeyC', 'KeyU'].includes(c)) return true;                                       // Cmd+Option+I / J / C / U (Mac)
    if (ctrl && !e.shiftKey && !e.altKey && c === 'KeyU') return true;                                                       // Ctrl+U: view the source
    return false;
  }
  window.addEventListener('keydown', e => {
    if (!isInspectKey(e)) return;
    let practising = false; try { practising = !!(window.__inPractice && window.__inPractice()); } catch (err) {}
    if (practising && Date.now() - lastAt > 1200) show();
  }, true);
  document.addEventListener('keydown', e => { if (veil && (e.key === 'Escape' || e.key === 'Enter')){ e.preventDefault(); e.stopPropagation(); hide(); } }, true);
  window.__seeYou = show; window.__seeYouKey = isInspectKey;
})();
