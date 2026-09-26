/* model-sidebar.js — the sidebar model mode gets instead of the usual one.

   Model mode is where someone arranges a setup: puts a lump of metal in the
   vise, squares it up, tells the machine which corner is zero. The sidebar it
   inherited was built for the other job — running a program — so all of that
   sat under nine accordions about feeds, offsets and tool models, with a small
   block called "Arrange" bolted on top. Someone who has never used a mill has
   no way of knowing which three of those forty controls they want.

   So while model mode is on, the sim sidebar is put away and #sb-model stands
   in its place: one question per block, and buttons that say what will happen
   rather than what it is called.

   This file owns none of the behavior. Every button carries a selector for
   the real control and forwards its click there, and the read-outs are copied
   back off those same controls. There is still exactly one implementation of
   everything; this is only a friendlier way in. */

(function () {
  "use strict";

  const panel = document.getElementById("sb-model");
  if (!panel) return;

  const sidebar = document.getElementById("sidebar");
  const isModel = () => (typeof ViewMode !== "undefined") && ViewMode.isModel();

  /* ------------------------------------------------------------------ *
   * Forwarding
   * ------------------------------------------------------------------ */

  const find = sel => { try { return document.querySelector(sel); } catch (e) { return null; } };

  panel.addEventListener("click", e => {
    const btn = e.target.closest("[data-doclick]");
    if (!btn || btn.disabled) return;
    const target = find(btn.dataset.doclick);
    if (target) target.click();
  });

  /* ------------------------------------------------------------------ *
   * The shelf
   *
   * The Library is a whole section of its own and far too big to restate in
   * plain words, so model mode borrows the real one: press the button and
   * that one section comes back, opened, with the rest still away.
   * ------------------------------------------------------------------ */

  const libHead = document.querySelector('.sec-head[data-sec="part-models"]');
  const libSection = libHead && libHead.closest(".section");
  const libBtn = document.getElementById("ms-open-library");

  if (libBtn && libSection) {
    libBtn.addEventListener("click", () => {
      const showing = libSection.classList.toggle("ms-reveal");
      if (showing) {
        if (!libHead.classList.contains("open")) libHead.click();
        /* Let the section finish opening before scrolling to it. */
        requestAnimationFrame(() => requestAnimationFrame(() => {
          libSection.scrollIntoView({ block: "start", behavior: "smooth" });
        }));
      }
      paintLibraryButton(showing);
    });
  }

  function paintLibraryButton(showing) {
    if (!libBtn) return;
    const t = libBtn.querySelector(".ms-btn-t");
    const d = libBtn.querySelector(".ms-btn-d");
    if (t) t.textContent = showing ? "Hide the shelf" : "Browse the shelf";
    if (d) d.textContent = showing
      ? "Put it away again when you're done"
      : "Vises, blanks, clamps and complete setups";
    libBtn.classList.toggle("on", showing);
  }

  const doneBtn = document.getElementById("ms-done");
  if (doneBtn) doneBtn.addEventListener("click", () => {
    if (typeof ViewMode !== "undefined") ViewMode.set("sim");
  });

  /* ------------------------------------------------------------------ *
   * Copying state back off the real controls
   * ------------------------------------------------------------------ */

  /* A control counts as put away if it carries the hidden attribute or has
     been display:none'd. offsetParent is no use here — everything being read
     lives inside a section this file has just hidden, so it is null for all
     of them whether the control itself is on or off. */
  function isPutAway(el) {
    if (!el) return true;
    if (el.hidden) return true;
    if (el.style && el.style.display === "none") return true;
    return false;
  }

  const hasStock = () => {
    try {
      return !!(window.PartModels && window.PartModels.bodyOf
                && window.PartModels.bodyOf("stock"));
    } catch (e) { return false; }
  };

  function paint() {
    /* Steps that only mean something once there is metal in the scene. */
    const stock = hasStock();
    panel.querySelectorAll("[data-needs-stock]").forEach(step =>
      step.classList.toggle("is-idle", !stock));

    /* Text copied straight off a read-out. */
    panel.querySelectorAll("[data-mirror-text]").forEach(el => {
      const src = find(el.dataset.mirrorText);
      const txt = (src && src.textContent || "").trim();
      const empty = el.dataset.empty || "";
      el.textContent = txt || empty;
      el.classList.toggle("is-empty", !txt);
    });

    /* Lit when the control it stands for is lit. */
    panel.querySelectorAll("[data-mirror-on]").forEach(el => {
      const src = find(el.dataset.mirrorOn);
      el.classList.toggle("on", !!(src && src.classList.contains("on")));
    });

    /* Grayed out when the control it stands for is unavailable. */
    panel.querySelectorAll("[data-mirror-disabled]").forEach(el => {
      const src = find(el.dataset.mirrorDisabled);
      const off = !src || src.disabled === true || isPutAway(src);
      if (el.tagName === "BUTTON") {
        el.disabled = off;
      } else {
        el.classList.toggle("is-off", off);
        el.querySelectorAll(".ms-btn").forEach(b => { b.disabled = off; });
      }
    });

    /* Present only while the control it stands for is. */
    panel.querySelectorAll("[data-mirror-hidden]").forEach(el => {
      el.hidden = isPutAway(find(el.dataset.mirrorHidden));
    });
  }

  /* Cheap enough to run every frame, and only while model mode is on — the
     underlying panels repaint themselves on their own schedule and there is
     no one event that covers all of them. */
  let raf = 0;
  function loop() {
    raf = 0;
    if (!isModel() || buildMode()) return;
    paint();
    raf = requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------ *
   * Coming and going
   * ------------------------------------------------------------------ */

  /* Build mode has a sidebar of its own — the guide — and it is also a model
     mode, so without this both would try to own the panel at once and the
     guide would be the one that lost. While Guide Me Through It is on, this
     one stays away. */
  const buildMode = () => document.body.classList.contains("mkp-on");

  function apply() {
    const on = isModel() && !buildMode();
    document.body.classList.toggle("model-mode", on);
    panel.hidden = !on;

    if (on) {
      /* Start at the first question rather than wherever the sim sidebar had
         been scrolled to. */
      if (sidebar) sidebar.scrollTop = 0;
      if (!raf) raf = requestAnimationFrame(loop);
      paint();
    } else {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      /* Put the shelf away with everything else, so coming back to model mode
         is the same view every time. */
      if (libSection) libSection.classList.remove("ms-reveal");
      paintLibraryButton(false);
    }
  }

  /* paint() is the hook ViewMode calls when the mode changes; refresh() just
     re-copies the read-outs, for anything that wants to force that. */
  window.ModelSidebar = { paint: apply, refresh: paint };

  /* Coming out of build mode does not change the view mode, so nothing would
     otherwise tell this panel it is wanted again. Watching the body class
     covers every route in and out. */
  if (typeof MutationObserver === "function") {
    let was = buildMode();
    new MutationObserver(() => {
      const now = buildMode();
      if (now !== was) { was = now; apply(); }
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
})();
