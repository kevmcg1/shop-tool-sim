// The "clean the contact points" picture in the 3D scene: a real slip of paper (a thin box, drawn by the tool itself) comes down between
// the two contact faces, the tool closes on it, and the paper is pulled out against the grip of the faces, stopping and slipping as it
// goes, and comes out with a slight brown stain where the dirt came off the tool.
//
// Each tool describes its own faces and what it can do, and hands that to window.__paper.run(spec); it resolves when the paper has
// gone (true), or at once with false when the tool cannot show it. The scene's unit is whatever the tool draws in (inches, or
// millimeters in the lab): sizes in the spec are in that unit.
//
//   spec = {
//     T, scene, invalidate,
//     faceA: () => Vector3        the fixed face's middle (the paper rests against it)
//     normal: Vector3             unit vector from the fixed face toward the moving one
//     slide: Vector3              unit vector the paper is pulled out along (across the normal)
//     size: [width, length], thick, stain (the stain's size)
//     open: () => Promise         the tool opens a little, so the paper fits between the faces
//     closeOn: () => Promise      the tool closes until it touches the paper (resolves once it has)
//     look: () => void            aim the camera at the faces
//     alive: () => boolean        false once the walkthrough has been left (the paper goes at once)
//   }
// The paper is always the size in spec.size (the tools pass 3 in by 3 in, or 76.2 mm in the lab): it is never scaled, bent or tilted, so it
// never grows or shrinks, and it cannot pass through the tool. Each frame the new place for the paper is tested against every solid mesh in the
// scene (triangle against the paper's box); if it would cut into the tool, the paper stops at the last place that was clear. A tool closes on
// the paper to a little more than its thickness (CLEAR below), so the faces never have to squeeze it.
(function(){
  const frame = () => new Promise(r => requestAnimationFrame(r));
  // (the clock can be taken over by a test, window.__paperNow, to step through the animation moment by moment)
  const now = () => window.__paperNow ? window.__paperNow() : performance.now();
  const sleep = async ms => { const t0 = now(); while (now() - t0 < ms) await frame(); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = t => t*t*(3 - 2*t);
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };

  // plain white paper with a few fibers
  function paperTex(T){
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), r = rng(31);
    g.fillStyle = '#f3f0e6'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++){ g.strokeStyle = 'rgba(150,140,120,' + (0.03 + r()*0.05).toFixed(3) + ')'; g.lineWidth = 0.6; g.beginPath(); const x = r()*256, y = r()*256, a = r()*6.28, l = 3 + r()*9; g.moveTo(x, y); g.lineTo(x + Math.cos(a)*l, y + Math.sin(a)*l); g.stroke(); }
    const t = new T.CanvasTexture(c); if ('sRGBEncoding' in T) t.encoding = T.sRGBEncoding; else if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace; return t;
  }
  // the stain: a slight, uneven brown smudge, darkest in the middle, with a few grains of dirt
  function stainTex(T){
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), r = rng(77);
    for (let i = 0; i < 38; i++){
      const a = r()*6.28, d = r()*70, x = 128 + Math.cos(a)*d*(1.15), y = 128 + Math.sin(a)*d*0.8, rad = 22 + r()*40;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(112,72,34,' + (0.16 + r()*0.12).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(112,72,34,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    }
    for (let i = 0; i < 70; i++){ const a = r()*6.28, d = r()*58; g.fillStyle = 'rgba(70,44,20,' + (0.25 + r()*0.4).toFixed(3) + ')'; g.beginPath(); g.arc(128 + Math.cos(a)*d*1.1, 128 + Math.sin(a)*d*0.8, 0.8 + r()*1.8, 0, 6.28); g.fill(); }
    const t = new T.CanvasTexture(c); if ('sRGBEncoding' in T) t.encoding = T.sRGBEncoding; else if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace; return t;
  }

  // ---- collision: is a thin box (half sizes hx, hy, hz, in the box's own frame) cutting into any solid mesh of the scene? ----
  // Triangle against box, by the separating axis test; the numbers are the triangle's corners already in the box's frame.
  const tri = new Float64Array(9);
  function triBox(hx, hy, hz){
    const h = [hx, hy, hz];
    for (let k = 0; k < 3; k++){ const a = tri[k], b = tri[3 + k], c = tri[6 + k]; if (Math.min(a, b, c) > h[k] || Math.max(a, b, c) < -h[k]) return false; }
    const e = [[tri[3] - tri[0], tri[4] - tri[1], tri[5] - tri[2]], [tri[6] - tri[3], tri[7] - tri[4], tri[8] - tri[5]], [tri[0] - tri[6], tri[1] - tri[7], tri[2] - tri[8]]];
    const sep = (lx, ly, lz) => {
      const p0 = lx*tri[0] + ly*tri[1] + lz*tri[2], p1 = lx*tri[3] + ly*tri[4] + lz*tri[5], p2 = lx*tri[6] + ly*tri[7] + lz*tri[8];
      const r = hx*Math.abs(lx) + hy*Math.abs(ly) + hz*Math.abs(lz);
      return Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r;
    };
    const n = [e[0][1]*e[1][2] - e[0][2]*e[1][1], e[0][2]*e[1][0] - e[0][0]*e[1][2], e[0][0]*e[1][1] - e[0][1]*e[1][0]];
    if (sep(n[0], n[1], n[2])) return false;
    for (const E of e){ if (sep(0, E[2], -E[1]) || sep(-E[2], 0, E[0]) || sep(E[1], -E[0], 0)) return false; }
    return true;
  }
  // the solid meshes of the scene: everything drawn, bar the paper, anything see-through, and what a tool marks with userData.noCollide
  function solids(root, skip, out){
    if (!root.visible || root === skip || (root.userData && root.userData.noCollide)) return out;
    if (root.isMesh && root.geometry && root.geometry.attributes.position && !(root.material && root.material.transparent && root.material.opacity < 0.5)) out.push(root);
    for (let i = 0; i < root.children.length; i++) solids(root.children[i], skip, out);
    return out;
  }
  // does the paper, as it now stands (its group g, half sizes hx, hy, hz), cut into the tool?
  function cutsTool(T, scene, g, hx, hy, hz){
    g.updateMatrixWorld(true); scene.updateMatrixWorld(true);
    const toBox = new T.Matrix4().copy(g.matrixWorld).invert(), pb = new T.Box3(), mb = new T.Box3(), m4 = new T.Matrix4();
    const c = [-1, 1];
    for (const x of c) for (const y of c) for (const z of c) pb.expandByPoint(new T.Vector3(x*hx, y*hy, z*hz).applyMatrix4(g.matrixWorld));
    for (const mesh of solids(scene, g, [])){
      const geo = mesh.geometry; if (!geo.boundingBox) geo.computeBoundingBox();
      if (!mb.copy(geo.boundingBox).applyMatrix4(mesh.matrixWorld).intersectsBox(pb)) continue;
      m4.multiplyMatrices(toBox, mesh.matrixWorld);
      const e = m4.elements, pos = geo.attributes.position, idx = geo.index, n = idx ? idx.count : pos.count;
      for (let i = 0; i + 2 < n; i += 3){
        for (let k = 0; k < 3; k++){
          const v = idx ? idx.getX(i + k) : i + k, x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
          tri[3*k] = e[0]*x + e[4]*y + e[8]*z + e[12]; tri[3*k + 1] = e[1]*x + e[5]*y + e[9]*z + e[13]; tri[3*k + 2] = e[2]*x + e[6]*y + e[10]*z + e[14];
        }
        if (triBox(hx, hy, hz)) return true;
      }
    }
    return false;
  }

  async function run(spec){
    const T = spec.T, [w, L] = spec.size, th = spec.thick;
    if (!T || !spec.scene || window.__paper.busy) return false;
    window.__paper.busy = true;
    const alive = () => !spec.alive || spec.alive();
    const g = new T.Group(), inv = () => spec.invalidate && spec.invalidate();
    const mat = new T.MeshStandardMaterial({ map: paperTex(T), roughness: 0.92, metalness: 0, emissive: new T.Color(0x5a584e), transparent: true, opacity: 0 });
    const body = new T.Mesh(new T.BoxGeometry(w, L, th), mat); body.castShadow = true; body.userData.noShadow = false; body.userData.noFit = true;
    const sMat = new T.MeshBasicMaterial({ map: stainTex(T), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const sz = spec.stain || Math.min(w, L)*0.2, stain = [1, -1].map(s => { const m = new T.Mesh(new T.PlaneGeometry(sz, sz), sMat); m.position.z = s*(th/2 + th*0.02); if (s < 0) m.rotation.y = Math.PI; m.userData.noFit = true; return m; });
    g.add(body, ...stain); g.visible = false; g.userData.noFit = true;
    g.traverse(o => { o.raycast = () => {}; });
    spec.scene.add(g);
    // local y is the way it is pulled, local z the way the faces close
    const ax = new T.Vector3().crossVectors(spec.slide, spec.normal).normalize(), basis = new T.Matrix4().makeBasis(ax, spec.slide.clone(), spec.normal.clone());
    g.quaternion.setFromRotationMatrix(basis);
    const base = new T.Vector3(), off = new T.Vector3(), a0 = L*0.95;
    // a is how far the paper's middle is from the faces along the pull direction. The paper stays flat and square to the faces, at exactly its own
    // size: no bowing, tilting or scaling. If a place would put it through the tool, it stays at the last place that was clear.
    let safe = null;
    const put = a => {
      base.copy(spec.faceA()).addScaledVector(spec.normal, th/2 + th*0.05);
      off.copy(spec.slide).multiplyScalar(a); g.position.copy(base).add(off);
      g.quaternion.setFromRotationMatrix(basis); g.scale.set(1, 1, 1);
    };
    const clear = a => { put(a); return !cutsTool(T, spec.scene, g, w/2, L/2, th/2*0.9); };
    const place = (a, fade) => {
      if (clear(a)) safe = a;
      else if (safe !== null){
        // it would go through the tool: it stays at the last clear place between where it was and where it was asked to go
        let lo = safe, hi = a;
        for (let i = 0; i < 7; i++){ const mid = (lo + hi)/2; if (clear(mid)) lo = mid; else hi = mid; }
        a = safe = lo;
      }
      put(a); mat.opacity = fade; g.visible = fade > 0.01; inv();
    };
    const cleanup = () => { spec.scene.remove(g); mat.map.dispose(); mat.dispose(); sMat.map.dispose(); sMat.dispose(); body.geometry.dispose(); stain.forEach(m => m.geometry.dispose()); inv(); window.__paper.busy = false; };
    const tween = async (ms, fn) => { const t0 = now(); for (;;){ if (!alive()) return false; const k = clamp((now() - t0)/ms, 0, 1); fn(k); if (k >= 1) return true; await frame(); } };
    try {
      if (window.__paperLog) console.warn('paper: start ' + Math.round(now()));
      if (spec.look) spec.look();
      await spec.open(); if (window.__paperLog) console.warn('paper: opened ' + Math.round(now())); if (!alive()) throw 0;
      await sleep(350);
      // 1. it comes in from the side it will be pulled out of, and slides down between the faces
      place(a0, 0);
      if (!await tween(1100, k => place(a0*(1 - smooth(k)), Math.min(1, k*3)))) throw 0;
      await sleep(250); if (!alive()) throw 0;
      // 2. the tool closes on it
      await spec.closeOn(); if (window.__paperLog) console.warn('paper: closed ' + Math.round(now())); if (!alive()) throw 0;
      await sleep(650);
      // 3. it is pulled out against the grip of the faces: it sticks, gives, sticks again
      const r = rng(5), steps = []; let tot = 0;
      for (let i = 0; i < 9; i++){ const s = 0.35 + r()*0.65, f = 0.3 + r()*0.7; steps.push([s, f]); tot += s; }
      const total = 2900, pull = a0*0.9; let acc = 0, ptr = 0;
      if (!await tween(total, k => {
        // the pulling hand moves steadily, but the paper stops against the faces and then slips: it follows the hand in short bursts
        const hand = k*pull, slip = Math.sin(k*Math.PI*9)*0.5 + 0.5, grip = 0.55 + 0.45*Math.sin(k*Math.PI*5.3 + 1.2);
        acc += (hand - acc)*(0.04 + 0.2*slip*slip*(1 - 0.5*grip));
        const a = Math.min(hand, acc);
        place(a, 1);
        sMat.opacity = clamp(a/(L*0.2), 0, 1)*0.75;
      })) throw 0;
      // it comes free and is held up for a moment, stain showing
      if (!await tween(600, k => { const a = pull*(1 + 0.18*smooth(k)); place(a, 1); sMat.opacity = 0.75; })) throw 0;
      if (window.__paperLog) console.warn('paper: pulled ' + Math.round(now()));
      await sleep(1300);
      if (!await tween(650, k => place(pull*1.18 + L*0.5*smooth(k), 1 - smooth(k)))) throw 0;
    } catch (e) { if (e !== 0) console.warn('paper', e); }   // (0 means the walkthrough was left early)
    cleanup();
    return true;
  }
  window.__paper = { run, busy: false };
})();
