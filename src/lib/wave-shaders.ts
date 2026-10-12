import { IDLE_START, IMPULSE_DURATION } from './settings';

// Shared by mesh and particles: one impulse, then periodic idle swells.
export const waveField = `
uniform float uTime;
uniform float uIntensity;
uniform float uFocus;
uniform float uAperture;
uniform float uImpulse;
uniform float uSwell;
uniform float uWavelength;
uniform float uPeriod;
uniform float uIdlePhase;
uniform float uDrop;
uniform float uCrestWidth;
uniform float uAmbient;
uniform float uGlow;
uniform vec2 uOrigin;
uniform vec2 uResolution;
uniform vec3 uColorShadow;
uniform vec3 uColorLift;
uniform vec3 uColorGlow;
// Arc: the crest enters from a distant origin, so it crosses the frame almost straight.
// Drop: it starts at an origin next to the frame, so its curvature stays visible.
float pulseRadius(float age) { return mix(6.0,0.0,uDrop)+age*1.05; }
float gaussian(float x,float width) { return exp(-x*x/(width*width)); }
vec3 wave(vec2 p,float age) {
  vec2 delta=p-uOrigin;
  float radius=length(delta);
  float ring=pulseRadius(age);
  float front=radius-ring;
  float envelope=smoothstep(0.0,.35,age)*(1.0-smoothstep(5.0,7.6,age))*uImpulse;
  // A drop ring is born narrow and low, widens and rises as it leaves the impact, then
  // loses height as its energy spreads over a growing circumference. A full-width crest
  // at the origin would instead inflate as a lumpy dome. Both depend on the ring radius,
  // so the whole ring changes together.
  float birth=smoothstep(0.0,.9,ring);
  envelope*=mix(1.0,birth*1.5*inversesqrt(1.0+ring*.9),uDrop);
  // Shallow, broad leading shoulder; the trough must not read as a tube.
  // Crest width scales the whole profile at the same height, so wider crests are gentler.
  float w=uCrestWidth*mix(1.0,clamp(.3+.42*ring,.3,1.0),uDrop);
  float headWidth=.46*w,troughOffset=.72*w,troughWidth=.78*w,tailOffset=1.6*w,tailWidth=w;
  float head=gaussian(front,headWidth);
  float trough=gaussian(front+troughOffset,troughWidth);
  float tail=gaussian(front+tailOffset,tailWidth);
  float height=(.085*head-.025*trough+.012*tail)*envelope;
  float light=(head+.16*tail)*envelope;
  float slope=(-2.0*front/(headWidth*headWidth)*.085*head
    +2.0*(front+troughOffset)/(troughWidth*troughWidth)*.025*trough
    -2.0*(front+tailOffset)/(tailWidth*tailWidth)*.012*tail)*envelope;
  return vec3(height,light,slope);
}
// After the impulse, shallow swells keep rolling out from the same origin.
// One wavelength passes per period; the phase is accumulated on the CPU so
// period changes do not make the swells jump.
const float idleStart=${IDLE_START.toFixed(1)};
vec2 idleSwell(vec2 p,float t,float lag) {
  float radius=length(p-uOrigin);
  float phase=radius/uWavelength-(uIdlePhase-lag/uPeriod);
  float crest=pow(.5+.5*cos(phase*6.2831853),6.0);
  return vec2(.03,.45)*crest*smoothstep(5.5,idleStart,t)*uSwell;
}
// The field as it was lag seconds ago.
vec3 motion(vec2 p,float lag) {
  float t=max(0.0,uTime-lag);
  return wave(p,t)+vec3(idleSwell(p,t,lag),0.0);
}
float restHeight(vec2 p) { return .035*sin(p.x*.65+p.y*.35)+.022*cos(p.y*.8); }
float clothHeight(vec2 p) { return restHeight(p)+motion(p,0.0).x; }
// Focus follows the impulse crest out of frame; idle swells stay soft.
float focusRadius() { return pulseRadius(min(uTime,${IMPULSE_DURATION.toFixed(1)})); }
// Art-directed curved focus surface follows the annular crest. A conventional
// planar focal plane cannot keep this whole tilted ring sharp simultaneously.
float blurRadius(vec3 world,float depth) {
  float signedOffset=length(world.xz-uOrigin)-focusRadius();
  float radialOffset=abs(signedOffset);
  // A broad, symmetric shoulder keeps the transition even across the crest.
  // The rational falloff approaches full blur slowly, without a steep shoulder.
  float focusWidth=mix(.32,.68,uFocus);
  float focusDistance=radialOffset/focusWidth;
  float focusSquared=focusDistance*focusDistance;
  float radialBlur=.036*focusSquared/(1.0+focusSquared);
  // Dust above the cloth retains near/far bokeh even over the focused crest.
  float elevation=abs(world.y-clothHeight(world.xz));
  float verticalBlur=smoothstep(.05,.38,elevation)*.013;
  return min(length(vec2(radialBlur,verticalBlur))*uAperture*clamp(3.0/max(depth,.1),.45,1.5),.065);
}
`;

export const clothVertex = waveField + `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vMaterial;
varying float vDepth;
void main() {
  vec2 p=position.xz;
  float height=clothHeight(p);
  float dx=(clothHeight(p+vec2(.012,0.0))-clothHeight(p-vec2(.012,0.0)))/.024;
  float dz=(clothHeight(p+vec2(0.0,.012))-clothHeight(p-vec2(0.0,.012)))/.024;
  vNormal=normalize(vec3(-dx,1.0,-dz));
  vec3 displaced=vec3(p.x,height,p.y);
  vWorld=displaced;
  // Yarn stays attached to vertices as the crest stretches the surface.
  vMaterial=vec2(p.x*.83+p.y*.55,p.x*.55-p.y*.83);
  vec4 view=modelViewMatrix*vec4(displaced,1.0);
  vDepth=-view.z;
  gl_Position=projectionMatrix*view;
}
`;

export const clothFragment = waveField + `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vMaterial;
varying float vDepth;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float softNoise(vec2 p) {
  vec2 cell=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(cell),hash(cell+vec2(1,0)),f.x),
    mix(hash(cell+vec2(0,1)),hash(cell+vec2(1,1)),f.x),f.y);
}
void main() {
  vec3 event=motion(vWorld.xz,0.0);
  vec3 normal=normalize(vNormal);
  vec3 view=normalize(cameraPosition-vWorld);
  vec3 light=normalize(vec3(-.5,1.0,-.4));
  float diffuse=max(dot(normal,light),0.0);
  vec3 halfway=normalize(light+view);
  float spec=pow(max(dot(normal,halfway),0.0),28.0);
  float fresnel=pow(1.0-max(dot(normal,view),0.0),3.0);
  vec2 uv=gl_FragCoord.xy/uResolution;
  float cool=(1.0-smoothstep(0.0,.65,uv.y));
  vec3 coolBase=uColorLift*vec3(.12,.31,.47);
  vec3 base=mix(uColorShadow,coolBase,cool);
  base=mix(base,uColorLift,smoothstep(.1,1.0,uv.x)*cool*.8);
  vec3 glowMint=min(mix(uColorGlow,vec3(1.0),.15)*vec3(1.05,.98,2.2),vec3(1.0));
  vec3 glow=mix(uColorGlow,glowMint,smoothstep(.25,1.0,uv.x));
  // Ambient scales the scene's own light; the crest glow is added on top of it.
  vec3 color=base*(.8+diffuse*.35)*uAmbient;
  // Broad light sources persist after the crest passes through the crop.
  float mint=exp(-pow((uv.x-.94)/.39,2.0)-pow((uv.y-.86)/.65,2.0));
  float green=exp(-pow((uv.x-.22)/.65,2.0)-pow((uv.y-.72)/.34,2.0));
  color+=mix(uColorLift,uColorGlow,.35)*.7*mint*uIntensity*uAmbient;
  color+=uColorShadow*vec3(.6,.8,.16)*green*uIntensity*uAmbient;
  color+=glow*event.y*(.40+diffuse*.26)*uIntensity*uGlow;
  color+=mix(uColorGlow,vec3(1.0),.15)*spec*(.03*uAmbient+event.y*.18*uGlow)*uIntensity;
  color+=uColorShadow*.22*fresnel*uAmbient;
  // Material-bound variations survive defocus as overlapping soft patches.
  float mottling=(softNoise(vMaterial*18.0)*2.0-1.0);
  float bundles=(softNoise(vMaterial*vec2(48.0,9.0))*2.0-1.0);
  color*=1.0+.14*mottling+.045*bundles;
  // Regular luminous dots; preserve pixel antialiasing before optical defocus.
  vec2 c=vMaterial*380.0;
  vec2 dx=dFdx(c),dy=dFdy(c);
  float variance=1.0/12.0;
  vec2 attenuation=exp(-.5*(dx*dx+dy*dy)*variance);
  float warp=sin(c.x),weft=sin(c.y*.88);
  float weave=warp*.40*attenuation.x+weft*.26*attenuation.y;
  weave+=warp*weft*.22*attenuation.x*attenuation.y;
  color*=1.0+weave*.55;
  color+=glow*max(0.0,warp*weft)*attenuation.x*attenuation.y*event.y*.05;
  gl_FragColor=vec4(color,1.0);
}
`;

export const particleVertex = waveField + `
attribute float aSeed;
attribute float aLift;
varying float vBrightness;
varying float vCore;
varying float vDefocus;
varying float vTint;
uniform float uDust;
uniform float uDustLevel;
void main() {
  vec2 anchor=position.xz;
  vec3 event=motion(anchor,0.0);
  vec3 delayed=motion(anchor,.10);
  vec2 delta=anchor-uOrigin;
  vec2 radial=delta/max(length(delta),.0001);
  vec2 drift=radial*delayed.z*.035;
  vec2 p=anchor+drift;
  float y=clothHeight(p)+aLift+max(0.0,delayed.x)*.24;
  vec4 view=modelViewMatrix*vec4(p.x,y,p.y,1.0);
  float depth=-view.z;
  // Fine dust rests on the yarn; the rest is suspended and reads as bokeh.
  float fine=1.0-step(.08,aLift);
  // Fine dust is drawn larger and with half the defocus, so it stays a crisp speck
  // over a broad band instead of dissolving into faint discs.
  float sharp=(.65+pow(aSeed,3.0)*2.3)*mix(1.0,1.4,fine)*uResolution.y/850.0*3.0/max(depth,.1);
  float b=blurRadius(vec3(p.x,y,p.y),depth)*uResolution.y*mix(1.0,.5,fine);
  float size=clamp(sqrt(sharp*sharp+b*b*2.0),1.0,64.0);
  gl_PointSize=size;
  gl_Position=projectionMatrix*view;
  vCore=sharp/size;
  vDefocus=clamp(b/10.0,0.0,1.0);
  vTint=aSeed;
  // Pulse lights the suspended dust; no unrelated drift or twinkling clock.
  // The resting level keeps fine dust visible between crests; the crest lights it further.
  float rest=mix(.055,uDustLevel,fine);
  vBrightness=(rest+event.y*1.55+delayed.y*.40)*(.5+1.1*aSeed)*uIntensity*uDust;
}
`;

export const particleFragment = `
uniform sampler2D uDepthTexture;
uniform vec2 uResolution;
uniform vec3 uColorLift;
uniform vec3 uColorGlow;
varying float vBrightness;
varying float vCore;
varying float vDefocus;
varying float vTint;
void main() {
  vec2 q=gl_PointCoord-.5;
  float r=length(q)*2.0;
  // Soft-edged aperture image, with a restrained rim instead of a Gaussian dot.
  float apertureDisc=(1.0-smoothstep(.78,1.0,r))*(.85+.15*smoothstep(.35,.75,r));
  float disc=mix(exp(-dot(q,q)*32.0),apertureDisc,vDefocus);
  if(r>1.0) discard;
  float surfaceDepth=texture2D(uDepthTexture,gl_FragCoord.xy/uResolution).r;
  if(gl_FragCoord.z>surfaceDepth+.00001) discard;
  float alpha=disc*vBrightness*vCore;
  vec3 tint=mix(mix(uColorGlow,vec3(1.0),.55),mix(uColorLift,vec3(1.0),.62),vTint);
  gl_FragColor=vec4(tint,alpha);
}
`;

export const postVertex = `
varying vec2 vUv;
void main() { vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }
`;

export const postFragment = waveField + `
uniform sampler2D uColorTexture;
uniform mat4 uInverseProjection;
uniform mat4 uCameraWorld;
uniform sampler2D uDepthTexture;
varying vec2 vUv;
float linearDepth(float depth) {
  float near=.1,far=40.0;
  return near*far/(far-depth*(far-near));
}
void main() {
  float rawDepth=texture2D(uDepthTexture,vUv).r;
  float depth=linearDepth(rawDepth);
  vec4 view=uInverseProjection*vec4(vUv*2.0-1.0,rawDepth*2.0-1.0,1.0);
  vec3 world=(uCameraWorld*vec4(view.xyz/view.w,1.0)).xyz;
  float radius=blurRadius(world,depth);
  vec2 aspect=vec2(uResolution.y/uResolution.x,1.0);
  vec3 color=vec3(0.0);
  float total=0.0;
  for(int i=0;i<64;i++) {
    float f=float(i)+.5;
    float angle=f*2.39996323;
    vec2 offset=vec2(cos(angle),sin(angle))*sqrt(f/64.0)*radius*aspect*1.5;
    vec2 sampleUV=clamp(vUv+offset,vec2(.001),vec2(.999));
    float sampleDepth=linearDepth(texture2D(uDepthTexture,sampleUV).r);
    // Suppress background leaking over a closer, focused crest.
    float weight=1.0-smoothstep(.06,.6,sampleDepth-depth)*(1.0-smoothstep(.001,.008,radius));
    // Mip footprint covers gaps between aperture samples, avoiding repeated
    // sharp yarn and spiral sampling artifacts in large circles of confusion.
    float footprint=max(1.0,radius*uResolution.y*.40);
    float lod=log2(footprint);
    color+=texture2D(uColorTexture,sampleUV,lod).rgb*weight;
    total+=weight;
  }
  color/=total;
  vec3 halo=vec3(0.0);
  for(int i=0;i<12;i++) {
    float angle=float(i)*2.39996323;
    vec2 offset=vec2(cos(angle),sin(angle))*(.018+.055*sqrt((float(i)+.5)/12.0))*aspect;
    vec3 sampleColor=texture2D(uColorTexture,clamp(vUv+offset,vec2(.001),vec2(.999))).rgb;
    halo+=sampleColor*smoothstep(.48,.9,max(sampleColor.r,max(sampleColor.g,sampleColor.b)));
  }
  // Bright crest pixels bloom; a dimmer scene stays under the threshold.
  color+=halo/12.0*.14*uGlow;
  color*=1.0-.13*length((vUv-.5)*vec2(.8,1.0));
  float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
  gl_FragColor=vec4(color+(grain-.5)/255.0,1.0);
}
`;
