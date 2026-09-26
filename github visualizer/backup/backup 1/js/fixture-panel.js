/* Fixture sidebar category — the vise and the parallels, available whether or
   not build mode is on. It drives the same MakeProgram routines the wizard
   uses, so there is one implementation of "re-cut and bank the bars". */

(() => {
  "use strict";

  const id = s => document.getElementById(s);
  const IN = 25.4;

  /* Geometry is held in mm; the sidebar shows whatever the program is in. */
  const inches = () => (typeof unitMode !== "undefined") && unitMode === "inch";
  const disp = mm => inches() ? mm / IN : mm;
  const native = v => inches() ? v * IN : v;
  const fmt = v => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(inches() ? 3 : 2);

  /* part-models.js keeps MakeProgram inside its own closure; this is the
     handful of fixture calls it publishes. */
  const MP = () => (window.PartModels && window.PartModels.fixture) || null;

  function paint() {
    const mp = MP();
    if (!mp || !mp.state) return;
    const st = mp.state();

    const box = id("fx-vises");
    if (box) {
      const want = st.vises.map(v => v.key + (v.key === st.vise ? "*" : "")).join(",");
      if (box.dataset.paint !== want) {
        box.dataset.paint = want;
        box.innerHTML = st.vises.map(v => `
          <button class="mkp-pick${v.key === st.vise ? " on" : ""}" data-fxvise="${v.key}">
            <span class="mkp-pick-name">${v.name}</span>
            <span class="mkp-pick-note">${v.note}</span>
          </button>`).join("");
      }
    }

    const auto = id("fx-par-auto");
    if (auto) auto.checked = !!st.parAuto;
    const h = id("fx-par-h"), t = id("fx-par-t");
    if (h && document.activeElement !== h) h.value = fmt(disp(st.parH));
    if (t && document.activeElement !== t) t.value = fmt(disp(st.parT));

    const hasVise = !!(window.PartModels && window.PartModels.bodyOf("vise"));
    const empty = id("fx-empty");
    if (empty) empty.hidden = hasVise;
    const bank = id("gz-bank");
    if (bank) bank.disabled = !hasVise;
    const al = id("fx-par-align");
    if (al) al.disabled = !hasVise;

    /* One show/hide switch per group, mirroring the viewport buttons. */
    document.querySelectorAll("#fixture-section [data-fxshow]").forEach(sw => {
      const kind = sw.dataset.fxshow;
      const there = !!(window.PartModels && window.PartModels.bodyOf(kind));
      const on = there && window.PartModels.bodyVisible(kind);
      sw.classList.toggle("off", !there);
      const track = sw.querySelector(".toggle-track");
      if (track) track.classList.toggle("on", on);
      const text = sw.querySelector(".fx-show-text");
      if (text) text.textContent = !there ? "Not in the scene" : (on ? "Shown" : "Hidden");
    });

    const note = id("fx-table-note");
    if (note) {
      note.hidden = !!(window.PartModels && window.PartModels.bodyOf("table"));
    }
  }

  function bind() {
    const sec = id("fixture-section");
    if (sec) sec.addEventListener("click", e => {
      const sw = e.target.closest("[data-fxshow]");
      if (!sw || sw.classList.contains("off")) return;
      const kind = sw.dataset.fxshow;
      if (typeof setBodyVisible === "function") {
        setBodyVisible(kind, !window.PartModels.bodyVisible(kind));
      }
      paint();
    });

    const box = id("fx-vises");
    if (box) box.addEventListener("click", e => {
      const b = e.target.closest("[data-fxvise]");
      if (!b) return;
      const mp = MP();
      if (mp && mp.setVise) mp.setVise(b.dataset.fxvise);
      paint();
    });

    const al = id("fx-par-align");
    if (al) al.addEventListener("click", () => {
      const mp = MP();
      if (mp && mp.autoParallels) mp.autoParallels(false);
      paint();
    });

    const auto = id("fx-par-auto");
    if (auto) auto.addEventListener("change", () => {
      const mp = MP();
      if (mp && mp.setParallels) mp.setParallels({ auto: auto.checked });
      paint();
    });

    /* The bars re-cut while you are still in the field — a short debounce on
       the keystrokes, and leaving the field commits at once. */
    [["fx-par-h", "h"], ["fx-par-t", "t"]].forEach(([sel, key]) => {
      const e = id(sel);
      if (!e) return;
      let typing = null;
      const take = redraw => {
        const v = parseFloat(e.value);
        if (!isFinite(v) || v <= 0) { if (redraw) paint(); return; }
        const mp = MP();
        if (mp && mp.setParallels) mp.setParallels({ [key]: native(v) });
        paint();
      };
      e.addEventListener("input", () => {
        clearTimeout(typing);
        typing = setTimeout(() => take(false), 200);
      });
      e.addEventListener("change", () => { clearTimeout(typing); take(true); });
    });

    paint();
  }

  window.FixturePanel = { paint, bind };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
