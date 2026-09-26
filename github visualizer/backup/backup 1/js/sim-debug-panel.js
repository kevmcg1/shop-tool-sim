/* Sim Debug — what the simulator is doing right now, in plain words.
   Grouped, labelled and unit-tagged rather than a dump of variable names. */

(function () {
  const target = document.getElementById('sim-debug-content');
  if (!target) return;

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const secs = t => (typeof t === 'number' && isFinite(t)) ? t.toFixed(2) + 's' : '—';
  const pt = p => {
    if (!p) return '—';
    const f = n => (typeof n === 'number') ? n.toFixed(3) : '?';
    return `${f(p.x)}, ${f(p.y)}, ${f(p.z)}`;
  };

  const MOVE_NAMES = {
    rapid: 'Rapid (G00)', cut: 'Feed (G01)', arot: 'Arc (G02/G03)',
    retract: 'Retract', drill: 'Drill cycle', engrave: 'Engrave (G47)',
  };

  function head(text) {
    return `<div class="sd-head">${esc(text)}</div>`;
  }
  function row(label, value, tone) {
    const cls = tone ? ' sd-' + tone : '';
    return `<div class="sd-row"><span class="sd-key">${esc(label)}</span>` +
           `<span class="sd-val${cls}">${value}</span></div>`;
  }
  const pill = (ok, yes, no) =>
    `<span class="sd-pill ${ok ? 'is-on' : 'is-off'}">${ok ? yes : no}</span>`;

  function findActiveSimSeg() {
    if (!segTimeline || !segTimeline.length) return null;
    if (typeof simTime !== 'number') return null;
    for (let i = 0; i < segTimeline.length; i++) {
      const t = segTimeline[i];
      if (simTime >= t.tStart && simTime < t.tEnd) {
        const frac = (t.tEnd > t.tStart) ? (simTime - t.tStart) / (t.tEnd - t.tStart) : 0;
        return { idx: i, seg: t.seg, tStart: t.tStart, tEnd: t.tEnd, frac };
      }
    }
    const last = segTimeline.length - 1;
    return { idx: last, seg: segTimeline[last].seg,
             tStart: segTimeline[last].tStart, tEnd: segTimeline[last].tEnd, frac: 1 };
  }

  function render() {
    const active = findActiveSimSeg();
    const out = [];

    /* ---- what the run is doing ---- */
    out.push(head('Run'));
    out.push(row('State', pill(simPlaying, 'Playing', simActive ? 'Paused' : 'Stopped')));
    out.push(row('Clock', `${secs(simTime)} of ${secs(simTotalTime)}`));

    const pc = (simTotalTime > 0) ? (simTime / simTotalTime * 100) : 0;
    out.push(row('Through', pc.toFixed(1) + '%'));

    if (typeof singleBlockMode !== 'undefined' && singleBlockMode) {
      out.push(row('Single block', pill(true, 'On, stepping line by line', '')));
    }

    /* ---- the move under the cutter ---- */
    out.push(head('Current move'));
    if (active && active.seg) {
      const s = active.seg;
      const line = (s.origLineIdx != null) ? s.origLineIdx + 1 : (s.lineIdx + 1);
      out.push(row('Editor line', String(line), 'accent'));
      out.push(row('Kind', esc(MOVE_NAMES[s.type] || s.type || 'unknown')));
      out.push(row('Feed', esc(s.feedLabel || '—')));
      out.push(row('Move', (active.frac * 100).toFixed(0) + '% done'));
      out.push(row('From', pt(s.start)));
      out.push(row('To', pt(s.end)));
      if (s.start && s.end && typeof s.start.clone === 'function') {
        out.push(row('Cutter tip', pt(s.start.clone().lerp(s.end, active.frac)), 'accent'));
      }
      out.push(row('Move number', `${active.idx + 1} of ${segTimeline.length}`));
    } else {
      out.push(row('Current move', 'Nothing running — the program is at the start or empty.'));
    }

    /* ---- what got read out of the program ---- */
    out.push(head('Program'));
    const pending = (typeof parsePending !== 'undefined') && parsePending;
    out.push(row('Parser', pending
      ? pill(false, '', 'Still reading your edit')
      : pill(true, 'Up to date', '')));
    out.push(row('Moves drawn', String((allSegments || []).length)));
    out.push(row('Moves simulated', String((simSegments || []).length)));

    if (window.PartModels && window.PartModels.cutCount) {
      out.push(row('Cuts in the metal', String(window.PartModels.cutCount())));
    }

    target.innerHTML = out.join('');
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();
