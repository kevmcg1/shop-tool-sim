(function () {
  const ccLabel        = document.getElementById('cc-enable-label');
  const ccTrack        = document.getElementById('cc-enable-track');
  const ccOverlayLabel = document.getElementById('cc-overlay-label');
  const ccOverlayTrack = document.getElementById('cc-overlay-track');
  const ccStatus       = document.getElementById('cc-status');
  const ccDiagWrap     = document.getElementById('cc-diagnostics-wrap');
  const ccDiagList     = document.getElementById('cc-diagnostics-list');
  if (!ccLabel || !ccTrack) return;

  function refreshOverlaySubtoggle() {
    if (!ccOverlayLabel || !ccOverlayTrack) return;
    if (compEnabled) {
      ccOverlayLabel.style.opacity = '1';
      ccOverlayLabel.style.cursor  = 'pointer';
    } else {
      ccOverlayLabel.style.opacity = '0.4';
      ccOverlayLabel.style.cursor  = 'not-allowed';
    }
    ccOverlayTrack.classList.toggle('on', compOverlayVisible && compEnabled);
  }

  const SEV_ICON = { info: 'ⓘ', warn: '⚠', err: '✕' };
  const SEV_BORDER = {
    info: 'rgba(122, 134, 216, 0.7)',
    warn: 'rgba(232, 184, 96, 0.85)',
    err:  'rgba(232, 112, 128, 0.9)',
  };
  const SEV_LABEL_COLOR = {
    info: '#7a86d8',
    warn: '#e8b860',
    err:  '#e87080',
  };

  function fmtRadius(r) {
    if (r == null) return '—';
    return r.toFixed(4) + ' (Ø ' + (r * 2).toFixed(4) + ')';
  }

  window.renderCompPanel = function renderCompPanel() {
    if (!compEnabled) {
      ccStatus.innerHTML = 'Off — original toolpath shown.';
      ccStatus.style.color = 'var(--text-dim)';
      ccDiagWrap.style.display = 'none';
      return;
    }

    const r = lastCompResult;
    if (!r) {
      ccStatus.innerHTML = 'On · waiting for parse…';
      ccStatus.style.color = 'var(--text-dim)';
      ccDiagWrap.style.display = 'none';
      return;
    }

    const counts = { info: 0, warn: 0, err: 0 };
    (r.warnings || []).forEach(w => { if (counts[w.severity] != null) counts[w.severity]++; });
    const hardFail = r.gcode === '' && counts.err > 0;

    const lines = [];
    if (hardFail) {
      lines.push('<span style="color:#e87080;font-weight:700">⚠ Compensation failed</span>');
      lines.push('Showing original (uncompensated) path.');
    } else if (!r.hadCompensation) {
      lines.push('No G41/G42 in program.');
      lines.push('Output identical to input.');
    } else {
      lines.push('Compensated <span style="color:var(--accent);font-weight:700">'
        + r.windowCount + '</span> '
        + (r.windowCount === 1 ? 'window' : 'windows')
        + '.');
      lines.push('Tool radius: ' + fmtRadius(lastCompRadiusUsed));
    }
    if (counts.err + counts.warn + counts.info > 0) {
      const bits = [];
      if (counts.err)  bits.push('<span style="color:#e87080">' + counts.err + ' err</span>');
      if (counts.warn) bits.push('<span style="color:#e8b860">' + counts.warn + ' warn</span>');
      if (counts.info) bits.push('<span style="color:#7a86d8">' + counts.info + ' info</span>');
      lines.push(bits.join(' · '));
    }
    ccStatus.innerHTML = lines.join('<br>');
    ccStatus.style.color = 'var(--text)';

    const ws = (r.warnings || []).slice().sort((a, b) => {
      const rank = { err: 0, warn: 1, info: 2 };
      return rank[a.severity] - rank[b.severity];
    });
    if (ws.length === 0) {
      ccDiagWrap.style.display = 'none';
      ccDiagList.innerHTML = '';
      return;
    }
    ccDiagWrap.style.display = 'block';
    ccDiagList.innerHTML = ws.map(w => {
      const sev = w.severity;
      const icon = SEV_ICON[sev] || 'ⓘ';
      const border = SEV_BORDER[sev] || SEV_BORDER.info;
      const labelCol = SEV_LABEL_COLOR[sev] || SEV_LABEL_COLOR.info;
      const lineRef = (w.lineIndex != null)
        ? '<div style="font-size:9px;color:var(--text-dim);margin-top:2px;">Line ' + (w.lineIndex + 1) + '</div>'
        : '';

      const safeMsg = String(w.msg).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return '<div data-line="' + (w.lineIndex != null ? w.lineIndex : '') + '" style="'
        + 'display:flex;align-items:flex-start;gap:6px;'
        + 'padding:5px 7px;margin-bottom:3px;'
        + 'background:rgba(20,20,20,0.7);'
        + 'border-left:3px solid ' + border + ';'
        + 'border-radius:3px;cursor:' + (w.lineIndex != null ? 'pointer' : 'default') + ';'
        + 'font-family:var(--font-mono);font-size:10px;line-height:1.35;'
        + '">'
        + '<span style="color:' + labelCol + ';flex-shrink:0;font-weight:700;">' + icon + '</span>'
        + '<span style="flex:1;color:var(--text);word-wrap:break-word;">' + safeMsg + lineRef + '</span>'
        + '</div>';
    }).join('');

    ccDiagList.querySelectorAll('[data-line]').forEach(el => {
      const ln = parseInt(el.getAttribute('data-line'));
      if (!isNaN(ln) && ln >= 0) {
        el.addEventListener('click', () => {

          const lines = gcodeInput.value.split('\n');
          let pos = 0;
          for (let i = 0; i < ln && i < lines.length; i++) pos += lines[i].length + 1;
          gcodeInput.focus();
          gcodeInput.setSelectionRange(pos, pos);

          if (typeof onCursorMove === 'function') onCursorMove();
        });
      }
    });
  };

  ccLabel.addEventListener('click', () => {
    compEnabled = !compEnabled;
    ccTrack.classList.toggle('on', compEnabled);

    try {

      allSegments = parseGCodeWithComp(gcodeInput.value);
      buildTimeline(simSegments);
      simSeekToTime(0);
      updateStats(allSegments, gcodeInput.value);
      setStatus(allSegments.length, false);
      buildCompOverlay();
    } catch (e) {
      console.error('cutter-comp toggle parse failed:', e);
      setStatus(0, true);
    }

    compOverlayGroup.visible = compOverlayVisible && compEnabled;

    refreshOverlaySubtoggle();
    renderCompPanel();
    showToast(compEnabled ? 'Cutter compensation on' : 'Cutter compensation off',
      compEnabled
        ? 'G41 and G42 are worked out from the tool radius, and the cutter follows that path instead of the line as written.'
        : 'The cutter follows the line exactly as the program writes it, radius and all.');
  });

  if (ccOverlayLabel) {
    ccOverlayLabel.addEventListener('click', () => {
      if (!compEnabled) return;
      compOverlayVisible = !compOverlayVisible;
      compOverlayGroup.visible = compOverlayVisible && compEnabled;
      refreshOverlaySubtoggle();
      renderCompPanel();
    });
  }

  const ccLogBtn = document.getElementById('cc-log-gcode-btn');
  if (ccLogBtn) {
    ccLogBtn.addEventListener('click', () => {
      if (!compEnabled) {
        console.log('[CutterComp] Comp is disabled — enable it to see engine output.');
        return;
      }
      if (!lastCompResult) {
        console.log('[CutterComp] No engine result yet — try editing the G-code or toggling comp off/on.');
        return;
      }
      const r = lastCompResult;
      console.group('[CutterComp] last engine result');
      console.log('hadCompensation:', r.hadCompensation,
                  ' windowCount:', r.windowCount,
                  ' tool radius:', lastCompRadiusUsed);
      if (r.gcode === '' || r.gcode == null) {
        console.log('(no gcode produced — hard fail; see warnings below)');
      } else {
        console.log('--- compensated gcode ---');
        console.log(r.gcode);
      }
      if (r.warnings && r.warnings.length) {
        console.log('--- warnings (' + r.warnings.length + ') ---');
        for (const w of r.warnings) {
          const prefix = '[' + w.severity.toUpperCase() + ']';
          const lineRef = (w.lineIndex != null) ? ' (line ' + (w.lineIndex + 1) + ')' : '';
          console.log(prefix + ' ' + w.msg + lineRef);
        }
      } else {
        console.log('(no warnings)');
      }
      console.groupEnd();
    });
  }

  ccTrack.classList.toggle('on', compEnabled);
  refreshOverlaySubtoggle();
  renderCompPanel();
})();
