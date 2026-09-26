(function () {
  'use strict';

  var DevToolsGuard = (function () {
    var COMBOS = [
      { key: 'f12' },
      { key: 'i', ctrl: true, shift: true },
      { key: 'j', ctrl: true, shift: true },
      { key: 'c', ctrl: true, shift: true },
      { key: 'k', ctrl: true, shift: true },
      { key: 'e', ctrl: true, shift: true },
      { key: 'm', ctrl: true, shift: true },
      { key: 'i', meta: true, alt: true },
      { key: 'j', meta: true, alt: true },
      { key: 'c', meta: true, alt: true },
      { key: 'u', meta: true, alt: true },
      { key: 'u', ctrl: true },
      { key: 's', ctrl: true },
      { key: 'u', meta: true },
      { key: 's', meta: true }
    ];

    function matches(event, combo) {
      var key = (event.key || '').toLowerCase();
      if (key !== combo.key) return false;
      if (!!combo.ctrl !== (event.ctrlKey || false)) return false;
      if (!!combo.shift !== (event.shiftKey || false)) return false;
      if (!!combo.alt !== (event.altKey || false)) return false;
      if (!!combo.meta !== (event.metaKey || false)) return false;
      return true;
    }

    function isBlocked(event) {
      for (var i = 0; i < COMBOS.length; i++) {
        if (matches(event, COMBOS[i])) return true;
      }
      return false;
    }

    function block(event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      return false;
    }

    function onKey(event) {
      if (isBlocked(event)) return block(event);
    }

    function onContextMenu(event) {
      return block(event);
    }

    function onDragStart(event) {
      if (event.target && event.target.tagName === 'IMG') return block(event);
    }

    return {
      init: function () {
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('keyup', onKey, true);
        window.addEventListener('contextmenu', onContextMenu, true);
        window.addEventListener('dragstart', onDragStart, true);
      }
    };
  })();

  DevToolsGuard.init();
  window.DevToolsGuard = DevToolsGuard;
})();
