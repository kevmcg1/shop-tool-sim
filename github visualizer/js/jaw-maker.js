/* Custom soft jaw maker.
 *
 * Step 1 is the planes: two cut planes across the part, one per jaw. The part's
 * cross-section is read at each plane and bored into a soft-jaw blank, and
 * both jaws redraw live on the right as a plane is dragged or typed.
 *
 *   part frame : a = the way the jaws close, u = across the jaw, v = up (Z)
 *   jaw frame  : x = u (across), y = v (up), z = thickness, work face at +z
 *   everything is millimetres inside; the panel shows inches with mm beside.
 */
(function () {
  "use strict";

  var IN = 25.4, S = 1000;                       /* Clipper units per mm */
  var THREE_ = window.THREE;
  if (!THREE_) return;

  /* ---------- vise presets (inches). Typical values: check your plates. ---- */
  var VISES = {
    haas: { name: "Haas HV6", W: 6.90, stdH: 1.735, T: 0.75, holeD: 0.433, cbD: 0.689, cbDepth: 0.413, holeSp: 4.00, screw: "M10 SHCS" },
    kurt: { name: "Kurt DX6", W: 6.25, stdH: 1.735, T: 0.75, holeD: 0.406, cbD: 0.625, cbDepth: 0.375, holeSp: 3.50, screw: "3/8-16 SHCS" }
  };

  var st = {
    partId: null, axisY: false, swap: false,
    planeF: 0, planeM: 0,                         /* inches from the part's end */
    vise: "haas", autoH: true, autoCb: true,
    W: 6.90, H: 1.735, T: 0.75,
    depthF: 0.375, depthM: 0.375,
    ledge: 0.25, clear: 0.004, stick: 0.25,
    holeD: 0.433, cbD: 0.689, cbDepth: 0.413, holeSp: 4.00, holeV: 0.9
  };

  var root, canvas, renderer, views = {}, tris = null, dims = null, partMesh = null;
  var built = false, dirty = false, rafId = 0, loopOn = false;
  var out = { F: null, M: null }, unlocked = false, lockedAuto = null;
  var partScene, partCam, partGroup, planeObjs = {};
  var raycaster = new THREE_.Raycaster();
  var libOK = false, libLoading = null;
  var $ = function (s) { return root.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
  var fmt = function (mm) { return (mm / IN).toFixed(3) + " in (" + mm.toFixed(1) + " mm)"; };

  /* ---------- Clipper, loaded the first time the tool opens ---------------- */
  function loadLib() {
    if (window.ClipperLib) return Promise.resolve();
    if (libLoading) return libLoading;
    var urls = ["../vendor/clipper.js", "vendor/clipper.js",
                "https://cdnjs.cloudflare.com/ajax/libs/clipper-lib/6.4.2/clipper.min.js"];
    libLoading = urls.reduce(function (p, u) {
      return p.catch(function () {
        return new Promise(function (res, rej) {
          if (window.ClipperLib) return res();
          var s = document.createElement("script");
          s.src = u; s.onload = function () { window.ClipperLib ? res() : rej(); }; s.onerror = rej;
          document.head.appendChild(s);
        });
      });
    }, Promise.reject()).catch(function () { libLoading = null; throw new Error("clipper"); });
    return libLoading;
  }

  /* ---------- the part ----------------------------------------------------- */
  function demoGeometry() {
    var s = new THREE_.Shape(), p = [[0, 0], [3, 0], [3, 1], [2.25, 1], [2.25, 1.6], [0.75, 1.6], [0.75, 1], [0, 1]];
    p.forEach(function (q, i) { i ? s.lineTo(q[0] * IN, q[1] * IN) : s.moveTo(q[0] * IN, q[1] * IN); });
    var g = new THREE_.ExtrudeBufferGeometry(s, { depth: 2 * IN, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    return { geo: g, scale: 1, base: new THREE_.Vector3() };
  }

  function sources() {
    var list = [], PM = window.PartModels;
    if (PM && PM.all) PM.all().forEach(function (p) {
      var jaw = p.members && p.members.some(function (m) { return m.name === "Jaw" || m.name === "Bar"; });
      if (p.geometry && p.role !== "machine" && !jaw) list.push(p);
    });
    return list;
  }

  /* triangles into the jaw frame: (a, u, v), minimum corner at the origin */
  function prepare() {
    var src = sources().filter(function (p) { return p.id === st.partId; })[0] || sources()[0];
    var geo, k, base, sc;
    if (src) { geo = src.geometry; sc = (src.srcInch ? IN : 1) * (src.scale || 1); base = src.base || new THREE_.Vector3(); st.partId = src.id; }
    else { var d = demoGeometry(); geo = d.geo; sc = 1; base = d.base; st.partId = null; }
    var pos = geo.attributes.position, idx = geo.index, n = idx ? idx.count : pos.count;
    var T = new Float32Array(n * 3);
    k = (st.axisY ? 1 : 0) + (st.swap ? 2 : 0);
    var min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (var i = 0; i < n; i++) {
      var vi = idx ? idx.getX(i) : i;
      var x = (pos.getX(vi) - base.x) * sc, y = (pos.getY(vi) - base.y) * sc, z = (pos.getZ(vi) - base.z) * sc, a, u;
      if (k === 0) { a = x; u = y; } else if (k === 1) { a = y; u = -x; } else if (k === 2) { a = -x; u = -y; } else { a = -y; u = x; }
      T[i * 3] = a; T[i * 3 + 1] = u; T[i * 3 + 2] = z;
      if (a < min[0]) min[0] = a; if (a > max[0]) max[0] = a;
      if (u < min[1]) min[1] = u; if (u > max[1]) max[1] = u;
      if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
    }
    for (var j = 0; j < n; j++) { T[j * 3] -= min[0]; T[j * 3 + 1] -= min[1]; T[j * 3 + 2] -= min[2]; }
    tris = T;
    dims = { L: max[0] - min[0], Wd: max[1] - min[1], Ht: max[2] - min[2] };
    if (!src) geo.dispose();
  }

  /* where the plane cuts the part, as closed loops of [u, v] in mm */
  function sectionLoops(c) {
    var T = tris, n = T.length / 9, segs = [], i, e;
    var P = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], D = [0, 0, 0];
    for (i = 0; i < n; i++) {
      var o = i * 9, hit = [];
      for (e = 0; e < 3; e++) {
        P[e][0] = T[o + e * 3]; P[e][1] = T[o + e * 3 + 1]; P[e][2] = T[o + e * 3 + 2];
        D[e] = P[e][0] - c; if (Math.abs(D[e]) < 1e-9) D[e] = 1e-9;
      }
      if ((D[0] > 0) === (D[1] > 0) && (D[1] > 0) === (D[2] > 0)) continue;
      for (e = 0; e < 3; e++) {
        var f = (e + 1) % 3;
        if ((D[e] > 0) !== (D[f] > 0)) {
          var t = D[e] / (D[e] - D[f]);
          hit.push([P[e][1] + t * (P[f][1] - P[e][1]), P[e][2] + t * (P[f][2] - P[e][2])]);
        }
      }
      if (hit.length === 2) segs.push(hit);
    }
    var key = function (p) { return Math.round(p[0] * 1000) + "," + Math.round(p[1] * 1000); };
    var adj = new Map(), k0 = [], k1 = [];
    segs.forEach(function (s, j) {
      k0[j] = key(s[0]); k1[j] = key(s[1]);
      [k0[j], k1[j]].forEach(function (k) { var l = adj.get(k); if (!l) adj.set(k, l = []); l.push(j); });
    });
    var used = new Uint8Array(segs.length), loops = [];
    for (var s0 = 0; s0 < segs.length; s0++) {
      if (used[s0]) continue;
      used[s0] = 1;
      var pts = [segs[s0][0]], cur = segs[s0][1], startK = k0[s0], curK = k1[s0], guard = 0;
      while (guard++ < 400000) {
        pts.push(cur);
        if (curK === startK) break;
        var l = adj.get(curK), nx = -1;
        for (var q = 0; q < l.length; q++) if (!used[l[q]]) { nx = l[q]; break; }
        if (nx < 0) break;
        used[nx] = 1;
        if (k0[nx] === curK) { cur = segs[nx][1]; curK = k1[nx]; } else { cur = segs[nx][0]; curK = k0[nx]; }
      }
      if (pts.length > 3) loops.push(pts);
    }
    return loops;
  }

  /* ---------- 2D booleans -------------------------------------------------- */
  var CL = function () { return window.ClipperLib; };
  function toPaths(loops, mirror, dv) {
    return loops.map(function (l) {
      return l.map(function (p) { return { X: Math.round((mirror ? -(p[0] - dims.Wd / 2) : p[0] - dims.Wd / 2) * S), Y: Math.round((p[1] + dv) * S) }; });
    });
  }
  function exec(type, subj, clip, tree) {
    var c = new (CL().Clipper)(), sol = tree ? new (CL().PolyTree)() : new (CL().Paths)();
    c.AddPaths(subj, CL().PolyType.ptSubject, true);
    if (clip && clip.length) c.AddPaths(clip, CL().PolyType.ptClip, true);
    var ft = type === CL().ClipType.ctUnion && !clip ? CL().PolyFillType.pftEvenOdd : CL().PolyFillType.pftNonZero;
    c.Execute(type, sol, ft, ft);
    return sol;
  }
  function circle(u, v, r) {
    var a = [], n = 40;
    for (var i = 0; i < n; i++) a.push({ X: Math.round((u + r * Math.cos(i / n * 2 * Math.PI)) * S), Y: Math.round((v + r * Math.sin(i / n * 2 * Math.PI)) * S) });
    return a;
  }
  function area(paths) { return paths.reduce(function (s, p) { return s + Math.abs(CL().Clipper.Area(p)); }, 0); }
  function shapesOf(tree) {
    var shapes = [];
    var pts = function (c) { return c.map(function (p) { return new THREE_.Vector2(p.X / S, p.Y / S); }); };
    (function walk(node) {
      node.Childs().forEach(function (ch) {
        if (ch.IsHole()) return;
        var sh = new THREE_.Shape(pts(ch.Contour()));
        ch.Childs().forEach(function (h) { sh.holes.push(new THREE_.Path(pts(h.Contour()))); walk(h); });
        shapes.push(sh);
      });
    })(tree);
    return shapes;
  }

  /* ---------- one jaw ------------------------------------------------------ */
  function buildJaw(side, loopsMm, H, W, Tk) {
    var mirror = side === "M";
    var pocket = [];
    if (loopsMm.length) {
      pocket = exec(CL().ClipType.ctUnion, toPaths(loopsMm, mirror, st.ledge * IN));
      CL().Clipper.CleanPolygons(pocket, 20);
      if (st.clear > 0 && pocket.length) {
        var co = new (CL().ClipperOffset)(2, 8), res = new (CL().Paths)();
        co.AddPaths(pocket, CL().JoinType.jtRound, CL().EndType.etClosedPolygon);
        co.Execute(res, st.clear * IN * S); pocket = res;
      }
    }
    var rect = [[{ X: -W / 2 * S, Y: 0 }, { X: W / 2 * S, Y: 0 }, { X: W / 2 * S, Y: H * S }, { X: -W / 2 * S, Y: H * S }]];
    var rH = st.holeD * IN / 2, rC = st.cbD * IN / 2, sp = st.holeSp * IN / 2, warn = "";
    var pocketDepth = Math.min(Math.max((side === "F" ? st.depthF : st.depthM) * IN, 0.5), Tk);
    var cbDepth = Math.min(st.cbDepth * IN, Tk - 1);

    /* counterbore row: slide it up and down until it clears the pocket */
    var hv = st.holeV * IN;
    if (st.autoCb) {
      var best = null, margin = 1.5, cand = [], lo = rC + 2.5, hi = H - rC - 2.5;
      for (var v = hi; v >= lo; v -= 1.27) cand.push(v);
      cand.sort(function (a, b) { return Math.abs(a - H / 2) - Math.abs(b - H / 2); });
      for (var ci = 0; ci < cand.length && best === null; ci++) {
        var probe = [circle(-sp, cand[ci], rC + margin), circle(sp, cand[ci], rC + margin)];
        if (!pocket.length || area(exec(CL().ClipType.ctIntersection, probe, pocket)) < 1) best = cand[ci];
      }
      if (best === null) { best = H / 2; warn = "Mounting holes run into the " + (side === "F" ? "fixed" : "moving") + " jaw pocket"; }
      hv = best;
      if (side === "F") st.holeV = best / IN;
    }
    var holes = [circle(-sp, hv, rH), circle(sp, hv, rH)];
    var cbs = [circle(-sp, hv, rC), circle(sp, hv, rC)];
    if (hv - rC < 0 || hv + rC > H) warn = warn || "Counterbore runs off the jaw";

    var cuts = [0, pocketDepth, cbDepth, Tk].sort(function (a, b) { return a - b; });
    var parts = [], total = 0;
    for (var i = 0; i < cuts.length - 1; i++) {
      var t0 = cuts[i], t1 = cuts[i + 1];
      if (t1 - t0 < 1e-3) continue;
      var mid = (t0 + t1) / 2, sub = [];
      if (mid < pocketDepth) sub = sub.concat(pocket);
      if (mid < cbDepth) sub = sub.concat(cbs);
      sub = sub.concat(holes);
      var tree = exec(CL().ClipType.ctDifference, rect, sub, true);
      var shapes = shapesOf(tree);
      if (!shapes.length) continue;
      var g = new THREE_.ExtrudeBufferGeometry(shapes, { depth: t1 - t0, bevelEnabled: false, curveSegments: 1 });
      g.translate(0, 0, Tk - t1);
      parts.push(g); total += g.attributes.position.count;
    }
    var pos = new Float32Array(total * 3), o = 0;
    parts.forEach(function (g) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; g.dispose(); });
    var geo = new THREE_.BufferGeometry();
    geo.setAttribute("position", new THREE_.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return { geo: geo, warn: warn, hole: hv, pocketDepth: pocketDepth };
  }

  /* ---------- scenes ------------------------------------------------------- */
  function lights(sc) {
    sc.add(new THREE_.AmbientLight(0xffffff, 0.55));
    var d = new THREE_.DirectionalLight(0xffffff, 0.8); d.position.set(0.6, 1, 1.2); sc.add(d);
    var d2 = new THREE_.DirectionalLight(0xffffff, 0.3); d2.position.set(-1, -0.4, -0.6); sc.add(d2);
  }
  function makeView(el, sc, upZ, theta, phi) {
    var cam = new THREE_.PerspectiveCamera(35, 1, 1, 20000);
    if (upZ) cam.up.set(0, 0, 1);
    return { el: el, scene: sc, cam: cam, upZ: upZ, theta: theta, phi: phi, dist: 400, target: new THREE_.Vector3(), vt: 0, vp: 0 };
  }
  function place(v) {
    var cp = Math.cos(v.phi), sp = Math.sin(v.phi), o = new THREE_.Vector3();
    if (v.upZ) o.set(cp * Math.cos(v.theta), cp * Math.sin(v.theta), sp);
    else o.set(cp * Math.sin(v.theta), sp, cp * Math.cos(v.theta));
    v.cam.position.copy(v.target).addScaledVector(o, v.dist);
    v.cam.lookAt(v.target);
  }
  function fitDist(radius, cam) { return radius / Math.sin(cam.fov * Math.PI / 360) * 0.95; }

  function setupScenes() {
    partScene = new THREE_.Scene(); partScene.background = new THREE_.Color(0x101010); lights(partScene);
    partGroup = new THREE_.Group(); partScene.add(partGroup);
    views.part = makeView($("#jm-v-part"), partScene, true, -0.95, 0.5);
    partCam = views.part.cam;
    ["F", "M"].forEach(function (k) {
      var sc = new THREE_.Scene(); sc.background = new THREE_.Color(0x131313); lights(sc);
      var g = new THREE_.Group(); sc.add(g);
      var v = makeView($("#jm-v-" + k), sc, false, k === "F" ? 0.55 : -0.55, 0.38);
      v.group = g; views[k] = v;
    });
    ["F", "M"].forEach(function (k) {
      var mat = new THREE_.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, side: THREE_.DoubleSide, depthWrite: false });
      var quad = new THREE_.PlaneGeometry(1, 1); quad.rotateY(Math.PI / 2);
      var mesh = new THREE_.Mesh(quad, mat);
      var edge = new THREE_.LineSegments(new THREE_.EdgesGeometry(quad), new THREE_.LineBasicMaterial({ color: k === "F" ? 0xffffff : 0x9a9a9a }));
      mesh.add(edge); mesh.userData.side = k;
      partScene.add(mesh);
      var secMat = new THREE_.LineBasicMaterial({ color: k === "F" ? 0xffffff : 0xb0b0b0, depthTest: false, transparent: true });
      planeObjs[k] = { mesh: mesh, edge: edge, sec: null, secMat: secMat, flag: $(".jm-flag." + k.toLowerCase()) };
    });
  }

  function rebuildPartMesh() {
    while (partGroup.children.length) { var c = partGroup.children.pop(); c.geometry && c.geometry.dispose(); }
    var g = new THREE_.BufferGeometry();
    /* tris hold (a, u, v); the part scene uses x = a, y = u, z = v directly */
    g.setAttribute("position", new THREE_.BufferAttribute(tris, 3));
    g.computeVertexNormals();
    var m = new THREE_.Mesh(g, new THREE_.MeshPhongMaterial({ color: 0x8c9096, shininess: 25, side: THREE_.DoubleSide, transparent: true, opacity: 0.88 }));
    partGroup.add(m); partMesh = m;
    if (g.attributes.position.count < 150000) partGroup.add(new THREE_.LineSegments(new THREE_.EdgesGeometry(g, 35), new THREE_.LineBasicMaterial({ color: 0x1a1a1a })));
    var v = views.part, R = Math.sqrt(dims.L * dims.L + dims.Wd * dims.Wd + dims.Ht * dims.Ht) / 2;
    v.target.set(dims.L / 2, dims.Wd / 2, dims.Ht / 2);
    v.dist = fitDist(R * 1.15, v.cam);
    var grid = new THREE_.GridHelper(Math.max(dims.L, dims.Wd) * 3, 30, 0x2a2a2a, 0x1c1c1c);
    grid.rotation.x = Math.PI / 2; grid.position.set(dims.L / 2, dims.Wd / 2, -0.2); partGroup.add(grid);
  }

  /* ---------- update (the live part) -------------------------------------- */
  function clampPlanes() {
    var L = dims.L / IN, lo = unlocked ? -L : 0, hi = unlocked ? 2 * L : L;
    st.planeF = Math.min(Math.max(st.planeF, lo), hi);
    st.planeM = Math.min(Math.max(st.planeM, lo), hi);
  }

  function update() {
    dirty = false;
    if (!tris || !libOK) return;
    clampPlanes();
    var cF = st.planeF * IN, cM = st.planeM * IN;
    var lF = sectionLoops(cF), lM = sectionLoops(cM);
    var maxV = 0;
    lF.concat(lM).forEach(function (l) { l.forEach(function (p) { if (p[1] > maxV) maxV = p[1]; }); });

    var vise = VISES[st.vise] || { name: "Custom vise", screw: "custom screw" };
    if (st.autoH) st.H = Math.min(Math.max((st.ledge * IN + maxV - st.stick * IN) / IN, 0.75), 3.0);
    var warns = [];

    ["F", "M"].forEach(function (k) {
      var loops = k === "F" ? lF : lM;
      var r = buildJaw(k, loops, st.H * IN, st.W * IN, st.T * IN);
      if (r.warn) warns.push(r.warn);
      var v = views[k];
      if (out[k]) { v.group.remove(out[k].mesh); v.group.remove(out[k].edges); out[k].mesh.geometry.dispose(); out[k].edges.geometry.dispose(); }
      var mesh = new THREE_.Mesh(r.geo, new THREE_.MeshPhongMaterial({ color: 0xb4b8be, shininess: 30, specular: 0x222222 }));
      var edges = new THREE_.LineSegments(new THREE_.EdgesGeometry(r.geo, 30), new THREE_.LineBasicMaterial({ color: 0x0b0b0b }));
      v.group.add(mesh); v.group.add(edges);
      out[k] = { mesh: mesh, edges: edges, geo: r.geo };
      var c = new THREE_.Vector3(0, st.H * IN / 2, st.T * IN / 2);
      if (!v.fitted || Math.abs((v.fitKey || 0) - (st.W + st.H)) > 1.5) {
        v.rad = Math.sqrt(Math.pow(st.W * IN, 2) + Math.pow(st.H * IN, 2)) / 2 * 1.05; v.dist = fitDist(v.rad, v.cam); v.fitted = true; v.autoFit = true; v.fitKey = st.W + st.H;
      }
      v.target.copy(c);
      $("#jm-dim-" + k).textContent = (k === "F" ? "Fixed" : "Moving") + " jaw  " + (st.W).toFixed(3) + " × " + st.H.toFixed(3) + " × " + st.T.toFixed(3) + " in  (" +
        (st.W * IN).toFixed(1) + " × " + (st.H * IN).toFixed(1) + " × " + (st.T * IN).toFixed(1) + " mm)  ·  pocket " + (r.pocketDepth / IN).toFixed(3) + " in deep";
      if (!loops.length) warns.push("The " + (k === "F" ? "fixed" : "moving") + " plane misses the part");
    });

    /* planes and their section outlines in the part view */
    var span = Math.max(dims.Wd, dims.Ht) * 0.65 + 8;
    ["F", "M"].forEach(function (k) {
      var o = planeObjs[k], c = (k === "F" ? cF : cM), loops = k === "F" ? lF : lM;
      o.mesh.position.set(c, dims.Wd / 2, dims.Ht / 2);
      o.mesh.scale.set(1, span * 2, span * 2);
      if (o.sec) { partScene.remove(o.sec); o.sec.traverse(function (n) { n.geometry && n.geometry.dispose(); }); }
      var grp = new THREE_.Group();
      loops.forEach(function (l) {
        var arr = new Float32Array(l.length * 3);
        l.forEach(function (p, i) { arr[i * 3] = c; arr[i * 3 + 1] = p[0]; arr[i * 3 + 2] = p[1]; });
        var g = new THREE_.BufferGeometry(); g.setAttribute("position", new THREE_.BufferAttribute(arr, 3));
        var ln = new THREE_.Line(g, o.secMat); ln.renderOrder = 5; grp.add(ln);
      });
      partScene.add(grp); o.sec = grp;
    });

    var s = $("#jm-status");
    s.className = "jm-status" + (warns.length ? " warn" : "");
    s.innerHTML = warns.length ? '<i class="fa-solid fa-triangle-exclamation"></i>' + warns.join(" · ")
      : '<i class="fa-solid fa-check"></i>' + vise.name + " · " + vise.screw + " counterbores placed at " + (st.holeV).toFixed(3) + " in (" + (st.holeV * IN).toFixed(1) + " mm) up";
    syncFields();
    requestDraw();
  }
  function schedule() { if (dirty) return; dirty = true; requestAnimationFrame(update); }

  /* ---------- panel -------------------------------------------------------- */
  var NUM = {};
  function numRow(key, label, step, min, max, slider) {
    NUM[key] = { step: step, min: min, max: max };
    return '<div class="jm-row"><label>' + label + '<span class="jm-mm" data-mm="' + key + '"></span></label>' +
      (slider ? '<div class="jm-pair"><input type="range" data-r="' + key + '" step="' + step + '" min="' + min + '" max="' + max + '">' : '<div>') +
      (slider ? "" : "") + '<input type="number" data-k="' + key + '" step="' + step + '" min="' + min + '" max="' + max + '" ' + (slider ? "" : 'style="grid-column:1/-1"') + '></div></div>';
  }
  function chk(id, label, on) {
    return '<label class="jm-check"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + '><span class="box"></span>' + label + "</label>";
  }

  function buildDom() {
    root = document.createElement("div"); root.id = "jm-root";
    root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Custom soft jaw maker");
    root.innerHTML =
      '<canvas id="jm-canvas"></canvas>' +
      '<div class="jm-head"><div class="jm-title"><i class="fa-solid fa-vector-square"></i>Custom soft jaw maker<span class="jm-sub">read the part at two planes, cut both jaws</span></div>' +
      '<button class="jm-btn icon" id="jm-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div class="jm-body">' +
        '<div class="jm-panel">' +
          '<div class="jm-step"><div class="jm-step-h"><span class="jm-n">1</span>Set the planes<em>where each jaw reads</em></div>' +
            '<div class="jm-row"><label>Part</label><select id="jm-part"></select></div>' +
            '<div class="jm-seg"><button class="jm-btn" data-axis="x" aria-pressed="true"><i class="fa-solid fa-arrows-left-right"></i>Jaws on X</button>' +
            '<button class="jm-btn" data-axis="y" aria-pressed="false"><i class="fa-solid fa-arrows-up-down"></i>Jaws on Y</button></div>' +
            numRow("planeF", "Fixed jaw plane", 0.005, 0, 10, true) +
            numRow("planeM", "Moving jaw plane", 0.005, 0, 10, true) +
            '<div class="jm-seg"><button class="jm-btn" id="jm-snap"><i class="fa-solid fa-ruler-horizontal"></i>Snap to part ends</button>' +
            '<button class="jm-btn" id="jm-swap"><i class="fa-solid fa-right-left"></i>Swap jaws</button></div>' +
            '<p class="jm-hint">Drag either plane in the part view, or type a position. The jaws on the right update as you move.</p></div>' +
          '<div class="jm-step"><div class="jm-step-h"><span class="jm-n">2</span>Vise<em>auto height and counterbore</em></div>' +
            '<div class="jm-seg"><button class="jm-btn" data-vise="haas" aria-pressed="true">Haas HV6</button>' +
            '<button class="jm-btn" data-vise="kurt" aria-pressed="false">Kurt DX6</button>' +
            '<button class="jm-btn" data-vise="custom" aria-pressed="false">Custom</button></div>' +
            chk("jm-autoh", "Auto height to suit the part", true) +
            chk("jm-autocb", "Auto counterbore (clears the pocket)", true) +
            '<div class="jm-grid2">' + numRow("W", "Width", 0.01, 1, 12) + numRow("H", "Height", 0.01, 0.5, 4) + numRow("T", "Thickness", 0.01, 0.25, 3) + numRow("stick", "Part sticks out", 0.01, 0, 2) + '</div>' +
            '<p class="jm-hint">Preset sizes are typical values. Check them against your own jaw plates and screws.</p></div>' +
          '<div class="jm-step"><div class="jm-step-h"><span class="jm-n">3</span>Pockets<em>depth, clearance, mounting</em></div>' +
            '<div class="jm-grid2">' + numRow("depthF", "Fixed depth", 0.005, 0.02, 3) + numRow("depthM", "Moving depth", 0.005, 0.02, 3) +
            numRow("ledge", "Part sits up", 0.01, 0, 2) + numRow("clear", "Clearance", 0.001, 0, 0.05) + '</div>' +
            '<div style="height:12px"></div>' +
            '<div class="jm-grid2">' + numRow("holeD", "Screw hole Ø", 0.001, 0.1, 1) + numRow("cbD", "Counterbore Ø", 0.001, 0.2, 1.5) + numRow("cbDepth", "Counterbore depth", 0.001, 0.1, 2) + numRow("holeSp", "Hole spacing", 0.01, 0.5, 8) + '</div>' +
            '<div style="height:12px"></div><div class="jm-status" id="jm-status"></div></div>' +
          '<div class="jm-step"><div class="jm-step-h"><span class="jm-n">4</span>Export</div><div class="jm-stack">' +
            '<button class="jm-btn wide" id="jm-stl-f"><i class="fa-solid fa-download"></i>Fixed jaw STL</button>' +
            '<button class="jm-btn wide" id="jm-stl-m"><i class="fa-solid fa-download"></i>Moving jaw STL</button></div></div>' +
        '</div>' +
        '<div class="jm-view jm-main" id="jm-v-part"><div class="jm-tag"><i class="fa-solid fa-cube"></i>Part · set the planes</div>' +
          '<div class="jm-dim" id="jm-dim-P"></div><div class="jm-flag f">F</div><div class="jm-flag m">M</div></div>' +
        '<div class="jm-split">' +
          '<div class="jm-view" id="jm-v-F"><div class="jm-tag"><i class="fa-solid fa-square"></i>Fixed jaw</div><div class="jm-live">Live</div><div class="jm-dim" id="jm-dim-F"></div></div>' +
          '<div class="jm-view" id="jm-v-M"><div class="jm-tag"><i class="fa-regular fa-square"></i>Moving jaw</div><div class="jm-live">Live</div><div class="jm-dim" id="jm-dim-M"></div></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    canvas = $("#jm-canvas");
    renderer = new THREE_.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    setupScenes();
    bindPanel();
    bindViews();
    if (window.ResizeObserver) new ResizeObserver(requestDraw).observe(root);
    window.addEventListener("resize", requestDraw);
    $(".jm-body").addEventListener("scroll", requestDraw, { passive: true });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && root.classList.contains("show")) close(); });
    built = true;
  }

  function fillParts() {
    var sel = $("#jm-part"), list = sources();
    sel.innerHTML = list.length ? list.map(function (p) { return '<option value="' + p.id + '">' + p.name + "</option>"; }).join("")
      : '<option value="">Demo part (no part loaded)</option>';
    if (list.length) {
      if (!list.some(function (p) { return p.id === st.partId; })) st.partId = list[0].id;
      sel.value = String(st.partId);
    }
  }

  function syncFields() {
    var L = dims ? dims.L / IN : 10;
    $$("[data-r]").forEach(function (r) { r.max = L.toFixed(3); r.value = st[r.dataset.r]; });
    $$("[data-k]").forEach(function (i) {
      var k = i.dataset.k;
      if (document.activeElement !== i) i.value = (+st[k]).toFixed(k === "clear" || k.indexOf("hole") === 0 || k === "cbD" || k === "cbDepth" ? 3 : 3);
      if (k.indexOf("plane") === 0) i.max = L.toFixed(3);
    });
    $$("[data-mm]").forEach(function (s) { s.textContent = "(" + (st[s.dataset.mm] * IN).toFixed(2) + " mm)"; });
    $('[data-k="H"]').disabled = st.autoH && !unlocked;
    $('[data-k="stick"]').disabled = !st.autoH && !unlocked;
    $$("[data-k]").forEach(function (i) {
      var n = NUM[i.dataset.k];
      if (unlocked) { i.removeAttribute("min"); i.removeAttribute("max"); }
      else if (n && i.dataset.k.indexOf("plane") !== 0) { i.min = n.min; i.max = n.max; }
    });
    $$("[data-r]").forEach(function (r) { r.min = unlocked ? (-L).toFixed(3) : 0; r.max = (unlocked ? 2 * L : L).toFixed(3); });
  }

  function applyVise(k) {
    st.vise = k;
    $$("[data-vise]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.vise === k ? "true" : "false"); });
    var v = VISES[k];
    if (v) {
      st.W = v.W; st.T = v.T; st.H = v.stdH; st.holeD = v.holeD; st.cbD = v.cbD; st.cbDepth = v.cbDepth; st.holeSp = v.holeSp;
      st.autoH = true; st.autoCb = true;
      $("#jm-autoh").checked = true; $("#jm-autocb").checked = true;
      Object.keys(views).forEach(function (n) { views[n].fitted = false; });
    }
  }

  function bindPanel() {
    $("#jm-close").onclick = close;
    $$("[data-k]").forEach(function (i) {
      i.addEventListener("input", function () {
        var v = parseFloat(i.value); if (isNaN(v)) return;
        st[i.dataset.k] = v;
        if (["W", "T", "holeD", "cbD", "cbDepth", "holeSp"].indexOf(i.dataset.k) >= 0) { st.vise = "custom"; applyViseButtons(); }
        schedule();
      });
    });
    $$("[data-r]").forEach(function (r) { r.addEventListener("input", function () { st[r.dataset.r] = parseFloat(r.value); schedule(); }); });
    $$("[data-vise]").forEach(function (b) { b.onclick = function () { applyVise(b.dataset.vise); schedule(); }; });
    $("#jm-autoh").onchange = function (e) { st.autoH = e.target.checked; schedule(); };
    $("#jm-autocb").onchange = function (e) { st.autoCb = e.target.checked; schedule(); };
    $$("[data-axis]").forEach(function (b) {
      b.onclick = function () { st.axisY = b.dataset.axis === "y"; reload(true); };
    });
    $("#jm-swap").onclick = function () { st.swap = !st.swap; reload(true); };
    $("#jm-snap").onclick = function () { snapPlanes(); schedule(); };
    $("#jm-part").onchange = function (e) { st.partId = +e.target.value || null; reload(true); };
    $("#jm-stl-f").onclick = function () { exportStl("F"); };
    $("#jm-stl-m").onclick = function () { exportStl("M"); };
  }
  function applyViseButtons() {
    $$("[data-vise]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.vise === st.vise ? "true" : "false"); });
  }

  /* A plane lying exactly on an end face slices nothing, so sit just inside it. */
  function snapPlanes() {
    var L = dims.L / IN, e = Math.min(0.02, L / 4);
    st.planeF = e; st.planeM = L - e;
  }

  function reload(snap) {
    prepare();
    $$("[data-axis]").forEach(function (b) { b.setAttribute("aria-pressed", (b.dataset.axis === "y") === st.axisY ? "true" : "false"); });
    rebuildPartMesh();
    if (snap) snapPlanes();
    $("#jm-dim-P").textContent = "Part  " + fmt(dims.L) + " along the jaws  ×  " + fmt(dims.Wd) + " across  ×  " + fmt(dims.Ht) + " tall";
    schedule();
  }

  /* ---------- STL ---------------------------------------------------------- */
  function exportStl(k) {
    if (!out[k]) return;
    var p = out[k].geo.attributes.position.array, n = p.length / 9, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
    for (var i = 0; i < n; i++) {
      var o = 84 + i * 50, a = [p[i * 9], p[i * 9 + 1], p[i * 9 + 2]], b = [p[i * 9 + 3], p[i * 9 + 4], p[i * 9 + 5]], c = [p[i * 9 + 6], p[i * 9 + 7], p[i * 9 + 8]];
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
      for (var j = 0; j < 9; j++) dv.setFloat32(o + 12 + j * 4, [a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]][j], true);
    }
    dv.setUint32(80, n, true);
    var url = URL.createObjectURL(new Blob([buf], { type: "model/stl" })), el = document.createElement("a");
    el.href = url; el.download = "soft-jaw-" + (k === "F" ? "fixed" : "moving") + ".stl";
    document.body.appendChild(el); el.click(); el.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* ---------- pointer handling -------------------------------------------- */
  function bindViews() {
    ["part", "F", "M"].forEach(function (name) {
      var v = views[name], pts = new Map(), pinch = 0, drag = null;
      var ndc = function (e) { var r = v.el.getBoundingClientRect(); return new THREE_.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
      var hitPlane = function (e) {
        raycaster.setFromCamera(ndc(e), v.cam);
        var h = raycaster.intersectObjects([planeObjs.F.mesh, planeObjs.M.mesh], false);
        return h.length ? h[0].object.userData.side : null;
      };
      v.el.addEventListener("pointerdown", function (e) {
        v.el.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); v.down = true;
        v.vt = v.vp = 0;
        if (pts.size === 2) { var a = Array.from(pts.values()); pinch = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); drag = null; return; }
        if (name === "part") { var s = hitPlane(e); if (s) drag = s; }
      });
      v.el.addEventListener("pointermove", function (e) {
        var prev = pts.get(e.pointerId);
        if (!prev) { if (name === "part") v.el.classList.toggle("plane-hover", !!hitPlane(e)); return; }
        var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) {
          var a = Array.from(pts.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
          v.autoFit = false; if (pinch) v.dist = Math.min(Math.max(v.dist * pinch / d, 30), 20000); pinch = d; requestDraw(); return;
        }
        if (drag) {
          raycaster.setFromCamera(ndc(e), v.cam);
          var r = raycaster.ray, p0 = new THREE_.Vector3(0, dims.Wd / 2, dims.Ht / 2);
          var b = r.direction.x, w0 = p0.clone().sub(r.origin), dd = w0.x, ee = r.direction.dot(w0), den = 1 - b * b;
          if (den > 1e-4) {
            var t = (b * ee - 1 * dd) / den;
            st[drag === "F" ? "planeF" : "planeM"] = Math.min(Math.max(t / IN, 0), dims.L / IN);
            schedule();
          }
          return;
        }
        v.vt = -dx * 0.0068; v.vp = dy * 0.0068;
        v.theta += v.vt; v.phi = Math.min(Math.max(v.phi + v.vp, -1.5), 1.5);
        requestDraw();
      });
      var up = function (e) { pts.delete(e.pointerId); v.down = pts.size > 0; if (pts.size < 2) pinch = 0; if (!pts.size) drag = null; if (Math.abs(v.vt) + Math.abs(v.vp) > 0.002) requestDraw(); else v.vt = v.vp = 0; };
      v.el.addEventListener("pointerup", up); v.el.addEventListener("pointercancel", up);
      v.el.addEventListener("wheel", function (e) {
        e.preventDefault(); v.autoFit = false;
        v.dist = Math.min(Math.max(v.dist * Math.exp(e.deltaY * 0.0012), 30), 20000); requestDraw();
      }, { passive: false });
    });
  }

  /* ---------- drawing ------------------------------------------------------ */
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(draw); }
  function draw() {
    rafId = 0;
    if (!root.classList.contains("show")) return;
    var w = root.clientWidth, h = root.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    renderer.setScissorTest(false); renderer.setClearColor(0x0b0b0b, 1); renderer.clear();
    renderer.setScissorTest(true);
    var cr = canvas.getBoundingClientRect(), moving = false;
    ["part", "F", "M"].forEach(function (n) {
      var v = views[n], r = v.el.getBoundingClientRect();
      if (Math.abs(v.vt) + Math.abs(v.vp) > 0.0008 && !pointerDown(v)) {
        v.theta += v.vt; v.phi = Math.min(Math.max(v.phi + v.vp, -1.5), 1.5); v.vt *= 0.92; v.vp *= 0.92; moving = true;
      }
      var x = r.left - cr.left, y = cr.bottom - r.bottom;
      if (r.width < 2 || r.height < 2) return;
      renderer.setViewport(x, y, r.width, r.height); renderer.setScissor(x, y, r.width, r.height);
      v.cam.aspect = r.width / r.height; v.cam.updateProjectionMatrix();
      if (v.autoFit && v.rad) v.dist = fitDist(v.rad, v.cam) / Math.min(1, v.cam.aspect);
      place(v);
      renderer.render(v.scene, v.cam);
    });
    flags();
    if (moving) requestDraw();
  }
  function pointerDown(v) { return !!v.down; }

  function flags() {
    var v = views.part, r = v.el.getBoundingClientRect(), vec = new THREE_.Vector3();
    ["F", "M"].forEach(function (k) {
      var f = planeObjs[k].flag, m = planeObjs[k].mesh;
      vec.set(m.position.x, m.position.y - m.scale.y / 2, m.position.z + m.scale.z / 2).project(v.cam);
      if (vec.z > 1) { f.style.opacity = 0; return; }
      f.style.left = ((vec.x + 1) / 2 * r.width) + "px"; f.style.top = ((1 - vec.y) / 2 * r.height) + "px"; f.style.opacity = 1;
    });
  }

  /* ---------- open / close ------------------------------------------------- */
  function setUnlocked(v) {
    v = !!v;
    if (v === unlocked) return;
    unlocked = v;
    if (!built) return;
    if (unlocked) {
      lockedAuto = { h: st.autoH, cb: st.autoCb };
      st.autoH = false; st.autoCb = false;
    } else if (lockedAuto) {
      st.autoH = lockedAuto.h; st.autoCb = lockedAuto.cb; lockedAuto = null;
    }
    $("#jm-autoh").checked = st.autoH; $("#jm-autocb").checked = st.autoCb;
    schedule();
  }

  function open() {
    if (!built) { buildDom(); if (unlocked) { unlocked = false; setUnlocked(true); } }
    root.classList.add("show");
    document.body.style.overflow = "hidden";
    fillParts();
    var msg = root.querySelector(".jm-msg"); if (msg) msg.remove();
    loadLib().then(function () {
      libOK = true;
      if (!tris) applyVise(st.vise);
      reload(true);
      requestDraw();
    }).catch(function () {
      var m = document.createElement("div"); m.className = "jm-msg"; m.textContent = "The geometry library (Clipper) could not be loaded. Check the connection and reopen.";
      $(".jm-main").appendChild(m);
    });
    requestDraw();
  }
  function close() { if (root) { root.classList.remove("show"); document.body.style.overflow = ""; } }

  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("#jm-open")) { e.preventDefault(); open(); }
  });
  window.JawMaker = { open: open, close: close, setUnlocked: setUnlocked, state: st, _debug: function () { return { dims: dims, out: out, views: views, planeObjs: planeObjs }; } };
})();
