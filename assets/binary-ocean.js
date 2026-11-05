
export function mountBinaryOcean({
  canvas,
  fallbackCanvas,
  state,
  motionButton,
  interactive = true,
  palette = 'site',
  densityScale = 1,
  gridScale = 1,
  pixelRatioCap = 1.5,
  camera = {},
  autoImpacts = true,
  reducedMotionScale = 0.22,
  pauseLabel = 'Pause ocean',
  resumeLabel = 'Resume ocean'
} = {}) {

if (!canvas || !fallbackCanvas) return () => {};
const stage = canvas.closest('.observatory-stage');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;
if (!interactive) {
  canvas.tabIndex = -1;
  canvas.setAttribute('aria-hidden', 'true');
  fallbackCanvas.tabIndex = -1;
  fallbackCanvas.setAttribute('aria-hidden', 'true');
}
// The ocean is ambient site content, so it moves on arrival. A reduced-motion
// preference slows the waves and suppresses automatic ripples instead of
// leaving the hero frozen; visitors can always pause it explicitly.
let paused = false;
let drawOnce = () => {};
let schedule = () => {};
let cancelFrame = () => {};
let applyCurrentTheme = () => {};
let frameId = 0;
let inView = true;
const cleanupTasks = [];
const abort = new AbortController();
const signal = abort.signal;
const isCrtPalette = palette === 'crt';
const isLight = () => !isCrtPalette && root.dataset.theme !== 'dark';
const motionScale = () => reduced.matches ? reducedMotionScale : 1;
const cameraYaw = Number.isFinite(camera.yaw) ? camera.yaw : 0;
const cameraPitch = Number.isFinite(camera.pitch) ? camera.pitch : 0.37;
const cameraDistance = Number.isFinite(camera.distance) ? camera.distance : 38;
const boundedDensity = Math.max(0.4, Math.min(1.2, densityScale));
const boundedGridScale = Math.max(0.5, Math.min(1, gridScale));
let disposed = false;
const updateStatus = () => {
  if (state) state.textContent = isCrtPalette
    ? paused ? 'Silent CRT animation paused' : reduced.matches ? 'Gentle silent CRT animation · reduced-motion preference' : 'Silent binary display moving · rendered locally'
    : paused ? 'Ocean paused' : reduced.matches ? 'Gentle binary ocean motion · reduced-motion preference' : 'Binary ocean in motion · browser-rendered, not live runtime data';
  if (motionButton) {
    motionButton.textContent = paused ? resumeLabel : pauseLabel;
    motionButton.setAttribute('aria-pressed', String(paused));
  }
};
const renderFrame = now => {
  frameId = 0;
  drawOnce(now);
  if (!paused && inView && !document.hidden) frameId = requestAnimationFrame(renderFrame);
};
schedule = () => {
  if (!frameId && inView && !document.hidden) frameId = requestAnimationFrame(renderFrame);
};
cancelFrame = () => { if (frameId) cancelAnimationFrame(frameId); frameId = 0; };
const setPaused = value => { paused = value; updateStatus(); cancelFrame(); schedule(); };
motionButton?.addEventListener('click', () => {
  setPaused(!paused);
}, {signal});
motionButton && (motionButton.disabled = false);
const themeObserver = new MutationObserver(() => applyCurrentTheme());
themeObserver.observe(root, {attributes:true, attributeFilter:['data-theme']});
reduced.addEventListener?.('change', () => { applyCurrentTheme(); updateStatus(); schedule(); }, {signal});
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelFrame(); else schedule(); }, {signal});
const viewObserver = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; if (inView) schedule(); else cancelFrame(); }, {threshold:.01});
viewObserver.observe(stage || canvas);
const cleanup = () => {
  if (disposed) return;
  disposed = true;
  cancelFrame();
  abort.abort();
  themeObserver.disconnect();
  viewObserver.disconnect();
  window.removeEventListener('pagehide', cleanup);
  for (const task of cleanupTasks) task();
};
window.addEventListener('pagehide', cleanup, {once:true});
function startCanvasFallback(target){
const ctx=target.getContext('2d');if(!ctx)return false;
canvas.hidden=true;canvas.tabIndex=-1;canvas.setAttribute('aria-hidden','true');fallbackCanvas.hidden=false;
if(interactive){target.removeAttribute('aria-hidden');target.tabIndex=0;target.setAttribute('aria-label',canvas.getAttribute('aria-label')||'Interactive binary ocean');}
else{target.tabIndex=-1;target.setAttribute('aria-hidden','true');}
let light=isLight(),t=0,yaw=cameraYaw,pitch=cameraPitch,zoom=38/cameraDistance,last=performance.now(),drag=false,px=0,py=0,moved=false;
const rings=[];let lastDrop=0;const glyphs='01';
applyCurrentTheme=()=>{light=isLight();schedule();};
function resize(){const r=target.getBoundingClientRect(),scale=Math.min(devicePixelRatio||1,1.35,pixelRatioCap);target.width=Math.max(1,Math.round(r.width*scale));target.height=Math.max(1,Math.round(r.height*scale));schedule();}
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage || target);cleanupTasks.push(()=>resizeObserver.disconnect());resize();
function ripple(x,z,power=1.0){rings.push({x,z,born:t,power});if(rings.length>9)rings.shift();}
function surface(x,z){let h=1.5*Math.sin(x*.24+z*.17-t*.68)+.9*Math.sin(x*.12-z*.31+t*.52)+.55*Math.sin(x*.42+z*.22-t*.93)+.28*Math.sin(x*.79-z*.39+t*.88);for(const r of rings){let dt=t-r.born;if(dt<0||dt>9)continue;let dist=Math.hypot(x-r.x,z-r.z);let front=dist-dt*4.2;h+=r.power*1.8*Math.sin(front*1.5)*Math.exp(-Math.abs(front)*.48)*Math.exp(-dt*.24);}return h;}
drawOnce=now=>{let dt=Math.min((now-last)/1000,.05);last=now;if(!paused){const motionDt=dt*motionScale();t+=motionDt;if(autoImpacts&&!reduced.matches&&t-lastDrop>3.9){lastDrop=t;ripple(Math.sin(t*.8)*10,Math.cos(t*.57)*8,.5);}}
const w=target.width,h=target.height;ctx.fillStyle=light?'#f4f7f3':isCrtPalette?'#010302':'#050c09';ctx.fillRect(0,0,w,h);ctx.textAlign='center';ctx.textBaseline='middle';const unit=Math.min(w/80,h/42)*zoom,angle=yaw;
const cols=Math.max(interactive?54:34,Math.min(125,Math.round(w/10*boundedDensity))),rows=Math.max(interactive?34:24,Math.min(74,Math.round(h/9*boundedDensity)));
for(let j=0;j<rows;j++){const z=-26+(j/(rows-1))*52,fade=Math.max(.1,Math.min(1,(z+28)/34)),dep=.78+(z+26)/52*.64;for(let i=0;i<cols;i++){
const x=-27+(i/(cols-1))*54,xx=x*Math.cos(angle)-z*Math.sin(angle)*.55,zz=x*Math.sin(angle)*.55+z*Math.cos(angle),val=surface(xx,zz);
const sy=h*.47+(zz*.35-val*.98)*unit*dep-Math.sin(pitch)*unit*1.7,sx=w*.5+xx*unit*dep;if(sx<-14||sx>w+14||sy<-14||sy>h+14)continue;
const normal=Math.abs(surface(xx+.3,zz)-surface(xx-.3,zz)),intensity=Math.max(0,Math.min(1,.38+val*.12+normal*.26)),energy=Math.min(1,Math.abs(val)*.13+normal*.24+Math.abs(surface(xx,zz+.16)-surface(xx,zz-.16))*.18),flow=Math.sin(xx*.49+zz*.18-t*2.05+val*.48)+.38*Math.sin(xx*.20-zz*.37+t*1.16),size=Math.max(6,Math.min(18,unit*dep*.43));
ctx.globalAlpha=(.17+.77*intensity)*(.28+.72*fade)*(isCrtPalette?0.72:1);ctx.fillStyle=light?'#0d6043':isCrtPalette?'#46a775':'#48eaa1';ctx.font=`${size}px ui-monospace,Consolas,monospace`;ctx.fillText(flow>(.66-energy*.39)?'1':'0',sx,sy);
}}ctx.globalAlpha=1;};
const bounds=()=>target.getBoundingClientRect();
if(interactive){
target.addEventListener('pointerdown',e=>{drag=true;moved=false;px=e.clientX;py=e.clientY;target.setPointerCapture(e.pointerId);},{signal});
target.addEventListener('pointermove',e=>{if(!drag)return;let dx=e.clientX-px,dy=e.clientY-py;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;yaw=Math.max(-.6,Math.min(.6,yaw-dx*.004));pitch=Math.max(.14,Math.min(1.08,pitch+dy*.002));px=e.clientX;py=e.clientY;schedule();},{signal});
const endPointer=e=>{if(drag&&!moved){const b=bounds();ripple(((e.clientX-b.left)/b.width-.5)*40,((e.clientY-b.top)/b.height-.5)*35,1.8);schedule();}drag=false;};
target.addEventListener('pointerup',endPointer,{signal});target.addEventListener('pointercancel',()=>{drag=false;},{signal});
target.addEventListener('wheel',e=>{if(document.activeElement!==target)return;e.preventDefault();zoom=Math.max(.66,Math.min(1.65,zoom+Math.sign(-e.deltaY)*.05));schedule();},{passive:false,signal});
target.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();setPaused(!paused);}else if(e.key.toLowerCase()==='r'){zoom=1;yaw=0;pitch=.4;schedule();}},{signal});
stage?.querySelector('[data-ocean-zoom-in]')?.addEventListener('click',()=>{zoom=Math.min(1.65,zoom+.08);schedule();},{signal});
stage?.querySelector('[data-ocean-zoom-out]')?.addEventListener('click',()=>{zoom=Math.max(.66,zoom-.08);schedule();},{signal});
}
updateStatus();schedule();return true;
}
const gridX=Math.round(224*boundedGridScale),gridZ=Math.round(144*boundedGridScale);
let gl;
try { gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'}); } catch {}
if(!gl){if(!startCanvasFallback(fallbackCanvas)){if(state)state.textContent='Binary ocean unavailable · this browser could not create a canvas renderer';if(motionButton)motionButton.disabled=true;}return cleanup;}
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelFrame();if(!startCanvasFallback(fallbackCanvas)){if(state)state.textContent='Binary ocean unavailable · graphics context was lost';if(motionButton)motionButton.disabled=true;}},{signal});
const VS=`#version 300 es
precision highp float;precision highp sampler2D;
uniform mat4 uProjection,uView;uniform float uTime,uDensity,uAspect;uniform sampler2D uPhysics;uniform vec3 uInk;uniform float uLight;
out vec3 vColor;flat out float vGlyph;out float vOpacity;
const int NX=${gridX};const int NZ=${gridZ};
float physics(vec2 uv){return texture(uPhysics,uv).r;}
float shape(vec2 q, float t){
 float w=0.;
 w+=1.32*sin(q.x*.235+q.y*.135-t*.58);
 w+=.86*sin(q.x*.13-q.y*.29+t*.47);
 w+=.53*sin(q.x*.4+q.y*.20-t*.91);
 w+=.24*sin(q.x*.70-q.y*.35+t*.82);
 return w;
}
void main(){
 int id=gl_VertexID;int i=id%NX;int j=id/NX;
 float nx=float(i)/float(NX-1);float nz=float(j)/float(NZ-1);
 vec2 uv=vec2(nx,nz);
 vec2 q=(uv-.5)*vec2(52.,47.);
 float height=shape(q,uTime)+physics(uv)*2.5;
 float hx=shape(q+vec2(.17,0.),uTime)-shape(q-vec2(.17,0.),uTime);
 float hz=shape(q+vec2(0.,.17),uTime)-shape(q-vec2(0.,.17),uTime);
 vec3 p=vec3(q.x,height,q.y);
 vec4 view=uView*vec4(p,1.);
 gl_Position=uProjection*view;
 float d=max(1.,-view.z);
 float size=clamp(300./d,2.0,17.5)*uDensity;
 gl_PointSize=size;
 float slope=clamp(length(vec2(hx,hz))*1.1,0.,1.);
 float ridge=clamp(height*.16+.40,0.,1.);
 float light=clamp(.28+ridge*.55+slope*.25+max(0.,hx*.7-hz*.5)*.20,0.,1.);
 float haze=1.-smoothstep(20.,75.,d);
 float shimmer=.88+.12*sin(q.x*.5+q.y*.3+uTime*.75);
 vColor=mix(uInk*.34,uInk*1.48,light*shimmer)*uLight;
 vOpacity=(.27+light*.70)*haze;
 // Binary waves: 1-bands sweep across the field with the flowing water.
 // Smooth advected phases keep each character stable between coherent wavefronts.
 float speed=abs(shape(q,uTime+.08)-shape(q,uTime-.08))/.16;
 float waveEnergy=clamp(abs(height)*.13+slope*.26+speed*.18+abs(physics(uv))*.18,0.,1.);
 float advected=sin(q.x*.49+q.y*.18-uTime*2.05+height*.48)
               +.38*sin(q.x*.20-q.y*.37+uTime*1.16);
 // Mainly zero at rest; each traveling crest creates a band of ones.
 float threshold=.66-waveEnergy*.39;
 vGlyph=advected>threshold ? 1.0 : 0.0;
}
`;
const FS=`#version 300 es
precision highp float;uniform sampler2D uGlyphs;in vec3 vColor;flat in float vGlyph;in float vOpacity;out vec4 outColor;
void main(){
 vec2 pt=gl_PointCoord;
 float gx=mod(vGlyph,4.);float gy=floor(vGlyph/4.);
 vec2 uv=(vec2(gx,gy)+vec2(pt.x,1.-pt.y))/vec2(4.,2.);
 float a=texture(uGlyphs,uv).a;
 if(a<.06)discard;
 outColor=vec4(vColor,a*vOpacity);
}`;
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(message);}return s;}
let prog;try{prog=gl.createProgram();gl.attachShader(prog,shader(gl.VERTEX_SHADER,VS));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,FS));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));gl.useProgram(prog);}catch(error){if(state)state.textContent='Using the Canvas fallback · WebGL initialization failed';gl.getExtension('WEBGL_lose_context')?.loseContext();return startCanvasFallback(fallbackCanvas)?cleanup:cleanup;}
const U={};for(let n of ['uProjection','uView','uTime','uDensity','uAspect','uPhysics','uGlyphs','uInk','uLight'])U[n]=gl.getUniformLocation(prog,n);
// Original high-resolution glyph atlas, now using binary characters only.
const sheet=document.createElement('canvas');sheet.width=4*96;sheet.height=2*96;const sc=sheet.getContext('2d');sc.clearRect(0,0,sheet.width,sheet.height);sc.fillStyle='#fff';sc.textAlign='center';sc.textBaseline='middle';sc.font='bold 70px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';const glyphs=['0','1'];glyphs.forEach((v,k)=>sc.fillText(v,(k%4+.5)*96,(Math.floor(k/4)+.52)*96));
const atlas=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,atlas);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,sheet.width,sheet.height,0,gl.RGBA,gl.UNSIGNED_BYTE,sheet);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.uniform1i(U.uGlyphs,0);
// Stable finite-difference wave solver for pointer impacts; no fake random motion.
const W=124,H=82,current=new Float32Array(W*H),previous=new Float32Array(W*H),next=new Float32Array(W*H);const phys=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,phys);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,W,H,0,gl.RED,gl.FLOAT,current);gl.uniform1i(U.uPhysics,1);
function impulse(x,z,power=1){let cx=Math.round(x*(W-1)),cz=Math.round(z*(H-1));for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){let xx=cx+dx,yy=cz+dy;if(xx<2||xx>=W-2||yy<2||yy>=H-2)continue;let r2=(dx*dx+dy*dy)/19;current[yy*W+xx]+=power*Math.exp(-r2)*1.1;}}
function step(){for(let j=1;j<H-1;j++)for(let i=1;i<W-1;i++){const k=j*W+i;const lap=current[k-1]+current[k+1]+current[k-W]+current[k+W]-4*current[k];next[k]=(2*current[k]-previous[k]+.16*lap)*.993;}previous.set(current);current.set(next);}
const vao=gl.createVertexArray();gl.bindVertexArray(vao);
const mat4=()=>new Float32Array(16);
function perspective(fovy,aspect,near,far){let f=1/Math.tan(fovy/2),o=mat4();o[0]=f/aspect;o[5]=f;o[10]=(far+near)/(near-far);o[11]=-1;o[14]=2*far*near/(near-far);return o;}
function lookAt(eye,target){let z=normalize(sub(eye,target)),x=normalize(cross([0,1,0],z)),y=cross(z,x),o=mat4();o[0]=x[0];o[1]=y[0];o[2]=z[0];o[4]=x[1];o[5]=y[1];o[6]=z[1];o[8]=x[2];o[9]=y[2];o[10]=z[2];o[12]=-dot(x,eye);o[13]=-dot(y,eye);o[14]=-dot(z,eye);o[15]=1;return o;}
function sub(a,b){return a.map((v,i)=>v-b[i]);}function dot(a,b){return a.reduce((s,v,i)=>s+v*b[i],0);}function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}function normalize(a){let l=Math.hypot(...a);return a.map(v=>v/l);}
let light=isLight(),yaw=cameraYaw,pitch=cameraPitch,dist=cameraDistance,simTime=0,last=performance.now(),acc=0,autoRipple=0,drag=false,downX=0,downY=0,moved=false;
function applyTheme(){
  light=isLight();
  if(isCrtPalette){gl.clearColor(.003,.009,.005,1);gl.uniform3f(U.uInk,.18,.72,.43);gl.uniform1f(U.uLight,reduced.matches?.48:.58);return;}
  if(light){gl.clearColor(.958,.972,.954,1);gl.uniform3f(U.uInk,.04,.37,.23);gl.uniform1f(U.uLight,.88);}else{gl.clearColor(.018,.041,.031,1);gl.uniform3f(U.uInk,.24,1.,.61);gl.uniform1f(U.uLight,1.);}
}
applyCurrentTheme=applyTheme;
applyTheme();
function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,pixelRatioCap),w=Math.min(2300,Math.max(1,Math.round(r.width*dpr))),h=Math.min(1500,Math.max(1,Math.round(r.height*dpr)));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}gl.useProgram(prog);gl.uniformMatrix4fv(U.uProjection,false,perspective(Math.PI/3,w/h,.1,230));gl.uniform1f(U.uDensity,Math.max(.68,Math.min(1.15,r.width/1100))*boundedDensity);schedule();}
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage||canvas);cleanupTasks.push(()=>resizeObserver.disconnect());resize();
const bounds=()=>canvas.getBoundingClientRect();
if(interactive){
canvas.addEventListener('pointerdown',e=>{drag=true;moved=false;downX=e.clientX;downY=e.clientY;canvas.setPointerCapture(e.pointerId);},{signal});canvas.addEventListener('pointermove',e=>{if(!drag)return;let dx=e.clientX-downX,dy=e.clientY-downY;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;yaw=Math.max(-.65,Math.min(.65,yaw-dx*.003));pitch=Math.max(.14,Math.min(1.08,pitch+dy*.002));downX=e.clientX;downY=e.clientY;schedule();},{signal});
canvas.addEventListener('pointerup',e=>{if(drag&&!moved){const r=bounds();impulse(.5+((e.clientX-r.left)/r.width-.5)*.45,.5+((e.clientY-r.top)/r.height-.5)*.45,1.9);schedule();}drag=false;},{signal});canvas.addEventListener('pointercancel',()=>{drag=false;},{signal});
canvas.addEventListener('wheel',e=>{if(document.activeElement!==canvas)return;e.preventDefault();dist=Math.max(23,Math.min(70,dist+Math.sign(e.deltaY)*2));schedule();},{passive:false,signal});
canvas.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();setPaused(!paused);}else if(e.key.toLowerCase()==='r'){yaw=0;pitch=.37;dist=38;schedule();}},{signal});
stage?.querySelector('[data-ocean-zoom-in]')?.addEventListener('click',()=>{dist=Math.max(23,dist-2);schedule();},{signal});
stage?.querySelector('[data-ocean-zoom-out]')?.addEventListener('click',()=>{dist=Math.min(70,dist+2);schedule();},{signal});
}
drawOnce=now=>{let dt=Math.min((now-last)/1000,.05);last=now;if(!paused){const motionDt=dt*motionScale();simTime+=motionDt;acc+=motionDt;while(acc>=1/60){step();acc-=1/60;}if(autoImpacts&&!reduced.matches){autoRipple+=motionDt;if(autoRipple>3.8){autoRipple=0;impulse(.20+(.5+.5*Math.sin(simTime*.39))*.6,.32+(.5+.5*Math.sin(simTime*.63))*.35,.72);}}}gl.useProgram(prog);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,phys);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,W,H,gl.RED,gl.FLOAT,current);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,atlas);
let eye=[Math.sin(yaw)*dist*Math.cos(pitch),Math.sin(pitch)*dist,Math.cos(yaw)*dist*Math.cos(pitch)];gl.uniformMatrix4fv(U.uView,false,lookAt(eye,[0,-.7,0]));gl.uniform1f(U.uTime,simTime);
gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.bindVertexArray(vao);gl.drawArrays(gl.POINTS,0,gridX*gridZ);
};
updateStatus();schedule();
cleanupTasks.push(()=>{gl.deleteTexture(atlas);gl.deleteTexture(phys);gl.deleteVertexArray(vao);gl.deleteProgram(prog);});
return cleanup;
}
