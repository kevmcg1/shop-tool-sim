(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  root.ToolIO = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
"use strict";

const FORMAT  = "cnc-tool-library";
const VERSION = 1;
const MM_PER_IN = 25.4;

const PARAM_KEYS = [
  "category","endType","dia","shankDia","loc","oal","cornerR",
  "flutes","helix","hand","corePct","pointAngle","chamferLen",
  "coneAngle","tipDia","pilotDia","pilotLen","pitch","threadSize","threadRows",
  "leadStyle","inserts","insertSize","leadAngle","bodyH","boreDia",
  "cutW","neckDia","neckLen","dtAngle","material","coating","finish",
  "coatShank","styDia","styLen","bodyDia","holder",
];

/* What a holder is called on a tool's label. Short, because it rides on the
   end of a name that is already saying what the cutter is. */
const HOLDER_LABELS = {
  er11:"ER11", er16:"ER16", er20:"ER20", er25:"ER25", er32:"ER32", er40:"ER40",
  shrink:"Shrink Fit", weldon:"Weldon", hydraulic:"Hydraulic", drillchuck:"Drill Chuck",
};

const TYPE_LABELS = {
  endmill:"End Mill", chamfer:"Chamfer Mill", facemill:"Face Mill",
  shellmill:"Shell Mill", tslot:"T-Slot Cutter", woodruff:"Woodruff Keyseat",
  dovetail:"Dovetail Cutter", spotdrill:"Spot Drill", drill:"Drill",
  reamer:"Reamer", counterbore:"Counterbore", countersink:"Countersink",
  tap:"Tap", threadmill:"Thread Mill", probe:"Touch Probe",
};

const num = v => (typeof v === "number" && isFinite(v)) ? v : null;
const uid = () => "t_" + Math.random().toString(36).slice(2, 10);

function profileFromPositions(positions, opts) {
  const o = opts || {};
  const bins = o.bins || 96;
  let zMin = Infinity, zMax = -Infinity;
  for (let i = 2; i < positions.length; i += 3) {
    const z = positions[i];
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  if (!isFinite(zMin) || zMax - zMin < 1e-6) return [];

  const span = zMax - zMin;
  const maxR = new Float64Array(bins).fill(0);
  const seen = new Uint8Array(bins);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i+1], z = positions[i+2];
    const b = Math.min(bins - 1, Math.floor((z - zMin) / span * bins));
    const r = Math.sqrt(x*x + y*y);
    if (r > maxR[b]) maxR[b] = r;
    seen[b] = 1;
  }

  const pts = [[0, 0]];
  for (let b = 0; b < bins; b++) {
    if (!seen[b]) continue;
    const z = zMin + (b + 0.5) / bins * span;
    pts.push([round(maxR[b]), round(z - zMin)]);
  }
  pts.push([0, round(span)]);
  return pts;
}

const round = v => Math.round(v * 1e4) / 1e4;

function toolDoc(params, opts) {
  const o = opts || {};
  const p = params;
  const g = {};
  const put = (k, v) => { g[k] = num(v); };

  put("diameter",      p.dia);
  put("cornerRadius",  p.category === "endmill" ? p.cornerR : 0);
  put("fluteCount",    p.category === "facemill" ? p.inserts : p.flutes);
  put("fluteLength",   p.loc);
  put("overallLength", p.category === "facemill" ? p.bodyH : p.oal);
  put("shankDiameter", p.shankDia);
  put("helixAngle",    p.helix);

  g.neckDiameter  = ["tslot","woodruff","dovetail"].includes(p.category) ? num(p.neckDia) : null;
  g.neckLength    = ["tslot","woodruff","dovetail"].includes(p.category) ? num(p.neckLen) : null;
  g.pointAngle    = ["drill","spotdrill"].includes(p.category) ? num(p.pointAngle) : null;
  g.includedAngle = ["chamfer","countersink"].includes(p.category) ? num(p.coneAngle)
                  : p.category === "dovetail" ? num(180 - 2*p.dtAngle) : null;
  g.threadPitch     = ["tap","threadmill"].includes(p.category) ? num(p.pitch) : null;
  g.threadRows      = p.category === "threadmill" ? num(p.threadRows) : null;
  g.threadForm      = p.category === "threadmill"
                    ? (p.threadRows === 1 ? "single-form" : "full-form") : null;
  g.threadsPerInch  = g.threadPitch ? round(MM_PER_IN / g.threadPitch) : null;
  g.mountingBore    = ["facemill","shellmill"].includes(p.category) ? num(p.boreDia) : null;
  g.cuttingWidth    = ["tslot","woodruff"].includes(p.category) ? num(p.cutW) : null;

  /* A probe measures rather than cuts, so the numbers that matter are the
     ruby ball and how far it reaches — the ball diameter is what every
     touch-off subtracts to get from where the stylus tripped to where the
     surface actually is. */
  const probe = p.category === "probe";
  g.stylusBall      = probe ? num(p.dia)     : null;
  g.stylusDiameter  = probe ? num(p.styDia)  : null;
  g.stylusLength    = probe ? num(p.styLen)  : null;
  g.bodyDiameter    = probe ? num(p.bodyDia) : null;
  if (probe) { g.fluteCount = null; g.helixAngle = null; g.fluteLength = null; }

  /* What it is held in, and how much cutter is left below the holder's nose
     — the stickout is the number that decides whether the tool can reach. */
  const held = p.holder && p.holder !== "none" ? p.holder : null;
  g.holder      = held;
  g.holderLabel = held ? HOLDER_LABELS[held] : null;
  g.stickout    = (held && o.stickout != null) ? round(o.stickout) : null;

  g.stickoutMin     = num(g.overallLength);

  const doc = {
    id:     o.id || uid(),
    number: num(o.number) || 1,
    name:   o.name || autoName(p),
    type:   p.category,
    typeLabel: TYPE_LABELS[p.category] || p.category,
    units:  "mm",
    params: pick(p, PARAM_KEYS),
    geometry: g,
    profile: { units:"mm", points: o.profile || [] },
    render:  { cylinder: { diameter: num(p.dia), length: num(g.overallLength) } },
    appearance: {
      substrate: p.material,
      coating:   o.coated ? p.coating : "none",
      finish:    p.finish,
      coated:    !!o.coated,
    },
    mesh: o.mesh || null,
  };
  return doc;
}

function autoName(p) {
  const t = TYPE_LABELS[p.category] || p.category;
  const n = p.category === "facemill" ? p.inserts : p.flutes;
  const d = round(p.dia);
  const held = HOLDER_LABELS[p.holder] ? ` · ${HOLDER_LABELS[p.holder]}` : "";
  if (p.category === "probe") return `Ø${d} Ruby Ball ${t}`;
  if (p.category === "tap" || p.category === "threadmill")
    return `${p.threadSize && p.threadSize !== "custom" ? p.threadSize : "Ø"+d} ${t}${held}`;
  if (p.category === "endmill" && p.endType === "ball") return `Ø${d} ${n}FL Ball ${t}${held}`;
  if (p.category === "endmill" && p.endType === "bull") return `Ø${d} ${n}FL R${round(p.cornerR)} ${t}${held}`;
  return `Ø${d} ${n}FL ${t}${held}`;
}

function pick(src, keys) {
  const out = {};
  keys.forEach(k => { if (src[k] !== undefined) out[k] = src[k]; });
  return out;
}

function libraryDoc(tools, opts) {
  const o = opts || {};
  return {
    format: FORMAT,
    version: VERSION,
    generator: { app: o.app || "Tool Previewer", version: o.appVersion || "1.0" },
    exported: new Date().toISOString(),
    units: "mm",
    tools: tools.slice(),
  };
}

function parse(input) {
  let doc;
  if (typeof input === "string") {
    try { doc = JSON.parse(input); }
    catch (e) { return { tools: [], warnings: ["File is not valid JSON: " + e.message] }; }
  } else doc = input;

  const warnings = [];
  if (!doc || typeof doc !== "object")
    return { tools: [], warnings: ["Empty or unreadable document."] };

  if (Array.isArray(doc)) doc = { tools: doc };
  if (doc.format && doc.format !== FORMAT)
    warnings.push(`Unknown format "${doc.format}" — reading it anyway.`);

  doc = migrate(doc, warnings);

  let list = Array.isArray(doc.tools) ? doc.tools
           : (doc.params || doc.geometry || doc.dia || doc.diameter) ? [doc]
           : [];
  if (!list.length) warnings.push("No tools found in this file.");

  const scale = doc.units === "in" ? MM_PER_IN : 1;
  const tools = list.map(t => normalizeTool(t, scale, warnings)).filter(Boolean);
  return { tools, warnings };
}

function migrate(doc, warnings) {
  let v = doc.version || 0;
  if (v > VERSION)
    warnings.push(`File was written by a newer version (v${v}); unknown fields ignored.`);

  if (v < 1) { doc.units = doc.units || "mm"; doc.version = 1; }
  return doc;
}

function normalizeTool(t, scale, warnings) {
  if (!t || typeof t !== "object") return null;
  const out = {
    id: t.id || uid(),
    number: num(t.number) || 1,
    name: t.name || "Imported tool",
    type: t.type || (t.params && t.params.category) || "endmill",
    units: "mm",
    params: Object.assign({}, t.params),
    geometry: Object.assign({}, t.geometry),
    profile: t.profile && Array.isArray(t.profile.points)
             ? { units:"mm", points: t.profile.points.map(pt => [pt[0]*scale, pt[1]*scale]) }
             : { units:"mm", points: [] },
    render: t.render || null,
    appearance: t.appearance || {},
    mesh: t.mesh || null,
  };

  if (!out.params.dia) {
    const g = out.geometry;
    const d = num(g.diameter) || num(t.diameter) || num(t.dia);
    if (d) {
      out.params.category  = out.type;
      out.params.dia       = d * scale;
      out.params.loc       = (num(g.fluteLength) || d * 2) * scale;
      out.params.oal       = (num(g.overallLength) || d * 5) * scale;
      out.params.shankDia  = (num(g.shankDiameter) || d) * scale;
      out.params.flutes    = num(g.fluteCount) || 4;
      out.params.cornerR   = (num(g.cornerRadius) || 0) * scale;
      warnings.push(`"${out.name}" had no parameter block — rebuilt from its dimensions.`);
    } else {
      warnings.push("Skipped an entry with no usable dimensions.");
      return null;
    }
  } else if (scale !== 1) {

    ["dia","shankDia","loc","oal","cornerR","tipDia","pilotDia","pilotLen",
     "insertSize","bodyH","boreDia","cutW","neckDia","neckLen","chamferLen","pitch",
     "styDia","styLen","bodyDia"]
      .forEach(k => { if (typeof out.params[k] === "number") out.params[k] *= scale; });
  }

  if (scale !== 1) {
    Object.keys(out.geometry).forEach(k => {
      if (/Angle|Count|PerInch/.test(k)) return;
      if (typeof out.geometry[k] === "number") out.geometry[k] *= scale;
    });
  }
  return out;
}

function stl(meshes, name) {
  let tri = 0;
  meshes.forEach(m => { tri += (m.indices ? m.indices.length : m.positions.length/3) / 3; });
  tri = Math.floor(tri);
  const buf = new ArrayBuffer(84 + tri * 50);
  const view = new DataView(buf);
  const header = "Exported by Tool Previewer — " + (name || "tool");
  for (let i = 0; i < Math.min(header.length, 79); i++) view.setUint8(i, header.charCodeAt(i));
  view.setUint32(80, tri, true);

  let off = 84;
  const v = [0,0,0,0,0,0,0,0,0];
  meshes.forEach(m => {
    const pos = m.positions;
    const idx = m.indices || Array.from({length: pos.length/3}, (_, i) => i);
    for (let i = 0; i < idx.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        v[c*3]   = pos[idx[i+c]*3];
        v[c*3+1] = pos[idx[i+c]*3+1];
        v[c*3+2] = pos[idx[i+c]*3+2];
      }
      const ux = v[3]-v[0], uy = v[4]-v[1], uz = v[5]-v[2];
      const wx = v[6]-v[0], wy = v[7]-v[1], wz = v[8]-v[2];
      let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
      const len = Math.hypot(nx, ny, nz) || 1;
      view.setFloat32(off,    nx/len, true);
      view.setFloat32(off+4,  ny/len, true);
      view.setFloat32(off+8,  nz/len, true);
      for (let c = 0; c < 9; c++) view.setFloat32(off + 12 + c*4, v[c], true);
      view.setUint16(off + 48, 0, true);
      off += 50;
    }
  });
  return buf;
}

function download(filename, data, mime) {
  if (typeof document === "undefined") return;
  const blob = data instanceof ArrayBuffer
    ? new Blob([data], { type: mime || "application/octet-stream" })
    : new Blob([data], { type: mime || "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readFile(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsText(file);
  });
}

return {
  FORMAT, VERSION, MM_PER_IN, PARAM_KEYS, TYPE_LABELS, HOLDER_LABELS,
  toolDoc, libraryDoc, parse, migrate, autoName,
  profileFromPositions, stl, download, readFile,
};
});
