const toolTableBody = document.getElementById('tool-table-body');
const showToolTrack = document.getElementById('show-tool-track');
const showToolLabel = document.getElementById('show-tool-label');

let toolTableDisplayUnit = 'inch';

const IN_TO_MM = 25.4;

function diaToDisplay(nativeVal) {
  if (toolTableDisplayUnit === 'mm' && unitMode === 'inch') return nativeVal * IN_TO_MM;
  if (toolTableDisplayUnit === 'inch' && unitMode === 'mm')  return nativeVal / IN_TO_MM;
  return nativeVal;
}

function diaToNative(displayVal) {
  if (toolTableDisplayUnit === 'mm' && unitMode === 'inch') return displayVal / IN_TO_MM;
  if (toolTableDisplayUnit === 'inch' && unitMode === 'mm')  return displayVal * IN_TO_MM;
  return displayVal;
}

/* The spinner arrows walk in 0.025" — a sensible cutter increment. In mm that
   is the same physical step, so the two units stay in agreement. */
function getDisplayStep() { return toolTableDisplayUnit === 'mm' ? '0.635' : '0.025'; }
function getDisplayDecimals() { return toolTableDisplayUnit === 'mm' ? 3 : 4; }

function diaInMM(nativeVal)   { return unitMode === 'inch' ? nativeVal * IN_TO_MM : nativeVal; }
function diaInInch(nativeVal) { return unitMode === 'inch' ? nativeVal : nativeVal / IN_TO_MM; }
function diaAltText(nativeVal) {
  if (nativeVal == null || !isFinite(nativeVal)) return '';
  return toolTableDisplayUnit === 'inch'
    ? `(${Math.round(diaInMM(nativeVal) * 100) / 100} mm)`
    : `(${diaInInch(nativeVal).toFixed(4)}″)`;
}

function updateToolUnitButtons() {
  const inBtn = document.getElementById('tool-unit-btn-inch');
  const mmBtn = document.getElementById('tool-unit-btn-mm');
  const header = document.getElementById('tool-dia-header');
  const isInch = toolTableDisplayUnit === 'inch';
  inBtn.style.borderColor = isInch ? 'var(--accent)' : 'var(--border)';
  inBtn.style.background  = isInch ? 'rgba(232,197,71,0.15)' : 'transparent';
  inBtn.style.color       = isInch ? 'var(--accent)' : 'var(--text-dim)';
  mmBtn.style.borderColor = !isInch ? 'var(--accent)' : 'var(--border)';
  mmBtn.style.background  = !isInch ? 'rgba(232,197,71,0.15)' : 'transparent';
  mmBtn.style.color       = !isInch ? 'var(--accent)' : 'var(--text-dim)';
  if (header) header.textContent = isInch ? 'Dia (in)' : 'Dia (mm)';
}

function refreshToolTableValues() {
  Array.from(toolTableBody.querySelectorAll('tr[data-tool]')).forEach(row => {
    const toolNum = parseInt(row.dataset.tool);
    const inp = row.querySelector('input');
    if (!inp) return;
    const native = toolTable.get(toolNum);
    if (native == null) return;
    inp.step = getDisplayStep();
    inp.value = diaToDisplay(native).toFixed(getDisplayDecimals());
    const alt = row.querySelector('.dia-alt');
    if (alt) alt.textContent = diaAltText(native);
  });

  if (typeof ToolModels !== 'undefined' && ToolModels.relabel) ToolModels.relabel();
}

document.getElementById('tool-unit-btn-inch').addEventListener('click', () => {
  if (toolTableDisplayUnit === 'inch') return;
  toolTableDisplayUnit = 'inch';
  updateToolUnitButtons();
  refreshToolTableValues();

  if (typeof refreshDOffsetTableValues === 'function') refreshDOffsetTableValues();
  showToast('Tool sizes in inches',
    'The diameters in the tool table are now typed and shown in inches. The program\u2019s own units are whatever its G20 or G21 says.');
});

document.getElementById('tool-unit-btn-mm').addEventListener('click', () => {
  if (toolTableDisplayUnit === 'mm') return;
  toolTableDisplayUnit = 'mm';
  updateToolUnitButtons();
  refreshToolTableValues();
  if (typeof refreshDOffsetTableValues === 'function') refreshDOffsetTableValues();
  showToast('Tool sizes in millimetres',
    'The diameters in the tool table are now typed and shown in mm. The program\u2019s own units are whatever its G20 or G21 says.');
});

function updateToolTableUI() {
  const sortedTools = Array.from(toolTable.entries()).sort((a,b) => a[0] - b[0]);

  Array.from(toolTableBody.querySelectorAll('tr')).forEach(row => {
    const toolNum = parseInt(row.dataset.tool);
    if (!toolTable.has(toolNum)) row.remove();
  });

  sortedTools.forEach(([tool, nativeDia]) => {

    let row = toolTableBody.querySelector(`tr[data-tool="${tool}"]`);
    if (row) {
      const inp = row.querySelector('input');
      if (inp && document.activeElement !== inp) {
        inp.step = getDisplayStep();
        inp.value = diaToDisplay(nativeDia).toFixed(getDisplayDecimals());
      }
      const altSpan = row.querySelector('.dia-alt');
      if (altSpan) altSpan.textContent = diaAltText(nativeDia);
      return;
    }

    const tr = document.createElement('tr');
    tr.dataset.tool = tool;

    const tdTool = document.createElement('td');
    tdTool.textContent = `T${tool}`;
    tdTool.style.fontFamily = 'var(--font-mono)';

    const tdDia = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.step = getDisplayStep();
    input.min = '0';   // the spinner steps off this, so keep it on the 0.025 grid
    input.value = diaToDisplay(nativeDia).toFixed(getDisplayDecimals());

    const alt = document.createElement('span');
    alt.className = 'dia-alt';
    alt.textContent = diaAltText(nativeDia);

    /* live = keystrokes and arrow presses, which must not rewrite the field
       out from under the caret. Only a blur or a bad value redraws it. */
    const commit = (live) => {
      const displayVal = parseFloat(input.value);
      if (!isNaN(displayVal) && displayVal > 0) {
        const native = diaToNative(displayVal);
        toolTable.set(tool, native);
        alt.textContent = diaAltText(native);
        simSeekToTime(simTime);
      } else if (!live) {

        input.value = diaToDisplay(toolTable.get(tool) || nativeDia).toFixed(getDisplayDecimals());
      }
    };

    input.addEventListener('input', () => commit(true));
    input.addEventListener('change', () => commit(true));
    input.addEventListener('blur', () => commit(false));

    tdDia.appendChild(input);
    tdDia.appendChild(alt);
    tr.appendChild(tdTool);
    tr.appendChild(tdDia);
    toolTableBody.appendChild(tr);
  });
}

function getLiveToolDia(toolNum) {
  if (!toolNum) return null;
  const row = toolTableBody.querySelector(`tr[data-tool="${toolNum}"]`);
  if (row) {
    const inp = row.querySelector('input');
    if (inp) {
      const displayVal = parseFloat(inp.value);
      if (!isNaN(displayVal) && displayVal > 0) {
        const native = diaToNative(displayVal);
        toolTable.set(toolNum, native);
        return native;
      }
    }
  }
  return toolTable.get(toolNum) || null;
}

const dOffsetTableBody    = document.getElementById('d-offset-table-body');
const dOffsetEmptyMsg     = document.getElementById('d-offset-empty');

function updateDOffsetTableUI() {

  const isEmpty = dOffsetTable.size === 0;
  if (dOffsetEmptyMsg) dOffsetEmptyMsg.style.display = isEmpty ? '' : 'none';

  const sortedDs = Array.from(dOffsetTable.entries()).sort((a,b) => a[0] - b[0]);

  Array.from(dOffsetTableBody.querySelectorAll('tr')).forEach(row => {
    const dNum = parseInt(row.dataset.d);
    if (!dOffsetTable.has(dNum)) row.remove();
  });

  sortedDs.forEach(([dNum, nativeDia]) => {

    let row = dOffsetTableBody.querySelector(`tr[data-d="${dNum}"]`);
    if (row) {
      const inp = row.querySelector('input');
      if (inp && document.activeElement !== inp) {
        inp.step = getDisplayStep();
        inp.value = diaToDisplay(nativeDia).toFixed(getDisplayDecimals());
      }
      return;
    }

    const tr = document.createElement('tr');
    tr.dataset.d = dNum;

    const tdD = document.createElement('td');

    tdD.textContent = `D${String(dNum).padStart(2, '0')}`;
    tdD.style.fontFamily = 'var(--font-mono)';

    const tdDia = document.createElement('td');

    if (dNum === 0) {
      const span = document.createElement('span');
      span.textContent = '— no offset —';
      span.style.color = 'var(--text-dim)';
      span.style.fontSize = '10px';
      span.style.fontStyle = 'italic';
      tdDia.appendChild(span);
    } else {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = getDisplayStep();
      input.min = '0';   // the spinner steps off this, so keep it on the 0.025 grid
      input.value = diaToDisplay(nativeDia).toFixed(getDisplayDecimals());

      const alt = document.createElement('span');
      alt.className = 'dia-alt';
      alt.textContent = diaAltText(nativeDia);

      const commit = (live) => {
        const displayVal = parseFloat(input.value);
        if (!isNaN(displayVal) && displayVal > 0) {
          const native = diaToNative(displayVal);
          dOffsetTable.set(dNum, native);
          alt.textContent = diaAltText(native);

          if (typeof flushParseNow === 'function') flushParseNow();
        } else if (!live) {

          input.value = diaToDisplay(dOffsetTable.get(dNum) || nativeDia)
                          .toFixed(getDisplayDecimals());
        }
      };

      input.addEventListener('input', () => commit(true));
      input.addEventListener('change', () => commit(true));
      input.addEventListener('blur', () => commit(false));

      tdDia.appendChild(input);
      tdDia.appendChild(alt);
    }

    tr.appendChild(tdD);
    tr.appendChild(tdDia);
    dOffsetTableBody.appendChild(tr);
  });
}

function refreshDOffsetTableValues() {
  Array.from(dOffsetTableBody.querySelectorAll('tr[data-d]')).forEach(row => {
    const dNum = parseInt(row.dataset.d);
    if (dNum === 0) return;
    const inp = row.querySelector('input');
    if (!inp) return;
    const native = dOffsetTable.get(dNum);
    if (native == null) return;
    inp.step = getDisplayStep();
    inp.value = diaToDisplay(native).toFixed(getDisplayDecimals());
    const alt = row.querySelector('.dia-alt');
    if (alt) alt.textContent = diaAltText(native);
  });

  const header = document.getElementById('d-offset-dia-header');
  if (header) header.textContent = toolTableDisplayUnit === 'inch' ? 'Dia (in)' : 'Dia (mm)';
}

function flushDOffsetDiameters() {
  if (!dOffsetTableBody) return;
  dOffsetTableBody.querySelectorAll('tr[data-d]').forEach(row => {
    const dNum = parseInt(row.dataset.d);
    if (dNum === 0) return;
    const inp = row.querySelector('input');
    if (!inp) return;
    const v = parseFloat(inp.value);
    if (!isNaN(v) && v > 0) {
      dOffsetTable.set(dNum, diaToNative(v));
    } else {
      inp.value = diaToDisplay(dOffsetTable.get(dNum) || 0.5)
                    .toFixed(getDisplayDecimals());
    }
  });
}

showToolLabel.addEventListener('click', () => {
  setToolVisible(!toolVisible);
  showToast(toolVisible ? 'Cutter shown' : 'Cutter hidden',
    toolVisible ? 'The cutter is back on screen.'
                : 'The cutter is out of the way so you can see the shape it has left behind.');
});
