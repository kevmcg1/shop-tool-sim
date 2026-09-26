let segTimeline  = [];
let simTotalTime = 0;
let simTime      = 0;
let simPlaying   = false;
let simActive    = false;
let singleBlockMode = false;
let singleBlockTargetTime = null;
let singleBlockCurrentSourceLine = -1;
let simSpeed     = 1;
let pathProgress = 1.0;
let focusDimEnabled  = false;
let showArcCenters   = false;
let showAllPaths     = false;
let dimFuturePaths   = true;
let optionalStopEnabled = true;

const PATH_TYPES = [
  { key: 'rapid',   label: 'Rapid (G0)',            color: '#00d4ff' },
  { key: 'cut',     label: 'Cut (G1/G2/G3)',         color: '#f5c518' },
  { key: 'retract', label: 'Retract / Z lift',        color: '#ff3355' },
  { key: 'arot',    label: 'A-axis rotation',         color: '#ff8800' },
  { key: 'engrave', label: 'G47 Text engrave',        color: '#bb44ff' },
  { key: 'drill',   label: 'Canned Drill Cycle',      color: '#00ee88' },
];

let activePaths = new Set();
const pathVisibility = {};
const pathSkip       = {};
PATH_TYPES.forEach(t => { pathVisibility[t.key] = true; pathSkip[t.key] = false; });
let currentCursorLine = -1;
let perLineMeshes = [];
let allSegments   = [];
let totalDistance = 0;
let allMCodeEvents = [];

let arcCenterSprites = [];
let currentGridCellSize = 1.0;
let toolCylinderMesh = null;
let allDrillHoles = [];

let isoFollowEnabled = false;
let isoRotateWithPath = false;

const ISO_THETA = Math.PI * 3 / 4;
const ISO_PHI   = Math.PI / 4;

let currentToolTip = null;

let currentToolTipWorld = null, currentToolDirWorld = null;
let currentToolDir = null;

const mainScene = new THREE.Scene();
mainScene.background = new THREE.Color(0x1a1a1a);

const stageGroup = new THREE.Group();
stageGroup.name = "stage";
mainScene.add(stageGroup);
const stageOffset = new THREE.Vector3();

const programFrame = new THREE.Matrix4();
const _pfPos = new THREE.Vector3(), _pfQuat = new THREE.Quaternion();
const programFrameQuat = _pfQuat;
function updateProgramFrame() {
  const PM = window.PartModels;
  const a = (PM && PM.programAnchor) ? PM.programAnchor() : null;
  if (a) { _pfPos.copy(a.origin); _pfQuat.copy(a.quat); }
  else { _pfPos.set(0, 0, 0); _pfQuat.identity(); }
  programFrame.compose(_pfPos, _pfQuat, new THREE.Vector3(1, 1, 1));
  [toolpathGroup, compOverlayRoot, mainScene.getObjectByName("toolModels")]
    .forEach(g => {
      if (!g) return;
      g.position.copy(_pfPos);
      g.quaternion.copy(_pfQuat);
      g.updateMatrixWorld(true);
    });
}
function setStageXY(x, y) {
  if (Math.abs(stageOffset.x + x) < 1e-9 && Math.abs(stageOffset.y + y) < 1e-9) return;
  stageOffset.set(-x, -y, 0);
  stageGroup.position.copy(stageOffset);
  stageGroup.updateMatrixWorld(true);
}

let aspect = viewport.clientWidth / viewport.clientHeight;
let frustumSize = 120;
const mainCam = new THREE.OrthographicCamera(
  -frustumSize*aspect/2, frustumSize*aspect/2,
   frustumSize/2,        -frustumSize/2,
  -10000, 10000
);

let camSphere = { r: 200, theta: ISO_THETA, phi: ISO_PHI };
let camTarget = new THREE.Vector3();

function updateMainCamera() {
  const { r, theta, phi } = camSphere;
  mainCam.position.set(
    camTarget.x + r * Math.sin(phi) * Math.sin(theta),
    camTarget.y + r * Math.sin(phi) * Math.cos(theta),
    camTarget.z + r * Math.cos(phi)
  );
  mainCam.lookAt(camTarget);
  mainCam.up.set(0, 0, 1);
  mainCam.updateMatrixWorld();
}

function updateFrustum() {
  aspect = viewport.clientWidth / viewport.clientHeight;
  mainCam.left   = -frustumSize * aspect / 2;
  mainCam.right  =  frustumSize * aspect / 2;
  mainCam.top    =  frustumSize / 2;
  mainCam.bottom = -frustumSize / 2;
  mainCam.updateProjectionMatrix();
}

const mainRenderer = new THREE.WebGLRenderer({
  canvas: mainCanvas, antialias: true, powerPreference: "high-performance",
});
mainRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
mainRenderer.setSize(viewport.clientWidth, viewport.clientHeight);

const Quality = (() => {
  const CEIL = Math.min(devicePixelRatio || 1, 2);

  const MIN_Q = 0.25, MAX_Q = 1;
  const SLOW = 20, FAST = 11;

  const COOLDOWN_DOWN = 220, COOLDOWN_UP = 900;

  let mode = "auto";
  let q = 1, ema = 16, lastMove = 0, applied = -1, cool = COOLDOWN_DOWN;

  const LOW_STEPS = 22;
  const MIN_STEPS = 24;
  const steps = () => mode === "low" ? LOW_STEPS
                    : Math.round(MIN_STEPS + (128 - MIN_STEPS) * ((q - MIN_Q) / (MAX_Q - MIN_Q)));

  const fast = () => mode === "low" || (mode === "auto" && q < 0.8);

  const FLOOR = Math.min(CEIL, 1);

  function push() {
    const pr = Math.max(CEIL * q, FLOOR);
    if (Math.abs(pr - applied) < 0.02) return;
    applied = pr;
    mainRenderer.setPixelRatio(pr);
    mainRenderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
    if (typeof updateFrustum === "function") updateFrustum();
  }

  function frame(dt, now) {
    ema += (Math.min(dt, 100) - ema) * 0.1;
    if (mode !== "auto" || now - lastMove < cool) return;
    const was = q;

    if (ema > SLOW * 2.5)   q = Math.max(MIN_Q, q - 0.35);
    else if (ema > SLOW)    q = Math.max(MIN_Q, q - 0.15);
    else if (ema < FAST)    q = Math.min(MAX_Q, q + 0.08);
    if (q !== was) { cool = q < was ? COOLDOWN_DOWN : COOLDOWN_UP; lastMove = now; push(); }
  }

  function set(m) {
    mode = m;
    q = m === "low" ? MIN_Q : m === "high" ? MAX_Q : q;
    ema = 16; lastMove = performance.now();
    push();
  }

  return { frame, set, steps, fast, get mode() { return mode; },
           get scale() { return q; }, get fps() { return 1000 / Math.max(ema, 1e-3); },
           resize: () => { applied = -1; push(); } };
})();

let lastActivity = performance.now();
const markActivity = () => { lastActivity = performance.now(); };
["pointerdown", "pointermove", "pointerup", "wheel", "keydown", "keyup",
 "click", "input", "change", "focusin", "dragover", "drop"]
  .forEach(t => window.addEventListener(t, markActivity, { capture: true, passive: true }));
window.addEventListener("resize", () => { markActivity(); Quality.resize(); });

document.addEventListener("DOMContentLoaded", () => {
  const bar = document.getElementById("vt-quality");
  if (!bar) return;
  bar.addEventListener("click", e => {
    const b = e.target.closest("[data-quality]");
    if (!b) return;
    Quality.set(b.dataset.quality);
    bar.querySelectorAll("[data-quality]").forEach(x =>
      x.classList.toggle("on", x.dataset.quality === Quality.mode));
    if (typeof showToast === "function") {
      showToast("Graphics set to " + Quality.mode,
        Quality.mode === "auto"
          ? "The picture sharpens and softens on its own to hold a steady frame rate."
          : Quality.mode === "low"
            ? "Fixed low detail. The fastest setting, and the one to use on a slow machine."
            : "Fixed full detail. The best picture, at whatever frame rate it costs.");
    }
  });
});

const cubeScene = new THREE.Scene();
const cubeCam = new THREE.OrthographicCamera(-1.8, 1.8, 1.8, -1.8, -10, 10);
const cubeRenderer = new THREE.WebGLRenderer({ canvas: cubeCanvas, antialias: true, alpha: true });
cubeRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
cubeRenderer.setSize(110, 110);
cubeRenderer.setClearColor(0x000000, 0);

(function buildViewCube() {
  const faceColors = [0xff4444, 0xcc2222, 0x44cc44, 0x228822, 0x4488ff, 0x224499];
  const geo = new THREE.BoxGeometry(1,1,1);
  cubeScene.add(new THREE.Mesh(geo, faceColors.map(c =>
    new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.82 })
  )));
  cubeScene.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
  ));
  /* No face lettering — the faces are color-coded and the click still snaps
     the view, so the labels were only noise at 110px. */
  cubeScene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(2,3,4); cubeScene.add(dl);
})();

const axesGroup = new THREE.Group();
mainScene.add(axesGroup);

const axisLabelsGroup = new THREE.Group();
mainScene.add(axisLabelsGroup);
let axisLabelsVisible = true;

const axisArrowCones = [];

(function buildAxes() {
  const len = 15;
  [
    [new THREE.Vector3(1,0,0), 0xff4444, 'X', [0,0,-Math.PI/2]],
    [new THREE.Vector3(0,1,0), 0x44cc44, 'Y', [0,0,0]],
    [new THREE.Vector3(0,0,1), 0x4488ff, 'Z', [Math.PI/2,0,0]],
  ].forEach(([dir, color, label, rotCone]) => {

    const AXIS_Z_LIFT = 0.02;
    const startPt = new THREE.Vector3(0, 0, (label === 'Z') ? 0 : AXIS_Z_LIFT);
    const endPt   = dir.clone().multiplyScalar(len);
    if (label !== 'Z') endPt.z += AXIS_Z_LIFT;

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([startPt, endPt]),
      new THREE.LineBasicMaterial({ color })
    );
    axesGroup.add(line);

    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5,2,8), new THREE.MeshBasicMaterial({ color }));
    const conePos = dir.clone().multiplyScalar(len + 1);
    if (label !== 'Z') conePos.z += AXIS_Z_LIFT;
    cone.position.copy(conePos);
    cone.rotation.set(...rotCone);
    axesGroup.add(cone);
    axisArrowCones.push(cone);

    const LABEL_PX = 512;
    const c = document.createElement('canvas'); c.width = LABEL_PX; c.height = LABEL_PX;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.font = 'bold ' + Math.round(LABEL_PX * 0.55) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, LABEL_PX / 2, LABEL_PX / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;

    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false }));

    spr.scale.set(0.06, 0.06, 1);
    spr.position.copy(dir.clone().multiplyScalar(len + 4));
    axisLabelsGroup.add(spr);
  });
})();

let gridObjects = [];

const originGroup = new THREE.Group();
originGroup.name = "workFrame";
stageGroup.add(originGroup);
originGroup.add(axesGroup);
originGroup.add(axisLabelsGroup);

function syncWorkFrame() {
  let p = null;
  try {
    p = (window.PartModels && window.PartModels.workOrigin)
      ? window.PartModels.workOrigin() : null;
  } catch (e) { p = null; }
  const x = p ? p.x : 0, y = p ? p.y : 0, z = p ? p.z : 0;
  if (Math.abs(originGroup.position.x - x) < 1e-9 &&
      Math.abs(originGroup.position.y - y) < 1e-9 &&
      Math.abs(originGroup.position.z - z) < 1e-9) return;
  originGroup.position.set(x, y, z);
  originGroup.updateMatrixWorld(true);
}

function rebuildGrid(cols, rows, cellSize) {
  currentGridCellSize = cellSize;
  gridObjects.forEach(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
    originGroup.remove(o);
    mainScene.remove(o);
  });
  gridObjects = [];

  const w = cols * cellSize;
  const h = rows * cellSize;
  const pts = [];

  for (let i = 0; i <= cols; i++) {
    const x = -w/2 + i * cellSize;
    pts.push(new THREE.Vector3(x, -h/2, 0), new THREE.Vector3(x, h/2, 0));
  }
  for (let j = 0; j <= rows; j++) {
    const y = -h/2 + j * cellSize;
    pts.push(new THREE.Vector3(-w/2, y, 0), new THREE.Vector3(w/2, y, 0));
  }

  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x383838, transparent: true, opacity: 0.85 });
  const gridLines = new THREE.LineSegments(geo, mat);
  gridLines.position.z = -0.01;
  originGroup.add(gridLines);
  gridObjects.push(gridLines);

  const borderPts = [
    new THREE.Vector3(-w/2, -h/2, 0), new THREE.Vector3( w/2, -h/2, 0),
    new THREE.Vector3( w/2, -h/2, 0), new THREE.Vector3( w/2,  h/2, 0),
    new THREE.Vector3( w/2,  h/2, 0), new THREE.Vector3(-w/2,  h/2, 0),
    new THREE.Vector3(-w/2,  h/2, 0), new THREE.Vector3(-w/2, -h/2, 0),
  ];
  const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
  const borderMat = new THREE.LineBasicMaterial({ color: 0x555555, transparent: true, opacity: 1.0 });
  const border = new THREE.LineSegments(borderGeo, borderMat);
  border.position.z = -0.01;
  originGroup.add(border);
  gridObjects.push(border);

  const gridVisible = document.getElementById('show-grid-track').classList.contains('on');
  gridObjects.forEach(obj => obj.visible = gridVisible);
}

rebuildGrid(20, 20, 1);
