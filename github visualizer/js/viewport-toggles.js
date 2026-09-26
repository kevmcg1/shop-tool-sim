function updateDim(lineIdx) {
  currentCursorLine = lineIdx;
  if (!focusDimEnabled || !perLineMeshes.length) return;
  perLineMeshes.forEach(({ lineIdx: li, mesh }) => {
    mesh.material.opacity = (li === lineIdx) ? 1.0 : 0.2;
    mesh.material.needsUpdate = true;
  });
}

function clearDim() {
  perLineMeshes.forEach(({ mesh }) => {
    mesh.material.opacity = 1.0;
    mesh.material.needsUpdate = true;
  });
}

const focusDimTrack = document.getElementById('focus-dim-track');
document.getElementById('focus-dim-label').addEventListener('click', () => {
  focusDimEnabled = !focusDimEnabled;
  focusDimTrack.classList.toggle('on', focusDimEnabled);
  simSeekToTime(simTime);
  if (focusDimEnabled && currentCursorLine >= 0) updateDim(currentCursorLine);
});

const showCentersTrack = document.getElementById('show-centers-track');
document.getElementById('show-centers-label').addEventListener('click', () => {
  showArcCenters = !showArcCenters;
  showCentersTrack.classList.toggle('on', showArcCenters);
  simSeekToTime(simTime);
});

const showAllPathsTrack = document.getElementById('show-all-paths-track');
const showAllPathsSubopts = document.getElementById('show-all-paths-subopts');
document.getElementById('show-all-paths-label').addEventListener('click', () => {
  showAllPaths = !showAllPaths;
  showAllPathsTrack.classList.toggle('on', showAllPaths);
  if (showAllPathsSubopts) showAllPathsSubopts.style.display = showAllPaths ? 'block' : 'none';
  simSeekToTime(simTime);
  showToast(showAllPaths ? 'Whole path shown' : 'Whole path hidden',
    showAllPaths
      ? 'Every move in the program is drawn at once, including the ones still to come.'
      : 'Only the moves the cutter has already made are drawn.');
});

const dimFutureTrack = document.getElementById('dim-future-track');
document.getElementById('dim-future-label').addEventListener('click', () => {
  dimFuturePaths = !dimFuturePaths;
  dimFutureTrack.classList.toggle('on', dimFuturePaths);
  simSeekToTime(simTime);
  showToast(dimFuturePaths ? 'Moves ahead dimmed' : 'Moves ahead at full brightness',
    dimFuturePaths
      ? 'Anything past the cutter draws at a fifth of its strength, so what has been cut stands out.'
      : 'Everything draws the same, cut or not.');
});

/* Optional stop.

   The switch itself is a hidden stub now — the control the user sees is the
   M01 Stop button on the transport card, which lives with the rest of the
   playback controls rather than among the display options where it used to
   be. Everything still routes through the stub, so Settings and the reset
   both keep working unchanged. */
const optionalStopTrack = document.getElementById('optional-stop-track');
function paintOptionalStop() {
  if (optionalStopTrack) optionalStopTrack.classList.toggle('on', optionalStopEnabled);
  const b = document.getElementById('btn-optional-stop');
  if (b) b.classList.toggle('active', optionalStopEnabled);
}
document.getElementById('optional-stop-label').addEventListener('click', () => {
  optionalStopEnabled = !optionalStopEnabled;
  paintOptionalStop();
  showToast(optionalStopEnabled ? 'Optional stop on' : 'Optional stop off',
    optionalStopEnabled
      ? 'An M01 in the program now halts the run, the way the button on the machine does.'
      : 'M01 lines are read straight through and the run carries on.');
});
document.addEventListener('DOMContentLoaded', () => {
  const b = document.getElementById('btn-optional-stop');
  if (b) b.addEventListener('click', () => {
    document.getElementById('optional-stop-label').click();
  });
  paintOptionalStop();
});

const hudVisibleTrack = document.getElementById('hud-visible-track');
document.getElementById('hud-visible-label').addEventListener('click', () => {
  const on = !document.body.classList.contains('hud-visible');
  document.body.classList.toggle('hud-visible', on);
  /* Placed rather than pinned, so they land clear of whatever is already up. */
  if (on && window.VPLayout) window.VPLayout();
  hudVisibleTrack.classList.toggle('on', on);
  showToast(on ? 'Read-outs on the view' : 'Read-outs in the sidebar only',
    on
      ? 'Position, feed, speed and tool now float over the corners of the viewport as well.'
      : 'The floating panels are gone. The same numbers are still in Machine State.');
});

const showGridTrack = document.getElementById('show-grid-track');
const showAxesTrack = document.getElementById('show-axes-track');

function setGridVisible(on) {
  showGridTrack.classList.toggle('on', on);
  gridObjects.forEach(obj => obj.visible = on);
  syncViewToggles();
}

/* The path tears away in program order — the first move goes first and the
   erasure runs to the last — rather than blinking off in one frame. */
let pathFade = 1, _pathFadeRaf = 0;

function setPathsVisible(on) {
  const want = !!on;
  if (want === pathsVisible && !_pathFadeRaf) return;

  if (_pathFadeRaf) { cancelAnimationFrame(_pathFadeRaf); _pathFadeRaf = 0; }

  const MS = 850;
  const t0 = performance.now();
  const ease = t => t * t * (3 - 2 * t);

  if (want) {
    pathsVisible = true;
    pathFade = 0;
    applyPathVisibility();
    syncViewToggles();
  }

  /* Same reason as the dissolve: the frame loop idles down when there is no
     input, so a fade running on its own clock has to say it is still going
     or the second half of it arrives in steps. */
  if (window.VPBusy) window.VPBusy.hold('pathFade');

  (function step(now) {
    const raw = Math.min((now - t0) / MS, 1);
    pathFade = want ? ease(raw) : 1 - ease(raw);
    /* The lines follow the front through a uniform; the canned-cycle rings and
       arc marks are whole objects, so they have to be walked each frame. */
    if (typeof applyPathFadeMarks === 'function') applyPathFadeMarks();
    if (raw < 1) { _pathFadeRaf = requestAnimationFrame(step); return; }
    _pathFadeRaf = 0;
    if (window.VPBusy) window.VPBusy.release('pathFade');
    pathFade = want ? 1 : 0;
    if (!want) {
      pathsVisible = false;
      applyPathVisibility();
      syncViewToggles();
    }
    if (typeof applyPathFadeMarks === 'function') applyPathFadeMarks();
  })(t0);

  if (!want) syncViewToggles();
}

function setAxesVisible(on) {
  showAxesTrack.classList.toggle('on', on);
  axesGroup.visible = on;

  axisLabelsGroup.visible = on && axisLabelsVisible;
  syncViewToggles();
}

function setToolVisible(on) {
  const want = !!on;
  toolVisible = want;
  showToolTrack.classList.toggle('on', want);

  /* The cutter comes apart like the solids do, but along its length rather
     than on a diagonal: hiding erases it from the tip upward, showing builds
     it back down from the shank. A cutter is a long thin thing, and a
     corner-to-corner tear across one reads as a glitch. */
  const dis = window.PartModels && window.PartModels.dissolveObject;
  const root = toolCylinderMesh
    || (typeof mainScene !== 'undefined' && mainScene.getObjectByName('toolModels'));
  const upward = { worldDir: new THREE.Vector3(0, 0, 1) };

  if (dis && root) {
    if (want) {
      root.visible = true;
      dis(root, true, null, upward);
    } else {
      root.visible = true;
      dis(root, false, () => { if (!toolVisible && root) root.visible = false; }, upward);
    }
  } else if (toolCylinderMesh) {
    toolCylinderMesh.visible = want;
  } else {
    simSeekToTime(simTime);
  }
  syncViewToggles();
}

function setToolOpacity(v) {
  toolOpacity = Math.min(1, Math.max(0.05, v));
  const sl = document.getElementById('vt-tool-opacity');
  const out = document.getElementById('vt-tool-opacity-val');
  if (sl && document.activeElement !== sl) sl.value = Math.round(toolOpacity * 100);
  if (out) out.textContent = Math.round(toolOpacity * 100) + '%';
  applyToolOpacity();
}

function applyToolOpacity() {
  const paint = obj => {
    if (!obj) return;
    obj.traverse(o => {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        if (m.opacity === undefined) return;
        m.opacity = toolOpacity;
        m.transparent = toolOpacity < 1;
        m.depthWrite = toolOpacity >= 1;
        m.needsUpdate = true;
      });
    });
  };
  paint(toolCylinderMesh);
  if (typeof ToolModels !== 'undefined' && ToolModels && typeof ToolModels.root === 'function') {
    try { paint(ToolModels.root()); } catch (e) {   }
  }
}

let wcsVisible = true;
function setWcsVisible(on) {
  wcsVisible = !!on;
  if (window.PartModels && typeof window.PartModels.setMarksVisible === 'function') {
    window.PartModels.setMarksVisible(wcsVisible);
  }
  syncViewToggles();
}

function setBodyVisible(which, on) {
  if (window.PartModels && window.PartModels.setBodyVisible) {
    window.PartModels.setBodyVisible(which, on);
  }
  syncViewToggles();
}
const bodyVisible = which => {
  try {
    return !window.PartModels || !window.PartModels.bodyVisible
      || window.PartModels.bodyVisible(which);
  } catch (e) { return true; }
};

/* The compensated path tears away in program order too, on its own clock, so
   turning it off looks like the programmed path being turned off rather than
   like a light being switched. */
let compFade = 1, _compFadeRaf = 0;

function setCompPathVisible(on) {
  const want = !!on;

  /* Asking to see the compensated path when compensation is switched off is
     asking for compensation. Without this the button lit nothing and looked
     broken, because the overlay is only ever drawn while comp is on. */
  if (want && typeof compEnabled !== 'undefined' && !compEnabled) {
    const lbl = document.getElementById('cc-enable-label');
    if (lbl) lbl.click();
  }

  const changing = want !== compOverlayVisible || _compFadeRaf;
  compOverlayVisible = want;

  const t = document.getElementById('cc-overlay-track');
  if (t) t.classList.toggle('on', compOverlayVisible && compEnabled);

  if (typeof compOverlayGroup === 'undefined' || !compOverlayGroup) {
    syncViewToggles();
    return;
  }

  if (!changing) {
    compOverlayGroup.visible = compOverlayVisible && compEnabled;
    syncViewToggles();
    return;
  }

  if (_compFadeRaf) { cancelAnimationFrame(_compFadeRaf); _compFadeRaf = 0; }

  const MS = 850;
  const t0 = performance.now();
  const ease = k => k * k * (3 - 2 * k);

  if (want) {
    compOverlayGroup.visible = !!compEnabled;
    compFade = 0;
  }

  if (window.VPBusy) window.VPBusy.hold('compFade');

  (function step(now) {
    const raw = Math.min((now - t0) / MS, 1);
    compFade = want ? ease(raw) : 1 - ease(raw);
    if (raw < 1) { _compFadeRaf = requestAnimationFrame(step); return; }
    _compFadeRaf = 0;
    if (window.VPBusy) window.VPBusy.release('compFade');
    compFade = want ? 1 : 0;
    if (!want) compOverlayGroup.visible = false;
  })(t0);

  syncViewToggles();
}

/* Whether the part of the compensated path still to come is ghosted. Rides on
   "dim future moves" — see compDimAhead() — and is on out of the box. */
let dimCompFuture = true;
const dimCompFutureTrack = document.getElementById('dim-comp-future-track');
const dimCompFutureLabel = document.getElementById('dim-comp-future-label');
if (dimCompFutureLabel) {
  dimCompFutureLabel.addEventListener('click', () => {
    dimCompFuture = !dimCompFuture;
    if (dimCompFutureTrack) dimCompFutureTrack.classList.toggle('on', dimCompFuture);
    showToast(dimCompFuture ? 'Compensated path dims ahead' : 'Compensated path stays solid',
      dimCompFuture
        ? 'The magenta line fades past the cutter, matching the programmed line under it.'
        : 'The magenta line draws at full strength from the first move to the last.');
  });
}

let handlesVisible = true;
function setHandlesVisible(on) {
  handlesVisible = !!on;
  if (window.PartModels && window.PartModels.setHandlesVisible) {
    window.PartModels.setHandlesVisible(handlesVisible);
  }
  syncViewToggles();
}

function syncViewToggles() {
  const set = (id, on) => {
    const b = document.getElementById(id);
    if (b) b.classList.toggle('on', on);
  };
  const gridOn = showGridTrack.classList.contains('on');
  const axesOn = showAxesTrack.classList.contains('on');
  set('btn-view-grid',  gridOn);
  set('btn-view-axes',  axesOn);
  set('btn-view-paths', pathsVisible);
  set('btn-view-tool',  toolVisible);

  const state = {
    tool: toolVisible, paths: pathsVisible,
    comp: compOverlayVisible && compEnabled,
    stock: bodyVisible('stock'), vise: bodyVisible('vise'), pars: bodyVisible('pars'),
    table: bodyVisible('table'),
    grid: gridOn, wcs: wcsVisible, origin: axesOn, handles: handlesVisible,
  };
  document.querySelectorAll('#vp-show [data-show], #vp-setup [data-show]').forEach(b =>
    b.classList.toggle('on', !!state[b.dataset.show]));

  if (window.VPSetupBar) window.VPSetupBar.paint();

  const sb = document.getElementById('mkp-show-stock');
  if (sb) sb.checked = state.stock;

  document.querySelectorAll('#color-mode [data-colormode]').forEach(b =>
    b.classList.toggle('on', b.dataset.colormode === pathColorMode));
  if (window.PartModels && window.PartModels.refreshPanels) {
    window.PartModels.refreshPanels();
  }
}

(function bindSceneShowStrip() {
  document.addEventListener('click', e => {
    const b = e.target.closest
      && e.target.closest('#vp-show [data-show], #vp-setup [data-show]');
    if (!b) return;
    const want = !b.classList.contains('on');
    const kind = b.dataset.show;
    const say = (n, d) => showToast(n + (want ? ' shown' : ' hidden'), d);
    switch (kind) {
      case 'tool':    setToolVisible(want);   say('Cutter', want ? 'The cutter is back on screen.' : 'The cutter is out of the way so you can see the shape it has left behind.'); break;
      case 'paths':   setPathsVisible(want);  say('Toolpath', want ? 'The lines the cutter follows are drawn again, in program order.' : 'The lines erase from the first move to the last. The metal is still cut.'); break;
      case 'comp':    setCompPathVisible(want); say('Compensated path', want ? 'The magenta line is what the middle of the cutter actually walks once G41 or G42 is worked out.' : 'Only the line as written in the program is drawn.'); break;
      case 'stock':   setBodyVisible('stock', want); say('Blank', want ? 'The metal is back, with every cut made so far still in it.' : 'The metal is out of the way. The cutting still happens underneath.'); break;
      case 'vise':    setBodyVisible('vise', want);  say('Vise', want ? 'The vise and its jaws are back.' : 'The vise is hidden. Nothing has moved — it is still holding the work.'); break;
      case 'pars':    setBodyVisible('pars', want);  say('Parallels', want ? 'The two bars the work stands on are back.' : 'The bars are hidden. The work is still standing at the same height.'); break;
      case 'table':   setBodyVisible('table', want); say('Machine table', want ? 'The VF-1 work surface under the vise is back.' : 'The table is hidden, which clears the view under the vise.'); break;
      case 'grid':    setGridVisible(want);   say('Floor grid', want ? 'The squared floor is back, for judging sizes by eye.' : 'The squares under the setup are gone.'); break;
      case 'wcs':     setWcsVisible(want);    say('Origin marker', want ? 'The yellow ball marking the work zero is back.' : 'The marker is hidden. The origin itself has not moved.'); break;
      case 'origin':  setAxesVisible(want);   say('Axis arrows', want ? 'The red, green and blue arrows mark X, Y and Z out from the origin.' : 'The three colored arrows are hidden.'); break;
      case 'handles': setHandlesVisible(want); say('Drag handles', want ? 'The arrows, rings and boxes for dragging the selection are back.' : 'The handles are hidden, so they cannot be mistaken for a second set of axes.'); break;
    }

    if (typeof StockShowcase !== 'undefined' && StockShowcase.remember) {
      StockShowcase.remember(kind, want);
    }
  });
  syncViewToggles();
})();

/* The switch on the playback card picks two things at once, because they are
   the same choice: how the path is colored, and how the run is played.

     Feed  — every cutting move ramped blue to red by its F word, and the
             cutter travels at the speed the program asks for.
     Path  — one color per kind of move, and the run walks the program the way
             NCViewer does: rewound to line one, then block by block, the
             cutter landing on the end of each in turn.

   The repaint waits 200 ms so the switch lands before the lines change under
   it, and so a double tap doesn't rebuild the whole path twice. */
let _colorModeTimer = null;

function setPathColorMode(m) {
  const want = m === 'type' ? 'type' : 'feed';
  if (want === pathColorMode) return;
  pathColorMode = want;

  clearTimeout(_colorModeTimer);
  /* flushParseNow() leaves the clock at the end of the program, so where the
     run was has to be taken before it, not after. */
  const at = simTime;
  _colorModeTimer = setTimeout(() => {
    /* Seeking tears the path down and rebuilds it, which is what re-reads the
       color mode. Re-parsing first makes sure nothing stale survives. */
    if (typeof flushParseNow === 'function') { try { flushParseNow(); } catch (e) {} }

    if (want === 'type') {
      if (typeof StockShowcase !== 'undefined' && StockShowcase.clear) {
        try { StockShowcase.clear(true); } catch (e) {}
      }
      if (typeof rewindSimToStart === 'function') rewindSimToStart();
      else if (typeof simSeekToTime === 'function') simSeekToTime(0);
      if (typeof hideProgramComplete === 'function') hideProgramComplete();
      if (simTotalTime > 0) {
        simPlaying = true;
        simActive = true;
        singleBlockTargetTime = null;
        if (typeof PlaybackUI !== 'undefined' && PlaybackUI.refresh) PlaybackUI.refresh();
      }
    } else if (typeof simSeekToTime === 'function') {
      simSeekToTime(at);
    }
  }, 200);

  syncViewToggles();
  if (want === 'feed') {
    const r = feedRange();
    showToast('Colored by feed rate', r
      ? `Cutting moves ramp from blue at ${r.lo.toFixed(0)} ${r.unit} to red at ${r.hi.toFixed(0)}, and the cutter travels at the speed each line asks for.`
      : 'The cutter travels at the speed each line asks for.');
  } else {
    showToast('Colored by kind of move',
      'Rapids, feeds, arcs and drilling each get their own color, and the run walks the program one block at a time.');
  }
}

document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('#color-mode [data-colormode]');
  if (b) setPathColorMode(b.dataset.colormode);
});


document.getElementById('show-grid-label').addEventListener('click', () => {
  setGridVisible(!showGridTrack.classList.contains('on'));
});

document.getElementById('btn-view-grid').addEventListener('click', () => {
  const on = !showGridTrack.classList.contains('on');
  setGridVisible(on);
  showToast(on ? 'Floor grid shown' : 'Floor grid hidden',
    on ? 'The squared floor is back, for judging sizes and distances by eye.'
       : 'The squares under the setup are gone. Nothing else has changed.');
});

document.getElementById('btn-view-axes').addEventListener('click', () => {
  const on = !showAxesTrack.classList.contains('on');
  setAxesVisible(on);
  showToast(on ? 'Axis arrows shown' : 'Axis arrows hidden',
    on ? 'The red, green and blue arrows mark X, Y and Z out from the origin.'
       : 'The three colored arrows are hidden. The origin itself has not moved.');
});

document.getElementById('btn-view-paths').addEventListener('click', () => {
  setPathsVisible(!pathsVisible);
  showToast(pathsVisible ? 'Toolpath shown' : 'Toolpath hidden',
    pathsVisible ? 'The lines the cutter follows are drawn again, in program order.'
                 : 'The lines are erased from the first move to the last. The metal is still cut.');
});

document.getElementById('btn-view-tool').addEventListener('click', () => {
  setToolVisible(!toolVisible);
  showToast(toolVisible ? 'Cutter shown' : 'Cutter hidden',
    toolVisible ? 'The cutter is back on screen.'
                : 'The cutter is out of the way so you can see the shape it has left behind.');
});

document.getElementById('vt-tool-opacity').addEventListener('input', e => {
  setToolOpacity((parseFloat(e.target.value) || 100) / 100);
});

document.getElementById('show-axes-label').addEventListener('click', () => {
  setAxesVisible(!showAxesTrack.classList.contains('on'));
});

document.getElementById('rotary-mode').addEventListener('click', e => {
  const b = e.target.closest('[data-rotary]'); if (!b) return;
  if (b.dataset.rotary === rotaryMode) return;
  rotaryMode = b.dataset.rotary;
  document.querySelectorAll('#rotary-mode [data-rotary]').forEach(x =>
    x.classList.toggle('on', x.dataset.rotary === rotaryMode));

  simPlaying = false;
  simActive = false;
  if (rotaryMode === 'tool' && typeof setTableAngles === 'function') setTableAngles(0, 0, 0);
  if (typeof flushParseNow === 'function') {
    try { flushParseNow(); } catch (err) { console.warn('[Rotary] re-parse failed:', err); }
  }
  if (typeof rewindSimToStart === 'function') rewindSimToStart();
  showToast(rotaryMode === 'part' ? 'The part turns' : 'The tool swings',
    rotaryMode === 'part'
      ? 'A, B and C words now turn the work under an upright spindle. The run has gone back to line one.'
      : 'A, B and C words now swing the cutter around a part that stands still. The run has gone back to line one.');
});

const ViewMode = (() => {
  let mode = "sim";
  const isModel = () => mode === "model";

  function paint() {
    const bar = document.getElementById("transport-bar");
    const tools = document.getElementById("viewport-toolbar");

    const modelTools = document.getElementById("pm-model-tools");
    if (bar) bar.style.display = isModel() ? "none" : "";
    if (tools) tools.style.display = isModel() ? "none" : "";
    if (modelTools) modelTools.hidden = !isModel();

    const showProgram = !isModel();
    if (typeof toolpathGroup !== "undefined" && toolpathGroup) {
      toolpathGroup.visible = showProgram;
    }
    if (typeof compOverlayRoot !== "undefined" && compOverlayRoot) {
      compOverlayRoot.visible = showProgram;
    }

    const tm = (typeof mainScene !== "undefined") && mainScene.getObjectByName("toolModels");
    if (tm) tm.visible = showProgram;
    if (!showProgram && typeof ToolChanger !== "undefined") ToolChanger.hide();
    document.querySelectorAll("#vp-mode [data-vpmode]").forEach(b =>
      b.classList.toggle("on", b.dataset.vpmode === mode));

    if (window.PartModels && window.PartModels.paintGizmo) window.PartModels.paintGizmo();

    if (window.VPModeStatus) window.VPModeStatus.paint();
    if (window.VPSetupBar) window.VPSetupBar.paint();
    if (window.VPGizmoBar) window.VPGizmoBar.paint();
    /* Model mode swaps the whole sidebar for one about arranging a setup. */
    if (window.ModelSidebar) window.ModelSidebar.paint();
  }

  function set(m) {
    if (m === mode) return;
    mode = m;

    if (typeof StockShowcase !== "undefined") StockShowcase.clear(true);

    if (isModel()) {
      simPlaying = false;
      if (typeof rewindSimToStart === "function") rewindSimToStart();
    } else {

      if (window.PartModels && window.PartModels.clearSelection) {
        window.PartModels.clearSelection();
      }
    }
    paint();
    showToast(isModel() ? "Model mode" : "Sim mode",
      isModel()
        ? "Arrange the setup: click things to pick them up and drag the arrows. The program is put away."
        : "Watch the program cut. Clicking in the view selects nothing while the run is in charge.");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const bar = document.getElementById("vp-mode");
    if (bar) bar.addEventListener("click", e => {
      const b = e.target.closest("[data-vpmode]");
      if (b) set(b.dataset.vpmode);
    });
    paint();
  });

  return { get mode() { return mode; }, isModel, set, paint };
})();

const StockShowcase = (() => {
  let on = null;
  let saved = null;

  const gridOn = () => showGridTrack.classList.contains('on');
  const axesOn = () => showAxesTrack.classList.contains('on');

  function paint() {
    document.querySelectorAll('#pm-stock-preview [data-stockpreview]').forEach(b =>
      b.classList.toggle('on', b.dataset.stockpreview === on));
  }

  function hideFurniture() {
    if (saved) return;
    saved = { grid: gridOn(), axes: axesOn(), wcs: wcsVisible };
    setGridVisible(false);
    setAxesVisible(false);
    setWcsVisible(false);
  }
  function restoreFurniture() {
    if (!saved) return;
    const s = saved; saved = null;
    setGridVisible(s.grid);
    setAxesVisible(s.axes);
    setWcsVisible(s.wcs);
  }

  function park() {
    simPlaying = false;
    simActive = false;
    singleBlockTargetTime = null;
    singleBlockCurrentSourceLine = -1;
  }

  function clear(quiet) {
    if (!on && !saved) return;
    on = null;
    restoreFurniture();
    paint();
    if (!quiet) showToast('Showcase off',
      'The grid, the axis arrows and the origin marker are back on screen.');
  }

  function show(which) {
    if (on === which) { clear(); return; }
    on = which;
    hideFurniture();
    park();
    simSeekToTime(which === 'after' ? simTotalTime : 0);
    paint();
    showToast(which === 'after' ? 'After the program' : 'Before the program',
      which === 'after'
        ? 'The blank as it will be when the last line has run, with the grid and the marks put away.'
        : 'The blank as it arrives, before a single cut, with the grid and the marks put away.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const row = document.getElementById('pm-stock-preview');
    if (row) row.addEventListener('click', e => {
      const b = e.target.closest('[data-stockpreview]');
      if (b) show(b.dataset.stockpreview);
    });
  });

  function remember(kind, value) {
    if (!saved) return;
    if (kind === 'grid')   saved.grid = value;
    if (kind === 'origin') saved.axes = value;
    if (kind === 'wcs')    saved.wcs  = value;
  }

  return { show, clear, paint, remember, get state() { return on; } };
})();

const onModelCanvas = ev => ev.target === mainCanvas;

const RotaryPivot = (() => {
  const el = id => document.getElementById(id);
  let follow = true, timer = null, editing = false;

  function paint() {
    if (editing) return;
    const b = el("rot-pivot-follow");
    if (b) b.classList.toggle("on", follow);
    [["rot-pivot-x", "x"], ["rot-pivot-y", "y"], ["rot-pivot-z", "z"]].forEach(([id, k]) => {
      const i = el(id);
      if (i && document.activeElement !== i) i.value = (+rotaryPivot[k].toFixed(4));
    });
  }

  function moveTo(v) {
    if (rotaryPivot.distanceToSquared(v) < 1e-10) return;
    rotaryPivot.copy(v);
    if (window.PartModels && window.PartModels.setTablePivot) window.PartModels.setTablePivot(rotaryPivot);
    paint();

    if (rotaryMode !== "tool") return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (typeof flushParseNow === "function") {
        try { flushParseNow(); } catch (e) { console.warn("[Pivot] re-parse failed:", e); }
      }
    }, 260);
  }

  function tick() {
    const PM = window.PartModels;
    if (!follow || !PM || !PM.current) { paint(); return; }
    const p = PM.current();
    if (p && p.visible) moveTo(PM.zeroWorld(p));
    paint();
  }

  function bind() {
    [["rot-pivot-x", "x"], ["rot-pivot-y", "y"], ["rot-pivot-z", "z"]].forEach(([id, k]) => {
      const i = el(id); if (!i) return;
      i.addEventListener("focus", () => { editing = true; });
      i.addEventListener("blur", () => { editing = false; paint(); });
      i.addEventListener("input", () => {
        const v = parseFloat(i.value);
        if (!isFinite(v)) return;
        follow = false;
        const next = rotaryPivot.clone(); next[k] = v;
        moveTo(next);
        const b = el("rot-pivot-follow"); if (b) b.classList.remove("on");
      });
    });
    const b = el("rot-pivot-follow");
    if (b) b.addEventListener("click", () => {
      follow = true;
      tick();
      showToast('Rotation center follows the origin',
        'A, B and C moves now swing about the work zero, and will keep up if you move it.');
    });
    paint();
  }

  return { bind, tick, paint, get follow() { return follow; } };
})();
document.addEventListener("DOMContentLoaded", () => RotaryPivot.bind());

document.getElementById('linear-mode').addEventListener('click', e => {
  const b = e.target.closest('[data-linear]'); if (!b) return;
  if (b.dataset.linear === linearMode) return;
  linearMode = b.dataset.linear;
  document.querySelectorAll('#linear-mode [data-linear]').forEach(x =>
    x.classList.toggle('on', x.dataset.linear === linearMode));

  if (linearMode === 'tool' && typeof setStageXY === 'function') setStageXY(0, 0);
  showToast(linearMode === 'table' ? 'The table travels' : 'The spindle travels',
    linearMode === 'table'
      ? 'X and Y now move the work under a spindle that stays put, the way a real mill does. The cut is identical either way.'
      : 'X and Y now move the cutter over work that stays put. The cut is identical either way.');
});

document.getElementById('show-axis-labels-label').addEventListener('click', () => {
  const labelsTrack = document.getElementById('show-axis-labels-track');
  axisLabelsVisible = !labelsTrack.classList.contains('on');
  labelsTrack.classList.toggle('on', axisLabelsVisible);

  axisLabelsGroup.visible = axisLabelsVisible && showAxesTrack.classList.contains('on');
  showToast(axisLabelsVisible ? 'Axis letters shown' : 'Axis letters hidden',
    axisLabelsVisible ? 'The X, Y and Z letters are back on the ends of the arrows.'
                      : 'The letters are gone. The arrows themselves are unchanged.');
});

function getCursorLineIdx() {
  return gcodeInput.value.substring(0, gcodeInput.selectionStart).split('\n').length - 1;
}

function seekToLine(lineIdx) {

  const segOrig = (seg) => (seg.origLineIdx != null) ? seg.origLineIdx : seg.lineIdx;
  let targetTime = null;
  for (let i = segTimeline.length - 1; i >= 0; i--) {
    const { seg, tEnd } = segTimeline[i];
    const so = segOrig(seg);
    if (so > lineIdx) continue;

    if (seg.isStop || seg.isMarker) {
      if (so === lineIdx) { targetTime = tEnd; break; }
      continue;
    }
    targetTime = tEnd;
    break;
  }
  if (targetTime !== null) {
    simPlaying = false;
    simActive = false;
    singleBlockTargetTime = null;
    simSeekToTime(targetTime);

    updateEditorActiveLine(lineIdx);
  }
}

function onCursorMove() {
  const li = getCursorLineIdx();
  updateDim(li);
  seekToLine(li);
}
gcodeInput.addEventListener('keyup',   onCursorMove);
gcodeInput.addEventListener('mouseup', onCursorMove);
gcodeInput.addEventListener('click',   onCursorMove);
gcodeInput.addEventListener('focus',   onCursorMove);
gcodeInput.addEventListener('blur',    () => { currentCursorLine = -1; if (focusDimEnabled) clearDim(); updateEditorActiveLine(-1); });

function getBounds(segs) {
  const box=new THREE.Box3(); segs.forEach(s=>{box.expandByPoint(s.start);box.expandByPoint(s.end);}); return box;
}

let baseZoom = frustumSize;

/* Frame a world-space box.

   The camera is orthographic and it orbits, so the frustum has to hold the box
   from whichever way it is being looked at — sizing off the largest single edge
   put the corners of the box outside the view every time the camera was not
   square to it. The horizontal span is therefore taken from the footprint
   diagonal, which is the widest the box can ever read on screen.

   The aim point is the work zero and nothing else — see viewOriginWorld(). */
const FIT_MARGIN = 1.32;

/* Where the camera aims, always: the program's X0 Y0 Z0.

   It used to aim at the middle of whatever it had just framed. Two samples
   with differently sized blanks therefore put the middle of the box in two
   different places, and the whole scene appeared to slide sideways as you
   clicked between them — plus orbiting swung about the middle of the metal
   rather than about the zero the program is written around.

   The work zero is the one point every program shares, so that is the aim
   point. If there is no solid in the scene to carry a zero, the world
   origin is the same thing. */
function viewOriginWorld() {
  try {
    /* Not the stock's zero, and not the world origin either: the place the
       program's own X0 Y0 Z0 is actually drawn.

       programFrame is the transform that puts the toolpath where the work is,
       so the origin of the program is that frame applied to nothing, plus
       whatever the stage has been shifted by in table-travel mode. This is by
       construction the exact point the cutter parks on when the run is
       rewound, so aiming here means a freshly loaded sample always opens with
       the tool dead center.

       Asking PartModels for the work origin instead — which is what this used
       to do — gave a point that drifts as the blank is seated in the vise,
       so the view could still land slightly off. */
    updateProgramFrame();
    const p = new THREE.Vector3(0, 0, 0)
      .applyMatrix4(programFrame)
      .add(stageOffset);
    if (isFinite(p.x) && isFinite(p.y) && isFinite(p.z)) return p;
  } catch (e) {   }
  return new THREE.Vector3(0, 0, 0);
}

/* How wide the view has to be to still hold `box` once it is centered on
   `aim` rather than on the box's own middle. Measured as the farthest the
   box reaches from the aim point on any one axis, doubled. */
function spanAround(box, aim) {
  return 2 * Math.max(
    Math.abs(box.max.x - aim.x), Math.abs(aim.x - box.min.x),
    Math.abs(box.max.y - aim.y), Math.abs(aim.y - box.min.y),
    Math.abs(box.max.z - aim.z), Math.abs(aim.z - box.min.z)
  );
}

/* What to show when there is nothing with any size to show — a program of
   nothing but modal lines, or an empty scene. Ten inches of table reads as a
   machine; the 120 units the page opens with reads as orbit. */
const defaultView = () =>
  (typeof unitMode !== 'undefined' && unitMode === 'mm') ? 250 : 10;

/* ========================================================================== *
 * Moving the camera.
 *
 * Everything that repositions the view goes through here, so a jump can be
 * animated by handing it a duration instead of being written straight into
 * the globals. Nothing used to animate: Fit view and Reset cam both snapped,
 * which loses you the sense of where the view went.
 *
 * The four things that describe a view are the aim point, the two orbit
 * angles and the frustum width. The orbit radius is not one of them — the
 * near/far slab is ±10000 either way, so it is pinned at 1000 and only
 * decides where the eye sits along the view line.
 * ========================================================================== */
const CamView = (() => {
  const MS = 520;
  /* Loading a sample rebuilds the blank, seats it in the vise and re-anchors
     the program, and the last of that lands a few frames after the move was
     asked for. So a move can be told to keep re-reading where it is aiming,
     and to go on re-reading it for a moment after it has arrived. Without
     that hold, a sample whose stock settles late opens very slightly off the
     origin. */
  const SETTLE_MS = 700;
  let raf = 0, t0 = 0, ms = 0, from = null, to = null, follow = null;

  /* Slow at both ends, quickest in the middle. */
  const ease = t => (t < 0.5) ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const state = () => ({
    target:  camTarget.clone(),
    theta:   camSphere.theta,
    phi:     camSphere.phi,
    frustum: frustumSize,
  });

  function write(v) {
    camTarget.copy(v.target);
    camSphere.theta = v.theta;
    camSphere.phi   = v.phi;
    camSphere.r     = 1000;
    frustumSize = v.frustum;
    baseZoom    = v.frustum;
    updateFrustum();
    updateMainCamera();
    const hz = document.getElementById('hud-zoom');
    if (hz) hz.textContent = '1.0×';
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    follow = null;
    if (window.VPBusy) window.VPBusy.release('camMove');
  }

  function step(now) {
    const k = Math.min((now - t0) / ms, 1);
    const e = ease(k);

    /* A tracking move re-reads where it is heading every frame, so anything
       the scene does while it is on its way is followed rather than missed. */
    if (follow) { try { to.target = follow(); } catch (err) {   } }

    write({
      target:  from.target.clone().lerp(to.target, e),
      theta:   from.theta + (to.theta - from.theta) * e,
      phi:     from.phi   + (to.phi   - from.phi)   * e,
      /* Zoom is stepped in ratios rather than in units — halving the width
         has to look like the same amount of move whether you are starting
         from ten inches or from ten feet. */
      frustum: from.frustum * Math.pow(to.frustum / from.frustum, e),
    });
    if (k < 1) { raf = requestAnimationFrame(step); return; }

    /* Arrived. A tracking move then sits on the target for a moment longer,
       pinned to it, so a scene that is still settling cannot leave the view
       parked next to the origin instead of on it. */
    if (follow && (now - t0) < ms + SETTLE_MS) { raf = requestAnimationFrame(step); return; }

    raf = 0;
    follow = null;
    if (window.VPBusy) window.VPBusy.release('camMove');
  }

  /* Fields left out of `v` are held at whatever they are now. Pass ms = 0 to
     jump. opts.follow is a function returning the aim point; when given, the
     move tracks it the whole way and holds onto it briefly afterwards. */
  function to_(v, duration, opts) {
    const want = Object.assign(state(), v || {});
    if (!(want.frustum > 1e-9)) want.frustum = defaultView();

    stop();
    const track = (opts && typeof opts.follow === 'function') ? opts.follow : null;
    const dur = (duration === undefined) ? MS : duration;
    if (!(dur > 0)) {
      write(want);
      /* Even a jump gets the hold, so an instant move to the origin is just
         as immune to a late-settling scene as an eased one. */
      if (track) {
        from = state(); to = Object.assign({}, want);
        follow = track; t0 = performance.now(); ms = 0;
        if (window.VPBusy) window.VPBusy.hold('camMove');
        raf = requestAnimationFrame(step);
      }
      return;
    }

    follow = track;
    from = state();
    /* Take the short way round the turntable: without this a swing from just
       under half a turn to just over it goes the whole way about. */
    let d = want.theta - from.theta;
    while (d >  Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    to = Object.assign({}, want, { theta: from.theta + d });

    /* Nothing worth animating — don't stall a frame over it. A tracking move
       still has to run, because the whole point of it is what happens after
       it arrives. */
    const still = !track
      && to.target.distanceToSquared(from.target) < 1e-12
      && Math.abs(d) < 1e-6
      && Math.abs(to.phi - from.phi) < 1e-6
      && Math.abs(to.frustum / from.frustum - 1) < 1e-4;
    if (still) { write(want); return; }

    t0 = performance.now();
    ms = dur;
    if (window.VPBusy) window.VPBusy.hold('camMove');
    raf = requestAnimationFrame(step);
  }

  return { to: to_, stop, state, MS };
})();

/* The view the page is meant to be looked at from: the isometric corner,
   aimed at the program's X0 Y0 Z0, at a fixed 7.5 inches across. Reset cam
   and every program or sample load land exactly here, so switching between
   samples no longer leaves the view somewhere different each time. */
const HOME_FRUSTUM = () =>
  (typeof unitMode !== 'undefined' && unitMode === 'mm') ? 190 : 7.5;

function homeView() {
  return {
    target:  viewOriginWorld(),
    theta:   ISO_THETA,
    phi:     ISO_PHI,
    frustum: HOME_FRUSTUM(),
  };
}

/* animate === false jumps; anything else eases. Either way the aim point is
   tracked, so a sample that is still seating its blank when the move starts
   still ends up with the origin dead center. */
function goHomeView(animate) {
  CamView.to(homeView(), animate === false ? 0 : CamView.MS,
             { follow: viewOriginWorld });
}
window.goHomeView = goHomeView;

function frameBox(box, opts) {
  if (!box || box.isEmpty()) return false;
  const o = opts || {};

  /* Aim at the work zero, not at the middle of the box — see
     viewOriginWorld(). The frustum then has to be wide enough to still hold
     the box from that off-center aim point, which is what spanAround
     measures. */
  const aim = viewOriginWorld();

  const sz = box.getSize(new THREE.Vector3());
  const wide = Math.hypot(sz.x, sz.y);
  const span = Math.max(wide, sz.z, spanAround(box, aim));

  /* A box with no size at all is a point, not a scene — framing it lands the
     frustum on zero and the view goes black. */
  const frustum = (span > 1e-6)
    ? Math.max(span * (o.margin || FIT_MARGIN), defaultView() * 0.02)
    : defaultView();

  CamView.to({ target: aim, frustum }, o.ms);
  return true;
}

/* What Fit View should actually frame: every solid you can see, plus the
   toolpath if it is being drawn. Fitting the toolpath alone — which is what
   this did — framed the moves and left the billet, the vise and the table
   hanging outside the view on any program whose cuts sit inside the metal. */
function sceneFitBox() {
  const box = new THREE.Box3();
  let any = false;

  if (window.PartModels && window.PartModels.bounds) {
    const b = window.PartModels.bounds();
    if (b && !b.isEmpty()) { box.union(b); any = true; }
  }

  if (pathsVisible && allSegments && allSegments.length) {
    updateProgramFrame();
    const pb = getBounds(allSegments).applyMatrix4(programFrame);
    if (!pb.isEmpty()) { box.union(pb); any = true; }
  }

  return any ? box : null;
}

/* `ms` is how long to take getting there; leave it out for the default ease,
   pass 0 to jump. */
function fitSceneToView(ms) {
  const box = sceneFitBox();
  if (box) return frameBox(box, { ms });
  /* Nothing in the scene at all — a workable view of the origin, not the
     120-unit slab the page opens with. */
  CamView.to({ target: new THREE.Vector3(0, 0, 0), frustum: defaultView() }, ms);
  return false;
}

function fitToView(segs, ms) {
  if (segs && segs.length) {
    updateProgramFrame();
    const box = getBounds(segs).applyMatrix4(programFrame);
    const scene = sceneFitBox();
    if (scene) box.union(scene);
    frameBox(box, { ms });
    return;
  }
  fitSceneToView(ms);
}

function updateStats(segs, text) {
  /* Every figure in the panel is live now, so loading a program only has to
     kick the painter — it reads the clock for itself. */
  paintTravelStats(segs);

  if (!segs.length) { activePaths = new Set(); renderLegend(); return; }

  activePaths = new Set(segs.map(s => s.type).filter(Boolean));

  if (allDrillHoles && allDrillHoles.length) activePaths.add('drill');
  renderLegend();
}

/* The whole Stats panel, live.

   Travel and distance already followed the run. Lines and Moves did not —
   they were written once when the program loaded and then sat there as two
   totals, which is what made the panel read as frozen next to Machine State
   even while the three figures under it were moving. All six now report
   where the run has got to, each against its total, and they land on the
   full figures on the last line.

   This is called from simSeekToTime, so it repaints on every seek: playing,
   scrubbing, stepping a block, or clicking a line in the editor. */
function paintTravelStats(segsIn) {
  const all = segsIn || allSegments || [];
  const el = id => document.getElementById(id);
  if (!el('stat-x')) return;

  const totalLines = (typeof gcodeInput !== 'undefined' && gcodeInput && gcodeInput.value)
    ? gcodeInput.value.split('\n').length
    : 0;

  /* "12 of 340" — the running figure reads large, the total follows it small,
     the same shape the inch/millimeter pairs below already use. */
  const of = (now, total) =>
    `${Number(now).toLocaleString()}<span class="stat-alt">of ${Number(total).toLocaleString()}</span>`;

  if (!all.length) {
    el('stat-lines').innerHTML = totalLines ? of(0, totalLines) : '—';
    el('stat-moves').textContent = '—';
    ['stat-x', 'stat-y', 'stat-z', 'stat-dist'].forEach(i => { el(i).textContent = '—'; });
    return;
  }

  /* How far through the program are we, and which line is that? */
  let done = all.length;
  let lineNow = -1;
  if (typeof segTimeline !== 'undefined' && segTimeline && segTimeline.length
      && typeof simTime === 'number') {
    done = 0;
    for (let i = 0; i < segTimeline.length; i++) {
      if (simTime < segTimeline[i].tStart) break;
      done = i + 1;
      const s = segTimeline[i].seg;
      /* Compensated runs carry their own line numbering, so a segment's
         original line is the one to report against the editor. */
      lineNow = (s.origLineIdx != null) ? s.origLineIdx : s.lineIdx;
    }
    done = Math.min(done, all.length);
  }

  const box = new THREE.Box3();
  let dist = 0;
  for (let i = 0; i < done; i++) {
    const s = all[i];
    if (!s.start || !s.end) continue;
    box.expandByPoint(s.start);
    box.expandByPoint(s.end);
    dist += s.start.distanceTo(s.end);
  }
  const sz = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());

  const toIn = v => (unitMode === 'inch') ? v : v / 25.4;
  const toMm = v => (unitMode === 'inch') ? v * 25.4 : v;
  const dual = (v, dp) =>
    `${toIn(v).toFixed(dp)}<span class="stat-alt">${toMm(v).toFixed(1)} mm</span>`;

  const lineShown = Math.min(Math.max(lineNow + 1, 0), totalLines || (lineNow + 1));
  el('stat-lines').innerHTML = totalLines
    ? of(lineShown, totalLines)
    : String(lineShown);

  /* With cutter comp running, the timeline is built from the compensated
     program and can hold a different number of moves than the original does,
     so the count is clamped rather than allowed to run past the total — and
     the last line always reads as all of them. */
  const movesDone = (typeof simTotalTime === 'number' && simTotalTime > 0
                     && simTime >= simTotalTime)
    ? all.length
    : Math.min(done, all.length);
  el('stat-moves').innerHTML = of(movesDone, all.length);

  el('stat-x').innerHTML = dual(sz.x, 3);
  el('stat-y').innerHTML = dual(sz.y, 3);
  el('stat-z').innerHTML = dual(sz.z, 3);
  el('stat-dist').innerHTML = dual(dist, 1);
}

function setStatus(moves, err) {
  editorStatus.textContent = err ? 'error' : moves+' moves';
  editorStatus.className   = err ? 'err' : 'ok';
}

/* Opening a program always leaves it rewound and ready to run: the code is
   re-read, the metal goes back to whole, and the cutter parks on X0 Y0 Z0 —
   which is where the parser starts every program from. It used to land on the
   last line of the previous run with the part already finished. */
function loadGCode(text) {
  gcodeInput.value = text;
  updateHighlight();

  allSegments = parseGCodeWithComp(text);
  buildTimeline(simSegments);
  updateStats(allSegments, text);
  setStatus(allSegments.length, false);
  /* Opening a program lands on the standard view rather than framing whatever
     happens to be on screen, so one sample after another always puts the work
     in the same place at the same size. Fit view is still there for when you
     want the scene framed instead. */
  goHomeView(true);
  buildCompOverlay();
  if (typeof renderCompPanel === 'function') renderCompPanel();

  if (typeof StockShowcase !== 'undefined' && StockShowcase.clear) {
    try { StockShowcase.clear(true); } catch (e) {}
  }
  if (typeof StockSim !== 'undefined' && StockSim.reset) {
    try { StockSim.reset(false); } catch (e) {}
  }
  if (typeof rewindSimToStart === 'function') rewindSimToStart();
  else simSeekToTime(0);

  showToast('Program loaded',
    allSegments.length.toLocaleString() + ' moves read, rewound to the first line and ready to run.');
}

const DRILL_DEMO_GCODE = `%
O01235 (CANNED CYCLE DEMO - G81 G82 G83 G84)
G00 G90 G40 G80 G20
T1 M06
G54 X0. Y0. S2500 M03
G43 H01 Z1.0 M08

(--- G81 SIMPLE DRILL - Row 1, Y=0 ---)
G99 G81 Z-0.6 R0.1 F12.0
X1.0 Y0.
X2.0
G98 X3.0
G99 X4.0
G80 G00 Z1.0

M01 (OPTIONAL STOP - CHECK DRILL DEPTH)

(--- G82 DRILL WITH DWELL - Row 2, Y=1 ---)
G99 G82 Z-0.5 R0.1 P500 F10.0
X1.0 Y1.0
X2.0
G98 X3.0
G99 X4.0
G80 G00 Z1.0

(--- G83 PECK DRILLING - Row 3, Y=2 ---)
G99 G83 Z-0.75 R0.1 Q0.25 F8.0
X1.0 Y2.0
X2.0
G98 X3.0
G99 X4.0
G80 G00 Z1.0

M00 (PROGRAM STOP - INSPECT PECKED HOLES)

(--- G84 TAPPING - Row 4, Y=3 ---)
M09
G99 G84 Z-0.5 R0.1 F15.0
X1.0 Y3.0
X2.0
G98 X3.0
G99 X4.0
G80 G00 Z1.0

M09
G53 G49 Y0. Z0.
M30
%`;

const MULTIAXIS_DEMO_GCODE = `%
O01005 (MULTI-AXIS RAPID TEST)
G00 G17 G20 G40 G49 G80 G90
G53 G49 Z0.
G54 X0. Y0. A0.
G00 X5.0 Y-3.5 Z-1.0 A45.0
G00 Z1.0
X0. Y0. A0.
G53 Z0.
G53 Y0.
M30
%`;

const ENGRAVE_DEMO_GCODE = `%
O01010 (TEXT ENGRAVING DEMO - G47)
G00 G17 G20 G40 G49 G80 G90
T1 M06
G00 G54 X0. Y0.
G43 Z1.0 H01 M03 S5000
(--- Line 1: HELLO WORLD at 0.4 inch tall ---)
G47 P0 X-4.0 Y2.0 I0. J0.4 R0.05 Z-0.005 F30. (HELLO WORLD)
G00 Z1.0
(--- Line 2: Serial number style with angle ---)
G47 P0 X-4.0 Y1.0 I0. J0.3 R0.05 Z-0.005 F30. (SN-2025-001)
G00 Z1.0
(--- Line 3: rotated 15 degrees ---)
G47 P0 X-4.0 Y-0.5 I15. J0.35 R0.05 Z-0.005 F30. (ANGLED TEXT)
G00 Z1.0
(--- Line 4: Part number bottom ---)
G47 P0 X-4.0 Y-2.0 I0. J0.25 R0.05 Z-0.005 F30. (PART NO 12345-A)
G00 Z1.0
G00 X0. Y0.
M05
M30
%`;
