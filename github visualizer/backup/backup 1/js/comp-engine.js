var PlaybackUI = { refresh: function(){} };
var SpeedPresets = { init: function(){}, setSpeed: function(){} };

window.CutterComp = (function () {
'use strict';

const Geom = (function () {
  const EPS = 1e-9;

  function len(v)         { return Math.hypot(v.x, v.y); }
  function sub(a, b)      { return { x: a.x - b.x, y: a.y - b.y }; }
  function add(a, b)      { return { x: a.x + b.x, y: a.y + b.y }; }
  function scale(v, s)    { return { x: v.x * s, y: v.y * s }; }
  function dist(a, b)     { return Math.hypot(a.x - b.x, a.y - b.y); }
  function approxEq(a, b, eps) {
    eps = eps || 1e-6;
    return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
  }

  function normalize(v) {
    const L = Math.hypot(v.x, v.y);
    return L > 1e-12 ? { x: v.x / L, y: v.y / L } : { x: 0, y: 0 };
  }

  function leftNormal(dx, dy) { return { x: -dy, y: dx }; }

  function getArcCenter(start, end, iVal, jVal, rVal, dir) {
    if (iVal !== undefined && jVal !== undefined) {
      return { x: start.x + iVal, y: start.y + jVal };
    }
    if (rVal !== undefined) {
      const dx = end.x - start.x, dy = end.y - start.y;
      const chord = Math.hypot(dx, dy);
      if (chord < 1e-12) return null;
      const R = Math.abs(rVal);
      const halfChord = chord / 2;
      if (R < halfChord - 1e-9) return null;
      const h = Math.sqrt(Math.max(0, R * R - halfChord * halfChord));
      const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
      const px = -dy / chord, py = dx / chord;

      const largeArc = rVal < 0;
      const baseSign = (dir === 1) ? -1 : 1;
      const sign     = largeArc ? -baseSign : baseSign;
      return { x: mx + sign * h * px, y: my + sign * h * py };
    }
    return null;
  }

  function arcTangentAt(pt, center, arcDir) {
    const rx = pt.x - center.x;
    const ry = pt.y - center.y;
    const L  = Math.hypot(rx, ry);
    if (L < 1e-12) return { x: 1, y: 0 };
    if (arcDir === -1) return { x: -ry / L, y:  rx / L };
              return { x:  ry / L, y: -rx / L };
  }

  function offsetArcRadius(origRadius, toolRadius, side, arcDir) {
    return origRadius + (side * arcDir) * toolRadius;
  }

  function offsetArcPoint(pt, origCenter, offsetCenter, offsetR) {
    const rx = pt.x - origCenter.x;
    const ry = pt.y - origCenter.y;
    const L  = Math.hypot(rx, ry);
    if (L < 1e-12) return { x: offsetCenter.x + offsetR, y: offsetCenter.y };
    return {
      x: offsetCenter.x + (rx / L) * offsetR,
      y: offsetCenter.y + (ry / L) * offsetR
    };
  }

  function lineOffsetNormal(from, to, side) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const L  = Math.hypot(dx, dy);
    if (L < 1e-12) return { x: 0, y: 0 };
    const ln = leftNormal(dx / L, dy / L);
    return side === 1 ? ln : { x: -ln.x, y: -ln.y };
  }

  function lineLineIntersect(P, d, Q, e) {
    const cross = d.x * e.y - d.y * e.x;
    if (Math.abs(cross) < 1e-12) return null;
    const dx = Q.x - P.x, dy = Q.y - P.y;
    const t  = (dx * e.y - dy * e.x) / cross;
    return { x: P.x + t * d.x, y: P.y + t * d.y };
  }

  function circleLineIntersect(C, R, P, d, hint) {
    const fx = P.x - C.x, fy = P.y - C.y;
    const a  = d.x * d.x + d.y * d.y;
    const b  = 2 * (fx * d.x + fy * d.y);
    const c  = fx * fx + fy * fy - R * R;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t1 = (-b + sq) / (2 * a);
    const t2 = (-b - sq) / (2 * a);
    const p1 = { x: P.x + t1 * d.x, y: P.y + t1 * d.y };
    const p2 = { x: P.x + t2 * d.x, y: P.y + t2 * d.y };
    if (!hint) return p1;
    return dist(p1, hint) <= dist(p2, hint) ? p1 : p2;
  }

  function circleCircleIntersect(C1, R1, C2, R2, hint) {
    const dx = C2.x - C1.x, dy = C2.y - C1.y;
    const D = Math.hypot(dx, dy);
    if (D < 1e-12 || D > R1 + R2 + 1e-9 || D < Math.abs(R1 - R2) - 1e-9) return null;
    const a  = (R1 * R1 - R2 * R2 + D * D) / (2 * D);
    const h2 = R1 * R1 - a * a;
    if (h2 < 0) return null;
    const h  = Math.sqrt(h2);
    const mx = C1.x + a * dx / D, my = C1.y + a * dy / D;
    const px = dy / D, py = -dx / D;
    const p1 = { x: mx + h * px, y: my + h * py };
    const p2 = { x: mx - h * px, y: my - h * py };
    return dist(p1, hint) <= dist(p2, hint) ? p1 : p2;
  }

  return {
    EPS, len, sub, add, scale, dist, approxEq, normalize, leftNormal,
    getArcCenter, arcTangentAt, offsetArcRadius, offsetArcPoint,
    lineOffsetNormal, lineLineIntersect, circleLineIntersect, circleCircleIntersect
  };
})();

function makeWarn() {
  const list = [];
  function push(severity, msg, lineIndex) {
    list.push({ severity, msg, lineIndex: (lineIndex == null ? null : lineIndex) });
  }
  return {
    list,
    info: (msg, li) => push('info', msg, li),
    warn: (msg, li) => push('warn', msg, li),
    err:  (msg, li) => push('err',  msg, li),
  };
}

const Parser = (function () {

  function num(re, line) {
    const m = line.match(re);
    return m ? parseFloat(m[1]) : undefined;
  }

  function parseLine(rawLine, lineIndex) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('%')) {
      return { lineIndex, raw: rawLine, blank: true };
    }

    const code = line
      .replace(/\(.*?\)/g, ' ')
      .replace(/;.*/, '')
      .toUpperCase();

    const gMatches = code.match(/G\d+/g) || [];
    const gcodes = new Set(gMatches.map(g => parseInt(g.slice(1), 10)));

    const x = num(/X([+-]?\d*\.?\d+)/, code);
    const y = num(/Y([+-]?\d*\.?\d+)/, code);
    const z = num(/Z([+-]?\d*\.?\d+)/, code);
    const i = num(/I([+-]?\d*\.?\d+)/, code);
    const j = num(/J([+-]?\d*\.?\d+)/, code);
    const k = num(/K([+-]?\d*\.?\d+)/, code);
    const q = num(/Q([+-]?\d*\.?\d+)/, code);
    const r = num(/R([+-]?\d*\.?\d+)/, code);
    const f = num(/F([+-]?\d*\.?\d+)/, code);
    const d = num(/D(\d+)/, code);
    const l = num(/L(\d+)/, code);

    let comp = null;
    if (gcodes.has(41)) comp = 'on41';
    if (gcodes.has(42)) comp = 'on42';
    if (gcodes.has(40)) comp = 'off';

    let motionMode = null;
    if (gcodes.has(0)) motionMode = 0;
    if (gcodes.has(1)) motionMode = 1;
    if (gcodes.has(2)) motionMode = 2;
    if (gcodes.has(3)) motionMode = 3;

    let pocket = null;
    if (gcodes.has(12)) pocket = 'cw';
    if (gcodes.has(13)) pocket = 'ccw';

    return {
      lineIndex, raw: rawLine, blank: false,
      gcodes, x, y, z, i, j, k, q, r, f, d, l, comp, motionMode, pocket,
      hasXY: (x !== undefined) || (y !== undefined),
    };
  }

  function parseAll(text) {
    const lines = text.split(/\r?\n/);
    const instrs = [];
    for (let i = 0; i < lines.length; i++) {
      instrs.push(parseLine(lines[i], i));
    }
    return { lines, instrs };
  }

  return { parseAll, parseLine };
})();

const Pocket = (function () {

  function planRadii(I, K, Q) {
    if (K === undefined || K === null) return [I];
    if (Q === undefined || Q === null || Q <= 0) return [K];
    const radii = [];
    let r = I;

    while (r < K - 1e-9) { radii.push(r); r += Q; }
    radii.push(K);
    return radii;
  }

  function validate(I, K, Q, toolR, lineIndex) {
    const errs = [];
    if (I === undefined || I === null) {
      errs.push('G12/G13 missing required I parameter (first-cut radius)');
    } else if (I <= toolR) {
      errs.push(
        `G12/G13: I (${I.toFixed(4)}) must be greater than tool radius `
        + `(${toolR.toFixed(4)}) — tool would not engage material`
      );
    }
    if (K !== undefined && K !== null) {
      if (K <= 0) errs.push(`G12/G13: K (${K.toFixed(4)}) must be positive`);
      if (I !== undefined && K < I) {
        errs.push(`G12/G13: K (${K.toFixed(4)}) must be ≥ I (${I.toFixed(4)})`);
      }
      if (Q === undefined || Q === null) {
        errs.push('G12/G13: Q (radial stepover) is required when K is specified');
      } else if (Q <= 0) {
        errs.push(`G12/G13: Q (${Q.toFixed(4)}) must be positive`);
      }
    }
    return { ok: errs.length === 0, errors: errs };
  }

  function expand(cx, cy, curZ, pocketDir, ins, toolR, warn) {
    const fmt = v => v.toFixed(4);
    const lines = [];

    const I = ins.i, K = ins.k, Q = ins.q, Z = ins.z;
    const F = ins.f;
    const L = (ins.l !== undefined && ins.l > 0) ? Math.floor(ins.l) : 1;
    const feedTok = (F !== undefined) ? `F${F.toFixed(1)}` : '';

    const { ok, errors } = validate(I, K, Q, toolR, ins.lineIndex);
    if (!ok) {
      for (const e of errors) warn.err(e, ins.lineIndex);
      return { lines: [], endX: cx, endY: cy, endZ: curZ };
    }

    const radii = planRadii(I, K, Q);
    if (radii.length === 0) {
      warn.warn('G12/G13: no cut radii planned (check I/K/Q)', ins.lineIndex);
      return { lines: [], endX: cx, endY: cy, endZ: curZ };
    }

    for (const r of radii) {
      if (r <= toolR) {
        warn.err(
          `G12/G13 gouge: cut radius (${r.toFixed(4)}) ≤ tool radius `
          + `(${toolR.toFixed(4)}) — pocket smaller than tool`,
          ins.lineIndex
        );
        return { lines: [], endX: cx, endY: cy, endZ: curZ };
      }
    }

    if (radii.length > 1) {
      warn.info(
        `G12/G13: expanded into ${radii.length} pass${radii.length>1?'es':''} `
        + `(I=${I.toFixed(4)} → K=${K.toFixed(4)}, Q=${Q.toFixed(4)})`,
        ins.lineIndex
      );
    }

    if (L > 1) {
      warn.info(
        `G12/G13: L=${L} loop count — repeating the cycle ${L} times at the `
        + `same Z (G91 incremental Z stepping not modeled)`,
        ins.lineIndex
      );
    }

    let lastZ = curZ;
    for (let loop = 0; loop < L; loop++) {

      if (Z !== undefined) {
        if (Z !== lastZ) {
          lines.push(`G01 Z${fmt(Z)} ${feedTok}`.trim());
          lastZ = Z;
        }
      }

      let prevCompR = 0;
      let lastCompR = 0;

      for (let p = 0; p < radii.length; p++) {
        const cutR  = radii[p];
        const compR = cutR - toolR;

        const ringX = cx + pocketDir * compR;
        const ringY = cy;

        const stepFromX = cx + pocketDir * prevCompR;
        const stepFromY = cy;
        if (Math.abs(ringX - stepFromX) > 1e-9 || Math.abs(ringY - stepFromY) > 1e-9) {
          lines.push(`G01 X${fmt(ringX)} Y${fmt(ringY)} ${feedTok}`.trim());
        }

        const arcCode = (pocketDir === 1) ? 'G02' : 'G03';
        const fullI = cx - ringX;
        const fullJ = cy - ringY;
        lines.push(
          `${arcCode} X${fmt(ringX)} Y${fmt(ringY)} `
          + `I${fmt(fullI)} J${fmt(fullJ)} ${feedTok}`.trim()
        );

        prevCompR = compR;
        lastCompR = compR;
      }

      if (lastCompR > 1e-9) {
        lines.push(`G01 X${fmt(cx)} Y${fmt(cy)} ${feedTok}`.trim());
      }
    }

    return { lines, endX: cx, endY: cy, endZ: lastZ };
  }

  return { expand, planRadii, validate };
})();

const Comp = (function () {

  function collectWindows(instrs, warn) {
    const windows = [];
    let cx = 0, cy = 0;
    let motionMode = 0;
    let modalFeed = null;
    let side = 0;
    let cur = null;

    function buildVert(ins, idx, prevX, prevY, newX, newY) {
      const vert = {
        prevX, prevY, x: newX, y: newY,
        motionMode,
        isArc: motionMode === 2 || motionMode === 3,
        arcDir: motionMode === 2 ? 1 : (motionMode === 3 ? -1 : 0),
        i: ins.i, j: ins.j, r: ins.r,
        feed: ins.f !== undefined ? ins.f : modalFeed,
        side: side,
        lineIndex: idx,
        isEntry: false,
        isExit:  false,
      };
      if (vert.isArc) {
        vert.center = Geom.getArcCenter(
          { x: prevX, y: prevY }, { x: newX, y: newY },
          vert.i, vert.j, vert.r, vert.arcDir
        );
        if (vert.center) {
          vert.arcRadius = Geom.dist(vert.center, { x: prevX, y: prevY });
          const endR = Geom.dist(vert.center, { x: newX, y: newY });
          if (Math.abs(endR - vert.arcRadius) > 1e-3) {
            warn.warn(
              `Arc has inconsistent radii (start=${vert.arcRadius.toFixed(4)}, `
              + `end=${endR.toFixed(4)}) — geometry may be wrong`,
              idx
            );
          }
        } else {
          warn.err('Arc center could not be resolved (missing I/J/R or impossible R)', idx);
          vert.arcRadius = 0;
        }
      }
      return vert;
    }

    for (let idx = 0; idx < instrs.length; idx++) {
      const ins = instrs[idx];
      if (ins.blank) continue;

      if (ins.motionMode !== null) motionMode = ins.motionMode;
      if (ins.f !== undefined)     modalFeed  = ins.f;

      const newX = (ins.x !== undefined) ? ins.x : cx;
      const newY = (ins.y !== undefined) ? ins.y : cy;
      const isMotion = ins.hasXY || (motionMode >= 1 && motionMode <= 3 && ins.f !== undefined);
      const isCutting = isMotion && motionMode >= 1 && motionMode <= 3;

      if (ins.comp === 'on41' || ins.comp === 'on42') {
        const newSide = (ins.comp === 'on41') ? 1 : -1;
        if (side !== 0) {
          warn.warn(
            `${ins.comp === 'on41' ? 'G41' : 'G42'} commanded while compensation is already active — `
            + `closing previous window and starting a new one`,
            idx
          );
          if (cur) {
            cur.endIndex = idx;
            windows.push(cur);
          }
        }
        cur = {
          startIndex: idx,
          side: newSide,
          dNumber: ins.d,
          uncompStartX: cx, uncompStartY: cy,
          uncompEndX: 0, uncompEndY: 0,
          verts: [],
          endIndex: -1,
        };
        side = newSide;

        if (isCutting) {
          const v = buildVert(ins, idx, cx, cy, newX, newY);
          v.isEntry = true;
          cur.verts.push(v);
        }
        cx = newX; cy = newY;
        continue;
      }

      if (ins.comp === 'off') {
        if (side === 0) {
          warn.warn('G40 issued without active G41/G42 — ignored', idx);
        } else if (cur) {
          cur.endIndex = idx;

          if (isCutting) {
            const v = buildVert(ins, idx, cx, cy, newX, newY);
            v.isExit = true;
            cur.verts.push(v);
          }
          cur.uncompEndX = newX;
          cur.uncompEndY = newY;
          windows.push(cur);
          cur = null;
        }
        side = 0;
        cx = newX; cy = newY;
        continue;
      }

      if (side !== 0 && cur && isCutting) {
        cur.verts.push(buildVert(ins, idx, cx, cy, newX, newY));
      }

      cx = newX; cy = newY;
    }

    if (cur) {
      warn.warn('Compensation window opened with G41/G42 but never closed with G40', cur.startIndex);
      cur.endIndex = instrs.length;
      cur.uncompEndX = cx;
      cur.uncompEndY = cy;
      windows.push(cur);
    }

    return windows;
  }

  function buildSegments(verts, toolRadius, warn) {
    const segs = [];
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      const s = { v };

      if (v.isArc && v.center) {
        s.offCenter = v.center;
        s.offRadius = Geom.offsetArcRadius(v.arcRadius, toolRadius, v.side, v.arcDir);

        if (s.offRadius <= 1e-9) {
          warn.err(
            `Arc gouge: tool radius (${toolRadius.toFixed(4)}) ≥ arc radius `
            + `(${v.arcRadius.toFixed(4)}) on inside curve — geometry will collapse`,
            v.lineIndex
          );

          s.offRadius = Math.max(s.offRadius, 1e-6);
        }

        s.offStart = Geom.offsetArcPoint(
          { x: v.prevX, y: v.prevY }, v.center, s.offCenter, s.offRadius
        );
        s.offEnd   = Geom.offsetArcPoint(
          { x: v.x, y: v.y }, v.center, s.offCenter, s.offRadius
        );
      } else {
        const norm = Geom.lineOffsetNormal(
          { x: v.prevX, y: v.prevY }, { x: v.x, y: v.y }, v.side
        );
        s.norm     = norm;
        s.offStart = { x: v.prevX + toolRadius * norm.x, y: v.prevY + toolRadius * norm.y };
        s.offEnd   = { x: v.x     + toolRadius * norm.x, y: v.y     + toolRadius * norm.y };

        const dx = v.x - v.prevX, dy = v.y - v.prevY;
        const L  = Math.hypot(dx, dy);
        s.lineDir = L > 1e-12 ? { x: dx / L, y: dy / L } : { x: 1, y: 0 };
        s.length  = L;

        if (L < 1e-9) {
          warn.info(`Zero-length cutting move skipped`, v.lineIndex);
        }
      }

      segs.push(s);
    }
    return segs;
  }

  function computeJoints(segs, closed, warn) {
    const n = segs.length;
    const numJoints = closed ? n : n - 1;
    const joints = [];

    function jointBetween(si, sj) {
      const vi = si.v, vj = sj.v;
      const vtx = { x: vi.x, y: vi.y };

      const tEnd = (vi.isArc && vi.center)
        ? Geom.arcTangentAt({ x: vi.x, y: vi.y }, vi.center, vi.arcDir)
        : si.lineDir;

      const tStart = (vj.isArc && vj.center)
        ? Geom.arcTangentAt({ x: vj.prevX, y: vj.prevY }, vj.center, vj.arcDir)
        : sj.lineDir;

      const cross = tEnd.x * tStart.y - tEnd.y * tStart.x;
      const isOutside = (vi.side * cross) < -1e-9;

      if (isOutside) {
        return { type: 'fillet', inPt: si.offEnd, outPt: sj.offStart, center: vtx };
      }

      const siArc = vi.isArc && vi.center;
      const sjArc = vj.isArc && vj.center;
      let meet;

      if (!siArc && !sjArc) {
        meet = Geom.lineLineIntersect(si.offStart, si.lineDir, sj.offStart, sj.lineDir)
             || si.offEnd;
      } else if (!siArc && sjArc) {
        meet = Geom.circleLineIntersect(sj.offCenter, sj.offRadius, si.offStart, si.lineDir, vtx)
             || sj.offStart;
      } else if (siArc && !sjArc) {
        meet = Geom.circleLineIntersect(si.offCenter, si.offRadius, sj.offStart, sj.lineDir, vtx)
             || si.offEnd;
      } else {
        meet = Geom.circleCircleIntersect(si.offCenter, si.offRadius, sj.offCenter, sj.offRadius, vtx)
             || si.offEnd;
      }

      return { type: 'meet', pt: meet };
    }

    for (let i = 0; i < numJoints; i++) {
      joints.push(jointBetween(segs[i], segs[(i + 1) % n]));
    }
    return joints;
  }

  function emitWindow(win, segs, joints, closed, toolRadius, warn) {
    const out = [];

    const origLines = [];
    const fmt = v => v.toFixed(4);
    const n   = segs.length;

    if (n === 0) {
      warn.warn('Compensation window has no cutting moves — nothing to compensate', win.startIndex);
      return { lines: out, origLines };
    }

    let feedTok = 'F10.0';
    for (const s of segs) {
      if (s.v.feed !== undefined && s.v.feed !== null) {
        feedTok = 'F' + s.v.feed.toFixed(1);
        break;
      }
    }

    const uncompStart = { x: win.uncompStartX, y: win.uncompStartY };
    const uncompEnd   = { x: win.uncompEndX,   y: win.uncompEndY   };

    for (let i = 0; i < n; i++) {
      const si = segs[i];
      const vi = si.v;
      const isFirst = (i === 0);
      const isLast  = (i === n - 1);

      let fromPt;
      if (isFirst) {
        fromPt = uncompStart;
      } else {
        const jPrev = joints[i - 1];
        fromPt = jPrev.type === 'fillet' ? jPrev.outPt : jPrev.pt;
      }

      let toPt;
      if (isLast && vi.isExit) {
        toPt = uncompEnd;
      } else if (isLast) {
        toPt = si.offEnd;
      } else {
        const jEnd = joints[i];
        toPt = jEnd.type === 'fillet' ? jEnd.inPt : jEnd.pt;
      }

      if (vi.isArc && vi.center) {
        const I = fmt(si.offCenter.x - fromPt.x);
        const J = fmt(si.offCenter.y - fromPt.y);
        const code = vi.arcDir === 1 ? 'G02' : 'G03';
        out.push(`${code} X${fmt(toPt.x)} Y${fmt(toPt.y)} I${I} J${J} ${feedTok}`);
        origLines.push(vi.lineIndex);
      } else {
        out.push(`G01 X${fmt(toPt.x)} Y${fmt(toPt.y)} ${feedTok}`);
        origLines.push(vi.lineIndex);
      }

      if (!isLast) {
        const j = joints[i];
        if (j.type === 'fillet') {
          const { inPt, outPt, center } = j;
          const v1 = { x: inPt.x  - center.x, y: inPt.y  - center.y };
          const v2 = { x: outPt.x - center.x, y: outPt.y - center.y };
          const arcCross = v1.x * v2.y - v1.y * v2.x;
          const code = arcCross > 0 ? 'G03' : 'G02';
          out.push(
            `${code} X${fmt(outPt.x)} Y${fmt(outPt.y)} `
            + `I${fmt(center.x - inPt.x)} J${fmt(center.y - inPt.y)} ${feedTok}`
          );
          origLines.push(vi.lineIndex);
        }
      }
    }

    if (segs[0].v.isEntry) {
      const inLen = Geom.dist(uncompStart, { x: segs[0].v.x, y: segs[0].v.y });
      if (inLen < toolRadius - 1e-6) {
        warn.warn(
          `Entry move length (${inLen.toFixed(4)}) is shorter than tool radius `
          + `(${toolRadius.toFixed(4)}) — Haas best practice is entry ≥ tool radius`,
          segs[0].v.lineIndex
        );
      }
    }
    if (segs[n - 1].v.isExit) {
      const outLen = Geom.dist(
        { x: segs[n - 1].v.prevX, y: segs[n - 1].v.prevY },
        uncompEnd
      );
      if (outLen < toolRadius - 1e-6) {
        warn.warn(
          `Exit move length (${outLen.toFixed(4)}) is shorter than tool radius `
          + `(${toolRadius.toFixed(4)}) — risk of tool mark on exit`,
          segs[n - 1].v.lineIndex
        );
      }
    } else {
      warn.info('No motion on G40 line — exiting at current offset position', win.endIndex);
    }

    return { lines: out, origLines };
  }

  function isClosedContour(win) {
    return Math.abs(win.uncompStartX - win.uncompEndX) < 1e-6 &&
           Math.abs(win.uncompStartY - win.uncompEndY) < 1e-6;
  }

  function signedArea(points) {
    let a = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      a += (p.x * q.y - q.x * p.y);
    }
    return a / 2;
  }

  function compensateWindow(win, toolRadius, warn) {
    if (win.verts.length === 0) {
      warn.warn('Compensation window contains no cutting moves', win.startIndex);
      return { lines: [], origLines: [] };
    }
    const closed = isClosedContour(win);
    if (!closed) warn.info('Open contour: G41/G42 entry start ≠ G40 exit end', win.startIndex);

    const segs   = buildSegments(win.verts, toolRadius, warn);

    const joints = computeJoints(segs, false, warn);

    if (closed && segs.length >= 3) {
      const origPts   = win.verts.map(v => ({ x: v.x, y: v.y }));
      const offsetPts = [];
      for (let i = 0; i < segs.length; i++) {
        const isLast = (i === segs.length - 1);
        const start  = (i === 0) ? segs[0].offStart
                                 : (joints[i-1].type === 'fillet' ? joints[i-1].outPt : joints[i-1].pt);
        offsetPts.push(start);
        if (isLast) offsetPts.push(segs[i].offEnd);
      }
      const origA   = signedArea(origPts);
      const offsetA = signedArea(offsetPts);
      if (Math.abs(origA) > 1e-6 && Math.abs(offsetA) > 1e-9
          && Math.sign(origA) !== Math.sign(offsetA)) {
        warn.err(
          'Tool-too-large gouge: offset contour winds opposite to programmed contour. '
          + 'The tool radius exceeds the feature size — entire offset path is inverted.',
          win.startIndex
        );
      }
    }

    return emitWindow(win, segs, joints, closed, toolRadius, warn);
  }

  function collectPockets(instrs, defaultToolRadius, resolveRadius, warn) {
    const pockets = [];
    let cx = 0, cy = 0, cz = 0;

    for (let idx = 0; idx < instrs.length; idx++) {
      const ins = instrs[idx];
      if (ins.blank) continue;

      if (ins.pocket) {
        const pocketDir = (ins.pocket === 'cw') ? 1 : -1;

        const resolved = resolveRadius
          ? resolveRadius(ins)
          : { radius: defaultToolRadius, source: 'default-no-d', dNumber: null };
        const pocketRadius = resolved.radius;

        if (resolved.source === 'd-table') {
          const dStr = String(resolved.dNumber).padStart(2, '0');
          warn.info(
            `G12/G13: tool radius ${pocketRadius.toFixed(4)} from D${dStr} (D-table)`,
            ins.lineIndex
          );
        } else if (resolved.source === 'default-fallback') {
          const dStr = String(resolved.dNumber).padStart(2, '0');
          warn.warn(
            `G12/G13: D${dStr} has no D-table entry — using default tool `
            + `radius ${pocketRadius.toFixed(4)} from Ø input`,
            ins.lineIndex
          );
        }

        const result = Pocket.expand(cx, cy, cz, pocketDir, ins, pocketRadius, warn);
        pockets.push({
          startIndex: ins.lineIndex,
          endIndex:   ins.lineIndex,
          lines:      result.lines,
        });

        cz = result.endZ;
        continue;
      }

      if (ins.x !== undefined) cx = ins.x;
      if (ins.y !== undefined) cy = ins.y;
      if (ins.z !== undefined) cz = ins.z;
    }

    return pockets;
  }

  function spliceReplacements(rawLines, replacements) {
    const sorted = replacements.slice().sort((a, b) => a.startIndex - b.startIndex);
    const out = [];
    const compToOrig = [];
    let i = 0;
    let r = 0;
    while (i < rawLines.length) {
      if (r < sorted.length && i === sorted[r].startIndex) {
        const rep = sorted[r];

        const fallback = (rep.origLineIdx != null) ? rep.origLineIdx : rep.startIndex;
        const perLine  = Array.isArray(rep.origLines) ? rep.origLines : null;
        for (let k = 0; k < rep.lines.length; k++) {
          out.push(rep.lines[k]);
          const tag = (perLine && perLine[k] != null) ? perLine[k] : fallback;
          compToOrig.push(tag);
        }
        i = rep.endIndex + 1;
        r++;
      } else {
        out.push(rawLines[i]);
        compToOrig.push(i);
        i++;
      }
    }
    return { merged: out, compToOrig };
  }

  function identityMap(gcode) {
    const n = gcode.split('\n').length;
    const m = new Array(n);
    for (let i = 0; i < n; i++) m[i] = i;
    return m;
  }

  function applyToolCompensation(gcode, toolRadius, dRadiusLookup) {
    const warn = makeWarn();

    function resolveRadius(ins) {
      if (ins && ins.d !== undefined) {
        if (typeof dRadiusLookup === 'function') {
          const r = dRadiusLookup(ins.d);
          if (r != null && isFinite(r) && r >= 0) {
            return { radius: r, source: 'd-table', dNumber: ins.d };
          }
        }
        return { radius: toolRadius, source: 'default-fallback', dNumber: ins.d };
      }
      return { radius: toolRadius, source: 'default-no-d', dNumber: null };
    }

    if (typeof gcode !== 'string' || gcode.length === 0) {
      warn.err('Empty G-code input');
      const g = gcode || '';
      return {
        gcode: g, warnings: warn.list,
        hadCompensation: false, windowCount: 0, pocketCount: 0,
        compToOrig: identityMap(g),
      };
    }
    if (!isFinite(toolRadius) || toolRadius <= 0) {
      warn.err(`Tool radius (${toolRadius}) is invalid — compensation skipped`);
      return {
        gcode: gcode, warnings: warn.list,
        hadCompensation: false, windowCount: 0, pocketCount: 0,
        compToOrig: identityMap(gcode),
      };
    }

    const { lines, instrs } = Parser.parseAll(gcode);

    {
      let compActive = false;
      for (const ins of instrs) {
        if (ins.blank || !ins.gcodes) continue;
        const has = (n) => ins.gcodes.has(n);

        if (has(41) || has(42)) compActive = true;
        if (compActive && has(40) && has(0)) {
          warn.err('G40 detected in a G00 move', ins.lineIndex);
          return {
            gcode: '', warnings: warn.list,
            hadCompensation: false, windowCount: 0, pocketCount: 0,
            compToOrig: [],
          };
        }

        if (has(40)) compActive = false;
      }
    }

    const windows = collectWindows(instrs, warn);
    const pockets = collectPockets(instrs, toolRadius, resolveRadius, warn);

    if (windows.length === 0 && pockets.length === 0) {
      warn.info('No G41/G42 or G12/G13 in program — output is identical to input');
      return {
        gcode: gcode, warnings: warn.list,
        hadCompensation: false, windowCount: 0, pocketCount: 0,
        compToOrig: identityMap(gcode),
      };
    }

    const perWin = windows.map(win => {
      const winRadius = (win.dNumber !== undefined && typeof dRadiusLookup === 'function')
        ? (() => {
            const r = dRadiusLookup(win.dNumber);
            return (r != null && isFinite(r) && r >= 0) ? r : toolRadius;
          })()
        : toolRadius;

      if (winRadius === 0) {
        warn.info(
          `G41/G42 window using D${String(win.dNumber).padStart(2,'0')} → radius 0 `
          + `(no compensation applied)`,
          win.startIndex
        );

        const rawLines  = [];
        const rawOrigs  = [];
        for (let li = win.startIndex; li <= win.endIndex; li++) {
          rawLines.push(lines[li]);
          rawOrigs.push(li);
        }
        return { lines: rawLines, origLines: rawOrigs };
      }
      return compensateWindow(win, winRadius, warn);
    });

    const replacements = [];
    for (let i = 0; i < windows.length; i++) {

      replacements.push({
        startIndex: windows[i].startIndex,
        endIndex:   windows[i].endIndex,
        lines:      perWin[i].lines,
        origLines:  perWin[i].origLines,
        origLineIdx: windows[i].startIndex,
      });
    }
    for (const p of pockets) {

      replacements.push({
        startIndex: p.startIndex,
        endIndex:   p.endIndex,
        lines:      p.lines,
        origLineIdx: p.startIndex,
      });
    }

    const { merged, compToOrig } = spliceReplacements(lines, replacements);
    return {
      gcode: merged.join('\n'),
      warnings: warn.list,
      hadCompensation: true,
      windowCount: windows.length,
      pocketCount: pockets.length,
      compToOrig,
    };
  }

  return { applyToolCompensation };
})();

return { applyToolCompensation: Comp.applyToolCompensation };
})();

const mainCanvas     = document.getElementById('main-canvas');
const cubeCanvas     = document.getElementById('cube-canvas');
const viewport       = document.getElementById('viewport');
const gcodeInput     = document.getElementById('gcode-input');
const gcodeHighlight = document.getElementById('gcode-highlight');
