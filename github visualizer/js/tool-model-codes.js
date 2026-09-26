(function () {
"use strict";

if (typeof ToolModel === "undefined") {
  console.warn("[ToolModels] tool-model.js not found — codes can't be read.");
  return;
}

const models = new Map();
let container = null;
let shown = null;

function ensureContainer() {
  if (!container) {
    container = new THREE.Group();
    container.name = "toolModels";
    stageGroup.add(container);
  }
  return container;
}

function unitScale() {
  return (typeof unitMode !== "undefined" && unitMode === "inch")
       ? 1 / ToolModel.MM_PER_IN : 1;
}

const GHOSTS = 8;
const CORE_R = 0.97;

function envelopeMesh(solid, shrink) {
  if (typeof ToolIO === "undefined" || !ToolIO.profileFromPositions) return null;
  const pos = [];
  solid.traverse(n => {
    const attr = n.geometry && n.geometry.attributes && n.geometry.attributes.position;
    if (!attr) return;
    const a = attr.array;
    for (let i = 0; i < a.length; i += 3) pos.push(a[i], a[i + 2], a[i + 1]);
  });
  const pts = ToolIO.profileFromPositions(pos, { bins: 140 });
  if (pts.length < 3) return null;

  const v = pts.map(pt => new THREE.Vector2(Math.max(pt[0] * shrink, 1e-4), pt[1]));
  return new THREE.Mesh(
    new THREE.LatheGeometry(v, 72),
    new THREE.MeshLambertMaterial({ color: 0xb7c0c9, side: THREE.DoubleSide })
  );
}

function ghostGroup(solid, sym) {
  const period = Math.PI * 2 / Math.max(sym || 1, 1);
  const group = new THREE.Group();
  for (let i = 0; i < GHOSTS; i++) {
    const step = new THREE.Group();
    step.rotation.y = period * i / GHOSTS;
    solid.children.forEach(m => {
      if (!m.geometry || !m.material) return;
      const mat = m.material.clone();
      mat.transparent = true;
      mat.opacity     = 0.17;
      mat.depthWrite  = false;
      const c = new THREE.Mesh(m.geometry, mat);
      c.renderOrder = 3;
      step.add(c);
    });
    group.add(step);
  }
  return group;
}

function buildSpinLook(rec) {
  const look = new THREE.Group();
  const core = envelopeMesh(rec.solid, CORE_R);
  if (core) look.add(core);
  look.add(ghostGroup(rec.solid, rec.sym));
  look.visible = false;
  return look;
}

function build(rec) {
  rec.sym   = symmetry(rec.params);

  /* A touch probe is held still by the spindle orient, not turned by it —
     a probe that spun on screen would be showing you a crash. It gets no
     blur look either, since there is nothing to smear. */
  rec.noSpin = rec.params && rec.params.category === "probe";

  rec.solid = ToolModel.mesh(rec.params, {});
  rec.blur  = rec.noSpin ? null : buildSpinLook(rec);
  rec.blurOn = false;

  rec.group = new THREE.Group();
  rec.group.add(rec.solid);
  if (rec.blur) rec.group.add(rec.blur);

  rec.scale = unitScale();
  rec.group.scale.setScalar(rec.scale);
  rec.align = new THREE.Quaternion();
  rec.group.visible = false;
  ensureContainer().add(rec.group);
}

function setBlur(rec, on) {
  const want = !!on && !!(rec && rec.blur);
  if (!rec || rec.blurOn === want) return;
  rec.blurOn = want;
  rec.solid.visible = !want;
  rec.blur.visible  =  want;
}

function hideAll(except) {
  models.forEach(rec => {
    if (rec.group && rec !== except) rec.group.visible = false;
  });
  if (shown && shown !== except) shown = null;
}

const SPIN_AXIS = new THREE.Vector3(0, 1, 0);
const spinQ = new THREE.Quaternion();
let spinAngle = 0;

function orient(rec) {
  spinQ.setFromAxisAngle(SPIN_AXIS, rec.noSpin ? 0 : spinAngle);
  rec.group.quaternion.copy(rec.align).multiply(spinQ);
}

function place(number, tip, quaternion, visible) {
  const rec = (number != null) ? models.get(number) : null;
  if (!rec) { hideAll(); return null; }
  if (!rec.group) build(rec);

  hideAll(rec);
  const s = unitScale();
  if (s !== rec.scale) { rec.group.scale.setScalar(s); rec.scale = s; }
  rec.group.position.set(tip.x, tip.y, tip.z);
  rec.align.copy(quaternion);
  orient(rec);
  rec.group.visible = (visible !== false);
  shown = rec;
  return rec.group;
}

let spinMode = "readable";
let lastSpinFrame = performance.now();

function symmetry(params) {
  const n = (params.category === "facemill") ? params.inserts : params.flutes;
  return Math.max(1, Math.round(n || 1));
}

let lastSimT = 0;

function spinTick(now) {
  requestAnimationFrame(spinTick);
  const dt = Math.min((now - lastSpinFrame) / 1000, 0.1);
  lastSpinFrame = now;

  /* How much program time has passed since the last frame. Playing, this
     tracks the wall clock times the speed multiplier. Dragging the playback
     bar, it is whatever the drag moved the clock by — which is the whole
     point: the cutter should turn while you scrub, exactly as much as it
     would have turned had the program actually run that far. It used to sit
     dead still unless the run was playing. */
  const simNow = (typeof simTime === "number") ? simTime : 0;
  const dSim = simNow - lastSimT;
  lastSimT = simNow;

  if (!shown || !shown.group || !shown.group.visible) return;
  if (shown.noSpin) { setBlur(shown, false); return; }

  const playing = (typeof simPlaying !== "undefined") && simPlaying;
  const scrubbing = !playing && Math.abs(dSim) > 1e-9;

  /* Single block keeps the cutter turning between steps, and keeps it turning
     where the program has commanded M05 — you are stepping through to look at
     the cut, and a cutter standing still reads as a broken one. It runs on the
     wall clock, because the program clock only moves when a button is pressed,
     and at the last speed the program asked for. */
  const stepping = (typeof singleBlockMode !== "undefined") && singleBlockMode;

  let rpm = (typeof activeSpindleRPM !== "undefined") ? activeSpindleRPM : null;
  if ((!rpm || rpm <= 0) && stepping) {
    const last = (typeof spindleChanges !== "undefined" && spindleChanges.length)
      ? spindleChanges[spindleChanges.length - 1].rpm : null;
    rpm = (last && isFinite(last) && last > 0) ? last : 1200;
  }

  if (spinMode === "off" || !rpm || (!playing && !scrubbing && !stepping)) {
    setBlur(shown, false);
    return;
  }

  const rate = (typeof simSpeed !== "undefined") ? simSpeed : 1;

  const dir = ((typeof activeSpindleDir !== "undefined") && activeSpindleDir === "ccw") ? 1 : -1;

  /* Radians per second of *program* time, so the same number covers both
     playing and scrubbing. */
  let omega = (rpm / 60) * Math.PI * 2;

  if (spinMode === "readable") {

    const flutesPerSec = Math.min(22, 0.3 / Math.max(dt, 1 / 240));
    const perRealSec = Math.PI * 2 * flutesPerSec / (shown.sym || 1);
    omega = Math.min(omega, perRealSec / Math.max(rate, 1e-6));
  }

  /* Seconds of program time this frame is worth. Stepping is the one case
     that runs on real seconds instead. */
  const secs = playing ? dt * rate
             : (scrubbing ? dSim : (stepping ? dt : 0));
  let step = omega * secs;

  /* A fast drag can cover seconds of program in one frame; past half a turn
     the flutes alias and it stops reading as rotation at all. */
  if (scrubbing) {
    const CAP = Math.PI * 0.9;
    step = Math.max(-CAP, Math.min(CAP, step));
  }

  setBlur(shown, spinMode === "true" && Math.abs(step) > 0.4 * (Math.PI * 2 / (shown.sym || 1)));

  spinAngle = (spinAngle + dir * step) % (Math.PI * 2);
  orient(shown);
}
requestAnimationFrame(spinTick);

const SPIN_NOTES = {
  off:      "Spin off — the tool holds still.",
  readable: "Flutes stream past at a fixed readable rate, so every tool looks the same whatever its flute count. Useful for watching engagement. The real RPM is in Machine State.",
  "true":   "Exact programmed RPM. Past a few hundred RPM no screen can draw single flutes, so the cutter is drawn as its solid swept body with the flutes smeared over it — what a running spindle looks like. Pause to see the flutes again.",
};

function setSpinMode(mode) {
  spinMode = SPIN_NOTES[mode] ? mode : "readable";
  if (spinMode === "off" && shown && shown.group) { spinAngle = 0; orient(shown); }
  const box = $("#tool-spin-modes");
  if (box) box.querySelectorAll("button").forEach(b =>
    b.classList.toggle("on", b.dataset.mode === spinMode));
  const note = $("#tool-spin-note");
  if (note) note.textContent = SPIN_NOTES[spinMode];
  return spinMode;
}

function setSpin(on) { return setSpinMode(on ? "readable" : "off"); }

function syncDiameter(number, diameterMM) {
  if (typeof toolTable === "undefined" || !toolTable || typeof toolTable.set !== "function") return;
  if (!diameterMM) return;
  toolTable.set(number, diameterMM * unitScale());
  if (typeof updateToolTableUI === "function") updateToolTableUI();
}

function add(text, opts) {
  const o = opts || {};
  const t = ToolModel.decode(text);
  remove(t.number, { quiet: true });

  const rec = { code: t.code, name: t.name, params: t.params, group: null, scale: 1, align: null };
  models.set(t.number, rec);
  build(rec);
  if (o.syncDiameter !== false) syncDiameter(t.number, t.params.dia);
  if (!o.quiet) renderList();
  return t;
}

function remove(number, opts) {
  const rec = models.get(number);
  if (!rec) return false;
  if (rec.group) {
    if (shown === rec) shown = null;
    ensureContainer().remove(rec.group);
    ToolModel.dispose(rec.group);
  }
  models.delete(number);
  if (!(opts && opts.quiet)) renderList();
  return true;
}

function update(number, text) {
  if (!models.has(number)) throw new Error(`T${number} isn't loaded.`);
  const t = ToolModel.decode(text);
  if (t.number !== number) remove(number, { quiet: true });
  add(t.code, { quiet: true });
  renderList();
  return t;
}

function clear() {
  Array.from(models.keys()).forEach(n => remove(n, { quiet: true }));
  renderList();
}

function addAll(text) {
  const added = [], failed = [];
  const lines = String(text || "").split(/[\r\n]+/).filter(l => l.trim());
  lines.forEach(line => {
    if (!ToolModel.isCode(line)) return;
    try { added.push(add(line)); }
    catch (e) { failed.push(e.message); }
  });
  return { added, failed };
}

function refresh() {
  if (typeof simSeekToTime === "function" && typeof simTime !== "undefined") simSeekToTime(simTime);
}

const $ = sel => document.querySelector(sel);
let editing = null;

function say(text, kind) {
  const el = $("#tool-model-msg");
  if (!el) return;
  el.textContent = text || "";
  el.className = kind || "";
}

function dualDia(mm) {
  const inch   = (mm / ToolModel.MM_PER_IN).toFixed(4) + "\u2033";
  const metric = (Math.round(mm * 100) / 100) + " mm";
  const inchFirst = (typeof toolTableDisplayUnit === "undefined")
                 || toolTableDisplayUnit === "inch";
  return inchFirst ? `${inch} (${metric})` : `${metric} (${inch})`;
}

function rowLabel(rec) {
  const dia  = rec.params && rec.params.dia;
  const auto = ToolModel.label(rec.params);
  if (!dia || rec.name !== auto) return rec.name;

  return /^\u00D8\s*[\d.]+/.test(auto)
    ? auto.replace(/^\u00D8\s*[\d.]+\s*/, "\u00D8" + dualDia(dia) + " ")
    : auto + " \u00B7 \u00D8" + dualDia(dia);
}

function renderList() {
  const list = $("#tool-model-list");
  if (!list) return;
  if (!models.size) {
    editing = null;
    list.innerHTML = '<div class="tm-empty">Nothing imported yet — press a sample above, '
      + 'or paste a tool code into the box below.</div>';
    return;
  }

  /* One card per cutter: the T number it answers to, what it is, and the
     size it cuts at, with the actions on their own row underneath. */
  const rows = Array.from(models.entries()).sort((a, b) => a[0] - b[0]);
  list.innerHTML = rows.map(([n, rec]) => {
    const dia = (typeof toolTable !== "undefined" && toolTable.get(n) > 0)
      ? toolTable.get(n) : null;
    const diaTxt = dia
      ? ((typeof diaInInch === "function" ? diaInInch(dia) : dia).toFixed(4) + "″")
      : "";
    const inUse = (typeof toolTable !== "undefined") && toolTable.has(n);
    return `
    <div class="tm-card${editing === n ? " editing" : ""}" data-tool="${n}">
      <div class="tm-card-top">
        <span class="tm-num">T${n}</span>
        <span class="tm-name">${esc(rowLabel(rec))}</span>
        ${diaTxt ? `<span class="tm-dia">${diaTxt}</span>` : ""}
      </div>
      <div class="tm-card-foot">
        <span class="tm-state ${inUse ? "is-on" : "is-off"}">${
          inUse ? "Called by the program" : "Not called yet — add T" + n + " to the code"}</span>
        <span class="tm-acts">
          <button data-act="edit" data-tip="Edit — open this tool's code so you can change it">Edit</button>
          <button data-act="copy" data-tip="Copy — put this tool's code on the clipboard">Copy</button>
          <button data-act="del"  data-tip="Remove — put T${n} back to a plain cylinder">Remove</button>
        </span>
      </div>
    </div>` + (editing === n ? `
    <div class="tm-edit" data-tool="${n}">
      <textarea spellcheck="false" rows="3">${esc(rec.code)}</textarea>
      <div class="tm-edit-btns">
        <button data-act="save">Update T${n}</button>
        <button data-act="cancel">Cancel</button>
      </div>
    </div>` : "");
  }).join("");

  if (editing !== null) {
    const field = list.querySelector(`.tm-edit[data-tool="${editing}"] textarea`);
    if (field) { field.focus(); field.select(); }
  }
}

const esc = t => String(t).replace(/[&<>"]/g, c =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

function saveEdit(number) {
  const field = $(`#tool-model-list .tm-edit[data-tool="${number}"] textarea`);
  if (!field) return;
  const text = field.value.trim();
  if (!text) { say("Paste a code, or press Cancel to leave it as it is.", "warn"); return; }

  let t;
  try { t = update(number, text); }
  catch (e) { say(e.message, "warn"); return; }

  editing = null;
  renderList();
  refresh();
  say(t.number === number
    ? `T${number} rebuilt — ${t.name}.`
    : `Moved to T${t.number} — ${t.name}. T${number} is back to a plain cylinder.`, "ok");
}

function bindPanel() {
  const field = $("#tool-model-code");
  const list  = $("#tool-model-list");
  if (!field || !list) return;

  const submit = () => {
    const text = field.value.trim();
    if (!text) return;
    const res = addAll(text);
    if (res.added.length) {
      field.value = "";
      const names = res.added.map(t => "T" + t.number).join(", ");
      const stale = res.added.find(t => t.staleBuild);
      say(stale
        ? `Loaded ${names}, but this code came from build ${stale.staleBuild} and this page is a different build — the shape may not match what the builder drew. Copy the shared block from one page to the other.`
        : `Loaded ${names}. The cutter is drawn from the code now.`,
        stale ? "warn" : "ok");
      refresh();
    } else if (res.failed.length) {
      say(res.failed[0], "warn");
    } else {

      try { add(text); field.value = ""; say("Loaded.", "ok"); refresh(); }
      catch (e) { say(e.message, "warn"); }
    }
  };

  field.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  });
  const addBtn = $("#tool-model-add");
  if (addBtn) addBtn.addEventListener("click", submit);

  list.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    const n = Number(b.closest("[data-tool]").dataset.tool);
    const rec = models.get(n);
    if (!rec) return;

    switch (b.dataset.act) {
      case "edit":
        editing = (editing === n) ? null : n;
        renderList();
        if (editing === n) say(`This is the code that built T${n}. Replace it and press Update.`);
        else say("");
        break;
      case "save":
        saveEdit(n);
        break;
      case "cancel":
        editing = null;
        renderList();
        say("");
        break;
      case "del":
        if (editing === n) editing = null;
        remove(n);
        say(`T${n} is back to the placeholder cylinder.`);
        refresh();
        break;
      default: {
        const done = () => say(`T${n}'s code is on the clipboard — paste it into the previewer to edit.`, "ok");
        if (navigator.clipboard) navigator.clipboard.writeText(rec.code).then(done, () => fallbackCopy(rec.code, n));
        else fallbackCopy(rec.code, n);
      }
    }
  });

  list.addEventListener("keydown", e => {
    const box = e.target.closest(".tm-edit");
    if (!box) return;
    const n = Number(box.dataset.tool);
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEdit(n); }
    if (e.key === "Escape") { e.preventDefault(); editing = null; renderList(); say(""); }
  });

  const spinBox = $("#tool-spin-modes");
  if (spinBox) {
    spinBox.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (b) setSpinMode(b.dataset.mode);
    });
  }
  setSpinMode(spinMode);

  renderList();
}

function fallbackCopy(code, n) {
  const field = $("#tool-model-code");
  if (!field) return;
  field.value = code;
  field.focus();
  field.select();
  say(`Clipboard blocked — T${n}'s code is selected above, press Ctrl+C.`, "warn");
}

function loadInline() {
  const list = window.TOOL_MODELS;
  if (!Array.isArray(list) || !list.length) return;
  let ok = 0;
  list.forEach(line => {
    try { add(line, { quiet: true }); ok++; }
    catch (e) { console.warn("[ToolModels] TOOL_MODELS:", e.message, "—", line); }
  });
  if (ok) console.log(`[ToolModels] ${ok} model(s) loaded from the TOOL_MODELS list.`);
  renderList();
}

document.addEventListener("toollib:loaded", e => {
  const tools = (e.detail && e.detail.tools) || [];
  let ok = 0;
  tools.forEach(t => {
    if (!t.params || !t.params.dia) return;
    try {
      add(ToolModel.encode(t.params, { number: t.number, name: t.name }),
          { syncDiameter: false, quiet: true });
      ok++;
    } catch (err) {   }
  });
  if (ok) { renderList(); say(`Built ${ok} tool model(s) from the dropped file.`, "ok"); refresh(); }
});

/* The samples shelf: one click builds the cutter against the T number the
   sample carries, so it turns up in the sim as soon as the program calls it. */
function renderSamples() {
  const box = $("#tool-model-samples");
  const list = window.TOOL_MODEL_SAMPLES;
  if (!box || !Array.isArray(list)) return;
  box.innerHTML = list.map(s => `
    <button class="pm-sample-row" data-tmsample="${s.key}">
      <span class="pm-sample-name">${s.name}</span>
      <span class="pm-sample-note">${s.note}</span>
    </button>`).join("");

  box.addEventListener("click", e => {
    const b = e.target.closest("[data-tmsample]");
    if (!b) return;
    const s = list.find(x => x.key === b.dataset.tmsample);
    if (!s) return;
    const t = s.doc.tools[0];
    try {
      /* The panel speaks in CT1 codes, so build one from the sample's params. */
      add(ToolModel.encode(t.params, { number: t.number, name: t.name }));
      renderList();
      refresh();
      say(`${s.name} loaded. Call it with T${t.number} in the program.`, "ok");
    } catch (err) {
      say(err.message, "warn");
    }
  });
}

function boot() {
  bindPanel();
  renderSamples();
  loadInline();
  refresh();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

window.ToolModels = {
  add, addAll, update, remove, clear, place, hideAll, refresh,
  setSpin, setSpinMode, relabel: renderList,

  root: () => (shown && shown.group) || null,
  get:  n => models.get(n) || null,
  has:  n => models.has(n),
  all:  () => Array.from(models.entries()).map(([number, r]) => ({ number, name: r.name, code: r.code })),
  code: n => (models.get(n) || {}).code || null,
  get spinMode() { return spinMode; },
};

console.log("[ToolModels] ready — paste a CT1.… code to replace the placeholder cylinder.");
})();
