// The telescopic gauge, shared by the tools that measure it (dial caliper, vernier caliper, micrometer) and by the
// Telescopic gauge tab. One table of sizes and one description of its shape, so every tool draws the same gauge.
//
// It is the plain T-gauge, drawn from a photograph of a real six-gauge set (A to F): a short round hub with a thick tube out of
// each side of it, a thinner spring-loaded rod telescoping out of each tube and ending in a flat-looking crowned head, and a slim
// plain handle going up from the hub. The very end of the handle is knurled, and that knurled end is the lock knob. Lock the rods at
// the size of a bore, take the gauge out, and measure across the two heads with a caliper or micrometer.
//
// All sizes are in millimetres; the functions take a scale `k` to hand back geometry in any unit
// (k = 1/25.4 gives inches, which is what the caliper and micrometer scenes use).
window.__TG = (function(){
  const MM = 25.4;
  // lab: the range as it is marked on the set (inches, fractions); min/max below are the same range in millimetres.
  // min/max: the gauge's range, shortest and longest length across the heads. rr: rod radius.
  // bk: the hub's size, as a share of the rod's (the smaller gauges have proportionally bigger hubs).
  // Everything else about the handle comes from the rod radius: the real gauges are all the same shape at different sizes.
  const GAUGES = [
    { n: 1, name: 'A', lab: '5/16–1/2″', min: 8,    max: 12.7, rr: 1.5, bk: 2.3 },
    { n: 2, name: 'B', lab: '1/2–3/4″', min: 12.7, max: 19,   rr: 1.9, bk: 2.15 },
    { n: 3, name: 'C', lab: '3/4–1-1/4″', min: 19,   max: 32,   rr: 2.4, bk: 1.95 },
    { n: 4, name: 'D', lab: '1-1/4–2-1/8″', min: 32,   max: 54,   rr: 3.1, bk: 1.75 },
    { n: 5, name: 'E', lab: '2-1/8–3-1/2″', min: 54,   max: 90,   rr: 3.8, bk: 1.6 },
    { n: 6, name: 'F', lab: '3-1/2–6″', min: 90,   max: 150,  rr: 4.6, bk: 1.5 }
  ];
  // the handle, in rod radii above the cross-bar's centre line: the whole length, and how much of the end is the knurled lock knob
  const HANDLE = { len: 28, knob: 8 };
  GAUGES.forEach(g => {
    g.R = g.rr*1.5;                  // the head's crown: a flat-looking end with a gentle dome of this radius
    g.hr = g.R;                      // ...which is what touches a bore wall, so it is the radius the physics uses
    g.hd = g.R - Math.sqrt(g.R*g.R - g.rr*g.rr);   // how high the dome stands over the rod's end
    g.rt = g.rr*1.3;                 // tube radius
    g.stub = g.rr;                   // how far a closed gauge's head stands out past the end of its tube
    g.rb = g.rr*1.75;                // the hub, a short barrel the cross-bar runs through: its radius (and half its length), a little wider than the tubes
    g.tubeOut = g.min/2 - g.stub;    // where each tube ends, from the centre
    g.tubeLen = Math.max(0.5, g.tubeOut - g.rb*0.7);
    g.tubeStart = g.tubeOut - g.tubeLen;
    // the handle (measured off a photograph of a real set): one slim tube
    g.rh = g.rr*1.15;
    g.rs = g.rh;                     // ...which is the radius that has to clear the bore's edge
    g.rk = g.rh;                     // the knurled lock knob at the end is the same thickness
    g.kl = g.rr*HANDLE.knob;         // its length
    g.chamf = Math.max(0.2, g.rh*0.09);
    g.hl = g.rr*HANDLE.len;          // to the end of the knob
  });
  const SHORTEST = GAUGES[0].min, LONGEST = GAUGES[GAUGES.length - 1].max;

  // the gauge whose range holds this length (or the nearest, with the most room on both sides)
  // (a tool that has been handed a particular gauge says which one it is, so a length on the edge between two ranges still draws that gauge)
  let forced = -1;
  function pick(mm){
    if (forced >= 0) return forced;
    let best = 0, bm = -1e9;
    GAUGES.forEach((g, i) => { const m = Math.min(mm - g.min, g.max - mm); if (m >= bm){ bm = m; best = i; } });   // (a tie at the edge of two ranges goes to the larger gauge: a gauge closed to its shortest is its own size, not the one below)
    return best;
  }

  // One tube as a turned profile [radius, distance out from where it starts, sharp?]: a fine groove a little way out,
  // a bevelled outer edge and the end face down to the rod. Used on its own (the lab) and built into the whole body.
  function tubeProfile(g){
    const rt = g.rt, rr = g.rr, len = g.tubeLen, c = Math.max(0.1, Math.min(g.rr*0.28, len*0.3));
    const gw = Math.max(0.1, Math.min(g.rr*0.3, len*0.07)), gx = Math.min(len*0.5, 2.4*g.rr);
    const P = [[0, 0, 1], [rt, 0, 1]];
    if (len > 3*gw + c + 0.6) P.push([rt, gx - gw, 1], [rt - gw*0.8, gx - gw*0.4, 1], [rt - gw*0.8, gx + gw*0.4, 1], [rt, gx + gw, 1]);
    P.push([rt, len - c, 1], [rt - c, len, 1], [rr, len, 1]);
    return P;
  }

  // The head: a flat-looking end that is really a very shallow dome of radius R, from the tip (on the axis) out to the rod.
  function crown(g, N){
    const P = [], aMax = Math.asin(g.rr/g.R);
    for (let i = 0; i <= N; i++){ const a = i/N*aMax; P.push([g.R*Math.sin(a), g.R - g.R*Math.cos(a)]); }
    return P;
  }

  // The cross-bar's turned body as a profile [radius, distance from the left head's tip, sharp?]: the left head,
  // its rod, the left tube (running in under the hub), the right tube, its rod and the right head.
  // `Lmm` is the length across the two heads' tips.
  function body(Lmm, k){
    const g = GAUGES[pick(Lmm)], rr = g.rr, L = Math.max(Lmm, g.min), P = [], cp = crown(g, 10);
    cp.forEach(p => P.push([p[0], p[1]]));
    const zt = L/2 - g.tubeOut;      // tip to the left tube's outer end (never less than the head's own height)
    const tp = tubeProfile(g).slice(1), len = g.tubeLen;
    if (zt > g.hd + 1e-6) P.push([rr, zt, 1]);
    for (let i = tp.length - 1; i >= 0; i--) P.push([tp[i][0], zt + (len - tp[i][1]), 1]);
    for (let i = 0; i < tp.length; i++) P.push([tp[i][0], L - zt - len + tp[i][1], 1]);
    if (zt > g.hd + 1e-6) P.push([rr, L - zt, 1]);
    for (let i = cp.length - 1; i >= 0; i--) P.push([cp[i][0], L - cp[i][1]]);
    return { g, prof: P.map(p => [p[0]*k, p[1]*k, p[2]]), len: L*k, hr: g.R*k, stemAt: L/2*k };
  }

  // the hub the handle and cross-bar meet in: its size (and a round profile, bottom to top, for anything that wants one)
  function hub(Lmm, k){ const g = GAUGES[pick(Lmm)]; return { r: g.rb*k, w: g.rb*2*k, h: g.rb*2*k }; }
  function hubProfile(Lmm, k, N){
    const g = GAUGES[pick(Lmm)], P = [], n = N || 28;
    for (let i = 0; i <= n; i++){ const a = Math.PI*(1 - i/n); P.push([g.rb*Math.sin(a)*k, g.rb*Math.cos(a)*k]); }
    return P;
  }

  // The handle, going out from the cross-bar's centre line, as turned pieces: the plain shaft and the knurled lock knob at its end.
  // `squeeze` shortens the shaft (the knob keeps its size). Each piece is {mat, part, prof:[[r, y, sharp?]...], knurl?, rot?, n, r, y0, y1, c} (y up the handle).
  function handle(Lmm, k, squeeze){
    const g = GAUGES[pick(Lmm)], q = squeeze || 1, rr = g.rr, c = g.chamf;
    const cyl = (r, a, b) => [[0, a*k, 1], [r*k, a*k, 1], [r*k, b*k, 1], [0, b*k, 1]];
    const y0 = g.rb*0.8, yk = y0 + (rr*(HANDLE.len - HANDLE.knob) - y0)*q, ye = yk + g.kl, rq = g.rk*0.985;
    const knob = [[0, yk, 1], [g.rk - c, yk, 1], [g.rk, yk + c, 1], [rq, yk + c, 1], [rq, ye - c, 1], [g.rk, ye - c, 1], [g.rk - c*1.4, ye, 1], [0, ye, 1]].map(p => [p[0]*k, p[1]*k, p[2]]);
    return [
      { mat: 'steel', part: 'stem', prof: cyl(g.rh, y0, yk + 0.2) },
      { mat: 'knurl', part: 'knob', knurl: true, rot: true, n: 14, r: g.rk*k, y0: yk*k, y1: ye*k, c: c*k, prof: knob }
    ];
  }

  // the diamond knurl as a bump map: one diamond cell per tile (crossed cuts at 45°), repeated n times round and along the band
  function knurlTex(T){
    if (T.__tgKnurl) return T.__tgKnurl;
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'), im = x.createImageData(N, N), tri = t => { t -= Math.floor(t); return 1 - Math.abs(2*t - 1); };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){
      const u = i/N, v = j/N, h = Math.min(tri(u + v), tri(u - v));            // a pyramid at the cell's centre, grooves along its edges
      const val = Math.round(255*Math.pow(Math.min(1, h*1.35), 0.8)), o = 4*(j*N + i);
      im.data[o] = im.data[o + 1] = im.data[o + 2] = val; im.data[o + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
    return T.__tgKnurl = t;
  }
  // a knurled band: a plain cylinder wearing the diamond relief, n cells round and square cells along (axis y)
  function knurlBand(T, r, len, n, mat){
    const geo = new T.CylinderGeometry(r, r, len, 96, 1, true), pitch = 2*Math.PI*r/n;
    const m = mat.clone(); m.flatShading = false; m.bumpMap = knurlTex(T).clone(); m.bumpMap.needsUpdate = true;
    m.bumpMap.repeat.set(n, Math.max(1, len/pitch)); m.bumpScale = 0.7;
    return new T.Mesh(geo, m);
  }

  // a cylinder with knurling around it, cut into the geometry (axis y); the older way, kept for the lab's own use: straight, or the diamond pattern of crossed 45° cuts
  function knurled(T, r, len, n, dep, diamond){
    const pitch = 2*Math.PI*r/n, hs = diamond ? Math.max(6, Math.round(len/pitch*4)) : 1;
    const g = new T.CylinderGeometry(r, r, len, n*4, hs, true), p = g.attributes.position;
    const tri = x => { const t = ((x/Math.PI) % 2 + 2) % 2; return t < 1 ? t : 2 - t; };   // 0..1..0, a triangle wave
    for (let i = 0; i < p.count; i++){
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      let f;
      if (diamond){ const u = n*a + (y/pitch)*2*Math.PI*(1), v = n*a - (y/pitch)*2*Math.PI*(1); f = 1 - dep*(1 - Math.min(tri(u), tri(v))); }
      else f = Math.sin(a*n + .3) > 0 ? 1 : 1 - dep;
      p.setX(i, x*f); p.setZ(i, z*f);
    }
    g.computeVertexNormals();
    return g;
  }

  // the text stamped down the stem: the gauge's letter and its range
  function stemTex(T, g){
    const c = document.createElement('canvas'); c.width = 96; c.height = 640;
    const x = c.getContext('2d');
    x.translate(48, 320); x.rotate(-Math.PI/2); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '700 62px Inter, Arial, sans-serif'; x.fillStyle = 'rgba(255,255,255,.34)'; x.fillText(g.name + '   ' + g.lab.replace('″', ''), 0, 4);
    x.fillStyle = 'rgba(16,18,22,.92)'; x.fillText(g.name + '   ' + g.lab.replace('″', ''), 0, 0);
    const t = new T.CanvasTexture(c); t.anisotropy = 4;
    if ('sRGBEncoding' in T) t.encoding = T.sRGBEncoding; else if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  // The handle as three.js meshes in a group (the shaft going up +y from the cross-bar's centre line); the knurled knob
  // is its own sub-group, `knob`, that turns about the handle's axis (the lab turns it to lock and unlock).
  //   mats = { steel, knurl, dark? }
  function handleGroup(T, Lmm, k, mats, squeeze, flip){
    const g = GAUGES[pick(Lmm)], grp = new T.Group(), knob = new T.Group();
    const lathe = (prof, seg) => new T.LatheGeometry(prof.map(p => new T.Vector2(Math.max(0, p[0]), p[1])), seg || 48);
    const tag = (m, part) => { m.userData.part = part; return m; };
    const parts = handle(Lmm, k, squeeze);
    parts.forEach(p => {
      const mat = mats[p.mat] || mats.steel, into = p.rot ? knob : grp, part = p.rot ? 'knob' : 'gauge';
      if (p.knurl){
        // the diamond knurl: a band of crossed cuts between the chamfered ends (turned on the lathe, in steel)
        const band = knurlBand(T, p.r, p.y1 - p.y0 - 2*p.c, p.n, mats.knurl || mat); band.position.y = (p.y0 + p.y1)/2;
        into.add(tag(band, part));
        into.add(tag(new T.Mesh(lathe(p.prof, 64), mats.steel), part));
      } else grp.add(tag(new T.Mesh(lathe(p.prof, 40), mat), 'gauge'));
    });
    // the stamping, on the front of the smooth stem
    const stem = parts.find(p => p.part === 'stem'), y0 = stem.prof[0][1], y1 = stem.prof[3][1], len = y1 - y0;
    if (len > 6*k){
      const w = g.rh*1.5*k, h = Math.min(len*0.84, 34*k), d = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: stemTex(T, g), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      d.position.set(0, (y0 + y1)/2, g.rh*k + 0.02*k); if (flip) d.rotation.z = Math.PI; d.userData.part = 'gauge'; grp.add(d);
    }
    grp.add(knob);
    return { group: grp, knob };
  }

  // The hub as a mesh in a group: a short bright barrel with bevelled ends, lying along the cross-bar, that the tubes run through and the handle meets.
  function hubGroup(T, Lmm, k, mats){
    const g = GAUGES[pick(Lmm)], grp = new T.Group(), r = g.rb*k, h = g.rb*k, c = Math.min(r*0.16, 0.6*k*Math.max(1, g.rr));
    const prof = [[0, -h], [r - c, -h], [r, -h + c], [r, h - c], [r - c, h], [0, h]].map(p => new T.Vector2(p[0], p[1]));
    const geo = new T.LatheGeometry(prof, 48); geo.rotateZ(-Math.PI/2);
    const barrel = new T.Mesh(geo, mats.chrome || mats.steel); barrel.userData.part = 'gauge'; grp.add(barrel);
    return grp;
  }

  // For three.js scenes (caliper): the whole gauge as a group, centred on the middle of the gap between the heads,
  // lying along x, the handle going down (-y), up (+y) or toward the viewer (+z).
  //   mats = { steel, knurl, chrome?, dark? } (three.js materials)   o = { k, handle: 'down' | 'front' | 'up', squeeze }
  function group(T, Lmm, mats, o){
    o = o || {};
    const k = o.k || 1/MM, b = body(Lmm, k), grp = new T.Group();
    const lathe = (prof, seg) => new T.LatheGeometry(prof.map(p => new T.Vector2(Math.max(0, p[0]), p[1])), seg || 64);
    const gb = lathe(b.prof, 64); gb.rotateZ(-Math.PI/2); gb.translate(-b.len/2, 0, 0);
    grp.add(new T.Mesh(gb, mats.steel));
    const dir = o.handle || 'down', cross = new T.Group();   // the hub and the handle turn together
    cross.add(hubGroup(T, Lmm, k, mats), handleGroup(T, Lmm, k, mats, o.squeeze || 1, dir === 'down').group);
    if (dir === 'down') cross.rotation.z = Math.PI;
    else if (dir === 'front') cross.rotation.x = Math.PI/2;
    grp.add(cross);
    return { obj: grp, g: b.g, len: b.len, hr: b.hr };
  }

  // The gauge's metal, the same wherever it is drawn (the lab, and the micrometer and calipers it is measured on), so the gauge that flies
  // from one to the other is plainly the same one. Made once per three.js.
  function materials(T){
    if (T.__tgMats) return T.__tgMats;
    // faint turning lines round the tubes and rods, as a very light bump map (kept gentle: a strong one reads as stripes)
    const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d');
    for (let y = 0; y < 256; y++){ const v = (128 + (Math.random() - .5)*18)|0; x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; x.fillRect(0, y, 4, 1); }
    const turned = new T.CanvasTexture(c); turned.wrapS = turned.wrapT = T.RepeatWrapping; turned.repeat.set(1, 4);
    return T.__tgMats = {
      steel:  new T.MeshStandardMaterial({ color: 0xdde3ea, metalness: 1, roughness: .22, bumpMap: turned, bumpScale: .02 }),
      knurl:  new T.MeshStandardMaterial({ color: 0xb4bdc8, metalness: 1, roughness: .36, flatShading: true }),
      dark:   new T.MeshStandardMaterial({ color: 0x1b1e22, metalness: .6, roughness: .5 }),
      chrome: new T.MeshStandardMaterial({ color: 0xf3f5f8, metalness: 1, roughness: .07 })
    };
  }

  return { MM, GAUGES, force: i => { forced = i; }, materials, SHORTEST, LONGEST, pick, tubeProfile, crown, body, hub, hubProfile, handle, knurled, stemTex, handleGroup, hubGroup, group };
})();
