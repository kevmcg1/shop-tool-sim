// Things that are switched out or hidden (a part swapped for another, the table taken away) dissolve out, and
// what comes in builds in, the same way the section view cuts: the surface breaks into small cells. It sweeps
// across the piece from one corner to the opposite corner, the cells along the front scattered a little so the
// edge breaks up rather than wiping straight. A new piece only starts building once everything dissolving out
// has gone; until then it is there but not shown.
//
// window.__dissolveFx(THREE) gives each tool { out(obj, opts), in(obj, opts) }, where opts can have frame()
// (draw again), shadow() (the shadow map needs redrawing), done() (called once it's finished) and cells (how
// many cells across the piece; 26 by default). A dissolving piece gets its own copies of its materials for the
// length of the effect, since materials are often shared with other things, and casts no shadow meanwhile.
// Reduced motion skips straight to the end.
(function(){
  window.__dissolveFx = T => {
    const MS = 750, BAND = 0.12, JITTER = 0.16;
    const FRAG = [
      'uniform float uDzFront, uDzIn, uDzCell, uDzJit;',
      'uniform vec3 uDzA, uDzD;',
      'uniform mat4 uDzInv;',
      'varying vec3 vDzWP;',
      'float dzHash(vec3 q){ q = fract(q*vec3(123.34, 456.21, 789.53)); q += dot(q, q.yzx + 45.32); return fract((q.x + q.y)*q.z); }',
      'void dzCut(){',
      '  vec3 lp = (uDzInv*vec4(vDzWP, 1.0)).xyz;                   // on the piece itself, so it can move meanwhile',
      '  float t = dot(lp - uDzA, uDzD);                            // 0 at the starting corner, 1 at the far one',
      '  t += (dzHash(floor(lp*uDzCell)) - 0.5)*uDzJit;             // cells break the front up',
      '  if (uDzIn > 0.5 ? t > uDzFront : t < uDzFront) discard;    // building: shown behind the front; going: ahead of it',
      '}'
    ].join('\n');
    // a copy of a material that leaves out the part of the piece not (yet, or any longer) showing; anything the
    // original already adds to its shader (the section view's cut) is kept
    function patch(orig, U){
      const m = orig.clone();
      const prev = orig.onBeforeCompile, key = orig.customProgramCacheKey ? orig.customProgramCacheKey() : '';
      m.onBeforeCompile = (sh, r) => {
        if (prev) prev.call(orig, sh, r);
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDzWP;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvDzWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG)
          .replace('#include <clipping_planes_fragment>', 'dzCut();\n#include <clipping_planes_fragment>');
      };
      m.customProgramCacheKey = () => key + '|dissolve2';
      m.userData = Object.assign({}, m.userData, { dissolve: true });
      return m;
    }
    // everything dissolving out right now; a piece building in waits for all of it
    let outs = Promise.resolve();

    function run(obj, show, opts){
      opts = opts || {};
      const frame = () => { if (opts.frame) opts.frame(); };
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      // a piece caught mid-sweep and now sent the other way (a part swapped again while it was still building
      // in) runs its sweep back from wherever it has got to, instead of snapping whole and starting over
      const prevJob = obj && obj.userData.dz;
      if (prevJob && prevJob.started && prevJob.show !== show && !reduce){
        const p = prevJob.reverse(opts);
        if (!show) outs = Promise.all([outs, p]);
        return p;
      }
      // otherwise a piece already mid-effect is dropped first (its own materials put back). One that was still
      // waiting to build in was never seen, so taking it away is immediate
      const unseen = !!prevJob && prevJob.show && !prevJob.started;
      if (prevJob) prevJob.cancel();
      if (!obj || reduce || (unseen && !show)){ frame(); if (opts.done) opts.done(); return Promise.resolve(); }

      // the corner-to-corner line, measured on the piece: from its low corner to the opposite high corner
      obj.updateWorldMatrix(true, true);
      const inv0 = new T.Matrix4().copy(obj.matrixWorld).invert();
      const wb = new T.Box3().setFromObject(obj), lb = new T.Box3();
      for (let i = 0; i < 8; i++) lb.expandByPoint(new T.Vector3(i & 1 ? wb.max.x : wb.min.x, i & 2 ? wb.max.y : wb.min.y, i & 4 ? wb.max.z : wb.min.z).applyMatrix4(inv0));
      const span = lb.max.clone().sub(lb.min), len2 = Math.max(span.lengthSq(), 1e-9);
      const U = {
        uDzFront: { value: show ? -BAND - JITTER : -BAND - JITTER }, uDzIn: { value: show ? 1 : 0 },
        uDzCell: { value: (opts.cells || 26)/Math.max(span.x, span.y, span.z, 1e-6) }, uDzJit: { value: JITTER },
        uDzA: { value: lb.min.clone() }, uDzD: { value: span.clone().divideScalar(len2) }, uDzInv: { value: inv0 }
      };
      const swaps = [];
      obj.traverse(o => {
        if (!o.isMesh || !o.material) return;
        const orig = o.material;
        swaps.push([o, orig, o.castShadow]);
        o.material = Array.isArray(orig) ? orig.map(x => patch(x, U)) : patch(orig, U);
        o.castShadow = false;
      });
      if (opts.shadow) opts.shadow();
      frame();

      let fin = false, raf = 0, timer = 0, resolve;
      const promise = new Promise(r => { resolve = r; });
      const restore = () => {
        for (const [o, orig, cs] of swaps){
          const m = o.material; o.material = orig; o.castShadow = cs;
          (Array.isArray(m) ? m : [m]).forEach(x => x.dispose());
        }
        if (obj.userData.dz === job) delete obj.userData.dz;
      };
      // k runs 0 → 1 across the sweep (dir +1), or back down to 0 once the sweep has been sent the other way
      let k = 0, dir = 1, last = 0, endOpts = opts, endResolve = resolve;
      const finish = () => {
        if (fin) return; fin = true;
        cancelAnimationFrame(raf); clearTimeout(timer);
        // put the real materials back and let the owner finish up (take the piece away, say) in the same moment,
        // before anything is drawn, so a piece swept away never shows whole for a frame
        restore();
        if (endOpts.shadow) endOpts.shadow();
        if (endOpts.frame) endOpts.frame();
        if (endOpts.done) endOpts.done();
        endResolve();
      };
      const job = {
        show, started: false,
        cancel(){ if (fin) return; fin = true; cancelAnimationFrame(raf); clearTimeout(timer); restore(); endResolve(); },
        // send it back the way it came, from where it is now: the first request is over as far as anyone waiting
        // on it is concerned, and the new one's done() runs when it gets back to the start
        reverse(o){
          o = o || {};
          endResolve();
          dir = -dir; job.show = !job.show; endOpts = o;
          return new Promise(r => { endResolve = r; });
        }
      };
      obj.userData.dz = job;

      const go = () => {
        if (fin) return;
        job.started = true;
        // it moves on by the time between frames, but never more than a short frame's worth at once, so a frame
        // that stalls (a shader being built the first time) doesn't make the sweep jump
        const step = now => {
          if (fin) return;
          const dt = last ? Math.min(34, Math.max(0, now - last)) : 16; last = now;
          k = Math.max(0, Math.min(1, k + dir*dt/MS));
          const e = k*k*(3 - 2*k);
          U.uDzFront.value = -BAND - JITTER + e*(1 + 2*BAND + 2*JITTER);
          U.uDzInv.value.copy(obj.matrixWorld).invert();
          frame();
          if ((dir > 0 && k >= 1) || (dir < 0 && k <= 0)) { finish(); return; }
          raf = requestAnimationFrame(step);
          // a timer backs up the frame callbacks, which stop while the page is not being painted
          clearTimeout(timer); timer = setTimeout(finish, 1000);
        };
        raf = requestAnimationFrame(step);
        timer = setTimeout(finish, 1000);
      };
      // building in waits for everything going out to be gone; going out starts straight away
      if (show) outs.then(go); else { go(); outs = Promise.all([outs, promise]); }
      return promise;
    }
    return { out: (obj, opts) => run(obj, false, opts), in: (obj, opts) => run(obj, true, opts) };
  };
})();
