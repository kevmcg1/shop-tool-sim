/* The camera and cursor read-out. It used to be behind a switch that
   defaulted to off, so the panel showed "(disabled)" until you found the
   toggle — for a read-out that is pure information and costs a few string
   builds a second, that is a step for nothing. The switch is gone and the
   numbers are always live; opening the section is the only gesture needed.

   It only does the work while the section is actually open, so a collapsed
   panel costs nothing at all. */
(function () {
  const target = document.getElementById('view-stats-content');
  if (!target) return;

  window.__viewStatsEnabled = true;

  let hudX = document.getElementById('hud-x');
  let hudY = document.getElementById('hud-y');
  let hudZ = document.getElementById('hud-z');

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function row(label, value, color) {
    const c = color || 'var(--text)';
    return `<div><span style="color:var(--text-dim)">${esc(label)}:</span> `
         + `<span style="color:${c}">${value}</span></div>`;
  }

  function fmtNum(n, d) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return n.toFixed(d != null ? d : 3);
  }
  function fmtDeg(rad) {
    if (typeof rad !== 'number' || !isFinite(rad)) return '—';

    let deg = rad * 180 / Math.PI;
    while (deg > 180) deg -= 360;
    while (deg <= -180) deg += 360;
    return deg.toFixed(1) + '°';
  }
  function fmtPhi(rad) {
    if (typeof rad !== 'number' || !isFinite(rad)) return '—';
    return (rad * 180 / Math.PI).toFixed(1) + '°';
  }

  function renderEnabled() {
    const lines = [];

    if (typeof camSphere !== 'undefined' && camSphere) {
      lines.push(row('orbit θ (theta)', fmtDeg(camSphere.theta), 'var(--accent)'));
      lines.push(row('orbit φ (phi)',   fmtPhi(camSphere.phi),   'var(--accent)'));
      lines.push(row('distance (r)',    fmtNum(camSphere.r, 2)));
    } else {
      lines.push(row('camSphere', '(unavailable)'));
    }

    if (typeof baseZoom !== 'undefined' && typeof frustumSize !== 'undefined' && frustumSize > 0) {
      const zoomMul = baseZoom / frustumSize;
      lines.push(row('zoom',         fmtNum(zoomMul, 2) + '×'));
      lines.push(row('frustum size', fmtNum(frustumSize, 2)));
    } else {
      lines.push(row('zoom', '(unavailable)'));
    }

    if (typeof camTarget !== 'undefined' && camTarget) {
      lines.push(row('target X', fmtNum(camTarget.x, 3)));
      lines.push(row('target Y', fmtNum(camTarget.y, 3)));
      lines.push(row('target Z', fmtNum(camTarget.z, 3)));
    } else {
      lines.push(row('camTarget', '(unavailable)'));
    }

    const cx = hudX ? hudX.textContent : null;
    const cy = hudY ? hudY.textContent : null;
    const cz = hudZ ? hudZ.textContent : null;
    lines.push(row('cursor X', cx || '—'));
    lines.push(row('cursor Y', cy || '—'));
    lines.push(row('cursor Z', cz || '—'));

    target.innerHTML = lines.join('');
  }

  /* offsetParent is null for anything inside a collapsed section, which is
     the cheapest way to ask "is this on screen at all". */
  const onScreen = () => target.offsetParent !== null;

  function tick() {
    if (onScreen()) renderEnabled();
    requestAnimationFrame(tick);
  }

  renderEnabled();
  requestAnimationFrame(tick);
})();
