// How the "How do I use it?" walkthroughs (js/guide.js on the four tools, js/telescopic.js on the gauge) look: one shared style.
//
//   Phases    every step belongs to one of four, each with its own color that tints the step badge, the progress bar, the highlight ring,
//             the arrows and the bold words: Get ready (blue), Try it yourself (green), Read it (amber), Check it (violet).
//   Progress  a bar of small segments, one per step, colored by phase, the current one lit.
//   Lines     the first line leads; a line that tells you to do something (Press, Click, Drag, Turn...) gets a colored marker; a line that
//             warns or reassures ("Not on 0? That's common") is a tip card; one that confirms ("Perfect", "Nice") is a green note.
//   Keys      every key named in a step is drawn as a keycap, like  [A]  or  [Esc] , and a row of the shortcuts that step is about
//             sits under the text (what each tool answers to is listed in KEYS below, the same as its help section).
//
//   window.__gdRich.lines(text)                      the step's text as HTML
//   window.__gdRich.paint(root, card, steps, i, tool)   the badge, the bar, the colors and the shortcut row
(function(){
  const PHASES = [
    { id: 'prep',  name: 'Get ready', c: '#5b93ea' },
    { id: 'do',    name: 'Try it yourself', c: '#5fcf8a' },
    { id: 'read',  name: 'Read it',   c: '#e8c547' },
    { id: 'check', name: 'Check it',  c: '#a78bfa' }
  ];
  // The phase of every step, in order: a walkthrough only ever moves forward through Get ready, Try it yourself, Read it and Check it. A step can say its
  // own (step.phase); otherwise a word in its title moves it on to the next phase it belongs to, and it stays there until a later one does.
  const WHERE = [
    ['do',    /close it|run the rod|bring the|insert|push the|unlock|rock |square it|lock\b|take it|slide|lower|set the|off it goes|light touch|press|touch/],
    ['read',  /look around|^read|read the|find |count|flat view|add |focus|close-up|dial\b|thimble|vernier|reading|inch mark|sleeve|first number/],
    ['check', /add them up|shortcut|perfect|same number|tolerance|try one|for free|won’t get|you won’t/]
  ];
  const ORDER = ['prep', 'do', 'read', 'check'], memo = new WeakMap();
  function phasesOf(steps){
    const hit = memo.get(steps);
    if (hit && hit.n === steps.length) return hit.p;
    let cur = 0; const out = steps.map(s => {
      if (s.phase && ORDER.includes(s.phase)) cur = Math.max(cur, ORDER.indexOf(s.phase));
      else { const t = (s.title || '').toLowerCase(); if (/^(zero|first,|clean|pick a|meet the gauge|choose|let’s)/.test(t)) return PHASES[cur]; for (const [id, re] of WHERE){ const k = ORDER.indexOf(id); if (k > cur && re.test(t)){ cur = k; break; } } }
      return PHASES[cur];
    });
    memo.set(steps, { n: steps.length, p: out });
    return out;
  }
  const phaseOf = (step, i, n, steps) => steps ? phasesOf(steps)[i] : PHASES[0];
  // the keys each tool answers to: [keys, what it does, words in a step's text that make it relevant]
  const KEYS = {
    mic:    [[['↑','↓'], '0.001″', /thimble|turn|move|fine|close|open/i], [['Shift', '↑', '↓'], '0.0001″ steps', /fine|ten-?thousandth|vernier|0\.0001/i], [['PgUp', 'PgDn'], '0.025″ steps', /sleeve line|0\.025|coarse/i], [['R'], 'Ratchet', /ratchet/i], [['L'], 'Lock', /lock/i], [['A'], 'Auto measure', /auto measure/i]],
    depth:  [[['↑','↓'], '0.001″', /thimble|turn|move|fine|lower|raise/i], [['Shift', '↑', '↓'], '0.010″ steps', /coarse|shift/i], [['PgUp', 'PgDn'], '0.025″ steps', /sleeve line|0\.025/i], [['R'], 'Ratchet', /ratchet/i], [['L'], 'Lock', /lock|clamp/i], [['A'], 'Auto measure', /auto measure/i], [['C'], 'Section view', /section/i]],
    dial:   [[['←','→'], '0.001″', /slider|jaw|move|close|open|fine/i], [['Shift', '←', '→'], '0.010″ steps', /coarse|shift/i], [['PgUp', 'PgDn'], '0.100″ steps', /hundred thou line|0\.100/i], [['F'], 'Fine adjust', /fine/i], [['L'], 'Lock the slider', /lock/i], [['B'], 'Lock the bezel', /bezel/i], [['Z'], 'Zero the bezel', /zero the bezel|bezel.*zero|turn the bezel/i], [['A'], 'Auto measure', /auto measure/i]],
    vern:   [[['←','→'], '0.001″', /slider|jaw|move|close|open|fine/i], [['Shift', '←', '→'], '0.010″ steps', /coarse|shift/i], [['PgUp', 'PgDn'], '0.100″ steps', /hundred thou line|0\.100/i], [['F'], 'Fine adjust', /fine/i], [['L'], 'Lock the slider', /lock/i], [['A'], 'Auto measure', /auto measure/i]],
    height: [[['↑','↓'], '0.001″', /slider|scriber|move|raise|lower|fine/i], [['Shift'], '0.050″ steps', /coarse|shift/i], [['F'], 'Fine adjust', /fine/i], [['U'], 'Clamp the upper unit', /upper unit|clamp/i], [['S'], 'Clamp the slider', /clamp the slider|slider clamp/i], [['V'], 'Vernier view', /vernier view|close-up/i]],
    gauge:  [[['A'], 'Auto measure', /auto measure|in a hurry/i], [['L'], 'Lock / unlock the knob', /lock|unlock/i], [['I'], 'Insert / take out', /insert|take it out|slide it in/i], [['M'], 'Measure', /measure the gauge|measure across|measure it/i], [['R'], 'Reset the gauge', /reset|start over/i], [['←','→'], 'Rock the handle', /\brock (the|it|through)|arrow keys|drag the gauge/i], [['↑','↓'], 'Depth in the bore', /depth|deeper|down into/i]]
  };
  const KEYNAMES = 'Esc|Shift|Ctrl|Enter|Tab|Space|PgUp|PgDn|Backspace';
  const cap = k => '<kbd class="gd-k' + (/^[←→↑↓]$/.test(k) ? ' arr' : k.length > 1 ? ' wide' : '') + '">' + k + '</kbd>';
  const OKRE = /(^|\b)(nice|perfect|spot on|well done|you’re good|you’re ready|that’s a (tool|gage|micrometer|caliper|gauge) you can trust|agree)/i;
  const TIPRE = /^(tip|heads up|careful|remember|note|not on|slip up|that’s (a common|normal|the most common)|a little grit|chips,|if it read|common)/i;
  const KEYRE = /^that’s why tolerances exist/i;   // the one line a walkthrough most wants remembered: lit up as a callout
  const ACTRE = /^(press|click|drag|turn|scroll|open|choose|pick|tap|use|close|slide|lock|unlock|rock|wipe|hold|touch|bring|swing|pan|zoom|point|try)\b/i;
  function lines(text){
    return String(text).split('\n').map((l, i) => {
      // keys named in the text: <b>Esc</b>, Esc, and [[A]] (marked with control characters while it is worked out, so nothing is done twice)
      let h = l.replace(/\[\[([^\]]+)\]\]/g, '\u0001$1\u0002')
        .replace(new RegExp('<b>(' + KEYNAMES + ')</b>', 'g'), '\u0001$1\u0002')
        .replace(new RegExp('(^|[^\\w>\u0001])(' + KEYNAMES + ')(?![\\w<\u0002])', 'g'), '$1\u0001$2\u0002')
        .replace(/\u0001([^\u0002]+)\u0002/g, (m, k) => cap(k));
      const plain = h.replace(/<[^>]+>/g, '').trim();
      const kind = KEYRE.test(plain) ? 'key' : i === 0 ? 'lead' : TIPRE.test(plain) ? 'tip' : OKRE.test(plain) ? 'ok' : ACTRE.test(plain) ? 'act' : '';
      return '<span class="gd-l' + (kind ? ' ' + kind : '') + '">' + h + '</span>';
    }).join('');
  }
  const css = document.createElement('style');
  css.textContent = `
.gd{--ph:#5b93ea}
.gd-card{border-color:color-mix(in srgb,var(--ph) 55%,#2a2d31)!important;box-shadow:0 14px 40px rgba(0,0,0,.55),0 0 0 1px color-mix(in srgb,var(--ph) 25%,transparent),0 0 36px -8px color-mix(in srgb,var(--ph) 55%,transparent)!important;transition:border-color .35s ease,box-shadow .35s ease}
.gd-card{width:min(360px,calc(100vw - 24px))!important}
.gd-card .gd-head{display:flex;align-items:center;gap:8px;margin:0 28px 8px 0;flex-wrap:wrap}
.gd-card .gd-badge{display:inline-flex;align-items:center;gap:6px;padding:2px 9px 2px 3px;border-radius:999px;background:color-mix(in srgb,var(--ph) 16%,transparent);border:1px solid color-mix(in srgb,var(--ph) 55%,transparent);color:var(--ph);font-size:10.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;white-space:nowrap;transition:all .35s ease}
.gd-card .gd-badge b{display:grid;place-items:center;min-width:19px;height:19px;padding:0 4px;border-radius:999px;background:var(--ph);color:#0b0c0e;font-size:11px;font-weight:800;letter-spacing:0;font-variant-numeric:tabular-nums}
.gd-card h4{margin:0 26px 8px 0!important;font-size:16.5px!important;font-weight:700!important;line-height:21px;letter-spacing:-.005em}
.gd-card .gd-head+h4{margin-top:0}
.gd-card p{margin:0;display:grid;gap:7px;color:var(--muted,#9aa0a8)}
.gd-card p b{color:color-mix(in srgb,var(--ph) 40%,#fff)}
.gd-card p,.gd-l{line-height:20px}   /* whole pixels, so no line of text lands between two pixel rows */
.gd-l{display:block}
.gd-l+.gd-l{margin-top:0!important}
.gd-l.lead{color:var(--ink,#ececee);font-size:14.5px;font-weight:550}
.gd-l.act{position:relative;padding:6px 10px 6px 30px;border-radius:9px;background:color-mix(in srgb,var(--ph) 11%,transparent);border:1px solid color-mix(in srgb,var(--ph) 30%,transparent);color:var(--ink,#ececee)}
.gd-l.act::before{content:"";position:absolute;left:11px;top:calc(50% - 5px);width:8px;height:8px;border-radius:50%;background:var(--ph);box-shadow:0 0 0 4px color-mix(in srgb,var(--ph) 25%,transparent)}
.gd-l.tip{padding:6px 10px 6px 12px;border-radius:9px;border-left:3px solid #e8a547;background:rgba(232,165,71,.1);color:#e8d3a8}
.gd-l.ok{padding:6px 10px 6px 12px;border-radius:9px;border-left:3px solid #5fcf8a;background:rgba(95,207,138,.1);color:#bfeed0}
.gd-l.key{padding:10px 12px;border-radius:10px;border:1px solid var(--ph);background:color-mix(in srgb,var(--ph) 22%,transparent);box-shadow:0 0 18px -4px color-mix(in srgb,var(--ph) 70%,transparent);color:var(--ink,#fff);font-size:15px;font-weight:700;line-height:1.35}
.gd-l.key b{color:inherit}
.gd-l.ok b,.gd-l.tip b{color:inherit;font-weight:700}
.gd-seg{display:flex;gap:3px;margin:12px 0 0}
.gd-seg i{flex:1;height:4px;border-radius:3px;background:color-mix(in srgb,var(--sc) 28%,#23262a);transition:background-color .3s ease,transform .3s ease}
.gd-seg i.done{background:color-mix(in srgb,var(--sc) 75%,#23262a)}
.gd-seg i.now{background:var(--sc);transform:scaleY(1.9);box-shadow:0 0 8px color-mix(in srgb,var(--sc) 70%,transparent)}
.gd-keys{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:11px;padding-top:10px;border-top:1px solid var(--line,#26292e)}
.gd-keys[hidden]{display:none}
.gd-keys span{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted,#9aa0a8)}
.gd-keys .caps{display:inline-flex;gap:3px}
kbd.gd-k{display:inline-grid;place-items:center;min-width:24px;height:24px;padding:0 6px;border-radius:6px;background:linear-gradient(#2b2f35,#1c1f24);border:1px solid rgba(255,255,255,.22);border-bottom-width:3px;box-shadow:0 1px 0 rgba(0,0,0,.6);color:#fff;font:700 12px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;vertical-align:middle;margin:0 1px}
kbd.gd-k.wide{padding:0 8px;font-size:11px;letter-spacing:.02em}
kbd.gd-k.arr{font-size:13px;color:var(--ph)}
.gd-keys kbd.gd-k{height:22px;min-width:22px}
@media (prefers-reduced-motion: reduce){.gd-card,.gd-card .gd-badge,.gd-seg i{transition:none}}`;
  document.head.appendChild(css);

  // the badge, the bar, the colors and the shortcut row for step i of n (the card is built by the caller, with h4, p and .gd-foot)
  function paint(root, card, steps, i, tool){
    const n = steps.length, ph = phasesOf(steps)[i];
    (root || card).style.setProperty('--ph', ph.c);
    if (root) root.style.setProperty('--accent', ph.c);
    let head = card.querySelector('.gd-head');
    if (!head){ head = document.createElement('div'); head.className = 'gd-head'; const h4 = card.querySelector('h4'); h4.parentNode.insertBefore(head, h4); head.innerHTML = '<span class="gd-badge"><b></b><span></span></span>'; }
    head.querySelector('b').textContent = i + 1; head.querySelector('.gd-badge span').textContent = ph.name;
    // the bar: one segment per step, in its phase's color
    let bar = card.querySelector('.gd-seg');
    if (!bar){ bar = document.createElement('div'); bar.className = 'gd-seg'; bar.setAttribute('aria-hidden', 'true'); const foot = card.querySelector('.gd-foot'); foot.parentNode.insertBefore(bar, foot); }
    const all = phasesOf(steps), sig = all.map(q => q.id).join();
    if (bar.dataset.sig !== sig){
      bar.dataset.sig = sig; bar.innerHTML = '';
      all.forEach(q => { const e = document.createElement('i'); e.style.setProperty('--sc', q.c); bar.appendChild(e); });
    }
    [...bar.children].forEach((e, k) => { e.classList.toggle('done', k < i); e.classList.toggle('now', k === i); });
    return ph;
  }
  // the shortcut row for a step: the keys the tool has that its text is about (text can be a function's result)
  function shortcuts(card, tool, text, extra){
    let row = card.querySelector('.gd-keys');
    if (!row){ row = document.createElement('div'); row.className = 'gd-keys'; const foot = card.querySelector('.gd-seg') || card.querySelector('.gd-foot'); foot.parentNode.insertBefore(row, foot); }
    const plain = String(text).replace(/<[^>]+>/g, ' ');
    const asks = String(text).split('\n').slice(1).some(l => !/\b(Exit|Esc)\b/.test(l) && ACTRE.test(l.replace(/<[^>]+>/g, '').trim()));   // (shown only where the step asks you to do something)
    const hits = (!asks ? [] : (KEYS[tool] || []).filter(k => k[2].test(plain))).slice(0, 3).map(k => [k[0], k[1]]).concat(extra || []);
    row.hidden = !hits.length;
    row.innerHTML = hits.map(([ks, d]) => '<span><span class="caps">' + ks.map(cap).join('') + '</span>' + d + '</span>').join('');
  }
  // the cleaning reminder, appended to every "clean the contact points" step
  const PAPER = '\nThen slide a clean slip of paper between the contact points, close them lightly on it, and pull it out.\nAny dirt on the paper came off the tool.\nA clean slip is fine too: checking is the proper procedure every time, whether or not anything comes off.';
  // a small picture in the card: two contact faces, a slip of paper sliding in between, the dirt moving onto it, and the paper taken out with the dirt on it
  const SPECKS = [[22, 10, 2.4], [34, 18, 1.8], [47, 8, 2.1], [58, 20, 1.6], [70, 12, 2.6], [29, 24, 1.5], [52, 23, 2]];
  function paper(card, on){
    let box = card.querySelector('.gd-paper');
    if (!on){ if (box) box.hidden = true; return; }
    if (!box){
      box = document.createElement('div'); box.className = 'gd-paper'; box.setAttribute('aria-hidden', 'true');
      // the dirt sits on the faces; once it has come off, each speck lies on the outside of the paper, on the side it came from (never inside it).
      // The paper rests at x = 70 when the faces close on it, so a speck is just under the spot on the face it came from.
      const dirt = SPECKS.map(([x, y, r], k) => `<circle cx="${60 + x*2}" cy="${k % 2 ? 62 : 34}" r="${r}"/>`).join('');
      const onpaper = SPECKS.map(([x, y, r], k) => `<circle cx="${60 + x*2 - 70}" cy="${k % 2 ? 57 + r*0.5 : 39 - r*0.5}" r="${r*0.9}"/>`).join('');
      box.innerHTML = `<svg viewBox="0 0 340 96"><rect class="pf" x="8" y="4" width="244" height="28" rx="6"/><rect class="pf" x="8" y="64" width="244" height="28" rx="6"/>
        <g class="pd">${dirt}</g><g class="pp"><rect x="0" y="39" width="150" height="18" rx="2"/><g class="ps">${onpaper}</g></g></svg>
        <span>The dirt comes off the tool and onto the paper.</span>`;
      const anchor = card.querySelector('.gd-keys') || card.querySelector('.gd-seg') || card.querySelector('.gd-foot');
      anchor.parentNode.insertBefore(box, anchor);
    }
    box.hidden = false;
  }
  css.textContent += `
.gd-paper{margin-top:11px;padding:9px 10px 8px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid var(--line,#26292e)}
.gd-paper[hidden]{display:none}
.gd-paper svg{display:block;width:100%;height:auto;overflow:hidden}
.gd-paper .pf{fill:#3a4048;stroke:#59616b;stroke-width:1.2}
.gd-paper .pd circle{fill:#8c7a5a;animation:gd-dirt 7s ease-in-out infinite}
.gd-paper .pp{animation:gd-slip 7s cubic-bezier(.45,.05,.3,1) infinite}
.gd-paper .pp>rect{fill:#f4f1e8;stroke:#cfc9b8;stroke-width:1;filter:drop-shadow(0 2px 2px rgba(0,0,0,.45))}
.gd-paper .ps circle{fill:#7a6848;animation:gd-spk 7s ease-in-out infinite}
.gd-paper span{display:block;margin-top:6px;font-size:11.5px;color:var(--muted,#9aa0a8);text-align:center}
@keyframes gd-slip{0%{transform:translateX(262px)}16%{transform:translateX(70px)}38%{transform:translateX(70px)}56%{transform:translateX(262px)}92%{transform:translateX(262px)}100%{transform:translateX(262px)}}
@keyframes gd-dirt{0%,16%{opacity:1}34%,92%{opacity:.12}100%{opacity:1}}
@keyframes gd-spk{0%,18%{opacity:0}36%,92%{opacity:1}100%{opacity:0}}
@media (prefers-reduced-motion: reduce){.gd-paper .pd circle,.gd-paper .pp,.gd-paper .ps circle{animation:none}.gd-paper .pp{transform:translateX(262px)}.gd-paper .pd circle{opacity:.12}.gd-paper .ps circle{opacity:1}}`;
  window.__gdRich = { lines, paint, shortcuts, paper, PAPER, phaseOf, PHASES, cap };
})();
