import * as THREE from 'three';
import { RigChannelSummary } from './types';

export interface MorphTargetRef {
  mesh: THREE.Mesh;
  index: number;
  name: string;
}

export type SemanticBoneKey =
  | 'pelvis'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'jaw'
  | 'mouth'
  | 'leftEye'
  | 'rightEye'
  | 'leftEyelid'
  | 'rightEyelid'
  | 'leftBrow'
  | 'rightBrow'
  | 'nose'
  | 'leftEar'
  | 'rightEar'
  | 'leftShoulder'
  | 'leftUpperArm'
  | 'leftForearm'
  | 'leftHand'
  | 'rightShoulder'
  | 'rightUpperArm'
  | 'rightForearm'
  | 'rightHand'
  | 'leftThigh'
  | 'leftShin'
  | 'leftFoot'
  | 'rightThigh'
  | 'rightShin'
  | 'rightFoot';

export type FingerKey =
  | 'leftThumb'
  | 'leftIndex'
  | 'leftMiddle'
  | 'leftRing'
  | 'leftPinky'
  | 'rightThumb'
  | 'rightIndex'
  | 'rightMiddle'
  | 'rightRing'
  | 'rightPinky';

export type MorphChannelKey =
  | 'jawOpen'
  | 'visemeAA'
  | 'visemeO'
  | 'visemeE'
  | 'visemeI'
  | 'visemePP'
  | 'visemeFV'
  | 'visemeTH'
  | 'mouthSmile'
  | 'mouthFrown'
  | 'cheekSquint'
  | 'browUp'
  | 'browDown'
  | 'eyeBlinkLeft'
  | 'eyeBlinkRight'
  | 'eyeLookUp'
  | 'eyeLookDown'
  | 'eyeLookIn'
  | 'eyeLookOut'
  | 'noseSneer'
  | 'earPerk';

export interface RigChannelBindings {
  bones: Partial<Record<SemanticBoneKey, THREE.Bone>>;
  fingers: Record<FingerKey, THREE.Bone[]>;
  morphs: Record<MorphChannelKey, MorphTargetRef[]>;
  allMorphNames: string[];
  summary: RigChannelSummary;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/^mixamorig[:_]?/, '').replace(/[^a-z0-9]/g, '');
}

function isLeft(n: string): boolean {
  return /(^left|left$|_l$|\.l$|l_|lefteye|leftear|leftbrow|lefthand|leftarm|leftleg|leftfoot)/.test(
    n.toLowerCase(),
  ) || n.toLowerCase().includes('left') || /(?:^|[_.\-])l(?:[_.\-]|$)/.test(n.toLowerCase());
}

function isRight(n: string): boolean {
  return /(^right|right$|_r$|\.r$|r_|righteye|rightear|rightbrow|righthand|rightarm|rightleg|rightfoot)/.test(
    n.toLowerCase(),
  ) || n.toLowerCase().includes('right') || /(?:^|[_.\-])r(?:[_.\-]|$)/.test(n.toLowerCase());
}

/**
 * Automatically maps any uploaded GLB/GLTF/FBX skeleton & morph targets
 * to semantic body, face, eye, eyelash, brow, nose, ear, and finger channels.
 */
export function buildRigChannelBindings(
  rootObject: THREE.Object3D,
  bones: THREE.Bone[],
): RigChannelBindings {
  const mappedBones: Partial<Record<SemanticBoneKey, THREE.Bone>> = {};
  const fingers: Record<FingerKey, THREE.Bone[]> = {
    leftThumb: [],
    leftIndex: [],
    leftMiddle: [],
    leftRing: [],
    leftPinky: [],
    rightThumb: [],
    rightIndex: [],
    rightMiddle: [],
    rightRing: [],
    rightPinky: [],
  };

  const assignIfEmpty = (key: SemanticBoneKey, bone: THREE.Bone) => {
    if (!mappedBones[key]) mappedBones[key] = bone;
  };

  for (const b of bones) {
    const raw = b.name;
    const n = norm(raw);
    const left = isLeft(raw);
    const right = isRight(raw);

    // Fingers (check before hand/arm so "LeftHandIndex1" maps to finger, not hand)
    const isThumb = n.includes('thumb');
    const isIndex = n.includes('index') || n.includes('pointer');
    const isMiddle = n.includes('middle');
    const isRing = n.includes('ring');
    const isPinky = n.includes('pinky') || n.includes('little');

    if (isThumb || isIndex || isMiddle || isRing || isPinky) {
      if (left) {
        if (isThumb) fingers.leftThumb.push(b);
        else if (isIndex) fingers.leftIndex.push(b);
        else if (isMiddle) fingers.leftMiddle.push(b);
        else if (isRing) fingers.leftRing.push(b);
        else if (isPinky) fingers.leftPinky.push(b);
      } else if (right) {
        if (isThumb) fingers.rightThumb.push(b);
        else if (isIndex) fingers.rightIndex.push(b);
        else if (isMiddle) fingers.rightMiddle.push(b);
        else if (isRing) fingers.rightRing.push(b);
        else if (isPinky) fingers.rightPinky.push(b);
      }
      continue;
    }

    // Face bones
    if (n.includes('jaw') || n.includes('chin')) {
      assignIfEmpty('jaw', b);
      continue;
    }
    if (n.includes('mouth') || n.includes('lip')) {
      assignIfEmpty('mouth', b);
      continue;
    }
    if (n.includes('eyelid') || n.includes('eyelash') || n.includes('lash') || n.includes('lid')) {
      if (left) assignIfEmpty('leftEyelid', b);
      else if (right) assignIfEmpty('rightEyelid', b);
      continue;
    }
    if (n.includes('brow')) {
      if (left) assignIfEmpty('leftBrow', b);
      else if (right) assignIfEmpty('rightBrow', b);
      continue;
    }
    if (n.includes('eye') && !n.includes('brow') && !n.includes('lid')) {
      if (left) assignIfEmpty('leftEye', b);
      else if (right) assignIfEmpty('rightEye', b);
      continue;
    }
    if (n.includes('nose') || n.includes('snout') || n.includes('nostril')) {
      assignIfEmpty('nose', b);
      continue;
    }
    if (n.includes('ear')) {
      if (left) assignIfEmpty('leftEar', b);
      else if (right) assignIfEmpty('rightEar', b);
      continue;
    }

    // Core spine & head
    if (n === 'pelvis' || n === 'hips' || n === 'hip' || n === 'root') {
      assignIfEmpty('pelvis', b);
      continue;
    }
    if (n.includes('chest') || n === 'spine2' || n === 'spine02' || n === 'upperchest') {
      assignIfEmpty('chest', b);
      continue;
    }
    if (n.includes('spine')) {
      assignIfEmpty('spine', b);
      continue;
    }
    if (n.includes('neck')) {
      assignIfEmpty('neck', b);
      continue;
    }
    if (n === 'head' || (n.includes('head') && !n.includes('top') && !n.includes('end'))) {
      assignIfEmpty('head', b);
      continue;
    }

    // Arms
    if (n.includes('shoulder') || n.includes('clavicle') || n.includes('collar')) {
      if (left) assignIfEmpty('leftShoulder', b);
      else if (right) assignIfEmpty('rightShoulder', b);
      continue;
    }
    if (n.includes('upperarm') || n === 'arm' || (n.includes('arm') && !n.includes('fore') && !n.includes('lower'))) {
      if (left) assignIfEmpty('leftUpperArm', b);
      else if (right) assignIfEmpty('rightUpperArm', b);
      continue;
    }
    if (n.includes('forearm') || n.includes('lowerarm') || n.includes('elbow')) {
      if (left) assignIfEmpty('leftForearm', b);
      else if (right) assignIfEmpty('rightForearm', b);
      continue;
    }
    if (n.includes('hand') || n.includes('wrist')) {
      if (left) assignIfEmpty('leftHand', b);
      else if (right) assignIfEmpty('rightHand', b);
      continue;
    }

    // Legs
    if (n.includes('thigh') || n.includes('upleg') || n.includes('upperleg')) {
      if (left) assignIfEmpty('leftThigh', b);
      else if (right) assignIfEmpty('rightThigh', b);
      continue;
    }
    if (n.includes('shin') || n.includes('calf') || n === 'leg' || n.includes('lowerleg')) {
      if (left) assignIfEmpty('leftShin', b);
      else if (right) assignIfEmpty('rightShin', b);
      continue;
    }
    if (n.includes('foot') || n.includes('ankle') || n.includes('paw')) {
      if (left) assignIfEmpty('leftFoot', b);
      else if (right) assignIfEmpty('rightFoot', b);
      continue;
    }
  }

  // Sort finger bone chains by name/hierarchy order so phalanx 1 -> 2 -> 3
  (Object.keys(fingers) as FingerKey[]).forEach((fk) => {
    fingers[fk].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  });

  // Collect & map all morph targets across all meshes in rootObject
  const morphs: Record<MorphChannelKey, MorphTargetRef[]> = {
    jawOpen: [],
    visemeAA: [],
    visemeO: [],
    visemeE: [],
    visemeI: [],
    visemePP: [],
    visemeFV: [],
    visemeTH: [],
    mouthSmile: [],
    mouthFrown: [],
    cheekSquint: [],
    browUp: [],
    browDown: [],
    eyeBlinkLeft: [],
    eyeBlinkRight: [],
    eyeLookUp: [],
    eyeLookDown: [],
    eyeLookIn: [],
    eyeLookOut: [],
    noseSneer: [],
    earPerk: [],
  };

  const allMorphNamesSet = new Set<string>();

  rootObject.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

    for (const [mName, index] of Object.entries(mesh.morphTargetDictionary)) {
      allMorphNamesSet.add(mName);
      const ln = mName.toLowerCase();
      const ref: MorphTargetRef = { mesh, index, name: mName };

      if (ln.includes('jawopen') || ln.includes('mouthopen') || ln === 'jaw_open' || ln === 'open') {
        morphs.jawOpen.push(ref);
      }
      if (ln.includes('viseme_aa') || ln === 'aa' || ln === 'a' || ln.includes('mouthaa')) {
        morphs.visemeAA.push(ref);
      }
      if (ln.includes('viseme_o') || ln.includes('mouthfunnel') || ln === 'oh' || ln === 'o') {
        morphs.visemeO.push(ref);
      }
      if (ln.includes('viseme_e') || ln === 'ee' || ln === 'e') {
        morphs.visemeE.push(ref);
      }
      if (ln.includes('viseme_i') || ln === 'ih' || ln === 'i') {
        morphs.visemeI.push(ref);
      }
      if (ln.includes('viseme_pp') || ln.includes('mouthclose') || ln.includes('mouthpress')) {
        morphs.visemePP.push(ref);
      }
      if (ln.includes('viseme_fv') || ln.includes('viseme_ff')) {
        morphs.visemeFV.push(ref);
      }
      if (ln.includes('viseme_th') || ln.includes('viseme_dd')) {
        morphs.visemeTH.push(ref);
      }
      if (ln.includes('smile') || ln.includes('happy')) {
        morphs.mouthSmile.push(ref);
      }
      if (ln.includes('frown') || ln.includes('sad')) {
        morphs.mouthFrown.push(ref);
      }
      if (ln.includes('cheeksquint') || ln.includes('cheek_squint')) {
        morphs.cheekSquint.push(ref);
      }
      if (ln.includes('brow') && (ln.includes('up') || ln.includes('raise'))) {
        morphs.browUp.push(ref);
      }
      if (ln.includes('brow') && (ln.includes('down') || ln.includes('furrow') || ln.includes('angry'))) {
        morphs.browDown.push(ref);
      }
      if ((ln.includes('blink') || ln.includes('eyelid') || ln.includes('eyelash')) && (ln.includes('left') || ln.includes('_l') || !ln.includes('right'))) {
        morphs.eyeBlinkLeft.push(ref);
      }
      if ((ln.includes('blink') || ln.includes('eyelid') || ln.includes('eyelash')) && (ln.includes('right') || ln.includes('_r') || !ln.includes('left'))) {
        morphs.eyeBlinkRight.push(ref);
      }
      if (ln.includes('eyelookup')) morphs.eyeLookUp.push(ref);
      if (ln.includes('eyelookdown')) morphs.eyeLookDown.push(ref);
      if (ln.includes('eyelookin')) morphs.eyeLookIn.push(ref);
      if (ln.includes('eyelookout')) morphs.eyeLookOut.push(ref);
      if (ln.includes('nose') || ln.includes('sneer')) {
        morphs.noseSneer.push(ref);
      }
      if (ln.includes('ear')) {
        morphs.earPerk.push(ref);
      }
    }
  });

  const fingerBonesCount = Object.values(fingers).reduce((acc, arr) => acc + arr.length, 0);
  const bodyBonesCount = Object.keys(mappedBones).length;

  const summary: RigChannelSummary = {
    totalBones: bones.length,
    totalMorphTargets: allMorphNamesSet.size,
    hasJawOrMouth:
      Boolean(mappedBones.jaw || mappedBones.mouth) ||
      morphs.jawOpen.length > 0 ||
      morphs.visemeAA.length > 0,
    hasBrows:
      Boolean(mappedBones.leftBrow || mappedBones.rightBrow) ||
      morphs.browUp.length > 0 ||
      morphs.browDown.length > 0,
    hasEyesAndLashes:
      Boolean(
        mappedBones.leftEye ||
          mappedBones.rightEye ||
          mappedBones.leftEyelid ||
          mappedBones.rightEyelid,
      ) ||
      morphs.eyeBlinkLeft.length > 0 ||
      morphs.eyeBlinkRight.length > 0,
    hasNose: Boolean(mappedBones.nose) || morphs.noseSneer.length > 0,
    hasEars: Boolean(mappedBones.leftEar || mappedBones.rightEar) || morphs.earPerk.length > 0,
    fingerBonesCount,
    bodyBonesCount,
  };

  return {
    bones: mappedBones,
    fingers,
    morphs,
    allMorphNames: Array.from(allMorphNamesSet),
    summary,
  };
}
