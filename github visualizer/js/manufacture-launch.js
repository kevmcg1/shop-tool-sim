/* Opens the Manufacture workspace (manufacture/index.html) full screen over the visualizer.
 * The page is large, so it only loads the first time the button is pressed. */
(function () {
  "use strict";
  var root = null, frame = null;

  function build() {
    root = document.createElement("div");
    root.id = "mf-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Manufacture");
    root.innerHTML =
      '<div class="mf-head"><button class="mf-back" type="button"><i class="fa-solid fa-arrow-left"></i>Back to visualizer</button>' +
      '<div class="mf-title"><i class="fa-solid fa-industry"></i>Manufacture<span> · model, toolpaths, simulation and G-code</span></div></div>' +
      '<iframe title="Manufacture" allow="fullscreen"></iframe>';
    document.body.appendChild(root);
    frame = root.querySelector("iframe");
    root.querySelector(".mf-back").addEventListener("click", close);
  }

  function open() {
    if (!root) build();
    if (!frame.getAttribute("src")) frame.setAttribute("src", "manufacture/index.html");
    root.classList.add("show");
    document.body.style.overflow = "hidden";
    try { frame.focus(); } catch (e) {}
  }

  function close() {
    if (!root) return;
    root.classList.remove("show");
    document.body.style.overflow = "";
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("#btn-manufacture")) { e.preventDefault(); open(); }
  });
  window.Manufacture = { open: open, close: close };
})();
