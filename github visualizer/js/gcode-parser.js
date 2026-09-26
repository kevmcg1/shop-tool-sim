function generateArcSegments(start, end, center, radius, clockwise, zEnd, feed, type, lineIdx, plane) {
  plane = plane || 17;
  const segments = [];

  const effectiveCW = (plane === 18) ? !clockwise : clockwise;

  let startAngle, endAngle;
  if (plane === 17) {
    startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    endAngle   = Math.atan2(end.y   - center.y, end.x   - center.x);
  } else if (plane === 18) {
    startAngle = Math.atan2(start.z - center.z, start.x - center.x);
    endAngle   = Math.atan2(end.z   - center.z, end.x   - center.x);
  } else {
    startAngle = Math.atan2(start.z - center.z, start.y - center.y);
    endAngle   = Math.atan2(end.z   - center.z, end.y   - center.y);
  }

  let deltaAngle = endAngle - startAngle;
  if (effectiveCW) {
    if (deltaAngle > 0) deltaAngle -= 2 * Math.PI;
    if (Math.abs(deltaAngle) < 1e-10) deltaAngle = -2 * Math.PI;
  } else {
    if (deltaAngle < 0) deltaAngle += 2 * Math.PI;
    if (Math.abs(deltaAngle) < 1e-10) deltaAngle = 2 * Math.PI;
  }

  const totalAngle = Math.abs(deltaAngle);
  const arcLength = radius * totalAngle;
  const duration = arcLength / feed.unitsPerSec;
  const step = Math.min(0.1, totalAngle / 20);
  const numSteps = Math.max(1, Math.ceil(totalAngle / step));
  const angleStep = deltaAngle / numSteps;
  let prevPoint = start.clone();

  for (let i = 1; i <= numSteps; i++) {
    const t = i / numSteps;
    const angle = startAngle + angleStep * i;
    let pt;
    if (plane === 17) {
      pt = new THREE.Vector3(
        center.x + radius * Math.cos(angle),
        center.y + radius * Math.sin(angle),
        start.z + (zEnd - start.z) * t
      );
    } else if (plane === 18) {
      pt = new THREE.Vector3(
        center.x + radius * Math.cos(angle),
        start.y + (end.y - start.y) * t,
        center.z + radius * Math.sin(angle)
      );
    } else {
      pt = new THREE.Vector3(
        start.x + (end.x - start.x) * t,
        center.y + radius * Math.cos(angle),
        center.z + radius * Math.sin(angle)
      );
    }
    const segLength = prevPoint.distanceTo(pt);
    const segDuration = duration / numSteps;
    segments.push({
      start: prevPoint.clone(),
      end: pt.clone(),
      type,
      lineIdx,
      feedRate: feed.val,
      feedIsIPM: feed.isIPM,
      feedLabel: feed.val + (feed.isIPM ? ' IPM' : ' mm/min'),
      length: segLength,
      duration: segDuration,
      center: center.clone(),
    });
    prevPoint.copy(pt);
  }
  return segments;
}

function applyARotation(px, py, pz, aDeg) {
  const a = aDeg * Math.PI / 180;
  const cos = Math.cos(a), sin = Math.sin(a);

  return new THREE.Vector3(
    px,
    py * cos + pz * sin,
    -py * sin + pz * cos
  );
}

function applyBRotation(px, py, pz, bDeg) {
  const b = bDeg * Math.PI / 180;
  const cos = Math.cos(b), sin = Math.sin(b);
  return new THREE.Vector3(
    px * cos - pz * sin,
    py,
    px * sin + pz * cos
  );
}

function applyCRotation(px, py, pz, cDeg) {
  const c = cDeg * Math.PI / 180;
  const cos = Math.cos(c), sin = Math.sin(c);
  return new THREE.Vector3(
    px * cos - py * sin,
    px * sin + py * cos,
    pz
  );
}

function applyAllRotations(px, py, pz, aDeg, bDeg, cDeg) {

  if (rotaryMode === 'part') return new THREE.Vector3(px, py, pz);

  const o = rotaryPivot;
  let p = applyARotation(px - o.x, py - o.y, pz - o.z, aDeg);
  p = applyBRotation(p.x, p.y, p.z, bDeg);
  p = applyCRotation(p.x, p.y, p.z, cDeg);
  return p.add(o);
}

function generateSimultaneousSegs(x0, y0, z0, a0, x1, y1, z1, a1, type, feed, lineIdx, b0, b1, c0, c1) {
  b0 = b0 || 0; b1 = b1 || 0;
  c0 = c0 || 0; c1 = c1 || 0;
  const rotDelta = Math.max(Math.abs(a1 - a0), Math.abs(b1 - b0), Math.abs(c1 - c0));

  const steps = rotDelta > 0.01
    ? Math.max(4, Math.ceil(rotDelta / 0.5))
    : 1;
  const segs = [];
  const ROT_DEG_PER_SEC = 60;
  let prevW = applyAllRotations(x0, y0, z0, a0, b0, c0);
  let prevA = a0, prevB = b0, prevC = c0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ix = x0 + (x1 - x0) * t;
    const iy = y0 + (y1 - y0) * t;
    const iz = z0 + (z1 - z0) * t;
    const ia = a0 + (a1 - a0) * t;
    const ib = b0 + (b1 - b0) * t;
    const ic = c0 + (c1 - c0) * t;
    const nextW = applyAllRotations(ix, iy, iz, ia, ib, ic);
    const len = prevW.distanceTo(nextW);

    const swing = Math.abs(ia - prevA) + Math.abs(ib - prevB) + Math.abs(ic - prevC);
    const linear = len > 0.0001 ? len / feed.unitsPerSec : 0;
    segs.push({
      start: prevW.clone(), end: nextW.clone(),
      type, lineIdx,
      feedRate: feed.val, feedIsIPM: feed.isIPM, feedLabel: feed.feedLabel || (feed.val + (feed.isIPM ? ' IPM' : ' mm/min')),
      length: len,
      duration: Math.max(linear, swing / ROT_DEG_PER_SEC, 0.001),
      aDegEnd: ia, bDegEnd: ib, cDegEnd: ic
    });
    prevW = nextW; prevA = ia; prevB = ib; prevC = ic;
  }
  return segs;
}

function generateARotationSegs(px, py, pz, aDegStart, aDegEnd, lineIdx) {
  return generateSimultaneousSegs(
    px, py, pz, aDegStart,
    px, py, pz, aDegEnd,
    'arot',
    { val: 300, isIPM: true, unitsPerSec: 5, feedLabel: 'A-axis index' },
    lineIdx
  );
}
