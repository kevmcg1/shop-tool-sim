// The measuring table: a precision-ground inspection surface plate. Dark gunmetal steel with the fine crescent marks a
// surface grinder leaves, a soft sheen that catches the room, chamfered edges and a stamped grade mark. Everything is
// drawn here, so each tool that has a table (the Telescopic gauge's bench, the height gage's table) shows the same one.
//
//   const P = window.__plate(THREE);
//   P.material(repeat)            a MeshStandardMaterial with the ground finish (repeat: tiles per mm, 1/220 by default)
//   P.slab(width, depth, thick)   a chamfered slab, top face at y = 0, going down; its text is drawn on the front
window.__plate = function(T){
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
  const SIZE = 1024;
  const cache = {};

  // one pass of grinding marks over a tile: overlapping crescents from the wheel, drawn wrapped so the tile repeats
  function marks(g, rand, n, light, dark, wMin, wMax){
    g.lineCap = 'round';
    for (let i = 0; i < n; i++){
      const r = 240 + rand()*900, a0 = rand()*Math.PI*2, span = 0.12 + rand()*0.5;
      const cx = rand()*SIZE, cy = rand()*SIZE, w = wMin + rand()*(wMax - wMin);
      const isLight = rand() < 0.5, al = (isLight ? light : dark)*(0.4 + rand()*0.8);
      g.strokeStyle = isLight ? 'rgba(255,255,255,' + al.toFixed(3) + ')' : 'rgba(0,0,0,' + al.toFixed(3) + ')';
      g.lineWidth = w;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++){
        g.beginPath(); g.arc(cx + ox*SIZE, cy + oy*SIZE, r, a0, a0 + span); g.stroke();
      }
    }
  }
  function canvas(){ const c = document.createElement('canvas'); c.width = c.height = SIZE; return [c, c.getContext('2d')]; }
  function textures(){
    if (cache.t) return cache.t;
    const rand = rng(20261012);
    // colour: gunmetal, a little uneven, scored by the grinding
    const [cc, g] = canvas();
    g.fillStyle = '#5b6068'; g.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 70; i++){                 // broad, soft unevenness in the sheen
      const x = rand()*SIZE, y = rand()*SIZE, r = 80 + rand()*260, l = rand() < 0.5;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, l ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, SIZE, SIZE);
    }
    marks(g, rand, 900, 0.015, 0.022, 1.2, 2.6);
    marks(g, rand, 300, 0.01, 0.014, 2, 4);
    for (let i = 0; i < 40000; i++){ const v = rand() < 0.5 ? 255 : 0; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.02 + rand()*0.05).toFixed(3) + ')'; g.fillRect(rand()*SIZE, rand()*SIZE, 1, 1); }
    // roughness: smooth ground steel (dark) that the marks scuff up a little (lighter)
    const [rc, r] = canvas();
    r.fillStyle = '#4a4a4a'; r.fillRect(0, 0, SIZE, SIZE);
    marks(r, rng(7), 900, 0.035, 0.0, 1.2, 2.8);
    for (let i = 0; i < 30000; i++){ const v = 60 + rand()*110 | 0; r.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',.12)'; r.fillRect(rand()*SIZE, rand()*SIZE, 1, 1); }
    // bump: the marks as very fine scratches
    const [bc, b] = canvas();
    b.fillStyle = '#808080'; b.fillRect(0, 0, SIZE, SIZE);
    marks(b, rng(11), 900, 0.05, 0.05, 1.2, 2.6);
    const tex = (c, srgb) => { const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; if (srgb && 'sRGBEncoding' in T) t.encoding = T.sRGBEncoding; else if (srgb && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace; return t; };
    return cache.t = { map: tex(cc, true), roughnessMap: tex(rc), bumpMap: tex(bc) };
  }
  // the ground-steel finish; `repeat` is how many tiles per unit of the surface's own texture coordinates
  function material(repeat){
    const tx = textures(), k = repeat || 1/220;
    ['map', 'roughnessMap', 'bumpMap'].forEach(n => tx[n].repeat.set(k, k));
    return new T.MeshStandardMaterial({ color: 0xffffff, map: tx.map, roughnessMap: tx.roughnessMap, bumpMap: tx.bumpMap, bumpScale: 0.07, metalness: 0.82, roughness: 0.62, envMapIntensity: 0.9, side: T.DoubleSide });
  }
  // the stamped grade mark, drawn flat on the plate near its front edge
  function stamp(){
    const c = document.createElement('canvas'); c.width = 1024; c.height = 96;
    const g = c.getContext('2d');
    g.font = '600 38px Inter, Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(15,17,20,.78)';
    g.fillText('SURFACE PLATE   ·   GRADE AA   ·   FLAT TO 0.00001″', 14, 48);
    g.fillStyle = 'rgba(255,255,255,.16)'; g.fillText('SURFACE PLATE   ·   GRADE AA   ·   FLAT TO 0.00001″', 14, 51);
    const t = new T.CanvasTexture(c); t.anisotropy = 8;
    if ('sRGBEncoding' in T) t.encoding = T.sRGBEncoding; else if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  // a chamfered slab: top face at y = 0, the body going down; edges bevelled so they catch the light
  function slab(w, d, thick, bevel){
    const b = bevel || 3, sh = new T.Shape();
    sh.moveTo(-w/2, -d/2); sh.lineTo(w/2, -d/2); sh.lineTo(w/2, d/2); sh.lineTo(-w/2, d/2); sh.closePath();
    const geo = new T.ExtrudeGeometry(sh, { depth: thick - 2*b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
    geo.rotateX(Math.PI/2); geo.translate(0, -b, 0);
    const top = material(1/220);
    const side = new T.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.7, roughness: 0.5, envMapIntensity: 0.6 });
    const mesh = new T.Mesh(geo, [top, side]);
    const label = new T.Mesh(new T.PlaneGeometry(230, 21.5), new T.MeshBasicMaterial({ map: stamp(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    label.rotation.x = -Math.PI/2; label.position.set(-w/2 + 135, 0.15, d/2 - 26);
    mesh.add(label);
    return mesh;
  }
  return { textures, material, slab, stamp };
};
