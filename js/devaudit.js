// Dev mode's eyes: looks at a page the way a person would and says what is wrong with it.
//
//   ux(w, o)            what a designer would flag: text cut off or too small, hard to read, controls covered, off the window, too small to
//                       hit, with no name, overlapping, broken pictures, sideways scrolling, duplicate ids, the house style (Inter only,
//                       no emoji, outlined buttons)
//   frame3d(w)          looks at the 3D picture itself (pixels): blank, tiny, cut off at an edge, or covered by the floating buttons
//   machinist(w, id)    what a machinist would flag, strictly: the reading must add up, agree in inches and millimetres, keep to the
//                       tool's resolution and range, never show a negative zero, and use the shop's words correctly
//
// Each returns findings: { type, detail, sev: 'mistake' | 'note', persp: 'UX' | 'Style' | 'Machinist' }.
(function(){
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mk = (persp, sev, type, detail) => ({ persp, sev, type, detail });
  const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n || 40);
  const nameOf = el => {
    const id = el.id ? '#' + el.id : '', al = el.getAttribute && el.getAttribute('aria-label');
    return id || (al ? '“' + clip(al, 28) + '”' : '') || (el.textContent && clip(el.textContent, 28) ? '“' + clip(el.textContent, 28) + '”' : '') || (el.className && String(el.className).split(/\s+/)[0] ? '.' + String(el.className).split(/\s+/)[0] : el.tagName.toLowerCase());
  };
  const list = (a, n) => a.slice(0, n || 4).join(', ') + (a.length > (n || 4) ? ' and ' + (a.length - (n || 4)) + ' more' : '');

  /* ---------- colours ---------- */
  const parse = c => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v + 0.055)/1.055, 2.4); };
  const lum = c => 0.2126*lin(c.r) + 0.7152*lin(c.g) + 0.0722*lin(c.b);
  const over = (f, b) => ({ r: f.r*f.a + b.r*(1 - f.a), g: f.g*f.a + b.g*(1 - f.a), b: f.b*f.a + b.b*(1 - f.a), a: 1 });
  // what is behind an element: the first opaque colour up the page. A picture, a gradient or a 3D view behind it means it can't be told from here.
  function backdrop(el, w){
    const layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement){
      const cs = w.getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = parse(cs.backgroundColor); if (c && c.a > 0) layers.push(c);
      if (c && c.a >= 0.999) break;
    }
    let b = layers.length && layers[layers.length - 1].a >= 0.999 ? layers.pop() : { r: 0, g: 0, b: 0, a: 1 };
    if (layers.length === 0 && b.a < 1) return null;
    while (layers.length) b = over(layers.pop(), b);
    return b;
  }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05)/(Math.min(x, y) + 0.05); };

  const shown = (el, w) => { if (!el || !el.getClientRects().length) return false; const cs = w.getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05; };
  const shownUp = (el, w) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement){ if (!shown(e, w) && e.tagName !== 'HTML') return false; if (e.hasAttribute('hidden') || e.getAttribute('aria-hidden') === 'true') return false; } return true; };
  // the dev panel and anything drawn on top for the test itself is not part of the page
  const mine = el => el.closest && (el.closest('.dev, .holo') || (!el.ownerDocument.body.classList.contains('exam') && el.closest('.cine')));   // (the examination bars wait out of sight until Examine is on)
  // dialogs, menus and tooltips are drawn on a layer of their own: what sits under one is covered on purpose, so layers are only compared with themselves
  const layerOf = (e, w) => { for (let p = e; p && p.nodeType === 1 && p !== p.ownerDocument.body; p = p.parentElement) if (w.getComputedStyle(p).position === 'fixed') return p; return null; };
  const EMOJI = /\p{Extended_Pictographic}/u;
  const MISSPELT = [[/\bcalliper/i, 'caliper'], [/\bmicrometre/i, 'micrometer'], [/\bverneir|\bvernior/i, 'vernier'], [/\bthimbel|\bthimle/i, 'thimble'], [/\banvel\b/i, 'anvil'], [/\bspindel/i, 'spindle'], [/\bratchit/i, 'ratchet'], [/\bgauge block/i, 'gage block (the shop word)'], [/\bmilimeter|\bmillimiter/i, 'millimeter'], [/\bthousandth\b(?=s?\s*\d)/i, '“thou”']];

  /* ---------- the ux scan ---------- */
  function ux(w, o){
    o = o || {}; const d = w.document, out = [], W = d.documentElement.clientWidth, H = d.documentElement.clientHeight, narrow = W <= 700, strict = !!o.strict;
    const style = (t, det) => mk('Style', strict ? 'mistake' : 'note', t, det);
    const all = [...d.body.querySelectorAll('*')].filter(e => !mine(e) && !/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|BR|PATH|G|DEFS|CIRCLE|RECT|LINE|POLYGON|POLYLINE|TEXT|TSPAN|USE|SYMBOL|CLIPPATH|LINEARGRADIENT|STOP|FILTER|MASK)$/i.test(e.tagName));
    const vis = all.filter(e => shownUp(e, w));
    const cap = (a, n) => a.length > n ? a.slice(0, n) : a;
    // 1. text that is cut off: the box is smaller than what is inside, and it hides the rest
    const cut = [];
    for (const e of vis){
      if (!(e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))) continue;
      const cs = w.getComputedStyle(e);
      if (!/^(hidden|clip)$/.test(cs.overflowX) && cs.textOverflow !== 'ellipsis' && !/^(hidden|clip)$/.test(cs.overflowY)) continue;
      if (e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0 && /^(hidden|clip)$/.test(cs.overflowX) || (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1)) cut.push(nameOf(e) + ' (' + clip(e.textContent, 24) + ')');
      else if (e.scrollHeight > e.clientHeight + 3 && e.clientHeight > 0 && /^(hidden|clip)$/.test(cs.overflowY) && cs.display !== 'inline' && !e.matches('body, html, .stage, #view, .view')) cut.push(nameOf(e) + ' (' + clip(e.textContent, 24) + ')');
    }
    if (cut.length) out.push(mk('UX', 'mistake', 'text cut off', cut.length + ' place' + (cut.length > 1 ? 's' : '') + ' hide part of their words: ' + list(cut)));
    // 2. text too small to read, and text you can hardly see
    const tiny = [], faint = [], dim = [];
    const leaves = cap(vis.filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 0) && !e.closest('canvas, svg')), 700);
    for (const e of leaves){
      const cs = w.getComputedStyle(e), fs = parseFloat(cs.fontSize);
      if (fs === 0) continue;   // (lettering shrunk away on purpose, an icon stands for it)
      if (fs < 10) tiny.push(nameOf(e) + ' ' + Math.round(fs*10)/10 + 'px'); else if (fs < 11) dim.push(nameOf(e) + ' ' + Math.round(fs*10)/10 + 'px');
      if (e.disabled || e.closest('[disabled], [aria-disabled=true], .toast, #toast, .tipl')) continue;   // (a toast or tooltip is caught mid-fade)
      const fg = parse(cs.color), bg = backdrop(e, w); if (!fg || !bg || fg.a < 0.1 || parseFloat(cs.webkitTextStrokeWidth) > 0) continue;   // (outlined lettering has no fill to measure)
      const op = parseFloat(cs.opacity); const f = over({ r: fg.r, g: fg.g, b: fg.b, a: fg.a*op }, bg), r = ratio(f, bg);
      const big = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight, 10) >= 700), need = big ? 3 : 4.5;
      if (r < Math.min(3, need)) faint.push(nameOf(e) + ' ' + r.toFixed(1) + ':1'); else if (r < need) dim.push(nameOf(e) + ' ' + r.toFixed(1) + ':1');
    }
    if (tiny.length) out.push(mk('UX', 'mistake', 'text too small', tiny.length + ' under 10 px: ' + list(tiny)));
    if (faint.length) out.push(mk('UX', 'mistake', 'text hard to see', faint.length + ' with contrast under 3:1: ' + list(faint)));
    // (the two rows of notes cover the "close but under the guideline" cases: 10–11 px and 3–4.5:1)
    const dimTxt = dim.filter(s => /px$/.test(s)), dimCon = dim.filter(s => /:1$/.test(s));
    if (dimTxt.length) out.push(mk('UX', 'note', 'text small', dimTxt.length + ' under 11 px: ' + list(dimTxt)));
    if (dimCon.length) out.push(mk('UX', 'note', 'text low contrast', dimCon.length + ' under 4.5:1: ' + list(dimCon)));
    // 3. controls: covered, off the window, too small, nameless, on top of each other
    const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [tabindex]:not([tabindex="-1"]):not(canvas)';
    const ctl = vis.filter(e => e.matches(sel) && !e.disabled && !e.closest('.dd-list') && e.getAttribute('role') !== 'separator');   // (the dragged dividers are thin on purpose)
    const covered = [], edge = [], small = [], smallN = [], nameless = [], stack = [];
    const rects = [];
    for (const e of ctl){
      const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      const isBox = /^(checkbox|radio|range)$/.test(e.type || '');
      // off the window (inside something that scrolls is fine, so the nearest scroller is looked at first)
      let sc = false; for (let p = e.parentElement; p && p !== d.body; p = p.parentElement){ const c = w.getComputedStyle(p); if (/(auto|scroll)/.test(c.overflowY + c.overflowX) && (p.scrollHeight > p.clientHeight + 2 || p.scrollWidth > p.clientWidth + 2)){ sc = true; break; } }
      if (!sc && (r.right > W + 2 || r.left < -2) && r.right > 0 && r.bottom > 0 && r.top < H) edge.push(nameOf(e));   // (sideways only: a page may run on down past the window and scroll)
      // covered: whatever is on top at its middle is not it (or part of it)
      const cx = Math.min(W - 1, Math.max(1, r.left + r.width/2)), cy = Math.min(H - 1, Math.max(1, r.top + r.height/2));
      if (!sc && cx > 0 && cy > 0 && r.left < W && r.top < H){
        const t = d.elementFromPoint(cx, cy);
        if (t && t !== e && layerOf(t, w) === layerOf(e, w) && !e.contains(t) && !t.contains(e) && !(t.closest && t.closest('label') && t.closest('label').contains(e)) && !mine(t) && !t.matches('canvas, body, html') && !t.closest('.tipl, .toast, .dock, .cine, .coach, .cheat-veil, .gd')){
          const same = t.closest(sel); covered.push(nameOf(e) + ' under ' + (same ? nameOf(same) : nameOf(t)));
        }
      }
      if (!isBox){
        const m = Math.min(r.width, r.height);
        if (m < 24) small.push(nameOf(e) + ' ' + Math.round(r.width) + '×' + Math.round(r.height)); else if (narrow && m < 32) smallN.push(nameOf(e) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
      }
      const label = (e.getAttribute('aria-label') || '') + (e.getAttribute('aria-labelledby') ? 'x' : '') + (e.getAttribute('title') || '') + (e.textContent || '').trim() + (e.labels && e.labels.length ? 'x' : '') + (e.closest('label') ? 'x' : '') + (e.getAttribute('placeholder') || '') + (e.getAttribute('alt') || '') + (e.querySelector && e.querySelector('img[alt]') ? 'x' : '');
      if (!label.trim()) nameless.push(nameOf(e));
      rects.push({ e, r });
    }
    if (covered.length) out.push(mk('UX', 'mistake', 'control covered', covered.length + ' controls can’t be clicked, something sits on top: ' + list(covered)));
    if (edge.length) out.push(mk('UX', 'mistake', 'control off the window', edge.length + ' stick out past the window edge: ' + list(edge)));
    if (small.length) out.push(mk('UX', 'mistake', 'target too small', small.length + ' controls under 24 px: ' + list(small)));
    if (smallN.length) out.push(mk('UX', 'note', 'target small for a finger', smallN.length + ' controls under 32 px on a narrow screen: ' + list(smallN)));
    if (nameless.length) out.push(mk('UX', 'mistake', 'control has no name', nameless.length + ' have no text, label or aria-label (a screen reader says nothing): ' + list(nameless)));
    for (let i = 0; i < rects.length && rects.length < 220; i++) for (let j = i + 1; j < rects.length; j++){
      const a = rects[i], b = rects[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ix > 3 && iy > 3 && ix*iy > 0.25*Math.min(a.r.width*a.r.height, b.r.width*b.r.height) && layerOf(a.e, w) === layerOf(b.e, w)) stack.push(nameOf(a.e) + ' on ' + nameOf(b.e));
    }
    if (stack.length) out.push(mk('UX', 'mistake', 'controls overlap', stack.length + ' pairs overlap: ' + list(stack)));
    // 4. words that run over each other: two lines of text whose boxes overlap
    const words = []; const tl = cap(leaves.filter(e => !e.closest('button, select, option') || true), 260);
    const tr = tl.map(e => { const rg = d.createRange(); rg.selectNodeContents(e); const rr = rg.getClientRects(); return { e, r: rr.length ? rg.getBoundingClientRect() : null }; }).filter(x => x.r && x.r.width > 3 && x.r.height > 3);
    for (let i = 0; i < tr.length; i++) for (let j = i + 1; j < tr.length; j++){
      const a = tr[i], b = tr[j]; if (a.e.contains(b.e) || b.e.contains(a.e) || (a.e.closest('svg') || b.e.closest('svg')) || layerOf(a.e, w) !== layerOf(b.e, w)) continue;
      const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ix > 4 && iy > 0.5*Math.min(a.r.height, b.r.height)){
        const za = w.getComputedStyle(a.e), zb = w.getComputedStyle(b.e); if (za.position === 'static' && zb.position === 'static' && a.e.parentElement === b.e.parentElement) continue;
        const t1 = d.elementFromPoint(Math.max(1, Math.min(W - 1, (Math.max(a.r.left, b.r.left) + Math.min(a.r.right, b.r.right))/2)), Math.max(1, Math.min(H - 1, (Math.max(a.r.top, b.r.top) + Math.min(a.r.bottom, b.r.bottom))/2)));
        if (t1 && (a.e.contains(t1) || t1.contains(a.e) || b.e.contains(t1) || t1.contains(b.e))) words.push('“' + clip(a.e.textContent, 18) + '” and “' + clip(b.e.textContent, 18) + '”');
      }
    }
    if (words.length) out.push(mk('UX', 'mistake', 'words overlap', words.length + ' texts run over each other: ' + list(words)));
    // 5. pictures and the page
    const bad = [...d.images].filter(i => !mine(i) && shownUp(i, w) && i.complete && i.naturalWidth === 0).map(i => nameOf(i) + ' ' + clip(i.currentSrc || i.src, 30));
    if (bad.length) out.push(mk('UX', 'mistake', 'picture did not load', list(bad)));
    const noAlt = [...d.images].filter(i => !mine(i) && shownUp(i, w) && !i.hasAttribute('alt')).map(i => clip(i.currentSrc || i.src, 30));
    if (noAlt.length) out.push(mk('UX', 'note', 'picture with no alt text', list(noAlt)));
    const se = d.scrollingElement || d.documentElement;
    if (se.scrollWidth > se.clientWidth + 2) out.push(mk('UX', 'mistake', 'page scrolls sideways', 'the page is ' + se.scrollWidth + ' px wide in a ' + se.clientWidth + ' px window'));
    const ids = {}; d.querySelectorAll('[id]').forEach(e => { if (!mine(e)) ids[e.id] = (ids[e.id] || 0) + 1; });
    const dup = Object.keys(ids).filter(k => ids[k] > 1); if (dup.length) out.push(mk('UX', 'mistake', 'duplicate ids', list(dup.map(k => '#' + k + ' ×' + ids[k]))));
    const ext = [...d.querySelectorAll('a[target=_blank]')].filter(a => !mine(a) && !/noopener/.test(a.rel || '')).map(nameOf);
    if (ext.length) out.push(mk('UX', 'note', 'link opens a new tab without rel=noopener', list(ext)));
    const dead = [...d.querySelectorAll('a[href]')].filter(a => !mine(a) && shownUp(a, w) && /^(#|javascript:)\s*$|^javascript:void/.test(a.getAttribute('href').trim())).map(nameOf);
    if (dead.length) out.push(mk('UX', 'mistake', 'link goes nowhere', list(dead)));
    // 6. the house style: Inter only, no emoji, outlined buttons (nothing filled)
    const emoji = [], fonts = new Set(), filled = [];
    for (const e of leaves){
      const t = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
      if (EMOJI.test(t)) emoji.push(nameOf(e) + ' ' + (t.match(EMOJI) || [''])[0]);
      const cs = w.getComputedStyle(e), fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (!/^inter/i.test(fam) && !/awesome|icon/i.test(cs.fontFamily) && !/[-]/.test(t) && t.trim().length > 1 && !e.closest('svg')) fonts.add(fam + ' (' + nameOf(e) + ')');
    }
    for (const e of ctl){
      if (!/^(BUTTON)$/.test(e.tagName) && e.getAttribute('role') !== 'button') continue;
      const cs = w.getComputedStyle(e), bg = parse(cs.backgroundColor), bi = cs.backgroundImage;
      if ((bg && bg.a > 0.4 && e.getAttribute('aria-pressed') !== 'true' && !e.classList.contains('on')) || (bi && bi !== 'none' && /gradient/.test(bi))) filled.push(nameOf(e));
    }
    if (emoji.length) out.push(style('emoji in the text', 'icons should be Font Awesome, not emoji: ' + list(emoji)));
    if (fonts.size) out.push(style('font is not Inter', fonts.size + ' fonts: ' + list([...fonts])));
    if (filled.length) out.push(style('button is filled, not outlined', filled.length + ' buttons: ' + list(filled)));
    // 7. words
    const body = d.body.innerText || '';
    MISSPELT.forEach(([re, good]) => { const m = re.exec(body); if (m) out.push(mk('Machinist', 'note', 'shop word', '“' + m[0] + '” on screen; the shop says ' + good)); });
    return out;
  }

  /* ---------- the 3D picture itself ---------- */
  // the page paints its 3D view only when something changes, and the picture is gone from the canvas as soon as it has been shown. So a
  // copy is taken inside the page's own frame callback, straight after it has drawn, while the picture is still there.
  function glCanvas(w){
    return [...w.document.querySelectorAll('canvas')].filter(c => c.id !== 'flatCv' && !c.closest('.flat, .dev, .holo') && c.getClientRects().length && c.clientWidth > 160 && c.clientHeight > 120)
      .sort((a, b) => b.clientWidth*b.clientHeight - a.clientWidth*a.clientHeight)[0] || null;
  }
  const GW = 96, GH = 54;
  function grabber(w){
    if (w.__devGrab) return w.__devGrab;
    const g = w.__devGrab = { on: false, best: null, sc: w.document.createElement('canvas') };
    g.sc.width = GW; g.sc.height = GH;
    const raf = w.requestAnimationFrame.bind(w);
    w.requestAnimationFrame = cb => raf(t => {
      cb(t);
      if (!g.on) return;
      try {
        const cv = glCanvas(w); if (!cv) return;
        const x = g.sc.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0, GW, GH);
        const px = x.getImageData(0, 0, GW, GH).data; let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 24) lit++;
        if (!g.best || lit > g.best.lit) g.best = { lit, px: new Uint8ClampedArray(px) };
      } catch (e) {}
    });
    return g;
  }
  // framing: true once the camera has been sent to the overview, which is when its size and edges mean something
  async function frame3d(w, framing){
    const cv = glCanvas(w); if (!cv) return { found: [], info: null };
    const g = grabber(w); g.best = null; g.on = true;
    for (let i = 0; i < 6; i++){
      try { const V = w.__view; if (V && V.controls) V.controls.dispatchEvent({ type: 'change' }); } catch (e) {}
      await sleep(120);
    }
    g.on = false; const b = g.best; if (!b || !b.lit) return { found: [mk('UX', 'mistake', '3D view blank', 'nothing is drawn in the 3D view')], info: { blank: true } };
    const px = b.px, at = (x, y) => { const i = (y*GW + x)*4; return [px[i], px[i + 1], px[i + 2]]; };
    // the background is what the picture's border is made of
    const ring = []; for (let x = 0; x < GW; x++){ ring.push(at(x, 0), at(x, GH - 1)); } for (let y = 0; y < GH; y++){ ring.push(at(0, y), at(GW - 1, y)); }
    const med = c => { const a = ring.map(p => p[c]).sort((p, q) => p - q); return a[a.length >> 1]; }, bg = [med(0), med(1), med(2)];
    const mask = new Uint8Array(GW*GH); let n = 0;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++){ const p = at(x, y); if (Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 60){ mask[y*GW + x] = 1; n++; } }
    // (a lone speck is not the model: a row or a column counts only if a few cells in it are lit)
    const rows = [], cols = []; for (let y = 0; y < GH; y++){ let c = 0; for (let x = 0; x < GW; x++) c += mask[y*GW + x]; rows.push(c); } for (let x = 0; x < GW; x++){ let c = 0; for (let y = 0; y < GH; y++) c += mask[y*GW + x]; cols.push(c); }
    const y0 = rows.findIndex(c => c >= 3), y1 = rows.length - 1 - [...rows].reverse().findIndex(c => c >= 3), x0 = cols.findIndex(c => c >= 3), x1 = cols.length - 1 - [...cols].reverse().findIndex(c => c >= 3);
    const found = [];
    if (n < GW*GH*0.003 || y0 < 0 || x0 < 0){ return { found: [mk('UX', 'mistake', '3D view blank', 'the 3D view shows only the background')], info: { blank: true } }; }
    const bw = (x1 - x0 + 1)/GW, bh = (y1 - y0 + 1)/GH, area = bw*bh;
    const touch = []; if (x0 <= 0) touch.push('left'); if (x1 >= GW - 1) touch.push('right'); if (y0 <= 0) touch.push('top'); if (y1 >= GH - 1) touch.push('bottom');
    // the floating buttons sit on top of the 3D view: how much of the model is under them
    const cr = cv.getBoundingClientRect(), sx = GW/cr.width, sy = GH/cr.height; let under = 0; const hit = [];
    w.document.querySelectorAll('.actions, .views, .legend, .quick, .flat, .vstack').forEach(e => {
      if (!shownUp(e, w) || e.closest('.dev')) return;
      const q = e.getBoundingClientRect(); let c = 0;
      for (let y = Math.max(0, Math.floor((q.top - cr.top)*sy)); y < Math.min(GH, Math.ceil((q.bottom - cr.top)*sy)); y++) for (let x = Math.max(0, Math.floor((q.left - cr.left)*sx)); x < Math.min(GW, Math.ceil((q.right - cr.left)*sx)); x++) c += mask[y*GW + x];
      if (c){ under += c; if (c/n > 0.015) hit.push(nameOf(e) + ' ' + Math.round(c/n*100) + '%'); }
    });
    const info = { box: [x0, y0, x1, y1].join(','), width: Math.round(bw*100), height: Math.round(bh*100), area: Math.round(area*100), touch: touch.join('+'), covered: Math.round(under/n*100) };
    if (!framing) return { found, info };
    if (area < 0.12 && bw < 0.45 && bh < 0.5) found.push(mk('UX', 'mistake', 'model looks too small', 'the model fills ' + Math.round(bw*100) + '% of the width and ' + Math.round(bh*100) + '% of the height of the 3D view (' + Math.round(cr.width) + '×' + Math.round(cr.height) + ' px)'));
    if (touch.length) found.push(mk('UX', 'mistake', 'model cut off', 'the model runs off the ' + touch.join(' and ') + ' edge of the 3D view (' + Math.round(cr.width) + '×' + Math.round(cr.height) + ' px)'));
    if (under/n > 0.08) found.push(mk('UX', 'mistake', 'model under the buttons', Math.round(under/n*100) + '% of the model is behind floating controls: ' + list(hit)));
    return { found, info };
  }

  /* ---------- the machinist's checks ---------- */
  // what each tool resolves, so its display must show exactly that many places and no others
  const RES = { caliper: { dec: 3, tol: 0.0006 }, vernier: { dec: 3, tol: 0.0006 }, micrometer: { dec: 4, tol: 0.00006 }, depth: { dec: 3, tol: 0.0006 }, height: { dec: 3, tol: 0.0006 } };
  const num = t => { const m = /(-|−)?\s*(\d+(?:\.\d+)?)/.exec(String(t || '')); return m ? (m[1] ? -1 : 1)*parseFloat(m[2]) : NaN; };
  const txt = (d, s) => { const e = d.querySelector(s); return e && shownUp(e, d.defaultView) ? e.textContent.trim() : null; };
  function machinist(w, id){
    const d = w.document, out = [], R = RES[id], M = (type, det, sev) => out.push(mk('Machinist', sev || 'mistake', type, det));
    const body = d.body.innerText || '';
    // never a negative zero: a gauge doesn't read “minus nothing”
    const nz = body.match(/(?:^|[^\d.])[−-]\s?0\.0+(?!\d)/g); if (nz && !d.body.querySelector('.cheat-veil')) M('negative zero shown', '“' + clip(nz[0], 12) + '” is on screen; a reading of nothing has no sign');
    const lcd = txt(d, '#lcd'), lmm = txt(d, '#lcdmm'), vT = txt(d, '#vT'), iTot = txt(d, '#iTot'), mTot = txt(d, '#mTot');
    if (id === 'telescopic' || !R) return out;
    const hidden = !!d.querySelector('body.practice #lcd, .practicing #lcd') || (d.querySelector('#lcd') && /^[?–—-]*$/.test(lcd || ''));
    if (lcd != null && !hidden){
      const v = num(lcd), dec = (/\.(\d+)/.exec(lcd) || [0, ''])[1].length;
      if (!Number.isFinite(v)) M('reading is not a number', 'the big reading says “' + clip(lcd, 20) + '”');
      else {
        if (dec !== R.dec) M('wrong number of decimals', 'the big reading shows ' + dec + ' places (“' + lcd + '”); this tool reads to ' + R.dec + ' (' + (R.dec === 4 ? '0.0001″' : '0.001″') + ')');
        if (vT != null && Number.isFinite(num(vT)) && Math.abs(num(vT) - v) > R.tol/6) M('two readings disagree', 'the big reading says ' + lcd + ' but the Reading box says ' + vT);
        if (lmm != null){ const mm = num(lmm); if (Number.isFinite(mm) && Math.abs(mm - v*25.4) > (R.dec === 4 ? 0.0021 : 0.0131)) M('inches and millimeters disagree', lcd + ' in is ' + (v*25.4).toFixed(3) + ' mm but the screen says ' + lmm); }
        else if (lmm === null && d.querySelector('#lcdmm') === null) M('no metric reading', 'the inch reading has no millimeter reading beside it', 'note');
        // the parts add up to the whole
        const cells = [...d.querySelectorAll('.cell')].filter(c => !c.classList.contains('feat') && !c.classList.contains('total') && shownUp(c, w) && !/bezel|measuring/i.test((c.querySelector('.k') || {}).textContent || ''));
        const parts = cells.map(c => num((c.querySelector('.v') || {}).textContent)), tot = num(vT);
        if (cells.length && parts.every(Number.isFinite) && Number.isFinite(tot)){
          const sum = parts.reduce((s, x) => s + x, 0);
          if (Math.abs(sum - tot) > R.tol) M('parts do not add up', cells.map(c => clip((c.querySelector('.k') || {}).textContent, 14) + ' ' + clip((c.querySelector('.v') || {}).textContent, 8)).join(' + ') + ' = ' + sum.toFixed(R.dec) + ' but the Reading box says ' + vT);
        }
        // a micrometer reads inside its own range
        if (id === 'micrometer' || id === 'depth'){
          const on = [...d.querySelectorAll('[aria-pressed=true], .on')].map(b => /^(\d)[–-](\d)″?$/.exec((b.textContent || '').trim())).filter(Boolean)[0];
          if (on){ const lo = +on[1], hi = +on[2]; if (id === 'micrometer' && (v < lo - 0.0006 || v > hi + 0.0006)) M('reading outside the range', lcd + ' in on a ' + lo + '–' + hi + '″ micrometer'); }
        }
      }
    }
    if (iTot != null && mTot != null && !/^[?–—-]*$/.test(iTot)){
      const a = num(iTot), b = num(mTot);
      if (Number.isFinite(a) && Number.isFinite(b)){
        if (Math.abs(a*25.4 - b) > 0.03 + 0.0005*25.4) M('inches and millimeters disagree', 'the height gage reads ' + iTot + ' in (' + (a*25.4).toFixed(2) + ' mm) and ' + mTot + ' mm');
        const dec = (/\.(\d+)/.exec(iTot) || [0, ''])[1].length; if (dec !== 3) M('wrong number of decimals', 'the inch reading shows ' + dec + ' places; a height gage reads to 0.001″');
        const dm = (/\.(\d+)/.exec(mTot) || [0, ''])[1].length; if (dm !== 2) M('wrong number of decimals', 'the metric reading shows ' + dm + ' places; a height gage reads to 0.02 mm');
        const sc = [...d.querySelectorAll('.cell')].filter(c => !c.classList.contains('total') && shownUp(c, w)), ins = sc.slice(0, 2).map(c => num((c.querySelector('.v') || {}).textContent));
        if (ins.length === 2 && ins.every(Number.isFinite) && Math.abs(ins[0] + ins[1] - a) > 0.0006) M('parts do not add up', 'main ' + ins[0] + ' + vernier ' + ins[1] + ' = ' + (ins[0] + ins[1]).toFixed(3) + ' but the reading says ' + iTot);
      }
    }
    return out;
  }

  window.__devAudit = { ux, frame3d, machinist, glCanvas, RES, mk, VIEWPORTS: [[360, 640], [844, 390], [768, 1024], [1280, 720], [1920, 1080]] };
})();
