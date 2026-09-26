/* guide.js — "Guide Me Through It".
 *
 * Four steps, in the order the job actually happens: the metal, the code, the
 * cutters, and then everything together in one picture. Each step is a
 * collapsible category, each has its own smaller questions inside it, and
 * anything you have actually touched gets a tick.
 *
 * Almost nothing here is new behavior. The existing controls are physically
 * moved into the new shell — which keeps every listener already bound to
 * them — or forwarded to by a button that says what will happen in words. The
 * pieces that genuinely had nowhere to live before are the stock-above-the-
 * jaws panel (shared with the Fixture sidebar, see jaw-clearance.js), the
 * plain-English tool describer, the offsets editor and the before/after with
 * its collision warnings.
 */

(function () {
  "use strict";

  const section = document.getElementById("mkp-section");
  if (!section) return;
  const body = section.querySelector(".sec-body");
  if (!body) return;

  const $ = sel => { try { return document.querySelector(sel); } catch (e) { return null; } };
  const IN = 25.4;

  const inches = () => (typeof unitMode === "undefined") || unitMode === "inch";
  const uLab = () => (inches() ? "in" : "mm");
  const fmt = (v, d) => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(d != null ? d : (inches() ? 3 : 2));

  const click = sel => { const el = $(sel); if (el) el.click(); return !!el; };

  /* ------------------------------------------------------------------ *
   * The shape of the walkthrough.
   *
   * `src` names an existing .mkp-step by its own title; that whole block is
   * moved in under the new heading, listeners and all. `subs` are the smaller
   * questions inside a step — each one its own collapsible category with its
   * own tick.
   * ------------------------------------------------------------------ */

  const STEPS = [
    {
      key: "stock",
      n: 1,
      q: "Let's set up your stock",
      hint: "The lump of metal itself — what it is made of, what shape it is and how big.",
      src: "Stock",
      subs: [
        {
          key: "origin",
          q: "Where is your origin?",
          hint: "The one point the whole program measures from — the machine's X0 Y0 Z0.",
          build: buildOrigin,
          /* The viewer gets a button of its own for this one. */
          viewer: { label: "I'm done!", tip: "Stop picking and keep the zero where it is." },
        },
        {
          key: "place",
          q: "Is stock good here?",
          hint: "Which end of the jaws the metal is pushed up against.",
          build: buildPlace,
          viewer: { label: "Here is good!", tip: "Keep the blank where it is now." },
        },
        {
          key: "pars",
          q: "What about the parallels below?",
          hint: "The two bars the metal stands on, and what is holding the lot.",
          build: buildHolding,
          src: "Workholding",
        },
        {
          key: "proud",
          q: "How much stock should be over the top of both jaws?",
          hint: "Stand it proud by at least the depth of your deepest cut.",
          build: buildProud,
        },
      ],
    },
    {
      key: "code",
      n: 2,
      q: "Time for the code.",
      hint: "The program the machine will run.",
      notice: "We're doing the code before the tools because the tools and " +
              "offsets will auto appear as they are detected in the program. " +
              "You'll add the rest yourself in the next two steps — so if " +
              "anything is missing, edit your program and put the tools and " +
              "offsets it needs into it.",
      build: buildCode,
      src: "Your program",
    },
    {
      key: "tools",
      n: 3,
      q: "Now for your tools",
      hint: "Say what is in the carousel in plain words and the guide will build it.",
      build: buildTools,
      subs: [
        {
          key: "toolsread",
          q: "Okay, so here's what you're working with…",
          hint: "Everything you have described, read back in plain English.",
          build: buildToolsRead,
        },
      ],
    },
    {
      key: "picture",
      n: 4,
      q: "Putting everything in picture",
      hint: "Offsets, and the blank before and after the program has run.",
      build: buildOffsets,
      subs: [
        {
          key: "beforeafter",
          q: "Before and after of the program",
          hint: "What arrives in the vise, and what comes out of it.",
          build: buildBeforeAfter,
        },
      ],
    },
  ];

  /* Flat list of every collapsible category, steps and sub-questions alike —
     the ticks, the warning on the way out and the sniffer all walk this. */
  const ALL = [];
  STEPS.forEach(s => {
    ALL.push({ key: s.key, q: s.q, step: true });
    (s.subs || []).forEach(x => ALL.push({ key: x.key, q: x.q, step: false, parent: s.key }));
  });

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  const touched = {};       // the user has actually changed something here
  let host = null, attic = null, footer = null;
  let mode = "one";
  let openStep = 0;
  const openSub = {};       // step key -> index of the open sub, or -1

  const stepEls = () => Array.from(host.querySelectorAll(".gd-step"));
  const subEls = stepKey =>
    Array.from(host.querySelectorAll('.gd-step[data-key="' + stepKey + '"] .gd-sub'));

  /* While the shell is being put together the guide presses a few of the
     controls itself — the custom-blank switch, for one. Those are not the
     user answering a question, so they must not earn a tick. */
  let booting = true;

  function mark(key) {
    if (booting || touched[key]) return;
    touched[key] = true;
    paintTicks();
  }

  /* ------------------------------------------------------------------ *
   * Step 1 · where zero is
   * ------------------------------------------------------------------ */

  const roundOrigin = { kind: "near", angle: 0 };

  function stockPart() {
    try { return window.PartModels && window.PartModels.bodyOf("stock"); }
    catch (e) { return null; }
  }
  const stockIsRound = () => {
    const p = stockPart();
    return !!(p && p.stock && p.stock.shape === "cyl");
  };

  function buildOrigin() {
    const wrap = document.createElement("div");
    wrap.className = "gd-origin";
    wrap.innerHTML = `
      <div class="gd-note">
        Pick what kind of point you want zero on, press <b>Set origin</b>, then
        click that point in the view. Nothing moves — the program comes to the
        point you picked. Press <b>I'm done!</b> in the viewer when it is where
        you want it.
      </div>

      <div class="gd-block" data-gdshape="block">
        <div class="gd-label">Set the origin by</div>
        <div class="gd-grid gd-originmodes">
          <button type="button" data-gdorigin="vertex">By corner</button>
          <button type="button" data-gdorigin="edgemid">By edge center</button>
          <button type="button" data-gdorigin="face">By face center</button>
        </div>
      </div>

      <div class="gd-block" data-gdshape="round" hidden>
        <div class="gd-label">Set the origin by</div>
        <div class="gd-grid gd-roundmodes">
          <button type="button" data-gdround="near" class="on">Nearest point</button>
          <button type="button" data-gdround="center">Radial center</button>
          <button type="button" data-gdround="mid">Radius midpoint</button>
          <button type="button" data-gdround="edge">Point on the circumference</button>
        </div>
        <div class="gd-label">Snapped to</div>
        <div class="gd-grid gd-roundangle">
          <button type="button" data-gdangle="0" class="on">0°</button>
          <button type="button" data-gdangle="45">45°</button>
          <button type="button" data-gdangle="90">90°</button>
          <button type="button" data-gdangle="135">135°</button>
          <button type="button" data-gdangle="180">180°</button>
          <button type="button" data-gdangle="225">225°</button>
          <button type="button" data-gdangle="270">270°</button>
          <button type="button" data-gdangle="315">315°</button>
        </div>
        <div class="gd-note gd-roundnote"></div>
      </div>

      <button type="button" class="gd-wide gd-setorigin">Set origin</button>
      <div class="gd-out gd-originout">—</div>`;

    /* A block already has a picker that does exactly this, so forward to it. */
    wrap.querySelector(".gd-originmodes").addEventListener("click", e => {
      const b = e.target.closest("[data-gdorigin]");
      if (!b) return;
      click('#mkp-origin-modes [data-mkporigin="' + b.dataset.gdorigin + '"]');
      paintOrigin();
    });

    wrap.querySelector(".gd-roundmodes").addEventListener("click", e => {
      const b = e.target.closest("[data-gdround]");
      if (!b) return;
      roundOrigin.kind = b.dataset.gdround;
      paintOrigin();
    });

    /* The angle buttons are a shortcut rather than a filter: press one and
       zero goes straight to that point, no clicking in the view needed. */
    wrap.querySelector(".gd-roundangle").addEventListener("click", e => {
      const b = e.target.closest("[data-gdangle]");
      if (!b) return;
      roundOrigin.angle = +b.dataset.gdangle;
      if (roundOrigin.kind === "near") roundOrigin.kind = "edge";
      applyRoundOrigin(featureAt(roundOrigin.kind, roundOrigin.angle));
      paintOrigin();
    });

    wrap.querySelector(".gd-setorigin").addEventListener("click", () => {
      mark("origin");
      if (stockIsRound()) RoundPick.arm(!RoundPick.armed());
      else click("#mkp-set-origin");
      paintOrigin();
    });

    return wrap;
  }

  /* ------------------------------------------------------------------ *
   * Picking a point on a round bar.
   *
   * A round blank is drawn as a raymarched proxy, so the ordinary snapper —
   * which reads triangles — can only ever offer the corners of the box the
   * bar is solved inside. None of those are on the bar. Rather than pretend,
   * this works the three features a turner actually asks for straight off the
   * bar's own size: the axis, half way out the radius, and the circumference,
   * the last two snapped to the eight 45° marks round the clock.
   * ------------------------------------------------------------------ */

  const ANGLE_SNAP = 45;

  /* A feature in the blank's own local coordinates. */
  function featureAt(kind, angleDeg) {
    const p = stockPart();
    if (!p || !p.stock || typeof THREE === "undefined") return null;
    const r = p.stock.dia / 2, halfLen = p.stock.len / 2;
    const a = (angleDeg || 0) * Math.PI / 180;
    const reach = kind === "center" ? 0 : kind === "mid" ? r / 2 : r;
    return {
      kind, angle: ((angleDeg || 0) % 360 + 360) % 360,
      local: new THREE.Vector3(reach * Math.cos(a), reach * Math.sin(a), halfLen),
    };
  }

  function featureNote(f) {
    if (!f) return "";
    if (f.kind === "center") return "center of the round top face";
    if (f.kind === "mid") return "halfway out the radius at " + f.angle + "°, on the top face";
    return "on the circumference at " + f.angle + "°, on the top face";
  }

  const RoundPick = (() => {
    let on = false, marker = null, hover = null;

    function ensureMarker() {
      if (marker) return marker;
      try { if (typeof THREE === "undefined" || !mainScene) return null; }
      catch (e) { return null; }
      marker = new THREE.Group();
      marker.add(new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xe8c547, depthTest: false,
                                      transparent: true, opacity: 0.95 })));
      marker.renderOrder = 1100;
      marker.visible = false;
      mainScene.add(marker);
      return marker;
    }

    /* Where the cursor lands on the plane of the bar's top face. */
    function planePoint(ev) {
      const p = stockPart();
      if (!p || !p.stock || typeof mainCanvas === "undefined") return null;
      p.node.updateMatrixWorld(true);

      const halfLen = p.stock.len / 2;
      const rect = mainCanvas.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera({
        x:  ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      }, mainCam);

      /* The top face in world terms: a point on it and its normal. */
      const o = p.inner.localToWorld(new THREE.Vector3(0, 0, halfLen));
      const n = p.inner.localToWorld(new THREE.Vector3(0, 0, halfLen + 1)).sub(o).normalize();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, o);
      const at = ray.ray.intersectPlane(plane, new THREE.Vector3());
      if (!at) return null;
      return p.inner.worldToLocal(at.clone());
    }

    /* Which of the three features the cursor is asking for. */
    function featureFor(ev) {
      const p = stockPart();
      const at = planePoint(ev);
      if (!p || !at) return null;
      const r = p.stock.dia / 2;
      const rr = Math.hypot(at.x, at.y);
      let deg = Math.atan2(at.y, at.x) * 180 / Math.PI;
      deg = Math.round(deg / ANGLE_SNAP) * ANGLE_SNAP;

      let kind = roundOrigin.kind;
      if (kind === "near") {
        /* Whichever of the three the cursor is nearest, measured out from
           the axis: the middle third belongs to the radius midpoint. */
        const dCenter = rr;
        const dMid = Math.abs(rr - r / 2);
        const dEdge = Math.abs(rr - r);
        kind = (dCenter <= dMid && dCenter <= dEdge) ? "center"
             : (dMid <= dEdge) ? "mid" : "edge";
      }
      return featureAt(kind, kind === "center" ? roundOrigin.angle : deg);
    }

    function paint(f) {
      const m = ensureMarker();
      if (!m) return;
      hover = f;
      m.visible = !!f;
      if (!f) return;
      const p = stockPart();
      p.node.updateMatrixWorld(true);
      m.position.copy(p.inner.localToWorld(f.local.clone()));
      const s = (typeof frustumSize !== "undefined" ? frustumSize : 120) / 150;
      m.scale.setScalar(Math.max(s, 1e-3));
    }

    function move(ev) {
      if (!on) return;
      try { paint(featureFor(ev)); } catch (e) {   }
    }

    function down(ev) {
      if (!on || ev.button !== 0) return;
      if (typeof mainCanvas !== "undefined" && ev.target !== mainCanvas) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const f = featureFor(ev) || hover;
      if (!f) return;
      roundOrigin.kind = f.kind === "center" ? "center" : roundOrigin.kind;
      roundOrigin.angle = f.angle;
      applyRoundOrigin(f);
      if (!ev.shiftKey) arm(false);
      paintOrigin();
    }

    function arm(want) {
      on = !!want && stockIsRound();
      /* The two pickers must never be live together. */
      if (on) { try { Snap.arm(false); } catch (e) {   } }
      const vp = document.getElementById("viewport");
      if (vp) vp.classList.toggle("pm-picking", on);
      try { paint(on ? hover : null); }
      catch (e) { console.warn("[Guide] round pick:", e); }
      return on;
    }

    const vp = document.getElementById("viewport");
    if (vp) {
      vp.addEventListener("mousemove", move, false);
      vp.addEventListener("mousedown", down, true);
    }
    window.addEventListener("keydown", e => {
      if (e.key === "Escape" && on) arm(false);
    });

    return { arm, armed: () => on, get hover() { return hover; } };
  })();

  /* Put the work zero on a feature of a round bar. Same bookkeeping the
     ordinary picker does: the origin moves, the metal does not. */
  function applyRoundOrigin(f) {
    const p = stockPart();
    if (!p || !p.stock || !f || typeof THREE === "undefined") return;

    const rot = new THREE.Euler(p.rot.x * Math.PI / 180, p.rot.y * Math.PI / 180,
                                p.rot.z * Math.PI / 180, "XYZ");
    const shift = f.local.clone().sub(p.base).applyEuler(rot);
    p.pos.add(shift);
    p.base.copy(f.local);
    p.zero.copy(f.local);
    p.baseNote = p.zeroNote = featureNote(f);

    try {
      window.PartModels.apply(p);
      if (MakeProgram && MakeProgram.paintOrigin) MakeProgram.paintOrigin();
      if (Panel && Panel.refresh) Panel.refresh();
    } catch (e) { console.warn("[Guide] round origin:", e); }

    mark("origin");
    if (typeof showToast === "function") {
      showToast("Work zero set",
        "Zero is now on the " + featureNote(f) + ". Nothing moved — the program came to it.");
    }
  }

  /* ------------------------------------------------------------------ *
   * The blinking marker on the work zero.
   *
   * While the origin question is open there is a yellow dot pulsing on
   * wherever zero currently is, so the answer to "where is my origin" is on
   * screen rather than in a sentence.
   * ------------------------------------------------------------------ */

  const OriginDot = (() => {
    let dot = null, raf = 0, want = false;
    const BUSY_KEY = "guide-origin-dot";

    function ensure() {
      if (dot) return dot;
      try { if (typeof THREE === "undefined" || !stageGroup) return null; }
      catch (e) { return null; }
      dot = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false,
                                      transparent: true, opacity: 1 }));
      dot.renderOrder = 1200;
      dot.visible = false;
      stageGroup.add(dot);
      return dot;
    }

    function tick(now) {
      raf = 0;
      const d = ensure();
      if (!d) return;
      let at = null;
      try { at = window.PartModels && window.PartModels.workOrigin(); } catch (e) { at = null; }
      if (!want || !at) {
        d.visible = false;
        if (window.VPBusy) window.VPBusy.release(BUSY_KEY);
        return;
      }
      d.visible = true;
      d.position.copy(at);
      const puls = 0.5 + 0.5 * Math.sin(now / 240);
      const s = (typeof frustumSize !== "undefined" ? frustumSize : 120) / 190;
      d.scale.setScalar(Math.max(s * (0.78 + 0.34 * puls), 1e-3));
      d.material.opacity = 0.35 + 0.65 * puls;
      raf = requestAnimationFrame(tick);
    }

    function show(on) {
      if (want === !!on) return;
      want = !!on;
      if (want) {
        if (window.VPBusy) window.VPBusy.hold(BUSY_KEY);
        if (!raf) raf = requestAnimationFrame(tick);
      } else if (!raf) {
        tick(performance.now());
      }
    }
    return { show };
  })();

  function paintOrigin() {
    if (!host) return;
    const wrap = host.querySelector(".gd-origin");
    if (!wrap) return;
    const round = stockIsRound();
    wrap.querySelector('[data-gdshape="block"]').hidden = round;
    wrap.querySelector('[data-gdshape="round"]').hidden = !round;

    wrap.querySelectorAll("[data-gdorigin]").forEach(b => {
      const src = $('#mkp-origin-modes [data-mkporigin="' + b.dataset.gdorigin + '"]');
      b.classList.toggle("on", !!(src && src.classList.contains("on")));
    });
    wrap.querySelectorAll("[data-gdround]").forEach(b =>
      b.classList.toggle("on", b.dataset.gdround === roundOrigin.kind));
    wrap.querySelectorAll("[data-gdangle]").forEach(b =>
      b.classList.toggle("on", +b.dataset.gdangle === roundOrigin.angle));

    const note = wrap.querySelector(".gd-roundnote");
    if (note) {
      note.textContent = roundOrigin.kind === "near"
        ? "Hover over the end of the bar and the dot follows the nearest of the three points. Click to keep it."
        : "Click the end of the bar and zero lands on the " +
          featureNote(featureAt(roundOrigin.kind, roundOrigin.angle)) + ".";
    }

    const armed = RoundPick.armed() || (() => {
      try { return Snap.isArmed() && Snap.purpose === "origin"; } catch (e) { return false; }
    })();
    const set = wrap.querySelector(".gd-setorigin");
    if (set) {
      set.textContent = armed ? "Stop picking" : "Set origin";
      set.classList.toggle("on", armed);
    }

    const out = wrap.querySelector(".gd-originout");
    const p = stockPart();
    if (out) {
      out.textContent = p && p.zeroNote
        ? "Zero is on the " + p.zeroNote + "."
        : "Zero has not been set yet.";
    }

    /* The pulsing dot belongs to this question and nothing else. */
    const open = !!wrap.closest(".gd-sub.is-open");
    OriginDot.show(open && section.offsetParent !== null);
    if (!open && RoundPick.armed()) RoundPick.arm(false);
  }

  /* ------------------------------------------------------------------ *
   * Step 1 · where along the jaws it sits
   * ------------------------------------------------------------------ */

  function buildPlace() {
    const wrap = document.createElement("div");
    wrap.className = "gd-place";
    wrap.innerHTML = `
      <div class="gd-note">
        Flush with that end of the parallels, standing on top of them, jaws
        closed on the blank's own width. Press <b>Here is good!</b> in the
        viewer when you are happy with it.
      </div>
      <div class="gd-label">Set position</div>
      <div class="pm-mini gd-slide">
        <button type="button" data-gdslide="left">Left</button>
        <button type="button" data-gdslide="center">Center</button>
        <button type="button" data-gdslide="right">Right</button>
      </div>
      <div class="gd-out gd-placeout">—</div>`;

    wrap.querySelector(".gd-slide").addEventListener("click", e => {
      const b = e.target.closest("[data-gdslide]");
      if (!b) return;
      mark("place");
      click('#mkp-slide [data-mkpslide="' + b.dataset.gdslide + '"]');
      paintPlace();
    });
    return wrap;
  }

  function paintPlace() {
    if (!host) return;
    const wrap = host.querySelector(".gd-place");
    if (!wrap) return;
    let where = null;
    wrap.querySelectorAll("[data-gdslide]").forEach(b => {
      const src = $('#mkp-slide [data-mkpslide="' + b.dataset.gdslide + '"]');
      const on = !!(src && src.classList.contains("on"));
      b.classList.toggle("on", on);
      if (on) where = b.dataset.gdslide;
    });
    const out = wrap.querySelector(".gd-placeout");
    if (out) {
      out.textContent = !where ? "Not set on the jaws yet."
        : where === "center" ? "Centered along the jaws."
        : "Hard up against the " + where + "-hand end of the jaws.";
    }
  }

  /* ------------------------------------------------------------------ *
   * Step 1 · what is holding it, and what you can see of it
   * ------------------------------------------------------------------ */

  const VIS_PARTS = [
    ["vise", "Vise"],
    ["pars", "Parallels"],
    ["table", "Machine table"],
  ];

  function buildHolding() {
    const wrap = document.createElement("div");
    wrap.className = "gd-holding";
    wrap.innerHTML =
      '<div class="gd-label">What can you see?</div>' +
      '<div class="gd-grid gd-vis">' +
        VIS_PARTS.map(([k, n]) =>
          '<button type="button" data-gdshow="' + k + '">' +
            '<span class="gd-vis-n">' + n + '</span>' +
            '<span class="gd-vis-s"></span>' +
          "</button>").join("") +
      "</div>" +
      '<div class="gd-note">' +
        "Hiding one of these only takes it off the screen. It is still there, " +
        "the jaws still grip, and the cutter can still run into it." +
      "</div>";

    wrap.addEventListener("click", e => {
      const b = e.target.closest("[data-gdshow]");
      if (!b || b.disabled) return;
      const kind = b.dataset.gdshow;
      try {
        if (typeof setBodyVisible === "function") {
          setBodyVisible(kind, !window.PartModels.bodyVisible(kind));
        }
      } catch (err) { console.warn("[Guide] visibility:", err); }
      mark("pars");
      paintHolding();
    });
    return wrap;
  }

  function paintHolding() {
    if (!host) return;
    const wrap = host.querySelector(".gd-holding");
    if (!wrap) return;
    wrap.querySelectorAll("[data-gdshow]").forEach(b => {
      const kind = b.dataset.gdshow;
      let there = false, on = false;
      try {
        there = !!(window.PartModels && window.PartModels.bodyOf(kind));
        on = there && window.PartModels.bodyVisible(kind);
      } catch (e) {   }
      b.disabled = !there;
      b.classList.toggle("on", on);
      const s = b.querySelector(".gd-vis-s");
      if (s) s.textContent = !there ? "Not in the scene" : on ? "Shown" : "Hidden";
    });
  }

  /* ------------------------------------------------------------------ *
   * Step 1 · how far it stands above the jaws
   * ------------------------------------------------------------------ */

  function buildProud() {
    const wrap = document.createElement("div");
    wrap.className = "gd-proud";
    if (window.JawClear) {
      const inst = window.JawClear.mount(wrap);
      if (inst) inst.onChange = dirty => { if (dirty) mark("proud"); };
    } else {
      wrap.innerHTML = '<div class="gd-note">The clearance panel could not load.</div>';
    }
    return wrap;
  }

  /* ------------------------------------------------------------------ *
   * Step 2 · the code
   * ------------------------------------------------------------------ */

  function buildCode() {
    const wrap = document.createElement("div");
    wrap.className = "gd-code";
    wrap.innerHTML = `
      <div class="gd-label">You can drag and drop your program, or upload one</div>
      <button type="button" class="gd-wide gd-tocode">
        Take me to the code box
        <em>It's the panel under the 3D view. Type or paste straight into it.</em>
      </button>`;
    wrap.querySelector(".gd-tocode").addEventListener("click", () => {
      const ed = document.getElementById("gcode-input");
      if (!ed) return;
      mark("code");
      ed.scrollIntoView({ block: "nearest", behavior: "smooth" });
      ed.focus();
    });
    return wrap;
  }

  /* ------------------------------------------------------------------ *
   * Step 3 · describing the tools in plain words
   * ------------------------------------------------------------------ */

  /* Longest / most specific first: "spot drill" has to be caught before
     "drill", and "thread mill" before "mill". */
  const KINDS = [
    /* Before everything: "probe" has to win over the "mill"/"cutter" catch-all
       at the bottom, and a probe is the one entry here that cuts nothing. */
    { re: /\b(?:touch|spindle|renishaw)?\s*probes?\b|\bprobing\b/i,
      cat: "probe", shape: "probe", name: "touch probe",
      /* Half an inch is a sane guess for a cutter and a nonsense one for a
         ruby ball, so a probe brings its own: 6 mm, the size nearly every
         spindle probe ships with. */
      dia: 6 / 25.4 },
    { re: /\bspot(?:ting)?\s*drills?\b|\bcent(?:er|re)\s*drills?\b/i,
      cat: "spotdrill", shape: "drill", name: "spot drill" },
    { re: /\bcountersinks?\b/i, cat: "countersink", shape: "chamfer", name: "countersink" },
    { re: /\bcounterbores?\b/i, cat: "counterbore", shape: "flat", name: "counterbore" },
    { re: /\bream(?:er|ers)?\b/i, cat: "reamer", shape: "flat", name: "reamer" },
    { re: /\bthread\s*mills?\b/i, cat: "threadmill", shape: "flat", name: "thread mill" },
    { re: /\btaps?\b|\btapping\b/i, cat: "tap", shape: "tap", name: "tap" },
    { re: /\bt[-\s]?slot\b/i, cat: "tslot", shape: "flat", name: "T-slot cutter" },
    { re: /\bwoodruff\b/i, cat: "woodruff", shape: "flat", name: "woodruff cutter" },
    { re: /\bdovetails?\b/i, cat: "dovetail", shape: "flat", name: "dovetail cutter" },
    { re: /\bface\s*mills?\b/i, cat: "facemill", shape: "flat", name: "face mill" },
    { re: /\bshell\s*mills?\b/i, cat: "shellmill", shape: "flat", name: "shell mill" },
    { re: /\bball\s*(?:nose|end|mill)?\b|\bballnose\b/i,
      cat: "endmill", end: "ball", shape: "ball", name: "ball nose end mill" },
    { re: /\bbull\s*nose\b|\bcorner\s*rad(?:ius)?\b|\btoroidal\b/i,
      cat: "endmill", end: "corner", shape: "bull", name: "bull nose end mill" },
    { re: /\bchamfers?\b|\bdeburr\w*\b|\bengrav\w*\b|\bv[-\s]?bit\b/i,
      cat: "chamfer", shape: "chamfer", name: "chamfer tool" },
    { re: /\bdrills?\b|\bjobber\b|\bstub\b|\bscrew\s*machine\b/i,
      cat: "drill", shape: "drill", name: "drill" },
    { re: /\bend\s*mills?\b|\bendmills?\b|\bslot\s*drills?\b|\bflat\b|\bsquare\b|\bmills?\b|\bcutters?\b/i,
      cat: "endmill", end: "flat", shape: "flat", name: "flat end mill" },
  ];

  /* What the tool is held in, if the sentence says. Longest first, so an
     "ER16 collet" is an ER16 and not the plain-collet fallback at the end. */
  const HOLDER_WORDS = [
    [/\ber\s*-?\s*11\b/i,  "er11"],
    [/\ber\s*-?\s*16\b/i,  "er16"],
    [/\ber\s*-?\s*20\b/i,  "er20"],
    [/\ber\s*-?\s*25\b/i,  "er25"],
    [/\ber\s*-?\s*32\b/i,  "er32"],
    [/\ber\s*-?\s*40\b/i,  "er40"],
    [/\b(?:heat\s*)?shrink(?:\s*fit)?\b/i,            "shrink"],
    [/\bweldon\b|\bend\s*mill\s*holder\b|\bside\s*lock\b/i, "weldon"],
    [/\bhydraulic\b/i,                                 "hydraulic"],
    [/\b(?:keyless\s*)?drill\s*chuck\b|\bjacobs\b/i,   "drillchuck"],
    /* Somebody who just says "collet" means the one most machines have. */
    [/\bcollets?\b/i,      "er16"],
  ];
  const readHolder = txt => {
    const hit = HOLDER_WORDS.find(([re]) => re.test(txt));
    return hit ? hit[1] : null;
  };

  const WORD_NUM = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  const WORD_DEN = {
    half: 2, halves: 2, quarter: 4, quarters: 4, third: 3, thirds: 3,
    eighth: 8, eighths: 8, sixteenth: 16, sixteenths: 16,
    thirtysecond: 32, thirtyseconds: 32,
  };
  const WORD_FRAC = new RegExp(
    "\\b(?:(" + Object.keys(WORD_NUM).join("|") + ")[\\s-]+)?" +
    "(half|halves|quarters?|thirds?|eighths?|sixteenths?|thirty[\\s-]?seconds?)\\b", "i");

  const FRAC_MIXED = /(\d+)\s*[-\s]\s*(\d+)\s*\/\s*(\d+)/;
  const FRAC       = /(\d+)\s*\/\s*(\d+)/;
  const UNIT_IN    = /(?:"|″|\bin\b|\binch(?:es)?\b)/i;

  /* Everything is stored in inches, because the tool table is. */
  function readDia(txt) {
    let m = txt.match(/(\d+(?:\.\d+)?)\s*(?:mm|millimet\w*)/i);
    if (m) return { dia: parseFloat(m[1]) / IN, said: m[1] + " mm" };

    m = txt.match(new RegExp(FRAC_MIXED.source + "\\s*" + UNIT_IN.source + "?", "i"));
    if (m) return { dia: +m[1] + (+m[2] / +m[3]), said: m[1] + "-" + m[2] + "/" + m[3] + '"' };

    m = txt.match(new RegExp(FRAC.source + "\\s*" + UNIT_IN.source + "?", "i"));
    if (m && +m[2] !== 0) return { dia: +m[1] / +m[2], said: m[1] + "/" + m[2] + '"' };

    m = txt.match(new RegExp("(\\d*\\.\\d+|\\d+(?:\\.\\d+)?)\\s*" + UNIT_IN.source, "i"));
    if (m) return { dia: parseFloat(m[1]), said: m[1] + '"' };

    m = txt.match(/(?:ø|Ø|dia\.?|diameter)\s*(\d*\.?\d+)/i);
    if (m) return { dia: parseFloat(m[1]), said: m[1] + '"' };

    /* Sizes said out loud — "a half inch", "three eighths", "quarter". */
    m = txt.match(WORD_FRAC);
    if (m) {
      const num = m[1] ? WORD_NUM[m[1].toLowerCase()] : 1;
      const den = WORD_DEN[m[2].toLowerCase().replace(/[\s-]/g, "")];
      if (num && den) return { dia: num / den, said: (m[1] ? m[1] + " " : "") + m[2] };
    }
    m = txt.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+inch(?:es)?\b/i);
    if (m) return { dia: WORD_NUM[m[1].toLowerCase()], said: m[1] + " inch" };

    /* A bare decimal on its own reads as a cutter size — "a .375 four flute". */
    m = txt.match(/(?:^|\s)(\.\d+|0\.\d+)(?:\s|$)/);
    if (m) return { dia: parseFloat(m[1]), said: m[1] + '"' };

    return null;
  }

  function readOne(chunk) {
    const kind = KINDS.find(k => k.re.test(chunk));
    const dia = readDia(chunk);
    if (!kind && !dia) return null;

    const t = chunk.match(/\bT\s*0*(\d{1,3})\b/i) || chunk.match(/\btool\s*#?\s*0*(\d{1,3})\b/i);
    const fl = chunk.match(/(\d{1,2})\s*[-\s]?\s*(?:fl\b|flutes?\b)/i);
    const deg = chunk.match(/(\d{2,3})\s*(?:°|deg\w*)/i);
    const rad = chunk.match(/\b(?:r|rad(?:ius)?)\s*(\.\d+|\d+(?:\.\d+)?)/i);
    const dOff = chunk.match(/\bD\s*0*(\d{1,3})\b/);
    const hOff = chunk.match(/\bH\s*0*(\d{1,3})\b/);
    const mat = /\bcarbide\b/i.test(chunk) ? "carbide"
              : /\bcobalt\b/i.test(chunk) ? "cobalt"
              : /\bhss\b|\bhigh\s*speed\b/i.test(chunk) ? "hss" : null;

    return {
      number: t ? +t[1] : null,
      dia: dia ? dia.dia : ((kind && kind.dia) || 0.5),
      diaSaid: dia ? dia.said : null,
      cat: kind ? kind.cat : "endmill",
      end: kind && kind.end ? kind.end : "flat",
      shape: kind ? kind.shape : "flat",
      kindName: kind ? kind.name : "flat end mill",
      holder: readHolder(chunk),
      flutes: fl ? +fl[1] : null,
      angle: deg ? +deg[1] : null,
      cornerR: rad ? parseFloat(rad[1]) : null,
      dOff: dOff ? +dOff[1] : null,
      hOff: hOff ? +hOff[1] : null,
      material: mat,
      said: chunk.trim(),
    };
  }

  function parseToolText(text) {
    const chunks = String(text || "")
      .split(/[\n;]+|,\s+|\s+and\s+|\s*\/\s*(?=[A-Za-z])/i)
      .map(s => s.trim())
      .filter(Boolean);

    const out = [];
    const used = new Set();
    chunks.forEach(c => {
      const t = readOne(c);
      if (!t) return;
      if (t.number != null) used.add(t.number);
      out.push(t);
    });

    let next = 1;
    out.forEach(t => {
      if (t.number != null) return;
      while (used.has(next)) next++;
      t.number = next;
      used.add(next);
    });
    out.sort((a, b) => a.number - b.number);
    return out;
  }

  function describe(t) {
    const bits = [];
    bits.push("Ø" + trim(t.dia) + '"');
    if (t.flutes) bits.push(t.flutes + " flute");
    if (t.cornerR) bits.push("R" + trim(t.cornerR) + " corner");
    if (t.angle) bits.push(t.angle + "°");
    if (t.material) bits.push(t.material === "hss" ? "HSS" : t.material);
    bits.push(t.kindName);
    if (t.holder && typeof ToolIO !== "undefined" && ToolIO.HOLDER_LABELS)
      bits.push("in " + (ToolIO.HOLDER_LABELS[t.holder] || t.holder));
    return bits.join(" · ");
  }

  let described = [];

  /* Sizes read the way a machinist says them: 0.5", not 0.5000". */
  const trim = v => String(Math.round((+v || 0) * 1e4) / 1e4);

  /* One line each, so pressing one is the same as typing it. */
  const TOOL_SAMPLES = [
    { name: "End mill", line: '1/2" 4 flute carbide flat end mill' },
    { name: "Face mill", line: '2" face mill' },
    { name: "Drill bit", line: '1/4" 118 deg carbide jobber drill' },
  ];

  function buildTools() {
    const wrap = document.createElement("div");
    wrap.className = "gd-tools";
    wrap.innerHTML = `
      <div class="gd-label">Load a sample</div>
      <div class="gd-grid gd-toolsamples">` +
        TOOL_SAMPLES.map((x, i) =>
          '<button type="button" data-gdsample="' + i + '">' + x.name + "</button>").join("") +
      `</div>

      <div class="gd-label">Describe what you want here…</div>
      <textarea class="gd-tooltext" rows="4" spellcheck="false"
        placeholder="One tool per line, in plain words.&#10;e.g. T1 half inch 4 flute carbide end mill&#10;T2 quarter inch 118 deg drill&#10;T3 1/8 ball nose"></textarea>
      <div class="gd-toolstatus"></div>
      <div class="gd-toolcards"></div>`;

    const ta = wrap.querySelector(".gd-tooltext");

    wrap.querySelector(".gd-toolsamples").addEventListener("click", e => {
      const b = e.target.closest("[data-gdsample]");
      if (!b) return;
      const line = TOOL_SAMPLES[+b.dataset.gdsample].line;
      ta.value = ta.value.trim() ? ta.value.replace(/\s*$/, "") + "\n" + line : line;
      ta.focus();
      readBox(true);
    });

    let typing = null;
    ta.addEventListener("input", () => {
      clearTimeout(typing);
      /* Every keystroke re-reads the box, but the cutters are only rebuilt
         once the typing settles — building a tool model is real geometry. */
      typing = setTimeout(() => readBox(true), 350);
      readBox(false);
    });
    return wrap;
  }

  /* Read the box, redraw the cards and the table, and — when `commit` — push
     the result into the tool table and build the cutters. There is no button:
     what is in the box is what you have. */
  function readBox(commit) {
    if (!host) return;
    const ta = host.querySelector(".gd-tooltext");
    if (!ta) return;
    described = parseToolText(ta.value);
    if (ta.value.trim()) mark("tools");
    paintToolCards();
    if (commit) applyDescribedTools();
    paintToolsRead();
    paintOffsets();
  }

  function paintToolCards() {
    if (!host) return;
    const box = host.querySelector(".gd-toolcards");
    const status = host.querySelector(".gd-toolstatus");
    const ta = host.querySelector(".gd-tooltext");
    if (!box) return;
    const typed = ta ? ta.value.trim() : "";

    if (status) {
      status.textContent = !typed
        ? "Nothing described yet. Press a sample above, or write your own."
        : described.length
          ? "Reading " + described.length +
            (described.length === 1 ? " tool. It is in the table below." : " tools. They are in the table below.")
          : "Nothing recognized yet. Try something like “half inch 4 flute end mill”.";
      status.className = "gd-toolstatus" + (typed && !described.length ? " is-warn" : "");
    }

    if (!described.length) { box.innerHTML = ""; return; }

    box.innerHTML = described.map(() => `
      <div class="gd-toolcard">
        <span class="gd-tc-t"></span>
        <span class="gd-tc-body">
          <span class="gd-tc-name"></span>
          <span class="gd-tc-said"></span>
        </span>
      </div>`).join("");
    Array.from(box.children).forEach((el, i) => {
      const t = described[i];
      el.querySelector(".gd-tc-t").textContent = "T" + t.number;
      el.querySelector(".gd-tc-name").textContent = describe(t);
      const off = [];
      if (t.hOff != null) off.push("H" + String(t.hOff).padStart(2, "0"));
      if (t.dOff != null) off.push("D" + String(t.dOff).padStart(2, "0"));
      el.querySelector(".gd-tc-said").textContent =
        (off.length ? off.join(" · ") + " — " : "") + "Read from “" + t.said + "”.";
    });
  }

  /* What was last handed to the tool table, so a keystroke that changes
     nothing does not rebuild a cutter. */
  const builtSig = new Map();

  function applyDescribedTools() {
    described.forEach(t => {
      try {
        if (typeof toolTable !== "undefined") toolTable.set(t.number, t.dia);
        if (typeof ToolShapes !== "undefined") ToolShapes.set(t.number, t.shape);
        if (t.dOff != null && typeof dOffsetTable !== "undefined") dOffsetTable.set(t.dOff, t.dia);

        const sig = [t.cat, t.end, t.dia, t.flutes, t.angle, t.cornerR, t.material, t.holder].join("|");
        if (builtSig.get(t.number) === sig) return;
        builtSig.set(t.number, sig);

        if (typeof ToolModel !== "undefined" && window.ToolModels) {
          const p = { category: t.cat, dia: t.dia * IN };
          /* On a probe the diameter you say is the ruby ball, and a ball-sized
             shank would be nonsense — leave the arbor to the preset. */
          if (t.cat !== "probe") p.shankDia = t.dia * IN;
          if (t.cat === "endmill") p.endType = t.end;
          if (t.end === "corner" && t.cornerR) p.cornerR = t.cornerR * IN;
          if (t.flutes) p.flutes = t.flutes;
          if (t.angle && (t.cat === "drill" || t.cat === "spotdrill")) p.pointAngle = t.angle;
          if (t.angle && (t.cat === "chamfer" || t.cat === "countersink")) p.coneAngle = t.angle;
          if (t.material) p.material = t.material;
          if (t.holder) p.holder = t.holder;
          window.ToolModels.add(
            ToolModel.encode(p, { number: t.number, name: describe(t) }),
            { quiet: true, syncDiameter: false });
        }
      } catch (e) { console.warn("[Guide] tool " + t.number + ":", e); }
    });
    try {
      if (window.ToolModels && window.ToolModels.relabel) window.ToolModels.relabel();
      if (window.ToolModels && window.ToolModels.refresh) window.ToolModels.refresh();
      if (typeof updateToolTableUI === "function") updateToolTableUI();
      if (typeof updateDOffsetTableUI === "function") updateDOffsetTableUI();
      reparse();
    } catch (e) { console.warn("[Guide] tools:", e); }
  }

  /* ------------------------------------------------------------------ *
   * Step 3 · the read-back table
   *
   * Three columns and nothing else: the T number, what the tool actually is,
   * and a way back to the sentence that made it. It is drawn from the text
   * box alone, so what you typed and what the table says can never disagree.
   * ------------------------------------------------------------------ */

  function buildToolsRead() {
    const wrap = document.createElement("div");
    wrap.className = "gd-toolsread";
    wrap.innerHTML =
      '<table class="gd-tooltable">' +
        "<thead><tr><th>Tool</th><th>What it is</th><th>Edit</th></tr></thead>" +
        "<tbody></tbody>" +
      "</table>" +
      '<div class="gd-empty gd-tooltable-empty" hidden>' +
        "Nothing described yet. Open <b>Now for your tools</b> above and say what you are running." +
      "</div>";

    /* Editing sends you back to the one place any of this is written. */
    wrap.addEventListener("click", e => {
      const b = e.target.closest("[data-gdedit]");
      if (!b) return;
      editInBox(+b.dataset.gdedit);
    });
    return wrap;
  }

  /* Open the tools step, put the caret on that tool's line and select it. */
  function editInBox(number) {
    const step = STEPS.findIndex(x => x.key === "tools");
    if (step >= 0) goTo(step, true);
    const ta = host && host.querySelector(".gd-tooltext");
    if (!ta) return;

    const t = described.find(x => x.number === number);
    ta.scrollIntoView({ block: "nearest", behavior: "smooth" });
    ta.focus();
    if (!t || !t.said) return;
    const at = ta.value.indexOf(t.said);
    if (at >= 0) ta.setSelectionRange(at, at + t.said.length);
  }

  const KIND_WORDS = {
    flat: "flat end mill", ball: "ball nose end mill", bull: "bull nose end mill",
    drill: "drill", tap: "tap", chamfer: "chamfer tool",
    probe: "touch probe",
  };

  function paintToolsRead() {
    if (!host) return;
    const table = host.querySelector(".gd-tooltable");
    const empty = host.querySelector(".gd-tooltable-empty");
    if (!table) return;
    const tbody = table.querySelector("tbody");

    if (!described.length) {
      tbody.innerHTML = "";
      table.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }
    table.hidden = false;
    if (empty) empty.hidden = true;

    tbody.innerHTML = described.map(() =>
      "<tr>" +
        '<td class="gd-tt-t"></td>' +
        '<td class="gd-tt-d"></td>' +
        '<td class="gd-tt-e"><button type="button" class="gd-editbtn" title="Change this tool"></button></td>' +
      "</tr>").join("");

    Array.from(tbody.children).forEach((tr, i) => {
      const t = described[i];
      tr.querySelector(".gd-tt-t").textContent = "T" + t.number;
      tr.querySelector(".gd-tt-d").textContent = describe(t);
      const b = tr.querySelector(".gd-editbtn");
      b.dataset.gdedit = t.number;
      b.textContent = "Edit";
    });
  }

  /* ------------------------------------------------------------------ *
   * Step 4 · offsets
   * ------------------------------------------------------------------ */

  const DEFAULT_TOOL = { number: 1, dia: 0.5, shape: "flat", flutes: 4 };

  function buildOffsets() {
    const wrap = document.createElement("div");
    wrap.className = "gd-offsets";
    wrap.innerHTML = `
      <div class="gd-label">Add your tool and work offsets here</div>
      <div class="gd-note">
        Whatever the program calls for, and whatever you described in the last
        step, turns up here on its own. A half inch four flute end mill sits in
        T1 to start you off. Take it out if you do not want it, and add as many
        more as you like.
      </div>

      <div class="gd-offhead">Tools</div>
      <div class="gd-offlist" data-gdlist="tools"></div>
      <div class="gd-addrow">
        <input type="number" class="gd-addnum" min="1" max="999" step="1" placeholder="T#">
        <input type="number" class="gd-adddia" min="0.001" step="0.0625" placeholder="Ø in">
        <button type="button" class="gd-addbtn" data-gdadd="tool">Add</button>
      </div>

      <div class="gd-offhead">Offsets</div>
      <div class="gd-offlist" data-gdlist="offsets"></div>
      <div class="gd-addrow">
        <input type="text" class="gd-addnum" placeholder="D20" maxlength="5">
        <input type="number" class="gd-adddia" min="0.001" step="0.0625" placeholder="Ø in">
        <button type="button" class="gd-addbtn" data-gdadd="offset">Add</button>
      </div>
      <div class="gd-note">
        Type any number you like — D05, D21, D40. Each one holds the diameter
        cutter comp will work from, exactly as it does in the sandbox's
        <b>Tool Offsets</b> panel.
      </div>`;

    wrap.addEventListener("click", e => {
      const del = e.target.closest("[data-gddel]");
      if (del) {
        const kind = del.dataset.gddel, n = +del.dataset.n;
        if (kind === "tool" && typeof toolTable !== "undefined") {
          toolTable.delete(n);
          if (typeof ToolShapes !== "undefined") ToolShapes.delete(n);
          try { if (window.ToolModels) window.ToolModels.remove(n); } catch (err) {   }
          if (typeof updateToolTableUI === "function") updateToolTableUI();
        } else if (kind === "offset" && typeof dOffsetTable !== "undefined") {
          dOffsetTable.delete(n);
          if (typeof updateDOffsetTableUI === "function") updateDOffsetTableUI();
        }
        mark("picture");
        reparse();
        paintOffsets();
        return;
      }

      const add = e.target.closest("[data-gdadd]");
      if (!add) return;
      const row = add.closest(".gd-addrow");
      const numEl = row.querySelector(".gd-addnum");
      const diaEl = row.querySelector(".gd-adddia");
      const dia = parseFloat(diaEl.value);
      const raw = String(numEl.value || "").trim();
      const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
      if (!isFinite(n) || n < 0) return;
      const d = isFinite(dia) && dia > 0 ? dia : 0.5;

      if (add.dataset.gdadd === "tool") {
        if (typeof toolTable !== "undefined") toolTable.set(n, d);
        if (typeof ToolShapes !== "undefined" && !ToolShapes.has(n)) ToolShapes.set(n, "flat");
        if (typeof updateToolTableUI === "function") updateToolTableUI();
      } else {
        if (typeof dOffsetTable !== "undefined") dOffsetTable.set(n, d);
        if (typeof updateDOffsetTableUI === "function") updateDOffsetTableUI();
      }
      numEl.value = ""; diaEl.value = "";
      mark("picture");
      reparse();
      paintOffsets();
    });

    /* Editing a value in place. */
    wrap.addEventListener("change", e => {
      const inp = e.target.closest("[data-gdval]");
      if (!inp) return;
      const v = parseFloat(inp.value);
      if (!isFinite(v) || v <= 0) { paintOffsets(); return; }
      const n = +inp.dataset.n;
      if (inp.dataset.gdval === "tool" && typeof toolTable !== "undefined") {
        toolTable.set(n, v);
        if (typeof updateToolTableUI === "function") updateToolTableUI();
      } else if (typeof dOffsetTable !== "undefined") {
        dOffsetTable.set(n, v);
        if (typeof updateDOffsetTableUI === "function") updateDOffsetTableUI();
      }
      mark("picture");
      reparse();
      paintOffsets();
    });

    return wrap;
  }

  function reparse() {
    try {
      if (typeof flushParseNow === "function") flushParseNow();
      else if (typeof simSeekToTime === "function") simSeekToTime(simTime);
    } catch (e) {   }
  }

  /* Put one cutter in the carousel so the fourth step is never empty. */
  let seededDefault = false;
  function seedDefaultTool() {
    if (seededDefault || typeof toolTable === "undefined") return;
    seededDefault = true;
    if (toolTable.size) return;
    toolTable.set(DEFAULT_TOOL.number, DEFAULT_TOOL.dia);
    if (typeof ToolShapes !== "undefined") ToolShapes.set(DEFAULT_TOOL.number, DEFAULT_TOOL.shape);
    if (typeof updateToolTableUI === "function") updateToolTableUI();
  }

  function paintOffsets() {
    if (!host) return;
    const wrap = host.querySelector(".gd-offsets");
    if (!wrap) return;

    const rows = (box, entries, kind, label) => {
      if (!box) return;
      const live = box.querySelector("input:focus");
      if (live) return;
      if (!entries.length) {
        box.innerHTML = '<div class="gd-empty">Nothing here yet.</div>';
        return;
      }
      box.innerHTML = entries.map(() => `
        <div class="gd-offrow">
          <span class="gd-off-k"></span>
          <input type="number" step="0.0005" min="0.001" data-gdval="${kind}">
          <span class="gd-off-n"></span>
          <button type="button" class="gd-off-x" data-gddel="${kind}" title="Take this one out">&times;</button>
        </div>`).join("");
      Array.from(box.children).forEach((el, i) => {
        const [n, v] = entries[i];
        el.querySelector(".gd-off-k").textContent = label(n);
        const inp = el.querySelector("input");
        inp.value = trim(v);
        inp.dataset.n = n;
        el.querySelector(".gd-off-x").dataset.n = n;
        let note = "in";
        if (kind === "tool") {
          /* If the tool has actually been built, its own name is the truthful
             label — the end shape alone cannot tell a face mill from an end
             mill, and both come out "flat". */
          let named = null;
          try {
            const rec = window.ToolModels && window.ToolModels.get(n);
            if (rec && rec.name) named = rec.name;
          } catch (err) {   }
          if (!named) {
            const d = described.find(t => t.number === n);
            if (d) named = d.kindName;
          }
          if (!named && typeof ToolShapes !== "undefined") {
            named = KIND_WORDS[ToolShapes.get(n)] || "flat end mill";
          }
          note = named || "flat end mill";
        } else if (kind === "offset") {
          note = "in · cutter comp";
        }
        el.querySelector(".gd-off-n").textContent = note;
      });
    };

    const tools = (typeof toolTable !== "undefined")
      ? Array.from(toolTable.entries()).sort((a, b) => a[0] - b[0]) : [];
    const offs = (typeof dOffsetTable !== "undefined")
      ? Array.from(dOffsetTable.entries()).sort((a, b) => a[0] - b[0]) : [];

    rows(wrap.querySelector('[data-gdlist="tools"]'), tools, "tool", n => "T" + n);
    rows(wrap.querySelector('[data-gdlist="offsets"]'), offs, "offset",
         n => "D" + String(n).padStart(2, "0"));
  }

  /* ------------------------------------------------------------------ *
   * Step 4 · before and after, and what will hit the vise
   * ------------------------------------------------------------------ */

  function buildBeforeAfter() {
    const wrap = document.createElement("div");
    wrap.className = "gd-ba";
    wrap.innerHTML = `
      <div class="pm-mini gd-bapick">
        <button type="button" data-gdba="before">Before</button>
        <button type="button" data-gdba="after">After</button>
      </div>
      <div class="gd-note">
        The blank as it arrives and as it will be once the last line has run,
        with the grid and the marks put away so there is nothing but metal.
      </div>
      <div class="gd-warnbox"></div>`;

    wrap.querySelector(".gd-bapick").addEventListener("click", e => {
      const b = e.target.closest("[data-gdba]");
      if (!b) return;
      mark("beforeafter");
      try { StockShowcase.show(b.dataset.gdba); } catch (err) { console.warn("[Guide] showcase:", err); }
      paintBeforeAfter();
    });
    return wrap;
  }

  function paintBeforeAfter() {
    if (!host) return;
    const wrap = host.querySelector(".gd-ba");
    if (!wrap) return;

    let state = null;
    try { state = StockShowcase.state; } catch (e) { state = null; }
    wrap.querySelectorAll("[data-gdba]").forEach(b =>
      b.classList.toggle("on", b.dataset.gdba === state));

    const box = wrap.querySelector(".gd-warnbox");
    if (!box) return;
    let bad = [];
    try { bad = (window.JawClear && window.JawClear.conflicts()) || []; } catch (e) { bad = []; }

    if (!bad.length) {
      box.className = "gd-warnbox is-good";
      box.innerHTML = '<div class="gd-warn-head">Nothing runs into the jaws</div>' +
        '<div class="gd-warn-sub">Every move in the program stays above the top of the vise.</div>';
      return;
    }

    const shown = bad.slice(0, 12);
    box.className = "gd-warnbox is-bad";
    box.innerHTML =
      '<div class="gd-warn-head"></div>' +
      '<div class="gd-warn-sub">The blank is not standing proud enough. Go back to ' +
        '<b>How much stock should be over the top of both jaws</b> and lift it, ' +
        'or these lines cut the vise.</div>' +
      '<ul class="gd-warn-list">' + shown.map(() => "<li></li>").join("") + "</ul>" +
      (bad.length > shown.length
        ? '<div class="gd-warn-more">…and ' + (bad.length - shown.length) + " more.</div>"
        : "");
    box.querySelector(".gd-warn-head").textContent =
      bad.length + (bad.length === 1 ? " line goes below the jaws" : " lines go below the jaws");

    const lis = box.querySelectorAll(".gd-warn-list li");
    const src = (typeof gcodeInput !== "undefined" && gcodeInput) ? gcodeInput.value.split("\n") : [];
    shown.forEach((b, i) => {
      const text = (src[b.line] || "").trim().slice(0, 44);
      lis[i].textContent = "Line " + (b.line + 1) + " — " + fmt(b.below) + " " + uLab()
        + " into the jaws" + (text ? "  ·  " + text : "");
    });
  }

  /* ------------------------------------------------------------------ *
   * The viewer's own button
   * ------------------------------------------------------------------ */

  let vpAct = null, vpActBtn = null, vpFor = null;

  function ensureVpAct() {
    if (vpAct) return vpAct;
    const vp = document.getElementById("viewport");
    if (!vp) return null;
    vpAct = document.createElement("div");
    vpAct.id = "gd-vpact";
    vpAct.hidden = true;
    vpAct.innerHTML = '<button type="button" id="gd-vpact-btn"></button>';
    vp.appendChild(vpAct);
    vpActBtn = vpAct.querySelector("button");
    vpActBtn.addEventListener("click", () => {
      if (!vpFor) return;
      if (vpFor === "origin") {
        try { if (typeof Snap !== "undefined") Snap.arm(false); } catch (e) {   }
      }
      mark(vpFor);
      nextSub(vpFor);
    });
    return vpAct;
  }

  /* Which sub-question is open decides whether the viewer shows a button and
     what it says. */
  function paintVpAct() {
    const box = ensureVpAct();
    if (!box) return;

    let want = null;
    if (section.offsetParent !== null) {
      STEPS.forEach((s, si) => {
        if (si !== openStep && mode !== "all") return;
        (s.subs || []).forEach((sub, i) => {
          if (!sub.viewer) return;
          if (openSub[s.key] === i) want = sub;
        });
      });
    }

    box.hidden = !want;
    vpFor = want ? want.key : null;
    if (want) {
      vpActBtn.textContent = want.viewer.label;
      vpActBtn.title = want.viewer.tip;
    }
    placeVpAct();
  }

  /* It rides directly on top of the undo/redo bar, which itself rides on the
     mode banner. Both are laid out by ui-extras.js, so this reads their
     boxes rather than guessing. */
  function placeVpAct() {
    if (!vpAct || vpAct.hidden) return;
    const vp = document.getElementById("viewport");
    if (!vp) return;
    const v = vp.getBoundingClientRect();
    const above = el => {
      if (!el || el.hidden || el.offsetParent === null) return null;
      const r = el.getBoundingClientRect();
      return (r.width && r.height) ? r : null;
    };
    const hist = above(document.getElementById("vp-history"));
    const status = above(document.getElementById("vp-mode-status"));
    const top = hist || status;
    vpAct.style.bottom = top ? (v.bottom - top.top + 8) + "px" : "16px";
  }

  /* ------------------------------------------------------------------ *
   * Building the shell
   * ------------------------------------------------------------------ */

  function findSource(name) {
    const steps = Array.from(body.querySelectorAll(".mkp-step"));
    return steps.find(s => {
      const n = s.querySelector(".mkp-step-name");
      return n && n.textContent.trim() === name;
    }) || null;
  }

  function adopt(target, name) {
    const src = findSource(name);
    if (!src) return;
    const t = src.querySelector(".mkp-step-title");
    if (t) t.remove();
    src.classList.add("gd-adopted");
    target.appendChild(src);
  }

  /* Watching a category for any sign of life. Anything the user clicks,
     types in or toggles inside it counts as having answered it. */
  function watch(el, key) {
    ["click", "input", "change"].forEach(t =>
      el.addEventListener(t, () => mark(key), true));
  }

  function headMarkup(q, hint, n) {
    return '<span class="gd-tick" aria-hidden="true"></span>' +
      (n ? '<span class="gd-num">' + n + "</span>" : "") +
      '<span class="gd-htext">' +
        '<span class="gd-q"></span>' +
        '<span class="gd-hint"></span>' +
      "</span>" +
      '<span class="gd-chev" aria-hidden="true">▸</span>';
  }

  function build() {
    const banner = document.getElementById("mkp-banner");
    /* Save-and-exit and the two red buttons live loose in the old panel, so
       they would be thrown away with everything else when the body is
       cleared — and their listeners with them. They are kept in an attic and
       the new footer forwards to them. */
    const doneBtn = document.getElementById("mkp-done");

    host = document.createElement("div");
    host.id = "gd-host";

    const modes = document.createElement("div");
    modes.className = "gd-modes";
    modes.innerHTML =
      '<button type="button" class="gd-mode on" data-mode="one">One step at a time</button>' +
      '<button type="button" class="gd-mode" data-mode="all">Show me everything</button>';
    modes.addEventListener("click", e => {
      const b = e.target.closest("[data-mode]");
      if (b) setMode(b.dataset.mode);
    });
    host.appendChild(modes);

    STEPS.forEach((step, si) => {
      const card = document.createElement("div");
      card.className = "gd-step";
      card.dataset.key = step.key;

      const head = document.createElement("button");
      head.type = "button";
      head.className = "gd-head";
      head.innerHTML = headMarkup(step.q, step.hint, step.n);
      head.querySelector(".gd-q").textContent = step.q;
      head.querySelector(".gd-hint").textContent = step.hint;
      head.addEventListener("click", () => goTo(si));
      card.appendChild(head);

      const bodyEl = document.createElement("div");
      bodyEl.className = "gd-body";

      if (step.notice) {
        const note = document.createElement("div");
        note.className = "gd-notice";
        note.textContent = step.notice;
        bodyEl.appendChild(note);
      }

      const own = document.createElement("div");
      own.className = "gd-own";
      if (step.build) own.appendChild(step.build());
      if (step.src) adopt(own, step.src);
      watch(own, step.key);
      bodyEl.appendChild(own);

      if (step.subs && step.subs.length) {
        const subs = document.createElement("div");
        subs.className = "gd-subs";
        step.subs.forEach((sub, i) => {
          const sc = document.createElement("div");
          sc.className = "gd-sub";
          sc.dataset.key = sub.key;

          const sh = document.createElement("button");
          sh.type = "button";
          sh.className = "gd-head gd-subhead";
          sh.innerHTML = headMarkup(sub.q, sub.hint);
          sh.querySelector(".gd-q").textContent = sub.q;
          sh.querySelector(".gd-hint").textContent = sub.hint;
          sh.addEventListener("click", () => goToSub(step.key, i));
          sc.appendChild(sh);

          const sb = document.createElement("div");
          sb.className = "gd-body gd-subbody";
          if (sub.build) sb.appendChild(sub.build());
          if (sub.src) adopt(sb, sub.src);
          watch(sb, sub.key);
          sc.appendChild(sb);
          subs.appendChild(sc);
        });
        bodyEl.appendChild(subs);
        openSub[step.key] = -1;
      }

      const nav = document.createElement("div");
      nav.className = "gd-nav";
      nav.innerHTML =
        '<button type="button" class="gd-arrow" data-go="-1">← Back</button>' +
        '<span class="gd-count"></span>' +
        '<button type="button" class="gd-arrow gd-next" data-go="1">Next →</button>';
      nav.addEventListener("click", e => {
        const b = e.target.closest("[data-go]");
        if (b) goTo(si + (+b.dataset.go), true);
      });
      bodyEl.appendChild(nav);

      card.appendChild(bodyEl);
      host.appendChild(card);
    });

    host.appendChild(buildFooter());

    /* Everything the new shell did not adopt, kept alive and out of sight so
       the buttons that forward to it still have something to press. */
    attic = document.createElement("div");
    attic.id = "gd-attic";
    attic.hidden = true;
    Array.from(body.querySelectorAll(".mkp-step")).forEach(s => {
      if (!s.closest("#gd-host")) attic.appendChild(s);
    });

    body.innerHTML = "";
    if (banner) body.appendChild(banner);
    body.appendChild(host);
    body.appendChild(attic);
    if (doneBtn) { doneBtn.hidden = true; attic.appendChild(doneBtn); }

    /* The blank's own options only show while the custom mode is on, and
       "what are you cutting" is the whole first question. */
    const custom = $('#mkp-stock-mode [data-mkpstockmode="custom"]');
    if (custom && !custom.classList.contains("on")) custom.click();

    seedDefaultTool();
    setMode("one");
    goTo(0);
    repaint();
    /* Everything from here on is the user's own doing. */
    setTimeout(() => { booting = false; }, 0);
  }

  /* ------------------------------------------------------------------ *
   * The read-back, and the two ways out
   * ------------------------------------------------------------------ */

  function buildFooter() {
    footer = document.createElement("div");
    footer.id = "gd-footer";
    footer.innerHTML = `
      <div class="gd-sum-head">Here's what you've set up</div>
      <div class="gd-sum-lead" id="gd-sum-lead"></div>
      <ul class="gd-sum-list" id="gd-sum-list"></ul>

      <div class="gd-exit">
        <button type="button" class="gd-save" id="gd-save">
          <span class="gd-b-t">Save this and go</span>
          <span class="gd-b-d">The setup is kept on this computer, and the page opens with it from now on.</span>
        </button>
        <button type="button" class="gd-wipe" id="gd-wipe">
          <span class="gd-wipe-fill" aria-hidden="true"></span>
          <span class="gd-b-t gd-wipe-label">Hold to throw it all away</span>
          <span class="gd-b-d">Everything here is deleted, and the built-in demo comes back.</span>
        </button>
      </div>`;

    footer.querySelector("#gd-save").addEventListener("click", () => {
      askBeforeLeaving(() => click("#mkp-done"));
    });
    bindHold(footer.querySelector("#gd-wipe"), () => {
      askBeforeLeaving(() => click("#mkp-forget"));
    });
    return footer;
  }

  /* Anything still on its factory setting, named in the words the question
     was asked in. */
  function unanswered() {
    return ALL.filter(x => !touched[x.key]);
  }

  let leaveGo = null;
  function askBeforeLeaving(go) {
    const left = unanswered();
    if (!left.length) { go(); return; }

    const list = document.getElementById("gd-leave-list");
    const modal = document.getElementById("gd-leave-modal");
    if (!list || !modal || typeof ModalSystem === "undefined") { go(); return; }

    list.innerHTML = left.map(() => "<li></li>").join("");
    Array.from(list.children).forEach((li, i) => { li.textContent = left[i].q; });

    leaveGo = go;
    ModalSystem.open("gd-leave-modal");
  }

  const leaveBtn = document.getElementById("gd-leave-go");
  if (leaveBtn) leaveBtn.addEventListener("click", () => {
    if (typeof ModalSystem !== "undefined") ModalSystem.close("gd-leave-modal");
    const go = leaveGo; leaveGo = null;
    if (go) go();
  });

  /* Leaving by the banner's Exit button gets the same warning. */
  const exitBtn = document.getElementById("mkp-exit");
  if (exitBtn) exitBtn.addEventListener("click", e => {
    if (!host || exitBtn.dataset.gdOk === "1") { exitBtn.dataset.gdOk = ""; return; }
    if (!unanswered().length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    askBeforeLeaving(() => { exitBtn.dataset.gdOk = "1"; exitBtn.click(); });
  }, true);

  /* Three seconds on the button, with the bar filling under the cursor the
     whole time. Letting go early cancels it. */
  function bindHold(btn, onDone) {
    if (!btn) return;
    const HOLD_MS = 3000;
    const label = btn.querySelector(".gd-wipe-label");
    const text = label && label.textContent;
    let t0 = 0, raf = 0;

    const reset = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      btn.classList.remove("is-holding");
      btn.style.setProperty("--hold", "0%");
      if (label) label.textContent = text;
    };

    const step = now => {
      const k = Math.min((now - t0) / HOLD_MS, 1);
      btn.style.setProperty("--hold", (k * 100).toFixed(2) + "%");
      if (label) label.textContent =
        "Keep holding… " + Math.max(1, Math.ceil(HOLD_MS / 1000 * (1 - k))) + "s";
      if (k < 1) { raf = requestAnimationFrame(step); return; }
      reset();
      onDone();
    };

    btn.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      e.preventDefault();
      reset();
      t0 = performance.now();
      btn.classList.add("is-holding");
      try { btn.setPointerCapture(e.pointerId); } catch (err) {   }
      raf = requestAnimationFrame(step);
    });
    ["pointerup", "pointercancel"].forEach(t =>
      window.addEventListener(t, reset, true));
    window.addEventListener("blur", reset);
    btn.addEventListener("click", e => e.preventDefault());
  }

  function paintSummary() {
    const lead = document.getElementById("gd-sum-lead");
    const list = document.getElementById("gd-sum-list");
    if (!lead || !list) return;

    const S = readSetup();
    lead.textContent =
      (S.metal
        ? "You're cutting " + S.metal + (S.size ? ", " + S.size : "") + ". "
        : "There's no metal in the vise yet. ") +
      (S.slide
        ? "It's held " + S.slide
            + (S.origin ? ", and zero is set on " + S.origin + ". " : ", and zero hasn't been set yet. ")
        : "") +
      (S.proud != null
        ? "It stands " + fmt(S.proud) + " " + uLab() + " above the jaws. "
        : "") +
      (S.tools ? "There " + (S.tools === 1 ? "is one cutter" : "are " + S.tools + " cutters")
                 + " in the table. " : "No cutters have been set up. ") +
      (S.moves ? "The program runs " + S.moves.toLocaleString() + " moves." : "No program is loaded yet.");

    const rows = [
      ["Holding", S.vise || "—"],
      ["Metal", S.metal || "nothing yet"],
      ["Size", S.size || "—"],
      ["In the jaws", S.slide || "—"],
      ["Above the jaws", S.proud != null ? fmt(S.proud) + " " + uLab() : "—"],
      ["Zero on", S.origin || "not set"],
      ["Cutters", S.tools ? String(S.tools) : "none"],
      ["Offsets", S.offsets ? String(S.offsets) : "none"],
      ["Program", S.moves ? S.moves.toLocaleString() + " moves" : "none loaded"],
    ];
    list.innerHTML = rows.map(() =>
      '<li><span class="gd-sum-k"></span><span class="gd-sum-v"></span></li>').join("");
    Array.from(list.children).forEach((li, i) => {
      li.querySelector(".gd-sum-k").textContent = rows[i][0];
      li.querySelector(".gd-sum-v").textContent = rows[i][1];
    });
  }

  function readSetup() {
    const out = {};
    const lit = sel => { const b = $(sel); return b ? b.textContent.trim().toLowerCase() : null; };

    out.metal = lit("#mkp-stock-metal [data-mkpmetal].on");
    const shape = lit("#mkp-stock-shape [data-mkpshape].on");
    if (out.metal && shape) out.metal = out.metal + " " + (shape === "round bar" ? "bar" : "block");

    const dims = document.getElementById("mkp-stock-dims");
    if (dims) {
      const vals = Array.from(dims.querySelectorAll("input")).map(i => i.value).filter(Boolean);
      if (vals.length) out.size = vals.join(" × ");
    }

    const slide = lit("#mkp-slide [data-mkpslide].on");
    if (slide) out.slide = slide === "center" ? "in the middle of the jaws" : "at the " + slide + "-hand end";

    const p = stockPart();
    if (p && p.zeroNote) out.origin = p.zeroNote;

    try {
      const fx = window.PartModels && window.PartModels.fixture;
      const st = fx && fx.state && fx.state();
      if (st && st.vises) {
        const v = st.vises.find(x => x.key === st.vise);
        out.vise = v ? v.name : st.vise;
      }
    } catch (e) {   }

    try {
      const m = window.JawClear && window.JawClear.measure();
      if (m && m.ok) out.proud = m.proud;
    } catch (e) {   }

    try { out.tools = (typeof toolTable !== "undefined") ? toolTable.size : 0; } catch (e) { out.tools = 0; }
    try { out.offsets = (typeof dOffsetTable !== "undefined") ? dOffsetTable.size : 0; } catch (e) { out.offsets = 0; }
    try { out.moves = (typeof allSegments !== "undefined") ? allSegments.length : 0; } catch (e) { out.moves = 0; }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Which category is open
   * ------------------------------------------------------------------ */

  function setMode(m) {
    mode = (m === "all") ? "all" : "one";
    host.classList.toggle("is-all", mode === "all");
    host.querySelectorAll("[data-mode]").forEach(b =>
      b.classList.toggle("on", b.dataset.mode === mode));
    paintOpen();
  }

  /* Pressing the heading of the step that is already open shuts it, the way
     every other accordion on the page behaves. `force` is for the Back and
     Next arrows, which should always land on a step rather than close one.
     Opening a category counts as answering it. */
  function goTo(i, force) {
    const want = Math.max(0, Math.min(i, STEPS.length - 1));
    openStep = (!force && want === openStep) ? -1 : want;
    if (openStep >= 0) mark(STEPS[openStep].key);
    paintOpen();
    if (openStep < 0) return;
    const card = stepEls()[openStep];
    if (card) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function goToSub(stepKey, i) {
    const shut = openSub[stepKey] === i;
    openSub[stepKey] = shut ? -1 : i;
    if (!shut) {
      const step = STEPS.find(s => s.key === stepKey);
      if (step && step.subs[i]) mark(step.subs[i].key);
    }
    paintOpen();
    const el = subEls(stepKey)[i];
    if (el && !shut) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /* On from whichever sub-question the viewer button belongs to. */
  function nextSub(key) {
    STEPS.forEach(s => {
      const i = (s.subs || []).findIndex(x => x.key === key);
      if (i < 0) return;
      openSub[s.key] = (i + 1 < s.subs.length) ? i + 1 : -1;
      paintOpen();
    });
  }

  function paintOpen() {
    stepEls().forEach((card, i) => {
      card.classList.toggle("is-open", i === openStep);
      void card;
      const count = card.querySelector(".gd-count");
      if (count) count.textContent = "Step " + (i + 1) + " of " + STEPS.length;
      const back = card.querySelector('.gd-nav [data-go="-1"]');
      const next = card.querySelector('.gd-nav [data-go="1"]');
      if (back) back.disabled = i === 0;
      if (next) next.textContent = (i === STEPS.length - 1) ? "Done →" : "Next →";

      const step = STEPS[i];
      subEls(step.key).forEach((sc, j) =>
        sc.classList.toggle("is-open", openSub[step.key] === j));
    });
    paintTicks();
    paintVpAct();
  }

  function paintTicks() {
    if (!host) return;
    host.querySelectorAll(".gd-step, .gd-sub").forEach(card =>
      card.classList.toggle("is-done", !!touched[card.dataset.key]));

    /* A step with sub-questions also says how many of them are answered. */
    STEPS.forEach(step => {
      if (!step.subs || !step.subs.length) return;
      const card = host.querySelector('.gd-step[data-key="' + step.key + '"]');
      if (!card) return;
      const n = step.subs.filter(s => touched[s.key]).length;
      let badge = card.querySelector(".gd-subcount");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "gd-subcount";
        const head = card.querySelector(".gd-head");
        if (head) head.insertBefore(badge, head.querySelector(".gd-chev"));
      }
      badge.textContent = n + "/" + step.subs.length;
      badge.classList.toggle("is-full", n === step.subs.length);
    });
  }

  /* ------------------------------------------------------------------ *
   * Keeping the read-outs honest
   * ------------------------------------------------------------------ */

  /* Each read-out reads a different corner of the page, so one of them
     falling over must not take the other five with it. */
  function repaint() {
    [paintOrigin, paintPlace, paintHolding, paintToolsRead, paintOffsets,
     paintBeforeAfter, paintSummary, paintVpAct].forEach(fn => {
      try { fn(); } catch (e) { console.warn("[Guide] " + (fn.name || "paint") + ":", e); }
    });
  }

  /* Starting over means starting over: a setup that has been thrown away must
     not come back with its ticks still on. */
  function resetTicks() {
    Object.keys(touched).forEach(k => delete touched[k]);
    booting = true;
    setTimeout(() => { booting = false; }, 0);
    if (host) paintTicks();
  }

  ["mkp-forget", "mkp-restart"].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.addEventListener("click", () => setTimeout(resetTicks, 0), true);
  });

  /* Entering build mode wipes the scene, so it wipes the checklist too. */
  if (typeof MutationObserver === "function") {
    let was = document.body.classList.contains("mkp-on");
    new MutationObserver(() => {
      const now = document.body.classList.contains("mkp-on");
      if (now === was) return;
      was = now;
      if (now) resetTicks();
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  /* Things that are true whether or not the user pressed anything in here —
     a program dropped on the page, a sample loaded, a vise from the Library. */
  function sniff() {
    /* Never do this on top of a running animation. */
    try { if (window.VPBusy && window.VPBusy.active()) return; } catch (e) {   }
    try {
      if (typeof allSegments !== "undefined" && allSegments.length) touched.code = true;
      if (typeof toolTable !== "undefined" && toolTable.size > 1) touched.tools = true;
    } catch (e) {   }
    repaint();
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */

  function boot() {
    if (!body.querySelector(".mkp-step")) return;   // already built, or empty
    build();
    setInterval(() => {
      if (section.offsetParent !== null) sniff();
      placeVpAct();
    }, 700);
    window.addEventListener("resize", placeVpAct);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.Guide = {
    summary: paintSummary,
    go: goTo,
    refresh: repaint,
    unanswered,
    reset: resetTicks,
    /* Exposed so the describer can be checked without pressing anything. */
    readTools: parseToolText,
  };
})();
