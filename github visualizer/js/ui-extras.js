/* ui-extras.js — viewport tooltips and the model/sim status banner.
   Loaded last, after everything it hooks into. */

(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Tooltips for the button strip in the bottom-left of the viewport.
   * The native title= popup is taken off those buttons so only ours shows.
   * ------------------------------------------------------------------ */

  const TIP_HOSTS = "[data-tip]";
  const GAP = 12;

  let tip = null, current = null;

  function tipEl() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.id = "vp-tip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
    return tip;
  }

  /* Every title= anywhere on the page becomes a data-tip, so the browser's own
     tooltip never fires and ours is the only one that ever shows. A observer
     catches the ones that arrive later, when a panel re-renders itself. */
  function claimTitles(root) {
    const scope = root && root.querySelectorAll ? root : document;
    if (scope.getAttribute && scope.hasAttribute("title")) {
      scope.dataset.tip = scope.getAttribute("title");
      scope.removeAttribute("title");
    }
    scope.querySelectorAll("[title]").forEach(el => {
      el.dataset.tip = el.getAttribute("title");
      el.removeAttribute("title");
    });
  }

  function watchTitles() {
    const mo = new MutationObserver(records => {
      let hit = false;
      for (const r of records) {
        if (r.type === "attributes") { hit = true; continue; }
        for (const n of r.addedNodes) if (n.nodeType === 1) { hit = true; break; }
        if (hit) break;
      }
      if (hit) claimTitles();
    });
    mo.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["title"],
    });
  }

  /* The strips write their tips as running text — "show or hide the tool".
     Read back as a tooltip body it wants to be a sentence, so give it a
     capital and a full stop unless it already ends in punctuation. */
  function sentence(s) {
    const t = String(s || "").trim();
    if (!t) return "";
    const head = t.charAt(0).toUpperCase() + t.slice(1);
    return /[.!?…:]$/.test(head) ? head : head + ".";
  }

  function textFor(el) {
    const raw = el.dataset.tip || el.getAttribute("aria-label") || "";
    if (!raw) return null;
    /* "Name — what it does" splits into a heading and a body. */
    const cut = raw.indexOf("—");
    if (cut > 0) {
      return {
        title: raw.slice(0, cut).trim(),
        body: sentence(raw.slice(cut + 1)),
      };
    }
    return { title: raw.trim(), body: "" };
  }

  function place(el) {
    const t = tipEl();
    const r = el.getBoundingClientRect();
    const box = t.getBoundingClientRect();

    /* Clear of the whole dock, not just the one button — the groups are
       several columns wide, and a tooltip hung off a left-hand button would
       sit on top of its neighbors. */
    const host = (el.closest && el.closest("#vp-dock")) || el;
    const hr = host.getBoundingClientRect();

    let left = Math.max(r.right, hr.right) + GAP;
    if (left + box.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - 8 - box.width);
    }
    let top = r.top + r.height / 2;
    const half = box.height / 2;
    top = Math.min(Math.max(top, half + 8), window.innerHeight - half - 8);

    t.style.left = left + "px";
    t.style.top = top + "px";

    /* Keep the little arrow pointing at the button even when the tip slid. */
    const arrow = r.top + r.height / 2 - (top - half);
    t.style.setProperty("--vp-tip-arrow", Math.min(Math.max(arrow, 10), box.height - 10) + "px");
  }

  function show(el) {
    const txt = textFor(el);
    if (!txt) return;
    current = el;
    const t = tipEl();
    t.innerHTML = "";
    const h = document.createElement("span");
    h.className = "vp-tip-title";
    h.textContent = txt.title;
    t.appendChild(h);
    if (txt.body) {
      const b = document.createElement("span");
      b.className = "vp-tip-body";
      b.textContent = txt.body;
      t.appendChild(b);
    }
    t.classList.add("show");
    place(el);
  }

  function hide() {
    current = null;
    if (tip) tip.classList.remove("show");
  }

  /* ================================================================== *
   * Hovering a body button answers on the solid itself.
   *
   * Three of the four styles tint the solid green and differ only in the
   * shape of the pulse. The fourth, Dashed outline, does not touch the
   * color at all — it draws marching ants round the solid's silhouette.
   * It used to run the same green tint on a different curve, which is why
   * a dashed outline still read as breathing.
   *
   * Whichever style is on, the strength is one eased envelope: it rises
   * toward 1 while you are on the button and falls back to 0 when you
   * leave, at a rate per second rather than per frame, so a dropped frame
   * never shows as a step and nothing ever snaps on or off.
   * ================================================================== */

  const GLOW_MIN = 0.05, GLOW_MAX = 0.32;
  const EASE_IN = 10, EASE_OUT = 9;   // per second

  let hoverStyle = "breathe";
  window.VPHoverStyle = s => { hoverStyle = s || "breathe"; };

  /* Each style is a 0..1 pulse read straight off the clock. The dashed
     style returns 0 — it has no tint to drive. */
  function pulseFor(style, t) {
    switch (style) {
      case "blink":   return Math.sin(t * 12.0) > 0.0 ? 1.0 : 0.1;
      case "breathe": return 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2.4));
      case "glow":    return 0.85;
      default:        return 0.0;   // outline
    }
  }

  /* ------------------------------------------------------------------ *
   * Marching ants.
   *
   * A box has twelve edges, but from any one angle only some of them are
   * on the silhouette — the outer contour that separates the solid from
   * the background. The rest are either hidden behind it or are interior
   * creases where two visible faces meet, and drawing those puts dashed
   * lines across the middle of a face you can see.
   *
   * For a box, an edge is on the silhouette exactly when one of its two
   * faces points at the camera and the other points away. The visible
   * edges are then chained into a single loop and given one continuous
   * run of distance, so the dashes flow the same way the whole way round
   * instead of restarting at every corner.
   * ------------------------------------------------------------------ */

  const DashOutline = (() => {
    /* Speed is counted in whole dash-and-gap patterns per second, not in
       world units per second.

       Counting it in world units was the bug. The pattern is sized off the
       frustum so it holds its size on screen, but the travel was a fixed
       0.30 frustum widths a second — about eleven whole patterns every
       second, or one pattern every five or six frames. That is close
       enough to the frame rate to alias: the ants appeared to race, then
       crawl, then run backwards, the same way a wagon wheel does on film.
       Two patterns a second is the rate the reference sketch runs at and
       it reads as a steady march at any frame rate.

       Tying the phase to the pattern rather than the world also means
       zooming rescales the dashes and their offset together, so the
       pattern no longer jumps when the frustum changes. */
    const CYCLES_PER_SEC = 2.0;
    const DASH = 0.016, GAP = 0.011;   // as a fraction of the frustum
    let line = null, cycles = 0;

    const FACE_AXIS = [0, 0, 1, 1, 2, 2];
    const FACE_SIGN = [1, -1, 1, -1, 1, -1];
    const NORMALS = FACE_AXIS.map((ax, i) => {
      const n = [0, 0, 0];
      n[ax] = FACE_SIGN[i];
      return new THREE.Vector3(n[0], n[1], n[2]);
    });

    function ensure() {
      if (line || typeof THREE === "undefined" || typeof mainScene === "undefined") return line;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position",
        new THREE.Float32BufferAttribute(new Float32Array(12 * 6), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("lineDistance",
        new THREE.Float32BufferAttribute(new Float32Array(12 * 2), 1).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);

      line = new THREE.LineSegments(g, new THREE.LineDashedMaterial({
        color: 0x54c98a, dashSize: 0.1, gapSize: 0.07,
        transparent: true, opacity: 0, depthTest: false,
      }));
      line.frustumCulled = false;   // the geometry is rewritten every frame
      line.renderOrder = 999;
      line.visible = false;
      mainScene.add(line);
      return line;
    }

    /* The twelve edges of a world-space box, each tagged with the two faces
       that meet along it. */
    function edgesOf(b) {
      const lo = [b.min.x, b.min.y, b.min.z];
      const hi = [b.max.x, b.max.y, b.max.z];
      const at = (i, s) => (s === 1 ? hi[i] : lo[i]);
      const out = [];
      for (let a = 0; a < 3; a++) {
        for (let c = a + 1; c < 3; c++) {
          const free = 3 - a - c;
          for (const sa of [1, -1]) for (const sc of [1, -1]) {
            const p0 = [0, 0, 0], p1 = [0, 0, 0];
            p0[a] = p1[a] = at(a, sa);
            p0[c] = p1[c] = at(c, sc);
            p0[free] = lo[free];
            p1[free] = hi[free];
            out.push({
              faceA: a * 2 + (sa === 1 ? 0 : 1),
              faceB: c * 2 + (sc === 1 ? 0 : 1),
              p0: new THREE.Vector3(p0[0], p0[1], p0[2]),
              p1: new THREE.Vector3(p1[0], p1[1], p1[2]),
              length: hi[free] - lo[free],
            });
          }
        }
      }
      return out;
    }

    /* Walk the visible edges end to end and hand back the points in order,
       with how far round the loop each one sits. */
    function loopOf(active) {
      const key = p => p.x.toFixed(4) + "_" + p.y.toFixed(4) + "_" + p.z.toFixed(4);
      const adj = new Map();
      active.forEach((e, i) => {
        const k0 = key(e.p0), k1 = key(e.p1);
        if (!adj.has(k0)) adj.set(k0, []);
        if (!adj.has(k1)) adj.set(k1, []);
        adj.get(k0).push({ i, to: e.p1, toKey: k1, len: e.length });
        adj.get(k1).push({ i, to: e.p0, toKey: k0, len: e.length });
      });

      const seen = new Set();
      const pts = [{ p: active[0].p0, d: 0 }];
      let at = key(active[0].p0), run = 0;

      while (seen.size < active.length) {
        const opts = (adj.get(at) || []).filter(o => !seen.has(o.i));
        if (!opts.length) break;
        const next = opts[0];
        seen.add(next.i);
        run += next.len;
        pts.push({ p: next.to, d: run });
        at = next.toKey;
      }
      return pts;
    }

    /* `amount` is the eased hover envelope; 0 puts the ants away. */
    function update(dt, amount, node) {
      const l = ensure();
      if (!l) return;

      if (!node || amount <= 0.01) { l.visible = false; return; }

      node.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(node);
      if (box.isEmpty()) { l.visible = false; return; }

      /* Stand the ants a hair off the surface so they are not fighting the
         solid's own edges for the same pixels. */
      const size = box.getSize(new THREE.Vector3());
      box.expandByScalar(Math.max(size.x, size.y, size.z) * 0.008);

      /* The camera is orthographic, so one view direction decides which
         faces are front-facing for the whole box. */
      const toEye = new THREE.Vector3();
      mainCam.getWorldDirection(toEye);
      toEye.negate();
      const front = NORMALS.map(n => n.dot(toEye) > 0);

      const active = edgesOf(box).filter(e => front[e.faceA] !== front[e.faceB]);

      /* Dashes hold their size on screen rather than in the world, so
         zooming does not turn them into a solid line or a dotted one. */
      const f = (typeof frustumSize !== "undefined") ? frustumSize : 100;
      const pattern = f * (DASH + GAP);
      l.material.dashSize = f * DASH;
      l.material.gapSize = f * GAP;
      l.material.opacity = amount;
      cycles = (cycles - dt * CYCLES_PER_SEC) % 1e6;
      const phase = cycles * pattern;

      const pos = l.geometry.attributes.position;
      const dist = l.geometry.attributes.lineDistance;
      let n = 0;

      if (active.length) {
        const loop = loopOf(active);
        for (let i = 0; i < loop.length - 1; i++) {
          const a = loop[i], b = loop[i + 1];
          const o = n * 6;
          pos.array[o]     = a.p.x; pos.array[o + 1] = a.p.y; pos.array[o + 2] = a.p.z;
          pos.array[o + 3] = b.p.x; pos.array[o + 4] = b.p.y; pos.array[o + 5] = b.p.z;
          const q = n * 2;
          dist.array[q]     = a.d + phase;
          dist.array[q + 1] = b.d + phase;
          n++;
        }
      }

      l.geometry.setDrawRange(0, n * 2);
      pos.needsUpdate = true;
      dist.needsUpdate = true;
      l.visible = n > 0;
    }

    function off() { if (line) line.visible = false; }

    return { update, off };
  })();

  /* ------------------------------------------------------------------ *
   * The envelope, and the one loop that drives whichever style is on.
   * ------------------------------------------------------------------ */

  let glowKind = null, glowRaf = 0, glowLast = 0;
  const hover = { target: 0, amount: 0 };

  function bodyNode(kind) {
    if (!kind || !window.PartModels || !window.PartModels.bodyOf) return null;
    const p = window.PartModels.bodyOf(kind);
    return (p && p.node) ? p.node : null;
  }

  function glowTick(now) {
    const dt = Math.min((now - glowLast) / 1000, 0.05);
    glowLast = now;

    const rate = hover.target > hover.amount ? EASE_IN : EASE_OUT;
    hover.amount += (hover.target - hover.amount) * Math.min(1, dt * rate);

    const t = now / 1000;
    const dashed = hoverStyle === "outline";
    const tint = dashed ? 0 : hover.amount * (GLOW_MIN + (GLOW_MAX - GLOW_MIN) * pulseFor(hoverStyle, t));

    if (glowKind && window.PartModels && window.PartModels.flashBody) {
      window.PartModels.flashBody(glowKind, tint);
    }
    DashOutline.update(dt, dashed ? hover.amount : 0, dashed ? bodyNode(glowKind) : null);

    /* Settled all the way off — put everything back and stop the loop. */
    if (hover.target === 0 && hover.amount < 0.004) {
      hover.amount = 0;
      if (glowKind && window.PartModels && window.PartModels.flashBody) {
        window.PartModels.flashBody(glowKind, 0);
      }
      DashOutline.off();
      glowKind = null;
      glowRaf = 0;
      if (window.VPBusy) window.VPBusy.release(BUSY_KEY);
      return;
    }
    glowRaf = requestAnimationFrame(glowTick);
  }

  /* Hovering is not input the frame loop counts, so without this the view
     idles down to a few frames a second and the marching ants — or the
     breathing tint — arrive in steps. */
  const BUSY_KEY = "hover";

  function run() {
    if (window.VPBusy) window.VPBusy.hold(BUSY_KEY);
    if (glowRaf) return;
    glowLast = performance.now();
    glowRaf = requestAnimationFrame(glowTick);
  }

  function flashStop() {
    if (!glowKind) return;
    hover.target = 0;
    run();
  }

  function flashStart(kind) {
    if (!window.PartModels || !window.PartModels.flashBody) return;
    if (!window.PartModels.bodyOf || !window.PartModels.bodyOf(kind)) return;

    /* Moved straight from one button to another: drop the old solid back to
       plain before the new one starts, so two can never be lit at once. */
    if (glowKind && glowKind !== kind) {
      window.PartModels.flashBody(glowKind, 0);
      DashOutline.off();
      hover.amount = 0;
    }
    glowKind = kind;
    hover.target = 1;
    run();
  }

  document.addEventListener("pointerover", e => {
    const el = e.target.closest && e.target.closest(TIP_HOSTS);
    if (!el) { if (current) hide(); flashStop(); return; }
    if (el === current) return;
    show(el);
    const kind = el.dataset ? el.dataset.show : null;
    if (kind) flashStart(kind); else flashStop();
  }, true);

  document.addEventListener("pointerout", e => {
    if (!current) return;
    const to = e.relatedTarget;
    if (to && to.closest && to.closest(TIP_HOSTS) === current) return;
    hide();
    flashStop();
  }, true);

  ["pointerdown", "wheel", "blur"].forEach(t =>
    window.addEventListener(t, () => { hide(); flashStop(); }, true));
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", () => { if (current) place(current); });

  /* ------------------------------------------------------------------ *
   * Model / sim status banner, top-center of the viewport.
   * ------------------------------------------------------------------ */

  const COPY = {
    model: {
      main: "You are in <span class=\"vms-mode\">model mode</span> and can select, move, rotate, scale and delete things",
      sub: "Change to sim mode to run and edit the program",
    },
    sim: {
      main: "You are in <span class=\"vms-mode\">sim mode</span> and can only run/edit programs",
      sub: "Change to model mode to move things around",
    },
  };

  const ModeStatus = {
    el: null,
    build() {
      if (this.el) return this.el;
      const vp = document.getElementById("viewport");
      if (!vp) return null;
      const box = document.createElement("div");
      box.id = "vp-mode-status";
      box.innerHTML =
        '<span class="vms-dot"></span>' +
        '<span class="vms-text">' +
          '<span class="vms-main"></span>' +
          '<span class="vms-sub"></span>' +
        "</span>" +
        '<button type="button" id="vp-mode-switch" aria-label="Switch mode">' +
          '<span class="vms-track"><span class="vms-thumb"></span></span>' +
        "</button>";
      vp.appendChild(box);
      box.querySelector("#vp-mode-switch").addEventListener("click", () => {
        if (typeof ViewMode === "undefined") return;
        ViewMode.set(ViewMode.isModel() ? "sim" : "model");
      });
      this.el = box;
      return box;
    },
    paint() {
      const box = this.build();
      if (!box) return;
      const model = (typeof ViewMode !== "undefined") ? ViewMode.isModel() : true;
      const copy = model ? COPY.model : COPY.sim;
      box.classList.toggle("is-sim", !model);
      box.querySelector(".vms-main").innerHTML = copy.main;
      box.querySelector(".vms-sub").textContent = copy.sub;
      const sw = box.querySelector("#vp-mode-switch");
      sw.dataset.tip = model
        ? "Sim mode — hand the view back to playback and watch the program cut"
        : "Model mode — arrange the setup: select, move, rotate, scale, delete";
      layoutStrips();
    },
  };

  window.VPModeStatus = ModeStatus;

  /* ------------------------------------------------------------------ *
   * Setup strip — what is in the scene around the part, plus how the
   * toolpath is colored. Its own group, beside the show/hide strip.
   * ------------------------------------------------------------------ */

  const SetupBar = {
    el: null,
    build() {
      if (this.el) return this.el;
      const dock = document.getElementById("vp-dock");
      const show = document.getElementById("vp-show");
      if (!dock || !show) return null;
      const box = document.createElement("div");
      box.id = "vp-setup";
      /* The four solids that make up a setup, two by two. */
      box.innerHTML =
        '<button type="button" data-show="stock" ' +
          'data-tip="Blank — show or hide the billet">' +
          '<i class="fa-solid fa-cube"></i></button>' +
        '<button type="button" data-show="vise" ' +
          'data-tip="Vise — show or hide the vise and its jaws">' +
          '<i class="fa-solid fa-compress"></i></button>' +
        '<button type="button" data-show="pars" ' +
          'data-tip="Parallels — show or hide the pair of bars the work stands on">' +
          '<i class="fa-solid fa-grip-lines"></i></button>' +
        '<button type="button" data-show="table" ' +
          'data-tip="Machine table — show or hide the VF-1 table under the vise">' +
          '<i class="fa-solid fa-table-cells"></i></button>';

      /* Below the coolant lamps, above the camera pair and the show/hide
         grid under it. */
      dock.insertBefore(box, document.getElementById("vp-cam") || show);

      this.el = box;
      return box;
    },
    paint() {
      this.build();
      layoutStrips();
    },
  };

  window.VPSetupBar = SetupBar;

  /* The dock stacks itself. What needs measuring is the transform group, which
     sits clear of the dock's right edge, and the mode banner, which rides on
     top of the playback card — a card that is a different height in each mode,
     and gone altogether in model mode. */
  function layoutStrips() {
    const vp = document.getElementById("viewport");
    if (!vp) return;
    const v = vp.getBoundingClientRect();

    const dock = document.getElementById("vp-dock");
    const gz = document.getElementById("vp-gizmo");
    if (dock && gz) {
      gz.style.left = (dock.getBoundingClientRect().right - v.left + 6) + "px";
    }

    const status = document.getElementById("vp-mode-status");
    const bar = document.getElementById("transport-bar");
    let statusBottom = 16;
    if (status) {
      const showing = bar && bar.style.display !== "none" && bar.offsetParent !== null;
      statusBottom = showing ? bar.getBoundingClientRect().height + 24 : 16;
      status.style.bottom = statusBottom + "px";
    }

    /* Undo / redo rides directly on top of the mode banner. */
    const hist = document.getElementById("vp-history");
    if (hist && !hist.hidden && status) {
      hist.style.bottom = (statusBottom + status.getBoundingClientRect().height + 8) + "px";
    }

    layoutTopCenter(v);
    layoutHuds(v);
  }

  /* ------------------------------------------------------------------ *
   * Top-center message stack.
   *
   * Three things want the middle of the top edge: the M00/M01 stop lamp,
   * the program-complete banner, and the toast. They were all given the
   * same `top`, so any two on screen at once landed on top of each other —
   * "Vise ON" printed straight through "PROGRAM COMPLETE".
   *
   * They are now one stack. Each one that is actually on screen is measured
   * and the next is placed below it, in a fixed order: the two that persist
   * hold the top so they never shuffle, and the toast — which comes and goes
   * every few seconds — takes whatever row is left. Anything hidden is parked
   * at the top of the stack so it opens in the right place.
   * ------------------------------------------------------------------ */

  const TOP_STACK = ["stop-hud", "program-complete-banner", "toast"];
  const STACK_GAP = 8;

  function onScreen(el) {
    if (!el || el.hidden || el.offsetParent === null) return false;
    if (getComputedStyle(el).display === "none") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function layoutTopCenter(v) {
    const stock = document.getElementById("vp-stock");
    let top = 14;
    if (stock && !stock.hidden && stock.offsetParent !== null) {
      top = stock.getBoundingClientRect().bottom - v.top + 10;
    }

    TOP_STACK.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.top = top + "px";
      if (onScreen(el)) top += el.getBoundingClientRect().height + STACK_GAP;
    });
  }

  /* The two machine-state HUDs are summoned by a switch, so they are the ones
     that have to give way. Each is pushed up the viewport until it clears
     every panel that was already on screen — the dock, the playback card, the
     mode banner, the mouse hints, the frame counter. */
  const HUD_OBSTACLES = [
    "vp-dock", "vp-setup", "vp-gizmo", "vp-stock", "vp-history",
    "transport-bar", "vp-mode-status", "mouse-hints", "fps-hud", "cube-wrap",
  ];

  function layoutHuds(v) {
    const GAP = 10;
    const rectOf = el => {
      if (!el || el.hidden || el.offsetParent === null) return null;
      const r = el.getBoundingClientRect();
      return (r.width && r.height) ? r : null;
    };

    const blockers = HUD_OBSTACLES
      .map(id => rectOf(document.getElementById(id)))
      .filter(Boolean);

    ["xyz-hud", "machine-hud"].forEach(id => {
      const hud = document.getElementById(id);
      if (!hud || hud.offsetParent === null) return;

      hud.style.bottom = "16px";
      let bottom = 16;

      /* Ten passes is plenty — each one lifts the HUD over the lowest thing
         it is still sitting on, and there are only a handful of panels. */
      for (let pass = 0; pass < 10; pass++) {
        const r = hud.getBoundingClientRect();
        let lifted = false;
        for (const b of blockers) {
          const clear = r.bottom <= b.top || r.top >= b.bottom
                     || r.right <= b.left || r.left >= b.right;
          if (clear) continue;
          bottom = Math.max(bottom, v.bottom - b.top + GAP);
          hud.style.bottom = bottom + "px";
          lifted = true;
          break;
        }
        if (!lifted) break;
      }
    });
  }
  window.addEventListener("resize", layoutStrips);
  window.VPLayout = layoutStrips;

  /* ------------------------------------------------------------------ *
   * Position / Rotate / Scale, sitting beside the show-hide strip.
   * Model mode only — in sim mode there is nothing to transform.
   * ------------------------------------------------------------------ */

  const GIZMOS = [
    { key: "move", icon: "fa-up-down-left-right",
      tip: "Position — three arrows on the selection, one per axis. Drag one to slide it." },
    { key: "rotate", icon: "fa-rotate",
      tip: "Rotate — three rings on the selection. Drag one to swing it about its base point." },
    { key: "scale", icon: "fa-maximize",
      tip: "Scale — three boxes on the selection. Drag one to grow or shrink it about its base point." },
  ];

  const GizmoBar = {
    el: null,
    build() {
      if (this.el) return this.el;
      const vp = document.getElementById("viewport");
      const strip = document.getElementById("vp-show");
      if (!vp || !strip) return null;
      const box = document.createElement("div");
      box.id = "vp-gizmo";
      box.innerHTML = GIZMOS.map(g =>
        `<button type="button" data-gzmode="${g.key}" data-tip="${g.tip}">
           <i class="fa-solid ${g.icon}"></i>
         </button>`).join("");
      vp.appendChild(box);
      box.addEventListener("click", e => {
        const b = e.target.closest("[data-gzmode]");
        if (!b || b.disabled) return;
        if (window.PartModels && window.PartModels.setGizmoMode) {
          window.PartModels.setGizmoMode(b.dataset.gzmode);
        }
        this.paint();
      });
      this.el = box;
      return box;
    },
    paint() {
      const box = this.build();
      if (!box) return;
      const model = (typeof ViewMode !== "undefined") ? ViewMode.isModel() : false;
      box.hidden = !model;
      if (!model) return;

      const st = (window.PartModels && window.PartModels.gizmoState)
        ? window.PartModels.gizmoState() : { mode: "move", active: false };
      box.classList.toggle("is-idle", !st.active);
      box.querySelectorAll("[data-gzmode]").forEach(b => {
        b.classList.toggle("on", st.active && b.dataset.gzmode === st.mode);
        b.disabled = !st.active;
      });

      layoutStrips();
    },
  };

  window.VPGizmoBar = GizmoBar;

  /* ------------------------------------------------------------------ *
   * Undo / redo, model mode only, sitting on the mode banner.
   * ------------------------------------------------------------------ */

  const HistoryBar = {
    el: null,
    build() {
      if (this.el) return this.el;
      const vp = document.getElementById("viewport");
      if (!vp) return null;
      const box = document.createElement("div");
      box.id = "vp-history";
      box.innerHTML =
        '<button type="button" data-hist="undo" data-tip="Undo — put the last move, rotation or origin change back">' +
          '<i class="fa-solid fa-rotate-left"></i><span>Undo</span></button>' +
        '<button type="button" data-hist="redo" data-tip="Redo — do that change again">' +
          '<i class="fa-solid fa-rotate-right"></i><span>Redo</span></button>';
      vp.appendChild(box);
      box.addEventListener("click", e => {
        const b = e.target.closest("[data-hist]");
        if (!b || b.disabled) return;
        const src = document.getElementById(b.dataset.hist === "undo" ? "pm-undo" : "pm-redo");
        if (src) src.click();
        this.paint();
      });
      this.el = box;
      return box;
    },
    paint() {
      const box = this.build();
      if (!box) return;
      const model = (typeof ViewMode !== "undefined") ? ViewMode.isModel() : false;
      box.hidden = !model;
      if (!model) return;
      [["undo", "pm-undo"], ["redo", "pm-redo"]].forEach(([k, id]) => {
        const src = document.getElementById(id);
        const b = box.querySelector('[data-hist="' + k + '"]');
        if (b) b.disabled = !src || src.disabled;
      });
      layoutStrips();
    },
  };

  window.VPHistoryBar = HistoryBar;

  /* ------------------------------------------------------------------ *
   * Stock setting bar — only while the billet is the selection.
   * ------------------------------------------------------------------ */

  const StockBar = {
    el: null,
    build() {
      if (this.el) return this.el;
      const vp = document.getElementById("viewport");
      if (!vp) return null;
      const box = document.createElement("div");
      box.id = "vp-stock";
      box.innerHTML =
        '<button type="button" id="vp-stock-auto" ' +
          'data-tip="Auto align — re-cut the parallels to the jaws, bank them on both faces, ' +
          'close the jaws on the blank and stand it on the bars">' +
          '<i class="fa-solid fa-wand-magic-sparkles"></i>Auto align to vise and parallels</button>' +
        '<span class="vp-stock-sep"></span>' +
        '<span class="vp-stock-set">' +
          '<button type="button" data-stockside="left" data-tip="Left — push the blank to the left-hand end of the jaws">Left</button>' +
          '<button type="button" data-stockside="center" data-tip="Center — center the blank along the jaws">Center</button>' +
          '<button type="button" data-stockside="right" data-tip="Right — push the blank to the right-hand end of the jaws">Right</button>' +
        "</span>";
      vp.appendChild(box);

      box.querySelector("#vp-stock-auto").addEventListener("click", () => {
        const fx = window.PartModels && window.PartModels.fixture;
        if (fx && fx.autoParallels) fx.autoParallels(false);
      });
      box.addEventListener("click", e => {
        const b = e.target.closest("[data-stockside]");
        if (!b) return;
        const fx = window.PartModels && window.PartModels.fixture;
        if (fx && fx.slide) fx.slide(b.dataset.stockside);
        this.paint();
      });
      this.el = box;
      return box;
    },
    paint() {
      const box = this.build();
      if (!box) return;
      const sel = window.PartModels && window.PartModels.current
        ? window.PartModels.current() : null;
      const isStock = !!(sel && sel.stock);
      const model = (typeof ViewMode !== "undefined") ? ViewMode.isModel() : false;
      box.hidden = !(model && isStock);
      if (box.hidden) return;

      const fx = window.PartModels && window.PartModels.fixture;
      const where = fx && fx.state ? fx.state().slide : null;
      box.querySelectorAll("[data-stockside]").forEach(b =>
        b.classList.toggle("on", b.dataset.stockside === where));
    },
  };

  window.VPStockBar = StockBar;

  function boot() {
    if (window.AppPrefs) hoverStyle = window.AppPrefs.get("hoverStyle", "breathe");
    claimTitles();
    watchTitles();
    ModeStatus.paint();
    SetupBar.paint();
    GizmoBar.paint();
    HistoryBar.paint();
    StockBar.paint();
    if (typeof syncViewToggles === "function") syncViewToggles();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
