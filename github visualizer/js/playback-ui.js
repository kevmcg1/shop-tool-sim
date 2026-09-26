PlaybackUI = (function() {
  const PAUSE_HTML = '<rect x="2" y="2" width="3.5" height="10" rx="0.5"/><rect x="8.5" y="2" width="3.5" height="10" rx="0.5"/>';
  const PLAY_HTML  = '<path d="M3 2l10 5-10 5V2z"/>';

  const btn  = document.getElementById('btn-sim-play');
  const icon = document.getElementById('play-pause-icon');
  let lastState = null;

  function refresh() {
    const playing = (typeof simPlaying !== 'undefined') && simPlaying;
    if (playing === lastState) return;
    lastState = playing;
    icon.innerHTML = playing ? PAUSE_HTML : PLAY_HTML;
    btn.title = playing ? 'Pause' : 'Play';
    btn.classList.toggle('active', playing);
  }

  return { refresh };
})();

SpeedPresets = (function() {
  const buttons = document.querySelectorAll('.speed-preset');
  const slider  = document.getElementById('sim-speed-slider');
  const valueLabel = document.getElementById('sim-speed-val');

  function setSpeed(speed, source) {
    if (typeof simSpeed !== 'undefined') simSpeed = speed;
    valueLabel.textContent = speed + '×';

    if (source !== 'slider') {
      for (const [k, v] of Object.entries(SPEED_MAP)) {
        if (v === speed) { slider.value = k; break; }
      }
    }

    buttons.forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.speed) === speed);
    });
  }

  function init() {
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const s = parseFloat(btn.dataset.speed);
        setSpeed(s, 'preset');
      });
    });

    slider.addEventListener('input', () => {
      const s = SPEED_MAP[slider.value] || 1;
      setSpeed(s, 'slider');
    });
  }
  return { init, setSpeed };
})();
SpeedPresets.init();

const FpsMeter = (() => {
  const WINDOW = 500;
  let frames = 0, since = performance.now(), shown = 0;
  let el = null, val = null, sub = null;

  function paint(idle) {
    if (!el) {
      el  = document.getElementById("fps-hud");
      val = document.getElementById("fps-val");
      sub = document.getElementById("fps-sub");
      if (!el) return;
    }
    if (val) val.textContent = shown ? String(shown) : "—";
    el.classList.toggle("idle", !!idle);
    el.classList.toggle("warn", !idle && shown > 0 && shown < 40);
    el.classList.toggle("bad",  !idle && shown > 0 && shown < 22);
    if (sub) {
      const q = (typeof Quality !== "undefined") ? Quality : null;
      const bits = [];
      if (q) bits.push(q.mode === "auto" ? q.steps() + " steps" : q.mode.toUpperCase());
      let cuts = 0;
      try {
        if (window.PartModels && window.PartModels.cutCount) cuts = window.PartModels.cutCount();
      } catch (e) { cuts = 0; }
      if (cuts) bits.push(cuts + " cuts");
      sub.textContent = bits.join(" · ") || "—";
    }
  }

  function tick(now, busy) {
    if (busy) frames++;
    const dt = now - since;
    if (dt < WINDOW) return;

    if (frames > 0) shown = Math.round(frames * 1000 / dt);
    paint(frames === 0);
    frames = 0; since = now;
  }

  return { tick };
})();

/* Toolpath mode plays the way NCViewer does: the cutter does not travel the
   line, it stands on one block for a beat and then it is on the end of the
   next one. The beat is wall-clock, so the speed presets still mean something
   — 2× walks the program twice as fast. Feed-rate mode is untouched: there the
   cutter moves at its programmed speed. */
const BLOCK_BEAT = 0.085;
let blockBeat = 0;
const blockStepMode = () =>
  (typeof pathColorMode !== 'undefined') && pathColorMode === 'type';

let lastFrameTime = performance.now();
let lastDraw = 0, wasBusy = false;
(function loop(){
  requestAnimationFrame(loop);
  const now = performance.now();

  const dt = Math.min((now - lastFrameTime) / 1000, 0.25);
  lastFrameTime = now;

  PlaybackUI.refresh();

  if (simPlaying && typeof ViewMode !== "undefined" && ViewMode.isModel()) {
    simPlaying = false;
  }

  let nextTime = null;
  if (simPlaying && simTotalTime > 0) {
    if (blockStepMode()) {
      blockBeat += dt * simSpeed;
      /* Still standing on this block — nothing to advance until the beat is up. */
      if (blockBeat >= BLOCK_BEAT) {
        blockBeat = 0;
        nextTime = (typeof nextBlockEndTime === 'function')
          ? nextBlockEndTime(simTime) : simTime + dt * simSpeed;
      }
    } else {
      blockBeat = 0;
      nextTime = simTime + dt * simSpeed;
    }
  }

  if (nextTime !== null) {

    let stopClamp = null;
    let hitEnd = false;
    let singleBlockHit = false;
    for (let i = 0; i < segTimeline.length; i++) {
      const { tStart, tEnd, seg } = segTimeline[i];

      if (seg.isEnd && tStart > simTime && tStart <= nextTime) {
        hitEnd = true;
        break;
      }
      if (!seg.isStop) continue;
      if (seg.stopType === 'm01' && !optionalStopEnabled) continue;

      if (tStart > simTime && tStart <= nextTime) {
        /* No logging in here: this runs inside the frame loop, and a console
           write on a busy frame is a hitch you can see. */
        stopClamp = tStart + (tEnd - tStart) * 0.5;
        break;
      }
    }

    if (!hitEnd && stopClamp === null && singleBlockTargetTime !== null &&
        nextTime >= singleBlockTargetTime && simTime < singleBlockTargetTime) {
      singleBlockHit = true;
    }

    if (hitEnd) {

      simPlaying = false;
      simActive = false;
      singleBlockTargetTime = null;

      currentCursorLine = -1;
      updateEditorActiveLine(-1);
      const _savedDim = focusDimEnabled;
      focusDimEnabled = false;
      simTime = simTotalTime;
      simSeekToTime(simTotalTime);
      focusDimEnabled = _savedDim;
      showProgramComplete();
    } else if (stopClamp !== null) {
      simTime = stopClamp;
      simSeekToTime(simTime);

    } else if (singleBlockHit) {

      simTime = singleBlockTargetTime;
      singleBlockTargetTime = null;
      simPlaying = false;

      simSeekToTime(simTime);
    } else {
      simTime = nextTime;
      if (simTime >= simTotalTime) {
        simTime = simTotalTime;
        simPlaying = false;
      }
      simSeekToTime(simTime);
    }
  }

  applyIsoFollow(dt);

  if (arcCenterSprites.length) {
    const viewportHeight = viewport.clientHeight;
    const worldUnitsPerPixel = frustumSize / viewportHeight;
    const baseSizePixels = 8;
    const scaleFactor = currentGridCellSize;
    const spriteWorldSize = baseSizePixels * worldUnitsPerPixel * scaleFactor;
    arcCenterSprites.forEach(sprite => {
      sprite.scale.set(spriteWorldSize, spriteWorldSize, 1);
    });
  }

  /* An animation running on its own clock — a solid disintegrating, the
     marching ants, the toolpath fading out — counts as busy. Without
     this the loop fell back to roughly six frames a second part-way
     through the effect, which is exactly what read as a lag spike. */
  const animating = !!(window.VPBusy && window.VPBusy.active());
  const busy = simPlaying || isoFollowEnabled || animating || (now - lastActivity) < 500;
  if (!busy && now - lastDraw < 160) return;

  if (busy && wasBusy) Quality.frame(now - lastDraw, now);
  wasBusy = busy;
  lastDraw = now;

  const {theta,phi}=camSphere,r=5;
  cubeCam.position.set(r*Math.sin(phi)*Math.sin(theta),r*Math.sin(phi)*Math.cos(theta),r*Math.cos(phi));
  cubeCam.lookAt(0,0,0);
  cubeCam.up.set(-Math.cos(phi)*Math.sin(theta),-Math.cos(phi)*Math.cos(theta),Math.sin(phi));
  mainRenderer.render(mainScene,mainCam);
  cubeRenderer.render(cubeScene,cubeCam);
  FpsMeter.tick(now, busy);
})();
