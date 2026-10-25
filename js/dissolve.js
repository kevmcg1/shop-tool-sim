// Things that are switched out or hidden (a part swapped for another, the table taken away) dissolve out, and
// what comes in builds in, the same way the section view cuts: the surface breaks into small cells. It sweeps
// across the piece from one corner to the opposite corner, the cells along the front scattered a little so the
// edge breaks up rather than wiping straight. A new piece only starts building once everything dissolving out
// has gone; until then it is there but not shown.
//
// window.__dissolveFx(THREE) gives each tool { out(obj, opts), in(obj, opts) }, where opts can have frame()
// (draw again), shadow() (the shadow map needs redrawing), done() (called once it's finished) and cells (how
// many cells across the piece; 26 by default) and ms (how long the sweep takes; 750 by default). A dissolving piece gets its own copies of its materials for the
// length of the effect, since materials are often shared with other things, and casts no shadow meanwhile.
// Reduced motion skips straight to the end.
(function(){
  window.__dissolveFx = T => {
    const MS = 750, BAND = 0.12, JITTER = 0.16;
    const FRAG = [
      'uniform float uDzFront, uDzIn, uDzCell, uDzJit, uDzGlow;',
      'float dzEdge = 0.0;',
      'uniform vec3 uDzA, uDzD;',
      'uniform mat4 uDzInv;',
      'varying vec3 vDzWP;',
      'float dzHash(vec3 q){ q = fract(q*vec3(123.34, 456.21, 789.53)); q += dot(q, q.yzx + 45.32); return fract((q.x + q.y)*q.z); }',
      'void dzCut(){',
      '  vec3 lp = (uDzInv*vec4(vDzWP, 1.0)).xyz;                   // on the piece itself, so it can move meanwhile',
      '  float t = dot(lp - uDzA, uDzD);                            // 0 at the starting corner, 1 at the far one',
      '  t += (dzHash(floor(lp*uDzCell)) - 0.5)*uDzJit;             // cells break the front up',
      '  if (uDzIn > 0.5 ? t > uDzFront : t < uDzFront) discard;    // building: shown behind the front; going: ahead of it',
      '  dzEdge = uDzGlow*(1.0 - smoothstep(0.0, 0.06, abs(t - uDzFront)));   // a bright line along the front (painting only)',
      '}'
    ].join('\n');
    // a copy of a material that leaves out the part of the piece not (yet, or any longer) showing; anything the
    // original already adds to its shader (the section view's cut) is kept. The built-in materials are cut where
    // three.js clips; a hand-written shader (an outline shell, say) is cut at the top of its main()
    const MAIN = /void\s+main\s*\(\s*(void)?\s*\)\s*\{/;
    // (clone() copies userData by way of JSON, which is very slow if it holds textures, as a saved finish does: leave it out of the copy)
    function cloneLight(m){ const ud = m.userData; m.userData = {}; try { return m.clone(); } finally { m.userData = ud; } }
    function patch(orig, U){
      const m = cloneLight(orig);
      const prev = orig.onBeforeCompile, key = orig.customProgramCacheKey ? orig.customProgramCacheKey() : '';
      m.onBeforeCompile = (sh, r) => {
        if (prev) prev.call(orig, sh, r);
        Object.assign(sh.uniforms, U);
        const vs = sh.vertexShader, fs = sh.fragmentShader;
        sh.vertexShader = vs.includes('#include <common>') && vs.includes('#include <project_vertex>')
          ? vs.replace('#include <common>', '#include <common>\nvarying vec3 vDzWP;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvDzWP = (modelMatrix * vec4(transformed, 1.0)).xyz;')
          : 'varying vec3 vDzWP;\n' + vs.replace(MAIN, h => h + '\nvDzWP = (modelMatrix * vec4(position, 1.0)).xyz;');
        sh.fragmentShader = fs.includes('#include <common>') && fs.includes('#include <clipping_planes_fragment>')
          ? fs.replace('#include <common>', '#include <common>\n' + FRAG).replace('#include <clipping_planes_fragment>', 'dzCut();\n#include <clipping_planes_fragment>').replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb += dzEdge*vec3(0.20, 0.52, 0.98);')
          : FRAG + '\n' + fs.replace(MAIN, h => h + '\ndzCut();');
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
      if (obj && obj.userData.paintJob) obj.userData.paintJob.cancel();
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
        uDzFront: { value: show ? -BAND - JITTER : -BAND - JITTER }, uDzIn: { value: show ? 1 : 0 }, uDzGlow: { value: 0 },
        uDzCell: { value: (opts.cells || 26)/Math.max(span.x, span.y, span.z, 1e-6) }, uDzJit: { value: JITTER },
        uDzA: { value: lb.min.clone() }, uDzD: { value: span.clone().divideScalar(len2) }, uDzInv: { value: inv0 }
      };
      // every mesh, line and sprite in it, a whole tool as readily as one part. A piece already in an effect of
      // its own (a part still building in when the whole tool goes) keeps that one; a raw shader, which can't
      // be cut, is simply hidden while the sweep runs
      const swaps = [], hid = [];
      const mine = x => !(x.userData && x.userData.dissolve);
      obj.traverse(o => {
        if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite) || !o.material) return;
        const orig = o.material, list = Array.isArray(orig) ? orig : [orig];
        if (!list.every(mine)) return;
        if (list.some(x => x.isRawShaderMaterial)){ if (o.visible){ o.visible = false; hid.push(o); } return; }
        const patched = Array.isArray(orig) ? orig.map(x => patch(x, U)) : patch(orig, U);
        swaps.push([o, orig, o.castShadow, patched]);
        o.material = patched;
        o.castShadow = false;
      });
      if (opts.shadow) opts.shadow();
      frame();

      let fin = false, raf = 0, timer = 0, resolve;
      const promise = new Promise(r => { resolve = r; });
      // the real materials go back, except where the owner has put a new one on meanwhile (a highlight lit,
      // a lock painted red): that one stays. The copies are left for the garbage collector rather than disposed,
      // so their compiled shaders stay cached and the next sweep (a whole tool has many) starts without a stall
      const restore = () => {
        for (const [o, orig, cs, patched] of swaps) if (o.material === patched){ o.material = orig; o.castShadow = cs; }
        hid.forEach(o => { o.visible = true; });
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
          k = Math.max(0, Math.min(1, k + dir*dt/(opts.ms || MS)));
          const e = k*k*(3 - 2*k);
          U.uDzFront.value = -BAND - JITTER + e*(1 + 2*BAND + 2*JITTER);
          U.uDzInv.value.copy(obj.matrixWorld).invert();
          frame();
          if ((dir > 0 && k >= 1) || (dir < 0 && k <= 0)) { finish(); return; }
          raf = requestAnimationFrame(step);
          // a timer backs up the frame callbacks, which stop while the page is not being painted
          clearTimeout(timer); timer = setTimeout(finish, (opts.ms || MS) + 250);
        };
        raf = requestAnimationFrame(step);
        timer = setTimeout(finish, (opts.ms || MS) + 250);
      };
      // building in waits for everything going out to be gone; going out starts straight away
      if (show) outs.then(go); else { go(); outs = Promise.all([outs, promise]); }
      return promise;
    }
    // paint(root, apply, opts): the look changes by painting over the surface, with nothing disappearing. apply() makes the change; each
    // surface that changed keeps a copy of how it looked, laid over the new look, and the sweep cuts that copy away from one corner to the
    // other, with a bright line along the front. opts: ms, cells, also (more objects to paint, a table say), show/hide (objects that
    // build in or dissolve out meanwhile), frame, done.
    function paint(root, apply, opts){
      opts = opts || {};
      const frame = () => { if (opts.frame) opts.frame(); };
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const roots = [root].concat(opts.also || []).filter(Boolean);
      const fin = () => { (opts.show || []).forEach(o => { o.visible = true; }); (opts.hide || []).forEach(o => { o.visible = false; }); frame(); if (opts.done) opts.done(); };
      // a piece caught mid-dissolve is simply changed; there is nothing worth painting yet
      if (!root || reduce || root.userData.dz){ apply(); fin(); return Promise.resolve(); }
      if (root.userData.paintJob) root.userData.paintJob.cancel();
      // how every surface looks now
      const snaps = [];
      roots.forEach(r => r.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.material || (o.userData && o.userData.paintOverlay)) return;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        if (list.some(m => !m.isMeshStandardMaterial || m.transparent || m.userData.dissolve)) return;
        snaps.push({ o, list: list.slice(), ver: list.map(m => m.version), copy: list.map(m => { const c = cloneLight(m); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; return c; }), arr: Array.isArray(o.material) });
      }));
      apply();
      root.updateWorldMatrix(true, true);
      const inv0 = new T.Matrix4().copy(root.matrixWorld).invert();
      const wb = new T.Box3(); roots.forEach(r => wb.expandByObject(r));
      const lb = new T.Box3();
      for (let i = 0; i < 8; i++) lb.expandByPoint(new T.Vector3(i & 1 ? wb.max.x : wb.min.x, i & 2 ? wb.max.y : wb.min.y, i & 4 ? wb.max.z : wb.min.z).applyMatrix4(inv0));
      const span = lb.max.clone().sub(lb.min), len2 = Math.max(span.lengthSq(), 1e-9);
      const U = {
        uDzFront: { value: -BAND - JITTER }, uDzIn: { value: 0 }, uDzGlow: { value: 1 },
        uDzCell: { value: (opts.cells || 40)/Math.max(span.x, span.y, span.z, 1e-6) }, uDzJit: { value: JITTER },
        uDzA: { value: lb.min.clone() }, uDzD: { value: span.clone().divideScalar(len2) }, uDzInv: { value: inv0 }
      };
      const overlays = [];
      for (const sn of snaps){
        const changed = sn.list.some((m, i) => sn.o.material !== undefined && ((Array.isArray(sn.o.material) ? sn.o.material[i] : sn.o.material) !== m || m.version !== sn.ver[i]));
        if (!changed) continue;
        const olds = sn.copy.map(c => { c.polygonOffset = true; c.polygonOffsetFactor = -1; c.polygonOffsetUnits = -1; return patch(c, U); });
        const ov = new T.Mesh(sn.o.geometry, sn.arr ? olds : olds[0]);
        ov.userData.paintOverlay = true; ov.renderOrder = sn.o.renderOrder; ov.castShadow = false; ov.receiveShadow = false; ov.raycast = () => {};
        sn.o.add(ov); overlays.push(ov);
      }
      // pieces coming in or going out of the picture meanwhile
      (opts.show || []).forEach(o => { o.visible = true; run(o, true, { cells: opts.cells || 40, ms: opts.ms, frame: opts.frame }); });
      (opts.hide || []).forEach(o => { run(o, false, { cells: opts.cells || 40, ms: opts.ms, frame: opts.frame, done: () => { o.visible = false; } }); });
      frame();
      let done = false, raf = 0, timer = 0, resolve; const ms = opts.ms || 700;
      const promise = new Promise(r => { resolve = r; });
      const end = () => {
        if (done) return; done = true; cancelAnimationFrame(raf); clearTimeout(timer);
        overlays.forEach(ov => { if (ov.parent) ov.parent.remove(ov); });
        if (root.userData.paintJob === job) delete root.userData.paintJob;
        fin(); resolve();
      };
      const job = { cancel(){ end(); } };
      root.userData.paintJob = job;
      let k = 0, last = 0;
      const step = now => {
        if (done) return;
        const dt = last ? Math.min(34, Math.max(0, now - last)) : 16; last = now;
        k = Math.min(1, k + dt/ms);
        const e = k*k*(3 - 2*k);
        U.uDzFront.value = -BAND - JITTER + e*(1 + 2*BAND + 2*JITTER);
        U.uDzInv.value.copy(root.matrixWorld).invert();
        frame();
        if (k >= 1){ end(); return; }
        raf = requestAnimationFrame(step);
        clearTimeout(timer); timer = setTimeout(end, ms + 250);
      };
      raf = requestAnimationFrame(step); timer = setTimeout(end, ms + 250);
      return promise;
    }

    // The whole tool dissolves away when another tool's tab is opened, and builds back in when its tab comes back
    // (js/shell.js asks, through window.__toolFx): tool(root, opts) sets that up for the group holding the tool,
    // and builds it in once now, as the page first shows. A tool that has gone stays hidden until it is asked in.
    function tool(root, opts){
      opts = opts || {};
      let away = false;
      const o = extra => Object.assign({ cells: 64, ms: 800 }, opts, extra);
      const fx = window.__toolFx = {
        out(){
          if (away) return Promise.resolve();
          away = true;
          return run(root, false, o({ done: () => { if (away) root.visible = false; if (opts.frame) opts.frame(); } }));
        },
        // the look changes by painting over the surface (a finish switched on or off), without the tool leaving the picture
        paint(apply, extra){
          if (away){ apply(); if (extra && extra.show) extra.show.forEach(o => { o.visible = true; }); if (extra && extra.hide) extra.hide.forEach(o => { o.visible = false; }); return Promise.resolve(); }
          return paint(root, apply, Object.assign({ cells: 40, ms: 750 }, opts, extra));
        },
        in(){
          const was = away; away = false;
          if (!root.visible){ root.visible = true; if (opts.frame) opts.frame(); }
          if (!was) return Promise.resolve();
          // (the page's phase tracker, js/bubbles.js, hears when the tool has built in)
          return run(root, true, o()).then(r => { if (window.__phaseDone) window.__phaseDone(); return r; });
        }
      };
      away = true;
      // it stays out of sight until everything else on the page has popped in (js/bubbles.js), then builds in as it always did
      if (window.__afterBubbles){
        root.visible = false; if (opts.frame) opts.frame();
        let started = false;
        const go = () => { if (started) return; started = true; fx.in(); };
        window.__afterBubbles(go);
        setTimeout(go, 25000);   // (never left out of sight)
      } else fx.in();
      return fx;
    }
    return { out: (obj, opts) => run(obj, false, opts), in: (obj, opts) => run(obj, true, opts), paint, tool };
  };
})();
