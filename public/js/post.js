// Post-processing chain: ambient occlusion, first-person weapon overlay, bloom, colour grading.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';

// Draws the first-person weapon on top of the current image with its own depth.
class OverlayPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
  }
  render(renderer, writeBuffer, readBuffer) {
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = ac;
  }
}

export const QUALITY = {
  high:   { label: 'High',   lights: 6, pixelRatio: 1.5, shadows: true,  shadowLights: 2, ao: true,  bloom: true,  msaa: 4, post: true, wet: true },
  medium: { label: 'Medium', lights: 5, pixelRatio: 1.25, shadows: false, ao: false, bloom: true,  msaa: 2, post: true, wet: true },
  low:    { label: 'Low',    lights: 3, pixelRatio: 1.25, shadows: false, ao: false, bloom: false, msaa: 2, post: true },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    desat: { value: 0 },
    hurt: { value: 0 },
    vignette: { value: 0.55 },
    grain: { value: 0.025 },
    texel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    sharpen: { value: 0.35 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time, desat, hurt, vignette, grain, sharpen;
    uniform vec2 texel;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r = dot(c, c);
      float ca = 0.006 * r + hurt * 0.006;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ca).b;
      // light sharpening (unsharp mask) so textures read crisp, like modern TAA-sharpened games
      vec3 nb = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb
              + texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;
      col += (col - nb * 0.25) * sharpen;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // warm highlights, cool teal shadows
      col *= mix(vec3(0.93, 1.0, 1.08), vec3(1.07, 1.0, 0.9), smoothstep(0.05, 0.8, l));
      col = mix(vec3(l), col, 1.1 - desat);
      col = mix(col, vec3(l * 1.2, l * 0.25, l * 0.2), hurt * 0.35);
      col *= 1.0 - vignette * smoothstep(0.08, 0.6, r * 1.8);
      col += (hash(vUv * 1000.0 + fract(time) * 37.0) - 0.5) * grain * (0.4 + l);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

// Replaces NaN / infinite pixels (from any bad geometry or shader) and clamps extreme HDR values
// so the bloom blur can never smear them into black rectangles.
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 48.0), 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.q = quality;
    this.composer = null;
    this.time = 0;
  }

  setup(scene, camera, viewScene, viewCam) {
    // free the previous pipeline's render targets (every new map or menu visit rebuilds it)
    if (this.composer) {
      for (const pass of this.composer.passes) pass.dispose?.();
      this.composer.dispose();
      this.composer = null;
    }
    this.scene = scene;
    this.camera = camera;
    this.viewScene = viewScene;
    this.viewCam = viewCam;
    if (!this.q.post) { this.composer = null; return; }
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.q.msaa });
    const composer = new EffectComposer(r, rt);
    composer.setPixelRatio(r.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);

    composer.addPass(new RenderPass(scene, camera));

    if (this.q.ao) {
      const ao = new GTAOPass(scene, camera, size.x, size.y);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.85;
      ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.5, thickness: 1.2, scale: 1.2, samples: 8 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
      // keep transparent effects (light cones, dust, particles) out of the AO normal pass
      const render = ao.render.bind(ao);
      const hidden = [];
      let frame = 0, effects = [];
      ao.render = (...args) => {
        // re-scan for transparent effects twice a second instead of every frame
        if (frame++ % 30 === 0) {
          effects = [];
          scene.traverse((o) => { if (o.isPoints || o.isSprite || o.isLine || (o.material && o.material.transparent)) effects.push(o); });
        }
        for (const o of effects) if (o.visible) { o.visible = false; hidden.push(o); }
        render(...args);
        for (const o of hidden) o.visible = true;
        hidden.length = 0;
      };
      // ambient occlusion at half resolution
      const setSize = ao.setSize.bind(ao);
      ao.setSize = (w, h) => setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
      ao.setSize(size.x, size.y);
      composer.addPass(ao);
      this.ao = ao;
    }

    this.vmPass = new OverlayPass(viewScene, viewCam);
    composer.addPass(this.vmPass);
    composer.addPass(new ShaderPass(SanitizeShader));

    if (this.q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.55, 0.92);
      composer.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    this.updateTexel();
    composer.addPass(this.grade);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  setSize(w, h, pr) {
    if (!this.composer) return;
    if (pr) this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.updateTexel();
  }

  updateTexel() {
    if (!this.grade) return;
    const sz = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.grade.uniforms.texel.value.set(1 / sz.x, 1 / sz.y);
  }

  render(dt, showViewmodel, { desat = 0, hurt = 0 } = {}) {
    this.time += dt;
    if (!this.composer) {
      const r = this.renderer;
      r.render(this.scene, this.camera);
      if (showViewmodel) {
        r.autoClear = false;
        r.clearDepth();
        r.render(this.viewScene, this.viewCam);
        r.autoClear = true;
      }
      return;
    }
    this.vmPass.enabled = showViewmodel;
    const u = this.grade.uniforms;
    u.time.value = this.time;
    u.desat.value = desat;
    u.hurt.value = hurt;
    this.composer.render(dt);
  }
}
