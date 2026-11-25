import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildPresetAnimationClip, compileCustomAnimationClip } from './animations';
import { ArmRestBasis } from './autoRigStaticModel';
import { optimizeGlbSparseMorphs } from './glbSparse';
import {
  createPresetRigAsset,
  createStudioRigMaterial,
  loadCustomRigAsset,
  loadSampleBoyRigAsset,
  LoadedRigAsset,
} from './models';
import {
  applyRendererQualitySettings,
  detectWebpSupport,
} from './lodOptimizer';
import { PerformanceDirector } from './performer';
import { buildRigChannelBindings } from './rigMapper';
import { SkeletonVisualManager } from './skeletonVisuals';
import {
  applyWeightHeatmapColors,
  computeAutoSkinWeights,
  computeBoneInfluenceStats,
  paintVertexWeights,
  rebindSkeleton,
} from './skinning';
import { StateMachineSnapshot } from './stateMachine';
import {
  AnimationId,
  AnimationPresetId,
  BoneNodeInfo,
  CameraPresetId,
  EmotionId,
  FacialExpressionPresetId,
  FacialExpressionState,
  GestureCueId,
  HandPoseId,
  KeyframePose,
  PerformanceScript,
  PresetModelId,
  QualityPreset,
  RigChannelSummary,
  RigStats,
  StageSettings,
  StudioMode,
  TransformMode,
  TransformSpace,
  WeightBrushSettings,
} from './types';

export interface RigViewportProps {
  mode: StudioMode;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  selectedBoneIndex: number;
  stageSettings: StageSettings;
  brushSettings: WeightBrushSettings;
  animationPreset: AnimationPresetId;
  customKeyframes: KeyframePose[];
  isPlaying: boolean;
  playbackSpeed: number;
  loopAnimation: boolean;
  onBonesUpdated: (
    bones: BoneNodeInfo[],
    stats: RigStats,
    channelSummary: RigChannelSummary,
  ) => void;
  onSelectBone: (index: number) => void;
  onAnimationTimeUpdate: (time: number, duration: number) => void;
  onSpeakingStateChange: (speaking: boolean) => void;
  onPerformanceStateChange?: (snap: StateMachineSnapshot) => void;
  onToast: (message: string) => void;
}

export interface RigViewportHandle {
  loadPreset: (preset: PresetModelId) => void;
  loadCustomFile: (file: File, template: 'biped' | 'quadruped') => Promise<void>;
  setBoneLocalTransform: (
    boneIndex: number,
    pos?: [number, number, number],
    rotDeg?: [number, number, number],
    scale?: [number, number, number],
  ) => void;
  resetSelectedBone: () => void;
  resetFullPose: () => void;
  rebindAndAutoWeight: (falloff: number) => void;
  addChildBone: (parentIndex: number) => void;
  setCameraPreset: (preset: CameraPresetId) => void;
  scrubAnimation: (time: number) => void;
  captureKeyframe: (time: number) => KeyframePose | null;
  exportGLB: () => void;
  unlockAudio: () => void;
  performScript: (script: PerformanceScript) => Promise<void>;
  stopPerformance: () => void;
  setPerformanceCue: (
    gesture: GestureCueId,
    handPose: HandPoseId,
    emotion: EmotionId,
  ) => void;
  triggerLibraryAnimation: (
    animId: AnimationId,
    facialExpr?: FacialExpressionPresetId,
    durationSec?: number,
  ) => void;
  setFacialExpression: (exprId: FacialExpressionPresetId) => void;
  setInteractionState: (state: 'idle' | 'listening' | 'thinking') => void;
  setPerformanceTuning: (speed: number, intensity: number) => void;
  getRecentAnimations: () => AnimationId[];
  setManualExpressionOverrides: (overrides: Partial<FacialExpressionState>) => void;
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function findMirrorBoneName(name: string): string | null {
  if (name.startsWith('Left')) return 'Right' + name.slice(4);
  if (name.startsWith('Right')) return 'Left' + name.slice(5);
  if (name.startsWith('FrontLeft')) return 'FrontRight' + name.slice(9);
  if (name.startsWith('FrontRight')) return 'FrontLeft' + name.slice(10);
  if (name.startsWith('BackLeft')) return 'BackRight' + name.slice(8);
  if (name.startsWith('BackRight')) return 'BackLeft' + name.slice(9);
  if (name.includes('.L')) return name.replace('.L', '.R');
  if (name.includes('.R')) return name.replace('.R', '.L');
  if (name.includes('_L')) return name.replace('_L', '_R');
  if (name.includes('_R')) return name.replace('_R', '_L');
  return null;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
  grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.24)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _normalMatrix = new THREE.Matrix3();
const _upVec = new THREE.Vector3(0, 0, 1);

export const RigViewport = forwardRef<RigViewportHandle, RigViewportProps>(function RigViewport(
  props,
  ref,
) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);

  const propsRef = useRef(props);
  propsRef.current = props;

  const studioRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    keyLight: THREE.DirectionalLight;
    orbitControls: OrbitControls;
    transformControls: TransformControls;
    skeletonVisuals: SkeletonVisualManager;
    director: PerformanceDirector;
    brushRing: THREE.Mesh;
    gridHelper: THREE.GridHelper;
    asset: LoadedRigAsset | null;
    loadedQuality: QualityPreset;
    lastPerfKey: string;
    mixer: THREE.AnimationMixer | null;
    activeAction: THREE.AnimationAction | null;
    activeClip: THREE.AnimationClip | null;
    isSoftwareGl: boolean;
    camTargetPos: THREE.Vector3 | null;
    camTargetLook: THREE.Vector3 | null;
    requestRender: () => void;
    emitBoneList: () => void;
    refreshHeatmap: () => void;
    rebuildAnimation: () => void;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0f14);
    scene.fog = new THREE.FogExp2(0x0d0f14, 0.045);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.05, 80);
    camera.position.set(1.95, 1.58, 2.75);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    const hemiLight = new THREE.HemisphereLight(0xcbd5e1, 0x1e293b, 0.78);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    keyLight.position.set(3.2, 5.2, 3.6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 14;
    keyLight.shadow.camera.left = -2.4;
    keyLight.shadow.camera.right = 2.4;
    keyLight.shadow.camera.top = 2.8;
    keyLight.shadow.camera.bottom = -1.2;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    applyRendererQualitySettings(
      renderer,
      keyLight,
      propsRef.current.stageSettings.qualityPreset,
      isSoftwareGl,
    );

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 1.15);
    rimLight.position.set(-3.4, 2.6, -3.2);
    scene.add(rimLight);

    const floorGeo = new THREE.CircleGeometry(7.5, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x11141b,
      roughness: 0.88,
      metalness: 0.06,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.004;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const contactTex = createContactShadowTexture();
    const contactGeo = new THREE.PlaneGeometry(1.9, 1.9);
    const contactMat = new THREE.MeshBasicMaterial({
      map: contactTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
    });
    const contactShadow = new THREE.Mesh(contactGeo, contactMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.001;
    scene.add(contactShadow);

    const gridHelper = new THREE.GridHelper(10, 24, 0x334155, 0x1e2430);
    gridHelper.position.y = 0.003;
    const gridMats = Array.isArray(gridHelper.material)
      ? gridHelper.material
      : [gridHelper.material];
    gridMats.forEach((m) => {
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      m.polygonOffsetUnits = -1;
    });
    scene.add(gridHelper);

    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.target.set(0, 1.05, 0);
    orbitControls.enableDamping = !isSoftwareGl;
    orbitControls.dampingFactor = 0.07;
    orbitControls.minDistance = 0.55;
    orbitControls.maxDistance = 12;
    orbitControls.maxPolarAngle = Math.PI * 0.54;
    orbitControls.update();

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setMode('rotate');
    transformControls.setSpace('local');
    transformControls.setSize(0.74);
    scene.add(transformControls.getHelper());

    const skeletonVisuals = new SkeletonVisualManager();
    scene.add(skeletonVisuals.group);

    const director = new PerformanceDirector();

    const brushGeo = new THREE.RingGeometry(0.92, 1.0, 32);
    const brushMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    const brushRing = new THREE.Mesh(brushGeo, brushMat);
    brushRing.visible = false;
    brushRing.renderOrder = 1000;
    scene.add(brushRing);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    let lastClockMs = performance.now();
    const startMs = performance.now();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const emitBoneList = () => {
      const st = studioRef.current;
      if (!st || !st.asset) return;
      const { skinnedMesh, bones, name, isCustomMesh, allMeshes, bindings } = st.asset;
      const { counts, averages } = computeBoneInfluenceStats(skinnedMesh.geometry, bones.length);

      const boneIndexMap = new Map<THREE.Bone, number>();
      bones.forEach((b, idx) => boneIndexMap.set(b, idx));

      const infos: BoneNodeInfo[] = bones.map((b, idx) => {
        const parentIdx =
          b.parent && (b.parent as THREE.Bone).isBone
            ? (boneIndexMap.get(b.parent as THREE.Bone) ?? -1)
            : -1;
        let depth = 0;
        let cur: THREE.Object3D | null = b.parent;
        while (cur && (cur as THREE.Bone).isBone) {
          depth++;
          cur = cur.parent;
        }
        _euler.setFromQuaternion(b.quaternion, 'XYZ');
        return {
          index: idx,
          name: b.name,
          parentIndex: parentIdx,
          depth,
          mirrorName: findMirrorBoneName(b.name),
          localPosition: [b.position.x, b.position.y, b.position.z],
          localRotationDeg: [
            THREE.MathUtils.radToDeg(_euler.x),
            THREE.MathUtils.radToDeg(_euler.y),
            THREE.MathUtils.radToDeg(_euler.z),
          ],
          localScale: [b.scale.x, b.scale.y, b.scale.z],
          vertexInfluenceCount: counts[idx] ?? 0,
          averageWeight: averages[idx] ?? 0,
        };
      });

      let totalVerts = 0;
      let totalTris = 0;
      for (const m of allMeshes) {
        const p = m.geometry.attributes.position;
        const idx = m.geometry.index;
        if (p) totalVerts += p.count;
        if (idx) totalTris += idx.count / 3;
        else if (p) totalTris += p.count / 3;
      }

      propsRef.current.onBonesUpdated(
        infos,
        {
          modelName: name,
          vertexCount: totalVerts,
          triangleCount: Math.round(totalTris),
          boneCount: bones.length,
          isCustomMesh,
          qualityPreset: propsRef.current.stageSettings.qualityPreset,
          webpSupported: detectWebpSupport(),
        },
        bindings.summary,
      );
    };

    const refreshHeatmap = () => {
      const st = studioRef.current;
      if (!st || !st.asset) return;
      const isWeights = propsRef.current.mode === 'weights';
      applyWeightHeatmapColors(
        st.asset.skinnedMesh.geometry,
        propsRef.current.selectedBoneIndex,
        isWeights,
      );
    };

    const rebuildAnimation = () => {
      const st = studioRef.current;
      if (!st || !st.asset) return;
      const { animationPreset, customKeyframes, loopAnimation } = propsRef.current;

      if (st.activeAction) {
        st.activeAction.stop();
        st.activeAction = null;
      }
      if (!st.mixer) {
        st.mixer = new THREE.AnimationMixer(st.asset.rootObject);
      }
      st.mixer.stopAllAction();

      let clip: THREE.AnimationClip | null = null;
      const armBasis = st.asset.rootObject.userData.armRestBasis as ArmRestBasis | undefined;
      const pelvisRestPos = st.asset.restPositions.get('Pelvis');
      if (pelvisRestPos) {
        const pelvisBone = st.asset.bones.find((b) => b.name === 'Pelvis');
        if (pelvisBone) pelvisBone.position.copy(pelvisRestPos);
      }
      if (animationPreset === 'custom') {
        clip = compileCustomAnimationClip(customKeyframes, st.asset.bones);
      } else if (animationPreset !== 'none') {
        clip = buildPresetAnimationClip(animationPreset, st.asset.bones, armBasis, pelvisRestPos);
      }

      st.activeClip = clip;
      if (clip) {
        const action = st.mixer.clipAction(clip);
        action.loop = loopAnimation ? THREE.LoopRepeat : THREE.LoopOnce;
        action.clampWhenFinished = true;
        action.play();
        st.activeAction = action;
        propsRef.current.onAnimationTimeUpdate(0, clip.duration);
      } else {
        propsRef.current.onAnimationTimeUpdate(0, 0);
      }
    };

    const stepFrame = (nowMs: number): boolean => {
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastClockMs) / 1000));
      const elapsed = (nowMs - startMs) / 1000;
      lastClockMs = nowMs;

      const st = studioRef.current;
      if (!st) return false;

      let keepAnimating = false;

      if (st.camTargetPos && st.camTargetLook) {
        const lambda = 9;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, st.camTargetPos.x, lambda, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, st.camTargetPos.y, lambda, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, st.camTargetPos.z, lambda, dt);

        orbitControls.target.x = THREE.MathUtils.damp(orbitControls.target.x, st.camTargetLook.x, lambda, dt);
        orbitControls.target.y = THREE.MathUtils.damp(orbitControls.target.y, st.camTargetLook.y, lambda, dt);
        orbitControls.target.z = THREE.MathUtils.damp(orbitControls.target.z, st.camTargetLook.z, lambda, dt);

        if (
          camera.position.distanceTo(st.camTargetPos) < 0.005 &&
          orbitControls.target.distanceTo(st.camTargetLook) < 0.005
        ) {
          camera.position.copy(st.camTargetPos);
          orbitControls.target.copy(st.camTargetLook);
          st.camTargetPos = null;
          st.camTargetLook = null;
        } else {
          keepAnimating = true;
        }
      }

      if (
        propsRef.current.mode === 'animate' &&
        propsRef.current.isPlaying &&
        st.mixer &&
        st.activeAction &&
        st.activeClip
      ) {
        st.mixer.update(dt * propsRef.current.playbackSpeed);
        st.skeletonVisuals.sync();
        propsRef.current.onAnimationTimeUpdate(st.activeAction.time, st.activeClip.duration);
        keepAnimating = true;
      }

      if (propsRef.current.mode === 'perform' && st.asset) {
        st.director.update(st.asset, dt, elapsed);
        st.skeletonVisuals.sync();
        const snap = st.director.getStateSnapshot();
        const perfKey = `${snap.state}|${snap.activeAnimation}|${snap.facialExpression}`;
        if (perfKey !== st.lastPerfKey) {
          st.lastPerfKey = perfKey;
          propsRef.current.onPerformanceStateChange?.(snap);
        }
        keepAnimating = true;
      }

      orbitControls.update();
      return keepAnimating;
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((nowMs) => {
        if (disposed) return;
        renderDirty = false;
        const needsMore = stepFrame(nowMs);
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (needsMore || renderDirty) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    orbitControls.addEventListener('start', () => {
      if (studioRef.current) {
        studioRef.current.camTargetPos = null;
        studioRef.current.camTargetLook = null;
      }
    });
    orbitControls.addEventListener('change', () => requestRender());

    transformControls.addEventListener('dragging-changed', (event) => {
      orbitControls.enabled = !event.value;
      if (!event.value) {
        emitBoneList();
      }
      requestRender();
    });

    transformControls.addEventListener('objectChange', () => {
      const st = studioRef.current;
      if (!st || !st.asset) return;
      const obj = transformControls.object as THREE.Bone | undefined;
      if (obj && propsRef.current.stageSettings.symmetryMirror) {
        const mirrorName = findMirrorBoneName(obj.name);
        if (mirrorName) {
          const mirrorBone = st.asset.bones.find((b) => b.name === mirrorName);
          if (mirrorBone && mirrorBone !== obj) {
            if (transformControls.getMode() === 'rotate') {
              _euler.setFromQuaternion(obj.quaternion, 'XYZ');
              mirrorBone.quaternion.setFromEuler(
                new THREE.Euler(_euler.x, -_euler.y, -_euler.z, 'XYZ'),
              );
            } else if (transformControls.getMode() === 'translate') {
              mirrorBone.position.set(-obj.position.x, obj.position.y, obj.position.z);
            } else if (transformControls.getMode() === 'scale') {
              mirrorBone.scale.copy(obj.scale);
            }
          }
        }
      }
      st.skeletonVisuals.sync();
      requestRender();
    });

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let isPaintingStroke = false;
    let pointerDownPos = { x: 0, y: 0 };

    const updateNdc = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const performWeightPaintAtPointer = (e: PointerEvent): boolean => {
      const st = studioRef.current;
      if (!st || !st.asset) return false;
      updateNdc(e);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(st.asset.skinnedMesh, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const { brushSettings, selectedBoneIndex } = propsRef.current;
        paintVertexWeights(
          st.asset.skinnedMesh,
          hit.point,
          selectedBoneIndex,
          brushSettings.radius,
          brushSettings.strength,
          brushSettings.mode,
        );
        applyWeightHeatmapColors(st.asset.skinnedMesh.geometry, selectedBoneIndex, true);
        requestRender();
        return true;
      }
      return false;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      if (propsRef.current.mode === 'weights' && e.button === 0) {
        const hit = performWeightPaintAtPointer(e);
        if (hit) {
          isPaintingStroke = true;
          orbitControls.enabled = false;
        }
      }
    };

    let lastBrushHoverMs = 0;
    const onPointerMove = (e: PointerEvent) => {
      const st = studioRef.current;
      if (!st || !st.asset) return;

      if (propsRef.current.mode !== 'weights') {
        if (brushRing.visible) {
          brushRing.visible = false;
          requestRender();
        }
        return;
      }

      if (isPaintingStroke) {
        performWeightPaintAtPointer(e);
      }

      const now = performance.now();
      if (now - lastBrushHoverMs < 24 && !isPaintingStroke) return;
      lastBrushHoverMs = now;

      updateNdc(e);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(st.asset.skinnedMesh, false);
      if (hits.length > 0) {
        const hit = hits[0];
        brushRing.visible = true;
        brushRing.position.copy(hit.point);
        if (hit.face) {
          _normalMatrix.getNormalMatrix(st.asset.skinnedMesh.matrixWorld);
          _vecA.copy(hit.face.normal).applyMatrix3(_normalMatrix).normalize();
          brushRing.position.addScaledVector(_vecA, 0.005);
          _quat.setFromUnitVectors(_upVec, _vecA);
          brushRing.quaternion.copy(_quat);
        }
        const r = propsRef.current.brushSettings.radius;
        brushRing.scale.set(r, r, r);
        const brushColor =
          propsRef.current.brushSettings.mode === 'add'
            ? 0xf59e0b
            : propsRef.current.brushSettings.mode === 'subtract'
              ? 0x38bdf8
              : 0x10b981;
        (brushRing.material as THREE.MeshBasicMaterial).color.setHex(brushColor);
        requestRender();
      } else if (brushRing.visible) {
        brushRing.visible = false;
        requestRender();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isPaintingStroke) {
        isPaintingStroke = false;
        orbitControls.enabled = true;
        emitBoneList();
        return;
      }

      const distMoved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (
        distMoved < 5 &&
        !transformControls.dragging &&
        (propsRef.current.mode === 'pose' || propsRef.current.mode === 'rig')
      ) {
        const st = studioRef.current;
        if (!st) return;
        updateNdc(e);
        raycaster.setFromCamera(pointerNdc, camera);
        const boneHits = raycaster.intersectObjects(st.skeletonVisuals.raycastTargets, false);
        if (boneHits.length > 0) {
          const bIdx = boneHits[0].object.userData.boneIndex;
          if (typeof bIdx === 'number') {
            propsRef.current.onSelectBone(bIdx);
          }
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      requestRender();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    studioRef.current = {
      scene,
      camera,
      renderer,
      keyLight,
      orbitControls,
      transformControls,
      skeletonVisuals,
      director,
      brushRing,
      gridHelper,
      asset: null,
      loadedQuality: propsRef.current.stageSettings.qualityPreset,
      lastPerfKey: '',
      mixer: null,
      activeAction: null,
      activeClip: null,
      isSoftwareGl,
      camTargetPos: null,
      camTargetLook: null,
      requestRender,
      emitBoneList,
      refreshHeatmap,
      rebuildAnimation,
    };

    const applyLoadedAssetToStage = (nextAsset: LoadedRigAsset) => {
      const st = studioRef.current;
      if (!st || disposed) return;
      if (st.asset) {
        st.transformControls.detach();
        st.mixer?.stopAllAction();
        st.mixer = null;
        st.scene.remove(st.asset.rootObject);
        st.asset.allMeshes.forEach((m) => m.geometry.dispose());
      }
      st.asset = nextAsset;
      scene.add(nextAsset.rootObject);
      skeletonVisuals.setBones(nextAsset.bones);
      skeletonVisuals.highlight(0, null);
      if (propsRef.current.mode === 'pose' || propsRef.current.mode === 'rig') {
        transformControls.attach(nextAsset.bones[0]);
      }
      emitBoneList();
      refreshHeatmap();
      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }
      requestRender();
    };

    void loadSampleBoyRigAsset(
      '/models/sample_boy.glb',
      propsRef.current.stageSettings.qualityPreset,
    )
      .then((sampleAsset) => {
        if (disposed) {
          sampleAsset.allMeshes.forEach((m) => m.geometry.dispose());
          return;
        }
        applyLoadedAssetToStage(sampleAsset);
      })
      .catch(() => {
        if (!disposed) {
          applyLoadedAssetToStage(createPresetRigAsset('lumi'));
        }
      });

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      director.stopSpeech();
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      transformControls.dispose();
      orbitControls.dispose();
      skeletonVisuals.dispose();
      brushGeo.dispose();
      brushMat.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      contactGeo.dispose();
      contactMat.dispose();
      contactTex.dispose();
      envTexture.dispose();
      if (studioRef.current?.asset) {
        studioRef.current.asset.allMeshes.forEach((m) => {
          m.geometry.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mt) => mt.dispose());
          else m.material.dispose();
        });
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      studioRef.current = null;
    };
  }, []);

  // Sync mode, transform tool, selected bone, stage visibility & material
  useEffect(() => {
    const st = studioRef.current;
    if (!st || !st.asset) return;

    const { bones, skinnedMesh, rootObject, isCustomMesh, allMeshes } = st.asset;
    const bone = bones[props.selectedBoneIndex] ?? bones[0];

    if ((props.mode === 'pose' || props.mode === 'rig') && bone) {
      st.transformControls.attach(bone);
      st.transformControls.getHelper().visible = true;
    } else {
      st.transformControls.detach();
      st.transformControls.getHelper().visible = false;
    }

    st.transformControls.setMode(props.transformMode);
    st.transformControls.setSpace(props.transformSpace);

    let mirrorIdx: number | null = null;
    if (bone && props.stageSettings.symmetryMirror) {
      const mName = findMirrorBoneName(bone.name);
      if (mName) {
        const idx = bones.findIndex((b) => b.name === mName);
        if (idx >= 0) mirrorIdx = idx;
      }
    }

    st.skeletonVisuals.highlight(props.selectedBoneIndex, mirrorIdx);
    // In Perform mode, hide bones unless user explicitly wants skeleton overlay or keep clean stage
    st.skeletonVisuals.group.visible =
      props.mode === 'perform' ? false : props.stageSettings.showBones;
    st.skeletonVisuals.setXRay(props.stageSettings.xrayBones);
    st.gridHelper.visible = props.stageSettings.showGrid;
    rootObject.visible = props.stageSettings.showMesh;

    if (props.mode !== 'weights') {
      st.brushRing.visible = false;
    }

    if (props.mode !== 'perform') {
      st.director.stopSpeech();
      propsRef.current.onSpeakingStateChange(false);
      if (props.mode !== 'animate') {
        const pelvisRest = st.asset.restPositions.get('Pelvis');
        const pelvisBone = bones.find((b) => b.name === 'Pelvis');
        if (pelvisRest && pelvisBone) pelvisBone.position.copy(pelvisRest);
      }
    } else {
      // Frame character clearly above the bottom dock for conversational performance
      st.camTargetLook = new THREE.Vector3(0, 0.92, 0);
      st.camTargetPos = new THREE.Vector3(0.45, 1.24, 2.55);
    }

    // Material handling: preserve custom GLB textures unless editing weights/wireframe
    if (!isCustomMesh) {
      const mat = skinnedMesh.material;
      if (!Array.isArray(mat)) {
        const nextMat = createStudioRigMaterial(props.stageSettings.materialPreset);
        nextMat.wireframe = props.stageSettings.wireframe;
        if (props.mode === 'rig') {
          nextMat.transparent = true;
          nextMat.opacity = 0.72;
        }
        if (props.mode === 'weights') {
          nextMat.roughness = 0.65;
          nextMat.metalness = 0.05;
          nextMat.clearcoat = 0.0;
        }
        skinnedMesh.material = nextMat;
        mat.dispose();
      }
    } else {
      allMeshes.forEach((m) => {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mt) => {
          if ('wireframe' in mt) {
            (mt as THREE.MeshStandardMaterial).wireframe = props.stageSettings.wireframe;
          }
          if (m === skinnedMesh && 'vertexColors' in mt) {
            const wantVertexColors =
              props.mode === 'weights' ? true : Boolean(mt.userData.origVertexColors);
            if ((mt as THREE.MeshStandardMaterial).vertexColors !== wantVertexColors) {
              (mt as THREE.MeshStandardMaterial).vertexColors = wantVertexColors;
              mt.needsUpdate = true;
            }
          }
        });
      });
    }

    applyRendererQualitySettings(
      st.renderer,
      st.keyLight,
      props.stageSettings.qualityPreset,
      st.isSoftwareGl,
    );

    if (
      st.loadedQuality !== props.stageSettings.qualityPreset &&
      st.asset.name.toLowerCase().includes('uploaded boy')
    ) {
      const nextQuality = props.stageSettings.qualityPreset;
      st.loadedQuality = nextQuality;
      void loadSampleBoyRigAsset('/models/sample_boy.glb', nextQuality).then((lodAsset) => {
        const cur = studioRef.current;
        if (!cur) return;
        if (cur.asset) {
          cur.transformControls.detach();
          cur.mixer?.stopAllAction();
          cur.mixer = null;
          cur.scene.remove(cur.asset.rootObject);
          cur.asset.allMeshes.forEach((m) => {
            m.geometry.dispose();
            const ms = Array.isArray(m.material) ? m.material : [m.material];
            ms.forEach((mt) => mt.dispose());
          });
        }
        cur.asset = lodAsset;
        cur.scene.add(lodAsset.rootObject);
        cur.skeletonVisuals.setBones(lodAsset.bones);
        cur.skeletonVisuals.highlight(0, null);
        cur.emitBoneList();
        cur.refreshHeatmap();
        cur.requestRender();
      });
    }

    st.refreshHeatmap();
    st.requestRender();
  }, [
    props.mode,
    props.transformMode,
    props.transformSpace,
    props.selectedBoneIndex,
    props.stageSettings,
  ]);

  useEffect(() => {
    const st = studioRef.current;
    if (!st) return;
    if (props.mode === 'animate') {
      st.rebuildAnimation();
    } else if (st.mixer) {
      st.mixer.stopAllAction();
    }
    st.skeletonVisuals.sync();
    st.requestRender();
  }, [props.mode, props.animationPreset, props.customKeyframes, props.loopAnimation]);

  useEffect(() => {
    const st = studioRef.current;
    if (!st) return;
    if (props.mode === 'animate' && props.isPlaying) {
      st.requestRender();
    }
  }, [props.isPlaying, props.playbackSpeed, props.mode]);

  useImperativeHandle(ref, () => ({
    async loadPreset(preset: PresetModelId) {
      const st = studioRef.current;
      if (!st) return;
      st.director.stopSpeech();

      const nextAsset =
        preset === 'sample_boy'
          ? await loadSampleBoyRigAsset(
              '/models/sample_boy.glb',
              propsRef.current.stageSettings.qualityPreset,
            )
          : createPresetRigAsset(preset);
      st.loadedQuality = propsRef.current.stageSettings.qualityPreset;

      if (st.asset) {
        st.transformControls.detach();
        st.mixer?.stopAllAction();
        st.mixer = null;
        st.scene.remove(st.asset.rootObject);
        st.asset.allMeshes.forEach((m) => m.geometry.dispose());
      }

      st.asset = nextAsset;
      st.scene.add(nextAsset.rootObject);
      st.skeletonVisuals.setBones(nextAsset.bones);
      st.skeletonVisuals.highlight(0, null);
      if (propsRef.current.mode === 'pose' || propsRef.current.mode === 'rig') {
        st.transformControls.attach(nextAsset.bones[0]);
      }

      const lookY = preset === 'quadruped' ? 0.58 : 1.05;
      st.camTargetPos = new THREE.Vector3(1.95, lookY + 0.52, 2.75);
      st.camTargetLook = new THREE.Vector3(0, lookY, 0);

      st.emitBoneList();
      st.refreshHeatmap();
      st.requestRender();
    },

    async loadCustomFile(file: File, template: 'biped' | 'quadruped') {
      const st = studioRef.current;
      if (!st) return;
      st.director.stopSpeech();

      const nextAsset = await loadCustomRigAsset(file, template);

      if (st.asset) {
        st.transformControls.detach();
        st.mixer?.stopAllAction();
        st.mixer = null;
        st.scene.remove(st.asset.rootObject);
        st.asset.allMeshes.forEach((m) => m.geometry.dispose());
      }

      st.asset = nextAsset;
      st.scene.add(nextAsset.rootObject);
      st.skeletonVisuals.setBones(nextAsset.bones);
      st.skeletonVisuals.highlight(0, null);
      if (propsRef.current.mode === 'pose' || propsRef.current.mode === 'rig') {
        st.transformControls.attach(nextAsset.bones[0]);
      }

      const lookY = template === 'quadruped' ? 0.58 : 1.15;
      st.camTargetPos = new THREE.Vector3(1.85, lookY + 0.45, 2.55);
      st.camTargetLook = new THREE.Vector3(0, lookY, 0);

      st.emitBoneList();
      st.refreshHeatmap();
      st.requestRender();
    },

    setBoneLocalTransform(boneIndex, pos, rotDeg, scale) {
      const st = studioRef.current;
      if (!st || !st.asset) return;
      const bone = st.asset.bones[boneIndex];
      if (!bone) return;

      if (pos) bone.position.set(pos[0], pos[1], pos[2]);
      if (rotDeg) {
        bone.quaternion.setFromEuler(
          new THREE.Euler(
            THREE.MathUtils.degToRad(rotDeg[0]),
            THREE.MathUtils.degToRad(rotDeg[1]),
            THREE.MathUtils.degToRad(rotDeg[2]),
            'XYZ',
          ),
        );
      }
      if (scale) bone.scale.set(scale[0], scale[1], scale[2]);

      if (propsRef.current.stageSettings.symmetryMirror) {
        const mName = findMirrorBoneName(bone.name);
        const mirrorBone = mName ? st.asset.bones.find((b) => b.name === mName) : undefined;
        if (mirrorBone && mirrorBone !== bone && rotDeg) {
          mirrorBone.quaternion.setFromEuler(
            new THREE.Euler(
              THREE.MathUtils.degToRad(rotDeg[0]),
              THREE.MathUtils.degToRad(-rotDeg[1]),
              THREE.MathUtils.degToRad(-rotDeg[2]),
              'XYZ',
            ),
          );
        }
      }

      st.skeletonVisuals.sync();
      st.emitBoneList();
      st.requestRender();
    },

    resetSelectedBone() {
      const st = studioRef.current;
      if (!st || !st.asset) return;
      const bone = st.asset.bones[propsRef.current.selectedBoneIndex];
      if (!bone) return;
      const rp = st.asset.restPositions.get(bone.name);
      const rq = st.asset.restQuaternions.get(bone.name);
      const rs = st.asset.restScales.get(bone.name);
      if (rp) bone.position.copy(rp);
      if (rq) bone.quaternion.copy(rq);
      if (rs) bone.scale.copy(rs);
      st.skeletonVisuals.sync();
      st.emitBoneList();
      st.requestRender();
    },

    resetFullPose() {
      const st = studioRef.current;
      if (!st || !st.asset) return;
      for (const bone of st.asset.bones) {
        const rp = st.asset.restPositions.get(bone.name);
        const rq = st.asset.restQuaternions.get(bone.name);
        const rs = st.asset.restScales.get(bone.name);
        if (rp) bone.position.copy(rp);
        if (rq) bone.quaternion.copy(rq);
        if (rs) bone.scale.copy(rs);
      }
      st.skeletonVisuals.sync();
      st.emitBoneList();
      st.requestRender();
    },

    rebindAndAutoWeight(falloff: number) {
      const st = studioRef.current;
      if (!st || !st.asset) return;
      const { skinnedMesh, bones } = st.asset;
      bones[0]?.updateMatrixWorld(true);
      computeAutoSkinWeights(skinnedMesh.geometry, bones, falloff);
      rebindSkeleton(skinnedMesh);

      for (const b of bones) {
        st.asset.restPositions.set(b.name, b.position.clone());
        st.asset.restQuaternions.set(b.name, b.quaternion.clone());
        st.asset.restScales.set(b.name, b.scale.clone());
      }

      st.skeletonVisuals.sync();
      st.refreshHeatmap();
      st.emitBoneList();
      st.requestRender();
      propsRef.current.onToast('Skeleton rebound & auto-weights updated');
    },

    addChildBone(parentIndex: number) {
      const st = studioRef.current;
      if (!st || !st.asset) return;
      const parent = st.asset.bones[parentIndex] ?? st.asset.bones[0];
      if (!parent) return;

      const newBone = new THREE.Bone();
      newBone.name = `ExtBone_${st.asset.bones.length + 1}`;
      newBone.position.set(0, 0.16, 0);
      parent.add(newBone);
      st.asset.bones.push(newBone);

      st.asset.restPositions.set(newBone.name, newBone.position.clone());
      st.asset.restQuaternions.set(newBone.name, newBone.quaternion.clone());
      st.asset.restScales.set(newBone.name, newBone.scale.clone());

      const newSkel = new THREE.Skeleton(st.asset.bones);
      st.asset.skeleton = newSkel;
      st.asset.bones[0].updateMatrixWorld(true);
      computeAutoSkinWeights(st.asset.skinnedMesh.geometry, st.asset.bones, 3.3);
      st.asset.skinnedMesh.bind(newSkel);
      st.asset.bindings = buildRigChannelBindings(st.asset.rootObject, st.asset.bones);

      st.skeletonVisuals.setBones(st.asset.bones);
      const newIdx = st.asset.bones.length - 1;
      propsRef.current.onSelectBone(newIdx);
      st.emitBoneList();
      st.requestRender();
      propsRef.current.onToast(`Added ${newBone.name} to ${parent.name}`);
    },

    setCameraPreset(preset: CameraPresetId) {
      const st = studioRef.current;
      if (!st) return;

      if (preset === 'focusBone' && st.asset) {
        const bone = st.asset.bones[propsRef.current.selectedBoneIndex];
        if (bone) {
          bone.getWorldPosition(_vecB);
          st.camTargetLook = _vecB.clone();
          st.camTargetPos = _vecB.clone().add(new THREE.Vector3(0.65, 0.25, 0.85));
          st.requestRender();
          return;
        }
      }

      const lookY = st.asset?.name.toLowerCase().includes('quadruped') ? 0.58 : 1.05;
      st.camTargetLook = new THREE.Vector3(0, lookY, 0);

      switch (preset) {
        case 'front':
          st.camTargetPos = new THREE.Vector3(0, lookY + 0.15, 2.85);
          break;
        case 'side':
          st.camTargetPos = new THREE.Vector3(2.85, lookY + 0.15, 0);
          break;
        case 'top':
          st.camTargetPos = new THREE.Vector3(0, 3.9, 0.35);
          break;
        case 'threeQuarter':
        default:
          st.camTargetPos = new THREE.Vector3(1.95, lookY + 0.52, 2.75);
          break;
      }
      st.requestRender();
    },

    scrubAnimation(time: number) {
      const st = studioRef.current;
      if (!st || !st.mixer || !st.activeAction || !st.activeClip) return;
      const clamped = Math.max(0, Math.min(st.activeClip.duration, time));
      st.activeAction.time = clamped;
      st.mixer.update(0);
      st.skeletonVisuals.sync();
      propsRef.current.onAnimationTimeUpdate(clamped, st.activeClip.duration);
      st.requestRender();
    },

    captureKeyframe(time: number): KeyframePose | null {
      const st = studioRef.current;
      if (!st || !st.asset) return null;
      const bonesRecord: KeyframePose['bones'] = {};
      for (const b of st.asset.bones) {
        bonesRecord[b.name] = {
          position: [b.position.x, b.position.y, b.position.z],
          quaternion: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
        };
      }
      return {
        id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: Number(time.toFixed(2)),
        label: `${time.toFixed(2)}s`,
        bones: bonesRecord,
      };
    },

    exportGLB() {
      const st = studioRef.current;
      if (!st || !st.asset) return;

      const asset = st.asset;
      const exporter = new GLTFExporter();
      const animations: THREE.AnimationClip[] = [];

      const armBasis = asset.rootObject.userData.armRestBasis as ArmRestBasis | undefined;
      const pelvisRestPos = asset.restPositions.get('Pelvis');
      const custom = compileCustomAnimationClip(propsRef.current.customKeyframes, asset.bones);
      if (custom) animations.push(custom);
      for (const presetId of [
        'idle',
        'walk',
        'run',
        'wave',
        'think',
        'clap',
        'monkey',
        'backflip',
        'hero',
      ] as const) {
        const clip = buildPresetAnimationClip(presetId, asset.bones, armBasis, pelvisRestPos);
        if (clip) animations.push(clip);
      }

      // Snapshot live pose, morphs, and heatmap state so the exported GLB has a clean bind pose
      const savedBones = asset.bones.map((b) => ({
        bone: b,
        pos: b.position.clone(),
        quat: b.quaternion.clone(),
        scale: b.scale.clone(),
      }));
      const savedMorphs = asset.skinnedMeshes.map((sm) =>
        sm.morphTargetInfluences ? [...sm.morphTargetInfluences] : null,
      );
      const wasWeightsMode = propsRef.current.mode === 'weights';

      const restoreLiveState = () => {
        for (const entry of savedBones) {
          entry.bone.position.copy(entry.pos);
          entry.bone.quaternion.copy(entry.quat);
          entry.bone.scale.copy(entry.scale);
        }
        asset.skinnedMeshes.forEach((sm, idx) => {
          const vals = savedMorphs[idx];
          if (vals && sm.morphTargetInfluences) {
            vals.forEach((v, i) => {
              sm.morphTargetInfluences![i] = v;
            });
          }
        });
        if (wasWeightsMode) {
          applyWeightHeatmapColors(
            asset.skinnedMesh.geometry,
            propsRef.current.selectedBoneIndex,
            true,
          );
          const mats = Array.isArray(asset.skinnedMesh.material)
            ? asset.skinnedMesh.material
            : [asset.skinnedMesh.material];
          mats.forEach((mt) => {
            if ('vertexColors' in mt) {
              (mt as THREE.MeshStandardMaterial).vertexColors = true;
              mt.needsUpdate = true;
            }
          });
        }
        asset.rootObject.updateMatrixWorld(true);
        st.skeletonVisuals.sync();
        st.requestRender();
      };

      propsRef.current.onToast('Preparing rigged .GLB export...');

      // Reset to clean rest pose for export
      for (const bone of asset.bones) {
        const rp = asset.restPositions.get(bone.name);
        const rq = asset.restQuaternions.get(bone.name);
        const rs = asset.restScales.get(bone.name);
        if (rp) bone.position.copy(rp);
        if (rq) bone.quaternion.copy(rq);
        if (rs) bone.scale.copy(rs);
      }
      asset.skinnedMeshes.forEach((sm) => {
        if (sm.morphTargetInfluences) {
          sm.morphTargetInfluences.fill(0);
        }
      });
      if (wasWeightsMode) {
        applyWeightHeatmapColors(
          asset.skinnedMesh.geometry,
          propsRef.current.selectedBoneIndex,
          false,
        );
        const mats = Array.isArray(asset.skinnedMesh.material)
          ? asset.skinnedMesh.material
          : [asset.skinnedMesh.material];
        mats.forEach((mt) => {
          if ('vertexColors' in mt) {
            (mt as THREE.MeshStandardMaterial).vertexColors = Boolean(
              mt.userData.origVertexColors,
            );
            mt.needsUpdate = true;
          }
        });
      }
      asset.rootObject.updateMatrixWorld(true);

      exporter.parse(
        asset.rootObject,
        (result) => {
          restoreLiveState();
          if (result instanceof ArrayBuffer) {
            const compactBuffer = optimizeGlbSparseMorphs(result);
            const blob = new Blob([compactBuffer], { type: 'model/gltf-binary' });
            const url = URL.createObjectURL(blob);
            const filename = `${asset.name.toLowerCase().replace(/\s+/g, '_')}_rigged.glb`;
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
            const sizeMb = (compactBuffer.byteLength / (1024 * 1024)).toFixed(1);
            propsRef.current.onToast(
              `Exported ${filename} (${sizeMb} MB · ${animations.length} clips)`,
            );
          }
        },
        (err) => {
          restoreLiveState();
          console.error(err);
          propsRef.current.onToast('GLB export encountered an error');
        },
        { binary: true, animations },
      );
    },

    unlockAudio() {
      studioRef.current?.director.unlockAudio();
    },

    async performScript(script: PerformanceScript) {
      const st = studioRef.current;
      if (!st) return;
      propsRef.current.onSpeakingStateChange(true);
      await st.director.playPerformance(script, () => {
        propsRef.current.onSpeakingStateChange(false);
      });
      st.requestRender();
    },

    stopPerformance() {
      const st = studioRef.current;
      if (!st) return;
      st.director.stopSpeech();
      propsRef.current.onSpeakingStateChange(false);
    },

    setPerformanceCue(gesture, handPose, emotion) {
      const st = studioRef.current;
      if (!st) return;
      st.director.setImmediateCue(gesture, handPose, emotion);
      propsRef.current.onPerformanceStateChange?.(st.director.getStateSnapshot());
      st.requestRender();
    },

    triggerLibraryAnimation(animId, facialExpr, durationSec) {
      const st = studioRef.current;
      if (!st) return;
      st.director.triggerLibraryAnimation(animId, facialExpr, durationSec);
      propsRef.current.onPerformanceStateChange?.(st.director.getStateSnapshot());
      st.requestRender();
    },

    setFacialExpression(exprId) {
      const st = studioRef.current;
      if (!st) return;
      st.director.setFacialExpression(exprId);
      propsRef.current.onPerformanceStateChange?.(st.director.getStateSnapshot());
      st.requestRender();
    },

    setInteractionState(state) {
      const st = studioRef.current;
      if (!st) return;
      st.director.setInteractionState(state);
      propsRef.current.onPerformanceStateChange?.(st.director.getStateSnapshot());
      st.requestRender();
    },

    setPerformanceTuning(speed, intensity) {
      const st = studioRef.current;
      if (!st) return;
      st.director.setPerformanceTuning(speed, intensity);
      st.requestRender();
    },

    getRecentAnimations() {
      return studioRef.current?.director.getRecentAnimations() ?? [];
    },

    setManualExpressionOverrides(overrides) {
      const st = studioRef.current;
      if (!st) return;
      st.director.manualOverrides = overrides;
      st.requestRender();
    },
  }));

  return (
    <div className="relative w-full h-full bg-[#0d0f14]">
      <div ref={mountRef} className="w-full h-full" />
      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d0f14]/90 z-30">
          <div className="px-6 py-4 rounded-xl border border-slate-700 bg-[#161920] text-center">
            <p className="font-display text-lg font-semibold text-slate-100">
              WebGL context paused
            </p>
            <p className="text-sm text-slate-400 mt-1">
              Restoring 3D studio viewport automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
});
