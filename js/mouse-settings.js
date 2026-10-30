// A settings cog to the left of the mouse-controls legend (Rotate / Pan / Zoom) in the four tools built on
// OrbitControls (the calipers, the micrometer, the depth micrometer and the height gage). It opens a small panel where
// each of rotate, pan and zoom is given a mouse button; the legend, the hints and the camera follow at once.
//
//   window.__mouseSettings.attach(controls)   (called by js/pivot.js for each tool)
//   window.__mouseMap                         { rotate, pan, zoom }: the button number (0 left, 1 middle, 2 right) or -1
//
// The wheel always zooms. The Zoom row only says which button drags to zoom as well (None leaves it to the wheel).
// The choice is kept in localStorage (when the browser allows it) and shared by every tool, also while they are open.
(function(){
  const KEY = 'shop-tool-sim:mouse';
  const BTN = { L: 0, M: 1, R: 2 }, NAME = { L: 'Left', M: 'Middle', R: 'Right' };
  const DEFAULT = { rotate: 'L', pan: 'R', zoom: 'M' };
  const ACTIONS = [['rotate', 'Rotate', 'turns the view'], ['pan', 'Pan', 'slides the view'], ['zoom', 'Zoom', 'also drags in and out']];
  let map = Object.assign({}, DEFAULT);
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    const ok = s && 'LMR'.includes(s.rotate) && 'LMR'.includes(s.pan) && 'LMRN'.includes(s.zoom) && s.rotate !== s.pan && s.zoom !== s.rotate && s.zoom !== s.pan;
    if (ok) map = { rotate: s.rotate, pan: s.pan, zoom: s.zoom };
  } catch (e) {}
  const num = k => (k === 'N' ? -1 : BTN[k]);
  const publish = () => { window.__mouseMap = { rotate: num(map.rotate), pan: num(map.pan), zoom: num(map.zoom) }; };
  publish();

  const controlsList = [];
  // OrbitControls: ROTATE 0, DOLLY 1, PAN 2; a button given nothing does nothing
  function applyTo(c){
    const m = { LEFT: -1, MIDDLE: -1, RIGHT: -1 };
    const slot = k => ({ L: 'LEFT', M: 'MIDDLE', R: 'RIGHT' }[k]);
    m[slot(map.rotate)] = 0; m[slot(map.pan)] = 2; if (map.zoom !== 'N') m[slot(map.zoom)] = 1;
    c.mouseButtons = m;
  }

  // give an action a button; whoever had that button gets the one it left (or the free one)
  function assign(action, to){
    const old = map[action];
    if (old === to) return;
    const other = Object.keys(map).find(k => k !== action && map[k] === to);
    map[action] = to;
    if (other){
      const free = ['L', 'M', 'R'].find(b => b !== to && !Object.keys(map).some(k => k !== other && map[k] === b));
      map[other] = old !== 'N' ? old : (other === 'zoom' ? 'N' : free);
    }
  }
  const phrase = () => {
    const lo = s => s.toLowerCase();
    return `${NAME[map.rotate]}-drag to rotate · ${lo(NAME[map.pan])}-drag to pan · scroll to zoom` + (map.zoom === 'N' || map.zoom === 'M' ? '' : ` or ${lo(NAME[map.zoom])}-drag`);
  };

  const CSS = `
.ms-cog{display:inline-grid;place-items:center;width:30px;height:30px;padding:0;margin:0;border-radius:8px;background:#000;color:#fff;border:1px solid rgba(255,255,255,.28);cursor:pointer;flex:none;align-self:center}
.ms-cog:hover,.ms-cog:focus-visible,.ms-cog[aria-expanded="true"]{background:#fff;color:#000;border-color:#fff}
.ms-cog svg{width:17px;height:17px;display:block;transition:transform .45s cubic-bezier(.22,.8,.25,1)}
.ms-cog:hover svg,.ms-cog[aria-expanded="true"] svg{transform:rotate(60deg)}
.ms-panel{position:absolute;left:calc(100% + 10px);top:0;width:max-content;padding:12px;background:#16181b;color:#ececee;border:1px solid #3a3e44;border-radius:12px;box-shadow:0 14px 34px rgba(0,0,0,.55);z-index:50;font:500 13px/1.4 "Inter",system-ui,sans-serif;opacity:0;visibility:hidden;transform:translateY(-6px);transition:opacity .18s ease,transform .22s cubic-bezier(.22,.8,.25,1),visibility 0s linear .22s}
.ms-panel.open{opacity:1;visibility:visible;transform:none;transition:opacity .18s ease,transform .22s cubic-bezier(.22,.8,.25,1),visibility 0s}
.legend.ms-open{z-index:30!important}
.ms-row{display:flex;align-items:center;gap:10px;margin-top:8px}
.ms-row:first-child{margin-top:0}
.ms-row b{display:grid;place-items:center;width:26px;flex:none;color:#8a8f97}
.ms-row b svg{width:20px;height:20px}
.ms-seg{display:flex;gap:4px}
.ms-seg button{display:grid;place-items:center;width:34px;height:34px;padding:0;border-radius:8px;background:transparent;color:#ececee;border:1px solid #3d4147;cursor:pointer;transition:border-color .2s ease,background-color .2s ease,color .2s ease}
.ms-seg button svg{width:20px;height:20px;display:block}
.ms-seg button:hover{border-color:#8a8f97}
.ms-seg button[aria-pressed="true"]{background:#fff;color:#000;border-color:#fff}
.ms-foot{display:flex;justify-content:flex-end;margin-top:10px}
.ms-foot button{display:grid;place-items:center;width:30px;height:30px;padding:0;border-radius:8px;background:transparent;color:#ececee;border:1px solid #3d4147;cursor:pointer;transition:border-color .2s ease}
.ms-foot button svg{width:16px;height:16px;display:block}
.ms-foot button:hover{border-color:#fff}
@media (prefers-reduced-motion: reduce){.ms-cog svg,.ms-panel,.ms-panel.open{transition:none}}`;

  let ui = null;
  function build(){
    const legend = document.querySelector('.legend');
    if (!legend || ui) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const cog = document.createElement('button');
    cog.type = 'button'; cog.className = 'ms-cog'; cog.setAttribute('aria-label', 'Mouse control settings'); cog.setAttribute('aria-expanded', 'false');
    cog.setAttribute('data-tip', 'Mouse controls\nChoose which mouse button rotates, pans and zooms.');
    cog.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3.4" stroke-width="2.2"/><circle cx="12" cy="12" r="7.3" stroke-width="2.4"/><circle cx="12" cy="12" r="9.9" stroke-width="3.6" stroke-dasharray="3.1 4.3" stroke-linecap="butt"/></svg>';
    const panel = document.createElement('div');
    panel.className = 'ms-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Mouse control settings');
    // icons only: each row is a drawing of what it does, each choice a drawing of the mouse with that button lit (names live in the tooltips)
    const SV = d => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    const ROW_IC = {
      rotate: SV('<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/>'),
      pan: SV('<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
      zoom: SV('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5M10.5 8v5M8 10.5h5"/>')
    };
    const MOUSE = b => {
      const hi = { L: '<path d="M4.5 10V9a7.5 7.5 0 0 1 7.5-7.5V10z" fill="currentColor" stroke="none"/>', R: '<path d="M19.5 10V9A7.5 7.5 0 0 0 12 1.5V10z" fill="currentColor" stroke="none"/>',
        M: '<rect x="10" y="3.5" width="4" height="6" rx="2" fill="currentColor" stroke="none"/>',
        N: '<rect x="10" y="3.5" width="4" height="6" rx="2" fill="currentColor" stroke="none"/><path d="M19 4l1.8 2L19 8M5 4L3.2 6 5 8" opacity="0"/>' }[b];
      const wheel = b === 'N' ? '<path d="M20.5 3.5v5M18.8 5.2l1.7-1.7 1.7 1.7M18.8 6.8l1.7 1.7 1.7-1.7" stroke-width="1.5"/>' : '';
      return SV(`<rect x="4.5" y="1.5" width="15" height="21" rx="7.5" stroke-width="1.8"/><path d="M4.5 10h15M12 1.5V10" stroke-width="1.5"/>${hi}${wheel}`);
    };
    const TIP = { L: 'Left button', M: 'Middle button (wheel click)', R: 'Right button', N: 'Wheel only' };
    panel.innerHTML = ACTIONS.map(([k, label]) => `<div class="ms-row" data-k="${k}"><b data-tip="${label}" aria-label="${label}">${ROW_IC[k]}</b><div class="ms-seg">` +
        (k === 'zoom' ? `<button type="button" data-b="N" aria-label="${TIP.N}" data-tip="${TIP.N}">${MOUSE('N')}</button>` : '') +
        ['L', 'M', 'R'].map(b => `<button type="button" data-b="${b}" aria-label="${TIP[b]}" data-tip="${TIP[b]}">${MOUSE(b)}</button>`).join('') + '</div></div>').join('') +
      `<div class="ms-foot"><button type="button" class="ms-reset" aria-label="Reset the mouse buttons" data-tip="Reset\nBack to the usual buttons.">${SV('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>')}</button></div>`;
    legend.insertBefore(cog, legend.firstChild);
    legend.appendChild(panel);
    const open = v => { legend.classList.toggle('ms-open', v); panel.classList.toggle('open', v); cog.setAttribute('aria-expanded', String(v)); };
    cog.addEventListener('click', e => { e.stopPropagation(); open(!panel.classList.contains('open')); });
    panel.addEventListener('click', e => {
      e.stopPropagation();
      const b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('ms-reset')) map = Object.assign({}, DEFAULT);
      else if (b.dataset.b) assign(b.closest('.ms-row').dataset.k, b.dataset.b);
      else return;
      commit();
    });
    document.addEventListener('pointerdown', e => { if (!legend.contains(e.target)) open(false); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('open')){ open(false); cog.focus({ preventScroll: true }); } });
    ui = { legend, panel };
    paint();
  }
  // the legend's mouse pictures, the panel's pressed buttons and the written hints, to match
  let lastPhrase = null;
  function paint(){
    if (!ui) return;
    const letter = k => (k === 'N' ? 'm' : k.toLowerCase());
    [...ui.legend.querySelectorAll('.mk')].forEach((mk, i) => {
      const m = mk.querySelector('.mouse'), k = ['rotate', 'pan', 'zoom'][i]; if (!m || !k) return;
      m.classList.remove('l', 'm', 'r'); m.classList.add(letter(map[k]));
    });
    ui.panel.querySelectorAll('.ms-row').forEach(row => row.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.b === map[row.dataset.k]))));
    const now = phrase(), was = lastPhrase || 'Left-drag to rotate · right-drag to pan · scroll to zoom';
    document.querySelectorAll('.cine.bot .m-only, .cine.bot .hint, .cine.bot .chint').forEach(el => {
      if (el.matches('.hint') && el.querySelector('.m-only')) return;
      if (el.textContent.includes(was)) el.textContent = el.textContent.replace(was, now);
    });
    lastPhrase = now;
  }
  function commit(){
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) {}
    publish(); controlsList.forEach(applyTo); paint();
  }
  window.addEventListener('storage', e => {
    if (e.key !== KEY || !e.newValue) return;
    try { const s = JSON.parse(e.newValue); map = { rotate: s.rotate, pan: s.pan, zoom: s.zoom }; publish(); controlsList.forEach(applyTo); paint(); } catch (err) {}
  });

  window.__mouseSettings = {
    controls: controlsList,   // (the tools' OrbitControls, for the dev panel and tests)
    attach(controls){
      controlsList.push(controls); applyTo(controls);
      // a middle-button press would otherwise start the browser's scroll-by-dragging
      controls.domElement.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
    }
  };
})();
