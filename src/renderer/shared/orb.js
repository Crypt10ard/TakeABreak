import * as THREE from 'three';
import { WARM } from './palettes.js';

// Colours are authored in sRGB and should come out exactly like that.
THREE.ColorManagement.enabled = false;

// 3D simplex noise - Ian McEwan, Ashima Arts / Stefan Gustavson (MIT).
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

const ORB_VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uFreq;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vDir;
varying float vDisp;
${NOISE}
float field(vec3 p) {
  float t = uTime;
  float n = snoise(p * uFreq + vec3(0.0, t * 0.19, t * 0.12));
  n += 0.22 * snoise(p * uFreq * 1.9 + vec3(t * 0.15, -t * 0.1, 0.0));
  return n;
}
vec3 displaced(vec3 dir) {
  return dir * (1.0 + field(dir) * uAmp);
}
void main() {
  vec3 dir = normalize(position);
  // Rebuild the normal of the displaced surface from two neighbours.
  vec3 axis = abs(dir.y) > 0.98 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 t1 = normalize(cross(dir, axis));
  vec3 t2 = normalize(cross(dir, t1));
  float e = 0.012;
  vec3 p0 = displaced(dir);
  vec3 p1 = displaced(normalize(dir + t1 * e));
  vec3 p2 = displaced(normalize(dir + t2 * e));
  vec3 n = normalize(cross(p1 - p0, p2 - p0));
  if (dot(n, dir) < 0.0) n = -n;
  vDisp = length(p0) - 1.0;
  vDir = dir;
  vec4 mv = modelViewMatrix * vec4(p0, 1.0);
  vView = mv.xyz;
  vNormal = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * mv;
}
`;

const ORB_FRAG = /* glsl */ `
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uWarm;
uniform float uEnergy;
uniform float uTime;
uniform float uOpacity;
uniform float uGlow;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vDir;
varying float vDisp;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vView);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.3);

  // Palette flowing across the surface.
  float g1 = 0.5 + 0.5 * sin(vDir.y * 2.3 + vDisp * 7.0 + uTime * 0.22);
  float g2 = 0.5 + 0.5 * sin(vDir.x * 2.1 - vDir.z * 1.6 - uTime * 0.16);
  vec3 c = mix(uC1, uC2, smoothstep(0.1, 0.9, g1));
  c = mix(c, uC3, g2 * 0.62);
  c = mix(c, uWarm, uEnergy * 0.85);

  // Deep body with a soft key light, so it reads as a volume, not a sticker.
  vec3 L = normalize(vec3(-0.45, 0.65, 0.75));
  float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
  vec3 body = c * (0.1 + 0.55 * wrap * wrap);
  // Light scattering inside: the centre glows a little, like frosted glass.
  body += c * pow(ndv, 3.0) * 0.18;
  body += c * smoothstep(0.02, -0.1, vDisp) * 0.1;

  // Coloured rim light.
  vec3 rim = mix(uC2, uC3, 0.5 + 0.5 * vDir.y);
  rim = mix(rim, uWarm, uEnergy * 0.6);
  vec3 col = body + rim * fres * 1.3 * uGlow + c * fres * 0.3;

  // Pearl sheen: one broad soft highlight plus a faint counter light.
  vec3 H = normalize(L + V);
  float spec = clamp(dot(N, H), 0.0, 1.0);
  col += pow(spec, 28.0) * 0.28 + pow(spec, 120.0) * 0.35;
  col += pow(clamp(dot(N, normalize(vec3(0.6, -0.4, 0.7) + V)), 0.0, 1.0), 24.0) * 0.1 * rim;

  gl_FragColor = vec4(col, uOpacity);
}
`;

const HALO_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const HALO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float d = length(p) * 2.0;
  float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.8);
  vec3 col = mix(uColor, uColor2, smoothstep(-0.5, 0.5, p.x + p.y));
  gl_FragColor = vec4(col * a * uOpacity, 1.0);
}
`;

const DUST_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
varying float vAlpha;
void main() {
  vec3 p = position;
  float t = uTime * 0.12 + aSeed * 6.2831;
  p.x += sin(t * 1.3 + aSeed * 11.0) * 0.18;
  p.y += cos(t * 0.9 + aSeed * 7.0) * 0.18;
  p.z += sin(t * 0.7 + aSeed * 3.0) * 0.12;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * uPixelRatio * (0.35 + aSeed) * (5.0 / -mv.z);
  vAlpha = 0.2 + 0.8 * (0.5 + 0.5 * sin(uTime * (0.5 + aSeed * 1.4) + aSeed * 40.0));
  gl_Position = projectionMatrix * mv;
}
`;

const DUST_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uColor * a * vAlpha * uOpacity, 1.0);
}
`;

const toColor = (hex) => new THREE.Color(hex);
const WHITE = new THREE.Color('#ffffff');

// Pure additive light that leaves alpha untouched: glows add onto whatever is behind the
// (transparent) canvas instead of turning into dark rectangles.
const GLOW = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendEquationAlpha: THREE.AddEquation,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
};

/**
 * The breathing orb. Everything that moves is driven through `orb.params`,
 * which GSAP (or anything else) can tween directly.
 */
export function createOrb(canvas, options = {}) {
  const opts = { colors: ['#9BE7C4', '#6FB7FF', '#C9A8FF'], particles: 420, maxDpr: 2, pointer: true, ...options };

  const params = {
    x: 0, // centre, fraction of viewport width (-0.5 .. 0.5)
    y: 0, // centre, fraction of viewport height, up is positive
    size: 0.5, // diameter as a fraction of the viewport height
    breath: 0, // 0 .. 1, up to +22 % size
    energy: 0, // 0 fresh .. 1 overdue (drifts towards warm)
    amp: 0.085, // surface displacement
    speed: 1, // flow speed of the surface
    opacity: 1,
    halo: 0.55,
    dust: 1,
    squash: 0, // 0 .. 1, vertical squash (blinking)
    spin: 1,
  };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    console.warn('WebGL unavailable, orb disabled', err);
    canvas.classList.add('gl--fallback');
    return { params, fallback: true, setColors() {}, start() {}, stop() {}, dispose() {} };
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  const [c1, c2, c3] = opts.colors.map(toColor);
  const target = { uC1: c1.clone(), uC2: c2.clone(), uC3: c3.clone() };

  const orbUniforms = {
    uTime: { value: 0 },
    uAmp: { value: params.amp },
    uFreq: { value: 0.95 },
    uC1: { value: c1 },
    uC2: { value: c2 },
    uC3: { value: c3 },
    uWarm: { value: toColor(WARM) },
    uEnergy: { value: 0 },
    uOpacity: { value: 1 },
    uGlow: { value: 1 },
  };
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(1, 180, 140),
    new THREE.ShaderMaterial({ vertexShader: ORB_VERT, fragmentShader: ORB_FRAG, uniforms: orbUniforms, transparent: true }),
  );

  const haloUniforms = { uColor: { value: c1.clone() }, uColor2: { value: c3.clone() }, uOpacity: { value: params.halo } };
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({ vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, uniforms: haloUniforms, ...GLOW, depthTest: false }),
  );
  // Same depth as the orb (no parallax drift), drawn first so the orb covers its centre.
  halo.renderOrder = -1;

  const dustUniforms = {
    uTime: { value: 0 },
    uSize: { value: 5.5 },
    uPixelRatio: { value: 1 },
    uColor: { value: c1.clone().lerp(WHITE, 0.55) },
    uOpacity: { value: 0.8 },
  };
  const dustGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(opts.particles * 3);
  const seeds = new Float32Array(opts.particles);
  for (let i = 0; i < opts.particles; i++) {
    const r = 1.5 + Math.pow(Math.random(), 0.7) * 4.2;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta) * 1.6;
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi) * 0.6 - 1.0;
    seeds[i] = Math.random();
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.ShaderMaterial({ vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: dustUniforms, ...GLOW }),
  );

  const group = new THREE.Group();
  group.add(halo, orb);
  scene.add(dust, group);

  // Pointer: parallax, and a little extra life when the cursor comes close.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, near: 0, tnear: 0 };
  const onPointer = (e) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    const cx = (params.x + 0.5) * window.innerWidth;
    const cy = (0.5 - params.y) * window.innerHeight;
    const radius = (params.size * window.innerHeight) / 2;
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
    pointer.tnear = Math.max(0, 1 - Math.max(0, dist - radius * 0.6) / (radius * 1.6 + 1));
  };
  if (opts.pointer) window.addEventListener('pointermove', onPointer, { passive: true });

  let view = { w: 1, h: 1 };
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dustUniforms.uPixelRatio.value = dpr;
    const vh = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    view = { w: vh * camera.aspect, h: vh };
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let flow = 0;
  let spin = 0;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    pointer.near += (pointer.tnear - pointer.near) * 0.06;

    flow += dt * params.speed * (1 + pointer.near * 0.9);
    spin += dt * 0.06 * params.spin;
    orbUniforms.uTime.value = flow;
    orbUniforms.uAmp.value = params.amp * (1 + pointer.near * 0.45) * (1 + params.breath * 0.25);
    orbUniforms.uEnergy.value = params.energy;
    orbUniforms.uOpacity.value = params.opacity;
    orbUniforms.uGlow.value = 1 + pointer.near * 0.4;
    dustUniforms.uTime.value = t;
    dustUniforms.uOpacity.value = 0.8 * params.dust * Math.min(1, params.opacity * 1.5);
    haloUniforms.uOpacity.value = params.halo * params.opacity * (0.8 + params.breath * 0.5);

    // Glide towards a new palette.
    for (const key of ['uC1', 'uC2', 'uC3']) orbUniforms[key].value.lerp(target[key], 0.045);
    haloUniforms.uColor.value.copy(orbUniforms.uC1.value);
    haloUniforms.uColor2.value.copy(orbUniforms.uC3.value);
    dustUniforms.uColor.value.copy(orbUniforms.uC1.value).lerp(WHITE, 0.55);

    const radius = (params.size * view.h) / 2 / (1 + params.amp);
    const scale = radius * (1 + params.breath * 0.22);
    group.position.set(params.x * view.w + pointer.x * 0.08, params.y * view.h + pointer.y * 0.06, 0);
    orb.scale.set(scale, scale * (1 - params.squash * 0.92), scale);
    orb.rotation.y = spin + pointer.x * 0.35;
    orb.rotation.x = -pointer.y * 0.25 + Math.sin(t * 0.1) * 0.1;
    halo.scale.setScalar(scale * 4.2);
    dust.rotation.y = t * 0.012 + pointer.x * 0.05;
    dust.rotation.x = pointer.y * 0.03;
    dust.position.set(group.position.x * 0.3, group.position.y * 0.3, 0);

    group.visible = params.opacity > 0.001;
    renderer.render(scene, camera);
  }

  let running = false;
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    renderer.setAnimationLoop(frame);
  }
  function stop() {
    running = false;
    renderer.setAnimationLoop(null);
  }
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());

  start();

  return {
    params,
    fallback: false,
    setColors(colors) {
      const [a, b, c] = colors.map(toColor);
      target.uC1.copy(a);
      target.uC2.copy(b);
      target.uC3.copy(c);
    },
    start,
    stop,
    dispose() {
      stop();
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.dispose();
    },
  };
}
