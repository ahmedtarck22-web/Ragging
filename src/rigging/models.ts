import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { buildRigChannelBindings, RigChannelBindings } from './rigMapper';
import { computeAutoSkinWeights } from './skinning';
import { PresetModelId, QualityPreset } from './types';
import {
  buildLumiTourGuideGeometry,
  createTourGuideBadgeMesh,
} from './lumiCharacter';
import {
  analyzeStaticBipedLandmarks,
  attachFittedFaceMorphTargets,
  buildFittedBipedSkeleton,
  computeRegionAwareBipedWeights,
} from './autoRigStaticModel';
import {
  decimateGeometryForQuality,
  optimizeMaterialsForQuality,
} from './lodOptimizer';

export interface LoadedRigAsset {
  name: string;
  /** Root Object3D added to the Three.js scene (contains all meshes & bones) */
  rootObject: THREE.Object3D;
  /** Primary SkinnedMesh (used for weight painting & single-mesh operations) */
  skinnedMesh: THREE.SkinnedMesh;
  /** All SkinnedMeshes inside rootObject (supports multi-mesh GLB characters) */
  skinnedMeshes: THREE.SkinnedMesh[];
  /** All Meshes inside rootObject (including rigid eye/hair attachments) */
  allMeshes: THREE.Mesh[];
  skeleton: THREE.Skeleton;
  bones: THREE.Bone[];
  bindings: RigChannelBindings;
  restPositions: Map<string, THREE.Vector3>;
  restQuaternions: Map<string, THREE.Quaternion>;
  restScales: Map<string, THREE.Vector3>;
  isCustomMesh: boolean;
}

function createStudioGrainTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 195 + Math.floor((Math.sin(i * 0.17) * 0.5 + Math.cos(i * 0.07) * 0.5) * 28);
    img.data[i] = n;
    img.data[i + 1] = n;
    img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.needsUpdate = true;
  return tex;
}

let cachedGrainTex: THREE.CanvasTexture | null = null;

export function createStudioRigMaterial(
  preset: 'clay' | 'ceramic' | 'graphite' | 'studio' = 'studio',
): THREE.MeshPhysicalMaterial {
  if (!cachedGrainTex) {
    cachedGrainTex = createStudioGrainTexture();
  }

  const base = {
    vertexColors: true,
    side: THREE.DoubleSide,
  };

  switch (preset) {
    case 'clay':
      return new THREE.MeshPhysicalMaterial({
        ...base,
        roughnessMap: cachedGrainTex,
        color: 0xe6dfd7,
        roughness: 0.72,
        metalness: 0.02,
        clearcoat: 0.05,
      });
    case 'ceramic':
      return new THREE.MeshPhysicalMaterial({
        ...base,
        color: 0xf8fafc,
        roughness: 0.28,
        metalness: 0.08,
        clearcoat: 0.65,
        clearcoatRoughness: 0.18,
      });
    case 'graphite':
      return new THREE.MeshPhysicalMaterial({
        ...base,
        roughnessMap: cachedGrainTex,
        color: 0x64748b,
        roughness: 0.34,
        metalness: 0.75,
        clearcoat: 0.25,
      });
    case 'studio':
    default:
      return new THREE.MeshPhysicalMaterial({
        ...base,
        color: 0xffffff,
        roughness: 0.56,
        metalness: 0.04,
        clearcoat: 0.08,
        clearcoatRoughness: 0.38,
      });
  }
}

function preparePart(
  geom: THREE.BufferGeometry,
  colorHex: string,
  matrix?: THREE.Matrix4,
): THREE.BufferGeometry {
  const g = geom.clone();
  if (matrix) g.applyMatrix4(matrix);
  g.computeVertexNormals();
  const out = g.index ? g.toNonIndexed() : g;

  const count = out.attributes.position.count;
  if (!out.attributes.uv) {
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }

  const col = new THREE.Color(colorHex);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  for (const key of Object.keys(out.attributes)) {
    if (key !== 'position' && key !== 'normal' && key !== 'uv' && key !== 'color') {
      out.deleteAttribute(key);
    }
  }

  return out;
}

function makeTransform(
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  return m;
}

function createLimbPart(
  start: [number, number, number],
  end: [number, number, number],
  rStart: number,
  rEnd: number,
  colorHex: string,
  heightSegments = 10,
): THREE.BufferGeometry {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

  const cyl = new THREE.CylinderGeometry(rEnd, rStart, len, 18, heightSegments, false);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize(),
  );
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
  return preparePart(cyl, colorHex, m);
}

/**
 * Full Expressive Biped Skeleton with Face (Jaw, Eyes, Eyelids/Lashes, Brows, Nose, Ears)
 * and all 10 Articulated Fingers (2 phalanges each).
 */
export function buildBipedSkeleton(includeFaceAndFingers = true): {
  root: THREE.Bone;
  bones: THREE.Bone[];
} {
  const pelvis = new THREE.Bone();
  pelvis.name = 'Pelvis';
  pelvis.position.set(0, 0.94, 0);

  const spine = new THREE.Bone();
  spine.name = 'Spine';
  spine.position.set(0, 0.16, 0);
  pelvis.add(spine);

  const chest = new THREE.Bone();
  chest.name = 'Chest';
  chest.position.set(0, 0.22, 0);
  spine.add(chest);

  const neck = new THREE.Bone();
  neck.name = 'Neck';
  neck.position.set(0, 0.22, 0);
  chest.add(neck);

  const head = new THREE.Bone();
  head.name = 'Head';
  head.position.set(0, 0.11, 0);
  neck.add(head);

  if (includeFaceAndFingers) {
    const jaw = new THREE.Bone();
    jaw.name = 'Jaw';
    jaw.position.set(0, 0.04, 0.03);
    head.add(jaw);

    const leftEye = new THREE.Bone();
    leftEye.name = 'LeftEye';
    leftEye.position.set(0.042, 0.125, 0.088);
    head.add(leftEye);

    const rightEye = new THREE.Bone();
    rightEye.name = 'RightEye';
    rightEye.position.set(-0.042, 0.125, 0.088);
    head.add(rightEye);

    const leftEyelid = new THREE.Bone();
    leftEyelid.name = 'LeftEyelid';
    leftEyelid.position.set(0.042, 0.145, 0.095);
    head.add(leftEyelid);

    const rightEyelid = new THREE.Bone();
    rightEyelid.name = 'RightEyelid';
    rightEyelid.position.set(-0.042, 0.145, 0.095);
    head.add(rightEyelid);

    const leftBrow = new THREE.Bone();
    leftBrow.name = 'LeftBrow';
    leftBrow.position.set(0.044, 0.166, 0.1);
    head.add(leftBrow);

    const rightBrow = new THREE.Bone();
    rightBrow.name = 'RightBrow';
    rightBrow.position.set(-0.044, 0.166, 0.1);
    head.add(rightBrow);

    const nose = new THREE.Bone();
    nose.name = 'Nose';
    nose.position.set(0, 0.1, 0.112);
    head.add(nose);

    const leftEar = new THREE.Bone();
    leftEar.name = 'LeftEar';
    leftEar.position.set(0.105, 0.12, 0.005);
    head.add(leftEar);

    const rightEar = new THREE.Bone();
    rightEar.name = 'RightEar';
    rightEar.position.set(-0.105, 0.12, 0.005);
    head.add(rightEar);
  }

  // Left Arm + Hand + 5 Fingers
  const lShoulder = new THREE.Bone();
  lShoulder.name = 'LeftShoulder';
  lShoulder.position.set(0.11, 0.17, 0);
  chest.add(lShoulder);

  const lUpperArm = new THREE.Bone();
  lUpperArm.name = 'LeftUpperArm';
  lUpperArm.position.set(0.1, 0, 0);
  lShoulder.add(lUpperArm);

  const lForearm = new THREE.Bone();
  lForearm.name = 'LeftForearm';
  lForearm.position.set(0.26, 0, 0);
  lUpperArm.add(lForearm);

  const lHand = new THREE.Bone();
  lHand.name = 'LeftHand';
  lHand.position.set(0.24, 0, 0);
  lForearm.add(lHand);

  if (includeFaceAndFingers) {
    const fingerSpecs: Array<{ key: string; zOffset: number; len1: number; len2: number; xOffset: number }> = [
      { key: 'Thumb', zOffset: 0.036, len1: 0.03, len2: 0.026, xOffset: 0.032 },
      { key: 'Index', zOffset: 0.024, len1: 0.034, len2: 0.028, xOffset: 0.072 },
      { key: 'Middle', zOffset: 0.008, len1: 0.038, len2: 0.03, xOffset: 0.074 },
      { key: 'Ring', zOffset: -0.008, len1: 0.034, len2: 0.028, xOffset: 0.072 },
      { key: 'Pinky', zOffset: -0.024, len1: 0.028, len2: 0.022, xOffset: 0.068 },
    ];
    for (const f of fingerSpecs) {
      const f1 = new THREE.Bone();
      f1.name = `Left${f.key}1`;
      f1.position.set(f.xOffset, 0, f.zOffset);
      lHand.add(f1);

      const f2 = new THREE.Bone();
      f2.name = `Left${f.key}2`;
      f2.position.set(f.len1, 0, 0);
      f1.add(f2);
    }
  }

  // Right Arm + Hand + 5 Fingers
  const rShoulder = new THREE.Bone();
  rShoulder.name = 'RightShoulder';
  rShoulder.position.set(-0.11, 0.17, 0);
  chest.add(rShoulder);

  const rUpperArm = new THREE.Bone();
  rUpperArm.name = 'RightUpperArm';
  rUpperArm.position.set(-0.1, 0, 0);
  rShoulder.add(rUpperArm);

  const rForearm = new THREE.Bone();
  rForearm.name = 'RightForearm';
  rForearm.position.set(-0.26, 0, 0);
  rUpperArm.add(rForearm);

  const rHand = new THREE.Bone();
  rHand.name = 'RightHand';
  rHand.position.set(-0.24, 0, 0);
  rForearm.add(rHand);

  if (includeFaceAndFingers) {
    const fingerSpecs: Array<{ key: string; zOffset: number; len1: number; xOffset: number }> = [
      { key: 'Thumb', zOffset: 0.036, len1: 0.03, xOffset: -0.032 },
      { key: 'Index', zOffset: 0.024, len1: 0.034, xOffset: -0.072 },
      { key: 'Middle', zOffset: 0.008, len1: 0.038, xOffset: -0.074 },
      { key: 'Ring', zOffset: -0.008, len1: 0.034, xOffset: -0.072 },
      { key: 'Pinky', zOffset: -0.024, len1: 0.028, xOffset: -0.068 },
    ];
    for (const f of fingerSpecs) {
      const f1 = new THREE.Bone();
      f1.name = `Right${f.key}1`;
      f1.position.set(f.xOffset, 0, f.zOffset);
      rHand.add(f1);

      const f2 = new THREE.Bone();
      f2.name = `Right${f.key}2`;
      f2.position.set(-f.len1, 0, 0);
      f1.add(f2);
    }
  }

  // Left Leg
  const lThigh = new THREE.Bone();
  lThigh.name = 'LeftThigh';
  lThigh.position.set(0.11, -0.04, 0);
  pelvis.add(lThigh);

  const lShin = new THREE.Bone();
  lShin.name = 'LeftShin';
  lShin.position.set(0, -0.42, 0);
  lThigh.add(lShin);

  const lFoot = new THREE.Bone();
  lFoot.name = 'LeftFoot';
  lFoot.position.set(0, -0.41, 0);
  lShin.add(lFoot);

  // Right Leg
  const rThigh = new THREE.Bone();
  rThigh.name = 'RightThigh';
  rThigh.position.set(-0.11, -0.04, 0);
  pelvis.add(rThigh);

  const rShin = new THREE.Bone();
  rShin.name = 'RightShin';
  rShin.position.set(0, -0.42, 0);
  rThigh.add(rShin);

  const rFoot = new THREE.Bone();
  rFoot.name = 'RightFoot';
  rFoot.position.set(0, -0.41, 0);
  rShin.add(rFoot);

  const bones: THREE.Bone[] = [];
  pelvis.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) bones.push(obj as THREE.Bone);
  });

  return { root: pelvis, bones };
}

export function buildQuadrupedSkeleton(): { root: THREE.Bone; bones: THREE.Bone[] } {
  const pelvis = new THREE.Bone();
  pelvis.name = 'Pelvis';
  pelvis.position.set(0, 0.68, -0.35);

  const spine = new THREE.Bone();
  spine.name = 'Spine';
  spine.position.set(0, 0.03, 0.28);
  pelvis.add(spine);

  const chest = new THREE.Bone();
  chest.name = 'Chest';
  chest.position.set(0, 0.02, 0.34);
  spine.add(chest);

  const neck = new THREE.Bone();
  neck.name = 'Neck';
  neck.position.set(0, 0.14, 0.14);
  chest.add(neck);

  const head = new THREE.Bone();
  head.name = 'Head';
  head.position.set(0, 0.16, 0.15);
  neck.add(head);

  const jaw = new THREE.Bone();
  jaw.name = 'Jaw';
  jaw.position.set(0, -0.04, 0.12);
  head.add(jaw);

  const leftEar = new THREE.Bone();
  leftEar.name = 'LeftEar';
  leftEar.position.set(0.068, 0.11, -0.04);
  head.add(leftEar);

  const rightEar = new THREE.Bone();
  rightEar.name = 'RightEar';
  rightEar.position.set(-0.068, 0.11, -0.04);
  head.add(rightEar);

  const tailBase = new THREE.Bone();
  tailBase.name = 'TailBase';
  tailBase.position.set(0, 0.06, -0.14);
  pelvis.add(tailBase);

  const tailTip = new THREE.Bone();
  tailTip.name = 'TailTip';
  tailTip.position.set(0, 0.14, -0.26);
  tailBase.add(tailTip);

  const flUpper = new THREE.Bone();
  flUpper.name = 'FrontLeftUpperLeg';
  flUpper.position.set(0.14, -0.08, 0.04);
  chest.add(flUpper);

  const flLower = new THREE.Bone();
  flLower.name = 'FrontLeftLowerLeg';
  flLower.position.set(0, -0.31, 0);
  flUpper.add(flLower);

  const flPaw = new THREE.Bone();
  flPaw.name = 'FrontLeftPaw';
  flPaw.position.set(0, -0.3, 0.02);
  flLower.add(flPaw);

  const frUpper = new THREE.Bone();
  frUpper.name = 'FrontRightUpperLeg';
  frUpper.position.set(-0.14, -0.08, 0.04);
  chest.add(frUpper);

  const frLower = new THREE.Bone();
  frLower.name = 'FrontRightLowerLeg';
  frLower.position.set(0, -0.31, 0);
  frUpper.add(frLower);

  const frPaw = new THREE.Bone();
  frPaw.name = 'FrontRightPaw';
  frPaw.position.set(0, -0.3, 0.02);
  frLower.add(frPaw);

  const blUpper = new THREE.Bone();
  blUpper.name = 'BackLeftUpperLeg';
  blUpper.position.set(0.14, -0.04, 0);
  pelvis.add(blUpper);

  const blLower = new THREE.Bone();
  blLower.name = 'BackLeftLowerLeg';
  blLower.position.set(0, -0.31, -0.02);
  blUpper.add(blLower);

  const blPaw = new THREE.Bone();
  blPaw.name = 'BackLeftPaw';
  blPaw.position.set(0, -0.29, 0.03);
  blLower.add(blPaw);

  const brUpper = new THREE.Bone();
  brUpper.name = 'BackRightUpperLeg';
  brUpper.position.set(-0.14, -0.04, 0);
  pelvis.add(brUpper);

  const brLower = new THREE.Bone();
  brLower.name = 'BackRightLowerLeg';
  brLower.position.set(0, -0.31, -0.02);
  brUpper.add(brLower);

  const brPaw = new THREE.Bone();
  brPaw.name = 'BackRightPaw';
  brPaw.position.set(0, -0.29, 0.03);
  brLower.add(brPaw);

  const bones: THREE.Bone[] = [];
  pelvis.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) bones.push(obj as THREE.Bone);
  });

  return { root: pelvis, bones };
}

/**
 * Generates real vertex Morph Target Blendshapes on the Studio Mannequin's sculpted head & face
 * (jawOpen, viseme_aa, viseme_O, viseme_E, viseme_PP, mouthSmile, browInnerUp, browDown, eyeBlinkLeft, eyeBlinkRight, noseSneer, earPerk)
 */
function attachExpressiveFaceMorphTargets(
  geom: THREE.BufferGeometry,
  faceTagByVertex: Uint8Array,
): void {
  // Face tags:
  // 0 = body/head neutral
  // 1 = lower jaw & lower lip
  // 2 = upper lip / mouth rim
  // 3 = mouth corner left/right
  // 4 = left brow
  // 5 = right brow
  // 6 = left eyelid/eyelash
  // 7 = right eyelid/eyelash
  // 8 = nose
  // 9 = ears

  const pos = geom.attributes.position as THREE.BufferAttribute;
  const count = pos.count;

  const targetNames = [
    'jawOpen',
    'viseme_aa',
    'viseme_O',
    'viseme_E',
    'viseme_PP',
    'mouthSmile',
    'browInnerUp',
    'browDown',
    'eyeBlinkLeft',
    'eyeBlinkRight',
    'noseSneer',
    'earPerk',
  ];

  const targets: Float32Array[] = targetNames.map(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = pos.getX(i);
      arr[i * 3 + 1] = pos.getY(i);
      arr[i * 3 + 2] = pos.getZ(i);
    }
    return arr;
  });

  const idxOf = (name: string) => targetNames.indexOf(name);

  for (let i = 0; i < count; i++) {
    const tag = faceTagByVertex[i];
    if (tag === 0) continue;

    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    if (tag === 1) {
      // Lower jaw & lower lip (moderate clean drop + slight inner recess + lateral round)
      const jawI = idxOf('jawOpen');
      targets[jawI][i * 3] = x * 1.08;
      targets[jawI][i * 3 + 1] = y - 0.018;
      targets[jawI][i * 3 + 2] = z - 0.005;

      const aaI = idxOf('viseme_aa');
      targets[aaI][i * 3] = x * 1.12;
      targets[aaI][i * 3 + 1] = y - 0.016;
      targets[aaI][i * 3 + 2] = z + 0.002;

      const oI = idxOf('viseme_O');
      targets[oI][i * 3] = x * 0.64;
      targets[oI][i * 3 + 1] = y - 0.012;
      targets[oI][i * 3 + 2] = z + 0.015;

      const eI = idxOf('viseme_E');
      targets[eI][i * 3] = x * 1.32;
      targets[eI][i * 3 + 1] = y - 0.004;

      const ppI = idxOf('viseme_PP');
      targets[ppI][i * 3] = x * 1.06;
      targets[ppI][i * 3 + 1] = y + 0.008;
      targets[ppI][i * 3 + 2] = z - 0.003;
    }

    if (tag === 2) {
      // Upper lip
      const oI = idxOf('viseme_O');
      targets[oI][i * 3] = x * 0.68;
      targets[oI][i * 3 + 1] = y + 0.006;
      targets[oI][i * 3 + 2] = z + 0.015;

      const eI = idxOf('viseme_E');
      targets[eI][i * 3] = x * 1.34;
      targets[eI][i * 3 + 1] = y + 0.005;

      const ppI = idxOf('viseme_PP');
      targets[ppI][i * 3 + 1] = y - 0.007;
    }

    if (tag === 3) {
      // Mouth corners (left/right horizontal stretch & smile curl)
      const smileI = idxOf('mouthSmile');
      targets[smileI][i * 3] = x * 1.32;
      targets[smileI][i * 3 + 1] = y + 0.014;
      targets[smileI][i * 3 + 2] = z - 0.004;

      const eI = idxOf('viseme_E');
      targets[eI][i * 3] = x * 1.38;
      targets[eI][i * 3 + 1] = y + 0.006;

      const oI = idxOf('viseme_O');
      targets[oI][i * 3] = x * 0.6;
      targets[oI][i * 3 + 2] = z + 0.014;
    }

    if (tag === 4 || tag === 5) {
      // Eyebrows
      const upI = idxOf('browInnerUp');
      targets[upI][i * 3 + 1] = y + 0.018;

      const downI = idxOf('browDown');
      targets[downI][i * 3 + 1] = y - 0.014;
      targets[downI][i * 3 + 2] = z + 0.004;
    }

    if (tag === 6) {
      // Left eyelid / eyelash
      const blI = idxOf('eyeBlinkLeft');
      targets[blI][i * 3 + 1] = y - 0.026;
      targets[blI][i * 3 + 2] = z + 0.004;
    }

    if (tag === 7) {
      // Right eyelid / eyelash
      const brI = idxOf('eyeBlinkRight');
      targets[brI][i * 3 + 1] = y - 0.026;
      targets[brI][i * 3 + 2] = z + 0.004;
    }

    if (tag === 8) {
      // Nose
      const nI = idxOf('noseSneer');
      targets[nI][i * 3 + 1] = y + 0.009;
      targets[nI][i * 3 + 2] = z + 0.004;
    }

    if (tag === 9) {
      // Ears
      const earI = idxOf('earPerk');
      targets[earI][i * 3 + 1] = y + 0.016;
      targets[earI][i * 3 + 2] = z - 0.008;
    }
  }

  geom.morphAttributes.position = targets.map(
    (arr) => new THREE.BufferAttribute(arr, 3),
  );
  geom.userData.morphTargetNames = targetNames;
}

/**
 * 1. Sculpted Expressive Studio Mannequin (Full Face + Mouth + Eyes + Lashes + Brows + Ears + 10 Fingers)
 */
function buildMannequinGeometry(): {
  geometry: THREE.BufferGeometry;
  morphTargetNames: string[];
} {
  const parts: THREE.BufferGeometry[] = [];
  const partTags: number[] = [];

  const pushPart = (geom: THREE.BufferGeometry, tag = 0) => {
    parts.push(geom);
    partTags.push(tag);
  };

  const ivory = '#e8e4dc';
  const jointDark = '#334155';
  const lipColor = '#c27a72';
  const mouthDark = '#2b1216';
  const eyeWhite = '#f8fafc';
  const irisColor = '#0ea5e9';
  const lashBrowColor = '#1e293b';
  const earColor = '#dfd8cc';

  // Pelvis / Hip block
  const pelvisProfile = [
    new THREE.Vector2(0.01, -0.09),
    new THREE.Vector2(0.13, -0.06),
    new THREE.Vector2(0.16, 0.02),
    new THREE.Vector2(0.125, 0.1),
    new THREE.Vector2(0.01, 0.11),
  ];
  pushPart(
    preparePart(
      new THREE.LatheGeometry(pelvisProfile, 24),
      jointDark,
      makeTransform(0, 0.94, 0, 0, 0, 0, 1.05, 1, 0.78),
    ),
  );

  // Waist
  pushPart(createLimbPart([0, 1.03, 0], [0, 1.21, 0], 0.11, 0.125, jointDark, 8));

  // Ribcage / Chest
  const chestProfile = [
    new THREE.Vector2(0.01, -0.14),
    new THREE.Vector2(0.13, -0.12),
    new THREE.Vector2(0.19, 0.03),
    new THREE.Vector2(0.17, 0.14),
    new THREE.Vector2(0.075, 0.18),
    new THREE.Vector2(0.01, 0.18),
  ];
  pushPart(
    preparePart(
      new THREE.LatheGeometry(chestProfile, 26),
      ivory,
      makeTransform(0, 1.36, 0.01, 0, 0, 0, 1.06, 1.0, 0.76),
    ),
  );

  // Neck
  pushPart(createLimbPart([0, 1.52, 0], [0, 1.65, 0], 0.056, 0.048, jointDark, 6));

  // Upper Cranium / Head
  pushPart(
    preparePart(
      new THREE.SphereGeometry(0.106, 26, 20),
      ivory,
      makeTransform(0, 1.77, 0.005, 0, 0, 0, 0.9, 1.04, 0.96),
    ),
  );

  // Articulated Lower Jaw / Chin (tag 1)
  pushPart(
    preparePart(
      new THREE.SphereGeometry(0.072, 20, 14),
      ivory,
      makeTransform(0, 1.685, 0.032, 0.15, 0, 0, 0.88, 0.72, 0.92),
    ),
    1,
  );

  // Mouth cavity interior (neutral backdrop)
  pushPart(
    preparePart(
      new THREE.BoxGeometry(0.068, 0.022, 0.024),
      mouthDark,
      makeTransform(0, 1.702, 0.088),
    ),
  );

  // Upper & Lower Sculpted Lips + Mouth Corners (tags 2, 1, 3)
  pushPart(
    preparePart(
      new THREE.CapsuleGeometry(0.0085, 0.042, 6, 12),
      lipColor,
      makeTransform(0, 1.713, 0.1, 0, 0, Math.PI / 2),
    ),
    2,
  );
  pushPart(
    preparePart(
      new THREE.CapsuleGeometry(0.009, 0.038, 6, 12),
      lipColor,
      makeTransform(0, 1.694, 0.098, 0, 0, Math.PI / 2),
    ),
    1,
  );
  for (const side of [1, -1]) {
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.009, 10, 8),
        lipColor,
        makeTransform(side * 0.028, 1.703, 0.094),
      ),
      3,
    );
  }

  // Sculpted Nose (tag 8)
  pushPart(
    preparePart(
      new THREE.ConeGeometry(0.017, 0.046, 12),
      earColor,
      makeTransform(0, 1.742, 0.106, -0.45, 0, 0),
    ),
    8,
  );

  // Eyes (Sclera + Iris), Eyelids + Eyelashes, Eyebrows, Ears
  for (const side of [1, -1]) {
    const isLeft = side > 0;
    // Eyeball + Iris
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.019, 14, 12),
        eyeWhite,
        makeTransform(side * 0.041, 1.768, 0.084),
      ),
    );
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.01, 12, 10),
        irisColor,
        makeTransform(side * 0.041, 1.768, 0.098),
      ),
    );

    // Upper Eyelid + Eyelash Fringe (tag 6 left, 7 right)
    pushPart(
      preparePart(
        new THREE.BoxGeometry(0.036, 0.011, 0.022),
        ivory,
        makeTransform(side * 0.041, 1.784, 0.092),
      ),
      isLeft ? 6 : 7,
    );
    pushPart(
      preparePart(
        new THREE.BoxGeometry(0.038, 0.0055, 0.014),
        lashBrowColor,
        makeTransform(side * 0.041, 1.779, 0.102, 0.25, 0, 0),
      ),
      isLeft ? 6 : 7,
    );

    // Eyebrow Arc (tag 4 left, 5 right)
    pushPart(
      preparePart(
        new THREE.CapsuleGeometry(0.0065, 0.032, 6, 10),
        lashBrowColor,
        makeTransform(side * 0.042, 1.806, 0.097, 0, 0, Math.PI / 2 + side * 0.08),
      ),
      isLeft ? 4 : 5,
    );

    // Ear (tag 9)
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.024, 12, 10),
        earColor,
        makeTransform(side * 0.1, 1.758, 0.004, 0, 0, side * -0.15, 0.48, 1.25, 0.72),
      ),
      9,
    );
  }

  // Arms + Articulated Hands + 10 Fingers!
  for (const side of [1, -1]) {
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.064, 18, 14),
        jointDark,
        makeTransform(side * 0.21, 1.49, 0),
      ),
    );
    pushPart(createLimbPart([side * 0.21, 1.49, 0], [side * 0.47, 1.49, 0], 0.054, 0.043, ivory, 10));
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.043, 14, 12),
        jointDark,
        makeTransform(side * 0.47, 1.49, 0),
      ),
    );
    pushPart(createLimbPart([side * 0.47, 1.49, 0], [side * 0.71, 1.49, 0], 0.044, 0.033, ivory, 10));
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.03, 12, 10),
        jointDark,
        makeTransform(side * 0.71, 1.49, 0),
      ),
    );
    // Palm block
    pushPart(
      preparePart(
        new THREE.BoxGeometry(0.072, 0.026, 0.068),
        ivory,
        makeTransform(side * 0.746, 1.49, 0),
      ),
    );

    // 5 Articulated Fingers per Hand
    const fingers = [
      { z: 0.036, x0: 0.742, l1: 0.03, l2: 0.026, r: 0.0085 },
      { z: 0.024, x0: 0.782, l1: 0.034, l2: 0.028, r: 0.0072 },
      { z: 0.008, x0: 0.784, l1: 0.038, l2: 0.03, r: 0.0074 },
      { z: -0.008, x0: 0.782, l1: 0.034, l2: 0.028, r: 0.007 },
      { z: -0.024, x0: 0.778, l1: 0.028, l2: 0.022, r: 0.0062 },
    ];
    for (const f of fingers) {
      const p0: [number, number, number] = [side * f.x0, 1.49, f.z];
      const p1: [number, number, number] = [side * (f.x0 + f.l1), 1.49, f.z];
      const p2: [number, number, number] = [side * (f.x0 + f.l1 + f.l2), 1.49, f.z];
      pushPart(createLimbPart(p0, p1, f.r, f.r * 0.9, ivory, 4));
      pushPart(createLimbPart(p1, p2, f.r * 0.88, f.r * 0.72, jointDark, 4));
    }
  }

  // Legs (Symmetrical)
  for (const side of [1, -1]) {
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.07, 16, 12),
        jointDark,
        makeTransform(side * 0.11, 0.9, 0),
      ),
    );
    pushPart(createLimbPart([side * 0.11, 0.9, 0], [side * 0.11, 0.48, 0], 0.074, 0.053, ivory, 12));
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.052, 14, 12),
        jointDark,
        makeTransform(side * 0.11, 0.48, 0.01),
      ),
    );
    pushPart(createLimbPart([side * 0.11, 0.48, 0], [side * 0.11, 0.07, 0], 0.055, 0.038, ivory, 12));
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.038, 12, 10),
        jointDark,
        makeTransform(side * 0.11, 0.07, 0),
      ),
    );
    pushPart(
      preparePart(
        new THREE.BoxGeometry(0.09, 0.065, 0.21),
        ivory,
        makeTransform(side * 0.11, 0.0325, 0.055),
      ),
    );
  }

  // Build vertex tag map aligned with merged vertices
  let totalVerts = 0;
  for (const p of parts) totalVerts += p.attributes.position.count;
  const vertexTags = new Uint8Array(totalVerts);
  let offset = 0;
  parts.forEach((p, idx) => {
    const cnt = p.attributes.position.count;
    vertexTags.fill(partTags[idx], offset, offset + cnt);
    offset += cnt;
  });

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());

  attachExpressiveFaceMorphTargets(merged, vertexTags);
  const morphTargetNames = (merged.userData.morphTargetNames as string[]) ?? [];

  return { geometry: merged, morphTargetNames };
}

function buildMechGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const armor = '#94a3b8';
  const chassis = '#1e293b';
  const trim = '#f59e0b';

  const torsoShape = new THREE.Shape();
  torsoShape.moveTo(-0.18, -0.14);
  torsoShape.lineTo(0.18, -0.14);
  torsoShape.lineTo(0.24, 0.05);
  torsoShape.lineTo(0.14, 0.21);
  torsoShape.lineTo(-0.14, 0.21);
  torsoShape.lineTo(-0.24, 0.05);
  torsoShape.closePath();

  const torsoGeo = new THREE.ExtrudeGeometry(torsoShape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 2,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
  torsoGeo.center();
  parts.push(preparePart(torsoGeo, armor, makeTransform(0, 1.35, 0.02)));

  parts.push(
    preparePart(
      new THREE.CylinderGeometry(0.065, 0.065, 0.04, 16),
      trim,
      makeTransform(0, 1.37, 0.16, Math.PI / 2),
    ),
  );
  parts.push(preparePart(new THREE.BoxGeometry(0.28, 0.14, 0.2), chassis, makeTransform(0, 0.94, 0)));
  parts.push(createLimbPart([0, 0.98, 0], [0, 1.2, 0], 0.09, 0.1, chassis, 6));
  parts.push(preparePart(new THREE.BoxGeometry(0.18, 0.14, 0.18), armor, makeTransform(0, 1.69, 0.02)));
  parts.push(preparePart(new THREE.BoxGeometry(0.14, 0.045, 0.05), trim, makeTransform(0, 1.7, 0.1)));

  for (const side of [1, -1]) {
    parts.push(preparePart(new THREE.BoxGeometry(0.16, 0.15, 0.18), armor, makeTransform(side * 0.26, 1.5, 0)));
    parts.push(createLimbPart([side * 0.24, 1.49, 0], [side * 0.48, 1.49, 0], 0.055, 0.048, chassis, 8));
    parts.push(preparePart(new THREE.CylinderGeometry(0.052, 0.052, 0.09, 12), trim, makeTransform(side * 0.48, 1.49, 0)));
    parts.push(createLimbPart([side * 0.48, 1.49, 0], [side * 0.72, 1.49, 0], 0.062, 0.05, armor, 8));
    parts.push(preparePart(new THREE.BoxGeometry(0.11, 0.09, 0.09), chassis, makeTransform(side * 0.78, 1.49, 0)));
  }

  for (const side of [1, -1]) {
    parts.push(preparePart(new THREE.CylinderGeometry(0.065, 0.065, 0.12, 12), chassis, makeTransform(side * 0.13, 0.9, 0, 0, 0, Math.PI / 2)));
    parts.push(createLimbPart([side * 0.14, 0.9, 0], [side * 0.14, 0.48, 0], 0.088, 0.072, armor, 10));
    parts.push(preparePart(new THREE.BoxGeometry(0.11, 0.11, 0.13), trim, makeTransform(side * 0.14, 0.48, 0.02)));
    parts.push(createLimbPart([side * 0.14, 0.48, 0], [side * 0.14, 0.09, 0], 0.075, 0.058, chassis, 10));
    parts.push(preparePart(new THREE.BoxGeometry(0.14, 0.08, 0.25), armor, makeTransform(side * 0.14, 0.04, 0.05)));
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function buildQuadrupedGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bodyColor = '#cbd5e1';
  const jointColor = '#334155';
  const collarAmber = '#f59e0b';

  parts.push(createLimbPart([0, 0.68, -0.35], [0, 0.72, 0.28], 0.135, 0.165, bodyColor, 14));
  parts.push(preparePart(new THREE.SphereGeometry(0.14, 18, 14), jointColor, makeTransform(0, 0.68, -0.35, 0, 0, 0, 1, 0.92, 1.1)));
  parts.push(preparePart(new THREE.SphereGeometry(0.18, 20, 16), bodyColor, makeTransform(0, 0.73, 0.28, 0, 0, 0, 0.95, 1.05, 1.2)));
  parts.push(createLimbPart([0, 0.84, 0.36], [0, 1.01, 0.54], 0.085, 0.068, jointColor, 8));
  parts.push(preparePart(new THREE.TorusGeometry(0.088, 0.018, 10, 20), collarAmber, makeTransform(0, 0.9, 0.42, Math.PI * 0.32)));
  parts.push(preparePart(new THREE.SphereGeometry(0.11, 18, 14), bodyColor, makeTransform(0, 1.04, 0.58, 0, 0, 0, 0.95, 0.9, 1.15)));
  parts.push(createLimbPart([0, 1.02, 0.65], [0, 1.0, 0.8], 0.062, 0.04, jointColor, 6));
  for (const side of [1, -1]) {
    parts.push(preparePart(new THREE.ConeGeometry(0.036, 0.11, 10), jointColor, makeTransform(side * 0.068, 1.15, 0.54, -0.15, 0, side * -0.18)));
  }
  parts.push(createLimbPart([0, 0.74, -0.49], [0, 0.88, -0.75], 0.038, 0.02, jointColor, 8));

  const legAnchors: [number, number, number][] = [
    [0.14, 0.65, 0.31],
    [-0.14, 0.65, 0.31],
    [0.14, 0.64, -0.35],
    [-0.14, 0.64, -0.35],
  ];

  for (const [lx, ly, lz] of legAnchors) {
    parts.push(preparePart(new THREE.SphereGeometry(0.056, 14, 10), jointColor, makeTransform(lx, ly, lz)));
    parts.push(createLimbPart([lx, ly, lz], [lx, 0.34, lz], 0.055, 0.038, bodyColor, 10));
    parts.push(preparePart(new THREE.SphereGeometry(0.038, 12, 10), jointColor, makeTransform(lx, 0.34, lz)));
    parts.push(createLimbPart([lx, 0.34, lz], [lx, 0.04, lz + 0.02], 0.038, 0.028, bodyColor, 10));
    parts.push(preparePart(new THREE.SphereGeometry(0.042, 12, 10), jointColor, makeTransform(lx, 0.035, lz + 0.04, 0, 0, 0, 1, 0.65, 1.3)));
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function captureRestPose(bones: THREE.Bone[]) {
  const restPositions = new Map<string, THREE.Vector3>();
  const restQuaternions = new Map<string, THREE.Quaternion>();
  const restScales = new Map<string, THREE.Vector3>();
  for (const b of bones) {
    restPositions.set(b.name, b.position.clone());
    restQuaternions.set(b.name, b.quaternion.clone());
    restScales.set(b.name, b.scale.clone());
  }
  return { restPositions, restQuaternions, restScales };
}

export function createPresetRigAsset(presetId: PresetModelId): LoadedRigAsset {
  let geometry: THREE.BufferGeometry;
  let root: THREE.Bone;
  let bones: THREE.Bone[];
  let label: string;
  let morphTargetNames: string[] = [];
  let lumiVertexTags: Uint8Array | null = null;

  if (presetId === 'quadruped') {
    geometry = buildQuadrupedGeometry();
    const sk = buildQuadrupedSkeleton();
    root = sk.root;
    bones = sk.bones;
    label = 'Quadruped Hound';
  } else if (presetId === 'mech') {
    geometry = buildMechGeometry();
    const sk = buildBipedSkeleton(false);
    root = sk.root;
    bones = sk.bones;
    label = 'Articulated Mech';
  } else if (presetId === 'lumi') {
    const res = buildLumiTourGuideGeometry(attachExpressiveFaceMorphTargets);
    geometry = res.geometry;
    morphTargetNames = res.morphTargetNames;
    lumiVertexTags = res.vertexTags;
    const sk = buildBipedSkeleton(true);
    root = sk.root;
    bones = sk.bones;
    label = 'Lumi Tour Guide';
  } else {
    const res = buildMannequinGeometry();
    geometry = res.geometry;
    morphTargetNames = res.morphTargetNames;
    const sk = buildBipedSkeleton(true);
    root = sk.root;
    bones = sk.bones;
    label = 'Studio Mannequin';
  }

  const material = createStudioRigMaterial('studio');
  const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
  skinnedMesh.name = label;
  skinnedMesh.castShadow = true;
  skinnedMesh.receiveShadow = true;

  // Register morphTargetDictionary & morphTargetInfluences on the SkinnedMesh
  if (morphTargetNames.length > 0) {
    const dict: Record<string, number> = {};
    morphTargetNames.forEach((n, idx) => {
      dict[n] = idx;
    });
    skinnedMesh.morphTargetDictionary = dict;
    skinnedMesh.morphTargetInfluences = new Array(morphTargetNames.length).fill(0);
  }

  skinnedMesh.add(root);
  root.updateMatrixWorld(true);
  computeAutoSkinWeights(geometry, bones, 3.6);

  if (lumiVertexTags) {
    const boneIdx = (name: string) => bones.findIndex((b) => b.name === name);
    const idxHead = boneIdx('Head');
    const idxJaw = boneIdx('Jaw');
    const idxLBrow = boneIdx('LeftBrow');
    const idxRBrow = boneIdx('RightBrow');
    const idxLEyelid = boneIdx('LeftEyelid');
    const idxREyelid = boneIdx('RightEyelid');
    const idxNose = boneIdx('Nose');
    const idxLEar = boneIdx('LeftEar');
    const idxREar = boneIdx('RightEar');

    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const skinIndices = geometry.attributes.skinIndex as THREE.BufferAttribute;
    const skinWeights = geometry.attributes.skinWeight as THREE.BufferAttribute;

    const lockToBone = (vIdx: number, bIdx: number) => {
      if (bIdx < 0) return;
      skinIndices.setXYZW(vIdx, bIdx, 0, 0, 0);
      skinWeights.setXYZW(vIdx, 1, 0, 0, 0);
    };

    for (let i = 0; i < lumiVertexTags.length; i++) {
      const tag = lumiVertexTags[i];
      if (tag === 10 || tag === 2 || tag === 3) {
        lockToBone(i, idxHead);
      } else if (tag === 1) {
        lockToBone(i, idxJaw >= 0 ? idxJaw : idxHead);
      } else if (tag === 4) {
        lockToBone(i, idxLBrow >= 0 ? idxLBrow : idxHead);
      } else if (tag === 5) {
        lockToBone(i, idxRBrow >= 0 ? idxRBrow : idxHead);
      } else if (tag === 6) {
        lockToBone(i, idxLEyelid >= 0 ? idxLEyelid : idxHead);
      } else if (tag === 7) {
        lockToBone(i, idxREyelid >= 0 ? idxREyelid : idxHead);
      } else if (tag === 8) {
        lockToBone(i, idxNose >= 0 ? idxNose : idxHead);
      } else if (tag === 9) {
        const earIdx = posAttr.getX(i) >= 0 ? idxLEar : idxREar;
        lockToBone(i, earIdx >= 0 ? earIdx : idxHead);
      }
    }
    skinIndices.needsUpdate = true;
    skinWeights.needsUpdate = true;
  }

  const allMeshes: THREE.Mesh[] = [skinnedMesh];
  if (presetId === 'lumi') {
    const chestBone = bones.find((b) => b.name === 'Chest');
    if (chestBone) {
      const badge = createTourGuideBadgeMesh();
      chestBone.add(badge);
      allMeshes.push(badge);
    }
  }

  const skeleton = new THREE.Skeleton(bones);
  skinnedMesh.bind(skeleton);

  const bindings = buildRigChannelBindings(skinnedMesh, bones);
  const rest = captureRestPose(bones);

  return {
    name: label,
    rootObject: skinnedMesh,
    skinnedMesh,
    skinnedMeshes: [skinnedMesh],
    allMeshes,
    skeleton,
    bones,
    bindings,
    ...rest,
    isCustomMesh: false,
  };
}

/**
 * Loads ANY user-provided .glb, .gltf, .fbx, or .obj file.
 * Preserves full multi-mesh characters (face blendshapes, eyes, eyelashes, fingers, materials),
 * or auto-rigs static meshes with a full expressive skeleton!
 */
export async function loadCustomRigAsset(
  file: File,
  autoRigTemplate: 'biped' | 'quadruped' = 'biped',
): Promise<LoadedRigAsset> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const buffer = await file.arrayBuffer();

  let rootGroup: THREE.Object3D;

  if (ext === 'obj') {
    const text = new TextDecoder().decode(buffer);
    rootGroup = new OBJLoader().parse(text);
  } else if (ext === 'fbx') {
    rootGroup = new FBXLoader().parse(buffer, '');
  } else if (ext === 'glb' || ext === 'gltf') {
    const loader = new GLTFLoader();
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      loader.parse(buffer, '', (res) => resolve(res), reject);
    });
    rootGroup = gltf.scene;
  } else {
    throw new Error('Unsupported format. Please upload a .glb, .gltf, .fbx, or .obj file.');
  }

  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  const allMeshes: THREE.Mesh[] = [];
  const uniqueBonesSet = new Set<THREE.Bone>();

  rootGroup.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const m = child as THREE.Mesh;
      m.castShadow = true;
      m.receiveShadow = true;
      allMeshes.push(m);
    }
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
      const sm = child as THREE.SkinnedMesh;
      skinnedMeshes.push(sm);
      if (sm.skeleton) {
        sm.skeleton.bones.forEach((b) => uniqueBonesSet.add(b));
      }
    }
    if ((child as THREE.Bone).isBone) {
      uniqueBonesSet.add(child as THREE.Bone);
    }
  });

  if (skinnedMeshes.length > 0 && uniqueBonesSet.size > 0) {
    // Preserve entire multi-mesh rigged character, normalize height to ~1.8m and ground at y=0
    rootGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rootGroup);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scaleFactor = 1.8 / maxDim;

    rootGroup.scale.multiplyScalar(scaleFactor);
    rootGroup.updateMatrixWorld(true);

    const newBox = new THREE.Box3().setFromObject(rootGroup);
    const center = newBox.getCenter(new THREE.Vector3());
    rootGroup.position.x -= center.x;
    rootGroup.position.z -= center.z;
    rootGroup.position.y -= newBox.min.y;
    rootGroup.updateMatrixWorld(true);

    const bones = Array.from(uniqueBonesSet);
    bones.forEach((b, i) => {
      if (!b.name) b.name = `Bone_${i}`;
    });

    // Pick primary SkinnedMesh with most vertices (usually body or face)
    const primarySkinned = [...skinnedMeshes].sort(
      (a, b) =>
        (b.geometry.attributes.position?.count ?? 0) -
        (a.geometry.attributes.position?.count ?? 0),
    )[0];

    const bindings = buildRigChannelBindings(rootGroup, bones);
    const rest = captureRestPose(bones);

    return {
      name: file.name.replace(/\.(glb|gltf|fbx|obj)$/i, ''),
      rootObject: rootGroup,
      skinnedMesh: primarySkinned,
      skinnedMeshes,
      allMeshes,
      skeleton: primarySkinned.skeleton,
      bones,
      bindings,
      ...rest,
      isCustomMesh: true,
    };
  }

  // Unrigged static mesh -> normalize while preserving PBR materials & textures,
  // auto-fit expressive skeleton + facial morph targets + region-aware skinning!
  return buildAutoRiggedAssetFromScene(
    rootGroup,
    file.name.replace(/\.(glb|gltf|fbx|obj)$/i, ''),
    autoRigTemplate,
  );
}

let cachedSampleBoyBuffer: ArrayBuffer | null = null;

/**
 * Loads the built-in user-uploaded textured GLB character (/models/sample_boy.glb)
 * and rigs it with the fitted expressive biped skeleton, 10 fingers, and 16 facial morph targets.
 * Supports Low / Medium / High LOD quality presets without altering character identity or bones.
 */
export async function loadSampleBoyRigAsset(
  url = '/models/sample_boy.glb',
  qualityPreset: QualityPreset = 'high',
): Promise<LoadedRigAsset> {
  if (!cachedSampleBoyBuffer || url !== '/models/sample_boy.glb') {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url} (${res.status})`);
    }
    const buf = await res.arrayBuffer();
    if (url === '/models/sample_boy.glb') {
      cachedSampleBoyBuffer = buf;
    } else {
      const loader = new GLTFLoader();
      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        loader.parse(buf, '', (g) => resolve(g), reject);
      });
      return buildAutoRiggedAssetFromScene(gltf.scene, 'Uploaded Boy GLB', 'biped', qualityPreset);
    }
  }

  const loader = new GLTFLoader();
  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    loader.parse(cachedSampleBoyBuffer!.slice(0), '', (g) => resolve(g), reject);
  });

  return buildAutoRiggedAssetFromScene(gltf.scene, 'Uploaded Boy GLB', 'biped', qualityPreset);
}

function buildAutoRiggedAssetFromScene(
  rootGroup: THREE.Object3D,
  assetName: string,
  autoRigTemplate: 'biped' | 'quadruped',
  qualityPreset: QualityPreset = 'high',
): LoadedRigAsset {
  const sourceGeoms: THREE.BufferGeometry[] = [];
  const sourceMats: THREE.Material[] = [];

  rootGroup.updateMatrixWorld(true);
  rootGroup.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const m = child as THREE.Mesh;
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        const count = g.attributes.position.count;
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      // Remove incompatible extra attributes before merging
      for (const key of Object.keys(g.attributes)) {
        if (key !== 'position' && key !== 'normal' && key !== 'uv' && key !== 'color') {
          g.deleteAttribute(key);
        }
      }

      const rawMats = Array.isArray(m.material) ? m.material : [m.material];
      const clonedMat = rawMats[0]
        ? rawMats[0].clone()
        : createStudioRigMaterial('studio');
      clonedMat.side = THREE.DoubleSide;
      if ('vertexColors' in clonedMat) {
        clonedMat.userData.origVertexColors = Boolean(
          (clonedMat as THREE.MeshStandardMaterial).vertexColors,
        );
      }

      sourceGeoms.push(g);
      sourceMats.push(clonedMat);
    }
  });

  if (sourceGeoms.length === 0) {
    throw new Error('No 3D mesh geometry found inside the uploaded file.');
  }

  let merged: THREE.BufferGeometry;
  let finalMaterial: THREE.Material | THREE.Material[];

  if (sourceGeoms.length === 1) {
    merged = sourceGeoms[0];
    finalMaterial = sourceMats[0];
  } else {
    // Ensure consistent indexing & color attribute presence before multi-group merge
    const anyHasColor = sourceGeoms.some((g) => Boolean(g.attributes.color));
    const preparedGeoms = sourceGeoms.map((g) => {
      const out = g.index ? g.toNonIndexed() : g;
      if (anyHasColor && !out.attributes.color) {
        const count = out.attributes.position.count;
        const arr = new Float32Array(count * 3).fill(1);
        out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      }
      return out;
    });
    merged = mergeGeometries(preparedGeoms, true);
    preparedGeoms.forEach((p) => {
      if (!sourceGeoms.includes(p)) p.dispose();
    });
    sourceGeoms.forEach((p) => p.dispose());
    finalMaterial = sourceMats;
  }

  merged.computeBoundingBox();
  const box = merged.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const targetHeight = autoRigTemplate === 'quadruped' ? 1.15 : 1.8;
  const scaleFactor = targetHeight / (size.y || Math.max(size.x, size.z) || 1);

  const normMatrix = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
  const scaleMatrix = new THREE.Matrix4().makeScale(scaleFactor, scaleFactor, scaleFactor);
  merged.applyMatrix4(normMatrix);
  merged.applyMatrix4(scaleMatrix);
  if (!merged.attributes.normal) {
    merged.computeVertexNormals();
  }

  let root: THREE.Bone;
  let bones: THREE.Bone[];
  let morphTargetNames: string[] = [];
  let armRestBasis: Record<string, { pre: THREE.Quaternion; post: THREE.Quaternion }> | null =
    null;

  if (autoRigTemplate === 'quadruped') {
    const sk = buildQuadrupedSkeleton();
    root = sk.root;
    bones = sk.bones;
  } else {
    const lm = analyzeStaticBipedLandmarks(merged);
    if (qualityPreset !== 'high') {
      const decimated = decimateGeometryForQuality(merged, qualityPreset, lm);
      if (decimated !== merged) {
        merged.dispose();
        merged = decimated;
      }
      const matsArr = Array.isArray(finalMaterial) ? finalMaterial : [finalMaterial];
      optimizeMaterialsForQuality(matsArr, qualityPreset);
    }
    const sk = buildFittedBipedSkeleton(lm);
    root = sk.root;
    bones = sk.bones;
    armRestBasis = sk.armRestBasis;
    morphTargetNames = attachFittedFaceMorphTargets(merged, lm);
    root.updateMatrixWorld(true);
    computeRegionAwareBipedWeights(merged, bones, lm, 3.6);
  }

  const skinnedMesh = new THREE.SkinnedMesh(merged, finalMaterial);
  skinnedMesh.name = assetName;
  skinnedMesh.castShadow = true;
  skinnedMesh.receiveShadow = true;
  skinnedMesh.userData.qualityPreset = qualityPreset;
  if (armRestBasis) {
    skinnedMesh.userData.armRestBasis = armRestBasis;
  }

  if (morphTargetNames.length > 0) {
    const dict: Record<string, number> = {};
    morphTargetNames.forEach((n, idx) => {
      dict[n] = idx;
    });
    skinnedMesh.morphTargetDictionary = dict;
    skinnedMesh.morphTargetInfluences = new Array(morphTargetNames.length).fill(0);
  }

  skinnedMesh.add(root);
  root.updateMatrixWorld(true);

  if (autoRigTemplate === 'quadruped') {
    computeAutoSkinWeights(merged, bones, 3.2);
  }

  const skeleton = new THREE.Skeleton(bones);
  skinnedMesh.bind(skeleton);

  const bindings = buildRigChannelBindings(skinnedMesh, bones);
  const rest = captureRestPose(bones);

  return {
    name: assetName,
    rootObject: skinnedMesh,
    skinnedMesh,
    skinnedMeshes: [skinnedMesh],
    allMeshes: [skinnedMesh],
    skeleton,
    bones,
    bindings,
    ...rest,
    isCustomMesh: true,
  };
}
