const _segOrig = (seg) => (seg.origLineIdx != null) ? seg.origLineIdx : seg.lineIdx;

function getLineIdxAtTime(t) {
  if (!segTimeline.length) return -1;
  for (let i = 0; i < segTimeline.length; i++) {
    const { tStart, tEnd, seg } = segTimeline[i];
    if (t >= tStart && t < tEnd) return _segOrig(seg);
    if (t < tStart) return i > 0 ? _segOrig(segTimeline[i-1].seg) : _segOrig(seg);
  }
  return _segOrig(segTimeline[segTimeline.length-1].seg);
}

function getBlockEndTime(lineIdx) {
  let tEnd = null;
  for (let i = 0; i < segTimeline.length; i++) {
    if (_segOrig(segTimeline[i].seg) === lineIdx) tEnd = segTimeline[i].tEnd;
    else if (tEnd !== null) break;
  }
  return tEnd;
}

function getBlockStartTime(lineIdx) {
  for (let i = 0; i < segTimeline.length; i++) {
    if (_segOrig(segTimeline[i].seg) === lineIdx) return segTimeline[i].tStart;
  }
  return null;
}

/* The end of the first block that has not finished by time t. Toolpath mode
   plays on these: the cutter stands on one line, then lands on the end of the
   next, the way NCViewer walks a program. */
function nextBlockEndTime(t) {
  if (!segTimeline.length) return simTotalTime;
  const eps = 1e-6;
  for (let i = 0; i < segTimeline.length; i++) {
    if (segTimeline[i].tEnd <= t + eps) continue;
    const line = _segOrig(segTimeline[i].seg);
    let end = segTimeline[i].tEnd;
    for (let j = i + 1; j < segTimeline.length; j++) {
      if (_segOrig(segTimeline[j].seg) !== line) break;
      end = segTimeline[j].tEnd;
    }
    return end;
  }
  return simTotalTime;
}

function stepNextBlock() {
  if (!segTimeline.length) return;
  const currentLine = getLineIdxAtTime(simTime);
  let targetTime = getBlockEndTime(currentLine);
  if (targetTime === null || targetTime <= simTime) {

    targetTime = simTotalTime;
  }

  simPlaying = false;
  simActive = true;
  singleBlockTargetTime = null;
  hideProgramComplete();
  simSeekToTime(targetTime);
}

function stepPrevBlock() {
  if (!segTimeline.length) return;
  const currentLine = getLineIdxAtTime(simTime);

  const currentBlockStart = getBlockStartTime(currentLine);

  if (currentBlockStart !== null && simTime - currentBlockStart > 0.001) {
    simPlaying = false;
    simActive = true;
    singleBlockTargetTime = null;
    hideProgramComplete();
    simSeekToTime(currentBlockStart);
    return;
  }

  let prevLine = -1;
  for (let i = segTimeline.length - 1; i >= 0; i--) {
    const { tEnd, seg } = segTimeline[i];
    const so = _segOrig(seg);
    if (tEnd <= simTime && so !== currentLine) { prevLine = so; break; }
  }
  if (prevLine < 0) {

    simPlaying = false;
    simActive = false;
    singleBlockTargetTime = null;
    updateEditorActiveLine(-1);
    simSeekToTime(0);
    return;
  }
  const targetTime = getBlockStartTime(prevLine);
  if (targetTime === null) return;
  simPlaying = false;
  simActive = true;
  singleBlockTargetTime = null;
  hideProgramComplete();
  simSeekToTime(targetTime);
}

/* The source line of the first block that has not finished by time t. */
function nextBlockLine(t) {
  const eps = 1e-6;
  for (let i = 0; i < segTimeline.length; i++) {
    if (segTimeline[i].tEnd <= t + eps) continue;
    return _segOrig(segTimeline[i].seg);
  }
  return -1;
}

/* ------------------------------------------------------------------------ *
 * Single block — one source line per press, and no line skipped.
 *
 * Single block used to walk the timeline rather than the program: Play looked
 * for "the next block that has not finished yet", which is a segment, and
 * segments only exist for lines that move something. So a tool change, an
 * M08, a G43 or a bare comment was stepped straight over — press Play once
 * and the cutter would be three lines further down the program than the
 * button had any right to put it. That is the skipping.
 *
 * It now walks gcodeInput line by line. Every line gets its own press,
 * whether or not it moves the cutter; a line that moves nothing simply moves
 * the highlight and leaves the machine where it stands, which is exactly what
 * single block on a control does.
 * ------------------------------------------------------------------------ */

/* Where each source line begins and ends on the clock. Built in one pass and
   kept until the timeline is rebuilt under it. */
let _spanCache = null, _spanKey = "";
function lineSpans() {
  const n = segTimeline.length;
  const key = n + ':' + (n ? segTimeline[n - 1].tEnd : 0) + ':' + (n ? segTimeline[0].tStart : 0);
  if (_spanCache && _spanKey === key) return _spanCache;

  const m = new Map();
  for (let i = 0; i < n; i++) {
    const { tStart, tEnd, seg } = segTimeline[i];
    const line = _segOrig(seg);
    const rec = m.get(line);
    if (!rec) m.set(line, { start: tStart, end: tEnd });
    else {
      if (tStart < rec.start) rec.start = tStart;
      if (tEnd   > rec.end)   rec.end   = tEnd;
    }
  }
  _spanCache = m; _spanKey = key;
  return m;
}

function sourceLineCount() {
  if (typeof gcodeInput === 'undefined' || !gcodeInput) return 0;
  return gcodeInput.value.split('\n').length;
}

/* The clock reading that means "everything up to and including this line has
   run". A line that moves nothing borrows the reading from the last line
   before it that did. */
function timeAfterLine(line) {
  const spans = lineSpans();
  for (let l = line; l >= 0; l--) {
    const s = spans.get(l);
    if (s) return s.end;
  }
  return 0;
}

/* Feed rate mode travels; Toolpath mode steps. Single block follows whichever
   is selected rather than always stepping. */
const singleBlockTravels = () =>
  (typeof pathColorMode !== 'undefined') && pathColorMode === 'feed';

/* Put the run on `line`. `travel` runs that one line at its programmed feed
   and stops at the end of it; otherwise it lands there straight away. */
function singleBlockGoToLine(line, travel) {
  const total = sourceLineCount();
  if (!total) return false;
  if (line < 0) line = 0;
  if (line > total - 1) return false;

  singleBlockCurrentSourceLine = line;
  const span = lineSpans().get(line);

  try { if (typeof StockShowcase !== 'undefined') StockShowcase.clear(true); } catch (e) {   }
  hideProgramComplete();

  if (span && travel && span.end > span.start + 1e-9) {
    /* Start of this line, then run it. The clamp that stops at the end lives
       in the frame loop and watches singleBlockTargetTime. */
    simActive = true;
    if (Math.abs(simTime - span.start) > 1e-6) simSeekToTime(span.start);
    singleBlockTargetTime = span.end;
    simPlaying = true;
    if (typeof blockBeat !== 'undefined') blockBeat = BLOCK_BEAT;
  } else {
    simPlaying = false;
    simActive = true;
    singleBlockTargetTime = null;
    simSeekToTime(span ? span.end : timeAfterLine(line));
  }

  /* Seeking repaints the highlight from the clock, which for a line that
     moves nothing would land on the previous line. The line we were asked
     for wins. */
  updateEditorActiveLine(line);
  if (typeof PlaybackUI !== 'undefined' && PlaybackUI.refresh) PlaybackUI.refresh();
  return true;
}

function singleBlockStep(travel) {
  const total = sourceLineCount();
  if (!total) return false;
  const next = singleBlockCurrentSourceLine < 0 ? 0 : singleBlockCurrentSourceLine + 1;
  if (next > total - 1) return false;
  return singleBlockGoToLine(next, !!travel);
}

function singleBlockStepBack() {
  if (singleBlockCurrentSourceLine <= 0) {
    singleBlockCurrentSourceLine = -1;
    simPlaying = false;
    simActive = false;
    singleBlockTargetTime = null;
    updateEditorActiveLine(-1);
    simSeekToTime(0);
    if (typeof PlaybackUI !== 'undefined' && PlaybackUI.refresh) PlaybackUI.refresh();
    return;
  }
  singleBlockGoToLine(singleBlockCurrentSourceLine - 1, false);
}

document.getElementById('btn-sim-next').addEventListener('click', () => {
  if (singleBlockMode) {
    /* Next is a step in both modes — it is the button for skipping ahead.
       Play is the one that travels. */
    singleBlockStep(false);
    return;
  }
  stepNextBlock();
});
document.getElementById('btn-sim-prev').addEventListener('click', () => {
  if (singleBlockMode) { singleBlockStepBack(); return; }
  stepPrevBlock();
});

const btnSingleBlock = document.getElementById('btn-single-block');
btnSingleBlock.addEventListener('click', () => {
  singleBlockMode = !singleBlockMode;
  btnSingleBlock.classList.toggle('active', singleBlockMode);
  singleBlockTargetTime = null;
  /* Pick up wherever the run has got to rather than snapping back to the top
     of the program the moment the button is pressed. */
  singleBlockCurrentSourceLine =
    (singleBlockMode && simActive && simTime > 1e-6) ? getLineIdxAtTime(simTime) : -1;
  showToast(singleBlockMode ? 'Single block on' : 'Single block off',
    singleBlockMode
      ? (singleBlockTravels()
          ? 'One press, one line — every line, including the ones that move nothing. A line with a move in it runs at its programmed feed and stops at the end of it.'
          : 'One press, one line — every line, including the ones that move nothing. A line with a move in it lands the cutter on the end of it.')
      : 'Play runs the program straight through again.');
});

document.getElementById('btn-sim-play').addEventListener('click', () => {

  if (simPlaying) {
    simPlaying = false;

    PlaybackUI.refresh();
    return;
  }

  if (typeof StockShowcase !== 'undefined') StockShowcase.clear(true);
  if (singleBlockMode) {
    /* One line per press either way. In Feed rate mode that line is run at
       its programmed feed; in Toolpath mode the cutter lands on the end of
       it. Lines that move nothing still get their press. */
    singleBlockStep(singleBlockTravels());
    return;
  }
  if (simTime >= simTotalTime) simTime = 0;

  for (let i = 0; i < segTimeline.length; i++) {
    const { tStart, tEnd, seg } = segTimeline[i];
    if (seg.isStop && simTime >= tStart && simTime <= tEnd) {
      simTime = tEnd + 0.00001;
      break;
    }
  }
  hideProgramComplete();
  simPlaying = true;
  simActive = true;
  singleBlockTargetTime = null;
  /* In toolpath mode the first block should land the moment Play is hit,
     not one beat later. */
  if (typeof blockBeat !== 'undefined') blockBeat = BLOCK_BEAT;
  PlaybackUI.refresh();
});

function rewindSimToStart() {

  if (typeof StockShowcase !== 'undefined') StockShowcase.clear(true);
  simPlaying = false;
  simActive = false;
  singleBlockTargetTime = null;
  singleBlockCurrentSourceLine = -1;
  if (typeof updateEditorActiveLine === 'function') updateEditorActiveLine(-1);
  if (typeof window.updateCompEditorActiveLine === 'function') {
    try { window.updateCompEditorActiveLine(-1); } catch(e) {   }
  }
  if (typeof hideProgramComplete === 'function') hideProgramComplete();
  simSeekToTime(0);
  if (typeof PlaybackUI !== 'undefined' && PlaybackUI && typeof PlaybackUI.refresh === 'function') {
    try { PlaybackUI.refresh(); } catch(e) {   }
  }
}

document.getElementById('btn-sim-reset').addEventListener('click', () => {
  simPlaying = false;
  simActive = false;
  singleBlockTargetTime = null;
  singleBlockCurrentSourceLine = -1;
  updateEditorActiveLine(-1);
  simSeekToTime(0);
});

document.getElementById('btn-sim-end').addEventListener('click', () => {
  simPlaying = false;
  simActive = false;
  singleBlockTargetTime = null;
  singleBlockCurrentSourceLine = -1;
  simSeekToTime(simTotalTime);
});

progressSlider.addEventListener('input', () => {
  simPlaying = false;
  simActive = true;
  singleBlockTargetTime = null;
  singleBlockCurrentSourceLine = -1;
  const t = (parseFloat(progressSlider.value) / 100) * simTotalTime;
  simSeekToTime(t);
});
