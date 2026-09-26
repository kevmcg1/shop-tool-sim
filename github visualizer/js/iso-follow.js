function applyIsoFollow(dt) {
  if (!isoFollowEnabled || !currentToolTipWorld) return;

  const panSpeed = 1 - Math.pow(0.002, dt);
  camTarget.lerp(currentToolTipWorld, panSpeed);

  const dir = currentToolDirWorld;
  if (isoRotateWithPath && dir) {
    const dx = dir.x;
    const dy = dir.y;
    const movLen = Math.sqrt(dx*dx + dy*dy);
    if (movLen > 0.0001) {
      const targetTheta = Math.atan2(dx, dy) + Math.PI;
      let dTheta = targetTheta - camSphere.theta;
      while (dTheta >  Math.PI) dTheta -= 2 * Math.PI;
      while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
      const rotSpeed = 1 - Math.pow(0.001, dt);
      camSphere.theta += dTheta * rotSpeed;
      camSphere.phi = ISO_PHI;
    }
  }

  updateMainCamera();
}

document.getElementById('iso-follow-label').addEventListener('click', () => {
  isoFollowEnabled = !isoFollowEnabled;
  document.getElementById('iso-follow-track').classList.toggle('on', isoFollowEnabled);
  document.getElementById('iso-follow-subopts').style.display = isoFollowEnabled ? 'block' : 'none';
  document.getElementById('btn-follow-tool').classList.toggle('active', isoFollowEnabled);
  if (!isoFollowEnabled) {

    isoRotateWithPath = false;
    document.getElementById('iso-rotate-track').classList.remove('on');
    document.getElementById('btn-rotate-path').classList.remove('active');
  }

  showToast(isoFollowEnabled ? 'Camera follows the cutter' : 'Camera stays put',
    isoFollowEnabled ? 'The view now travels with the tool tip so it never leaves the screen.'
                     : 'The view holds still and the cutter moves through it.');
});

document.getElementById('btn-follow-tool').addEventListener('click', () => {
  isoFollowEnabled = !isoFollowEnabled;
  document.getElementById('iso-follow-track').classList.toggle('on', isoFollowEnabled);
  document.getElementById('iso-follow-subopts').style.display = isoFollowEnabled ? 'block' : 'none';
  document.getElementById('btn-follow-tool').classList.toggle('active', isoFollowEnabled);
  if (!isoFollowEnabled) {
    isoRotateWithPath = false;
    document.getElementById('iso-rotate-track').classList.remove('on');
    document.getElementById('btn-rotate-path').classList.remove('active');
  }
  showToast(isoFollowEnabled ? 'Camera follows the cutter' : 'Camera stays put',
    isoFollowEnabled ? 'The view now travels with the tool tip so it never leaves the screen.'
                     : 'The view holds still and the cutter moves through it.');
});

document.getElementById('iso-rotate-label').addEventListener('click', () => {
  isoRotateWithPath = !isoRotateWithPath;
  document.getElementById('iso-rotate-track').classList.toggle('on', isoRotateWithPath);
  document.getElementById('btn-rotate-path').classList.toggle('active', isoRotateWithPath);
  showToast(isoRotateWithPath ? 'View turns with the cut' : 'View keeps its bearing',
    isoRotateWithPath ? 'The camera swings so the cut always travels the same way across the screen.'
                      : 'The camera keeps the angle you left it at.');
});

document.getElementById('btn-rotate-path').addEventListener('click', () => {
  isoRotateWithPath = !isoRotateWithPath;
  if (isoRotateWithPath && !isoFollowEnabled) {
    isoFollowEnabled = true;
    document.getElementById('iso-follow-track').classList.add('on');
    document.getElementById('iso-follow-subopts').style.display = 'block';
    document.getElementById('btn-follow-tool').classList.add('active');
  }
  document.getElementById('iso-rotate-track').classList.toggle('on', isoRotateWithPath);
  document.getElementById('btn-rotate-path').classList.toggle('active', isoRotateWithPath);
  showToast(isoRotateWithPath
    ? 'Rotate with path ON — The camera swings with the cut.'
    : 'Rotate with path OFF — The camera keeps its bearing.');
});

/* showToast now lives in js/toast.js, which loads before anything calls it. */

const _completeBanner = document.getElementById('program-complete-banner');

/* Anything appearing or leaving the top-center stack re-runs the layout, so
   the toast and this banner shuffle around each other instead of printing
   through one another. */
function _restack() { if (window.VPLayout) window.VPLayout(); }

function showProgramComplete() {

  _completeBanner.classList.remove('show');
  void _completeBanner.offsetWidth;
  _completeBanner.classList.add('show');
  _restack();
}
function hideProgramComplete() {
  _completeBanner.classList.remove('show');
  _restack();
}
document.getElementById('banner-close').addEventListener('click', hideProgramComplete);

new ResizeObserver(()=>{mainRenderer.setSize(viewport.clientWidth,viewport.clientHeight);updateFrustum();}).observe(viewport);

mainScene.add(new THREE.AmbientLight(0xffffff,0.3));
const sun=new THREE.DirectionalLight(0xffffff,0.5); sun.position.set(50,80,100); mainScene.add(sun);

updateFrustum(); updateMainCamera();
setTimeout(()=>{if(allSegments.length) fitToView(allSegments);},50);
