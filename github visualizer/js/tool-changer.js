/* The tool changer arm.
 *
 * A double arm on a pivot beside the spindle, and one movement each way. It
 * comes in already square across the spindle and the pot, drops to draw both
 * tools out at once, turns a half revolution — one direction, one time, so
 * that both pockets are traded in the one movement — holds there long enough
 * for both tools to be over their new homes, then lifts to seat them both.
 * That is what this draws, and nothing else: no carousel, no pots, no
 * magazine. The incoming tool simply appears in the gripper that is about to
 * carry it, which is all you ever see of it from the operator's side of the
 * door.
 *
 * It exists only while a change is running. The M06 block carries real
 * seconds now (see TOOL_CHANGE_SECS in comp-integration.js), and the whole
 * swing is driven from how far the run has got through that one block — so
 * it plays at whatever speed the sim is playing, and dragging the playback
 * bar backwards runs the arm backwards, the same way the spindle already
 * turns under a scrub.
 *
 * Everything below is authored in millimetres and scaled to the scene at the
 * end, the same bargain the tool models strike.
 */
(function () {
"use strict";

if (typeof ToolModel === "undefined") {
  console.warn("[ToolChanger] tool-model.js not found — no arm will be drawn.");
  return;
}

/* A real arm is sized to a CAT40 flange, which is nearly 90 mm across. These
   tools are drawn without their holders, so an arm built to that scale ends
   in two hoops with a bare shank lost somewhere in the middle of each. The
   numbers below are pulled in from the real thing until the gripper reads as
   gripping the tool it is actually holding. */
const ARM_R    = 175;   /* hub centre to gripper centre */
const BAR_W    = 46;    /* the bar through the hub */
const BAR_T    = 26;
const HUB_R    = 46;
const HUB_H    = 70;
const GRIP_RI  = 20;    /* the C that closes round the tool */
const GRIP_RO  = 42;
const GRIP_T   = 28;
const GRIP_OPEN = 1.85; /* radians of the C left open, facing outward */
const PULL     = 85;    /* how far down the arm draws a tool to clear the taper */

/* How far above the seated tool the change happens. The arm sits at this
   height for the whole change and never travels to or from it — it is the
   spindle that goes up to meet the arm and comes back down after, which is
   both what a machine does and the only motion at the ends that is not the
   arm bobbing in and out of frame. */
const LIFT     = 250;

/* The change, as fractions of the M06 block.
 *
 *   0.00 .. 0.12   the arm appears, square across spindle and pot
 *   0.12 .. 0.32   down — both tools drawn out together
 *   0.32 .. 0.36   settled at the bottom
 *   0.36 .. 0.64   the half turn, one way
 *   0.64 .. 0.70   held, both tools now over their new homes
 *   0.70 .. 0.88   up — both tools seated
 *   0.88 .. 1.00   gone
 */
const DOWN_A = 0.12, DOWN_B = 0.32;
const TURN_A = 0.36, TURN_B = 0.64;
const UP_A   = 0.70, UP_B   = 0.88;

/* The two moments a tool passes between spindle and gripper. They are the
   instant the arm starts down and the instant it finishes coming up — both
   times the arm is square to the spindle and level, which is what lets each
   hand-over be a straight swap of who owns the tool with nothing to blend. */
const HAND_OLD = DOWN_A;
const HAND_NEW = UP_B;

/* Square across: one gripper on the spindle, the other on the pot. */
const ENGAGED = Math.PI;

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ramp = (f, a, b) => { const t = clamp01((f - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/* Half a revolution, one direction, once. Both pockets trade in it. */
const psi = f => ENGAGED + Math.PI * ramp(f, TURN_A, TURN_B);

/* Down to draw both tools out, up to seat both. The arm's only vertical
   movement in the whole change. */
const pull = f => -PULL * (ramp(f, DOWN_A, DOWN_B) - ramp(f, UP_A, UP_B));

/* The spindle's own retract: it carries the outgoing tool up to the waiting
   gripper before the change, and carries the incoming one back down to the
   work after. This is what keeps a 350 mm swing from sweeping through the
   vise, and it belongs to the spindle rather than to the arm — an arm that
   rose into place and sank out of it read as the changer bouncing in and
   bouncing out. */
const rise = (f, up) => up * ramp(f, 0.00, HAND_OLD);
const sink = (f, up) => up * (1 - ramp(f, HAND_NEW, 1.00));

/* ------------------------------------------------------------------ *
 * Scene graph
 *
 *   toolChanger  — carries the program frame, same as the tool models do
 *     frame      — sits on the tool tip, Z along the tool axis
 *       mm       — millimetres from here down
 *         pivot  — the arm itself, turning about Z
 *         slotA / slotB — one tool each, hung by its top
 * ------------------------------------------------------------------ */

let root = null, frame = null, mm = null, pivot = null, slotA = null, slotB = null;
const armMats = [];
const grips = [];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function gripper(mat) {
  const a0 = GRIP_OPEN / 2, a1 = Math.PI * 2 - GRIP_OPEN / 2;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, GRIP_RO, a0, a1, false);
  shape.absarc(0, 0, GRIP_RI, a1, a0, true);
  const geo = new THREE.ExtrudeGeometry(shape,
    { depth: GRIP_T, bevelEnabled: false, curveSegments: 30 });
  geo.translate(0, 0, -GRIP_T / 2);
  return new THREE.Mesh(geo, mat);
}

function buildArm() {
  const g = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: 0x99a2ab, transparent: true, opacity: 1 });
  const dark  = new THREE.MeshLambertMaterial({ color: 0x6b747d, transparent: true, opacity: 1 });
  armMats.push(steel, dark);

  const bar = new THREE.Mesh(new THREE.BoxGeometry(ARM_R * 2, BAR_W, BAR_T), steel);
  g.add(bar);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(HUB_R, HUB_R, HUB_H, 28), steel);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(HUB_R * 1.16, HUB_R * 1.16, HUB_H * 0.22, 28), dark);
  collar.rotation.x = Math.PI / 2;
  collar.position.z = HUB_H * 0.30;
  g.add(collar);

  /* Both grippers open away from the hub, so a tool slides in and out along
     the arm rather than having to be lifted over the jaw. */
  [1, -1].forEach(s => {
    const grip = gripper(dark);
    grip.position.x = s * ARM_R;
    grip.rotation.z = s > 0 ? 0 : Math.PI;
    g.add(grip);
    grips.push(grip);
  });
  return g;
}

/* The C is drawn once at GRIP_RI and then stretched to whatever it is holding
   — a bare shank is a few millimetres across and a 40-taper flange is seventy,
   and one fixed hoop cannot look like it is gripping both. */
function sizeGrip(i, r) {
  const g = grips[i];
  if (!g) return;
  const k = clamp(r * 1.14 / GRIP_RI, 0.55, 2.4);
  g.scale.set(k, k, 1);
}

function ensure() {
  if (root) return;
  root = new THREE.Group();
  root.name = "toolChanger";
  root.visible = false;

  frame = new THREE.Group();
  mm    = new THREE.Group();
  pivot = buildArm();
  slotA = new THREE.Group();
  slotB = new THREE.Group();

  mm.add(pivot, slotA, slotB);
  frame.add(mm);
  root.add(frame);
  stageGroup.add(root);
}

/* ------------------------------------------------------------------ *
 * The tools riding in the grippers
 *
 * Built from the same ToolModel the spindle uses, so the thing the arm
 * carries in is exactly the thing that turns up in the cut. Built along +Z
 * here rather than +Y, because in this frame Z is the spindle axis.
 * ------------------------------------------------------------------ */

const CACHE_MAX = 16;
const cache = new Map();

const SHAPE_CAT = {
  flat: ["endmill", "flat"], ball: ["endmill", "ball"], bull: ["endmill", "corner"],
  drill: ["drill"], tap: ["tap"], chamfer: ["chamfer"], probe: ["probe"],
};

function diaMM(n) {
  let d = null;
  try { d = (typeof getLiveToolDia === "function") ? getLiveToolDia(n) : null; } catch (e) {   }
  const u = (typeof unitMode !== "undefined" && unitMode === "inch") ? 25.4 : 1;
  return (d && d > 0) ? d * u : 12;
}

/* No model loaded for this T number, so build something honest from what the
   tool table and the shape map do know. */
function fallbackParams(n) {
  const s = (typeof ToolShapes !== "undefined" && ToolShapes.get(n)) || "flat";
  const m = SHAPE_CAT[s] || SHAPE_CAT.flat;
  const d = diaMM(n);
  const p = { category: m[0], dia: d };
  if (m[0] !== "probe") p.shankDia = d;
  if (m[1]) p.endType = m[1];
  return p;
}

function evict() {
  for (const [k, v] of cache) {
    if (cache.size <= CACHE_MAX) return;
    if (!v || !v.group || v.group.parent) continue;
    ToolModel.dispose(v.group);
    cache.delete(k);
  }
}

function toolFor(n) {
  if (n == null) return null;
  let rec = null;
  try { rec = (typeof ToolModels !== "undefined" && ToolModels.get) ? ToolModels.get(n) : null; }
  catch (e) { rec = null; }

  const key = (rec && rec.code) ? rec.code
            : "plain:" + n + ":" + diaMM(n).toFixed(3) + ":"
              + ((typeof ToolShapes !== "undefined" && ToolShapes.get(n)) || "flat");
  if (cache.has(key)) return cache.get(key);

  let entry = null;
  try {
    const params = rec ? rec.params : fallbackParams(n);
    const group  = ToolModel.mesh(params, { axis: "+Z" });
    const ud = group.userData.tool || {};
    /* `len` is how far above the tool's tip the arm takes hold: the flange's
       V groove when it is in a holder, the top of the shank when it is not.
       That is the one measurement the whole choreography hangs off. */
    entry = { group, len: ud.grip || ud.height || 80, r: ud.gripR || 8 };
  } catch (e) {
    console.warn("[ToolChanger] T" + n + ":", e.message);
  }
  cache.set(key, entry);
  evict();
  return entry;
}

/* Put the right tool in a gripper, and take out whatever was there. */
function fill(slot, n) {
  const entry = toolFor(n);
  const want  = entry ? entry.group : null;
  if (slot.userData.held === want) return entry;
  if (slot.children.length) slot.remove(slot.children[0]);
  if (want) {
    if (want.parent) want.parent.remove(want);
    /* The mesh grows up from its tip; the slot's origin is where the gripper
       has hold of it, so hang it that far down. */
    want.position.z = -entry.len;
    slot.add(want);
  }
  slot.userData.held = want;
  return entry;
}

function paint(obj, o) {
  if (!obj) return;
  obj.visible = o > 0.004;
  obj.traverse(nd => {
    if (!nd.material) return;
    const list = Array.isArray(nd.material) ? nd.material : [nd.material];
    list.forEach(m => {
      if (m.opacity === undefined) return;
      m.opacity = o;
      m.transparent = o < 0.999;
      m.depthWrite = o >= 0.999;
    });
  });
}

/* ------------------------------------------------------------------ *
 * Which change, and how far into it
 * ------------------------------------------------------------------ */

let index = null, indexKey = null;

function changes() {
  if (typeof segTimeline === "undefined") return [];
  const key = segTimeline.length + "|" + (typeof simTotalTime === "number" ? simTotalTime.toFixed(4) : "0");
  if (indexKey !== key) {
    indexKey = key;
    index = segTimeline.filter(e => e.seg && e.seg.isToolChange);
  }
  return index;
}

function running() {
  if (typeof simTime !== "number") return null;
  const list = changes();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    /* Strictly past the start, never on it. A program whose first block is
       T1 M06 puts a change at t = 0, and taking the spindle over there would
       empty it in the rewound picture — which is the one the page opens on,
       and which is meant to show the cutter parked on the work zero. The arm
       takes over on the first frame that has actually moved. */
    if (simTime > e.tStart && simTime < e.tEnd) {
      return { seg: e.seg, f: clamp01((simTime - e.tStart) / Math.max(e.tEnd - e.tStart, 1e-9)) };
    }
  }
  return null;
}

let showing = false;

function hide() {
  if (!showing) return;
  showing = false;
  if (root) root.visible = false;
}

/* ------------------------------------------------------------------ *
 * The switch
 *
 * Switched off, the changer is out of the simulation altogether: no arm, and
 * the M06 block goes back to taking no time, so a program runs in the length
 * it ran in before there was an arm to watch. buildTimeline() asks this, which
 * is why turning it off is a rebuild of the timeline and not a re-parse of the
 * program — exactly what a legend SKIP already does to a whole kind of move.
 * ------------------------------------------------------------------ */

const PREF_KEY = "gcodeviz.toolchanger.v1";
let on = true;
try { on = localStorage.getItem(PREF_KEY) !== "off"; } catch (e) {   }

function rebuild() {
  if (typeof buildTimeline !== "function") return;
  if (typeof simSegments === "undefined" || !simSegments || !simSegments.length) return;
  const pct = (typeof simTotalTime === "number" && simTotalTime > 0)
            ? simTime / simTotalTime : 0;
  buildTimeline(simSegments);
  indexKey = null;
  simTime = pct * simTotalTime;
  if (typeof simSeekToTime === "function") simSeekToTime(simTime);
}

function setEnabled(want) {
  want = !!want;
  if (want === on) return on;
  on = want;
  try { localStorage.setItem(PREF_KEY, on ? "on" : "off"); } catch (e) {   }
  if (!on) hide();
  rebuild();
  return on;
}

/* The program the page opens with is parsed and timed before this file has
   run, so a saved switch cannot have reached it — buildTimeline() had nobody
   to ask. Rather than guess at a place in the boot order that is late enough
   for every path through it, notice the disagreement and put it right. The
   first seek after boot is one, and there is always a seek after boot. */
let healing = false;
function heal() {
  if (healing || typeof segTimeline === "undefined" || !segTimeline.length) return;
  const stale = segTimeline.some(e =>
    e.seg && e.seg.isToolChange && ((e.tEnd - e.tStart) > 0.01) !== on);
  if (!stale) return;
  healing = true;
  try { rebuild(); } finally { healing = false; }
}

/* Called from the seek, once the tool tip and the spindle axis are known. */
function sync(tip, axis) {
  heal();
  if (!on) { hide(); return false; }
  const now = running();
  const wanted = !!(now && tip
    && ((typeof toolVisible === "undefined") || toolVisible)
    && ((typeof ViewMode === "undefined") || !ViewMode.isModel()));
  if (!wanted) { hide(); return false; }

  ensure();
  const f    = now.f;
  const seg  = now.seg;
  const unit = (typeof unitMode !== "undefined" && unitMode === "inch")
             ? 1 / ToolModel.MM_PER_IN : 1;

  const oldT = fill(slotA, seg.toolFrom);
  const newT = fill(slotB, seg.toolTo);
  const oldL = oldT ? oldT.len : (newT ? newT.len : 80);
  const newL = newT ? newT.len : oldL;

  /* Each gripper closes on whatever it is actually holding. */
  sizeGrip(0, oldT ? oldT.r : (newT ? newT.r : GRIP_RI));
  sizeGrip(1, newT ? newT.r : (oldT ? oldT.r : GRIP_RI));

  const a = psi(f);

  /* The gripper plane, up at the change height. It creeps from one tool's
     flange height to the other's across the change so that both hand-overs
     land exactly where the spindle has that tool. The two assemblies are
     rarely the same length below the flange, and the arm holds both flanges
     in one plane, so whichever hangs lower sets the clearance — the retract
     is opened up by exactly that difference, which keeps the low tool at the
     same height above the work no matter what pair is being traded.

     The creep is confined to the half turn, where everything is moving
     anyway, so that the two moments the arm is meant to be standing still —
     settled at the bottom, and held with both tools over their new homes —
     really are still. */
  const spread = Math.abs(newL - oldL);
  const up = LIFT + spread;
  const plane = up + lerp(oldL, newL, ramp(f, TURN_A, TURN_B)) + pull(f);

  /* Frame: planted on the tool tip, Z along the spindle. It does not move. */
  const spindleAxis = axis.clone().normalize();
  frame.position.copy(tip);
  frame.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), spindleAxis);
  mm.scale.setScalar(unit);

  pivot.position.set(ARM_R, 0, plane);
  pivot.rotation.z = a;

  /* A gripper orbits the hub, and whatever it holds turns with it. A tool
     still in the spindle is on the spindle's own Z instead — coming up to
     the arm before its hand-over, going back down to the work after. */
  const place = (slot, ang, atSpindle, seatZ) => {
    if (atSpindle) { slot.position.set(0, 0, seatZ); slot.rotation.z = ang; return; }
    slot.position.set(ARM_R + ARM_R * Math.cos(ang), ARM_R * Math.sin(ang), plane);
    slot.rotation.z = ang;
  };
  place(slotA, a,            f < HAND_OLD,  oldL + rise(f, up));
  place(slotB, a + Math.PI,  f >= HAND_NEW, newL + sink(f, up));

  /* The arm and the outgoing tool fade; the incoming one arrives with the
     arm and then stays, because by the end it is simply the tool in the
     spindle and the model takes over from it without a flicker. */
  const armOp = ramp(f, 0, 0.10) * (1 - ramp(f, 0.90, 1.00));
  paint(pivot, armOp);
  paint(slotA, 1 - ramp(f, UP_B, 1.00));
  paint(slotB, ramp(f, 0, 0.10));

  root.visible = true;
  showing = true;
  return true;
}

window.ToolChanger = {
  sync,
  hide,
  active: () => showing,
  enabled: () => on,
  setEnabled,
  /* For the tool panel and anything else that wants to know a change is on. */
  seconds: () => (typeof TOOL_CHANGE_SECS === "number") ? TOOL_CHANGE_SECS : 0,
};

/* Built now rather than on the first M06. updateProgramFrame() finds this
   group by name and puts the program's origin on it, and it runs earlier in
   the seek than the code that calls sync() — so a group that first appeared
   during a change would spend that one frame sitting on the machine origin
   instead of the part. */
ensure();

console.log("[ToolChanger] ready — the arm swings on every M06"
  + (on ? "." : ", but it is switched off in Settings."));
})();
