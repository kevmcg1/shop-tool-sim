let drag={active:false,button:-1,lastX:0,lastY:0};
const ORBIT_SPEED=0.005, PAN_SPEED=0.0018;

/* ------------------------------------------------------------------------ *
 * Where the orbit turns about.
 *
 * Right-drag on its own spins about the camera target — wherever panning and
 * fitting have left the middle of the screen. That is the predictable one and
 * it is unchanged.
 *
 * Shift + right-drag spins about whatever is under the cursor when the drag
 * starts, which is what you want when you are looking closely at one corner
 * of a part and the middle of the screen is somewhere else entirely.
 *
 * It works by leaving the picked point exactly where it is on screen rather
 * than by moving the camera target onto it — moving the target would slide
 * the whole scene sideways the instant you pressed the button. The offset
 * from the target to the picked point is measured once, in screen axes, and
 * the target is then re-derived from it after every rotation. The pixel under
 * the cursor therefore does not move at all while the view swings around it.
 * ------------------------------------------------------------------------ */
const OrbitPivot = (() => {
  const ray = new THREE.Raycaster();
  let pivot = null;          // world point the view turns about
  let offset = { x: 0, y: 0 };  // camTarget → pivot, in world units along screen right/up

  const axes = () => {
    mainCam.updateMatrixWorld();
    return {
      right: new THREE.Vector3().setFromMatrixColumn(mainCam.matrixWorld, 0).normalize(),
      up:    new THREE.Vector3().setFromMatrixColumn(mainCam.matrixWorld, 1).normalize(),
    };
  };

  /* What the cursor is over. A solid if there is one, otherwise the point on
     the plane through the camera target — which is what you are looking at
     when you point at empty space. */
  function pick(clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;

    mainCam.updateMatrixWorld();
    ray.setFromCamera({ x: nx, y: ny }, mainCam);

    let best = null;
    try {
      const hits = ray.intersectObjects(mainScene.children, true);
      for (const h of hits) {
        if (!h.object || !h.object.visible) continue;
        /* Sprites and helper lines are labels, not surfaces. */
        if (h.object.isSprite) continue;
        best = h.point.clone();
        break;
      }
    } catch (err) {   }
    if (best) return best;

    /* Nothing under the cursor: fall back to the view plane through the
       target, so the pivot at least sits at the right depth. */
    const p = new THREE.Vector3(nx, ny, 0.5).unproject(mainCam);
    const dir = new THREE.Vector3();
    mainCam.getWorldDirection(dir);
    const along = p.clone().sub(camTarget).dot(dir);
    return p.sub(dir.multiplyScalar(along));
  }

  function begin(clientX, clientY) {
    pivot = pick(clientX, clientY);
    const { right, up } = axes();
    const d = pivot.clone().sub(camTarget);
    offset = { x: d.dot(right), y: d.dot(up) };
  }

  /* Called straight after the rotation has been written into camSphere and
     the camera rebuilt: puts the target back where it has to be for the
     picked point to keep its place on screen. */
  function reanchor() {
    if (!pivot) return;
    const { right, up } = axes();
    camTarget.copy(pivot)
      .addScaledVector(right, -offset.x)
      .addScaledVector(up,    -offset.y);
    updateMainCamera();
  }

  const end = () => { pivot = null; };
  const active = () => !!pivot;

  return { begin, reanchor, end, active };
})();

mainCanvas.addEventListener('mousedown', e=>{
  /* Taking hold of the view cancels whatever move was easing into place —
     otherwise the tween keeps writing over the drag. */
  if (typeof CamView !== 'undefined') CamView.stop();
  drag.active=true; drag.button=e.button; drag.lastX=e.clientX; drag.lastY=e.clientY;
  drag.pivotOnCursor = (e.button===2||e.button===1) && e.shiftKey;
  if (drag.pivotOnCursor) OrbitPivot.begin(e.clientX, e.clientY);
  else OrbitPivot.end();
  e.preventDefault();
});
window.addEventListener('mousemove', e=>{
  const rect=viewport.getBoundingClientRect();
  const nx=((e.clientX-rect.left)/rect.width)*2-1;
  const ny=-((e.clientY-rect.top)/rect.height)*2+1;
  const v=new THREE.Vector3(nx,ny,0.5).unproject(mainCam);
  document.getElementById('hud-x').textContent=v.x.toFixed(3);
  document.getElementById('hud-y').textContent=v.y.toFixed(3);
  document.getElementById('hud-z').textContent=v.z.toFixed(3);

  if(!drag.active) return;
  const dx=e.clientX-drag.lastX, dy=e.clientY-drag.lastY;
  drag.lastX=e.clientX; drag.lastY=e.clientY;

  if(drag.button===2||drag.button===1){

    if (!isoRotateWithPath) {
      camSphere.theta += dx*ORBIT_SPEED;
      camSphere.phi = Math.max(0.02,Math.min(Math.PI-0.02, camSphere.phi - dy*ORBIT_SPEED));
      updateMainCamera();
      /* Shift-drag only: pulls the target back so the point the drag started
         on holds its pixel while everything swings around it. */
      if (drag.pivotOnCursor) OrbitPivot.reanchor();

      ArrowVisibility.handleOrbit();
    }
  } else if(drag.button===0){

    if (!isoFollowEnabled) {
      const s=frustumSize*PAN_SPEED;
      const right=new THREE.Vector3().setFromMatrixColumn(mainCam.matrixWorld,0).normalize();
      const up=new THREE.Vector3().setFromMatrixColumn(mainCam.matrixWorld,1).normalize();
      camTarget.addScaledVector(right,-dx*s);
      camTarget.addScaledVector(up,    dy*s);
      updateMainCamera();
    }
  }
});
window.addEventListener('mouseup',()=>{
  drag.active=false;
  drag.pivotOnCursor=false;
  OrbitPivot.end();
});
mainCanvas.addEventListener('contextmenu',e=>e.preventDefault());
mainCanvas.addEventListener('wheel',e=>{
  e.preventDefault();
  if (typeof CamView !== 'undefined') CamView.stop();
  frustumSize=Math.max(1,Math.min(10000,frustumSize*(e.deltaY>0?1.12:0.89)));
  updateFrustum();
  document.getElementById('hud-zoom').textContent=(baseZoom/frustumSize).toFixed(2)+'×';
},{passive:false});

cubeCanvas.addEventListener('click',e=>{
  const rect=cubeCanvas.getBoundingClientRect();
  const mx=((e.clientX-rect.left)/110)*2-1, my=-((e.clientY-rect.top)/110)*2+1;
  const ray=new THREE.Raycaster(); ray.setFromCamera({x:mx,y:my},cubeCam);

  const boxMesh = cubeScene.children[0];
  const hits=ray.intersectObject(boxMesh, false);
  if(!hits.length) return;

  const localNorm = hits[0].face ? hits[0].face.normal.clone() : new THREE.Vector3(0,0,1);

  const FACE_TO_VIEW = [
    { n: new THREE.Vector3( 1, 0, 0), name: 'right'  },
    { n: new THREE.Vector3(-1, 0, 0), name: 'left'   },
    { n: new THREE.Vector3( 0, 1, 0), name: 'back'   },
    { n: new THREE.Vector3( 0,-1, 0), name: 'front'  },
    { n: new THREE.Vector3( 0, 0, 1), name: 'top'    },
    { n: new THREE.Vector3( 0, 0,-1), name: 'bottom' },
  ];
  let best=FACE_TO_VIEW[0], bd=-Infinity;
  FACE_TO_VIEW.forEach(v=>{const d=v.n.dot(localNorm); if(d>bd){bd=d;best=v;}});
  snapToView(best.name);
});

function snapToView(name){
  const V={top:{theta:Math.PI,phi:0.001},bottom:{theta:Math.PI,phi:Math.PI-0.001},front:{theta:Math.PI,phi:Math.PI/2},back:{theta:0,phi:Math.PI/2},right:{theta:Math.PI/2,phi:Math.PI/2},left:{theta:-Math.PI/2,phi:Math.PI/2},iso:{theta:ISO_THETA,phi:ISO_PHI}};
  const v=V[name]; if(!v) return;
  const st=camSphere.theta,sp=camSphere.phi,t0=performance.now(),dur=400;
  /* The swing runs on its own clock, so it has to keep the frame loop awake. */
  if (window.VPBusy) window.VPBusy.hold('viewSnap');
  (function step(now){
    const t=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-t,3);
    camSphere.theta=st+(v.theta-st)*e; camSphere.phi=sp+(v.phi-sp)*e;
    updateMainCamera();
    if(t<1) requestAnimationFrame(step);
    else if (window.VPBusy) window.VPBusy.release('viewSnap');
  })(t0);

  showToast(name.charAt(0).toUpperCase() + name.slice(1) + ' view',
    'The camera has swung square to that side. Drag with the right mouse button to come off it again.');

  ArrowVisibility.handleViewSnap(name);
}

const ArrowVisibility = (function() {
  const HIDE_VIEWS = new Set(['right','left','front','back','top','bottom']);
  let hidden = false;

  function setVisible(visible) {
    axisArrowCones.forEach(c => { c.visible = visible; });
    hidden = !visible;
    if (typeof renderMain === 'function') renderMain();
  }

  return {
    handleViewSnap(viewName) {
      if (HIDE_VIEWS.has(viewName)) setVisible(false);
      else setVisible(true);
    },
    handleOrbit() {

      if (hidden) setVisible(true);
    }
  };
})();

function updateGridPreview() {
  const size = Math.max(1, parseInt(document.getElementById('grid-size').value) || 20);
  const cell = Math.max(0.01, parseFloat(document.getElementById('grid-cell').value) || 1);
  document.getElementById('grid-size-mirror').textContent = size;
  const total = (size * cell).toFixed(cell % 1 === 0 ? 0 : 2);
  const unit = document.getElementById('grid-unit').value;
  document.getElementById('grid-total').textContent = `${total} × ${total} ${unit}`;
}

function applyGrid() {
  const size = Math.max(1, Math.min(500, parseInt(document.getElementById('grid-size').value) || 20));
  const cell = Math.max(0.01, parseFloat(document.getElementById('grid-cell').value) || 1);
  document.getElementById('grid-size').value = size;
  document.getElementById('grid-cell').value = cell;
  updateGridPreview();
  rebuildGrid(size, size, cell);
}

let gridApplyTimer;
function scheduleApplyGrid() {
  updateGridPreview();
  clearTimeout(gridApplyTimer);
  gridApplyTimer = setTimeout(applyGrid, 400);
}

document.getElementById('grid-size').addEventListener('input', scheduleApplyGrid);
document.getElementById('grid-cell').addEventListener('input', scheduleApplyGrid);
document.getElementById('grid-unit').addEventListener('change', (e) => {
  const unit = e.target.value;
  const cellInput = document.getElementById('grid-cell');
  cellInput.value = unit === 'inch' ? 1 : 25.4;
  scheduleApplyGrid();
});
document.getElementById('btn-apply-grid').addEventListener('click', () => {
  clearTimeout(gridApplyTimer);
  applyGrid();
  const size = document.getElementById('grid-size').value;
  const cell = document.getElementById('grid-cell').value;
  const unit = document.getElementById('grid-unit').value;
  showToast('Grid rebuilt',
    `${size} by ${size} squares, each one ${cell} ${unit} across.`);
});
updateGridPreview();

document.querySelectorAll('.view-btn').forEach(b=>b.addEventListener('click',()=>snapToView(b.dataset.view)));

/* Fit view frames the whole setup — solids and toolpath, not just the moves —
   and works with an empty program. It eases into place rather than cutting to
   it, so you can see where the view went. */
document.getElementById('btn-fit').addEventListener('click', () => fitSceneToView());

/* Reset cam goes to the standard view: the isometric corner, aimed at the
   work zero, 7.5 across. Not a re-fit — the whole point is that it is the
   same view every time, whatever is in the scene. */
document.getElementById('btn-reset-cam').addEventListener('click', () => {
  goHomeView(true);
});

const SPEED_MAP = { '-2': 0.25, '-1': 0.5, '0': 1, '1': 2, '2': 5, '3': 10 };
const simSpeedSlider = document.getElementById('sim-speed-slider');
simSpeedSlider.addEventListener('input', () => {
  simSpeed = SPEED_MAP[simSpeedSlider.value] || 1;
  document.getElementById('sim-speed-val').textContent = simSpeed + '×';
});

function flushToolDiameters() {
  toolTableBody.querySelectorAll('tr[data-tool]').forEach(row => {
    const toolNum = parseInt(row.dataset.tool);
    const inp = row.querySelector('input');
    if (!inp) return;
    const v = parseFloat(inp.value);
    if (!isNaN(v) && v > 0) {
      toolTable.set(toolNum, v);
    } else {
      inp.value = (toolTable.get(toolNum) || 0.5).toFixed(4);
    }
  });
}

function flushAllDiameterInputs() {
  flushToolDiameters();
  if (typeof flushDOffsetDiameters === 'function') flushDOffsetDiameters();
}

document.getElementById('btn-sim-play').addEventListener('mousedown', flushAllDiameterInputs);
document.getElementById('btn-sim-reset').addEventListener('mousedown', flushAllDiameterInputs);
document.getElementById('btn-sim-next').addEventListener('mousedown', flushAllDiameterInputs);
document.getElementById('btn-sim-prev').addEventListener('mousedown', flushAllDiameterInputs);
document.getElementById('btn-sim-end').addEventListener('mousedown', flushAllDiameterInputs);
