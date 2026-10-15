'use strict';
(function(){
const $=id=>document.getElementById(id);
if(typeof THREE==='undefined'||!window.__TG){$('view').insertAdjacentHTML('beforeend','<div style="position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;color:#8a8f97">The 3D engine failed to load in this browser. Try a current Chrome, Edge, Firefox or Safari.</div>');return;}
const TG=window.__TG,D2R=Math.PI/180,clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

/* ================= DATA ================= */
// the six gauges A to F (js/tgauge.js), shortest to longest
const GAUGES=TG.GAUGES;
const SAMPLES=[
 {id:'hub',name:'Pulley hub',nom:12,H:30,shape:'round',wall:7,tag:'Small bore',taper:0},
 {id:'bush',name:'Bushing housing',nom:16.5,H:34,shape:'rect',w:46,d:40,tag:'Block',taper:0},
 {id:'brg',name:'Bearing housing',nom:25.4,H:38,shape:'rect',w:64,d:56,tag:'1 inch bore',taper:0},
 {id:'slot',name:'Slot block',nom:22,H:36,shape:'slot',len:60,w:52,d:84,tag:'Slot width',taper:0},
 {id:'sleeve',name:'Worn cylinder',nom:42,H:50,shape:'round',wall:6,tag:'Tapered bore',taper:.09},
 {id:'flange',name:'Pipe flange',nom:62,H:30,shape:'round',wall:12,bolts:6,tag:'Large bore',taper:0},
 {id:'cyl',name:'Cylinder block',nom:96,H:60,shape:'round',wall:10,tag:'Big bore',taper:0}
];
function reroll(){SAMPLES.forEach(s=>{s.actual=+(s.nom+(Math.random()-.5)*.24).toFixed(2);});}
reroll();
const pickGauge=D=>TG.pick(D);

/* ================= STATE ================= */
const S={unit:'in',dragY:true,dragR:true,mTool:'micrometer',view:'cut',aids:true,auto:true,labels:false,si:0,gi:0,g:GAUGES[0],sample:SAMPLES[0],
 unlocked:false,lockedL:10,inserted:false,insertT:0,tilt:0,tiltCmd:0,depth:14,curL:10,
 minSeen:Infinity,seenPos:false,seenNeg:false,knob:0,lockInfo:null,measured:null,orbited:false,revealed:false,partChanged:false};
const holeD=d=>{const s=S.sample;return s.actual+s.taper*(1-clamp(d,0,s.H)/s.H);};
// where the gauge waits before it goes in: just an inch (25.4 mm) above the part, right over the hole
const HOVER=25.4;
// getting in: the heads are pushed in and the knob locked, and the gauge waits this long over the hole (arrows and a bubble say so) before it goes down
const PINCH_MS=1000,BUBBLE_MS=7000;   // (the bubble's words stay up for 7 s; its arrows only pulse for the first ARROW_MS of that)
const ARROW_MS=2800;

/* ================= RENDERER / SCENE ================= */
const stage=$('view'),cv=$('cv');
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});
// The resolution adapts to hold the frame rate: it steps down when frames run long and back up when there is time to spare (see adaptResolution)
const DPR_MAX=Math.min(devicePixelRatio||1,2),DPR_MIN=Math.min(1,DPR_MAX)*.75;let dprCur=DPR_MAX,dprCeil=DPR_MAX;
renderer.setPixelRatio(dprCur);
// The 3D view is drawn only when something in it can have changed: the gauge or the camera moves, a dissolve runs, or for a moment after any input
// (a click, a key, the wheel, typing). A slow heartbeat catches anything that lands later on its own. A still gauge then costs next to nothing.
let drawUntil=0,lastDraw=0,lastSig='';
function invalidate(ms){drawUntil=Math.max(drawUntil,performance.now()+(ms||400));}
['pointerdown','pointermove','pointerup','wheel','keydown','keyup','input','change','click','focus'].forEach(t=>window.addEventListener(t,()=>invalidate(),{capture:true,passive:true}));
document.addEventListener('visibilitychange',()=>invalidate(1000));
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
renderer.localClippingEnabled=true;
renderer.setClearColor(0x000000,0);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(32,1,1,4000);
const hemi=new THREE.HemisphereLight(0xcfe0ff,0x1b2026,.45);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,1.5);sun.position.set(90,170,130);scene.add(sun);
const rim=new THREE.DirectionalLight(0x8fb8ff,.6);rim.position.set(-120,60,-80);scene.add(rim);
[hemi,sun,rim].forEach(l=>l.layers.enable(1));   // layer 1 is the flight: the gauge alone, drawn over the whole window (see THE GAUGE FLIES)
(function env(){
 // plain canvas cube-map (no float render targets, so it works on every GPU)
 const face=(top,mid,bot,soft)=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,128);g.addColorStop(0,top);g.addColorStop(.5,mid);g.addColorStop(1,bot);x.fillStyle=g;x.fillRect(0,0,128,128);
  if(soft){x.fillStyle=soft.c;x.fillRect(soft.x,soft.y,soft.w,soft.h);}return c;};
 const side=soft=>face('#e9f0f8','#7d8a99','#10151b',soft);
 const imgs=[side({c:'#ffffff',x:20,y:14,w:44,h:34}),side({c:'#dfe9ff',x:70,y:20,w:40,h:50}),
  face('#ffffff','#f3f7fb','#c9d3de',{c:'#ffffff',x:30,y:30,w:68,h:68}),face('#0c1015','#0c1015','#0c1015'),
  side({c:'#ffffff',x:34,y:10,w:60,h:30}),side({c:'#cfe0ff',x:10,y:30,w:50,h:40})];
 const t=new THREE.CubeTexture(imgs);t.encoding=THREE.sRGBEncoding;t.needsUpdate=true;scene.environment=t;
})();
const cutPlane=new THREE.Plane(new THREE.Vector3(0,0,-1),0);

/* ================= MATERIALS ================= */
// fine turning lines round the tubes and rods, as a bump map
const {steel:matSteel,knurl:matKnurl,dark:matDark,chrome:matChrome}=TG.materials(THREE);   // the gauge's metal (js/tgauge.js), the same in every tool
const matMark=new THREE.MeshStandardMaterial({color:0xe0a93e,metalness:1,roughness:.3});
const partMat=new THREE.MeshStandardMaterial({color:0x9aa5b1,metalness:.8,roughness:.5,side:THREE.DoubleSide});
const edgeMat=new THREE.LineBasicMaterial({color:0x0a0d10,transparent:true,opacity:.5});
function hatchTex(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.fillStyle='#c4b08a';x.fillRect(0,0,64,64);x.strokeStyle='#76653f';x.lineWidth=3;x.beginPath();for(let k=-64;k<=128;k+=16){x.moveTo(k,64);x.lineTo(k+64,0);}x.stroke();const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/8,1/8);t.encoding=THREE.sRGBEncoding;return t;}
const capMat=new THREE.MeshStandardMaterial({map:hatchTex(),metalness:.1,roughness:.7});
// the bench is a precision-ground inspection surface plate (js/plate.js): chamfered steel with the fine crescent marks of the
// grinder, a soft sheen, and its grade stamped near the front edge. Its top face is the table the part sits on.
const bench=window.__plate?window.__plate(THREE).slab(1500,720,48,3):new THREE.Mesh(new THREE.PlaneGeometry(1500,720),new THREE.MeshStandardMaterial({color:0x5b6068,roughness:.5,metalness:.8}));
if(!window.__plate)bench.rotation.x=-Math.PI/2;
scene.add(bench);

/* ================= SHOP GRAPHICS ================= */
// On: the realistic machine-shop look (real metal finishes, the ground surface plate). Off: plain solid colours. The choice is shared with
// the other tools. Switching paints the new look over the old one (js/dissolve.js).
S.shop=false;try{S.shop=localStorage.getItem('pt-real-finish')==='1';}catch(e){}
const REAL=new WeakMap(),benchTop=Array.isArray(bench.material)?bench.material[0]:bench.material;
const PLAIN_METAL=new THREE.Color(0x6f757c);
function shopLook(root){
 root.traverse(o=>{
  if(!o.isMesh||(o.userData&&o.userData.paintOverlay))return;
  for(const m of Array.isArray(o.material)?o.material:[o.material]){
   if(!m||!m.isMeshStandardMaterial||m.transparent||(m.userData&&m.userData.dissolve))continue;
   let r=REAL.get(m);if(!r){r={map:m.map,roughnessMap:m.roughnessMap,bumpMap:m.bumpMap,color:m.color.clone(),metalness:m.metalness,roughness:m.roughness,env:m.envMapIntensity};REAL.set(m,r);}
   if(S.shop){m.map=r.map;m.roughnessMap=r.roughnessMap;m.bumpMap=r.bumpMap;m.color.copy(r.color);m.metalness=r.metalness;m.roughness=r.roughness;m.envMapIntensity=r.env;}
   else{
    // the markings (graduations, dial numbers) stay; only the grinding and turning marks and the shine go
    if(m===benchTop){m.map=null;m.color.setHex(0x1d2126);}
    else if(r.metalness>=.5)m.color.copy(r.color).lerp(PLAIN_METAL,.55);
    m.roughnessMap=null;if(!m.userData.knurl)m.bumpMap=null;   // (the knurl is the grip's shape, not a finish: it stays)
    m.metalness=r.metalness>=.5?.3:r.metalness;m.roughness=r.metalness>=.5?.6:Math.max(r.roughness,.55);m.envMapIntensity=.55;
   }
   m.needsUpdate=true;
  }
 });
}
function shopApply(){shopLook(scene);bench.children.forEach(c=>{c.visible=S.shop;});}

/* ================= GAUGE MODEL ================= */
// The T-handle gauge: a short round hub, a tube out of each side of it, a spring-loaded rod telescoping out of each
// tube to a round contact head, and a handle ending in a small knurled lock knob. The cross-bar is symmetrical: both
// rods come out the same amount, so the handle stays over the middle of the gap between the heads.
// The gauge and the part share one group, which dissolves away when another tab opens and builds back in when this one
// returns (js/shell.js asks, through window.__toolFx). A new part or a new gauge dissolves the old one out and builds the
// new one in, the way the other tools swap their parts.
const Dissolve=window.__dissolveFx?window.__dissolveFx(THREE):{out:(o,p)=>{if(p&&p.done)p.done();return Promise.resolve();},in:()=>Promise.resolve(),tool:()=>null};
const toolRoot=new THREE.Group();scene.add(toolRoot);
const gaugeRoot=new THREE.Group();toolRoot.add(gaugeRoot);
let gaugeGrp=null,pivot=new THREE.Group();   // each new gauge gets its own group and pivot
let GP={};
// the old piece dissolves out where it is, and goes once it has gone (it can't be picked up meanwhile)
function retire(old,parent){
 old.traverse(o=>{if(o.userData)delete o.userData.part;});
 Dissolve.out(old,{cells:40,frame:()=>invalidate(120),done:()=>{parent.remove(old);old.traverse(o=>{if(o.geometry)o.geometry.dispose();});}});
}
const xcyl=r=>{const g=new THREE.CylinderGeometry(r,r,1,32);g.rotateZ(Math.PI/2);return g;};
function tag(m,part){m.userData.part=part;return m;}
// an arrow along +x with its tip at +len/2: a shaft and a cone, drawn on top of everything
function arrowMesh(g){
 const r=g.rr,len=r*4.2,head=r*1.8,grp=new THREE.Group(),mat=new THREE.MeshBasicMaterial({color:0xffc800,depthTest:false,transparent:true,opacity:1,side:THREE.DoubleSide,toneMapped:false});
 const shaft=new THREE.Mesh(new THREE.CylinderGeometry(r*.36,r*.36,len-head,14),mat);shaft.rotation.z=-Math.PI/2;shaft.position.x=-head/2;
 const cone=new THREE.Mesh(new THREE.ConeGeometry(r*1.05,head,18),mat);cone.rotation.z=-Math.PI/2;cone.position.x=len/2-head/2;
 shaft.renderOrder=cone.renderOrder=30;grp.add(shaft,cone);grp.visible=false;
 return{grp,mat,len};
}
function buildGauge(i){
 const g=GAUGES[i];S.g=g;S.gi=i;
 const oldGauge=gaugeGrp;
 gaugeGrp=new THREE.Group();pivot=new THREE.Group();gaugeGrp.add(pivot);gaugeRoot.add(gaugeGrp);
 const tubeLen=g.tubeLen,mats={steel:matSteel,knurl:matKnurl,dark:matDark,chrome:matChrome};
 // the round hub and the handle (a plain shaft, a knurled grip and the small knurled lock knob at the tip): js/tgauge.js
 const hubG=TG.hubGroup(THREE,g.min,1,mats),hg=TG.handleGroup(THREE,g.min,1,mats,1);
 // each tube: a groove, a bevelled end; the rods slide out of them, and end in the round heads
 const tubeGeo=s=>{const geo=new THREE.LatheGeometry(TG.tubeProfile(g).map(p=>new THREE.Vector2(Math.max(0,p[0]),p[1])),56);geo.rotateZ(-Math.PI/2);geo.translate(g.tubeStart,0,0);if(s<0)geo.rotateY(Math.PI);return geo;};
 const tubes=[-1,1].map(s=>tag(new THREE.Mesh(tubeGeo(s),matSteel),'gauge'));
 const rods=[-1,1].map(()=>tag(new THREE.Mesh(xcyl(g.rr),matSteel),'gauge'));
 // each head: a flat-looking end that is really a very shallow dome (radius R), which is what touches the wall
 const capG=s=>{const c=new THREE.SphereGeometry(g.R,48,14,0,Math.PI*2,0,Math.asin(g.rr/g.R));c.rotateZ(-Math.PI/2);if(s<0)c.rotateY(Math.PI);return c;};
 const tips=[-1,1].map(s=>tag(new THREE.Mesh(capG(s),matSteel),'gauge'));
 pivot.add(hubG,...tubes,...rods,...tips,hg.group);
 const arrows=[arrowMesh(g),arrowMesh(g)];pivot.add(arrows[0].grp,arrows[1].grp);
 const dotG=new THREE.CircleGeometry(.9+g.rr*.25,20),dotM=new THREE.MeshBasicMaterial({color:0xffd43b,depthTest:false,transparent:true,opacity:.95});
 const dL=new THREE.Mesh(dotG,dotM),dR=new THREE.Mesh(dotG,dotM);dL.renderOrder=dR.renderOrder=20;dL.visible=dR.visible=false;gaugeGrp.add(dL,dR);
 GP={rods,tips,knobG:hg.knob,tubeLen,dL,dR,arrows};
 if(!S.shop)shopLook(gaugeGrp);
 FLY.layer=0;if(FLY.on)setFlyLayer(1);
 if(oldGauge){retire(oldGauge,gaugeRoot);Dissolve.in(gaugeGrp,{cells:40,frame:()=>invalidate(120)});}
}
function poseGauge(th,L,my){
 const g=S.g,u=[Math.cos(th),Math.sin(th)];
 pivot.position.set(0,my,0);pivot.rotation.set(0,0,th);pivot.scale.setScalar(1);
 // each head's centre sits half the length out from the middle, less its own radius
 const xc=L/2-g.R,xb=L/2-g.hd,xa=g.tubeOut-1,len=Math.max(.01,xb-xa);
 GP.rods.forEach((m,k)=>{const s=k?1:-1;m.scale.x=len;m.position.x=s*(xa+len/2);});
 GP.tips[0].position.x=-xc;GP.tips[1].position.x=xc;
 GP.knobG.rotation.y=S.knob;
 // contact dots (world, in the cut plane)
 const D=holeD(S.depth),r=g.hr,touch=S.insertT>.97&&Math.abs(2*r+(D-2*r)/Math.cos(th)-L)<.04&&S.inserted;
 GP.dL.visible=GP.dR.visible=touch;
 {const bb=S.bubble,now=performance.now(),on=!!(bb&&bb.arrows&&now-bb.t0<Math.min(bb.ms,ARROW_MS)&&!FLY.on),inward=on&&bb.arrows==='in';
  GP.arrows.forEach((a,k)=>{a.grp.visible=on;if(!on)return;
   const sd=k?1:-1,since=now-bb.t0,pulse=Math.sin(since/1000*Math.PI*6)*.5+.5,fade=Math.min(1,(Math.min(bb.ms,ARROW_MS)-since)/220,since/120+.25);
   // both sit clear of the gauge, just beyond each head, so the two are well apart: pushing in, they point at the heads and nudge toward them;
   // pushing out, they point away from the gauge at the wall and nudge toward it
   const off=inward?L/2+g.rr*2.2+a.len/2+(1-pulse)*g.rr*2:L/2+g.rr*2.2+a.len/2+pulse*g.rr*1.8;
   a.grp.position.set(sd*off,0,g.rr*1.2);a.grp.scale.x=inward?-sd:sd;a.mat.opacity=Math.max(0,fade);});}
 if(touch){const cl=[-u[0]*xc,my-u[1]*xc],cr=[u[0]*xc,my+u[1]*xc];
  GP.dL.position.set(cl[0]-r*.9,cl[1],r+.2);GP.dR.position.set(cr[0]+r*.9,cr[1],r+.2);}
}

/* ================= PART MODEL ================= */
let partG=new THREE.Group();toolRoot.add(partG);let capMesh=null,benchTarget=-30;
function rrect(p,hw,hd,rad){p.moveTo(-hw+rad,-hd);p.lineTo(hw-rad,-hd);p.quadraticCurveTo(hw,-hd,hw,-hd+rad);p.lineTo(hw,hd-rad);p.quadraticCurveTo(hw,hd,hw-rad,hd);p.lineTo(-hw+rad,hd);p.quadraticCurveTo(-hw,hd,-hw,hd-rad);p.lineTo(-hw,-hd+rad);p.quadraticCurveTo(-hw,-hd,-hw+rad,-hd);}
// the part's solid (a plate or block with the hole, and any bolt holes) for a sample: used for the part itself and its preview
function partShapeGeo(s){
 const D=s.actual,H=s.H,Dm=D+s.taper/2;let halfW;
 const sh=new THREE.Shape();
 if(s.shape==='round'){const R=D/2+s.wall;sh.absarc(0,0,R,0,Math.PI*2,false);halfW=R;}
 else{const hw=Math.max(s.w/2,D/2+8),hd=(s.d||s.w)/2;rrect(sh,hw,hd,5);halfW=hw;}
 const hole=new THREE.Path();
 if(s.shape==='slot'){const hw=Dm/2,hl=s.len/2-hw;hole.moveTo(-hw,-hl);hole.lineTo(-hw,hl);hole.absarc(0,hl,hw,Math.PI,0,true);hole.lineTo(hw,-hl);hole.absarc(0,-hl,hw,0,-Math.PI,true);}
 else hole.absarc(0,0,Dm/2,0,Math.PI*2,true);
 sh.holes.push(hole);
 const bh=(x,y,r)=>{const b=new THREE.Path();b.absarc(x,y,r,0,Math.PI*2,true);sh.holes.push(b);};
 if(s.bolts){for(let k=0;k<s.bolts;k++){const a=k/s.bolts*Math.PI*2+Math.PI/6,rr=D/2+s.wall-6;bh(Math.cos(a)*rr,Math.sin(a)*rr,3.4);}}
 else if(s.shape==='rect'){bh(halfW-7,0,3);bh(-halfW+7,0,3);}
 else if(s.shape==='slot'){[[1,1],[1,-1],[-1,1],[-1,-1]].forEach(q=>bh(q[0]*(halfW-7),q[1]*((s.d||s.w)/2-9),3));}
 const geo=new THREE.ExtrudeGeometry(sh,{depth:H,bevelEnabled:false,curveSegments:72});geo.rotateX(Math.PI/2);
 return{geo,halfW,D,H,Dm};
}
function buildPart(){
 const oldPart=partG;partG=new THREE.Group();toolRoot.add(partG);
 const s=S.sample,{geo,halfW,D,H}=partShapeGeo(s);S.partHalfW=halfW;
 const mesh=new THREE.Mesh(geo,partMat);partG.add(mesh);
 partG.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo,28),edgeMat));
 // section cap at z=0 (visible in cutaway)
 const wt=(D+s.taper)/2,wb=D/2,capShape=sx=>{const c=new THREE.Shape();c.moveTo(sx*halfW,0);c.lineTo(sx*wt,0);c.lineTo(sx*wb,-H);c.lineTo(sx*halfW,-H);c.closePath();return c;};
 capMesh=new THREE.Group();capMesh.add(new THREE.Mesh(new THREE.ShapeGeometry(capShape(-1)),capMat),new THREE.Mesh(new THREE.ShapeGeometry(capShape(1)),capMat));
 partG.add(capMesh);
 benchTarget=-H-.2;if(!oldPart.children.length)bench.position.y=benchTarget;   // the bench eases to its new height
 setView(S.view);
 if(oldPart.children.length){retire(oldPart,toolRoot);Dissolve.in(partG,{cells:40,frame:()=>invalidate(120)});}else toolRoot.remove(oldPart);
}
function setView(v){
 S.view=v;const cut=v==='cut';
 partMat.clippingPlanes=cut?[cutPlane]:null;edgeMat.clippingPlanes=cut?[cutPlane]:null;
 partMat.transparent=v==='xray';partMat.opacity=v==='xray'?.26:1;partMat.depthWrite=v!=='xray';
 partMat.needsUpdate=true;edgeMat.needsUpdate=true;if(capMesh)capMesh.visible=cut;
}

/* ================= SIMULATION ================= */
function inHoleMode(){return S.inserted||S.insertT>.25;}
// the heads span D / cos(tilt) across a bore of diameter D (less the heads' own roundness)
function lengthFor(th,D){const g=S.g,r=g.hr;
 if(!S.unlocked)return S.lockedL;
 return clamp(2*r+(D-2*r)/Math.cos(th),g.min,g.max);}
function collide(th,D){
 const g=S.g,oy=-S.depth;
 if(oy>=0)return false;
 const xTop=(0-oy)*(-Math.tan(th));   // where the handle crosses the top face
 return Math.abs(xTop)+g.rs>holeD(0)/2;
}
function limits(){
 const g=S.g,D=holeD(S.depth),r=g.hr,c=D-2*r;
 const Lref=S.unlocked?g.min:S.lockedL;let lo=0;
 if(c<Lref-2*r)lo=Math.acos(clamp(c/(Lref-2*r),0,1));
 let hi=25*D2R;
 if(S.unlocked&&c<g.max-2*r)hi=Math.min(hi,Math.acos(c/(g.max-2*r)));
 const res={lo,D,hi:[-1,-1],ok:false,tooBig:Lref>D+.001};
 [1,-1].forEach((s,i)=>{let best=-1;for(let a=lo;a<=hi+1e-9;a+=.25*D2R){if(collide(s*a,D))break;best=a;}res.hi[i]=best;});
 res.ok=lo<=hi&&(res.hi[0]>=0||res.hi[1]>=0);
 return res;
}
function clampTilt(t,q){
 q=q||limits();if(!q.ok)return t;
 let hp=q.hi[0],hn=q.hi[1];
 if(q.lo>0){
  if(Math.abs(t)<q.lo){t=(t<0?-1:1)*q.lo;}
  if(t>0&&hp<0)t=-q.lo;if(t<0&&hn<0)t=q.lo;
 }
 if(hp<0)hp=-1e-9;if(hn<0)hn=-1e-9;
 return t>0?Math.min(t,Math.max(hp,0)):Math.max(t,-Math.max(hn,0));
}
function exactL(){
 const g=S.g,D=holeD(S.depth);
 if(S.zeroCheck)return g.min;   // Show me: the gauge closed all the way, to prove its lowest value
 if(!S.unlocked)return S.lockedL;
 return inHoleMode()?lengthFor(S.tilt,D):g.max;
}
// (while the Show me step that wants the handle dead straight is up, the last third of a degree pulls into 0.0°, so it can be done by hand)
const SQUARE_TOL=.5*D2R;
function snapSquare(rad){try{return(G.on&&GSTEPS[G.i]&&GSTEPS[G.i].square&&Math.abs(rad)<.35*D2R)?0:rad;}catch(e){return rad;}}
function setTiltCmd(rad){S.tiltCmd=clamp(snapSquare(rad),-25*D2R,25*D2R);$('tilt').value=(S.tiltCmd/D2R).toFixed(2);}
function resetFlagsRock(){S.minSeen=Infinity;S.seenPos=S.seenNeg=false;}
function resetGauge(){
 const g=S.g;S.unlocked=false;S.lockedL=+(g.min+(g.max-g.min)*.18).toFixed(2);S.inserted=false;S.insertT=0;
 S.tilt=0;setTiltCmd(0);S.curL=S.lockedL;S.knob=Math.PI;S.lockInfo=null;S.measured=null;S.entryLock=false;S.pinchT0=0;S.easeUntil=0;S.bubble=null;resetFlagsRock();
 $('mic').classList.add('hidden');
}
function toggleLock(){
 if(S.unlocked){ // lock
  const L=exactL(),inHole=S.inserted&&S.insertT>.9;
  S.lockedL=L;S.unlocked=false;S.curL=L;
  S.lockInfo={inHole,tilt:S.tilt,depth:S.depth,D:holeD(S.depth),L};
  if(inHole)showBubble(Math.abs(S.tilt)/D2R<1.2?'Locked, dead straight. The size is held.':'Locked '+Math.abs(S.tilt/D2R).toFixed(1)+'° off square.',BUBBLE_MS,null);
  if(inHole)toast(Math.abs(S.tilt)/D2R<1.2?'Locked square. Nice.':'Locked at '+Math.abs(S.tilt/D2R).toFixed(1)+'° off square. Expect an oversize reading.',Math.abs(S.tilt)/D2R<1.2?'good':'bad');
 }else{
  S.unlocked=true;S.entryLock=false;resetFlagsRock();S.lockInfo=null;
  if(S.inserted&&S.insertT>.9){S.easeUntil=performance.now()+800;showBubble('Unlocked: the springs push both heads out against the wall.',BUBBLE_MS,'out');}   // the heads spring out to the bore, slowly enough to see
 }
}
function toggleInsert(){
 if(S.inserted){S.inserted=false;S.entryLock=false;resetFlagsRock();return;}
 const g=S.g,Dm=Math.min(holeD(0),holeD(S.depth));
 if(g.min>Dm+.001){toast('Gauge '+g.name+' is too big for this hole. Try the next size down.');return;}
 // going in: both heads are pushed in and the knob is locked, so the gauge fits through the opening (it is unlocked again once it is down in the bore)
 const was={unlocked:S.unlocked,lockedL:S.lockedL},fromL=S.curL,to=+clamp(Math.min(S.unlocked?g.max:S.lockedL,Dm-.6),g.min,g.max).toFixed(2);
 S.unlocked=false;S.lockedL=to;
 const q=limits();
 if(!q.ok){S.unlocked=was.unlocked;S.lockedL=was.lockedL;toast('The handle would hit the bore edge. Reduce depth or tilt.');return;}
 S.inserted=true;resetFlagsRock();S.lockInfo=null;
 setTiltCmd(S.tiltCmd);
 S.entryLock=true;S.pinchT0=performance.now();
 const squeeze=fromL-to>.3;
 showBubble(squeeze?'Pushing both heads in and locking the knob, so the gauge fits through the opening.':'Locking the knob so the heads stay in as it slides through the opening.',BUBBLE_MS,squeeze?'in':null);
}
function trySetDepth(v){
 const old=S.depth;S.depth=v;
 if(S.inserted&&!limits().ok){S.depth=old;$('depth').value=old;toast(S.unlocked?'The handle would hit the bore edge.':'Jammed! The bore is tighter down there, and the gauge is locked wider.');return;}
 $('depthOut').textContent=v+' mm';
}
// the handle has to stand clear of the hole, so a short gauge can't go as deep
function setDepthMax(){
 const dmax=Math.max(6,Math.min(40,S.sample.H-5,S.g.hl-10));
 $('depth').max=dmax;S.depth=Math.min(S.depth,dmax,14);$('depth').value=S.depth;$('depthOut').textContent=S.depth+' mm';
}
function statusInfo(){
 const g=S.g,D=holeD(S.depth),deg=Math.abs(S.tilt/D2R);
 if(FLY.waiting)return{t:'Opening the '+(TOOL_NAME[S.mTool]||'tool')+' on the right. The gauge flies over when it is ready.',c:''};
 if(AW.t>0)return{t:'The gauge is on the '+(TOOL_NAME[S.mTool]||'tool')+' in the panel on the right. Close that panel to bring it back.',c:''};
 if(!S.inserted)return S.unlocked?{t:'Unlocked. The springs have pushed both rods out. Insert it in the hole.',c:''}:{t:'Locked at '+fmtLen(S.lockedL)+'. Unlock the knob to let the springs work.',c:''};
 if(S.inserted&&S.pinchT0&&performance.now()-S.pinchT0<PINCH_MS)return{t:'Pushing the heads in and locking the knob so the gauge fits through the opening…',c:'warn'};
 if(S.insertT<.9)return {t:'Sliding in…',c:''};
 if(!S.unlocked&&S.entryLock&&!S.lockInfo)return{t:'Locked narrow to get in. Unlock the knob and the springs push both heads out against the wall.',c:'warn'};
 if(S.unlocked){
  if(D>g.max+.05)return{t:'No contact: the hole is bigger than this gauge reaches.',c:'bad'};
  if(deg<1)return{t:'Square, so it’s at its shortest. Lock the knob now.',c:'ok'};
  return{t:'Rock the handle through square. The shortest length is the diameter.',c:'warn'};
 }
 if(S.lockInfo&&S.lockInfo.inHole){const ld=Math.abs(S.lockInfo.tilt/D2R);return ld<1.2?{t:'Locked square. Take it out and measure it.',c:'ok'}:{t:'Locked '+ld.toFixed(1)+'° off square, so it reads long. Unlock and rock again.',c:'bad'};}
 return {t:'Locked at '+fmtLen(S.lockedL)+'. Take it out carefully.',c:''};
}

/* ================= CAMERA ================= */
// The camera follows the gauge, not the part, and always looks at the gauge's face, front-on. A view button picks how close;
// panning and zooming are offsets from the gauge, so they carry on as it goes down into the hole and comes back out. An orbit
// drag swings the view a little and it settles back to facing the gauge when you let go.
const cam={th:0,ph:1.45,r:140,t:new THREE.Vector3(0,-8,0),off:new THREE.Vector3(),dth:0,dph:0,zoom:1,zs:1,speed:5,snap:true,fixed:false,orb:false,auto:null};
const EX={on:false,spin:false,saved:false};   // Examine
const TANF=Math.tan(camera.fov*D2R/2);
const _anc=new THREE.Vector3();
// the point the camera keeps hold of: the middle of the cross-bar, wherever the gauge is right now (each view then aims a little up the handle)
function gaugeAnchor(out){const e=S.insertT,ee=e*e*(3-2*e),my=-S.depth+(1-ee)*(S.depth+HOVER);return out.set(0,my,0);}
function camPreset(n){const D=S.sample.actual,g=S.g,asp=Math.max(.6,camera.aspect||1.5),K=2*TANF,fit=(w,h)=>Math.max(h/K,w/(K*asp))*1.12;
 // the whole bench: the part and the gauge above it (still centred on the gauge's height, so it follows as it descends)
 if(n==='overview'){const H=S.sample.H,w=Math.max(2*(S.partHalfW||40),g.max)+34,h=HOVER+g.hl+H+22;
  return{th:0,ph:1.4,r:fit(w,h)*1.03,t:[0,(HOVER+g.hl-H)/2-HOVER,0],rel:true};}
 // the whole gauge, hub to knob, with the cross-bar's full reach
 if(n==='gauge'||n==='travel')return{th:0,ph:1.45,r:fit(g.max+56,g.hl+g.rb+40),t:[0,(g.hl-g.rb)/2,0],rel:true};
 // close on the cross-bar and the first stretch of handle (the part's rim is just above it)
 // close on the right-hand head, for the cleaning picture (a slip of paper between it and a clean block)
 if(n==='paper')return{th:-.8,ph:1.36,r:fit(120,100),t:[S.curL/2+6,22,0],rel:true};   // (from the gauge's own side, so the paper's face and its stain are in view)
 // the same for the left-hand head
 if(n==='paperL')return{th:.8,ph:1.36,r:fit(120,100),t:[-S.curL/2-6,22,0],rel:true};
 // the hole itself, from the side through the cutaway: the part's section faces the camera, and the whole gauge stays in the picture, from the
 // bottom of the hole to the very top of the knob (wherever the gauge is just now, tipped over as far as it can go)
 if(n==='hole'){const H=S.sample.H,e=S.insertT,ee=e*e*(3-2*e),my=-S.depth+(1-ee)*(S.depth+HOVER),top=Math.max(my+g.hl,0)+8,bot=-H-6,w=Math.max(2*(S.partHalfW||40),g.max,g.hl*.9)+30,h=top-bot;
  return{th:0,ph:1.47,r:fit(w,h),t:[0,(top+bot)/2,0],rel:false};}
 if(n==='top')return{th:.2,ph:.04,r:70+D*2.2,t:[0,0,0],rel:true};   // straight down the bore (a hair off vertical, so the camera's up direction stays defined)
 return{th:0,ph:1.45,r:fit(g.max+56,g.hl+g.rb+40),t:[0,(g.hl-g.rb)/2,0],rel:true};}
// pick a view. The pan and zoom you made go with it, unless it is the camera choosing for itself.
function camGo(n,instant,fast){PV.p=null;S.camName=n;cam.off.set(0,0,0);cam.zoom=1;cam.fixed=false;cam.auto=null;cam.speed=fast?7:4;if(instant)cam.snap=true;}
function camAuto(n){if(S.camName!==n){S.camName=n;cam.speed=4;}}
function camGoal(){
 const p=camPreset(S.camName||'gauge'),t=[p.t[0],p.t[1],p.t[2]];
 if(p.rel){gaugeAnchor(_anc);t[0]+=_anc.x;t[1]+=_anc.y;t[2]+=_anc.z;}
 return{th:p.th+cam.dth,ph:clamp(p.ph+cam.dph,.03,(S.camName==='hole'||S.camName==='top')?1.62:2.2),r:p.r*cam.zs,t:[t[0]+cam.off.x,t[1]+cam.off.y,t[2]+cam.off.z]};
}
function stepCam(dt){
 // the zoom eases toward where the wheel put it, in log space, so every notch glides and feels the same at any distance
 if(cam.snap)cam.zs=cam.zoom;else{cam.zs=Math.exp(Math.log(cam.zs)+(Math.log(cam.zoom)-Math.log(cam.zs))*(1-Math.exp(-dt*9)));if(Math.abs(Math.log(cam.zoom/cam.zs))<4e-4)cam.zs=cam.zoom;}
 const g=camGoal();
 if(cam.snap){cam.th=g.th;cam.ph=g.ph;cam.r=g.r;cam.t.set(g.t[0],g.t[1],g.t[2]);cam.snap=false;}
 else{
  // a drag answers at once; a view change eases; and once it has settled the camera tracks the gauge closely
  const sp=cam.orb?18:cam.speed,k=1-Math.exp(-dt*sp);
  cam.th+=(g.th-cam.th)*k;cam.ph+=(g.ph-cam.ph)*k;cam.r+=(g.r-cam.r)*k;
  cam.t.x+=(g.t[0]-cam.t.x)*k;cam.t.y+=(g.t[1]-cam.t.y)*k;cam.t.z+=(g.t[2]-cam.t.z)*k;
  cam.speed+=(9-cam.speed)*(1-Math.exp(-dt*.9));
 }
 if(EX.on&&EX.spin&&!cam.orb)cam.dth+=dt*.45;
 // (a view picked by hand, Hole or Top, stays where you turn it to; the others settle back to facing the gauge)
 if(!cam.orb&&!EX.on&&!(!cam.auto&&(S.camName==='hole'||S.camName==='top'))){const d=Math.exp(-dt*4.5);cam.dth*=d;cam.dph*=d;if(Math.abs(cam.dth)<1e-4)cam.dth=0;if(Math.abs(cam.dph)<1e-4)cam.dph=0;}
 const sp=Math.sin(cam.ph);camera.position.set(cam.t.x+cam.r*sp*Math.sin(cam.th),cam.t.y+cam.r*Math.cos(cam.ph),cam.t.z+cam.r*sp*Math.cos(cam.th));
 camera.lookAt(cam.t);
 // (hole and top views stay where they are turned to; the others settle back, and that settling turns about the same point)
 const settles=!EX.on&&!(!cam.auto&&(S.camName==='hole'||S.camName==='top'))&&(Math.abs(cam.dth)>1e-4||Math.abs(cam.dph)>1e-4);
 if(PV.p&&(cam.orb||settles))pvHold();else if(!cam.orb)PV.p=null;
}
let rsW=0,rsH=0,rsD=0;
function resize(){
 const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
 // Resizing clears the canvas, and the observer runs after the frame was drawn: while a panel slides open or shut that painted an empty frame
 // after every step (the flicker). So the picture is drawn again at once, at the new size, before anything is painted.
 if(w!==rsW||h!==rsH||dprCur!==rsD){rsW=w;rsH=h;rsD=dprCur;renderer.setPixelRatio(dprCur);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(S.sized)try{renderer.render(scene,camera);}catch(e){}}
 else{camera.aspect=w/h;camera.updateProjectionMatrix();}
 if(!S.sized)cam.snap=true;
 S.sized=true;
}
new ResizeObserver(resize).observe(stage);

/* ================= TURNING THE VIEW ABOUT THE POINT UNDER THE POINTER ================= */
// A drag that swings the view turns it about whatever is under the pointer (the gauge, the part, the bench; over empty space, the spot at the
// distance of the gauge), not about the middle of the view. Each frame the camera and its pan offset slide sideways just enough that the picked
// point stays exactly where it was on screen, which is the same as turning round it. It is let go of when the swing has finished.
const PV={p:null,nx:0,ny:0},_pvv=new THREE.Vector3(),_pvd=new THREE.Vector3(),_pvr=new THREE.Vector3(),_pvu=new THREE.Vector3(),_pvf=new THREE.Vector3(),pvRay=new THREE.Raycaster();
function pvPick(e){
 const b=cv.getBoundingClientRect();if(b.width<2||b.height<2)return;
 const nx=(e.clientX-b.left)/b.width*2-1,ny=-((e.clientY-b.top)/b.height)*2+1;
 pvRay.setFromCamera(new THREE.Vector2(nx,ny),camera);
 const seen=h=>{const o=h.object,m=o.material;if(!o.isMesh||!m||Array.isArray(m)||m.depthTest===false||m.visible===false||m.side===THREE.BackSide)return false;for(let q=o;q;q=q.parent)if(!q.visible)return false;return true;};
 const hit=pvRay.intersectObject(scene,true).find(seen);
 PV.p=hit?hit.point.clone():pvRay.ray.origin.clone().addScaledVector(pvRay.ray.direction,camera.position.distanceTo(cam.t));
 PV.nx=nx;PV.ny=ny;
}
function pvHold(){
 if(!PV.p)return;
 camera.updateMatrixWorld();
 _pvv.copy(PV.p).project(camera);
 const dx=_pvv.x-PV.nx,dy=_pvv.y-PV.ny;
 if(Math.abs(dx)+Math.abs(dy)<1e-5)return;
 camera.matrixWorld.extractBasis(_pvr,_pvu,_pvf);
 const depth=Math.max(1,-_pvd.copy(PV.p).applyMatrix4(camera.matrixWorldInverse).z),hh=depth*TANF,hw=hh*camera.aspect;
 _pvd.set(0,0,0).addScaledVector(_pvr,dx*hw).addScaledVector(_pvu,dy*hh);
 cam.off.add(_pvd);cam.t.add(_pvd);camera.position.add(_pvd);camera.lookAt(cam.t);
}

/* ================= POINTER ================= */
const ray=new THREE.Raycaster(),ptrs=new Map();let drag=null,pinch0=0;
function hitPart(e){const b=cv.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-b.left)/b.width*2-1,-((e.clientY-b.top)/b.height)*2+1),camera);
 const h=ray.intersectObject(gaugeRoot,true).filter(x=>x.object.userData.part);return h.length?h[0].object.userData.part:null;}
// Panning slides the view sideways and up or down from the gauge, keeping the same angle: right-drag, middle-drag, Shift+drag,
// or two fingers on a touch screen. It stays with the gauge as it moves.
const _pr=new THREE.Vector3(),_pu=new THREE.Vector3(),_pf=new THREE.Vector3();
function panBy(dx,dy){
 camera.updateMatrixWorld();camera.matrixWorld.extractBasis(_pr,_pu,_pf);
 const k=2*cam.r*TANF/Math.max(1,cv.clientHeight);
 cam.off.addScaledVector(_pr,-dx*k).addScaledVector(_pu,dy*k);
 cam.off.set(clamp(cam.off.x,-320,320),clamp(cam.off.y,-260,260),clamp(cam.off.z,-200,200));
}
// "Move up and down": dragging the gauge down tips it into the hole, then takes it deeper; dragging up brings it back up,
// and out once it is at the top.
function dragVert(dy){
 drag.vy+=dy;if(!drag.vOn){if(Math.abs(drag.vy)<6)return;drag.vOn=true;}
 const mm=dy*2*cam.r*TANF/Math.max(1,cv.clientHeight)*(S.fine?.1:1);
 if(!S.inserted){drag.acc+=mm;if(drag.acc>4&&S.insertT<.05){drag.acc=0;toggleInsert();drag.dep=S.depth;}if(drag.acc<0)drag.acc=0;return;}
 const mx=+$('depth').max;
 drag.dep=clamp((drag.dep==null?S.depth:drag.dep)+mm,6-14,mx+6);
 if(drag.dep<6-10){toggleInsert();drag.dep=null;drag.acc=0;return;}
 const v=Math.round(clamp(drag.dep,6,mx)*10)/10;
 if(v!==S.depth){trySetDepth(v);$('depth').value=S.depth;}
}
let pinchMid=null;
cv.addEventListener('pointerdown',e=>{
 cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(ptrs.size===1){
  const pan=e.button===2||e.button===1||e.shiftKey,h=pan?null:hitPart(e);
  const free=AW.t>0;   // away on the measuring panel the gauge can't be rocked
  const mode=pan?'pan':(!EX.on&&h&&!free&&(h==='knob'||S.dragR||S.dragY))?'rock':'orbit';   // (in Examine a drag always turns the camera, never rocks the gauge)
  drag={mode,part:h,x:e.clientX,y:e.clientY,moved:0,vy:0,vOn:false,acc:0,dep:null};
  if(pan)cv.style.cursor='move';
  if(mode==='orbit'){cam.orb=true;if(EX.on)PV.p=null;else pvPick(e);}else PV.p=null;   // (Examine turns about the gauge itself, not the point under the pointer, so the tool never swings)
  if(h&&AM.on)autoCancel();   // taking hold of the gauge by hand ends Auto measure
 }
 else if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch0=Math.hypot(a.x-b.x,a.y-b.y);pinchMid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};drag=null;cam.orb=false;}
});
cv.addEventListener('pointermove',e=>{
 const p=ptrs.get(e.pointerId);
 if(!p){cv.style.cursor=(hitPart(e)&&(S.dragR||S.dragY))?'grab':'default';return;}
 const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
 if(ptrs.size===2){const [a,b]=[...ptrs.values()],d=Math.hypot(a.x-b.x,a.y-b.y),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  if(pinch0)cam.zoom=clamp(cam.zoom*pinch0/d,.15,4);pinch0=d;
  if(pinchMid)panBy(mid.x-pinchMid.x,mid.y-pinchMid.y);pinchMid=mid;return;}
 if(!drag)return;drag.moved+=Math.abs(dx)+Math.abs(dy);
 if(drag.mode==='pan')panBy(dx,dy);
 else if(drag.mode==='rock'){
  if(drag.part==='knob'&&drag.moved<=6)return;
  drag.part='gauge';cv.style.cursor='grabbing';
  if(S.dragR&&dx)setTiltCmd(S.tiltCmd-dx*.35*D2R*(S.fine?.1:1));
  if(S.dragY&&dy)dragVert(dy);
 }
 else if(drag.mode==='orbit'){if(EX.on){cam.dth-=dx*.008;cam.dph=clamp(cam.dph-dy*.006,-.9,.5);}else{cam.dth=clamp(cam.dth-dx*.006,-Math.PI,Math.PI);cam.dph=clamp(cam.dph-dy*.006,-1.45,1.2);}}
});
function endPtr(e){
 if(drag&&drag.mode==='rock'&&drag.part==='knob'&&drag.moved<6){autoCancel();toggleLock();}
 ptrs.delete(e.pointerId);if(ptrs.size<2){pinch0=0;pinchMid=null;}if(!ptrs.size){drag=null;cam.orb=false;cv.style.cursor='default';}
}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('wheel',e=>{e.preventDefault();const dy=clamp(e.deltaY*(e.deltaMode===1?33:e.deltaMode===2?400:1),-300,300);cam.zoom=clamp(cam.zoom*Math.exp(dy*.0009),.15,4);},{passive:false});
cv.addEventListener('contextmenu',e=>e.preventDefault());

/* ================= FRAME UPDATE ================= */
let last=performance.now(),hudT=0;
function update(dt){
 bench.position.y+=(benchTarget-bench.position.y)*(1-Math.exp(-dt*5));
 const nowT=performance.now(),holding=!!(S.inserted&&S.pinchT0&&nowT-S.pinchT0<PINCH_MS),goal=S.inserted&&!holding?1:0;   // (it waits over the hole while the heads are pushed in)
 S.insertT+=(goal-S.insertT)*(1-Math.exp(-dt*4.5));if(Math.abs(goal-S.insertT)<.003)S.insertT=goal;
 let tgt=S.tiltCmd;
 if(inHoleMode()){tgt=clampTilt(S.tiltCmd);if(S.insertT>.9&&Math.abs(tgt-S.tiltCmd)>.0004){S.tiltCmd=tgt;$('tilt').value=(tgt/D2R).toFixed(2);}}
 if(AW.t>0||AW.dir!==0||FLY.waiting)tgt=0;   // on its way to another tool the gauge stands straight, the way it stands in that tool
 S.tilt+=(tgt-S.tilt)*(1-Math.exp(-dt*20));if(Math.abs(tgt-S.tilt)<1e-4)S.tilt=tgt;
 const kt=S.unlocked?0:Math.PI;S.knob+=(kt-S.knob)*(1-Math.exp(-dt*12));
 const Lt=exactL(),fast=S.inserted&&S.insertT>.9;
 const easing=nowT<(S.easeUntil||0)||!!(S.pinchT0&&nowT-S.pinchT0<PINCH_MS+700);   // pushing in, or springing out: slow enough to watch
 if(((S.unlocked||S.zeroCheck)&&!fast)||easing)S.curL+=(Lt-S.curL)*(1-Math.exp(-dt*(easing?6:(S.zeroCheck?5:16))));else S.curL=Lt;
 // the camera is always on the gauge; unless you chose a view yourself, it closes in on the hole once the gauge is seated and
 // draws back out again when it comes out
 if(!cam.fixed&&AW.t<=0&&(S.camName==='gauge'||S.camName==='hole'||S.camName==='overview'||S.camName==='travel')){
  if(S.inserted&&S.insertT>.95&&cam.auto!=='hole'){cam.auto='hole';camAuto('hole');}
  else if(!S.inserted&&S.insertT<.04&&cam.auto==='hole'){cam.auto=null;camAuto('gauge');}
 }
 const e=S.insertT,ee=e*e*(3-2*e);
 const my=-S.depth+(1-ee)*(S.depth+HOVER);
 awayUpdate(dt);
 poseGauge(S.tilt,S.curL,my);
 awayPose();
 if(S.inserted&&S.insertT>.95&&S.unlocked){
  S.minSeen=Math.min(S.minSeen,S.curL);
  if(S.tilt>2.5*D2R)S.seenPos=true;if(S.tilt<-2.5*D2R)S.seenNeg=true;
 }
 $('tiltOut').textContent=(S.tilt/D2R).toFixed(1)+'°';
}
let lastRenderT=0;const perf=[];
function adaptResolution(now){
 const dt=now-lastRenderT;lastRenderT=now;
 if(dt>120||drag){perf.length=0;return;}   // (a pause, or a drag in hand: never resize then)
 perf.push(dt);if(perf.length<60)return;
 const avg=perf.reduce((a,b)=>a+b,0)/perf.length;perf.length=0;
 if(avg>21&&dprCur>DPR_MIN+.01){dprCeil=dprCur*.95;dprCur=Math.max(DPR_MIN,dprCur*.85);resize();}
 else if(avg<17.4&&dprCur<Math.min(dprCeil,DPR_MAX)-.01){dprCur=Math.min(dprCeil,DPR_MAX,dprCur*1.08);resize();}
}
function tick(now){
 const dt=Math.min(.05,(now-last)/1000);last=now;
 update(dt);stepCam(dt);flyPose();
 const sig=[camera.position.x,camera.position.y,camera.position.z,camera.quaternion.x,camera.quaternion.y,camera.quaternion.z,camera.quaternion.w,camera.aspect,
  pivot.position.x,pivot.position.y,pivot.position.z,pivot.quaternion.x,pivot.quaternion.y,pivot.quaternion.z,pivot.quaternion.w,pivot.scale.x,pivot.visible,
  S.tilt,S.curL,S.knob,S.insertT,S.depth,bench.position.y,AW.t,
  GP.dL&&GP.dL.visible,GP.arrows?GP.arrows.map(a=>a.grp.visible+':'+a.grp.position.x+':'+a.mat.opacity).join(','):''].join('|');   // (the contact dots and the pulsing arrows are timed, so they are part of the picture too)
 const changed=sig!==lastSig;lastSig=sig;
 if(changed||EX.on||FLY.on||AW.dir!==0||now<drawUntil||now-lastDraw>500){
  lastDraw=now;renderer.render(scene,camera);flyRender();adaptResolution(now);
 }
 hudT-=dt;if(hudT<=0){hudT=.08;refreshHud();}
 refreshLabels();refreshBubble();guideTick();
 requestAnimationFrame(tick);
}

/* ================= UI HELPERS ================= */
// sizes read in the chosen unit first (inches to begin with), the other one in parentheses
function fmtLen(mm,d){const i=(mm/25.4).toFixed(d==null?4:d+2)+' in',m=mm.toFixed(d==null?2:d)+' mm';return S.unit==='in'?i+' ('+m+')':m+' ('+i+')';}
function rangeParts(g){const m=g.min+'–'+g.max+' mm';return S.unit==='in'?[g.lab,m]:[m,g.lab];}
// the card's one-line range, in the chosen unit only: "2-1/8 to 3-1/2 in" or "54 to 90 mm"
function fmtRangeHud(g){return S.unit==='in'?g.lab.replace('″','').replace('–',' to ')+' in':g.min+' to '+g.max+' mm';}
function fmtRange(g){const p=rangeParts(g);return p[0]+' ('+p[1]+')';}
function fmtEst(s){const i=(s.nom/25.4).toFixed(2)+' in',m=Math.round(s.nom)+' mm';return S.unit==='in'?i+' ('+m+')':m+' ('+i+')';}
function fmtDepth(v){const i=(v/25.4).toFixed(2)+' in',m=v+' mm';return S.unit==='in'?i+' ('+m+')':m+' ('+i+')';}
let toastT;function toast(m){if(S.practice)m=m.replace(/ ?(at )?[0-9]+(?:[.][0-9]+)? (?:in|mm) [(][0-9]+(?:[.][0-9]+)? (?:in|mm)[)]/g,'');const t=$('toast');t.textContent=m;t.className='toast show';clearTimeout(toastT);toastT=setTimeout(()=>{t.className='toast';},3400);}
const cache={};function setHtml(id,h){if(cache[id]!==h){cache[id]=h;$(id).innerHTML=h;}}
function setTxt(id,t){if(cache[id]!==t){cache[id]=t;$(id).textContent=t;}}

function buildSamples(){
 $('sampleSel').innerHTML=SAMPLES.map((s,i)=>'<option value="'+i+'">'+s.name+' · '+s.tag+'</option>').join('');
 $('sampleSel').value=S.si;
 const s=S.sample;
 $('pcard').innerHTML='<div class="pcard"><b>'+s.name+'</b><small>'+s.tag+'. The size is hidden, just like on a real job.</small>'+
  (S.revealed?'<div class="fres">Actual: Ø'+fmtLen(holeD(S.inserted?S.depth:0))+(s.taper?' at this depth':'')+'</div>':'')+'</div>';
 $('revealBtn').textContent=S.revealed?'Hide actual':'Show actual';
}
function buildGset(){
 const D=S.sample.nom,best=pickGauge(D);
 // the chips are kept and updated in place, so the BEST badge can ease from one to the next (and pop in the first time) instead of being rebuilt
 const box=$('gset'),chip=g=>'<b>'+g.name+'</b><small>'+rangeParts(g)[0]+'</small><small>('+rangeParts(g)[1]+')</small>',fresh=box.children.length!==GAUGES.length;
 if(fresh)box.innerHTML=GAUGES.map((g,i)=>'<button class="gchip" data-i="'+i+'">'+chip(g)+'</button>').join('');
 [...box.children].forEach((b,i)=>{const g=GAUGES[i],h=chip(g);if(b.innerHTML!==h)b.innerHTML=h;b.classList.toggle('fit',D>=g.min&&D<=g.max);b.setAttribute('aria-pressed',String(i===S.gi));});
 const mark=()=>[...box.children].forEach((b,i)=>b.classList.toggle('best',S.auto&&i===best));
 if(fresh)requestAnimationFrame(()=>requestAnimationFrame(mark));else mark();
 const g=S.g;let n;
 if(S.auto)n='This hole is about Ø'+fmtEst(S.sample)+', so auto-pick chose <b>'+g.name+'</b> ('+fmtRange(g)+').';
 else n=D<g.min?'<b>'+g.name+'</b> is too big for this hole: its shortest length is larger than the hole.':D>g.max?'<b>'+g.name+'</b> is too small: the rods can’t reach the far wall.':'<b>'+g.name+'</b> covers this hole'+(Math.min(D-g.min,g.max-D)<1.2?', but with little room to rock.':'.');
 $('gnote').innerHTML=n;
}
function selectGauge(i){buildGauge(i);resetGauge();setDepthMax();buildGset();camGo('gauge');}
function selectSample(i){
 S.si=i;S.sample=SAMPLES[i];S.revealed=false;
 buildPart();
 buildGauge(S.auto?pickGauge(S.sample.nom):S.gi);resetGauge();setDepthMax();buildSamples();buildGset();camGo('overview');
}
// Hand the locked gauge to the micrometer or a caliper. The gauge flies off toward the right-hand side, and the shell
// (js/shell.js) splits the screen: that tool's own full simulator opens in a panel beside this view, puts the gauge on at exactly
// this length and closes on it. Returns false (with a note) when the gauge isn't ready to go.
const TOOL_NAME={micrometer:'outside micrometer',caliper:'dial caliper',vernier:'vernier caliper'};
function send(tool){
 if(S.inserted||S.insertT>.05){toast('Take the gauge out of the hole first.');return false;}
 if(S.unlocked){toast('Lock the knob first. An unlocked gauge springs straight back out.');return false;}
 if(AW.dir>0)return true;   // already on its way
 setTiltCmd(0);   // it stands straight for the trip: that is how it stands in the tool
 const tab=tool||S.mTool||'micrometer',li=S.lockInfo,truth=li&&li.inHole&&!S.practice?li.D:null,mm=S.lockedL,gauge=S.g.name;
 const post=fly=>{try{window.parent.postMessage({tgauge:{tool:tab,mm,truth,gauge,full:true,fly:!!fly}},'*');}catch(e){}};
 S.mTool=tab;
 if(flyInit()){
  // the screen splits and the tool loads completely while the gauge waits here; then it flies across the border (see toolReady)
  FLY.use=true;
  if(AW.t<1){toast('Opening the '+(TOOL_NAME[tab]||tab)+'…');FLY.waiting=true;FLY.spot=null;FLY.qc=null;FLY.fadeEnd=0;AW.dir=0;AW.sent=null;post(true);}
  else post(true);   // already over there (swapping tools): it glides across to the next one
 }else{toast('The gauge is flying over to the '+(TOOL_NAME[tab]||tab)+'…');AW.dir=1;AW.sent=()=>post(false);}
 return true;
}
function measure(){
 if(S.inserted||S.insertT>.05){toast('Take the gauge out of the hole first.');return;}
 if(S.unlocked){toast('Lock the knob first. An unlocked gauge springs straight back out.');return;}
 const li=S.lockInfo,truth=li&&li.inHole?li.D:null;
 S.measured={L:S.lockedL,truth,li};showMic();
}

/* ================= QUICK-READ MICROMETER ================= */
function showMic(){
 const m=S.measured;if(!m)return;const inch=S.unit==='in';
 $('mic').classList.remove('hidden');
 const res=inch?.001:.01,span=inch?1:25,stepN=(inch?.025:.5)/res,N=span/res;
 const val=inch?m.L/25.4:m.L,q=Math.round(val/res+1e-9);
 const baseIdx=Math.floor(q/N)*N,rel=q-baseIdx,sleeveN=Math.floor(rel/stepN)*stepN,thN=rel-sleeveN;
 const dec=inch?3:2,f=n=>(n*res).toFixed(dec);
 drawMic(baseIdx,rel,sleeveN,thN,N,stepN,inch);
 $('lcd').textContent=f(q)+(inch?' in':' mm');
 const Lq=q*res*(inch?25.4:1);
 let rows='<dt>Micrometer range</dt><dd>'+f(baseIdx)+' – '+f(baseIdx+N)+(inch?' in':' mm')+'</dd><dt>Sleeve + thimble</dt><dd>'+f(sleeveN)+' + '+f(thN)+' = '+f(rel)+'</dd><dt>Gauge reading</dt><dd>'+f(q)+(inch?' in':' mm')+'</dd>';
 let v='',vc='';
 if(m.truth==null){v='You locked the gauge outside the hole, so this is only the gauge’s own length. Reset, insert, rock and lock again.';vc='bad';}
 else{
  const err=Lq-m.truth,ae=Math.abs(err),deg=Math.abs(m.li.tilt/D2R);
  rows+='<dt>Actual hole (at that depth)</dt><dd>'+(inch?(m.truth/25.4).toFixed(4)+' in':m.truth.toFixed(3)+' mm')+'</dd><dt>Error</dt><dd>'+(err>=0?'+':'')+(inch?(err/25.4).toFixed(4)+' in':err.toFixed(3)+' mm')+'</dd>';
  if(ae<=.02){v='Excellent. Within two hundredths of a millimetre, which is shop-grade for a telescopic gauge.';vc='ok';}
  else if(ae<=.05){v='Good. Within five hundredths. Squarer rocking would tighten it.';vc='warn';}
  else if(deg>1.2){v='Locked '+deg.toFixed(1)+'° off square. The heads span D ÷ cos θ, so the reading runs long. Reset and lock at the shortest point.';vc='bad';}
  else{v='Off by '+ae.toFixed(2)+' mm. Check you locked at the shortest point and read the micrometer carefully.';vc='bad';}
  if(S.sample.taper&&vc!=='bad')v+=' This bore is tapered: try the depth slider and compare readings top vs bottom.';
  m.err=err;
 }
 $('res').innerHTML=rows;$('verdict').textContent=v;$('verdict').className=vc;
}
function drawMic(baseIdx,rel,sleeveN,thN,N,stepN,inch){
 const c=$('micCv'),x=c.getContext('2d'),W=c.width=824,H=c.height=300;
 x.clearRect(0,0,W,H);
 const x0=30,pr=575/N,xe=x0+rel*pr,cy=150;
 const g=x.createLinearGradient(0,100,0,200);g.addColorStop(0,'#d3dae1');g.addColorStop(.5,'#9aa5b1');g.addColorStop(1,'#cbd2d9');
 x.fillStyle=g;x.fillRect(x0-14,100,575+34,100);
 x.strokeStyle='#111';x.fillStyle='#111';x.lineWidth=2;x.font='600 22px Inter, sans-serif';x.textAlign='center';
 x.beginPath();x.moveTo(x0-14,cy);x.lineTo(x0+575+20,cy);x.stroke();
 const tick=(px,len,up,lw)=>{if(px>xe+.5)return;x.lineWidth=lw;x.beginPath();x.moveTo(px,cy);x.lineTo(px,cy+(up?-len:len));x.stroke();};
 if(!inch){for(let i=0;i<=25;i++){const px=x0+i*100*pr;tick(px,i%5?20:34,true,i%5?2:3);if(px<=xe&&i%5===0)x.fillText(String(baseIdx/100+i),px,cy-44);
   if(i<25)tick(px+50*pr,20,false,2);}}
 else{for(let i=0;i<=40;i++){const px=x0+i*25*pr,mj=i%4===0;tick(px,mj?34:20,true,mj?3:2);if(mj&&px<=xe&&i<40&&i>0)x.fillText(String(i/4),px,cy-44);}}
 const tg=x.createLinearGradient(0,80,0,220);tg.addColorStop(0,'#59636e');tg.addColorStop(.35,'#d6dce2');tg.addColorStop(.65,'#8e99a5');tg.addColorStop(1,'#4d5661');
 x.fillStyle=tg;x.beginPath();x.moveTo(xe,128);x.lineTo(xe+24,80);x.lineTo(xe+200,80);x.lineTo(xe+200,220);x.lineTo(xe+24,220);x.lineTo(xe,172);x.closePath();x.fill();
 x.strokeStyle='#0008';x.lineWidth=2;x.stroke();
 const thDiv=stepN,sp=inch?10:7;
 for(let k=-9;k<=9;k++){const n=((thN+k)%thDiv+thDiv)%thDiv,y=cy+k*sp,five=n%5===0,hit=k===0;
  x.strokeStyle=hit?'#ffd43b':'#10151a';x.lineWidth=hit?4:2;x.beginPath();x.moveTo(xe+30,y);x.lineTo(xe+30+(five?36:22),y);x.stroke();
  if(five){x.fillStyle='#10151a';x.textAlign='left';x.font='600 17px Inter, sans-serif';x.fillText(String(n),xe+76,y+6);}}
 x.fillStyle='#ffd43b';x.beginPath();x.moveTo(xe-2,cy);x.lineTo(xe-18,cy-8);x.lineTo(xe-18,cy+8);x.fill();
}
$('micX').addEventListener('click',()=>$('mic').classList.add('hidden'));

/* ================= HUD / LABELS ================= */
// The callouts. Each has a dot on the part it names (p: a point on the gauge, in its own coordinates) and a name on side s (-1 left,
// 1 right) joined by a line. The names on a side are stacked so they never sit on top of each other, however near their dots are;
// the ones on the cross-bar (col) line up in a column just outside its ends, clear of the metal. The hub's name goes straight below it.
const rrOf=()=>S.g.rr;
const LABS=[
 {t:'Lock knob',s:1,p:()=>[S.g.rk,S.g.hl-S.g.kl/2,0]},
 {t:'Handle',s:-1,p:()=>[S.g.rh,S.g.hl*.45,0]},
 {t:'Hub',below:true,p:()=>[0,-S.g.rb*.7,S.g.rb*.7]},
 {t:'Tube',s:-1,col:true,p:()=>[-(S.g.tubeStart+GP.tubeLen/2),S.g.rt,0]},
 {t:'Contact head',s:-1,col:true,p:()=>[-S.curL/2+S.g.rr*.4,S.g.rr*.7,0]},
 {t:'Telescoping rod',s:1,col:true,p:()=>[(S.g.tubeOut+S.curL/2-S.g.hd)/2,S.g.rr,0]},
 {t:'Contact head',s:1,col:true,p:()=>[S.curL/2-S.g.rr*.4,-S.g.rr*.7,0]}
];
LABS.forEach(l=>{const e=document.createElement('div');e.className='lab';
 e.innerHTML='<b></b><i></i><span>'+l.t+'</span>';
 l.line=e.querySelector('b');l.tag=e.querySelector('span');
 $('labels').appendChild(e);l.el=e;});
let labsOn=false;
const _v=new THREE.Vector3(),_o=new THREE.Vector3();
const toScr=(v,w,h)=>{v.project(camera);return[(v.x*.5+.5)*w,(-v.y*.5+.5)*h];};
function refreshLabels(){
 const on=S.labels||(G.on&&GSTEPS[G.i]&&GSTEPS[G.i].labels),w=stage.clientWidth,h=stage.clientHeight;
 if(!on){LABS.forEach(l=>l.el.classList.remove('show'));labsOn=false;return;}
 // switched on: the names come in one at a time, each popping out of its dot like a bubble (the delay is read by the .show transitions)
 if(!labsOn){labsOn=true;LABS.forEach((l,i)=>l.el.style.setProperty('--d',(i*170)+'ms'));}
 const g=S.g,GAP=27;
 const pts=LABS.map(l=>{_v.set(...l.p());pivot.localToWorld(_v);const s=toScr(_v,w,h);return{l,x:s[0],y:s[1],lx:0,ly:s[1]};});
 // a column of names just outside each end of the cross-bar
 const colX=s=>{_o.set(s*(S.curL/2+g.rr+3),0,0);pivot.localToWorld(_o);return toScr(_o,w,h)[0];};
 [-1,1].forEach(s=>{
  const grp=pts.filter(q=>q.l.s===s).sort((m,n)=>m.y-n.y),cx=colX(s);
  for(let it=0;it<40;it++){let moved=false;for(let i=1;i<grp.length;i++){const d=grp[i].ly-grp[i-1].ly;if(d<GAP-.5){const m=(GAP-d)/2;grp[i-1].ly-=m;grp[i].ly+=m;moved=true;}}if(!moved)break;}
  grp.forEach(q=>{q.lx=q.l.col?cx+s*20:q.x+s*40;});
 });
 pts.forEach(q=>{
  const l=q.l;if(l.below){q.lx=q.x;q.ly=q.y+50;}
  const dx=q.lx-q.x,dy=q.ly-q.y,len=Math.hypot(dx,dy),ang=Math.atan2(dy,dx);
  l.el.style.transform='translate('+q.x.toFixed(1)+'px,'+q.y.toFixed(1)+'px)';
  l.line.style.width=len.toFixed(1)+'px';l.line.style.transform='rotate('+ang.toFixed(4)+'rad)';
  l.tag.style.transform=l.below?'translate(calc(-50% + '+dx.toFixed(1)+'px),'+(dy-2).toFixed(1)+'px)':l.s>0?'translate('+dx.toFixed(1)+'px,'+(dy-11).toFixed(1)+'px)':'translate(calc(-100% + '+dx.toFixed(1)+'px),'+(dy-11).toFixed(1)+'px)';
  l.el.classList.add('show');
 });
}
// a speech bubble by the gauge: what it is doing just now, for BUBBLE_MS
const bubEl=document.createElement('div');bubEl.className='tg-bub';bubEl.innerHTML='<span></span>';bubEl.setAttribute('aria-hidden','true');stage.appendChild(bubEl);
function showBubble(text,ms,arrows){S.bubble={text,t0:performance.now(),ms:ms||BUBBLE_MS,arrows:arrows||null};bubEl.firstChild.textContent=text;}
function refreshBubble(){
 const b=S.bubble,now=performance.now();
 if(!b||now-b.t0>=b.ms||FLY.on||AW.t>0){bubEl.classList.remove('on');return;}
 const w=stage.clientWidth,h=stage.clientHeight,g=S.g;
 _v.set(S.curL/2+g.rr*9,0,0);pivot.localToWorld(_v);const p=toScr(_v,w,h);
 const bw=bubEl.offsetWidth||230,bh=bubEl.offsetHeight||50;
 let x=p[0]+10,y=p[1]-bh-24,side='r';
 if(x+bw>w-8){_v.set(-S.curL/2-g.rr*9,0,0);pivot.localToWorld(_v);const q=toScr(_v,w,h);x=q[0]-bw-10;side='l';}   // not enough room on the right: the left head's side
 x=clamp(x,8,Math.max(8,w-bw-8));y=clamp(y,8,Math.max(8,h-bh-8));
 bubEl.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px)';bubEl.dataset.side=side;
 bubEl.classList.toggle('on',now-b.t0<b.ms-180);   // it fades out over its last moments, so it is gone at BUBBLE_MS
}
function refreshHud(){
 const g=S.g;setTxt('hBadge',g.name);setTxt('hName','Gauge '+g.name);setTxt('hRange',fmtRangeHud(g));
 $('aidBox').style.display=S.aids?'':'none';
 if(S.aids){const dg=S.tilt/D2R;setTxt('hTilt',Math.abs(dg)<.05?'0.0°':(dg>0?'+':'−')+Math.abs(dg).toFixed(1)+'°');$('tdot').style.left=(50+clamp(dg/25,-1,1)*50)+'%';$('tbar').classList.toggle('sq',Math.abs(dg)<1);
  setTxt('hMin',isFinite(S.minSeen)?(S.unit==='in'?(S.minSeen/25.4).toFixed(4)+' in':S.minSeen.toFixed(2)+' mm'):'–');}
 const si=statusInfo();
 setTxt('hStat',si.t);$('hStat').className='st '+si.c;
 // the bottom bar: the gauge's length right now, and what is going on
 setTxt('lenNum',S.unit==='in'?(S.curL/25.4).toFixed(4):S.curL.toFixed(2));setTxt('lenUnit',S.unit==='in'?'in':'mm');
 setTxt('lenAlt',S.unit==='in'?'('+S.curL.toFixed(2)+' mm)':'('+(S.curL/25.4).toFixed(4)+' in)');
 setTxt('depthOut',fmtDepth(S.depth));
 setTxt('status',si.t);$('status').className='status '+si.c;
 setHtml('btnAuto',AM.on?'Stop auto <kbd>A</kbd>':'Auto measure <kbd>A</kbd>');
 setHtml('btnLock',S.unlocked?'Lock knob <kbd>L</kbd>':'Unlock knob <kbd>L</kbd>');
 setHtml('btnInsert',S.inserted?'Take it out <kbd>I</kbd>':'Insert in hole <kbd>I</kbd>');
 {const set=(id,v)=>{const b=$(id);if(b.getAttribute('aria-pressed')!==String(v))b.setAttribute('aria-pressed',String(v));};
  set('insQuick',S.inserted);set('lockQuick',!S.unlocked);
  const ph='Go to depth '+fmtDepthNum(Math.round(S.depth*10)/10),st=$('setTo');if(st.placeholder!==ph)st.placeholder=ph;
  const ti=$('insQuick'),tt=S.inserted?'Take it out\nLifts the gauge back out of the hole.':'Insert in hole\nPushes the heads in, locks the knob and slides the gauge into the hole. Press again to take it out.';if(ti.getAttribute('data-tip')!==tt)ti.setAttribute('data-tip',tt);}
 [...$('toolSeg').querySelectorAll('button')].forEach(b=>{const on=b.dataset.t===S.mTool;if(b.getAttribute('aria-pressed')!==String(on))b.setAttribute('aria-pressed',String(on));});
 setHtml('btnTake','Measure <kbd>M</kbd>');
}

/* ================= THE MEASURING TOOL: A SPLIT SCREEN ================= */
// The micrometer or caliper is not drawn in this 3D world. It opens as its own full simulator in a panel beside the gauge (the shell,
// js/shell.js, splits the screen), with the tool's real model, and measures the gauge there. Every control on this page keeps working
// meanwhile: anything that needs the gauge at home (inserting, unlocking, rocking, resetting, picking another part) first closes the
// panel and flies the gauge back.
// fly the gauge home (the panel closes as it comes back); then do what was waiting for it
function ensureHome(cb){
 if(AW.t>0||AW.dir!==0||FLY.waiting){AW.afterBack=cb||null;if(AW.dir>=0){try{window.parent.postMessage({tgauge:{closeDock:true}},'*');}catch(e){}gaugeBack();}return;}
 if(cb)cb();
}

/* ================= THE GAUGE FLIES TO THE PANEL ON THE RIGHT ================= */
// Measure: the screen splits (the shell opens the tool's own full simulator in a panel on the right) and the tool loads completely, the
// gauge waiting here meanwhile. The tool then sets up a stand-in for the gauge (it measures, and casts its shadow, but draws nothing) and
// says where on screen it sits and which way it faces. THIS gauge flies across the border to that, and from then on it IS the gauge on the
// tool: it stays drawn there, following the stand-in's every move (the tool's own camera, its slide into the faces, the jaws closing on it),
// and nothing else is loaded or swapped in. When the panel is closed, it flies back home.
// This view's canvas stops at the border, so the gauge is drawn on a second, see-through canvas the size of the whole window (made in the
// page around this one): the same scene and camera, but only the gauge (layer 1), placed on screen where it should be.
const AW={t:0,dir:0,sent:null,afterBack:null};
const FLY={ok:null,use:false,native:false,on:false,clip:'none',hidden:false,attached:false,swapping:false,waiting:false,fadeEnd:0,lost:0,last:0,spot:null,qc:null,slide:null,shown:{x:0,y:0,p:0,q:new THREE.Quaternion(),ok:false},
 pd:null,frame:null,cv:null,r:null,cam:new THREE.PerspectiveCamera(32,1,1,4000),W:0,H:0,
 v:new THREE.Vector3(),d:new THREE.Vector3(),f:new THREE.Vector3(),layer:0};
function flyInit(){
 if(FLY.ok!==null)return FLY.ok;
 FLY.ok=false;
 try{
  if(window.parent===window||!window.frameElement)return false;
  // the canvas and its renderer are made here, so three.js knows the context for what it is (made in the other page's realm it would take
  // it for WebGL 1), and only then is the canvas moved into the page around this one
  const pd=window.parent.document,c=document.createElement('canvas');
  c.setAttribute('aria-hidden','true');
  c.style.cssText='position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:1500;display:none;opacity:1';
  const r=new THREE.WebGLRenderer({canvas:c,antialias:true,alpha:true});
  r.setPixelRatio(Math.min(devicePixelRatio||1,2));r.outputEncoding=THREE.sRGBEncoding;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1.1;r.setClearColor(0x000000,0);
  pd.body.appendChild(c);
  if(r.getContext().isContextLost()){c.remove();r.dispose();return false;}
  FLY.pd=pd;FLY.frame=window.frameElement;FLY.cv=c;FLY.r=r;FLY.cam.layers.set(1);FLY.ok=true;
 }catch(e){FLY.ok=false;}
 return FLY.ok;
}
// the gauge moves to layer 1 for the flight (so this view's own canvas leaves it out and the flight canvas draws it), and back
function setFlyLayer(n){if(FLY.layer===n)return;FLY.layer=n;pivot.traverse(o=>o.layers.set(n));}
function awayUpdate(dt){
 if(AW.dir===0)return;
 AW.t=clamp(AW.t+AW.dir*dt/1.6,0,1);
 if(AW.dir>0&&AW.t>=1){AW.dir=0;if(FLY.use)arrived();else{const f=AW.sent;AW.sent=null;if(f)f();}}
 else if(AW.dir<0&&AW.t<=0){AW.dir=0;FLY.attached=false;FLY.native=false;FLY.swapping=false;FLY.slide=null;const f=AW.afterBack;AW.afterBack=null;if(f)f();}
}
// without the page around (this tool opened on its own), the gauge just flies off to the right inside this view
function awayPose(){
 if(AW.t<=0){pivot.visible=true;return;}
 if(FLY.use){pivot.visible=!(AW.t>=1&&(!FLY.attached||FLY.native)&&performance.now()>FLY.fadeEnd);return;}   // flyPose does it, once the camera has moved
 const e=AW.t*AW.t*(3-2*AW.t);
 pivot.visible=AW.t<1;
 pivot.position.x+=e*560;pivot.position.y+=Math.sin(Math.PI*e)*64+e*30;
 pivot.rotation.y+=e*Math.PI*2.4;pivot.scale.setScalar(1-e*.5);
}
// the middle of the panel, in window pixels, for when the tool has not said where its gauge is
function flyTarget(out){
 const pd=FLY.pd,st=pd.getElementById('stage'),dk=pd.getElementById('dock');
 if(!st)return out.set(pd.documentElement.clientWidth*.75,pd.documentElement.clientHeight*.5);
 const sr=st.getBoundingClientRect(),narrow=pd.documentElement.clientWidth<=820;
 const dw=dk?dk.offsetWidth:(narrow?sr.width:sr.width*.5),dh=dk?dk.offsetHeight:(narrow?sr.height*.56:sr.height);
 return out.set(sr.right-dw/2,sr.bottom-dh/2-dh*.04);
}
// the tool's gauge: its place on screen, its scale, and its facing in the tool's camera's own axes
function spotSet(spot){
 FLY.spot=spot&&isFinite(spot.x)&&isFinite(spot.y)&&spot.ppm>0?spot:null;FLY.qc=null;
 if(FLY.spot&&FLY.spot.ax&&FLY.spot.hd){const x=new THREE.Vector3(...FLY.spot.ax).normalize(),h=new THREE.Vector3(...FLY.spot.hd),y=h.sub(x.clone().multiplyScalar(h.dot(x))).normalize(),z=new THREE.Vector3().crossVectors(x,y);
  FLY.qc=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));}
}
// How the gauge must face, from where it ends up on this window, to look exactly like the tool's own gauge. The tool's pose is its cross-bar and handle
// in its camera's axes, but this view draws the gauge with another camera, and at another spot on the screen, so perspective leans the same
// directions differently (the gauge would fly in angled, then be swapped for the tool's straight one). So the gauge is turned a little, as one rigid
// piece, until its cross-bar and handle point the same way ON THE SCREEN as the tool's do (least squares, a few quick steps).
// A direction d seen along a ray with slope s (x/-z, y/-z) appears as (d.x + s.x*d.z, d.y + s.y*d.z).
const _sv=new THREE.Vector3(),_sq=new THREE.Quaternion(),_sm=new THREE.Matrix4(),_sd=new THREE.Vector3(),_sr=new THREE.Quaternion(),_sj=new THREE.Matrix3(),_sg=new THREE.Vector3(),_sx=new THREE.Vector3(),_sy=new THREE.Vector3(),_sz=new THREE.Vector3();
function toolFacing(tx,ty,W,H,c2,out){
 const sp=FLY.spot;if(!sp||!sp.ax||!sp.hd||!sp.sl)return null;
 _sv.set(tx/W*2-1,-(ty/H*2-1),.5).unproject(c2).sub(c2.position).normalize().applyQuaternion(_sq.copy(c2.quaternion).invert());
 if(_sv.z>-1e-6)return null;
 const lx=_sv.x/-_sv.z,ly=_sv.y/-_sv.z,sx=sp.sl[0],sy=sp.sl[1];
 const hs=[new THREE.Vector3(...sp.ax).normalize(),new THREE.Vector3(...sp.hd)];
 hs[1].addScaledVector(hs[0],-hs[1].dot(hs[0])).normalize();
 const want=hs.map(h=>[h.x+sx*h.z,h.y+sy*h.z]),rot=new THREE.Quaternion();
 for(let it=0;it<6;it++){
  const A=[0,0,0,0,0,0,0,0,0],B=[0,0,0];let err=0;
  hs.forEach((h,i)=>{
   _sd.copy(h).applyQuaternion(rot);
   const rx=want[i][0]-(_sd.x+lx*_sd.z),ry=want[i][1]-(_sd.y+ly*_sd.z);err+=rx*rx+ry*ry;
   const jx=[lx*_sd.y,_sd.z-lx*_sd.x,-_sd.y],jy=[ly*_sd.y-_sd.z,-ly*_sd.x,_sd.x];
   for(let r=0;r<3;r++){for(let c=0;c<3;c++)A[r*3+c]+=jx[r]*jx[c]+jy[r]*jy[c];B[r]+=jx[r]*rx+jy[r]*ry;}
  });
  if(err<1e-10)break;
  for(let r=0;r<3;r++)A[r*3+r]+=1e-3;
  _sj.set(...A);if(Math.abs(_sj.determinant())<1e-12)break;
  _sg.set(...B).applyMatrix3(_sj.invert());
  const ang=Math.min(.6,_sg.length());if(ang<1e-6)break;
  rot.premultiply(_sr.setFromAxisAngle(_sg.normalize(),ang));
 }
 _sx.copy(hs[0]);_sy.copy(hs[1]);_sz.crossVectors(_sx,_sy);
 _sm.makeBasis(_sx,_sy,_sz);
 return out.copy(c2.quaternion).multiply(rot).multiply(_sq.setFromRotationMatrix(_sm));
}
const _ft=new THREE.Vector2(),_qt=new THREE.Quaternion(),_qh=new THREE.Quaternion(),_qs=new THREE.Quaternion(),_qa=new THREE.Quaternion(),_up=new THREE.Vector3(0,1,0);
function flyPose(){
 const now=performance.now(),dt=Math.min(.1,Math.max(0,(now-(FLY.last||now))/1000));FLY.last=now;
 const live=FLY.use&&(!FLY.hidden||AW.dir<0)&&AW.t>0&&(AW.t<1||(FLY.attached&&!FLY.native)||now<FLY.fadeEnd);   // (flying home, it is seen even as the panel closes)
 if(live!==FLY.on){
  FLY.on=live;setFlyLayer(live?1:0);
  if(live){FLY.cv.style.display='block';FLY.cv.style.transition='none';FLY.cv.style.opacity='1';}
  else FLY.cv.style.display='none';
 }
 if(!live){if(FLY.native&&FLY.attached&&AW.dir===0&&!FLY.swapping)nativeWatch(dt);return;}
 // where the tool's gauge is right now (it moves: the tool's camera, its slide into the faces). Not followed while the gauge is changing
 // tools, until the new tool says its gauge is ready.
 if(!FLY.swapping){
  let p=null;try{p=window.parent.__shell.pose();}catch(e){}
  if(p){spotSet(p);FLY.lost=0;}
  else if(FLY.attached&&AW.dir===0){FLY.lost+=dt;if(FLY.lost>.6)detach();}   // the tool no longer has the gauge (another part was chosen)
 }
 const pd=FLY.pd,W=pd.documentElement.clientWidth,H=pd.documentElement.clientHeight,c2=FLY.cam;
 if(W!==FLY.W||H!==FLY.H){FLY.r.setSize(W,H,false);FLY.W=W;FLY.H=H;}
 // on the tool, it is seen only inside the tool's own canvas, as if the tool had drawn it (in the air, over the whole window)
 {const k=FLY.attached&&AW.t>=1&&AW.dir===0&&FLY.spot&&FLY.spot.clip&&!FLY.slide?FLY.spot.clip:null,cs=k?'inset('+Math.max(0,k[1]).toFixed(1)+'px '+Math.max(0,W-k[2]).toFixed(1)+'px '+Math.max(0,H-k[3]).toFixed(1)+'px '+Math.max(0,k[0]).toFixed(1)+'px)':'none';
  if(cs!==FLY.clip){FLY.clip=cs;FLY.cv.style.clipPath=cs;}}
 // the flight camera is this view's camera, widened to the whole window: same place and angle, the picture offset to where this canvas sits
 const fr=FLY.frame.getBoundingClientRect(),cr=cv.getBoundingClientRect(),rw=cr.width,rh=cr.height;
 if(W<2||H<2||rw<2||rh<2)return;   // nothing is laid out (a hidden window): leave the gauge where it is
 c2.position.copy(camera.position);c2.quaternion.copy(camera.quaternion);c2.fov=camera.fov;c2.near=camera.near;c2.far=camera.far;c2.aspect=rw/rh;
 c2.setViewOffset(rw,rh,-(fr.left+cr.left),-(fr.top+cr.top),W,H);c2.updateMatrixWorld(true);
 // home: where the gauge is on screen right now
 const home=FLY.v.copy(pivot.position),e=AW.t*AW.t*(3-2*AW.t);
 FLY.f.set(0,0,-1).applyQuaternion(c2.quaternion);
 const depth=Math.max(1,FLY.d.copy(home).sub(c2.position).dot(FLY.f));
 FLY.d.copy(home).project(c2);
 const hx=(FLY.d.x*.5+.5)*W,hy=(-FLY.d.y*.5+.5)*H;
 // where it is going: the tool's gauge (gliding over from where it was, when the gauge moves from one tool to another)
 let tx,ty,tp=0,tq=null;
 if(FLY.spot){tx=FLY.spot.x;ty=FLY.spot.y;tp=FLY.spot.ppm;if(FLY.qc)tq=toolFacing(tx,ty,W,H,c2,_qt)||_qt.copy(camera.quaternion).multiply(FLY.qc);}
 else{flyTarget(_ft);tx=_ft.x;ty=_ft.y;}
 if(FLY.slide){
  const s=FLY.slide;s.t=Math.min(1,s.t+dt/.8);const k=s.t*s.t*(3-2*s.t);
  tx=s.x+(tx-s.x)*k;ty=s.y+(ty-s.y)*k;tp=s.p+(tp-s.p)*k;if(tq)tq=_qa.copy(s.q).slerp(tq,k);
  if(s.t>=1)FLY.slide=null;
 }
 const sh=FLY.shown;sh.x=tx;sh.y=ty;sh.p=tp;if(tq)sh.q.copy(tq);sh.ok=true;
 // how big it ends up: the same size on screen as the tool's gauge (its pixels to the millimetre, against this one's), or just smaller
 const ppm=rh/(2*depth*Math.tan(camera.fov*D2R/2)),sEnd=tp>0?clamp(tp/ppm,.04,4):.55;
 const arc=Math.min(H*.2,170);
 const sx=hx+(tx-hx)*e,sy=hy+(ty-hy)*e-Math.sin(Math.PI*e)*arc;
 FLY.d.set(sx/W*2-1,-(sy/H*2-1),.5).unproject(c2).sub(c2.position).normalize();
 pivot.position.copy(c2.position).addScaledVector(FLY.d,depth/Math.max(.05,FLY.d.dot(FLY.f)));
 pivot.scale.setScalar(1+(sEnd-1)*e);
 // which way it faces: it turns, as it flies, to face exactly the way the tool's gauge faces in the tool's own view (tumbling on the way)
 if(tq)_qh.copy(pivot.quaternion).slerp(tq,e);else _qh.copy(pivot.quaternion);
 pivot.quaternion.copy(_qh);   // (no tumbling on the way: it keeps its straight form, turning only to face the way the tool's gauge faces)
 pivot.updateMatrixWorld(true);
}
// the tool draws the gauge itself now (handOff): this view only keeps track of where it is, and notices when the tool lets go of it
function nativeWatch(dt){
 let p=null;try{p=window.parent.__shell.pose();}catch(e){}
 if(p){spotSet(p);FLY.lost=0;}
 else{FLY.lost+=dt;if(FLY.lost>.6)detach();}
}
function flyRender(){if(FLY.on)FLY.r.render(scene,FLY.cam);}
// the tool says its stand-in is built and where it sits: now this gauge can fly there (or, if it is already over on another tool, glide over)
function toolReady(spot){
 spotSet(spot);
 if(FLY.waiting){FLY.waiting=false;AW.dir=1;AW.sent=null;}
 else if(FLY.attached){
  const s=FLY.shown;if(s.ok)FLY.slide={t:0,x:s.x,y:s.y,p:s.p,q:s.q.clone()};
  FLY.swapping=false;FLY.lost=0;
  try{window.parent.__shell.reveal();}catch(e){}
 }
}
function swapping(){if(FLY.attached){FLY.swapping=true;FLY.native=false;}}   // (the flight canvas takes the gauge back, to glide it to the next tool)
function pending(){return FLY.waiting||AW.dir>0||FLY.attached;}
// landed: from here on this gauge is the one on the tool, and the tool starts measuring it
function arrived(){FLY.attached=true;FLY.swapping=false;FLY.lost=0;try{window.parent.__shell.reveal();}catch(e){}handOff();}
// once it has landed, the tool shows its own copy of the gauge, in its own scene (same camera and light, hidden behind its frame and
// spindle where it should be, touching its faces), and this view's flight canvas fades out over it. A tool that cannot says so, and keeps the flight canvas.
function handOff(){
 let ok=false;try{ok=!!window.parent.__shell.native();}catch(e){}
 if(!ok)return;
 FLY.native=true;FLY.fadeEnd=performance.now()+220;
 FLY.cv.style.transition='opacity .16s ease .04s';FLY.cv.style.opacity='0';
}
// the tool no longer has a gauge to draw this over: this one goes, and the tool shows its own (if it has one)
function detach(){
 FLY.attached=false;FLY.native=false;FLY.slide=null;FLY.fadeEnd=performance.now()+220;
 FLY.cv.style.transition='opacity .16s ease .04s';FLY.cv.style.opacity='0';
 try{window.parent.__shell.unghost();}catch(e){}
}
// the panel is on show (or not): the gauge drawn over it goes with it
function overlay(on){FLY.hidden=!on;if(!on&&FLY.cv){FLY.cv.style.display='none';FLY.on=false;}}
function gaugeBack(){
 if(AW.t>0||AW.dir>0||FLY.waiting){FLY.waiting=false;FLY.swapping=false;FLY.native=false;AW.dir=-1;AW.sent=null;pivot.visible=true;}
}
/* ================= AUTO MEASURE ================= */
// Does the whole job for you, the way you would by hand: picks a gauge that fits (if the one on the bench doesn't),
// unlocks it, tips it in just over the hole, rocks it through square both ways, settles on square, locks, and lifts
// it out. Touching any control, or the gauge, takes over again.
const AM={id:0,on:false};
const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>r()));
async function amWait(ms,id){const t0=performance.now();while(AM.id===id&&performance.now()-t0<ms)await nextFrame();return AM.id===id;}
async function amUntil(cond,ms,id){const t0=performance.now();while(AM.id===id&&!cond()&&performance.now()-t0<ms)await nextFrame();return AM.id===id&&cond();}
// swing the handle to an angle (degrees) over a moment, easing in and out
async function amTilt(deg,ms,id){
 const a=S.tiltCmd,b=deg*D2R,t0=performance.now();
 while(AM.id===id){const k=Math.min(1,(performance.now()-t0)/ms),e=k*k*(3-2*k);setTiltCmd(a+(b-a)*e);if(k>=1)break;await nextFrame();}
 return AM.id===id;
}
let MS_id=0;
function autoCancel(){MS_id++;if(AM.on){AM.id++;AM.on=false;}}
// Measure: takes the gauge as it is right now and puts it in the tool you picked. Whatever state it is in, it does what is needed on
// the way: it locks the gauge where it stands, lifts it out of the hole, and carries it to the tool. Any other control takes over.
async function takeMeasure(tool){
 autoCancel();const id=++MS_id,alive=()=>MS_id===id;
 const until=async(c,ms)=>{const t0=performance.now();while(alive()&&!c()&&performance.now()-t0<ms)await nextFrame();return alive();};
 const wait=ms=>until(()=>false,ms);
 if(AW.t>0||AW.dir!==0||FLY.waiting){await new Promise(r=>ensureHome(r));if(!alive())return;}
 if(S.inserted){
  if(!await until(()=>S.insertT>.9,6000))return;
  if(S.unlocked){toggleLock();if(!await wait(700))return;}
  toggleInsert();
  if(!await until(()=>S.insertT<.04,9000))return;
 }else if(S.unlocked){toggleLock();toast('Locked at '+fmtLen(S.lockedL)+', its current length.');if(!await wait(450))return;}
 if(!tool){measure();return;}
 send(tool);
}
// First it asks which tool you'll measure the gauge with; then it does the job and carries the gauge there.
function autoMeasure(){
 if(AM.on){autoCancel();toast('Auto measure stopped. It’s all yours.');return;}
 if(G.on)guideStop();
 $('ask').hidden=false;$('ask').querySelector('button').focus({preventScroll:true});
}
function askClose(){$('ask').hidden=true;}
async function runAuto(tool){
 const id=++AM.id;AM.on=true;
 const alive=()=>AM.id===id;
 try{
  if(AW.t>0||AW.dir!==0||FLY.waiting){await new Promise(r=>ensureHome(r));if(!alive())return;}
  resetGauge();
  // the right size for this hole
  const want=pickGauge(holeD(S.depth));
  if(want!==S.gi){selectGauge(want);toast('Auto measure picked gauge '+S.g.name+' for this hole.');}
  camGo('gauge');
  if(!await amWait(900,id))return;
  setTiltCmd(10*D2R);
  toggleInsert();                                 // tip it in: the heads are pushed in (arrows, a bubble, a one-second wait) and the knob locks
  if(!S.inserted){toast('Auto measure couldn’t get the gauge in. Try a different size or depth.');return;}
  toast('Auto measure is pushing the two heads in and locking the knob so the gauge fits through the opening of the hole.');
  if(!await amUntil(()=>S.insertT>.95,30000,id))return;
  if(!await amWait(500,id))return;
  toggleLock();                                   // unlock inside the bore: the springs push the heads out against the wall
  if(!await amWait(1500,id))return;
  // rock through square, narrowing in on the shortest length
  for(const d of [10,-10,4,-3,1,-.4,0]){if(!await amTilt(d,d===10||d===-10?900:600,id))return;}
  if(!await amWait(400,id))return;
  toggleLock();                                   // lock it square
  if(!await amWait(1000,id))return;
  if(!await amTilt(7,500,id))return;
  toggleInsert();                                 // and lift it out
  if(!await amUntil(()=>S.insertT<.04,30000,id))return;
  camGo('gauge');
  if(tool){
  toast('Auto measure done. Locked at '+fmtLen(S.lockedL)+'. Taking it to the '+TOOL_NAME[tool]+'…');
  if(!await amWait(1600,id))return;
  send(tool);
 }else toast('Auto measure done. The gauge is locked at '+fmtLen(S.lockedL)+'. Now put it into a tool.');
 }finally{if(AM.id===id)AM.on=false;}
}

/* ================= SHOW ME ================= */
const G={on:false,i:0,done:false,t:0,saved:null,nav:0};
const tolerance={title:'Perfect isn’t the goal',text:()=>'One more thing worth knowing.\nYou won’t get exactly the same number every time you measure, and that’s normal.\nParts, tools and hands all vary a little, so slightly different readings don’t mean you did it wrong.\nThat’s why tolerances exist: a tolerance says how far off is still good enough.\nIn the shop you measure a hole in a few spots and compare.\nIf the readings agree, you can trust the size.'};
const gaugeBoxL=()=>{const b=gaugeBox();return{x:b.x-175,y:b.y,w:b.w+350,h:b.h+44};};   // ...with room each side, and below the hub, for its names
const gaugeBox=()=>{const g=S.g,pts=[[-S.curL/2,0,0],[S.curL/2,0,0],[0,g.hl,0],[0,-g.rb,0]],b=cv.getBoundingClientRect();
 let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;pts.forEach(p=>{_v.set(...p);pivot.localToWorld(_v);_v.project(camera);
  const x=b.left+(_v.x*.5+.5)*b.width,y=b.top+(-_v.y*.5+.5)*b.height;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);});
 return{x:x0-24,y:y0-24,w:x1-x0+48,h:y1-y0+48};};
const GSTEPS=[
 {title:'Let’s measure a hole',view:'overview',enter:()=>{S.partChanged=false;if(S.inserted||S.unlocked||S.lockInfo)resetGauge();},
  text:()=>(window.__quip?window.__quip.cur:'Hi, and welcome.\nI’ll walk you through it.')+'\nA telescopic gauge doesn’t show a number itself. It copies the size of a hole, and then you measure the gauge with a micrometer or caliper.\nWe’ll go one small step at a time. Everything except what you need right now gets dimmed.\nPress <b>Exit</b> or <b>Esc</b> whenever you like.'},
 {title:'First, clean and check the gauge',paper:true,view:'gauge',zero:true,target:'#view',labels:false,
  text:()=>'Start with a habit worth keeping: wipe both pistons with a clean cloth.\nThe pistons are the two spring-loaded rods that slide out of the tubes, each ending in a contact head. Wipe each one, head and rod.\nChips, coolant or a speck of grit can throw the reading off by thousandths.'+(window.__gdRich?window.__gdRich.PAPER:'')+'\nA telescopic gauge has no zero to set. What you check is that it moves freely.\nSlowly push each piston in, then let it spring back out. Do it for both: each should move smoothly and never feel sticky or gritty.\nWatch it close up all the way here, the way both pistons should move.'},
 {title:'The rods move freely',view:'gauge',zero:true,target:gaugeBoxL,labels:true,
  text:()=>'They slid all the way in, and each head now sits right at the end of its tube.\nNo rod shows past the tubes.\nThat’s the closed position, the bottom of this gauge’s range.\nOn a real gauge, you push both ends in yourself, with two fingers on each side, and each should spring back evenly.'},
 {title:'Where its range begins',view:'gauge',zero:true,target:'#reading .value',
  text:()=>'Now the number.\nWith the gauge closed, the bottom bar reads <b>'+fmtLen(S.g.min)+'</b>.\nThat’s gauge '+S.g.name+'’s shortest length, the bottom of its range.\nIt can measure holes from there up to <b>'+fmtLen(S.g.max)+'</b>.\nHoles smaller than the shortest length won’t take this gauge, and holes bigger than the top size are out of its reach.\nNice, it’s ready to go.'},
 {title:'Pick a part',target:'#sampleSel',done:()=>S.partChanged,text:()=>'The part with the hole comes next.\nOpen the <b>Part</b> list and choose one.\nPoint at a name to see a preview of the part.\nThe hole’s size is hidden, just like on a real job.',hint:'Waiting for you to pick a part…'},
 {title:'Clean the bore too',view:'overview',target:'#view',next:'Next',
  text:()=>'Same habit for the hole, where the heads will touch the wall.\nA chip, oil or a burr on the wall sits between the head and the metal, so the hole reads smaller than it is.\nThen check roughly how big the hole is, with a scale or a caliper. That tells you which gauge to reach for.'},
 {title:'Meet the gauge',view:'gauge',target:gaugeBoxL,labels:true,
  text:()=>'This is a T-handle telescopic gauge.\nYou hold it by the knurled handle.\nThe small knob on the very end of the handle locks the rods.\nA short round hub joins the handle to the cross-bar.\nA spring-loaded rod slides out of each tube.\nThe rod ends are the contact heads. They look flat, but they’re slightly domed, so only a small spot touches the wall.'},
 {title:'Choose the size',target:'#gset',view:'gauge',
  text:()=>'A set has six gauges, A to F.\nPick the one whose range holds your hole, ideally somewhere in the middle of that range.\nNearly closed, there’s no room to rock. Nearly fully out, the rods run long and lose their feel.\nThis hole is about Ø'+fmtEst(S.sample)+', so auto-pick chose <b>'+S.g.name+'</b> ('+fmtRange(S.g)+').\nIn the shop you’d size the hole with a scale or caliper first. Auto-pick does that estimate for you.'},
 {title:'Push the heads in, lock, and slide it in',view:'travel',target:'#btnInsert',done:()=>S.inserted&&S.insertT>.9,
  text:()=>'To get into the hole, the gauge has to be narrower than it, so both heads are pushed in and the knob is locked.\nPress <b>Insert in hole</b> and watch: the arrows push both heads in, the knob locks, and the gauge slides in, one head first.\nIn your hand you’d tilt it and put one head in, then the other.\nOnce it’s in, keep the handle in line with the hole, not leaning sideways.',hint:'Waiting for you to insert it…'},
 {title:'Unlock inside the bore',view:'hole',target:'#btnLock',done:()=>S.inserted&&S.unlocked&&S.insertT>.9,
  text:()=>'The gauge is down in the bore, ready to copy the hole.\nPress the lit <b>Unlock knob</b> button, or click the knurled knob on the gauge itself.\nThe springs push both heads out until they touch opposite walls.\nThat’s how the gauge copies the hole.',hint:'Waiting for you to unlock it…'},
 {title:'Rock through square',view:'hole',target:'#rockWrap',done:()=>S.seenPos&&S.seenNeg,
  text:()=>'Rock the handle gently back and forth, along the line of the heads.\nDrag the gauge, use the slider, or tap the arrow keys.\nLet the springs do the work: don’t push the gauge or hold it off to one side.\nTilted, the heads span a longer chord. Square to the hole’s axis, they’re at their shortest, and that shortest length is the true diameter.\nSwing past square to both sides, and the shortest point is the one in the middle.',hint:'Rock it a little to each side…'},
 {title:'Square it up and lock',view:'hole',target:'#btnLock',square:true,
  done:()=>!!(S.lockInfo&&S.lockInfo.inHole)&&!S.unlocked&&Math.abs(S.lockInfo.tilt)<=SQUARE_TOL,
  text:()=>{const li=S.lockInfo,d=li&&li.inHole?Math.abs(li.tilt/D2R):null;
   return 'Bring the handle to perfectly straight, 0.0°.\nThen lock the knob while the gauge is still in the hole.\nLock while tilted and you freeze a too-long reading.\nLock it snug and firm: a weak lock lets the rods creep after you take it out.\nThis step moves on once it’s locked dead square.'+(d==null?'':d<=SQUARE_TOL/D2R?'\n<b>Locked perfectly square. Nice work.</b>':'\nThat one’s '+d.toFixed(1)+'° off, so it reads long. That’s the most common slip with these gauges, and it’s easy to fix. Unlock the knob, straighten the handle to 0.0° and lock it again.');},
  hint:()=>{const li=S.lockInfo,dl=Math.abs(S.tilt/D2R);
   if(li&&li.inHole&&!S.unlocked)return'Locked '+Math.abs(li.tilt/D2R).toFixed(1)+'° off square. Unlock it, straighten the handle and lock again…';
   if(!S.inserted)return'Waiting for the gauge to be in the hole…';
   return dl<=SQUARE_TOL/D2R?'Straight at 0.0°. Now lock the knob…':'Handle is '+dl.toFixed(1)+'° off. Bring it to 0.0°…';}},
 {title:'Take it out',view:'travel',target:'#btnInsert',done:()=>!S.inserted&&S.insertT<.05&&!S.unlocked&&!!(S.lockInfo&&S.lockInfo.inHole),
  text:()=>'Tilt the handle slightly and lift the gauge out, so the heads clear the wall.\nPress <b>Take it out</b> and the gauge does just that.\nThe size stays locked in while you do. Don’t touch the knob or squeeze the heads.\nOn a real gauge the heads drag lightly on the way out. That’s normal, and the lock holds them.',hint:'Waiting for you to take it out…'},
 {title:'Check the tool you’ll read it with',view:'gauge',next:'Next',
  text:()=>'The gauge is only as good as the tool that reads it.\nClose that tool on its own, with nothing between the faces, and it should read its lowest value.\nIn this simulator the tool is already set, so a quick look is all it needs.'},
 {title:'A light touch',view:'gauge',target:gaugeBoxL,labels:true,
  text:()=>'Next you’ll measure across the two round heads.\nSet the gauge between the tool’s faces and rock it slightly to find the largest reading.\nThe heads are domed, so it reads longest when the faces meet their high points.\nClose the tool with a very light touch, using the ratchet on a micrometer.\nSqueeze too hard and the rods slide in, so you read short.\nMeasure two or three times and compare.'},
 {title:'Measure the gauge',view:'gauge',choose:true,
  text:()=>'The gauge has copied the hole.\nNow measure the gauge itself, across its two round heads.\nWhich tool do you want to use?\nThe screen splits, and the gauge flies over the border to it.'},
 // the walkthrough goes on after the choice: the gauge crosses to the tool on the right and this card stays here on the left
 {title:'Off it goes',done:()=>AW.t>=1&&AW.dir===0&&!FLY.waiting,hint:'Watching the gauge fly over…',
  text:()=>'The '+toolName()+' opens on the right.\nWatch the gauge fly across the border and land on it.\nFrom here it’s the very same gauge, locked at the size it copied from the hole.'},
 {title:'The same number on both sides',target:'#reading .value',next:'Next',
  text:()=>'Look at the big number down here on the left: <b>'+fmtLen(S.lockedL)+'</b>.\nThat’s the gauge’s length, the size it copied from the hole.\nNow look over at the '+toolName()+' on the right.\nClose it gently on the gauge’s two round heads, and it reads the very same number, give or take the last digit it can show.\nLeft and right are one measurement, read two different ways.'},
 tolerance,
 {title:'You won’t get this number for free',target:'#reading .value',next:'Next',
  text:()=>'The number on the left is a perk of the simulator, there so you can check your work.\nA real telescopic gauge has no scale and no display.\nYou won’t know the size until you take it out and measure it with another tool, like the '+toolName()+' here.\nThat’s the whole job: the gauge copies the hole, and the other tool reads it.\nTime with a real gauge is worth just as much, if not more.\nThis simulator is for practicing when you can’t get to one in person.\nWhen you’re done looking, close the panel on the right and the gauge comes home.'}
];
const toolName=()=>(TOOL_NAME[S.mTool]||'other tool').toLowerCase();
const CHOICES=[['micrometer','Outside micrometer','reads to 0.001″'],['caliper','Dial caliper','reads to 0.001″'],['vernier','Vernier caliper','reads to 0.001″']];
let gdRoot=null,gdArrow,gdHole,gdCard,gdTitle,gdText,gdDo,gdChoose,gdCount,gdBack,gdNext;
function guideBuild(){
 gdRoot=document.createElement('div');gdRoot.className='gd';gdRoot.hidden=true;
 gdRoot.innerHTML='<div class="gd-hole none"></div><svg class="gd-svg" aria-hidden="true" style="display:none"><path/><polygon/></svg><div class="gd-card" role="dialog" aria-label="How do I use it?"><button class="gd-x" type="button" aria-label="Exit">✕</button><h4></h4><p aria-live="polite"></p><div class="gd-do" hidden></div><div class="gd-choose" hidden></div><div class="gd-foot"><span class="gd-count"></span><button type="button" class="gd-back">Back</button><button type="button" class="gd-next primary">Next</button></div></div>';
 document.body.appendChild(gdRoot);
 gdHole=gdRoot.querySelector('.gd-hole');gdArrow=gdRoot.querySelector('.gd-svg');gdCard=gdRoot.querySelector('.gd-card');gdTitle=gdCard.querySelector('h4');gdText=gdCard.querySelector('p');
 gdDo=gdCard.querySelector('.gd-do');gdChoose=gdCard.querySelector('.gd-choose');gdCount=gdCard.querySelector('.gd-count');gdBack=gdCard.querySelector('.gd-back');gdNext=gdCard.querySelector('.gd-next');
 gdCard.querySelector('.gd-x').onclick=guideStop;gdBack.onclick=()=>guideGo(G.i-1);gdNext.onclick=()=>{if(G.i>=GSTEPS.length-1)guideStop();else guideGo(G.i+1);};
 gdChoose.innerHTML=CHOICES.map(c=>'<button type="button" data-tool="'+c[0]+'">'+c[1]+'<small>'+c[2]+'</small></button>').join('');
 gdChoose.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(send(b.dataset.tool))guideGo(G.i+1);};
 pointInit();
}
function guideStart(){
 if(!gdRoot)guideBuild();
 if(window.__quip)window.__quip.next();   // a fresh opening line each time the walkthrough starts
 ensureHome();G.on=true;G.saved={labels:S.labels};gdRoot.hidden=false;document.body.classList.add('guiding');
 guideGo(0);
}
function guideStop(){
 if(!G.on)return;G.on=false;gdRoot.hidden=true;document.body.classList.remove('guiding');
 S.zeroCheck=false;
 if(G.saved){S.labels=G.saved.labels;$('lblTgl').checked=S.labels;}
 $('guideBtn').focus({preventScroll:true});
}
function guideGo(i){
 if(i<0||i>=GSTEPS.length)return;
 G.i=i;G.done=false;G.nav++;G.lastText=null;
 const s=GSTEPS[i];S.zeroCheck=!!s.zero;
 if(s.enter)s.enter();
 if(s.view)camGo(s.view);
 if(s.paper){const my=i;labPaper(my).then(ok=>{if(window.__gdRich&&G.on&&G.i===my)window.__gdRich.paper(gdCard,!ok);});}
 gdTitle.textContent=s.title;
 gdChoose.hidden=!s.choose;gdNext.hidden=!!s.choose;
 gdBack.disabled=i===0;
 gdNext.textContent=i===GSTEPS.length-1?'Done':(s.done?'Skip':'Next');
 gdNext.classList.toggle('primary',!s.done);
 gdCount.textContent='Step '+(i+1)+' of '+GSTEPS.length;
 if(window.__gdRich){window.__gdRich.paint(gdRoot,gdCard,GSTEPS,i,'gauge');window.__gdRich.paper(gdCard,false);}   // the phase, its color, the progress bar
 guideTick(true);
}
function targetRect(s){
 const t=s.target;if(!t)return null;
 if(typeof t==='function')return t();
 const e=document.querySelector(t);if(!e||!e.getClientRects().length)return null;
 // a list is lit as its button (the real select underneath is hidden, one pixel big), and with its choices while they are open
 const dd=e.closest('.dd'),btn=dd&&dd.querySelector('.dd-btn');
 let r=(btn||e).getBoundingClientRect(),x0=r.left,y0=r.top,x1=r.right,y1=r.bottom;
 const list=dd&&dd.classList.contains('open')&&dd.querySelector('.dd-list');
 if(list){const l=list.getBoundingClientRect();x0=Math.min(x0,l.left);y0=Math.min(y0,l.top);x1=Math.max(x1,l.right);y1=Math.max(y1,l.bottom);}
 return{x:x0,y:y0,w:x1-x0,h:y1-y0};
}
function guideTick(force){
 if(!G.on)return;
 const s=GSTEPS[G.i];
 // a step that waits for you: it ticks over by itself a moment after you've done it
 if(s.done&&!G.done&&s.done()){G.done=true;G.t=performance.now();gdNext.textContent=G.i===GSTEPS.length-1?'Done':'Next';gdNext.classList.add('primary');}
 if(G.done&&s.done&&performance.now()-G.t>1100&&G.i<GSTEPS.length-1){guideGo(G.i+1);return;}
 const text=s.text();
 if(force||text!==G.lastText){G.lastText=text;gdText.innerHTML=window.__gdRich?window.__gdRich.lines(text):text.split('\n').map(l=>'<span class="gd-l">'+l+'</span>').join('');if(window.__gdRich)window.__gdRich.shortcuts(gdCard,'gauge',text);}
 if(s.done){gdDo.hidden=false;gdDo.className='gd-do'+(G.done?' ok':'');gdDo.textContent=G.done?'Nice! On to the next step…':((typeof s.hint==='function'?s.hint():s.hint)||'Give it a go…');}else gdDo.hidden=true;
 // the dimmed window and the card beside it
 const r=targetRect(s),pad=6;
 if(r){gdHole.className='gd-hole';gdHole.style.left=(r.x-pad)+'px';gdHole.style.top=(r.y-pad)+'px';gdHole.style.width=(r.w+pad*2)+'px';gdHole.style.height=(r.h+pad*2)+'px';}
 else gdHole.className='gd-hole none';
 placeCard(r,s);
}
function placeCard(r,s){
 const W=innerWidth,H=innerHeight,cw=gdCard.offsetWidth,ch=gdCard.offsetHeight,m=12;let x,y,aim=null;
 // beside an open Part list the card keeps clear of the part preview too, and goes on past it
 const te=r&&s&&typeof s.target==='string'?document.querySelector(s.target):null,pv=te&&window.__holo?window.__holo.area(te):null;
 if(!r){x=(W-cw)/2;y=(H-ch)/2;}
 else{
  const A=pv?{x:Math.min(r.x,pv.x),y:Math.min(r.y,pv.y),w:Math.max(r.x+r.w,pv.x+pv.w)-Math.min(r.x,pv.x),h:Math.max(r.y+r.h,pv.y+pv.h)-Math.min(r.y,pv.y)}:r;
  const g=20,opts=[[A.x+A.w+g,r.y+r.h/2-ch/2],[A.x-cw-g,r.y+r.h/2-ch/2],[r.x+r.w/2-cw/2,A.y+A.h+g],[r.x+r.w/2-cw/2,A.y-ch-g]];
  let best=opts.find(o=>o[0]>=m&&o[0]+cw<=W-m&&o[1]>=m&&o[1]+ch<=H-m);
  if(!best)best=[r.x+r.w-cw-m,r.y+r.h-ch-m];
  x=best[0];y=best[1];
 }
 x=clamp(x,m,Math.max(m,W-cw-m));y=clamp(y,m,Math.max(m,H-ch-m));
 gdCard.style.left=Math.round(x)+'px';gdCard.style.top=Math.round(y)+'px';
 // an arrow from the card to the Part list that goes round the preview while it is up, never across it
 const pvUp=pv&&window.__holo.area(te,true),pad=6;
 aim=pv&&window.__holo.arrow({x:Math.round(x),y:Math.round(y),w:cw,h:ch},{x:r.x-pad,y:r.y-pad,w:r.w+pad*2,h:r.h+pad*2},pvUp);
 gdArrow.style.display=aim?'':'none';
 if(aim){gdArrow.firstChild.setAttribute('d',aim.d);gdArrow.lastChild.setAttribute('points',aim.pts);}
}
function pointInit(){}
document.addEventListener('keydown',e=>{if(!$('ask').hidden&&e.key==='Escape'){e.preventDefault();e.stopPropagation();askClose();return;}if(EX.on&&e.key==='Escape'){e.preventDefault();e.stopPropagation();setExam(false);return;}if(G.on&&e.key==='Escape'){e.preventDefault();e.stopPropagation();guideStop();}},true);

/* ================= EXAMINE AND PRACTICE (the top-left buttons, as on the other tools) ================= */
// Examine: the bars close in, every part is named, and the camera turns slowly round the gauge, which you can also turn by hand.
function setSpin(on){EX.spin=on;$('spinBtn').setAttribute('aria-pressed',String(on));}
function setExamLabels(on){S.labels=on;$('lblTgl').checked=on;$('labelsBtn').setAttribute('aria-pressed',String(on));}
function setExam(on){
 if(on===EX.on)return;
 if(on){
  if(G.on)guideStop();
  if(S.practice)setPractice(false);
  if(AW.t>0||AW.dir!==0||FLY.waiting){ensureHome(()=>setExam(true));return;}   // the gauge comes home from the other tool first
  EX.on=true;EX.saved=S.labels;
  document.body.classList.add('exam');
  setSpin(false);setExamLabels(true);
  camGo('gauge');cam.fixed=true;
 }else{
  EX.on=false;
  document.body.classList.remove('exam');
  setExamLabels(EX.saved);
  cam.dth=0;cam.dph=0;camGo('overview');
 }
}
// Practice: the readings are hidden and a hole is picked for you. Lock the gauge in it, measure the gauge with a tool, and type the hole's size.
function setPractice(on){
 if(on===!!S.practice)return;
 if(on){
  if(G.on)guideStop();
  if(EX.on)setExam(false);
  if(AW.t>0||AW.dir!==0||FLY.waiting){ensureHome(()=>setPractice(true));return;}
  S.practice=true;S.revealed=false;
  document.body.classList.add('practice');$('practiceBtn').setAttribute('aria-pressed','true');
  practiceNext();
 }else{
  S.practice=false;
  document.body.classList.remove('practice');$('practiceBtn').setAttribute('aria-pressed','false');
  buildSamples();buildGset();
 }
}
function practiceFb(html,cls){$('pfb').className=cls||'';$('pfb').innerHTML=html;}
function practiceNext(){
 reroll();
 let i;do{i=Math.floor(Math.random()*SAMPLES.length);}while(i===S.si&&SAMPLES.length>1);
 S.partChanged=true;selectSample(i);
 $('guess').value='';$('guess').placeholder=S.unit==='in'?'0.000':'0.00';
 practiceFb('<p>Lock the gauge in the hole, take it out, and measure the gauge with a tool. Then type the hole’s size in '+(S.unit==='in'?'inches':'millimeters')+' and press <b>Check</b>.</p>');
}
function practiceCheck(){
 const li=S.lockInfo,v=parseFloat($('guess').value.replace(/[^0-9.]/g,''));
 if(isNaN(v)||v<=0){practiceFb('<p>Type the hole size you read on the tool first.</p>','warn');return;}
 if(!(li&&li.inHole)){practiceFb('<p>Lock the gauge while it is down in the hole, then measure it. Press <b>Next hole</b> for a new one.</p>','warn');return;}
 const mm=S.unit==='in'?v*25.4:v,err=mm-li.D,ae=Math.abs(err),deg=Math.abs(li.tilt/D2R);
 const sz=x=>S.unit==='in'?(x/25.4).toFixed(4)+' in':x.toFixed(2)+' mm',diff=(err>=0?'+':'−')+(S.unit==='in'?(ae/25.4).toFixed(4)+' in':ae.toFixed(2)+' mm');
 let msg,cls;
 if(ae<=.03){msg='Spot on.';cls='ok';}
 else if(ae<=.06){msg='Good. That’s as close as a telescopic gauge usually gets.';cls='ok';}
 else{
  cls='bad';
  msg=err>0?(deg>1.2?'You read long, and the gauge was locked '+deg.toFixed(1)+'° off square, which makes it read long. Lock it at the shortest point.':'You read long. Check the lock was square, and that the tool read right.')
   :'You read short. Closing the tool too hard squeezes the heads in, or the gauge slipped when it came out.';
 }
 practiceFb('<p><b>'+msg+'</b></p><p>The hole is Ø'+sz(li.D)+'. You read '+sz(mm)+' ('+diff+').</p>',cls);
}

/* ================= WIRING ================= */
$('sideBtn').onclick=()=>{const off=document.body.classList.toggle('side-off');$('sideBtn').setAttribute('aria-pressed',String(off));setTimeout(()=>window.dispatchEvent(new Event('resize')),380);};
$('examBtn').onclick=()=>setExam(true);$('exitExam').onclick=()=>setExam(false);$('spinBtn').onclick=()=>setSpin(!EX.spin);$('labelsBtn').onclick=()=>setExamLabels(!S.labels);
$('practiceBtn').onclick=()=>setPractice(!S.practice);$('checkBtn').onclick=practiceCheck;$('nextBtn').onclick=practiceNext;
$('guess').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();practiceCheck();}e.stopPropagation();});
$('guideBtn').onclick=()=>G.on?guideStop():guideStart();
$('sampleSel').onchange=e=>{S.partChanged=true;selectSample(+e.target.value);};
$('gset').onclick=e=>{const b=e.target.closest('.gchip');if(!b)return;S.auto=false;$('auto').checked=false;selectGauge(+b.dataset.i);};
$('auto').onchange=e=>{S.auto=e.target.checked;if(S.auto&&S.gi!==pickGauge(S.sample.nom))selectGauge(pickGauge(S.sample.nom));else buildGset();};
$('btnReroll').onclick=()=>{reroll();selectSample(S.si);toast('Hole sizes re-rolled.');};
$('revealBtn').onclick=()=>{S.revealed=!S.revealed;buildSamples();};
$('btnLock').onclick=()=>{autoCancel();ensureHome(()=>toggleLock());};$('btnInsert').onclick=()=>{autoCancel();ensureHome(()=>toggleInsert());};$('btnMeasure').onclick=()=>takeMeasure(null);$('btnTake').onclick=()=>takeMeasure(S.mTool);$('btnAuto').onclick=autoMeasure;
$('seeWhere').onclick=()=>{try{window.parent.postMessage({tgauge:{seeWhere:true}},'*');}catch(e){}};
$('bringBack').onclick=()=>{autoCancel();ensureHome();};
$('ask').onclick=e=>{const b=e.target.closest('button[data-ask]');if(!b){if(e.target===$('ask'))askClose();return;}askClose();runAuto(b.dataset.ask==='none'?null:b.dataset.ask);};
document.querySelectorAll('[data-send]').forEach(b=>{b.onclick=()=>{S.mTool=b.dataset.send;takeMeasure(b.dataset.send);};});
$('toolSeg').onclick=e=>{const b=e.target.closest('button');if(!b)return;S.mTool=b.dataset.t;};
$('dragY').onchange=e=>{S.dragY=e.target.checked;};$('dragR').onchange=e=>{S.dragR=e.target.checked;};
$('btnReset').onclick=()=>{autoCancel();ensureHome(()=>{resetGauge();toast('Gauge reset: locked and out of the hole.');});};
document.querySelectorAll('[data-view]').forEach(b=>{b.onclick=()=>{if(b.dataset.view==='hole'&&S.view!=='cut')pickView('cut');   // the hole is seen through the cutaway
 cam.dth=0;cam.dph=0;camGo(b.dataset.view);cam.fixed=true;};});
$('tilt').oninput=e=>{autoCancel();const v=+e.target.value;ensureHome(()=>{S.tiltCmd=snapSquare(v*D2R);if(S.tiltCmd===0&&v!==0)$('tilt').value='0.00';});};
$('depth').oninput=e=>{autoCancel();const v=+e.target.value;ensureHome(()=>trySetDepth(v));};
$('aids').onchange=e=>{S.aids=e.target.checked;};
$('lblTgl').onchange=e=>{S.labels=e.target.checked;};
$('realChk').checked=S.shop;
$('realChk').onchange=e=>{S.shop=e.target.checked;try{localStorage.setItem('pt-real-finish',S.shop?'1':'0');}catch(x){}const fx=window.__toolFx;if(fx)fx.paint(shopApply,{also:[bench]});else shopApply();};
[...$('unitSeg').children].forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.u===S.unit)));
$('unitSeg').onclick=e=>{const b=e.target.closest('button');if(!b)return;S.unit=b.dataset.u;[...$('unitSeg').children].forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
 for(const k in cache)delete cache[k];buildSamples();buildGset();if(!$('mic').classList.contains('hidden'))showMic();};
let viewJob=0;
// the part's view (cutaway, x-ray, solid): the part dissolves away, and builds back in the new one
function pickView(v){
 [...$('viewS').children].forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.v===v)));
 const id=++viewJob;
 if(v===S.view){if(partG.userData.dz)Dissolve.in(partG,{cells:40,ms:520,frame:()=>invalidate(120)});return;}   // back to the view it was in: the sweep reverses
 // the part dissolves away, and builds back in the new view
 Dissolve.out(partG,{cells:40,ms:520,frame:()=>invalidate(120),done:()=>{if(id!==viewJob)return;setView(v);invalidate(600);Dissolve.in(partG,{cells:40,ms:520,frame:()=>invalidate(120)});}});
}
$('viewS').onclick=e=>{const b=e.target.closest('button');if(b)pickView(b.dataset.v);};
document.addEventListener('keydown',e=>{
 if(e.target.tagName==='INPUT'&&e.target.type==='range'||e.target.tagName==='SELECT'||e.ctrlKey||e.metaKey||e.altKey)return;
 if(EX.on)return;
 const k=e.key.toLowerCase();
 if(k==='a')autoMeasure();else if(k==='l'){autoCancel();ensureHome(()=>toggleLock());}else if(k==='i'){autoCancel();ensureHome(()=>toggleInsert());}else if(k==='m')takeMeasure(S.mTool);else if(k==='r')$('btnReset').click();
 else if(e.key==='ArrowLeft'){autoCancel();ensureHome(()=>setTiltCmd(S.tiltCmd+(S.fine?.05:.5)*D2R));e.preventDefault();}
 else if(e.key==='ArrowRight'){autoCancel();ensureHome(()=>setTiltCmd(S.tiltCmd-(S.fine?.05:.5)*D2R));e.preventDefault();}
 else if(e.key==='ArrowUp'){const v=clamp(+(S.depth-(S.fine?.1:1)).toFixed(2),6,+$('depth').max);$('depth').value=v;trySetDepth(v);e.preventDefault();}
 else if(e.key==='ArrowDown'){const v=clamp(+(S.depth+(S.fine?.1:1)).toFixed(2),6,+$('depth').max);$('depth').value=v;trySetDepth(v);e.preventDefault();}
});

/* ================= THE QUICK CONTROLS (bottom left of the 3D view) ================= */
S.fine=false;
$('panelBtn').onclick=()=>{const off=document.body.classList.toggle('panel-off');$('panelBtn').setAttribute('aria-pressed',String(off));$('panelBtn').setAttribute('aria-label',off?'Show the reading panel':'Hide the reading panel');$('panelBtn').setAttribute('data-tip',off?'Show the reading panel\nBrings the readings and buttons back.':'Hide the reading panel\nGives the 3D view the whole height.');};
$('insQuick').onclick=()=>$('btnInsert').click();
$('lockQuick').onclick=()=>$('btnLock').click();
$('squareQuick').onclick=()=>{autoCancel();ensureHome(()=>setTiltCmd(0));};
$('fineQuick').onclick=()=>{S.fine=!S.fine;$('fineQuick').setAttribute('aria-pressed',String(S.fine));};
// type a depth (in the units chosen on the left) and the gauge goes there: it is put in the hole first if it is not in it yet
function goDepth(){
 const raw=parseFloat($('setTo').value.replace(/[^0-9.\-]/g,''));
 if(!isFinite(raw)||raw<=0){toast('Type a depth in '+(S.unit==='in'?'inches':'millimeters')+', like '+fmtDepthNum(14)+'.');return;}
 const mm=S.unit==='in'?raw*25.4:raw,v=Math.round(clamp(mm,6,+$('depth').max)*10)/10;
 autoCancel();
 ensureHome(()=>{if(!S.inserted)toggleInsert();if(!S.inserted)return;$('depth').value=v;trySetDepth(v);$('setTo').value='';});
}
const fmtDepthNum=mm=>S.unit==='in'?(mm/25.4).toFixed(2)+' in':mm+' mm';
$('goBtn').onclick=goDepth;
$('setTo').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();goDepth();}e.stopPropagation();});

/* ================= THE CLEANING PICTURE: PAPER BETWEEN A CONTACT HEAD AND A CLEAN BLOCK ================= */
// A steel block comes up to a head, closes on a slip of paper held against it, and the paper is pulled out against the grip with a slight
// brown stain on it (js/paper.js). It cleans both ends: the right-hand head first, then the left-hand one. Returns whether it could be shown.
async function labPaper(idx){
 if(!window.__paper||window.__paper.busy)return false;
 const alive=()=>G.on&&G.i===idx&&!EX.on;
 for(const dir of [1,-1]){   // (1 is the right-hand head, -1 the left-hand one)
  if(!alive())return true;
  const tip=()=>{pivot.updateMatrixWorld(true);return pivot.localToWorld(new THREE.Vector3(dir*S.curL/2,0,0));};
  const block=new THREE.Mesh(new THREE.BoxGeometry(14,34,34),new THREE.MeshStandardMaterial({color:0xb3bcc8,metalness:.85,roughness:.32}));
  block.visible=false;block.userData.noShadow=true;scene.add(block);
  let gap=45;
  const put=()=>{const t=tip();block.position.set(t.x+dir*(gap+7),t.y,t.z);invalidate(120);};
  const slide=(to,ms)=>new Promise(res=>{const g0=gap,t0=performance.now();const f=()=>{if(!alive()){res();return;}const k=Math.min(1,(performance.now()-t0)/ms),e=k*k*(3-2*k);gap=g0+(to-g0)*e;put();if(k<1)requestAnimationFrame(f);else res();};f();});
  const ok=await window.__paper.run({
   T:THREE,scene,invalidate:()=>invalidate(120),alive,
   faceA:()=>tip(),normal:new THREE.Vector3(dir,0,0),slide:new THREE.Vector3(0,1,0),size:[76.2,76.2],thick:.1,stain:11,
   look:()=>{camGo(dir>0?'paper':'paperL');cam.fixed=true;},
   open:async()=>{await new Promise(r=>setTimeout(r,dir>0?1300:500));gap=45;put();block.visible=true;await slide(22,700);},
   closeOn:async()=>{await slide(.12,950);}
  });
  await slide(50,500);
  scene.remove(block);block.geometry.dispose();block.material.dispose();
  if(!ok)return false;
 }
 return true;
}

/* ================= START ================= */
window.__load&&window.__load.set(.5,'Building the gauge…');
resize();selectSample(0);camGo('overview',true);shopApply();
// the part preview (js/holo.js): a hologram of the highlighted part beside the open Part list
if(window.__holo)window.__holo.attach({THREE,select:$('sampleSel'),
 caption:v=>{const s=SAMPLES[+v];return s?[s.name,s.tag]:['',''];},
 build:v=>{const s=SAMPLES[+v];if(!s)return null;const g=new THREE.Group();g.add(new THREE.Mesh(partShapeGeo(s).geo));return g;}});
window.__lab={PV,FLY,toolFacing,fly:()=>({waiting:FLY.waiting,attached:FLY.attached,swapping:FLY.swapping,on:FLY.on,clip:FLY.clip,t:AW.t,dir:AW.dir,pivotVisible:pivot.visible,sx:FLY.shown.x,sy:FLY.shown.y}),landed:()=>{},toolReady,swapping,overlay,pending,gaugeBack,AW,camera,pivot,cam,autoMeasure,runAuto,AM,update,S,GAUGES,SAMPLES,toggleLock,toggleInsert,measure,send,setTiltCmd,selectSample,selectGauge,limits,guideStart,guideGo,guideIndex:t=>GSTEPS.findIndex(x=>x.title===t),PINCH_MS,BUBBLE_MS};
requestAnimationFrame(tick);   // draws behind the loading screen
// Like the other tools: nothing builds in until everything is ready. The shaders are compiled first, the dissolve's own
// cut-away versions included (one short throwaway sweep, hidden behind the loading screen), so the build-in that follows
// never stalls partway through; then the loading screen fades and the gauge and its part build in as it goes.
(async function boot(){
 window.__load&&window.__load.set(.72,'Getting the shaders ready…');
 try{renderer.compile(scene,camera);}catch(e){}
 for(let i=0;i<2;i++)await nextFrame();
 Dissolve.out(toolRoot,{ms:140,cells:40,frame:()=>invalidate(120)});
 for(let i=0;i<9;i++)await nextFrame();
 window.__load?window.__load.done():($('loading')&&$('loading').remove());
 Dissolve.tool(toolRoot,{frame:()=>invalidate(1000)});   // builds in as the loading screen fades, and gives the shell its dissolve for tab changes
})();
})();
