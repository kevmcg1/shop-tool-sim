const STROKE_FONT = (function() {

  const C = {};
  const W = 10, H = 14;

  const s = (...pts) => pts;

  C[' '] = [];
  C['A'] = [s([1,0],[5,H],[9,0]), s([2.5,5],[7.5,5])];
  C['B'] = [s([1,0],[1,H]), s([1,H],[6,H],[8,H-2],[6,H/2],[1,H/2]), s([6,H/2],[8,H/2-1],[6,0],[1,0])];
  C['C'] = [s([9,2],[7,0],[3,0],[1,2],[1,H-2],[3,H],[7,H],[9,H-2])];
  C['D'] = [s([1,0],[1,H]), s([1,H],[5,H],[8,H-2],[8,2],[5,0],[1,0])];
  C['E'] = [s([9,0],[1,0],[1,H],[9,H]), s([1,7],[7,7])];
  C['F'] = [s([1,0],[1,H],[9,H]), s([1,7],[7,7])];
  C['G'] = [s([9,H-2],[7,H],[3,H],[1,H-2],[1,2],[3,0],[7,0],[9,2],[9,7],[5,7])];
  C['H'] = [s([1,0],[1,H]), s([9,0],[9,H]), s([1,7],[9,7])];
  C['I'] = [s([3,0],[7,0]), s([5,0],[5,H]), s([3,H],[7,H])];
  C['J'] = [s([2,0],[7,0],[7,H]), s([2,3],[1,2],[1,1],[2,0])];
  C['K'] = [s([1,0],[1,H]), s([1,6],[8,H]), s([1,6],[8,0])];
  C['L'] = [s([1,H],[1,0],[9,0])];
  C['M'] = [s([1,0],[1,H],[5,4],[9,H],[9,0])];
  C['N'] = [s([1,0],[1,H],[9,0],[9,H])];
  C['O'] = [s([3,0],[1,2],[1,H-2],[3,H],[7,H],[9,H-2],[9,2],[7,0],[3,0])];
  C['P'] = [s([1,0],[1,H]), s([1,H],[6,H],[8,H-2],[8,H/2+1],[6,H/2],[1,H/2])];
  C['Q'] = [s([3,0],[1,2],[1,H-2],[3,H],[7,H],[9,H-2],[9,2],[7,0],[3,0]), s([6,3],[9,0])];
  C['R'] = [s([1,0],[1,H]), s([1,H],[6,H],[8,H-2],[8,H/2+1],[6,H/2],[1,H/2]), s([5,H/2],[9,0])];
  C['S'] = [s([9,H-1],[7,H],[3,H],[1,H-2],[1,H/2+1],[3,H/2],[7,H/2],[9,H/2-1],[9,2],[7,0],[3,0],[1,1])];
  C['T'] = [s([1,H],[9,H]), s([5,H],[5,0])];
  C['U'] = [s([1,H],[1,2],[3,0],[7,0],[9,2],[9,H])];
  C['V'] = [s([1,H],[5,0],[9,H])];
  C['W'] = [s([1,H],[3,0],[5,5],[7,0],[9,H])];
  C['X'] = [s([1,0],[9,H]), s([9,0],[1,H])];
  C['Y'] = [s([1,H],[5,H/2],[9,H]), s([5,H/2],[5,0])];
  C['Z'] = [s([1,H],[9,H],[1,0],[9,0])];
  C['0'] = [s([3,0],[1,2],[1,H-2],[3,H],[7,H],[9,H-2],[9,2],[7,0],[3,0]), s([2,2],[8,H-2])];
  C['1'] = [s([3,H-2],[5,H],[5,0]), s([2,0],[8,0])];
  C['2'] = [s([1,H-2],[3,H],[7,H],[9,H-2],[9,H/2],[1,0],[9,0])];
  C['3'] = [s([1,H-1],[3,H],[7,H],[9,H-2],[9,H/2+1],[5,H/2]), s([5,H/2],[9,H/2-1],[9,2],[7,0],[3,0],[1,1])];
  C['4'] = [s([7,0],[7,H],[1,H/2],[9,H/2])];
  C['5'] = [s([9,H],[1,H],[1,H/2],[6,H/2],[9,H/2-1],[9,2],[7,0],[3,0],[1,1])];
  C['6'] = [s([8,H],[3,H],[1,H-2],[1,2],[3,0],[7,0],[9,2],[9,H/2-1],[7,H/2],[1,H/2])];
  C['7'] = [s([1,H],[9,H],[4,0])];
  C['8'] = [s([3,H/2],[1,H/2+1],[1,H-2],[3,H],[7,H],[9,H-2],[9,H/2+1],[7,H/2],[3,H/2],[1,H/2-1],[1,2],[3,0],[7,0],[9,2],[9,H/2-1],[7,H/2])];
  C['9'] = [s([7,H/2],[9,H/2+1],[9,H-2],[7,H],[3,H],[1,H-2],[1,H/2+1],[3,H/2],[9,H/2],[8,0])];
  C['-'] = [s([2,7],[8,7])];
  C['+'] = [s([5,3],[5,11]), s([2,7],[8,7])];
  C['.'] = [s([4,0],[5,0],[5,1],[4,1],[4,0])];
  C[','] = [s([5,1],[4,0],[5,-1])];
  C[':'] = [s([4,3],[5,3],[5,4],[4,4],[4,3]), s([4,9],[5,9],[5,10],[4,10],[4,9])];
  C['/'] = [s([2,0],[8,H])];
  C['\\'] = [s([2,H],[8,0])];
  C['('] = [s([6,0],[3,3],[3,H-3],[6,H])];
  C[')'] = [s([4,0],[7,3],[7,H-3],[4,H])];
  C['_'] = [s([1,-1],[9,-1])];
  C['#'] = [s([3,3],[3,11]), s([7,3],[7,11]), s([1,5],[9,5]), s([1,9],[9,9])];
  C['@'] = [s([8,5],[7,3],[5,3],[3,5],[3,9],[5,11],[7,11],[8,9],[8,5],[4,5],[4,9],[6,9],[6,5]), s([8,9],[9,H-1],[7,H],[3,H],[1,H-2],[1,2],[3,0],[7,0],[9,2],[9,10])];
  C['!'] = [s([5,3],[5,H]), s([5,0],[5,1])];
  C['?'] = [s([1,H-2],[3,H],[7,H],[9,H-2],[9,H/2+1],[5,H/2],[5,2]), s([5,0],[5,1])];

  'abcdefghijklmnopqrstuvwxyz'.split('').forEach(ch => {
    C[ch] = C[ch.toUpperCase()];
  });

  return { glyphs: C, W, H };
})();

function parseG47Line(rawLine, cx, cy, cz, li, parseFeed, modalFeedRaw, isAbs) {

  const commentMatch = rawLine.match(/\(([^)]*)\)/);
  if (!commentMatch) return null;
  const text = commentMatch[1].trim();
  if (!text) return null;

  const codePart = rawLine.replace(/\(.*?\)/g, ' ').replace(/;.*/, '').toUpperCase();
  const toks = codePart.replace(/([0-9.\-])([A-Z])/g, '$1 $2').split(/\s+/).filter(Boolean);

  const getA = (letter) => {
    const t = toks.find(t => t[0] === letter && /[A-Z][0-9\-.]/.test(t));
    return t ? parseFloat(t.slice(1)) : null;
  };

  const pVal = getA('P');

  let sx = getA('X'); if (sx === null) sx = cx;
  let sy = getA('Y'); if (sy === null) sy = cy;

  const charHeight = getA('J') || 0.5;

  const rotDeg = getA('I') || 0;

  let engZ = getA('Z'); if (engZ === null) engZ = cz;

  let clearZ = getA('R'); if (clearZ === null) clearZ = cz + Math.abs(charHeight);

  const feed = parseFeed(toks.find(t => t[0]==='F') || modalFeedRaw) || { val:60, isIPM:false, unitsPerSec:1 };
  const feedLabel = feed.val + (feed.isIPM ? ' IPM' : ' mm/min');

  const { glyphs, W, H } = STROKE_FONT;
  const scale = charHeight / H;
  const charSpacing = W * scale * 1.15;
  const rotRad = (rotDeg * Math.PI) / 180;
  const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);

  const toWorld2D = (lx, ly) => ({
    x: sx + lx * cosR - ly * sinR,
    y: sy + lx * sinR + ly * cosR,
  });

  const segs = [];
  let penUp = true;
  let penX = sx, penY = sy;
  let advanceX = 0;

  const addSeg = (x0, y0, x1, y1, type) => {
    const len = Math.hypot(x1-x0, y1-y0, 0);
    if (len < 0.0001) return;
    const isRapid = type === 'rapid';
    const dur = len / (isRapid ? 5 : feed.unitsPerSec);
    const seg = {
      start: new THREE.Vector3(x0, y0, isRapid ? clearZ : engZ),
      end:   new THREE.Vector3(x1, y1, isRapid ? clearZ : engZ),
      type, lineIdx: li,
      feedRate: isRapid ? 300 : feed.val,
      feedIsIPM: isRapid ? true : feed.isIPM,
      feedLabel: isRapid ? '300 IPM (rapid)' : feedLabel,
      length: len, duration: dur,
    };
    segs.push(seg);
  };

  addSeg(cx, cy, sx, sy, 'rapid');

  for (let ci = 0; ci < text.length; ci++) {
    const ch = text[ci];
    const strokes = glyphs[ch] || glyphs[' '] || [];
    const offsetX = advanceX;

    for (const stroke of strokes) {
      for (let pi = 0; pi < stroke.length; pi++) {
        const [lx, ly] = stroke[pi];
        const gx = (offsetX + lx * scale);
        const gy = (ly * scale);
        const wp = toWorld2D(gx, gy);

        if (pi === 0) {

          addSeg(penX, penY, wp.x, wp.y, 'rapid');

          const plungeLen = Math.abs(clearZ - engZ);
          if (plungeLen > 0.0001) {
            const plungeDur = plungeLen / feed.unitsPerSec;
            segs.push({
              start: new THREE.Vector3(wp.x, wp.y, clearZ),
              end:   new THREE.Vector3(wp.x, wp.y, engZ),
              type: 'cut', lineIdx: li,
              feedRate: feed.val, feedIsIPM: feed.isIPM, feedLabel,
              length: plungeLen, duration: plungeDur,
            });
          }
        } else {

          addSeg(penX, penY, wp.x, wp.y, 'engrave');
        }
        penX = wp.x; penY = wp.y;
      }

      if (stroke.length > 0) {
        const retLen = Math.abs(engZ - clearZ);
        if (retLen > 0.0001) {
          segs.push({
            start: new THREE.Vector3(penX, penY, engZ),
            end:   new THREE.Vector3(penX, penY, clearZ),
            type: 'retract', lineIdx: li,
            feedRate: 300, feedIsIPM: true, feedLabel: '300 IPM (rapid)',
            length: retLen, duration: retLen / 5,
          });
        }
      }
    }
    advanceX += charSpacing;
  }

  const lastW = toWorld2D(advanceX, 0);
  addSeg(penX, penY, lastW.x, lastW.y, 'rapid');

  if (segs.length) {
    segs[segs.length-1]._endX = lastW.x;
    segs[segs.length-1]._endY = lastW.y;
  }

  return segs;
}
