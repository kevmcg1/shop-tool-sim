// Turning the view turns it round whatever is under the pointer (the tool, the part, the table), not round the
// middle of the view. Over empty space it turns round the middle as before.
//
// OrbitControls turns the camera round its target. Each step of that turn is moved over so the same turn happens
// round the picked point P instead: the camera and the target both shift by (I − R)(P − T), R being that step's
// turn and T the target before it. Only turns made by dragging (and the glide after letting go) are moved over;
// camera flights, zooms and pans are left alone.
//
// window.__orbitPivot(THREE, controls, camera, scene, element) sets it up for one tool.
(function(){
  window.__orbitPivot = (T, controls, camera, scene, el) => {
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    const qPrev = new T.Quaternion(), qInv = new T.Quaternion(), qd = new T.Quaternion();
    const tPrev = new T.Vector3(), v = new T.Vector3(), w = new T.Vector3();
    const down = new Set();
    let cand = null, pivot = null, gliding = false;
    // only what can be seen counts: not the shadow-catching floor, hidden things, or the inside faces of a cut
    const seen = h => {
      const m = h.object.material;
      if (!h.object.isMesh || !m || Array.isArray(m) || m.isShadowMaterial || m.visible === false || m.side === T.BackSide) return false;
      for (let o = h.object; o; o = o.parent) if (!o.visible) return false;
      return true;
    };
    function pick(e){
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      ndc.set((e.clientX - r.left)/r.width*2 - 1, -((e.clientY - r.top)/r.height)*2 + 1);
      ray.setFromCamera(ndc, camera);
      const h = ray.intersectObject(scene, true).find(seen);
      return h ? h.point.clone() : null;
    }
    // a plain left drag (or one finger) turns the view; with Shift, Ctrl or Cmd, or the right button, it slides
    el.addEventListener('pointerdown', e => {
      down.add(e.pointerId);
      const turn = down.size === 1 && (e.pointerType !== 'mouse' || e.button === 0) && !e.shiftKey && !e.ctrlKey && !e.metaKey;
      cand = turn ? pick(e) : null;
      pivot = null; gliding = false;
    }, true);
    const up = e => down.delete(e.pointerId);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    // pressing anything else (a view button, a key) lets go of the pivot, so a camera flight is never moved over
    window.addEventListener('pointerdown', e => { if (e.target !== el){ cand = null; pivot = null; } }, true);
    window.addEventListener('keydown', () => { pivot = null; }, true);
    controls.addEventListener('start', () => {
      pivot = cand; cand = null; gliding = false;
      qPrev.copy(camera.quaternion); tPrev.copy(controls.target);
    });
    controls.addEventListener('end', () => { gliding = true; });
    controls.addEventListener('change', () => {
      if (!pivot) return;
      qd.copy(camera.quaternion).multiply(qInv.copy(qPrev).invert());
      const turned = 1 - Math.abs(qd.w) > 1e-12;
      if (turned){
        v.copy(pivot).sub(tPrev); w.copy(v).applyQuaternion(qd); v.sub(w);   // (I − R)(P − T)
        camera.position.add(v); controls.target.add(v);
      } else if (gliding) pivot = null;   // the glide after letting go has run out
      qPrev.copy(camera.quaternion); tPrev.copy(controls.target);
    });
  };
})();
