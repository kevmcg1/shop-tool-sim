function renderLegend() {
  const container = document.getElementById('legend-rows');

  const existingKeys = new Set([...container.querySelectorAll('.legend-row')].map(r => r.dataset.key));

  existingKeys.forEach(k => {
    if (!activePaths.has(k)) {
      const el = container.querySelector(`.legend-row[data-key="${k}"]`);
      if (el) container.removeChild(el);
    }
  });

  PATH_TYPES.forEach(({ key, label, color }) => {
    if (!activePaths.has(key)) return;
    if (container.querySelector(`.legend-row[data-key="${key}"]`)) return;

    const row = document.createElement('div');
    row.className = 'legend-row';
    row.dataset.key = key;

    const swatch = document.createElement('div');
    swatch.className = 'legend-swatch';
    swatch.style.background = color;
    swatch.style.width = '14px';

    const lbl = document.createElement('span');
    lbl.className = 'legend-label';
    lbl.textContent = label;

    const visCb = document.createElement('input');
    visCb.type = 'checkbox';
    visCb.className = 'legend-cb';
    visCb.checked = pathVisibility[key] !== false;
    visCb.title = 'Toggle visibility';
    visCb.style.width = '28px';
    visCb.addEventListener('change', () => {
      pathVisibility[key] = visCb.checked;
      lbl.style.opacity = visCb.checked ? '1' : '0.35';
      swatch.style.opacity = visCb.checked ? '1' : '0.25';
      simSeekToTime(simTime);
    });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'legend-skip-btn';
    skipBtn.textContent = 'SKIP';
    skipBtn.title = 'Skip this path type in simulation timing';
    skipBtn.style.width = '28px';
    if (pathSkip[key]) skipBtn.classList.add('skip-active');
    skipBtn.addEventListener('click', () => {
      pathSkip[key] = !pathSkip[key];
      skipBtn.classList.toggle('skip-active', pathSkip[key]);
      const pct = simTotalTime > 0 ? simTime / simTotalTime : 1;

      buildTimeline(simSegments);
      simTime = pct * simTotalTime;
      simSeekToTime(simTime);
    });

    row.appendChild(swatch);
    row.appendChild(lbl);
    row.appendChild(visCb);
    row.appendChild(skipBtn);
    container.appendChild(row);
  });
}

function getActiveToolAtLine(lineIdx) {
  let active = null;
  for (let tc of toolChanges) {
    if (tc.lineIdx <= lineIdx) active = tc.tool;
    else break;
  }
  return active;
}

function getActiveSpindleAtLine(lineIdx) {
  let active = null;
  for (let sc of spindleChanges) {
    if (sc.lineIdx <= lineIdx) active = sc.rpm;
    else break;
  }
  return active;
}
