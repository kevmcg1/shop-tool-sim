/* Press "-" to unlock everything and clear the popups.
 *
 * While unlocked: every open popup is closed, the guide's "not everything is
 * answered" prompt and the toasts stay away, anything disabled in the sidebar
 * is switched on, and the soft jaw maker drops its auto settings and its
 * limits. Press "-" again to put it all back. The "erase everything" prompt is
 * left alone on purpose, since it guards unsaved work.
 */
(function () {
  "use strict";
  var on = false, obs = null, freed = [];

  var css = document.createElement("style");
  css.textContent = "body.unlock-all #toast{display:none!important}";
  document.head.appendChild(css);

  function typing(t) {
    if (!t) return false;
    if (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return true;
    return t.tagName === "INPUT" && !/^(checkbox|radio|button|range)$/.test(t.type || "");
  }

  function closePopups() {
    document.querySelectorAll(".modal-overlay.show").forEach(function (m) { m.classList.remove("show"); });
  }

  function enableAll() {
    document.querySelectorAll("#sidebar [disabled]").forEach(function (el) {
      if (freed.indexOf(el) < 0) freed.push(el);
      el.removeAttribute("disabled");
    });
  }

  function patchModals() {
    if (typeof ModalSystem === "undefined" || ModalSystem.__unlockPatched) return;
    var open = ModalSystem.open;
    ModalSystem.open = function (id) {
      if (on && id === "gd-leave-modal") {
        var go = document.getElementById("gd-leave-go");
        if (go) go.click();
        return;
      }
      return open.apply(this, arguments);
    };
    ModalSystem.__unlockPatched = true;
  }

  function set(v) {
    on = v;
    document.body.classList.toggle("unlock-all", on);
    patchModals();
    if (on) {
      closePopups();
      enableAll();
      obs = new MutationObserver(function () { if (on) enableAll(); });
      obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["disabled"], childList: true });
    } else {
      if (obs) obs.disconnect();
      obs = null;
      freed = [];
    }
    if (window.JawMaker && window.JawMaker.setUnlocked) window.JawMaker.setUnlocked(on);
  }

  window.addEventListener("keydown", function (e) {
    if (e.key !== "-" && e.code !== "NumpadSubtract") return;
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    e.preventDefault();
    set(!on);
  });

  window.UnlockAll = { set: set, isOn: function () { return on; } };
})();
