// Smooth zoom for the tools built on OrbitControls (the micrometers, the calipers and the height gage).
// OrbitControls turns every wheel notch into one instant jump of the zoom, so scrolling felt like stepping through still pictures, while
// rotating and panning already glide (damping). Here the wheel only sets where the zoom is heading, and every frame it eases toward that,
// in log space so each notch feels the same at any zoom, with a spread-out stop at the end. A trackpad's many small wheel events add up to
// one flowing zoom. Pinch on a touch screen is left to OrbitControls, and anything else that moves the camera (a view change, a flight)
// simply takes over: the easing lets go the moment it sees the camera was moved by someone else.
//
//   const sv = window.__smoothView({ camera, controls, el, skip });   // skip(e): true when the wheel belongs to something else under the pointer
//   const camMoved = ... | sv.step();                                  // once a frame, after controls.update()
window.__smoothView = function(cfg){
  const cam = cfg.camera, ctl = cfg.controls, el = cfg.el, ortho = !!cam.isOrthographicCamera;
  const RATE = cfg.rate || 9;            // how fast it catches up: about 90% of the way in a quarter of a second
  const PER_PIXEL = 0.0007*(cfg.speed || 1);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lo = () => ortho ? (ctl.minZoom || 0.05) : Math.max(1e-4, ctl.minDistance || 0.01);
  const hi = () => ortho ? (ctl.maxZoom || 1e4) : (isFinite(ctl.maxDistance) ? ctl.maxDistance : 1e5);
  const _d = cam.position.clone();
  const cur = () => ortho ? cam.zoom : cam.position.distanceTo(ctl.target);
  let shown = cur(), goal = null, last = performance.now();
  const put = v => {
    if (ortho){ cam.zoom = v; cam.updateProjectionMatrix(); }
    else { _d.copy(cam.position).sub(ctl.target).setLength(v); cam.position.copy(ctl.target).add(_d); }
    shown = cur();
    ctl.dispatchEvent({ type: 'change' });
  };
  el.addEventListener('wheel', e => {
    if (ctl.enabled === false || ctl.enableZoom === false) return;
    if (cfg.skip && cfg.skip(e)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    // one notch of a mouse wheel is about 100; a trackpad sends many small ones; Firefox may count in lines
    const dy = clamp(e.deltaY*(e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1), -300, 300);
    if (!dy) return;
    const f = Math.exp(-dy*PER_PIXEL);                       // above 1 zooms in
    if (goal == null) shown = cur();                          // (a view change or a flight may have moved the camera since this last did)
    const base = goal == null ? cur() : goal;
    goal = clamp(ortho ? base*f : base/f, lo(), hi());
    // what OrbitControls itself says around a wheel notch: the tool uses it to let go of any camera move of its own that is still running
    ctl.dispatchEvent({ type: 'start' }); ctl.dispatchEvent({ type: 'end' });
    if (cfg.wake) cfg.wake();
  }, { capture: true, passive: false });
  const api = {
    // call once a frame, after controls.update(): true while the zoom is still moving
    step(){
      const now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - last)/1000)); last = now;
      if (goal == null){ shown = cur(); return false; }
      // the camera was moved by something else since this last set it (a view change, a flight, a pinch): follow that, don't fight it
      if (Math.abs(Math.log(cur()/shown)) > 1e-4){ goal = null; shown = cur(); return false; }
      const k = 1 - Math.exp(-dt*RATE), v = Math.exp(Math.log(shown) + (Math.log(goal) - Math.log(shown))*k);
      if (Math.abs(Math.log(goal/v)) < 4e-4){ put(goal); goal = null; return true; }
      put(v); return true;
    },
    busy: () => goal != null,
    cancel(){ goal = null; shown = cur(); },
    // the zoom this is heading for (or where it is, at rest), for testing
    goal: () => goal == null ? cur() : goal
  };
  window.__view = { camera: cam, controls: ctl, el, sv: api, ortho };   // dev mode reads the camera from here
  return api;
};
