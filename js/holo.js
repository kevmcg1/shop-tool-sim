// Part preview: while a tool's Part list is open, a small hologram of the highlighted part turns slowly beside it, so
// you can see what will be loaded before you pick it. It follows the highlight as you hover or arrow through the list.
//
//   window.__holo.attach({ THREE, select, build(value, text) -> Object3D | null, caption(value, text) -> [name, sub] })
//
// `select` is the tool's real part <select> (js/dropdowns.js puts the animated list over it); `build` makes a fresh
// model of the part for a value (its own materials don't matter: everything is redrawn as a hologram). Each tool
// passes its own three.js, so the preview works whichever version that tool uses.
(function(){
  const CSS = `
.holo{position:fixed;z-index:60;width:238px;padding:8px 8px 10px;background:rgba(8,13,17,.94);border:1px solid rgba(94,231,255,.42);border-radius:12px;box-shadow:0 12px 28px rgba(0,0,0,.45),inset 0 0 24px rgba(94,231,255,.08);opacity:0;visibility:hidden;pointer-events:none;transform:translateX(-10px) scale(.97);transform-origin:left center;transition:opacity .2s ease,transform .28s cubic-bezier(.22,.8,.25,1),visibility 0s linear .28s;font-family:"Inter",system-ui,sans-serif}
.holo.show{opacity:1;visibility:visible;transform:none;transition:opacity .22s ease,transform .3s cubic-bezier(.22,.8,.25,1),visibility 0s}
.holo canvas{display:block;width:214px;height:172px;margin:0 auto}
.holo-cap{padding:2px 6px 0}
.holo-cap b{display:block;font-size:13px;font-weight:600;color:#cdf6ff}
.holo-cap small{display:block;font-size:11.5px;color:#8a8f97}
.holo-pill{position:absolute;top:10px;left:12px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5ee7ff;border:1px solid rgba(94,231,255,.55);border-radius:999px;padding:1px 7px}
@media (prefers-reduced-motion: reduce){.holo,.holo.show{transition:none}}
@media (max-width:860px){.holo{display:none}}`;
  let cssDone = false;
  const rad = Math.PI/180;

  function attach(o){
    const T = o && o.THREE, sel = o && o.select;
    if (!T || !sel) return;
    if (!cssDone){ const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); cssDone = true; }
    // js/dropdowns.js wraps the select in a .dd once the page has loaded: wait for it
    let tries = 0;
    const wait = setInterval(() => {
      const dd = sel.closest('.dd');
      if (dd){ clearInterval(wait); start(dd); } else if (++tries > 150) clearInterval(wait);
    }, 200);

    function start(dd){
      const W = 214, H = 172;
      const el = document.createElement('div');
      el.className = 'holo'; el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<span class="holo-pill">Preview</span><canvas></canvas><div class="holo-cap"><b></b><small></small></div>';
      document.body.appendChild(el);
      const cv = el.querySelector('canvas'), nameEl = el.querySelector('b'), subEl = el.querySelector('small');
      let r = null, scene, cam, spin, mat, lineMat, ringMat;
      const st = { vis: false, key: null, t: 0, pop: 1, raf: 0, last: 0 };

      function init(){
        if (r) return;
        r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
        r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.setSize(W, H, false); r.setClearColor(0x000000, 0);
        scene = new T.Scene(); cam = new T.PerspectiveCamera(30, W/H, 0.01, 5000);
        mat = new T.ShaderMaterial({
          transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
          uniforms: { uT: { value: 0 }, uC: { value: new T.Color(0x5ee7ff) }, uS: { value: 1 } },
          vertexShader: 'varying vec3 vN;varying vec3 vP;void main(){vN=normalize(normalMatrix*normal);vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
          // fresnel rim, soft scan bands and a bright line sweeping up the part
          fragmentShader: 'uniform float uT;uniform vec3 uC;uniform float uS;varying vec3 vN;varying vec3 vP;void main(){float f=pow(1.0-abs(vN.z),2.0);float y=vP.y*uS;float sl=0.5+0.5*sin(y*1.7-uT*3.0);float line=smoothstep(0.93,1.0,sin(y*0.8+uT*1.6));float a=0.08+0.5*f+0.08*sl+0.35*line;gl_FragColor=vec4(uC*(0.6+0.8*f),a);}'
        });
        lineMat = new T.LineBasicMaterial({ color: 0x7df3ff, transparent: true, opacity: .75, blending: T.AdditiveBlending, depthWrite: false });
        ringMat = new T.MeshBasicMaterial({ color: 0x5ee7ff, transparent: true, opacity: .45, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
        spin = new T.Group(); scene.add(spin);
      }
      function clear(){
        if (!spin) return;
        spin.traverse(x => { if (x.geometry && !x.userData.keepGeo) x.geometry.dispose(); });
        while (spin.children.length) spin.remove(spin.children[0]);
      }
      // build the model for a value and redraw it as a hologram
      function load(value, text){
        init(); clear();
        spin.rotation.set(0, 0, 0); spin.scale.set(1, 1, 1); spin.updateMatrixWorld(true);   // measured at rest, so the centre is true
        let obj = null;
        try { obj = o.build(value, text); } catch (e) { obj = null; }
        if (!obj) return false;
        const meshes = [];
        obj.traverse(x => {
          if (x.isMesh && x.material && x.material.colorWrite !== false) meshes.push(x);
          else if (x.isSprite || x.isLight) x.visible = false;
        });
        if (!meshes.length) return false;
        meshes.forEach(m => {
          m.material = mat; m.castShadow = m.receiveShadow = false; m.raycast = () => {};
          const g = m.geometry;
          if (g && g.attributes && g.attributes.position && g.attributes.position.count < 90000){
            const e = new T.LineSegments(new T.EdgesGeometry(g, 28), lineMat);
            e.raycast = () => {}; m.add(e);
          }
        });
        const holder = new T.Group(); holder.add(obj); spin.add(holder);
        holder.updateMatrixWorld(true);
        const box = new T.Box3().setFromObject(holder), c = box.getCenter(new T.Vector3()), sph = box.getBoundingSphere(new T.Sphere());
        const R = Math.max(sph.radius, 1e-6);
        holder.position.sub(c);
        // a glowing ring under it, like the base of a projector
        const ring = new T.Mesh(new T.RingGeometry(R*.95, R*1.03, 64), ringMat);
        ring.rotation.x = -Math.PI/2; ring.position.y = -(box.max.y - box.min.y)/2 - R*.06;
        spin.add(ring);
        // scale the scan bands to the part, so a small part and a big one look alike
        mat.uniforms.uS.value = 30/R;
        const d = R/Math.sin(15*rad)*1.08;
        cam.near = d/100; cam.far = d*10; cam.updateProjectionMatrix();
        cam.position.set(0, d*.42, d*.91); cam.lookAt(0, 0, 0);
        st.pop = .82;
        return true;
      }
      function place(){
        const as = sel.closest('aside'), ar = as ? as.getBoundingClientRect() : { right: 330 }, r0 = dd.getBoundingClientRect(), h = el.offsetHeight || 230;
        el.style.left = Math.round(ar.right + 12) + 'px';
        el.style.top = Math.round(Math.max(8, Math.min(r0.top - 4, innerHeight - h - 8))) + 'px';
      }
      function loop(now){
        if (!st.vis){ st.raf = 0; return; }
        const dt = Math.min(.05, (now - st.last)/1000); st.last = now;
        st.t += dt; mat.uniforms.uT.value = st.t;
        spin.rotation.y += dt*.75;                                  // it turns by itself
        st.pop += (1 - st.pop)*(1 - Math.exp(-dt*9)); spin.scale.setScalar(st.pop);
        lineMat.opacity = .68 + .1*Math.sin(st.t*7);                 // a faint shimmer
        r.render(scene, cam);
        st.raf = requestAnimationFrame(loop);
      }
      function show(idx){
        const opt = sel.options[idx]; if (!opt) return hide();
        if (st.key !== opt.value){
          st.key = opt.value;
          const cap = o.caption ? o.caption(opt.value, opt.textContent) : [opt.textContent, ''];
          nameEl.textContent = cap[0] || opt.textContent; subEl.textContent = cap[1] || '';
          if (!load(opt.value, opt.textContent)){ st.key = null; return hide(); }
        }
        place(); st.vis = true; el.classList.add('show');
        if (!st.raf){ st.last = performance.now(); st.raf = requestAnimationFrame(loop); }
      }
      function hide(){ st.vis = false; el.classList.remove('show'); }

      // the list opens, and its highlight moves: the dropdown marks the open list and the highlighted row
      const sync = () => {
        if (!dd.classList.contains('open')) return hide();
        const list = dd.querySelector('.dd-list');
        const on = list && (list.querySelector('.dd-opt.on') || list.querySelector('.dd-opt[aria-selected="true"]'));
        show(on ? [...list.children].indexOf(on) : sel.selectedIndex);
      };
      new MutationObserver(sync).observe(dd, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'aria-selected'] });
    }
  }
  window.__holo = { attach };
})();
