/* On by default: G41/G42 are worked out properly from the moment the page
   opens. A program that has no G41/G42 in it is untouched — the engine hands
   the text straight back — so this costs nothing on the programs it does not
   apply to. Settings ▸ Advanced switches it off. */
let compEnabled              = true;
let compOverlayVisible       = false;
let lastCompResult           = null;
let lastCompRadiusUsed       = null;
let compSegments             = [];
let simSegments              = [];

let pocketCycleLineIndices   = new Set();

function findCompToolRadius(rawText) {
  const m = rawText.match(/\bT0*(\d+)\b/);
  let dia = null;
  if (m) {
    const tn = parseInt(m[1], 10);
    if (toolTable.has(tn)) dia = toolTable.get(tn);
  }
  if (dia == null && toolTable.size > 0) {
    dia = toolTable.values().next().value;
  }
  if (dia == null || !isFinite(dia) || dia <= 0) dia = 0.5;
  return dia / 2;
}

function detectDValues(rawText) {
  const found = new Set();
  const lines = rawText.split(/\r?\n/);
  for (const raw of lines) {

    const code = raw.replace(/\(.*?\)/g, ' ').replace(/;.*/, '').toUpperCase();

    if (!/\bG(?:12|13|41|42)\b/.test(code)) continue;
    const dMatch = code.match(/\bD(\d+)\b/);
    if (dMatch) {
      const dn = parseInt(dMatch[1], 10);
      if (!isNaN(dn)) found.add(dn);
    }
  }
  return found;
}

function dRadiusLookup(dNumber) {
  if (dNumber === 0) return 0;
  if (!dOffsetTable.has(dNumber)) return null;
  const dia = dOffsetTable.get(dNumber);
  if (dia == null || !isFinite(dia) || dia < 0) return null;
  return dia / 2;
}

function syncDOffsetTableFromProgram(rawText) {
  const detectedDs = detectDValues(rawText);
  const defaultDDia = unitMode === 'inch' ? 0.5 : 12.7;
  detectedDs.forEach(dn => {
    if (dn === 0) {
      dOffsetTable.set(0, 0);
    } else if (!dOffsetTable.has(dn)) {
      dOffsetTable.set(dn, defaultDDia);
    }
  });
  for (const dn of dOffsetTable.keys()) {
    if (!detectedDs.has(dn)) dOffsetTable.delete(dn);
  }

  if (typeof updateDOffsetTableUI === 'function' &&
      document.getElementById('d-offset-table-body')) {
    updateDOffsetTableUI();
  }
}

function parseGCodeWithComp(rawText) {

  const origSegs = parseGCode(rawText);

  for (const s of origSegs) s.origLineIdx = s.lineIdx;

  pocketCycleLineIndices = new Set();
  rawText.split(/\r?\n/).forEach((raw, idx) => {
    const code = raw.replace(/\(.*?\)/g, ' ').replace(/;.*/, '').toUpperCase();
    if (/\bG(?:12|13)\b/.test(code)) pocketCycleLineIndices.add(idx);
  });

  syncDOffsetTableFromProgram(rawText);

  if (!compEnabled || !window.CutterComp) {
    lastCompResult     = null;
    lastCompRadiusUsed = null;
    compSegments       = [];
    simSegments        = origSegs;
    return origSegs;
  }

  const radius = findCompToolRadius(rawText);
  lastCompRadiusUsed = radius;
  const result = window.CutterComp.applyToolCompensation(rawText, radius, dRadiusLookup);
  lastCompResult = result;

  const hardFail = result.gcode === '' &&
                   result.warnings.some(w => w.severity === 'err');
  if (hardFail || !result.gcode) {
    compSegments = [];
    simSegments  = origSegs;
    return origSegs;
  }

  /* parseGCode writes several globals as a side effect — the tool changes,
     the spindle changes, the drill holes and the M-code events, all keyed by
     line number in the text it was handed. Parsing the compensated text
     second therefore replaced all of them with ones numbered against lines
     that are not in the editor. Everything downstream reads those against
     the original program, so they are taken before and put back after. */
  const keep = {
    toolChanges:    (typeof toolChanges    !== 'undefined') ? toolChanges    : null,
    spindleChanges: (typeof spindleChanges !== 'undefined') ? spindleChanges : null,
    drillHoles:     (typeof allDrillHoles  !== 'undefined') ? allDrillHoles  : null,
    mCodeEvents:    (typeof allMCodeEvents !== 'undefined') ? allMCodeEvents : null,
  };
  const restore = () => {
    if (keep.toolChanges)    toolChanges    = keep.toolChanges;
    if (keep.spindleChanges) spindleChanges = keep.spindleChanges;
    if (keep.drillHoles)     allDrillHoles  = keep.drillHoles;
    if (keep.mCodeEvents)    allMCodeEvents = keep.mCodeEvents;
  };

  let compSegs;
  try {
    compSegs = parseGCode(result.gcode);
  } catch (e) {
    console.error('parsing compensated gcode failed:', e);

    parseGCode(rawText);
    compSegments = [];
    simSegments  = origSegs;
    return origSegs;
  }
  restore();
  const map = result.compToOrig || [];
  for (const s of compSegs) {
    const orig = map[s.lineIdx];
    s.origLineIdx = (orig != null) ? orig : s.lineIdx;
  }
  compSegments = compSegs;
  simSegments  = compSegs;
  return origSegs;
}

function parseGCode(text) {
  const lines = text.split('\n');

  let x=0, y=0, z=0;
  let aDeg = 0;
  let bDeg = 0;
  let cDeg = 0;
  let isAbs = true;
  let motionMode = 0;
  let modalFeedRaw = null;
  let activePlane = 17;
  const segs = [];
  let dist = 0;

  let localUnitMode = unitMode;
  let currentTool = null;
  const localToolChanges = [];
  const detectedTools = new Set();

  let currentSpindleRPM = null;
  const localSpindleChanges = [];

  let cannedActive = false;
  let cannedCycleType = 81;
  let cannedZ = null;
  let cannedR = null;
  let cannedFeed = null;
  let cannedReturnMode = 99;
  let cannedInitialZ = null;
  let cannedDwell = 0;
  let cannedPeckQ = 0;
  const drillHoles = [];
  allDrillHoles = [];

  const mCodeEvents = [];
  allMCodeEvents = [];
  let coolantOn = false;
  let coolantState = 'off';
  let spindleOn = false;

  const getAddr = (toks, letter) => {
    const t = toks.find(t => t[0] === letter);
    return t ? parseFloat(t.slice(1)) : null;
  };
  const getAddrRaw = (toks, letter) => toks.find(t => t[0] === letter) || null;
  const applyVal = (v, prev) => isAbs ? v : prev + v;

  const parseFeed = (rawFToken) => {
    if (!rawFToken) return null;
    const str = rawFToken.slice(1);
    const val = parseFloat(str);
    if (isNaN(val) || val <= 0) return null;
    const isIPM = str.includes('.');
    return { val, isIPM, unitsPerSec: val / 60 };
  };

  const toWorld = (px, py, pz, a, b, c) => applyAllRotations(
    px, py, pz,
    a !== undefined ? a : aDeg,
    b !== undefined ? b : bDeg,
    c !== undefined ? c : cDeg
  );

  for (let li = 0; li < lines.length; li++) {
    const rawLine = lines[li];

    const rawLineNoComment = rawLine.replace(/\(.*?\)/g, '').replace(/;.*/, '');
    if (/G47/i.test(rawLineNoComment)) {
      const g47segs = parseG47Line(rawLine, x, y, z, li, parseFeed, modalFeedRaw, isAbs);
      if (g47segs && g47segs.length) {
        const last = g47segs[g47segs.length - 1];
        x = last._endX !== undefined ? last._endX : x;
        y = last._endY !== undefined ? last._endY : y;

        const codePart = rawLine.replace(/\(.*?\)/g, ' ').replace(/;.*/, '').toUpperCase();
        const rMatch = codePart.match(/R([0-9.\-]+)/);
        if (rMatch) z = parseFloat(rMatch[1]);
        segs.push(...g47segs);
        g47segs.forEach(s => dist += s.length);

        const tMatch2 = rawLine.toUpperCase().match(/\bT(\d+)\b/);
        if (tMatch2) {
          const toolNum = parseInt(tMatch2[1]);
          if (!isNaN(toolNum)) {
            currentTool = toolNum;
            detectedTools.add(toolNum);
            localToolChanges.push({ lineIdx: li, tool: toolNum });
          }
        }

        const sMatch2 = rawLine.toUpperCase().match(/\bS(\d+(?:\.\d+)?)\b/);
        if (sMatch2) {
          const rpm = parseFloat(sMatch2[1]);
          if (!isNaN(rpm)) {
            currentSpindleRPM = rpm;
            localSpindleChanges.push({ lineIdx: li, rpm });
          }
        }
        continue;
      }
    }

    let line = rawLine
      .replace(/\(.*?\)/g, ' ')
      .replace(/;.*/, '')
      .replace(/%/g, '')
      .trim()
      .toUpperCase();
    if (!line) continue;

    line = line.replace(/([0-9.\-])([A-Z])/g, '$1 $2');
    const toks = line.split(/\s+/).filter(Boolean);

    if (toks.includes('G20')) localUnitMode = 'inch';
    if (toks.includes('G21')) localUnitMode = 'mm';

    const gcodes = toks.filter(t => /^G\d/.test(t)).map(t => parseInt(t.slice(1)));

    /* Everything on a line that is a change of machine state rather than a
       move is read here, before the early exits further down.

       It used to sit below them. A line like "G43 H01 Z1.0 M08" is taken by
       the G43 branch, which applies the Z and continues straight to the next
       line — so the M08 riding along with it was never seen, and the coolant
       lamps stayed dark for the whole program. Nearly every post turns
       coolant on in the same block as the tool-length offset, so that was
       nearly every program. G53 lines swallowed their M-codes the same way. */
    const mcodes = toks.filter(t => /^M\d+$/.test(t)).map(t => parseInt(t.slice(1)));
    let lineHasStateChange = false;

    const tMatch = toks.find(t => /^T\d+$/.test(t));
    if (tMatch) {
      const toolNum = parseInt(tMatch.slice(1));
      if (!isNaN(toolNum)) {
        currentTool = toolNum;
        detectedTools.add(toolNum);
        localToolChanges.push({ lineIdx: li, tool: toolNum });
      }
    }

    const sMatch = toks.find(t => /^S\d+(\.\d+)?$/.test(t));
    if (sMatch) {
      const rpm = parseFloat(sMatch.slice(1));
      if (!isNaN(rpm)) {
        currentSpindleRPM = rpm;
        localSpindleChanges.push({ lineIdx: li, rpm });
      }
    }

    if (mcodes.includes(7) || mcodes.includes(8)) {
      const newState = mcodes.includes(8) ? 'flood' : 'mist';
      if (coolantState !== newState) {
        mCodeEvents.push({ lineIdx: li, type: 'coolant', state: newState });
        coolantState = newState;
        coolantOn = true;
      }
      lineHasStateChange = true;
    }
    if (mcodes.includes(9) && coolantOn) {
      mCodeEvents.push({ lineIdx: li, type: 'coolant', state: 'off' });
      coolantOn = false;
      coolantState = 'off';
      lineHasStateChange = true;
    }

    if (mcodes.includes(3) || mcodes.includes(4)) {
      const dir = mcodes.includes(4) ? 'ccw' : 'cw';
      if (!spindleOn) {
        mCodeEvents.push({ lineIdx: li, type: 'spindle', state: 'on', dir });
        spindleOn = true;
      }
      lineHasStateChange = true;
    }
    if (mcodes.includes(5) && spindleOn) {
      mCodeEvents.push({ lineIdx: li, type: 'spindle', state: 'off' });
      spindleOn = false;
      lineHasStateChange = true;
    }

    if (gcodes.includes(90)) isAbs = true;
    if (gcodes.includes(91)) isAbs = false;
    if (gcodes.includes(17)) activePlane = 17;
    if (gcodes.includes(18)) activePlane = 18;
    if (gcodes.includes(19)) activePlane = 19;
    if (gcodes.includes(98)) cannedReturnMode = 98;
    if (gcodes.includes(99)) cannedReturnMode = 99;

    if (gcodes.includes(80)) {
      cannedActive = false;
      cannedCycleType = 81;
      cannedZ = null; cannedR = null; cannedFeed = null;
      cannedDwell = 0; cannedPeckQ = 0;
    }

    if (gcodes.includes(53)) {
      const wCur = toWorld(x, y, z);
      segs.push({ start: wCur.clone(), end: wCur.clone(), type: 'rapid', lineIdx: li,
        feedRate: 0, feedIsIPM: false, feedLabel: 'G53 Machine Coord Move (suppressed)',
        length: 0, duration: 0.001, isMarker: true });
      continue;
    }

    if (gcodes.includes(43) || gcodes.includes(44) || gcodes.includes(49)) {
      const zVal = getAddr(toks, 'Z');
      if (zVal !== null) z = isAbs ? zVal : z + zVal;
      continue;
    }

    const motionCodes = [0,1,2,3];
    const foundMotion = gcodes.find(g => motionCodes.includes(g));
    if (foundMotion !== undefined) motionMode = foundMotion;

    const fTok = getAddrRaw(toks, 'F');
    if (fTok) modalFeedRaw = fTok;

    let lineHasStopOrEndSeg = false;

    if (mcodes.includes(0)) {
      mCodeEvents.push({ lineIdx: li, type: 'm00' });
      const wCur = toWorld(x, y, z);
      const stopSeg = { start: wCur.clone(), end: wCur.clone(), type: 'rapid', lineIdx: li,
        feedRate: 0, feedIsIPM: false, feedLabel: 'M00 Program Stop',
        length: 0, duration: 0.001, isStop: true, stopType: 'm00' };
      segs.push(stopSeg);
      lineHasStopOrEndSeg = true;
      console.log('[M00] stop seg pushed at lineIdx', li, 'segs.length now', segs.length);
    }
    if (mcodes.includes(1)) {
      mCodeEvents.push({ lineIdx: li, type: 'm01' });
      const wCur = toWorld(x, y, z);
      const stopSeg = { start: wCur.clone(), end: wCur.clone(), type: 'rapid', lineIdx: li,
        feedRate: 0, feedIsIPM: false, feedLabel: 'M01 Optional Stop',
        length: 0, duration: 0.001, isStop: true, stopType: 'm01' };
      segs.push(stopSeg);
      lineHasStopOrEndSeg = true;
      console.log('[M01] stop seg pushed at lineIdx', li, 'segs.length now', segs.length);
    }

    if (mcodes.includes(30) || mcodes.includes(2)) {
      const wCur = toWorld(x, y, z);
      const label = mcodes.includes(30) ? 'M30 Program End + Rewind' : 'M02 Program End';
      const etype = mcodes.includes(30) ? 'm30' : 'm02';
      segs.push({ start: wCur.clone(), end: wCur.clone(), type: 'rapid', lineIdx: li,
        feedRate: 0, feedIsIPM: false, feedLabel: label,
        length: 0, duration: 0.001, isStop: false, isEnd: true, endType: etype });
      lineHasStopOrEndSeg = true;
    }

    if (lineHasStateChange && !lineHasStopOrEndSeg) {
      const wCur = toWorld(x, y, z);
      segs.push({ start: wCur.clone(), end: wCur.clone(), type: 'rapid', lineIdx: li,
        feedRate: 0, feedIsIPM: false, feedLabel: 'M-code state change',
        length: 0, duration: 0.001, isMarker: true });
    }

    const hasX = getAddr(toks, 'X') !== null;
    const hasY = getAddr(toks, 'Y') !== null;
    const hasZ = getAddr(toks, 'Z') !== null;
    const hasA = getAddr(toks, 'A') !== null;
    const hasB = getAddr(toks, 'B') !== null;
    const hasC = getAddr(toks, 'C') !== null;
    const hasR = getAddr(toks, 'R') !== null;
    const hasI = getAddr(toks, 'I') !== null;
    const hasJ = getAddr(toks, 'J') !== null;
    const hasK = getAddr(toks, 'K') !== null;

    const activatingCanned = gcodes.find(g => [81,82,83,84].includes(g));
    if (activatingCanned !== undefined) {
      cannedActive = true;
      cannedCycleType = activatingCanned;
      cannedInitialZ = z;
      if (hasZ)  cannedZ    = isAbs ? getAddr(toks,'Z') : z + getAddr(toks,'Z');
      if (hasR)  cannedR    = isAbs ? getAddr(toks,'R') : z + getAddr(toks,'R');
      if (fTok)  cannedFeed = parseFeed(fTok);

      cannedDwell = getAddr(toks, 'P') || 0;

      cannedPeckQ = getAddr(toks, 'Q') || 0;
    }

    if (cannedActive && cannedZ !== null && cannedR !== null) {
      const hx = hasX ? applyVal(getAddr(toks,'X'), x) : x;
      const hy = hasY ? applyVal(getAddr(toks,'Y'), y) : y;
      const posChanged = (hx !== x || hy !== y) || [81,82,83,84].includes(gcodes.find(g=>[81,82,83,84].includes(g)));
      if (posChanged) {
        const zDepth  = cannedZ;
        const zReturn = cannedReturnMode === 98 ? cannedInitialZ : cannedR;
        const feed    = cannedFeed || parseFeed(modalFeedRaw) || { val:60, isIPM:false, unitsPerSec:1 };
        const toolDia = currentTool ? (toolTable.get(currentTool) || 0.5) : 0.5;

        const wPrev   = toWorld(x,  y,  z);
        const wXY     = toWorld(hx, hy, z);
        const wR      = toWorld(hx, hy, cannedR);
        const wDepth  = toWorld(hx, hy, cannedZ);
        const wReturn = toWorld(hx, hy, zReturn);

        if (hx !== x || hy !== y) {
          const rLen = wPrev.distanceTo(wXY);
          segs.push({ start: wPrev, end: wXY, type:'rapid', lineIdx:li,
            feedRate:300, feedIsIPM:true, feedLabel:'300 IPM (rapid)', length:rLen, duration:rLen/5 });
          dist += rLen;
        }

        const rapLen = wXY.distanceTo(wR);
        if (rapLen > 0.0001) {
          segs.push({ start: wXY, end: wR, type:'rapid', lineIdx:li,
            feedRate:300, feedIsIPM:true, feedLabel:'300 IPM (rapid)', length:rapLen, duration:rapLen/5 });
          dist += rapLen;
        }

        var peckIntermediateDepths = [];

        if (cannedCycleType === 81) {

          const drillLen = wR.distanceTo(wDepth);
          segs.push({ start: wR, end: wDepth, type:'cut', lineIdx:li,
            feedRate:feed.val, feedIsIPM:feed.isIPM, feedLabel:feed.val+(feed.isIPM?' IPM':' mm/min'),
            length:drillLen, duration:drillLen/feed.unitsPerSec });
          dist += drillLen;
          const retLen = wDepth.distanceTo(wReturn);
          segs.push({ start: wDepth, end: wReturn, type:'retract', lineIdx:li,
            feedRate:300, feedIsIPM:true, feedLabel:'300 IPM (rapid)', length:retLen, duration:retLen/5 });
          dist += retLen;

        } else if (cannedCycleType === 82) {

          const drillLen = wR.distanceTo(wDepth);
          segs.push({ start: wR, end: wDepth, type:'cut', lineIdx:li,
            feedRate:feed.val, feedIsIPM:feed.isIPM, feedLabel:feed.val+(feed.isIPM?' IPM':' mm/min'),
            length:drillLen, duration:drillLen/feed.unitsPerSec });
          dist += drillLen;

          const dwellSec = (cannedDwell || 0) / 1000;
          if (dwellSec > 0) {
            segs.push({ start: wDepth.clone(), end: wDepth.clone(), type:'cut', lineIdx:li,
              feedRate:0, feedIsIPM:feed.isIPM, feedLabel:`Dwell ${cannedDwell}ms`,
              length:0, duration:dwellSec });
          }
          const retLen = wDepth.distanceTo(wReturn);
          segs.push({ start: wDepth, end: wReturn, type:'retract', lineIdx:li,
            feedRate:300, feedIsIPM:true, feedLabel:'300 IPM (rapid)', length:retLen, duration:retLen/5 });
          dist += retLen;

        } else if (cannedCycleType === 83) {

          const peckQ = Math.abs(cannedPeckQ) || Math.abs(cannedR - cannedZ) / 3;
          let currentDepth = cannedR;
          let peckNum = 0;

          while (currentDepth > zDepth + 0.0001) {
            peckNum++;
            const nextDepth = Math.max(zDepth, currentDepth - peckQ);
            const wPeckStart = toWorld(hx, hy, currentDepth);
            const wPeckEnd   = toWorld(hx, hy, nextDepth);

            const peckLen = wPeckStart.distanceTo(wPeckEnd);
            segs.push({ start: wPeckStart, end: wPeckEnd, type:'cut', lineIdx:li,
              feedRate:feed.val, feedIsIPM:feed.isIPM, feedLabel:feed.val+(feed.isIPM?' IPM':' mm/min')+` (peck ${peckNum})`,
              length:peckLen, duration:peckLen/feed.unitsPerSec });
            dist += peckLen;
            if (nextDepth > zDepth + 0.0001) {

              peckIntermediateDepths.push(nextDepth);

              const wRetractTo = wR.clone();
              const retractLen = wPeckEnd.distanceTo(wRetractTo);
              segs.push({ start: wPeckEnd, end: wRetractTo, type:'retract', lineIdx:li,
                feedRate:300, feedIsIPM:true, feedLabel:'300 IPM (peck retract)',
                length:retractLen, duration:retractLen/5 });
              dist += retractLen;

              const wRapidTo = toWorld(hx, hy, nextDepth + 0.02);
              const rapidBackLen = wRetractTo.distanceTo(wRapidTo);
              segs.push({ start: wRetractTo, end: wRapidTo, type:'rapid', lineIdx:li,
                feedRate:300, feedIsIPM:true, feedLabel:'300 IPM (rapid to peck)',
                length:rapidBackLen, duration:rapidBackLen/5 });
              dist += rapidBackLen;
              currentDepth = nextDepth + 0.02;
            } else {
              currentDepth = nextDepth;
            }
          }

          const wFinalDepth = toWorld(hx, hy, zDepth);
          const finalRetLen = wFinalDepth.distanceTo(wReturn);
          segs.push({ start: wFinalDepth, end: wReturn, type:'retract', lineIdx:li,
            feedRate:300, feedIsIPM:true, feedLabel:'300 IPM (rapid)', length:finalRetLen, duration:finalRetLen/5 });
          dist += finalRetLen;

        } else if (cannedCycleType === 84) {

          const drillLen = wR.distanceTo(wDepth);
          segs.push({ start: wR, end: wDepth, type:'cut', lineIdx:li,
            feedRate:feed.val, feedIsIPM:feed.isIPM, feedLabel:feed.val+(feed.isIPM?' IPM':' mm/min')+' (tap in)',
            length:drillLen, duration:drillLen/feed.unitsPerSec });
          dist += drillLen;

          const retLen = wDepth.distanceTo(wReturn);
          segs.push({ start: wDepth, end: wReturn, type:'retract', lineIdx:li,
            feedRate:feed.val, feedIsIPM:feed.isIPM, feedLabel:feed.val+(feed.isIPM?' IPM':' mm/min')+' (tap out)',
            length:retLen, duration:retLen/feed.unitsPerSec });
          dist += retLen;
        }

        const peckDepths = peckIntermediateDepths.map(d => toWorld(hx, hy, d));
        drillHoles.push({ x: hx, y: hy, zTop: zReturn, zDepth, zReturn,
          returnMode: cannedReturnMode, toolDia, lineIdx: li, aDeg,
          cycleType: cannedCycleType,
          wTop: toWorld(hx, hy, zReturn), wDepth: toWorld(hx, hy, zDepth), wReturn,
          peckDepths });

        x = hx; y = hy; z = zReturn;
        continue;
      }
    }

    if (gcodes.includes(12) || gcodes.includes(13)) {
      const clockwisePocket = gcodes.includes(12);
      const iVal = getAddr(toks, 'I');
      const kVal = getAddr(toks, 'K');
      const qVal = getAddr(toks, 'Q');
      const g12HasZ = getAddr(toks, 'Z') !== null;
      const zVal = g12HasZ ? (isAbs ? getAddr(toks,'Z') : z + getAddr(toks,'Z')) : z;
      const lVal = getAddr(toks, 'L') || 1;
      const feed = parseFeed(fTok || modalFeedRaw) || { val:60, isIPM:false, unitsPerSec:1 };
      const feedLabel = feed.val + (feed.isIPM ? ' IPM' : ' mm/min');

      if (iVal !== null && iVal > 0) {

        if (zVal !== z) {
          const wPlungeStart = toWorld(x, y, z);
          const wPlungeEnd   = toWorld(x, y, zVal);
          const plungeLen = wPlungeStart.distanceTo(wPlungeEnd);
          segs.push({ start: wPlungeStart, end: wPlungeEnd, type:'cut', lineIdx:li,
            feedRate:feed.val, feedIsIPM:feed.isIPM, feedLabel, length:plungeLen,
            duration:plungeLen/feed.unitsPerSec });
          dist += plungeLen;
        }

        const radii = [];
        if (kVal !== null && qVal !== null && qVal > 0) {
          for (let r = iVal; r < kVal - 0.0001; r += qVal) radii.push(r);
          radii.push(kVal);
        } else {
          radii.push(iVal);
        }

        radii.forEach((r, idx) => {
          const startPt  = new THREE.Vector3(x + r, y, zVal);
          const endPt    = startPt.clone();
          const centerPt = new THREE.Vector3(x, y, zVal);

          const prevR = idx === 0 ? 0 : radii[idx - 1];
          const wPrevEnd = toWorld(x + prevR, y, zVal);
          const wStart   = toWorld(x + r, y, zVal);
          const stepLen  = wPrevEnd.distanceTo(wStart);
          if (stepLen > 0.0001) {
            segs.push({ start: wPrevEnd, end: wStart, type:'cut', lineIdx:li,
              feedRate:feed.val, feedIsIPM:feed.isIPM, feedLabel,
              length:stepLen, duration:stepLen/feed.unitsPerSec });
            dist += stepLen;
          }

          const arcSegs = generateArcSegments(
            startPt, endPt, centerPt, r, clockwisePocket, zVal, feed, 'cut', li, 17
          );
          arcSegs.forEach(s => {
            s.start = toWorld(s.start.x, s.start.y, s.start.z);
            s.end   = toWorld(s.end.x,   s.end.y,   s.end.z);
          });
          segs.push(...arcSegs);
          arcSegs.forEach(s => dist += s.length);
        });

        const lastR  = radii[radii.length - 1];
        const wLastEnd = toWorld(x + lastR, y, zVal);
        const wCenter  = toWorld(x, y, zVal);
        const retLen   = wLastEnd.distanceTo(wCenter);
        if (retLen > 0.0001) {
          segs.push({ start: wLastEnd, end: wCenter, type: 'cut', lineIdx: li,
            feedRate: feed.val, feedIsIPM: feed.isIPM, feedLabel,
            length: retLen, duration: retLen / feed.unitsPerSec });
          dist += retLen;
        }

        z = zVal;
      }
      continue;
    }

    if ((hasA || hasB || hasC) && !cannedActive) {
      const na = hasA ? applyVal(getAddr(toks,'A'), aDeg) : aDeg;
      const nb = hasB ? applyVal(getAddr(toks,'B'), bDeg) : bDeg;
      const nc = hasC ? applyVal(getAddr(toks,'C'), cDeg) : cDeg;
      const nx = hasX ? applyVal(getAddr(toks,'X'), x) : x;
      const ny = hasY ? applyVal(getAddr(toks,'Y'), y) : y;
      const nz = hasZ ? applyVal(getAddr(toks,'Z'), z) : z;

      const isRapid = motionMode === 0;
      const xyzMoves = (nx !== x || ny !== y || nz !== z);
      const rotMoves = (na !== aDeg || nb !== bDeg || nc !== cDeg);

      if (xyzMoves || rotMoves) {
        let type, feed;
        if (isRapid || !xyzMoves) {
          type = xyzMoves ? 'rapid' : 'arot';
          feed = { val:300, isIPM:true, unitsPerSec:5, feedLabel:'300 IPM (rapid)' };
        } else {
          type = 'cut';
          const pf = parseFeed(modalFeedRaw) || { val:60, isIPM:false, unitsPerSec:1 };
          feed = { ...pf, feedLabel: pf.val + (pf.isIPM ? ' IPM' : ' mm/min') };
        }

        const simSegs = generateSimultaneousSegs(
          x, y, z, aDeg, nx, ny, nz, na, type, feed, li,
          bDeg, nb, cDeg, nc
        );
        segs.push(...simSegs);
        simSegs.forEach(s => dist += s.length);
      }

      x=nx; y=ny; z=nz; aDeg=na; bDeg=nb; cDeg=nc;
      continue;
    }

    if (!hasX && !hasY && !hasZ && !hasI && !hasJ && !hasK) continue;
    if (cannedActive) continue;
    if (motionMode > 3) continue;

    const isArc = (motionMode === 2 || motionMode === 3);
    const nx = hasX ? applyVal(getAddr(toks,'X'), x) : x;
    const ny = hasY ? applyVal(getAddr(toks,'Y'), y) : y;
    const nz = hasZ ? applyVal(getAddr(toks,'Z'), z) : z;

    if (!isArc) {
      if (nx !== x || ny !== y || nz !== z) {
        const isRapid = motionMode === 0;
        const type = isRapid ? (nz > z ? 'retract' : 'rapid') : 'cut';
        const wStart = toWorld(x, y, z);
        const wEnd   = toWorld(nx, ny, nz);
        const length = wStart.distanceTo(wEnd);
        dist += length;

        let feed, feedLabel;
        if (isRapid) {
          feed = { val: 300, isIPM: true, unitsPerSec: 5 };
          feedLabel = '300 IPM (rapid)';
        } else {
          feed = parseFeed(modalFeedRaw);
          if (!feed) feed = { val: 60, isIPM: false, unitsPerSec: 1 };
          feedLabel = feed.val + (feed.isIPM ? ' IPM' : ' mm/min');
        }
        const duration = length / feed.unitsPerSec;
        segs.push({ start: wStart, end: wEnd, type, lineIdx: li,
          feedRate: feed.val, feedIsIPM: feed.isIPM, feedLabel, length, duration });
      }
      x=nx; y=ny; z=nz;
      continue;
    }

    const startPart = new THREE.Vector3(x, y, z);
    const endPart   = new THREE.Vector3(nx, ny, nz);
    let center = new THREE.Vector3();
    let radius;
    const clockwise = (motionMode === 2);
    let feed = parseFeed(modalFeedRaw);
    if (!feed) feed = { val: 60, isIPM: false, unitsPerSec: 1 };
    const feedLabel = feed.val + (feed.isIPM ? ' IPM' : ' mm/min');

    if (hasR) {
      const rVal = getAddr(toks, 'R');
      const R = Math.abs(rVal);
      const dx = nx-x, dy = ny-y;
      const d = Math.sqrt(dx*dx+dy*dy);
      if (d > 2*R) { x=nx; y=ny; z=nz; continue; }
      const h = Math.sqrt(R*R-(d/2)*(d/2));
      const mx=(x+nx)/2, my=(y+ny)/2;

      const largeArc = rVal < 0;

      const perpX=-dy, perpY=dx;
      const norm=Math.sqrt(perpX*perpX+perpY*perpY);

      const signFinal = (clockwise !== largeArc) ? -1 : 1;
      if (norm>0){center.x=mx+signFinal*h*perpX/norm;center.y=my+signFinal*h*perpY/norm;}
      else{center.x=mx;center.y=my;}
      center.z=startPart.z; radius=R;
    } else {
      const i=hasI?getAddr(toks,'I'):0, j=hasJ?getAddr(toks,'J'):0, k=hasK?getAddr(toks,'K'):0;
      if (activePlane===17){
        center.x=x+i;center.y=y+j;center.z=z;
        radius=Math.sqrt((x-center.x)**2+(y-center.y)**2);
      } else if (activePlane===18){
        center.x=x+i;center.y=y;center.z=z+k;
        radius=Math.sqrt((x-center.x)**2+(z-center.z)**2);
      } else {
        center.x=x;center.y=y+j;center.z=z+k;
        radius=Math.sqrt((y-center.y)**2+(z-center.z)**2);
      }
    }
    if (radius<=0){x=nx;y=ny;z=nz;continue;}

    const partArcSegs = generateArcSegments(startPart,endPart,center,radius,clockwise,nz,feed,'cut',li,activePlane);

    partArcSegs.forEach(s => {
      s.start = toWorld(s.start.x, s.start.y, s.start.z);
      s.end   = toWorld(s.end.x, s.end.y, s.end.z);
      if (s.center) s.center = toWorld(s.center.x, s.center.y, s.center.z);
    });
    segs.push(...partArcSegs);
    partArcSegs.forEach(s => dist += s.length);
    x=nx; y=ny; z=nz;
  }

  totalDistance = dist;
  unitMode = localUnitMode;
  toolChanges = localToolChanges;
  spindleChanges = localSpindleChanges;
  allDrillHoles = drillHoles;
  allMCodeEvents = mCodeEvents;

  const defaultDia = unitMode === 'inch' ? 0.5 : 12.7;
  detectedTools.forEach(tool => { if (!toolTable.has(tool)) toolTable.set(tool, defaultDia); });
  for (let tool of toolTable.keys()) { if (!detectedTools.has(tool)) toolTable.delete(tool); }
  updateToolTableUI();

  return segs;
}
