"use strict";
/* Gearworks — start-up and the render loop. */
(function(){
const U = GW.U;

GW.Scene.init(U.el('stage'));
GW.UI.init();

U.el('openFile').onchange = e => { if(e.target.files[0]) GW.UI.loadProject(e.target.files[0]); e.target.value = ''; };

/* first thing you see: a working pair, with the second gear selected */
const a = GW.Gears.add('spur', { name: 'Driver', z: 18, bore: 6 });
const b = GW.Gears.add('spur', { name: 'Driven', z: 27, bore: 8, finish: 'steel', thick: 8 });
GW.meshAuto(b, a);
GW.Scene.fit();
GW.UI.select(b.id, true);
if(window.innerWidth < 768) U.el('panel').classList.add('closed');

let last = performance.now(), seen = -1;
(function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  GW.Layout.update(dt);
  if(GW.Gears.version !== seen){ seen = GW.Gears.version; GW.Drives.sync(); }
  GW.Drives.update();
  const sel = GW.UI.sel(), hg = GW.Scene._helperGroup;
  if(sel && hg){ hg.position.copy(sel.rt.pos); hg.quaternion.copy(sel.rt.quat); }
  const s = GW.UI.sel();
  if(s && GW.UI.tab === 'edit' && s.parentId && (now | 0) % 6 === 0) GW.UI.updateSpeedReadout(s);
  GW.Scene.render();
})(last);

window.GW = GW;
})();
