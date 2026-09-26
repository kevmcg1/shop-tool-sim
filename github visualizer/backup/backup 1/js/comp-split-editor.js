(function () {
  const editorSplit  = document.getElementById('editor-split');
  const splitter     = document.getElementById('editor-splitter');
  const compWrap     = document.getElementById('gcode-comp-wrap');
  const compHL       = document.getElementById('gcode-comp-highlight');
  const compOut      = document.getElementById('gcode-comp-output');
  const compEmpty    = document.getElementById('gcode-comp-emptystate');
  const showLabel    = document.getElementById('cc-showcode-label');
  const showTrack    = document.getElementById('cc-showcode-track');
  const syncLabel    = document.getElementById('cc-syncscroll-label');
  const syncTrack    = document.getElementById('cc-syncscroll-track');
  const leftWrap     = document.getElementById('gcode-editor-wrap');
  const gcodeInputEl = document.getElementById('gcode-input');
  const gcodeHLEl    = document.getElementById('gcode-highlight');
  if (!editorSplit || !compWrap || !leftWrap) return;

  let showCompCode  = false;
  let syncScroll    = true;
  let leftPaneWidth = null;

  function refreshSubtoggleVisuals() {
    if (compEnabled) {
      showLabel.style.opacity = '1';
      showLabel.style.cursor  = 'pointer';
    } else {
      showLabel.style.opacity = '0.4';
      showLabel.style.cursor  = 'not-allowed';
    }
    showTrack.classList.toggle('on', showCompCode && compEnabled);

    const syncEnabled = compEnabled && showCompCode;
    if (syncEnabled) {
      syncLabel.style.opacity = '1';
      syncLabel.style.cursor  = 'pointer';
    } else {
      syncLabel.style.opacity = '0.4';
      syncLabel.style.cursor  = 'not-allowed';
    }
    syncTrack.classList.toggle('on', syncScroll);
  }

  function tokOrRaw(line) {
    if (typeof gcodeTokenizeLine === 'function') {
      return gcodeTokenizeLine(line) || '&nbsp;';
    }
    return (line || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || '&nbsp;';
  }

  function rebuildCompHighlight(text) {
    const lines = text.split('\n');
    compHL.innerHTML = lines.map((line, i) => {
      const content = tokOrRaw(line);
      return `<span class="hl-line" data-line="${i}" style="display:block;opacity:1;transition:opacity 0.08s">${content}</span>`;
    }).join('') + '\n';
  }

  function splitShouldBeActive() {
    return compEnabled && showCompCode && (typeof lastCompResult !== 'undefined') && lastCompResult != null;
  }

  function renderCompCode() {
    const active = splitShouldBeActive();
    editorSplit.classList.toggle('split-active', active);

    if (active) {
      const totalW = editorSplit.clientWidth || 0;
      const target = (leftPaneWidth != null && leftPaneWidth > 40)
        ? Math.min(leftPaneWidth, Math.max(60, totalW - 60))
        : Math.floor(totalW / 2);
      leftWrap.style.width = target + 'px';
      leftWrap.style.flex  = '0 0 ' + target + 'px';
    } else {
      leftWrap.style.width = '';
      leftWrap.style.flex  = '';

      compEmpty.classList.remove('show', 'err');
      return;
    }

    const r = lastCompResult;
    const hardFail = r && r.gcode === '' && (r.warnings || []).some(w => w.severity === 'err');

    if (hardFail) {
      compOut.value = '';
      compHL.innerHTML = '';
      compEmpty.textContent = 'Compensation hard-failed. See diagnostics in the Cutter Comp panel for the cited line(s) and reason — the right pane will repopulate as soon as the engine produces output.';
      compEmpty.classList.add('show', 'err');
      return;
    }
    if (!r || r.gcode == null) {
      compOut.value = '';
      compHL.innerHTML = '';
      compEmpty.textContent = 'Engine has not produced output yet.';
      compEmpty.classList.add('show');
      compEmpty.classList.remove('err');
      return;
    }

    compEmpty.classList.remove('show', 'err');
    compOut.value = r.gcode;
    rebuildCompHighlight(r.gcode);

    requestAnimationFrame(() => {
      compHL.scrollTop  = compOut.scrollTop;
      compHL.scrollLeft = compOut.scrollLeft;
    });
  }

  function updateCompEditorActiveLine(compLineIdx) {
    if (!editorSplit.classList.contains('split-active')) return;
    const spans = compHL.querySelectorAll('.hl-line');
    if (!spans.length) return;
    const dimming = (typeof simActive !== 'undefined' && simActive) && compLineIdx >= 0;
    spans.forEach(span => {
      const li = parseInt(span.dataset.line);
      span.style.opacity = dimming ? (li === compLineIdx ? '1' : '0.2') : '1';
    });
    if (dimming && spans[compLineIdx]) {
      const lineH = compHL.scrollHeight / Math.max(spans.length, 1);
      const targetScroll = compLineIdx * lineH - compHL.clientHeight / 2 + lineH / 2;
      compOut.scrollTop = Math.max(0, targetScroll);
      compHL.scrollTop  = compOut.scrollTop;
    }
  }

  window.updateCompEditorActiveLine = updateCompEditorActiveLine;
  window.renderCompCode             = renderCompCode;

  window.resetSplitEditor = function () {
    showCompCode  = false;
    syncScroll    = true;
    leftPaneWidth = null;
    if (leftWrap) {
      leftWrap.style.width = '';
      leftWrap.style.flex  = '';
    }
    refreshSubtoggleVisuals();
    renderCompCode();
  };

  let syncSilencer = false;
  function syncScrollFrom(srcInput, dstInput, dstHL) {
    if (!syncScroll || syncSilencer) return;
    const srcMax = srcInput.scrollHeight - srcInput.clientHeight;
    const dstMax = dstInput.scrollHeight - dstInput.clientHeight;
    if (srcMax <= 0 || dstMax <= 0) return;
    const frac = srcInput.scrollTop / srcMax;
    syncSilencer = true;
    dstInput.scrollTop = frac * dstMax;
    dstHL.scrollTop = dstInput.scrollTop;
    requestAnimationFrame(() => { syncSilencer = false; });
  }

  if (gcodeInputEl) {
    gcodeInputEl.addEventListener('scroll', () => {

      if (!editorSplit.classList.contains('split-active')) return;

      compHL.scrollTop  = compOut.scrollTop;
      compHL.scrollLeft = compOut.scrollLeft;
      syncScrollFrom(gcodeInputEl, compOut, compHL);
    });
  }
  compOut.addEventListener('scroll', () => {
    compHL.scrollTop  = compOut.scrollTop;
    compHL.scrollLeft = compOut.scrollLeft;
    if (!editorSplit.classList.contains('split-active')) return;
    if (gcodeHLEl) syncScrollFrom(compOut, gcodeInputEl, gcodeHLEl);
  });

  showLabel.addEventListener('click', () => {
    if (!compEnabled) return;
    showCompCode = !showCompCode;
    refreshSubtoggleVisuals();
    renderCompCode();
    if (typeof showToast === 'function') {
      showToast(showCompCode ? 'Compensated code shown' : 'Compensated code hidden',
        showCompCode
          ? 'The right-hand pane holds the program as the compensator rewrote it, line for line against yours.'
          : 'Back to just your program.');
    }
  });
  syncLabel.addEventListener('click', () => {
    if (!(compEnabled && showCompCode)) return;
    syncScroll = !syncScroll;
    refreshSubtoggleVisuals();
  });

  let dragging = false;
  splitter.addEventListener('mousedown', e => {
    if (!editorSplit.classList.contains('split-active')) return;
    dragging = true;
    splitter.classList.add('dragging');
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect = editorSplit.getBoundingClientRect();
    const w = e.clientX - rect.left;
    const min = 60;
    const max = rect.width - 60;
    leftPaneWidth = Math.max(min, Math.min(max, w));
    leftWrap.style.width = leftPaneWidth + 'px';
    leftWrap.style.flex  = '0 0 ' + leftPaneWidth + 'px';
  });
  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      splitter.classList.remove('dragging');
    }
  });

  window.addEventListener('resize', () => {
    if (editorSplit.classList.contains('split-active')) renderCompCode();
  });

  const _origRenderCompPanel = window.renderCompPanel;
  window.renderCompPanel = function () {
    if (typeof _origRenderCompPanel === 'function') _origRenderCompPanel();
    refreshSubtoggleVisuals();
    renderCompCode();
  };

  refreshSubtoggleVisuals();
  renderCompCode();
})();
