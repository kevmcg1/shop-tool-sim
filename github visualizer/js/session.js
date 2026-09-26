/* Two small things the rest of the app leans on:

   ConfirmBox — a yes/no dialog that matches the rest of the chrome.
   Session    — remembers your work on this computer and nowhere else.

   Nothing here talks to a network. Everything is localStorage, which lives in
   your own browser profile on your own machine. */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * ConfirmBox
   * ------------------------------------------------------------------ */

  const ConfirmBox = {
    el: null,
    build() {
      if (this.el) return this.el;
      const box = document.createElement("div");
      box.className = "modal-overlay";
      box.id = "confirm-modal";
      box.innerHTML =
        '<div class="modal cb-modal">' +
          '<div class="modal-header"><span class="modal-title cb-title"></span></div>' +
          '<div class="cb-body"></div>' +
          '<div class="cb-actions">' +
            '<button type="button" class="cb-no"></button>' +
            '<button type="button" class="cb-yes"></button>' +
          "</div>" +
        "</div>";
      document.body.appendChild(box);
      box.addEventListener("click", e => {
        if (e.target === box) this.close();
      });
      this.el = box;
      return box;
    },
    close() {
      if (this.el) this.el.classList.remove("open");
    },
    ask(o) {
      const box = this.build();
      box.querySelector(".cb-title").textContent = o.title || "Are you sure?";
      box.querySelector(".cb-body").innerHTML = o.body || "";

      const yes = box.querySelector(".cb-yes");
      const no = box.querySelector(".cb-no");
      yes.textContent = o.yes || "Do it";
      no.textContent = o.no || "Cancel";

      const clean = yes.cloneNode(true), cleanNo = no.cloneNode(true);
      yes.replaceWith(clean); no.replaceWith(cleanNo);

      clean.addEventListener("click", () => { this.close(); if (o.onYes) o.onYes(); });
      cleanNo.addEventListener("click", () => { this.close(); if (o.onNo) o.onNo(); });

      box.classList.add("open");
    },
  };

  window.ConfirmBox = ConfirmBox;

  /* ------------------------------------------------------------------ *
   * Session — what gets carried over to the next visit
   * ------------------------------------------------------------------ */

  const KEY = "gcodeviz.session.v1";
  const SAVE_AFTER = 700;
  let timer = null, restoring = false;

  function snapshot() {
    const doc = { v: 1, at: Date.now() };

    if (typeof gcodeInput !== "undefined" && gcodeInput) doc.code = gcodeInput.value;

    if (typeof toolTable !== "undefined" && toolTable.forEach) {
      doc.tools = {};
      toolTable.forEach((d, t) => { doc.tools[t] = d; });
    }
    if (typeof dOffsetTable !== "undefined" && dOffsetTable.forEach) {
      doc.offsets = {};
      dOffsetTable.forEach((d, n) => { doc.offsets[n] = d; });
    }
    if (typeof ToolShapes !== "undefined" && ToolShapes.forEach) {
      doc.shapes = {};
      ToolShapes.forEach((s, t) => { doc.shapes[t] = s; });
    }
    if (window.ToolModels && window.ToolModels.all) {
      doc.toolCodes = window.ToolModels.all().map(t => t.code).filter(Boolean);
    }
    if (typeof toolTableDisplayUnit !== "undefined") doc.diaUnit = toolTableDisplayUnit;
    if (typeof pathColorMode !== "undefined") doc.colorMode = pathColorMode;

    return doc;
  }

  function save() {
    if (restoring) return;
    try { localStorage.setItem(KEY, JSON.stringify(snapshot())); }
    catch (e) { console.warn("[Session] could not save:", e.message); }
  }

  const nudge = () => { clearTimeout(timer); timer = setTimeout(save, SAVE_AFTER); };
  window.SessionSave = nudge;

  function stored() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const doc = JSON.parse(raw);
      return (doc && doc.v === 1) ? doc : null;
    } catch (e) { return null; }
  }

  function restore() {
    const doc = stored();
    if (!doc) return false;
    restoring = true;
    try {
      if (doc.diaUnit === "mm") {
        const b = document.getElementById("tool-unit-btn-mm");
        if (b) b.click();
      }

      if (typeof ToolShapes !== "undefined" && doc.shapes) {
        Object.keys(doc.shapes).forEach(k => ToolShapes.set(+k, doc.shapes[k]));
      }

      if (doc.code && typeof loadGCode === "function") {
        loadGCode(doc.code);
        if (typeof rewindSimToStart === "function") rewindSimToStart();
      }

      /* Diameters go in after the parse, or the parser's own rows overwrite them. */
      if (typeof toolTable !== "undefined" && doc.tools) {
        Object.keys(doc.tools).forEach(k => {
          if (toolTable.has(+k)) toolTable.set(+k, doc.tools[k]);
        });
        if (typeof updateToolTableUI === "function") updateToolTableUI();
      }
      if (typeof dOffsetTable !== "undefined" && doc.offsets) {
        Object.keys(doc.offsets).forEach(k => {
          if (dOffsetTable.has(+k)) dOffsetTable.set(+k, doc.offsets[k]);
        });
        if (typeof updateDOffsetTableUI === "function") updateDOffsetTableUI();
      }

      if (doc.toolCodes && window.ToolModels && window.ToolModels.add) {
        doc.toolCodes.forEach(c => {
          try { window.ToolModels.add(c, { quiet: true }); } catch (e) {   }
        });
        if (window.ToolModels.relabel) window.ToolModels.relabel();
        /* The cutter on screen was drawn before these existed, so it is the
           plain white placeholder cylinder. Redrawing the frame swaps it for
           the real modelled cutter. Without this the page opened showing the
           placeholder and only changed over on the next seek — which for most
           people was the moment they pressed Play. */
        if (window.ToolModels.refresh) window.ToolModels.refresh();
      }

      if (doc.colorMode && typeof setPathColorMode === "function") {
        setPathColorMode(doc.colorMode);
      }
    } catch (e) {
      console.warn("[Session] saved work would not load:", e);
    }
    restoring = false;
    return true;
  }

  function wipe() {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem("gcodeviz.tokenColors.v1");
      localStorage.removeItem("gcodeviz.defaultSetup.v1");
      localStorage.removeItem("gcodeviz.prefs.v1");
    } catch (e) {   }
  }

  window.Session = { save, restore, wipe, nudge, stored };

  function boot() {
    /* Anything that changes the program or the tables nudges a save. */
    ["input", "change"].forEach(t =>
      document.addEventListener(t, e => {
        const el = e.target;
        if (!el) return;
        if (el.id === "gcode-input" || el.closest("#tool-table") ||
            el.closest("#d-offset-table") || el.closest("#tool-model-list")) nudge();
      }, true));

    window.addEventListener("beforeunload", save);

    /* Restore after everything has had a chance to register itself. */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (restore()) {
        if (typeof showToast === "function") {
          showToast("Picked up where you left off",
            "Your program, tools and setup were saved on this computer last time. Settings \u25B8 Wipe all clears them.");
        }
      }

      /* Start-up is a race between a dozen modules, and whichever of them
         registers last — a tool model, a tool shape, a stock rebuild — does
         so after the frame on screen was drawn. One more pass at the end,
         once everything has had its turn, so the first thing you see is the
         same thing you would see after pressing Play. */
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (typeof simSeekToTime === "function" && typeof simTime === "number") {
          try { simSeekToTime(simTime); } catch (e) { console.warn("[Session] settle:", e); }
        }
        if (typeof goHomeView === "function") goHomeView(false);
      }));
    }));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
