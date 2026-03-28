/**
 * VRM Bot Plugin — 3D character using Three.js + @pixiv/three-vrm
 *
 * Implements BotPlugin interface. Drop in any .vrm model file.
 * Default model: /model.vrm (placed in public/ folder)
 *
 * Supports:
 * - 7 emotions: idle, happy, angry, sad, thinking, talking, surprised
 * - 3 actions: wave, nod, think (head movements)
 * - Auto blink, mouth animation, mouse follow, idle sway
 *
 * Usage:
 *   import { createVRMBot } from './components/bot/VRMBotPlugin';
 *   useBotStore.getState().setBotPlugin(createVRMBot('/model.vrm'));
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRMExpressionPresetName } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import type { BotPlugin, BotEmotion, BotAction } from '../../types/bot';

export function createVRMBot(modelUrl = '/model.vrm'): BotPlugin {
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let vrm: VRM | null = null;
  let clock: THREE.Clock | null = null;
  let animId = 0;

  // Animation state
  let blinkTimer = 0;
  let isBlinking = false;
  let isTalking = false;
  let talkPhase = 0;
  let headBob = { x: 0, y: 0, targetX: 0, targetY: 0 };

  // Mouse tracking
  let mouseX = 0;
  let mouseY = 0;
  const onMouseMove = (e: MouseEvent) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = -(e.clientY / window.innerHeight - 0.5) * 2;
  };

  function animate() {
    animId = requestAnimationFrame(animate);
    if (!vrm || !clock || !renderer || !scene || !camera) return;

    const dt = clock.getDelta();

    // ── Auto blink ──
    blinkTimer += dt;
    if (blinkTimer > 3 + Math.random() * 2) {
      blinkTimer = 0;
      isBlinking = true;
      setTimeout(() => { isBlinking = false; }, 150);
    }
    vrm.expressionManager?.setValue(VRMExpressionPresetName.Blink, isBlinking ? 1 : 0);

    // ── Talking mouth animation ──
    if (isTalking && vrm.expressionManager) {
      talkPhase += dt * 8;
      vrm.expressionManager.setValue(VRMExpressionPresetName.Aa, (Math.sin(talkPhase) + 1) * 0.3);
    }

    try {
      // ── Idle body sway ──
      const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
      if (spine) {
        spine.rotation.z = Math.sin(clock.elapsedTime * 0.5) * 0.02;
        spine.rotation.x = Math.sin(clock.elapsedTime * 0.3) * 0.01;
      }

      // ── Head follows mouse + head bob actions ──
      headBob.x += (headBob.targetX - headBob.x) * 0.1;
      headBob.y += (headBob.targetY - headBob.y) * 0.1;

      const head = vrm.humanoid?.getNormalizedBoneNode('head');
      if (head) {
        // Mouse follow
        head.rotation.y += (mouseX * 0.3 - head.rotation.y) * 0.05;
        head.rotation.x += (-mouseY * 0.2 - head.rotation.x) * 0.05;
        // Add head bob from actions
        head.rotation.x += headBob.x;
        head.rotation.z += headBob.y;
      }
    } catch {}

    vrm.update(dt);
    renderer.render(scene, camera);
  }

  return {
    mount(container: HTMLElement) {
      const size = container.clientWidth || 180;

      const canvas = document.createElement('canvas');
      canvas.style.pointerEvents = 'none';
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.cursor = 'inherit';
      container.appendChild(canvas);

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setSize(size, size);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      camera.position.set(0, 0.9, 2.2);
      camera.lookAt(0, 0.55, 0);

      // Lighting — warm palette matching NEXUS theme
      scene.add(new THREE.AmbientLight(0xffffff, 0.8));
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
      dirLight.position.set(1, 2, 2);
      scene.add(dirLight);
      const fillLight = new THREE.DirectionalLight(0xd4521a, 0.3);
      fillLight.position.set(-2, 1, -1);
      scene.add(fillLight);

      clock = new THREE.Clock();

      // Load VRM
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      loader.load(
        modelUrl,
        (gltf) => {
          vrm = gltf.userData.vrm as VRM;
          if (!vrm) return;
          VRMUtils.removeUnnecessaryVertices(gltf.scene);
          VRMUtils.removeUnnecessaryJoints(gltf.scene);
          vrm.scene.rotation.y = 0;

          // Disable spring bone debug rendering
          const sbm = (vrm as any).springBoneManager;
          if (sbm) {
            // Hide all collider debug meshes
            if (sbm.colliderGroups) {
              for (const group of sbm.colliderGroups) {
                if (group.colliders) {
                  for (const col of group.colliders) {
                    if (col.shape?._helper) col.shape._helper.visible = false;
                    if (col._helper) col._helper.visible = false;
                  }
                }
              }
            }
            // Hide all joint debug meshes
            if (sbm.joints) {
              for (const joint of sbm.joints) {
                if (joint._helper) joint._helper.visible = false;
              }
            }
          }

          // Brute force: hide EVERYTHING that isn't a SkinnedMesh
          gltf.scene.traverse((obj: any) => {
            if (obj.isMesh && !obj.isSkinnedMesh) {
              obj.visible = false;
            }
            if (obj.isLineSegments || obj.isLine) {
              obj.visible = false;
            }
          });

          scene!.add(vrm.scene);
          console.log('[VRM Bot] Loaded, expressions:', vrm.expressionManager?.expressions?.map(e => e.expressionName));
        },
        undefined,
        (err) => console.error('[VRM Bot] Load error:', err),
      );

      animate();
      window.addEventListener('mousemove', onMouseMove);
    },

    resize(newSize: number) {
      if (renderer) {
        renderer.setSize(newSize, newSize);
      }
    },

    unmount() {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
        renderer = null;
      }
      scene = null;
      camera = null;
      vrm = null;
      clock = null;
    },

    setEmotion(emotion: BotEmotion) {
      if (!vrm?.expressionManager) return;
      const m = vrm.expressionManager;

      // Reset all expressions (standard + custom)
      m.setValue(VRMExpressionPresetName.Happy, 0);
      m.setValue(VRMExpressionPresetName.Angry, 0);
      m.setValue(VRMExpressionPresetName.Sad, 0);
      m.setValue(VRMExpressionPresetName.Surprised, 0);
      m.setValue(VRMExpressionPresetName.Relaxed, 0);
      // Reset custom crab expressions (safe — no-op if not available)
      try { m.setValue('Eye_heart', 0); } catch {}
      try { m.setValue('Eye_kirakira', 0); } catch {}
      try { m.setValue('Eye_guruguru', 0); } catch {}
      try { m.setValue('Eye_hikaru_red', 0); } catch {}
      try { m.setValue('Eye_hikaru_white', 0); } catch {}

      switch (emotion) {
        case 'happy':
          m.setValue(VRMExpressionPresetName.Happy, 1);
          try { m.setValue('Eye_kirakira', 1); } catch {} // Sparkle eyes!
          break;
        case 'angry':
          m.setValue(VRMExpressionPresetName.Angry, 1);
          try { m.setValue('Eye_hikaru_red', 1); } catch {} // Red glow
          break;
        case 'sad':
          m.setValue(VRMExpressionPresetName.Sad, 1);
          break;
        case 'thinking':
          m.setValue(VRMExpressionPresetName.Sad, 0.3);
          try { m.setValue('Eye_guruguru', 0.5); } catch {} // Spinning eyes
          break;
        case 'talking':
          m.setValue(VRMExpressionPresetName.Happy, 0.3);
          try { m.setValue('Eye_hikaru_white', 0.5); } catch {} // White glow
          break;
        case 'surprised':
          m.setValue(VRMExpressionPresetName.Surprised, 1);
          try { m.setValue('Eye_heart', 1); } catch {} // Heart eyes!
          break;
        case 'idle':
        default:
          break;
      }
    },

    startTalking() {
      isTalking = true;
      talkPhase = 0;
    },

    stopTalking() {
      isTalking = false;
      if (vrm?.expressionManager) {
        vrm.expressionManager.setValue(VRMExpressionPresetName.Aa, 0);
      }
    },

    triggerAction(action: BotAction) {
      switch (action) {
        case 'wave':
          // Head tilt left-right
          headBob.targetX = 0.15;
          setTimeout(() => { headBob.targetX = -0.15; }, 300);
          setTimeout(() => { headBob.targetX = 0; }, 600);
          break;

        case 'nod':
          // Head nod up-down
          headBob.targetX = -0.1;
          setTimeout(() => { headBob.targetX = 0.1; }, 200);
          setTimeout(() => { headBob.targetX = -0.08; }, 400);
          setTimeout(() => { headBob.targetX = 0; }, 600);
          break;

        case 'think':
          // Head tilt + pause
          headBob.targetY = 0.1;
          setTimeout(() => { headBob.targetY = -0.05; }, 500);
          setTimeout(() => { headBob.targetY = 0; }, 2000);
          break;
      }
    },
  };
}
