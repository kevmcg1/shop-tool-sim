const toolpathGroup = new THREE.Group();
stageGroup.add(toolpathGroup);
const COLORS = { rapid:new THREE.Color(0x00d4ff), cut:new THREE.Color(0xf5c518), retract:new THREE.Color(0xff3355), arot:new THREE.Color(0xff8800), engrave:new THREE.Color(0xbb44ff), drill:new THREE.Color(0x00ee88) };

/* --- coloring: by move type, or by how fast the move is cutting --------- */

let pathColorMode = 'feed';

/* Slow through fast: blue, cyan, green, amber, red. */
const FEED_RAMP = [
  [0.00, new THREE.Color(0x2b6cff)],
  [0.25, new THREE.Color(0x00c8d4)],
  [0.50, new THREE.Color(0x4cd964)],
  [0.75, new THREE.Color(0xf5c518)],
  [1.00, new THREE.Color(0xff3b30)],
];
const FEED_RAPID = new THREE.Color(0x3a424b);

/* Rapids and canned-cycle retracts carry a nominal 300 IPM; letting them into
   the range would squash every real cutting feed into the blue end. */
const isRapidSeg = s => !s || s.type === 'rapid' || s.type === 'retract';

function feedRange() {
  const segs = (typeof allSegments !== 'undefined' && allSegments) ? allSegments : [];
  let lo = Infinity, hi = -Infinity, ipm = true, any = false;
  segs.forEach(s => {
    if (isRapidSeg(s) || !(s.feedRate > 0)) return;
    any = true;
    ipm = !!s.feedIsIPM;
    if (s.feedRate < lo) lo = s.feedRate;
    if (s.feedRate > hi) hi = s.feedRate;
  });
  return any ? { lo, hi, unit: ipm ? 'IPM' : 'mm/min' } : null;
}

const _feedC = new THREE.Color();
function feedColor(seg, range) {
  if (isRapidSeg(seg) || !(seg.feedRate > 0)) return FEED_RAPID;
  if (!range) return COLORS.cut;
  const span = range.hi - range.lo;
  const t = span > 1e-9 ? (seg.feedRate - range.lo) / span : 0.5;
  for (let i = 1; i < FEED_RAMP.length; i++) {
    const [t1, c1] = FEED_RAMP[i];
    if (t <= t1 || i === FEED_RAMP.length - 1) {
      const [t0, c0] = FEED_RAMP[i - 1];
      const k = t1 > t0 ? Math.min(Math.max((t - t0) / (t1 - t0), 0), 1) : 0;
      return _feedC.copy(c0).lerp(c1, k);
    }
  }
  return COLORS.cut;
}

/* Each vertex carries how far through the program its move sits, so the path
   can be erased in program order by a single uniform. */
function pathSeqAttr(segs) {
  const all = (typeof allSegments !== 'undefined' && allSegments) ? allSegments : [];
  const n = Math.max(all.length - 1, 1);
  const a = new Float32Array(segs.length * 2);
  for (let i = 0; i < segs.length; i++) {
    const src = segs[i]._src || segs[i];
    const idx = (typeof src._seq === 'number') ? src._seq : 0;
    a[i * 2] = a[i * 2 + 1] = idx / n;
  }
  return new THREE.BufferAttribute(a, 1);
}

/* Where a source line sits in the program, 0 at the first move and 1 at the
   last. Canned cycles draw their rings off a line number rather than off a
   segment, so this is how those marks find their place in the same order the
   lines are erased in. */
function pathSeqForLine(lineIdx) {
  const all = (typeof allSegments !== 'undefined' && allSegments) ? allSegments : [];
  if (!all.length) return 0;
  const n = Math.max(all.length - 1, 1);
  let best = 0;
  for (let i = 0; i < all.length; i++) {
    const li = (all[i].origLineIdx != null) ? all[i].origLineIdx : all[i].lineIdx;
    if (li > lineIdx) break;
    best = i;
  }
  return best / n;
}

/* Marks that are not line segments — the drill rings a canned cycle leaves
   behind, the little crosses on arc centers — cannot carry the per-vertex
   fade the paths use, because they are whole objects rather than runs of
   line. They are collected here with their place in the program instead, and
   the fade turns each one off as the erasure front reaches it. Without this
   they all vanished in one frame while the lines around them were still
   tearing away in order. */
let pathFadeMarks = [];

function applyPathFadeMarks() {
  const k = (typeof pathFade === 'number') ? pathFade : 1;
  const shown = (typeof pathsVisible === 'undefined') || pathsVisible;
  for (let i = 0; i < pathFadeMarks.length; i++) {
    const m = pathFadeMarks[i];
    if (!m.obj) continue;
    m.obj.visible = shown && (m.seq >= 1 - k - 1e-6);
  }
}

function fadeLineMaterial(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uPathFade = { get value() { return (typeof pathFade === 'number') ? pathFade : 1; } };
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'attribute float aSeq;\nvarying float vSeq;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSeq = aSeq;');
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform float uPathFade;\nvarying float vSeq;\nvoid main() {')
      .replace('#include <clipping_planes_fragment>',
               '  if (vSeq < 1.0 - uPathFade) discard;\n  #include <clipping_planes_fragment>');
  };
  /* Rebuilt on every seek, so pin the cache key and let three hand back the
     program it already compiled instead of building another. */
  mat.customProgramCacheKey = () => 'path-fade';
  return mat;
}

/* Both fades apply to the magenta overlay: the toolpath's own, because the
   compensated path is part of the toolpath, and its own, because it has a
   button of its own. Whichever has erased more wins. */
function compVisibleFade() {
  const p = (typeof pathFade === 'number') ? pathFade : 1;
  const c = (typeof compFade === 'number') ? compFade : 1;
  return Math.min(p, c);
}

/* What the part of the compensated path still to come draws at. Following
   "dim future moves" is the default — the magenta line reading solid all the
   way to the end while the programmed line under it fades out ahead of the
   cutter was the odd one out. The second switch is there for anyone who wants
   the whole compensated path solid regardless. */
const COMP_DIM = 0.2;
function compDimAhead() {
  const dimAll  = (typeof dimFuturePaths !== 'undefined') ? dimFuturePaths : true;
  const dimComp = (typeof dimCompFuture  !== 'undefined') ? dimCompFuture  : true;
  return (dimAll && dimComp) ? COMP_DIM : 1.0;
}

/* One batch of segments. In feed mode the batch carries a color per vertex,
   so a single draw call still covers the whole ramp. */
function pathMesh(pts, segs, type, opts) {
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  geo.setAttribute('aSeq', pathSeqAttr(segs));
  const o = opts || {};
  if (pathColorMode === 'feed') {
    const range = feedRange();
    const col = new Float32Array(pts.length * 3);
    for (let i = 0; i < segs.length; i++) {
      const c = feedColor(segs[i], range);
      for (let v = 0; v < 2; v++) {
        col[(i * 2 + v) * 3]     = c.r;
        col[(i * 2 + v) * 3 + 1] = c.g;
        col[(i * 2 + v) * 3 + 2] = c.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.LineSegments(geo, fadeLineMaterial(
      new THREE.LineBasicMaterial(Object.assign({ vertexColors: true }, o))));
  }
  return new THREE.LineSegments(geo, fadeLineMaterial(
    new THREE.LineBasicMaterial(Object.assign({ color: COLORS[type] || COLORS.cut }, o))));
}

const compOverlayGroup = new THREE.Group();
compOverlayGroup.visible = false;

const compOverlayRoot = new THREE.Group();
compOverlayRoot.add(compOverlayGroup);
stageGroup.add(compOverlayRoot);

function disposeCompOverlay() {
  compOverlayGroup.children.slice().forEach(c => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
    compOverlayGroup.remove(c);
  });
}

/* How far through the compensated program the run has got, 0 to 1.

   compSegments and simSegments are the same array while comp is on, and the
   timeline is built from it, so the count of finished timeline entries is
   already an index into the comp path. */
let compProgress = 1;

/* The magenta path gets the same two treatments the programmed path has.

   uPathFade erases it in program order when the toolpath is hidden — one
   uniform, no rebuild, and it tears away from the first move to the last just
   as the programmed lines do. It used to be switched off in a single frame,
   which next to the line it shadows looked like a glitch.

   uProg and uDimAhead do the dimming: everything past the cutter draws at a
   fraction of its opacity, so the compensated path reads the same way the
   programmed one does — what has been cut is solid, what is still to come is
   ghosted. */
function compOverlayMaterial(color) {
  const mat = new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 0.85, depthTest: false,
  });
  mat.onBeforeCompile = sh => {
    /* Getters rather than fixed values: three reads .value every frame, so
       the uniforms track the globals without anything having to push them. */
    sh.uniforms.uPathFade  = { get value() { return compVisibleFade(); } };
    sh.uniforms.uProg      = { get value() { return compProgress; } };
    sh.uniforms.uDimAhead  = { get value() { return compDimAhead(); } };
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'attribute float aSeq;\nvarying float vSeq;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSeq = aSeq;');
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {',
               'uniform float uPathFade;\nuniform float uProg;\nuniform float uDimAhead;\n'
             + 'varying float vSeq;\nvoid main() {')
      .replace('#include <clipping_planes_fragment>',
               '  if (vSeq < 1.0 - uPathFade) discard;\n  #include <clipping_planes_fragment>');
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <premultiplied_alpha_fragment>',
      '  if (vSeq > uProg) gl_FragColor.a *= uDimAhead;\n  #include <premultiplied_alpha_fragment>');
  };
  mat.customProgramCacheKey = () => 'comp-overlay';
  return mat;
}

function buildCompOverlay() {
  disposeCompOverlay();
  if (!compSegments || compSegments.length === 0) return;

  const cutPts = [];
  const seqs = [];
  const n = Math.max(compSegments.length - 1, 1);
  for (let i = 0; i < compSegments.length; i++) {
    const seg = compSegments[i];
    if (seg.type === 'rapid' || seg.type === 'retract') continue;
    cutPts.push(seg.start.x, seg.start.y, seg.start.z);
    cutPts.push(seg.end.x,   seg.end.y,   seg.end.z);
    seqs.push(i / n, i / n);
  }

  if (cutPts.length === 0) return;

  const COMP_COLOR = 0xff36c4;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(cutPts, 3));
  geo.setAttribute('aSeq', new THREE.Float32BufferAttribute(seqs, 1));
  const lines = new THREE.LineSegments(geo, compOverlayMaterial(COMP_COLOR));
  lines.renderOrder = 999;
  compOverlayGroup.add(lines);
}

function buildTimeline(segs) {
  segTimeline = [];
  let t = 0;
  segs.forEach(seg => {

    const skipped = pathSkip[seg.type] && !seg.isStop && !seg.isMarker && !seg.isEnd;
    const dur = skipped ? 0.0001 : (seg.duration || 0.001);
    segTimeline.push({ seg, tStart: t, tEnd: t + dur });
    t += dur;
  });
  simTotalTime = t;
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '—';
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function createCenterSpriteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, 2 * Math.PI);
  ctx.fillStyle = '#ff00ff';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  return new THREE.CanvasTexture(canvas);
}
const centerSpriteTex = createCenterSpriteTexture();

function toolEndShape(toolNum) {
  try {
    if (typeof StockSim !== 'undefined' && StockSim.toolTypeOf) {
      return StockSim.toolTypeOf(toolNum);
    }
  } catch (e) {   }
  return 1;
}

function placeholderCutter(shape, radius, height) {
  const pts = [];
  if (shape === 0) {
    const N = 8;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI / 2;
      pts.push(new THREE.Vector2(radius * Math.sin(a), radius * (1 - Math.cos(a))));
    }
  } else if (shape === 2) {
    pts.push(new THREE.Vector2(0, 0), new THREE.Vector2(radius, radius * 0.6));
  } else {
    pts.push(new THREE.Vector2(0, 0), new THREE.Vector2(radius, 0));
  }
  pts.push(new THREE.Vector2(radius, height));
  return new THREE.LatheGeometry(pts, 24);
}

/* ------------------------------------------------------------------------ *
 * Making the spin visible.
 *
 * The placeholder cutter is a lathed solid, so it is perfectly round about
 * its own axis and turning it does nothing you can see. These are four
 * helical flute lines laid on its flank; with them there the spin reads
 * immediately, and they cost one extra draw call.
 *
 * The lathe is built about local Y, so the tool axis is local Y and the
 * helices wind about it.
 * ------------------------------------------------------------------------ */
const FLUTES = 4;
function fluteLines(radius, height) {
  const STEPS = 26;
  const TURN = Math.PI * 1.15;      // how far round a flute travels over the flank
  const flank = height * 0.34;      // only the cutting end is fluted
  const pts = [];
  for (let f = 0; f < FLUTES; f++) {
    const base = (f / FLUTES) * Math.PI * 2;
    for (let i = 0; i < STEPS; i++) {
      for (const s of [i, i + 1]) {
        const t = s / STEPS;
        const a = base + t * TURN;
        pts.push(new THREE.Vector3(
          Math.cos(a) * radius * 1.001,
          t * flank,
          Math.sin(a) * radius * 1.001));
      }
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0x4a4f57, transparent: true, opacity: 0.9,
  }));
}

/* How fast the cutter is drawn turning.

   Not the real rate — 3000 RPM is fifty turns a second, which at any frame
   rate is a blur that aliases into nonsense. The programmed speed is mapped
   onto a few turns a second instead, so a faster spindle still visibly spins
   faster and the direction still reads correctly.

   The angle comes from simTime rather than from the wall clock, which is what
   makes dragging the playback bar turn the cutter: the clock is whatever the
   scrub says it is, so the tool spins under your hand exactly as it would
   have done had the program run to that point. */
const _spinAxis = new THREE.Vector3(0, 1, 0);
const _spinQ    = new THREE.Quaternion();

const inSingleBlock = () =>
  (typeof singleBlockMode !== 'undefined') && singleBlockMode;

/* Which clock the spin runs on.

   Normally it is program time, which is what makes dragging the playback bar
   turn the cutter. Single block is the exception: there the program clock only
   moves when you press a button, so the cutter would stand dead still between
   steps. A spindle does not stop turning because the operator is taking the
   program one line at a time, so single block runs it off the wall clock. */
function spinSeconds() {
  if (inSingleBlock()) return performance.now() / 1000;
  return (typeof simTime === 'number') ? simTime : 0;
}

/* And how fast. In single block the cutter keeps turning even where the
   program has commanded M05 and even before the first M03 — you are stepping
   through to inspect the cut, and a still cutter reads as a broken one. It
   turns at the last speed the program asked for, or at a plausible one if it
   has not asked yet. */
function spinRpm() {
  const live = (typeof activeSpindleRPM !== 'undefined') ? activeSpindleRPM : null;
  if (live && isFinite(live) && live > 0) return live;
  if (!inSingleBlock()) return null;
  const last = (typeof spindleChanges !== 'undefined' && spindleChanges.length)
    ? spindleChanges[spindleChanges.length - 1].rpm
    : null;
  return (last && isFinite(last) && last > 0) ? last : 1200;
}

function toolSpinAngle() {
  const rpm = spinRpm();
  if (!rpm || !isFinite(rpm) || rpm <= 0) return 0;
  const revPerSec = Math.min(3, Math.max(0.35, rpm / 1200));
  const dir = ((typeof activeSpindleDir !== 'undefined') && activeSpindleDir === 'ccw') ? -1 : 1;
  return dir * revPerSec * Math.PI * 2 * spinSeconds();
}

/* Program time only advances on a seek, so the spin normally repaints itself
   from simSeekToTime. Wall-clock time advances on its own, so single block
   needs its own heartbeat to keep the cutter turning between steps — and has
   to keep the frame loop awake while it does, or the view idles down. */
let _sbSpinRaf = 0;
(function singleBlockSpinTick() {
  _sbSpinRaf = requestAnimationFrame(singleBlockSpinTick);
  const live = inSingleBlock() && !(typeof simPlaying !== 'undefined' && simPlaying);
  if (!live) {
    if (window.VPBusy) window.VPBusy.release('spindle');
    return;
  }
  if (window.VPBusy) window.VPBusy.hold('spindle');
  applyToolSpin();
})();

/* Re-applies the spin on top of whatever orientation the tool axis asked
   for. Called after the spindle state for this instant has been worked out,
   which is a few lines later than the cutter itself is built. */
function applyToolSpin() {
  const m = toolCylinderMesh;
  if (!m || !m.userData || !m.userData.baseQuat) return;
  const q = m.userData.baseQuat.clone();
  const a = toolSpinAngle();
  if (a) q.multiply(_spinQ.setFromAxisAngle(_spinAxis, a));
  m.quaternion.copy(q);
  m.updateMatrix();
}

const spinA = new Map();
const spinB = new Map();
const spinByLine = new Map();
function trunnionNode() {
  return mainScene.getObjectByName("trunnionTable");
}
function isIdentity4(m) {
  const e = m.elements, I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  for (let i = 0; i < 16; i++) if (Math.abs(e[i] - I[i]) > 1e-9) return false;
  return true;
}
function buildPathSpin(segs, count) {
  spinA.clear();
  spinB.clear();
  spinByLine.clear();
  if (rotaryMode !== "part" || !count || !segs || !segs.length) return;
  const tbl = trunnionNode();
  if (!tbl) return;

  const one  = new THREE.Vector3(1, 1, 1);
  const F    = new THREE.Matrix4().compose(toolpathGroup.position, toolpathGroup.quaternion, one);
  const Finv = new THREE.Matrix4().copy(F).invert();
  const p    = tbl.position;
  const Tp   = new THREE.Matrix4().makeTranslation( p.x,  p.y,  p.z);
  const Tpi  = new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z);

  const Rnow = new THREE.Matrix4().makeRotationFromEuler(tbl.rotation);

  const byAngle = new Map();
  const E = new THREE.Euler(0, 0, 0, "XYZ");
  const D = Math.PI / 180;
  function matFor(a, b, c) {
    const key = a + "|" + b + "|" + c;
    let m = byAngle.get(key);
    if (m === undefined) {

      E.set(a * D, -b * D, -c * D, "XYZ");
      const Rthen = new THREE.Matrix4().makeRotationFromEuler(E).invert();
      m = new THREE.Matrix4().copy(Finv)
            .multiply(Tp).multiply(Rnow).multiply(Rthen).multiply(Tpi).multiply(F);
      if (isIdentity4(m)) m = null;
      byAngle.set(key, m);
    }
    return m;
  }

  let a = 0, b = 0, c = 0;
  let mStart = matFor(0, 0, 0);
  const n = Math.min(count, segs.length);

  for (let i = 0; i <= n && i < segs.length; i++) {
    const s = segs[i];
    if (s.aDegEnd !== undefined) a = s.aDegEnd || 0;
    if (s.bDegEnd !== undefined) b = s.bDegEnd || 0;
    if (s.cDegEnd !== undefined) c = s.cDegEnd || 0;
    const mEnd = matFor(a, b, c);
    if (mStart) spinA.set(s, mStart);
    if (i < n) {
      if (mEnd) spinB.set(s, mEnd);
      if (mEnd && s.lineIdx !== undefined && !spinByLine.has(s.lineIdx)) {
        spinByLine.set(s.lineIdx, mEnd);
      }
    }
    mStart = mEnd;
  }
}

function spunA(s) {
  const m = spinA.get(s._src || s);
  return m ? s.start.clone().applyMatrix4(m) : s.start;
}
function spunB(s) {
  const m = spinB.get(s._src || s);
  return m ? s.end.clone().applyMatrix4(m) : s.end;
}

function buildToolpathMesh(segs, completedCount, partialSeg, partialEnd, activeToolDia, toolAxisIn, cylinderTipOverride) {
  toolpathGroup.children.slice().forEach(c => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
    toolpathGroup.remove(c);
  });
  arcCenterSprites = [];
  perLineMeshes = [];
  pathFadeMarks = [];
  toolCylinderMesh = null;

  if (!segs||!segs.length) {
    if (typeof ToolModels !== 'undefined') ToolModels.hideAll();
    return;
  }

  let count;
  if (partialSeg === undefined) {
    count = Math.ceil(segs.length * completedCount);
    partialSeg = null; partialEnd = null;
  } else {
    count = completedCount;
  }

  buildPathSpin(segs, count);

  /* Stamp program order once so every batch can carry it per vertex. */
  for (let i = 0; i < segs.length; i++) segs[i]._seq = i;

  const vis    = segs.slice(0, count).filter(s => pathVisibility[s.type] !== false);
  const future = segs.slice(count).filter(s => pathVisibility[s.type] !== false);

  if (showAllPaths && future.length) {
    const ghostBy = {};
    PATH_TYPES.forEach(t => { ghostBy[t.key] = []; });
    future.forEach(s => { if (ghostBy[s.type]) ghostBy[s.type].push(s); });

    if (partialSeg && partialEnd) {
      const remainder = { ...partialSeg, start: partialEnd };
      if (ghostBy[partialSeg.type]) ghostBy[partialSeg.type].push(remainder);
    }
    Object.entries(ghostBy).forEach(([type, ss]) => {
      if (!ss.length) return;
      const pts = []; ss.forEach(s => { pts.push(s.start, s.end); });
      const ghostOpacity = dimFuturePaths ? 0.2 : 1.0;
      toolpathGroup.add(pathMesh(pts, ss, type,
        { transparent: dimFuturePaths, opacity: ghostOpacity }));
    });
  }

  if (focusDimEnabled) {
    const byLine = new Map();
    vis.forEach(s => {
      if (!byLine.has(s.lineIdx)) byLine.set(s.lineIdx, []);
      byLine.get(s.lineIdx).push(s);
    });
    if (partialSeg && partialEnd && pathVisibility[partialSeg.type] !== false) {
      const li = partialSeg.lineIdx;
      if (!byLine.has(li)) byLine.set(li, []);
      byLine.get(li).push({ ...partialSeg, end: partialEnd, _partial: true, _src: partialSeg });
    }
    byLine.forEach((ss, lineIdx) => {
      const pts = [];

      ss.forEach(s => { pts.push(spunA(s), spunB(s)); });
      const type = ss[0].type;
      const mesh = pathMesh(pts, ss, type, { transparent: true, opacity: 1.0 });
      toolpathGroup.add(mesh);
      perLineMeshes.push({ lineIdx, mesh });
    });
  } else {
    const by = {};
    PATH_TYPES.forEach(t => { by[t.key] = []; });
    vis.forEach(s => { if (by[s.type]) by[s.type].push(s); });
    if (partialSeg && partialEnd && pathVisibility[partialSeg.type] !== false) {
      const clipped = { ...partialSeg, end: partialEnd, _src: partialSeg };
      if (by[partialSeg.type]) by[partialSeg.type].push(clipped);
    }
    Object.entries(by).forEach(([type, ss]) => {
      if (!ss.length) return;
      const pts = []; ss.forEach(s => { pts.push(spunA(s), spunB(s)); });
      toolpathGroup.add(pathMesh(pts, ss, type));
    });
  }

  /* Before the first line runs, the cutter is parked on the work origin —
     where you would have touched it off — rather than already standing at
     wherever the program's first rapid happens to begin. */
  let tip = cylinderTipOverride || partialEnd || (vis.length ? vis[vis.length-1].end : null);
  if (typeof simTime === 'number' && simTime <= 1e-6) {
    /* Rewound is rewound: whatever the first line of the program happens to
       be, and whether or not cutter comp has rewritten it, the cutter starts
       on the work zero. */
    tip = new THREE.Vector3(0, 0, 0);
  }
  if (tip) {

    const toolAxisWorld = (toolAxisIn && toolAxisIn.isVector3 && toolAxisIn.lengthSq() > 1e-12)
      ? toolAxisIn.clone().normalize()
      : new THREE.Vector3(0, 0, 1);

    const defaultAxis = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultAxis, toolAxisWorld);

    const model = (typeof ToolModels !== 'undefined')
      ? ToolModels.place(activeToolNumber, tip, quaternion, toolVisible)
      : null;

    if (model) {
      toolCylinderMesh = model;
    } else {
      const radius = activeToolDia ? activeToolDia / 2 : 0.5;
      const height = 8;

      const cyl = new THREE.Mesh(
        placeholderCutter(toolEndShape(activeToolNumber), radius, height),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: toolOpacity < 1, opacity: toolOpacity,
          depthWrite: toolOpacity >= 1,
        })
      );
      cyl.setRotationFromQuaternion(quaternion);
      /* Kept so the spin can be re-applied on top of the aim without
         re-deriving it — see applyToolSpin(). */
      cyl.userData.baseQuat = quaternion.clone();
      const flutes = fluteLines(radius, height);
      cyl.add(flutes);

      /* Both of the cutter's materials are built brand new here, on every
         single seek. Give them the dissolve chunk now, while the frame is
         already being rebuilt, so that hiding the cutter later is only a
         matter of moving a uniform — no shader compile in the middle of the
         animation, which is what made the cutter's disintegration hitch while
         the solids' ran clean. */
      if (window.PartModels && window.PartModels.attachDissolve) {
        try {
          window.PartModels.attachDissolve(cyl.material);
          window.PartModels.attachDissolve(flutes.material);
        } catch (e) {   }
      }

      cyl.position.copy(tip);
      cyl.visible = toolVisible;
      toolpathGroup.add(cyl);
      toolCylinderMesh = cyl;
    }
  } else if (typeof ToolModels !== 'undefined') {

    ToolModels.hideAll();
  }

  if (showArcCenters) {

    const arcSrc = showAllPaths ? vis.concat(future) : vis;
    const centers = new Set();
    arcSrc.forEach(s => {
      if (s.center) {
        const key = `${s.center.x.toFixed(4)},${s.center.y.toFixed(4)},${s.center.z.toFixed(4)}`;
        if (!centers.has(key)) {
          centers.add(key);
          const spriteMat = new THREE.SpriteMaterial({ map: centerSpriteTex, depthTest: true, depthWrite: false });
          const sprite = new THREE.Sprite(spriteMat);
          const sm = spinA.get(s._src || s);
          sprite.position.copy(sm ? s.center.clone().applyMatrix4(sm) : s.center);

          if (showAllPaths && dimFuturePaths && s.lineIdx > (vis.length ? vis[vis.length-1].lineIdx : -1)) {
            spriteMat.opacity = 0.35;
            spriteMat.transparent = true;
          }
          toolpathGroup.add(sprite);
          arcCenterSprites.push(sprite);
          pathFadeMarks.push({ obj: sprite, seq: pathSeqForLine(s.lineIdx) });
        }
      }
    });
  }

  const maxLineIdx = vis.length ? vis[vis.length-1].lineIdx : -1;
  const visibleHoles = showAllPaths
    ? allDrillHoles.slice()
    : allDrillHoles.filter(h => h.lineIdx <= maxLineIdx);
  visibleHoles.forEach(hole => {
    const isFutureHole = hole.lineIdx > maxLineIdx;

    const ringOpacityScale = (isFutureHole && dimFuturePaths) ? 0.35 : 1.0;

    const liveDia = getLiveToolDia(getActiveToolAtLine(hole.lineIdx)) || hole.toolDia || 0.5;
    const r = liveDia / 2;
    const segs = 48;

    const holeSpin = spinByLine.get(hole.lineIdx) || null;
    /* Every ring this hole draws belongs to the same line, so they all leave
       at the same moment the lines on that line do. */
    const holeSeq = pathSeqForLine(hole.lineIdx);

    function makeWorldRing(center, aDeg, color, opacity) {
      if (opacity === undefined) opacity = 0.9;
      const a = (aDeg || 0) * Math.PI / 180;
      const cosA = Math.cos(a), sinA = Math.sin(a);

      const pts = [];
      for (let i = 0; i <= segs; i++) {
        const ang = (i / segs) * Math.PI * 2;
        const u = Math.cos(ang), v = Math.sin(ang);
        const q = new THREE.Vector3(
          center.x + r * u,
          center.y + r * v * cosA,
          center.z - r * v * sinA
        );
        if (holeSpin) q.applyMatrix4(holeSpin);
        pts.push(q);
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: opacity, depthTest: false });
      const ring = new THREE.Line(geo, mat);
      toolpathGroup.add(ring);
      pathFadeMarks.push({ obj: ring, seq: holeSeq });
    }

    makeWorldRing(hole.wTop,    hole.aDeg, 0x7be8ff, 0.9 * ringOpacityScale);

    if (hole.cycleType === 83 && hole.peckDepths && hole.peckDepths.length) {
      hole.peckDepths.forEach(wPeck => {
        makeWorldRing(wPeck, hole.aDeg, 0x44ddff, 0.55 * ringOpacityScale);
      });
    }

    const depthColor = hole.cycleType === 83 ? 0xff9900 : hole.cycleType === 84 ? 0xff4400 : 0x2277cc;
    makeWorldRing(hole.wDepth,  hole.aDeg, depthColor, 0.9 * ringOpacityScale);
    const returnColor = hole.returnMode === 98 ? 0xaa44ff : 0xff66cc;
    makeWorldRing(hole.wReturn, hole.aDeg, returnColor, 0.9 * ringOpacityScale);
  });

  applyPathVisibility();
}

function applyPathVisibility() {
  toolpathGroup.children.forEach(o => {
    if (o === toolCylinderMesh) return;
    o.visible = pathsVisible;
  });
  compOverlayRoot.visible = pathsVisible;

  /* The blanket pass above has just turned the canned-cycle rings and the arc
     marks back on, so put the erasure front back over them. */
  applyPathFadeMarks();

  if (typeof applyToolOpacity === "function") applyToolOpacity();
}

function simSeekToTime(t) {
  simTime = Math.max(0, Math.min(simTotalTime, t));

  if (!(simTotalTime > 0 && simTime >= simTotalTime)) {
    try { hideProgramComplete(); } catch (e) {   }
  }

  let completedCount = 0;
  let partialSeg = null;
  let partialFrac = 0;
  let activeSeg = null;
  let lineIdxForTool = -1;
  let origLineForEditor = -1;

  for (let i = 0; i < segTimeline.length; i++) {
    const { tStart, tEnd, seg } = segTimeline[i];
    if (simTime >= tEnd) {
      completedCount = i + 1;
      lineIdxForTool    = seg.lineIdx;
      origLineForEditor = (seg.origLineIdx != null) ? seg.origLineIdx : seg.lineIdx;
    } else if (simTime >= tStart) {
      completedCount = i;
      partialSeg = seg;
      partialFrac = (tEnd > tStart) ? (simTime - tStart) / (tEnd - tStart) : 0;
      activeSeg = segTimeline[i];
      lineIdxForTool    = seg.lineIdx;
      origLineForEditor = (seg.origLineIdx != null) ? seg.origLineIdx : seg.lineIdx;
      break;
    }
  }
  if (simTime >= simTotalTime) {
    completedCount = segTimeline.length;
    partialSeg = null;
    if (segTimeline.length) {
      const lastSeg = segTimeline[segTimeline.length-1].seg;
      lineIdxForTool    = lastSeg.lineIdx;
      origLineForEditor = (lastSeg.origLineIdx != null) ? lastSeg.origLineIdx : lastSeg.lineIdx;
    } else {
      lineIdxForTool = -1;
      origLineForEditor = -1;
    }
  }

  /* Where the cutter has got to along the compensated path, on the same 0..1
     scale the overlay's vertices carry. The timeline is built from the very
     array the overlay was built from, so the finished count is already the
     index — no second search. */
  {
    const n = Math.max(segTimeline.length - 1, 1);
    const done = completedCount + (partialSeg ? partialFrac : 0);
    compProgress = segTimeline.length ? Math.min(Math.max(done / n, 0), 1) : 1;
  }

  /* Which line of the program the machine is on — the line as it is written
     in the editor, not as the compensator renumbered it.

     Everything that describes machine state — which tool, what RPM, whether
     the coolant is on — is recorded against the original text. With cutter
     comp running, the segments being played come from the compensated text,
     whose line numbers shift wherever a G41/G42 window was replaced by a
     different number of lines. Reading the state tables with a compensated
     line number therefore returned the state from a line or two away, or
     nothing at all. The original line is the one to ask with. */
  const lineForState = (origLineForEditor >= 0) ? origLineForEditor : lineIdxForTool;

  if (lineForState >= 0) {
    activeToolNumber = getActiveToolAtLine(lineForState);
  } else {
    activeToolNumber = toolChanges.length ? toolChanges[toolChanges.length-1].tool : null;
  }
  const activeDia = getLiveToolDia(activeToolNumber);

  let partialEnd = null;
  if (partialSeg) {
    partialEnd = partialSeg.start.clone().lerp(partialSeg.end, partialFrac);
    activeSeg = activeSeg || { seg: partialSeg };
  }

  function rotaryNow(field) {
    let v = 0;
    for (let i = Math.min(completedCount, segTimeline.length) - 1; i >= 0; i--) {
      if (segTimeline[i].seg[field] !== undefined) { v = segTimeline[i].seg[field]; break; }
    }
    if (partialSeg && partialSeg[field] !== undefined) {
      let v0 = 0;
      for (let i = completedCount - 1; i >= 0; i--) {
        if (segTimeline[i] && segTimeline[i].seg[field] !== undefined) { v0 = segTimeline[i].seg[field]; break; }
      }
      v = v0 + (partialSeg[field] - v0) * partialFrac;
    }
    return v;
  }
  const currentADeg = rotaryNow('aDegEnd');
  const currentBDeg = rotaryNow('bDegEnd');
  const currentCDeg = rotaryNow('cDegEnd');

  if (rotaryMode === 'part' && typeof setTableAngles === "function") {
    setTableAngles(currentADeg, currentBDeg, currentCDeg);
  }

  updateProgramFrame();
  if (typeof StockSim !== "undefined") { try { StockSim.sync(simTime); } catch (e) { console.warn("[Stock]", e); } }

  if (rotaryMode === 'part' && typeof setTableAngles === "function") {
    setTableAngles(currentADeg, currentBDeg, currentCDeg);
  }

  let renderCompletedCount = completedCount;
  let renderPartialSeg     = partialSeg;
  let renderPartialEnd     = partialEnd;
  let cylinderTipOverride  = null;
  if (compEnabled && simSegments !== allSegments) {
    renderCompletedCount = 0;
    renderPartialSeg     = null;
    renderPartialEnd     = null;
    cylinderTipOverride  = partialEnd;

    if (origLineForEditor >= 0) {

      let firstActive = -1;
      let lastActive  = -1;
      for (let i = 0; i < allSegments.length; i++) {
        const li = allSegments[i].lineIdx;
        if (li < origLineForEditor) {
          renderCompletedCount = i + 1;
        } else if (li === origLineForEditor) {
          if (firstActive < 0) firstActive = i;
          lastActive = i;
        } else {
          break;
        }
      }

      const isPocketCycle = pocketCycleLineIndices.has(origLineForEditor);

      if (isPocketCycle && firstActive >= 0) {

        let compFirst = -1, compLast = -1;
        for (let i = 0; i < segTimeline.length; i++) {
          const seg = segTimeline[i].seg;
          const oli = (seg.origLineIdx != null) ? seg.origLineIdx : seg.lineIdx;
          if (oli === origLineForEditor) {
            if (compFirst < 0) compFirst = i;
            compLast = i;
          } else if (compFirst >= 0) {
            break;
          }
        }
        const numComp = (compFirst >= 0) ? (compLast - compFirst + 1) : 0;
        const numOrig = lastActive - firstActive + 1;

        let compIdxInLine = 0;
        let partialAdd = 0;
        if (compFirst >= 0) {
          if (completedCount >= compFirst + numComp) {
            compIdxInLine = numComp;
          } else if (completedCount > compFirst) {
            compIdxInLine = completedCount - compFirst;
          }
          if (partialSeg
              && completedCount >= compFirst
              && completedCount <  compFirst + numComp
              && segTimeline[completedCount]
              && segTimeline[completedCount].seg === partialSeg) {
            partialAdd = partialFrac;
          }
        }
        const compProgress = numComp > 0
          ? Math.max(0, Math.min(1, (compIdxInLine + partialAdd) / numComp))
          : 0;
        const targetFloat = compProgress * numOrig;
        let targetIdx = Math.floor(targetFloat + 1e-9);
        let fracInSeg = targetFloat - targetIdx;
        if (targetIdx >= numOrig) {
          renderCompletedCount = lastActive + 1;
        } else {
          renderCompletedCount = firstActive + targetIdx;
          if (fracInSeg >= 1.0 - 1e-6) {
            renderCompletedCount += 1;
          } else if (fracInSeg > 1e-6) {
            const seg = allSegments[firstActive + targetIdx];

            if (seg.length > 1e-9) {
              renderPartialSeg = seg;
              renderPartialEnd = seg.start.clone().lerp(seg.end, fracInSeg);
            }
          }
        }
      } else if (firstActive >= 0 && partialEnd) {

        const tx = partialEnd.x, ty = partialEnd.y;
        let bestI = -1, bestDist = Infinity, bestFrac = 0;
        for (let i = firstActive; i <= lastActive; i++) {
          const seg = allSegments[i];
          const sx = seg.start.x, sy = seg.start.y;
          const ex = seg.end.x,   ey = seg.end.y;
          const dx = ex - sx,     dy = ey - sy;
          const lenSq = dx * dx + dy * dy;
          let frac;
          if (lenSq < 1e-12) {
            frac = 1;
          } else {
            frac = ((tx - sx) * dx + (ty - sy) * dy) / lenSq;
          }
          const fc = Math.max(0, Math.min(1, frac));
          const px = sx + fc * dx;
          const py = sy + fc * dy;
          const dist = Math.hypot(tx - px, ty - py);
          if (dist < bestDist) {
            bestDist = dist; bestI = i; bestFrac = fc;
          }
        }
        if (bestI >= 0) {

          renderCompletedCount = bestI;
          if (bestFrac >= 1.0 - 1e-6) {
            renderCompletedCount = bestI + 1;
          } else if (bestFrac > 1e-6) {
            const seg = allSegments[bestI];
            renderPartialSeg = seg;
            renderPartialEnd = seg.start.clone().lerp(seg.end, bestFrac);
          }

        }
      } else if (firstActive >= 0) {

        for (let i = firstActive; i <= lastActive; i++) {
          renderCompletedCount = i + 1;
        }
      }
    }
  }

  const toolAxis = applyAllRotations(0, 0, 1, currentADeg, currentBDeg, currentCDeg);
  buildToolpathMesh(allSegments, renderCompletedCount, renderPartialSeg, renderPartialEnd,
                    activeDia, toolAxis, cylinderTipOverride);

  updateEditorActiveLine(origLineForEditor);

  if (typeof updateCompEditorActiveLine === 'function') {
    updateCompEditorActiveLine(lineIdxForTool);
  }

  currentToolTip = partialEnd || (segTimeline.length && completedCount > 0 ? segTimeline[Math.min(completedCount, segTimeline.length)-1].seg.end : null);

  const tipDrawn = currentToolTip ? currentToolTip.clone().applyMatrix4(programFrame) : null;

  if (linearMode === 'table' && tipDrawn) setStageXY(tipDrawn.x, tipDrawn.y);
  else setStageXY(0, 0);

  currentToolTipWorld = tipDrawn ? tipDrawn.add(stageOffset) : null;

  if (partialSeg) {
    currentToolDir = partialSeg.end.clone().sub(partialSeg.start).normalize();
  } else if (completedCount > 0 && segTimeline[completedCount-1]) {
    const s = segTimeline[completedCount-1].seg;
    currentToolDir = s.end.clone().sub(s.start).normalize();
  } else {
    currentToolDir = null;
  }

  currentToolDirWorld = currentToolDir
    ? currentToolDir.clone().applyQuaternion(programFrameQuat) : null;

  const pct = simTotalTime > 0 ? (simTime / simTotalTime) * 100 : 100;
  progressSlider.value = pct;

  const fmtCompact = (sec) => {
    if (!isFinite(sec) || sec < 0) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  };
  document.getElementById('viewport-progress-val').textContent = fmtCompact(simTime);
  const totalEl = document.getElementById('viewport-progress-total');
  if (totalEl) totalEl.textContent = simTotalTime > 0 ? fmtCompact(simTotalTime) : '—';
  document.getElementById('sim-elapsed').textContent = formatTime(simTime) + ' / ' + formatTime(simTotalTime);

  const cur = activeSeg || (segTimeline.length ? segTimeline[segTimeline.length - 1] : null);

  const simFeedEl = document.getElementById('sim-feed');
  if (simFeedEl) simFeedEl.textContent = cur ? (cur.seg.feedLabel || '—') : '—';

  let tipForHud = partialEnd;
  if (!tipForHud && segTimeline.length && completedCount > 0) {
    tipForHud = segTimeline[completedCount - 1].seg.end;
  }
  if (!tipForHud && segTimeline.length) {
    tipForHud = segTimeline[0].seg.start;
  }
  const xStr = tipForHud ? tipForHud.x.toFixed(3) : '—';
  const yStr = tipForHud ? tipForHud.y.toFixed(3) : '—';
  const zStr = tipForHud ? tipForHud.z.toFixed(3) : '—';

  /* Playback speed is a real multiplier on how fast the cutter is traveling
     and turning, so the read-outs report what the machine is doing at that
     rate, not the programmed number. At 1× they are the same thing; above it
     both the feed and the RPM are scaled and tagged with the multiplier. */
  const rate = (typeof simSpeed === 'number' && simSpeed > 0) ? simSpeed : 1;
  const scaled = rate !== 1;

  let feedStr = '—';
  if (cur) {
    const seg = cur.seg;
    if (scaled && seg.feedRate > 0) {
      const unit = seg.feedIsIPM ? 'IPM' : 'mm/min';
      feedStr = `${Math.round(seg.feedRate * rate).toLocaleString()} ${unit} @${rate}×`;
    } else {
      feedStr = seg.feedLabel || '—';
    }
  }

  const rpmForLine = (lineForState >= 0)
    ? getActiveSpindleAtLine(lineForState)
    : (spindleChanges.length ? spindleChanges[spindleChanges.length-1].rpm : null);
  let spindleStateAtLine = 'off';
  let spindleDirAtLine   = 'cw';
  if (lineForState >= 0) {
    for (const ev of allMCodeEvents) {
      if (ev.type === 'spindle' && ev.lineIdx <= lineForState) {
        spindleStateAtLine = ev.state;
        if (ev.dir) spindleDirAtLine = ev.dir;
      }
    }
  }
  activeSpindleRPM = (spindleStateAtLine === 'on') ? rpmForLine : null;
  activeSpindleDir = spindleDirAtLine;

  /* Now that the spindle state for this instant is known, turn the cutter to
     match. Scrubbing lands here on every input event, so the tool spins as
     the bar is dragged. */
  applyToolSpin();
  const rpmStr = (spindleStateAtLine === 'on' && rpmForLine != null)
    ? (scaled
        ? `${Math.round(rpmForLine * rate).toLocaleString()} RPM @${rate}×`
        : `${rpmForLine.toLocaleString()} RPM`)
    : '—';

  const toolStr = (activeToolNumber != null) ? ('T' + activeToolNumber) : '—';

  {
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('ms-x', xStr);
    set('ms-y', yStr);
    set('ms-z', zStr);
    set('ms-feed', feedStr);
    set('ms-rpm', rpmStr);
    set('ms-tool', toolStr);
  }

  {
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('xyz-hud-x', xStr);
    set('xyz-hud-y', yStr);
    set('xyz-hud-z', zStr);
    set('hud-feed',  feedStr);
    set('hud-rpm',   rpmStr);
    set('hud-tool',  toolStr);
  }

  const aHud = document.getElementById('hud-a');
  if (aHud) aHud.textContent = currentADeg.toFixed(1) + '°';

  if (typeof paintTravelStats === 'function') paintTravelStats();

  /* Coolant is a state, not an event: whatever the last M07/M08/M09 above the
     line being read is what is running now.

     The line it asks about is the one the editor is highlighting — set a few
     lines up by updateEditorActiveLine — rather than any internal index. That
     is the line the user can actually see, so the lamps and the highlight can
     never disagree, and it works the same however the clock got there:
     playing, scrubbing the bar, stepping a block, or clicking a line in the
     editor. It falls back to the seek's own line only when the editor has
     nothing marked, which is the case while the caret is elsewhere. */
  {
    const line = (typeof editorActiveLine === 'number' && editorActiveLine >= 0)
      ? editorActiveLine
      : lineForState;

    let coolantState = 'off';
    if (line >= 0) {
      for (const ev of allMCodeEvents) {
        if (ev.type === 'coolant' && ev.lineIdx <= line) coolantState = ev.state;
      }
    }
    const flood = document.getElementById('cool-flood');
    const mist  = document.getElementById('cool-mist');
    if (flood) flood.classList.toggle('on', coolantState === 'flood');
    if (mist)  mist.classList.toggle('on',  coolantState === 'mist');
  }

  const stopHud = document.getElementById('stop-hud');

  const curSeg = partialSeg || (completedCount > 0 ? segTimeline[completedCount - 1]?.seg : null);
  let stopType = null;
  if (curSeg && curSeg.isStop) {
    console.log('[simSeek] landed on stop seg', curSeg.stopType, 'simPlaying', simPlaying, 'optionalStop', optionalStopEnabled);
    if (curSeg.stopType === 'm00') stopType = 'm00';
    else if (curSeg.stopType === 'm01' && optionalStopEnabled) stopType = 'm01';
  }

  if (stopType && simPlaying) {
    simPlaying = false;
  }
  /* This runs every frame of a run, so the top-centre stack is only re-laid
     out when the lamp actually comes on or goes off. */
  const wasStop = stopHud.dataset.on === '1';
  if (stopType) {
    stopHud.className = stopType === 'm00' ? 'stop-m00' : 'stop-m01';
    stopHud.textContent = stopType === 'm00' ? '⏹ PROGRAM STOP — M00' : '⏸ OPTIONAL STOP — M01';
    stopHud.style.display = 'flex';
    stopHud.dataset.on = '1';
  } else {
    stopHud.style.display = 'none';
    stopHud.className = '';
    stopHud.dataset.on = '0';
  }
  if (wasStop !== !!stopType && window.VPLayout) window.VPLayout();
}
