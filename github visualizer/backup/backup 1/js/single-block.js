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

/* Single block, played at the programmed feed.

   Single block used to be one behaviour: jump the cutter to the end of the
   next line and stop. That is right in Toolpath mode, where the whole run is
   block-to-block anyway and nothing travels. In Feed rate mode the run is
   supposed to be the cutter actually moving at the speed the F word asks
   for — so single block there should run one line at that speed and stop at
   the end of it, not teleport.

   The clamp that stops it at the end of the block already existed in the
   frame loop, watching singleBlockTargetTime; nothing had ever set it. */
function singleBlockPlayBlock() {
  if (!segTimeline.length) return false;

  const target = nextBlockEndTime(simTime);
  if (target == null || target <= simTime + 1e-9) return false;

  if (typeof StockShowcase !== 'undefined') StockShowcase.clear(true);
  hideProgramComplete();

  /* Keep the step buttons in step with where playing this block leaves us. */
  const line = nextBlockLine(simTime);
  if (line >= 0) singleBlockCurrentSourceLine = line;

  singleBlockTargetTime = target;
  simPlaying = true;
  simActive  = true;
  PlaybackUI.refresh();
  return true;
}

/* Feed rate mode travels; Toolpath mode steps. Single block follows whichever
   is selected rather than always stepping. */
const singleBlockTravels = () =>
  (typeof pathColorMode !== 'undefined') && pathColorMode === 'feed';

function singleBlockStep() {
  const lines = gcodeInput.value.split('\n');
  const totalLines = lines.length;
  if (!totalLines) return;

  if (singleBlockCurrentSourceLine < 0) {
    singleBlockCurrentSourceLine = 0;
  } else if (singleBlockCurrentSourceLine < totalLines - 1) {
    singleBlockCurrentSourceLine++;
  } else {
    return;
  }

  let targetTime = 0;
  for (let i = 0; i < segTimeline.length; i++) {
    const { tEnd, seg } = segTimeline[i];
    if (_segOrig(seg) <= singleBlockCurrentSourceLine) targetTime = tEnd;
    else break;
  }

  simPlaying = false;
  simActive = true;
  singleBlockTargetTime = null;
  hideProgramComplete();
  simSeekToTime(targetTime);

  updateEditorActiveLine(singleBlockCurrentSourceLine);
}

function singleBlockStepBack() {
  if (singleBlockCurrentSourceLine <= 0) {
    singleBlockCurrentSourceLine = -1;
    simPlaying = false;
    simActive = false;
    singleBlockTargetTime = null;
    updateEditorActiveLine(-1);
    simSeekToTime(0);
    return;
  }
  singleBlockCurrentSourceLine--;
  let targetTime = 0;
  for (let i = 0; i < segTimeline.length; i++) {
    const { tEnd, seg } = segTimeline[i];
    if (_segOrig(seg) <= singleBlockCurrentSourceLine) targetTime = tEnd;
    else break;
  }
  simPlaying = false;
  simActive = true;
  singleBlockTargetTime = null;
  hideProgramComplete();
  simSeekToTime(targetTime);
  updateEditorActiveLine(singleBlockCurrentSourceLine);
}

document.getElementById('btn-sim-next').addEventListener('click', () => {
  if (singleBlockMode) {
    /* Next is a step in both modes — it is the button for skipping ahead.
       Play is the one that travels. */
    singleBlockStep();
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
  singleBlockCurrentSourceLine = -1;
  showToast(singleBlockMode ? 'Single block on' : 'Single block off',
    singleBlockMode
      ? (singleBlockTravels()
          ? 'Press Play and the cutter runs one line at its programmed feed, then stops. Press it again for the next line.'
          : 'Press Play and the cutter lands on the end of the next line. Press it again for the one after.')
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
    /* In Feed rate mode, run this one line at its programmed feed and stop at
       the end of it. In Toolpath mode, land on the end of it as before. */
    if (singleBlockTravels()) {
      if (simTime >= simTotalTime) { simTime = 0; simSeekToTime(0); }
      if (singleBlockPlayBlock()) return;
    }
    singleBlockStep();
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
