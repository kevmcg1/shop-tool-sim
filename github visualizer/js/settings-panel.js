/* Settings — every option is a sentence with one word in it that the switch
   changes. Reading the sentence tells you what the sim will do; the highlighted
   word is the part the switch swaps out.

   Each row declares how to read the current state and how to set it, so the
   panel never holds its own copy of anything. */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const has = f => typeof window[f] === "function";
  const trackOn = id => {
    const el = document.getElementById(id);
    return !!(el && el.classList.contains("on"));
  };
  const clickOnce = id => { const el = document.getElementById(id); if (el) el.click(); };

  /* ---- the rows ------------------------------------------------------- *
     text: the sentence, with {} where the switched word goes
     words: [when off, when on]
     get:   () => boolean, true means the second word
     set:   (want) => void                                                  */

  /* Hover feedback style — how a solid answers when you point at its button. */
  const HOVER_STYLES = ["breathe", "glow", "blink", "outline"];
  const PREF_KEY = "gcodeviz.prefs.v1";
  const prefs = (() => {
    try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; }
    catch (e) { return {}; }
  })();
  function setPref(k, v) {
    prefs[k] = v;
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {   }
    if (k === "hoverStyle" && window.VPHoverStyle) window.VPHoverStyle(v);
  }
  window.AppPrefs = {
    get: (k, d) => (prefs[k] === undefined ? d : prefs[k]),
    set: setPref,
  };

  const EASY = [
    {
      text: "The sim will default to {}.",
      words: ["inches", "millimeters"],
      get: () => (typeof toolTableDisplayUnit !== "undefined") && toolTableDisplayUnit === "mm",
      set: w => clickOnce(w ? "tool-unit-btn-mm" : "tool-unit-btn-inch"),
      note: "Changes the units you type tool diameters in. The program's own units are whatever its G20 or G21 says.",
    },
    {
      text: "The floor grid is {}.",
      words: ["hidden", "shown"],
      get: () => trackOn("show-grid-track"),
      set: w => has("setGridVisible") && window.setGridVisible(w),
    },
    {
      text: "The X / Y / Z arrows are {}.",
      words: ["hidden", "shown"],
      get: () => trackOn("show-axes-track"),
      set: w => has("setAxesVisible") && window.setAxesVisible(w),
    },
    {
      text: "The letters on the ends of the arrows are {}.",
      words: ["hidden", "shown"],
      get: () => trackOn("show-axis-labels-track"),
      set: w => clickOnce("show-axis-labels-label"),
    },
    {
      text: "The cutter itself is {}.",
      words: ["hidden", "shown"],
      get: () => (typeof toolVisible !== "undefined") && toolVisible,
      set: w => has("setToolVisible") && window.setToolVisible(w),
      note: "Turning the cutter off is the clearest way to watch the shape it has left behind.",
    },
    {
      text: "The lines the cutter follows are {}.",
      words: ["hidden", "shown"],
      get: () => (typeof pathsVisible !== "undefined") && pathsVisible,
      set: w => has("setPathsVisible") && window.setPathsVisible(w),
    },
    {
      text: "The yellow ball on the work zero is {}.",
      words: ["hidden", "shown"],
      get: () => (typeof wcsVisible !== "undefined") && wcsVisible,
      set: w => has("setWcsVisible") && window.setWcsVisible(w),
    },
    {
      text: "The page opens in {} mode.",
      words: ["sim", "model"],
      get: () => (typeof ViewMode !== "undefined") && ViewMode.isModel(),
      set: w => (typeof ViewMode !== "undefined") && ViewMode.set(w ? "model" : "sim"),
      note: "Sim runs the program. Model lets you pick things up and move them.",
    },
  ];

  const ADVANCED = [
    {
      text: "The toolpath is colored by {}.",
      words: ["feed rate", "kind of move"],
      get: () => (typeof pathColorMode !== "undefined") && pathColorMode === "type",
      set: w => has("setPathColorMode") && window.setPathColorMode(w ? "type" : "feed"),
      note: "Feed rate ramps every cutting move blue through red by its F word. Kind of move gives rapids, feeds, arcs and drilling one color each.",
    },
    {
      text: "An M01 in the program {}.",
      words: ["is ignored", "pauses the run"],
      get: () => trackOn("optional-stop-track"),
      set: () => clickOnce("optional-stop-label"),
    },
    {
      text: "Moves the cursor is not sitting on are {}.",
      words: ["left alone", "dimmed"],
      get: () => trackOn("focus-dim-track"),
      set: () => clickOnce("focus-dim-label"),
      note: "Put the caret on a line in the editor and only that move stays bright.",
    },
    {
      text: "The part of the program still to come is {}.",
      words: ["hidden", "drawn ahead"],
      get: () => trackOn("show-all-paths-track"),
      set: () => clickOnce("show-all-paths-label"),
    },
    {
      text: "Moves drawn ahead are {}.",
      words: ["full brightness", "dimmed"],
      get: () => trackOn("dim-future-track"),
      set: () => clickOnce("dim-future-label"),
      needs: () => trackOn("show-all-paths-track"),
    },
    {
      text: "The center point of every arc is {}.",
      words: ["hidden", "marked"],
      get: () => trackOn("show-centers-track"),
      set: () => clickOnce("show-centers-label"),
    },
    {
      text: "For A, B and C words, {}.",
      words: ["the tool swings round the part", "the part turns under the tool"],
      get: () => (typeof rotaryMode !== "undefined") && rotaryMode === "part",
      set: w => {
        const b = document.querySelector(`#rotary-mode [data-rotary="${w ? "part" : "tool"}"]`);
        if (b) b.click();
      },
      note: "This is built into the path, so changing it re-reads the program and rewinds to the first line.",
    },
    {
      text: "For X and Y, {}.",
      words: ["the spindle travels", "the table travels"],
      get: () => (typeof linearMode !== "undefined") && linearMode === "table",
      set: w => {
        const b = document.querySelector(`#linear-mode [data-linear="${w ? "table" : "tool"}"]`);
        if (b) b.click();
      },
      note: "Display only — the cut is identical either way. Table travels is what a VF-1 actually does.",
    },
    {
      text: "On an M06 the changer arm {}.",
      words: ["stays out of it", "swings the tools over"],
      get: () => (typeof ToolChanger !== "undefined") && ToolChanger.enabled(),
      set: w => (typeof ToolChanger !== "undefined") && ToolChanger.setEnabled(w),
      note: "Swung, the change is given its few seconds and the arm drops, turns half a revolution and lifts, trading the tool in the spindle for the next one. Out of it, the block takes no time and the tool simply becomes the next tool — which is how long the program really is if you are timing the cutting.",
    },
    {
      text: "The drag arrows on a selected solid are {}.",
      words: ["hidden", "shown"],
      get: () => (typeof handlesVisible !== "undefined") && handlesVisible,
      set: w => has("setHandlesVisible") && window.setHandlesVisible(w),
    },
    {
      text: "The machine read-outs are {}.",
      words: ["in the sidebar only", "floating on the view"],
      get: () => document.body.classList.contains("hud-visible"),
      set: () => clickOnce("hud-visible-label"),
    },
    /* Cutter comp lost its sidebar panel and with it every way of switching
       it on — the engine was still there, nothing could reach it. These two
       rows are its home now; the overlay also has a button in the dock. */
    {
      text: "G41 and G42 in the program are {}.",
      words: ["drawn as written", "worked out properly"],
      get: () => (typeof compEnabled !== "undefined") && compEnabled,
      set: () => clickOnce("cc-enable-label"),
      note: "Worked out properly offsets the path by the tool radius from the D-offset table, and the cutter then follows that instead of the line in the program. Both contour samples are written to show it off.",
    },
    {
      text: "The compensated path itself is {}.",
      words: ["hidden", "drawn in magenta"],
      get: () => (typeof compOverlayVisible !== "undefined")
                 && compOverlayVisible && compEnabled,
      set: () => clickOnce("cc-overlay-label"),
      needs: () => (typeof compEnabled !== "undefined") && compEnabled,
      note: "The programmed line stays where it is; the magenta one is what the middle of the cutter walks.",
    },
  ];

  /* ---- syntax colors -------------------------------------------------- */

  const SWATCHES = [
    "#ff5a5a", "#ff8800", "#ffc233", "#f5e663", "#9ede4f", "#3ddc84",
    "#22d3b8", "#00d4ff", "#4f8cff", "#8b6cff", "#c77dff", "#ff6ec7",
    "#ffffff", "#c9ccd1", "#8a93a0", "#5a6470",
  ];

  const TOKENS = [
    { cls: "tok-g", name: "G codes", eg: "G01" },
    { cls: "tok-m", name: "M codes", eg: "M08" },
    { cls: "tok-t", name: "Tool calls", eg: "T1" },
    { cls: "tok-h", name: "H offsets", eg: "H01" },
    { cls: "tok-xyz", name: "X Y Z", eg: "X1.5" },
    { cls: "tok-ijk", name: "I J K", eg: "I.25" },
    { cls: "tok-abc", name: "A B C", eg: "A90." },
    { cls: "tok-feed", name: "Feed (F)", eg: "F30." },
    { cls: "tok-spindle", name: "Spindle (S)", eg: "S5000" },
    { cls: "tok-r", name: "R words", eg: "R.1" },
    { cls: "tok-p", name: "P words", eg: "P200" },
    { cls: "tok-q", name: "Q words", eg: "Q.15" },
    { cls: "tok-n", name: "Line numbers", eg: "N120" },
    { cls: "tok-o", name: "Program number", eg: "O1001" },
    { cls: "tok-number", name: "Plain numbers", eg: "1.250" },
    { cls: "tok-comment", name: "Comments", eg: "(FACE)" },
  ];

  const STORE_KEY = "gcodeviz.tokenColors.v1";
  let colors = {};

  function loadColors() {
    try { colors = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { colors = {}; }
  }
  function saveColors() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(colors)); } catch (e) {   }
  }
  function applyColors() {
    let sheet = document.getElementById("token-color-overrides");
    if (!sheet) {
      sheet = document.createElement("style");
      sheet.id = "token-color-overrides";
      document.head.appendChild(sheet);
    }
    sheet.textContent = Object.keys(colors)
      .map(cls => `#gcode-highlight .${cls}{color:${colors[cls]} !important}`)
      .join("\n");
  }
  const colorOf = cls => colors[cls] || currentColor(cls);

  const _probe = document.createElement("span");
  function currentColor(cls) {
    _probe.className = cls;
    _probe.style.display = "none";
    document.body.appendChild(_probe);
    const c = getComputedStyle(_probe).color;
    _probe.remove();
    return c;
  }

  /* ---- rendering ------------------------------------------------------- */

  function rowHtml(r, i, pane) {
    const on = !!r.get();
    const word = r.words[on ? 1 : 0];
    const dim = r.needs && !r.needs();
    const parts = r.text.split("{}");
    return `
      <div class="set-row${dim ? " is-dim" : ""}" data-pane="${pane}" data-row="${i}">
        <div class="set-line">
          <span class="set-say">${parts[0]}<span class="set-word${on ? " is-on" : ""}">${word}</span>${parts[1] || ""}</span>
          <span class="set-switch${on ? " on" : ""}" role="switch" aria-checked="${on}">
            <span class="set-knob"></span>
          </span>
        </div>
        ${r.note ? `<div class="set-note">${r.note}</div>` : ""}
      </div>`;
  }

  function paintPane(sel, rows, pane, extra, lead) {
    const box = $(sel);
    if (!box) return;
    box.innerHTML = (lead || "")
      + rows.map((r, i) => rowHtml(r, i, pane)).join("")
      + (extra || "");
  }

  /* Reset sits at the very top of Easy, above every switch, because it is the
     way out when the switches have been left somewhere confusing. Holding it
     for three seconds is what confirms it — the hold itself lives in
     global-reset.js, which is also what decides what reset means. */
  function resetHtml() {
    return `
      <div class="set-head">Start over</div>
      <div class="set-note" style="margin-bottom:10px;">
        Puts the view, every switch on this page and the camera back to the way
        the page opens. Your program, the tool diameters and the D-offsets are
        left exactly as they are.
      </div>
      <button type="button" class="set-hold" id="set-reset-all"
              aria-label="Hold to reset">
        <span class="set-hold-fill" aria-hidden="true"></span>
        <span class="set-hold-label">Hold to reset</span>
      </button>
      <div class="set-note" style="margin:8px 0 0;">
        Hold the left mouse button on it for three seconds. Let go early and
        nothing happens.
      </div>
      <div class="set-rule"></div>`;
  }

  function hoverHtml() {
    const cur = window.AppPrefs.get("hoverStyle", "breathe");
    const LABEL = {
      breathe: "Breathe", glow: "Glow", blink: "Blink", outline: "Dashed outline",
    };
    const WHAT = {
      breathe: "a slow swell in and out, like it's alive",
      glow: "a steady soft green, on the whole time you hover",
      blink: "a short flash every couple of seconds",
      outline: "a dashed line that travels around the shape",
    };
    return `
      <div class="set-head">Pointing at a button</div>
      <div class="set-note" style="margin-bottom:10px;">
        When you hover one of the show/hide buttons, the thing it controls says
        so. Pick how: <b>${WHAT[cur]}</b>.
      </div>
      <div class="set-choice">
        ${HOVER_STYLES.map(s => `
          <button type="button" class="set-pick${s === cur ? " on" : ""}"
                  data-hover="${s}">${LABEL[s]}</button>`).join("")}
      </div>`;
  }

  function wipeHtml() {
    return `
      <div class="set-head">Your work</div>
      <div class="set-note" style="margin-bottom:10px;">
        The program, the tool diameters, the offsets, the tool models and these
        settings are kept on this computer so they're still here next time. They
        never leave your machine — there's no account and nothing is uploaded.
      </div>
      <button type="button" class="set-reset set-danger" id="set-wipe">Wipe all</button>`;
  }

  function colorsHtml() {
    return `
      <div class="set-head">Editor colors</div>
      <div class="set-note" style="margin-bottom:10px;">
        Pick the color each kind of word is painted in the editor. Changes stick
        between visits.
      </div>
      <div class="set-colors">
        ${TOKENS.map(t => `
          <div class="set-color" data-tokrow="${t.cls}">
            <span class="set-color-name">${t.name}</span>
            <span class="set-color-eg ${t.cls}" style="color:${colorOf(t.cls)}">${t.eg}</span>
            <span class="set-color-dot" style="background:${colorOf(t.cls)}"></span>
          </div>
          <div class="set-swatches" data-tokfor="${t.cls}" hidden>
            ${SWATCHES.map(c => `<button type="button" class="set-swatch" data-tok="${t.cls}"
                 data-col="${c}" style="background:${c}"></button>`).join("")}
          </div>`).join("")}
      </div>
      <button type="button" class="set-reset" id="set-color-reset">Put the colors back</button>`;
  }

  function paint() {
    paintPane("#settings-easy", EASY, "easy", hoverHtml(), resetHtml());
    paintPane("#settings-advanced", ADVANCED, "adv", colorsHtml() + wipeHtml());
  }

  /* ---- wiring ---------------------------------------------------------- */

  function bind() {
    loadColors();
    applyColors();
    paint();

    document.addEventListener("click", e => {
      if (!e.target.closest) return;

      const row = e.target.closest(".set-row");
      if (row && !row.classList.contains("is-dim")) {
        const list = row.dataset.pane === "easy" ? EASY : ADVANCED;
        const r = list[+row.dataset.row];
        if (r) {
          try { r.set(!r.get()); } catch (err) { console.warn("[Settings]", err); }
          setTimeout(paint, 0);
        }
        return;
      }

      const head = e.target.closest(".set-color");
      if (head) {
        const strip = document.querySelector(`.set-swatches[data-tokfor="${head.dataset.tokrow}"]`);
        if (strip) strip.hidden = !strip.hidden;
        return;
      }

      const sw = e.target.closest(".set-swatch");
      if (sw) {
        colors[sw.dataset.tok] = sw.dataset.col;
        saveColors();
        applyColors();
        paint();
        return;
      }

      const pick = e.target.closest("[data-hover]");
      if (pick) { setPref("hoverStyle", pick.dataset.hover); paint(); return; }

      if (e.target.closest("#set-color-reset")) {
        colors = {};
        saveColors();
        applyColors();
        paint();
        return;
      }

      if (e.target.closest("#set-wipe") && window.ConfirmBox) {
        window.ConfirmBox.ask({
          title: "Wipe everything?",
          body: "This clears the program, the tool table, the offsets, the tool " +
                "models, the saved setup and these settings from this computer. " +
                "It cannot be undone.",
          yes: "Wipe all",
          no: "Keep my work",
          onYes: () => {
            if (window.Session) window.Session.wipe();
            location.reload();
          },
        });
      }
    });

    /* The sidebar and the viewport can change the same things, so refresh
       whenever the settings modal is opened. */
    const btn = document.getElementById("btn-settings");
    if (btn) btn.addEventListener("click", () => setTimeout(paint, 0));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();

  window.SettingsPanel = { paint };
})();
