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
export function worldUV(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>
      vec4 wuvPos = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        wuvPos = instanceMatrix * wuvPos;
      #endif
      wuvPos = modelMatrix * wuvPos;
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
  mat.customProgramCacheKey = () => 'worldUV';
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
