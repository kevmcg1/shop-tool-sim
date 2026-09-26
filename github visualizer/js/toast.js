/* showToast lives here rather than in iso-follow.js so it exists before
   anything that runs at load time can reach for it — loadGCode() ends with a
   toast, and demo-programs.js calls loadGCode while the page is still parsing. */

/* ------------------------------------------------------------------ *
 * VPBusy — "something is animating, keep drawing".
 *
 * The frame loop in playback-ui.js throttles itself to about six frames
 * a second once nothing has happened for half a second. That is right
 * for an idle scene and wrong for anything animating on its own clock:
 * a solid disintegrating, the dashed marching ants, the toolpath fading
 * out. Each of those ran its own rAF, wrote its uniforms, and then
 * waited up to 160 ms for a frame to actually show it — which is what
 * read as the animation stalling halfway through.
 *
 * Anything with an animation in flight holds a key here for the length
 * of it. While one key is held the loop draws every frame.
 *
 * It lives in toast.js because that is the first of our scripts to run,
 * so every later module can reach it at load time.
 * ------------------------------------------------------------------ */
window.VPBusy = (function () {
  const held = new Set();
  return {
    hold:    key => { held.add(key); },
    release: key => { held.delete(key); },
    active:  () => held.size > 0,
  };
})();

var _toastTimer;

/* Every message says two things now: what just happened, in three or four
   words, and what that actually means. "Grid OFF" told you the switch had
   moved, which you knew — you had just pressed it. "Grid off / The squares on
   the floor are hidden. The part and the toolpath are untouched." tells you
   what you are now looking at.
 *
 * showToast(title, body) is the shape to use. A single string still works and
 * is split on the first em dash, so the older "Name — what it does" messages
 * come out right without being rewritten. */
function showToast(title, body) {
  const TOAST_MS = 5000, TOAST_FADE_MS = 400;
  const el = document.getElementById('toast');
  if (!el) return;

  let head = String(title == null ? '' : title);
  let text = (body == null) ? '' : String(body);

  if (!text) {
    const cut = head.indexOf(' — ');
    if (cut > 0) { text = head.slice(cut + 3).trim(); head = head.slice(0, cut).trim(); }
  }

  el.innerHTML = '';
  const h = document.createElement('span');
  h.className = 'toast-title';
  h.textContent = head;
  el.appendChild(h);
  if (text) {
    const d = document.createElement('span');
    d.className = 'toast-body';
    d.textContent = text;
    el.appendChild(d);
  }
  el.classList.toggle('is-bare', !text);

  el.classList.remove('show', 'fading');
  void el.offsetWidth;
  el.classList.add('show');
  /* Re-place it: the stock bar may have appeared since the last message. */
  if (window.VPLayout) window.VPLayout();
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.classList.add('fading');
    _toastTimer = setTimeout(() => {
      el.classList.remove('show', 'fading');
      /* Leaving the stack frees the row for whatever is still up there. */
      if (window.VPLayout) window.VPLayout();
    }, TOAST_FADE_MS);
  }, TOAST_MS);
}
