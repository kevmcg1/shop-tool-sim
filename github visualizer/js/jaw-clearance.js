/* jaw-clearance.js — how much metal is standing above the jaws.
 *
 * This is the number a setter actually cares about and the page had nowhere
 * to show it: the blank has to stand proud of the jaws by at least the depth
 * of the deepest cut, or the cutter finds the vise instead of the work.
 *
 * There are only ever two ways to change it — take a taller blank, or put
 * taller parallels under the one you have — so the panel is a switch between
 * those two, the Z of the stock top and the Z of the jaw top so you can see
 * where the number comes from, and boxes for the amount you want. It
 * remembers what everything was when you arrived and can put it all back.
 *
 * No geometry is reimplemented. Changing the blank goes through Panel's own
 * rebuild and Gizmo's own re-seat; changing the bars goes through
 * MakeProgram.setParallels, which is the same call the Fixture panel makes.
 * That is why the same module can sit in the sidebar and inside the guide
 * without the two fighting.
 */

window.JawClear = (function () {
  "use strict";

  const IN = 25.4;
  const EPS = 1e-6;

  const inches = () => (typeof unitMode !== "undefined") && unitMode === "inch";
  const uLab = () => (inches() ? "in" : "mm");
  /* Geometry is held in mm; everything on screen is in the program's units. */
  const disp = mm => (inches() ? mm / IN : mm);
  const native = v => (inches() ? v * IN : v);
  const fmt = v => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(inches() ? 3 : 2);

  const PM = () => window.PartModels || null;
  const fixture = () => (PM() && PM().fixture) || null;

  /* ------------------------------------------------------------------ *
   * Measuring
   * ------------------------------------------------------------------ */

  const _box = () => new THREE.Box3();

  function jawNode() {
    const p = PM() && PM().bodyOf && PM().bodyOf("vise");
    if (!p) return null;
    /* The movable jaw is a member of its own; the fixed one is part of the
       casting. They are the same height, so either tells us the jaw line. */
    const jaw = p.members && p.members.find(m => m.name === "Jaw");
    return (jaw && jaw.node) || p.node || null;
  }

  function stockNode() {
    const p = PM() && PM().bodyOf && PM().bodyOf("stock");
    return p ? p.node : null;
  }

  /* World-space, in whatever unit the scene is drawn in — which is the
     program's unit, so the number needs no conversion to be shown. */
  function measure() {
    const jn = jawNode(), sn = stockNode();
    if (!jn || !sn || typeof THREE === "undefined") {
      return { ok: false, why: !jn ? "no vise" : "no blank" };
    }
    try {
      jn.updateMatrixWorld(true);
      sn.updateMatrixWorld(true);
      const jb = _box().setFromObject(jn);
      const sb = _box().setFromObject(sn);
      if (!isFinite(jb.max.z) || !isFinite(sb.max.z)) return { ok: false, why: "no vise" };
      return {
        ok: true,
        jawTop: jb.max.z,
        stockTop: sb.max.z,
        stockBottom: sb.min.z,
        proud: sb.max.z - jb.max.z,
        jawBox: jb,
      };
    } catch (e) {
      return { ok: false, why: "no vise" };
    }
  }

  /* The jaw line expressed in the program's own coordinates, so it can be
     compared with the Z words in the code. */
  function jawTopInProgramZ() {
    const m = measure();
    if (!m.ok) return null;
    try {
      const jb = m.jawBox;
      const pt = new THREE.Vector3((jb.min.x + jb.max.x) / 2, (jb.min.y + jb.max.y) / 2, jb.max.z);
      const inv = new THREE.Matrix4().copy(stageGroup.matrixWorld).multiply(programFrame).invert();
      return pt.applyMatrix4(inv).z;
    } catch (e) { return null; }
  }

  /* Every line in the program that takes the cutter below the top of the
     jaws. If the blank is standing proud far enough these come back empty;
     if it is not, this is the list of blocks that will hit metal that is not
     the work. */
  let _cKey = null, _cVal = [];

  function conflicts() {
    const zLimit = jawTopInProgramZ();
    if (zLimit == null) return [];
    let segs = [];
    try { segs = allSegments || []; } catch (e) { return []; }
    if (!segs.length) return [];

    /* Walking every move in the program is not something to do on a timer —
       a big file is tens of thousands of segments, and doing it twice a
       second is a hitch you can feel. The answer only changes when the
       program or the jaw line does, so it is worked out once and kept. */
    const key = segs.length + ":" + zLimit.toFixed(5) + ":" +
                (segs[0].lineIdx || 0) + ":" + (segs[segs.length - 1].lineIdx || 0);
    if (key === _cKey) return _cVal;

    const worst = new Map();
    segs.forEach(s => {
      if (!s.start || !s.end) return;
      const z = Math.min(s.start.z, s.end.z);
      if (z >= zLimit - EPS) return;
      const line = (s.origLineIdx != null) ? s.origLineIdx : s.lineIdx;
      if (line == null || line < 0) return;
      const below = zLimit - z;
      const prev = worst.get(line);
      if (!prev || below > prev.below) {
        worst.set(line, { line, z, below, type: s.type || "cut" });
      }
    });
    _cKey = key;
    _cVal = Array.from(worst.values()).sort((a, b) => a.line - b.line);
    return _cVal;
  }

  /* ------------------------------------------------------------------ *
   * Changing it
   * ------------------------------------------------------------------ */

  function stockPart() {
    try { return (Gizmo && Gizmo.findStock) ? Gizmo.findStock() : null; }
    catch (e) { return null; }
  }

  /* Which of the blank's own dimensions points at the sky. A block stands on
     its Z; a round bar is stood on end, so its length does. */
  function heightKey(p) {
    return (p && p.stock && p.stock.shape === "cyl") ? "len" : "sz";
  }

  function stockHeight() {
    const p = stockPart();
    if (!p || !p.stock) return null;
    return p.stock[heightKey(p)];
  }

  /* Re-cut the blank to a new height and stand it back down on the bars. */
  function setStockHeight(mm, quiet) {
    const p = stockPart();
    if (!p || !p.stock) return false;
    const v = Math.max(mm, 1);
    const key = heightKey(p);

    /* The build panel's own size field is the one route that also tells
       MakeProgram what the blank is now, so the two never drift apart. Use it
       when it is on the page; fall back to re-cutting the solid directly. */
    const field = document.body.classList.contains("mkp-on")
      ? document.querySelector('#mkp-stock-dims [data-mkpdim="' + key + '"]')
      : null;
    if (field) {
      field.value = fmt(disp(v));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      if (!quiet && typeof showToast === "function") {
        showToast("Blank re-cut", "Now " + fmt(disp(v)) + " " + uLab() + " tall, stood back down on the parallels.");
      }
      return true;
    }

    p.stock[key] = v;
    try {
      Panel.rebuildStock(p);
      const where = (fixture() && fixture().state) ? fixture().state().slide : "center";
      if (Gizmo && Gizmo.alignStockInVise) {
        Gizmo.alignStockInVise(where || "center", true);
      }
    } catch (e) { console.warn("[JawClear] blank:", e); return false; }
    if (!quiet && typeof showToast === "function") {
      showToast("Blank re-cut", "Now " + fmt(disp(v)) + " " + uLab() + " tall, stood back down on the parallels.");
    }
    return true;
  }

  function parallelHeight() {
    const f = fixture();
    return (f && f.state) ? f.state().parH : null;
  }

  function setParallelHeight(mm, quiet) {
    const f = fixture();
    if (!f || !f.setParallels) return false;
    f.setParallels({ h: Math.max(mm, 2) });
    if (typeof FixturePanel !== "undefined" && FixturePanel.paint) FixturePanel.paint();
    if (!quiet && typeof showToast === "function") {
      showToast("Parallels re-cut", fmt(disp(mm)) + " " + uLab() + " tall — the blank came up with them.");
    }
    return true;
  }

  /* Drive the measured overhang to `want` (display units) by moving whichever
     of the two the switch is set to. */
  function setProud(want, mode, quiet) {
    const m = measure();
    if (!m.ok) return false;
    const delta = native(want - m.proud);        // in mm
    if (Math.abs(delta) < 1e-4) return true;

    if (mode === "pars") {
      const h = parallelHeight();
      if (h == null) return false;
      return setParallelHeight(h + delta, quiet);
    }
    const h = stockHeight();
    if (h == null) return false;
    return setStockHeight(h + delta, quiet);
  }

  /* ------------------------------------------------------------------ *
   * The panel
   * ------------------------------------------------------------------ */

  const MARKUP = `
    <div class="jc-stat">
      <span class="jc-stat-k">Stock above the jaws</span>
      <span class="jc-stat-v" data-jc="stat">—</span>
    </div>
    <div class="jc-verdict" data-jc="verdict"></div>

    <div class="jc-zs">
      <div class="jc-z">
        <span class="jc-z-k">Stock top Z</span>
        <span class="jc-z-v" data-jc="stockz">—</span>
      </div>
      <div class="jc-z">
        <span class="jc-z-k">Jaw top Z</span>
        <span class="jc-z-v" data-jc="jawz">—</span>
      </div>
    </div>

    <div class="jc-label">Change it by</div>
    <div class="jc-grid jc-mode" data-jc="mode">
      <button type="button" data-jcmode="stock" class="on"
              title="Take a taller blank. The bottom stays on the parallels, so the top comes up.">Adjusting the stock</button>
      <button type="button" data-jcmode="pars"
              title="Put taller parallels under it. The blank is the same size, it just stands higher.">Adjusting the parallels</button>
    </div>

    <div class="jc-label">How much do you want above the jaws?</div>
    <div class="jc-field">
      <input type="number" step="0.05" min="0" data-jc="want">
      <span class="jc-unit" data-jc="unit">in</span>
      <button type="button" class="jc-go" data-jc="apply">Set it</button>
    </div>

    <div class="jc-label" data-jc="directlabel">Or set the height itself</div>
    <div class="jc-field">
      <input type="number" step="0.05" min="0.1" data-jc="direct">
      <span class="jc-unit" data-jc="unit2">in</span>
      <button type="button" class="jc-go" data-jc="applydirect">Set it</button>
    </div>

    <button type="button" class="jc-reset" data-jc="reset">
      Put it back how it was
      <em data-jc="resetnote">The parallels and the blank return to the sizes they were when you opened this.</em>
    </button>

    <div class="pm-note jc-note">
      The cutter has to reach the bottom of its deepest cut without the spindle
      or the holder touching a jaw. Stand the metal proud by at least the depth
      you are cutting, plus a little for the chips.
    </div>`;

  const instances = [];

  function mount(host) {
    if (!host || host.dataset.jcMounted === "1") return null;
    host.dataset.jcMounted = "1";
    host.classList.add("jc-wrap");
    host.innerHTML = MARKUP;

    const q = k => host.querySelector('[data-jc="' + k + '"]');
    const inst = {
      host, mode: "stock",
      /* What everything was when this panel was first opened. */
      mark: null,
      dirty: false,
      onChange: null,
    };

    function snapshot(force) {
      if (inst.mark && !force) return inst.mark;
      inst.mark = {
        parH: parallelHeight(),
        parAuto: (fixture() && fixture().state) ? fixture().state().parAuto : true,
        stockH: stockHeight(),
      };
      return inst.mark;
    }

    function restore() {
      const s = inst.mark;
      if (!s) return;
      if (s.stockH != null) setStockHeight(s.stockH, true);
      if (s.parH != null) {
        const f = fixture();
        if (f && f.setParallels) f.setParallels({ h: s.parH, auto: s.parAuto });
      }
      inst.dirty = false;
      paint(true);
      if (typeof showToast === "function") {
        showToast("Put back", "The parallels and the blank are the sizes they were when you opened this.");
      }
      if (inst.onChange) inst.onChange(false);
    }

    function paint(force) {
      const m = measure();
      const stat = q("stat"), verdict = q("verdict");

      if (!m.ok) {
        stat.textContent = "—";
        verdict.textContent = m.why === "no blank"
          ? "There is no blank in the vise yet."
          : "There is no vise in the scene yet.";
        verdict.className = "jc-verdict is-idle";
        host.classList.add("is-idle");
        return;
      }
      host.classList.remove("is-idle");
      snapshot(false);

      stat.textContent = fmt(m.proud) + " " + uLab();
      const bad = conflicts();
      if (m.proud <= 0) {
        verdict.textContent = "The blank is level with the jaws or below them — anything you cut, you cut the vise.";
        verdict.className = "jc-verdict is-bad";
      } else if (bad.length) {
        verdict.textContent = bad.length + (bad.length === 1 ? " line" : " lines")
          + " in the program go below the jaw line. Stand it up by at least "
          + fmt(Math.max.apply(null, bad.map(b => b.below))) + " " + uLab() + " more.";
        verdict.className = "jc-verdict is-warn";
      } else {
        verdict.textContent = "Nothing in the program reaches below the top of the jaws.";
        verdict.className = "jc-verdict is-good";
      }

      const unit = q("unit");
      if (unit) unit.textContent = uLab();
      const want = q("want");
      if (want && document.activeElement !== want) {
        want.step = inches() ? "0.05" : "1";
        want.value = fmt(m.proud);
      }

      /* The two heights the number above is the difference between. */
      const sz = q("stockz"), jz = q("jawz");
      if (sz) sz.textContent = fmt(m.stockTop) + " " + uLab();
      if (jz) jz.textContent = fmt(m.jawTop) + " " + uLab();

      const unit2 = q("unit2");
      if (unit2) unit2.textContent = uLab();
      const parsMode = inst.mode === "pars";
      const dl = q("directlabel");
      if (dl) dl.textContent = parsMode ? "Or set the parallel height itself" : "Or set the stock height itself";
      const direct = q("direct");
      const h = parsMode ? parallelHeight() : stockHeight();
      if (direct && document.activeElement !== direct) {
        direct.step = inches() ? "0.05" : "1";
        direct.value = h == null ? "" : fmt(disp(h));
      }

      const rn = q("resetnote");
      if (rn && inst.mark) {
        rn.textContent = "Back to "
          + (inst.mark.parH != null ? fmt(disp(inst.mark.parH)) + " " + uLab() + " parallels" : "the parallels")
          + " and a "
          + (inst.mark.stockH != null ? fmt(disp(inst.mark.stockH)) + " " + uLab() + " " : "") + "blank.";
      }
      const rb = q("reset");
      if (rb) rb.disabled = !inst.dirty;
      if (force && inst.onChange) inst.onChange(inst.dirty);
    }

    function touched() {
      inst.dirty = true;
      if (inst.onChange) inst.onChange(true);
    }

    /* --- wiring --- */

    const modeBox = q("mode");
    modeBox.addEventListener("click", e => {
      const b = e.target.closest("[data-jcmode]");
      if (!b) return;
      inst.mode = b.dataset.jcmode;
      modeBox.querySelectorAll("[data-jcmode]").forEach(x =>
        x.classList.toggle("on", x === b));
      paint(false);
    });

    q("apply").addEventListener("click", () => {
      const v = parseFloat(q("want").value);
      if (!isFinite(v)) return;
      snapshot(false);
      if (setProud(v, inst.mode)) touched();
      paint(true);
    });
    q("want").addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); q("apply").click(); }
    });

    q("applydirect").addEventListener("click", () => {
      const v = parseFloat(q("direct").value);
      if (!isFinite(v) || v <= 0) { paint(false); return; }
      snapshot(false);
      const mm = native(v);
      const ok = inst.mode === "pars" ? setParallelHeight(mm) : setStockHeight(mm);
      if (ok) touched();
      paint(true);
    });
    q("direct").addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); q("applydirect").click(); }
    });

    q("reset").addEventListener("click", restore);

    inst.paint = paint;
    inst.snapshot = () => snapshot(true);
    inst.restore = restore;
    inst.isDirty = () => inst.dirty;
    instances.push(inst);
    paint(true);
    return inst;
  }

  /* One slow tick keeps every mounted copy honest — the blank, the bars and
     the units can all be changed from elsewhere on the page. */
  setInterval(() => {
    /* Never repaint on top of a running animation — reading bounding boxes
       and rewriting the DOM mid-dissolve is exactly the sort of thing that
       costs a frame. */
    try { if (window.VPBusy && window.VPBusy.active()) return; } catch (e) {   }
    instances.forEach(i => {
      if (i.host.offsetParent === null) return;
      try { i.paint(false); } catch (e) {   }
    });
  }, 500);

  return { mount, measure, setProud, conflicts, jawTopInProgramZ,
           stockHeight, setStockHeight, parallelHeight, setParallelHeight };
})();
