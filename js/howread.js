// "How do I read this?" under every measurement. A button sits just below the reading; it opens a small card with the value and the way a
// machinist would actually say it out loud in a shop ("two thirty-four and seven tenths", "twelve point three four"), plus a line on
// what the words mean (a thou, a tenth, a hundredth). It works on whatever the page prints, so every tool gets it without the tool's own
// code changing.
//
// In practice mode the reading is hidden, so the button sits by the answer box and says YOUR typed reading out loud instead of giving the
// answer away. With nothing typed yet it asks you to type one.
(function(){
  const css = document.createElement('style');
  css.textContent = `
.howread{display:inline-flex;align-items:center;gap:6px;margin-top:4px;padding:3px 9px 3px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);
  color:#9cc0ff;font:600 11px/1.3 "Inter",system-ui,sans-serif;letter-spacing:.01em;cursor:pointer;transition:background .15s,border-color .15s,color .15s,transform .12s}
.howread i{font-size:11px}
.howread:hover{background:rgba(88,151,255,.16);border-color:rgba(88,151,255,.5);color:#cfe0ff}
.howread:active{transform:scale(.96)}
.howread:focus-visible{outline:2px solid #5897ff;outline-offset:2px}
.howread.hr-p{margin-top:6px}
body:not(.practice) .howread.hr-p{display:none}
body.practice .howread.hr-main{display:none}
.hrx{position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,7,10,.55);opacity:0;visibility:hidden;transition:opacity .16s ease,visibility 0s linear .16s}
.hrx.on{opacity:1;visibility:visible;transition:opacity .16s ease,visibility 0s}
.hrx-card{width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;border-radius:14px;background:#15171d;color:#e6e9ef;border:1px solid rgba(255,255,255,.15);
  box-shadow:0 24px 60px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.06);font-family:"Inter",system-ui,sans-serif;transform:translateY(8px) scale(.97);transition:transform .18s cubic-bezier(.2,.8,.2,1)}
.hrx.on .hrx-card{transform:none}
.hrx-h{display:flex;align-items:center;gap:10px;padding:13px 16px 10px;border-bottom:1px solid rgba(255,255,255,.1)}
.hrx-h b{font-size:14px;font-weight:700;color:#fff}
.hrx-x{margin-left:auto;border:0;background:transparent;color:#a9b1bf;font-size:15px;cursor:pointer;padding:4px 6px;border-radius:6px}
.hrx-x:hover{background:rgba(255,255,255,.1);color:#fff}
.hrx-b{padding:6px 16px 16px}
.hrx-r{padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.hrx-r:last-of-type{border-bottom:0}
.hrx-v{font:700 26px/1.1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#fff;letter-spacing:.01em}
.hrx-v small{font-size:14px;font-weight:600;color:#a9b1bf;margin-left:4px}
.hrx-l{margin-top:9px;font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#7f8a9c}
.hrx-say{margin-top:3px;font-size:19px;font-weight:650;line-height:1.3;color:#cfe0ff}
.hrx-say:before{content:"\\201C"}.hrx-say:after{content:"\\201D"}
.hrx-full{margin-top:3px;font-size:13px;line-height:1.45;color:#b4bbc8}
.hrx-note{margin:6px 0 0;padding:9px 11px;border-radius:9px;background:rgba(255,255,255,.05);font-size:12px;line-height:1.5;color:#b4bbc8}
.hrx-note b{color:#e6e9ef}
.hrx-empty{padding:16px 0 6px;font-size:13px;line-height:1.55;color:#b4bbc8}
@media (prefers-reduced-motion: reduce){.hrx,.hrx.on,.hrx-card,.hrx.on .hrx-card,.howread{transition:none;transform:none}}`;
  document.head.appendChild(css);

  /* ---------- numbers into words ---------- */
  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function words(n) {
    n = Math.floor(n);
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
    if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + words(n % 100) : '');
    if (n < 1e6) return words(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + words(n % 1000) : '');
    return String(n);
  }
  const digitWords = s => s.split('').map(d => ONES[+d]).join(' ');
  const FRAC_NAMES = { 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth', 32: 'thirty-second', 64: 'sixty-fourth' };

  /* what a number is called in the shop: .250 is "two fifty", .205 is "two oh five", .034 is "thirty-four" */
  function shopThou(n3) {
    const h = Math.floor(n3 / 100), r = n3 % 100;
    if (n3 === 0) return '';
    if (h === 0) return words(r);
    if (r === 0) return ONES[h] + ' hundred';
    if (r < 10) return ONES[h] + ' oh ' + ONES[r];
    return ONES[h] + ' ' + words(r);
  }
  function fractionName(v, d) {
    const whole = Math.floor(v + 1e-9), f = v - whole;
    if (f < 1e-9) return null;
    for (const den of [2, 4, 8, 16, 32, 64]) {
      const k = Math.round(f * den);
      if (k > 0 && k < den && k % 2 === 1 || (den === 2 && k === 1)) {
        if (Math.abs(f - k / den) <= 0.5 * Math.pow(10, -d) * 0.6 + 1e-12) {
          const name = k === 1 ? (den === 2 ? 'a half' : 'a ' + FRAC_NAMES[den]) : words(k) + ' ' + FRAC_NAMES[den] + 's';
          return whole ? words(whole) + ' and ' + name + ' inches' : name + ' of an inch';
        }
      }
    }
    return null;
  }

  /* ---------- the two ways to say a reading ---------- */
  function sayInch(str) {
    const m = /^(-?)(\d*)\.?(\d*)$/.exec(str.trim()); if (!m) return null;
    const neg = m[1] ? 'minus ' : '', whole = +(m[2] || 0), f = m[3] || '', d = f.length;
    const padded = (f + '0000').slice(0, 4), n3 = +padded.slice(0, 3), t = +padded[3], extra = f.slice(4);
    const wholeTxt = whole ? words(whole) + (whole === 1 ? ' inch' : ' inches') : '';
    const tenths = t ? ' and ' + words(t) + (t === 1 ? ' tenth' : ' tenths') : '';
    let shop;
    if (!whole && !n3 && !t) shop = 'zero';
    else if (!n3 && !t) shop = wholeTxt + ', even';
    else {
      const th = n3 ? shopThou(n3) + (whole || t ? '' : ' thou') : '';
      shop = (wholeTxt ? wholeTxt + ', ' : '') + (n3 ? th : 'zero thou') + tenths;
      if (!n3 && t) shop = (wholeTxt ? wholeTxt + ', ' : '') + words(t) + (t === 1 ? ' tenth' : ' tenths');
      if (whole && n3 && !t) shop += ' thou';
      if (!whole && n3 && n3 < 100 && t) shop += ' thou';
    }
    let full = (wholeTxt ? wholeTxt + (n3 || t ? ' and ' : '') : '');
    if (n3 && t) full += words(n3) + ' and ' + words(t) + ' ' + (t === 1 ? 'tenth' : 'tenths') + ' of a thousandth of an inch';
    else if (t) full += words(t) + ' ' + (t === 1 ? 'tenth' : 'tenths') + ' of a thousandth of an inch';
    else if (n3) full += words(n3) + (n3 === 1 ? ' thousandth' : ' thousandths') + ' of an inch';
    else if (!whole) full = 'zero inches';
    else full += '';
    const v = parseFloat(str), fr = isFinite(v) ? fractionName(Math.abs(v), d) : null;
    const notes = [];
    if (d >= 4 || t) notes.push('<b>Thou</b> is a thousandth of an inch (0.001″). <b>A tenth</b> is a ten-thousandth, 0.0001″: a tenth of a thou. The mic’s thimble reads in tenths.');
    else notes.push('<b>Thou</b> is a thousandth of an inch (0.001″). Shops drop the word “point” and the leading zero: .250 is “two fifty”.');
    if (extra) notes.push('Digits past the fourth decimal are too fine to say in the shop.');
    return { shop: neg + shop, full: neg + full, also: fr, notes };
  }
  function sayMm(str) {
    const m = /^(-?)(\d*)\.?(\d*)$/.exec(str.trim()); if (!m) return null;
    const neg = m[1] ? 'minus ' : '', whole = +(m[2] || 0), f = m[3] || '', d = f.length;
    const wholeTxt = whole ? words(whole) : '';
    const place = ['', 'tenths', 'hundredths', 'thousandths', 'ten-thousandths'][Math.min(d, 4)];
    const fn = f ? +f.slice(0, 4) : 0;
    const hund = (n, pl) => words(n) + ' ' + pl.replace(/s$/, n === 1 ? '' : 's');
    let point;
    if (!whole && f && fn) point = hund(fn, place) + ' of a millimeter';
    else point = (wholeTxt || 'zero') + (f ? ' point ' + digitWords(f) : '') + (whole === 1 && !f ? ' millimeter' : ' millimeters');
    let full;
    if (!f || fn === 0) full = (wholeTxt || 'zero') + (whole === 1 ? ' millimeter' : ' millimeters') + ', even';
    else full = (whole ? wholeTxt + (whole === 1 ? ' millimeter' : ' millimeters') + ' and ' : '') + hund(fn, place) + (whole ? '' : ' of a millimeter');
    const notes = [];
    if (d === 2) notes.push('<b>A hundredth</b> is 0.01 mm (10 microns). It is the smallest step on a metric caliper or mic.');
    else if (d === 1) notes.push('<b>A tenth</b> of a millimeter is 0.1 mm (100 microns).');
    else if (d >= 3) notes.push('<b>A micron</b> is 0.001 mm. Shops say “microns” for the last digits: .005 is “five microns”.');
    return { shop: neg + point, full: neg + full, also: null, notes };
  }

  /* ---------- reading the page ---------- */
  const $ = id => document.getElementById(id);
  const parse = txt => {
    const m = /(-?\d*\.?\d+)\s*(mm|in|″|"|inch(?:es)?)?/i.exec(String(txt || '').replace(/,/g, ''));
    if (!m) return null;
    return { str: m[1], unit: m[2] ? (/mm/i.test(m[2]) ? 'mm' : 'in') : null };
  };
  const unitOf = el => { const t = el && el.textContent || ''; return /mm/i.test(t) ? 'mm' : /in|″/i.test(t) ? 'in' : null; };
  function practiceUnit() {
    const u = $('pUnit'); if (u && (u.value === 'mm' || u.value === 'in')) return u.value;
    return unitOf(document.querySelector('#reading .value .unit')) || unitOf($('lenUnit')) || 'in';
  }
  /* everything the page prints for this reading button */
  function readingsFor(src) {
    const out = [];
    const add = (txt, unit) => { const p = parse(txt); if (p) out.push({ str: p.str, unit: p.unit || unit || 'in', shown: p.str }); };
    if (src === 'practice') {
      const g = $('guess'), p = g && parse(g.value);
      if (p) out.push({ str: p.str, unit: p.unit || practiceUnit(), shown: p.str, typed: true });
      return out;
    }
    if (src === 'iTot') add($('iTot').textContent, 'in');
    else if (src === 'mTot') add($('mTot').textContent, 'mm');
    else if (src === 'tele') { add(($('lenNum').textContent) + ' ' + ($('lenUnit').textContent), 'mm'); const a = parse($('lenAlt').textContent); if (a) out.push({ str: a.str, unit: a.unit || (out[0] && out[0].unit === 'in' ? 'mm' : 'in'), shown: a.str }); }
    else if (src === 'card') add($('lcd').textContent, 'mm');
    else {
      const unit = unitOf(document.querySelector('#reading .answer .unit')) || 'in';
      add($('lcd').textContent, unit);
      const alt = $('lcdmm'); if (alt && alt.textContent.trim()) add(alt.textContent, unit === 'in' ? 'mm' : 'in');
    }
    return out;
  }

  /* ---------- the card ---------- */
  const veil = document.createElement('div');
  veil.className = 'hrx'; veil.setAttribute('role', 'dialog'); veil.setAttribute('aria-modal', 'true'); veil.setAttribute('aria-label', 'How do I read this?');
  veil.innerHTML = '<div class="hrx-card"><div class="hrx-h"><b>How do I read this?</b><button type="button" class="hrx-x" aria-label="Close">✕</button></div><div class="hrx-b" id="hrxBody"></div></div>';
  document.body.appendChild(veil);
  const body = veil.querySelector('#hrxBody');
  let openSrc = null, lastFocus = null, watcher = null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function render() {
    const rs = readingsFor(openSrc);
    if (!rs.length) {
      body.innerHTML = openSrc === 'practice'
        ? '<div class="hrx-empty">Type your reading in the answer box first. Then press this again and I’ll show how a machinist would say <i>your</i> number out loud. It won’t reveal the real answer.</div>'
        : '<div class="hrx-empty">There is no reading to say yet.</div>';
      return;
    }
    body.innerHTML = rs.map(r => {
      const s = r.unit === 'mm' ? sayMm(r.str) : sayInch(r.str);
      if (!s) return '';
      return '<div class="hrx-r"><div class="hrx-v">' + esc(r.shown) + '<small>' + (r.unit === 'mm' ? 'mm' : 'in') + (r.typed ? ' · your reading' : '') + '</small></div>' +
        '<div class="hrx-l">Say it like this</div><div class="hrx-say">' + esc(s.shop) + '</div>' +
        '<div class="hrx-l">Word for word</div><div class="hrx-full">' + esc(s.full) + '</div>' +
        (s.also ? '<div class="hrx-l">Also called</div><div class="hrx-full">' + esc(s.also) + '</div>' : '') +
        s.notes.map(n => '<p class="hrx-note">' + n + '</p>').join('') + '</div>';
    }).join('');
  }
  function open(src, from) {
    openSrc = src; lastFocus = from || document.activeElement; render();
    veil.classList.add('on');
    veil.querySelector('.hrx-x').focus({ preventScroll: true });
    /* stays in step with the tool while it is open */
    const targets = ['lcd', 'lcdmm', 'iTot', 'mTot', 'lenNum', 'lenUnit', 'lenAlt', 'guess', 'pUnit'].map($).filter(Boolean);
    if (watcher) watcher.disconnect();
    watcher = new MutationObserver(render);
    targets.forEach(t => watcher.observe(t, { childList: true, characterData: true, subtree: true }));
    const g = $('guess'); if (g) g.addEventListener('input', render);
  }
  function close() {
    veil.classList.remove('on'); if (watcher) watcher.disconnect(); watcher = null; openSrc = null;
    const g = $('guess'); if (g) g.removeEventListener('input', render);
    if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
  }
  veil.addEventListener('pointerdown', e => { if (e.target === veil) close(); });
  veil.querySelector('.hrx-x').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && veil.classList.contains('on')) { e.stopPropagation(); close(); } }, true);

  /* ---------- the buttons, placed just below each measurement ---------- */
  function button(src, cls) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'howread ' + cls; b.dataset.hr = src;
    b.innerHTML = '<i class="fa-solid fa-comment-dots" aria-hidden="true"></i><span>How do I read this?</span>';
    b.setAttribute('data-tip', 'How do I read this?\nThe value, and how a machinist says it out loud in a shop.');
    b.addEventListener('click', () => open(src, b));
    return b;
  }
  function place() {
    const ans = document.querySelector('#reading .value > .answer');       /* caliper, outside mic, depth mic: the big readout */
    if (ans && $('lcd')) ans.insertAdjacentElement('afterend', button('main', 'hr-main'));
    if ($('iTot')) $('iTot').closest('.cell').appendChild(button('iTot', 'hr-main'));  /* height gage: inch and metric totals */
    if ($('mTot')) $('mTot').closest('.cell').appendChild(button('mTot', 'hr-main'));
    const ln = $('lenNum');                                                  /* telescopic gauge: the gauge length */
    if (ln) ln.parentElement.insertAdjacentElement('afterend', button('tele', 'hr-main'));
    const card = document.querySelector('#mic #lcd');                        /* telescopic gauge: the quick-read micrometer card */
    if (card) card.insertAdjacentElement('afterend', button('card', 'hr-main'));
    /* practice mode: by the answer box, saying the typed reading */
    const g = $('guess');
    if (g) {
      const row = g.closest('.prow'), fb = $('pfb');
      if (row) row.insertAdjacentElement('afterend', button('practice', 'hr-p'));
      else if (fb) fb.insertAdjacentElement('beforebegin', button('practice', 'hr-p'));
      else g.parentElement.appendChild(button('practice', 'hr-p'));
    }
  }
  place();
  window.__howRead = { sayInch, sayMm, words, open, close };
})();
