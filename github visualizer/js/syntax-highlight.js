function gcodeTokenizeLine(line) {

  const escape = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  if (/^\s*;/.test(line)) return `<span class="tok-comment">${escape(line)}</span>`;
  if (/^\s*%/.test(line)) return `<span class="tok-pct">${escape(line)}</span>`;

  if (/^\s*O\d+/i.test(line)) {
    return line.replace(/^(\s*)(O\d+)(.*)/i, (_, ws, o, rest) =>
      escape(ws) + `<span class="tok-label">${escape(o)}</span>` + gcodeTokenizeRest(rest));
  }
  return gcodeTokenizeRest(line);
}

function gcodeTokenizeRest(line) {
  const escape = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let inlineComment = '';
  const parenMatch = line.match(/(\(.*)/);
  if (parenMatch) {
    inlineComment = `<span class="tok-comment">${escape(parenMatch[1])}</span>`;
    line = line.substring(0, parenMatch.index);
  }

  const result = line.replace(/([A-Z])\s*(-?\d*\.?\d+)/gi, (match, letter, num) => {
    const L = letter.toUpperCase();
    let cls;
    if (L === 'G') {
      const n = parseFloat(num);
      if (n === 98) cls = 'tok-g98';
      else if (n === 99) cls = 'tok-g99';
      else cls = 'tok-g';
    }
    else if (L === 'M') cls = 'tok-m';
    else if (L === 'T') cls = 'tok-t';
    else if ('XYZ'.includes(L)) cls = 'tok-xyz';
    else if ('ABC'.includes(L)) cls = 'tok-abc';
    else if ('IJK'.includes(L)) cls = 'tok-ijk';
    else if ('UVW'.includes(L)) cls = 'tok-uvw';
    else if (L === 'F') cls = 'tok-feed';
    else if (L === 'S') cls = 'tok-spindle';
    else if (L === 'P') cls = 'tok-p';
    else if (L === 'Q') cls = 'tok-q';
    else if (L === 'R') cls = 'tok-r';
    else if (L === 'H') cls = 'tok-h';
    else if (L === 'E') cls = 'tok-e';
    else if (L === 'L') cls = 'tok-l';
    else if (L === 'N') cls = 'tok-n';
    else if (L === 'O') cls = 'tok-o';
    else cls = 'tok-number';
    return `<span class="${cls}">${escape(letter)}${escape(num)}</span>`;
  });

  const semiResult = result.replace(/(;.*)$/, m => `<span class="tok-comment">${escape(m)}</span>`);
  return semiResult + inlineComment;
}

function updateHighlight(activeLine) {
  const text = gcodeInput.value;
  const lines = text.split('\n');

  const dimming = simActive && activeLine !== undefined && activeLine >= 0;
  gcodeHighlight.innerHTML = lines.map((line, i) => {
    const content = gcodeTokenizeLine(line) || '&nbsp;';
    const opacity = dimming ? (i === activeLine ? '1' : '0.2') : '1';
    return `<span class="hl-line" data-line="${i}" style="display:block;opacity:${opacity};transition:opacity 0.08s">${content}</span>`;
  }).join('') + '\n';

  gcodeHighlight.scrollTop = gcodeInput.scrollTop;
  gcodeHighlight.scrollLeft = gcodeInput.scrollLeft;
}

/* The line of the program the editor is showing as the one being read, or -1
   when nothing is marked.

   Machine state that belongs to a line rather than to a move — the coolant
   lamps — is read off this, so what the lamps say and what the editor is
   pointing at can never disagree. */
let editorActiveLine = -1;

function updateEditorActiveLine(lineIdx) {
  editorActiveLine = (typeof lineIdx === 'number') ? lineIdx : -1;

  const spans = gcodeHighlight.querySelectorAll('.hl-line');

  const dimming = simActive && lineIdx >= 0;
  spans.forEach(span => {
    const li = parseInt(span.dataset.line);
    span.style.opacity = dimming ? (li === lineIdx ? '1' : '0.2') : '1';
  });

  if (dimming && spans[lineIdx]) {
    const lineH = gcodeHighlight.scrollHeight / Math.max(spans.length, 1);
    const targetScroll = lineIdx * lineH - gcodeHighlight.clientHeight / 2 + lineH / 2;
    gcodeInput.scrollTop = Math.max(0, targetScroll);
    gcodeHighlight.scrollTop = gcodeInput.scrollTop;
  }
}

gcodeInput.addEventListener('scroll', () => {
  gcodeHighlight.scrollTop = gcodeInput.scrollTop;
  gcodeHighlight.scrollLeft = gcodeInput.scrollLeft;
});

const _origUpdateHighlight = updateHighlight;

const progressSlider = document.getElementById('viewport-progress-slider');
const editorStatus   = document.getElementById('editor-status');
const editorPanel    = document.getElementById('editor-panel');
const resizeHandle   = document.getElementById('editor-resize-handle');
