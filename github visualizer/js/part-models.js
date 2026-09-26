(function () {
"use strict";

const $ = s => document.querySelector(s);
const MM_PER_IN = 25.4;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const isInch  = () => (typeof unitMode !== "undefined" && unitMode === "inch");
const sceneU  = () => isInch() ? 1 / MM_PER_IN : 1;
const uLabel  = () => isInch() ? "in" : "mm";
const toDisp  = mm => mm * sceneU();
const fromDisp = v => v / sceneU();

function toast(msg) { if (typeof showToast === "function") showToast(msg); }

const Geo = (() => {

  function bake(geo, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    g.deleteAttribute("uv");
    g.deleteAttribute("color");
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  }

  function merge(list) {
    const parts = list.filter(g => g && g.attributes && g.attributes.position);
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    let n = 0;
    parts.forEach(g => n += g.attributes.position.count);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let o = 0;
    parts.forEach(g => {
      pos.set(g.attributes.position.array, o);
      nor.set(g.attributes.normal.array, o);
      o += g.attributes.position.count * 3;
      g.dispose();
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal",   new THREE.BufferAttribute(nor, 3));
    return out;
  }

  function seat(geo) {
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    geo.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -b.min.z);
    geo.computeBoundingBox();
    return geo;
  }

  const triCount = geo => geo.attributes.position.count / 3;

  function vertex(geo, i, out) {
    const a = geo.attributes.position.array;
    return (out || new THREE.Vector3()).set(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
  }

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
  const _ab = new THREE.Vector3(), _ac = new THREE.Vector3();

  function triNormal(geo, t, out) {
    vertex(geo, t * 3, _a); vertex(geo, t * 3 + 1, _b); vertex(geo, t * 3 + 2, _c);
    _ab.subVectors(_b, _a); _ac.subVectors(_c, _a);
    return (out || new THREE.Vector3()).crossVectors(_ab, _ac).normalize();
  }

  const KEY = 1e4;
  function adjacency(geo) {
    if (geo.userData._adj) return geo.userData._adj;
    const tris = triCount(geo);
    const edges = new Map();
    const v = new THREE.Vector3();
    const key = i => {
      vertex(geo, i, v);
      return Math.round(v.x * KEY) + "," + Math.round(v.y * KEY) + "," + Math.round(v.z * KEY);
    };
    for (let t = 0; t < tris; t++) {
      const k = [key(t * 3), key(t * 3 + 1), key(t * 3 + 2)];
      for (let e = 0; e < 3; e++) {
        const p = k[e], q = k[(e + 1) % 3];
        const id = p < q ? p + "|" + q : q + "|" + p;
        const list = edges.get(id);
        if (list) list.push(t); else edges.set(id, [t]);
      }
    }

    const nbr = new Array(tris);
    for (let t = 0; t < tris; t++) nbr[t] = [];
    edges.forEach(list => {
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          nbr[list[i]].push(list[j]); nbr[list[j]].push(list[i]);
        }
    });
    geo.userData._adj = nbr;
    return nbr;
  }

  const FACE_LIMIT = 400000;
  function planarFace(geo, tri, tolDeg) {
    const tris = triCount(geo);
    if (tris > FACE_LIMIT) return [tri];
    const nbr = adjacency(geo);
    const n0 = triNormal(geo, tri).clone();
    const p0 = vertex(geo, tri * 3).clone();
    const d0 = n0.dot(p0);
    const cosTol = Math.cos((tolDeg || 1.5) * Math.PI / 180);

    if (geo.userData._flat == null) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      geo.userData._flat =
        Math.max(geo.boundingBox.getSize(new THREE.Vector3()).length() * 2e-4, 1e-3);
    }
    const flat = geo.userData._flat;

    const seen = new Set([tri]);
    const stack = [tri], out = [tri];
    const n = new THREE.Vector3(), p = new THREE.Vector3();
    while (stack.length && out.length < 60000) {
      const t = stack.pop();

      const list = nbr[t];
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const t2 = list[i];
        if (seen.has(t2)) continue;
        triNormal(geo, t2, n);
        if (n.dot(n0) < cosTol) continue;
        vertex(geo, t2 * 3, p);
        if (Math.abs(n0.dot(p) - d0) > flat) continue;
        seen.add(t2); stack.push(t2); out.push(t2);
      }
    }
    return out;
  }

  function areaCentroid(geo, tris) {
    const c = new THREE.Vector3(), mid = new THREE.Vector3();
    let total = 0;
    for (const t of tris) {
      vertex(geo, t * 3, _a); vertex(geo, t * 3 + 1, _b); vertex(geo, t * 3 + 2, _c);
      _ab.subVectors(_b, _a); _ac.subVectors(_c, _a);
      const area = _ab.cross(_ac).length() / 2;
      if (!(area > 0)) continue;
      mid.copy(_a).add(_b).add(_c).multiplyScalar(1 / 3);
      c.addScaledVector(mid, area);
      total += area;
    }
    return total > 0 ? c.multiplyScalar(1 / total) : c.copy(_a);
  }

  return { bake, merge, seat, triCount, vertex, triNormal, adjacency, planarFace, areaCentroid };
})();

const Loaders = (() => {

  function stl(buf) {
    const dv = new DataView(buf);
    const n  = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
    if (buf.byteLength === 84 + n * 50) return stlBinary(dv, n);
    const txt = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, 2000)));
    if (/^\s*solid/i.test(txt) && /facet/i.test(txt))
      return stlAscii(new TextDecoder().decode(buf));
    if (n > 0 && buf.byteLength >= 84 + n * 50) return stlBinary(dv, n);
    throw new Error("that STL is neither binary nor ASCII");
  }

  function stlBinary(dv, n) {
    const pos = new Float32Array(n * 9), nor = new Float32Array(n * 9);
    let o = 84;
    for (let i = 0; i < n; i++) {
      const nx = dv.getFloat32(o, true), ny = dv.getFloat32(o + 4, true), nz = dv.getFloat32(o + 8, true);
      o += 12;
      for (let v = 0; v < 3; v++) {
        const k = i * 9 + v * 3;
        pos[k]     = dv.getFloat32(o, true);
        pos[k + 1] = dv.getFloat32(o + 4, true);
        pos[k + 2] = dv.getFloat32(o + 8, true);
        nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
        o += 12;
      }
      o += 2;
    }
    return fromArrays(pos, nor);
  }

  function stlAscii(txt) {
    const pos = [], nor = [];
    const re = /facet\s+normal\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)([\s\S]*?)endfacet/g;
    const vre = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
    let m;
    while ((m = re.exec(txt))) {
      const nx = +m[1], ny = +m[2], nz = +m[3];
      let v, count = 0;
      vre.lastIndex = 0;
      while ((v = vre.exec(m[4])) && count < 3) {
        pos.push(+v[1], +v[2], +v[3]); nor.push(nx, ny, nz); count++;
      }
    }
    if (!pos.length) throw new Error("no facets found in that STL");
    return fromArrays(new Float32Array(pos), new Float32Array(nor));
  }

  function obj(txt) {
    const V = [], pos = [];
    const lines = txt.split(/\r?\n/);
    for (const line of lines) {
      if (line[0] === "v" && line[1] === " ") {
        const p = line.split(/\s+/);
        V.push([+p[1], +p[2], +p[3]]);
      } else if (line[0] === "f" && line[1] === " ") {
        const idx = line.trim().split(/\s+/).slice(1).map(tok => {
          let i = parseInt(tok.split("/")[0], 10);
          if (i < 0) i = V.length + i; else i -= 1;
          return i;
        });
        for (let i = 1; i + 1 < idx.length; i++) {
          for (const j of [idx[0], idx[i], idx[i + 1]]) {
            const v = V[j];
            if (!v) continue;
            pos.push(v[0], v[1], v[2]);
          }
        }
      }
    }
    if (!pos.length) throw new Error("no faces found in that OBJ");
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  function fromArrays(pos, nor) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal",   new THREE.BufferAttribute(nor, 3));
    return g;
  }

  const OCCT_URLS = [
    "https://cdn.jsdelivr.net/npm/occt-import-js/dist/",
    "https://unpkg.com/occt-import-js/dist/",
    "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/",
  ];
  let occtPromise = null;

  function loadScript(url) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = url; s.async = true;
      s.onload  = () => res();
      s.onerror = () => rej(new Error("blocked: " + url));
      document.head.appendChild(s);
    });
  }

  function occt() {
    if (occtPromise) return occtPromise;
    occtPromise = (async () => {
      let lastErr = null;
      for (const base of OCCT_URLS) {
        try {
          if (typeof occtimportjs === "undefined") await loadScript(base + "occt-import-js.js");
          if (typeof occtimportjs === "undefined") continue;
          return await occtimportjs({ locateFile: f => base + f });
        } catch (e) { lastErr = e; }
      }
      throw new Error("the STEP reader could not be downloaded" +
        (lastErr ? " (" + lastErr.message + ")" : "") +
        " — no connection, or a CDN is blocked here. Export STL from your CAD instead.");
    })();
    return occtPromise;
  }

  async function step(buf, name) {
    const lib = await occt();
    const bytes = new Uint8Array(buf);
    const r = /\.ig[es]s?$/i.test(name) ? lib.ReadIgesFile(bytes, null)
            : /\.brep$/i.test(name)     ? lib.ReadBrepFile(bytes, null)
            :                             lib.ReadStepFile(bytes, null);
    if (!r || !r.success) throw new Error("OpenCascade could not read that file");
    const meshes = r.meshes || [];
    if (!meshes.length) throw new Error("that file holds no solid bodies");
    const list = meshes.map(m => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
      if (m.attributes.normal)
        g.setAttribute("normal", new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
      if (m.index) g.setIndex(new THREE.BufferAttribute(new Uint32Array(m.index.array), 1));
      return Geo.bake(g);
    });
    return Geo.merge(list);
  }

  async function read(file) {
    const name = file.name || "model";
    const buf  = await file.arrayBuffer();
    if (/\.stl$/i.test(name)) return Geo.bake(stl(buf));
    if (/\.obj$/i.test(name)) return Geo.bake(obj(new TextDecoder().decode(buf)));
    return step(buf, name);
  }

  const ACCEPTS = /\.(step|stp|stl|obj|iges|igs|brep)$/i;

  return { read, ACCEPTS };
})();

const Samples = (() => {
  const IN = 25.4;
  const TAU = Math.PI * 2;
  const M = (x, y, z) => new THREE.Matrix4().makeTranslation(x || 0, y || 0, z || 0);

  function rect(w, h, cx, cy) {
    cx = cx || 0; cy = cy || 0;
    const s = new THREE.Shape();
    s.moveTo(cx - w / 2, cy - h / 2); s.lineTo(cx + w / 2, cy - h / 2);
    s.lineTo(cx + w / 2, cy + h / 2); s.lineTo(cx - w / 2, cy + h / 2);
    s.closePath();
    return s;
  }

  function roundRect(w, h, r, cx, cy) {
    cx = cx || 0; cy = cy || 0;
    const x = w / 2, y = h / 2;
    const s = new THREE.Shape();
    s.moveTo(cx - x + r, cy - y);
    s.lineTo(cx + x - r, cy - y); s.absarc(cx + x - r, cy - y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(cx + x, cy + y - r);  s.absarc(cx + x - r, cy + y - r, r, 0, Math.PI / 2, false);
    s.lineTo(cx - x + r, cy + y);  s.absarc(cx - x + r, cy + y - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(cx - x, cy - y + r);  s.absarc(cx - x + r, cy - y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }
  const disc = r => { const s = new THREE.Shape(); s.absarc(0, 0, r, 0, TAU, false); return s; };
  function hole(shape, x, y, r) {
    shape.holes.push(new THREE.Path().absarc(x, y, r, 0, TAU, true));
    return shape;
  }
  function slotHole(shape, x, y, len, wid) {
    const r = wid / 2, a = len / 2 - r;
    const p = new THREE.Path();
    p.moveTo(x - a, y - r); p.lineTo(x + a, y - r);
    p.absarc(x + a, y, r, -Math.PI / 2, Math.PI / 2, false);
    p.lineTo(x - a, y + r);
    p.absarc(x - a, y, r, Math.PI / 2, Math.PI * 1.5, false);
    shape.holes.push(p);
    return shape;
  }
  function rectHole(shape, x, y, w, h, r) {
    const inner = roundRect(w, h, r || 0.01, x, y);
    shape.holes.push(new THREE.Path().setFromPoints(inner.getPoints(48)));
    return shape;
  }

  function prism(shape, H, o) {
    o = o || {};
    const b = o.chamfer || o.fillet || 0;
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(H - 2 * b, 1e-3),
      bevelEnabled: b > 0,
      bevelThickness: b, bevelSize: b, bevelOffset: 0,
      bevelSegments: o.fillet ? (o.smooth || 5) : 1,
      curveSegments: o.curve || 40,
      steps: 1,
    });
    if (b > 0) g.translate(0, 0, b);
    if (o.z) g.translate(0, 0, o.z);
    return Geo.bake(g);
  }

  function revolve(pts, o) {
    o = o || {};
    const v = pts.map(p => new THREE.Vector2(Math.max(p[0], 0), p[1]));
    const g = new THREE.LatheGeometry(v, o.seg || 64);
    return Geo.bake(g, o.z ? M(0, 0, o.z) : null);
  }

  function arc(cr, cz, R, a0, a1, n) {
    n = n || 8;
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      out.push([cr + R * Math.cos(a), cz + R * Math.sin(a)]);
    }
    return out;
  }

  function fillet(r, zFace, R, above) {
    return arc(r + R, zFace + (above ? R : -R), R,
               Math.PI, above ? Math.PI * 1.5 : Math.PI * 0.5, 8);
  }

  const roundOver = (r, z, R) => arc(r - R, z - R, R, 0, Math.PI / 2, 8);

  function taperBox(w0, d0, w1, d1, H, o) {
    o = o || {};
    const hw0 = w0 / 2, hd0 = d0 / 2, hw1 = w1 / 2, hd1 = d1 / 2;
    const P = [], push = (x, y, z) => P.push(x, y, z);
    const bot = [[-hw0, -hd0], [hw0, -hd0], [hw0, hd0], [-hw0, hd0]];
    const top = [[-hw1, -hd1], [hw1, -hd1], [hw1, hd1], [-hw1, hd1]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      push(bot[i][0], bot[i][1], 0); push(bot[j][0], bot[j][1], 0); push(top[j][0], top[j][1], H);
      push(bot[i][0], bot[i][1], 0); push(top[j][0], top[j][1], H); push(top[i][0], top[i][1], H);
    }

    push(bot[0][0], bot[0][1], 0); push(bot[2][0], bot[2][1], 0); push(bot[1][0], bot[1][1], 0);
    push(bot[0][0], bot[0][1], 0); push(bot[3][0], bot[3][1], 0); push(bot[2][0], bot[2][1], 0);
    push(top[0][0], top[0][1], H); push(top[1][0], top[1][1], H); push(top[2][0], top[2][1], H);
    push(top[0][0], top[0][1], H); push(top[2][0], top[2][1], H); push(top[3][0], top[3][1], H);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(P), 3));
    g.computeVertexNormals();
    return Geo.bake(g, M(o.x, o.y, o.z));
  }

  function cyl(rTop, rBot, H, o) {
    o = o || {};
    const g = new THREE.CylinderGeometry(rTop, rBot, H, o.seg || 48, 1, !!o.open);
    g.rotateX(Math.PI / 2);
    return Geo.bake(g, M(o.x, o.y, (o.z || 0) + H / 2));
  }

  const holeChamfer = (r, c, o) => cyl(r + c, r, c, Object.assign({ open: true }, o));

  function hexBar(across, H, o) {
    o = o || {};
    const g = new THREE.CylinderGeometry(across / Math.sqrt(3), across / Math.sqrt(3), H, 6);
    g.rotateX(Math.PI / 2);
    return Geo.bake(g, M(o.x, o.y, (o.z || 0) + H / 2));
  }

  function hexPath(af, x, y) {
    const R = af / Math.sqrt(3);
    const p = new THREE.Path();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const px = (x || 0) + Math.cos(a) * R, py = (y || 0) + Math.sin(a) * R;
      if (i) p.lineTo(px, py); else p.moveTo(px, py);
    }
    p.closePath();
    return p;
  }

  function shcs(dHead, hHead, af) {
    const s = disc(dHead / 2);
    s.holes.push(hexPath(af));
    return prism(s, hHead, { chamfer: 0.5, curve: 40 });
  }

  const STAND = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
  const stand = (geo, x, y, z) =>
    Geo.bake(geo, new THREE.Matrix4().makeTranslation(x || 0, y || 0, z || 0).multiply(STAND));

  function threadForm(u) {
    u -= Math.floor(u);
    if (u < 0.125)  return 1;
    if (u < 0.4375) return 1 - (u - 0.125) / 0.3125;
    if (u < 0.6875) return 0;
    return (u - 0.6875) / 0.3125;
  }

  function thread(o) {
    const dMaj = o.dMaj, pitch = o.pitch, len = o.len;
    const h = 0.6134 * pitch;
    const rRoot = o.internal ? dMaj / 2 - h : dMaj / 2 - h;
    const seg = o.seg || 56;
    const rows = Math.max(6, Math.round(len / pitch * (o.rowsPerPitch || 14)));
    const hand = o.left ? -1 : 1;
    const P = [];
    const at = (i, j) => {
      const zz = len * i / rows;
      const th = TAU * j / seg;
      const f = threadForm(zz / pitch - hand * th / TAU);
      const r = rRoot + h * (o.internal ? 1 - f : f);
      return [r * Math.cos(th), r * Math.sin(th), zz];
    };
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < seg; j++) {
        const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j + 1), d = at(i + 1, j);

        const q = o.internal ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
        q.forEach(p => P.push(p[0], p[1], p[2]));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(P), 3));
    g.computeVertexNormals();
    return Geo.bake(g, M(o.x, o.y, o.z));
  }

  const viseEarY = (bodyW, earW) => bodyW / 2 + (earW - bodyW) / 4 - 5;

  function viseModel(spec) {
    const S = Object.assign({
      maxOpen: 9.00 * IN, earW: 7.75 * IN, bodyW: 6.25 * IN,
      castJaw: true, open: 2.5 * IN,
    }, spec || {});

    const JAW_H   = 1.735 * IN;
    const BED_Z   = 2.875 * IN;
    const TOP_Z   = BED_Z + JAW_H;

    /* No mounting ears and no screw nose: the body is a plain block, so
       nothing sticks out past the bed for the cutter to appear to clash with. */
    const LEN     = (16.81 - 9.00) * IN + S.maxOpen;
    const BODY_W  = S.bodyW;
    const PLATE_T = 0.75  * IN;
    const BASE_H  = 1.02 * IN;

    const X_BACK = -66, X_FRONT = LEN - 66;
    const CX = (X_BACK + X_FRONT) / 2, BODY_L = X_FRONT - X_BACK;
    const g = [];

    g.push(prism(rect(BODY_L, BODY_W, CX, 0), BASE_H, { chamfer: 3 }));

    g.push(taperBox(BODY_L - 10, BODY_W - 6, BODY_L - 10, BODY_W - 26,
                    BED_Z - BASE_H - 11, { x: CX, z: BASE_H }));

    /* The bed is one unbroken surface. It used to carry a pair of sunk
       rectangular chip slots — one landing inside the jaw opening and one
       out past the far end of the travel — which read as pockets machined
       into the vise and gave the blank a hole to appear to sit over. */
    const bedX0 = X_BACK + 10, bedX1 = X_FRONT - 14;
    const bed = rect(bedX1 - bedX0, BODY_W, (bedX0 + bedX1) / 2, 0);
    g.push(prism(bed, 11, { chamfer: 1.6, z: BED_Z - 11 }));

    /* Jaw plates and the blocks they bolt to run the full width of the body,
       with no draft — so the plate, the block and the bed all finish on the
       same two side planes and nothing steps in at the ends. */
    if (S.castJaw) {
      g.push(taperBox(47, BODY_W, 43, BODY_W, TOP_Z - BED_Z + 12,
                      { x: -PLATE_T - 23.5, z: BED_Z - 12 }));
    } else {
      const blockX = -PLATE_T - 25, blockH = TOP_Z - BED_Z + 4;
      g.push(taperBox(50, BODY_W, 50, BODY_W, blockH,
                      { x: blockX, z: BED_Z - 4 }));
    }

    const SHUT = 0.004 * IN;
    function jawPlate(into, xFace, dir) {
      const face = rect(BODY_W, JAW_H, 0, JAW_H / 2);
      const x0 = dir > 0 ? xFace : xFace - PLATE_T;
      into.push(stand(prism(face, PLATE_T, { chamfer: 1.2 }), x0, 0, BED_Z));
    }

    jawPlate(g, 0, -1);

    const jaw = [];
    jaw.push(taperBox(78, BODY_W, 70, BODY_W, TOP_Z - BED_Z,
                      { x: PLATE_T + 39 + SHUT, z: BED_Z }));
    jawPlate(jaw, SHUT, 1);

    return {
      main: Geo.merge(g),
      members: [{
        name: "Jaw", axis: "x",
        min: 0, max: S.maxOpen, value: Math.min(S.open, S.maxOpen),
        geometry: Geo.merge(jaw),
        note: `0 = jaws touching · ${(S.maxOpen / IN).toFixed(2)}" fully open`,

        fixedFace: 0,
        movingFace: 0,
        bedZ: BED_Z,

        /* Parallels are cut to this, so reporting the body width is what keeps
           the bars flush with the ends of the jaws. */
        jawW: BODY_W,
      }],
    };
  }

  function fixturePlate() {
    const s = rect(10 * IN, 6 * IN);
    for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2)
      hole(s, i * 4 * IN, j * 2.25 * IN, 0.265 * IN);
    hole(s, 0, 0, 0.75 * IN);
    slotHole(s, -2.875 * IN, 0, 2.75 * IN, 0.75 * IN);
    slotHole(s,  2.875 * IN, 0, 2.75 * IN, 0.75 * IN);
    return prism(s, 1 * IN, { chamfer: 0.08 * IN });
  }

  function pocketBlock() {
    const W = 6 * IN, D = 4.5 * IN, H = 1.8 * IN;
    const frame = roundRect(W, D, 0.4 * IN);
    rectHole(frame, 0, 0, 3.5 * IN, 2 * IN, 0.5 * IN);
    return Geo.merge([
      prism(roundRect(W, D, 0.4 * IN), 0.55 * IN, { chamfer: 0.08 * IN }),
      prism(frame, H - 0.55 * IN, { fillet: 0.12 * IN, z: 0.55 * IN }),
      taperBox(2.3 * IN, 1.5 * IN, 1.75 * IN, 1 * IN, 0.95 * IN, { z: 0.55 * IN }),
    ]);
  }

  function stud() {
    const dMaj = 0.75 * IN, P = 0.1 * IN, h = 0.6134 * P;
    const rCore = dMaj / 2 - h;
    const prof = [[0, 0], [rCore - 0.05 * IN, 0], [rCore, 0.05 * IN]]
      .concat([[rCore, 2.2 * IN]])
      .concat(fillet(rCore, 2.35 * IN, 0.15 * IN, false))
      .concat([[0.5 * IN, 2.35 * IN], [0.5 * IN, 3.2 * IN]])
      .concat([[0.34 * IN, 4.4 * IN], [0.34 * IN, 5.4 * IN]])
      .concat([[0.29 * IN, 5.5 * IN], [0, 5.5 * IN]]);
    return Geo.merge([
      revolve(prof, { seg: 72 }),
      thread({ dMaj, pitch: P, len: 2.1 * IN, z: 0.06 * IN, seg: 64 }),
    ]);
  }

  function tappedBoss() {
    const dMaj = 1.5 * IN, P = IN / 6, h = 0.6134 * P;
    const rBore = dMaj / 2 - h;
    const base = roundRect(4.75 * IN, 3.5 * IN, 0.55 * IN);
    hole(base, 0, 0, rBore);
    const boss = [[rBore, 0.625 * IN], [rBore, 2.3 * IN], [1.18 * IN, 2.3 * IN],
                  [1.34 * IN, 2.14 * IN], [1.34 * IN, 1.095 * IN]]
      .concat(fillet(1.34 * IN, 0.625 * IN, 0.47 * IN, true))
      .concat([[rBore, 0.625 * IN]]);
    return Geo.merge([
      prism(base, 0.625 * IN, { fillet: 0.16 * IN }),
      revolve(boss, { seg: 64 }),
      thread({ dMaj, pitch: P, len: 2.05 * IN, internal: true, z: 0.12 * IN, seg: 64 }),
      holeChamfer(rBore, 0.14 * IN, { z: 2.16 * IN, seg: 64 }),
    ]);
  }

  function turnedShaft() {
    const prof = [[0, 0], [0.86 * IN, 0], [0.9375 * IN, 0.078 * IN]]
      .concat([[0.9375 * IN, 1.2 * IN], [0.78 * IN, 1.2 * IN],
               [0.78 * IN, 1.5 * IN], [0.9375 * IN, 1.5 * IN]])
      .concat([[0.9375 * IN, 2.16 * IN]])
      .concat(roundOver(0.9375 * IN, 2.28 * IN, 0.12 * IN))
      .concat([[0.625 * IN, 3.8 * IN], [0.62 * IN, 4.15 * IN]])
      .concat(fillet(0.5 * IN, 4.27 * IN, 0.12 * IN, true).slice().reverse())
      .concat([[0.5 * IN, 5.4 * IN]])
      .concat(arc(0, 5.4 * IN, 0.5 * IN, 0, Math.PI / 2, 12));
    return revolve(prof, { seg: 80 });
  }

  function taperGauge() {

    const zT = 2.6875 * IN, rTop = 0.875 * IN, rBot = rTop - (7 / 48) * zT;
    const dMaj = 0.625 * IN, P = IN / 11, rBore = dMaj / 2 - 0.6134 * P;
    const prof = [[0, 1.35 * IN], [rBore, 1.35 * IN], [rBore, 0]]
      .concat([[rBot - 0.08 * IN, 0], [rBot, 0.08 * IN]])
      .concat([[rTop, zT], [rTop, zT + 0.2 * IN]])
      .concat(fillet(rTop, zT + 0.32 * IN, 0.12 * IN, false))
      .concat([[1.625 * IN, zT + 0.32 * IN], [1.625 * IN, zT + 1.0 * IN],
               [1.5 * IN, zT + 1.12 * IN], [0.98 * IN, zT + 1.12 * IN],
               [0.98 * IN, zT + 1.72 * IN], [0.86 * IN, zT + 1.84 * IN], [0, zT + 1.84 * IN]]);
    return Geo.merge([
      revolve(prof, { seg: 80 }),
      thread({ dMaj, pitch: P, len: 1.1 * IN, internal: true, z: 0.12 * IN, seg: 48 }),
      holeChamfer(rBore, 0.06 * IN, { z: 0, seg: 40 }),
    ]);
  }

  function bracket() {
    const s = new THREE.Shape();
    const R = 0.625 * IN, T = 0.55 * IN, A = 3.75 * IN, B = 3.25 * IN, E = 0.16 * IN;
    s.moveTo(0, 0); s.lineTo(A, 0);
    s.lineTo(A, T - E); s.absarc(A - E, T - E, E, 0, Math.PI / 2, false);
    s.lineTo(T + R, T);
    s.absarc(T + R, T + R, R, -Math.PI / 2, Math.PI, true);
    s.lineTo(T, B - E); s.absarc(T - E, B - E, E, 0, Math.PI / 2, false);
    s.lineTo(0, B); s.closePath();
    const web = prism(s, 4.25 * IN, { chamfer: 0.08 * IN });
    web.rotateX(Math.PI / 2);
    web.translate(0, 2.125 * IN, 0);
    return Geo.merge([web].concat(
      [-1, 1].map(sy => taperBox(1.8 * IN, 0.4 * IN, 0.8 * IN, 0.25 * IN, 2.1 * IN,
                                { x: 1.2 * IN, y: sy * 1.5 * IN, z: 0 }))));
  }

  function flange() {
    const rOD = 2.75 * IN, tFace = 0.625 * IN, rBore = 0.875 * IN;
    const face = disc(rOD);
    hole(face, 0, 0, rBore);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      hole(face, Math.cos(a) * 2.3 * IN, Math.sin(a) * 2.3 * IN, 0.265 * IN);
    }
    const hub = [[rBore, tFace], [1.9 * IN, tFace]]
      .concat(fillet(1.6 * IN, tFace, 0.3 * IN, true).slice().reverse())
      .concat([[1.6 * IN, tFace + 1.2 * IN], [1.47 * IN, tFace + 1.33 * IN],
               [rBore, tFace + 1.33 * IN], [rBore, tFace]]);
    return Geo.merge([
      prism(face, tFace, { chamfer: 0.08 * IN, curve: 72 }),
      revolve(hub, { seg: 88 }),
    ]);
  }

  function parallelPair(spec) {
    const S = Object.assign({ width: 4 * IN, h: 1.375 * IN, t: 0.125 * IN, len: 6 * IN,
                              travel: 0 }, spec || {});

    const x = Math.max(S.width / 2 - S.t / 2, S.t / 2);
    const bar = s => prism(rect(S.t, S.len, s * x, 0), S.h, { chamfer: 0.4 });
    return {
      main: bar(-1),
      members: [{
        name: "Bar", axis: "x", driven: true,
        min: -2 * x, max: Math.max(S.travel, 0), value: 0,
        geometry: bar(1),
        note: "Follows the movable jaw",
      }],
    };
  }

  function vf1Table(spec) {
    const S = Object.assign({ len: 26 * IN, wid: 14 * IN, thick: 3.35 * IN,
                              slots: 3, pitch: 4.92 * IN }, spec || {});
    const L = S.len, W = S.wid, T = S.thick;
    const NECK = 16, THROAT = 27;
    const NECK_D = 11, THROAT_D = 27 - 11;
    const g = [];

    const s = new THREE.Shape();
    const SLOT_D = NECK_D + THROAT_D;
    const centers = [];
    for (let i = 0; i < S.slots; i++) centers.push((i - (S.slots - 1) / 2) * S.pitch);

    s.moveTo(-W / 2, -T);
    s.lineTo(W / 2, -T);
    s.lineTo(W / 2, 0);
    centers.slice().reverse().forEach(y => {
      s.lineTo(y + NECK / 2, 0);
      s.lineTo(y + NECK / 2, -NECK_D);
      s.lineTo(y + THROAT / 2, -NECK_D);
      s.lineTo(y + THROAT / 2, -SLOT_D);
      s.lineTo(y - THROAT / 2, -SLOT_D);
      s.lineTo(y - THROAT / 2, -NECK_D);
      s.lineTo(y - NECK / 2, -NECK_D);
      s.lineTo(y - NECK / 2, 0);
    });
    s.lineTo(-W / 2, 0);
    s.closePath();

    g.push(stand(prism(s, L), -L / 2, 0, 0));

    g.push(prism(roundRect(L * 0.62, W * 0.92, 10, 0, 0), 90, { chamfer: 4, z: -T - 90 }));
    [-1, 1].forEach(sx => g.push(prism(
      roundRect(L * 0.17, W * 0.86, 6, sx * (L * 0.40), 0), 26,
      { chamfer: 3, z: -T - 26 })));
    return Geo.merge(g);
  }

  function trunnion(spec) {
    const S = Object.assign({ table: 630 }, spec || {});
    const g = [];
    const rT = S.table / 2;
    const TBL_T = 56, LIP = 17, UNDER = 21;
    const SLOT_W = 18, SLOT_UW = 34;
    const BORE_R = 40;
    const SLOTS = 8;
    const SL_R0 = 84, SL_R1 = rT - 26;
    const CR_TOP = -TBL_T, CR_H = 156;
    const B_Z = CR_TOP - CR_H / 2;
    const CR_HW = 372, CR_HD = 302;
    const HS_IN = 384, HS_R = 236, HS_T = 128;
    const HS_R2 = 198, HS_T2 = 112;
    const COL_TOP = B_Z + 64, BASE_TOP = -536, BASE_T = 62;

    const alongX = (geo, x0, z) => {
      geo.rotateY(Math.PI / 2);
      return Geo.bake(geo, M(x0, 0, z));
    };

    const layer = (w, zTop, t) => {
      const s = disc(rT);
      hole(s, 0, 0, BORE_R);
      if (w > 0) {
        const mid = (SL_R0 + SL_R1) / 2, len = SL_R1 - SL_R0;
        for (let i = 0; i < SLOTS; i++) {
          const a = i * TAU / SLOTS;
          const slot = roundRect(len, w, 1.5, 0, 0);
          const pts = slot.getPoints(40).map(p => new THREE.Vector2(
            mid * Math.cos(a) + p.x * Math.cos(a) - p.y * Math.sin(a),
            mid * Math.sin(a) + p.x * Math.sin(a) + p.y * Math.cos(a)));
          s.holes.push(new THREE.Path().setFromPoints(pts));
        }
      }
      return prism(s, t, { chamfer: 1.5, curve: 44, z: zTop - t });
    };
    g.push(layer(SLOT_W, 0, LIP));
    g.push(layer(SLOT_UW, -LIP, UNDER));
    g.push(layer(0, -(LIP + UNDER), TBL_T - LIP - UNDER));

    g.push(cyl(rT * 0.90, rT * 0.94, 30, { seg: 72, z: -TBL_T - 30 }));

    g.push(prism(roundRect(CR_HW * 2, CR_HD * 2, 44, 0, 0), CR_H,
                 { chamfer: 7, z: CR_TOP - CR_H }));

    g.push(cyl(rT + 26, rT + 26, 16, { seg: 80, z: CR_TOP - 16 }));

    [-1, 1].forEach(sy => g.push(prism(
      rect(CR_HW * 1.5, 46, 0, sy * (CR_HD - 30)), 54,
      { chamfer: 5, z: CR_TOP - CR_H - 20 })));

    g.push(alongX(cyl(HS_R, HS_R, HS_T, { seg: 76 }), -(HS_IN + HS_T), B_Z));
    g.push(alongX(cyl(HS_R * 0.62, HS_R * 0.62, 66, { seg: 52 }),
                  -(HS_IN + HS_T + 66), B_Z));
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8, r = HS_R * 0.84;
      const sc = shcs(24, 13, 12);
      sc.rotateY(Math.PI / 2);
      g.push(Geo.bake(sc, M(-(HS_IN + HS_T), Math.cos(a) * r, B_Z + Math.sin(a) * r)));
    }

    g.push(alongX(cyl(HS_R2, HS_R2, HS_T2, { seg: 68 }), HS_IN, B_Z));
    g.push(alongX(cyl(HS_R2 * 0.52, HS_R2 * 0.52, 54, { seg: 44 }), HS_IN + HS_T2, B_Z));
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6, r = HS_R2 * 0.80;
      const sc = shcs(21, 12, 11);
      sc.rotateY(-Math.PI / 2);
      g.push(Geo.bake(sc, M(HS_IN + HS_T2, Math.cos(a) * r, B_Z + Math.sin(a) * r)));
    }

    [-1, 1].forEach(s => {
      const x0 = s > 0 ? CR_HW - 10 : -HS_IN;
      g.push(alongX(cyl(112, 112, HS_IN - CR_HW + 10, { seg: 48 }), x0, B_Z));
    });

    [[-1, HS_T + 52], [1, HS_T2 + 46]].forEach(([s, w]) => g.push(prism(
      roundRect(w, 470, 14, s * (HS_IN + (s > 0 ? HS_T2 : HS_T) / 2), 0),
      COL_TOP - BASE_TOP, { chamfer: 6, z: BASE_TOP })));

    const base = roundRect(1420, 560, 20, 0, 0);
    [-1, 1].forEach(sx => [-1, 1].forEach(sy =>
      slotHole(base, sx * 560, sy * 210, 150, 28)));
    g.push(prism(base, BASE_T, { chamfer: 7, z: BASE_TOP - BASE_T }));

    return Geo.merge(g);
  }

  function rotaryFaceplate(spec) {
    const S = Object.assign({ face: 320 }, spec || {});
    const R = S.face / 2;
    const R_HUB = R * 0.58;
    const R_BC = R * 0.40;
    const R_MID = R * 0.155;
    const R_SCREW = R * 0.80;
    const FL_T = 28, SINK = 7;
    const HEAD_D = 15.5, HEAD_H = 9, FLUSH = 3;
    const HS_R = R * 0.94, HS_H = 104;
    const g = [];

    const flange = disc(R);
    hole(flange, 0, 0, R_HUB);
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12;
      hole(flange, Math.cos(a) * R_SCREW, Math.sin(a) * R_SCREW, HEAD_D / 2 + 0.6);
    }
    g.push(prism(flange, FL_T, { chamfer: 3, curve: 64, z: -FL_T }));

    const hub = disc(R_HUB + 1.5);
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      hole(hub, Math.cos(a) * R_BC, Math.sin(a) * R_BC, 11);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i + 0.5) * TAU / 6;
      hole(hub, Math.cos(a) * R_MID, Math.sin(a) * R_MID, 6.6);
    }
    g.push(prism(hub, FL_T - SINK, { chamfer: 2, curve: 56, z: -FL_T }));

    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12;
      g.push(Geo.bake(shcs(HEAD_D, HEAD_H, 8),
        M(Math.cos(a) * R_SCREW, Math.sin(a) * R_SCREW, -FLUSH - HEAD_H)));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i + 0.5) * TAU / 6;
      g.push(Geo.bake(shcs(12.4, 7, 6),
        M(Math.cos(a) * R_MID, Math.sin(a) * R_MID, -SINK - FLUSH - 7)));
    }

    g.push(cyl(HS_R, HS_R, HS_H, { seg: 56, z: -FL_T - HS_H }));

    return Geo.merge(g);
  }

  function dovetailVise(spec) {
    const S = Object.assign({ jaw: 125, open: 40 }, spec || {});
    const JW = S.jaw;
    const BASE_L = 286, BASE_W = JW + 30, BASE_H = 44;
    const JAW_T = 56, JAW_H = 86;
    const GRIP = 0.125 * IN;
    const HALF = S.open / 2;
    const g = [], jaw = [];

    const acrossY = (shape, t) => {
      const geo = prism(shape, t, { chamfer: 2 });
      geo.rotateX(Math.PI / 2);
      return Geo.bake(geo, M(0, t / 2, 0));
    };

    const base = roundRect(BASE_L, BASE_W, 12, 0, 0);
    [-1, 1].forEach(sx => [-1, 1].forEach(sy =>
      hole(base, sx * (BASE_L / 2 - 32), sy * (BASE_W / 2 - 28), 9)));
    g.push(prism(base, BASE_H, { chamfer: 3 }));

    const jawBlock = (dir, x0) => {
      const s = new THREE.Shape();
      const f = x0, back = x0 - dir * JAW_T, lip = x0 + dir * GRIP;
      s.moveTo(back, BASE_H);
      s.lineTo(f, BASE_H);
      s.lineTo(f, BASE_H + JAW_H - GRIP);
      s.lineTo(lip, BASE_H + JAW_H);
      s.lineTo(back, BASE_H + JAW_H);
      s.closePath();
      return acrossY(s, JW);
    };
    g.push(jawBlock(1, -HALF));
    jaw.push(jawBlock(-1, HALF));

    [-1, 1].forEach(sx => g.push(prism(
      rect(26, JW - 24, sx * (HALF + JAW_T + 16), 0), 12,
      { chamfer: 1.5, z: BASE_H })));

    const along = (geo, x) => { geo.rotateY(Math.PI / 2); return Geo.bake(geo, M(x, 0, BASE_H * 0.55)); };
    g.push(along(cyl(15, 15, 52, { seg: 32 }), BASE_L / 2 - 6));
    g.push(along(hexBar(22, 26, {}), BASE_L / 2 + 46));
    g.push(along(cyl(21, 21, 12, { seg: 32 }), BASE_L / 2 + 34));

    return {
      main: Geo.merge(g),
      members: [{
        name: "Jaw", axis: "x",
        min: 0, max: 150, value: Math.min(S.open, 150),
        geometry: Geo.merge(jaw),
        note: "0 = jaws at the stamped-form width · 150 fully open",

        fixedFace: -HALF, movingFace: HALF, bedZ: BASE_H + 12, jawW: JW,
      }],
    };
  }

  const DOVETAIL = { w: 1.250 * IN, h: 0.125 * IN, angle: 45 };
  const dtFoot = d => d.w / 2;
  const dtRoot = d => d.w / 2 - d.h * Math.tan(d.angle * Math.PI / 180);

  function dovetailFixture(spec) {
    const S = Object.assign({ open: 0, rise: 120, form: DOVETAIL }, spec || {});
    const DT = S.form || DOVETAIL;
    const R_BASE = 115, BASE_T = 26;
    const R_SPIG = 92.4, SPIG_T = 7;
    const R_BOLT = 64;
    const TOP = S.rise;
    const RAIL_H = 16, PED_TOP = TOP - RAIL_H;
    const FOOT = dtFoot(DT), ROOT = dtRoot(DT);
    const RAIL_OUT = 24, RAIL_LEN = 80;
    const g = [], jaw = [];

    const bolts = (shape, r) => {
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8;
        hole(shape, Math.cos(a) * R_BOLT, Math.sin(a) * R_BOLT, r);
      }
      return shape;
    };
    g.push(prism(bolts(disc(R_SPIG), 7), SPIG_T, { chamfer: 1, curve: 64, z: -SPIG_T }));
    g.push(prism(bolts(disc(R_BASE), 11), BASE_T, { chamfer: 3, curve: 72 }));
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      g.push(Geo.bake(shcs(21, 12, 10),
        M(Math.cos(a) * R_BOLT, Math.sin(a) * R_BOLT, 8)));
    }

    g.push(taperBox(150, 96, 110, 52, PED_TOP - BASE_T, { z: BASE_T }));

    const rail = dir => {
      const s = new THREE.Shape();
      s.moveTo(dir * RAIL_OUT, PED_TOP);
      s.lineTo(dir * FOOT, PED_TOP);
      s.lineTo(dir * FOOT, TOP - DT.h);
      s.lineTo(dir * ROOT, TOP);
      s.lineTo(dir * RAIL_OUT, TOP);
      s.closePath();

      return stand(prism(s, RAIL_LEN), -RAIL_LEN / 2, 0, 0);
    };
    g.push(rail(-1));
    jaw.push(rail(1));

    [-26, 26].forEach(x => {
      const h = shcs(10, 8, 5);
      h.rotateX(Math.PI / 2);
      jaw.push(Geo.bake(h, M(x, RAIL_OUT + 8, TOP - RAIL_H / 2)));
    });

    return {
      main: Geo.merge(g),
      members: [{
        name: "Rail", axis: "y",
        min: 0, max: 25, value: Math.min(Math.max(S.open, 0), 25),
        geometry: Geo.merge(jaw),
        note: "0 = closed on the stamped tenon · 25 fully open",
      }],
    };
  }

  function stockTenon(spec) {
    const S = Object.assign({ len: 3.400 * IN }, DOVETAIL, spec || {});
    const foot = dtFoot(S), root = dtRoot(S);
    const s = new THREE.Shape();
    s.moveTo(-root, 0);
    s.lineTo(root, 0);
    s.lineTo(foot, -S.h);
    s.lineTo(-foot, -S.h);
    s.closePath();
    return stand(prism(s, S.len), -S.len / 2, 0, 0);
  }

  const VISE_HOLD = { faceX: 0, jawTop: (2.875 + 1.735) * IN, bed: 2.875 * IN,
                      jawW: 6.900 * IN,   // overridden per vise by its own body width
                      boltCX: (16.81 * IN) / 2 - 66, boltSpan: 125 };

  const LIST = [
    { key: "dx6",     name: "6\" vise — Kurt DX6", seat: false, kind: "clamp",
      note: "9.00\" open · cast-on jaw · flat bed", centerOnAdd: true,
      hold: Object.assign({ maxOpen: 9.00 * IN, boltY: viseEarY(6.25 * IN, 7.75 * IN) }, VISE_HOLD),
      make: () => viseModel({ maxOpen: 9.00 * IN, earW: 7.75 * IN, bodyW: 6.25 * IN,
                              castJaw: true }) },
    { key: "d688",    name: "6\" vise — Kurt D688", seat: false, kind: "clamp",
      note: "8.80\" open · bolted jaw · wider body", centerOnAdd: true,
      hold: Object.assign({ maxOpen: 8.80 * IN, boltY: viseEarY(6.75 * IN, 8.75 * IN) }, VISE_HOLD),
      make: () => viseModel({ maxOpen: 8.80 * IN, earW: 8.75 * IN, bodyW: 6.75 * IN,
                              castJaw: false }) },

    { key: "haasv6",  name: "6\" vise — Haas HV6", seat: false, kind: "clamp",
      note: "8.00\" open · bolted jaws · goes with the VF-1 table", centerOnAdd: true,
      hold: Object.assign({ maxOpen: 8.00 * IN, boltY: viseEarY(6.90 * IN, 8.25 * IN) }, VISE_HOLD),
      make: () => viseModel({ maxOpen: 8.00 * IN, earW: 8.25 * IN, bodyW: 6.90 * IN,
                              castJaw: false }) },
    { key: "vf1",     name: "Haas VF-1 table", kind: "clamp", seat: false, role: "machine",
      note: "26 × 14 work surface · three 5/8 T-slots on 4.92 centers",
      make: () => vf1Table({}) },
    { key: "faceplate", name: "5-axis rotary faceplate", kind: "clamp", seat: false, role: "machine",
      note: "Ø320 face · solid center · on its cylindrical drum",
      make: () => rotaryFaceplate({}) },
    { key: "dovetail", name: "5-axis dovetail vise", kind: "clamp", seat: false,
      note: "125 jaw · 45° × 1/8 dovetail grip · stamped-form workholding",
      centerOnAdd: true, make: () => dovetailVise({}) },
    { key: "dtfix", name: "Dovetail fixture — faceplate mount", kind: "clamp", seat: false,
      note: "Ø230 base · spigots into the faceplate hub · 45° × 1/8 dovetail jaws",
      make: () => dovetailFixture({}) },
    { key: "plate",   name: "Chamfered fixture plate", kind: "clamp", centerOnAdd: true,
      note: "10 × 6 × 1 · 0.080 chamfers, Ø1.500 bore", make: fixturePlate },
    { key: "pars",    name: "Parallels — matched pair", kind: "clamp", seat: false,
      note: "⅛ × 1⅜ × 6 ground · stands the work up in the jaws",
      make: () => parallelPair({}) },
    { key: "trunnion", name: "Swivel rotary table — DMU 50", kind: "clamp", seat: false, role: "machine",
      note: "Ø630 face · 8 radial T-slots · B swivel, C rotate",
      make: () => trunnion({}) },
    { key: "pocket",  name: "Filleted pocket block",
      note: "6 × 4.5 · R1/2 pocket, drafted island", make: pocketBlock },
    { key: "stud",    name: "Threaded stud 3/4\"–10",
      note: "UNC thread, R0.15 fillet, taper", make: stud },
    { key: "boss",    name: "Tapped boss 1½\"–6",
      note: "1½–6 UNC bore, chamfered mouth", make: tappedBoss },
    { key: "shaft",   name: "Turned shaft",
      note: "Ø1.875 · groove, taper, R1/2 nose", make: turnedShaft },
    { key: "taper",   name: "CAT40 taper gauge",
      note: "Ø1.750 gauge · 5/8–11 retention", make: taperGauge },
    { key: "bracket", name: "Angle bracket",
      note: "R5/8 inside fillet, drafted gussets", make: bracket },
    { key: "flange",  name: "Bolt flange",
      note: "Ø5.5 · 6 × Ø0.53 on a Ø4.60 BC", make: flange },
  ];

  function build(key) {
    const s = LIST.find(x => x.key === key);
    if (!s) return null;
    const g = s.make();
    if (g && g.main) return g;
    return s.seat === false ? g : Geo.seat(g);
  }
  const get = key => LIST.find(x => x.key === key) || null;
  const of = kind => LIST.filter(x => (x.kind || "part") === kind);
  return { LIST, build, get, of, parallelPair, trunnion, vf1Table, viseEarY,
           dovetailFixture, stockTenon, DOVETAIL };
})();

const Stock = (() => {

  const CUT_ROW = 256;
  const MAX_CUTS = 2048;
  const CUT_W = CUT_ROW * 4;
  const CUT_H = MAX_CUTS / CUT_ROW;

  const GW = 64, GH = 64, KSLOT = 160;
  const SLOT_BITS = 11, SLOT_SCALE = 1 << SLOT_BITS;
  const SLOTS_PER_TEXEL = 8;
  const GROWS = 1 + Math.ceil(KSLOT / SLOTS_PER_TEXEL);
  const GCELLS = GW * GH;

  const gTexel = (gx, gy, row) => ((gy * GROWS + row) * GW + gx);
  const EDGE_BREAK = 0.35;

  const CLIP_M = 2.0;

  const METALS = {
    aluminum: { name: "Aluminum", col: [0.58, 0.60, 0.63], spec: [0.38, 0.40, 0.43], shine: 42, grain: 0 },
    mild:      { name: "Mild steel", col: [0.38, 0.40, 0.43], spec: [0.22, 0.23, 0.25], shine: 16, grain: 1 },
    stainless: { name: "Stainless",  col: [0.63, 0.66, 0.69], spec: [0.62, 0.64, 0.67], shine: 96, grain: 0 },
    brass:     { name: "Brass",      col: [0.62, 0.49, 0.20], spec: [0.60, 0.52, 0.30], shine: 70, grain: 2 },
  };

  /* The three stocked bars. Mild steel stays in METALS so the older sample
     scenarios still render, but it is not offered as a choice. */
  const METAL_CHOICES = ["aluminum", "brass", "stainless"];

  /* Re-skinning sweep: a front crosses the blank on the body diagonal and
     converts it a cell at a time. Band and jitter are in normalised sweep
     units, so they hold whatever size the billet is. */
  const SWEEP = { seconds: 1.1, band: 0.10, jitter: 0.055, cellsAcross: 26 };

  const VERT = `
    out vec3 vWorld;
    void main() {
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;

  const FRAG = `
    precision highp float;
    precision highp sampler2D;

    in vec3 vWorld;
    out vec4 outColor;

    uniform sampler2D uCuts;
    uniform sampler2D uGrid;
    uniform int   uN;
    uniform vec3  uHalf;
    uniform int   uShape;
    uniform int   uDTOn;
    uniform int   uDTAxis;
    uniform vec4  uDT;
    uniform vec3  uBMin, uBMax;
    uniform vec2  uGridMin, uGridInv;
    uniform vec3  uCol, uSpec;
    uniform float uShine, uGrain, uOpacity, uSelect, uFlash, uMirror;

    // Nano sweep — the blank carries two finishes at once and a moving front
    // decides which one each point wears. Slot A is what it had, B what it is
    // becoming; when nothing is running the two are identical.
    uniform vec3  uColB, uSpecB;
    uniform float uShineB, uGrainB;
    uniform vec3  uSwDir, uSwU, uSwV;
    uniform float uSwMin, uSwMax, uSwProgress, uSwActive, uSwOn, uSwTime;
    uniform float uSwBand, uSwCell, uSwJitter;

    // Disintegration — same front, but it erases instead of re-skinning.
    uniform vec3  uDisDir, uDisU, uDisV;
    uniform float uDisMin, uDisMax, uDisT, uDisShow, uDisOn;
    uniform float uDisBand, uDisCell, uDisJitter;
    uniform mat4  uInvModel, uModel, uProjView;
    uniform vec3  uCamDirW;
    uniform float uOrtho, uBackoff, uScale;
    uniform int   uSteps;
    uniform int   uFast;

    const float MAXD = 1e9;

    float hash13(vec3 q){ return fract(sin(dot(q, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float noise3(vec3 p){
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float n = 0.0;
      for (int k = 0; k < 8; k++) {
        vec3 o = vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
        float w = mix(1.0 - o.x, o.x, f.x) * mix(1.0 - o.y, o.y, f.y) * mix(1.0 - o.z, o.z, f.z);
        n += w * hash13(i + o);
      }
      return n;
    }

    float sd2seg(vec2 p, vec2 a, vec2 b, out float h){
      vec2 pa = p - a, ba = b - a;
      float bb = dot(ba, ba);
      if (bb < 1e-8) { h = -1.0; return length(pa); }
      h = clamp(dot(pa, ba) / bb, 0.0, 1.0);
      return length(pa - ba * h);
    }
    float sdCapsule(vec3 p, vec3 a, vec3 b, float r){
      vec3 pa = p - a, ba = b - a;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
      return length(pa - ba * h) - r;
    }
    float sdBox(vec3 p, vec3 b){
      vec3 q = abs(p) - b;
      return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
    }

    float cutCore(vec2 pp, float pz, vec2 a2, float az, vec2 b2, float bz,
                  float r, int ty){
      float h;
      float dc  = sd2seg(pp, a2, b2, h);
      float dxy = dc - r;
      float tz, cosr = 1.0;
      if (h < 0.0) {
        tz = min(az, bz);
      } else if (abs(bz - az) < 1e-6) {
        tz = az;
      } else {
        float L    = length(b2 - a2);
        float span = (L > 1e-6) ? sqrt(max(r * r - dc * dc, 0.0)) / L : 0.0;
        tz = mix(az, bz, clamp(h + (az > bz ? span : -span), 0.0, 1.0));

        float g = clamp((bz - az) / max(L, 1e-6), -4.0, 4.0);
        cosr = inversesqrt(1.0 + g * g);
      }

      if (ty == 2) {
        float rr = length(pp - a2);
        return max(rr - r, (tz + rr * 0.6 - pz) * 0.857);
      }
      if (ty == 0) {
        vec3 ca = vec3(a2, az + r), cb = vec3(b2, bz + r);
        float dcap = sdCapsule(vec3(pp, pz), ca, cb, r);

        float dsh  = max(dxy, (tz + r - pz) * cosr);
        return min(dcap, dsh);
      }
      float cr = min(0.35, r * 0.12);
      vec2 q2 = vec2(dxy, (tz - pz) * cosr) + cr;
      return min(max(q2.x, q2.y), 0.0) + length(max(q2, 0.0)) - cr;
    }

    void toolFrame(vec3 n, out vec3 u, out vec3 v){
      float s = n.z >= 0.0 ? 1.0 : -1.0;
      float a = -1.0 / (s + n.z);
      float b = n.x * n.y * a;
      u = vec3(1.0 + s * n.x * n.x * a, s * b, -s * n.x);
      v = vec3(b, s + n.y * n.y * a, -n.y);
    }

    float cutSDF(vec3 p, vec4 A, vec4 B, vec3 w){
      int ty = int(B.w + 0.5);
      if (w.z > 0.999995)
        return cutCore(p.xy, p.z, A.xy, A.z, B.xy, B.z, A.w, ty);
      vec3 u, v;
      toolFrame(w, u, v);
      return cutCore(vec2(dot(p, u), dot(p, v)), dot(p, w),
                     vec2(dot(A.xyz, u), dot(A.xyz, v)), dot(A.xyz, w),
                     vec2(dot(B.xyz, u), dot(B.xyz, v)), dot(B.xyz, w),
                     A.w, ty);
    }

    ivec2 cutAt(int i, int k){
      return ivec2(((i &${CUT_ROW - 1}) << 2) + k, i >>${Math.log2(CUT_ROW)});
    }

    float cutsGlobal(vec3 p){
      float d = MAXD;
      for (int i = 0; i < uN; i++) {
        vec4 S = texelFetch(uCuts, cutAt(i, 2), 0);
        if (length(p - S.xyz) - S.w >= d) continue;
        d = min(d, cutSDF(p, texelFetch(uCuts, cutAt(i, 0), 0),
                             texelFetch(uCuts, cutAt(i, 1), 0),
                             texelFetch(uCuts, cutAt(i, 3), 0).xyz));
      }
      return d;
    }

    float mapCuts(vec3 p){
      if (uN == 0) return MAXD;
      vec3 c = clamp(p, uBMin, uBMax);
      float bd = length(p - c);
      if (bd > 0.001) return bd;
      vec2 gc = clamp((p.xy - uGridMin) * uGridInv,
                      vec2(0.0), vec2(float(${GW}) - 0.001, float(${GH}) - 0.001));
      ivec2 gi = ivec2(gc);

      int grow = gi.y *${GROWS};
      int cnt = int(texelFetch(uGrid, ivec2(gi.x, grow), 0).x + 0.5);
      if (cnt >${KSLOT}) return cutsGlobal(p);
      float d = MAXD;
      for (int s = 0; s < cnt; s++) {

        int pk = int(texelFetch(uGrid, ivec2(gi.x, grow + 1 + (s >> 3)), 0)[(s >> 1) & 3] + 0.5);
        int i = ((s & 1) == 0) ? (pk >>${SLOT_BITS}) : (pk &${SLOT_SCALE - 1});
        vec4 S = texelFetch(uCuts, cutAt(i, 2), 0);
        if (length(p - S.xyz) - S.w >= d) continue;
        d = min(d, cutSDF(p, texelFetch(uCuts, cutAt(i, 0), 0),
                             texelFetch(uCuts, cutAt(i, 1), 0),
                             texelFetch(uCuts, cutAt(i, 3), 0).xyz));
      }
      vec2 cs = vec2(1.0) / uGridInv;
      vec2 fr = fract(gc);
      float border = min(min(fr.x, 1.0 - fr.x) * cs.x, min(fr.y, 1.0 - fr.y) * cs.y) + min(cs.x, cs.y);
      return min(d, border);
    }

    float sdDovetail(vec3 p){
      float along  = (uDTAxis == 0) ? p.x : p.y;
      float across = (uDTAxis == 0) ? p.y : p.x;
      float tanA = uDT.w;
      float slant = (abs(across) + p.z * tanA - uDT.y) * inversesqrt(1.0 + tanA * tanA);
      // Run the top of the dovetail up inside the billet rather than stopping
      // flush at z = 0. The block's bottom edge is radiused by EB, so a
      // dovetail that stopped level with it left a slot of daylight between
      // the two; burying it clears that without changing the visible form.
      return max(max(p.z - EB * 2.0, -uDT.z - p.z), max(abs(along) - uDT.x, slant));
    }

    float sdStock(vec3 p){
      vec3 q = p - vec3(0.0, 0.0, uHalf.z);
      float d;
      if (uShape == 0) d = sdBox(q, uHalf - EB) - EB;
      else {
        vec2 w = vec2(length(q.xy) - (uHalf.x - EB), abs(q.z) - (uHalf.z - EB));
        d = min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - EB;
      }
      if (uDTOn == 1) d = min(d, sdDovetail(p));
      return d;
    }
    float sdPart(vec3 p){ return max(sdStock(p), -mapCuts(p)); }

    vec3 calcN(vec3 p){
      vec2 e = vec2(1.0, -1.0) * (0.0015 * uHalf.z + 0.01);
      return normalize(e.xyy * sdPart(p + e.xyy) + e.yyx * sdPart(p + e.yyx)
                     + e.yxy * sdPart(p + e.yxy) + e.xxx * sdPart(p + e.xxx));
    }
    vec2 iBox(vec3 ro, vec3 rd, vec3 mn, vec3 mx){
      vec3 t1 = (mn - ro) / rd, t2 = (mx - ro) / rd;
      vec3 a = min(t1, t2), b = max(t1, t2);
      return vec2(max(max(a.x, a.y), a.z), min(min(b.x, b.y), b.z));
    }

    float ao(vec3 p, vec3 n){
      if (uFast == 1) return 1.0;
      float o = 0.0, w = 1.0, s = uHalf.z * 0.10 + 0.6;
      for (int i = 1; i <= 3; i++) {
        float h = s * float(i);
        o += w * (h - sdPart(p + n * h));
        w *= 0.62;
      }
      return clamp(1.0 - 0.14 * o / s, 0.15, 1.0);
    }

    float hash21(vec2 q){
      q = fract(q * vec2(123.34, 456.21));
      q += dot(q, q + 45.32);
      return fract(q.x * q.y);
    }

    // Two finishes on one solid. A face the cutter has been over comes off
    // bright and even; everything else is still the skin the bar arrived in —
    // saw marks, scale and the blotch of a mill finish, several times coarser.
    float grainAt(vec3 p, float g, bool cutFace){
      if (cutFace) return 1.06 + 0.04 * noise3(p * vec3(2.2, 2.2, 9.0));

      // As-arrived: a coarse blotch, a fine tooth on top, and the per-metal
      // character underneath.
      float rough = 0.78 + 0.30 * noise3(p * 1.5);
      rough *= 0.90 + 0.19 * noise3(p * 11.0);
      if (g < 0.5)       rough *= 0.93 + 0.13 * noise3(vec3(p.x * 0.7, p.y * 26.0, p.z * 0.7));
      else if (g < 1.5)  rough *= 0.88 + 0.22 * noise3(p * 0.55);
      else               rough *= 0.92 + 0.14 * noise3(p * 7.0);
      return rough;
    }

    vec3 shade(vec3 p, vec3 n, vec3 rd, bool cutFace){

      // --- how far along the sweep does this point sit? 0 start, 1 end ---
      float st = clamp((dot(p, uSwDir) - uSwMin) / max(uSwMax - uSwMin, 0.0001), 0.0, 1.0);
      vec2  suv  = vec2(dot(p, uSwU), dot(p, uSwV));
      vec2  cell = floor(suv * uSwCell);
      float rnd  = hash21(cell);
      float front = mix(-uSwBand, 1.0 + uSwBand, uSwProgress);
      float e = st - (front + (rnd - 0.5) * uSwJitter);
      float conv = 1.0 - smoothstep(-0.006, 0.006, e);

      float gA = grainAt(p, uGrain, cutFace);
      float gB = (uSwOn > 0.5) ? grainAt(p, uGrainB, cutFace) : gA;

      vec3  base  = mix(uCol * gA, uColB * gB, conv);
      vec3  spec  = mix(uSpec, uSpecB, conv);
      float shine = mix(uShine, uShineB, conv);

      // --- rough where nothing has touched it, finished where it has ---
      // The signed distance function has no idea a face is rough, so the tooth
      // goes on the normal: an as-arrived skin scatters, a machined face is
      // left flat and takes the highlight cleanly.
      if (!cutFace) {
        vec3 tooth = vec3(noise3(p * 26.0 + vec3(11.3, 0.0, 0.0)),
                          noise3(p * 26.0 + vec3(0.0, 31.7, 0.0)),
                          noise3(p * 26.0 + vec3(0.0, 0.0, 57.1))) - 0.5;
        vec3 swell = vec3(noise3(p * 4.5 + vec3(3.0)),
                          noise3(p * 4.5 + vec3(19.0)),
                          noise3(p * 4.5 + vec3(41.0))) - 0.5;
        n = normalize(n + tooth * 0.20 + swell * 0.11);
        spec  *= 0.42;
        shine *= 0.30;
      } else {
        spec  *= 1.20;
        shine  = shine * 1.9 + 12.0;
      }

      vec3 L = normalize(vec3(0.42, 0.62, 0.78));
      float dif = max(dot(n, L), 0.0);
      float amb = 0.19 + 0.11 * max(n.z, 0.0);
      float occ = ao(p, n);
      vec3 h = normalize(L - rd);
      float spe = pow(max(dot(n, h), 0.0), max(shine, 1.0)) * (cutFace ? 0.52 : 0.20);
      float fres = pow(1.0 - max(dot(n, -rd), 0.0), 4.0) * (cutFace ? 0.15 : 0.07);
      vec3 col = base * (amb + dif * 0.62) * occ + spec * spe + spec * fres;

      // --- the machined faces take a polish ---
      // A cut wall, floor or pocket comes off the cutter far brighter than the
      // skin the bar arrived with. Reflecting the sky by the surface normal
      // costs nothing extra, so it runs at every quality; High just leans on
      // it harder.
      if (cutFace) {
        vec3 r = reflect(rd, n);
        float sky = clamp(r.z * 0.5 + 0.5, 0.0, 1.0);
        vec3 env = mix(vec3(0.05, 0.06, 0.08), vec3(0.62, 0.70, 0.82), sky * sky);
        float edge = pow(1.0 - max(dot(n, -rd), 0.0), 2.5);
        float polish = (0.34 + 0.42 * edge) * (uMirror > 0.5 ? 1.0 : 0.55);
        col = mix(col, env * (0.45 + 0.55 * base / max(max(base.r, base.g), max(base.b, 0.001))), polish);
        col += spec * pow(max(dot(n, h), 0.0), shine * 4.0 + 40.0) * 0.9;
      }

      // --- the construction front: cells lighting up in the incoming metal,
      //     tinted with that metal rather than pushed toward white ---
      if (uSwActive > 0.001) {
        float glow    = exp(-abs(e) / max(uSwBand * 0.55, 0.001));
        vec2  fr      = fract(suv * uSwCell);
        float mesh    = step(0.88, max(fr.x, fr.y));
        float twinkle = step(0.62, hash21(cell + floor(uSwTime * 18.0)));
        float energy  = clamp(glow * 0.55 + mesh * glow * 0.5 + twinkle * glow * 0.3, 0.0, 1.0);
        col = mix(col, uColB * 1.15, uSwActive * energy);
      }

      col = mix(col, vec3(0.33, 0.79, 0.54), uFlash * 0.85);
      return mix(col, vec3(0.28, 0.52, 0.80), uSelect * 0.45);
    }

    void main(){

      vec3 roW, rdW;
      if (uOrtho > 0.5) { rdW = uCamDirW; roW = vWorld - rdW * uBackoff; }
      else { rdW = normalize(vWorld - cameraPosition); roW = cameraPosition; }
      vec3 ro = (uInvModel * vec4(roW, 1.0)).xyz;
      vec3 rd = normalize((uInvModel * vec4(rdW, 0.0)).xyz);

      vec3 mn = uShape == 0 ? -uHalf : vec3(-uHalf.x, -uHalf.y, 0.0);
      vec3 mx = uHalf;

      mn.z = (uDTOn == 1) ? -uDT.z : 0.0;
      mx.z = uHalf.z * 2.0;
      vec2 bb = iBox(ro, rd, mn - 0.05, mx + 0.05);
      if (bb.y < max(bb.x, 0.0)) discard;

      float t = max(bb.x, 0.0), tmax = bb.y + 0.02;
      float eps = 0.0012 * uHalf.z + 0.004;
      bool hit = false, left = false;
      for (int i = 0; i < 256; i++) {
        if (i >= uSteps) break;
        vec3 p = ro + rd * t;
        float d = sdPart(p);
        if (d < eps) { hit = true; break; }
        t += d * 0.9;
        if (t > tmax) { left = true; break; }
      }

      if (left) discard;

      vec3 p = ro + rd * t;

      if (uDisOn > 0.5) {
        float dt = clamp((dot(p, uDisDir) - uDisMin) / max(uDisMax - uDisMin, 0.0001), 0.0, 1.0);
        vec2 duv = vec2(dot(p, uDisU), dot(p, uDisV));
        float drnd = hash21(floor(duv * uDisCell));
        float dfront = mix(-uDisBand, 1.0 + uDisBand, uDisT);
        float de = dt - dfront - (drnd - 0.5) * uDisJitter;
        float dhide = smoothstep(-0.006, 0.006, de);
        if (mix(dhide, 1.0 - dhide, uDisShow) < 0.5) discard;
      }

      bool cutFace = sdStock(p) < -eps * 3.0;
      vec3 n = calcN(p);
      vec3 col = shade(p, n, rd, cutFace);

      vec4 clip = uProjView * (uModel * vec4(p, 1.0));
      gl_FragDepth = (clip.z / clip.w) * 0.5 + 0.5;
      outColor = vec4(col, uOpacity);
    }`.replace(/EB/g, EDGE_BREAK.toFixed(3));

  function make(def) {
    const cutData = new Float32Array(MAX_CUTS * 4 * 4);
    const cutTex = new THREE.DataTexture(cutData, CUT_W, CUT_H, THREE.RGBAFormat, THREE.FloatType);
    cutTex.minFilter = cutTex.magFilter = THREE.NearestFilter;
    cutTex.generateMipmaps = false;
    cutTex.needsUpdate = true;

    const gridData = new Float32Array(GW * GH * GROWS * 4);
    const gridTex = new THREE.DataTexture(gridData, GW, GH * GROWS, THREE.RGBAFormat, THREE.FloatType);
    gridTex.minFilter = gridTex.magFilter = THREE.NearestFilter;
    gridTex.generateMipmaps = false;
    gridTex.needsUpdate = true;

    return {
      def, cuts: [], cutData, cutTex,
      gridCounts: new Int32Array(GCELLS), gridData, gridTex,
      bmin: [1e9, 1e9, 1e9], bmax: [-1e9, -1e9, -1e9],
      full: false,
    };
  }

  const halfOf = d => d.shape === "cyl"
    ? [d.dia / 2, d.dia / 2, d.len / 2]
    : [d.sx / 2, d.sy / 2, d.sz / 2];

  const DT_DEFAULT = () => ({ on: false, along: "x", w: 1.250 * MM_PER_IN,
                              h: 0.125 * MM_PER_IN, angle: 45 });
  function dovetailOf(def) {
    const d = Object.assign(DT_DEFAULT(), def.dovetail || {});
    if (!d.on || def.shape === "cyl") return null;
    const half = halfOf(def);
    const tan = Math.tan(Math.max(0, Math.min(70, d.angle)) * Math.PI / 180);
    const foot = Math.max(d.w, 0.2) / 2;
    const h = Math.max(d.h, 0.05);
    const along = d.along === "y" ? 1 : 0;

    const across = along === 0 ? half[1] : half[0];
    const footC = Math.min(foot, across);
    const root = Math.max(footC - h * tan, 0.1);
    return { axis: along, halfLen: along === 0 ? half[0] : half[1], root, h, tan };
  }

  function applyDovetail(def, mat) {
    const u = mat && mat.uniforms;
    if (!u || !u.uDT) return;
    const d = dovetailOf(def);
    u.uDTOn.value = d ? 1 : 0;
    if (!d) return;
    u.uDTAxis.value = d.axis;
    u.uDT.value.set(d.halfLen, d.root, d.h, d.tan);
  }

  function proxy(def) {
    const h = halfOf(def);
    let g;
    if (def.shape === "cyl") {
      g = new THREE.CylinderGeometry(h[0], h[0], h[2] * 2, 64, 1);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, h[2]);
      return Geo.bake(g);
    }

    const dt = dovetailOf(def);
    const drop = dt ? dt.h : 0;
    g = new THREE.BoxGeometry(h[0] * 2, h[1] * 2, h[2] * 2 + drop);
    g.translate(0, 0, h[2] - drop / 2);
    return Geo.bake(g);
  }

  function material(rec) {
    const m = METALS[rec.def.metal] || METALS.aluminum;
    const h = halfOf(rec.def);
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.DoubleSide, transparent: false,
      uniforms: {
        uCuts: { value: rec.cutTex }, uGrid: { value: rec.gridTex },
        uN: { value: 0 },
        uHalf: { value: new THREE.Vector3(h[0], h[1], h[2]) },
        uShape: { value: rec.def.shape === "cyl" ? 1 : 0 },
        uDTOn: { value: 0 }, uDTAxis: { value: 0 },
        uDT: { value: new THREE.Vector4(0, 0, 0, 1) },
        uBMin: { value: new THREE.Vector3() }, uBMax: { value: new THREE.Vector3() },
        uGridMin: { value: new THREE.Vector2() }, uGridInv: { value: new THREE.Vector2(1, 1) },
        uCol: { value: new THREE.Vector3().fromArray(m.col) },
        uSpec: { value: new THREE.Vector3().fromArray(m.spec) },
        uShine: { value: m.shine }, uGrain: { value: m.grain },

        uColB: { value: new THREE.Vector3().fromArray(m.col) },
        uSpecB: { value: new THREE.Vector3().fromArray(m.spec) },
        uShineB: { value: m.shine }, uGrainB: { value: m.grain },
        uSwDir: { value: new THREE.Vector3(0, 0, -1) },
        uSwU: { value: new THREE.Vector3(1, 0, 0) },
        uSwV: { value: new THREE.Vector3(0, 1, 0) },
        uSwMin: { value: -1 }, uSwMax: { value: 1 },
        uSwProgress: { value: 1 }, uSwActive: { value: 0 },
        uSwOn: { value: 0 }, uSwTime: { value: 0 },
        uSwBand: { value: SWEEP.band },
        uSwCell: { value: 1 }, uSwJitter: { value: SWEEP.jitter },

        uDisDir: { value: new THREE.Vector3(0, 0, -1) },
        uDisU: { value: new THREE.Vector3(1, 0, 0) },
        uDisV: { value: new THREE.Vector3(0, 1, 0) },
        uDisMin: { value: -1 }, uDisMax: { value: 1 },
        uDisT: { value: 1 }, uDisShow: { value: 1 }, uDisOn: { value: 0 },
        uDisBand: { value: 0.10 }, uDisCell: { value: 1 }, uDisJitter: { value: 0.055 },

        uOpacity: { value: 1 }, uSelect: { value: 0 }, uFlash: { value: 0 },
        uMirror: { value: 1 },
        uInvModel: { value: new THREE.Matrix4() },
        uModel: { value: new THREE.Matrix4() },
        uProjView: { value: new THREE.Matrix4() },
        uCamDirW: { value: new THREE.Vector3(0, 0, -1) },
        uOrtho: { value: 1 }, uBackoff: { value: 1000 }, uScale: { value: 1 },
        uSteps: { value: rec.def.steps || 128 },
        uFast: { value: 0 },
      },
    });
  }

  /* Aim the sweep down the billet's own body diagonal — it starts on the top
     far corner and finishes on the bottom near one — and measure how far the
     solid reaches that way so progress 0..1 covers exactly the whole blank. */
  function aimSweep(u, def) {
    const h = halfOf(def);
    const lo = new THREE.Vector3(-h[0], -h[1], 0);
    const hi = new THREE.Vector3(h[0], h[1], h[2] * 2);

    const d = new THREE.Vector3(h[0], h[1], -h[2]).normalize();
    const up = Math.abs(d.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const uAx = new THREE.Vector3().crossVectors(d, up).normalize();
    const vAx = new THREE.Vector3().crossVectors(d, uAx).normalize();

    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Vector3(i & 1 ? hi.x : lo.x, i & 2 ? hi.y : lo.y, i & 4 ? hi.z : lo.z);
      const t = c.dot(d);
      if (t < min) min = t;
      if (t > max) max = t;
    }

    u.uSwDir.value.copy(d);
    u.uSwU.value.copy(uAx);
    u.uSwV.value.copy(vAx);
    u.uSwMin.value = min;
    u.uSwMax.value = max;
    u.uSwCell.value = SWEEP.cellsAcross /
      Math.max(2 * h[0], 2 * h[1], 2 * h[2], 1);
  }

  function gridExtent(rec) {
    const h = halfOf(rec.def);
    rec.gminx = -h[0] - h[0] * 0.25 - 2;
    rec.gminy = -h[1] - h[1] * 0.25 - 2;
    rec.gcw = (2 * h[0] * 1.25 + 4) / GW;
    rec.gch = (2 * h[1] * 1.25 + 4) / GH;
  }

  function insertGrid(rec, i) {
    const c = rec.cuts[i];

    if (c.dead) return;
    const e = c.r + 0.8;
    c.gx = c.bx; c.gy = c.by; c.gz = c.bz;

    const x0 = (c.qx0 === undefined ? Math.min(c.ax, c.bx) : c.qx0) - e;
    const x1 = (c.qx1 === undefined ? Math.max(c.ax, c.bx) : c.qx1) + e;
    const y0 = (c.qy0 === undefined ? Math.min(c.ay, c.by) : c.qy0) - e;
    const y1 = (c.qy1 === undefined ? Math.max(c.ay, c.by) : c.qy1) + e;
    const cx0 = Math.max(0, Math.floor((x0 - rec.gminx) / rec.gcw) - 1);
    const cx1 = Math.min(GW - 1, Math.floor((x1 - rec.gminx) / rec.gcw) + 1);
    const cy0 = Math.max(0, Math.floor((y0 - rec.gminy) / rec.gch) - 1);
    const cy1 = Math.min(GH - 1, Math.floor((y1 - rec.gminy) / rec.gch) + 1);

    const had = c.gc;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (had && cx >= had[0] && cx <= had[2] && cy >= had[1] && cy <= had[3]) continue;
      const cell = cy * GW + cx;
      const n = rec.gridCounts[cell]++;

      const base = gTexel(cx, cy, 0);
      if (n < KSLOT) {
        const comp = (base + (1 + (n >> 3)) * GW) * 4 + ((n >> 1) & 3);
        if ((n & 1) === 0) rec.gridData[comp] = i * SLOT_SCALE;
        else                rec.gridData[comp] += i;
      }
      rec.gridData[base * 4] = rec.gridCounts[cell];
    }
    c.gc = had
      ? [Math.min(cx0, had[0]), Math.min(cy0, had[1]), Math.max(cx1, had[2]), Math.max(cy1, had[3])]
      : [cx0, cy0, cx1, cy1];
    rec.gridDirty = true;
  }
  function rebuildGrid(rec) {
    rec.gridCounts.fill(0);
    rec.gridData.fill(0);
    gridExtent(rec);

    for (let i = 0; i < rec.cuts.length; i++) rec.cuts[i].gc = null;

    rec.bmin = [1e9, 1e9, 1e9]; rec.bmax = [-1e9, -1e9, -1e9];
    for (let i = 0; i < rec.cuts.length; i++) {
      if (!rec.cuts[i].dead) bound(rec, rec.cuts[i]);
      writeTexel(rec, i);
      insertGrid(rec, i);
    }
    rec.deadSinceRebuild = 0;
    rec.gridDirty = true;
  }

  function writeTexel(rec, i) {
    const c = rec.cuts[i], o = i * 16, d = rec.cutData;
    d[o] = c.ax; d[o + 1] = c.ay; d[o + 2] = c.az; d[o + 3] = c.r;
    d[o + 4] = c.bx; d[o + 5] = c.by; d[o + 6] = c.bz; d[o + 7] = c.type;

    if (c.dead) { d[o + 8] = 0; d[o + 9] = 0; d[o + 10] = 0; d[o + 11] = -1e18; }
    else { d[o + 8] = c.sx; d[o + 9] = c.sy; d[o + 10] = c.sz; d[o + 11] = c.sr; }
    d[o + 12] = c.wx; d[o + 13] = c.wy; d[o + 14] = c.wz; d[o + 15] = 0;
    rec.texDirty = true;
  }

  const LOOKBACK = 256;

  function swallows(c, o) {
    if (o.dead) return false;
    if (o.type !== c.type) return false;
    if (Math.abs(o.r - c.r) > 1e-6) return false;

    if (o.wx * c.wx + o.wy * c.wy + o.wz * c.wz < 0.999999) return false;

    const eps = Math.max(c.r * 0.02, 1e-4);
    const across = (px, py, pz, qx, qy, qz) => {
      const dx = px - qx, dy = py - qy, dz = pz - qz;
      const up = dx * c.wx + dy * c.wy + dz * c.wz;
      return Math.hypot(dx - up * c.wx, dy - up * c.wy, dz - up * c.wz);
    };
    if (across(o.ax, o.ay, o.az, c.ax, c.ay, c.az) > eps) return false;
    if (across(o.bx, o.by, o.bz, c.bx, c.by, c.bz) > eps) return false;

    const up = (x, y, z) => x * c.wx + y * c.wy + z * c.wz;
    if (up(c.ax, c.ay, c.az) > up(o.ax, o.ay, o.az) + 1e-9) return false;
    if (up(c.bx, c.by, c.bz) > up(o.bx, o.by, o.bz) + 1e-9) return false;
    return true;
  }

  function supersede(rec, k) {
    const c = rec.cuts[k];
    if (!c || c.dead) return;
    const stop = Math.max(0, k - LOOKBACK);
    let killed = 0;
    for (let j = k - 1; j >= stop; j--) {
      const o = rec.cuts[j];
      if (!swallows(c, o)) continue;
      o.dead = true;

      o.deadAt = (c.te === undefined) ? c.t : c.te;
      writeTexel(rec, j);
      killed++;
    }
    if (!killed) return;
    rec.deadSinceRebuild = (rec.deadSinceRebuild || 0) + killed;

    if (rec.deadSinceRebuild >= 48) rebuildGrid(rec);
  }

  function stockBox(rec) {
    const h = halfOf(rec.def);
    const dt = dovetailOf(rec.def);
    return { mn: [-h[0], -h[1], dt ? -dt.h : 0], mx: [h[0], h[1], h[2] * 2] };
  }

  function shankOut(r, wx, wy, wz) {
    return [r * Math.sqrt(Math.max(0, 1 - wx * wx)),
            r * Math.sqrt(Math.max(0, 1 - wy * wy)),
            r * Math.sqrt(Math.max(0, 1 - wz * wz))];
  }

  function exitAlong(box, inf, px, py, pz, wx, wy, wz) {
    const p = [px, py, pz], w = [wx, wy, wz];
    let tn = -Infinity, tf = Infinity;
    for (let k = 0; k < 3; k++) {
      const lo = box.mn[k] - inf[k], hi = box.mx[k] + inf[k];
      if (Math.abs(w[k]) < 1e-9) {
        if (p[k] < lo || p[k] > hi) return 0;
        continue;
      }
      const t1 = (lo - p[k]) / w[k], t2 = (hi - p[k]) / w[k];
      tn = Math.max(tn, Math.min(t1, t2));
      tf = Math.min(tf, Math.max(t1, t2));
    }

    if (tf === Infinity || tn > tf) return 0;
    return Math.max(tf, 0);
  }

  function bound(rec, c) {
    const box = stockBox(rec);
    const inf = shankOut(c.r, c.wx, c.wy, c.wz);
    const la = exitAlong(box, inf, c.ax, c.ay, c.az, c.wx, c.wy, c.wz);
    const lb = exitAlong(box, inf, c.bx, c.by, c.bz, c.wx, c.wy, c.wz);
    const pad = c.r + 0.8;

    const clip = (v, k) => Math.max(box.mn[k] - inf[k] - CLIP_M,
                           Math.min(box.mx[k] + inf[k] + CLIP_M, v));
    let x0 = Math.min(c.ax, c.bx, c.ax + c.wx * la, c.bx + c.wx * lb);
    let x1 = Math.max(c.ax, c.bx, c.ax + c.wx * la, c.bx + c.wx * lb);
    let y0 = Math.min(c.ay, c.by, c.ay + c.wy * la, c.by + c.wy * lb);
    let y1 = Math.max(c.ay, c.by, c.ay + c.wy * la, c.by + c.wy * lb);
    let z0 = Math.min(c.az, c.bz, c.az + c.wz * la, c.bz + c.wz * lb);
    let z1 = Math.max(c.az, c.bz, c.az + c.wz * la, c.bz + c.wz * lb);
    x0 = clip(x0, 0); x1 = clip(x1, 0);
    y0 = clip(y0, 1); y1 = clip(y1, 1);
    z0 = clip(z0, 2); z1 = clip(z1, 2);

    c.qx0 = x0; c.qx1 = x1; c.qy0 = y0; c.qy1 = y1;
    c.sx = (x0 + x1) / 2; c.sy = (y0 + y1) / 2; c.sz = (z0 + z1) / 2;
    c.sr = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + pad;
    rec.bmin[0] = Math.min(rec.bmin[0], x0 - pad);
    rec.bmax[0] = Math.max(rec.bmax[0], x1 + pad);
    rec.bmin[1] = Math.min(rec.bmin[1], y0 - pad);
    rec.bmax[1] = Math.max(rec.bmax[1], y1 + pad);
    rec.bmin[2] = Math.min(rec.bmin[2], z0 - pad);
    rec.bmax[2] = Math.max(rec.bmax[2], z1 + pad);
  }

  function addCut(rec, a, b, r, type, t, te, w) {
    if (rec.cuts.length >= MAX_CUTS) { rec.full = true; return -1; }

    if (rec.cuts.length) supersede(rec, rec.cuts.length - 1);
    const c = { ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, r, type,
                wx: w ? w.x : 0, wy: w ? w.y : 0, wz: w ? w.z : 1,
                t, te: (te === undefined ? t : te) };
    bound(rec, c);
    rec.cuts.push(c);
    const i = rec.cuts.length - 1;
    writeTexel(rec, i);
    insertGrid(rec, i);
    return i;
  }

  function extendCut(rec, i, b, te) {
    const c = rec.cuts[i];
    if (!c) return;
    c.bx = b.x; c.by = b.y; c.bz = b.z;
    if (te !== undefined) c.te = te;
    bound(rec, c);
    writeTexel(rec, i);
    const gx = (c.gx === undefined) ? c.bx : c.gx;
    const gy = (c.gy === undefined) ? c.by : c.gy;
    const gz = (c.gz === undefined) ? c.bz : c.gz;
    const since = Math.abs(c.bx - gx) + Math.abs(c.by - gy) + Math.abs(c.bz - gz);
    if (since > Math.min(rec.gcw, rec.gch) * 0.5) insertGrid(rec, i);
  }

  function truncate(rec, t) {
    let changed = false;
    const keep = [];

    for (const c of rec.cuts) {
      if (c.dead && c.deadAt !== undefined && c.deadAt >= t) {
        c.dead = false; c.deadAt = undefined; changed = true;
      }
    }
    for (const c of rec.cuts) {
      if (c.t >= t) { changed = true; continue; }
      const te = (c.te === undefined) ? c.t : c.te;
      if (te > t) {
        const f = (t - c.t) / Math.max(te - c.t, 1e-9);
        c.bx = c.ax + (c.bx - c.ax) * f;
        c.by = c.ay + (c.by - c.ay) * f;
        c.bz = c.az + (c.bz - c.az) * f;
        c.te = t;
        changed = true;
      }
      keep.push(c);
    }
    if (!changed) return false;
    rec.cuts.length = 0;
    rec.bmin = [1e9, 1e9, 1e9]; rec.bmax = [-1e9, -1e9, -1e9];
    keep.forEach(c => { bound(rec, c); rec.cuts.push(c); });
    for (let i = 0; i < rec.cuts.length; i++) writeTexel(rec, i);
    rebuildGrid(rec);
    rec.full = false;
    return true;
  }
  function clearCuts(rec) {
    rec.cuts.length = 0;
    rec.bmin = [1e9, 1e9, 1e9]; rec.bmax = [-1e9, -1e9, -1e9];
    rec.full = false;
    rebuildGrid(rec);
    rec.texDirty = true;
  }

  function upload(rec, mat) {
    if (rec.texDirty) { rec.cutTex.needsUpdate = true; rec.texDirty = false; }
    if (rec.gridDirty) { rec.gridTex.needsUpdate = true; rec.gridDirty = false; }
    const u = mat.uniforms;
    u.uN.value = rec.cuts.length;
    if (rec.cuts.length) {
      u.uBMin.value.set(rec.bmin[0], rec.bmin[1], rec.bmin[2]);
      u.uBMax.value.set(rec.bmax[0], rec.bmax[1], rec.bmax[2]);
    }
    u.uGridMin.value.set(rec.gminx, rec.gminy);
    u.uGridInv.value.set(1 / rec.gcw, 1 / rec.gch);
  }

  return { MAX_CUTS, METALS, METAL_CHOICES, SWEEP, aimSweep,
           make, proxy, material, addCut, extendCut,
           truncate, clearCuts, rebuildGrid, upload, halfOf,
           dovetailOf, applyDovetail, DT_DEFAULT };
})();

const Store = (() => {
  const parts = [];
  let selected = null;
  let root = null;
  let seq = 0;

  const BODY_COLOR = 0x8b96a3;
  const EDGE_LIMIT = 250000;

  function ensureRoot() {
    if (!root) {
      root = new THREE.Group();
      root.name = "partModels";
      stageGroup.add(root);
    }
    return root;
  }

  let table = null, tableInner = null;
  function ensureTable() {
    if (!table) {
      table = new THREE.Group();
      table.name = "trunnionTable";
      table.rotation.order = "XYZ";
      tableInner = new THREE.Group();
      tableInner.name = "trunnionInner";
      table.add(tableInner);
      ensureRoot().add(table);
    }
    return tableInner;
  }

  function setTablePivot(v) {
    ensureTable();
    if (table.position.distanceToSquared(v) < 1e-12) return false;
    table.position.copy(v);
    tableInner.position.copy(v).multiplyScalar(-1);
    table.updateMatrixWorld(true);
    return true;
  }
  const tablePivot = () => (ensureTable(), table.position.clone());

  /* ============================================================
     Dissolve — solids do not blink in and out, they disintegrate.
     A front crosses the body on its diagonal and erases it a cell at a
     time; showing runs the same front the other way round. The maths is
     shared with the stock's re-skinning sweep, so a blank being hidden and
     a blank changing metal tear along the same grid.
     ============================================================ */
  const Dissolve = (() => {
    const SECONDS = 0.85, BAND = 0.10, JITTER = 0.055, CELLS = 26;

    const CHUNK = `
      uniform vec3  uDisDir, uDisU, uDisV;
      uniform float uDisMin, uDisMax, uDisT, uDisShow, uDisOn;
      uniform float uDisBand, uDisCell, uDisJitter;
      varying vec3 vDisPos;
      float disHash(vec2 q){
        q = fract(q * vec2(123.34, 456.21));
        q += dot(q, q + 45.32);
        return fract(q.x * q.y);
      }
      void disCut(){
        if (uDisOn < 0.5) return;
        float t = clamp((dot(vDisPos, uDisDir) - uDisMin) / max(uDisMax - uDisMin, 0.0001), 0.0, 1.0);
        vec2 uv = vec2(dot(vDisPos, uDisU), dot(vDisPos, uDisV));
        float rnd = disHash(floor(uv * uDisCell));
        float front = mix(-uDisBand, 1.0 + uDisBand, uDisT);
        float e = t - front - (rnd - 0.5) * uDisJitter;
        float hideMask = smoothstep(-0.006, 0.006, e);
        float solidNow = mix(hideMask, 1.0 - hideMask, uDisShow);
        if (solidNow < 0.5) discard;
      }`;

    function uniforms() {
      return {
        uDisDir:    { value: new THREE.Vector3(0, 0, -1) },
        uDisU:      { value: new THREE.Vector3(1, 0, 0) },
        uDisV:      { value: new THREE.Vector3(0, 1, 0) },
        uDisMin:    { value: -1 }, uDisMax: { value: 1 },
        uDisT:      { value: 1 }, uDisShow: { value: 1 }, uDisOn: { value: 0 },
        uDisBand:   { value: BAND }, uDisCell: { value: 1 }, uDisJitter: { value: JITTER },
      };
    }

    /* Standard three materials get the same chunk grafted in. */
    function attach(mat) {
      if (!mat || mat.userData.dissolve) return mat;
      const u = uniforms();
      mat.userData.dissolve = u;
      mat.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, u);
        shader.vertexShader = shader.vertexShader
          .replace("void main() {", "varying vec3 vDisPos;\nvoid main() {")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vDisPos = position;");
        shader.fragmentShader = shader.fragmentShader
          .replace("void main() {", CHUNK + "\nvoid main() {")
          .replace("#include <clipping_planes_fragment>",
                   "disCut();\n  #include <clipping_planes_fragment>");
      };
      /* Every material carrying this chunk compiles to the same program, so
         say so. Left to itself three keys the program cache on the source
         text of onBeforeCompile, which is the same string here — but being
         explicit costs nothing and makes sure a fresh material reuses the
         compiled program instead of building another one. Compiling a shader
         mid-animation is a stall you can see. */
      mat.customProgramCacheKey = () => "nanite-dissolve";
      mat.needsUpdate = true;
      return mat;
    }

    /* Aim the front down the body diagonal: it starts at one bottom corner
       and finishes at the opposite top corner.

       `dirIn` overrides that with an explicit direction, in the same local
       space the shader reads positions in. The front always travels from the
       low end of that direction to the high end, and hiding erases behind it
       — so handing this local "up" tears a thing away from the bottom up. */
    function aim(u, box, dirIn) {
      const size = new THREE.Vector3().subVectors(box.max, box.min);
      const d = dirIn
        ? dirIn.clone()
        : new THREE.Vector3(size.x, size.y, -size.z);
      if (d.lengthSq() < 1e-9) d.set(0, 0, -1);
      d.normalize();
      const up = Math.abs(d.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      const uAx = new THREE.Vector3().crossVectors(d, up).normalize();
      const vAx = new THREE.Vector3().crossVectors(d, uAx).normalize();

      let lo = Infinity, hi = -Infinity;
      let uLo = Infinity, uHi = -Infinity, vLo = Infinity, vHi = -Infinity;
      for (let i = 0; i < 8; i++) {
        const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x,
                                    i & 2 ? box.max.y : box.min.y,
                                    i & 4 ? box.max.z : box.min.z);
        const t = c.dot(d);
        if (t < lo) lo = t;
        if (t > hi) hi = t;
        const cu = c.dot(uAx), cv = c.dot(vAx);
        if (cu < uLo) uLo = cu;
        if (cu > uHi) uHi = cu;
        if (cv < vLo) vLo = cv;
        if (cv > vHi) vHi = cv;
      }
      u.uDisDir.value.copy(d);
      u.uDisU.value.copy(uAx);
      u.uDisV.value.copy(vAx);
      u.uDisMin.value = lo;
      u.uDisMax.value = hi;

      /* How big a nanite cell is.

         The cell grid does not live along the sweep — the shader lays it out
         in the plane across it, on uAxisU/uAxisV. So the number that decides
         how fine the front looks is how wide the body is in *that plane*, not
         how long the whole body is.

         For a sweep down the body diagonal those two are much the same, which
         is why the blank and the vise have always torn apart cleanly. For a
         sweep down the length of something long and thin they are nothing
         alike: the cutter is eight units long and half a unit across, so
         sizing the grid off its length gave it about one and a half cells
         across its diameter and it came away in slabs rather than in grains.
         Measured across the sweep it gets the same two dozen cells everything
         else does. The diagonal case is left exactly as it was. */
      const across = Math.max(uHi - uLo, vHi - vLo, 1e-4);
      u.uDisCell.value = dirIn
        ? CELLS / across
        : CELLS / Math.max(size.x, size.y, size.z, 1);
    }

    const slots = p => {
      const out = [];
      const take = m => {
        if (!m || !m.material) return;
        const mat = m.material;
        if (mat.uniforms && mat.uniforms.uDisT) out.push(mat.uniforms);
        else if (mat.userData && mat.userData.dissolve) out.push(mat.userData.dissolve);
      };
      take(p.mesh);
      p.members.forEach(m => take(m.mesh));
      return out;
    };

    /* Edge lines have no dissolve of their own, so a wireframe cage would hang
       in the air while the solid tore away. They go dark for the whole effect
       and come back only once the part is whole again. */
    function edges(p, on) {
      const set = e => { if (e) e.visible = on; };
      set(p.edges);
      p.members.forEach(m => set(m.edges));
    }

    /* One ticker drives every dissolve in flight. Per-part rAF loops were
       stacking up callbacks and each was walking the part tree again; this
       walks a flat list once a frame and writes only the uniforms that moved. */
    const live = new Map();
    let raf = 0;

    /* Ease the front rather than running it linearly: a constant-speed edge
       reads as a jolt at both ends, and any frame the browser drops shows up
       as a visible step. Time-based, so a dropped frame never stalls it. */
    const ease = t => t * t * (3 - 2 * t);

    /* The frame loop idles down to a few frames a second when nothing has
       happened for half a second. A dissolve runs entirely on its own clock
       with no input behind it, so it has to declare itself busy for as long
       as it lasts — otherwise the front crosses the first third of the solid
       smoothly and then steps across the rest. */
    const BUSY_KEY = "dissolve";

    function tick(now) {
      raf = 0;
      live.forEach((job, key) => {
        const raw = Math.min((now - job.t0) / job.ms, 1);
        const k = ease(raw);
        for (let i = 0; i < job.us.length; i++) job.us[i].uDisT.value = k;
        if (raw < 1) return;
        for (let i = 0; i < job.us.length; i++) job.us[i].uDisOn.value = 0;
        live.delete(key);
        if (key.members) {
          key._dis = 0;
          if (job.show) edges(key, true);
        }
        if (job.done) job.done();
      });
      if (live.size) { raf = requestAnimationFrame(tick); return; }
      if (holding) {
        holding = false;
        if (window.VPBusy) window.VPBusy.release(BUSY_KEY);
        if (typeof Quality !== "undefined" && Quality.hold) Quality.hold(false);
      }
    }

    /* Anything that has to happen once, before the clock starts.

       A material that has never been drawn compiles its program on the frame
       it is first rendered, and a compile mid-sweep is a stall you can see.
       Asking the renderer to compile the scene here pays that cost before t0
       is taken, so the front always starts on a warm frame. The auto quality
       setting is frozen for the same reason: a resolution change part-way
       through re-allocates the framebuffer. */
    function warm() {
      try {
        if (typeof mainRenderer !== "undefined" && mainRenderer.compile) {
          mainRenderer.compile(mainScene, mainCam);
        }
      } catch (e) {   }
    }

    /* One hold for however many dissolves are in flight — taken when the
       first starts and given back when the last finishes. Counting them up
       and only ever letting one go would leave the quality controller frozen
       for the rest of the session. */
    let holding = false;

    function start() {
      if (!holding) {
        holding = true;
        if (window.VPBusy) window.VPBusy.hold(BUSY_KEY);
        if (typeof Quality !== "undefined" && Quality.hold) Quality.hold(true);
      }
      if (!raf) raf = requestAnimationFrame(tick);
    }

    /* A billet with a dovetail is one solid, not a block with something stuck
       on underneath: the tenon is part of the same signed distance function.
       Aiming the front at the raymarched extent rather than the proxy box is
       what makes the two tear away on one diagonal. A plain blank has no
       tenon, so this is just the block. */
    function solidBox(p) {
      if (p.stock && typeof Stock !== "undefined" && Stock.halfOf) {
        const h = Stock.halfOf(p.stock);
        const dt = Stock.dovetailOf ? Stock.dovetailOf(p.stock) : null;
        return new THREE.Box3(
          new THREE.Vector3(-h[0], -h[1], dt ? -dt.h : 0),
          new THREE.Vector3(h[0], h[1], h[2] * 2));
      }
      return p.geometry.boundingBox
        || (p.geometry.computeBoundingBox(), p.geometry.boundingBox);
    }

    /* Run the front across a part. `show` true reassembles, false erases. */
    function run(p, show, done) {
      const us = slots(p);
      if (!us.length) { if (done) done(); return false; }

      const box = solidBox(p);

      /* Every mesh on the part shares one aim, so this is computed once. */
      const first = us[0];
      aim(first, box);
      for (let i = 0; i < us.length; i++) {
        const u = us[i];
        if (u !== first) {
          u.uDisDir.value.copy(first.uDisDir.value);
          u.uDisU.value.copy(first.uDisU.value);
          u.uDisV.value.copy(first.uDisV.value);
          u.uDisMin.value = first.uDisMin.value;
          u.uDisMax.value = first.uDisMax.value;
          u.uDisCell.value = first.uDisCell.value;
        }
        u.uDisShow.value = show ? 1 : 0;
        u.uDisOn.value = 1;
        u.uDisT.value = 0;
      }

      edges(p, false);
      warm();
      live.set(p, { us, show, done, t0: performance.now(), ms: SECONDS * 1000 });
      p._dis = 1;
      start();
      return true;
    }

    /* The bounding box of everything under `root`, measured in root's own
       local space.

       This used to use Box3.setFromObject, which measures in world space. The
       shader reads each vertex's untransformed local position, so for
       anything that is not sitting at the origin unrotated — the cutter, for
       one, which is parked at the tip and turned to the tool axis — the front
       was being aimed with world numbers at local geometry and the sweep
       started and finished in the wrong places. */
    function localBox(root) {
      root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const box = new THREE.Box3();
      const m = new THREE.Matrix4();
      const walk = n => {
        if (n.visible === false && n !== root) return;   // as runObject does
        const g = n.geometry;
        if (g) {
          if (!g.boundingBox) g.computeBoundingBox();
          if (g.boundingBox) {
            const b = g.boundingBox.clone();
            b.applyMatrix4(m.multiplyMatrices(inv, n.matrixWorld));
            box.union(b);
          }
        }
        for (let i = 0; i < n.children.length; i++) walk(n.children[i]);
      };
      walk(root);
      return box;
    }

    /* Anything that isn't a Store part — the cutter, the toolpath — can be
       torn away by handing over its root object.

       opts.worldDir aims the front along a world direction: pass world up and
       the thing comes apart from the bottom to the top however it happens to
       be oriented. Left out, it runs the body diagonal like everything else. */
    function runObject(root, show, done, opts) {
      if (!root) { if (done) done(); return false; }

      /* Only what is actually on screen. A modelled cutter carries a whole
         hidden second copy of itself for the motion-blur look — an envelope
         lathe plus eight ghosted duplicates, near twenty materials. Grafting
         the dissolve into those and marking them dirty meant a pile of shader
         work for meshes nobody can see, and the stall landed in the middle of
         the animation. */
      const us = [];
      const walk = n => {
        if (n.visible === false && n !== root) return;
        const m = n.material;
        if (m) {
          (Array.isArray(m) ? m : [m]).forEach(one => {
            attach(one);
            if (one.uniforms && one.uniforms.uDisT) us.push(one.uniforms);
            else if (one.userData && one.userData.dissolve) us.push(one.userData.dissolve);
          });
        }
        for (let i = 0; i < n.children.length; i++) walk(n.children[i]);
      };
      walk(root);
      if (!us.length) { if (done) done(); return false; }

      const box = localBox(root);
      if (box.isEmpty()) { if (done) done(); return false; }

      /* A world direction has to be brought into the space the shader reads
         positions in before it means anything. */
      let dir = null;
      if (opts && opts.worldDir) {
        root.updateMatrixWorld(true);
        const q = new THREE.Quaternion();
        root.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
        dir = opts.worldDir.clone().applyQuaternion(q.invert());
        if (dir.lengthSq() < 1e-9) dir = null;
      }

      const first = us[0];
      aim(first, box, dir);
      for (let i = 0; i < us.length; i++) {
        const u = us[i];
        if (u !== first) {
          u.uDisDir.value.copy(first.uDisDir.value);
          u.uDisU.value.copy(first.uDisU.value);
          u.uDisV.value.copy(first.uDisV.value);
          u.uDisMin.value = first.uDisMin.value;
          u.uDisMax.value = first.uDisMax.value;
          u.uDisCell.value = first.uDisCell.value;
        }
        u.uDisShow.value = show ? 1 : 0;
        u.uDisOn.value = 1;
        u.uDisT.value = 0;
      }

      const key = root;
      if (live.has(key)) live.delete(key);
      warm();
      live.set(key, { us, show, done, t0: performance.now(), ms: SECONDS * 1000 });
      start();
      return true;
    }

    /* Change a solid's shape without it popping. The front erases it, the new
       form is cut while there is nothing on screen, and the same front runs
       back the other way to build it up again. */
    function reform(p, mutate) {
      const finish = () => {
        try { if (mutate) mutate(); } catch (e) { console.warn("[Dissolve]", e); }
        run(p, true);
      };
      if (!run(p, false, finish)) finish();
    }

    return { attach, uniforms, run, runObject, reform, edges, SECONDS };
  })();

  function solid(geometry, opts) {
    opts = opts || {};
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, Dissolve.attach(opts.material
      || new THREE.MeshPhongMaterial({
        color: BODY_COLOR, shininess: 18, specular: 0x1a1e22,
        side: THREE.DoubleSide, transparent: false, opacity: 1, depthWrite: true,
      })));
    let edges = null;

    if (opts.edges !== false && Geo.triCount(geometry) < EDGE_LIMIT) {
      edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 24),
        new THREE.LineBasicMaterial({ color: 0x0d0f12, transparent: true, opacity: 0.55 }));
    }
    return { mesh, edges };
  }

  function add(input, name, opts) {
    opts = opts || {};
    const asm = (input && input.main) ? input : { main: input, members: [] };
    const body = solid(asm.main, opts);

    const inner = new THREE.Group();
    inner.add(body.mesh);
    if (body.edges) inner.add(body.edges);

    const members = (asm.members || []).map(m => {
      const s = solid(m.geometry);
      const node = new THREE.Group();
      node.add(s.mesh);
      if (s.edges) node.add(s.edges);
      inner.add(node);

      return Object.assign({}, m, {
        name: m.name || "member", axis: m.axis || "x", note: m.note || "",
        min: m.min || 0, max: (m.max != null ? m.max : 100),
        value: (m.value != null ? m.value : 0),
        node, mesh: s.mesh, edges: s.edges, geometry: m.geometry,
      });
    });

    const node = new THREE.Group();
    node.add(inner);

    (opts.onTable ? ensureTable() : ensureRoot()).add(node);

    const p = {
      id: ++seq,
      name: name || ("part " + seq),
      geometry: asm.main, mesh: body.mesh, edges: body.edges,
      onTable: !!opts.onTable,

      role: opts.role || (opts.stock ? "stock" : "part"),
      inner, node, members,
      pos: new THREE.Vector3(),
      rot: new THREE.Vector3(),
      scale: 1,
      srcInch: false,
      base: new THREE.Vector3(),
      zero: new THREE.Vector3(),
      baseNote: "model origin",
      zeroNote: "model origin",

      ref: { pos: new THREE.Vector3(), rot: new THREE.Vector3() },
      refZero: null,
      visible: true, opacity: 1, wire: false,
      stock: opts.stock || null,
      showEdges: !!body.edges,
      tris: Geo.triCount(asm.main) + members.reduce((n, m) => n + Geo.triCount(m.geometry), 0),
    };
    parts.push(p);
    apply(p);
    select(p.id);
    return p;
  }

  const meshesOf = p => [p.mesh].concat(p.members.map(m => m.mesh));
  const edgesOf  = p => [p.edges].concat(p.members.map(m => m.edges)).filter(Boolean);

  function apply(p) {
    const u = sceneU() * (p.srcInch ? MM_PER_IN : 1);
    p.node.position.set(p.pos.x * sceneU(), p.pos.y * sceneU(), p.pos.z * sceneU());
    p.node.rotation.set(
      p.rot.x * Math.PI / 180, p.rot.y * Math.PI / 180, p.rot.z * Math.PI / 180, "XYZ");
    p.node.scale.setScalar(u * p.scale);
    p.inner.position.copy(p.base).multiplyScalar(-1);
    p.members.forEach(m => m.node.position.set(
      m.axis === "x" ? m.value : 0,
      m.axis === "y" ? m.value : 0,
      m.axis === "z" ? m.value : 0));
    p.node.visible = p.visible;
    meshesOf(p).forEach(mesh => {
      mesh.material.opacity = p.opacity;
      mesh.material.transparent = p.opacity < 1;
      mesh.material.wireframe = p.wire;
    });
    /* Mid-dissolve the edge cage is deliberately dark — it has no front of its
       own, so it would hang in the air after the solid had gone. */
    edgesOf(p).forEach(e => e.visible = p.showEdges && !p.wire && !p._dis);
    p.node.updateMatrixWorld(true);
  }

  function applyAll() { parts.forEach(apply); }

  function toWorld(p, local) {
    p.node.updateMatrixWorld(true);

    return p.inner.localToWorld(local.clone()).sub(stageOffset);
  }
  const zeroWorld = p => toWorld(p, p.zero);

  function sendZeroToMachineZero(p) {
    const w = zeroWorld(p);
    p.pos.sub(new THREE.Vector3(fromDisp(w.x), fromDisp(w.y), fromDisp(w.z)));
    apply(p);
  }

  /* Nothing on screen ever simply blinks out: the front crosses it first and
     it comes apart a cell at a time, then it is disposed of. The part leaves
     the list straight away, so every caller still sees it gone the moment it
     asks — only the picture takes the extra second.

     `opts.quiet` skips the animation. That is for the rebuild churn — the
     parallels are re-cut on every keystroke of their height, and dissolving
     each throwaway pair would leave a queue of ghosts and cost frames for
     something nobody ever sees. */
  function remove(id, opts) {
    const i = parts.findIndex(p => p.id === id);
    if (i < 0) return;
    const p = parts[i];

    parts.splice(i, 1);
    if (selected === id) selected = parts.length ? parts[parts.length - 1].id : null;

    const dispose = () => {
      (p.node.parent || ensureRoot()).remove(p.node);
      if (p.stock && p.stock.rec) {
        p.stock.rec.cutTex.dispose();
        p.stock.rec.gridTex.dispose();
      }
      meshesOf(p).forEach(m => {
        m.geometry.dispose();
        if (m.material.map) m.material.map.dispose();
        m.material.dispose();
      });
      edgesOf(p).forEach(e => { e.geometry.dispose(); e.material.dispose(); });
    };

    const quiet = !!(opts && opts.quiet);
    if (quiet || !p.visible || !p.node.parent) { dispose(); return; }
    if (!Dissolve.run(p, false, dispose)) dispose();
  }

  function clear(opts) { parts.slice().forEach(p => remove(p.id, opts)); selected = null; }

  const get     = id => parts.find(p => p.id === id) || null;
  const current = () => get(selected);
  const select  = id => { selected = id; return current(); };
  const all     = () => parts.slice();

  function pickMeshes() {
    const out = [];
    parts.forEach(p => { if (p.visible) meshesOf(p).forEach(m => out.push(m)); });
    return out;
  }
  const partOfMesh = obj => parts.find(p => meshesOf(p).indexOf(obj) >= 0) || null;

  function bounds() {
    const b = new THREE.Box3();
    let any = false;
    parts.forEach(p => {
      if (!p.visible) return;
      p.node.updateMatrixWorld(true);
      meshesOf(p).forEach(m => { b.expandByObject(m); any = true; });
    });
    return any ? b : null;
  }

  function syncFollowers() {
    parts.forEach(p => {
      if (!p.follow) return;
      const src = get(p.follow.partId);
      const from = src && src.members[p.follow.member || 0];
      const to = p.members[0];
      if (!from || !to) return;
      const want = Math.min(Math.max(from.value + (p.follow.offset || 0), to.min), to.max);
      if (Math.abs(to.value - want) < 1e-9) return;
      to.value = want;
      apply(p);
    });
  }

  function markReference(p) {
    if (!p) return;
    p.ref.pos.copy(p.pos);
    p.ref.rot.copy(p.rot);
    p.refZero = zeroWorld(p).clone();
  }

  return { add, apply, applyAll, remove, clear, get, current, select, all, Dissolve,
           table: () => table, setTablePivot, tablePivot, markReference,
           syncFollowers,
           pickMeshes, partOfMesh, bounds, toWorld, zeroWorld, sendZeroToMachineZero };
})();

const Motion = (() => {
  const jobs = new Map();
  const MS = 200;

  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function start(key, job) {
    job.t0 = performance.now();
    job.ms = job.ms || MS;
    jobs.set(key, job);
  }

  function moveTo(p, target, opts) {
    opts = opts || {};
    if (opts.now || p.pos.distanceToSquared(target) < 1e-10) {
      p.pos.copy(target); Store.apply(p);
      if (opts.after) opts.after();
      return;
    }
    start("pos:" + p.id, {
      from: p.pos.clone(), to: target.clone(), ms: opts.ms,
      step: v => { p.pos.copy(v); Store.apply(p); },
      after: opts.after,
    });
  }

  function memberTo(p, m, value, opts) {
    opts = opts || {};
    const to = Math.min(Math.max(value, m.min), m.max);
    if (opts.now || Math.abs(m.value - to) < 1e-9) {
      m.value = to; Store.apply(p);
      return;
    }
    const from = m.value;
    start("mem:" + p.id + ":" + p.members.indexOf(m), {
      scalarFrom: from, scalarTo: to, ms: opts.ms,
      stepScalar: v => { m.value = v; Store.apply(p); },
    });
  }

  function valueTo(key, from, to, set, ms) {
    if (Math.abs(from - to) < 1e-9) { set(to); return; }
    start(key, { scalarFrom: from, scalarTo: to, ms, stepScalar: set });
  }

  function tick() {
    if (!jobs.size) return;
    const now = performance.now();
    jobs.forEach((j, key) => {
      const k = Math.min(1, (now - j.t0) / j.ms);
      const e = ease(k);
      if (j.stepScalar) j.stepScalar(j.scalarFrom + (j.scalarTo - j.scalarFrom) * e);
      else j.step(j.from.clone().lerp(j.to, e));
      if (k >= 1) {
        jobs.delete(key);
        if (j.after) j.after();
      }
    });
  }

  const busy = () => jobs.size > 0;

  function settle() {
    jobs.forEach((j, key) => {
      if (j.stepScalar) j.stepScalar(j.scalarTo);
      else j.step(j.to.clone());
      jobs.delete(key);
      if (j.after) j.after();
    });
  }

  return { moveTo, memberTo, valueTo, tick, busy, settle };
})();

const Marks = (() => {
  let baseMark = null, zeroMark = null;

  let shown = true;

  function ball(color, r) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, 20, 14),
      new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }));
    m.renderOrder = 999;
    return m;
  }
  function ring(color) {
    const g = new THREE.Group();
    const circ = [];
    for (let i = 0; i < 24; i++) {
      const a0 = i / 24 * Math.PI * 2, a1 = (i + 1) / 24 * Math.PI * 2;
      circ.push(Math.cos(a0) * 3, Math.sin(a0) * 3, 0, Math.cos(a1) * 3, Math.sin(a1) * 3, 0);
    }
    g.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(circ, 3)),
      new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 })));
    g.renderOrder = 998;
    return g;
  }

  function ensure() {

    if (!baseMark) { baseMark = ring(0xe8c547); stageGroup.add(baseMark); }

    if (!zeroMark) { zeroMark = ball(0xffcc33, 1.6); stageGroup.add(zeroMark); }
  }

  const _bw = new THREE.Vector3(), _zw = new THREE.Vector3();
  function update() {
    ensure();
    const p = Store.current();

    if (!shown || !p || (!p.visible && !p.stock)) {
      baseMark.visible = zeroMark.visible = false; return;
    }
    const s = Math.max((typeof frustumSize !== "undefined" ? frustumSize : 120) / 90, 1e-4);
    _bw.copy(Store.toWorld(p, p.base));
    _zw.copy(Store.zeroWorld(p));
    zeroMark.visible = true;
    zeroMark.scale.setScalar(s);
    zeroMark.position.copy(_zw);

    baseMark.visible = _bw.distanceToSquared(_zw) > 1e-8;
    baseMark.scale.setScalar(s);
    baseMark.position.copy(_bw);
  }

  function setShown(v) {
    shown = !!v;
    if (!shown) {
      if (baseMark) baseMark.visible = false;
      if (zeroMark) zeroMark.visible = false;
    }
  }
  return { update, setShown };
})();

const History = (() => {
  const MAX = 80;
  const SETTLE = 300;
  const undos = [], redos = [];
  const base = new Map();
  let dirtyAt = 0, applying = false;

  const snap = p => ({
    pos: p.pos.toArray(), rot: p.rot.toArray(), scale: p.scale,
    b: p.base.toArray(), z: p.zero.toArray(),
    v: p.pivot ? p.pivot.toArray() : null,
    bn: p.baseNote, zn: p.zeroNote, vn: p.pivotNote || "",
  });
  const eq = (a, b) => a && b && JSON.stringify(a) === JSON.stringify(b);

  /* Everything but the position lands at once; the position is handed to
     Motion so the solid slides back to where it was instead of teleporting. */
  function restore(p, s) {
    const from = p.pos.clone();
    const to = new THREE.Vector3().fromArray(s.pos);

    p.rot.fromArray(s.rot); p.scale = s.scale;
    p.base.fromArray(s.b); p.zero.fromArray(s.z);
    if (s.v && p.pivot) p.pivot.fromArray(s.v);
    p.baseNote = s.bn; p.zeroNote = s.zn; if (s.vn !== undefined) p.pivotNote = s.vn;

    if (from.distanceToSquared(to) > 1e-9) {
      p.pos.copy(from);
      Store.apply(p);
      Motion.moveTo(p, to);
    } else {
      p.pos.copy(to);
      Store.apply(p);
    }
  }

  const seen = new Map();
  function watch() {
    if (applying) return;
    const now = performance.now();
    const parts = Store.all();
    let moving = false;
    for (const p of parts) {
      const cur = snap(p);
      if (!base.has(p.id)) base.set(p.id, cur);
      if (!eq(cur, seen.get(p.id))) { moving = true; seen.set(p.id, cur); }
    }

    if (moving) { dirtyAt = now; return; }
    if (!dirtyAt || now - dirtyAt < SETTLE) return;
    dirtyAt = 0;
    for (const p of parts) {
      const cur = snap(p), was = base.get(p.id);
      if (!was || eq(cur, was)) continue;
      undos.push({ id: p.id, before: was, after: cur });
      if (undos.length > MAX) undos.shift();
      redos.length = 0;
      base.set(p.id, cur);
    }

    const live = new Set(parts.map(p => p.id));
    [...base.keys()].forEach(k => { if (!live.has(k)) { base.delete(k); seen.delete(k); } });
    paintHistory();
  }

  function step(from, to) {
    let e;

    while ((e = from.pop())) { if (Store.get(e.id)) break; }
    if (!e) { paintHistory(); return false; }
    const p = Store.get(e.id);
    applying = true;
    const target = (from === undos) ? e.before : e.after;
    restore(p, target);

    /* Bank the state we are sliding towards, not the one we are leaving —
       otherwise the animation itself gets recorded as a fresh edit. */
    base.set(p.id, target);
    seen.set(p.id, target);
    to.push(e);
    applying = false;
    Store.select(p.id);
    if (typeof Panel !== "undefined" && Panel.refresh) Panel.refresh();
    if (typeof Gizmo !== "undefined") Gizmo.sync();
    paintHistory();
    return true;
  }

  const undo = () => step(undos, redos);
  const redo = () => step(redos, undos);

  function paintHistory() {
    const u = document.getElementById("pm-undo"), r = document.getElementById("pm-redo");
    if (u) u.disabled = !undos.length;
    if (r) r.disabled = !redos.length;
    if (window.VPHistoryBar) window.VPHistoryBar.paint();
  }

  function bindHistory() {
    const u = document.getElementById("pm-undo"), r = document.getElementById("pm-redo");
    if (u) u.addEventListener("click", undo);
    if (r) r.addEventListener("click", redo);
    window.addEventListener("keydown", e => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      (e.shiftKey ? redo : undo)();
    });
    paintHistory();
  }

  return { watch, undo, redo, bind: bindHistory, paint: paintHistory };
})();

const Snap = (() => {
  const MODES = [
    ["vertex", "Vertex"], ["edge", "Edge"], ["edgemid", "Edge mid"],
    ["face", "Face ctr"], ["body", "Body ctr"],
  ];
  let mode = "vertex";
  let armed = false;

  let purpose = null;
  let marker = null;
  let hit = null;
  const ray = new THREE.Raycaster();

  function makeMarker() {
    if (marker) return marker;
    marker = new THREE.Group();
    marker.add(new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 })));
    marker.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([
        -5, 0, 0, 5, 0, 0, 0, -5, 0, 0, 5, 0, 0, 0, -5, 0, 0, 5], 3)),
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 })));
    marker.renderOrder = 1000;
    marker.visible = false;
    mainScene.add(marker);
    return marker;
  }
  function sizeMarker() {
    const s = (typeof frustumSize !== "undefined" ? frustumSize : 120) / 140;
    makeMarker().scale.setScalar(Math.max(s, 1e-3));
  }

  const FEAT_LIMIT = 12000;
  const EKEY = 1e4;
  function faceFeatures(geo, face, seed) {
    const tris = (face && face.length && face.length <= FEAT_LIMIT) ? face : [seed];
    const uses = new Map();
    const key = v => Math.round(v.x * EKEY) + "," + Math.round(v.y * EKEY) + "," + Math.round(v.z * EKEY);
    for (const t of tris) {
      const v = [Geo.vertex(geo, t * 3), Geo.vertex(geo, t * 3 + 1), Geo.vertex(geo, t * 3 + 2)];
      const k = v.map(key);
      for (let e = 0; e < 3; e++) {
        const i = e, j = (e + 1) % 3;
        const id = k[i] < k[j] ? k[i] + "|" + k[j] : k[j] + "|" + k[i];
        const rec = uses.get(id);
        if (rec) rec.n++; else uses.set(id, { n: 1, a: v[i], b: v[j] });
      }
    }
    const edges = [], verts = [], seen = new Set();
    uses.forEach(rec => {
      if (rec.n !== 1) return;
      edges.push(rec);
      [rec.a, rec.b].forEach(p => {
        const id = key(p);
        if (seen.has(id)) return;
        seen.add(id); verts.push(p);
      });
    });

    if (!edges.length) {
      const v = [Geo.vertex(geo, seed * 3), Geo.vertex(geo, seed * 3 + 1), Geo.vertex(geo, seed * 3 + 2)];
      for (let e = 0; e < 3; e++) edges.push({ a: v[e], b: v[(e + 1) % 3] });
      verts.push(...v);
    }
    return { edges, verts };
  }

  const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();
  function nearestOnScreen(feat, obj, ev) {
    const rect = mainCanvas.getBoundingClientRect();
    const cx = ev.clientX - rect.left, cy = ev.clientY - rect.top;
    const toPx = (v, out) => {
      out.copy(v).applyMatrix4(obj.matrixWorld).project(mainCam);
      out.set((out.x * 0.5 + 0.5) * rect.width, (-out.y * 0.5 + 0.5) * rect.height, 0);
      return out;
    };
    let best = null, bestD = Infinity;
    const offer = (d, pt, note) => { if (d < bestD) { bestD = d; best = { pt: pt.clone(), note }; } };

    if (mode === "vertex") {
      for (const v of feat.verts) {
        toPx(v, _p1);
        offer(Math.hypot(_p1.x - cx, _p1.y - cy), v, "vertex");
      }
    } else {
      for (const e of feat.edges) {
        toPx(e.a, _p1); toPx(e.b, _p2);
        const dx = _p2.x - _p1.x, dy = _p2.y - _p1.y;
        const L2 = dx * dx + dy * dy;
        const t = L2 > 1e-9
          ? Math.min(1, Math.max(0, ((cx - _p1.x) * dx + (cy - _p1.y) * dy) / L2))
          : 0;
        const d = Math.hypot(_p1.x + dx * t - cx, _p1.y + dy * t - cy);
        if (mode === "edgemid") {
          offer(d, e.a.clone().add(e.b).multiplyScalar(0.5), "edge midpoint");
        } else {
          offer(d, e.a.clone().lerp(e.b, t), "point on edge");
        }
      }
    }
    return best;
  }

  function candidate(ev) {
    const targets = Store.pickMeshes();
    if (!targets.length) return null;
    const rect = mainCanvas.getBoundingClientRect();
    ray.setFromCamera({
      x:  ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    }, mainCam);
    const hits = ray.intersectObjects(targets, false);
    if (!hits.length) return null;

    const h = hits[0];
    const part = Store.partOfMesh(h.object);
    if (!part) return null;
    const geo = h.object.geometry;
    const tri = h.faceIndex != null ? h.faceIndex : Math.floor(h.face.a / 3);

    const localHit = h.object.worldToLocal(h.point.clone());
    let local, note;

    if (mode === "body") {
      if (!geo.boundingBox) geo.computeBoundingBox();
      local = geo.boundingBox.getCenter(new THREE.Vector3());
      note = "body center";
    } else if (mode === "face") {
      const tris = Geo.planarFace(geo, tri, 1.5);
      local = Geo.areaCentroid(geo, tris);
      note = "face center · " + tris.length + " tri";
    } else {

      const face = Geo.planarFace(geo, tri, 1.5);
      const feat = faceFeatures(geo, face, tri);
      const near = nearestOnScreen(feat, h.object, ev);
      local = near ? near.pt : Geo.vertex(geo, tri * 3);
      note = near ? near.note : "vertex";
    }

    const world = h.object.localToWorld(local.clone());
    const inPart = part.inner.worldToLocal(world.clone());
    const onMember = part.mesh !== h.object;
    return { part, local: inPart, world, note: note + (onMember ? " (moving part)" : "") };
  }

  function hover(ev) {
    if (!armed) return;
    hit = candidate(ev);
    sizeMarker();
    makeMarker().visible = !!hit;
    if (hit) marker.position.copy(hit.world);
    Panel.showSnap(hit);
  }

  function take() {
    if (!hit) return false;

    if (typeof Gizmo !== "undefined" && Gizmo.alignStage) {
      const r = Gizmo.alignTake(hit);
      if (r) { Panel.refresh(); return r; }
    }

    if (purpose !== "origin"
        && typeof ViewMode !== "undefined" && ViewMode.isModel()
        && typeof Gizmo !== "undefined" && Gizmo.mode === "move"
        && Gizmo.seatOn && Gizmo.seatOn(hit.world)) {
      Panel.refresh();
      toast("Seated on " + hit.note + ".");
      return true;
    }

    if (purpose === "origin") {
      const p0 = hit.part;

      const w = hit.world.clone().sub(stageOffset);
      p0.base.copy(hit.local);
      p0.zero.copy(hit.local);
      p0.baseNote = p0.zeroNote = hit.note;
      p0.pos.set(fromDisp(w.x), fromDisp(w.y), fromDisp(w.z));
      Store.apply(p0);
      Panel.refresh();
      if (typeof MakeProgram !== "undefined" && MakeProgram.paintOrigin) MakeProgram.paintOrigin();
      showToast("Work zero set",
        "Zero is on the " + hit.note + ". Nothing moved — the program came to it.");
      return true;
    }

    const p = hit.part, target = Panel.pickTarget();
    if (target !== "zero") { p.base.copy(hit.local); p.baseNote = hit.note; }
    if (target !== "base") { p.zero.copy(hit.local); p.zeroNote = hit.note; }
    Store.apply(p);
    if (target !== "base" && Panel.zeroOnPick()) Store.sendZeroToMachineZero(p);
    Panel.refresh();
    showToast((target === "base" ? "Base point" : target === "zero" ? "Work zero" : "Base and zero") + " set",
      "It is on the " + hit.note + ".");
    return true;
  }

  function arm(on, why) {
    armed = !!on;
    purpose = armed ? (why || null) : null;
    if (marker) marker.visible = false;
    viewport.classList.toggle("pm-picking", armed);
    Panel.showSnap(null);
    if (typeof MakeProgram !== "undefined" && MakeProgram.paintOrigin) MakeProgram.paintOrigin();
    return armed;
  }
  const setMode = m => { mode = m; return mode; };

  viewport.addEventListener("mousedown", e => {
    if (!armed || e.button !== 0) return;
    if (!onModelCanvas(e)) return;

    e.preventDefault(); e.stopImmediatePropagation();
    hover(e);

    const r = take();
    if (r === "keep") return;
    if (r && !e.shiftKey) arm(false);
  }, true);
  viewport.addEventListener("mousemove", hover, false);
  window.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !armed) return;
    arm(false);
    if (typeof Gizmo !== "undefined" && Gizmo.alignCancel) Gizmo.alignCancel();
  });

  return { MODES, arm, setMode, isArmed: () => armed,
           get mode() { return mode; }, get purpose() { return purpose; } };
})();

const Drag = (() => {
  let on = false, active = false;
  const plane = new THREE.Plane();
  const ray = new THREE.Raycaster();
  const start = new THREE.Vector3(), from = new THREE.Vector3();
  let startPos = null, lastY = 0;

  function pointOnPlane(ev, out) {
    const rect = mainCanvas.getBoundingClientRect();
    ray.setFromCamera({
      x:  ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    }, mainCam);
    return ray.ray.intersectPlane(plane, out);
  }

  viewport.addEventListener("mousedown", e => {
    const p = Store.current();
    if (!on || e.button !== 0 || !p) return;
    e.preventDefault(); e.stopPropagation();
    active = true; lastY = e.clientY;
    startPos = p.pos.clone();
    plane.set(new THREE.Vector3(0, 0, 1), -p.pos.z * sceneU());
    if (!pointOnPlane(e, start)) active = false;
  }, true);

  window.addEventListener("mousemove", e => {
    const p = Store.current();
    if (!active || !p) return;
    if (e.shiftKey) {
      const s = (typeof frustumSize !== "undefined" ? frustumSize : 120) / viewport.clientHeight;
      p.pos.z += fromDisp((lastY - e.clientY) * s);
    } else if (pointOnPlane(e, from)) {
      p.pos.x = startPos.x + fromDisp(from.x - start.x);
      p.pos.y = startPos.y + fromDisp(from.y - start.y);
    }
    lastY = e.clientY;
    Store.apply(p);
    Panel.refresh(true);
  });
  window.addEventListener("mouseup", () => { active = false; });

  function set(v) {
    on = !!v;
    viewport.classList.toggle("pm-dragging", on);
    return on;
  }
  return { set, isOn: () => on };
})();

const Panel = (() => {
  let el = {};
  let target = "both";

  function bind() {
    el = {
      importBtn: $("#pm-import"),
      cats: $("#pm-cats"), catNote: $("#pm-cat-note"), browser: $("#pm-browser"),
      file: $("#pm-file"), list: $("#pm-list"), msg: $("#pm-msg"), edit: $("#pm-edit"),
      title: $("#pm-title"), snapBtns: $("#pm-snap-modes"), pick: $("#pm-pick"),
      snapOut: $("#pm-snap-out"), zeroPick: $("#pm-zero-pick"), dragBtn: $("#pm-drag"),
      baseOut: $("#pm-base-out"), zeroOut: $("#pm-zero-out"), targets: $("#pm-targets"),
      opacity: $("#pm-opacity"), fit: $("#pm-fit"), clear: $("#pm-clear"),
      edgesTgl: $("#pm-edges"), wireTgl: $("#pm-wire"), srcUnit: $("#pm-src-unit"),
      scale: $("#pm-scale"), scaleNum: $("#pm-scale-num"),
      joints: $("#pm-joints"), jointWrap: $("#pm-joint-wrap"),
      unitTags: Array.from(document.querySelectorAll(".pm-unit")),
    };
    ["px", "py", "pz", "rx", "ry", "rz"].forEach(k => el[k] = $("#pm-" + k));

    el.importBtn.addEventListener("click", () => el.file.click());
    el.file.addEventListener("change", () => { intake(Array.from(el.file.files)); el.file.value = ""; });

    const CATS = {
      parts: {
        note: "Solids that are not the cutter — the finished part, a gauge, a fixture plate. Adds the one model, nothing else.",
        rows: () => Samples.of("part").map(s => ({ key: s.key, name: s.name, note: s.note })),
        pick: key => {
          const s = Samples.get(key), built = Samples.build(key);
          if (!built) return;
          const p = Store.add(built, s.name);
          say(`${s.name} added — ${p.tris.toLocaleString()} triangles`
            + (p.members.length ? `, ${p.members.length} moving part` : ""), "ok");
          refresh(); fit();
        },
      },
      stocks: {
        note: "A billet on its own, with no program behind it. Cut it by loading or typing a program, or resize it below.",
        rows: () => STOCKS.map(s => ({ key: s.key, name: s.name, note: s.note })),
        pick: key => {
          const s = STOCKS.find(x => x.key === key); if (!s) return;
          const p = addStockFrom(s.def, s.name);
          if (p) say(`${s.name} — Every surface is an equation, solved per pixel.`, "ok");
        },
      },
      clamps: {
        note: "Workholding. A vise lands centered on the origin, so it sits square on a rotary table — drag it or type a position to move it.",
        rows: () => Samples.of("clamp").map(s => ({ key: s.key, name: s.name, note: s.note })),
        pick: key => {
          const p = addClamp(key);
          if (!p) return;
          const s = Samples.get(key);
          say(`${s.name} added — ${p.tris.toLocaleString()} triangles`
            + (p.members.length ? `, ${p.members.length} moving part` : ""), "ok");
          refresh(); fit();
        },
      },
      scenarios: {
        note: "The whole setup at once — billet, vise, tool table and the program that cuts it, rewound to the first line. Press play.",
        rows: () => JOBS.map(j => ({ key: j.key, name: j.name, note: j.note })),
        pick: key => {
          const j = JOBS.find(x => x.key === key);
          if (j) loadJob(j);
        },
      },
    };
    let openCat = null;

    function paintCats() {
      el.cats.querySelectorAll("[data-cat]").forEach(b =>
        b.classList.toggle("on", b.dataset.cat === openCat));
      const c = openCat && CATS[openCat];
      el.catNote.hidden = !c;
      el.browser.hidden = !c;
      if (!c) return;
      el.catNote.textContent = c.note;

      el.browser.innerHTML = c.rows().map(r =>
        `<button class="pm-sample-row" data-pick="${r.key}" data-from="${openCat}">
           <span class="pm-sample-name">${r.name}</span>
           <span class="pm-sample-note">${r.note}</span>
         </button>`).join("");
    }

    el.cats.addEventListener("click", e => {
      const b = e.target.closest("[data-cat]"); if (!b) return;
      openCat = (openCat === b.dataset.cat) ? null : b.dataset.cat;
      paintCats();
    });

    el.browser.addEventListener("click", e => {
      const b = e.target.closest("[data-pick]"); if (!b) return;
      const c = CATS[b.dataset.from]; if (!c) return;
      c.pick(b.dataset.pick);
      paintCats();
    });
    paintCats();

    el.list.addEventListener("click", e => {
      const row = e.target.closest("[data-id]"); if (!row) return;
      const id = +row.dataset.id, p = Store.get(id);
      if (!p) return;
      if (e.target.closest(".pm-eye"))      { p.visible = !p.visible; Store.apply(p); }
      else if (e.target.closest(".pm-del")) { Store.remove(id); }
      else                                   Store.select(id);
      refresh();
    });

    ["px", "py", "pz"].forEach((k, i) => el[k].addEventListener("input", () => {
      const p = Store.current(); if (!p) return;
      p.pos.setComponent(i, fromDisp(parseFloat(el[k].value) || 0));
      Store.apply(p); refreshOut();
    }));
    ["rx", "ry", "rz"].forEach((k, i) => el[k].addEventListener("input", () => {
      const p = Store.current(); if (!p) return;
      p.rot.setComponent(i, parseFloat(el[k].value) || 0);
      Store.apply(p); refreshOut();
    }));
    document.querySelectorAll("[data-rot]").forEach(b => b.addEventListener("click", () => {
      const p = Store.current(); if (!p) return;
      const [axis, step] = b.dataset.rot.split(":");
      const i = { x: 0, y: 1, z: 2 }[axis];
      p.rot.setComponent(i, (p.rot.getComponent(i) + (+step) + 360) % 360);
      Store.apply(p); refresh();
    }));
    document.querySelectorAll("[data-send]").forEach(b => b.addEventListener("click", () => {
      const p = Store.current(); if (!p) return;
      if (b.dataset.send === "base") p.pos.set(0, 0, 0);
      if (b.dataset.send === "rot")  p.rot.set(0, 0, 0);
      Store.apply(p);
      if (b.dataset.send === "zero") Store.sendZeroToMachineZero(p);
      refresh();
    }));

    el.scale.addEventListener("input", () => setScale(parseFloat(el.scale.value)));
    el.scaleNum.addEventListener("input", () => setScale(parseFloat(el.scaleNum.value)));
    el.srcUnit.addEventListener("click", () => {
      const p = Store.current(); if (!p) return;
      p.srcInch = !p.srcInch; Store.apply(p); refresh();
    });

    el.snapBtns.addEventListener("click", e => {
      const b = e.target.closest("[data-snap]"); if (!b) return;
      Snap.setMode(b.dataset.snap); paintSnapModes();
    });
    el.targets.addEventListener("click", e => {
      const b = e.target.closest("[data-target]"); if (!b) return;
      target = b.dataset.target; paintTargets();
    });
    el.pick.addEventListener("click", () => {
      const on = Snap.arm(!Snap.isArmed());
      if (on) Drag.set(false);
      paintButtons();
    });
    el.dragBtn.addEventListener("click", () => {
      const on = Drag.set(!Drag.isOn());
      if (on) Snap.arm(false);
      paintButtons();
    });
    document.querySelectorAll("[data-quick]").forEach(b =>
      b.addEventListener("click", () => quickPoint(b.dataset.quick)));

    el.joints.addEventListener("input", e => {
      const s = e.target.closest("[data-joint]"); if (!s) return;
      const p = Store.current(); if (!p) return;
      const m = p.members[+s.dataset.joint]; if (!m) return;
      m.value = clamp(fromDisp(parseFloat(s.value) || 0), m.min, m.max);
      Store.apply(p);
      const out = el.joints.querySelector('[data-joint-out="' + s.dataset.joint + '"]');
      if (out) out.textContent = fmt(toDisp(m.value)) + " " + uLabel();
    });

    el.opacity.addEventListener("input", () => {
      const p = Store.current(); if (!p) return;
      p.opacity = clamp(parseFloat(el.opacity.value) / 100, 0.05, 1);
      Store.apply(p);
    });
    el.wireTgl.addEventListener("click", () => {
      const p = Store.current(); if (!p) return;
      p.wire = !p.wire; Store.apply(p); paintButtons();
    });
    el.edgesTgl.addEventListener("click", () => {
      const p = Store.current(); if (!p) return;
      p.showEdges = !p.showEdges; Store.apply(p); paintButtons();
    });

    $("#pm-stock-block").addEventListener("click", () => addStock("block"));
    $("#pm-stock-cyl").addEventListener("click", () => addStock("cyl"));
    $("#pm-metals").addEventListener("click", e => {
      const b = e.target.closest("[data-metal]"); const p = stockTarget();
      if (!b || !p) return;
      setMetal(p, b.dataset.metal);
    });
    /* Size lands on the blank while you are still in the field. A short
       debounce keeps a fast typist from rebuilding the solid per keystroke,
       and leaving the field commits whatever is in it straight away. */
    {
      const takeDim = inp => {
        const p = stockTarget();
        if (!inp || !p) return;
        const v = parseFloat(inp.value);
        if (!isFinite(v) || v <= 0) return;
        p.stock[inp.dataset.dim] = clamp(fromDisp(v), 1, 2000);
        rebuildStock(p);
        reclampJaws();
      };
      let typing = null;
      $("#pm-stock-size").addEventListener("input", e => {
        const inp = e.target.closest("[data-dim]"); if (!inp) return;
        clearTimeout(typing);
        typing = setTimeout(() => takeDim(inp), 120);
      });
      $("#pm-stock-size").addEventListener("change", e => {
        const inp = e.target.closest("[data-dim]"); if (!inp) return;
        clearTimeout(typing);
        takeDim(inp);
      });
    }

    const ja = $("#pm-jaw-auto");
    if (ja) ja.addEventListener("change", () => {
      if (ja.checked) reclampJaws(true);
    });
    const jn = $("#pm-jaw-now");
    if (jn) jn.addEventListener("click", () => reclampJaws(true));
    $("#pm-stock-res").addEventListener("input", () => {
      const p = stockTarget(); if (!p) return;
      p.stock.steps = +$("#pm-stock-res").value;
      $("#pm-stock-res-out").textContent = p.stock.steps + " steps";
    });
    $("#pm-stock-reset").addEventListener("click", () => {
      const p = stockTarget(); if (!p) return;
      StockSim.reset(true);
      say("Material restored.", "ok");
    });

    const dtOf = p => (p.stock.dovetail = Object.assign(Stock.DT_DEFAULT(), p.stock.dovetail));
    /* Cutting the tenon in, or taking it back off, changes the shape of the
       solid — so it disintegrates and rebuilds rather than popping. The blank
       and its dovetail are one body to the front, the same as when the blank
       is hidden. */
    $("#pm-dt-mode").addEventListener("click", e => {
      const b = e.target.closest("[data-dt]"); if (!b) return;
      const p = stockTarget(); if (!p) return;
      const d = dtOf(p);
      const want = b.dataset.dt !== "off";
      const along = want ? b.dataset.dt : d.along;
      if (d.on === want && d.along === along) return;

      /* The button lights off the intent straight away; the metal catches up
         when the front has finished crossing it. */
      d.pending = { on: want, along };
      paintStockPanel();
      Store.Dissolve.reform(p, () => {
        d.on = want;
        d.along = along;
        delete d.pending;
        rebuildStock(p);
        refresh();
      });
      say(want
        ? `Dovetail along ${along.toUpperCase()} — jaws close across ${along === "x" ? "Y" : "X"}.`
        : "Plain blank — no dovetail.", "ok");
    });
    [["#pm-dt-w", "w"], ["#pm-dt-h", "h"], ["#pm-dt-a", "angle"]].forEach(([sel, k]) => {
      $(sel).addEventListener("input", () => {
        const p = stockTarget(); if (!p) return;
        const v = parseFloat($(sel).value);
        if (!isFinite(v)) return;
        dtOf(p)[k] = (k === "angle") ? v : fromDisp(v);
        rebuildStock(p);
        refresh(true);
      });
    });

    el.fit.addEventListener("click", fit);
    el.clear.addEventListener("click", () => { Store.clear(); refresh(); say("All parts removed."); });

    paintSnapModes(); paintTargets(); refresh();
  }

  function addClamp(key, opts) {
    const s = Samples.get(key), built = Samples.build(key);
    if (!s || !built) return null;
    const p = Store.add(built, s.name,
      Object.assign({ role: s.role || "fixture" }, opts || {}));

    if (s.centerOnAdd) {
      p.geometry.computeBoundingBox();
      const b = p.geometry.boundingBox;
      p.pos.set(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, 0);
      Store.apply(p);
    }
    return p;
  }

  const IN = MM_PER_IN;
  const STOCK_DEFAULT = () => ({
    shape: "block", sx: 6 * IN, sy: 4 * IN, sz: 1.5 * IN,
    dia: 3 * IN, len: 4 * IN,

    metal: "aluminum", steps: 128,
  });

  function hookStock(p) {
    const rec = p.stock.rec, mat = p.mesh.material;
    p.mesh.onBeforeRender = (renderer, scene, camera) => {
      const u = mat.uniforms;
      u.uModel.value.copy(p.mesh.matrixWorld);
      u.uInvModel.value.copy(p.mesh.matrixWorld).invert();
      u.uProjView.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      u.uOrtho.value = camera.isOrthographicCamera ? 1 : 0;
      camera.getWorldDirection(u.uCamDirW.value);
      u.uBackoff.value = Math.max((typeof frustumSize !== "undefined" ? frustumSize : 200) * 4, 500);
      u.uOpacity.value = p.opacity;
      Stock.applyDovetail(p.stock, mat);

      u.uSteps.value = (typeof Quality !== "undefined")
        ? Math.min(p.stock.steps || 128, Quality.steps())
        : (p.stock.steps || 128);

      u.uFast.value = (typeof Quality !== "undefined" && Quality.fast) ? (Quality.fast() ? 1 : 0) : 0;

      /* Machined faces only take a polish on High — it is the one setting that
         promises no corners cut, and Auto may be dropping resolution already. */
      u.uMirror.value = (typeof Quality !== "undefined" && Quality.mode === "high") ? 1 : 0;
      mat.transparent = p.opacity < 1;
      Stock.upload(rec, mat);
    };
  }

  const STOCKS = [
    { key: "al531",  name: "5 × 3 × 1 aluminum",       note: "6061 · plate blank",
      def: { shape: "block", sx: 5 * IN, sy: 3 * IN, sz: 1 * IN, metal: "aluminum" } },
    { key: "st44",   name: "4 × 4 × ¾ mild steel",      note: "1018 · square blank",
      def: { shape: "block", sx: 4 * IN, sy: 4 * IN, sz: 0.75 * IN, metal: "mild" } },
    { key: "br55",   name: "5½ × 2½ × ¾ brass",         note: "C360 · bar stock",
      def: { shape: "block", sx: 5.5 * IN, sy: 2.5 * IN, sz: 0.75 * IN, metal: "brass" } },
    { key: "ss35",   name: "3½ × 3½ × 1¼ stainless",    note: "304 · heavy blank",
      def: { shape: "block", sx: 3.5 * IN, sy: 3.5 * IN, sz: 1.25 * IN, metal: "stainless" } },
    { key: "al62",   name: "6 × 4 × 2 aluminum",       note: "6061 · deep blank",
      def: { shape: "block", sx: 6 * IN, sy: 4 * IN, sz: 2 * IN, metal: "aluminum" } },
    { key: "bar2al", name: "Ø2 × 4 aluminum bar",      note: "6061 · round bar",
      def: { shape: "cyl", dia: 2 * IN, len: 4 * IN, metal: "aluminum" } },
    { key: "bar15st",name: "Ø1½ × 5 mild steel bar",    note: "1018 · round bar",
      def: { shape: "cyl", dia: 1.5 * IN, len: 5 * IN, metal: "mild" } },
    { key: "bar3ss", name: "Ø3 × 2 stainless bar",      note: "304 · short round",
      def: { shape: "cyl", dia: 3 * IN, len: 2 * IN, metal: "stainless" } },
  ];

  function addStockFrom(over, name) {
    if (!mainRenderer.capabilities.isWebGL2) {
      say("This browser has no WebGL2, so the billet cannot be solved on the GPU.", "warn");
      return null;
    }
    const def = Object.assign(STOCK_DEFAULT(), over || {});
    def.rec = Stock.make(def);
    Stock.rebuildGrid(def.rec);
    const p = Store.add(Stock.proxy(def),
      name || (def.shape === "cyl" ? "Stock · round bar" : "Stock · block"),
      { material: Stock.material(def.rec), edges: false, stock: def });
    hookStock(p);
    if (typeof StockSim !== "undefined") StockSim.reset(false);
    refresh(); fit();
    return p;
  }

  function addStock(shape) {
    const p = addStockFrom({ shape });
    if (p) say(`${Stock.METALS[p.stock.metal].name} stock added — Every surface is an equation, solved per pixel.`, "ok");
    return p;
  }

  const SAMPLE_STOCKS = {
    drill: {
      name: "Drill demo · 6 × 5 × 1 mild steel", zx: 1, zy: 1,
      note: "Four rows of holes an inch in from every edge, 0.75 deep at the peck",
      def: { shape: "block", sx: 6 * IN, sy: 5 * IN, sz: 1 * IN, metal: "mild" },
    },
    multiaxis: {
      name: "Multi-axis demo · 6 × 5 × 1 aluminum", zx: 0.5, zy: 4.5,
      note: "The rapid envelope, so there is something for the moves to be measured against",
      def: { shape: "block", sx: 6 * IN, sy: 5 * IN, sz: 1 * IN, metal: "aluminum" },
    },
    engrave: {
      name: "Engrave demo · 5 × 6 × ½ aluminum", zx: 4.5, zy: 2.5,
      note: "A nameplate blank — four lines of text, 0.005 deep",
      def: { shape: "block", sx: 5 * IN, sy: 6 * IN, sz: 0.5 * IN, metal: "aluminum" },
    },
    contourG41: {
      name: "Inside contour · 3½ × 3½ × ½ aluminum", zx: 0.75, zy: 0.75,
      note: "G41 puts the cutter inside the square, so this comes out a 2 × 2 through pocket",
      def: { shape: "block", sx: 3.5 * IN, sy: 3.5 * IN, sz: 0.5 * IN, metal: "aluminum" },
    },
    contourG42: {
      name: "Outside contour · 3 × 3 × ½ aluminum", zx: 0.5, zy: 0.5,
      note: "G42 puts the cutter outside it, and a Ø½ tool clears the whole 0.5 margin — a 2 × 2 boss cut free",
      def: { shape: "block", sx: 3 * IN, sy: 3 * IN, sz: 0.5 * IN, metal: "aluminum" },
    },
    probeTouchoff: {
      name: "Probe demo · 3 × 3 × 1 aluminum", center: true,
      note: "Zero on the centre of the top face — what the probing run is there to find",
      def: { shape: "block", sx: 3 * IN, sy: 3 * IN, sz: 1 * IN, metal: "aluminum" },
    },
    pocketG12: {
      name: "Pocket demo · 3 × 3 × ¾ aluminum", center: true,
      note: "Ø1.5 pocket bored on the center, 0.25 deep",
      def: { shape: "block", sx: 3 * IN, sy: 3 * IN, sz: 0.75 * IN, metal: "aluminum" },
    },
  };

  function loadSampleStock(key) {
    const s = SAMPLE_STOCKS[key];
    if (!s) return null;
    if (!mainRenderer.capabilities.isWebGL2) {
      say("This browser has no WebGL2, so the billet cannot be solved on the GPU.", "warn");
      return null;
    }

    Store.all().forEach(p => { if (p.stock) Store.remove(p.id); });

    const def = Object.assign(STOCK_DEFAULT(), s.def);
    def.rec = Stock.make(def);
    Stock.rebuildGrid(def.rec);
    const p = Store.add(Stock.proxy(def), s.name,
      { material: Stock.material(def.rec), edges: false, stock: def });
    hookStock(p);

    const h = Stock.halfOf(def);
    if (s.center) {
      p.base.set(0, 0, h[2] * 2);
      p.baseNote = p.zeroNote = "center of the top face";
    } else {
      p.base.set(-h[0] + (s.zx || 0) * IN, -h[1] + (s.zy || 0) * IN, h[2] * 2);
      p.baseNote = p.zeroNote = "the program's X0 Y0, on the top face";
    }
    p.zero.copy(p.base);
    p.pos.set(0, 0, 0);
    Store.apply(p);
    Store.markReference(p);
    Store.select(p.id);

    if (typeof StockSim !== "undefined") StockSim.reset(false);

    if (typeof Gizmo !== "undefined" && (Gizmo.findVise() || Gizmo.findPars())) {
      Gizmo.alignStockInVise("center");
    }

    say(`${s.name} — ${s.note}.`, "ok");
    refresh(); home();
    return p;
  }

  /* Resizing the blank leaves the jaws where they were, so a wider billet ends
     up standing through the vise. Close them back onto it — unless the user has
     turned that off, in which case the button beside the switch does it once. */
  function reclampJaws(force) {
    const auto = $("#pm-jaw-auto");
    if (!force && auto && !auto.checked) return;
    if (typeof Gizmo === "undefined" || !Gizmo.alignStockInVise) return;
    if (!Gizmo.findVise() && !Gizmo.findPars()) return;
    const where = (window.PartModels && window.PartModels.fixture)
      ? window.PartModels.fixture.state().slide : "center";
    Gizmo.alignStockInVise(where || "center", !force);
  }

  function rebuildStock(p) {
    const def = p.stock;
    const geo = Stock.proxy(def);
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    p.mesh.geometry.dispose();
    p.mesh.geometry = geo;
    p.geometry = geo;
    p.tris = Geo.triCount(geo);
    const h = Stock.halfOf(def);
    p.mesh.material.uniforms.uHalf.value.set(h[0], h[1], h[2]);
    p.mesh.material.uniforms.uShape.value = def.shape === "cyl" ? 1 : 0;
    Stock.applyDovetail(def, p.mesh.material);
    Stock.rebuildGrid(def.rec);
    Store.apply(p);
    refresh();
  }

  /* Swapping the metal re-skins the blank a cell at a time rather than cross-
     fading it: the old finish stays in slot A, the new one goes into slot B,
     and a front crosses the solid converting A to B as it passes. Only the
     billet does this — nothing else in the scene carries the sweep shader. */
  function setMetal(p, keyName) {
    const m = Stock.METALS[keyName];
    if (!m || !p || !p.stock || !p.mesh || !p.mesh.material.uniforms) return;
    const u = p.mesh.material.uniforms;
    if (!u.uSwProgress) return;

    const same = p.stock.metal === keyName;
    p.stock.metal = keyName;

    /* Whatever it is wearing right now becomes the "before". */
    if (!same) {
      u.uCol.value.copy(u.uColB.value);
      u.uSpec.value.copy(u.uSpecB.value);
      u.uShine.value = u.uShineB.value;
      u.uGrain.value = u.uGrainB.value;
    }
    u.uColB.value.fromArray(m.col);
    u.uSpecB.value.fromArray(m.spec);
    u.uShineB.value = m.shine;
    u.uGrainB.value = m.grain;

    Stock.aimSweep(u, p.stock);
    u.uSwOn.value = 1;

    /* Driven straight off rAF rather than through Motion, because Motion eases
       both ends and an easing front reads as a stall. This one is linear. */
    if (p._sweep) cancelAnimationFrame(p._sweep);
    const ms = Stock.SWEEP.seconds * 1000;
    const t0 = performance.now();
    (function step(now) {
      const k = Math.min((now - t0) / ms, 1);
      u.uSwProgress.value = k;
      u.uSwTime.value = (now - t0) / 1000;

      /* Fade the glowing front in at the start and out at the finish, so it
         never pops on an edge that is already done. */
      u.uSwActive.value = Math.min(smoothstep(0, 0.06, k), 1 - smoothstep(0.94, 1, k));

      if (k < 1) { p._sweep = requestAnimationFrame(step); return; }

      p._sweep = 0;
      u.uSwActive.value = 0;
      u.uSwOn.value = 0;
      u.uCol.value.copy(u.uColB.value);
      u.uSpec.value.copy(u.uSpecB.value);
      u.uShine.value = u.uShineB.value;
      u.uGrain.value = u.uGrainB.value;
    })(t0);
    refresh();
  }

  function smoothstep(a, b, x) {
    const t = clamp((x - a) / (b - a || 1e-9), 0, 1);
    return t * t * (3 - 2 * t);
  }

  const JOBS = [
    {
      key: "facepocket", name: "Face + pocket", note: "5 × 3 × 1 aluminum · Ø1/2 flat",
      stock: { shape: "block", sx: 5 * IN, sy: 3 * IN, sz: 1 * IN, metal: "aluminum" },
      tools: [[1, 0.5, "flat"]], clamp: "dx6",
      code: () => `%
O1001 (FACE AND POCKET - 5.0 X 3.0 X 1.0 - 6061)
(WORK ZERO: NEAR LEFT CORNER, Z0 = TOP FACE)
G20 G90 G54 G17 G40 G49 G80
T1 M06 (.500 4FL FLAT ENDMILL)
S5000 M03
G43 H1 Z1.
M08
(--- FACE THE TOP .040 DEEP, .400 STEPOVER ---)
G00 X-.4 Y.2 Z.1
G01 Z-.04 F15.
X5.4 F50.
G00 Y.6
G01 X-.4
G00 Y1.
G01 X5.4
G00 Y1.4
G01 X-.4
G00 Y1.8
G01 X5.4
G00 Y2.2
G01 X-.4
G00 Y2.6
G01 X5.4
G00 Y2.9
G01 X-.4
G00 Z.2
(--- POCKET 2.500 X 1.500, .250 DEEP, 2 PASSES ---)
(RASTER .375 STEPOVER THEN A PERIMETER FINISH)
X1.5 Y1.
G01 Z-.125 F12.
X3.5 F35.
Y1.375
X1.5
Y1.75
X3.5
Y2.
X1.5
Y1.
X3.5
Y2.
X1.5
G00 Z.1
X1.5 Y1.
G01 Z-.25 F12.
X3.5 F35.
Y1.375
X1.5
Y1.75
X3.5
Y2.
X1.5
Y1.
X3.5
Y2.
X1.5
G00 Z1.
M09
M05
G91 G28 Z0.
M30
%`,
    },
    {

      key: "vf1job", name: "VF-1 — vise on the table",
      note: "6 × 4 × 1 aluminum · Haas HV6 · parallels · VF-1 table",
      stock: { shape: "block", sx: 6 * IN, sy: 4 * IN, sz: 1 * IN, metal: "aluminum" },
      tools: [[21, 0.75, "flat"], [22, 0.375, "flat"], [23, 0.3125, "drill"]],
      clamp: "haasv6", machineTable: true,
      code: () => {
        const L = ["%", "O1008 (VF-1 - FACE, POCKET AND BOLT CIRCLE - 6061)",
          "(WORK ZERO: NEAR LEFT CORNER, Z0 = TOP FACE)",
          "(SET LINEAR AXES TO 'TABLE MOVES' TO WATCH THE SADDLE CARRY IT)",
          "G20 G90 G54 G17 G40 G49 G80",
          "", "(=== T21 .750 FLAT - FACE THE TOP ===)",
          "T21 M06 (.750 4FL FLAT ENDMILL)", "S4200 M03", "G43 H21 Z1.", "M08",
          "G00 X-.5 Y.375", "G00 Z.1", "G01 Z-.035 F20."];
        for (let k = 0; k < 6; k++) {
          const y = 0.375 + k * 0.65;
          L.push(`G01 X${k % 2 ? -0.5 : 6.5} F48.`);
          if (k < 5) L.push(`G01 Y${(y + 0.65).toFixed(3)}`);
        }
        L.push("G00 Z1.", "M09", "M05",
          "", "(=== T22 .375 FLAT - 3.000 X 1.600 POCKET, R.300, .300 DEEP ===)",
          "T22 M06 (.375 3FL FLAT ENDMILL)", "S6000 M03", "G43 H22 Z1.", "M08",
          "G00 X1.75 Y2. Z.1", "G01 Z-.035 F20.");
        [-0.17, -0.30].forEach(dz => {
          L.push(`G01 X4.25 Z${dz.toFixed(3)} F16.`,
            "G01 Y2.5125 F34.", "G01 X1.75", "G01 Y1.4875", "G01 X4.25", "G01 Y2.");
        });

        L.push("(--- FINISH THE WALL ---)",
          "G01 X4.3125 Y2.2875 F26.",
          "G03 X4.1875 Y2.4125 I-.1125 J0.",
          "G01 X1.8125",
          "G03 X1.6875 Y2.2875 I0. J-.1125",
          "G01 Y1.7125",
          "G03 X1.8125 Y1.5875 I.1125 J0.",
          "G01 X4.1875",
          "G03 X4.3125 Y1.7125 I0. J.1125",
          "G01 Y2.2875",
          "G00 Z1.", "M09", "M05",
          "", "(=== T23 .3125 DRILL - SIX ON A 2.000 BOLT CIRCLE ===)",
          "T23 M06 (.3125 JOBBER DRILL)", "S3600 M03", "G43 H23 Z1.", "M08",
          "G00 X5. Y2.", "G99 G83 X5. Y2. Z-1.06 R.1 Q.2 F8.");
        for (let k = 1; k < 6; k++) {
          const a = k * Math.PI / 3;
          L.push(`X${(3 + 2 * Math.cos(a)).toFixed(4)} Y${(2 + 2 * Math.sin(a)).toFixed(4)}`);
        }
        L.push("G80", "G00 Z1.", "M09", "M05", "G91 G28 Z0.", "M30", "%");
        return L.join("\n");
      },
    },
    {
      key: "drill", name: "Bolt circle", note: "4 × 4 × 3/4 mild steel · Ø5/16 drill",
      stock: { shape: "block", sx: 4 * IN, sy: 4 * IN, sz: 0.75 * IN, metal: "mild" },
      tools: [[2, 0.3125, "drill"]], clamp: "dx6",
      code: () => `%
O1002 (BOLT CIRCLE AND CENTER - 4.0 X 4.0 X .75 - 1018)
(WORK ZERO: NEAR LEFT CORNER, Z0 = TOP FACE)
G20 G90 G54 G17 G40 G49 G80
T2 M06 (.3125 JOBBER DRILL)
S1600 M03
G43 H2 Z1.
M08
G00 X2. Y2.
(--- CENTER HOLE, THROUGH ---)
G99 G81 X2. Y2. Z-.85 R.1 F6.
G80
(--- 6 HOLES ON A 2.500 BOLT CIRCLE ---)
G99 G81 R.1 Z-.85 F6.
X3.25 Y2.
X2.625 Y3.083
X1.375 Y3.083
X.75 Y2.
X1.375 Y.917
X2.625 Y.917
G80
G00 Z1.
M09
M05
G91 G28 Z0.
M30
%`,
    },
    {
      key: "slot", name: "Slot + rebate", note: "5.5 × 2.5 × 3/4 brass · Ø3/8 flat",
      stock: { shape: "block", sx: 5.5 * IN, sy: 2.5 * IN, sz: 0.75 * IN, metal: "brass" },
      tools: [[3, 0.375, "flat"]], clamp: "d688",
      code: () => `%
O1003 (THROUGH SLOT AND EDGE REBATE - 5.5 X 2.5 X .75 - C360)
(WORK ZERO: NEAR LEFT CORNER, Z0 = TOP FACE)
G20 G90 G54 G17 G40 G49 G80
T3 M06 (.375 4FL FLAT ENDMILL)
S3800 M03
G43 H3 Z1.
M08
(--- .375 WIDE SLOT THROUGH THE MIDDLE, 3 PASSES ---)
G00 X.6 Y1.25 Z.1
G01 Z-.26 F10.
X4.9 F28.
G00 Z.1
X.6
G01 Z-.52 F10.
X4.9 F28.
G00 Z.1
X.6
G01 Z-.8 F10.
X4.9 F28.
G00 Z.2
(--- .200 DEEP REBATE AROUND THE TOP EDGE ---)
X-.3 Y0.
G01 Z-.2 F10.
X5.8 F32.
G00 Z.1
X5.8 Y2.5
G01 Z-.2 F10.
X-.3 F32.
G00 Z.1
X0. Y-.3
G01 Z-.2 F10.
Y2.8 F32.
G00 Z.1
X5.5 Y2.8
G01 Z-.2 F10.
Y-.3 F32.
G00 Z1.
M09
M05
G91 G28 Z0.
M30
%`,
    },
    {

      key: "crown", name: "3D crown",
      note: "3.5 × 3.5 × 1.25 stainless · Ø1/2 rough + Ø1/4 ball finish",
      stock: { shape: "block", sx: 3.5 * IN, sy: 3.5 * IN, sz: 1.25 * IN, metal: "stainless" },
      tools: [[7, 0.5, "flat"], [4, 0.25, "ball"]], clamp: "dx6",
      code: () => {

        const R = 3.5, CY = 1.75, CREST = -0.08;
        const surf = y => {
          const d = y - CY;
          return CREST - (R - Math.sqrt(Math.max(R * R - d * d, 0)));
        };

        const spanAt = z => {
          const a = z - CREST + R;
          return Math.sqrt(Math.max(R * R - a * a, 0));
        };

        const STOCK = 0.020;
        const RR = 0.250;
        const L = [];
        const f3 = v => v.toFixed(3), f4 = v => v.toFixed(4);

        L.push("%", "O1004 (CROWNED SURFACE - 3.5 X 3.5 X 1.25 - 304)",
               "(WORK ZERO: NEAR LEFT CORNER, Z0 = TOP FACE)",
               "G20 G90 G54 G17 G40 G49 G80");

        L.push("", "(=== T7 .500 FLAT - Z-LEVEL ROUGH, .020 STOCK ON ===)",
               "T7 M06 (.500 4FL FLAT ENDMILL)", "S1900 M03", "G43 H7 Z1.", "M08");
        let flip = false;
        [-0.14, -0.28, -0.42].forEach(Z => {
          const keepOut = spanAt(Z - STOCK);
          L.push(`(--- LEVEL Z${f3(Z)} · CLEAR OUTSIDE ${f3(keepOut)} EITHER SIDE ---)`);
          [-1, 1].forEach(side => {
            const limit = CY + side * (keepOut + RR);
            const start = side < 0 ? -0.200 : 3.700;
            const n = Math.max(Math.floor(Math.abs(limit - start) / 0.350), 0);
            for (let k = 0; k <= n; k++) {

              const t = (k === n) ? 1 : (k * 0.350) / Math.abs(limit - start);
              const y = start + (limit - start) * Math.min(t, 1);
              const x0 = flip ? 3.700 : -0.200, x1 = flip ? -0.200 : 3.700;
              flip = !flip;
              L.push(`G00 X${f3(x0)} Y${f3(y)}`, `G00 Z${f3(Z + 0.1)}`,
                     `G01 Z${f3(Z)} F10.`, `X${f3(x1)} F22.`, "G00 Z.25");
            }
          });
        });
        L.push("G00 Z1.", "M09", "M05");

        const PASSES = 31;
        L.push("", "(=== T4 .250 BALL - FINISH THE CROWN ===)",
               "T4 M06 (.250 BALL NOSE)", "S3800 M03", "G43 H4 Z1.", "M08",
               "(--- RASTER IN X, .108 STEPOVER, 3.500 CROWN RADIUS ---)");
        for (let k = 0; k < PASSES; k++) {
          const y = 0.125 + k * (3.25 / (PASSES - 1));
          const x0 = k % 2 ? 3.375 : 0.125, x1 = k % 2 ? 0.125 : 3.375;
          L.push(`G00 X${f3(x0)} Y${f3(y)} Z.1`);
          L.push(`G01 Z${f4(surf(y))} F12.`);
          L.push(`X${f3(x1)} F30.`);
        }
        L.push("G00 Z1.", "M09", "M05", "G91 G28 Z0.", "M30", "%");
        return L.join("\n");
      },
    },

    {
      key: "keyways", name: "4th axis — keyways", note: "Ø2 × 4 aluminum bar · Ø1/4 flat · A indexed",
      stock: { shape: "cyl", dia: 2 * IN, len: 4 * IN, metal: "aluminum", rotary: true },
      tools: [[5, 0.25, "flat"]],
      code: () => {
        const L = ["%", "O1005 (FOUR KEYWAYS ON A 2.000 BAR - 6061)",
          "(WORK ZERO: LEFT END FACE, Y0 Z0 ON THE AXIS)",
          "G20 G90 G54 G17 G40 G49 G80",
          "T5 M06 (.250 4FL FLAT ENDMILL)", "S5200 M03", "G43 H5 Z2.5", "M08",
          "(--- .250 WIDE X .150 DEEP, INDEXED 90 DEG ---)", "G00 Y0."];
        [0, 90, 180, 270].forEach(a => {
          L.push(`G00 A${a}.`, "X.5 Z1.2", "G01 Z.85 F14.", "X3.5 F30.", "G00 Z1.2");
        });
        L.push("G00 Z2.5", "M09", "M05", "G91 G28 Z0.", "M30", "%");
        return L.join("\n");
      },
    },
    {
      key: "hexbar", name: "4th axis — hex on round bar", note: "Ø2 × 4 mild steel bar · Ø1/2 flat · A indexed 60°",
      stock: { shape: "cyl", dia: 2 * IN, len: 4 * IN, metal: "mild", rotary: true },
      tools: [[6, 0.5, "flat"]],
      code: () => {

        const L = ["%", "O1006 (HEX ON A 2.000 BAR - 1.700 A/F - 1018)",
          "(WORK ZERO: LEFT END FACE, Y0 Z0 ON THE AXIS)",
          "G20 G90 G54 G17 G40 G49 G80",
          "T6 M06 (.500 4FL FLAT ENDMILL)", "S4200 M03", "G43 H6 Z2.5", "M08",
          "(--- SIX FLATS, 3 PASSES EACH, INDEXED 60 DEG ---)"];
        for (let k = 0; k < 6; k++) {
          L.push(`G00 A${(k * 60)}.`, "G00 Y-.35 Z1.3", "X-.3");
          L.push("G01 Z.85 F18.");
          [["4.3", "0."], ["-.3", ".35"], ["4.3", null]].forEach(([x, y]) => {
            L.push(`X${x} F45.`);
            if (y !== null) L.push(`Y${y} F20.`);
          });
          L.push("G00 Z1.3");
        }
        L.push("G00 Z2.5", "M09", "M05", "G91 G28 Z0.", "M30", "%");
        return L.join("\n");
      },
    },

    {
      key: "fiveaxis", name: "5-axis — dovetail on the faceplate",
      note: "4 × 2½ × 1½ aluminum · dovetail fixture · contour, pocket, drill, 5-axis",
      stock: { shape: "block", sx: 4 * IN, sy: 2.5 * IN, sz: 1.5 * IN, metal: "aluminum" },
      tools: [[11, 0.5, "flat"], [12, 0.375, "flat"], [13, 0.25, "ball"],
              [14, 0.201, "drill"], [15, 0.375, "drill"]],
      zeroAt: "topcenter",

      rig: (def) => {
        const sz = Stock.halfOf(def)[2] * 2;
        const TOP = 120;

        const fp = Store.add(Samples.build("faceplate"), "5-axis rotary faceplate",
                             { onTable: true, role: "machine" });
        fp.pos.set(0, 0, -sz - TOP);
        fp.baseNote = fp.zeroNote = "plate mounting face";
        Store.apply(fp);

        const fx = Store.add(Samples.dovetailFixture({ rise: TOP }), "Dovetail fixture",
                             { onTable: true, role: "fixture" });
        fx.base.set(0, 0, TOP);
        fx.zero.copy(fx.base);
        fx.baseNote = fx.zeroNote = "dovetail seating face";
        fx.pos.set(0, 0, -sz);
        Store.apply(fx);

        const tn = Store.add(Samples.stockTenon({}), "Stamped dovetail tenon",
          { onTable: true, role: "stock", material: new THREE.MeshPhongMaterial({
              color: 0xb9bdc4, shininess: 40, specular: 0x9aa0a8,
              side: THREE.DoubleSide }) });
        tn.pos.set(0, 0, -sz);
        tn.baseNote = tn.zeroNote = "tenon root, on the billet's underside";
        Store.apply(tn);
      },

      code: () => {
        const L = [];

        const num = v => {
          if (!isFinite(v) || Math.abs(v) < 5e-5) v = 0;
          return v.toFixed(4).replace(/(\.\d*?)0+$/, "$1").replace(/^(-?)0\.(\d)/, "$1.$2");
        };

        const prog = (fx, fy, fz, aDeg, cDeg) => {
          const cr = -cDeg * Math.PI / 180, cc = Math.cos(cr), sc = Math.sin(cr);
          const x = fx * cc - fy * sc, w = fx * sc + fy * cc;
          const ar = -aDeg * Math.PI / 180, ca = Math.cos(ar), sa = Math.sin(ar);
          return [x, w * ca + fz * sa, -w * sa + fz * ca];
        };
        const at = (p, dz) => `X${num(p[0])} Y${num(p[1])} Z${num(p[2] + (dz || 0))}`;

        const TOPZ = -0.040;
        const PX = 1.750, PY = 1.100, PR = 0.400;
        const CX = PX - PR, CY = PY - PR;
        const BR = 0.125;

        L.push("%", "O1007 (FIVE AXIS DEMO - 4.000 X 2.500 X 1.500 - 6061)",
          "(SET-UP: DOVETAIL FIXTURE SPIGOTED INTO THE ROTARY FACEPLATE)",
          "(BLANK PREPPED WITH A 1.250 X .125 45 DEG DOVETAIL UNDERNEATH)",
          "(WORK ZERO: CENTER OF THE TOP FACE - A AND C TURN ABOUT IT)",
          "G20 G90 G54 G17 G40 G49 G80",
          "G00 A0. C0.");

        L.push("", "(=== T11 .500 FLAT - FACE AND OUTSIDE CONTOUR ===)",
          "T11 M06 (.500 4FL FLAT ENDMILL)", "S6000 M03", "G43 H11 Z2.", "M08");

        L.push("(--- FACE THE TOP .040 OFF, .367 STEPOVER ---)");
        const yF = [-1.1, -0.733, -0.367, 0, 0.367, 0.733, 1.1];
        L.push("G00 X-2.45 Y-1.1", "G00 Z.1", "G01 Z-.04 F18.");
        yF.forEach((y, i) => {
          L.push(`G01 X${num(i % 2 ? -2.45 : 2.45)} F45.`);
          if (i < yF.length - 1) L.push(`G01 Y${num(yF[i + 1])}`);
        });
        L.push("G00 Z.25");

        L.push("(--- OUTSIDE CONTOUR 3.500 X 2.200 R.400, CLIMB, FOUR DEPTHS ---)");
        [-0.400, -0.800, -1.200, -1.505].forEach(d => {
          L.push(`G00 X-2.6 Y-.7`, `G01 Z${num(d)} F14.`, "G01 X-2. F32.",
            "G01 Y.7",
            "G02 X-1.35 Y1.35 I.65 J0.",
            "G01 X1.35",
            "G02 X2. Y.7 I0. J-.65",
            "G01 Y-.7",
            "G02 X1.35 Y-1.35 I-.65 J0.",
            "G01 X-1.35",
            "G02 X-2. Y-.7 I0. J.65",
            "G01 X-2.6",
            "G00 Z.25");
        });
        L.push("G00 Z2.", "M09", "M05");

        L.push("", "(=== T12 .375 FLAT - INSIDE CONTOUR ===)",
          "T12 M06 (.375 3FL FLAT ENDMILL)", "S7200 M03", "G43 H12 Z2.", "M08",
          "(--- POCKET 2.400 X 1.200 R.300 X .450 DEEP ---)");

        const TR = 0.1875;
        const FXh = 1.200 - TR, FYh = 0.600 - TR, FR = 0.300 - TR;
        const RXh = 0.9925, RYh = 0.3525;
        [[-0.265, -0.040], [-0.490, -0.265]].forEach(([dz, entry], lvl) => {
          L.push(`(--- ${lvl ? "FLOOR" : "ROUGH"} LEVEL, Z${num(dz)} ---)`);
          L.push(`G00 X${num(-RXh)} Y${num(-RYh)}`, "G00 Z.1",
                 `G01 Z${num(entry)} F20.`,
                 `G01 X${num(RXh)} Z${num(dz)} F16.`);
          [-0.176, 0, 0.176, RYh].forEach((y, i) => {
            L.push(`G01 Y${num(y)}${i ? "" : " F42."}`,
                   `G01 X${num(i % 2 ? RXh : -RXh)}`);
          });
          if (lvl) {

            const kx = FXh - FR, ky = FYh - FR;
            L.push("(--- FINISH THE INSIDE CONTOUR ---)");
            L.push(`G01 X${num(FXh)} Y${num(ky)} F30.`,
              `G03 X${num(kx)} Y${num(FYh)} I${num(-FR)} J0`,
              `G01 X${num(-kx)}`,
              `G03 X${num(-FXh)} Y${num(ky)} I0 J${num(-FR)}`,
              `G01 Y${num(-ky)}`,
              `G03 X${num(-kx)} Y${num(-FYh)} I${num(FR)} J0`,
              `G01 X${num(kx)}`,
              `G03 X${num(FXh)} Y${num(-ky)} I0 J${num(FR)}`,
              `G01 Y${num(ky)}`);
          }
          L.push("G00 Z.5");
        });
        L.push("G00 Z2.", "M09", "M05");

        const HX = 1.400, HY = 0.750;
        L.push("", "(=== T15 .375 SPOT DRILL ===)",
          "T15 M06 (.375 90 DEG SPOT DRILL)", "S3200 M03", "G43 H15 Z2.", "M08",
          "(--- SPOT FOUR HOLES, .100 DEEP, WITH A DWELL ---)",
          `G00 X${num(HX)} Y${num(HY)}`,
          `G99 G82 X${num(HX)} Y${num(HY)} Z-.1 R.1 P200 F8.`,
          `X${num(-HX)}`, `Y${num(-HY)}`, `X${num(HX)}`,
          "G80", "G00 Z2.", "M09", "M05");

        L.push("", "(=== T14 .201 DRILL - 1/4-20 TAP SIZE ===)",
          "T14 M06 (.201 JOBBER DRILL)", "S4500 M03", "G43 H14 Z2.", "M08",
          "(--- TWO HOLES AT C0, .900 DEEP, PECKED ---)",
          `G00 X${num(HX)} Y${num(HY)}`,
          `G99 G83 X${num(HX)} Y${num(HY)} Z-.94 R.05 Q.15 F7.`,
          `Y${num(-HY)}`,
          "G80", "G00 Z2.",
          "(--- LET THE FACEPLATE HAND OVER THE OTHER PAIR ---)",
          "G00 C180.",
          `G99 G83 X${num(HX)} Y${num(HY)} Z-.94 R.05 Q.15 F7.`,
          `Y${num(-HY)}`,
          "G80", "G00 Z2.", "G00 C0.", "M09", "M05");

        L.push("", "(=== T13 .250 BALL - FIVE AXIS WORK ===)",
          "T13 M06 (.250 BALL NOSE)", "S9000 M03", "G43 H13 Z2.", "M08");

        L.push("(--- ROLLING EDGE BREAK - C FOLLOWS THE OUTWARD NORMAL, A LEANS 20 ---)");
        const ATILT = -20;
        const edge = [[PX, -CY, 0], [PX, CY, 0]];
        const roundCorner = (cx, cy, a0) => {
          for (let k = 1; k <= 6; k++) {
            const d = a0 + k * 15, a = d * Math.PI / 180;
            edge.push([cx + PR * Math.cos(a), cy + PR * Math.sin(a), d]);
          }
        };
        roundCorner(CX, CY, 0);
        edge.push([-CX, PY, 90]);
        roundCorner(-CX, CY, 90);
        edge.push([-PX, -CY, 180]);
        roundCorner(-CX, -CY, 180);
        edge.push([CX, -PY, 270]);
        roundCorner(CX, -CY, 270);

        L.push("G00 X0. Y0. Z3.", `G00 A${num(ATILT)} C0.`);
        edge.forEach((q, i) => {
          const p = prog(q[0], q[1], TOPZ - BR, ATILT, q[2]);
          if (!i) {
            L.push(`G00 ${at(p, 0.45)}`, `G01 ${at(p)} F20.`);
          } else {
            L.push(`G01 ${at(p)} A${num(ATILT)} C${num(q[2])}${i === 1 ? " F26." : ""}`);
          }
        });
        L.push(`G01 ${at(prog(edge[0][0], edge[0][1], TOPZ - BR, ATILT, 360), 0.45)} F60.`);

        L.push("(--- 30 DEG LANDS ON BOTH ENDS - 3+2, ROTARIES PARKED ---)");
        const F_TOPX = 1.427, F_BOTX = 1.750, F_BOTZ = -0.600;
        const nX = Math.cos(30 * Math.PI / 180), nZ = Math.sin(30 * Math.PI / 180);
        [[1, -90], [-1, 90]].forEach(([sgn, cIdx]) => {
          L.push("G00 X0. Y0. Z3.", `G00 A30. C${num(cIdx)}`);
          const N = 11;
          let last = null;
          for (let k = 0; k < N; k++) {
            const t = k / (N - 1);
            const fx = sgn * (F_TOPX + (F_BOTX - F_TOPX) * t);
            const fz = TOPZ + (F_BOTZ - TOPZ) * t;
            const bx = fx + sgn * BR * nX, bz = fz + BR * nZ - BR;
            const yA = k % 2 ? 1.25 : -1.25;
            const pa = prog(bx, yA, bz, 30, cIdx), pb = prog(bx, -yA, bz, 30, cIdx);

            if (!k) L.push(`G00 ${at(pa, 0.8)}`, `G01 ${at(pa)} F26.`);
            else    L.push(`G01 ${at(pa)}`);
            L.push(`G01 ${at(pb)}`);
            last = pb;
          }

          L.push(`G01 ${at(last, 0.9)} F60.`);
        });

        L.push("(--- SIMULTANEOUS 5-AXIS SPIRAL - R.606 DISH IN THE POCKET FLOOR ---)");
        const SPH_R = 0.606, SPH_Z = -0.084, RB = SPH_R - BR, PSI = 47.96;
        const NS = 60, REV = 2.5;
        L.push("G00 X0. Y0. Z3.", "G00 A0. C0.");
        for (let k = 0; k <= NS; k++) {
          const t = k / NS;
          const psi = PSI * t, phi = REV * 360 * t;
          const sp = Math.sin(psi * Math.PI / 180), cp = Math.cos(psi * Math.PI / 180);
          const p = prog(RB * sp * Math.cos(phi * Math.PI / 180),
                         RB * sp * Math.sin(phi * Math.PI / 180),
                         SPH_Z - RB * cp - BR, psi, phi);
          if (!k) L.push(`G00 ${at(p, 0.6)}`, `G01 ${at(p)} F10.`);
          else L.push(`G01 ${at(p)} A${num(psi)} C${num(phi)}${k === 1 ? " F24." : ""}`);
          if (k === NS) L.push(`G01 ${at(p, 0.9)} F60.`);
        }

        L.push("G00 X0. Y0. Z3.", "G00 A0. C0.",
          "M09", "M05", "G91 G28 Z0.", "M30", "%");
        return L.join("\n");
      },
    },
  ];

  function seatClampUnder(clampKey, stockDef, onTable) {
    const s = Samples.get(clampKey);
    if (!s || !s.hold) return null;
    const built = Samples.build(clampKey);
    if (!built) return null;

    const h = Stock.halfOf(stockDef);
    const sx = h[0] * 2, sy = h[1] * 2, sz = h[2] * 2;
    const grip = Math.min(0.35 * IN, sz * 0.45);

    const c = Store.add(built, s.name, { onTable: !!onTable, role: "fixture" });

    /* The vise goes in turned a quarter — jaws closing across Y, stationary
       jaw at the back and the handle toward the operator, the way one actually
       sits on a VMC table. Turning the vise rather than the whole setup leaves
       the billet square with the world, so its own X still runs left to right,
       Y runs front to back, and the work zero stays on the near-left corner of
       the top face. */
    c.rot.z = 270;
    c.pos.set(sx / 2, sy - s.hold.faceX, -(sz - grip) - s.hold.jawTop);
    if (c.members[0]) c.members[0].value = clamp(sy, c.members[0].min, c.members[0].max);
    Store.apply(c);

    const barH = s.hold.jawTop - s.hold.bed - grip;
    if (barH > 2) {

      const barL = s.hold.jawW || sx;
      const jaw = c.members[0];
      const bars = Samples.parallelPair({
        width: sy, h: barH, len: barL,
        travel: jaw ? Math.max(jaw.max - jaw.value, 0) : 0,
      });
      const par = Store.add(bars, "Parallels", { onTable: !!onTable, role: "fixture" });
      par.rot.z = 270;
      par.pos.set(sx / 2, sy / 2, -sz - barH);

      if (jaw) par.follow = { partId: c.id, member: 0, offset: -jaw.value };
      Store.apply(par);
    }
    return c;
  }

  function loadJob(j) {
    if (!mainRenderer.capabilities.isWebGL2) {
      say("This browser has no WebGL2, so the billet cannot be solved on the GPU.", "warn");
      return;
    }

    Store.all().forEach(p => Store.remove(p.id));

    loadGCode(j.code());
    ToolShapes.clear();
    j.tools.forEach(([n, dia, shape]) => {
      toolTable.set(n, dia);
      if (shape) ToolShapes.set(n, shape);
    });
    if (typeof updateToolTableUI === "function") updateToolTableUI();

    const def = Object.assign(STOCK_DEFAULT(), j.stock);
    def.rec = Stock.make(def);
    Stock.rebuildGrid(def.rec);
    const onTable = !!(def.rotary || j.trunnion || j.rig);
    const p = Store.add(Stock.proxy(def), j.name + " stock",
      { material: Stock.material(def.rec), edges: false, stock: def, onTable });
    hookStock(p);

    const h = Stock.halfOf(def);
    if (j.zeroAt === "topcenter") {

      p.base.set(0, 0, h[2] * 2);
      p.zero.copy(p.base);
      p.baseNote = p.zeroNote = "center of the top face";
      p.pos.set(0, 0, 0);
    } else if (def.rotary) {

      p.base.set(0, 0, 0);
      p.zero.copy(p.base);
      p.baseNote = p.zeroNote = "left end face, on the axis";
      p.rot.set(0, 90, 0);
      p.pos.set(0, 0, 0);
    } else {

      p.base.set(-h[0], -h[1], h[2] * 2);
      p.zero.copy(p.base);
      p.baseNote = p.zeroNote = "top near-left corner";
      p.pos.set(0, 0, 0);
    }
    Store.apply(p);

    Store.markReference(p);

    const seated = j.clamp ? seatClampUnder(j.clamp, def, onTable) : null;

    if (j.rig) j.rig(def);

    if (j.machineTable && seated) {
      const t = Store.add(Samples.build("vf1"), "Haas VF-1 table",
                          { onTable, role: "machine" });
      const hold = (Samples.get(j.clamp) || {}).hold || {};

      seated.geometry.computeBoundingBox();
      const gb = seated.geometry.boundingBox;
      const cx = (gb.min.x + gb.max.x) / 2, cy = (gb.min.y + gb.max.y) / 2;
      const R = new THREE.Euler(0, 0, seated.rot.z * Math.PI / 180);
      const mid = new THREE.Vector3(cx, cy, 0).applyEuler(R).add(seated.pos);
      const slot = new THREE.Vector3((hold.boltCX || 0) - cx, 0, 0).applyEuler(R);
      t.pos.set(mid.x + slot.x, mid.y + slot.y, seated.pos.z);
      t.baseNote = t.zeroNote = "table work surface";
      Store.apply(t);
    }
    Store.select(p.id);

    StockSim.reset(false);
    simSeekToTime(0);
    say(`${j.name} loaded — Stock, vise, tools and program. Press play.`, "ok");
    refresh(); home();
  }

  function setScale(v) {
    const p = Store.current(); if (!p || !isFinite(v)) return;
    p.scale = clamp(v, 1, 1000) / 100;
    Store.apply(p);
    refresh(true);
  }

  function quickPoint(kind) {
    const p = Store.current(); if (!p) return;
    if (!p.geometry.boundingBox) p.geometry.computeBoundingBox();
    const b = p.geometry.boundingBox;
    const c = b.getCenter(new THREE.Vector3());
    const map = {
      center: [c.x, c.y, c.z, "bounding-box center"],
      top:    [c.x, c.y, b.max.z, "top face center"],
      corner: [b.min.x, b.min.y, b.min.z, "lower-left corner"],
      model:  [0, 0, 0, "model origin"],
    }[kind];
    if (!map) return;
    const v = new THREE.Vector3(map[0], map[1], map[2]);
    if (target !== "zero") { p.base.copy(v); p.baseNote = map[3]; }
    if (target !== "base") { p.zero.copy(v); p.zeroNote = map[3]; }
    Store.apply(p);
    if (target !== "base" && zeroOnPick()) Store.sendZeroToMachineZero(p);
    refresh();
    toast((target === "base" ? "Base point" : target === "zero" ? "Work zero" : "Base and zero")
      + " set — " + map[3]);
  }

  async function intake(files) {
    const wanted = files.filter(f => Loaders.ACCEPTS.test(f.name));
    if (!wanted.length) { say("Nothing there I can read — STEP, STL, OBJ, IGES or BREP.", "warn"); return; }
    for (const f of wanted) {
      say(`Reading ${f.name}…`);
      try {
        const geo = await Loaders.read(f);
        if (!geo) throw new Error("nothing came back from that file");
        const p = Store.add(geo, f.name.replace(/\.[^.]+$/, ""));
        say(`${p.name} — ${p.tris.toLocaleString()} triangles.`, "ok");
        refresh(); fit();
      } catch (err) {
        console.warn("[PartModels]", err);
        say(err.message || String(err), "warn");
      }
    }
  }

  window.setTableAngles = function (aDeg, bDeg, cDeg) {
    const t = Store.table();
    if (!t) return;
    const rx =  (aDeg || 0) * Math.PI / 180;
    const ry = -(bDeg || 0) * Math.PI / 180;
    const rz = -(cDeg || 0) * Math.PI / 180;
    if (Math.abs(t.rotation.x - rx) < 1e-9 &&
        Math.abs(t.rotation.y - ry) < 1e-9 &&
        Math.abs(t.rotation.z - rz) < 1e-9) return;
    t.rotation.set(rx, ry, rz, "XYZ");
    t.updateMatrixWorld(true);
  };

  /* How much of the view a freshly loaded setup fills. Smaller is closer in —
     this is the orthographic frustum, so nothing is being scaled, the camera
     just sees a narrower slice of the world. */
  const PROGRAM_FIT = 1.35;
  function fit(tight) {
    const b = Store.bounds();
    if (!b) return;

    /* Zoomed right in, the center of the whole assembly is the middle of the
       vise body and the work ends up off the top of the screen. A tight fit
       therefore frames the billet and sizes the view from it, leaving the
       jaws and some table in shot around it. */
    let box = b;
    if (typeof tight === "number" && tight > 0) {
      const s = Store.all().find(p => p.visible && p.stock);
      if (s && s.node) {
        s.node.updateMatrixWorld(true);
        const sb = new THREE.Box3().setFromObject(s.node);
        if (!sb.isEmpty()) box = sb;
      }
    }

    /* The camera aims at the program's X0 Y0 Z0 and never anywhere else.
       Aiming at the middle of the box meant every sample — each with a
       differently sized blank, and its zero in a different corner of it —
       parked the view somewhere slightly different, so the whole scene
       appeared to shift as you clicked from one sample to the next.

       Since the aim is now off the box's own middle, the frustum has to be
       sized from how far the box reaches away from that aim point rather
       than from the box's own width. */
    const aim = (typeof viewOriginWorld === "function")
      ? viewOriginWorld()
      : box.getCenter(new THREE.Vector3());

    const reach = 2 * Math.max(
      Math.abs(box.max.x - aim.x), Math.abs(aim.x - box.min.x),
      Math.abs(box.max.y - aim.y), Math.abs(aim.y - box.min.y),
      Math.abs(box.max.z - aim.z), Math.abs(aim.z - box.min.z));

    const k = (typeof tight === "number" && tight > 0) ? tight : 1;
    const frustum = Math.max(reach, 1e-3) * 1.35 * k;

    if (typeof CamView !== "undefined") {
      CamView.to({ target: aim, frustum });
      return;
    }

    camTarget.copy(aim);
    frustumSize = frustum;
    if (typeof baseZoom !== "undefined") baseZoom = frustumSize;
    updateFrustum(); updateMainCamera();
    const hz = document.getElementById("hud-zoom");
    if (hz) hz.textContent = "1.0×";
  }

  /* Loading a setup — a sample, a saved default, a fresh build — lands on the
     standard view rather than framing whatever it just made. Same corner,
     same distance, aimed at the work zero, every time. */
  function home() {
    if (typeof goHomeView === "function") goHomeView(true);
    else fit(PROGRAM_FIT);
  }

  function say(msg, kind) {
    if (!el.msg) return;
    el.msg.textContent = msg || "";
    el.msg.className = kind ? "pm-msg " + kind : "pm-msg";
  }
  function paintSnapModes() {
    el.snapBtns.querySelectorAll("[data-snap]").forEach(b =>
      b.classList.toggle("on", b.dataset.snap === Snap.mode));
  }
  function paintTargets() {
    el.targets.querySelectorAll("[data-target]").forEach(b =>
      b.classList.toggle("on", b.dataset.target === target));
    if (el.zeroPick) el.zeroPick.disabled = (target === "base");
  }
  function paintButtons() {
    const p = Store.current();
    el.pick.classList.toggle("on", Snap.isArmed());
    el.pick.textContent = Snap.isArmed() ? "Picking — click the model (Esc)" : "Pick a point on the model";
    el.dragBtn.classList.toggle("on", Drag.isOn());
    if (p) {
      el.wireTgl.classList.toggle("on", p.wire);
      el.edgesTgl.classList.toggle("on", p.showEdges);
      el.edgesTgl.disabled = !p.edges;
    }
  }
  function showSnap(hit) {
    if (!el.snapOut) return;
    if (!hit) { el.snapOut.textContent = Snap.isArmed() ? "hover the model…" : ""; return; }
    el.snapOut.textContent =
      `${hit.note} · X ${fmt(hit.world.x)}  Y ${fmt(hit.world.y)}  Z ${fmt(hit.world.z)} ${uLabel()}`;
  }
  const fmt = v => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(isInch() ? 4 : 3);

  function refreshOut() {
    const p = Store.current(); if (!p) return;
    const bw = Store.toWorld(p, p.base), zw = Store.zeroWorld(p);
    el.baseOut.textContent = `${p.baseNote} · now at ${fmt(bw.x)}, ${fmt(bw.y)}, ${fmt(bw.z)}`;
    el.zeroOut.textContent = `${p.zeroNote} · now at ${fmt(zw.x)}, ${fmt(zw.y)}, ${fmt(zw.z)}`;
    el.zeroOut.classList.toggle("off", zw.length() > 1e-6);
  }

  function refresh(light) {
    const parts = Store.all(), p = Store.current();

    el.list.innerHTML = parts.length ? parts.map(x => `
      <div class="pm-row${x.id === (p && p.id) ? " sel" : ""}" data-id="${x.id}">
        <span class="pm-eye" title="show / hide">${x.visible ? "◉" : "○"}</span>
        <span class="pm-name" title="${x.name}">${x.name}</span>
        <span class="pm-tri">${x.tris > 9999 ? (x.tris / 1000).toFixed(0) + "k" : Math.round(x.tris)}</span>
        <span class="pm-del" title="remove">✕</span>
      </div>`).join("") : "";

    /* The Library keeps a running tally of what it has put in the scene. */
    const count = $("#pm-count"), none = $("#pm-scene-empty");
    if (count) count.textContent = String(parts.length);
    if (none) none.hidden = parts.length > 0;

    el.edit.hidden = !p;

    if (window.FixturePanel) window.FixturePanel.paint();
    if (!p) {
      paintStockPanel();
      if (typeof Gizmo !== "undefined") Gizmo.sync();
      paintButtons();
      return;
    }

    el.title.textContent = p.name;
    if (!light || document.activeElement !== el.px) el.px.value = fmt(toDisp(p.pos.x));
    if (!light || document.activeElement !== el.py) el.py.value = fmt(toDisp(p.pos.y));
    if (!light || document.activeElement !== el.pz) el.pz.value = fmt(toDisp(p.pos.z));
    if (document.activeElement !== el.rx) el.rx.value = Math.round(p.rot.x * 100) / 100;
    if (document.activeElement !== el.ry) el.ry.value = Math.round(p.rot.y * 100) / 100;
    if (document.activeElement !== el.rz) el.rz.value = Math.round(p.rot.z * 100) / 100;
    if (document.activeElement !== el.scaleNum) el.scaleNum.value = Math.round(p.scale * 1000) / 10;
    el.scale.value = clamp(p.scale * 100, 1, 400);
    el.opacity.value = Math.round(p.opacity * 100);
    el.srcUnit.textContent = p.srcInch ? "in" : "mm";
    el.srcUnit.classList.toggle("on", p.srcInch);
    el.unitTags.forEach(t => t.textContent = uLabel());

    paintStockPanel();

    const shown = p.members.filter(m => !m.driven);
    el.jointWrap.hidden = !shown.length;
    if (shown.length && !light) {
      el.joints.innerHTML = p.members.map((m, i) => m.driven ? "" : `
        <div class="pm-line">
          <span style="flex:0 0 74px;">${m.name}</span>
          <input type="range" data-joint="${i}" min="${toDisp(m.min)}" max="${toDisp(m.max)}"
                 step="${isInch() ? 0.005 : 0.5}" value="${toDisp(m.value)}">
          <span class="pm-jval" data-joint-out="${i}">${fmt(toDisp(m.value))} ${uLabel()}</span>
        </div>
        ${m.note ? `<div class="pm-note" style="margin-top:2px;">${m.note}</div>` : ""}`).join("");
    }

    refreshOut();
    paintButtons();
    if (typeof Gizmo !== "undefined") Gizmo.sync();
  }

  /* The Stock panel is its own sidebar category now, so it follows whatever
     billet is in the scene rather than only a selected one. */
  const stockTarget = () => {
    const c = Store.current();
    if (c && c.stock) return c;
    return Store.all().find(x => x.stock) || null;
  };

  function paintStockPanel() {
    const sw = $("#pm-stock-wrap");
    if (!sw) return;
    const p = stockTarget();
    sw.hidden = !p;
    const empty = $("#stock-empty");
    if (empty) empty.hidden = !!p;
    if (p) {
      const d = p.stock;
      $("#pm-metals").parentNode.querySelectorAll("[data-metal]").forEach(b =>
        b.classList.toggle("on", b.dataset.metal === d.metal));
      const dims = d.shape === "cyl"
        ? [["dia", "Ø"], ["len", "L"]]
        : [["sx", "X"], ["sy", "Y"], ["sz", "Z"]];
      /* Typing in a size field rebuilds the blank on every keystroke, so the
         grid can only be redrawn when the shape actually changed — otherwise
         the caret is thrown out from under the user mid-number. */
      const sizeKey = d.shape + ":" + dims.map(([k]) => k).join(",");
      const sizeBox = $("#pm-stock-size");
      if (sizeBox.dataset.shape !== sizeKey) {
        sizeBox.dataset.shape = sizeKey;
        sizeBox.innerHTML = `<div class="pm-grid stk-dims-${dims.length}">` + dims.map(([k, lab]) =>
          `<label>${lab}</label><input type="number" step="0.5" min="1" data-dim="${k}"
             value="${fmt(toDisp(d[k]))}">`).join("") + "</div>";
      } else {
        dims.forEach(([k]) => {
          const i = sizeBox.querySelector(`[data-dim="${k}"]`);
          if (i && document.activeElement !== i) i.value = fmt(toDisp(d[k]));
        });
      }
      $("#pm-stock-res").value = d.steps || 128;
      $("#pm-stock-res-out").textContent = (d.steps || 128) + " steps";

      const dt = Object.assign(Stock.DT_DEFAULT(), d.dovetail);
      const round = d.shape === "cyl";
      /* Mid-disintegration the panel shows where the blank is heading, not
         the tenon that is still tearing away. */
      const aim = (d.dovetail && d.dovetail.pending) || dt;
      const lit = round || !aim.on ? "off" : aim.along;
      $("#pm-dt-mode").querySelectorAll("[data-dt]").forEach(b => {
        b.classList.toggle("on", b.dataset.dt === lit);
        b.disabled = round && b.dataset.dt !== "off";
      });
      $("#pm-dt-size").hidden = (lit === "off");
      if (lit !== "off") {
        const set = (sel, v) => { const i = $(sel); if (document.activeElement !== i) i.value = v; };
        set("#pm-dt-w", fmt(toDisp(dt.w)));
        set("#pm-dt-h", fmt(toDisp(dt.h)));
        set("#pm-dt-a", dt.angle);
      }
    }
  }

  const zeroOnPick = () => !el.zeroPick || (el.zeroPick.checked && !el.zeroPick.disabled);
  const pickTarget = () => target;

  return { bind, refresh, say, showSnap, zeroOnPick, pickTarget, intake, fit, home,

           PROGRAM_FIT,

           sampleStock: loadSampleStock,

           addStockFrom, rebuildStock, setMetal, addClamp };
})();

const StockSim = (() => {
  let lastT = 0, key = null, warned = false;
  const cur = new Map();

  const stocks = () => Store.all().filter(p => p.stock && p.stock.rec);

  const toolKey = () => {
    if (typeof toolTable === "undefined" || !toolTable.size) return "";
    let s = "";
    Array.from(toolTable.keys()).sort((a, b) => a - b)
      .forEach(t => { s += t + ":" + toolTable.get(t) + ";"; });
    return s;
  };
  const programKey = () =>
    (typeof segTimeline === "undefined" || !segTimeline.length)
      ? null : segTimeline.length + "|" + simTotalTime.toFixed(4) + "|" + toolKey();

  function clearAll(keepTime) {
    stocks().forEach(p => Stock.clearCuts(p.stock.rec));
    cur.clear();
    warned = false;
    diaCache.clear();
    typeCache.clear();
    probeCache.clear();
    axisList = null; axisKey = null;
    lastT = keepTime && typeof simTime !== "undefined" ? simTime : 0;
    key = programKey();
  }

  const typeCache = new Map();
  function toolTypeOf(toolNum) {
    if (typeCache.has(toolNum)) return typeCache.get(toolNum);

    let ty = isProbe(toolNum) ? 0 : 1;
    const named = (typeof ToolShapes !== "undefined") ? ToolShapes.get(toolNum) : null;
    if (named === "ball" || named === "probe") ty = 0;
    else if (named === "drill") ty = 2;
    else if (named !== "flat") {
      try {
        const rec = (typeof ToolModels !== "undefined") && ToolModels.get(toolNum);
        const pr = (rec && rec.params) || {};
        const cls = String(pr.category || pr.c || pr.cls || pr.class || "").toLowerCase();
        if (/ball|probe/.test(cls)) ty = 0;
        else if (/drill|spot|center|center/.test(cls)) ty = 2;
      } catch (e) {   }
    }
    typeCache.set(toolNum, ty);
    return ty;
  }

  /* A touch probe removes nothing. It is in the spindle to find the part, and
     a probing move that ate a groove out of the blank on its way to the face
     would be showing you the one thing that must never happen. Answering here
     with a zero radius is what keeps the solid simulation's hands off it —
     advance() skips any move whose cutter has no radius. */
  const probeCache = new Map();
  function isProbe(toolNum) {
    if (toolNum == null) return false;
    if (probeCache.has(toolNum)) return probeCache.get(toolNum);
    let probe = (typeof ToolShapes !== "undefined") && ToolShapes.get(toolNum) === "probe";
    if (!probe) {
      try {
        const rec = (typeof ToolModels !== "undefined") && ToolModels.get(toolNum);
        probe = !!(rec && rec.params && rec.params.category === "probe");
      } catch (e) {   }
    }
    probeCache.set(toolNum, probe);
    return probe;
  }

  const diaCache = new Map();
  function cutterFor(seg) {
    const k = seg.lineIdx;
    if (!diaCache.has(k)) {
      let r = 0, tool = null;
      try {
        tool = getActiveToolAtLine(seg.lineIdx);
        r = isProbe(tool) ? 0 : (getLiveToolDia(tool) || 0) / 2;
      } catch (e) {   }
      diaCache.set(k, { r, type: toolTypeOf(tool) });
    }
    return diaCache.get(k);
  }

  let axisList = null, axisKey = null;
  const Z_UP = new THREE.Vector3(0, 0, 1);
  function axisFor(si) {
    const k = programKey() + "|" + rotaryMode;
    if (axisKey !== k || !axisList || axisList.length !== segTimeline.length) {
      axisKey = k;
      axisList = new Array(segTimeline.length);
      let ra = 0, rb = 0, rc = 0;
      for (let i = 0; i < segTimeline.length; i++) {
        const s = segTimeline[i].seg;
        if (s.aDegEnd !== undefined) ra = s.aDegEnd || 0;
        if (s.bDegEnd !== undefined) rb = s.bDegEnd || 0;
        if (s.cDegEnd !== undefined) rc = s.cDegEnd || 0;
        if (rotaryMode === 'part' || (!ra && !rb && !rc)) { axisList[i] = Z_UP; continue; }
        const tip = applyAllRotations(0, 0, 1, ra, rb, rc);
        const org = applyAllRotations(0, 0, 0, ra, rb, rc);
        const d = tip.sub(org);
        axisList[i] = d.lengthSq() > 1e-12 ? d.normalize() : Z_UP.clone();
      }
    }
    return axisList[si] || Z_UP;
  }

  const A = new THREE.Vector3(), B = new THREE.Vector3();
  const la = new THREE.Vector3(), lb = new THREE.Vector3();
  const lw = new THREE.Vector3();
  const DP = new THREE.Vector3(), QP = new THREE.Vector3();
  const SEGV = new THREE.Vector3(), PROJ = new THREE.Vector3();

  function reaches(c, R) {
    const h = c.h, dt = c.dtDrop;
    const cz = (h[2] * 2 - dt) / 2;
    const hz = (h[2] * 2 + dt) / 2;
    const projR = Math.abs(lw.x) * h[0] + Math.abs(lw.y) * h[1] + Math.abs(lw.z) * hz;
    const cAlong = cz * lw.z;
    const tipAlong = Math.min(la.dot(lw), lb.dot(lw));
    if (tipAlong > cAlong + projR + 0.6) return false;

    QP.set(0, 0, cz).sub(la);
    QP.addScaledVector(lw, -QP.dot(lw));
    DP.subVectors(lb, la);
    DP.addScaledVector(lw, -DP.dot(lw));
    const p2 = DP.lengthSq();
    if (p2 > 1e-12) QP.addScaledVector(DP, -Math.max(0, Math.min(1, QP.dot(DP) / p2)));
    return QP.length() <= Math.hypot(h[0], h[1], hz) + R + 0.6;
  }

  const CURVE_TOL = 0.03;

  const BOW_TOL = CURVE_TOL * 4;

  const AXIS_TOL = Math.cos(1 * Math.PI / 180);

  function advance(t0, t1, onlySi) {
    const list = stocks();
    if (!list.length || typeof segTimeline === "undefined") return;

    const ctx = list.map(p => {
      p.node.updateMatrixWorld(true);
      return {
        p, rec: p.stock.rec,

        inv: new THREE.Matrix4().copy(stageGroup.matrixWorld).invert()
               .multiply(p.inner.matrixWorld).invert().multiply(programFrame),
        u: sceneU() * (p.srcInch ? MM_PER_IN : 1) * p.scale,
        h: Stock.halfOf(p.stock),
        dtDrop: (Stock.dovetailOf(p.stock) || { h: 0 }).h,
      };
    });

    const lo = (onlySi != null) ? onlySi : 0;
    const hi = (onlySi != null) ? onlySi + 1 : segTimeline.length;
    for (let si = lo; si < hi; si++) {
      const e = segTimeline[si];
      if (e.tEnd <= t0 || e.tStart >= t1) continue;

      /* A tool change takes seconds and does not move, and for most of it the
         tool is not even in the spindle — it is out in the changer's arm. Cut
         it and the blank gets a divot wherever the program happened to call
         M06, which for a program that changes tools at the work origin is a
         hole in the top face. */
      if (e.seg.isToolChange) continue;
      const span = Math.max(e.tEnd - e.tStart, 1e-9);
      const f0 = Math.max(0, (t0 - e.tStart) / span);
      const f1 = Math.min(1, (t1 - e.tStart) / span);
      if (f1 <= f0) continue;
      const cutter = cutterFor(e.seg);
      if (!(cutter.r > 0)) continue;
      A.copy(e.seg.start).lerp(e.seg.end, f0);
      B.copy(e.seg.start).lerp(e.seg.end, f1);

      const tA = e.tStart + f0 * span, tB = e.tStart + f1 * span;

      const axisP = axisFor(si);

      for (const c of ctx) {
        la.copy(A).applyMatrix4(c.inv);
        lb.copy(B).applyMatrix4(c.inv);

        lw.copy(axisP).transformDirection(c.inv);
        if (lw.lengthSq() < 1e-12) lw.set(0, 0, 1);
        const R = cutter.r / Math.max(c.u, 1e-9);

        if (!reaches(c, R)) { cur.delete(c.p.id); continue; }

        const st = cur.get(c.p.id);
        let grow = false;
        if (st && st.r === R && st.type === cutter.type && st.w.dot(lw) > AXIS_TOL) {
          if (st.seg0 === si) {

            grow = true;
          } else if (st.line === e.seg.lineIdx && st.d0) {

            SEGV.subVectors(lb, st.a);
            const along = SEGV.dot(st.d0);
            PROJ.copy(st.d0).multiplyScalar(along);
            const dev = SEGV.distanceTo(PROJ);

            if (dev <= BOW_TOL && along >= st.fwd - 1e-9) grow = true;
          }
        }

        if (grow) {
          Stock.extendCut(c.rec, st.cut, lb, tB);

          SEGV.subVectors(lb, st.a);
          if (!st.d0 && SEGV.lengthSq() > 1e-12) st.d0 = SEGV.clone().normalize();
          if (st.d0) st.fwd = Math.max(st.fwd, SEGV.dot(st.d0));
        } else {
          const i = Stock.addCut(c.rec, la, lb, R, cutter.type, tA, tB, lw);
          if (i < 0) {
            if (!warned && typeof showToast === "function") {
              showToast("The blank is full of cuts",
      "It can hold " + Stock.MAX_CUTS + " moves and has run out of room. Press Restore material in the Stock panel to start the metal over.");
              warned = true;
            }
            cur.delete(c.p.id);
          } else {
            SEGV.subVectors(lb, la);
            const set = SEGV.lengthSq() > 1e-12;
            cur.set(c.p.id, {
              seg0: si, line: e.seg.lineIdx, cut: i, r: R, type: cutter.type,
              a: la.clone(), w: lw.clone(),

              d0: set ? SEGV.clone().normalize() : null,
              fwd: set ? SEGV.length() : 0,
            });
          }
        }
      }
    }
  }

  function sync(t) {
    const list = stocks();
    if (!list.length) return;
    const k = programKey();
    if (k !== key) { key = k; diaCache.clear(); typeCache.clear(); probeCache.clear(); clearAll(false); }
    if (t < lastT - 1e-9) {
      list.forEach(p => Stock.truncate(p.stock.rec, t));
      cur.clear();
      lastT = t;
    }
    if (t > lastT) {

      if (rotaryMode === 'part' && typeof segTimeline !== "undefined"
          && typeof setTableAngles === "function") {

        let ra = 0, rb = 0, rc = 0;
        for (let si = 0; si < segTimeline.length; si++) {
          const e = segTimeline[si];
          if (e.seg.aDegEnd !== undefined) ra = e.seg.aDegEnd || 0;
          if (e.seg.bDegEnd !== undefined) rb = e.seg.bDegEnd || 0;
          if (e.seg.cDegEnd !== undefined) rc = e.seg.cDegEnd || 0;
          if (e.tEnd <= lastT || e.tStart >= t) continue;
          setTableAngles(ra, rb, rc);
          advance(Math.max(lastT, e.tStart), Math.min(t, e.tEnd), si);
        }
      } else {
        advance(lastT, t);
      }
      lastT = t;
    }
  }

  return { sync, reset: clearAll, stocks, toolTypeOf };
})();
window.StockSim = StockSim;

const Gizmo = (() => {
  const AX  = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const COL = { x: 0xff5b5b, y: 0x5bd75b, z: 0x5b9bff, m: 0xe8c547 };
  const SEL_TINT = 0x3d7ebf, SEL_GLOW = 0x14304f, SEL_EDGE = 0x74b8ff;

  let mode = "move";
  let sel = null;

  let group = [];
  let root = null;
  let handles = [];
  let drag = null;
  let el = {};
  const ray = new THREE.Raycaster();

  const vec = a => new THREE.Vector3(a[0], a[1], a[2]);
  const basic = c => new THREE.MeshBasicMaterial({
    color: c, depthTest: false, transparent: true, opacity: 0.92 });

  function ensureRoot() {
    if (!root) { root = new THREE.Group(); root.renderOrder = 1200; stageGroup.add(root); }
    return root;
  }

  function orient(g, axis) {
    if (axis === "x") g.rotation.z = -Math.PI / 2;
    if (axis === "z") g.rotation.x =  Math.PI / 2;
    return g;
  }
  function arrow(axis, kind, both, color) {
    const g = new THREE.Group();
    const mat = basic(color != null ? color : COL[axis]);
    const len = both ? 0.85 : 1;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, both ? len * 2 : len, 12), mat);
    shaft.position.y = both ? 0 : len / 2;
    g.add(shaft);
    [1].concat(both ? [-1] : []).forEach(sign => {
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 18), mat);
      head.position.y = sign * (len + 0.15);
      if (sign < 0) head.rotation.x = Math.PI;
      g.add(head);
    });
    g.traverse(n => { if (n.isMesh) { n.userData.gz = { kind, axis }; n.renderOrder = 1201; } });
    return orient(g, axis);
  }
  function ring(axis) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.03, 8, 64), basic(COL[axis]));
    if (axis === "x") m.rotation.y = Math.PI / 2;
    if (axis === "y") m.rotation.x = Math.PI / 2;
    m.userData.gz = { kind: "rotate", axis };
    m.renderOrder = 1201;
    return m;
  }
  function cube(axis) {
    const g = new THREE.Group();
    const mat = basic(COL[axis]);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 10), mat);
    shaft.position.y = 0.42;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), mat);
    box.position.y = 0.95;
    g.add(shaft, box);
    g.traverse(n => { if (n.isMesh) { n.userData.gz = { kind: "scale", axis }; n.renderOrder = 1201; } });
    return orient(g, axis);
  }

  function track(axis) {
    const line = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute("position",
        new THREE.Float32BufferAttribute(new Float32Array(18), 3)),
      new THREE.LineBasicMaterial({
        color: 0x8a949e, depthTest: false, transparent: true, opacity: 0.75 }));
    line.renderOrder = 1200;
    line.userData.axis = axis;
    return line;
  }
  function setTrack(line, at, span) {
    const a = vec(AX[line.userData.axis]);
    const c = vec(line.userData.axis === "z" ? [1, 0, 0] : [0, 0, 1]).multiplyScalar(0.22);
    const p0 = a.clone().multiplyScalar(-at);
    const p1 = a.clone().multiplyScalar(span - at);
    const A = line.geometry.attributes.position.array;
    let k = 0;
    const put = v => { A[k++] = v.x; A[k++] = v.y; A[k++] = v.z; };
    put(p0); put(p1);
    put(p0.clone().sub(c)); put(p0.clone().add(c));
    put(p1.clone().sub(c)); put(p1.clone().add(c));
    line.geometry.attributes.position.needsUpdate = true;
  }

  let trackLine = null;

  let handlesOn = true;
  function setHandlesVisible(v) { handlesOn = !!v; build(); }

  /* Handles are for arranging, so they only belong in model mode. */
  const modelMode = () => (typeof ViewMode === "undefined") || ViewMode.isModel();
  let builtFor = null;

  function build() {
    builtFor = modelMode();
    const r = ensureRoot();
    while (r.children.length) {
      const c = r.children[0];
      r.remove(c);
      c.traverse(n => { if (n.geometry) n.geometry.dispose(); });
    }
    trackLine = null;
    handles = [];
    if (!sel || !modelMode()) return;
    if (!handlesOn && !sel.member) return;
    if (sel.member) {
      trackLine = track(sel.member.axis);
      r.add(trackLine);
      r.add(arrow(sel.member.axis, "member", true, COL.m));
    } else if (mode === "rotate") {
      ["x", "y", "z"].forEach(a => r.add(ring(a)));
    } else if (mode === "scale") {
      ["x", "y", "z"].forEach(a => r.add(cube(a)));
    } else {
      ["x", "y", "z"].forEach(a => r.add(arrow(a, "move", false)));
    }
    r.traverse(n => { if (n.isMesh) handles.push(n); });
    place();
  }

  const unitOf = p => sceneU() * (p.srcInch ? MM_PER_IN : 1) * p.scale;
  const gizmoScale = () => Math.max((typeof frustumSize !== "undefined" ? frustumSize : 120) * 0.1, 1e-4);

  function place() {
    if (!sel || !root) return;
    const p = sel.part;
    root.scale.setScalar(gizmoScale());
    if (sel.member) {
      const m = sel.member;
      if (!m.mesh.geometry.boundingBox) m.mesh.geometry.computeBoundingBox();
      const bb = m.mesh.geometry.boundingBox;
      const top = new THREE.Vector3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, bb.max.z);
      m.mesh.updateMatrixWorld(true);
      root.position.copy(m.mesh.localToWorld(top.clone()));
      root.position.z += gizmoScale() * 0.55;
      root.quaternion.copy(p.node.quaternion);
      if (trackLine) {
        const g = gizmoScale(), u = unitOf(p);
        setTrack(trackLine, (m.value - m.min) * u / g, (m.max - m.min) * u / g);
      }
    } else if (group.length > 1) {

      root.position.copy(groupCenter());
      root.quaternion.identity();
    } else {
      root.position.copy(Store.toWorld(p, p.base));
      if (mode === "move") root.quaternion.identity();
      else root.quaternion.copy(p.node.quaternion);
    }
  }

  function tint(mesh, on) {
    if (!mesh || !mesh.material) return;
    const mat = mesh.material;

    if (mat.uniforms && mat.uniforms.uSelect) { mat.uniforms.uSelect.value = on ? 1 : 0; return; }
    if (on) {
      if (mesh.userData._c0 == null) mesh.userData._c0 = mat.color.getHex();
      mat.color.setHex(SEL_TINT);
      if (mat.emissive) mat.emissive.setHex(SEL_GLOW);
    } else if (mesh.userData._c0 != null) {
      mat.color.setHex(mesh.userData._c0);
      if (mat.emissive) mat.emissive.setHex(0x000000);
    }
  }
  function tintEdges(line, on) {
    if (!line) return;
    if (on) {
      if (line.userData._c0 == null) line.userData._c0 = line.material.color.getHex();
      line.material.color.setHex(SEL_EDGE);
      line.material.opacity = 0.9;
    } else if (line.userData._c0 != null) {
      line.material.color.setHex(line.userData._c0);
      line.material.opacity = 0.55;
    }
  }
  function clearTint() {
    Store.all().forEach(p => {
      tint(p.mesh, false); tintEdges(p.edges, false);
      p.members.forEach(m => { tint(m.mesh, false); tintEdges(m.edges, false); });
    });
  }
  function paintTint() {
    clearTint();
    /* Sim mode shows nothing as selected, whatever loaded last. */
    if (!sel || !modelMode()) return;
    if (sel.member) { tint(sel.member.mesh, true); tintEdges(sel.member.edges, true); }
    else group.forEach(p => {
      tint(p.mesh, true); tintEdges(p.edges, true);
      p.members.forEach(m => { tint(m.mesh, true); tintEdges(m.edges, true); });
    });
  }

  function groupCenter() {
    const c = new THREE.Vector3();
    if (!group.length) return c;
    group.forEach(p => c.add(Store.toWorld(p, p.base)));
    return c.multiplyScalar(1 / group.length);
  }
  const inGroup = p => group.indexOf(p) >= 0;

  function setGroup(list, primary) {
    group = list.slice();
    const head = primary || group[0] || null;
    sel = head ? { part: head, member: null } : null;
    Store.select(head ? head.id : null);
    paintTint(); build(); paint(); Panel.refresh();
  }

  function toggleInGroup(part) {
    const i = group.indexOf(part);
    if (i >= 0) {
      if (group.length === 1) return setGroup([], null);
      group.splice(i, 1);
      return setGroup(group, group[0]);
    }
    setGroup(group.concat([part]), part);
  }

  const isStock = p => p.role === "stock" || !!p.stock;
  function selectByRole(want) {
    const keep = want === "fixture" ? (p => p.role === "fixture")
               : want === "all"     ? (p => p.role === "fixture" || isStock(p))
               :                      isStock;
    const list = Store.all().filter(p => p.visible && keep(p));
    if (!list.length) { toast("Nothing here to select as " + want + "."); return; }
    setGroup(list, list.find(isStock) || list[0]);
    showToast(`${list.length} bod${list.length > 1 ? "ies" : "y"} selected`, `The selection is the ${want}.`);
  }

  function ndc(ev) {
    const rect = mainCanvas.getBoundingClientRect();
    return { x: ((ev.clientX - rect.left) / rect.width) * 2 - 1,
             y: -((ev.clientY - rect.top) / rect.height) * 2 + 1 };
  }
  function hitBody(ev) {
    const targets = Store.pickMeshes();
    if (!targets.length) return null;
    ray.setFromCamera(ndc(ev), mainCam);
    const hits = ray.intersectObjects(targets, false);
    if (!hits.length) return null;
    const part = Store.partOfMesh(hits[0].object);
    if (!part) return null;
    return { part, member: part.members.find(m => m.mesh === hits[0].object) || null };
  }
  function hitHandle(ev) {
    if (!handles.length) return null;
    ray.setFromCamera(ndc(ev), mainCam);
    const hits = ray.intersectObjects(handles, false);
    return hits.length ? hits[0].object.userData.gz : null;
  }

  function select(next) {
    sel = next;
    group = next && !next.member ? [next.part] : (next ? [next.part] : []);
    if (next) Store.select(next.part.id);
    else Store.select(null);
    paintTint();
    build();
    paint();
    Panel.refresh();
  }

  function axisParam(ev, O, a) {
    ray.setFromCamera(ndc(ev), mainCam);
    const P = ray.ray.origin, d = ray.ray.direction;
    const w0 = O.clone().sub(P);
    const B = a.dot(d), D = a.dot(w0), E = d.dot(w0);
    const den = 1 - B * B;
    if (Math.abs(den) < 1e-6) return null;
    return (B * E - D) / den;
  }
  function planeAngle(ev, O, n) {
    ray.setFromCamera(ndc(ev), mainCam);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, O);
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return null;
    let e1 = new THREE.Vector3(0, 0, 1).cross(n);
    if (e1.lengthSq() < 1e-6) e1 = new THREE.Vector3(1, 0, 0).cross(n);
    e1.normalize();
    const e2 = n.clone().cross(e1).normalize();
    const v = hit.sub(O);
    return Math.atan2(v.dot(e2), v.dot(e1));
  }

  function begin(ev, gz) {
    const p = sel.part;
    const O = root.position.clone();
    const a = vec(AX[gz.axis]).applyQuaternion(root.quaternion).normalize();
    drag = {
      gz, O, a,
      t0: axisParam(ev, O, a),
      ang0: planeAngle(ev, O, a),
      pos0: p.pos.clone(), rot0: p.rot.clone(), scale0: p.scale,
      val0: sel.member ? sel.member.value : 0,

      start: group.map(q => ({ part: q, pos: q.pos.clone(), rot: q.rot.clone(), scale: q.scale })),
      center: new THREE.Vector3(fromDisp(O.x), fromDisp(O.y), fromDisp(O.z)),
    };
  }

  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const eulerQuat = (r, out) =>
    (out || new THREE.Quaternion()).setFromEuler(
      new THREE.Euler(r.x * D2R, r.y * D2R, r.z * D2R, "XYZ"));

  function rotateGroup(axisWorld, degrees) {
    const qd = new THREE.Quaternion().setFromAxisAngle(axisWorld, degrees * D2R);
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    drag.start.forEach(s => {
      q.copy(qd).multiply(eulerQuat(s.rot));
      e.setFromQuaternion(q, "XYZ");
      s.part.rot.set(e.x * R2D, e.y * R2D, e.z * R2D);
      s.part.pos.copy(s.pos).sub(drag.center).applyQuaternion(qd).add(drag.center);
      Store.apply(s.part);
    });
  }
  function move(ev) {
    if (!drag || !sel) return;
    const p = sel.part, gz = drag.gz;
    if (gz.kind === "rotate") {
      const ang = planeAngle(ev, drag.O, drag.a);
      if (ang == null || drag.ang0 == null) return;
      let d = (ang - drag.ang0) * 180 / Math.PI;
      const i = { x: 0, y: 1, z: 2 }[gz.axis];
      if (group.length > 1) {

        if (ev.shiftKey) d = Math.round(d / 45) * 45;
        rotateGroup(drag.a, d);
      } else {

        let abs = drag.rot0.getComponent(i) + d;
        if (ev.shiftKey) abs = Math.round(abs / 45) * 45;
        p.rot.setComponent(i, (abs % 360 + 720) % 360);
      }
    } else {
      const t = axisParam(ev, drag.O, drag.a);
      if (t == null || drag.t0 == null) return;
      if (gz.kind === "member") {
        const m = sel.member;
        const step = (t - drag.t0) / Math.max(unitOf(p), 1e-9);
        m.value = clamp(drag.val0 + step, m.min, m.max);
      } else if (gz.kind === "scale") {
        const r = Math.abs(t) / Math.max(Math.abs(drag.t0), 1e-6);
        p.scale = clamp(drag.scale0 * r, 0.01, 10);
      } else {

        const step = fromDisp(t - drag.t0);
        drag.start.forEach(s => {
          s.part.pos.copy(s.pos).addScaledVector(drag.a, step);
          Store.apply(s.part);
        });
      }
    }
    Store.apply(p);
    place();
    Panel.refresh(true);
    paint();
  }
  const end = () => { drag = null; };

  let press = null;
  viewport.addEventListener("mousedown", ev => {
    if (ev.button !== 0 || Snap.isArmed() || Drag.isOn()) return;
    if (!ViewMode.isModel() || !onModelCanvas(ev)) return;
    const gz = sel ? hitHandle(ev) : null;
    if (gz) { ev.preventDefault(); ev.stopPropagation(); begin(ev, gz); return; }
    press = { x: ev.clientX, y: ev.clientY };
  }, true);

  window.addEventListener("mousemove", ev => { if (drag) move(ev); });
  window.addEventListener("mouseup", ev => {
    if (drag) { end(); press = null; return; }
    if (!press) return;
    const still = Math.abs(ev.clientX - press.x) < 4 && Math.abs(ev.clientY - press.y) < 4;
    press = null;
    if (!still || Snap.isArmed() || Drag.isOn()) return;
    if (!ViewMode.isModel() || !onModelCanvas(ev)) return;
    const hit = hitBody(ev);

    if (hit && !hit.member && (ev.shiftKey || ev.ctrlKey || ev.metaKey) && group.length) {
      toggleInGroup(hit.part);
      return;
    }
    select(hit);
  });

  function bind() {
    el = {
      box: $("#pm-gizmo"), name: $("#gz-name"), out: $("#gz-out"),
      modes: $("#gz-modes"), snaps: $("#gz-snaps"), whole: $("#gz-whole"),
    };
    el.modes.addEventListener("click", e => {
      const b = e.target.closest("[data-gz]"); if (!b) return;
      setMode(b.dataset.gz);
    });
    el.snaps.addEventListener("click", e => {
      const b = e.target.closest("[data-gzsnap]"); if (!b) return;
      Snap.setMode(b.dataset.gzsnap);

      Snap.arm(true, "origin");
      Panel.refresh();
      paint();
    });
    el.whole.addEventListener("click", () => {
      if (sel) select({ part: sel.part, member: null });
    });
    const ga = $("#gz-align");
    if (ga) ga.addEventListener("click", alignBegin);
    const gb = $("#gz-bank");
    if (gb) gb.addEventListener("click", () => bankParallels(false));
    const gs = $("#pm-align-stock");
    if (gs) gs.addEventListener("click", e => {
      const b = e.target.closest("[data-stockalign]"); if (!b) return;
      alignStockInVise(b.dataset.stockalign);
    });
    const sp = $("#gz-sel-part"), sf = $("#gz-sel-fix"), sa = $("#gz-sel-all");
    if (sp) sp.addEventListener("click", () => selectByRole("stock"));
    if (sf) sf.addEventListener("click", () => selectByRole("fixture"));
    if (sa) sa.addEventListener("click", () => selectByRole("all"));
    paint();
  }

  function setMode(m) {
    if (!m || m === mode) return;
    mode = m;
    build(); paint();
  }

  function paint() {
    if (builtFor !== null && builtFor !== modelMode()) { build(); paintTint(); }
    if (!modelMode() && sel) clearSelection();
    if (window.VPGizmoBar) window.VPGizmoBar.paint();
    if (window.VPStockBar) window.VPStockBar.paint();
    if (window.VPHistoryBar) window.VPHistoryBar.paint();
    if (!el.box) return;

    const bank = document.getElementById("pm-bank");

    const okBank = canBank(), okStock = canAlignStock();

    const okShow = !!findStock();
    if (bank) bank.hidden = !(okBank || okStock || okShow);
    const gsEl = document.getElementById("pm-align-stock");
    if (gsEl) gsEl.hidden = !(okStock || okShow);
    const show = (sel, vis) => {
      const e = document.getElementById(sel);
      if (e) e.style.display = vis ? "" : "none";
    };
    show("pm-align-label", okStock);
    show("pm-align-row", okStock);
    show("pm-preview-label", okShow);
    show("pm-stock-preview", okShow);
    el.box.hidden = !sel || (typeof ViewMode !== "undefined" && !ViewMode.isModel());
    if (!sel) return;
    const p = sel.part, m = sel.member;
    el.name.textContent = m ? (p.name + " · " + m.name) : p.name;
    el.whole.hidden = !m;
    el.modes.hidden = !!m;
    el.modes.querySelectorAll("[data-gz]").forEach(b =>
      b.classList.toggle("on", b.dataset.gz === mode));
    el.snaps.querySelectorAll("[data-gzsnap]").forEach(b =>
      b.classList.toggle("on", Snap.isArmed() && b.dataset.gzsnap === Snap.mode));
    const ga = el.box.querySelector("#gz-align");
    if (ga) ga.classList.toggle("on", !!align);
    if (align) {
      el.out.textContent = align.stage === 1
        ? "① pick the point on the selection"
        : "② pick where it should land  (Esc cancels)";
      return;
    }
    if (m) {
      el.out.textContent = `${fmtNum(toDisp(m.value))} ${uLabel()} open`
        + `  (0 – ${fmtNum(toDisp(m.max))})`;
    } else if (mode === "rotate") {
      el.out.textContent = `RX ${Math.round(p.rot.x)}°  RY ${Math.round(p.rot.y)}°  RZ ${Math.round(p.rot.z)}°`;
    } else if (mode === "scale") {
      el.out.textContent = (p.scale * 100).toFixed(1) + " %";
    } else {
      el.out.textContent = `X ${fmtNum(toDisp(p.pos.x))}  Y ${fmtNum(toDisp(p.pos.y))}  Z ${fmtNum(toDisp(p.pos.z))}`;
    }
  }
  const fmtNum = v => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(isInch() ? 3 : 2);

  function sync() {
    const p = Store.current();
    if (!p) { if (sel) { sel = null; clearTint(); build(); } paint(); return; }
    if (!sel || sel.part !== p) { sel = { part: p, member: null }; paintTint(); build(); }
    else place();
    paint();
  }

  const jawOf = p => p && p.members.find(m => m.name === "Jaw");
  const barOf = p => p && p.members.find(m => m.name === "Bar");
  const findVise = () => Store.all().find(p => p.visible && jawOf(p)) || null;
  const findPars = () => Store.all().find(p => p.visible && barOf(p)) || null;
  const canBank = () => !!(findVise() && findPars());

  const _bb = new THREE.Box3();
  const boxOf = geo => { if (!geo.boundingBox) geo.computeBoundingBox(); return geo.boundingBox; };

  function bankParallels(quiet) {
    const v = findVise(), par = findPars();
    if (!v || !par) { if (!quiet) toast("Add a vise and a pair of parallels first."); return false; }
    const jaw = jawOf(v), bar = barOf(par);
    if (jaw.fixedFace == null) { toast("That vise does not say where its jaws are."); return false; }

    const fixedOuter = boxOf(par.geometry).min.x;
    const movOuter   = boxOf(bar.geometry).max.x;

    const ox = jaw.fixedFace - fixedOuter;
    const value = jaw.movingFace + jaw.value - ox - movOuter;

    const barT = boxOf(bar.geometry).max.x - boxOf(bar.geometry).min.x;
    bar.min = jaw.fixedFace + barT * 2 - ox - movOuter;
    bar.max = jaw.movingFace + jaw.max - ox - movOuter;

    par.rot.copy(v.rot);
    par.pos.copy(v.pos).add(
      new THREE.Vector3(ox, 0, jaw.bedZ || 0)
        .applyEuler(new THREE.Euler(v.rot.x * Math.PI / 180, v.rot.y * Math.PI / 180,
                                    v.rot.z * Math.PI / 180, "XYZ")));
    bar.value = Math.min(Math.max(value, bar.min), bar.max);

    par.follow = { partId: v.id, member: v.members.indexOf(jaw), offset: bar.value - jaw.value };
    Store.apply(par);

    if (!quiet) {
      setGroup([par], par);
      toast(`Parallels banked on ${v.name} — ${fmtNum(toDisp(jaw.value))} ${uLabel()} apart.`);
    }
    return true;
  }

  const findStock = () =>
    Store.all().find(p => p.stock) ||
    Store.all().find(p => p.role === "stock") || null;
  const canAlignStock = () => !!(findStock() && (findVise() || findPars()));

  const eulerOf = p => new THREE.Euler(p.rot.x * Math.PI / 180,
                                       p.rot.y * Math.PI / 180,
                                       p.rot.z * Math.PI / 180, "XYZ");

  function boxesInFrame(p, ref, boxes) {
    const q  = new THREE.Quaternion().setFromEuler(eulerOf(p));
    const ri = new THREE.Quaternion().setFromEuler(eulerOf(ref)).invert();
    const f  = (p.srcInch ? MM_PER_IN : 1) * (p.scale || 1);
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
    const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const c  = new THREE.Vector3();
    for (const bb of boxes) for (let i = 0; i < 8; i++) {
      c.set(i & 1 ? bb.max.x : bb.min.x,
            i & 2 ? bb.max.y : bb.min.y,
            i & 4 ? bb.max.z : bb.min.z)
       .sub(p.base).multiplyScalar(f).applyQuaternion(q).add(p.pos)
       .sub(ref.pos).applyQuaternion(ri);
      lo.min(c); hi.max(c);
    }
    return { lo, hi, size: hi.clone().sub(lo) };
  }
  const boxInFrame = (p, ref) => boxesInFrame(p, ref, [boxOf(p.geometry)]);

  function memberBox(m) {
    const bb = boxOf(m.geometry).clone();
    const d = new THREE.Vector3();
    d[m.axis || "x"] = m.value || 0;
    bb.min.add(d); bb.max.add(d);
    return bb;
  }

  function parallelsBox(par) {
    const boxes = [boxOf(par.geometry)];
    const bar = barOf(par);
    if (bar) boxes.push(memberBox(bar));
    return boxesInFrame(par, par, boxes);
  }

  function alignStockInVise(where, quiet) {
    const s = findStock(), v = findVise(), par = findPars();
    if (!s) { if (!quiet) toast("Add a billet first."); return false; }
    if (!v && !par) { if (!quiet) toast("Add a vise or a pair of parallels first."); return false; }
    const jaw = v && jawOf(v);

    Motion.settle();

    let jawTarget = null;
    if (jaw && jaw.fixedFace != null) {
      const want = boxInFrame(s, v).size.x;
      if (want > jaw.max + 1e-6) {
        showToast("That billet is too wide for the vise",
        `It measures ${fmtNum(toDisp(want))} ${uLabel()} across, and ${v.name} only opens to ` +
        `${fmtNum(toDisp(jaw.max))}.`);
        return false;
      }

      jawTarget = { from: jaw.value, to: Math.min(Math.max(want, jaw.min), jaw.max) };
      jaw.value = jawTarget.to;
      Store.apply(v);
    }

    const banked = par && v ? bankParallels(true) : false;

    const ref = par || v;
    const onBars = !!par;
    let lo, hi;
    if (onBars) {
      ({ lo, hi } = parallelsBox(par));
    } else {
      const jb = boxOf(jaw.geometry);
      const jawW = jaw.jawW || (jb.max.y - jb.min.y);
      const mid = (jb.max.y + jb.min.y) / 2;

      ({ lo, hi } = boxesInFrame(v, v, [new THREE.Box3(
        new THREE.Vector3(jaw.fixedFace, mid - jawW / 2, 0),
        new THREE.Vector3(jaw.fixedFace + jaw.value, mid + jawW / 2, 0))]));
    }

    const b = boxInFrame(s, ref);
    const span = hi.y - lo.y;

    const toY = where === "left"  ? lo.y
              : where === "right" ? hi.y - b.size.y
              :                     (lo.y + hi.y) / 2 - b.size.y / 2;
    const toX = (lo.x + hi.x) / 2 - b.size.x / 2;

    const dz = onBars ? hi.z - b.lo.z : 0;

    const d = new THREE.Vector3(toX - b.lo.x, toY - b.lo.y, dz)
                .applyQuaternion(new THREE.Quaternion().setFromEuler(eulerOf(ref)));

    const landed = s.pos.clone().add(d);
    if (jawTarget) {
      jaw.value = jawTarget.from;
      Store.apply(v);
      Motion.memberTo(v, jaw, jawTarget.to);
    }
    Motion.moveTo(s, landed);

    setGroup([s], s);
    if (quiet) return true;
    const over = b.size.y - span;
    showToast(`${s.name} set ${where === "center" ? "centered" : "hard " + where}`,
      `It is on ${onBars ? "the parallels" : v.name}` +
      (jaw ? `, with the jaws ${fmtNum(toDisp(jaw.value))} ${uLabel()} apart` : "") +
      (banked ? ", and the parallels followed it" : "") +
      (over > 1e-6 ? `. It overhangs by ${fmtNum(toDisp(over))} ${uLabel()}` : "") + ".");
    return true;
  }

  let align = null;
  const alignStage = () => (align ? align.stage : 0);

  function alignBegin() {
    if (!group.length) { toast("Select what you want to move first."); return; }
    align = { stage: 1, anchor: null };
    Snap.arm(true);
    paint();
    toast("Align — Pick the point ON THE SELECTION to move from.");
  }
  function alignCancel() {
    if (!align) return;
    align = null;
    paint();
  }

  function alignTake(hit) {
    if (!align) return false;
    if (align.stage === 1) {
      if (!inGroup(hit.part)) {
        toast("That is not part of the selection — Pick the anchor on what you are moving.");
        return "keep";
      }
      align.anchor = hit.world.clone();
      align.stage = 2;
      paint();
      toast("Anchor set on " + hit.note + " — Now pick where it should land.");
      return "keep";
    }
    const d = hit.world.clone().sub(align.anchor);
    const mm = new THREE.Vector3(fromDisp(d.x), fromDisp(d.y), fromDisp(d.z));
    group.forEach(p => { p.pos.add(mm); Store.apply(p); });
    align = null;
    place(); paint(); Panel.refresh();
    toast("Aligned onto " + hit.note + ".");
    return true;
  }

  function seatOn(target) {
    if (!group.length || (sel && sel.member)) return false;
    const box = new THREE.Box3();
    let any = false;
    group.forEach(p => {
      p.node.updateMatrixWorld(true);
      [p.mesh].concat(p.members.map(m => m.mesh)).forEach(m => {
        if (m) { box.expandByObject(m); any = true; }
      });
    });
    if (!any || box.isEmpty()) return false;
    const c = box.getCenter(new THREE.Vector3());
    const foot = new THREE.Vector3(c.x, c.y, box.min.z);
    const d = target.clone().sub(foot);
    group.forEach(p => {
      p.pos.add(new THREE.Vector3(fromDisp(d.x), fromDisp(d.y), fromDisp(d.z)));
      Store.apply(p);
    });
    place();
    paint();
    return true;
  }

  function clearSelection() {
    alignCancel();
    Snap.arm(false);
    Drag.set(false);
    setGroup([], null);
  }

  return { bind, sync, paint, place, seatOn, alignBegin, alignTake, alignCancel,
           clearSelection, setHandlesVisible, setMode,

           bankParallels, alignStockInVise,
           findVise, findPars, findStock,
           get alignStage() { return alignStage(); },

           get canTransform() { return !!(sel && !sel.member); },
           get mode() { return mode; } };
})();

const MakeProgram = (() => {
  const IN = MM_PER_IN;
  const id = s => document.getElementById(s);
  let on = false;

  const VISES = [
    { key: "haasv6", name: "Haas HV6",  note: "Recommended · 8.00 open" },
    { key: "dx6",    name: "Kurt DX6",  note: "9.00 open" },
    { key: "d688",   name: "Kurt D688", note: "8.80 open" },
  ];

  const REC_STOCK = () => ({ shape: "block", sx: 5 * IN, sy: 4 * IN, sz: 1 * IN,
                             dia: 2 * IN, len: 4 * IN, metal: "aluminum" });

  const SETUP_ROT = 270;

  const stockRotFor = () => 0;

  const GRIP = 0.35 * IN;

  const cfg = {
    vise: "haasv6", useVise: true, useTable: true,
    parAuto: true,
    parH: 1.375 * IN, parT: 0.125 * IN,
    stockRec: true,
    stock: REC_STOCK(),
    toolRec: true,
    slide: "center",
    originMode: "vertex",
  };

  const say = (msg, sel) => { const e = id(sel || "mkp-scene-out"); if (e) e.textContent = msg || ""; };
  const fmt = v => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(isInch() ? 3 : 2);

  const HEAD = (o, title) => [
    "%", `O${o} (${title})`,
    "(BLANK 5.000 X 4.000 X 1.000 - 6061)",
    "(X RUNS ALONG THE PARALLELS, Y ACROSS THE JAWS)",
    "(WORK ZERO: TOP NEAR-LEFT CORNER, Z0 = TOP FACE)",
    "G20 G90 G54 G17 G40 G49 G80",
  ];
  const FOOT = ["G00 Z1.", "M09", "M05", "G91 G28 Z0.", "M30", "%"];

  const SAMPLES = {
    outside: {
      name: "Outside contour",
      note: "G42 · a 4 × 3 boss profiled 0.300 proud, two passes",
      tools: [[1, 0.5, "flat"]], dias: { 1: 0.5 },
      code: () => {
        const L = HEAD("1101", "OUTSIDE CONTOUR - G42 CUTTER COMP RIGHT");
        L.push("T1 M06 (.500 4FL FLAT ENDMILL)", "S5000 M03", "G43 H1 Z1.", "M08",
          "(--- 4.000 X 3.000 BOSS, .500 MARGIN ALL ROUND ---)",
          "(--- CCW TRAVEL + G42 PUTS THE CUTTER OUTSIDE THE SHAPE ---)");
        [-0.15, -0.30].forEach((z, i) => {
          L.push(`(--- PASS ${i + 1} AT Z${z.toFixed(3)} ---)`,
            "G00 X-.75 Y-.75", "G00 Z.1", `G01 Z${z.toFixed(3)} F14.`,
            "G42 D01 X.5 Y.5 F30.",
            "G01 X4.5", "G01 Y3.5", "G01 X.5", "G01 Y.5",
            "G01 X-.75 Y-.75", "G40", "G00 Z.25");
        });
        return L.concat(FOOT).join("\n");
      },
    },

    inside: {
      name: "Inside contour",
      note: "G41 · a 3½ × 2½ opening profiled 0.300 deep, two passes",
      tools: [[1, 0.5, "flat"]], dias: { 1: 0.5 },
      code: () => {
        const L = HEAD("1102", "INSIDE CONTOUR - G41 CUTTER COMP LEFT");
        L.push("T1 M06 (.500 4FL FLAT ENDMILL)", "S5000 M03", "G43 H1 Z1.", "M08",
          "(--- 3.500 X 2.500 OPENING, CENTERED ON THE BLANK ---)",
          "(--- CCW TRAVEL + G41 PUTS THE CUTTER INSIDE THE SHAPE ---)");
        [-0.15, -0.30].forEach((z, i) => {
          L.push(`(--- PASS ${i + 1} AT Z${z.toFixed(3)} ---)`,
            "G00 X2.5 Y2.", "G00 Z.1", `G01 Z${z.toFixed(3)} F12.`,
            "G41 D01 X.75 Y.75 F26.",
            "G01 X4.25", "G01 Y3.25", "G01 X.75", "G01 Y.75",
            "G40 X2.5 Y2.", "G00 Z.25");
        });
        return L.concat(FOOT).join("\n");
      },
    },

    pocket: {
      name: "Pockets",
      note: "A rastered rectangular pocket and a G12 circular one, both 0.300 deep",
      tools: [[1, 0.5, "flat"]], dias: { 1: 0.5 },
      code: () => {
        const L = HEAD("1103", "TWO POCKETS - RASTER AND G12 CIRCULAR");
        L.push("T1 M06 (.500 4FL FLAT ENDMILL)", "S5200 M03", "G43 H1 Z1.", "M08",
          "(--- 1.800 X 1.400 RECTANGULAR POCKET, .300 STEPOVER ---)");
        [-0.15, -0.30].forEach(z => {
          L.push("G00 X3. Y1.55", "G00 Z.1", `G01 Z${z.toFixed(3)} F12.`);

          for (let k = 0; k <= 3; k++) {
            const y = 1.55 + k * 0.3;
            L.push(`G01 Y${y.toFixed(3)} F28.`, `G01 X${k % 2 ? 3.0 : 4.3}`);
          }
          L.push("(--- FINISH THE WALL ---)",
            "G01 X3. Y1.55", "G01 X4.3", "G01 Y2.45", "G01 X3.", "G01 Y1.55",
            "G00 Z.25");
        });
        L.push("(--- 1.800 DIA CIRCULAR POCKET ON G12 ---)",
          "(--- I = FIRST CUT RADIUS, K = FINISH RADIUS, Q = STEPOVER ---)",
          "G00 X1.3 Y2.", "G00 Z.1");
        [-0.15, -0.30].forEach(z => {
          L.push(`G01 Z${z.toFixed(3)} F10.`, "G12 I.3 K.9 Q.2 D01 F22.");
        });
        L.push("G00 Z.25");
        return L.concat(FOOT).join("\n");
      },
    },

    drill: {
      name: "Drilling",
      note: "Spot, then a row and a bolt circle pecked 0.650 deep",
      tools: [[2, 0.375, "drill"], [3, 0.25, "drill"]], dias: { 2: 0.375, 3: 0.25 },
      code: () => {

        const holes = [[0.8, 0.6], [1.8, 0.6], [2.8, 0.6], [3.8, 0.6]];
        for (let k = 0; k < 6; k++) {
          const a = k * Math.PI / 3;
          holes.push([2.5 + Math.cos(a), 2.5 + Math.sin(a)]);
        }
        const at = h => `X${h[0].toFixed(4)} Y${h[1].toFixed(4)}`;
        const L = HEAD("1104", "DRILLING - G82 SPOT THEN G83 PECK");
        L.push("(=== T2 .375 SPOT DRILL ===)",
          "T2 M06 (.375 90 DEG SPOT DRILL)", "S3200 M03", "G43 H2 Z1.", "M08",
          "(--- .080 DEEP WITH A DWELL, SO THE DRILL HAS SOMETHING TO FIND ---)",
          `G00 ${at(holes[0])}`,
          `G99 G82 ${at(holes[0])} Z-.08 R.1 P200 F9.`);
        holes.slice(1).forEach(h => L.push(at(h)));
        L.push("G80", "G00 Z1.", "M09", "M05",
          "", "(=== T3 .250 JOBBER DRILL ===)",
          "T3 M06 (.250 JOBBER DRILL)", "S3800 M03", "G43 H3 Z1.", "M08",
          "(--- ROW OF FOUR ALONG X, G81 STRAIGHT THROUGH TO .650 ---)",
          `G00 ${at(holes[0])}`,
          `G99 G81 ${at(holes[0])} Z-.65 R.1 F10.`);
        holes.slice(1, 4).forEach(h => L.push(at(h)));
        L.push("G80",
          "(--- SIX ON A 2.000 BOLT CIRCLE, G83 PECKED .150 AT A TIME ---)",
          `G00 ${at(holes[4])}`,
          `G99 G83 ${at(holes[4])} Z-.65 R.1 Q.15 F8.`);
        holes.slice(5).forEach(h => L.push(at(h)));
        L.push("G80");
        return L.concat(FOOT).join("\n");
      },
    },

    tap: {
      name: "Tapping",
      note: "Spot, tap-drill and rigid-tap five ¼–20 holes",
      tools: [[2, 0.375, "drill"], [3, 0.201, "drill"], [4, 0.25, "tap"]],
      dias: { 2: 0.375, 3: 0.201, 4: 0.25 },
      code: () => {
        const holes = [[0.75, 0.75], [4.25, 0.75], [4.25, 3.25], [0.75, 3.25], [2.5, 2.]];
        const at = h => `X${h[0].toFixed(3)} Y${h[1].toFixed(3)}`;
        const L = HEAD("1105", "TAPPING - 1/4-20 UNC, SPOT DRILL TAP");
        L.push("(--- .250-20 TAP DRILL IS .201, FEED IS RPM X PITCH ---)",
          "(--- 20 TPI = .050 PITCH, S500 X .050 = F25.0 ---)",
          "", "(=== T2 .375 SPOT DRILL ===)",
          "T2 M06 (.375 90 DEG SPOT DRILL)", "S3200 M03", "G43 H2 Z1.", "M08",
          `G00 ${at(holes[0])}`,
          `G99 G82 ${at(holes[0])} Z-.12 R.1 P200 F9.`);
        holes.slice(1).forEach(h => L.push(at(h)));
        L.push("G80", "G00 Z1.", "M09", "M05",
          "", "(=== T3 .201 TAP DRILL ===)",
          "T3 M06 (.201 JOBBER DRILL - 1/4-20 TAP SIZE)", "S4200 M03", "G43 H3 Z1.", "M08",
          "(--- .700 DEEP, PECKED - DEEPER THAN THE THREAD SO CHIPS HAVE SOMEWHERE TO GO ---)",
          `G00 ${at(holes[0])}`,
          `G99 G83 ${at(holes[0])} Z-.7 R.1 Q.12 F7.`);
        holes.slice(1).forEach(h => L.push(at(h)));
        L.push("G80", "G00 Z1.", "M09", "M05",
          "", "(=== T4 1/4-20 TAP ===)",
          "T4 M06 (.250-20 UNC SPIRAL POINT TAP)", "S500 M03", "G43 H4 Z1.", "M08",
          "(--- .500 OF THREAD, G84 REVERSES AND BACKS ITSELF OUT ---)",
          `G00 ${at(holes[0])}`,
          `G99 G84 ${at(holes[0])} Z-.5 R.25 F25.`);
        holes.slice(1).forEach(h => L.push(at(h)));
        L.push("G80");
        return L.concat(FOOT).join("\n");
      },
    },
  };

  SAMPLES.face = {
    name: "Facing",
    note: "0.040 off the whole top in overlapping passes along the bars",
    tools: [[1, 0.75, "flat"]], dias: { 1: 0.75 },
    code: () => {
      const L = HEAD("1106", "FACING - SKIM THE WHOLE TOP FLAT");
      L.push("T1 M06 (.750 4FL FLAT ENDMILL)", "S4200 M03", "G43 H1 Z1.", "M08",
        "(--- .040 DEEP, .500 STEPOVER, ON AND OFF THE METAL AT BOTH ENDS ---)",
        "G00 X-.6 Y.3", "G00 Z.1", "G01 Z-.04 F16.");
      for (let k = 0; k <= 7; k++) {
        const y = 0.3 + k * 0.5;
        L.push(`G01 X${k % 2 ? -0.6 : 5.6} F44.`);
        if (k < 7) L.push(`G01 Y${(y + 0.5).toFixed(3)}`);
      }
      L.push("G00 Z.25");
      return L.concat(FOOT).join("\n");
    },
  };

  SAMPLES.slot = {
    name: "Slotting",
    note: "A through slot along the bars and a rebate round the top edge",
    tools: [[1, 0.375, "flat"]], dias: { 1: 0.375 },
    code: () => {
      const L = HEAD("1107", "SLOTTING - THROUGH SLOT AND EDGE REBATE");
      L.push("T1 M06 (.375 4FL FLAT ENDMILL)", "S5600 M03", "G43 H1 Z1.", "M08",
        "(--- .375 WIDE SLOT ALONG X, FOUR PASSES TO .900 ---)");
      [-0.25, -0.5, -0.75, -0.9].forEach(z => {
        L.push("G00 X.5 Y2.", "G00 Z.1", `G01 Z${z.toFixed(3)} F9.`,
          "G01 X4.5 F26.", "G00 Z.25");
      });
      L.push("(--- .200 DEEP REBATE ROUND THE TOP EDGE, CLIMB ALL THE WAY ---)",
        "G00 X-.3 Y0. Z.1", "G01 Z-.2 F10.",
        "G01 X5.3 F30.", "G00 Z.1",
        "G00 X5.3 Y4.", "G01 Z-.2 F10.",
        "G01 X-.3 F30.", "G00 Z.1",
        "G00 X0. Y-.3", "G01 Z-.2 F10.",
        "G01 Y4.3 F30.", "G00 Z.1",
        "G00 X5. Y4.3", "G01 Z-.2 F10.",
        "G01 Y-.3 F30.", "G00 Z.25");
      return L.concat(FOOT).join("\n");
    },
  };

  SAMPLES.bore = {
    name: "Boring",
    note: "A Ø1.500 bore ramped in on a helix rather than plunged",
    tools: [[1, 0.5, "flat"]], dias: { 1: 0.5 },
    code: () => {

      const R = 0.5, CX = 2.5, CY = 2;
      const L = HEAD("1108", "BORING - HELICAL RAMP, 1.500 DIA THROUGH");
      L.push("T1 M06 (.500 4FL FLAT ENDMILL)", "S5000 M03", "G43 H1 Z1.", "M08",
        "(--- RAMP DOWN ON A HELIX, .100 A TURN - NO PLUNGE ---)",
        `G00 X${(CX - R).toFixed(3)} Y${CY.toFixed(3)}`, "G00 Z.1", "G01 Z0. F12.");
      for (let k = 1; k <= 9; k++) {
        L.push(`G03 X${(CX - R).toFixed(3)} Y${CY.toFixed(3)} `
          + `I${R.toFixed(3)} J0. Z${(-0.1 * k).toFixed(3)} F22.`);
      }
      L.push("(--- ONE FLAT LAP TO CLEAN THE WALL, THEN OUT THROUGH THE MIDDLE ---)",
        `G03 X${(CX - R).toFixed(3)} Y${CY.toFixed(3)} I${R.toFixed(3)} J0. F16.`,
        `G01 X${CX.toFixed(3)} Y${CY.toFixed(3)} F30.`, "G00 Z.25");
      return L.concat(FOOT).join("\n");
    },
  };

  SAMPLES.chamfer = {
    name: "Chamfer",
    note: "A 0.040 break round the whole top edge with a 90° chamfer tool",
    tools: [[1, 0.5, "chamfer"]], dias: { 1: 0.5 },
    code: () => {

      const O = 0.04, Z = -0.04;
      const L = HEAD("1109", "CHAMFER - .040 BREAK ROUND THE TOP EDGE");
      L.push("T1 M06 (.500 90 DEG CHAMFER TOOL)", "S7000 M03", "G43 H1 Z1.", "M08",
        "(--- POINT .040 BELOW THE FACE, .040 OUTSIDE THE PROFILE ---)",
        `G00 X${(-O).toFixed(3)} Y${(-0.6).toFixed(3)}`, "G00 Z.1",
        `G01 Z${Z.toFixed(3)} F10.`,
        `G01 Y${(4 + O).toFixed(3)} F34.`,
        `G01 X${(5 + O).toFixed(3)}`,
        `G01 Y${(-O).toFixed(3)}`,
        `G01 X${(-O).toFixed(3)}`,
        `G01 Y${(0.6).toFixed(3)}`,
        "G00 Z.25");
      return L.concat(FOOT).join("\n");
    },
  };

  SAMPLES.engrave = {
    name: "Text engrave",
    note: "G47 — a part number and a serial cut 0.008 into the faced top",
    tools: [[1, 0.75, "flat"], [8, 0.125, "chamfer"]], dias: { 1: 0.75, 8: 0.125 },
    code: () => {
      const L = HEAD("1110", "FACE THEN ENGRAVE - G47 TEXT");
      L.push("(=== T1 .750 FLAT - FACE THE TOP SO THERE IS SOMETHING TO CUT INTO ===)",
        "T1 M06 (.750 4FL FLAT ENDMILL)", "S4200 M03", "G43 H1 Z1.", "M08",
        "G00 X-.6 Y.3", "G00 Z.1", "G01 Z-.02 F16.");
      for (let k = 0; k <= 7; k++) {
        const y = 0.3 + k * 0.5;
        L.push(`G01 X${k % 2 ? -0.6 : 5.6} F44.`);
        if (k < 7) L.push(`G01 Y${(y + 0.5).toFixed(3)}`);
      }
      L.push("G00 Z1.", "M09", "M05",
        "", "(=== T8 .125 ENGRAVER ===)",
        "T8 M06 (.125 90 DEG ENGRAVING TOOL)", "S9000 M03", "G43 H8 Z1.", "M08",
        "(--- G47: I IS THE ANGLE, J THE LETTER HEIGHT, R THE RETRACT ---)",
        "G47 P0 X.4 Y2.9 I0. J.35 R.05 Z-.008 F24. (PART 5X4X1)",
        "G00 Z.25",
        "G47 P0 X.4 Y2. I0. J.28 R.05 Z-.008 F24. (SN 2026-0001)",
        "G00 Z.25",

        "G47 P0 X.4 Y1.2 I0. J.22 R.05 Z-.008 F24. (6061 ALUMINUM)",
        "G00 Z.25");
      return L.concat(FOOT).join("\n");
    },
  };

  function loadSample(key) {
    const s = SAMPLES[key];
    if (!s) return;

    cfg.stock = REC_STOCK();
    cfg.tools = new Map(Object.keys(s.dias).map(k => [+k, s.dias[k]]));

    if (typeof ToolShapes !== "undefined") {
      s.tools.forEach(([n, , shape]) => { if (shape) ToolShapes.set(n, shape); });
    }
    if (typeof toolTable !== "undefined") {
      cfg.tools.forEach((dia, t) => toolTable.set(t, dia));
    }
    buildStock(true);
    buildFixture();
    reseat();
    useCode(s.code(), s.name);
    paint();
    Panel.home();

    if (typeof ViewMode !== "undefined") ViewMode.set("sim");
    toast(`${s.name} — ${s.note}. Sim mode, press play.`);
  }

  function wipe() {
    Store.clear();
    if (typeof StockSim !== "undefined") StockSim.reset(false);
    if (typeof toolTable !== "undefined" && toolTable.clear) toolTable.clear();
    if (typeof dOffsetTable !== "undefined" && dOffsetTable.clear) dOffsetTable.clear();
    if (typeof ToolShapes !== "undefined" && ToolShapes.clear) ToolShapes.clear();
    if (typeof loadGCode === "function") loadGCode("");
    if (typeof updateToolTableUI === "function") updateToolTableUI();
    if (typeof updateDOffsetTableUI === "function") updateDOffsetTableUI();

    if (typeof window.performGlobalReset === "function") {
      try { window.performGlobalReset(true); } catch (e) { console.warn("[MakeProgram]", e); }
    }
    Panel.refresh();
  }

  function enter() {
    if (on) return;
    on = true;
    document.body.classList.add("mkp-on");
    wipe();
    build();
    if (typeof ViewMode !== "undefined") ViewMode.set("model");
    paint();
    toast("Build mode — Screen cleared. Drop or paste a program, then build the setup.");
  }

  function exit(skipSave) {
    if (!on) return;
    on = false;
    document.body.classList.remove("mkp-on");
    Snap.arm(false);
    paint();
    if (skipSave) {
      toast("Left build mode — The page will open with the built-in demo again.");
      return;
    }
    const kept = save();
    toast(kept
      ? "Left build mode — This setup is now what the page opens with."
      : "Left build mode — The setup you built stays in the scene.");
  }

  const STORE_KEY = "gcodeviz.defaultSetup.v1";

  function save() {
    const p = Gizmo.findStock && Gizmo.findStock();
    const doc = {
      v: 1,
      code: (typeof gcodeInput !== "undefined" && gcodeInput) ? gcodeInput.value : "",
      cfg: {
        vise: cfg.vise, useVise: cfg.useVise, useTable: cfg.useTable,
        parAuto: cfg.parAuto, parH: cfg.parH, parT: cfg.parT,
        stockRec: cfg.stockRec, stock: Object.assign({}, cfg.stock),
        toolRec: cfg.toolRec, slide: cfg.slide, originMode: cfg.originMode,
      },
      tools: {}, shapes: {},

      origin: p ? { base: p.base.toArray(), zero: p.zero.toArray(),
                    note: p.zeroNote } : null,
    };
    if (typeof toolTable !== "undefined") toolTable.forEach((d, t) => doc.tools[t] = d);
    if (typeof ToolShapes !== "undefined") ToolShapes.forEach((s, t) => doc.shapes[t] = s);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(doc));
      return true;
    } catch (e) { console.warn("[MakeProgram] could not save the default setup:", e); return false; }
  }

  function stored() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const doc = JSON.parse(raw);
      return (doc && doc.v === 1) ? doc : null;
    } catch (e) { return null; }
  }

  function forget() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {   }
  }

  function restore(doc) {
    if (!doc) return false;
    Object.assign(cfg, doc.cfg || {});
    cfg.stock = Object.assign(REC_STOCK(), (doc.cfg && doc.cfg.stock) || {});
    cfg.tools = new Map(Object.keys(doc.tools || {}).map(k => [+k, doc.tools[k]]));

    Store.clear();
    if (typeof StockSim !== "undefined") StockSim.reset(false);
    if (typeof ToolShapes !== "undefined") {
      ToolShapes.clear();
      Object.keys(doc.shapes || {}).forEach(k => ToolShapes.set(+k, doc.shapes[k]));
    }
    if (typeof toolTable !== "undefined") {
      toolTable.clear();
      cfg.tools.forEach((d, t) => toolTable.set(t, d));
    }

    buildStock(true);
    buildFixture();
    reseat();

    const p = Gizmo.findStock && Gizmo.findStock();
    if (p && doc.origin) {
      const w = Store.toWorld(p, new THREE.Vector3().fromArray(doc.origin.base));
      p.base.fromArray(doc.origin.base);
      p.zero.fromArray(doc.origin.zero);
      p.baseNote = p.zeroNote = doc.origin.note || "saved origin";
      p.pos.set(fromDisp(w.x), fromDisp(w.y), fromDisp(w.z));
      Store.apply(p);
    }

    if (doc.code && typeof loadGCode === "function") {
      loadGCode(doc.code);
      applyTooling();
      if (typeof rewindSimToStart === "function") rewindSimToStart();
    }
    Motion.settle();
    Panel.refresh();
    Panel.home();
    return true;
  }

  function build() {
    buildStock(true);
    buildFixture();
    reseat();
    Panel.home();
  }

  function barHeight() {
    const hold = (Samples.get(cfg.vise) || {}).hold || {};
    if (!cfg.parAuto || hold.jawTop == null) return Math.max(cfg.parH, 2);
    const p = Gizmo.findStock ? Gizmo.findStock() : null;
    const sz = p ? Stock.halfOf(p.stock)[2] * 2 : 1 * IN;
    const grip = Math.min(GRIP, sz * 0.45);
    return Math.max(hold.jawTop - hold.bed - grip, 3);
  }

  function buildFixture() {
    Store.all().forEach(p => {
      if (p.role === "fixture" || p.role === "machine") Store.remove(p.id, { quiet: true });
    });
    if (!cfg.useVise) { Panel.refresh(); return null; }

    const v = Panel.addClamp(cfg.vise);
    if (!v) return null;
    const hold = (Samples.get(cfg.vise) || {}).hold || {};

    v.rot.z = SETUP_ROT;
    v.geometry.computeBoundingBox();
    const gb = v.geometry.boundingBox;
    const cx = (gb.min.x + gb.max.x) / 2, cy = (gb.min.y + gb.max.y) / 2;
    v.pos.copy(new THREE.Vector3(-cx, -cy, 0)
      .applyEuler(new THREE.Euler(0, 0, SETUP_ROT * Math.PI / 180)));
    Store.apply(v);

    const jaw = v.members[0];

    if (cfg.parAuto) cfg.parH = barHeight();
    const bars = Samples.parallelPair({
      width:  jaw ? Math.max(jaw.value, cfg.parT * 4) : 4 * IN,
      h:      Math.max(cfg.parH, 2),
      t:      Math.max(cfg.parT, 0.5),
      len:    hold.jawW || 6 * IN,
      travel: jaw ? Math.max(jaw.max - jaw.value, 0) : 0,
    });
    Store.add(bars, "Parallels", { role: "fixture" });
    Gizmo.bankParallels(true);

    if (cfg.useTable) {
      const t = Panel.addClamp("vf1", { role: "machine" });
      if (t) {
        const R = new THREE.Euler(0, 0, SETUP_ROT * Math.PI / 180);
        const mid = new THREE.Vector3(cx, cy, 0).applyEuler(R).add(v.pos);

        const slot = new THREE.Vector3((hold.boltCX || 0) - cx, 0, 0).applyEuler(R);
        t.pos.set(mid.x + slot.x, mid.y + slot.y, v.pos.z);
        t.baseNote = t.zeroNote = "table work surface";
        Store.apply(t);
      }
    }
    Panel.refresh();
    return v;
  }

  /* Re-cut the pair to the vise as it stands right now and bank it: outer face
     of each bar flat on the jaw it belongs to, ends flush with both sides of
     the jaws, and the movable bar tied to the movable jaw so it stays that way.
     Unlike buildFixture this leaves the vise, its opening and the blank alone. */
  function autoParallels(quiet) {
    const v = Gizmo.findVise && Gizmo.findVise();
    if (!v) {
      if (!quiet) toast("No vise in the scene — Turn the workholding back on first.");
      return false;
    }
    const jaw = v.members && v.members[0];
    const hold = (Samples.get(cfg.vise) || {}).hold || {};

    Motion.settle();

    Store.all().forEach(p => {
      if (p !== v && p.members.some(m => m.name === "Bar")) Store.remove(p.id, { quiet: true });
    });

    if (cfg.parAuto) cfg.parH = barHeight();
    const bars = Samples.parallelPair({
      width:  jaw ? Math.max(jaw.value, cfg.parT * 4) : 4 * IN,
      h:      Math.max(cfg.parH, 2),
      t:      Math.max(cfg.parT, 0.5),
      len:    hold.jawW || 6 * IN,
      travel: jaw ? Math.max(jaw.max - jaw.value, 0) : 0,
    });
    Store.add(bars, "Parallels", { role: "fixture" });

    const ok = Gizmo.bankParallels(true);
    Gizmo.alignStockInVise(cfg.slide, true);
    Panel.refresh();
    paint();
    if (!quiet) {
      toast(ok
        ? `Parallels aligned — ${fmt(toDisp(cfg.parT))} × ${fmt(toDisp(cfg.parH))} ${uLabel()}, `
          + `flush end to end and banked on both jaw faces.`
        : "Parallels re-cut — This vise does not say where its jaw faces are.");
    }
    return ok;
  }

  function buildStock(quiet) {
    Store.all().forEach(p => { if (p.stock) Store.remove(p.id); });
    const def = cfg.stockRec ? REC_STOCK() : Object.assign(REC_STOCK(), cfg.stock);
    const p = Panel.addStockFrom(def, cfg.stockRec ? "Blank · recommended" : "Blank");
    if (!p) return null;

    const h = Stock.halfOf(p.stock);
    if (p.stock.shape === "cyl") {
      p.base.set(0, 0, h[2] * 2);
      p.baseNote = p.zeroNote = "center of the top face";
    } else {
      p.base.set(-h[0], -h[1], h[2] * 2);
      p.baseNote = p.zeroNote = "top near-left corner";
    }
    p.zero.copy(p.base);
    p.rot.set(0, 0, 0);
    p.pos.set(0, 0, 0);
    Store.apply(p);

    Store.markReference(p);
    p.rot.z = cfg.useVise ? stockRotFor(Gizmo.findVise()) : 0;
    Store.apply(p);

    Store.select(p.id);
    Panel.refresh();
    if (!quiet) reseat();
    return p;
  }

  const DEFAULT_ZERO_NOTES = ["top near-left corner", "center of the top face"];

  /* Custom blank: push shape / size straight onto the billet already in the
     scene, so the change is on screen without rebuilding anything. The work
     origin is re-derived only while it is still sitting where we put it —
     an origin the user touched off themselves is left alone. */
  function liveStock() {
    const p = Gizmo.findStock && Gizmo.findStock();
    if (!p || !p.stock) { buildStock(true); buildFixture(); reseat(); return false; }

    ["shape", "sx", "sy", "sz", "dia", "len"].forEach(k => {
      if (cfg.stock[k] != null) p.stock[k] = cfg.stock[k];
    });
    Panel.rebuildStock(p);

    if (DEFAULT_ZERO_NOTES.indexOf(p.zeroNote) >= 0) {
      const h = Stock.halfOf(p.stock);
      if (p.stock.shape === "cyl") {
        p.base.set(0, 0, h[2] * 2);
        p.baseNote = p.zeroNote = "center of the top face";
      } else {
        p.base.set(-h[0], -h[1], h[2] * 2);
        p.baseNote = p.zeroNote = "top near-left corner";
      }
      p.zero.copy(p.base);
      Store.apply(p);
      Store.markReference(p);
    }

    reseat(true);
    Panel.refresh();
    paint();
    return true;
  }

  function reseat(quiet) {
    const s = Gizmo.findStock && Gizmo.findStock();
    if (!s) return false;
    const v = Gizmo.findVise();
    if (!v && !Gizmo.findPars()) return false;
    const want = v ? stockRotFor(v) : 0;
    if (Math.abs(s.rot.z - want) > 1e-6) {
      s.rot.z = want;
      Store.apply(s);
    }
    const okay = Gizmo.alignStockInVise(cfg.slide, quiet !== false);
    paintSlide();
    return okay;
  }

  function slide(where) {
    if (!Gizmo.findStock || !Gizmo.findStock()) return false;
    if (!Gizmo.findVise() && !Gizmo.findPars()) {
      toast("No vise in the scene — Turn the workholding back on first.");
      return false;
    }
    cfg.slide = where;
    return reseat(false);
  }

  function useCode(text, name) {
    if (typeof loadGCode !== "function") return;
    if (!String(text || "").trim()) { say("Nothing to load — That is empty.", "mkp-scene-out"); return; }
    loadGCode(text);
    applyTooling();
    if (typeof rewindSimToStart === "function") rewindSimToStart();

    say(`${name || "Pasted program"} — ${String(text).split("\n").length} lines, rewound to the first line.`);
  }

  async function intake(files) {
    const list = Array.from(files || []);
    const models = list.filter(f => Loaders.ACCEPTS.test(f.name));
    const codes  = list.filter(f => !Loaders.ACCEPTS.test(f.name));
    if (models.length) await Panel.intake(models);
    for (const f of codes) {
      try { useCode(await f.text(), f.name); } catch (e) { say(String(e && e.message || e)); }
      break;
    }
    paint();
  }

  function applyTooling() {
    if (typeof toolTable === "undefined") return;

    if (cfg.tools) {
      cfg.tools.forEach((dia, t) => { if (toolTable.has(t) && dia > 0) toolTable.set(t, dia); });
    }

    if (typeof ToolShapes !== "undefined") {
      toolTable.forEach((_, t) => { if (!ToolShapes.has(t)) ToolShapes.set(t, "flat"); });
    }
    if (typeof updateToolTableUI === "function") updateToolTableUI();
    if (typeof simSeekToTime === "function" && typeof simTime !== "undefined") simSeekToTime(simTime);
  }

  function armOrigin() {
    if (!Store.all().length) { say("Nothing in the scene to touch off."); return; }
    if (typeof ViewMode !== "undefined" && !ViewMode.isModel()) ViewMode.set("model");
    Snap.setMode(cfg.originMode);
    const armed = Snap.arm(!Snap.isArmed() || Snap.purpose !== "origin", "origin");
    paintOrigin();
    if (armed) {
      toast("Set origin — Click a "
        + (cfg.originMode === "vertex" ? "corner"
          : cfg.originMode === "edgemid" ? "point on an edge, and its center is taken"
          : "flat face, and its center is taken")
        + ". Esc cancels.");
    }
  }

  function paintOrigin() {
    const b = id("mkp-set-origin");
    if (!b) return;
    const live = Snap.isArmed() && Snap.purpose === "origin";
    b.classList.toggle("on", live);
    b.textContent = live ? "Picking — click the model (Esc)" : "Set origin";
    const p = Store.current();
    const out = id("mkp-origin-out");
    if (out) {
      out.textContent = p
        ? `${p.name} · work zero on ${p.zeroNote}`
        : "Nothing selected.";
    }
  }
  function paintSlide() {
    document.querySelectorAll("#mkp-slide [data-mkpslide]").forEach(b =>
      b.classList.toggle("on", b.dataset.mkpslide === cfg.slide));
  }

  function paintVises() {
    const box = id("mkp-vises");
    if (!box) return;
    box.innerHTML = VISES.map(v => `
      <button class="mkp-pick${v.key === cfg.vise ? " on" : ""}" data-mkpvise="${v.key}">
        <span class="mkp-pick-name">${v.name}</span>
        <span class="mkp-pick-note">${v.note}</span>
      </button>`).join("");
    box.style.display = cfg.useVise ? "" : "none";
  }

  function paintStock() {
    const wrap = id("mkp-stock-manual");
    if (wrap) wrap.style.display = cfg.stockRec ? "none" : "";
    document.querySelectorAll("#mkp-stock-mode [data-mkpstockmode]").forEach(b =>
      b.classList.toggle("on",
        b.dataset.mkpstockmode === (cfg.stockRec ? "rec" : "custom")));
    document.querySelectorAll("#mkp-stock-shape [data-mkpshape]").forEach(b =>
      b.classList.toggle("on", b.dataset.mkpshape === cfg.stock.shape));
    document.querySelectorAll("[data-mkpmetal]").forEach(b =>
      b.classList.toggle("on", b.dataset.mkpmetal === cfg.stock.metal));

    const dims = cfg.stock.shape === "cyl"
      ? [["dia", "Diameter"], ["len", "Length"]]
      : [["sx", "X"], ["sy", "Y"], ["sz", "Z"]];
    const box = id("mkp-stock-dims");
    if (box) {

      const want = dims.map(d => d[0]).join(",") + "|" + uLabel();
      if (box.dataset.keys !== want) {
        box.dataset.keys = want;
        box.innerHTML = '<div class="mkp-num-row">' + dims.map(([k, lab]) =>
          `<label><span>${lab} (${uLabel()})</span>
             <input type="number" step="0.25" min="0.1" data-mkpdim="${k}"
                    value="${fmt(toDisp(cfg.stock[k]))}"></label>`).join("") + "</div>";
      } else {

        dims.forEach(([k]) => {
          const i = box.querySelector(`[data-mkpdim="${k}"]`);
          if (i && document.activeElement !== i) i.value = fmt(toDisp(cfg.stock[k]));
        });
      }
    }

    const p = Store.all().find(x => x.stock);
    const out = id("mkp-stock-out");
    if (out) {
      if (!p) out.textContent = "No blank in the scene.";
      else {
        const d = p.stock, h = Stock.halfOf(d);
        out.textContent = `${Stock.METALS[d.metal].name} · `
          + (d.shape === "cyl"
            ? `Ø${fmt(toDisp(h[0] * 2))} × ${fmt(toDisp(h[2] * 2))} ${uLabel()}`
            : `${fmt(toDisp(h[0] * 2))} × ${fmt(toDisp(h[1] * 2))} × ${fmt(toDisp(h[2] * 2))} ${uLabel()}`);
      }
    }
    paintStockSummary(p);
  }

  function paintStockSummary(p) {
    const box = id("mkp-stock-summary");
    if (!box) return;
    if (!p) {
      box.className = "mkp-summary is-empty";
      box.innerHTML = '<div class="ms-head">No blank yet</div>'
        + '<div class="ms-sub">Pick a sample or set a size below, then Build the blank.</div>';
      return;
    }
    box.className = "mkp-summary";

    const d = p.stock, h = Stock.halfOf(d), u = uLabel();
    const metal = (Stock.METALS[d.metal] || {}).name || d.metal;
    const size = d.shape === "cyl"
      ? `Ø${fmt(toDisp(h[0] * 2))} × ${fmt(toDisp(h[2] * 2))} ${u}`
      : `${fmt(toDisp(h[0] * 2))} × ${fmt(toDisp(h[1] * 2))} × ${fmt(toDisp(h[2] * 2))} ${u}`;
    const shape = d.shape === "cyl" ? "round bar" : "block";

    const bits = [];

    if (cfg.useVise) {
      const v = VISES.find(x => x.key === cfg.vise);
      bits.push(v ? v.name : "vise");
      if (cfg.parAuto) bits.push(`parallels to suit (${fmt(toDisp(cfg.parH))} ${u})`);
      else bits.push(`parallels ${fmt(toDisp(cfg.parH))} × ${fmt(toDisp(cfg.parT))} ${u}`);
      if (cfg.useTable) bits.push("VF-1 table");
    } else {
      bits.push("standing on its own");
    }

    const dt = Stock.dovetailOf ? Stock.dovetailOf(d) : null;
    if (dt) bits.push(`dovetail along ${dt.axis === 0 ? "X" : "Y"}`);

    if (p.zeroNote) bits.push(`zero: ${p.zeroNote}`);

    if (!p.visible) bits.push("hidden — still being cut");

    box.innerHTML =
      `<div class="ms-head">${metal} ${shape} · ${size}</div>` +
      `<div class="ms-sub">${bits.join(" · ")}</div>`;
  }

  /* The tooling table is always in inches, whatever units the program is in. */
  const diaToIn = v => (typeof diaInInch === "function" ? diaInInch(v || 0) : (v || 0));
  const diaFromIn = v =>
    (typeof unitMode !== "undefined" && unitMode === "mm") ? v * 25.4 : v;

  const TOOL_KIND = {
    flat: "flat end mill", ball: "ball nose", drill: "drill",
    tap: "tap", chamfer: "chamfer", bull: "bull nose",
  };

  function paintTools() {
    const box = id("mkp-tool-list");
    if (!box) return;

    const live = document.activeElement;
    if (live && live.dataset && live.dataset.mkptool != null && box.contains(live)) return;
    const keys = (typeof toolTable !== "undefined")
      ? Array.from(toolTable.keys()).sort((a, b) => a - b) : [];
    if (!keys.length) {
      box.innerHTML = '<div class="mkp-empty">No T numbers yet — load a program and they turn up here.</div>';
      return;
    }
    const kindOf = k => {
      const s = (typeof ToolShapes !== "undefined" && ToolShapes.get) ? ToolShapes.get(k) : null;
      return TOOL_KIND[s] || (s || "cylinder");
    };
    const cell = k => {
      const inches = diaToIn(toolTable.get(k)).toFixed(4);
      return cfg.toolRec
        ? `<span class="mkp-dia-fixed">${inches}</span>`
        : `<input type="number" step="0.0005" min="0.001"
                  data-mkptool="${k}" value="${inches}">`;
    };
    box.innerHTML =
      '<table class="mkp-tool-table"><thead><tr>' +
        '<th>Tool</th><th>Type</th><th class="mkp-th-dia">Diameter (in)</th>' +
      "</tr></thead><tbody>" +
      keys.map(k => `<tr>
        <td class="mkp-td-tool">T${k}</td>
        <td class="mkp-td-kind">${kindOf(k)}</td>
        <td class="mkp-td-dia">${cell(k)}</td>
      </tr>`).join("") +
      "</tbody></table>";
  }

  function paint() {
    if (!on) return;
    const uv = id("mkp-use-vise"), ut = id("mkp-use-table");
    if (uv) uv.checked = cfg.useVise;
    if (ut) { ut.checked = cfg.useTable; ut.disabled = !cfg.useVise; }
    const pa = id("mkp-par-auto");
    if (pa) { pa.checked = cfg.parAuto; pa.disabled = !cfg.useVise; }
    const ph = id("mkp-par-h"), pt = id("mkp-par-t");
    if (ph && document.activeElement !== ph) ph.value = fmt(toDisp(cfg.parH));
    if (pt && document.activeElement !== pt) pt.value = fmt(toDisp(cfg.parT));
    if (ph) ph.disabled = !cfg.useVise;
    if (pt) pt.disabled = !cfg.useVise;
    const tr = id("mkp-tool-rec");
    if (tr) tr.checked = cfg.toolRec;
    const pal = id("mkp-par-align");
    if (pal) pal.style.display = cfg.useVise ? "" : "none";
    document.querySelectorAll(".mkp-unit").forEach(e => e.textContent = uLabel());
    document.querySelectorAll("#mkp-origin-modes [data-mkporigin]").forEach(b =>
      b.classList.toggle("on", b.dataset.mkporigin === cfg.originMode));
    const fn = id("mkp-saved-note");
    const has = !!stored();
    if (fn) fn.textContent = has
      ? "A setup is saved: the page opens with it. Leaving build mode overwrites it with whatever is on screen now."
      : "Leaving build mode saves this setup, and the page opens with it from then on — after a refresh, and after closing the tab.";
    paintVises(); paintStock(); paintTools(); paintOrigin(); paintSlide();
  }

  function bind() {
    const go = id("btn-make-program");
    if (go) go.addEventListener("click", () => {
      if (typeof ModalSystem !== "undefined") ModalSystem.open("mkp-warn-modal");
      else enter();
    });
    const yes = id("mkp-warn-go");
    if (yes) yes.addEventListener("click", () => {
      if (typeof ModalSystem !== "undefined") ModalSystem.close("mkp-warn-modal");
      enter();
    });
    const off = id("mkp-exit");

    if (off) off.addEventListener("click", () => exit());
    const done = id("mkp-done");
    if (done) done.addEventListener("click", () => exit());
    const again = id("mkp-restart");
    if (again) again.addEventListener("click", () => {

      cfg.vise = "haasv6"; cfg.useVise = true; cfg.useTable = true;
      cfg.parAuto = true; cfg.parH = 1.375 * IN; cfg.parT = 0.125 * IN;
      cfg.stockRec = true; cfg.stock = REC_STOCK();
      cfg.toolRec = true; cfg.tools = null;
      cfg.slide = "center"; cfg.originMode = "vertex";
      const paste = id("mkp-paste");
      if (paste) paste.value = "";
      wipe(); build(); paint();
      toast("Started over — Empty machine, recommended setup.");
    });

    const drop = id("mkp-drop"), file = id("mkp-file");
    if (drop && file) {
      drop.addEventListener("click", () => file.click());
      const hot = v => drop.classList.toggle("hot", v);
      ["dragenter", "dragover"].forEach(t =>
        drop.addEventListener(t, e => { e.preventDefault(); hot(true); }));
      ["dragleave", "drop"].forEach(t =>
        drop.addEventListener(t, () => hot(false)));
      drop.addEventListener("drop", e => {
        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        e.preventDefault(); e.stopPropagation();
        intake(files);
      });
      file.addEventListener("change", () => { intake(file.files); file.value = ""; });
    }
    const imp = id("mkp-import");
    if (imp && file) imp.addEventListener("click", () => file.click());
    const fitb = id("mkp-fit");
    if (fitb) fitb.addEventListener("click", () => Panel.fit());

    const forgetBtn = id("mkp-forget");
    if (forgetBtn) forgetBtn.addEventListener("click", () => {
      forget();
      exit(true);
    });

    const pasteBtn = id("mkp-paste-load"), paste = id("mkp-paste");
    if (pasteBtn && paste) pasteBtn.addEventListener("click", () => useCode(paste.value, "Pasted program"));
    if (paste) {
      let typing = null, lastParsed = null;
      const settle = () => {
        typing = null;
        const text = paste.value;

        if (!text.trim() || text === lastParsed) return;
        lastParsed = text;
        useCode(text, "Pasted program");
      };
      paste.addEventListener("input", () => {
        clearTimeout(typing);
        typing = setTimeout(settle, 400);
      });

      paste.addEventListener("blur", () => { clearTimeout(typing); settle(); });
    }

    const samples = id("mkp-samples");
    if (samples) samples.addEventListener("click", e => {
      const b = e.target.closest("[data-mkpsample]");
      if (b) loadSample(b.dataset.mkpsample);
    });

    const uv = id("mkp-use-vise");
    if (uv) uv.addEventListener("change", () => {
      cfg.useVise = uv.checked;
      buildFixture(); reseat(); paint();
      toast(cfg.useVise
        ? "Vise and parallels back in — The jaws are closed on the blank again."
        : "Vise and parallels removed — The blank stands on its own.");
    });
    const ut = id("mkp-use-table");
    if (ut) ut.addEventListener("change", () => {
      cfg.useTable = ut.checked;
      buildFixture(); reseat(); paint();
      toast(cfg.useTable
        ? "Table under the vise — The VF-1 work surface is back."
        : "Table removed — The vise stands on its own.");
    });
    const vises = id("mkp-vises");
    if (vises) vises.addEventListener("click", e => {
      const b = e.target.closest("[data-mkpvise]"); if (!b) return;
      cfg.vise = b.dataset.mkpvise;
      buildFixture(); reseat(); paint();
      toast((Samples.get(cfg.vise) || {}).name +
      " — Jaws closed on the blank, parallels banked.");
    });
    const pa = id("mkp-par-auto");
    if (pa) pa.addEventListener("change", () => {
      cfg.parAuto = pa.checked;
      buildFixture(); reseat(); paint();
      toast(cfg.parAuto
        ? `Parallel height to suit the blank — The bars are ${fmt(toDisp(cfg.parH))} ${uLabel()} tall.`
        : "Parallel height is yours to set — Type the height you want.");
    });

    [["mkp-par-h", "parH"], ["mkp-par-t", "parT"]].forEach(([sel, key]) => {
      const e = id(sel);
      if (!e) return;
      let typing = null;
      const take = (redraw, say) => {
        const v = parseFloat(e.value);
        if (!isFinite(v) || v <= 0) { if (redraw) paint(); return; }
        cfg[key] = clamp(fromDisp(v), 0.4, 200);
        if (key === "parH") cfg.parAuto = false;
        buildFixture(); reseat(); paint();
        if (say) toast(`Parallels re-cut — ${fmt(toDisp(cfg.parT))} × ${fmt(toDisp(cfg.parH))} ${uLabel()}, banked on the jaws.`);
      };
      e.addEventListener("input", () => {
        clearTimeout(typing);
        typing = setTimeout(() => take(false, false), 200);
      });
      e.addEventListener("change", () => { clearTimeout(typing); take(true, true); });
    });

    const ss = id("mkp-show-stock");
    if (ss) ss.addEventListener("change", () => {
      if (typeof setBodyVisible === "function") setBodyVisible("stock", ss.checked);
      toast(ss.checked
        ? "Blank shown — The metal is back on screen."
        : "Blank hidden — The metal is still there and still gets cut.");
    });
    const sm = id("mkp-stock-mode");
    if (sm) sm.addEventListener("click", e => {
      const b = e.target.closest("[data-mkpstockmode]"); if (!b) return;
      const rec = b.dataset.mkpstockmode === "rec";
      if (rec === cfg.stockRec) return;
      cfg.stockRec = rec;
      if (rec) cfg.stock = REC_STOCK();
      buildStock(true); buildFixture(); reseat(); paint();
      toast(rec
        ? "Recommended blank — 5 × 4 × 1 in 6061, back in the vise."
        : "Custom blank — Shape, material and size land on it as you set them.");
    });
    const shape = id("mkp-stock-shape");
    if (shape) shape.addEventListener("click", e => {
      const b = e.target.closest("[data-mkpshape]"); if (!b) return;
      if (cfg.stock.shape === b.dataset.mkpshape) return;
      cfg.stock.shape = b.dataset.mkpshape;
      cfg.stockRec = false;
      liveStock();
      toast(cfg.stock.shape === "cyl"
        ? "Round bar in the vise — The jaws have closed on its diameter."
        : "Block in the vise — The jaws have closed on its width.");
    });
    document.querySelectorAll("#mkp-stock-metal").forEach(row =>
      row.addEventListener("click", e => {
        const b = e.target.closest("[data-mkpmetal]"); if (!b) return;
        cfg.stock.metal = b.dataset.mkpmetal;
        cfg.stockRec = false;

        const p = Gizmo.findStock && Gizmo.findStock();
        if (p && p.stock) Panel.setMetal(p, cfg.stock.metal);
        else buildStock(true);
        paint();
        toast(((Stock.METALS[cfg.stock.metal] || {}).name || cfg.stock.metal) +
        " blank — The finish on the metal has changed.");
      }));
    const dims = id("mkp-stock-dims");
    if (dims) {
      const takeDim = (i, redraw) => {
        const v = parseFloat(i.value);
        if (!isFinite(v) || v <= 0) { if (redraw) paint(); return; }
        cfg.stock[i.dataset.mkpdim] = clamp(fromDisp(v), 1, 2000);
        cfg.stockRec = false;
        liveStock();
      };
      let typing = null;
      dims.addEventListener("input", e => {
        const i = e.target.closest("[data-mkpdim]"); if (!i) return;
        clearTimeout(typing);
        typing = setTimeout(() => takeDim(i, false), 260);
      });
      dims.addEventListener("change", e => {
        const i = e.target.closest("[data-mkpdim]"); if (!i) return;
        clearTimeout(typing);
        takeDim(i, true);
      });
    }
    const sb = id("mkp-stock-build");
    if (sb) sb.addEventListener("click", () => {

      buildStock(true); buildFixture(); reseat(); paint();
      toast("Fresh blank cut, jaws closed on it, parallels re-cut to suit.");
    });

    const pal = id("mkp-par-align");
    if (pal) pal.addEventListener("click", () => autoParallels(false));

    const tr = id("mkp-tool-rec");
    if (tr) tr.addEventListener("change", () => {
      cfg.toolRec = tr.checked;
      applyTooling(); paintTools();
    });
    const tl = id("mkp-tool-list");
    if (tl) {
      const takeDia = (i, redraw) => {
        const v = parseFloat(i.value);
        if (!isFinite(v) || v <= 0) { if (redraw) paintTools(); return; }
        cfg.tools = cfg.tools || new Map();

        cfg.tools.set(+i.dataset.mkptool, diaFromIn(v));
        applyTooling();
      };
      let typing = null;
      tl.addEventListener("input", e => {
        const i = e.target.closest("[data-mkptool]"); if (!i) return;
        clearTimeout(typing);
        typing = setTimeout(() => takeDia(i, false), 250);
      });
      tl.addEventListener("change", e => {
        const i = e.target.closest("[data-mkptool]"); if (!i) return;
        clearTimeout(typing);
        takeDia(i, true);
      });
    }

    const sl = id("mkp-slide");
    if (sl) sl.addEventListener("click", e => {
      const b = e.target.closest("[data-mkpslide]"); if (!b) return;
      slide(b.dataset.mkpslide);
    });
    const om = id("mkp-origin-modes");
    if (om) om.addEventListener("click", e => {
      const b = e.target.closest("[data-mkporigin]"); if (!b) return;
      cfg.originMode = b.dataset.mkporigin;
      if (Snap.isArmed() && Snap.purpose === "origin") Snap.setMode(cfg.originMode);
      paint();
    });
    const so = id("mkp-set-origin");
    if (so) so.addEventListener("click", armOrigin);

    if (typeof window.loadGCode === "function" && !window.loadGCode.__mkpWrapped) {
      const inner = window.loadGCode;
      const wrapped = function () {
        const r = inner.apply(this, arguments);
        try { if (on) { paintTools(); paintStock(); } } catch (e) {   }
        return r;
      };
      wrapped.__mkpWrapped = true;
      window.loadGCode = wrapped;
    }
    paint();
  }

  function bootDefault() {
    const doc = stored();
    if (!doc) return false;
    try { return restore(doc); }
    catch (e) { console.warn("[MakeProgram] saved setup would not load:", e); forget(); return false; }
  }

  /* Used by the Fixture sidebar category, which works whether or not build
     mode is on. Swapping the vise re-cuts the whole fixture; everything else
     leaves the vise where it stands. */
  function setVise(key) {
    if (!VISES.some(v => v.key === key)) return false;
    cfg.vise = key;
    cfg.useVise = true;
    cfg.useTable = !!(window.PartModels && window.PartModels.bodyOf("table"));
    buildFixture(); reseat(); paint();
    toast((Samples.get(cfg.vise) || {}).name +
      " — Jaws closed on the blank, parallels banked.");
    return true;
  }

  function setParallels(o) {
    if (o.auto != null) cfg.parAuto = !!o.auto;
    if (o.h > 0) { cfg.parH = clamp(o.h, 0.4, 200); cfg.parAuto = false; }
    if (o.t > 0) cfg.parT = clamp(o.t, 0.4, 200);
    return autoParallels(false);
  }

  const state = () => ({
    vise: cfg.vise, vises: VISES.slice(),
    parAuto: cfg.parAuto, parH: cfg.parH, parT: cfg.parT,
    slide: cfg.slide,
  });

  return { bind, paint, paintOrigin, enter, exit, isOn: () => on,
           bootDefault, hasSaved: () => !!stored(), forget,
           setVise, setParallels, autoParallels, slide, state };
})();

window.addEventListener("drop", e => {
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || [])
    .filter(f => Loaders.ACCEPTS.test(f.name));
  if (!files.length) return;
  e.preventDefault(); e.stopPropagation();
  const zone = document.getElementById("app-dropzone");
  if (zone) zone.classList.remove("active");

  if (!document.body.classList.contains("mkp-on")) {
    const head = document.querySelector('.sec-head[data-sec="part-models"]');
    if (head && !head.classList.contains("open")) head.click();
  }
  Panel.intake(files);
}, true);

(function watchUnits() {
  let last = isInch();
  (function tick() {
    requestAnimationFrame(tick);
    const now = isInch();
    if (now !== last) {
      last = now; Store.applyAll(); Panel.refresh();
      if (typeof MakeProgram !== "undefined") MakeProgram.paint();
    }
    Motion.tick();
    Marks.update();
    Store.syncFollowers();

    if (typeof syncWorkFrame === "function") syncWorkFrame();
    History.watch();
    if (typeof RotaryPivot !== "undefined") RotaryPivot.tick();
    if (typeof Gizmo !== "undefined") Gizmo.place();
  })();
})();

function boot() { Panel.bind(); Gizmo.bind(); History.bind(); MakeProgram.bind(); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

window.PartModels = {
  add: (geo, name) => Store.add(geo, name),
  sample: key => { const g = Samples.build(key); return g ? Store.add(g, key) : null; },

  sampleStock: key => Panel.sampleStock(key),

  bootDefault: () => MakeProgram.bootDefault(),
  hasSavedDefault: () => MakeProgram.hasSaved(),
  forgetSavedDefault: () => MakeProgram.forget(),
  all: () => Store.all(),
  clear: () => { Store.clear(); Panel.refresh(); },
  fit: () => Panel.fit(),

  /* World-space box round every visible solid — what Fit View frames. */
  bounds: () => Store.bounds(),


  current: () => Store.current(),
  apply: p => Store.apply(p),
  syncFollowers: () => Store.syncFollowers(),
  zeroWorld: p => Store.zeroWorld(p),

  workOrigin: () => {
    const p = Store.all().find(x => x.stock) || Store.current();
    if (!p) return null;
    return Store.zeroWorld(p);
  },
  setTablePivot: v => Store.setTablePivot(v),

  paintGizmo: () => { if (typeof Gizmo !== "undefined") Gizmo.paint(); },

  fixture: {
    state: () => MakeProgram.state(),
    setVise: k => MakeProgram.setVise(k),
    setParallels: o => MakeProgram.setParallels(o),
    autoParallels: q => MakeProgram.autoParallels(q),
    slide: w => MakeProgram.slide(w),
  },

  gizmoState: () => (typeof Gizmo === "undefined")
    ? { mode: "move", active: false }
    : { mode: Gizmo.mode, active: Gizmo.canTransform },
  setGizmoMode: m => { if (typeof Gizmo !== "undefined") Gizmo.setMode(m); },

  clearSelection: () => { if (typeof Gizmo !== "undefined") Gizmo.clearSelection(); },

  bodyOf: which => {
    const all = Store.all();
    if (which === "stock") return all.find(p => p.stock || p.role === "stock") || null;
    if (which === "vise")  return all.find(p => p.members.some(m => m.name === "Jaw")) || null;
    if (which === "pars")  return all.find(p => p.members.some(m => m.name === "Bar")) || null;
    if (which === "table") return all.find(p => p.role === "machine") || null;
    return null;
  },
  /* Toggling a solid disintegrates it rather than blinking it out. Showing
     puts it back on screen first and reassembles it; hiding runs the front
     across and only drops it from the scene once the last cell has gone. */
  setBodyVisible: (which, on) => {
    const p = window.PartModels.bodyOf(which);
    if (!p) return false;
    const want = !!on;
    if (p.wantVisible === want) return true;
    /* The button lights off the intent, not the mid-dissolve state. */
    p.wantVisible = want;

    /* The sidebar is redrawn once, up front. Touching the DOM while the front
       is crossing is what used to make the animation stutter. */
    if (want) {
      p.visible = true;
      Store.apply(p);
      Panel.refresh();
      Store.Dissolve.run(p, true);
    } else {
      Panel.refresh();
      const done = () => { p.visible = false; Store.apply(p); };
      if (!Store.Dissolve.run(p, false, done)) done();
    }
    return true;
  },

  bodyVisible: which => {
    const p = window.PartModels.bodyOf(which);
    if (!p) return true;
    return (p.wantVisible !== undefined) ? p.wantVisible : !!p.visible;
  },

  /* Tear down anything that isn't a Store part — the cutter, for instance.
     opts.worldDir aims the front; world up makes it come apart bottom to top. */
  dissolveObject: (root, show, done, opts) =>
    Store.Dissolve.runObject(root, show, done, opts),

  /* Graft the dissolve into a material the moment it is made, rather than at
     the moment it is first asked to dissolve. The graft forces a shader
     recompile, and a recompile in the first frame of an animation is a stall
     you can see. The cutter's material is thrown away and remade on every
     seek, so without this every single hide paid for one. */
  attachDissolve: mat => Store.Dissolve.attach(mat),

  /* Glow a body green so you can see which solid a button belongs to.
     `amount` is 0..1 so the caller can breathe it in and out rather than
     blink it. Kept apart from the blue selection tint — it restores whatever
     color the mesh was already wearing. */
  flashBody: (which, amount) => {
    const p = window.PartModels.bodyOf(which);
    if (!p) return false;
    const k = Math.max(0, Math.min(1, +amount || 0));
    const GREEN = new THREE.Color(0x54c98a);
    const GLOW = new THREE.Color(0x11321f);
    const paint = m => {
      if (!m || !m.material) return;
      const mat = m.material;
      if (mat.uniforms && mat.uniforms.uFlash) { mat.uniforms.uFlash.value = k; return; }
      if (!mat.color) return;
      if (m.userData._f0 == null) {
        m.userData._f0 = mat.color.getHex();
        if (mat.emissive) m.userData._fe0 = mat.emissive.getHex();
      }
      if (k <= 0.0005) {
        mat.color.setHex(m.userData._f0);
        if (mat.emissive && m.userData._fe0 != null) mat.emissive.setHex(m.userData._fe0);
        m.userData._f0 = null;
        m.userData._fe0 = null;
        return;
      }
      mat.color.setHex(m.userData._f0).lerp(GREEN, k);
      if (mat.emissive) {
        mat.emissive.setHex(m.userData._fe0 == null ? 0 : m.userData._fe0).lerp(GLOW, k);
      }
    };
    paint(p.mesh);
    p.members.forEach(m => paint(m.mesh));
    return true;
  },

  refreshPanels: () => {
    try { Panel.refresh(); } catch (e) {   }
    try { if (typeof MakeProgram !== "undefined") MakeProgram.paint(); }
    catch (e) {   }
  },

  cutCount: () => {
    let n = 0;
    Store.all().forEach(p => {
      if (p.stock && p.stock.rec && p.stock.rec.cuts) n += p.stock.rec.cuts.length;
    });
    return n;
  },

  setHandlesVisible: v => { if (typeof Gizmo !== "undefined") Gizmo.setHandlesVisible(v); },

  setMarksVisible: v => Marks.setShown(v),

  align: {
    begin: () => Gizmo.alignBegin(),
    take: hit => Gizmo.alignTake(hit),
    cancel: () => Gizmo.alignCancel(),
    get stage() { return Gizmo.alignStage; },
  },

  programAnchor: () => {
    const p = Store.all().find(x => x.stock);
    if (!p || !p.ref) return null;
    p.node.updateMatrixWorld(true);
    const D = Math.PI / 180;
    const qRef = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(p.ref.rot.x * D, p.ref.rot.y * D, p.ref.rot.z * D, "XYZ"));
    const quat = p.node.quaternion.clone().multiply(qRef.invert());
    const now = Store.zeroWorld(p);
    const was = p.refZero || now;

    return { origin: now.clone().sub(was.clone().applyQuaternion(quat)), quat };
  },
};

console.log("[PartModels] ready — import a STEP/STL/OBJ, or drop one on the page.");
})();
