// The "clean the contact points" picture in the 3D scene: a real slip of paper (a thin box, drawn by the tool itself) comes down between
// the two contact faces, the tool closes on it, and the paper is pulled out against the grip of the faces, stopping and slipping as it
// goes, and comes out with a slight brown stain where the dirt came off the tool.
//
// The stain is found, not placed: once the tool has closed on the paper, every solid thing in the scene is tested against both faces of the
// paper (object detection) and the part of each face it actually touches is mapped (stain area detection). Dirt is laid down only on a side
// that a dirty object touches, only over that touched area, and then smeared along the paper as it is pulled out (the touched area slides
// across the paper). A thing that is clean (userData.paperClean on it or its parent, such as the steel block in the telescopic lab) touches
// the paper and is found, but leaves nothing. What was found is kept in window.__paper.last.
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
//     size: [width, length], thick
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
  const sRGB = (T, t) => { if ('sRGBEncoding' in T) t.encoding = T.sRGBEncoding; else if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace; return t; };

  // ---- object and stain area detection ----
  // Which solid things touch which face of the paper, and where? The paper is in its group g (half sizes hx, hy; thickness th). A thing touches
  // a face when part of its surface lies within EPS of that face (the tools close to a little more than the paper's thickness).
  // Each triangle of each solid mesh is taken in the paper's frame (x across, y along the pull, z through it). The ones lying flat in the touching
  // band are mapped whole into the paper's picture of the touched area; ones only partly in it (a rounded head) are sampled, and the samples
  // that are in the band are mapped. Returns, for the face on the +z side and the one on the -z side: the things found, and the area touched by
  // dirty ones as a canvas the size of the paper (white where touched).
  const EPS = 0.8, LO = -0.25;   // (times the paper's thickness)
  const cleanThing = o => { for (; o; o = o.parent) if (o.userData && o.userData.paperClean) return true; return false; };
  const nameOf = o => { for (; o; o = o.parent) if (o.name) return o.name; return 'unnamed'; };
  function detect(T, scene, g, hx, hy, th, N){
    g.updateMatrixWorld(true); scene.updateMatrixWorld(true);
    const toBox = new T.Matrix4().copy(g.matrixWorld).invert(), pb = new T.Box3(), mb = new T.Box3(), m4 = new T.Matrix4();
    const hz = th/2 + th*EPS;
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pb.expandByPoint(new T.Vector3(x*hx, y*hy, z*hz).applyMatrix4(g.matrixWorld));
    const sx = N/(2*hx), sy = N/(2*hy), lo = LO*th, hi = EPS*th;
    const mk = side => { const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); x.fillStyle = '#fff'; return { side, c, x, objs: new Map() }; };
    const sides = [mk(1), mk(-1)];
    const v = new Float64Array(9), px = new Float64Array(3), py = new Float64Array(3);
    for (const mesh of solids(scene, g, [])){
      const geo = mesh.geometry; if (!geo.boundingBox) geo.computeBoundingBox();
      if (!mb.copy(geo.boundingBox).applyMatrix4(mesh.matrixWorld).intersectsBox(pb)) continue;
      m4.multiplyMatrices(toBox, mesh.matrixWorld);
      const e = m4.elements, pos = geo.attributes.position, idx = geo.index, n = idx ? idx.count : pos.count, clean = cleanThing(mesh);
      for (let i = 0; i + 2 < n; i += 3){
        for (let k = 0; k < 3; k++){
          const q = idx ? idx.getX(i + k) : i + k, x = pos.getX(q), y = pos.getY(q), z = pos.getZ(q);
          v[3*k] = e[0]*x + e[4]*y + e[8]*z + e[12]; v[3*k + 1] = e[1]*x + e[5]*y + e[9]*z + e[13]; v[3*k + 2] = e[2]*x + e[6]*y + e[10]*z + e[14];
        }
        if (Math.min(v[0], v[3], v[6]) > hx || Math.max(v[0], v[3], v[6]) < -hx || Math.min(v[1], v[4], v[7]) > hy || Math.max(v[1], v[4], v[7]) < -hy) continue;
        for (const S of sides){
          const s = S.side, d0 = s*v[2] - th/2, d1 = s*v[5] - th/2, d2 = s*v[8] - th/2;
          if (Math.min(d0, d1, d2) > hi || Math.max(d0, d1, d2) < lo) continue;
          const flat = d0 >= lo && d0 <= hi && d1 >= lo && d1 <= hi && d2 >= lo && d2 <= hi;
          const X = x => ((s > 0 ? x : -x) + hx)*sx, Y = y => (hy - y)*sy;
          let hit = false;
          if (flat){
            if (!clean){
              for (let k = 0; k < 3; k++){ px[k] = X(v[3*k]); py[k] = Y(v[3*k + 1]); }
              S.x.beginPath(); S.x.moveTo(px[0], py[0]); S.x.lineTo(px[1], py[1]); S.x.lineTo(px[2], py[2]); S.x.closePath(); S.x.fill(); S.x.lineWidth = 1; S.x.strokeStyle = '#fff'; S.x.stroke();
            }
            hit = true;
          } else {
            const M = 8;
            for (let a = 0; a <= M; a++) for (let b = 0; a + b <= M; b++){
              const u = a/M, w = b/M, t = 1 - u - w, x = v[0]*t + v[3]*u + v[6]*w, y = v[1]*t + v[4]*u + v[7]*w, d = s*(v[2]*t + v[5]*u + v[8]*w) - th/2;
              if (d < lo || d > hi || Math.abs(x) > hx || Math.abs(y) > hy) continue;
              if (!clean){ S.x.beginPath(); S.x.arc(X(x), Y(y), 1.6, 0, 6.2832); S.x.fill(); }
              hit = true;
            }
          }
          if (hit && !S.objs.has(mesh)) S.objs.set(mesh, { name: nameOf(mesh), clean });
        }
      }
    }
    return sides;
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
    // the stain: one transparent picture the size of the paper on each face, painted as the paper is pulled (see armStain and lay below)
    const N = 512, SPREAD = 8, PAD = SPREAD + 6, stain = [1, -1].map(s => {
      const c = document.createElement('canvas'); c.width = c.height = N;
      const mt = new T.MeshBasicMaterial({ map: sRGB(T, new T.CanvasTexture(c)), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      const m = new T.Mesh(new T.PlaneGeometry(w, L), mt); m.position.z = s*(th/2 + th*0.02); if (s < 0) m.rotation.y = Math.PI; m.userData.noFit = true;
      return { s, c, x: c.getContext('2d'), m, mt, stamp: null, last: null };
    });
    g.add(body, ...stain.map(q => q.m)); g.visible = false; g.userData.noFit = true;
    g.traverse(o => { o.raycast = () => {}; });
    spec.scene.add(g);
    // local y is the way it is pulled, local z the way the faces close
    const ax = new T.Vector3().crossVectors(spec.slide, spec.normal).normalize(), basis = new T.Matrix4().makeBasis(ax, spec.slide.clone(), spec.normal.clone());
    g.quaternion.setFromRotationMatrix(basis);
    const base = new T.Vector3(), off = new T.Vector3(), a0 = L*0.95;
    // a is how far the paper's middle is from the faces along the pull direction. The paper stays flat and square to the faces, at exactly its own
    // size: no bowing, tilting or scaling. If a place would put it through the tool, it stays at the last place that was clear.
    let safe = null, curA = 0;
    const put = a => {
      curA = a;
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
      put(a); mat.opacity = fade; stain.forEach(q => { q.mt.opacity = fade; }); g.visible = fade > 0.01; inv();
      return a;
    };
    const cleanup = () => { spec.scene.remove(g); mat.map.dispose(); mat.dispose(); body.geometry.dispose(); stain.forEach(q => { q.mt.map.dispose(); q.mt.dispose(); q.m.geometry.dispose(); }); inv(); window.__paper.busy = false; };
    // Once the tool has closed on the paper: find what touches it and where (detect), and make from that the mark each dirty face will leave, a soft brown
    // print of exactly the touched area. Nothing is laid down on a side that only a clean thing touches, or that nothing touches.
    let a0c = 0, reach = -Infinity;   // (reach: how far up the paper the touched area goes, from its middle; -Infinity when nothing was found)
    const armStain = () => {
      const found = detect(T, spec.scene, g, w/2, L/2, th, N); a0c = curA;
      window.__paper.last = { a: curA, size: [w, L], sides: found.map(S => ({ side: S.side, objects: [...S.objs.values()].map(o => ({ name: o.name, clean: o.clean })), bounds: null, stained: false })) };
      found.forEach((S, k) => {
        const px = S.x.getImageData(0, 0, N, N).data, pts = []; let x0 = N, x1 = -1, y0 = N, y1 = -1;
        for (let i = 3, n = 0; i < px.length; i += 4, n++) if (px[i] > 24){ const X = n % N, Y = (n - X)/N; pts.push(n); if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
        if (!pts.length) return;
        const q = stain[k], bw = x1 - x0 + 1 + 2*PAD, bh = y1 - y0 + 1 + 2*PAD, st = document.createElement('canvas'); st.width = bw; st.height = bh;
        const c = st.getContext('2d'), r = rng(77 + k);
        // the dirt bleeds a little past the exact touched spot (a rounded head touches only a pinpoint), softly
        try { c.filter = 'blur(2.5px)'; } catch (e) {}
        for (let i = 0; i < 9; i++){ const ox = i === 8 ? 0 : Math.cos(i*Math.PI/4)*SPREAD, oy = i === 8 ? 0 : Math.sin(i*Math.PI/4)*SPREAD; c.drawImage(S.c, x0 - PAD, y0 - PAD, bw, bh, ox, oy, bw, bh); }
        c.filter = 'none';
        c.globalCompositeOperation = 'source-in'; c.fillStyle = 'rgb(112,72,34)'; c.fillRect(0, 0, bw, bh);
        c.globalCompositeOperation = 'destination-out';   // uneven: patches where less came off
        for (let i = 0; i < 14; i++){ const cx = r()*bw, cy = r()*bh, rad = (0.15 + r()*0.3)*Math.max(bw, bh), gr = c.createRadialGradient(cx, cy, 0, cx, cy, rad); gr.addColorStop(0, 'rgba(0,0,0,' + (0.25 + r()*0.25).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, bw, bh); }
        c.globalCompositeOperation = 'source-atop';   // and a few grains of dirt, only on the touched area
        for (let i = 0; i < Math.min(60, pts.length/8); i++){ const n = pts[Math.floor(r()*pts.length)], X = n % N - x0 + PAD, Y = (n - n % N)/N - y0 + PAD; c.fillStyle = 'rgba(70,44,20,' + (0.3 + r()*0.4).toFixed(2) + ')'; c.beginPath(); c.arc(X, Y, 0.7 + r()*1.4, 0, 6.2832); c.fill(); }
        reach = Math.max(reach, L/2 - y0/(N/L));
        q.stamp = { c: st, x: x0 - PAD, y: y0 - PAD, h: bh }; q.last = null;
        // (the touched area in paper units, x across and y along: where the stain starts)
        const xs = S.side > 0 ? [x0/(N/w) - w/2, (x1 + 1)/(N/w) - w/2] : [w/2 - (x1 + 1)/(N/w), w/2 - x0/(N/w)];
        Object.assign(window.__paper.last.sides[k], { stained: true, bounds: [xs[0], xs[1], L/2 - (y1 + 1)/(N/L), L/2 - y0/(N/L)], area: pts.length/((N/w)*(N/L)) });
      });
    };
    // As the paper is pulled the touched area slides across it (the faces stay where they are), so the print is laid again and again further along the
    // paper, a streak that fades as the dirt runs out; the first print, where the faces first gripped, is the darkest.
    const lay = a => {
      for (const q of stain){
        const st = q.stamp; if (!st) continue;
        const shift = (a - a0c)*(N/L), step = Math.max(1, st.h/5); let drew = false;
        if (q.last === null){ q.x.globalAlpha = 0.7; q.x.drawImage(st.c, st.x, st.y); q.last = 0; drew = true; }
        while (shift - q.last >= step){
          q.last += step;
          const fade = 1 - 0.65*clamp(q.last/(N*0.5), 0, 1);
          q.x.globalAlpha = 1 - Math.pow(1 - 0.55*fade, step/st.h); q.x.drawImage(st.c, st.x, st.y + q.last); drew = true;
        }
        if (drew){ q.x.globalAlpha = 1; q.mt.map.needsUpdate = true; }
      }
    };
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
      await sleep(650); armStain();
      // 3. it is pulled out against the grip of the faces: it sticks, gives, sticks again. It is pulled until the touched area has left the paper (and a
      // little more), so it comes free with the whole stain just above the faces, in view, and not far out of sight.
      const total = 2900, p0 = curA, pull = isFinite(reach) ? Math.max(p0 + L*0.1, p0 + reach + L/2 + L*0.1) : a0*0.9; let acc = p0;
      if (!await tween(total, k => {
        // the pulling hand moves steadily, but the paper stops against the faces and then slips: it follows the hand in short bursts
        const hand = p0 + k*(pull - p0), slip = Math.sin(k*Math.PI*9)*0.5 + 0.5, grip = 0.55 + 0.45*Math.sin(k*Math.PI*5.3 + 1.2);
        acc += (hand - acc)*(0.04 + 0.2*slip*slip*(1 - 0.5*grip));
        lay(place(Math.min(hand, acc), 1));
      })) throw 0;
      // it comes free and is held up for a moment, stain showing
      const hold = pull + L*0.06;
      if (!await tween(600, k => { lay(place(pull + (hold - pull)*smooth(k), 1)); })) throw 0;
      if (window.__paperLog) console.warn('paper: pulled ' + Math.round(now()));
      await sleep(1300);
      if (!await tween(650, k => place(hold + L*0.5*smooth(k), 1 - smooth(k)))) throw 0;
    } catch (e) { if (e !== 0) console.warn('paper', e); }   // (0 means the walkthrough was left early)
    cleanup();
    return true;
  }
  window.__paper = { run, busy: false };
})();
