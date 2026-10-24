"use strict";
/* Gearworks — the three.js world: renderer, lights, orbit camera, picking. */
(function(){
const U = GW.U, T = THREE;

GW.Scene = {
  init(container){
    const S = GW.Scene;
    S.container = container;
    S.renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    S.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    S.renderer.setSize(window.innerWidth, window.innerHeight);
    S.renderer.setClearColor(0x101216);
    container.appendChild(S.renderer.domElement);

    S.scene = new T.Scene();
    S.scene.fog = new T.Fog(0x101216, 400, 1400);
    S.camera = new T.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 5000);
    S.resize();
    S.orbit = { theta: -0.55, phi: 1.0, dist: 150, target: new T.Vector3(0, 0, 0) };

    S.scene.add(new T.HemisphereLight(0xe6ecf5, 0x2a2d35, 0.95));
    const key = new T.DirectionalLight(0xffffff, 0.85); key.position.set(60, -80, 120);
    const rim = new T.DirectionalLight(0xd9a441, 0.3); rim.position.set(-80, 60, 40);
    const fill = new T.DirectionalLight(0x9fb4d0, 0.25); fill.position.set(-60, -60, 30);
    S.scene.add(key, rim, fill);
    S.scene.environment = S.makeEnvironment();

    S.grid = new T.GridHelper(1200, 120, 0x2c323b, 0x1b1f26);
    S.grid.rotation.x = Math.PI / 2; S.grid.position.z = -0.05;
    S.scene.add(S.grid);

    S.root = new T.Group();           // gears
    S.scene.add(S.root);
    GW.Gears.root = S.root;
    S.drives = new T.Group();         // chains and belts
    S.scene.add(S.drives);
    S.helpers = new T.Group();        // pitch circle / shaft axis of the selected gear
    S.scene.add(S.helpers);
    S.showHelpers = true;

    S.bindInput();
    window.addEventListener('resize', () => S.resize());
  },

  /* a small studio-like cube map so metals have something to reflect */
  makeEnvironment(){
    const size = 128, faces = [];
    for(let i = 0; i < 6; i++){
      const c = document.createElement('canvas'); c.width = c.height = size;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, size);
      if(i === 2){ g.addColorStop(0, '#9aa7b8'); g.addColorStop(1, '#6b7482'); }          // +y (top in cube space)
      else if(i === 3){ g.addColorStop(0, '#20242b'); g.addColorStop(1, '#14161a'); }      // -y
      else { g.addColorStop(0, '#6e7a8a'); g.addColorStop(0.55, '#3a414c'); g.addColorStop(1, '#1b1e24'); }
      x.fillStyle = g; x.fillRect(0, 0, size, size);
      if(i !== 3){                                 // soft boxes
        x.fillStyle = 'rgba(255,255,255,.85)';
        x.fillRect(size * .25, size * .15, size * .5, size * .18);
        x.fillStyle = 'rgba(255,224,170,.55)';
        x.fillRect(size * .1, size * .55, size * .18, size * .25);
      }
      faces.push(c);
    }
    const tex = new T.CubeTexture(faces);
    tex.needsUpdate = true;
    return tex;
  },

  /* keep the model centred in the part of the window the side panel does not cover */
  resize(){
    const S = GW.Scene, w = window.innerWidth, h = window.innerHeight;
    S.camera.aspect = w / h;
    S.renderer.setSize(w, h);
    if(w >= 768) S.camera.setViewOffset(w, h, 187, 0, w, h);         // panel is 360px + margin: shift by half
    else S.camera.setViewOffset(w, h, 0, h * 0.14, w, h);           // bottom sheet: lift the view
    S.camera.updateProjectionMatrix();
  },

  updateCam(){
    const o = GW.Scene.orbit, c = GW.Scene.camera;
    o.phi = U.clamp(o.phi, 0.05, Math.PI - 0.05);
    o.dist = U.clamp(o.dist, 8, 2500);
    c.position.set(
      o.target.x + o.dist * Math.sin(o.phi) * Math.sin(o.theta),
      o.target.y - o.dist * Math.sin(o.phi) * Math.cos(o.theta),
      o.target.z + o.dist * Math.cos(o.phi));
    c.up.set(0, 0, 1);
    c.lookAt(o.target);
    GW.Scene.scene.fog.near = o.dist * 2; GW.Scene.scene.fog.far = o.dist * 7;
  },

  /* bring every gear into view */
  fit(){
    const S = GW.Scene, list = GW.Gears.list.filter(g => g.mesh.visible);
    GW.Layout.update(0);                       // make sure every mesh has its final pose
    if(!list.length){ S.orbit.target.set(0, 0, 0); S.orbit.dist = 150; return; }
    const box = new T.Box3();
    list.forEach(g => { g.mesh.updateMatrixWorld(true); g.mesh.geometry.computeBoundingBox(); box.union(g.mesh.geometry.boundingBox.clone().applyMatrix4(g.mesh.matrixWorld)); });
    const c = box.getCenter(new T.Vector3()), r = box.getSize(new T.Vector3()).length() / 2;
    S.orbit.target.copy(c);
    const free = window.innerWidth >= 768 ? Math.max(window.innerWidth - 380, 300) : window.innerWidth;
    const half = Math.atan(Math.min(1, free / window.innerHeight) * Math.tan(U.rad(S.camera.fov / 2)));
    S.orbit.dist = Math.max(40, r / Math.sin(half) * 1.1);
  },

  bindInput(){
    const S = GW.Scene, el = S.renderer.domElement, o = S.orbit;
    const ptrs = new Map();
    let lastPinch = 0, lastMid = null, moved = 0, downAt = null, panning = false;
    const pan = (dx, dy) => {
      const f = o.dist * Math.tan(U.rad(S.camera.fov / 2)) * 2 / window.innerHeight;
      const right = new T.Vector3().crossVectors(S.camera.getWorldDirection(new T.Vector3()), S.camera.up).normalize();
      const up = new T.Vector3().crossVectors(right, S.camera.getWorldDirection(new T.Vector3())).normalize();
      o.target.addScaledVector(right, -dx * f).addScaledVector(up, dy * f);
    };
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if(ptrs.size === 1){ moved = 0; downAt = { x: e.clientX, y: e.clientY }; panning = e.button === 2 || e.button === 1 || e.shiftKey; }
      if(ptrs.size === 2){
        const [a, b] = [...ptrs.values()];
        lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
        lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    });
    el.addEventListener('pointermove', e => {
      if(!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId);
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(dx) + Math.abs(dy);
      if(ptrs.size === 1){
        if(panning) pan(dx, dy); else { o.theta -= dx * 0.006; o.phi -= dy * 0.006; }
      } else if(ptrs.size === 2){
        const [a, b] = [...ptrs.values()];
        const pinch = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if(lastPinch > 0) o.dist *= lastPinch / Math.max(pinch, 1);
        if(lastMid) pan(mid.x - lastMid.x, mid.y - lastMid.y);
        lastPinch = pinch; lastMid = mid;
        moved += 20;
      }
    });
    const up = e => {
      if(ptrs.size === 1 && moved < 6 && downAt && e.type === 'pointerup') S.pick(e.clientX, e.clientY);
      ptrs.delete(e.pointerId);
      if(ptrs.size < 2){ lastPinch = 0; lastMid = null; }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); o.dist *= 1 + Math.sign(e.deltaY) * 0.09; }, { passive: false });
  },

  pick(x, y){
    const S = GW.Scene;
    const ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1), S.camera);
    const hits = ray.intersectObjects(S.root.children.filter(m => m.visible), false);
    if(GW.UI) GW.UI.select(hits.length ? hits[0].object.userData.id : null);
  },

  /* pitch circle + shaft axis of the selected gear */
  updateHelpers(sel){
    const S = GW.Scene, h = S.helpers;
    while(h.children.length){ const c = h.children.pop(); c.traverse(o => { if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); }); }
    S._helperGroup = null;
    if(!sel || !S.showHelpers || !sel.mesh.visible) return;
    const r = GW.Calc.pitchR(sel), info = sel.info || {};
    const mat = new T.LineBasicMaterial({ color: 0xd9a441, transparent: true, opacity: 0.8, depthTest: false });
    const grp = new T.Group();
    if(isFinite(r) && sel.type !== 'worm' && sel.type !== 'elliptical'){
      const pts = [];
      for(let i = 0; i <= 96; i++) pts.push(new T.Vector3(r * Math.cos(i / 96 * Math.PI * 2), r * Math.sin(i / 96 * Math.PI * 2), sel.type === 'bevel' || sel.type === 'spiralbevel' ? 0 : (sel.type === 'crown' ? 0 : 0)));
      grp.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), mat));
    }
    const z0 = (info.z0 != null ? info.z0 : -sel.thick / 2) - 8, z1 = (info.z1 != null ? info.z1 : sel.thick / 2) + 8 + (info.apexH && sel.type.indexOf('bevel') >= 0 ? Math.max(0, info.apexH - sel.thick) : 0);
    grp.add(new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, z0), new T.Vector3(0, 0, z1)]),
      new T.LineDashedMaterial({ color: 0xd9a441, dashSize: 2, gapSize: 1.5, transparent: true, opacity: 0.8, depthTest: false })));
    grp.children[grp.children.length - 1].computeLineDistances();
    grp.renderOrder = 10;
    grp.position.copy(sel.mesh.position);
    grp.quaternion.copy(sel.rt.quat);
    h.add(grp);
    S._helperGroup = grp;
  },

  render(){
    const S = GW.Scene;
    S.updateCam();
    S.renderer.render(S.scene, S.camera);
  }
};
})();
