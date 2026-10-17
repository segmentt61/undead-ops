// Photo-scanned PBR materials (CC0, ambientCG) and the HDRI used for reflections (CC0, Poly Haven).
// Textures are created at once and fill in when the files arrive; preload() waits for all of them.
// World surfaces use world-space UVs, so a texture runs on across wall cells without seams.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// metres covered by one repeat of each texture
export const PBR = {
  bricksOld: { size: 1.8 }, bricksB: { size: 1.8 }, concrete: { size: 3, rough: 0.88 }, plaster: { size: 2.5 },
  tilesDirty: { size: 1.2 }, tilesWhite: { size: 1.2 }, checker: { size: 1.2, rough: 0.5 }, stoneTiles: { size: 2 },
  woodOld: { size: 2.2 }, planks: { size: 2 }, corrugated: { size: 2 }, ceiling: { size: 2.4 },
  asphalt: { size: 3, rough: 0.92 }, gravel: { size: 2.5 },
};

let lowRes = false;
const loader = new THREE.TextureLoader();
const cache = new Map();
const pending = [];

/** Phones load the 512 px versions. */
export function setLowRes(on) { lowRes = on; }

function tex(key, kind) {
  const id = `${key}/${kind}`;
  if (cache.has(id)) return cache.get(id);
  const url = `/assets/pbr/${key}/${lowRes ? 'lo/' : ''}${kind}.jpg`;
  let done;
  pending.push(new Promise((r) => { done = r; }));
  const t = loader.load(url, () => done(), undefined, () => done());
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = lowRes ? 2 : 8;
  if (kind === 'c') t.colorSpace = THREE.SRGBColorSpace;
  cache.set(id, t);
  return t;
}

/** A surface record compatible with surfaces.js (map, normalMap, roughnessMap). */
export function pbrSurface(key) {
  const rough = PBR[key].rough;
  return {
    map: tex(key, 'c'), normalMap: tex(key, 'n'), roughnessMap: rough ? null : tex(key, 'r'),
    roughness: rough || 1, metalness: key === 'corrugated' ? 0.35 : 0, normalScale: new THREE.Vector2(1, 1), pbr: key, size: PBR[key].size,
  };
}

/** Wait for every texture requested so far (used behind the loading screen). */
export async function preloadAll(onProgress) {
  for (const k of Object.keys(PBR)) pbrSurface(k);
  let n = 0;
  await Promise.all(pending.map((p) => p.then(() => onProgress && onProgress(++n / pending.length))));
}

/**
 * Replace a material's UVs with world-space ones: vertical faces use (x or z, y), floors and
 * ceilings use (x, z). Works for plain and instanced meshes.
 */
export function worldUV(mat, { wet = 0 } = {}) {
  mat.onBeforeCompile = (sh) => {
    if (wet > 0) {
      // puddles and damp patches: large-scale noise in world space lowers roughness and darkens,
      // so lamps leave sharp highlights and reflections on the floor
      sh.vertexShader = 'varying vec2 vWetXZ;\n' + sh.vertexShader;
      sh.fragmentShader = `varying vec2 vWetXZ;
        float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float wNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y); }
      ` + sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float wn = wNoise(vWetXZ * 0.33) * 0.65 + wNoise(vWetXZ * 1.7 + 9.0) * 0.35;
        float wetK = smoothstep(0.56, 0.7, wn) * ${wet.toFixed(2)};
        roughnessFactor = mix(roughnessFactor, 0.07, wetK);
        diffuseColor.rgb *= 1.0 - 0.38 * wetK;`);
    }
    sh.vertexShader = sh.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>
      vec4 wuvPos = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        wuvPos = instanceMatrix * wuvPos;
      #endif
      wuvPos = modelMatrix * wuvPos;
      ${wet > 0 ? 'vWetXZ = wuvPos.xz;' : ''}
      vec3 wuvN = abs( normalize( mat3( modelMatrix ) * objectNormal ) );
      vec2 wuv = wuvN.y > 0.5 ? vec2( wuvPos.x, -wuvPos.z ) : ( wuvN.x > 0.5 ? vec2( wuvPos.z, wuvPos.y ) : vec2( wuvPos.x, wuvPos.y ) );
      #ifdef USE_MAP
        vMapUv = ( mapTransform * vec3( wuv, 1.0 ) ).xy;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = ( normalMapTransform * vec3( wuv, 1.0 ) ).xy;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = ( roughnessMapTransform * vec3( wuv, 1.0 ) ).xy;
      #endif`);
  };
  mat.customProgramCacheKey = () => 'worldUV' + (wet > 0 ? 'wet' + wet : '');
  return mat;
}

let envTex = null;
/** Indoor HDRI for reflections; falls back to the given texture until it has loaded. */
export function loadEnvironment(renderer, onReady) {
  if (envTex) { onReady(envTex); return; }
  new RGBELoader().load('/assets/pbr/env.hdr', (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    envTex = pm.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pm.dispose();
    onReady(envTex);
  });
}

/**
 * Like worldUV, but in the object's own space (for things that move, like the weapon you hold).
 * `scale` converts the mesh's geometry units into texture repeats.
 */
export function objectUV(mat, scale) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uObjUV = { value: scale };
    sh.vertexShader = 'uniform float uObjUV;\n' + sh.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>
      vec3 ouvN = abs( normalize( objectNormal ) );
      vec2 ouv = ( ouvN.y > 0.5 ? transformed.xz : ( ouvN.x > 0.5 ? transformed.zy : transformed.xy ) ) * uObjUV;
      #ifdef USE_MAP
        vMapUv = ( mapTransform * vec3( ouv, 1.0 ) ).xy;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = ( normalMapTransform * vec3( ouv, 1.0 ) ).xy;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = ( roughnessMapTransform * vec3( ouv, 1.0 ) ).xy;
      #endif`);
  };
  mat.customProgramCacheKey = () => 'objectUV';
  return mat;
}

let detail = null;
/** Worn metal / polymer detail: fine scratches and micro-noise as a normal map plus a roughness map. */
export function wearDetail() {
  if (detail) return detail;
  const S = 512;
  const h = document.createElement('canvas'); h.width = h.height = S;
  const hx = h.getContext('2d');
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, S, S);
  const r = document.createElement('canvas'); r.width = r.height = S;
  const rx = r.getContext('2d');
  rx.fillStyle = '#8c8c8c'; rx.fillRect(0, 0, S, S);
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // micro noise
  const img = hx.getImageData(0, 0, S, S), rimg = rx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 22;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 128 + n;
    const rn = 140 + (rnd() - 0.5) * 40;
    rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rn;
  }
  hx.putImageData(img, 0, 0); rx.putImageData(rimg, 0, 0);
  // scratches: grooves in the height map, shinier (lower roughness) lines in the roughness map
  for (let i = 0; i < 260; i++) {
    const x0 = rnd() * S, y0 = rnd() * S, a = rnd() * Math.PI, len = 10 + rnd() * 70;
    const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    hx.strokeStyle = `rgba(40,40,40,${0.3 + rnd() * 0.4})`; hx.lineWidth = 0.6 + rnd();
    hx.beginPath(); hx.moveTo(x0, y0); hx.lineTo(x1, y1); hx.stroke();
    rx.strokeStyle = `rgba(60,60,60,${0.4 + rnd() * 0.4})`; rx.lineWidth = 0.8 + rnd();
    rx.beginPath(); rx.moveTo(x0, y0); rx.lineTo(x1, y1); rx.stroke();
  }
  // smudges and grime patches (rougher)
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S, y = rnd() * S, rr = 10 + rnd() * 50;
    const g = rx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, `rgba(230,230,230,${0.25 + rnd() * 0.3})`); g.addColorStop(1, 'rgba(230,230,230,0)');
    rx.fillStyle = g; rx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // height -> normal
  const src = hx.getImageData(0, 0, S, S).data;
  const nc = document.createElement('canvas'); nc.width = nc.height = S;
  const nx = nc.getContext('2d'); const out = nx.createImageData(S, S);
  const H = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2;
    const l = Math.hypot(dx, dy, 1), k = (y * S + x) * 4;
    out.data[k] = (-dx / l * 0.5 + 0.5) * 255; out.data[k + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[k + 3] = 255;
  }
  nx.putImageData(out, 0, 0);
  const tn = new THREE.CanvasTexture(nc), tr = new THREE.CanvasTexture(r);
  for (const t of [tn, tr]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  detail = { normalMap: tn, roughnessMap: tr };
  return detail;
}
