// Shows the version (js/version.js) as a small chip in every tool's side panel and in the top bar of the page around
// them, and opens the changelog when it is clicked. Same file, same text, everywhere. It brings its own styles, so it
// looks the same whichever tool it is in.
(function(){
  const V = window.__SHOP; if (!V) return;
  const css = document.createElement('style');
  css.textContent = `
.shop-vrow{display:flex;justify-content:center;margin:8px 0 2px}
.shop-vchip{display:inline-flex;align-items:center;gap:6px;padding:3px 11px;font:600 11px/1.3 "Inter",system-ui,sans-serif;letter-spacing:.03em;color:var(--muted,#8a8f97);background:transparent;border:1px solid var(--line,#2a2d31);border-radius:999px;cursor:pointer}
.shop-vchip:hover,.shop-vchip:focus-visible{color:var(--ink,#ececee);border-color:var(--muted,#8a8f97);background:transparent}
.reset-wrap .shop-vchip{margin:0;height:32px;padding:0 13px;font-size:12px}
.bmc{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;border-radius:999px;border:1px solid rgba(255,213,88,.45);color:#f6d56b;background:transparent;font:600 12px/1 "Inter",system-ui,sans-serif;text-decoration:none;white-space:nowrap;cursor:pointer;transition:border-color .22s ease,background-color .22s ease,color .22s ease}
.bmc:hover,.bmc:focus-visible{border-color:#ffd558;background:rgba(255,213,88,.1);color:#ffe28f;outline:none}
.bmc svg{width:17px;height:17px;overflow:visible;flex:none}
.bmc .cup{transform-origin:12px 20px}
.bmc .steam path{stroke-dasharray:7;stroke-dashoffset:7;opacity:0}
.bmc:hover .steam path,.bmc:focus-visible .steam path{animation:bmc-steam 1.4s ease-in-out infinite}
.bmc:hover .steam path+path,.bmc:focus-visible .steam path+path{animation-delay:.35s}
.bmc:hover .cup,.bmc:focus-visible .cup{animation:bmc-tilt .55s ease}
@keyframes bmc-steam{0%{stroke-dashoffset:7;opacity:0;transform:translateY(3px)}35%{opacity:.95}100%{stroke-dashoffset:-7;opacity:0;transform:translateY(-4px)}}
@keyframes bmc-tilt{0%,100%{transform:rotate(0)}35%{transform:rotate(-13deg)}70%{transform:rotate(6deg)}}
@media (prefers-reduced-motion: reduce){.bmc,.bmc .cup,.bmc .steam path{animation:none!important;transition:none}}
.shop-cl{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.6);display:flex;justify-content:center;overflow-y:auto;overscroll-behavior:contain;padding:16px;font-family:"Inter",system-ui,sans-serif}
.shop-cl{opacity:1;visibility:visible;transition:opacity .28s ease,visibility 0s linear 0s}
.shop-cl[hidden]{display:flex;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .22s ease,visibility 0s linear .22s}
.shop-cl-card{transform:none;transition:transform .34s cubic-bezier(.22,.8,.25,1)}
.shop-cl[hidden] .shop-cl-card{transform:translateY(14px) scale(.97)}
.shop-vchip{transition:color .22s ease,border-color .22s ease}
@media (prefers-reduced-motion: reduce){.shop-cl,.shop-cl[hidden],.shop-cl-card,.shop-vchip{transition:none}}
.shop-cl-card{position:relative;background:var(--panel,#131416);color:var(--ink,#ececee);border:1px solid var(--line,#222428);border-radius:12px;padding:20px 22px;max-width:480px;width:100%;margin:auto;flex:0 0 auto;font-size:13.5px;line-height:1.5}
.shop-cl-card h3{margin:0;font-size:18px;font-weight:600}
.shop-cl-sub{margin:2px 0 14px;color:var(--muted,#8a8f97);font-size:12.5px}
.shop-cl-card h4{margin:16px 0 2px;font-size:14px;font-weight:600;display:flex;align-items:baseline;gap:8px}
.shop-cl-card h4 small{font-size:11.5px;font-weight:500;color:var(--muted,#8a8f97)}
.shop-cl-card h4 em{font-style:normal;font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border-radius:999px;background:color-mix(in srgb,var(--accent,#5b93ea) 22%,transparent);color:var(--accent,#5b93ea)}
.shop-cl-card .t{margin:0 0 4px;color:var(--muted,#8a8f97);font-size:12.5px}
.shop-cl-card ul{margin:0;padding-left:18px}
.shop-cl-card li{margin:0 0 4px;color:#c9ccd1}
.shop-coffee{max-width:420px;text-align:center;padding:30px 26px 26px}
.shop-coffee-t{margin:6px 0 22px;font-size:15px;line-height:1.55;color:#d6d9de}
.bmc.bmc-big{height:46px;padding:0 24px;font-size:15px;gap:10px}
.bmc.bmc-big svg{width:22px;height:22px}
.shop-cl-x{position:absolute;top:12px;right:12px;width:28px;height:28px;padding:0;display:grid;place-items:center;border:0;border-radius:50%;background:var(--raise,#1b1d20);color:var(--ink,#ececee);font:inherit;font-size:12px;cursor:pointer}
.shop-cl-x:hover{background:var(--raise-2,#24272b)}
`;
  document.head.appendChild(css);

  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  let modal = null;
  function build(){
    modal = document.createElement('div');
    modal.className = 'shop-cl'; modal.hidden = true;
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Changelog');
    modal.innerHTML = '<div class="shop-cl-card"><button type="button" class="shop-cl-x" aria-label="Close">✕</button>' +
      '<h3>What’s new</h3><p class="shop-cl-sub">Shop Tool Sim · version ' + esc(V.version) + '</p>' +
      V.changelog.map((e, i) => '<h4>v' + esc(e.v) + (e.date ? ' <small>' + esc(e.date) + '</small>' : '') + (i === 0 ? ' <em>current</em>' : '') + '</h4>' +
        '<p class="t">' + esc(e.title) + '</p><ul>' + e.items.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>').join('') + '</div>';
    modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('.shop-cl-x')) close(); });
    document.body.appendChild(modal);
  }
  function open(){ if (!modal) build(); modal.hidden = false; modal.querySelector('.shop-cl-x').focus({ preventScroll: true }); }
  function close(){ if (modal) modal.hidden = true; }
  document.addEventListener('keydown', e => { if (modal && !modal.hidden && e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(); } }, true);

  // Buy me a coffee: a short note first, then the same link as ever
  const COFFEE_URL = 'https://buymeacoffee.com/kevmcg1';
  const COFFEE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="steam" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M8.5 7.5c-1.1-1.2 1.1-2.3 0-3.7"/><path d="M12.5 7.5c-1.1-1.2 1.1-2.3 0-3.7"/></g><g class="cup"><path d="M5 10h11.5v4.6A5.4 5.4 0 0 1 11.1 20H10.4A5.4 5.4 0 0 1 5 14.6z" fill="currentColor" opacity=".92"/><path d="M16.5 11.2h1.3a2.6 2.6 0 0 1 0 5.2h-1.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></g></svg>';
  let cModal = null;
  function buildCoffee(){
    cModal = document.createElement('div');
    cModal.className = 'shop-cl'; cModal.hidden = true;
    cModal.setAttribute('role', 'dialog'); cModal.setAttribute('aria-modal', 'true'); cModal.setAttribute('aria-label', 'Buy me a coffee');
    cModal.innerHTML = '<div class="shop-cl-card shop-coffee"><button type="button" class="shop-cl-x" aria-label="Close">✕</button>' +
      '<p class="shop-coffee-t">I have no plans to make this a paid webpage of any kind. This was just my way to give back to those who may need it. If you’d like to give back or make a donation, you’re more than welcome to below.</p>' +
      '<a class="bmc bmc-big" href="' + COFFEE_URL + '" target="_blank" rel="noopener noreferrer">' + COFFEE_SVG + '<span>Buy me a coffee</span></a></div>';
    cModal.addEventListener('click', e => { if (e.target === cModal || e.target.closest('.shop-cl-x')) closeCoffee(); });
    cModal.querySelector('.bmc').addEventListener('click', () => setTimeout(closeCoffee, 150));
    document.body.appendChild(cModal);
  }
  function openCoffee(){ if (!cModal) buildCoffee(); cModal.hidden = false; cModal.querySelector('.bmc').focus({ preventScroll: true }); }
  function closeCoffee(){ if (cModal) cModal.hidden = true; }
  document.addEventListener('keydown', e => { if (cModal && !cModal.hidden && e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closeCoffee(); } }, true);

  function mount(){
    if (document.querySelector('.shop-vchip')) return;
    const chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'shop-vchip'; chip.textContent = 'v' + V.version + ' · What’s new';
    chip.title = 'Version ' + V.version + ' and the changelog';
    chip.addEventListener('click', open);
    const logo = document.querySelector('header.logo'), reset = document.querySelector('.reset-wrap');
    if (logo){ const row = document.createElement('div'); row.className = 'shop-vrow'; row.appendChild(chip); const mark = logo.querySelector('.stable-row') || logo.querySelector('.logo-mark'); if (mark) mark.insertAdjacentElement('afterend', row); else logo.appendChild(row); }   // (right under the tool's name, above the range line and the How do I use it? button)
    else if (reset){
      // Buy me a coffee, just before Reset all
      const coffee = document.createElement('button');
      coffee.type = 'button'; coffee.className = 'bmc';
      coffee.setAttribute('aria-label', 'Buy me a coffee (opens a short note first)');
      coffee.addEventListener('click', openCoffee);
      coffee.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="steam" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M8.5 7.5c-1.1-1.2 1.1-2.3 0-3.7"/><path d="M12.5 7.5c-1.1-1.2 1.1-2.3 0-3.7"/></g><g class="cup"><path d="M5 10h11.5v4.6A5.4 5.4 0 0 1 11.1 20H10.4A5.4 5.4 0 0 1 5 14.6z" fill="currentColor" opacity=".92"/><path d="M16.5 11.2h1.3a2.6 2.6 0 0 1 0 5.2h-1.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></g></svg><span>Buy me a coffee</span>';
      const before = document.getElementById('resetAll') || reset.firstChild;
      reset.insertBefore(coffee, before);   // (the changelog button no longer sits in the top bar: it is under the logo in each tool's side panel)
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
