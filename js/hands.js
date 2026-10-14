// 3D hands for "Show me": life-size hands with the wrist and forearm fading away, each one a single smooth skin that is blended from tapered
// finger bones, the palm and the pads of the thumb and little finger, so there are no joins, with webbing between the
// fingers, knuckles, flattened fingertips and nails. Everything is inches, like the tool they hold.
//
// A hand is built as a right hand (fingers along +y, palm facing +z, thumb on +x); a left hand is the same hand mirrored.
//
//   const H = window.__hands(THREE);
//   const h = H.hand({ left: false, scale: 1 });   // h.group goes in the scene
//   h.pose(closed, open)                            // joint angles: how far each joint bends toward the palm (radians)
//   h.settle(sdf, { margin })                       // closes the fingers from `open` toward `closed` until they touch what `sdf` says is
//                                                   // solid (sdf(worldPoint) = distance to it, negative inside), and lifts the hand clear
//   h.rebuild()                                     // makes the skin for the pose it is in (do this once the pose is final)
//   h.tip('index')                                  // a fingertip in world space
window.__hands = function(T){
  const ARM0 = -0.7, ARM1 = -4.5;                   // the skin is solid down to ARM0 on the way to the elbow and fades to nothing by ARM1 (a screen-door fade, so it works from every side)
  const skinMat = new T.MeshStandardMaterial({ color: 0x37190f, roughness: 0.56, metalness: 0, side: T.DoubleSide });
  skinMat.onBeforeCompile = sh => {
    sh.vertexShader = `varying float vHandY;
` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vHandY = position.y;`);
    sh.fragmentShader = `varying float vHandY;
` + sh.fragmentShader.replace('void main() {', `void main() {
  float fade = smoothstep(${ARM1.toFixed(2)}, ${ARM0.toFixed(2)}, vHandY);
  if (fade < 0.999 && fade <= fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;`);
  };
  const nailMat = new T.MeshStandardMaterial({ color: 0x6e4338, roughness: 0.42, metalness: 0, side: T.DoubleSide });
  const BLEND = 0.065;                               // how softly the shapes melt into each other (inches)
  const VOXEL = 0.052;                               // the skin's resolution (inches)

  // distance to a tapered rod from (0,0,0) to (0,len,0), radius r1 at the start and r2 at the end (round at both ends)
  function coneDist(x, y, z, len, r1, r2){
    const l2 = len*len, rr = r1 - r2, a2 = l2 - rr*rr, il2 = 1/l2;
    const py = y*len, pz = py - l2;
    const lat2 = (x*x + z*z)*l2*l2, y2 = py*py*l2, z2 = pz*pz*l2, k = Math.sign(rr)*rr*rr*lat2;
    if (Math.sign(pz)*a2*z2 > k) return Math.sqrt(lat2 + z2)*il2 - r2;
    if (Math.sign(py)*a2*y2 < k) return Math.sqrt(lat2 + y2)*il2 - r1;
    return (Math.sqrt(lat2*a2*il2) + py*rr)*il2 - r1;
  }

  // a chain of bones hung on the end of one another, in a group that is never drawn: it only holds the joint transforms
  function chain(lens, radii){
    const root = new T.Group(), joints = [];
    let parent = root, y = 0;
    for (let i = 0; i < lens.length; i++){
      const j = new T.Group(); j.position.y = y; parent.add(j); joints.push(j); parent = j; y = lens[i];
    }
    const tip = new T.Group(); tip.position.y = y; parent.add(tip);
    return { root, joints, tip, lens, radii };
  }

  function hand(opts){
    opts = opts || {};
    const g = new T.Group(), body = new T.Group(); g.add(body);
    if (opts.left) body.scale.x = -1;
    const K = opts.scale || 1; g.scale.setScalar(K);
    const rig = new T.Group();                       // the hand's own space (a right hand), with the joints in it

    // fingers: where each starts, its three bones, how thick it is, and how it fans out
    const FING = {
      index:  { x: 1.2,   y: 3.55, lens: [1.62, 0.95, 0.78], r: 0.34, spread: -0.07 },
      middle: { x: 0.4,   y: 3.7,  lens: [1.82, 1.08, 0.84], r: 0.345, spread: -0.01 },
      ring:   { x: -0.42, y: 3.58, lens: [1.7, 1.0, 0.8],   r: 0.325, spread: 0.04 },
      pinky:  { x: -1.2,  y: 3.2,  lens: [1.3, 0.74, 0.66], r: 0.285, spread: 0.12 }
    };
    const fingers = {};
    Object.keys(FING).forEach(n => {
      const f = FING[n], r = f.r;
      const c = chain(f.lens, [r, r*0.93, r*0.84, r*0.76]);
      c.root.position.set(f.x, f.y, 0); c.root.rotation.z = f.spread; c.spread = f.spread;
      rig.add(c.root); fingers[n] = c;
    });
    const th = chain([1.55, 1.25, 1.0], [0.52, 0.45, 0.38, 0.31]);
    th.root.position.set(0.95, 0.85, 0.1); rig.add(th.root);
    fingers.thumb = th;
    const NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    const OPEN = { index: [0.1, 0.12, 0.08], middle: [0.1, 0.12, 0.08], ring: [0.12, 0.14, 0.1], pinky: [0.14, 0.16, 0.12], thumb: [[0, 0, -0.6], [0, 0, 0], [0, 0, 0]] };

    // the palm, as soft blobs
    const BLOBS = [
      { c: [0, 2.0, 0],       r: [1.5, 1.85, 0.5] },       // the palm
      { c: [0.9, 1.15, 0.22], r: [0.78, 1.05, 0.5] },      // the ball of the thumb
      { c: [-1.05, 1.8, 0.05], r: [0.46, 1.4, 0.42] },     // the heel of the little finger
      { c: [0.05, 0.35, 0],   r: [1.0, 0.85, 0.5] },       // the heel of the hand, round where the wrist would be
      { c: [0, 3.2, -0.12],   r: [1.55, 0.62, 0.34] }      // the knuckle ridge across the back
    ];
    // the wrist and forearm, running off below the palm (they fade away, see ARM0 and ARM1)
    const ARM = [[-0.45, 0.98, 0.52], [-1.25, 0.96, 0.54], [-2.05, 0.98, 0.56], [-2.85, 1.0, 0.58], [-3.65, 1.02, 0.6], [-4.45, 1.04, 0.62]].map(a => ({ c: [0, a[0], 0.02], r: [a[1], 1.4, a[2]] }));

    /* ---------- pose ---------- */
    let closedPose = {}, openPose = OPEN;
    function setJoints(name, vals){
      const c = fingers[name];
      c.joints.forEach((j, i) => {
        if (name === 'thumb'){ const a = vals[i] || [0, 0, 0]; j.rotation.set(a[0], a[1], a[2]); }
        else j.rotation.set(vals[i] || 0, 0, 0);
      });
    }
    function mix(name, i, a, b, t){
      if (name === 'thumb'){ const p = (a[i] || [0, 0, 0]), q = (b[i] || [0, 0, 0]); return [p[0] + (q[0] - p[0])*t, p[1] + (q[1] - p[1])*t, p[2] + (q[2] - p[2])*t]; }
      return (a[i] || 0) + ((b[i] || 0) - (a[i] || 0))*t;
    }
    function applyT(name, ts){ const o = openPose[name] || OPEN[name], c = closedPose[name] || o; setJoints(name, ts.map((t, i) => mix(name, i, o, c, t))); }
    const api = { group: g, body, fingers, rig };
    api.pose = (closed, open) => {
      closedPose = closed || {}; openPose = Object.assign({}, OPEN, open || {});
      NAMES.forEach(n => setJoints(n, closedPose[n] || openPose[n]));
      if (closed && closed.spread) Object.keys(closed.spread).forEach(n => { fingers[n].root.rotation.z = closed.spread[n]; });
      rig.updateMatrixWorld(true); g.updateMatrixWorld(true);
      return api;
    };

    /* ---------- where things are ---------- */
    const _v = new T.Vector3();
    const world = (v, out) => (out || new T.Vector3()).copy(v).applyMatrix4(body.matrixWorld);   // a hand-space point, in the world
    api.tip = (n, out) => { rig.updateMatrixWorld(true); g.updateMatrixWorld(true); return world(_v.setFromMatrixPosition(fingers[n].tip.matrixWorld), out); };

    // sample spheres for collisions: [hand-space point, radius]
    const PALM_S = [[0, 0.4, 0, .6], [0.8, 0.9, 0.12, .6], [-0.8, 0.9, 0, .56], [0, 1.6, 0, .56], [1, 1.9, 0.1, .52], [-1, 1.9, 0, .5], [0, 2.7, 0, .5], [1.1, 3.1, 0, .42], [0.4, 3.2, 0, .42], [-0.4, 3.1, 0, .42], [-1.1, 2.8, 0, .4], [0, -0.9, 0, .55], [0, -1.8, 0, .55]];
    function samples(out){
      out.length = 0;
      rig.updateMatrixWorld(true); g.updateMatrixWorld(true);
      PALM_S.forEach(s => out.push({ p: world(new T.Vector3(s[0], s[1], s[2])), r: s[3]*K, palm: true }));
      NAMES.forEach(n => {
        const c = fingers[n];
        c.joints.forEach((j, i) => {
          const a = new T.Vector3().setFromMatrixPosition(j.matrixWorld);
          const b = new T.Vector3().setFromMatrixPosition((c.joints[i + 1] || c.tip).matrixWorld);
          for (let s = 0; s <= 3; s++){
            const t = s/3, r = (c.radii[i] + (c.radii[i + 1] - c.radii[i])*t)*K*(n === 'thumb' ? 1 : 0.95);
            out.push({ p: world(a.clone().lerp(b, t)), r, finger: n });
          }
        });
      });
      return out;
    }
    const S = [];
    // how far the hand is into something (positive = it is, by this much)
    function worst(sdf, margin){ samples(S); let w = -1e9, at = null; for (const s of S){ const pen = s.r + margin - sdf(s.p); if (pen > w){ w = pen; at = s; } } return { depth: w, at }; }
    const grad = (sdf, p) => {
      const e = 0.01, q = new T.Vector3();
      return new T.Vector3(sdf(q.set(p.x + e, p.y, p.z)) - sdf(q.set(p.x - e, p.y, p.z)), sdf(q.set(p.x, p.y + e, p.z)) - sdf(q.set(p.x, p.y - e, p.z)), sdf(q.set(p.x, p.y, p.z + e)) - sdf(q.set(p.x, p.y, p.z - e))).normalize();
    };
    // how deep into the solid the hand is, summed: 0 when it is clear (what a grip is searched against)
    api.penetration = (sdf, margin) => { samples(S); let t = 0; for (const s of S){ const p = s.r + (margin || 0) - sdf(s.p); if (p > 0) t += p*p; } return t; };
    // this hand as a solid, for another hand to keep out of: a distance function (negative inside) for the pose it is in now
    api.solid = () => { samples(S); const ps = S.map(s => ({ x: s.p.x, y: s.p.y, z: s.p.z, r: s.r*1.05 })); return p => { let d = 1e9; for (const s of ps){ const e = Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) - s.r; if (e < d) d = e; } return d; }; };
    api.at = (x, y, z, out) => world(new T.Vector3(x, y, z), out);          // a point of the hand (its own space) in the world
    api.tipRadius = n => fingers[n].radii[3]*K;
    // The hand opens, backs out of anything it is inside (the whole hand moves), then each finger closes bone by bone until it
    // is touching or has reached its pose, so it wraps the tool and never goes into it.
    api.settle = (sdf, o) => {
      o = o || {}; const margin = o.margin == null ? 0.02 : o.margin;
      NAMES.forEach(n => { setJoints(n, openPose[n] || OPEN[n]); fingers[n].ts = [0, 0, 0]; });
      for (let it = 0; it < 24; it++){
        const w = worst(sdf, margin);
        if (w.depth <= 0) break;
        const d = grad(sdf, w.at.p); g.position.addScaledVector(d, w.depth + 0.004); g.updateMatrixWorld(true);
      }
      for (let bone = 0; bone < 3; bone++){
        NAMES.forEach(n => {
          const ts = fingers[n].ts;
          const free = t => {
            ts[bone] = t; applyT(n, ts); rig.updateMatrixWorld(true); g.updateMatrixWorld(true); samples(S);
            for (const s of S) if (s.finger === n && s.r + margin > sdf(s.p)) return false;
            return true;
          };
          if (free(1)) return;
          let lo = 0, hi = 1;
          for (let i = 0; i < 12; i++){ const m = (lo + hi)/2; if (free(m)) lo = m; else hi = m; }
          ts[bone] = lo; applyT(n, ts);
        });
      }
      rig.updateMatrixWorld(true); g.updateMatrixWorld(true);
      return api;
    };

    /* ---------- the skin ---------- */
    // every shape as a distance function in hand space, with the box it can reach
    function shapes(){
      rig.updateMatrixWorld(true);
      const list = [], inv = new T.Matrix4();
      NAMES.forEach(n => {
        const c = fingers[n];
        c.joints.forEach((j, i) => {
          const len = c.lens[i], r1 = c.radii[i], r2 = c.radii[i + 1];
          inv.copy(j.matrixWorld).invert();
          const m = inv.elements.slice(), flat = 0.86;
          const a = new T.Vector3().setFromMatrixPosition(j.matrixWorld), b = new T.Vector3().setFromMatrixPosition((c.joints[i + 1] || c.tip).matrixWorld);
          const e = Math.max(r1, r2) + 0.02;
          list.push({ min: [Math.min(a.x, b.x) - e, Math.min(a.y, b.y) - e, Math.min(a.z, b.z) - e], max: [Math.max(a.x, b.x) + e, Math.max(a.y, b.y) + e, Math.max(a.z, b.z) + e],
            d: (x, y, z) => {
              const bx = m[0]*x + m[4]*y + m[8]*z + m[12], by = m[1]*x + m[5]*y + m[9]*z + m[13], bz = (m[2]*x + m[6]*y + m[10]*z + m[14])/flat;
              return coneDist(bx, by, bz, len, r1, r2)*0.93;
            } });
          if (i === 0){   // a knuckle that stands up a little on the back of the hand
            const kr = r1*1.12;
            list.push({ min: [a.x - kr, a.y - kr, a.z - kr - 0.1], max: [a.x + kr, a.y + kr, a.z + kr], d: (x, y, z) => Math.hypot(x - a.x, y - a.y, z - a.z + 0.06) - kr });
          }
        });
        // the fingertip pad, a little fuller than the bone
        const tp = new T.Vector3().setFromMatrixPosition(c.tip.matrixWorld), pr = c.radii[3]*1.02;
        list.push({ min: [tp.x - pr, tp.y - pr, tp.z - pr], max: [tp.x + pr, tp.y + pr, tp.z + pr], d: (x, y, z) => Math.hypot(x - tp.x, y - tp.y, (z - tp.z)/0.88)*0.95 - pr });
      });
      BLOBS.concat(ARM).forEach(b => {
        const [cx, cy, cz] = b.c, [rx, ry, rz] = b.r, mr = Math.min(rx, ry, rz);
        list.push({ min: [cx - rx, cy - ry, cz - rz], max: [cx + rx, cy + ry, cz + rz], d: (x, y, z) => (Math.hypot((x - cx)/rx, (y - cy)/ry, (z - cz)/rz) - 1)*mr });
      });
      return list;
    }
    let skin = null; const nails = [];
    api.rebuild = () => {
      const list = shapes(), h = VOXEL, pad = BLEND*7;
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      list.forEach(s => { for (let a = 0; a < 3; a++){ lo[a] = Math.min(lo[a], s.min[a]); hi[a] = Math.max(hi[a], s.max[a]); } });
      for (let a = 0; a < 3; a++){ lo[a] -= pad; hi[a] += pad; }
      const nx = Math.ceil((hi[0] - lo[0])/h) + 1, ny = Math.ceil((hi[1] - lo[1])/h) + 1, nz = Math.ceil((hi[2] - lo[2])/h) + 1;
      const E = new Float32Array(nx*ny*nz);
      list.forEach(s => {
        const i0 = Math.max(0, Math.floor((s.min[0] - pad - lo[0])/h)), i1 = Math.min(nx - 1, Math.ceil((s.max[0] + pad - lo[0])/h));
        const j0 = Math.max(0, Math.floor((s.min[1] - pad - lo[1])/h)), j1 = Math.min(ny - 1, Math.ceil((s.max[1] + pad - lo[1])/h));
        const k0 = Math.max(0, Math.floor((s.min[2] - pad - lo[2])/h)), k1 = Math.min(nz - 1, Math.ceil((s.max[2] + pad - lo[2])/h));
        for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++){
          let q = i0 + nx*(j + ny*k);
          for (let i = i0; i <= i1; i++, q++){
            const d = s.d(lo[0] + i*h, lo[1] + j*h, lo[2] + k*h);
            if (d < pad) E[q] += Math.exp(-Math.max(d, -BLEND*18)/BLEND);
          }
        }
      });
      const F = new Float32Array(nx*ny*nz);
      for (let q = 0; q < F.length; q++) F[q] = E[q] > 0 ? -BLEND*Math.log(E[q]) : 1;
      const geo = surface(F, nx, ny, nz, h, lo);
      if (!skin){ skin = new T.Mesh(geo, skinMat); skin.userData.noFit = true; skin.raycast = () => {}; body.add(skin); }
      else { skin.geometry.dispose(); skin.geometry = geo; }
      // nails on the back of each fingertip
      nails.forEach(n => { body.remove(n); n.geometry.dispose(); }); nails.length = 0;
      NAMES.forEach(n => {
        const c = fingers[n], j = c.joints[2], len = c.lens[2], r = c.radii[2];
        const nl = new T.Mesh(new T.SphereGeometry(1, 16, 10), nailMat);
        nl.userData.noFit = true; nl.raycast = () => {};
        nl.matrixAutoUpdate = false;
        nl.matrix.copy(j.matrixWorld).multiply(new T.Matrix4().compose(new T.Vector3(0, len*0.5, -r*0.78*0.86), new T.Quaternion(), new T.Vector3(r*0.6, len*0.42, r*0.16)));
        body.add(nl); nails.push(nl);
      });
      return api;
    };
    return api;
  }

  /* ---------- the skin as a mesh (surface nets) ---------- */
  // f < 0 is inside. Returns smooth-shaded triangles, with normals from the field itself.
  function surface(f, nx, ny, nz, h, lo){
    const sx = 1, sy = nx, sz = nx*ny, cx = nx - 1, cy = ny - 1, cz = nz - 1;
    const cell = new Int32Array(cx*cy*cz).fill(-1), pos = [], nor = [];
    const CE = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const off = [0, sx, sy, sx + sy, sz, sx + sz, sy + sz, sx + sy + sz], cc = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const v = new Float32Array(8);
    const gradAt = (q, out) => { out[0] = f[q + 1] - f[q - 1]; out[1] = f[q + sy] - f[q - sy]; out[2] = f[q + sz] - f[q - sz]; };
    const g8 = [0, 0, 0];
    for (let k = 1; k < cz - 1; k++) for (let j = 1; j < cy - 1; j++) for (let i = 1; i < cx - 1; i++){
      const q = i + sy*j + sz*k; let mask = 0;
      for (let c = 0; c < 8; c++){ v[c] = f[q + off[c]]; if (v[c] < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let px = 0, py = 0, pz = 0, n = 0;
      for (let e = 0; e < 12; e++){
        const a = CE[e][0], b = CE[e][1];
        if ((v[a] < 0) === (v[b] < 0)) continue;
        const t = v[a]/(v[a] - v[b]);
        px += cc[a][0] + (cc[b][0] - cc[a][0])*t; py += cc[a][1] + (cc[b][1] - cc[a][1])*t; pz += cc[a][2] + (cc[b][2] - cc[a][2])*t; n++;
      }
      px /= n; py /= n; pz /= n;
      let nxs = 0, nys = 0, nzs = 0;
      for (let c = 0; c < 8; c++){ gradAt(q + off[c], g8); const w = (cc[c][0] ? px : 1 - px)*(cc[c][1] ? py : 1 - py)*(cc[c][2] ? pz : 1 - pz); nxs += g8[0]*w; nys += g8[1]*w; nzs += g8[2]*w; }
      const L = Math.hypot(nxs, nys, nzs) || 1;
      cell[i + cx*(j + cy*k)] = pos.length/3;
      pos.push(lo[0] + (i + px)*h, lo[1] + (j + py)*h, lo[2] + (k + pz)*h); nor.push(nxs/L, nys/L, nzs/L);
    }
    const idx = [];
    const C = (i, j, k) => cell[i + cx*(j + cy*k)];
    const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
    for (let k = 2; k < cz - 1; k++) for (let j = 2; j < cy - 1; j++) for (let i = 2; i < cx - 1; i++){
      const q = i + sy*j + sz*k, in0 = f[q] < 0;
      if (in0 !== (f[q + sx] < 0)) quad(C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k), !in0);
      if (in0 !== (f[q + sy] < 0)) quad(C(i - 1, j, k - 1), C(i, j, k - 1), C(i, j, k), C(i - 1, j, k), in0);
      if (in0 !== (f[q + sz] < 0)) quad(C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k), !in0);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    return geo;
  }
  /* ---------- finding a grip ---------- */
  // A grip is 27 numbers: where the hand is (3) and how it is turned (3) from a base, then the bend of the index, middle, ring and little
  // finger (3 joints each) and the thumb (3 joints, each turned about all three axes).
  const LO = [-8, -8, -8, -3.2, -3.2, -3.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.3, -1.2, -1.2, -0.3, -1.2, -1.2, -0.3, -1.2, -1.2];
  const HI = [8, 8, 8, 3.2, 3.2, 3.2, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.5, 1.2, 0.6, 1.5, 1.2, 0.6, 1.5, 1.2, 0.6];
  const STEP = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3];
  const _e = new T.Euler(), _q = new T.Quaternion();
  // put the hand in the grip `x`, measured from `base` ({ pos, quat })
  function applyVec(hand, base, x){
    hand.group.position.set(base.pos.x + x[0], base.pos.y + x[1], base.pos.z + x[2]);
    _e.set(x[3], x[4], x[5]); _q.setFromEuler(_e); hand.group.quaternion.copy(base.quat).multiply(_q);
    hand.pose({ index: [x[6], x[7], x[8]], middle: [x[9], x[10], x[11]], ring: [x[12], x[13], x[14]], pinky: [x[15], x[16], x[17]],
      thumb: [[x[18], x[19], x[20]], [x[21], x[22], x[23]], [x[24], x[25], x[26]]] });
    return hand;
  }
  // Simulated annealing on a grip: `cost(hand)` says how bad it is (0 is perfect). With `init` it refines a grip it was given; otherwise it
  // starts from `restarts` random ones. Leaves the hand in the best grip, and returns { x, c }.
  function fit(hand, base, cost, o){
    o = o || {};
    const ev = x => { applyVec(hand, base, x); return cost(hand); };
    const run = (init, N, temp) => {
      let x = init.slice(), c = ev(x), best = x.slice(), bc = c;
      for (let k = 0; k < N; k++){
        const f = 1 - k/N, Tm = temp*f*f + 1e-6, s = 0.12 + 0.88*f, y = x.slice(), n = 1 + Math.floor(Math.random()*4);
        for (let j = 0; j < n; j++){ const i = Math.floor(Math.random()*27), g = (Math.random() + Math.random() + Math.random() - 1.5)*2; y[i] = Math.min(HI[i], Math.max(LO[i], y[i] + g*STEP[i]*s)); }
        const cy = ev(y);
        if (cy < c || Math.random() < Math.exp((c - cy)/Tm)){ x = y; c = cy; if (c < bc){ bc = c; best = x.slice(); } }
      }
      return { x: best, c: bc };
    };
    let best;
    if (o.init){ best = { x: o.init.slice(), c: ev(o.init) }; if (best.c > (o.good == null ? 0.4 : o.good)){ const r = run(o.init, o.iters || 1500, o.temp == null ? 0.05 : o.temp); if (r.c < best.c) best = r; } }
    else {
      const res = [];
      for (let r = 0; r < (o.restarts || 10); r++){
        const x = new Array(27).fill(0);
        for (let i = 3; i < 27; i++) x[i] = LO[i] + Math.random()*(HI[i] - LO[i])*(i < 6 ? 1 : 0.6);
        x[0] = x[1] = x[2] = 0; x[3] = (Math.random()*2 - 1)*3.1; x[4] = (Math.random()*2 - 1)*3.1; x[5] = (Math.random()*2 - 1)*3.1;
        res.push(run(x, o.iters || 2500, 0.8));
      }
      res.sort((p, q) => p.c - q.c); best = res[0];
      for (let p = 0; p < 4; p++){ const r = run(best.x, 5000, 0.05); if (r.c < best.c) best = r; }
    }
    applyVec(hand, base, best.x);
    return best;
  }
  return { hand, fit, applyVec };
};
