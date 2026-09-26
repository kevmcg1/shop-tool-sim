(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  root.ToolModel = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
"use strict";

const MM_PER_IN = 25.4;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const rad   = d => d * Math.PI / 180;

const DEFAULTS = {
  category:  "endmill",
  endType:   "flat",
  dia:        12,
  shankDia:   12,
  loc:        26,
  oal:        75,
  cornerR:    0,
  flutes:     4,
  helix:      35,
  hand:       1,
  corePct:    0.58,
  pointAngle: 118,
  chamferLen: 1.0,
  coneAngle:  90,
  tipDia:     2,
  pilotDia:   8,
  pilotLen:   10,
  pitch:      1.75,
  threadRows: 1,
  threadSize:"M12x1.75",
  leadStyle:  "plug",
  inserts:    6,
  insertSize: 11,
  leadAngle:  45,
  bodyH:      20,
  boreDia:    22,
  cutW:       8,
  neckDia:    12,
  neckLen:    14,
  dtAngle:    60,
  material:  "carbide",
  coating:   "tialn",
  finish:    "ground",
  coatShank:  false,
};
const PRESETS = {
  endmill:     { dia:12, shankDia:12, loc:26, oal:75, flutes:4, helix:35, corePct:0.58 },
  chamfer:     { dia:12, shankDia:12, oal:70, tipDia:2,   coneAngle:90, flutes:4, helix:20, corePct:0.50 },
  facemill:    { dia:50, bodyH:20, boreDia:22, inserts:6, insertSize:11, leadAngle:45 },
  shellmill:   { dia:50, loc:32, oal:50, boreDia:22, flutes:6, helix:40, corePct:0.62, coatShank:true },
  tslot:       { dia:32, cutW:8, neckDia:12, neckLen:16, shankDia:16, oal:95, flutes:8,  helix:0, corePct:0.50 },
  woodruff:    { dia:25, cutW:4, neckDia:8,  neckLen:12, shankDia:12, oal:75, flutes:10, helix:0, corePct:0.50 },
  dovetail:    { dia:16, loc:5, dtAngle:60, neckDia:9, neckLen:8, shankDia:12, oal:70, flutes:6, helix:0, corePct:0.50 },
  threadmill:  { dia:8, loc:10, oal:70, shankDia:8, flutes:3, helix:0, corePct:0.55, threadRows:1 },
  spotdrill:   { dia:10, shankDia:10, loc:12, oal:60, pointAngle:90,  flutes:2, helix:25, corePct:0.35 },
  drill:       { dia:10, shankDia:10, loc:45, oal:90, pointAngle:118, flutes:2, helix:30, corePct:0.30 },
  reamer:      { dia:12, shankDia:12, loc:30, oal:90, flutes:8, helix:5, corePct:0.86, chamferLen:1.0 },
  counterbore: { dia:16, shankDia:12, loc:22, oal:90, pilotDia:8, pilotLen:10, flutes:4, helix:15, corePct:0.55 },
  countersink: { dia:16, shankDia:10, oal:65, tipDia:2.5, coneAngle:90, flutes:3, helix:0, corePct:0.50 },
  tap:         { helix:0, corePct:0.62, leadStyle:"plug" },
};

const CONE_TOOLS = ["chamfer", "countersink"];
const DISC_TOOLS = ["tslot", "woodruff"];
const COATABLE   = ["endmill", "drill", "tap"];
const DIA_MAX = {
  counterbore:40, chamfer:40, countersink:40, dovetail:40,
  tslot:80, woodruff:80, shellmill:100, facemill:100, threadmill:25,
};
const LEAD_THREADS = { taper:9, plug:4.5, bottom:1.5 };

const isCone     = p => CONE_TOOLS.includes(p.category);
const isDisc     = p => DISC_TOOLS.includes(p.category);
const isThreaded = p => p.category === "tap" || p.category === "threadmill";
const canCoat    = p => COATABLE.includes(p.category);

const coneHeight = p => (p.dia - p.tipDia) / 2 / Math.tan(rad(p.coneAngle / 2));
const toolHeight = p => p.category === "facemill" ? p.bodyH : p.oal;

function validate(p){
  if (p.category === "facemill"){
    p.dia        = clamp(p.dia, 20, 100);
    p.bodyH      = clamp(p.bodyH, 8, 45);
    p.boreDia    = clamp(p.boreDia, 8, p.dia * 0.45);
    p.insertSize = clamp(p.insertSize, 4, p.dia * 0.32);
    p.inserts    = clamp(Math.round(p.inserts), 3, 12);
    return p;
  }
  p.dia      = clamp(p.dia, 1, DIA_MAX[p.category] ?? 25);
  const R    = p.dia / 2;
  p.shankDia = clamp(p.shankDia, 1, 40);
  p.oal      = clamp(p.oal, 10, 300);

  if (p.category === "endmill"){
    if (p.endType === "flat") p.cornerR = 0;
    else if (p.endType === "ball") p.cornerR = R;
    else p.cornerR = clamp(p.cornerR, 0.2, R * 0.9);
    p.loc = clamp(p.loc, Math.max(2, p.cornerR + 1), p.oal - 4);
  } else if (p.category === "drill" || p.category === "spotdrill"){
    const lim = p.category === "spotdrill" ? [60, 150] : [90, 150];
    p.pointAngle = clamp(p.pointAngle, lim[0], lim[1]);
    p.loc = clamp(p.loc, R / Math.tan(rad(p.pointAngle/2)) + 2, p.oal - 4);
  } else if (p.category === "reamer"){
    p.chamferLen = clamp(p.chamferLen, 0.2, Math.min(4, R * 0.8));
    p.loc = clamp(p.loc, p.chamferLen + 2, p.oal - 4);
  } else if (isCone(p)){
    p.coneAngle = clamp(p.coneAngle, 20, 150);
    p.tipDia    = clamp(p.tipDia, 0.3, p.dia * 0.7);
    p.loc       = coneHeight(p);
    p.oal       = clamp(Math.max(p.oal, p.loc + 14), 10, 300);
  } else if (p.category === "counterbore"){
    p.pilotDia = clamp(p.pilotDia, 1, p.dia * 0.85);
    p.pilotLen = clamp(p.pilotLen, 2, 45);
    p.loc      = clamp(p.loc, 3, 140);
    p.oal      = clamp(Math.max(p.oal, p.pilotLen + p.loc + 14), 10, 300);
  } else if (p.category === "tap"){
    p.pitch = clamp(p.pitch, 0.25, 3);
    p.loc   = clamp(p.loc, p.pitch * 4 + 2, p.oal - 8);
  } else if (p.category === "threadmill"){
    p.pitch      = clamp(p.pitch, 0.25, 3);
    p.threadRows = clamp(Math.round(p.threadRows), 1, 8);

    p.loc = clamp(p.loc, p.threadRows * p.pitch + p.pitch, p.oal - 10);
  } else if (p.category === "shellmill"){

    p.oal      = clamp(p.oal, 15, 120);
    p.boreDia  = clamp(p.boreDia, 8, p.dia * 0.5);
    p.loc      = clamp(p.loc, 3, p.oal - 4);
    p.shankDia = p.dia;
  } else if (isDisc(p)){
    p.cutW    = clamp(p.cutW, 1, p.dia * 0.55);
    p.neckDia = clamp(p.neckDia, 2, p.dia * 0.85);
    p.neckLen = clamp(p.neckLen, 1, 90);
    p.loc     = p.cutW;
    p.oal     = clamp(Math.max(p.oal, p.cutW + p.neckLen + 16), 10, 300);
  } else if (p.category === "dovetail"){
    p.dtAngle = clamp(p.dtAngle, 30, 80);
    const t = Math.tan(rad(p.dtAngle));

    const maxDepth = (R - 0.75) * t;
    p.loc = clamp(p.loc, 0.5, Math.max(0.5, maxDepth));

    const coneTopDia = p.dia - 2 * p.loc / t;
    p.neckDia = clamp(p.neckDia, 1, Math.max(1, coneTopDia));
    p.neckLen = clamp(p.neckLen, 1, 90);
    p.oal = clamp(Math.max(p.oal, p.loc + p.neckLen + 16), 10, 300);
  }
  return p;
}

const Builder = (() => {

  const SEG_PER_FLUTE = 26;

  function sectionRadius(u, R, core, landFrac){
    if (u < landFrac) return R;
    const t = (u - landFrac) / (1 - landFrac);
    const dip = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.78)), 0.9);
    return R - (R - core) * dip;
  }
  function cornerScale(z, R, cr){
    if (cr <= 0 || z >= cr) return 1;
    return ((R - cr) + Math.sqrt(Math.max(0, cr*cr - (cr - z)*(cr - z)))) / R;
  }

  function pushRing(pos, P, z, o){
    for (let i = 0; i < P; i++){
      const frac = i / P;
      const a = frac * Math.PI * 2 + (o.rot || 0);
      let radius;
      if (o.mode === "circle"){
        radius = o.r;
      } else if (o.mode === "square"){
        radius = o.r / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      } else {
        const u = (frac * o.flutes) % 1;
        let base = sectionRadius(u, o.R, o.core, o.landFrac) * (o.scale ?? 1);
        if (o.mode === "tap"){

          let tr = o.minor;
          if (o.zHi == null || z <= o.zHi){
            const ph  = (((z / o.pitch) - o.dir * frac) % 1 + 1) % 1;
            tr = o.minor + o.depth * (1 - 2 * Math.abs(ph - 0.5));
          }
          base = Math.min(base, tr * (o.scale ?? 1));
        }
        radius = (o.s != null) ? base + ((o.blendTo ?? o.R) - base) * o.s : base;
      }
      const zi = o.zFn ? o.zFn(i, frac) : z;
      pos.push(Math.cos(a) * radius, Math.sin(a) * radius, zi);
    }
  }
  function stitch(idx, r0, r1, P){
    for (let i = 0; i < P; i++){
      const a = r0*P + i, b = r0*P + (i+1)%P;
      const c = r1*P + i, d = r1*P + (i+1)%P;
      idx.push(a, b, c,  b, d, c);
    }
  }
  function cap(pos, idx, ringStart, P, z, down){
    const center = pos.length / 3;
    pos.push(0, 0, z);
    for (let i = 0; i < P; i++){
      const a = ringStart + i, b = ringStart + (i+1)%P;
      if (down) idx.push(center, b, a); else idx.push(center, a, b);
    }
  }

  function annulus(idx, innerStart, outerStart, P, up){
    for (let i = 0; i < P; i++){
      const a = innerStart + i, b = innerStart + (i+1)%P;
      const c = outerStart + i, d = outerStart + (i+1)%P;
      if (up) idx.push(a, c, d,  a, d, b);
      else    idx.push(a, d, c,  a, b, d);
    }
  }
  function makeGeometry(pos, idx){
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function mergeGeoms(geoms){
    const pos = [], idx = [];
    let off = 0;
    for (const g of geoms){
      const pa = g.attributes.position.array, ia = g.index.array;
      for (let i = 0; i < pa.length; i++) pos.push(pa[i]);
      for (let i = 0; i < ia.length; i++) idx.push(ia[i] + off);
      off += pa.length / 3;
    }
    return makeGeometry(pos, idx);
  }
  function faceRelief(frac, flutes, relief){
    const u = (frac * flutes) % 1;
    return relief * Math.min(1, u / 0.55) ** 1.4;
  }

  function recipe(p){
    const R = p.dia / 2;
    const base = { mode:"flute", core:R*p.corePct, z0:0, len:p.loc, face:"plain" };

    if (p.category === "drill" || p.category === "spotdrill"){
      const tipLen = R / Math.tan(rad(p.pointAngle/2));
      return { ...base, landFrac: p.category === "spotdrill" ? 0.38 : 0.42,
               scaleAt: z => z < tipLen ? Math.max(0.05, z/tipLen) : 1 };
    }
    if (p.category === "reamer"){
      const c = p.chamferLen;
      return { ...base, landFrac:0.30,
               scaleAt: z => z < c ? clamp((R - (c - z)) / R, 0.15, 1) : 1,
               face:"gashed", relief:Math.min(R*0.06, 0.4), dish:R*0.03 };
    }
    if (isCone(p)){
      const tipR = p.tipDia / 2, tan = Math.tan(rad(p.coneAngle/2));
      return { ...base, landFrac: p.category === "countersink" ? 0.30 : 0.20,
               len: coneHeight(p),
               scaleAt: z => clamp((tipR + z*tan) / R, 0.02, 1),
               face:"gashed",
               relief: Math.min(tipR*0.45, R*0.05), dish: tipR*0.25 };
    }
    if (p.category === "counterbore"){
      return { ...base, landFrac:0.22, z0:p.pilotLen,
               scaleAt: () => 1,
               face:"gashed", relief:Math.min(R*0.10, 1.0), dish:0,
               faceInnerR: p.pilotDia/2,
               pilot: { r:p.pilotDia/2, len:p.pilotLen } };
    }
    if (p.category === "tap"){
      const depth = Math.min(0.65 * p.pitch, R * 0.35);
      const minor = R - depth;
      const ch = Math.min(LEAD_THREADS[p.leadStyle] * p.pitch, p.loc * 0.8);
      return { ...base, mode:"tap", landFrac:0.55,
               pitch:p.pitch, minor, depth, dir:p.hand,
               scaleAt: z => z < ch ? lerp(minor/R, 1, z/ch) : 1 };
    }
    if (p.category === "threadmill"){

      const depth = Math.min(0.62 * p.pitch, R * 0.30);
      const minor = R - depth;
      return { ...base, mode:"tap", landFrac:0.45,
               pitch:p.pitch, minor, depth, dir:0,
               zHi: p.threadRows * p.pitch,
               blendTo: minor,
               scaleAt: () => 1,
               face:"gashed", relief:Math.min(R*0.10, 0.6), dish:R*0.06 };
    }
    if (p.category === "shellmill"){

      return { ...base, landFrac:0.16, len:p.loc, runoutMax:3,
               scaleAt: () => 1,
               face:"gashed", relief:Math.min(R*0.10, 1.2), dish:0,
               faceInnerR: p.boreDia/2,
               bore: { r:p.boreDia/2,
                       cbR: clamp(p.boreDia*0.85, p.boreDia/2+2, R*0.7),
                       cbZ: p.oal*0.55 } };
    }
    if (isDisc(p)){

      return { ...base, landFrac:0.28, len:p.cutW,
               scaleAt: () => 1,
               face:"gashed", relief:Math.min(p.cutW*0.16, 0.7), dish:0.12,
               noRunout:true, neck:{ r:p.neckDia/2, len:p.neckLen } };
    }
    if (p.category === "dovetail"){

      const t = Math.tan(rad(p.dtAngle));
      return { ...base, landFrac:0.22, len:p.loc,
               scaleAt: z => clamp((R - z/t) / R, 0.04, 1),
               face:"gashed", relief:Math.min(R*0.10, 0.9), dish:R*0.04,
               noRunout:true, neck:{ r:p.neckDia/2, len:p.neckLen } };
    }
    const cr = p.cornerR;
    return { ...base, landFrac:0.16,
             scaleAt: z => cornerScale(z, R, cr),
             face: p.endType === "ball" ? "plain" : "gashed",
             relief: Math.min(R*0.12, 1.1), dish: R*0.05 };
  }

  function buildPilot(P, r, len){
    const pos = [], idx = [];
    let k = 0;
    const push = (z, rr) => {
      pushRing(pos, P, z, { mode:"circle", r:rr });
      if (k > 0) stitch(idx, k-1, k, P);
      k++;
    };
    push(0, r * 0.84);
    push(Math.min(0.6, len * 0.2), r);
    push(len, r);
    cap(pos, idx, 0, P, 0, true);
    return makeGeometry(pos, idx);
  }

  function buildLofted(p){
    const R   = p.dia / 2;
    const shR = p.shankDia / 2;
    const P   = Math.max(p.flutes * SEG_PER_FLUTE, 72);
    const rc  = recipe(p);
    const z0  = rc.z0, len = rc.len;
    const twist  = p.helix > 0 ? Math.tan(rad(p.helix)) / R * p.hand : 0;
    const runout = Math.min(rc.runoutMax ?? p.dia * 0.55,
                            Math.max(2, p.oal - (z0 + len) - 2));
    const common = {
      mode:rc.mode, R, core:rc.core, flutes:p.flutes, landFrac:rc.landFrac,
      pitch:rc.pitch, minor:rc.minor, depth:rc.depth, dir:rc.dir, zHi:rc.zHi,
    };
    const blendTarget = rc.blendTo ?? (p.category === "tap" ? shR : R);

    const cPos = [], cIdx = [];
    let ring = 0;
    const layers = p.category === "tap"
      ? clamp(Math.round(len / p.pitch * 14), 80, 900)
      : Math.max(72, Math.round(len * 4));

    for (let l = 0; l <= layers; l++){
      const zr = len * l / layers;
      const z  = z0 + zr;
      const o = { ...common, rot:twist*z, scale:rc.scaleAt(zr) };
      if (rc.face === "gashed"){
        const fade = Math.max(rc.relief * 2.2, 1e-6);
        if (zr < fade){
          o.zFn = (i, frac) => Math.max(z,
            z0 + faceRelief(frac, p.flutes, rc.relief) * (1 - zr / fade));
        }
      }
      pushRing(cPos, P, z, o);
      if (l > 0) stitch(cIdx, ring - 1, ring, P);
      ring++;
    }

    if (!rc.noRunout){
      for (let l = 1; l <= 12; l++){
        const t = l/12, s = t*t*(3-2*t), z = z0 + len + runout*t;
        pushRing(cPos, P, z, { ...common, rot:twist*z, scale:rc.scaleAt(len), s, blendTo:blendTarget });
        stitch(cIdx, ring - 1, ring, P);
        ring++;
      }
    }

    if (rc.face === "gashed"){
      const innerStart = cPos.length / 3;
      const hasPilot = rc.faceInnerR != null;
      const innerR = hasPilot ? rc.faceInnerR
                   : Math.max(rc.core * 0.4 * rc.scaleAt(0.01), R * 0.03);
      pushRing(cPos, P, z0, {
        mode:"circle", r:innerR,
        zFn:(i, frac) => hasPilot ? z0
          : z0 + rc.dish * 0.7 + faceRelief(frac, p.flutes, rc.relief) * 0.4
      });
      annulus(cIdx, innerStart, 0, P, false);
      if (!hasPilot) cap(cPos, cIdx, innerStart, P, z0 + rc.dish, true);
    } else {
      cap(cPos, cIdx, 0, P, z0, true);
    }
    let cutter = makeGeometry(cPos, cIdx);
    if (rc.pilot) cutter = mergeGeoms([cutter, buildPilot(P, rc.pilot.r, rc.pilot.len)]);

    const cutterEndZ = z0 + len + (rc.noRunout ? 0 : runout);
    const topR = R * rc.scaleAt(len);
    const sPos = [], sIdx = [];
    let r = 0;
    const ringAt = (z, o) => { pushRing(sPos, P, z, o); return r++; };
    const push   = (z, o) => {
      const i = ringAt(z, o);
      if (i > 0) stitch(sIdx, i-1, i, P);
      return i;
    };
    const circ = radius => ({ mode:"circle", r:radius });

    if (rc.neck){
      const nR = rc.neck.r;

      const iTop = push(cutterEndZ, rc.noRunout
        ? { ...common, rot: twist * cutterEndZ, scale: rc.scaleAt(len) }
        : circ(topR));
      if (topR - nR > 0.02){
        const iNeck = ringAt(cutterEndZ, circ(nR));
        annulus(sIdx, iNeck*P, iTop*P, P, true);
      }
      const neckLen = rc.neck.len ?? clamp((p.oal - cutterEndZ) * 0.5, 3, 90);
      const neckTop = Math.min(cutterEndZ + neckLen, p.oal - 5);
      push(neckTop, circ(nR));
      push(Math.min(neckTop + Math.max(1, Math.abs(shR - nR)), p.oal - 1), circ(shR));
      push(p.oal, circ(shR));
    } else {
      push(cutterEndZ, circ(blendTarget));
      const neckTop = Math.min(cutterEndZ + Math.max(0.4, Math.abs(shR - blendTarget)), p.oal - 1);
      push(neckTop, circ(shR));
      if (p.category === "tap"){
        const sq = shR * 0.72, sqLen = Math.min(shR * 1.7, p.oal * 0.15);
        const zSq = Math.max(neckTop + 0.5, p.oal - sqLen);
        push(zSq,   circ(shR));
        push(zSq,   { mode:"square", r:sq });
        push(p.oal, { mode:"square", r:sq });
      } else {
        push(p.oal, circ(shR));
      }
    }

    if (rc.bore){

      const { r:bR, cbR, cbZ } = rc.bore;
      const iRim   = r - 1;
      const iCbTop = ringAt(p.oal, circ(cbR));
      annulus(sIdx, iCbTop*P, iRim*P, P, true);
      const iCbFlr = ringAt(cbZ, circ(cbR));
      stitch(sIdx, iCbTop, iCbFlr, P);
      const iBoreT = ringAt(cbZ, circ(bR));
      annulus(sIdx, iBoreT*P, iCbFlr*P, P, true);
      const iBoreB = ringAt(0, circ(bR));
      stitch(sIdx, iBoreT, iBoreB, P);
    } else {
      cap(sPos, sIdx, (r-1)*P, P, p.oal, false);
    }
    return { cutter, shank: makeGeometry(sPos, sIdx) };
  }

  function buildFaceMill(p){
    const R = p.dia/2, bR = p.boreDia/2, H = p.bodyH;
    const P = Math.max(p.inserts * 24, 96);
    const cbR = clamp(bR * 1.75, bR + 2, R * 0.72);
    const cbZ = H * 0.5;

    const bPos = [], bIdx = [];
    let r = 0;
    const ringAt = (z, o) => { pushRing(bPos, P, z, o); return r++; };
    const push   = (z, o) => { const i = ringAt(z, o); if (i > 0) stitch(bIdx, i-1, i, P); return i; };

    const G = z => ({ mode:"flute", R, core:R*0.76, flutes:p.inserts,
                      landFrac:0.55, rot: z * 0.02 });

    const iBot = push(0,       G(0));
                 push(H*0.55,  G(H*0.55));
                 push(H*0.93,  G(H*0.93));
    const iRim = push(H,       { mode:"circle", r:R*0.9 });

    const iBoreB = ringAt(0, { mode:"circle", r:bR });
    annulus(bIdx, iBoreB*P, iBot*P, P, false);
    const iCbTop = ringAt(H, { mode:"circle", r:cbR });
    annulus(bIdx, iCbTop*P, iRim*P, P, true);
    const iCbFlr = ringAt(cbZ, { mode:"circle", r:cbR });
    stitch(bIdx, iCbTop, iCbFlr, P);
    const iBoreT = ringAt(cbZ, { mode:"circle", r:bR });
    annulus(bIdx, iBoreT*P, iCbFlr*P, P, true);
    stitch(bIdx, iBoreT, iBoreB, P);
    const body = makeGeometry(bPos, bIdx);

    const S = p.insertSize, T = S * 0.40, g = rad(p.leadAngle);
    const dx = (T/2)*Math.cos(g) + (S/2)*Math.sin(g);
    const dz = (S/2)*Math.cos(g) - (T/2)*Math.sin(g);
    const boxes = [];
    for (let i = 0; i < p.inserts; i++){
      const a = (i / p.inserts) * Math.PI*2 + Math.PI/p.inserts*0.5;
      const geo = new THREE.BoxGeometry(T, S, S);
      geo.applyMatrix4(new THREE.Matrix4().makeRotationZ(a)
        .multiply(new THREE.Matrix4().makeTranslation(R - dx, 0, dz))
        .multiply(new THREE.Matrix4().makeRotationY(-g)));
      boxes.push(geo);
    }
    const inserts = mergeGeoms(boxes);
    boxes.forEach(g2 => g2.dispose());
    return { cutter: inserts, shank: body };
  }

  const build = p => p.category === "facemill" ? buildFaceMill(p) : buildLofted(p);
  return { build };
})();

const TAG = "CT1";

const BUILD = "1";

function paramKeys() {
  return (typeof ToolIO !== "undefined" && ToolIO.PARAM_KEYS)
       ? ToolIO.PARAM_KEYS
       : Object.keys(DEFAULTS);
}

function stock(category) {
  return Object.assign({}, DEFAULTS, PRESETS[category] || {}, { category });
}

function normalize(params) {
  const cat = (params && params.category) || DEFAULTS.category;
  return validate(Object.assign(stock(cat), params, { category: cat }));
}

const round4 = v => Math.round(v * 1e4) / 1e4;
const same = (a, b) => (typeof a === "number" && typeof b === "number")
  ? Math.abs(a - b) < 1e-9
  : a === b;

function toB64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s) {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  const bin = atob(t);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function crc16(str) {
  let c = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    c ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
  }
  return c.toString(16).padStart(4, "0");
}

function encode(params, meta) {
  const o = meta || {};
  const p = normalize(params);
  const ref = stock(p.category);
  const diff = {};
  paramKeys().forEach(k => {
    if (k === "category") return;
    const v = p[k];
    if (v === undefined || v === null) return;
    if (same(v, ref[k])) return;
    diff[k] = (typeof v === "number") ? round4(v) : v;
  });

  const payload = { v: 1, c: p.category, n: Math.max(1, Math.round(o.number || 1)), b: BUILD };

  if (o.name && String(o.name) !== label(p)) payload.m = String(o.name);
  if (Object.keys(diff).length) payload.p = diff;

  const body = toB64url(JSON.stringify(payload));
  return `${TAG}.${body}.${crc16(body)}`;
}

const CODE_RE = new RegExp(TAG + "\\.([A-Za-z0-9_-]+)\\.([0-9a-fA-F]{4})");

const tighten = text => String(text || "").replace(/\s+/g, "");

function isCode(text) {
  return CODE_RE.test(tighten(text));
}

function decode(code) {
  const m = tighten(code).match(CODE_RE);
  if (!m) throw new Error("That isn't a tool model code — it should start with " + TAG + ".");
  const [, body, sum] = m;
  if (crc16(body).toLowerCase() !== sum.toLowerCase())
    throw new Error("This code is damaged — copy the whole line and try again.");

  let payload;
  try { payload = JSON.parse(fromB64url(body)); }
  catch (e) { throw new Error("This code is damaged — copy the whole line and try again."); }

  if (payload.v > 1)
    throw new Error("This code was written by a newer Tool Previewer (v" + payload.v + ").");

  const params = normalize(Object.assign({ category: payload.c }, payload.p || {}));
  const number = Math.max(1, Math.round(payload.n || 1));

  const stale = (payload.b && payload.b !== BUILD) ? String(payload.b) : null;
  if (stale) console.warn(
    `[ToolModel] this code was written by build ${stale}; this page is build ${BUILD}. ` +
    `The shared block differs between your two pages — copy one over the other.`);

  return { params, number, name: payload.m || label(params), code: m[0], staleBuild: stale };
}

function decodeAll(text) {
  const out = [];
  const re = new RegExp(CODE_RE.source, "g");
  let m;
  while ((m = re.exec(String(text || "")))) {
    try { out.push(decode(m[0])); } catch (e) {   }
  }
  return out;
}

function label(params) {
  return (typeof ToolIO !== "undefined" && ToolIO.autoName)
       ? ToolIO.autoName(params)
       : `Ø${round4(params.dia)} ${params.category}`;
}

const DEFAULT_CUTTER = { color: 0xe6e9ec, opacity: 0.92 };
const DEFAULT_SHANK  = { color: 0x8d959d, opacity: 0.92 };

function makeMaterial(spec) {
  const lit = typeof THREE.MeshLambertMaterial === "function";
  const Ctor = lit ? THREE.MeshLambertMaterial : THREE.MeshBasicMaterial;
  const mat = new Ctor({
    color: spec.color,
    transparent: spec.opacity < 1,
    opacity: spec.opacity,

    depthWrite: true,
  });

  mat.userData = Object.assign({}, mat.userData, { toolModelOwned: true });
  return mat;
}

function mesh(params, opts) {
  const o = opts || {};
  if (typeof THREE === "undefined")
    throw new Error("ToolModel.mesh needs THREE — load three.js first.");

  if (typeof params === "string") return meshFromCode(params, opts);

  const p = normalize(params);
  const { cutter, shank } = Builder.build(p);

  const cutterMat = o.cutterMaterial ||
    makeMaterial(Object.assign({}, DEFAULT_CUTTER, o.opacity != null ? { opacity: o.opacity } : {}));
  const shankMat = o.shankMaterial ||
    makeMaterial(Object.assign({}, DEFAULT_SHANK, o.opacity != null ? { opacity: o.opacity } : {}));

  const group = new THREE.Group();
  [[cutter, cutterMat], [shank, shankMat]].forEach(([geo, mat]) => {
    if (o.axis !== "+Z") geo.rotateX(-Math.PI / 2);
    group.add(new THREE.Mesh(geo, mat));
  });

  if (o.scale && o.scale !== 1) group.scale.setScalar(o.scale);
  group.userData.tool = { params: p, label: label(p), height: toolHeight(p), diameter: p.dia };
  return group;
}

function meshFromCode(code, opts) {
  const t = decode(code);
  const g = mesh(t.params, opts);
  g.userData.tool.number = t.number;
  g.userData.tool.label  = t.name;
  return g;
}

function dispose(group) {
  if (!group) return;
  group.traverse(n => {
    if (n.geometry && typeof n.geometry.dispose === "function") n.geometry.dispose();
    const m = n.material;
    if (m && m.userData && m.userData.toolModelOwned && typeof m.dispose === "function") m.dispose();
  });
}

return {
  MM_PER_IN, DEFAULTS, PRESETS, DIA_MAX, LEAD_THREADS,
  CONE_TOOLS, DISC_TOOLS, COATABLE,
  isCone, isDisc, isThreaded, canCoat, coneHeight, toolHeight,
  validate, normalize, stock, Builder,
  encode, decode, decodeAll, isCode, label,
  mesh, meshFromCode, dispose,
};
});
