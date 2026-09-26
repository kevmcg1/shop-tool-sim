(function () {
"use strict";

if (typeof ToolIO === "undefined") {
  console.warn("[ToolLib] ToolIO not found — paste the ToolIO script block first.");
  return;
}

const byNumber = new Map();

function toNative(mm) {
  const mode = (typeof unitMode !== "undefined") ? unitMode : "mm";
  return mode === "inch" ? mm / ToolIO.MM_PER_IN : mm;
}

function ingest(text, sourceName) {
  const res = ToolIO.parse(text);
  if (!res.tools.length) {
    console.warn("[ToolLib] nothing usable in " + (sourceName || "file"), res.warnings);
    return { added: 0, warnings: res.warnings };
  }

  res.tools.forEach(t => byNumber.set(t.number, t));

  if (typeof toolTable !== "undefined" && toolTable && typeof toolTable.set === "function") {
    res.tools.forEach(t => {
      const mm = t.geometry && t.geometry.diameter;
      if (mm) toolTable.set(t.number, toNative(mm));
    });
    if (typeof updateToolTableUI === "function") updateToolTableUI();
  }

  document.dispatchEvent(new CustomEvent("toollib:loaded", {
    detail: { tools: res.tools, warnings: res.warnings }
  }));
  return { added: res.tools.length, warnings: res.warnings };
}

function profileMesh(toolNumber, opts) {
  const o = opts || {};
  const t = byNumber.get(toolNumber);
  if (!t || !t.profile || !t.profile.points.length) return null;
  if (typeof THREE === "undefined") return null;

  const native = (typeof unitMode !== "undefined" && unitMode === "inch")
               ? 1 / ToolIO.MM_PER_IN : 1;
  const pts = t.profile.points.map(p =>
    new THREE.Vector2(Math.max(p[0] * native, 1e-5), p[1] * native));

  const geo = new THREE.LatheGeometry(pts, o.segments || 48);
  const mat = o.material || new THREE.MeshBasicMaterial({
    color: o.color || 0xffffff, transparent: true, opacity: o.opacity ?? 0.9,
  });
  return new THREE.Mesh(geo, mat);
}

function isToolFile(f) {
  return /\.(json|tool)$/i.test(f.name);
}

window.addEventListener("dragover", e => {
  if (e.dataTransfer && Array.from(e.dataTransfer.items || []).length) e.preventDefault();
}, false);

window.addEventListener("drop", e => {
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(isToolFile);
  if (!files.length) return;
  e.preventDefault();
  e.stopPropagation();
  files.forEach(f => {
    const fr = new FileReader();
    fr.onload = () => {
      const r = ingest(fr.result, f.name);
      console.log(`[ToolLib] ${f.name}: ${r.added} tool(s) loaded`);
      if (r.warnings.length) console.warn("[ToolLib]", r.warnings);
    };
    fr.readAsText(f);
  });
}, true);

window.ToolLib = {
  ingest,
  profileMesh,
  get:  n => byNumber.get(n) || null,
  all:  () => Array.from(byNumber.values()),
  has:  n => byNumber.has(n),
  clear:() => byNumber.clear(),

  diameter(n) {
    const t = byNumber.get(n);
    return t && t.geometry.diameter ? toNative(t.geometry.diameter) : null;
  },
};

console.log("[ToolLib] ready — drop a .tools.json file onto the page.");
})();
