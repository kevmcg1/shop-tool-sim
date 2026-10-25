// Gives every status message (#toast in each tool) the dark card, the icon and the outline that draws itself, like the Gear Maker's.
// The tools keep doing what they did (set the text, add or remove "show"); this only rebuilds the inside of the card when a message appears.
(function(){
  const ICON = {
    ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    bad: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.1"/>',
    warn: '<path d="M12 4 2.8 20h18.4zM12 10v5M12 17.5v.1"/>'
  };
  const kindOf = t => /jam|hit the|too big|couldn.?t|can.?t |cannot|failed|error|wrong|not allowed/i.test(t) ? 'bad' : /^(take|lock|unlock|first|pick|choose|turn|move|put|set|close|open)\b|before|first\.?$|must|need/i.test(t) ? 'warn' : 'ok';
  const NS = 'http://www.w3.org/2000/svg';
  function build(el){
    if(!el.classList.contains('show') || el.querySelector('.t-tx')) return;
    const text = el.textContent.trim(); if(!text) return;
    const kind = kindOf(text);
    el.classList.remove('ok', 'bad', 'warn'); if(kind !== 'ok') el.classList.add(kind);
    el.innerHTML = '<svg class="t-ic" viewBox="0 0 24 24" aria-hidden="true">' + ICON[kind] + '</svg><span class="t-tx"></span><svg class="t-ring" preserveAspectRatio="none" aria-hidden="true"><rect pathLength="1" x="0.75" y="0.75" rx="10" ry="10"/></svg>';
    el.querySelector('.t-tx').textContent = text;
    const r = el.querySelector('.t-ring rect'), b = el.getBoundingClientRect();
    r.setAttribute('width', Math.max(10, b.width - 1.5)); r.setAttribute('height', Math.max(10, b.height - 1.5));
    // start the icon and the outline again for this message
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  function watch(el){
    if(el._tfx) return; el._tfx = true;
    new MutationObserver(() => build(el)).observe(el, { attributes: true, attributeFilter: ['class'], childList: true });
    el.style.position = el.style.position || '';
  }
  const scan = root => (root.querySelectorAll ? root.querySelectorAll('.toast') : []).forEach(watch);
  scan(document);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if(n.nodeType === 1){ if(n.matches('.toast')) watch(n); scan(n); } })))
    .observe(document.documentElement, { childList: true, subtree: true });
})();
