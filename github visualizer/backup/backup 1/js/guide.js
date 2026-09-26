/* guide.js — "Guide Me Through It".
 *
 * The build panel had everything a setup needs and no order to it: six blocks
 * of controls, all open at once, in whatever order they had been written.
 * Someone who has never set a job before has no way of knowing where to start
 * or whether they have finished.
 *
 * This rebuilds the same controls as a checklist. The questions come in the
 * order a machinist would actually ask them — what machine, what metal, where
 * in the vice, what cutters, what program — and you can take them one at a
 * time with arrows, or open the lot and jump about. When you are done it reads
 * the setup back to you in plain English, the way someone would explain the
 * job across a bench, and then offers the two ways out.
 *
 * No control is reimplemented. The existing step bodies are physically moved
 * into the new shell, which keeps every listener already bound to them, and
 * the two brand-new pieces — the machine-type question and the summary — are
 * the only things here that own any state.
 */

(function () {
  "use strict";

  const section = document.getElementById("mkp-section");
  if (!section) return;
  const body = section.querySelector(".sec-body");
  if (!body) return;

  const $ = sel => document.querySelector(sel);

  /* ------------------------------------------------------------------ *
   * What kind of machine — the one genuinely new question.
   *
   * It is not decoration: the answer sets whether A/B/C words turn the work
   * or swing the cutter, and picks the workholding the rest of the guide
   * starts from. Both of those are real switches elsewhere in the page.
   * ------------------------------------------------------------------ */

  const AXES = {
    3: {
      name: "3-axis",
      blurb: "The cutter moves left/right, forward/back and up/down. The work sits still. Nearly every job, and the place to start.",
      rotary: "tool",
      vise: "haasv6",
      says: "a 3-axis mill — the spindle moves in X, Y and Z and the work stays put",
    },
    4: {
      name: "4-axis",
      blurb: "As above, plus the work can roll about one axis, so the cutter can reach round a part without you unclamping it.",
      rotary: "part",
      vise: "haasv6",
      says: "a 4-axis mill — the work can roll about the A axis, so the cutter reaches more than one face in a setting",
    },
    5: {
      name: "5-axis",
      blurb: "The work can tilt and turn at the same time, so the cutter can reach almost any face in one setting. Held on a dovetail rather than in ordinary jaws.",
      rotary: "part",
      vise: "dovetail",
      says: "a 5-axis mill — the work both tilts and turns, so almost every face is reachable without re-clamping",
    },
  };

  let axis = 3;

  function applyAxis(n, quiet) {
    const spec = AXES[n];
    if (!spec) return;
    axis = n;

    /* Which way the rotary words are read. */
    const rb = document.querySelector('#rotary-mode [data-rotary="' + spec.rotary + '"]');
    if (rb && !rb.classList.contains("on")) rb.click();

    /* And what is holding the work. */
    try {
      const fx = window.PartModels && window.PartModels.fixture;
      if (fx && fx.setVise && fx.state && fx.state().vise !== spec.vise) fx.setVise(spec.vise);
    } catch (e) {   }

    paintAxis();
    if (!quiet && typeof showToast === "function") {
      showToast("Set up for a " + spec.name + " mill",
        spec.rotary === "part"
          ? "A, B and C words will turn the work under the spindle, and the guide has picked workholding to suit."
          : "A, B and C words will swing the cutter around work that stays put.");
    }
    markDone("machine", true);
    paintSummary();
  }

  function paintAxis() {
    const box = document.getElementById("gd-axis-pick");
    if (!box) return;
    box.querySelectorAll("[data-axis]").forEach(b =>
      b.classList.toggle("on", +b.dataset.axis === axis));
  }

  /* ------------------------------------------------------------------ *
   * The steps.
   *
   * `src` names an existing .mkp-step by its own title; that whole block is
   * moved in under the new heading. `build` is for the two steps that have no
   * existing body.
   * ------------------------------------------------------------------ */

  const STEPS = [
    {
      key: "machine",
      q: "What kind of milling are you doing?",
      hint: "How many directions the machine can work in. If you are not sure, it is 3-axis.",
      build: axisStepBody,
    },
    {
      key: "stock",
      q: "What are you cutting?",
      hint: "The lump of metal itself — its shape, what it is made of, how big it is, and which corner counts as zero.",
      src: "Stock",
      adopt: ["#mkp-origin-block"],
    },
    {
      key: "vice",
      q: "Where does it sit in the vice?",
      hint: "Which end of the jaws the metal is pushed up against.",
      src: "Set the job",
    },
    {
      key: "tools",
      q: "What tools are you using?",
      hint: "What goes in the spindle, and how wide each one cuts.",
      src: "Tooling",
    },
    {
      key: "program",
      q: "What should the machine run?",
      hint: "The code itself. Start from one of the samples, paste your own, or drop a file in.",
      src: "Your program",
    },
    {
      key: "holding",
      q: "Want to change what's holding it?",
      hint: "The vice, the parallels underneath it and the table it all bolts to. The guide has already picked sensible ones.",
      src: "Workholding",
      optional: true,
    },
    {
      key: "extras",
      q: "Anything else in the scene?",
      hint: "Bring in a model of your own, or reframe the view.",
      src: "Scene",
      optional: true,
    },
  ];

  const done = {};
  const markDone = (key, v) => { done[key] = !!v; paintChecks(); };

  function axisStepBody() {
    const wrap = document.createElement("div");
    wrap.id = "gd-axis-pick";
    wrap.className = "gd-axis";
    wrap.innerHTML = Object.keys(AXES).map(n => `
      <button type="button" class="gd-axis-btn" data-axis="${n}">
        <span class="gd-axis-n">${AXES[n].name}</span>
        <span class="gd-axis-d">${AXES[n].blurb}</span>
      </button>`).join("");
    wrap.addEventListener("click", e => {
      const b = e.target.closest("[data-axis]");
      if (b) applyAxis(+b.dataset.axis);
    });
    return wrap;
  }

  /* ------------------------------------------------------------------ *
   * Building the shell
   * ------------------------------------------------------------------ */

  let host = null, footer = null, mode = "one", current = 0;

  function findSource(name) {
    const steps = Array.from(body.querySelectorAll(".mkp-step"));
    return steps.find(s => {
      const n = s.querySelector(".mkp-step-name");
      return n && n.textContent.trim() === name;
    }) || null;
  }

  function build() {
    const banner = document.getElementById("mkp-banner");
    /* Save-and-exit lives loose at the end of the panel rather than inside
       any one step, so it would go with the rest when the body is cleared —
       and its listener with it. It is kept, hidden, and the new Save button
       forwards to it. */
    const doneBtn = document.getElementById("mkp-done");

    host = document.createElement("div");
    host.id = "gd-host";

    /* Take one step at a time, or see the lot. */
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

    STEPS.forEach((step, i) => {
      const card = document.createElement("div");
      card.className = "gd-step";
      card.dataset.key = step.key;

      const head = document.createElement("button");
      head.type = "button";
      head.className = "gd-head";
      head.innerHTML =
        '<span class="gd-tick" aria-hidden="true"></span>' +
        '<span class="gd-htext">' +
          '<span class="gd-q"></span>' +
          '<span class="gd-hint"></span>' +
        "</span>" +
        '<span class="gd-chev" aria-hidden="true">▸</span>';
      head.querySelector(".gd-q").textContent = step.q;
      head.querySelector(".gd-hint").textContent = step.hint;
      /* Clicking a step opens it and shuts the others — in either view. */
      head.addEventListener("click", () => goTo(i));
      card.appendChild(head);

      const bodyEl = document.createElement("div");
      bodyEl.className = "gd-body";

      if (step.build) {
        bodyEl.appendChild(step.build());
      } else {
        const src = findSource(step.src);
        if (src) {
          /* The old numbered title is replaced by the question above it. */
          const t = src.querySelector(".mkp-step-title");
          if (t) t.remove();
          src.classList.add("gd-adopted");
          bodyEl.appendChild(src);
        }
      }
      (step.adopt || []).forEach(sel => {
        const extra = $(sel);
        if (extra) bodyEl.appendChild(extra);
      });

      /* Back and on, between every pair of steps. */
      const nav = document.createElement("div");
      nav.className = "gd-nav";
      nav.innerHTML =
        '<button type="button" class="gd-arrow" data-go="-1">← Back</button>' +
        '<span class="gd-count"></span>' +
        '<button type="button" class="gd-arrow gd-next" data-go="1">Next →</button>';
      nav.addEventListener("click", e => {
        const b = e.target.closest("[data-go]");
        if (b) goTo(i + (+b.dataset.go));
      });
      bodyEl.appendChild(nav);

      card.appendChild(bodyEl);
      host.appendChild(card);
    });

    host.appendChild(buildFooter());

    /* The banner stays at the top; everything else is now inside the shell. */
    body.innerHTML = "";
    if (banner) body.appendChild(banner);
    body.appendChild(host);
    if (doneBtn) { doneBtn.hidden = true; host.appendChild(doneBtn); }

    applyAxis(3, true);
    setMode("one");
    goTo(0);
  }

  /* ------------------------------------------------------------------ *
   * The read-back and the two ways out
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
          <span class="gd-b-d">The setup is kept on this computer and the page opens with it from now on</span>
        </button>
        <button type="button" class="gd-wipe" id="gd-wipe">
          <span class="gd-wipe-fill" aria-hidden="true"></span>
          <span class="gd-b-t gd-wipe-label">Hold to throw it all away</span>
          <span class="gd-b-d">Everything here is deleted and the built-in demo comes back</span>
        </button>
      </div>`;

    footer.querySelector("#gd-save").addEventListener("click", () => {
      const d = document.getElementById("mkp-done");
      if (d) d.click();
    });
    bindHold(footer.querySelector("#gd-wipe"), () => {
      const f = document.getElementById("mkp-forget");
      if (f) f.click();
    });
    return footer;
  }

  /* Three seconds on the button, with the bar filling under the cursor the
     whole time. Letting go early cancels it. Same shape as the reset in
     Settings, and for the same reason: this one cannot be undone. */
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

  /* What a machinist would say if you asked them to talk you through it. */
  function paintSummary() {
    const lead = document.getElementById("gd-sum-lead");
    const list = document.getElementById("gd-sum-list");
    if (!lead || !list) return;

    const S = readSetup();

    lead.textContent =
      "You're on " + AXES[axis].says + ". " +
      (S.metal
        ? "You're cutting " + S.metal + (S.size ? ", " + S.size : "") + ". "
        : "There's no metal in the vice yet. ") +
      (S.slide
        ? "It's held " + S.slide
            + (S.origin ? ", and zero is set on " + S.origin + "." : ", and zero hasn't been set yet.")
        : "") +
      (S.tools ? " There " + (S.tools === 1 ? "is one cutter" : "are " + S.tools + " cutters")
                 + " in the table." : " No cutters have been set up.") +
      (S.moves ? " The program runs " + S.moves.toLocaleString() + " moves." : " No program is loaded yet.");

    const rows = [
      ["Machine", AXES[axis].name + " mill"],
      ["Holding", S.vise || "—"],
      ["Metal", S.metal || "nothing yet"],
      ["Size", S.size || "—"],
      ["In the jaws", S.slide || "—"],
      ["Zero on", S.origin || "not set"],
      ["Cutters", S.tools ? String(S.tools) : "none"],
      ["Program", S.moves ? S.moves.toLocaleString() + " moves" : "none loaded"],
    ];
    list.innerHTML = rows.map(([k, v]) =>
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

    const origin = lit("#mkp-origin-modes [data-mkporigin].on");
    if (origin) out.origin = origin;

    try {
      const fx = window.PartModels && window.PartModels.fixture;
      const st = fx && fx.state && fx.state();
      if (st && st.vises) {
        const v = st.vises.find(x => x.key === st.vise);
        out.vise = v ? v.name : st.vise;
      }
    } catch (e) {   }

    try { out.tools = (typeof toolTable !== "undefined") ? toolTable.size : 0; } catch (e) { out.tools = 0; }
    try { out.moves = (typeof allSegments !== "undefined") ? allSegments.length : 0; } catch (e) { out.moves = 0; }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Which step is open
   * ------------------------------------------------------------------ */

  const cards = () => Array.from(host.querySelectorAll(".gd-step"));

  function setMode(m) {
    mode = (m === "all") ? "all" : "one";
    host.classList.toggle("is-all", mode === "all");
    host.querySelectorAll("[data-mode]").forEach(b =>
      b.classList.toggle("on", b.dataset.mode === mode));
    paintOpen();
  }

  function goTo(i) {
    current = Math.max(0, Math.min(i, STEPS.length - 1));
    paintOpen();
    const card = cards()[current];
    if (card) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /* One step open at a time in either view — opening one shuts the rest.
     "Show me everything" keeps every heading on screen so the whole job is
     legible at a glance; it is the bodies that take turns. */
  function paintOpen() {
    cards().forEach((card, i) => {
      card.classList.toggle("is-open", i === current);
      const nav = card.querySelector(".gd-count");
      if (nav) nav.textContent = "Step " + (i + 1) + " of " + STEPS.length;
      const back = card.querySelector('[data-go="-1"]');
      const next = card.querySelector('[data-go="1"]');
      if (back) back.disabled = i === 0;
      if (next) next.textContent = (i === STEPS.length - 1) ? "Done →" : "Next →";
    });
    paintChecks();
    paintSummary();
  }

  function paintChecks() {
    if (!host) return;
    cards().forEach(card => {
      card.classList.toggle("is-done", !!done[card.dataset.key]);
    });
  }

  /* A step counts as answered once the thing it asks about exists. Cheap to
     work out, so it is simply re-read rather than tracked. */
  function sniff() {
    if (!host) return;
    try {
      done.stock   = !!(window.PartModels && window.PartModels.bodyOf && window.PartModels.bodyOf("stock"));
      done.vice    = !!$("#mkp-slide [data-mkpslide].on");
      done.tools   = (typeof toolTable !== "undefined") && toolTable.size > 0;
      done.program = (typeof allSegments !== "undefined") && allSegments.length > 0;
      done.holding = !!(window.PartModels && window.PartModels.bodyOf && window.PartModels.bodyOf("vise"));
      done.extras  = true;
    } catch (e) {   }
    paintChecks();
    paintSummary();
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */

  function boot() {
    if (!body.querySelector(".mkp-step")) return;   // already built, or empty
    build();
    setInterval(() => {
      if (section.offsetParent !== null) sniff();
    }, 700);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.Guide = { summary: paintSummary, go: goTo };
})();
