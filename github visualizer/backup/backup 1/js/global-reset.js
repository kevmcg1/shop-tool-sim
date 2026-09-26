/* Reset lives at the top of Settings and is armed by holding the left mouse
   button on it for three seconds.

   It used to be a button in the sidebar that reset on the second of two
   clicks. Two clicks is easy to do by accident — the second one lands on a
   button that has moved under the cursor — and this throws away the whole
   view state, so it is now a deliberate press-and-wait with a bar filling
   under the cursor the whole time. Letting go early cancels it.

   This file no longer depends on the button existing when it runs: the
   button is rendered by the settings panel and re-rendered every time the
   panel repaints, so the hold is wired up by delegation and performReset is
   published whether or not any button is on the page. */
(function () {
  const HOLD_MS = 3000;

  function setTrack(id, on) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', !!on);
  }

  function performReset(quiet) {

    simPlaying = false;
    simActive  = false;
    simTime    = 0;
    singleBlockTargetTime       = null;
    singleBlockCurrentSourceLine = -1;
    singleBlockMode             = false;
    const sbBtn = document.getElementById('btn-single-block');
    if (sbBtn) sbBtn.classList.remove('active');

    simSpeed = 1;
    if (typeof simSpeedSlider !== 'undefined' && simSpeedSlider) {
      simSpeedSlider.value = '0';
    }
    const speedVal = document.getElementById('sim-speed-val');
    if (speedVal) speedVal.textContent = '1×';
    document.querySelectorAll('.speed-preset.active').forEach(el => el.classList.remove('active'));

    focusDimEnabled  = false;
    setTrack('focus-dim-track', false);

    showArcCenters   = false;
    setTrack('show-centers-track', false);

    showAllPaths     = false;
    setTrack('show-all-paths-track', false);
    const sapSubopts = document.getElementById('show-all-paths-subopts');
    if (sapSubopts) sapSubopts.style.display = 'none';

    dimFuturePaths   = true;
    setTrack('dim-future-track', true);

    if (typeof dimCompFuture !== 'undefined') dimCompFuture = true;
    setTrack('dim-comp-future-track', true);

    optionalStopEnabled = true;
    setTrack('optional-stop-track', true);
    if (typeof paintOptionalStop === 'function') paintOptionalStop();

    toolVisible = true;
    setTrack('show-tool-track', true);
    if (toolCylinderMesh) toolCylinderMesh.visible = true;
    pathsVisible = true;
    if (typeof applyPathVisibility === 'function') applyPathVisibility();

    document.body.classList.remove('hud-visible');
    setTrack('hud-visible-track', false);

    isoFollowEnabled  = false;
    isoRotateWithPath = false;
    setTrack('iso-follow-track', false);
    setTrack('iso-rotate-track', false);
    const isoSubopts = document.getElementById('iso-follow-subopts');
    if (isoSubopts) isoSubopts.style.display = 'none';
    const followBtn = document.getElementById('btn-follow-tool');
    if (followBtn) followBtn.classList.remove('active');
    const rotBtn = document.getElementById('btn-rotate-path');
    if (rotBtn) rotBtn.classList.remove('active');

    PATH_TYPES.forEach(t => { pathVisibility[t.key] = true; pathSkip[t.key] = false; });

    const legendRows = document.getElementById('legend-rows');
    if (legendRows) legendRows.innerHTML = '';

    setTrack('show-grid-track', false);
    if (typeof gridObjects !== 'undefined' && Array.isArray(gridObjects)) {
      gridObjects.forEach(o => { if (o) o.visible = false; });
    }
    setTrack('show-axes-track', true);
    if (typeof axesGroup !== 'undefined' && axesGroup) axesGroup.visible = true;
    axisLabelsVisible = true;
    setTrack('show-axis-labels-track', true);
    if (typeof axisLabelsGroup !== 'undefined' && axisLabelsGroup) axisLabelsGroup.visible = true;

    if (typeof StockShowcase !== 'undefined' && StockShowcase) StockShowcase.clear(true);
    if (typeof setWcsVisible === 'function') setWcsVisible(true);
    if (typeof syncViewToggles === 'function') syncViewToggles();

    const gSize = document.getElementById('grid-size');
    const gCell = document.getElementById('grid-cell');
    const gUnit = document.getElementById('grid-unit');
    if (gSize) gSize.value = '20';
    if (gCell) gCell.value = '1';
    if (gUnit) gUnit.value = 'inch';
    const gSizeMirror = document.getElementById('grid-size-mirror');
    if (gSizeMirror) gSizeMirror.textContent = '20';
    if (typeof updateGridPreview === 'function') {
      try { updateGridPreview(); } catch(e) {   }
    }

    /* Cutter comp is on out of the box, so reset puts it back on — this used
       to turn it off and light the switch anyway. */
    compEnabled        = true;
    setTrack('cc-enable-track', true);
    compOverlayVisible = false;
    setTrack('cc-overlay-track', false);
    if (typeof compOverlayGroup !== 'undefined' && compOverlayGroup) {
      compOverlayGroup.visible = false;
    }
    lastCompResult     = null;
    lastCompRadiusUsed = null;
    compSegments       = [];

    if (typeof window.resetSplitEditor === 'function') window.resetSplitEditor();

    /* The same standard view Reset cam and every program load go to, rather
       than the 120-unit slab the page opens with — which on an inch setup
       parks you a hundred inches back from a three-inch billet. */
    if (typeof goHomeView === 'function') {
      goHomeView(true);
    } else {
      camSphere = { r: 1000, theta: ISO_THETA, phi: ISO_PHI };
      if (camTarget && camTarget.set) camTarget.set(0, 0, 0);
      frustumSize = 120;
      baseZoom    = 120;
      if (typeof updateFrustum    === 'function') updateFrustum();
      if (typeof updateMainCamera === 'function') updateMainCamera();
      const hudZoom = document.getElementById('hud-zoom');
      if (hudZoom) hudZoom.textContent = '1.0×';
    }

    if (typeof updateEditorActiveLine === 'function') updateEditorActiveLine(-1);
    if (typeof window.updateCompEditorActiveLine === 'function') {
      window.updateCompEditorActiveLine(-1);
    }
    currentCursorLine = -1;
    if (typeof clearDim === 'function') {
      try { clearDim(); } catch(e) {   }
    }

    if (typeof hideProgramComplete === 'function') hideProgramComplete();

    if (typeof flushParseNow === 'function') {
      try { flushParseNow(); } catch(e) { console.warn('[Reset] flushParseNow threw:', e); }
    }

    if (typeof PlaybackUI !== 'undefined' && PlaybackUI && typeof PlaybackUI.refresh === 'function') {
      try { PlaybackUI.refresh(); } catch(e) {   }
    }
    if (typeof renderCompPanel === 'function') {
      try { renderCompPanel(); } catch(e) {   }
    }

    if (quiet) return;
    if (typeof showToast === 'function') {
      showToast('Everything put back',
        'The view, the switches and the camera are as the page opens. Your program, tool diameters and D-offsets are untouched.');
    }
  }

  window.performGlobalReset = performReset;

  /* ---- hold to confirm ------------------------------------------------- *
     One press at a time. The bar is driven off the clock rather than a CSS
     transition so that letting go part-way leaves it exactly where it was
     before it springs back, and so a dropped frame cannot make the hold
     finish early. */

  const SELECTOR = '#set-reset-all';
  let held = null, heldT0 = 0, heldRaf = 0;

  const label = el => el.querySelector('.set-hold-label');

  function paintHold(k) {
    if (!held) return;
    held.style.setProperty('--hold', (k * 100).toFixed(2) + '%');
    const lab = label(held);
    if (!lab) return;
    lab.textContent = k <= 0
      ? 'Hold to reset'
      : 'Keep holding… ' + Math.max(1, Math.ceil(HOLD_MS / 1000 * (1 - k))) + 's';
  }

  function letGo() {
    if (!held) return;
    const el = held;
    held = null;
    if (heldRaf) { cancelAnimationFrame(heldRaf); heldRaf = 0; }
    el.classList.remove('is-holding');
    el.style.setProperty('--hold', '0%');
    const lab = label(el);
    if (lab) lab.textContent = 'Hold to reset';
  }

  function step(now) {
    if (!held) return;
    const k = Math.min((now - heldT0) / HOLD_MS, 1);
    paintHold(k);
    if (k < 1) { heldRaf = requestAnimationFrame(step); return; }

    const el = held;
    letGo();
    el.classList.add('is-done');
    setTimeout(() => el.classList.remove('is-done'), 600);
    performReset();
  }

  document.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;                 // left mouse only
    const el = e.target.closest && e.target.closest(SELECTOR);
    if (!el) return;
    e.preventDefault();
    letGo();
    held = el;
    heldT0 = performance.now();
    el.classList.add('is-holding');
    /* Capture so the hold survives the cursor sliding off the button, and
       so we always get the matching pointerup. */
    try { el.setPointerCapture(e.pointerId); } catch (err) {   }
    heldRaf = requestAnimationFrame(step);
  });

  ['pointerup', 'pointercancel'].forEach(t =>
    window.addEventListener(t, letGo, true));
  /* Window-level only, and deliberately not in the capture phase: blur does
     not bubble but it does capture, so a capturing listener here would fire
     for any element on the page losing focus and cancel a hold in progress. */
  window.addEventListener('blur', letGo);

  /* Space or Enter on a focused button would fire a plain click, which must
     not reset anything — the whole point is that it takes a deliberate hold. */
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest(SELECTOR)) e.preventDefault();
  });
})();
